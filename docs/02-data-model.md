# 02 — Data Model

**Engine:** MySQL 8.4 · InnoDB · `utf8mb4` / `utf8mb4_0900_ai_ci`
**Companions:** MongoDB 7 (logs/analytics) · Redis 7 (cache/ephemeral)

---

## 1. Conventions

These are enforced by migration review, not left to taste.

| Rule | Detail |
|---|---|
| PK | `id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT` |
| Public identifier | `public_id CHAR(26)` (ULID) — exposed in APIs/URLs so we never leak row counts or allow ID enumeration |
| Tenant column | `tenant_id BIGINT UNSIGNED NOT NULL`, always the second column, leads every index |
| Money | `BIGINT` **minor units** (paise/cents) + sibling `currency CHAR(3)`. Never `FLOAT`/`DOUBLE`; `DECIMAL` only for tax *rates* |
| Timestamps | `created_at`/`updated_at` `DATETIME(3)` UTC, `DEFAULT CURRENT_TIMESTAMP(3)`. Never `TIMESTAMP` (2038 + implicit TZ conversion) |
| Soft delete | `deleted_at DATETIME(3) NULL` on merchant-visible entities; hard delete on join/log tables |
| Enums | `VARCHAR(32)` + `CHECK` constraint, **not** MySQL `ENUM` — adding a value to a native `ENUM` rewrites the table |
| Booleans | `TINYINT(1) NOT NULL DEFAULT 0` |
| JSON | `JSON` for genuinely open-ended config; anything filtered/sorted gets a real column |
| Naming | `snake_case`; `fk_<table>_<ref>`, `idx_<table>_<cols>`, `uq_<table>_<cols>`, `chk_<table>_<rule>` |
| FK policy | `ON DELETE RESTRICT` by default. `CASCADE` only for true child-of-aggregate rows (`order_items`, `product_images`) |
| Optimistic locking | `version INT UNSIGNED NOT NULL DEFAULT 0` on concurrently-mutated rows (`orders`, `inventory_levels`, `subscriptions`) |

**Partial-index emulation.** MySQL cannot index `WHERE deleted_at IS NULL`, so hot tables carry a generated column that is included in the index:

```sql
is_live TINYINT(1) AS (CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) STORED
```

---

## 2. Domain map

```
PLATFORM (no tenant_id)                TENANT-OWNED (tenant_id on every table)
├── tenants                            ├── stores ─ store_settings
├── tenant_domains                     ├── warehouses
├── plans ─ plan_limits                ├── brands ─ categories
├── subscriptions                      ├── products ─ product_variants
│   ├── subscription_invoices          │   ├── product_media
│   └── subscription_payments          │   ├── product_attributes/_values
├── theme_templates                    │   └── product_categories
├── users (platform + tenant)          ├── inventory_levels ─ inventory_movements
├── roles ─ permissions                ├── customers ─ customer_addresses
├── support_tickets                    ├── wishlists ─ carts
└── countries ─ states                 ├── orders ─ order_items ─ order_status_history
                                       ├── payments ─ refunds
                                       ├── shipments ─ shipment_events
                                       ├── returns ─ return_items
                                       ├── coupons ─ gift_cards ─ loyalty_*
                                       ├── reviews
                                       ├── cms_pages ─ blogs ─ banners ─ menus
                                       ├── tenant_themes
                                       ├── product_shares ─ commission_ledger
                                       ├── settlements ─ settlement_items
                                       ├── channels ─ channel_listings ─ channel_orders
                                       ├── tax_classes ─ tax_rates
                                       └── outbox_events ─ audit_logs
```

---

## 3. Platform: tenants & domains

```sql
CREATE TABLE tenants (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id         CHAR(26)        NOT NULL,
  slug              VARCHAR(63)     NOT NULL,          -- subdomain label; DNS-safe
  business_name     VARCHAR(255)    NOT NULL,
  legal_name        VARCHAR(255)    NULL,
  owner_user_id     BIGINT UNSIGNED NULL,              -- set after first user; avoids chicken/egg
  status            VARCHAR(32)     NOT NULL DEFAULT 'PENDING',
  provisioning_step VARCHAR(64)     NULL,              -- resumable saga cursor
  country_code      CHAR(2)         NOT NULL DEFAULT 'IN',
  default_currency  CHAR(3)         NOT NULL DEFAULT 'INR',
  default_locale    VARCHAR(10)     NOT NULL DEFAULT 'en-IN',
  timezone          VARCHAR(64)     NOT NULL DEFAULT 'Asia/Kolkata',
  tax_registration  VARCHAR(64)     NULL,              -- GSTIN / VAT
  contact_email     VARCHAR(255)    NOT NULL,
  contact_phone     VARCHAR(32)     NULL,
  trial_ends_at     DATETIME(3)     NULL,
  suspended_at      DATETIME(3)     NULL,
  suspension_reason VARCHAR(255)    NULL,
  onboarding_state  JSON            NULL,
  version           INT UNSIGNED    NOT NULL DEFAULT 0,
  created_at        DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at        DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at        DATETIME(3)     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tenants_public_id (public_id),
  UNIQUE KEY uq_tenants_slug (slug),
  KEY idx_tenants_status (status),
  KEY idx_tenants_trial_ends (trial_ends_at),
  CONSTRAINT chk_tenants_status CHECK (status IN
    ('PENDING','PROVISIONING','ACTIVE','TRIAL','PAST_DUE','SUSPENDED','CANCELLED','DELETED'))
) ENGINE=InnoDB;

-- Domain → tenant resolution. Read on EVERY storefront request, so it is
-- Redis-cached; this table is the source of truth behind that cache.
CREATE TABLE tenant_domains (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id           BIGINT UNSIGNED NOT NULL,
  store_id            BIGINT UNSIGNED NULL,
  hostname            VARCHAR(253)    NOT NULL,        -- max DNS name length
  type                VARCHAR(32)     NOT NULL,        -- SUBDOMAIN | CUSTOM
  is_primary          TINYINT(1)      NOT NULL DEFAULT 0,
  verification_token  VARCHAR(64)     NULL,
  verification_method VARCHAR(32)     NULL,            -- DNS_TXT | CNAME | FILE
  verified_at         DATETIME(3)     NULL,
  ssl_status          VARCHAR(32)     NOT NULL DEFAULT 'NONE',
  ssl_issued_at       DATETIME(3)     NULL,
  ssl_expires_at      DATETIME(3)     NULL,
  last_check_at       DATETIME(3)     NULL,
  check_attempts      INT UNSIGNED    NOT NULL DEFAULT 0,
  last_error          VARCHAR(500)    NULL,
  created_at          DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at          DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  -- Hostname is globally unique: it is the routing key, so it CANNOT be per-tenant.
  UNIQUE KEY uq_tenant_domains_hostname (hostname),
  KEY idx_tenant_domains_tenant (tenant_id, is_primary),
  KEY idx_tenant_domains_ssl_expiry (ssl_status, ssl_expires_at),
  CONSTRAINT fk_tenant_domains_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
  CONSTRAINT chk_tenant_domains_type CHECK (type IN ('SUBDOMAIN','CUSTOM')),
  CONSTRAINT chk_tenant_domains_ssl CHECK (ssl_status IN
    ('NONE','PENDING','ISSUING','ACTIVE','FAILED','EXPIRED'))
) ENGINE=InnoDB;
```

> `hostname` is the one deliberate exception to "unique per tenant" — it is the routing key for the whole platform. `idx_tenant_domains_ssl_expiry` drives the renewal cron; without it, cert renewal becomes a full scan as tenant count grows.

---

## 4. Identity & access

One `users` table serves platform staff and tenant users, discriminated by `user_type`. The alternative — two near-identical tables — duplicates auth, MFA, lockout, and token logic. The cost is that `tenant_id` must be nullable, so a `CHECK` constraint enforces the correlation.

```sql
CREATE TABLE users (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id             CHAR(26)        NOT NULL,
  tenant_id             BIGINT UNSIGNED NULL,          -- NULL ⇔ user_type='PLATFORM'
  user_type             VARCHAR(32)     NOT NULL DEFAULT 'TENANT',
  email                 VARCHAR(255)    NOT NULL,
  email_normalized      VARCHAR(255)    NOT NULL,      -- lowercased, gmail dots stripped
  phone_e164            VARCHAR(20)     NULL,
  password_hash         VARCHAR(255)    NULL,          -- NULL for SSO-only users
  password_algo         VARCHAR(16)     NOT NULL DEFAULT 'bcrypt',
  password_changed_at   DATETIME(3)     NULL,
  first_name            VARCHAR(100)    NOT NULL,
  last_name             VARCHAR(100)    NULL,
  avatar_url            VARCHAR(500)    NULL,
  status                VARCHAR(32)     NOT NULL DEFAULT 'PENDING_VERIFICATION',
  email_verified_at     DATETIME(3)     NULL,
  phone_verified_at     DATETIME(3)     NULL,
  mfa_enabled           TINYINT(1)      NOT NULL DEFAULT 0,
  mfa_secret_encrypted  VARBINARY(512)  NULL,          -- AES-256-GCM, app-layer
  mfa_recovery_codes    JSON            NULL,          -- individually hashed
  failed_login_attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  locked_until          DATETIME(3)     NULL,
  last_login_at         DATETIME(3)     NULL,
  last_login_ip         VARBINARY(16)   NULL,          -- INET6_ATON: v4+v6 in 16 bytes
  locale                VARCHAR(10)     NULL,
  timezone              VARCHAR(64)     NULL,
  created_at            DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at            DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at            DATETIME(3)     NULL,
  is_live               TINYINT(1) AS (CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_public_id (public_id),
  -- Email is unique per tenant: the same person may legitimately be a user of
  -- two different stores. Platform users (tenant_id NULL) are deduped by the
  -- second index, since MySQL treats NULLs as distinct in a UNIQUE key.
  UNIQUE KEY uq_users_tenant_email (tenant_id, email_normalized),
  UNIQUE KEY uq_users_platform_email (user_type, email_normalized),
  KEY idx_users_tenant_status (tenant_id, status, is_live),
  KEY idx_users_phone (phone_e164),
  CONSTRAINT fk_users_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
  CONSTRAINT chk_users_type CHECK (user_type IN ('PLATFORM','TENANT')),
  CONSTRAINT chk_users_tenant_correlation CHECK (
    (user_type = 'PLATFORM' AND tenant_id IS NULL) OR
    (user_type = 'TENANT'   AND tenant_id IS NOT NULL)),
  CONSTRAINT chk_users_status CHECK (status IN
    ('PENDING_VERIFICATION','ACTIVE','SUSPENDED','LOCKED','DEACTIVATED'))
) ENGINE=InnoDB;
```

```sql
CREATE TABLE permissions (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code        VARCHAR(100) NOT NULL,   -- 'product:update', 'order:refund'
  resource    VARCHAR(50)  NOT NULL,
  action      VARCHAR(50)  NOT NULL,
  scope       VARCHAR(32)  NOT NULL DEFAULT 'TENANT',  -- TENANT | PLATFORM
  description VARCHAR(255) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_permissions_code (code),
  KEY idx_permissions_scope (scope)
) ENGINE=InnoDB;

CREATE TABLE roles (
  id           INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  tenant_id    BIGINT UNSIGNED NULL,   -- NULL ⇒ system role, shared by all tenants
  name         VARCHAR(100)    NOT NULL,
  code         VARCHAR(64)     NOT NULL,
  scope        VARCHAR(32)     NOT NULL DEFAULT 'TENANT',
  is_system    TINYINT(1)      NOT NULL DEFAULT 0,     -- immutable; cannot be edited/deleted
  description  VARCHAR(255)    NULL,
  created_at   DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at   DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_roles_tenant_code (tenant_id, code),
  CONSTRAINT fk_roles_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE role_permissions (
  role_id       INT UNSIGNED NOT NULL,
  permission_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  KEY idx_role_permissions_permission (permission_id),
  CONSTRAINT fk_role_permissions_role FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE CASCADE,
  CONSTRAINT fk_role_permissions_permission FOREIGN KEY (permission_id) REFERENCES permissions (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE user_roles (
  user_id     BIGINT UNSIGNED NOT NULL,
  role_id     INT UNSIGNED    NOT NULL,
  store_id    BIGINT UNSIGNED NULL,   -- scope a role to one store of a multi-store tenant
  granted_by  BIGINT UNSIGNED NULL,
  granted_at  DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at  DATETIME(3)     NULL,   -- temporary elevation (e.g. contractor access)
  PRIMARY KEY (user_id, role_id, (IFNULL(store_id, 0))),
  KEY idx_user_roles_role (role_id),
  KEY idx_user_roles_expiry (expires_at),
  CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_user_roles_role FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Refresh tokens: hashed, family-tracked for reuse detection (see 01-architecture §8.1).
CREATE TABLE refresh_tokens (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id        BIGINT UNSIGNED NOT NULL,
  tenant_id      BIGINT UNSIGNED NULL,
  family_id      CHAR(26)        NOT NULL,   -- rotation lineage
  token_hash     CHAR(64)        NOT NULL,   -- SHA-256 hex; raw token never stored
  parent_id      BIGINT UNSIGNED NULL,
  jti            CHAR(26)        NOT NULL,
  user_agent     VARCHAR(500)    NULL,
  ip_address     VARBINARY(16)   NULL,
  device_label   VARCHAR(120)    NULL,       -- "Chrome on Windows" for the sessions UI
  expires_at     DATETIME(3)     NOT NULL,
  revoked_at     DATETIME(3)     NULL,
  revoked_reason VARCHAR(64)     NULL,       -- LOGOUT | ROTATED | REUSE_DETECTED | PASSWORD_CHANGE
  used_at        DATETIME(3)     NULL,
  created_at     DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_refresh_tokens_hash (token_hash),
  KEY idx_refresh_tokens_user (user_id, revoked_at),
  KEY idx_refresh_tokens_family (family_id),
  KEY idx_refresh_tokens_expiry (expires_at),
  CONSTRAINT fk_refresh_tokens_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;
```

**Seeded system roles:** `PLATFORM_SUPER_ADMIN`, `PLATFORM_SUPPORT`, `PLATFORM_BILLING`, `STORE_OWNER`, `STORE_ADMIN`, `PRODUCT_MANAGER`, `ORDER_MANAGER`, `INVENTORY_MANAGER`, `MARKETING_MANAGER`, `CUSTOMER_SUPPORT`, `SUPPLIER`, `RESELLER`.

---

