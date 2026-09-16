'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPut } from '@/lib/api-client';
import { useAuth } from '@/hooks/use-auth';

interface Theme {
  code: string;
  name: string;
  description: string;
}
interface Company {
  id: string;
  name: string;
  slug: string;
  selectedTheme: string;
  allowedThemes: string[];
}
interface ThemeSettings {
  themes: Theme[];
  companies: Company[];
}

export default function CompanyThemesPage() {
  const { user } = useAuth();
  const allowed = user?.userType === 'PLATFORM' && user.roles.includes('PLATFORM_SUPER_ADMIN');
  const query = useQuery({
    queryKey: ['platform-themes'],
    queryFn: () => apiGet<ThemeSettings>('/platform/themes'),
    enabled: allowed,
  });
  if (!allowed)
    return (
      <main className="mx-auto max-w-5xl p-6">
        <h1 className="text-xl font-semibold">Company themes</h1>
        <p className="mt-4">Only the platform super admin can manage company themes.</p>
      </main>
    );
  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="text-2xl font-semibold">Company themes</h1>
      <p className="mt-2 text-muted-foreground">
        Choose which designs each company can use and which one shoppers see. Default is always
        available.
      </p>
      {query.isPending && (
        <p className="mt-6" role="status">
          Loading companies...
        </p>
      )}
      {query.isError && (
        <div className="mt-6" role="alert">
          <p>Could not load theme settings. {query.error.message}</p>
          <button className="mt-2 underline" onClick={() => query.refetch()}>
            Try again
          </button>
        </div>
      )}
      {query.data && (
        <>
          <div className="my-8 grid gap-4 sm:grid-cols-3">
            {query.data.themes.map((theme) => (
              <div key={theme.code} className="rounded-xl border bg-card p-5">
                <div
                  className="mb-4 h-3 rounded-full"
                  style={{
                    background:
                      theme.code === 'organic'
                        ? '#6bb252'
                        : theme.code === 'famms'
                          ? '#f7444e'
                          : '#334155',
                  }}
                />
                <h2 className="font-semibold">{theme.name}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{theme.description}</p>
              </div>
            ))}
          </div>
          <div className="space-y-5">
            {query.data.companies.map((company) => (
              <CompanyRow key={company.id} company={company} themes={query.data.themes} />
            ))}
          </div>
          {query.data.companies.length === 0 && <p>No companies have been created yet.</p>}
        </>
      )}
    </main>
  );
}

function CompanyRow({ company, themes }: { company: Company; themes: Theme[] }) {
  const client = useQueryClient();
  const [allowed, setAllowed] = useState(company.allowedThemes);
  const [selected, setSelected] = useState(company.selectedTheme);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const dirty =
    selected !== company.selectedTheme ||
    [...allowed].sort().join() !== [...company.allowedThemes].sort().join();
  function toggle(code: string) {
    setMessage('');
    setError('');
    const next = allowed.includes(code)
      ? allowed.filter((item) => item !== code)
      : [...allowed, code];
    setAllowed(next);
    if (!next.includes(selected)) setSelected('default');
  }
  async function save() {
    setSaving(true);
    setMessage('');
    setError('');
    try {
      await apiPut(`/platform/themes/${company.id}`, {
        selectedTheme: selected,
        allowedThemes: allowed,
      });
      client.setQueryData<ThemeSettings>(
        ['platform-themes'],
        (data) =>
          data && {
            ...data,
            companies: data.companies.map((item) =>
              item.id === company.id
                ? { ...item, selectedTheme: selected, allowedThemes: allowed }
                : item,
            ),
          },
      );
      setMessage('Saved. The selected design is live on the next storefront visit.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save theme settings.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="rounded-xl border bg-card p-5">
      <h2 className="text-lg font-semibold">{company.name}</h2>
      <p className="text-sm text-muted-foreground">{company.slug}</p>
      <fieldset disabled={saving} className="mt-5">
        <legend className="mb-2 text-sm font-medium">Allowed themes</legend>
        <div className="flex flex-wrap gap-5">
          {themes.map((theme) => (
            <label key={theme.code} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={allowed.includes(theme.code)}
                disabled={theme.code === 'default'}
                onChange={() => toggle(theme.code)}
              />
              {theme.name}
              {theme.code === 'default' && ' (always allowed)'}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="mt-5 flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-2 text-sm font-medium">
          Live theme
          <select
            className="min-w-48 rounded-md border bg-background p-2"
            disabled={saving}
            value={selected}
            onChange={(event) => {
              setSelected(event.target.value);
              setMessage('');
            }}
          >
            {themes
              .filter((theme) => allowed.includes(theme.code))
              .map((theme) => (
                <option key={theme.code} value={theme.code}>
                  {theme.name}
                </option>
              ))}
          </select>
        </label>
        <button
          disabled={saving || !dirty}
          onClick={save}
          className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save theme settings'}
        </button>
      </div>
      <p role="status" className="mt-3 text-sm">
        {message}
      </p>
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
