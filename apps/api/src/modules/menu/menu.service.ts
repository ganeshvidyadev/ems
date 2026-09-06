import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import type {
  CreateMenuItemRequest,
  CreateMenuRequest,
  MenuItemResponse,
  MenuResponse,
  UpdateMenuItemRequest,
} from '@ems/contracts';
import { ConflictError, NotFoundError } from '@ems/kernel';
import { RequestContextService } from '../../common/services/request-context.service';
import type { MenuEntity, MenuItemEntity, MenuItemLinkType } from '../../database/entities';
import { MenuItemRepository, MenuRepository } from './menu.repository';

/** Link types resolved against another tenant-owned table's `public_id` rather than a raw URL. */
const REFERENCE_TABLES: Partial<Record<MenuItemLinkType, string>> = {
  CATEGORY: 'categories',
  PRODUCT: 'products',
  PAGE: 'cms_pages',
  BLOG: 'blog_posts',
};

@Injectable()
export class MenuService {
  constructor(
    @InjectEntityManager() private readonly manager: EntityManager,
    private readonly menus: MenuRepository,
    private readonly items: MenuItemRepository,
    private readonly context: RequestContextService,
  ) {}

  async getOrCreate(storePublicId: string | undefined, code: string, name: string): Promise<MenuEntity> {
    const storeId = storePublicId ? await this.mustResolveStore(storePublicId) : await this.mustDefaultStore();
    const existing = await this.menus.findByCode(storeId, code);
    if (existing) return existing;
    return this.menus.insert({ storeId, code, name });
  }

  async getByCode(storePublicId: string, code: string): Promise<MenuEntity> {
    const storeId = await this.mustResolveStore(storePublicId);
    const menu = await this.menus.findByCode(storeId, code);
    if (!menu) throw new NotFoundError('Menu', code);
    return menu;
  }

  async addItem(menuId: string, input: CreateMenuItemRequest): Promise<MenuItemEntity> {
    const { linkTarget, referenceId } = await this.resolveLink(input.linkType, input.linkTarget);

    return this.items.insert({
      menuId,
      parentId: input.parentId ?? null,
      label: input.label,
      linkType: input.linkType,
      linkTarget,
      referenceId,
      icon: input.icon ?? null,
      openInNewTab: input.openInNewTab,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
    });
  }

  async updateItem(itemId: string, input: UpdateMenuItemRequest): Promise<MenuItemEntity> {
    const item = await this.items.findOneOrFail({ where: { id: itemId } as never });

    const linkType = input.linkType ?? item.linkType;
    const resolved =
      input.linkType || input.linkTarget !== undefined
        ? await this.resolveLink(linkType, input.linkTarget)
        : { linkTarget: item.linkTarget, referenceId: item.referenceId };

    Object.assign(item, {
      parentId: input.parentId ?? item.parentId,
      label: input.label ?? item.label,
      linkType,
      linkTarget: resolved.linkTarget,
      referenceId: resolved.referenceId,
      icon: input.icon ?? item.icon,
      openInNewTab: input.openInNewTab ?? item.openInNewTab,
      sortOrder: input.sortOrder ?? item.sortOrder,
      isActive: input.isActive ?? item.isActive,
    });

    await this.items.save(item);
    return item;
  }

  async removeItem(itemId: string): Promise<void> {
    await this.items.hardDelete({ id: itemId } as never);
  }

  async reorder(menuId: string, parentId: string | null, orderedIds: string[]): Promise<void> {
    for (const [index, itemId] of orderedIds.entries()) {
      const item = await this.items.findOneOrFail({ where: { id: itemId } as never });
      if (item.menuId !== menuId) continue;
      item.parentId = parentId;
      item.sortOrder = index;
      await this.items.save(item);
    }
  }

  /**
   * Resolves a `CATEGORY`/`PRODUCT`/`PAGE`/`BLOG` target's public id to the
   * internal id `menu_items.reference_id` stores. `URL` and `COLLECTION`
   * (no backing table exists for the latter yet) pass the value through as a
   * raw `link_target` instead.
   */
  private async resolveLink(
    linkType: MenuItemLinkType,
    linkTarget: string | undefined,
  ): Promise<{ linkTarget: string | null; referenceId: string | null }> {
    const table = REFERENCE_TABLES[linkType];
    if (!table || !linkTarget) {
      return { linkTarget: linkTarget ?? null, referenceId: null };
    }

    const tenantId = this.context.requireTenantId('menu link resolution');
    const rows = (await this.manager.query(
      `SELECT id FROM \`${table}\` WHERE public_id = ? AND tenant_id = ? LIMIT 1`,
      [linkTarget, tenantId],
    )) as { id: string }[];

    if (!rows[0]) throw new ConflictError(`${linkType.toLowerCase()} '${linkTarget}' not found`);
    return { linkTarget: null, referenceId: rows[0].id };
  }

  async toResponse(menu: MenuEntity): Promise<MenuResponse> {
    const items = await this.items.findByMenu(menu.id);
    const storeId = await this.menus.storePublicId(menu.storeId);

    return {
      id: menu.id,
      storeId: storeId ?? menu.storeId,
      code: menu.code,
      name: menu.name,
      items: buildTree(items, null),
    };
  }

  private async mustResolveStore(storePublicId: string): Promise<string> {
    const storeId = await this.menus.resolveStoreId(storePublicId);
    if (!storeId) throw new ConflictError(`Store '${storePublicId}' not found`);
    return storeId;
  }

  private async mustDefaultStore(): Promise<string> {
    const storeId = await this.menus.defaultStoreId();
    if (!storeId) throw new ConflictError('This tenant has no store to attach the menu to');
    return storeId;
  }
}

function buildTree(items: MenuItemEntity[], parentId: string | null): MenuItemResponse[] {
  return items
    .filter((item) => item.parentId === parentId)
    .map((item) => ({
      id: item.id,
      parentId: item.parentId,
      label: item.label,
      linkType: item.linkType,
      linkTarget: item.linkTarget,
      icon: item.icon,
      openInNewTab: item.openInNewTab,
      sortOrder: item.sortOrder,
      isActive: item.isActive,
      children: buildTree(items, item.id),
    }));
}