## 5. Subscription & billing

```sql
CREATE TABLE plans (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code                VARCHAR(64)  NOT NULL,      -- basic | standard | premium | enterprise
  name                VARCHAR(100) NOT NULL,
  description         TEXT         NULL,
  price_monthly_minor BIGINT       NOT NULL DEFAULT 0,
  price_yearly_minor  BIGINT       NOT NULL DEFAULT 0,
  currency            CHAR(3)      NOT NULL DEFAULT 'INR',
  trial_days          SMALLINT UNSIGNED NOT NULL DEFAULT 14,
  is_public           TINYINT(1)   NOT NULL DEFAULT 1,   -- 0 = negotiated/custom plan
  sort_order          SMALLINT     NOT NULL DEFAULT 0,
  features            JSON         NULL,          -- display bullets only, never used for gating
  status              VARCHAR(32)  NOT NULL DEFAULT 'ACTIVE',
  created_at          DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at          DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_plans_code (code),
  CONSTRAINT chk_plans_status CHECK (status IN ('ACTIVE','ARCHIVED'))
) ENGINE=InnoDB;

-- Quotas as ROWS, not JSON columns. PlanQuotaGuard reads these on write paths;
-- a relational shape lets us query "which tenants are near their product cap"
-- without unpacking JSON for every tenant.
CREATE TABLE plan_limits (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  plan_id    INT UNSIGNED NOT NULL,
  limit_key  VARCHAR(64)  NOT NULL,   -- max_products, max_orders_per_month, max_staff_users,
                                      -- max_storage_mb, max_stores, max_warehouses,
                                      -- max_channels, max_custom_domains
  limit_value BIGINT      NOT NULL,   -- -1 = unlimited
  PRIMARY KEY (id),
  UNIQUE KEY uq_plan_limits_plan_key (plan_id, limit_key),
  CONSTRAINT fk_plan_limits_plan FOREIGN KEY (plan_id) REFERENCES plans (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE subscriptions (
  id                     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id              CHAR(26)        NOT NULL,
  tenant_id              BIGINT UNSIGNED NOT NULL,
  plan_id                INT UNSIGNED    NOT NULL,
  billing_cycle          VARCHAR(16)     NOT NULL,   -- MONTHLY | YEARLY
  status                 VARCHAR(32)     NOT NULL,
  unit_amount_minor      BIGINT          NOT NULL,   -- price snapshot: plan changes must not
  currency               CHAR(3)         NOT NULL,   -- retro-alter an existing subscription
  quantity               INT UNSIGNED    NOT NULL DEFAULT 1,
  trial_start            DATETIME(3)     NULL,
  trial_end              DATETIME(3)     NULL,
  current_period_start   DATETIME(3)     NOT NULL,
  current_period_end     DATETIME(3)     NOT NULL,
  cancel_at_period_end   TINYINT(1)      NOT NULL DEFAULT 0,
  cancelled_at           DATETIME(3)     NULL,
  ended_at               DATETIME(3)     NULL,
  auto_renew             TINYINT(1)      NOT NULL DEFAULT 1,
  gateway                VARCHAR(32)     NULL,
  gateway_subscription_id VARCHAR(191)   NULL,
  gateway_customer_id    VARCHAR(191)    NULL,
  payment_method_id      BIGINT UNSIGNED NULL,
  dunning_attempts       TINYINT UNSIGNED NOT NULL DEFAULT 0,
  grace_period_ends_at   DATETIME(3)     NULL,
  version                INT UNSIGNED    NOT NULL DEFAULT 0,
  created_at             DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at             DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_subscriptions_public_id (public_id),
  -- One ACTIVE subscription per tenant, enforced in SQL rather than in a service.
  -- The generated column is NULL for non-active rows, and MySQL ignores NULLs
  -- in UNIQUE keys — giving us a conditional unique constraint.
  active_guard TINYINT(1) AS (CASE WHEN status IN ('TRIALING','ACTIVE','PAST_DUE') THEN 1 ELSE NULL END) STORED,
  UNIQUE KEY uq_subscriptions_one_active (tenant_id, active_guard),
  KEY idx_subscriptions_renewal (status, current_period_end),
  KEY idx_subscriptions_gateway (gateway, gateway_subscription_id),
  CONSTRAINT fk_subscriptions_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
  CONSTRAINT fk_subscriptions_plan FOREIGN KEY (plan_id) REFERENCES plans (id) ON DELETE RESTRICT,
  CONSTRAINT chk_subscriptions_cycle CHECK (billing_cycle IN ('MONTHLY','YEARLY')),
  CONSTRAINT chk_subscriptions_status CHECK (status IN
    ('TRIALING','ACTIVE','PAST_DUE','PAUSED','CANCELLED','EXPIRED')),
  CONSTRAINT chk_subscriptions_period CHECK (current_period_end > current_period_start)
) ENGINE=InnoDB;

CREATE TABLE subscription_invoices (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id           CHAR(26)        NOT NULL,
  tenant_id           BIGINT UNSIGNED NOT NULL,
  subscription_id     BIGINT UNSIGNED NOT NULL,
  invoice_number      VARCHAR(64)     NOT NULL,   -- gapless per tenant (legal requirement)
  status              VARCHAR(32)     NOT NULL DEFAULT 'DRAFT',
  subtotal_minor      BIGINT          NOT NULL DEFAULT 0,
  discount_minor      BIGINT          NOT NULL DEFAULT 0,
  tax_minor           BIGINT          NOT NULL DEFAULT 0,
  total_minor         BIGINT          NOT NULL DEFAULT 0,
  amount_paid_minor   BIGINT          NOT NULL DEFAULT 0,
  amount_due_minor    BIGINT          NOT NULL DEFAULT 0,
  currency            CHAR(3)         NOT NULL,
  period_start        DATETIME(3)     NOT NULL,
  period_end          DATETIME(3)     NOT NULL,
  due_at              DATETIME(3)     NULL,
  paid_at             DATETIME(3)     NULL,
  voided_at           DATETIME(3)     NULL,
  line_items          JSON            NOT NULL,   -- immutable snapshot of what was billed
  billing_address     JSON            NULL,
  pdf_url             VARCHAR(500)    NULL,
  created_at          DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at          DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_sub_invoices_public_id (public_id),
  UNIQUE KEY uq_sub_invoices_tenant_number (tenant_id, invoice_number),
  KEY idx_sub_invoices_subscription (subscription_id, created_at),
  KEY idx_sub_invoices_status_due (status, due_at),
  CONSTRAINT fk_sub_invoices_subscription FOREIGN KEY (subscription_id) REFERENCES subscriptions (id) ON DELETE RESTRICT,
  CONSTRAINT chk_sub_invoices_status CHECK (status IN
    ('DRAFT','OPEN','PAID','PARTIALLY_PAID','UNCOLLECTIBLE','VOID','REFUNDED'))
) ENGINE=InnoDB;
```

> `uq_subscriptions_one_active` is worth pausing on: it makes "a tenant cannot hold two live subscriptions" a **database** invariant. Enforcing that only in a service layer means a double-clicked upgrade button during a race can bill a merchant twice.

---

## 6. Stores & settings

```sql
CREATE TABLE stores (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id         BIGINT UNSIGNED NOT NULL,
  public_id         CHAR(26)        NOT NULL,
  name              VARCHAR(255)    NOT NULL,
  slug              VARCHAR(120)    NOT NULL,
  status            VARCHAR(32)     NOT NULL DEFAULT 'DRAFT',
  currency          CHAR(3)         NOT NULL DEFAULT 'INR',
  locale            VARCHAR(10)     NOT NULL DEFAULT 'en-IN',
  timezone          VARCHAR(64)     NOT NULL DEFAULT 'Asia/Kolkata',
  weight_unit       VARCHAR(8)      NOT NULL DEFAULT 'kg',
  dimension_unit    VARCHAR(8)      NOT NULL DEFAULT 'cm',
  active_theme_id   BIGINT UNSIGNED NULL,
  logo_url          VARCHAR(500)    NULL,
  favicon_url       VARCHAR(500)    NULL,
  support_email     VARCHAR(255)    NULL,
  support_phone     VARCHAR(32)     NULL,
  business_address  JSON            NULL,
  is_marketplace_supplier TINYINT(1) NOT NULL DEFAULT 0,
  is_marketplace_reseller TINYINT(1) NOT NULL DEFAULT 0,
  created_at        DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at        DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at        DATETIME(3)     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_stores_public_id (public_id),
  UNIQUE KEY uq_stores_tenant_slug (tenant_id, slug),
  KEY idx_stores_tenant_status (tenant_id, status),
  CONSTRAINT fk_stores_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
  CONSTRAINT chk_stores_status CHECK (status IN ('DRAFT','ACTIVE','MAINTENANCE','CLOSED'))
) ENGINE=InnoDB;

-- Key/value settings rather than a 90-column table: new settings ship without a
-- migration, and `group` lets the console fetch one settings screen in one query.
CREATE TABLE store_settings (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id     BIGINT UNSIGNED NOT NULL,
  store_id      BIGINT UNSIGNED NOT NULL,
  setting_group VARCHAR(64)     NOT NULL,   -- checkout | tax | seo | notification | payment | shipping
  setting_key   VARCHAR(120)    NOT NULL,
  setting_value JSON            NULL,
  is_encrypted  TINYINT(1)      NOT NULL DEFAULT 0,   -- gateway secrets: AES-256-GCM at rest
  updated_by    BIGINT UNSIGNED NULL,
  created_at    DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at    DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_store_settings (tenant_id, store_id, setting_group, setting_key),
  KEY idx_store_settings_group (tenant_id, store_id, setting_group),
  CONSTRAINT fk_store_settings_store FOREIGN KEY (store_id) REFERENCES stores (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE warehouses (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id      BIGINT UNSIGNED NOT NULL,
  store_id       BIGINT UNSIGNED NULL,     -- NULL ⇒ shared across the tenant's stores
  public_id      CHAR(26)        NOT NULL,
  code           VARCHAR(64)     NOT NULL,
  name           VARCHAR(255)    NOT NULL,
  type           VARCHAR(32)     NOT NULL DEFAULT 'WAREHOUSE',  -- WAREHOUSE | STORE | DROPSHIP | VIRTUAL
  address_line1  VARCHAR(255)    NULL,
  address_line2  VARCHAR(255)    NULL,
  city           VARCHAR(120)    NULL,
  state_code     VARCHAR(10)     NULL,
  postal_code    VARCHAR(20)     NULL,
  country_code   CHAR(2)         NOT NULL DEFAULT 'IN',
  latitude       DECIMAL(10,7)   NULL,
  longitude      DECIMAL(10,7)   NULL,
  priority       SMALLINT        NOT NULL DEFAULT 0,   -- fulfilment allocation order
  is_default     TINYINT(1)      NOT NULL DEFAULT 0,
  is_active      TINYINT(1)      NOT NULL DEFAULT 1,
  created_at     DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at     DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at     DATETIME(3)     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_warehouses_tenant_code (tenant_id, code),
  KEY idx_warehouses_tenant_active (tenant_id, is_active, priority),
  CONSTRAINT fk_warehouses_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
) ENGINE=InnoDB;
```

---

## 7. Catalog

