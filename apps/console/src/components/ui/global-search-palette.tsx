'use client';

import type { PlatformSearchCategory } from '@ems/contracts';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { Dialog, Input } from './primitives';
import { useGlobalSearch } from '@/lib/queries/platform-search';

const CATEGORY_LABEL: Record<PlatformSearchCategory, string> = {
  tenant: 'Tenant',
  supportTicket: 'Support ticket',
  invoice: 'Invoice',
  platformStaff: 'Platform staff',
};

/**
 * Global search, reachable two ways: the topbar button, and Cmd/Ctrl+K from
 * anywhere in the Super Admin panel — both open the same dialog. Results are
 * whatever the API returns; this component does no permission filtering of its
 * own (the server already only searches categories the caller's own role can
 * read — see `PlatformSearchService.search()`).
 */
export function GlobalSearchPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 200);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const search = useGlobalSearch(debounced);

  function close() {
    setOpen(false);
    setQuery('');
    setDebounced('');
  }

  return (
    <>
      <button
        type="button"
        className="mantis-icon-button"
        aria-label="Search (Ctrl+K)"
        title="Search (Ctrl+K)"
        onClick={() => setOpen(true)}
      >
        <Search aria-hidden="true" />
      </button>
      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())} title="Search">
        <div className="space-y-3">
          <Input
            autoFocus
            placeholder="Search tenants, tickets, invoices, staff…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {debounced && search.data && search.data.results.length > 0 && (
            <ul className="max-h-80 space-y-1 overflow-y-auto">
              {search.data.results.map((result) => (
                <li key={`${result.category}-${result.id}`}>
                  <button
                    type="button"
                    onClick={() => {
                      close();
                      router.push(result.href);
                    }}
                    className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    <span>
                      <span className="font-medium">{result.label}</span>
                      {result.sublabel && <span className="ml-2 text-muted-foreground">{result.sublabel}</span>}
                    </span>
                    <span className="shrink-0 text-xs uppercase text-muted-foreground">
                      {CATEGORY_LABEL[result.category]}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {debounced && search.data && search.data.results.length === 0 && (
            <p className="text-sm text-muted-foreground">No results.</p>
          )}
        </div>
      </Dialog>
    </>
  );
}
