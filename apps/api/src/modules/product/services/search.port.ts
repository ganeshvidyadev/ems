/**
 * Product search, behind a port for the same reason `PaymentGatewayPort` and
 * `StoragePort` are: MySQL `FULLTEXT` is what backs this today, but the moment catalog
 * size or relevance needs outgrow it, the replacement (Elasticsearch, Meilisearch) should
 * be a new adapter, not a rewrite of every caller.
 */

export interface SearchInput {
  tenantId: string;
  storeId?: string;
  query: string;
  skip: number;
  take: number;
}

export interface SearchResult {
  /** Internal product ids, ranked by relevance — hydrate via `ProductRepository.findByIdsOrdered`. */
  ids: string[];
  total: number;
}

export interface SearchPort {
  search(input: SearchInput): Promise<SearchResult>;
}

export const SEARCH_PORT = Symbol('SEARCH_PORT');