```sql
CREATE TABLE brands (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id    BIGINT UNSIGNED NOT NULL,
  public_id    CHAR(26)        NOT NULL,
  name         VARCHAR(255)    NOT NULL,
  slug         VARCHAR(255)    NOT NULL,
  logo_url     VARCHAR(500)    NULL,
  description  TEXT            NULL,
  meta_title   VARCHAR(255)    NULL,
  meta_description VARCHAR(500) NULL,
  is_active    TINYINT(1)      NOT NULL DEFAULT 1,
  created_at   DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at   DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at   DATETIME(3)     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_brands_tenant_slug (tenant_id, slug),
  KEY idx_brands_tenant_active (tenant_id, is_active),
  CONSTRAINT fk_brands_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Adjacency list + materialized path. `path` makes "all descendants of X" a single
-- prefix scan instead of a recursive CTE per breadcrumb render — category trees are
-- read on nearly every storefront page, so this trade (denormalized, maintained on
-- move) is worth it.
CREATE TABLE categories (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id     BIGINT UNSIGNED NOT NULL,
  store_id      BIGINT UNSIGNED NULL,
  public_id     CHAR(26)        NOT NULL,
  parent_id     BIGINT UNSIGNED NULL,
  name          VARCHAR(255)    NOT NULL,
  slug          VARCHAR(255)    NOT NULL,
  path          VARCHAR(1000)   NOT NULL,          -- '/1/14/57/'
  depth         TINYINT UNSIGNED NOT NULL DEFAULT 0,
  description   TEXT            NULL,
  image_url     VARCHAR(500)    NULL,
  banner_url    VARCHAR(500)    NULL,
  sort_order    INT             NOT NULL DEFAULT 0,
  product_count INT UNSIGNED    NOT NULL DEFAULT 0,  -- denormalized counter
  meta_title    VARCHAR(255)    NULL,
  meta_description VARCHAR(500) NULL,
  is_active     TINYINT(1)      NOT NULL DEFAULT 1,
  show_in_menu  TINYINT(1)      NOT NULL DEFAULT 1,
  created_at    DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at    DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at    DATETIME(3)     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_categories_tenant_slug (tenant_id, store_id, slug),
  KEY idx_categories_tenant_parent (tenant_id, parent_id, sort_order),
  KEY idx_categories_path (tenant_id, path(255)),
  CONSTRAINT fk_categories_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
  CONSTRAINT fk_categories_parent FOREIGN KEY (parent_id) REFERENCES categories (id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE products (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id          BIGINT UNSIGNED NOT NULL,
  store_id           BIGINT UNSIGNED NOT NULL,
  public_id          CHAR(26)        NOT NULL,
  brand_id           BIGINT UNSIGNED NULL,
  tax_class_id       BIGINT UNSIGNED NULL,
  type               VARCHAR(32)     NOT NULL DEFAULT 'SIMPLE',  -- SIMPLE|VARIABLE|DIGITAL|BUNDLE|SERVICE
  name               VARCHAR(500)    NOT NULL,
  slug               VARCHAR(500)    NOT NULL,
  sku                VARCHAR(100)    NULL,                       -- NULL for VARIABLE (lives on variants)
  short_description  VARCHAR(1000)   NULL,
  description        MEDIUMTEXT      NULL,
  status             VARCHAR(32)     NOT NULL DEFAULT 'DRAFT',
  visibility         VARCHAR(32)     NOT NULL DEFAULT 'VISIBLE', -- VISIBLE|HIDDEN|SEARCH_ONLY|CATALOG_ONLY
  price_minor        BIGINT          NOT NULL DEFAULT 0,
  compare_price_minor BIGINT         NULL,                       -- strike-through / MRP
  cost_price_minor   BIGINT          NULL,                       -- margin reporting; never exposed publicly
  currency           CHAR(3)         NOT NULL DEFAULT 'INR',
  track_inventory    TINYINT(1)      NOT NULL DEFAULT 1,
  allow_backorder    TINYINT(1)      NOT NULL DEFAULT 0,
  low_stock_threshold INT UNSIGNED   NULL,
  weight_grams       INT UNSIGNED    NULL,
  length_mm          INT UNSIGNED    NULL,
  width_mm           INT UNSIGNED    NULL,
  height_mm          INT UNSIGNED    NULL,
  barcode            VARCHAR(100)    NULL,                       -- EAN/UPC/ISBN
  hsn_code           VARCHAR(20)     NULL,                       -- GST classification (India)
  requires_shipping  TINYINT(1)      NOT NULL DEFAULT 1,
  is_featured        TINYINT(1)      NOT NULL DEFAULT 0,
  is_shareable       TINYINT(1)      NOT NULL DEFAULT 0,         -- opt in to marketplace resale
  meta_title         VARCHAR(255)    NULL,
  meta_description   VARCHAR(500)    NULL,
  meta_keywords      VARCHAR(500)    NULL,
  attributes         JSON            NULL,                       -- unfiltered display specs
  rating_average     DECIMAL(3,2)    NOT NULL DEFAULT 0.00,      -- denormalized from reviews
  rating_count       INT UNSIGNED    NOT NULL DEFAULT 0,
  total_sold         INT UNSIGNED    NOT NULL DEFAULT 0,
  published_at       DATETIME(3)     NULL,
  version            INT UNSIGNED    NOT NULL DEFAULT 0,
  created_by         BIGINT UNSIGNED NULL,
  created_at         DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at         DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at         DATETIME(3)     NULL,
  is_live            TINYINT(1) AS (CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uq_products_public_id (public_id),
  UNIQUE KEY uq_products_tenant_slug (tenant_id, store_id, slug),
  UNIQUE KEY uq_products_tenant_sku (tenant_id, sku),      -- NULLs distinct ⇒ variable products OK
  KEY idx_products_listing (tenant_id, store_id, status, visibility, is_live, published_at),
  KEY idx_products_brand (tenant_id, brand_id, is_live),
  KEY idx_products_featured (tenant_id, store_id, is_featured, is_live),
  KEY idx_products_barcode (tenant_id, barcode),
  KEY idx_products_shareable (tenant_id, is_shareable, status),
  FULLTEXT KEY ft_products_search (name, short_description, meta_keywords),
  CONSTRAINT fk_products_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
  CONSTRAINT fk_products_store FOREIGN KEY (store_id) REFERENCES stores (id) ON DELETE CASCADE,
  CONSTRAINT fk_products_brand FOREIGN KEY (brand_id) REFERENCES brands (id) ON DELETE SET NULL,
  CONSTRAINT chk_products_status CHECK (status IN ('DRAFT','ACTIVE','ARCHIVED','OUT_OF_STOCK')),
  CONSTRAINT chk_products_price CHECK (price_minor >= 0),
  CONSTRAINT chk_products_compare CHECK (compare_price_minor IS NULL OR compare_price_minor >= price_minor)
) ENGINE=InnoDB;
```

> `idx_products_listing` is the single most important index in the schema — it backs the storefront catalog query (`tenant + store + active + visible + not-deleted, ordered by published_at`) as a covering-ish index range scan. Column order matches predicate selectivity; reordering it silently regresses every product listing page.

```sql
CREATE TABLE product_variants (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id           BIGINT UNSIGNED NOT NULL,
  product_id          BIGINT UNSIGNED NOT NULL,
  public_id           CHAR(26)        NOT NULL,
  sku                 VARCHAR(100)    NOT NULL,
  barcode             VARCHAR(100)    NULL,
  title               VARCHAR(255)    NULL,          -- "Blue / Large"
  option_values       JSON            NOT NULL,      -- {"color":"Blue","size":"L"}
  option_signature    CHAR(64)        NOT NULL,      -- SHA-256 of sorted options: blocks duplicates
  price_minor         BIGINT          NOT NULL,
  compare_price_minor BIGINT          NULL,
  cost_price_minor    BIGINT          NULL,
  weight_grams        INT UNSIGNED    NULL,
  image_id            BIGINT UNSIGNED NULL,
  position            SMALLINT        NOT NULL DEFAULT 0,
  is_active           TINYINT(1)      NOT NULL DEFAULT 1,
  created_at          DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at          DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at          DATETIME(3)     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_variants_public_id (public_id),
  UNIQUE KEY uq_variants_tenant_sku (tenant_id, sku),
  UNIQUE KEY uq_variants_option_sig (product_id, option_signature),
  KEY idx_variants_product (product_id, position, is_active),
  CONSTRAINT fk_variants_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE,
  CONSTRAINT chk_variants_price CHECK (price_minor >= 0)
) ENGINE=InnoDB;

CREATE TABLE product_media (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id    BIGINT UNSIGNED NOT NULL,
  product_id   BIGINT UNSIGNED NOT NULL,
  variant_id   BIGINT UNSIGNED NULL,
  type         VARCHAR(16)     NOT NULL DEFAULT 'IMAGE',  -- IMAGE | VIDEO | MODEL_3D | DOCUMENT
  url          VARCHAR(1000)   NOT NULL,
  storage_key  VARCHAR(500)    NOT NULL,                  -- S3 object key, for deletion/reprocess
  thumbnail_url VARCHAR(1000)  NULL,
  alt_text     VARCHAR(255)    NULL,                      -- accessibility + image SEO
  mime_type    VARCHAR(100)    NULL,
  size_bytes   BIGINT UNSIGNED NULL,                      -- counts toward plan storage quota
  width        INT UNSIGNED    NULL,
  height       INT UNSIGNED    NULL,
  duration_sec INT UNSIGNED    NULL,
  position     SMALLINT        NOT NULL DEFAULT 0,
  is_primary   TINYINT(1)      NOT NULL DEFAULT 0,
  created_at   DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_product_media_product (product_id, position),
  KEY idx_product_media_variant (variant_id),
  CONSTRAINT fk_product_media_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE,
  CONSTRAINT fk_product_media_variant FOREIGN KEY (variant_id) REFERENCES product_variants (id) ON DELETE SET NULL,
  CONSTRAINT chk_product_media_type CHECK (type IN ('IMAGE','VIDEO','MODEL_3D','DOCUMENT'))
) ENGINE=InnoDB;

CREATE TABLE product_categories (
  tenant_id   BIGINT UNSIGNED NOT NULL,
  product_id  BIGINT UNSIGNED NOT NULL,
  category_id BIGINT UNSIGNED NOT NULL,
  is_primary  TINYINT(1)      NOT NULL DEFAULT 0,   -- drives canonical breadcrumb + URL
  PRIMARY KEY (product_id, category_id),
  KEY idx_product_categories_category (tenant_id, category_id),
  CONSTRAINT fk_product_categories_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE,
  CONSTRAINT fk_product_categories_category FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Normalized attributes exist ALONGSIDE products.attributes JSON, and the split is
-- deliberate: JSON for display-only specs, rows for anything faceted/filtered.
-- MySQL cannot efficiently filter "color IN ('Red','Blue') AND size='L'" over JSON.
CREATE TABLE product_attributes (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id     BIGINT UNSIGNED NOT NULL,
  code          VARCHAR(64)     NOT NULL,
  name          VARCHAR(120)    NOT NULL,
  input_type    VARCHAR(32)     NOT NULL DEFAULT 'SELECT',  -- SELECT|MULTISELECT|TEXT|NUMBER|BOOLEAN|COLOR
  is_variant_option TINYINT(1)  NOT NULL DEFAULT 0,
  is_filterable TINYINT(1)      NOT NULL DEFAULT 1,
  sort_order    SMALLINT        NOT NULL DEFAULT 0,
  created_at    DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_product_attributes_tenant_code (tenant_id, code),
  CONSTRAINT fk_product_attributes_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE product_attribute_values (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id     BIGINT UNSIGNED NOT NULL,
  product_id    BIGINT UNSIGNED NOT NULL,
  attribute_id  BIGINT UNSIGNED NOT NULL,
  value_text    VARCHAR(500)    NULL,
  value_number  DECIMAL(18,4)   NULL,
  value_bool    TINYINT(1)      NULL,
  PRIMARY KEY (id),
  KEY idx_pav_facet (tenant_id, attribute_id, value_text(100), product_id),
  KEY idx_pav_product (product_id),
  CONSTRAINT fk_pav_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE,
  CONSTRAINT fk_pav_attribute FOREIGN KEY (attribute_id) REFERENCES product_attributes (id) ON DELETE CASCADE
) ENGINE=InnoDB;
```

---

## 8. Inventory

Split into **levels** (current state, mutable) and **movements** (append-only ledger). The ledger is what makes stock auditable — "why is this SKU at 3?" must be answerable, and a mutable counter alone cannot answer it.

```sql
CREATE TABLE inventory_levels (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id          BIGINT UNSIGNED NOT NULL,
  warehouse_id       BIGINT UNSIGNED NOT NULL,
  product_id         BIGINT UNSIGNED NOT NULL,
  variant_id         BIGINT UNSIGNED NULL,
  quantity_on_hand   INT             NOT NULL DEFAULT 0,   -- physically present
  quantity_reserved  INT             NOT NULL DEFAULT 0,   -- committed to open orders
  quantity_incoming  INT             NOT NULL DEFAULT 0,   -- on purchase order
  quantity_available INT AS (quantity_on_hand - quantity_reserved) STORED,
  reorder_point      INT UNSIGNED    NULL,
  reorder_quantity   INT UNSIGNED    NULL,
  bin_location       VARCHAR(64)     NULL,
  last_counted_at    DATETIME(3)     NULL,
  version            INT UNSIGNED    NOT NULL DEFAULT 0,
  created_at         DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at         DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_inventory_levels_slot (warehouse_id, product_id, (IFNULL(variant_id, 0))),
  KEY idx_inventory_levels_lookup (tenant_id, product_id, variant_id),
  KEY idx_inventory_levels_low_stock (tenant_id, quantity_available, reorder_point),
  CONSTRAINT fk_inventory_levels_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses (id) ON DELETE CASCADE,
  CONSTRAINT fk_inventory_levels_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE,
  CONSTRAINT fk_inventory_levels_variant FOREIGN KEY (variant_id) REFERENCES product_variants (id) ON DELETE CASCADE,
  CONSTRAINT chk_inventory_reserved CHECK (quantity_reserved >= 0)
) ENGINE=InnoDB;

CREATE TABLE inventory_movements (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id     BIGINT UNSIGNED NOT NULL,
  warehouse_id  BIGINT UNSIGNED NOT NULL,
  product_id    BIGINT UNSIGNED NOT NULL,
  variant_id    BIGINT UNSIGNED NULL,
  type          VARCHAR(32)     NOT NULL,
  quantity_delta INT            NOT NULL,      -- signed
  quantity_after INT            NOT NULL,      -- snapshot ⇒ reconstruct history without replay
  reference_type VARCHAR(32)    NULL,          -- ORDER | RETURN | ADJUSTMENT | TRANSFER | PO | COUNT
  reference_id   BIGINT UNSIGNED NULL,
  unit_cost_minor BIGINT        NULL,          -- for COGS / weighted-average valuation
  reason        VARCHAR(255)    NULL,
  performed_by  BIGINT UNSIGNED NULL,
  correlation_id CHAR(26)       NULL,
  created_at    DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_inv_movements_item (tenant_id, product_id, variant_id, created_at),
  KEY idx_inv_movements_reference (reference_type, reference_id),
  KEY idx_inv_movements_warehouse_date (warehouse_id, created_at),
  CONSTRAINT fk_inv_movements_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses (id) ON DELETE RESTRICT,
  CONSTRAINT chk_inv_movements_type CHECK (type IN
    ('PURCHASE','SALE','RETURN','ADJUSTMENT','TRANSFER_IN','TRANSFER_OUT',
     'DAMAGE','THEFT','EXPIRY','RESERVATION','RELEASE','COUNT_CORRECTION'))
) ENGINE=InnoDB;
```

**Concurrency rule.** Stock decrement is always a conditional single-statement update, never read-then-write:

```sql
UPDATE inventory_levels
   SET quantity_reserved = quantity_reserved + :qty, version = version + 1
 WHERE id = :id AND tenant_id = :tid
   AND (quantity_on_hand - quantity_reserved) >= :qty;
-- affectedRows = 0 ⇒ insufficient stock, raise OutOfStockError
```

This makes overselling impossible **within** our platform without holding a row lock across a slow gateway call. (Cross-channel oversell is bounded by buffers, not eliminated — see architecture §11.)

---

## 9. Customers

Customers are **per-tenant and separate from `users`**. A shopper on store A is not the same principal as a shopper on store B, even with the same email address, and merging them would leak order history across tenants.

