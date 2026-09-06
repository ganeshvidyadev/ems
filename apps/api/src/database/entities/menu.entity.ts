import { Column, Entity } from 'typeorm';
import { BOOLEAN_COLUMN, DATETIME3, NumericIdEntity } from './base.entity';
import { TenantScoped } from '../../common/decorators/tenant-scoped.decorator';

/** No `public_id`: a menu is addressed by its `code` within a store, never by a bare id in a URL. */
@Entity('menus')
@TenantScoped()
export class MenuEntity extends NumericIdEntity {
  @Column({ name: 'tenant_id', type: 'bigint', unsigned: true })
  tenantId!: string;

  @Column({ name: 'store_id', type: 'bigint', unsigned: true })
  storeId!: string;

  /** e.g. `header`, `footer-1`, `mobile`. */
  @Column({ type: 'varchar', length: 64 })
  code!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ name: 'created_at', ...DATETIME3, default: () => 'CURRENT_TIMESTAMP(3)' })
  createdAt!: Date;
}

export const MENU_ITEM_LINK_TYPES = ['CATEGORY', 'PRODUCT', 'PAGE', 'BLOG', 'URL', 'COLLECTION'] as const;
export type MenuItemLinkType = (typeof MENU_ITEM_LINK_TYPES)[number];

@Entity('menu_items')
@TenantScoped()
export class MenuItemEntity extends NumericIdEntity {
  @Column({ name: 'tenant_id', type: 'bigint', unsigned: true })
  tenantId!: string;

  @Column({ name: 'menu_id', type: 'bigint', unsigned: true })
  menuId!: string;

  @Column({ name: 'parent_id', type: 'bigint', unsigned: true, nullable: true })
  parentId!: string | null;

  @Column({ type: 'varchar', length: 120 })
  label!: string;

  @Column({ name: 'link_type', type: 'varchar', length: 32 })
  linkType!: MenuItemLinkType;

  /** The raw URL for `linkType = 'URL'`; unused for reference-based link types. */
  @Column({ name: 'link_target', type: 'varchar', length: 500, nullable: true })
  linkTarget!: string | null;

  /** The linked row's internal id for `CATEGORY`/`PRODUCT`/`PAGE`/`BLOG`/`COLLECTION`. */
  @Column({ name: 'reference_id', type: 'bigint', unsigned: true, nullable: true })
  referenceId!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  icon!: string | null;

  @Column({ name: 'open_in_new_tab', ...BOOLEAN_COLUMN, default: 0 })
  openInNewTab!: boolean;

  @Column({ name: 'sort_order', type: 'smallint', default: 0 })
  sortOrder!: number;

  @Column({ name: 'is_active', ...BOOLEAN_COLUMN, default: 1 })
  isActive!: boolean;
}
