'use client';

import { THEME_CATEGORIES, type ThemeCategory } from '@ems/contracts';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert, Button, Card, CardBody, CardHeader, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { rupeesToMinorString } from '@/lib/money';
import { useCreateThemeTemplate } from '@/lib/queries/platform-theme-templates';

const DEFAULT_CONFIG_JSON = JSON.stringify({ colors: {}, typography: {}, sections: [] }, null, 2);

export default function NewThemeTemplatePage() {
  const router = useRouter();
  const createTemplate = useCreateThemeTemplate();

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState<ThemeCategory>('general');
  const [description, setDescription] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [isPremium, setIsPremium] = useState(false);
  const [price, setPrice] = useState('0');
  const [minPlanCode, setMinPlanCode] = useState('');
  const [configJson, setConfigJson] = useState(DEFAULT_CONFIG_JSON);
  const [configError, setConfigError] = useState('');

  const canSubmit = /^[a-z0-9-]{2,}$/.test(code) && name.trim().length >= 2;

  function submit() {
    let defaultConfig;
    try {
      defaultConfig = JSON.parse(configJson);
      setConfigError('');
    } catch {
      setConfigError('Default config must be valid JSON.');
      return;
    }

    createTemplate.mutate(
      {
        code,
        name: name.trim(),
        category,
        description: description.trim() || undefined,
        previewUrl: previewUrl.trim() || undefined,
        isPremium,
        priceMinor: isPremium ? rupeesToMinorString(price || '0') : '0',
        minPlanCode: isPremium ? minPlanCode.trim() || undefined : undefined,
        defaultConfig,
      },
      { onSuccess: () => router.push('/theme-templates') },
    );
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New theme template</h1>
        <p className="text-sm text-muted-foreground">Adds a design to the gallery merchants pick from.</p>
      </div>

      <Card>
        <CardHeader title="Template details" />
        <CardBody className="space-y-4">
          {createTemplate.isError && (
            <Alert variant="error">Could not create this template. Check the code isn&apos;t already used.</Alert>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Code" htmlFor="code" hint="Lowercase letters, digits and hyphens">
              <Input id="code" value={code} onChange={(e) => setCode(e.target.value.toLowerCase())} />
            </Field>
            <Field label="Name" htmlFor="name">
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
          </div>

          <Field label="Category" htmlFor="category">
            <Select id="category" value={category} onChange={(e) => setCategory(e.target.value as ThemeCategory)}>
              {THEME_CATEGORIES.map((c) => (
                <option key={c} value={c} className="capitalize">
                  {c}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Description" htmlFor="description" hint="Optional">
            <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>

          <Field label="Preview URL" htmlFor="previewUrl" hint="Optional">
            <Input id="previewUrl" value={previewUrl} onChange={(e) => setPreviewUrl(e.target.value)} />
          </Field>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4" checked={isPremium} onChange={(e) => setIsPremium(e.target.checked)} />
            Premium — has a price and can be gated to a minimum plan
          </label>

          {isPremium && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Price (₹)" htmlFor="price">
                <Input id="price" value={price} onChange={(e) => setPrice(e.target.value)} />
              </Field>
              <Field label="Minimum plan code" htmlFor="minPlanCode" hint="Optional — blank unlocks it on every plan">
                <Input id="minPlanCode" value={minPlanCode} onChange={(e) => setMinPlanCode(e.target.value)} />
              </Field>
            </div>
          )}

          <Field
            label="Default config (JSON)"
            htmlFor="configJson"
            hint="Cloned into a merchant's own draft the moment they select this template — editing it later never changes an existing store."
            error={configError}
          >
            <Textarea
              id="configJson"
              className="font-mono text-xs"
              rows={10}
              value={configJson}
              onChange={(e) => setConfigJson(e.target.value)}
            />
          </Field>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => router.push('/theme-templates')}>
              Cancel
            </Button>
            <Button loading={createTemplate.isPending} disabled={!canSubmit} onClick={submit}>
              Create template
            </Button>
          </div>
        </CardBody>
      </Card>
    </main>
  );
}