```sql
CREATE TABLE customers (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id           BIGINT UNSIGNED NOT NULL,
  store_id            BIGINT UNSIGNED NOT NULL,
  public_id           CHAR(26)        NOT NULL,
  email               VARCHAR(255)    NULL,
  email_normalized    VARCHAR(255)    NULL,
  phone_e164          VARCHAR(20)     NULL,
  password_hash       VARCHAR(255)    NULL,       -- NULL ⇒ guest or OTP-only
  first_name          VARCHAR(100)    NULL,
  last_name           VARCHAR(100)    NULL,
  date_of_birth       DATE            NULL,
  gender              VARCHAR(20)     NULL,
  status              VARCHAR(32)     NOT NULL DEFAULT 'ACTIVE',
  is_guest            TINYINT(1)      NOT NULL DEFAULT 0,
  email_verified_at   DATETIME(3)     NULL,
  phone_verified_at   DATETIME(3)     NULL,
  accepts_marketing   TINYINT(1)      NOT NULL DEFAULT 0,
  marketing_consent_at DATETIME(3)    NULL,       -- consent proof for GDPR/DPDP
  default_address_id  BIGINT UNSIGNED NULL,
  customer_group      VARCHAR(64)     NULL,       -- retail | wholesale | vip
  tax_exempt          TINYINT(1)      NOT NULL DEFAULT 0,
  tax_registration    VARCHAR(64)     NULL,       -- B2B GSTIN
  loyalty_points      INT             NOT NULL DEFAULT 0,   -- denormalized from ledger
  total_orders        INT UNSIGNED    NOT NULL DEFAULT 0,
  total_spent_minor   BIGINT          NOT NULL DEFAULT 0,
  average_order_minor BIGINT          NOT NULL DEFAULT 0,
  first_order_at      DATETIME(3)     NULL,
  last_order_at       DATETIME(3)     NULL,
  notes               TEXT            NULL,       -- merchant-internal
  tags                JSON            NULL,
  created_at          DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at          DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at          DATETIME(3)     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_customers_public_id (public_id),
  UNIQUE KEY uq_customers_store_email (tenant_id, store_id, email_normalized),
  KEY idx_customers_store_phone (tenant_id, store_id, phone_e164),
  KEY idx_customers_store_created (tenant_id, store_id, created_at),
  KEY idx_customers_spend (tenant_id, store_id, total_spent_minor),
  CONSTRAINT fk_customers_store FOREIGN KEY (store_id) REFERENCES stores (id) ON DELETE CASCADE,
  CONSTRAINT chk_customers_status CHECK (status IN ('ACTIVE','BLOCKED','DEACTIVATED')),
  CONSTRAINT chk_customers_identity CHECK (email IS NOT NULL OR phone_e164 IS NOT NULL)
) ENGINE=InnoDB;

CREATE TABLE customer_addresses (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id     BIGINT UNSIGNED NOT NULL,
  customer_id   BIGINT UNSIGNED NOT NULL,
  public_id     CHAR(26)        NOT NULL,
  label         VARCHAR(64)     NULL,          -- Home | Office
  type          VARCHAR(16)     NOT NULL DEFAULT 'BOTH',   -- SHIPPING | BILLING | BOTH
  recipient_name VARCHAR(200)   NOT NULL,
  phone_e164    VARCHAR(20)     NULL,
  address_line1 VARCHAR(255)    NOT NULL,
  address_line2 VARCHAR(255)    NULL,
  landmark      VARCHAR(255)    NULL,
  city          VARCHAR(120)    NOT NULL,
  state_code    VARCHAR(10)     NULL,
  state_name    VARCHAR(120)    NULL,
  postal_code   VARCHAR(20)     NOT NULL,
  country_code  CHAR(2)         NOT NULL DEFAULT 'IN',
  latitude      DECIMAL(10,7)   NULL,
  longitude     DECIMAL(10,7)   NULL,
  is_default_shipping TINYINT(1) NOT NULL DEFAULT 0,
  is_default_billing  TINYINT(1) NOT NULL DEFAULT 0,
  created_at    DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at    DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at    DATETIME(3)     NULL,
  PRIMARY KEY (id),
  KEY idx_customer_addresses_customer (customer_id, deleted_at),
  CONSTRAINT fk_customer_addresses_customer FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE wishlist_items (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id   BIGINT UNSIGNED NOT NULL,
  customer_id BIGINT UNSIGNED NOT NULL,
  product_id  BIGINT UNSIGNED NOT NULL,
  variant_id  BIGINT UNSIGNED NULL,
  added_at    DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_wishlist_item (customer_id, product_id, (IFNULL(variant_id, 0))),
  KEY idx_wishlist_product (tenant_id, product_id),
  CONSTRAINT fk_wishlist_customer FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE CASCADE,
  CONSTRAINT fk_wishlist_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
) ENGINE=InnoDB;
```

---

## 10. Orders

Every monetary and address field on an order is a **snapshot**, not a reference. An invoice printed today must still be reproducible after the merchant renames the product, changes its price, and the customer edits their address. Referencing live rows would silently rewrite history — a legal problem, not only a cosmetic one.

```sql
CREATE TABLE orders (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id             BIGINT UNSIGNED NOT NULL,
  store_id              BIGINT UNSIGNED NOT NULL,
  public_id             CHAR(26)        NOT NULL,
  order_number          VARCHAR(64)     NOT NULL,   -- merchant-facing, gapless per tenant
  customer_id           BIGINT UNSIGNED NULL,       -- NULL for pure guest checkout
  -- Contact snapshot
  email                 VARCHAR(255)    NULL,
  phone_e164            VARCHAR(20)     NULL,
  -- Lifecycle (three independent axes; collapsing them into one status is a
  -- classic modelling error — an order can be PAID + UNFULFILLED + OPEN)
  status                VARCHAR(32)     NOT NULL DEFAULT 'PENDING',
  payment_status        VARCHAR(32)     NOT NULL DEFAULT 'PENDING',
  fulfilment_status     VARCHAR(32)     NOT NULL DEFAULT 'UNFULFILLED',
  -- Money (all minor units, single currency per order)
  currency              CHAR(3)         NOT NULL,
  subtotal_minor        BIGINT          NOT NULL DEFAULT 0,
  discount_minor        BIGINT          NOT NULL DEFAULT 0,
  shipping_minor        BIGINT          NOT NULL DEFAULT 0,
  tax_minor             BIGINT          NOT NULL DEFAULT 0,
  cod_fee_minor         BIGINT          NOT NULL DEFAULT 0,
  round_off_minor       BIGINT          NOT NULL DEFAULT 0,
  total_minor           BIGINT          NOT NULL DEFAULT 0,
  amount_paid_minor     BIGINT          NOT NULL DEFAULT 0,
  amount_refunded_minor BIGINT          NOT NULL DEFAULT 0,
  -- Address snapshots
  shipping_address      JSON            NULL,
  billing_address       JSON            NULL,
  -- Attribution
  channel               VARCHAR(32)     NOT NULL DEFAULT 'WEB',  -- WEB|POS|AMAZON|FLIPKART|EBAY|META|WHATSAPP|API
  channel_order_ref     VARCHAR(191)    NULL,
  -- Marketplace routing
  is_marketplace_order  TINYINT(1)      NOT NULL DEFAULT 0,
  reseller_tenant_id    BIGINT UNSIGNED NULL,       -- set when sold via a partner store
  parent_order_id       BIGINT UNSIGNED NULL,       -- supplier sub-order → parent
  -- Discounts
  coupon_id             BIGINT UNSIGNED NULL,
  coupon_code           VARCHAR(64)     NULL,
  -- Ops
  customer_note         TEXT            NULL,
  internal_note         TEXT            NULL,
  tags                  JSON            NULL,
  cancel_reason         VARCHAR(255)    NULL,
  cancelled_at          DATETIME(3)     NULL,
  placed_at             DATETIME(3)     NULL,
  confirmed_at          DATETIME(3)     NULL,
  delivered_at          DATETIME(3)     NULL,
  closed_at             DATETIME(3)     NULL,
  -- Traceability
  ip_address            VARBINARY(16)   NULL,
  user_agent            VARCHAR(500)    NULL,
  utm                   JSON            NULL,
  correlation_id        CHAR(26)        NULL,
  version               INT UNSIGNED    NOT NULL DEFAULT 0,
  created_at            DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at            DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_orders_public_id (public_id),
  UNIQUE KEY uq_orders_tenant_number (tenant_id, order_number),
  UNIQUE KEY uq_orders_channel_ref (tenant_id, channel, channel_order_ref),  -- idempotent channel import
  KEY idx_orders_listing (tenant_id, store_id, status, created_at),
  KEY idx_orders_customer (tenant_id, customer_id, created_at),
  KEY idx_orders_payment_status (tenant_id, payment_status, created_at),
  KEY idx_orders_fulfilment (tenant_id, fulfilment_status, created_at),
  KEY idx_orders_reseller (reseller_tenant_id, created_at),
  KEY idx_orders_parent (parent_order_id),
  KEY idx_orders_reporting (tenant_id, store_id, placed_at, total_minor),
  CONSTRAINT fk_orders_store FOREIGN KEY (store_id) REFERENCES stores (id) ON DELETE RESTRICT,
  CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE RESTRICT,
  CONSTRAINT fk_orders_parent FOREIGN KEY (parent_order_id) REFERENCES orders (id) ON DELETE RESTRICT,
  CONSTRAINT chk_orders_status CHECK (status IN
    ('DRAFT','PENDING','CONFIRMED','PROCESSING','SHIPPED','DELIVERED',
     'COMPLETED','CANCELLED','RETURNED','FAILED','ON_HOLD')),
  CONSTRAINT chk_orders_payment_status CHECK (payment_status IN
    ('PENDING','AUTHORIZED','PAID','PARTIALLY_PAID','PARTIALLY_REFUNDED','REFUNDED','FAILED','VOIDED')),
  CONSTRAINT chk_orders_fulfilment_status CHECK (fulfilment_status IN
    ('UNFULFILLED','PARTIALLY_FULFILLED','FULFILLED','RETURNED','PARTIALLY_RETURNED')),
  CONSTRAINT chk_orders_totals CHECK (total_minor >= 0 AND amount_refunded_minor <= amount_paid_minor)
) ENGINE=InnoDB;

CREATE TABLE order_items (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id             BIGINT UNSIGNED NOT NULL,
  order_id              BIGINT UNSIGNED NOT NULL,
  product_id            BIGINT UNSIGNED NULL,       -- nullable: product may be deleted later
  variant_id            BIGINT UNSIGNED NULL,
  -- Immutable snapshot of what was actually sold
  sku                   VARCHAR(100)    NOT NULL,
  name                  VARCHAR(500)    NOT NULL,
  variant_title         VARCHAR(255)    NULL,
  image_url             VARCHAR(1000)   NULL,
  hsn_code              VARCHAR(20)     NULL,
  quantity              INT UNSIGNED    NOT NULL,
  unit_price_minor      BIGINT          NOT NULL,
  unit_cost_minor       BIGINT          NULL,       -- COGS snapshot for margin reports
  line_subtotal_minor   BIGINT          NOT NULL,
  line_discount_minor   BIGINT          NOT NULL DEFAULT 0,
  tax_rate              DECIMAL(7,4)    NOT NULL DEFAULT 0,
  line_tax_minor        BIGINT          NOT NULL DEFAULT 0,
  line_total_minor      BIGINT          NOT NULL,
  tax_breakup           JSON            NULL,       -- CGST/SGST/IGST split
  quantity_fulfilled    INT UNSIGNED    NOT NULL DEFAULT 0,
  quantity_returned     INT UNSIGNED    NOT NULL DEFAULT 0,
  quantity_cancelled    INT UNSIGNED    NOT NULL DEFAULT 0,
  warehouse_id          BIGINT UNSIGNED NULL,
  -- Marketplace: which tenant actually supplies this line
  supplier_tenant_id    BIGINT UNSIGNED NULL,
  commission_rate       DECIMAL(7,4)    NULL,
  commission_minor      BIGINT          NULL,
  properties            JSON            NULL,       -- gift message, engraving, etc.
  created_at            DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at            DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_order_items_order (order_id),
  KEY idx_order_items_product (tenant_id, product_id),
  KEY idx_order_items_variant (tenant_id, variant_id),
  KEY idx_order_items_supplier (supplier_tenant_id, created_at),
  CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
  CONSTRAINT chk_order_items_qty CHECK (quantity > 0),
  CONSTRAINT chk_order_items_returned CHECK (quantity_returned <= quantity)
) ENGINE=InnoDB;

CREATE TABLE order_status_history (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id     BIGINT UNSIGNED NOT NULL,
  order_id      BIGINT UNSIGNED NOT NULL,
  status_type   VARCHAR(32)     NOT NULL,   -- ORDER | PAYMENT | FULFILMENT
  from_status   VARCHAR(32)     NULL,
  to_status     VARCHAR(32)     NOT NULL,
  reason        VARCHAR(500)    NULL,
  actor_type    VARCHAR(32)     NOT NULL,   -- USER | CUSTOMER | SYSTEM | WEBHOOK
  actor_id      BIGINT UNSIGNED NULL,
  metadata      JSON            NULL,
  correlation_id CHAR(26)       NULL,
  created_at    DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_order_status_history_order (order_id, created_at),
  CONSTRAINT fk_order_status_history_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
) ENGINE=InnoDB;
```

**Carts** live in Redis as the store of record (`cart:{tid}:{cartId}`, 30-day TTL) and are mirrored to MySQL only for signed-in customers, so abandoned-cart campaigns and cross-device continuity work. Anonymous carts never touch MySQL — millions of throwaway rows for no business value.

---

## 11. Payments & refunds

