import { Inject, Injectable, Logger } from '@nestjs/common';
import { X509Certificate } from 'node:crypto';
import { ExternalServiceError } from '@ems/kernel';
import { AcmeClientService } from '../../integrations/acme/acme-client.service';
import { DnsProviderFactory } from '../../integrations/dns/dns-provider.factory';
import { STORAGE_PORT, type StoragePort } from '../../integrations/storage/storage.port';
import { CacheService } from '../../common/services/cache.service';
import { CryptoService } from '../../common/services/crypto.service';
import type { TenantDomainEntity } from '../../database/entities';
import { DomainRepository } from './domain.repository';
import { DomainVerificationService } from './domain-verification.service';

/**
 * Orchestrates one certificate issuance (or renewal — the same flow) for an
 * already-verified custom domain: publish the DNS-01 answer into our own
 * delegate zone, drive the ACME order to completion, then persist the
 * result. Knows about `tenant_domains`, `DnsProviderPort` and
 * `AcmeClientService`, but none of them know about each other or about this
 * orchestration — the same layering as checkout composing
 * `PaymentGatewayPort` and `ShippingCarrierPort`.
 */
@Injectable()
export class DomainCertificateService {
  private readonly logger = new Logger(DomainCertificateService.name);

  constructor(
    private readonly acme: AcmeClientService,
    private readonly dnsFactory: DnsProviderFactory,
    private readonly verification: DomainVerificationService,
    private readonly domains: DomainRepository,
    private readonly crypto: CryptoService,
    private readonly cache: CacheService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
  ) {}

  async issue(domain: TenantDomainEntity): Promise<void> {
    if (!domain.isVerified) {
      throw new ExternalServiceError('acme', `Domain ${domain.hostname} has not completed ownership verification`);
    }

    await this.domains.update({ id: domain.id }, { sslStatus: 'ISSUING', lastError: null });

    const dns = this.dnsFactory.resolve();
    let dnsRecordId: string | null = null;

    try {
      const order = await this.acme.createOrder([domain.hostname]);
      const authorizationUrl = order.authorizations[0];
      if (!authorizationUrl) throw new ExternalServiceError('acme', 'ACME order carried no authorizations');

      const challenge = await this.acme.getDns01Challenge(authorizationUrl);
      if (!challenge) throw new ExternalServiceError('acme', 'ACME did not offer a dns-01 challenge for this order');

      const record = await dns.createTxtRecord(this.verification.delegateSubdomain(domain.id), challenge.dnsTxtValue);
      dnsRecordId = record.recordId;

      await this.acme.triggerChallenge(challenge.challengeUrl);
      await this.acme.waitForAuthorizationValid(authorizationUrl);

      const issued = await this.acme.finalizeAndDownload(order, [domain.hostname]);
      const notAfter = new X509Certificate(issued.certificatePem).validTo;

      await this.storage.putObject(
        this.certKey(domain.tenantId, domain.hostname),
        Buffer.from(issued.certificatePem, 'utf8'),
        'application/x-pem-file',
      );
      await this.storage.putObject(
        this.keyKey(domain.tenantId, domain.hostname),
        this.crypto.encrypt(issued.privateKeyPem),
        'application/octet-stream',
      );

      await this.domains.update(
        { id: domain.id },
        {
          sslStatus: 'ACTIVE',
          sslIssuedAt: new Date(),
          sslExpiresAt: new Date(notAfter),
          lastError: null,
        },
      );

      await this.cache.del(`domain:${domain.hostname}`);
      this.logger.log(`Issued certificate for ${domain.hostname}, expires ${notAfter}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.domains.update({ id: domain.id }, { sslStatus: 'FAILED', lastError: message.slice(0, 500) });
      throw error;
    } finally {
      if (dnsRecordId) {
        // Best-effort cleanup of the one-time DNS-01 answer — the CNAME delegation
        // itself stays, so the next renewal needs no merchant involvement.
        await dns.deleteTxtRecord(dnsRecordId).catch(() => undefined);
      }
    }
  }

  /** Fullchain PEM — servable directly by nginx's `ssl_certificate`. */
  certKey(tenantId: string, hostname: string): string {
    return `certs/${tenantId}/${hostname}/fullchain.pem`;
  }

  /** AES-256-GCM ciphertext of the private key PEM — decrypted only when written to the TLS-terminating host. */
  keyKey(tenantId: string, hostname: string): string {
    return `certs/${tenantId}/${hostname}/privkey.enc`;
  }
}
