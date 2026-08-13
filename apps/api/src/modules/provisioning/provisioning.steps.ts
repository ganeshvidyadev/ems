import { newPublicId, slugify } from '@ems/kernel';
import type { EntityManager } from 'typeorm';
import {
  StoreEntity,
  TenantDomainEntity,
  TenantEntity,
  WarehouseEntity,
  type ProvisioningStep,
} from '../../database/entities';
import type { MailService } from '../notification/mail.service';

export interface StepContext {
  manager: EntityManager;
  tenantId: string;
  tenant: TenantEntity;
  rootDomain: string;
  mail: MailService;
  /** Results of previously completed steps, keyed by step name. */
  previous: Record<string, Record<string, unknown>>;
}

/** Thrown when a step cannot succeed no matter how many times it runs. */
export class NonRetryableStepError extends Error {
  readonly retryable = false;

  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableStepError';
  }
}

export interface StepDefinition {
  step: ProvisioningStep;
  sequence: number;
  /**
   * Runs the step and returns whatever it created.
   *
   * **Every step must be idempotent.** The saga guarantees at-least-once execution, so a
   * step can be re-entered after a crash that happened between doing the work and
   * recording it. Each one therefore looks for its own prior output first and adopts it
   * rather than creating a second store, a second domain, or a second warehouse.
   */
  run(context: StepContext): Promise<Record<string, unknown>>;
}