```sql
CREATE TABLE payments (
  id                     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id              BIGINT UNSIGNED NOT NULL,
  store_id               BIGINT UNSIGNED NOT NULL,
  order_id               BIGINT UNSIGNED NULL,      -- NULL for subscription payments
  subscription_invoice_id BIGINT UNSIGNED NULL,
  public_id              CHAR(26)        NOT NULL,
  gateway                VARCHAR(32)     NOT NULL,  -- RAZORPAY|STRIPE|PAYPAL|CASHFREE|PHONEPE|PAYU|COD|BANK|WALLET
  method                 VARCHAR(32)     NULL,      -- CARD|UPI|NETBANKING|WALLET|EMI|COD
  status                 VARCHAR(32)     NOT NULL DEFAULT 'INITIATED',
  amount_minor           BIGINT          NOT NULL,
  currency               CHAR(3)         NOT NULL,
  amount_captured_minor  BIGINT          NOT NULL DEFAULT 0,
  amount_refunded_minor  BIGINT          NOT NULL DEFAULT 0,
  gateway_fee_minor      BIGINT          NULL,
  gateway_tax_minor      BIGINT          NULL,
  net_settlement_minor   BIGINT          NULL,
  -- Gateway identity (never PAN)
  gateway_payment_id     VARCHAR(191)    NULL,
  gateway_order_id       VARCHAR(191)    NULL,
  gateway_signature      VARCHAR(500)    NULL,
  card_last4             CHAR(4)         NULL,
  card_brand             VARCHAR(32)     NULL,
  card_network           VARCHAR(32)     NULL,
  upi_vpa                VARCHAR(191)    NULL,
  bank_name              VARCHAR(120)    NULL,
  -- Idempotency: our key, sent to the gateway; UNIQUE ⇒ a retried checkout
  -- can never create a second charge
  idempotency_key        CHAR(64)        NOT NULL,
  error_code             VARCHAR(64)     NULL,
  error_message          VARCHAR(500)    NULL,
  gateway_response       JSON            NULL,      -- redacted
  authorized_at          DATETIME(3)     NULL,
  captured_at            DATETIME(3)     NULL,
  failed_at              DATETIME(3)     NULL,
  reconciled_at          DATETIME(3)     NULL,
  correlation_id         CHAR(26)        NULL,
  version                INT UNSIGNED    NOT NULL DEFAULT 0,
  created_at             DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at             DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_payments_public_id (public_id),
  UNIQUE KEY uq_payments_idempotency (tenant_id, idempotency_key),
  UNIQUE KEY uq_payments_gateway_ref (gateway, gateway_payment_id),
  KEY idx_payments_order (order_id, status),
  KEY idx_payments_status_created (tenant_id, status, created_at),
  KEY idx_payments_reconcile (status, reconciled_at, created_at),
  KEY idx_payments_invoice (subscription_invoice_id),
  CONSTRAINT fk_payments_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE RESTRICT,
  CONSTRAINT chk_payments_status CHECK (status IN
    ('INITIATED','PENDING','AUTHORIZED','CAPTURED','PARTIALLY_REFUNDED',
     'REFUNDED','FAILED','CANCELLED','EXPIRED','DISPUTED')),
  CONSTRAINT chk_payments_amounts CHECK (
    amount_captured_minor <= amount_minor AND
    amount_refunded_minor <= amount_captured_minor)
) ENGINE=InnoDB;

CREATE TABLE refunds (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id          BIGINT UNSIGNED NOT NULL,
  payment_id         BIGINT UNSIGNED NOT NULL,
  order_id           BIGINT UNSIGNED NULL,
  return_id          BIGINT UNSIGNED NULL,
  public_id          CHAR(26)        NOT NULL,
  amount_minor       BIGINT          NOT NULL,
  currency           CHAR(3)         NOT NULL,
  reason             VARCHAR(255)    NULL,
  status             VARCHAR(32)     NOT NULL DEFAULT 'PENDING',
  gateway_refund_id  VARCHAR(191)    NULL,
  idempotency_key    CHAR(64)        NOT NULL,
  speed              VARCHAR(16)     NULL,          -- NORMAL | INSTANT
  requested_by       BIGINT UNSIGNED NULL,
  approved_by        BIGINT UNSIGNED NULL,
  gateway_response   JSON            NULL,
  processed_at       DATETIME(3)     NULL,
  created_at         DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at         DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_refunds_public_id (public_id),
  UNIQUE KEY uq_refunds_idempotency (tenant_id, idempotency_key),
  KEY idx_refunds_payment (payment_id),
  KEY idx_refunds_order (order_id),
  KEY idx_refunds_status (tenant_id, status, created_at),
  CONSTRAINT fk_refunds_payment FOREIGN KEY (payment_id) REFERENCES payments (id) ON DELETE RESTRICT,
  CONSTRAINT chk_refunds_status CHECK (status IN ('PENDING','PROCESSING','COMPLETED','FAILED','CANCELLED')),
  CONSTRAINT chk_refunds_amount CHECK (amount_minor > 0)
) ENGINE=InnoDB;
```

> Every gateway interaction is guarded by a **unique idempotency key**. Checkout retries, double-clicks, and webhook replays are not edge cases — they are the normal traffic pattern, and a duplicate charge is the most damaging bug this system can ship.

---

## 12. Shipping & returns

```sql
CREATE TABLE shipments (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id           BIGINT UNSIGNED NOT NULL,
  order_id            BIGINT UNSIGNED NOT NULL,
  warehouse_id        BIGINT UNSIGNED NULL,
  public_id           CHAR(26)        NOT NULL,
  shipment_number     VARCHAR(64)     NOT NULL,
  carrier             VARCHAR(32)     NOT NULL,   -- DELHIVERY|SHIPROCKET|BLUEDART|DTDC|XPRESSBEES|SELF
  carrier_service     VARCHAR(64)     NULL,       -- SURFACE | EXPRESS
  awb_number          VARCHAR(100)    NULL,
  tracking_url        VARCHAR(1000)   NULL,
  status              VARCHAR(32)     NOT NULL DEFAULT 'PENDING',
  weight_grams        INT UNSIGNED    NULL,
  length_mm           INT UNSIGNED    NULL,
  width_mm            INT UNSIGNED    NULL,
  height_mm           INT UNSIGNED    NULL,
  shipping_cost_minor BIGINT          NULL,
  cod_amount_minor    BIGINT          NOT NULL DEFAULT 0,
  is_cod              TINYINT(1)      NOT NULL DEFAULT 0,
  label_url           VARCHAR(1000)   NULL,
  manifest_url        VARCHAR(1000)   NULL,
  invoice_url         VARCHAR(1000)   NULL,
  from_address        JSON            NULL,
  to_address          JSON            NULL,
  pickup_scheduled_at DATETIME(3)     NULL,
  picked_up_at        DATETIME(3)     NULL,
  shipped_at          DATETIME(3)     NULL,
  expected_delivery_at DATETIME(3)    NULL,
  delivered_at        DATETIME(3)     NULL,
  rto_initiated_at    DATETIME(3)     NULL,       -- return-to-origin (high-volume in Indian COD)
  carrier_response    JSON            NULL,
  last_sync_at        DATETIME(3)     NULL,
  created_at          DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at          DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_shipments_public_id (public_id),
  UNIQUE KEY uq_shipments_tenant_number (tenant_id, shipment_number),
  UNIQUE KEY uq_shipments_carrier_awb (carrier, awb_number),
  KEY idx_shipments_order (order_id),
  KEY idx_shipments_status (tenant_id, status, created_at),
  KEY idx_shipments_tracking_sync (status, last_sync_at),
  CONSTRAINT fk_shipments_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE RESTRICT,
  CONSTRAINT chk_shipments_status CHECK (status IN
    ('PENDING','LABEL_CREATED','PICKUP_SCHEDULED','PICKED_UP','IN_TRANSIT','OUT_FOR_DELIVERY',
     'DELIVERED','FAILED_DELIVERY','RTO_INITIATED','RTO_DELIVERED','CANCELLED','LOST','DAMAGED'))
) ENGINE=InnoDB;

CREATE TABLE shipment_items (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id      BIGINT UNSIGNED NOT NULL,
  shipment_id    BIGINT UNSIGNED NOT NULL,
  order_item_id  BIGINT UNSIGNED NOT NULL,
  quantity       INT UNSIGNED    NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_shipment_items (shipment_id, order_item_id),
  CONSTRAINT fk_shipment_items_shipment FOREIGN KEY (shipment_id) REFERENCES shipments (id) ON DELETE CASCADE,
  CONSTRAINT fk_shipment_items_order_item FOREIGN KEY (order_item_id) REFERENCES order_items (id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE shipment_events (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id    BIGINT UNSIGNED NOT NULL,
  shipment_id  BIGINT UNSIGNED NOT NULL,
  status       VARCHAR(32)     NOT NULL,
  carrier_status_code VARCHAR(64) NULL,
  description  VARCHAR(500)    NULL,
  location     VARCHAR(255)    NULL,
  event_at     DATETIME(3)     NOT NULL,
  event_hash   CHAR(64)        NOT NULL,   -- dedupe: carriers replay the same scan repeatedly
  raw_payload  JSON            NULL,
  created_at   DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_shipment_events_dedupe (shipment_id, event_hash),
  KEY idx_shipment_events_shipment (shipment_id, event_at),
  CONSTRAINT fk_shipment_events_shipment FOREIGN KEY (shipment_id) REFERENCES shipments (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE returns (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id           BIGINT UNSIGNED NOT NULL,
  order_id            BIGINT UNSIGNED NOT NULL,
  customer_id         BIGINT UNSIGNED NULL,
  public_id           CHAR(26)        NOT NULL,
  rma_number          VARCHAR(64)     NOT NULL,
  type                VARCHAR(16)     NOT NULL DEFAULT 'RETURN',  -- RETURN | EXCHANGE | REPLACEMENT
  status              VARCHAR(32)     NOT NULL DEFAULT 'REQUESTED',
  reason              VARCHAR(64)     NOT NULL,   -- DAMAGED|WRONG_ITEM|SIZE_ISSUE|NOT_AS_DESCRIBED|CHANGED_MIND|DEFECTIVE
  reason_detail       TEXT            NULL,
  customer_images     JSON            NULL,
  refund_amount_minor BIGINT          NULL,
  restocking_fee_minor BIGINT         NOT NULL DEFAULT 0,
  return_shipment_id  BIGINT UNSIGNED NULL,
  approved_by         BIGINT UNSIGNED NULL,
  approved_at         DATETIME(3)     NULL,
  rejected_reason     VARCHAR(500)    NULL,
  received_at         DATETIME(3)     NULL,
  inspected_at        DATETIME(3)     NULL,
  inspection_result   VARCHAR(32)     NULL,       -- RESELLABLE | DAMAGED | SCRAP
  completed_at        DATETIME(3)     NULL,
  created_at          DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at          DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_returns_public_id (public_id),
  UNIQUE KEY uq_returns_tenant_rma (tenant_id, rma_number),
  KEY idx_returns_order (order_id),
  KEY idx_returns_status (tenant_id, status, created_at),
  CONSTRAINT fk_returns_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE RESTRICT,
  CONSTRAINT chk_returns_status CHECK (status IN
    ('REQUESTED','APPROVED','REJECTED','IN_TRANSIT','RECEIVED','INSPECTED','COMPLETED','CANCELLED'))
) ENGINE=InnoDB;

CREATE TABLE return_items (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id      BIGINT UNSIGNED NOT NULL,
  return_id      BIGINT UNSIGNED NOT NULL,
  order_item_id  BIGINT UNSIGNED NOT NULL,
  quantity       INT UNSIGNED    NOT NULL,
  condition_note VARCHAR(255)    NULL,
  restock        TINYINT(1)      NOT NULL DEFAULT 1,
  refund_minor   BIGINT          NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_return_items (return_id, order_item_id),
  CONSTRAINT fk_return_items_return FOREIGN KEY (return_id) REFERENCES returns (id) ON DELETE CASCADE,
  CONSTRAINT fk_return_items_order_item FOREIGN KEY (order_item_id) REFERENCES order_items (id) ON DELETE RESTRICT
) ENGINE=InnoDB;
```

---

## 13. Tax

```sql
CREATE TABLE tax_classes (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id  BIGINT UNSIGNED NOT NULL,
  code       VARCHAR(64)     NOT NULL,
  name       VARCHAR(120)    NOT NULL,
  is_default TINYINT(1)      NOT NULL DEFAULT 0,
  created_at DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_tax_classes_tenant_code (tenant_id, code),
  CONSTRAINT fk_tax_classes_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE tax_rates (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id      BIGINT UNSIGNED NOT NULL,
  tax_class_id   BIGINT UNSIGNED NOT NULL,
  name           VARCHAR(120)    NOT NULL,   -- 'GST 18%'
  country_code   CHAR(2)         NOT NULL,
  state_code     VARCHAR(10)     NULL,       -- NULL = whole country
  postal_pattern VARCHAR(64)     NULL,
  rate           DECIMAL(7,4)    NOT NULL,   -- 18.0000 = 18 %
  compound       TINYINT(1)      NOT NULL DEFAULT 0,
  priority       SMALLINT        NOT NULL DEFAULT 0,
  is_inclusive   TINYINT(1)      NOT NULL DEFAULT 0,
  components     JSON            NULL,       -- [{name:'CGST',rate:9},{name:'SGST',rate:9}]
  effective_from DATE            NULL,       -- history matters: reprinting an old
  effective_to   DATE            NULL,       -- invoice must use the old rate
  created_at     DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_tax_rates_lookup (tenant_id, tax_class_id, country_code, state_code, priority),
  CONSTRAINT fk_tax_rates_class FOREIGN KEY (tax_class_id) REFERENCES tax_classes (id) ON DELETE CASCADE,
  CONSTRAINT chk_tax_rates_rate CHECK (rate >= 0 AND rate <= 100)
) ENGINE=InnoDB;
```

---

## 14. Marketing

