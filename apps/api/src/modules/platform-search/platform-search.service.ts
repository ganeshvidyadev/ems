import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { PlatformSearchResult } from '@ems/contracts';
import { PermissionResolverService } from '../auth/services/permission-resolver.service';

const RESULTS_PER_CATEGORY = 5;

/**
 * Global search across the entities that already have a real, bounded lookup —
 * see this session's own audit for why Stores/Orders/Settlements/Queue Jobs are
 * not here: none has a cross-tenant list endpoint to search over, and building one
 * per resource just to feed a search box is a much bigger change than this is.
 *
 * Every query is `LIKE '%term%' LIMIT 5` against an indexed-enough column set for
 * an admin tool's query volume — this is not a customer-facing search box that
 * needs a real search index.
 */
@Injectable()
export class PlatformSearchService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async search(q: string, permissions: readonly string[]): Promise<PlatformSearchResult[]> {
    const term = `%${q}%`;
    const tasks: Promise<PlatformSearchResult[]>[] = [];

    // Each category only runs if the caller actually holds the same permission its
    // own list page requires — a narrower platform role (PLATFORM_SUPPORT,
    // PLATFORM_BILLING) must not see results from a page it cannot open.
    if (PermissionResolverService.satisfies(permissions, 'platform.tenant:read')) {
      tasks.push(this.searchTenants(term));
    }
    if (PermissionResolverService.satisfies(permissions, 'platform.support:read')) {
      tasks.push(this.searchSupportTickets(term));
    }
    if (PermissionResolverService.satisfies(permissions, 'platform.billing:read')) {
      tasks.push(this.searchInvoices(term));
    }
    if (PermissionResolverService.satisfies(permissions, 'platform.user:read')) {
      tasks.push(this.searchPlatformStaff(term));
    }

    const results = await Promise.all(tasks);
    return results.flat();
  }

  private async searchTenants(term: string): Promise<PlatformSearchResult[]> {
    const rows = (await this.dataSource.query(
      `SELECT public_id AS id, business_name AS label, slug AS sublabel
         FROM tenants
        WHERE deleted_at IS NULL AND (business_name LIKE ? OR slug LIKE ?)
        LIMIT ${RESULTS_PER_CATEGORY}`,
      [term, term],
    )) as { id: string; label: string; sublabel: string }[];

    return rows.map((row) => ({
      category: 'tenant' as const,
      id: row.id,
      label: row.label,
      sublabel: row.sublabel,
      href: `/tenants/${row.id}`,
    }));
  }

  private async searchSupportTickets(term: string): Promise<PlatformSearchResult[]> {
    const rows = (await this.dataSource.query(
      `SELECT public_id AS id, ticket_number AS ticketNumber, subject
         FROM support_tickets
        WHERE subject LIKE ? OR ticket_number LIKE ?
        LIMIT ${RESULTS_PER_CATEGORY}`,
      [term, term],
    )) as { id: string; ticketNumber: string; subject: string }[];

    return rows.map((row) => ({
      category: 'supportTicket' as const,
      id: row.id,
      label: row.subject,
      sublabel: row.ticketNumber,
      href: `/support/${row.id}`,
    }));
  }

  private async searchInvoices(term: string): Promise<PlatformSearchResult[]> {
    const rows = (await this.dataSource.query(
      `SELECT si.public_id AS id, si.invoice_number AS invoiceNumber, t.business_name AS tenantName
         FROM subscription_invoices si
         JOIN tenants t ON t.id = si.tenant_id
        WHERE si.invoice_number LIKE ?
        LIMIT ${RESULTS_PER_CATEGORY}`,
      [term],
    )) as { id: string; invoiceNumber: string; tenantName: string }[];

    return rows.map((row) => ({
      category: 'invoice' as const,
      id: row.id,
      label: row.invoiceNumber,
      sublabel: row.tenantName,
      href: `/billing/${row.id}`,
    }));
  }

  private async searchPlatformStaff(term: string): Promise<PlatformSearchResult[]> {
    const rows = (await this.dataSource.query(
      `SELECT public_id AS id, first_name AS firstName, last_name AS lastName, email
         FROM users
        WHERE user_type = 'PLATFORM'
          AND (email LIKE ? OR first_name LIKE ? OR last_name LIKE ?)
        LIMIT ${RESULTS_PER_CATEGORY}`,
      [term, term, term],
    )) as { id: string; firstName: string; lastName: string | null; email: string }[];

    return rows.map((row) => ({
      category: 'platformStaff' as const,
      id: row.id,
      label: [row.firstName, row.lastName].filter(Boolean).join(' '),
      sublabel: row.email,
      href: `/platform-staff/${row.id}`,
    }));
  }
}