export const PROVISIONING_PIPELINE: readonly StepDefinition[] = [
  // -------------------------------------------------------------------------
  {
    step: 'TENANT_ACTIVATED',
    sequence: 1,
    async run({ manager, tenantId }) {
      // Idempotent by construction — setting a status twice is the same as once.
      await manager.query(
        `UPDATE tenants
            SET status = 'PROVISIONING'
          WHERE id = ? AND status IN ('PENDING','PROVISIONING')`,
        [tenantId],
      );
      return { activated: true };
    },
  },

  // -------------------------------------------------------------------------
  {
    step: 'STORE_CREATED',
    sequence: 2,
    async run({ manager, tenantId, tenant }) {
      const slug = slugify(tenant.businessName, 100) || 'store';

      // Adopt an existing store rather than creating a second one. Without this a retry
      // after a crash between INSERT and COMMIT-of-the-task-row would leave the tenant
      // with two stores and an ambiguous storefront.
      const existing = await manager.findOne(StoreEntity, { where: { tenantId } });
      if (existing) return { storeId: existing.id, storePublicId: existing.publicId, adopted: true };

      const store = await manager.save(
        manager.create(StoreEntity, {
          publicId: newPublicId(),
          tenantId,
          name: tenant.businessName,
          slug,
          // DRAFT until the pipeline finishes; a half-provisioned store must not serve.
          status: 'DRAFT',
          currency: tenant.defaultCurrency,
          locale: tenant.defaultLocale,
          timezone: tenant.timezone,
          supportEmail: tenant.contactEmail,
        }),
      );

      return { storeId: store.id, storePublicId: store.publicId, adopted: false };
    },
  },

  // -------------------------------------------------------------------------
  {
    step: 'SUBDOMAIN_ASSIGNED',
    sequence: 3,
    async run({ manager, tenantId, tenant, rootDomain, previous }) {
      const hostname = `${tenant.slug}.${rootDomain}`.toLowerCase();

      const existing = await manager.findOne(TenantDomainEntity, { where: { hostname } });

      if (existing) {
        // Taken by a *different* tenant: retrying will never fix this, and the merchant
        // needs a new slug. Failing fast beats burning retries on an impossible step.
        if (String(existing.tenantId) !== String(tenantId)) {
          throw new NonRetryableStepError(
            `The subdomain ${hostname} is already assigned to another store`,
          );
        }
        return { domainId: existing.id, hostname, adopted: true };
      }

      const storeId = previous['STORE_CREATED']?.['storeId'] as string | undefined;

      const domain = await manager.save(
        manager.create(TenantDomainEntity, {
          tenantId,
          storeId: storeId ?? null,
          hostname,
          type: 'SUBDOMAIN',
          isPrimary: true,
          // Platform subdomains resolve through our wildcard record, so there is nothing
          // for the merchant to verify.
          verifiedAt: new Date(),
          // Wildcard TLS covers *.rootDomain; per-host ACME is only for custom domains.
          sslStatus: 'ACTIVE',
          sslIssuedAt: new Date(),
        }),
      );

      return { domainId: domain.id, hostname, adopted: false };
    },
  },

  // -------------------------------------------------------------------------
  {
    step: 'THEME_CLONED',
    sequence: 4,
    async run() {
      // Themes arrive in Phase 7. Recorded as a real step now so the pipeline shape — and
      // the wizard's step list — does not change when it lands.
      return { skipped: true, reason: 'Theme module arrives in Phase 7' };
    },
  },

  // -------------------------------------------------------------------------
  {
    step: 'CATALOG_SEEDED',
    sequence: 5,
    async run({ manager, tenantId, previous }) {
      const storeId = (previous['STORE_CREATED']?.['storeId'] as string | undefined) ?? null;

      // A default warehouse is required before any stock can exist, so it is created here
      // rather than left for the merchant to discover they need.
      const existing = await manager.findOne(WarehouseEntity, {
        where: { tenantId, code: 'MAIN' },
      });
      if (existing) return { warehouseId: existing.id, adopted: true };

      const warehouse = await manager.save(
        manager.create(WarehouseEntity, {
          publicId: newPublicId(),
          tenantId,
          storeId,
          code: 'MAIN',
          name: 'Main warehouse',
          type: 'WAREHOUSE',
          isDefault: true,
          isActive: true,
          priority: 0,
        }),
      );

      return { warehouseId: warehouse.id, adopted: false };
    },
  },

  // -------------------------------------------------------------------------
  {
    step: 'STORAGE_PREPARED',
    sequence: 6,
    async run({ tenantId }) {
      // S3/MinIO prefixes are created lazily on first upload, so there is nothing to do
      // eagerly. Kept as a step because CDN behaviours will need provisioning here.
      return { prefix: `tenants/${tenantId}/`, lazy: true };
    },
  },

  // -------------------------------------------------------------------------
  {
    step: 'WELCOME_SENT',
    sequence: 7,
    async run({ manager, tenantId, tenant, mail, previous }) {
      const hostname = previous['SUBDOMAIN_ASSIGNED']?.['hostname'] as string | undefined;
      const storeId = previous['STORE_CREATED']?.['storeId'] as string | undefined;

      // The store goes live only at the end, so a shopper never reaches a store whose
      // catalogue or domain is still being set up.
      if (storeId) {
        await manager.query(`UPDATE stores SET status = 'ACTIVE' WHERE id = ?`, [storeId]);
      }

      await manager.query(
        `UPDATE tenants
            SET status = CASE WHEN trial_ends_at IS NOT NULL THEN 'TRIAL' ELSE 'ACTIVE' END,
                provisioning_step = 'COMPLETED'
          WHERE id = ?`,
        [tenantId],
      );

      // Mail is best-effort by design — `MailService.send` never throws. A transient SMTP
      // failure must not fail a step whose real work (activating the store) already
      // succeeded, because a retry would then re-run activation for no reason.
      await mail.send({
        to: tenant.contactEmail,
        subject: `${tenant.businessName} is live`,
        text: `Your store is ready at https://${hostname ?? ''}`,
        html: `<p>Your store <strong>${tenant.businessName}</strong> is ready.</p>
               <p><a href="https://${hostname ?? ''}">https://${hostname ?? ''}</a></p>`,
      });

      return { hostname: hostname ?? null, activated: true };
    },
  },
];

export function stepDefinition(step: ProvisioningStep): StepDefinition | undefined {
  return PROVISIONING_PIPELINE.find((definition) => definition.step === step);
}
