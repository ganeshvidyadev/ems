import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import type { SearchInput, SearchPort, SearchResult } from './search.port';

/**
 * `MATCH ... AGAINST` over `ft_products_search (name, short_description, meta_keywords)`,
 * scoped by the same predicates as `idx_products_listing` so search results respect
 * status/visibility/live the same way a plain listing does.
 */
@Injectable()
export class MysqlFulltextAdapter implements SearchPort {
  constructor(@InjectEntityManager() private readonly manager: EntityManager) {}

  async search(input: SearchInput): Promise<SearchResult> {
    const params: unknown[] = [input.query, input.tenantId];
    let storeClause = '';
    if (input.storeId) {
      storeClause = 'AND store_id = ?';
      params.push(input.storeId);
    }

    const countRows = (await this.manager.query(
      `SELECT COUNT(*) AS total
         FROM products
        WHERE tenant_id = ?
          AND deleted_at IS NULL
          AND status = 'ACTIVE'
          AND visibility IN ('VISIBLE', 'SEARCH_ONLY')
          ${storeClause}
          AND MATCH(name, short_description, meta_keywords) AGAINST (? IN NATURAL LANGUAGE MODE)`,
      [...params.slice(1), input.query],
    )) as { total: number | string }[];

    const rows = (await this.manager.query(
      `SELECT id,
              MATCH(name, short_description, meta_keywords) AGAINST (? IN NATURAL LANGUAGE MODE) AS relevance
         FROM products
        WHERE tenant_id = ?
          AND deleted_at IS NULL
          AND status = 'ACTIVE'
          AND visibility IN ('VISIBLE', 'SEARCH_ONLY')
          ${storeClause}
          AND MATCH(name, short_description, meta_keywords) AGAINST (? IN NATURAL LANGUAGE MODE)
        ORDER BY relevance DESC
        LIMIT ? OFFSET ?`,
      [input.query, ...params.slice(1), input.query, input.take, input.skip],
    )) as { id: string }[];

    return { ids: rows.map((row) => row.id), total: Number(countRows[0]?.total ?? 0) };
  }
}