```sql
CREATE TABLE coupons (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id             BIGINT UNSIGNED NOT NULL,
  store_id              BIGINT UNSIGNED NULL,
  public_id             CHAR(26)        NOT NULL,
  code                  VARCHAR(64)     NOT NULL,
  name                  VARCHAR(255)    NULL,
  description           VARCHAR(500)    NULL,
  discount_type         VARCHAR(32)     NOT NULL,  -- PERCENTAGE|FIXED_AMOUNT|FREE_SHIPPING|BUY_X_GET_Y
  discount_value        DECIMAL(12,4)   NOT NULL,
  max_discount_minor    BIGINT          NULL,      -- caps "20% off" on a large basket
  min_order_minor       BIGINT          NULL,
  applies_to            VARCHAR(32)     NOT NULL DEFAULT 'ORDER',  -- ORDER|PRODUCTS|CATEGORIES|SHIPPING
  target_ids            JSON            NULL,
  excluded_ids          JSON            NULL,
  buy_quantity          INT UNSIGNED    NULL,
  get_quantity          INT UNSIGNED    NULL,
  usage_limit_total     INT UNSIGNED    NULL,
  usage_limit_per_customer INT UNSIGNED NULL,
  usage_count           INT UNSIGNED    NOT NULL DEFAULT 0,
  customer_eligibility  VARCHAR(32)     NOT NULL DEFAULT 'ALL',    -- ALL|NEW|RETURNING|GROUP|SPECIFIC
  eligible_customer_ids JSON            NULL,
  eligible_group        VARCHAR(64)     NULL,
  combinable            TINYINT(1)      NOT NULL DEFAULT 0,
  auto_apply            TINYINT(1)      NOT NULL DEFAULT 0,
  starts_at             DATETIME(3)     NULL,
  ends_at               DATETIME(3)     NULL,
  status                VARCHAR(32)     NOT NULL DEFAULT 'ACTIVE',
  created_by            BIGINT UNSIGNED NULL,
  created_at            DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at            DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at            DATETIME(3)     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_coupons_tenant_code (tenant_id, code),
  KEY idx_coupons_active (tenant_id, status, starts_at, ends_at),
  CONSTRAINT fk_coupons_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
  CONSTRAINT chk_coupons_type CHECK (discount_type IN
    ('PERCENTAGE','FIXED_AMOUNT','FREE_SHIPPING','BUY_X_GET_Y')),
  CONSTRAINT chk_coupons_window CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
) ENGINE=InnoDB;

-- The UNIQUE on (coupon, order) is the per-order guard; the per-customer limit is
-- enforced by counting rows inside the same transaction that reserves the coupon.
CREATE TABLE coupon_redemptions (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id      BIGINT UNSIGNED NOT NULL,
  coupon_id      BIGINT UNSIGNED NOT NULL,
  order_id       BIGINT UNSIGNED NOT NULL,
  customer_id    BIGINT UNSIGNED NULL,
  discount_minor BIGINT          NOT NULL,
  redeemed_at    DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_coupon_redemptions_order (coupon_id, order_id),
  KEY idx_coupon_redemptions_customer (coupon_id, customer_id),
  CONSTRAINT fk_coupon_redemptions_coupon FOREIGN KEY (coupon_id) REFERENCES coupons (id) ON DELETE CASCADE,
  CONSTRAINT fk_coupon_redemptions_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE gift_cards (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id         BIGINT UNSIGNED NOT NULL,
  public_id         CHAR(26)        NOT NULL,
  code_hash         CHAR(64)        NOT NULL,   -- hashed: a gift card code IS money
  code_last4        CHAR(4)         NOT NULL,
  initial_value_minor BIGINT        NOT NULL,
  balance_minor     BIGINT          NOT NULL,
  currency          CHAR(3)         NOT NULL,
  status            VARCHAR(32)     NOT NULL DEFAULT 'ACTIVE',
  issued_to_customer_id BIGINT UNSIGNED NULL,
  issued_to_email   VARCHAR(255)    NULL,
  order_id          BIGINT UNSIGNED NULL,       -- purchase order that created it
  expires_at        DATETIME(3)     NULL,
  created_at        DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at        DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_gift_cards_code_hash (code_hash),
  KEY idx_gift_cards_customer (tenant_id, issued_to_customer_id),
  CONSTRAINT fk_gift_cards_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
  CONSTRAINT chk_gift_cards_balance CHECK (balance_minor >= 0 AND balance_minor <= initial_value_minor)
) ENGINE=InnoDB;

-- Append-only points ledger. `customers.loyalty_points` is a cache of SUM(points_delta).
CREATE TABLE loyalty_transactions (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id     BIGINT UNSIGNED NOT NULL,
  customer_id   BIGINT UNSIGNED NOT NULL,
  type          VARCHAR(32)     NOT NULL,   -- EARN|REDEEM|EXPIRE|ADJUST|REVERSAL
  points_delta  INT             NOT NULL,
  points_after  INT             NOT NULL,
  order_id      BIGINT UNSIGNED NULL,
  description   VARCHAR(255)    NULL,
  expires_at    DATETIME(3)     NULL,
  created_by    BIGINT UNSIGNED NULL,
  created_at    DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_loyalty_customer (customer_id, created_at),
  KEY idx_loyalty_expiry (tenant_id, expires_at, type),
  CONSTRAINT fk_loyalty_customer FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE reviews (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id         BIGINT UNSIGNED NOT NULL,
  store_id          BIGINT UNSIGNED NOT NULL,
  product_id        BIGINT UNSIGNED NOT NULL,
  customer_id       BIGINT UNSIGNED NULL,
  order_item_id     BIGINT UNSIGNED NULL,      -- presence ⇒ verified purchase
  public_id         CHAR(26)        NOT NULL,
  rating            TINYINT UNSIGNED NOT NULL,
  title             VARCHAR(255)    NULL,
  body              TEXT            NULL,
  author_name       VARCHAR(120)    NULL,
  images            JSON            NULL,
  status            VARCHAR(32)     NOT NULL DEFAULT 'PENDING',
  is_verified_purchase TINYINT(1)   NOT NULL DEFAULT 0,
  helpful_count     INT UNSIGNED    NOT NULL DEFAULT 0,
  merchant_reply    TEXT            NULL,
  merchant_replied_at DATETIME(3)   NULL,
  moderated_by      BIGINT UNSIGNED NULL,
  moderated_at      DATETIME(3)     NULL,
  created_at        DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at        DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at        DATETIME(3)     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_reviews_public_id (public_id),
  -- one review per customer per purchased line
  UNIQUE KEY uq_reviews_order_item (customer_id, order_item_id),
  KEY idx_reviews_product (tenant_id, product_id, status, created_at),
  KEY idx_reviews_moderation (tenant_id, status, created_at),
  CONSTRAINT fk_reviews_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE,
  CONSTRAINT chk_reviews_rating CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT chk_reviews_status CHECK (status IN ('PENDING','APPROVED','REJECTED','SPAM'))
) ENGINE=InnoDB;
```

---

## 15. Content & theming

```sql
-- Platform-owned templates (the catalog merchants pick from)
CREATE TABLE theme_templates (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code          VARCHAR(64)  NOT NULL,
  name          VARCHAR(120) NOT NULL,
  category      VARCHAR(64)  NOT NULL,   -- fashion|electronics|grocery|furniture|jewelry|pharmacy|restaurant|handmade|general
  description   TEXT         NULL,
  preview_url   VARCHAR(500) NULL,
  thumbnail_url VARCHAR(500) NULL,
  demo_url      VARCHAR(500) NULL,
  is_premium    TINYINT(1)   NOT NULL DEFAULT 0,
  price_minor   BIGINT       NOT NULL DEFAULT 0,
  min_plan_id   INT UNSIGNED NULL,       -- gate premium themes by plan
  default_config JSON        NOT NULL,   -- colors, fonts, section layout
  schema_version SMALLINT    NOT NULL DEFAULT 1,
  status        VARCHAR(32)  NOT NULL DEFAULT 'ACTIVE',
  created_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_theme_templates_code (code),
  KEY idx_theme_templates_category (category, status)
) ENGINE=InnoDB;

-- Tenant's customized copy. Cloned from the template at selection time so a later
-- template update never mutates a live store without the merchant opting in.
CREATE TABLE tenant_themes (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id          BIGINT UNSIGNED NOT NULL,
  store_id           BIGINT UNSIGNED NOT NULL,
  template_id        INT UNSIGNED    NOT NULL,
  public_id          CHAR(26)        NOT NULL,
  name               VARCHAR(120)    NOT NULL,
  config             JSON            NOT NULL,   -- colors, typography, layout, sections
  custom_css         MEDIUMTEXT      NULL,       -- sanitized
  custom_head_html   TEXT            NULL,       -- sanitized; analytics snippets
  status             VARCHAR(32)     NOT NULL DEFAULT 'DRAFT',  -- DRAFT|PUBLISHED|ARCHIVED
  published_at       DATETIME(3)     NULL,
  published_config   JSON            NULL,       -- live snapshot: edit drafts without affecting shoppers
  version            INT UNSIGNED    NOT NULL DEFAULT 0,
  created_at         DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at         DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_tenant_themes_public_id (public_id),
  KEY idx_tenant_themes_store (tenant_id, store_id, status),
  CONSTRAINT fk_tenant_themes_store FOREIGN KEY (store_id) REFERENCES stores (id) ON DELETE CASCADE,
  CONSTRAINT fk_tenant_themes_template FOREIGN KEY (template_id) REFERENCES theme_templates (id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE cms_pages (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id        BIGINT UNSIGNED NOT NULL,
  store_id         BIGINT UNSIGNED NOT NULL,
  public_id        CHAR(26)        NOT NULL,
  slug             VARCHAR(255)    NOT NULL,
  title            VARCHAR(255)    NOT NULL,
  content_html     MEDIUMTEXT      NULL,         -- sanitized on write
  content_blocks   JSON            NULL,         -- page-builder representation
  template         VARCHAR(64)     NULL,
  status           VARCHAR(32)     NOT NULL DEFAULT 'DRAFT',
  is_system        TINYINT(1)      NOT NULL DEFAULT 0,   -- privacy/terms: undeletable
  meta_title       VARCHAR(255)    NULL,
  meta_description VARCHAR(500)    NULL,
  canonical_url    VARCHAR(500)    NULL,
  no_index         TINYINT(1)      NOT NULL DEFAULT 0,
  published_at     DATETIME(3)     NULL,
  created_by       BIGINT UNSIGNED NULL,
  created_at       DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at       DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at       DATETIME(3)     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cms_pages_store_slug (tenant_id, store_id, slug),
  KEY idx_cms_pages_status (tenant_id, store_id, status),
  CONSTRAINT fk_cms_pages_store FOREIGN KEY (store_id) REFERENCES stores (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE blog_posts (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id        BIGINT UNSIGNED NOT NULL,
  store_id         BIGINT UNSIGNED NOT NULL,
  public_id        CHAR(26)        NOT NULL,
  slug             VARCHAR(255)    NOT NULL,
  title            VARCHAR(255)    NOT NULL,
  excerpt          VARCHAR(1000)   NULL,
  content_html     MEDIUMTEXT      NULL,
  cover_image_url  VARCHAR(1000)   NULL,
  author_id        BIGINT UNSIGNED NULL,
  author_name      VARCHAR(120)    NULL,
  category         VARCHAR(120)    NULL,
  tags             JSON            NULL,
  status           VARCHAR(32)     NOT NULL DEFAULT 'DRAFT',
  view_count       INT UNSIGNED    NOT NULL DEFAULT 0,
  meta_title       VARCHAR(255)    NULL,
  meta_description VARCHAR(500)    NULL,
  published_at     DATETIME(3)     NULL,
  created_at       DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at       DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at       DATETIME(3)     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_blog_posts_store_slug (tenant_id, store_id, slug),
  KEY idx_blog_posts_published (tenant_id, store_id, status, published_at),
  FULLTEXT KEY ft_blog_posts (title, excerpt),
  CONSTRAINT fk_blog_posts_store FOREIGN KEY (store_id) REFERENCES stores (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE banners (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id    BIGINT UNSIGNED NOT NULL,
  store_id     BIGINT UNSIGNED NOT NULL,
  placement    VARCHAR(64)     NOT NULL,   -- HOME_HERO|HOME_STRIP|CATEGORY_TOP|SIDEBAR|POPUP
  title        VARCHAR(255)    NULL,
  subtitle     VARCHAR(500)    NULL,
  image_url    VARCHAR(1000)   NULL,
  mobile_image_url VARCHAR(1000) NULL,
  alt_text     VARCHAR(255)    NULL,
  link_url     VARCHAR(1000)   NULL,
  cta_label    VARCHAR(64)     NULL,
  sort_order   SMALLINT        NOT NULL DEFAULT 0,
  starts_at    DATETIME(3)     NULL,
  ends_at      DATETIME(3)     NULL,
  is_active    TINYINT(1)      NOT NULL DEFAULT 1,
  click_count  INT UNSIGNED    NOT NULL DEFAULT 0,
  created_at   DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at   DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_banners_placement (tenant_id, store_id, placement, is_active, sort_order),
  CONSTRAINT fk_banners_store FOREIGN KEY (store_id) REFERENCES stores (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE menus (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id  BIGINT UNSIGNED NOT NULL,
  store_id   BIGINT UNSIGNED NOT NULL,
  code       VARCHAR(64)     NOT NULL,   -- header | footer-1 | mobile
  name       VARCHAR(120)    NOT NULL,
  created_at DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_menus_store_code (tenant_id, store_id, code),
  CONSTRAINT fk_menus_store FOREIGN KEY (store_id) REFERENCES stores (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE menu_items (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id    BIGINT UNSIGNED NOT NULL,
  menu_id      BIGINT UNSIGNED NOT NULL,
  parent_id    BIGINT UNSIGNED NULL,
  label        VARCHAR(120)    NOT NULL,
  link_type    VARCHAR(32)     NOT NULL,   -- CATEGORY|PRODUCT|PAGE|BLOG|URL|COLLECTION
  link_target  VARCHAR(500)    NULL,
  reference_id BIGINT UNSIGNED NULL,
  icon         VARCHAR(64)     NULL,
  open_in_new_tab TINYINT(1)   NOT NULL DEFAULT 0,
  sort_order   SMALLINT        NOT NULL DEFAULT 0,
  is_active    TINYINT(1)      NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  KEY idx_menu_items_menu (menu_id, parent_id, sort_order),
  CONSTRAINT fk_menu_items_menu FOREIGN KEY (menu_id) REFERENCES menus (id) ON DELETE CASCADE,
  CONSTRAINT fk_menu_items_parent FOREIGN KEY (parent_id) REFERENCES menu_items (id) ON DELETE CASCADE
) ENGINE=InnoDB;
```

---

## 16. Marketplace: sharing, commission, settlement

