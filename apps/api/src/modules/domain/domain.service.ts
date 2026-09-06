import { Injectable } from '@nestjs/common';
import { ConflictError, ValidationError } from '@ems/kernel';
import type {
  DnsRecordInstruction,
  DomainDiagnosticStep,
  DomainResponse,
} from '@ems/contracts';
import { CacheService } from '../../common/services/cache.service';
import { CryptoService } from '../../common/services/crypto.service';
import type { TenantDomainEntity } from '../../database/entities';
import { QueueRegistry } from '../../queues/queue.registry';
import { QueueName } from '../../queues/queue-names.enum';
import { isVerificationWindowExpired, nextBackoffDelayMs } from './backoff.util';
import { DomainCertificateService } from './domain-certificate.service';
import { DomainRepository } from './domain.repository';
import { DomainVerificationService } from './domain-verification.service';

@Injectable()
export class DomainService {
  constructor(
    private readonly domains: DomainRepository,
    private readonly verification: DomainVerificationService,
    private readonly certificates: DomainCertificateService,
    private readonly crypto: CryptoService,
    private readonly cache: CacheService,
    private readonly queues: QueueRegistry,
  ) {}

  async addCustomDomain(hostname: string, storeId?: string): Promise<TenantDomainEntity> {
    const existing = await this.domains.findByHostnameGlobal(hostname);
    if (existing) throw new ConflictError(`Hostname '${hostname}' is already registered on this platform`);

    const resolvedStoreId = storeId ? await this.domains.resolveStoreId(storeId) : await this.domains.defaultStoreId();

    const domain = await this.domains.insert({
      hostname,
      storeId: resolvedStoreId,
      type: 'CUSTOM',
      isPrimary: false,
      verificationMethod: 'DNS_TXT',
      verificationToken: this.crypto.generateToken(16),
      sslStatus: 'NONE',
    });

    await this.enqueueOwnershipCheck(domain.tenantId, domain.id, 0);
    return domain;
  }

  async list(): Promise<TenantDomainEntity[]> {
    return this.domains.listForTenant();
  }

  async getOrFail(id: string): Promise<TenantDomainEntity> {
    return this.domains.findOneOrFail({ where: { id } });
  }

  async remove(id: string): Promise<void> {
    const domain = await this.getOrFail(id);
    if (domain.type === 'SUBDOMAIN') {
      throw new ValidationError('The platform-issued subdomain cannot be removed');
    }
    await this.domains.hardDelete({ id });
    await this.cache.del(`domain:${domain.hostname}`, `domain-cors:${domain.hostname}`);
  }

  getInstructions(domain: TenantDomainEntity): DnsRecordInstruction[] {
    return this.verification.buildInstructions(domain);
  }

  /**
   * One verification attempt. Called both by the queue on its backoff
   * schedule and by the merchant-facing "verify now" action, so the two
   * paths can never disagree about what counts as verified.
   */
  async performOwnershipCheck(domainId: string): Promise<TenantDomainEntity> {
    const domain = await this.getOrFail(domainId);
    if (domain.isVerified) return domain;

    const ownership = await this.verification.checkOwnership(domain.hostname, domain.verificationToken ?? '');
    if (!ownership.verified) return this.rescheduleOrFail(domain, ownership.error!);

    const delegation = await this.verification.checkAcmeDelegation(domain.hostname, domain.id);
    if (!delegation.verified) return this.rescheduleOrFail(domain, delegation.error!);

    await this.domains.update(
      { id: domain.id },
      { verifiedAt: new Date(), lastCheckAt: new Date(), lastError: null, sslStatus: 'PENDING' },
    );

    // Flips `main.ts`'s CORS allowlist check from false to true the moment ownership
    // is proven — see the `domain-cors:` key comment there for why it is a separate
    // cache entry from the routing table's `domain:` key.
    await this.cache.del(`domain-cors:${domain.hostname}`);

    await this.queues
      .get(QueueName.DOMAIN_VERIFICATION)
      .add('issue-certificate', { tenantId: domain.tenantId, domainId: domain.id });

    return this.getOrFail(domainId);
  }

  private async rescheduleOrFail(domain: TenantDomainEntity, error: string): Promise<TenantDomainEntity> {
    const attempts = domain.checkAttempts + 1;

    if (isVerificationWindowExpired(domain.createdAt)) {
      await this.domains.update(
        { id: domain.id },
        { checkAttempts: attempts, lastCheckAt: new Date(), sslStatus: 'FAILED', lastError: `${error} (72h verification window expired)` },
      );
      return this.getOrFail(domain.id);
    }

    await this.domains.update({ id: domain.id }, { checkAttempts: attempts, lastCheckAt: new Date(), lastError: error });
    await this.enqueueOwnershipCheck(domain.tenantId, domain.id, nextBackoffDelayMs(attempts));
    return this.getOrFail(domain.id);
  }

  private async enqueueOwnershipCheck(tenantId: string, domainId: string, delayMs: number): Promise<void> {
    await this.queues
      .get(QueueName.DOMAIN_VERIFICATION)
      .add('verify-ownership', { tenantId, domainId }, { delay: delayMs });
  }

  async issueCertificateNow(domainId: string): Promise<void> {
    const domain = await this.getOrFail(domainId);
    await this.certificates.issue(domain);
  }

  async diagnostics(domainId: string): Promise<DomainDiagnosticStep[]> {
    const domain = await this.getOrFail(domainId);
    const ownership = await this.verification.checkOwnership(domain.hostname, domain.verificationToken ?? '');
    const delegation = await this.verification.checkAcmeDelegation(domain.hostname, domain.id);

    return [
      { step: 'Ownership TXT record', status: ownership.verified ? 'PASSED' : 'FAILED', detail: ownership.error },
      { step: 'ACME delegation CNAME', status: delegation.verified ? 'PASSED' : 'FAILED', detail: delegation.error },
      {
        step: 'SSL certificate',
        status: domain.sslStatus === 'ACTIVE' ? 'PASSED' : domain.sslStatus === 'FAILED' ? 'FAILED' : 'PENDING',
        detail: domain.lastError,
      },
    ];
  }

  toResponse(domain: TenantDomainEntity): DomainResponse {
    return {
      id: domain.id,
      hostname: domain.hostname,
      type: domain.type,
      isPrimary: domain.isPrimary,
      verificationMethod: domain.verificationMethod,
      verificationToken: domain.verificationToken,
      verifiedAt: domain.verifiedAt?.toISOString() ?? null,
      isVerified: domain.isVerified,
      isLive: domain.isLive,
      sslStatus: domain.sslStatus,
      sslIssuedAt: domain.sslIssuedAt?.toISOString() ?? null,
      sslExpiresAt: domain.sslExpiresAt?.toISOString() ?? null,
      lastCheckAt: domain.lastCheckAt?.toISOString() ?? null,
      checkAttempts: domain.checkAttempts,
      lastError: domain.lastError,
      createdAt: domain.createdAt.toISOString(),
    };
  }
}
