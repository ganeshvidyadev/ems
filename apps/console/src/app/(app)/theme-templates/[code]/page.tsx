'use client';

import { THEME_CATEGORIES, type ThemeCategory } from '@ems/contracts';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Alert, Button, Card, CardBody, CardHeader, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { minorStringToRupees, rupeesToMinorString } from '@/lib/money';
import { usePlatformThemeTemplate, useUpdateThemeTemplate } from '@/lib/queries/platform-theme-templates';

export default function EditThemeTemplatePage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const template = usePlatformThemeTemplate(params.code);
  const updateTemplate = useUpdateThemeTemplate(params.code);

  const [name, setName] = useState('');
  const [category, setCategory] = useState<ThemeCategory>('general');
  const [description, setDescription] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [isPremium, setIsPremium] = useState(false);
  const [price, setPrice] = useState('0');
  const [minPlanCode, setMinPlanCode] = useState('');
  const [configJson, setConfigJson] = useState('');
  const [configError, setConfigError] = useState('');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!template.data || hydrated) return;
    setName(template.data.name);
    setCategory(template.data.category);
    setDescription(template.data.description ?? '');
    setPreviewUrl(template.data.previewUrl ?? '');
    setIsPremium(template.data.isPremium);
    setPrice(minorStringToRupees(template.data.priceMinor));
    setMinPlanCode(template.data.minPlanCode ?? '');
    setConfigJson(JSON.stringify(template.data.defaultConfig, null, 2));
    setHydrated(true);
  }, [template.data, hydrated]);

  if (template.isError) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <Alert variant="error">Could not load this template.</Alert>
      </main>
    );
  }
  if (!template.data || !hydrated) {
    return <main className="mx-auto max-w-2xl p-6 text-sm text-muted-foreground">Loading…</main>;
  }

  function submit() {
    let defaultConfig;
    try {
      defaultConfig = JSON.parse(configJson);
      setConfigError('');
    } catch {
      setConfigError('Default config must be valid JSON.');
      return;
    }

    updateTemplate.mutate(
      {
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
        <h1 className="text-2xl font-semibold tracking-tight">{template.data.name}</h1>
        <p className="text-sm text-muted-foreground">
          {template.data.code} · {template.data.usageCount} store{template.data.usageCount === 1 ? '' : 's'} using it
        </p>
      </div>

      <Card>
        <CardHeader title="Template details" />
        <CardBody className="space-y-4">
          {updateTemplate.isError && <Alert variant="error">Could not save these changes.</Alert>}

          <Field label="Name" htmlFor="name">
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>

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
            hint="Only affects future selections — existing stores keep the copy they already cloned."
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
            <Button loading={updateTemplate.isPending} onClick={submit}>
              Save changes
            </Button>
          </div>
        </CardBody>
      </Card>
    </main>
  );
}