```sql
CREATE TABLE product_shares (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  supplier_tenant_id  BIGINT UNSIGNED NOT NULL,
  reseller_tenant_id  BIGINT UNSIGNED NOT NULL,
  product_id          BIGINT UNSIGNED NOT NULL,
  public_id           CHAR(26)        NOT NULL,
  status              VARCHAR(32)     NOT NULL DEFAULT 'PENDING',
  commission_type     VARCHAR(32)     NOT NULL DEFAULT 'PERCENTAGE',  -- PERCENTAGE|FIXED|MARGIN
  commission_value    DECIMAL(12,4)   NOT NULL,
  platform_fee_rate   DECIMAL(7,4)    NOT NULL DEFAULT 0,
  reseller_price_minor BIGINT         NULL,      -- reseller may mark up
  min_price_minor     BIGINT          NULL,      -- supplier's MAP floor
  allow_price_override TINYINT(1)     NOT NULL DEFAULT 0,
  inventory_mode      VARCHAR(32)     NOT NULL DEFAULT 'SHARED',      -- SHARED|ALLOCATED
  allocated_quantity  INT UNSIGNED    NULL,
  requested_by        BIGINT UNSIGNED NULL,
  approved_by         BIGINT UNSIGNED NULL,
  approved_at         DATETIME(3)     NULL,
  revoked_at          DATETIME(3)     NULL,
  created_at          DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at          DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_product_shares (supplier_tenant_id, reseller_tenant_id, product_id),
  KEY idx_product_shares_reseller (reseller_tenant_id, status),
  KEY idx_product_shares_product (product_id, status),
  CONSTRAINT fk_product_shares_supplier FOREIGN KEY (supplier_tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
  CONSTRAINT fk_product_shares_reseller FOREIGN KEY (reseller_tenant_id) REFERENCES tenants (id) ON DELETE CASCADE,
  CONSTRAINT fk_product_shares_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE,
  CONSTRAINT chk_product_shares_status CHECK (status IN ('PENDING','ACTIVE','PAUSED','REJECTED','REVOKED'))
) ENGINE=InnoDB;

-- Append-only, double-entry. A correction is a REVERSAL row, never an UPDATE:
-- mutable money records cannot be audited, and merchants will dispute payouts.
CREATE TABLE commission_ledger (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id           CHAR(26)        NOT NULL,
  order_id            BIGINT UNSIGNED NOT NULL,
  order_item_id       BIGINT UNSIGNED NULL,
  supplier_tenant_id  BIGINT UNSIGNED NOT NULL,
  reseller_tenant_id  BIGINT UNSIGNED NULL,
  entry_type          VARCHAR(32)     NOT NULL,   -- SALE|COMMISSION|PLATFORM_FEE|REFUND_REVERSAL|ADJUSTMENT
  direction           VARCHAR(8)      NOT NULL,   -- DEBIT | CREDIT
  beneficiary_type    VARCHAR(32)     NOT NULL,   -- SUPPLIER|RESELLER|PLATFORM
  beneficiary_tenant_id BIGINT UNSIGNED NULL,
  gross_minor         BIGINT          NOT NULL,
  commission_minor    BIGINT          NOT NULL DEFAULT 0,
  platform_fee_minor  BIGINT          NOT NULL DEFAULT 0,
  tax_minor           BIGINT          NOT NULL DEFAULT 0,
  net_minor           BIGINT          NOT NULL,
  currency            CHAR(3)         NOT NULL,
  settlement_id       BIGINT UNSIGNED NULL,       -- NULL ⇒ unsettled
  reverses_entry_id   BIGINT UNSIGNED NULL,
  description         VARCHAR(500)    NULL,
  correlation_id      CHAR(26)        NULL,
  created_at          DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_commission_ledger_public_id (public_id),
  KEY idx_commission_ledger_beneficiary (beneficiary_tenant_id, settlement_id, created_at),
  KEY idx_commission_ledger_order (order_id),
  KEY idx_commission_ledger_unsettled (settlement_id, beneficiary_tenant_id),
  CONSTRAINT fk_commission_ledger_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE RESTRICT,
  CONSTRAINT chk_commission_ledger_direction CHECK (direction IN ('DEBIT','CREDIT'))
) ENGINE=InnoDB;

CREATE TABLE settlements (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id          CHAR(26)        NOT NULL,
  beneficiary_tenant_id BIGINT UNSIGNED NOT NULL,
  settlement_number  VARCHAR(64)     NOT NULL,
  period_start       DATE            NOT NULL,
  period_end         DATE            NOT NULL,
  status             VARCHAR(32)     NOT NULL DEFAULT 'DRAFT',
  gross_minor        BIGINT          NOT NULL DEFAULT 0,
  commission_minor   BIGINT          NOT NULL DEFAULT 0,
  platform_fee_minor BIGINT          NOT NULL DEFAULT 0,
  tax_minor          BIGINT          NOT NULL DEFAULT 0,
  adjustment_minor   BIGINT          NOT NULL DEFAULT 0,
  net_payable_minor  BIGINT          NOT NULL DEFAULT 0,
  currency           CHAR(3)         NOT NULL,
  entry_count        INT UNSIGNED    NOT NULL DEFAULT 0,
  payout_method      VARCHAR(32)     NULL,        -- BANK_TRANSFER | GATEWAY_PAYOUT
  payout_reference   VARCHAR(191)    NULL,
  paid_at            DATETIME(3)     NULL,
  report_url         VARCHAR(500)    NULL,
  approved_by        BIGINT UNSIGNED NULL,
  created_at         DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at         DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_settlements_number (settlement_number),
  UNIQUE KEY uq_settlements_period (beneficiary_tenant_id, period_start, period_end),
  KEY idx_settlements_status (status, period_end),
  CONSTRAINT fk_settlements_tenant FOREIGN KEY (beneficiary_tenant_id) REFERENCES tenants (id) ON DELETE RESTRICT,
  CONSTRAINT chk_settlements_status CHECK (status IN ('DRAFT','PENDING_APPROVAL','APPROVED','PROCESSING','PAID','FAILED','ON_HOLD'))
) ENGINE=InnoDB;
```

> `commission_ledger` and `settlements` are the two tables most likely to be scrutinized by a merchant, an auditor, or a lawyer. Both are append-only; `uq_settlements_period` prevents the same period from being paid out twice.

---

## 17. Sales channels

```sql
CREATE TABLE channels (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id          BIGINT UNSIGNED NOT NULL,
  store_id           BIGINT UNSIGNED NOT NULL,
  type               VARCHAR(32)     NOT NULL,   -- AMAZON|FLIPKART|EBAY|FACEBOOK|INSTAGRAM|WHATSAPP|GOOGLE
  name               VARCHAR(120)    NOT NULL,
  status             VARCHAR(32)     NOT NULL DEFAULT 'DISCONNECTED',
  credentials_encrypted VARBINARY(4096) NULL,    -- AES-256-GCM; OAuth tokens
  external_account_id VARCHAR(191)   NULL,
  marketplace_id     VARCHAR(64)     NULL,       -- e.g. Amazon region
  settings           JSON            NULL,       -- price rules, category map, inventory buffer
  inventory_buffer   INT UNSIGNED    NOT NULL DEFAULT 0,   -- oversell protection
  auto_publish       TINYINT(1)      NOT NULL DEFAULT 0,
  auto_import_orders TINYINT(1)      NOT NULL DEFAULT 1,
  last_sync_at       DATETIME(3)     NULL,
  last_order_cursor  VARCHAR(191)    NULL,
  last_error         VARCHAR(1000)   NULL,
  token_expires_at   DATETIME(3)     NULL,
  created_at         DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at         DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_channels_store_type (tenant_id, store_id, type),
  KEY idx_channels_sync (status, last_sync_at),
  KEY idx_channels_token_expiry (token_expires_at),
  CONSTRAINT fk_channels_store FOREIGN KEY (store_id) REFERENCES stores (id) ON DELETE CASCADE,
  CONSTRAINT chk_channels_status CHECK (status IN
    ('DISCONNECTED','CONNECTING','CONNECTED','ERROR','TOKEN_EXPIRED','SUSPENDED'))
) ENGINE=InnoDB;

CREATE TABLE channel_listings (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id          BIGINT UNSIGNED NOT NULL,
  channel_id         BIGINT UNSIGNED NOT NULL,
  product_id         BIGINT UNSIGNED NOT NULL,
  variant_id         BIGINT UNSIGNED NULL,
  external_listing_id VARCHAR(191)   NULL,
  external_sku       VARCHAR(191)    NULL,
  status             VARCHAR(32)     NOT NULL DEFAULT 'PENDING',
  channel_price_minor BIGINT         NULL,
  channel_title      VARCHAR(500)    NULL,
  category_mapping   VARCHAR(191)    NULL,
  last_published_at  DATETIME(3)     NULL,
  last_inventory_sync_at DATETIME(3) NULL,
  synced_quantity    INT             NULL,       -- what the channel believes; drift detection
  error_code         VARCHAR(64)     NULL,
  error_message      VARCHAR(1000)   NULL,
  created_at         DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at         DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_channel_listings (channel_id, product_id, (IFNULL(variant_id, 0))),
  KEY idx_channel_listings_external (channel_id, external_listing_id),
  KEY idx_channel_listings_status (tenant_id, channel_id, status),
  KEY idx_channel_listings_inventory_sync (channel_id, last_inventory_sync_at),
  CONSTRAINT fk_channel_listings_channel FOREIGN KEY (channel_id) REFERENCES channels (id) ON DELETE CASCADE,
  CONSTRAINT fk_channel_listings_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE,
  CONSTRAINT chk_channel_listings_status CHECK (status IN
    ('PENDING','PUBLISHING','LIVE','PAUSED','REJECTED','ERROR','DELISTED'))
) ENGINE=InnoDB;
```

Imported channel orders land in `orders` with `channel` + `channel_order_ref`; `uq_orders_channel_ref` makes re-importing the same external order a no-op, which matters because every marketplace API redelivers.

---

## 18. Notifications & support

```sql
CREATE TABLE notification_templates (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id     BIGINT UNSIGNED NULL,      -- NULL ⇒ platform default template
  code          VARCHAR(64)     NOT NULL,  -- ORDER_PLACED, SHIPMENT_DISPATCHED, LOW_STOCK…
  channel       VARCHAR(16)     NOT NULL,  -- EMAIL|SMS|WHATSAPP|PUSH|IN_APP
  locale        VARCHAR(10)     NOT NULL DEFAULT 'en',
  subject       VARCHAR(500)    NULL,
  body          MEDIUMTEXT      NOT NULL,  -- Handlebars
  provider_template_id VARCHAR(191) NULL,  -- DLT/WhatsApp pre-approved template id
  variables     JSON            NULL,
  is_active     TINYINT(1)      NOT NULL DEFAULT 1,
  created_at    DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at    DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_notif_templates (tenant_id, code, channel, locale),
  CONSTRAINT fk_notif_templates_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE notifications (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id     BIGINT UNSIGNED NULL,
  recipient_type VARCHAR(32)    NOT NULL,  -- USER|CUSTOMER|PLATFORM_ADMIN
  recipient_id  BIGINT UNSIGNED NULL,
  channel       VARCHAR(16)     NOT NULL,
  template_code VARCHAR(64)     NULL,
  title         VARCHAR(255)    NULL,
  body          TEXT            NULL,
  action_url    VARCHAR(500)    NULL,
  status        VARCHAR(32)     NOT NULL DEFAULT 'QUEUED',
  provider      VARCHAR(32)     NULL,
  provider_message_id VARCHAR(191) NULL,
  error_message VARCHAR(500)    NULL,
  attempts      TINYINT UNSIGNED NOT NULL DEFAULT 0,
  read_at       DATETIME(3)     NULL,
  sent_at       DATETIME(3)     NULL,
  delivered_at  DATETIME(3)     NULL,
  correlation_id CHAR(26)       NULL,
  created_at    DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_notifications_recipient (recipient_type, recipient_id, read_at, created_at),
  KEY idx_notifications_status (status, created_at),
  KEY idx_notifications_provider (provider, provider_message_id),
  CONSTRAINT chk_notifications_status CHECK (status IN
    ('QUEUED','SENDING','SENT','DELIVERED','READ','FAILED','BOUNCED','SUPPRESSED'))
) ENGINE=InnoDB;

CREATE TABLE support_tickets (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id     CHAR(26)        NOT NULL,
  ticket_number VARCHAR(32)     NOT NULL,
  tenant_id     BIGINT UNSIGNED NULL,
  requester_user_id BIGINT UNSIGNED NULL,
  subject       VARCHAR(255)    NOT NULL,
  category      VARCHAR(64)     NULL,      -- BILLING|TECHNICAL|DOMAIN|PAYMENT|SHIPPING|OTHER
  priority      VARCHAR(16)     NOT NULL DEFAULT 'NORMAL',
  status        VARCHAR(32)     NOT NULL DEFAULT 'OPEN',
  assigned_to   BIGINT UNSIGNED NULL,
  first_response_at DATETIME(3) NULL,      -- SLA measurement
  resolved_at   DATETIME(3)     NULL,
  closed_at     DATETIME(3)     NULL,
  sla_due_at    DATETIME(3)     NULL,
  satisfaction_rating TINYINT UNSIGNED NULL,
  created_at    DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at    DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_support_tickets_number (ticket_number),
  KEY idx_support_tickets_tenant (tenant_id, status, created_at),
  KEY idx_support_tickets_assignee (assigned_to, status),
  KEY idx_support_tickets_sla (status, sla_due_at),
  CONSTRAINT chk_support_tickets_status CHECK (status IN
    ('OPEN','PENDING_CUSTOMER','IN_PROGRESS','ESCALATED','RESOLVED','CLOSED'))
) ENGINE=InnoDB;

CREATE TABLE support_ticket_messages (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ticket_id    BIGINT UNSIGNED NOT NULL,
  author_type  VARCHAR(32)     NOT NULL,   -- REQUESTER | AGENT | SYSTEM
  author_id    BIGINT UNSIGNED NULL,
  body         MEDIUMTEXT      NOT NULL,
  attachments  JSON            NULL,
  is_internal_note TINYINT(1)  NOT NULL DEFAULT 0,   -- hidden from the merchant
  created_at   DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_ticket_messages_ticket (ticket_id, created_at),
  CONSTRAINT fk_ticket_messages_ticket FOREIGN KEY (ticket_id) REFERENCES support_tickets (id) ON DELETE CASCADE
) ENGINE=InnoDB;
```

---

## 19. Infrastructure tables

