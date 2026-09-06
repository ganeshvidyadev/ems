import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as dns } from 'node:dns';
import type { DnsRecordInstruction } from '@ems/contracts';
import type { DomainsConfig } from '../../config/configuration';
import type { TenantDomainEntity } from '../../database/entities';

export interface DnsCheckResult {
  verified: boolean;
  error: string | null;
}

/**
 * Checks the two DNS records a custom domain needs, and builds the
 * copy-paste instructions for them. Deliberately pure DNS lookups with no
 * database or queue knowledge — `DomainService`/the verification processor
 * own scheduling and persistence, this owns only "is the record correct".
 */
@Injectable()
export class DomainVerificationService {
  private readonly config: DomainsConfig;

  constructor(configService: ConfigService) {
    this.config = configService.getOrThrow<DomainsConfig>('domains');
  }

  /**
   * The subdomain of our own delegate zone that answers this domain's
   * ACME challenges — stable for the domain's lifetime, so the merchant's
   * CNAME never needs to change across issuance or renewal.
   */
  delegateSubdomain(domainId: string): string {
    return `d${domainId}`;
  }

  buildInstructions(domain: Pick<TenantDomainEntity, 'id' | 'hostname' | 'verificationToken'>): DnsRecordInstruction[] {
    return [
      {
        type: 'TXT',
        name: `_ems-challenge.${domain.hostname}`,
        value: domain.verificationToken ?? '',
        purpose: 'Proves you control this domain',
      },
      {
        type: 'CNAME',
        name: `_acme-challenge.${domain.hostname}`,
        value: `${this.delegateSubdomain(domain.id)}.${this.config.challengeDelegateDomain}`,
        purpose: 'Lets us issue and automatically renew SSL for this domain with no further action from you',
      },
    ];
  }

  async checkOwnership(hostname: string, expectedToken: string): Promise<DnsCheckResult> {
    const recordName = `_ems-challenge.${hostname}`;
    try {
      const records = await dns.resolveTxt(recordName);
      const values = records.map((chunks) => chunks.join(''));
      if (values.includes(expectedToken)) return { verified: true, error: null };
      return { verified: false, error: `TXT record found at ${recordName} but its value did not match the expected token` };
    } catch {
      return { verified: false, error: `TXT record not found at ${recordName} — add it and try again` };
    }
  }

  async checkAcmeDelegation(hostname: string, domainId: string): Promise<DnsCheckResult> {
    const recordName = `_acme-challenge.${hostname}`;
    const expected = `${this.delegateSubdomain(domainId)}.${this.config.challengeDelegateDomain}`.toLowerCase();
    try {
      const records = await dns.resolveCname(recordName);
      const normalized = records.map((r) => r.replace(/\.$/, '').toLowerCase());
      if (normalized.includes(expected)) return { verified: true, error: null };
      return { verified: false, error: `CNAME at ${recordName} does not point to ${expected}` };
    } catch {
      return { verified: false, error: `CNAME record not found at ${recordName} — add it to enable automatic SSL renewal` };
    }
  }
}
