/**
 * Entity registry.
 *
 * `ALL_ENTITIES` is the single list handed to both the runtime TypeORM module and
 * the CLI datasource, so migrations and the app can never disagree about which
 * entities exist. `test/unit/tenant-coverage.spec.ts` walks this array and fails
 * CI if any entity is neither `@TenantScoped()` nor allowlisted as
 * platform-global — which is how a new tenant table cannot silently skip isolation.
 */

export * from './base.entity';
export * from './tenant.entity';
export * from './tenant-domain.entity';
export * from './user.entity';
export * from './permission.entity';
export * from './role.entity';
export * from './user-role.entity';
export * from './refresh-token.entity';
export * from './auth-token.entity';
export * from './user-invitation.entity';
export * from './plan.entity';
export * from './subscription.entity';
export * from './subscription-invoice.entity';
export * from './store.entity';
export * from './provisioning-task.entity';
export * from './outbox-event.entity';
export * from './processed-event.entity';
export * from './audit-log.entity';
export * from './api-key.entity';
export * from './job-run.entity';
export * from './brand.entity';
export * from './category.entity';
export * from './tax.entity';
export * from './product.entity';
export * from './product-variant.entity';
export * from './product-media.entity';
export * from './product-category.entity';
export * from './product-attribute.entity';

import { TenantEntity } from './tenant.entity';
import { TenantDomainEntity } from './tenant-domain.entity';
import { UserEntity } from './user.entity';
import { PermissionEntity } from './permission.entity';
import { RoleEntity } from './role.entity';
import { UserRoleEntity } from './user-role.entity';
import { RefreshTokenEntity } from './refresh-token.entity';
import { AuthTokenEntity } from './auth-token.entity';
import { UserInvitationEntity } from './user-invitation.entity';
import { PlanEntity, PlanLimitEntity } from './plan.entity';
import { SubscriptionEntity } from './subscription.entity';
import {
  InvoiceSequenceEntity,
  SubscriptionInvoiceEntity,
  SubscriptionPaymentEntity,
} from './subscription-invoice.entity';
import { StoreEntity, StoreSettingEntity, WarehouseEntity } from './store.entity';
import { ProvisioningTaskEntity } from './provisioning-task.entity';
import { OutboxEventEntity } from './outbox-event.entity';
import { ProcessedEventEntity } from './processed-event.entity';
import { AuditLogEntity } from './audit-log.entity';
import { ApiKeyEntity } from './api-key.entity';
import { JobRunEntity } from './job-run.entity';
import { BrandEntity } from './brand.entity';
import { CategoryEntity } from './category.entity';
import { TaxClassEntity, TaxRateEntity } from './tax.entity';
import { ProductEntity } from './product.entity';
import { ProductVariantEntity } from './product-variant.entity';
import { ProductMediaEntity } from './product-media.entity';
import { ProductCategoryEntity } from './product-category.entity';
import { ProductAttributeEntity, ProductAttributeValueEntity } from './product-attribute.entity';

export const ALL_ENTITIES = [
  TenantEntity,
  TenantDomainEntity,
  UserEntity,
  PermissionEntity,
  RoleEntity,
  UserRoleEntity,
  RefreshTokenEntity,
  AuthTokenEntity,
  UserInvitationEntity,
  PlanEntity,
  PlanLimitEntity,
  SubscriptionEntity,
  SubscriptionInvoiceEntity,
  InvoiceSequenceEntity,
  SubscriptionPaymentEntity,
  StoreEntity,
  StoreSettingEntity,
  WarehouseEntity,
  ProvisioningTaskEntity,
  OutboxEventEntity,
  ProcessedEventEntity,
  AuditLogEntity,
  ApiKeyEntity,
  JobRunEntity,
  BrandEntity,
  CategoryEntity,
  TaxClassEntity,
  TaxRateEntity,
  ProductEntity,
  ProductVariantEntity,
  ProductMediaEntity,
  ProductCategoryEntity,
  ProductAttributeEntity,
  ProductAttributeValueEntity,
];