```sql
-- Transactional outbox (architecture §6). Written inside business transactions.
CREATE TABLE outbox_events (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_id       CHAR(26)        NOT NULL,
  tenant_id      BIGINT UNSIGNED NULL,
  aggregate_type VARCHAR(64)     NOT NULL,   -- Order | Payment | Product
  aggregate_id   BIGINT UNSIGNED NOT NULL,
  event_type     VARCHAR(120)    NOT NULL,   -- order.placed, payment.captured
  event_version  SMALLINT        NOT NULL DEFAULT 1,
  payload        JSON            NOT NULL,
  metadata       JSON            NULL,       -- correlationId, causationId, actor
  status         VARCHAR(16)     NOT NULL DEFAULT 'PENDING',
  attempts       TINYINT UNSIGNED NOT NULL DEFAULT 0,
  available_at   DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  dispatched_at  DATETIME(3)     NULL,
  last_error     VARCHAR(1000)   NULL,
  created_at     DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_outbox_event_id (event_id),
  -- The relay's only query: pending rows that are due, oldest first.
  KEY idx_outbox_dispatch (status, available_at, id),
  KEY idx_outbox_aggregate (aggregate_type, aggregate_id),
  CONSTRAINT chk_outbox_status CHECK (status IN ('PENDING','DISPATCHING','DISPATCHED','FAILED','DEAD'))
) ENGINE=InnoDB;

-- Consumer-side idempotency. At-least-once delivery makes this mandatory.
CREATE TABLE processed_events (
  consumer_name VARCHAR(120) NOT NULL,
  event_id      CHAR(26)     NOT NULL,
  processed_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  result        VARCHAR(32)  NOT NULL DEFAULT 'OK',
  PRIMARY KEY (consumer_name, event_id),
  KEY idx_processed_events_cleanup (processed_at)
) ENGINE=InnoDB;

CREATE TABLE audit_logs (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id     BIGINT UNSIGNED NULL,
  actor_type    VARCHAR(32)     NOT NULL,   -- USER|CUSTOMER|SYSTEM|PLATFORM_ADMIN|API_KEY
  actor_id      BIGINT UNSIGNED NULL,
  actor_email   VARCHAR(255)    NULL,       -- snapshot: actor may be deleted later
  action        VARCHAR(120)    NOT NULL,   -- product.updated, order.refunded, user.role_granted
  entity_type   VARCHAR(64)     NOT NULL,
  entity_id     BIGINT UNSIGNED NULL,
  before_state  JSON            NULL,
  after_state   JSON            NULL,
  changed_fields JSON           NULL,
  ip_address    VARBINARY(16)   NULL,
  user_agent    VARCHAR(500)    NULL,
  correlation_id CHAR(26)       NULL,
  severity      VARCHAR(16)     NOT NULL DEFAULT 'INFO',
  created_at    DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_audit_logs_tenant (tenant_id, created_at),
  KEY idx_audit_logs_entity (entity_type, entity_id, created_at),
  KEY idx_audit_logs_actor (actor_type, actor_id, created_at),
  KEY idx_audit_logs_action (action, created_at)
) ENGINE=InnoDB
  PARTITION BY RANGE (TO_DAYS(created_at)) (
    PARTITION p_2026_q1 VALUES LESS THAN (TO_DAYS('2026-04-01')),
    PARTITION p_2026_q2 VALUES LESS THAN (TO_DAYS('2026-07-01')),
    PARTITION p_2026_q3 VALUES LESS THAN (TO_DAYS('2026-10-01')),
    PARTITION p_2026_q4 VALUES LESS THAN (TO_DAYS('2027-01-01')),
    PARTITION p_max     VALUES LESS THAN MAXVALUE
  );

-- Deliberately NOT tenant-FK'd and NOT partitioned by tenant: audit rows must
-- survive tenant deletion for compliance. Quarterly partitions make retention
-- pruning a metadata-only DROP PARTITION instead of a multi-million-row DELETE.

CREATE TABLE api_keys (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id     BIGINT UNSIGNED NOT NULL,
  public_id     CHAR(26)        NOT NULL,
  name          VARCHAR(120)    NOT NULL,
  key_prefix    CHAR(12)        NOT NULL,   -- shown in UI for identification
  key_hash      CHAR(64)        NOT NULL,   -- SHA-256; plaintext shown once at creation
  scopes        JSON            NOT NULL,
  rate_limit_per_min INT UNSIGNED NOT NULL DEFAULT 60,
  allowed_ips   JSON            NULL,
  last_used_at  DATETIME(3)     NULL,
  expires_at    DATETIME(3)     NULL,
  revoked_at    DATETIME(3)     NULL,
  created_by    BIGINT UNSIGNED NULL,
  created_at    DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_api_keys_hash (key_hash),
  KEY idx_api_keys_tenant (tenant_id, revoked_at),
  CONSTRAINT fk_api_keys_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE webhook_endpoints (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id     BIGINT UNSIGNED NOT NULL,
  url           VARCHAR(1000)   NOT NULL,
  secret_encrypted VARBINARY(512) NOT NULL,
  events        JSON            NOT NULL,
  is_active     TINYINT(1)      NOT NULL DEFAULT 1,
  consecutive_failures SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  disabled_at   DATETIME(3)     NULL,       -- auto-disabled after N failures
  created_at    DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_webhook_endpoints_tenant (tenant_id, is_active),
  CONSTRAINT fk_webhook_endpoints_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE job_runs (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id     BIGINT UNSIGNED NULL,
  job_type      VARCHAR(64)     NOT NULL,   -- IMPORT_PRODUCTS|EXPORT_ORDERS|GENERATE_REPORT
  status        VARCHAR(32)     NOT NULL DEFAULT 'QUEUED',
  queue_job_id  VARCHAR(120)    NULL,
  input_params  JSON            NULL,
  total_rows    INT UNSIGNED    NULL,
  processed_rows INT UNSIGNED   NOT NULL DEFAULT 0,
  success_rows  INT UNSIGNED    NOT NULL DEFAULT 0,
  failed_rows   INT UNSIGNED    NOT NULL DEFAULT 0,
  error_report_url VARCHAR(500) NULL,       -- per-row errors: essential for bulk import UX
  output_url    VARCHAR(500)    NULL,
  error_message VARCHAR(1000)   NULL,
  started_at    DATETIME(3)     NULL,
  finished_at   DATETIME(3)     NULL,
  requested_by  BIGINT UNSIGNED NULL,
  correlation_id CHAR(26)       NULL,
  created_at    DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_job_runs_tenant (tenant_id, job_type, created_at),
  KEY idx_job_runs_status (status, created_at),
  CONSTRAINT chk_job_runs_status CHECK (status IN
    ('QUEUED','RUNNING','COMPLETED','COMPLETED_WITH_ERRORS','FAILED','CANCELLED'))
) ENGINE=InnoDB;

-- Pre-aggregated analytics. Dashboards must never scan the orders table.
CREATE TABLE daily_sales_rollup (
  tenant_id       BIGINT UNSIGNED NOT NULL,
  store_id        BIGINT UNSIGNED NOT NULL,
  date            DATE            NOT NULL,
  channel         VARCHAR(32)     NOT NULL DEFAULT 'ALL',
  orders_count    INT UNSIGNED    NOT NULL DEFAULT 0,
  items_count     INT UNSIGNED    NOT NULL DEFAULT 0,
  gross_minor     BIGINT          NOT NULL DEFAULT 0,
  discount_minor  BIGINT          NOT NULL DEFAULT 0,
  tax_minor       BIGINT          NOT NULL DEFAULT 0,
  shipping_minor  BIGINT          NOT NULL DEFAULT 0,
  refund_minor    BIGINT          NOT NULL DEFAULT 0,
  net_minor       BIGINT          NOT NULL DEFAULT 0,
  cogs_minor      BIGINT          NOT NULL DEFAULT 0,
  new_customers   INT UNSIGNED    NOT NULL DEFAULT 0,
  returning_customers INT UNSIGNED NOT NULL DEFAULT 0,
  cancelled_count INT UNSIGNED    NOT NULL DEFAULT 0,
  updated_at      DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (tenant_id, store_id, date, channel),
  KEY idx_daily_sales_date (date)
) ENGINE=InnoDB;
```

---

## 20. MongoDB — logs & analytics

Databases: `ems_logs`, `ems_analytics`. **Nothing in MongoDB is a source of truth** — it is all reconstructible or disposable, which is why `w:0` writes are acceptable.

### `api_logs`

```js
{
  _id: ObjectId,
  correlationId: "01J8X...",       // joins across every collection and MySQL
  tenantId: 1042,
  userId: 5591,
  userType: "TENANT",
  surface: "console",              // console | storefront | platform | webhook
  request: {
    method: "POST",
    url: "/api/v1/console/products",
    route: "/api/v1/console/products",   // pattern, not the resolved path → groupable
    query: {},
    params: {},
    headers: { /* redacted */ },
    body: { /* redacted + 8KB truncated */ },
    bodySize: 1284
  },
  response: { statusCode: 201, body: {...}, size: 512 },
  timing: { startedAt: ISODate, durationMs: 143, dbMs: 38, cacheMs: 2, externalMs: 0 },
  client: {
    ip: "203.0.113.9", browser: "Chrome", browserVersion: "141",
    os: "Windows", osVersion: "11", device: "desktop", isBot: false
  },
  error: null,
  createdAt: ISODate
}
```

```js
db.api_logs.createIndex({ createdAt: 1 }, { expireAfterSeconds: 2592000 })            // 30d TTL
db.api_logs.createIndex({ correlationId: 1 })
db.api_logs.createIndex({ tenantId: 1, createdAt: -1 })
db.api_logs.createIndex({ "response.statusCode": 1, createdAt: -1 })
db.api_logs.createIndex({ "request.route": 1, createdAt: -1 })
db.api_logs.createIndex({ "timing.durationMs": -1, createdAt: -1 })                   // slow-query hunting
```

### Other collections

| Collection | TTL | Key fields |
|---|---|---|
| `error_logs` | 90 d | `level`, `name`, `message`, `stack`, `fingerprint` (grouping hash), `context`, `tenantId`, `correlationId` |
| `auth_logs` | 365 d | `event` (LOGIN_SUCCESS / LOGIN_FAILED / OTP_SENT / MFA_CHALLENGE / TOKEN_REUSE_DETECTED / PASSWORD_RESET), `identifier`, `ip`, `geo`, `deviceFingerprint`, `riskScore` |
| `activity_logs` | 180 d | `actor`, `action`, `entity`, `diff`, `tenantId` — merchant-facing "who changed what" feed |
| `webhook_logs` | 30 d | `direction` (IN/OUT), `provider`, `event`, `signatureValid`, `attempt`, `statusCode`, `payload`, `responseBody` |
| `job_logs` | 30 d | `queue`, `jobId`, `jobName`, `attempt`, `durationMs`, `status`, `stack` |
| `third_party_logs` | 30 d | `provider`, `operation`, `endpoint`, `durationMs`, `statusCode`, `retryCount`, `rateLimitRemaining` |
| `storefront_events` | 90 d | `sessionId`, `event` (page_view / product_view / add_to_cart / checkout_step / purchase), `productId`, `value` — funnel analytics |
| `search_queries` | 90 d | `query`, `resultCount`, `clickedProductId` — powers zero-result reports and synonym tuning |

**Retention rationale.** `auth_logs` are kept 365 days because breach investigations look back months; `api_logs` only 30 because their volume dominates storage and their value decays in days. `error_logs.fingerprint` is a hash of `(name, normalized message, top 3 stack frames)` so 40 000 occurrences of one bug group into a single row in the admin UI instead of 40 000.

**Capped-collection alternative rejected**: TTL indexes give per-document age-based expiry, which is what "keep 30 days" actually means; capped collections evict by total size, so a traffic spike silently destroys the retention guarantee.

---

## 21. Redis keyspace

Prefix everything with the environment (`prod:`, `stg:`) so a misconfigured `REDIS_URL` cannot cross-contaminate.

| Pattern | Type | TTL | Purpose |
|---|---|---|---|
| `t:{tid}:ver:{ns}` | String (int) | ∞ | Cache version counter — `INCR` to invalidate a namespace |
| `t:{tid}:v{n}:products:list:{hash}` | String (JSON) | 300 s | Product listing page |
| `t:{tid}:v{n}:products:detail:{pid}` | String | 600 s | PDP payload |
| `t:{tid}:v{n}:categories:tree` | String | 3600 s | Category tree |
| `t:{tid}:v{n}:home` | String | 120 s | Homepage composition |
| `t:{tid}:v{n}:dashboard:{range}` | String | 60 s | Merchant dashboard stats |
| `t:{tid}:theme:active` | Hash | 3600 s | Published theme config |
| `domain:{host}` | Hash | 600 s | `{tenantId, storeId, status}` — read on every storefront request |
| `cart:{tid}:{cartId}` | Hash | 30 d | **Source of truth** for anonymous carts |
| `cart:idx:{tid}:{customerId}` | String | 30 d | Customer → cart id |
| `sess:{userId}:{jti}` | Hash | 30 d | Active session for the sessions-management UI |
| `jwt:deny:{jti}` | String | ≤10 m | Revoked access token (checked every request) |
| `otp:{purpose}:{identifier}` | Hash | 300 s | `{hash, attempts, sentAt}` — code is hashed, never plaintext |
| `otp:rl:{identifier}` | String | 3600 s | OTP send throttle |
| `rl:{scope}:{id}` | ZSet | window | Sliding-window rate limit (Lua) |
| `lock:{resource}` | String | 30 s | Distributed lock (`SET NX PX`, token-checked release) |
| `stampede:{key}` | String | 2 s | Cache-rebuild mutex |
| `inv:reserve:{variantId}` | String (int) | 900 s | Pre-checkout soft reservation |
| `bull:{queue}:*` | mixed | — | BullMQ internals |
| `metrics:{tid}:{metric}:{bucket}` | String (int) | 86400 s | Real-time counters flushed to MySQL |
| `feature:{tid}` | Hash | 300 s | Resolved plan entitlements |

**Eviction policy: `volatile-lru`, not `allkeys-lru`.** Under memory pressure, `allkeys-lru` would happily evict a live cart or an OTP — data with no other home. `volatile-lru` only evicts keys that carry a TTL, and every genuinely durable key we set is either persisted elsewhere or explicitly excluded from eviction. Carts get a long TTL and are additionally mirrored to MySQL for signed-in customers.

---

## 22. Performance & operations

### Read/write split
Reports, exports, and analytics run against a read replica via a `@ReadOnly()` decorator that swaps the connection. Anything post-write in the same request stays on the primary — replica lag would otherwise show a merchant a product they just created as missing.

### Growth expectations & mitigations

| Table | 3-year estimate | Mitigation |
|---|---|---|
| `api_logs` (Mongo) | ~5 B docs | 30-day TTL + sampling |
| `audit_logs` | ~500 M | Quarterly `RANGE` partitions, `DROP PARTITION` retention |
| `orders` / `order_items` | ~50 M / ~150 M | Covering indexes; archive `COMPLETED` orders > 3 y to cold storage |
| `inventory_movements` | ~300 M | Monthly partitions; roll up to daily balances after 90 d |
| `outbox_events` | high churn | Delete `DISPATCHED` rows older than 7 d (nightly, chunked) |
| `products` | ~10 M | `FULLTEXT` → OpenSearch at Phase 6 |

### Migration discipline
- TypeORM migrations only; **`synchronize: false` in every environment including local.** One accidental `synchronize: true` against a shared DB drops columns.
- Every migration has a tested `down()`.
- Expand/contract for breaking changes: add nullable column → backfill in batches → dual-write → switch reads → drop old column in a later release. Never in one deploy.
- `pt-online-schema-change` / `gh-ost` for tables above ~1 M rows so DDL does not lock writes.
- Migrations run as a Kubernetes `initContainer` job with an advisory lock, so N replicas rolling out cannot race.

### Backup & recovery
Automated snapshots daily + binlog for 5-minute PITR; **restore is rehearsed monthly** — an untested backup is a hypothesis, not a backup. Per-tenant logical export (`mysqldump --where="tenant_id=N"`) satisfies data-portability requests, which is a shared-schema obligation that database-per-tenant would have given for free.

---

**Next:** [03 — Folder Structure](./03-folder-structure.md) · [04 — API Conventions](./04-api-conventions.md) · [05 — Roadmap](./05-roadmap.md)
