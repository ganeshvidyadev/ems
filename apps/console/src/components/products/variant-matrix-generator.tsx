'use client';

import { useState, useMemo, useEffect } from 'react';
import { Plus, Trash2, Sparkles, RefreshCw, X, Check, Layers, AlertCircle } from 'lucide-react';
import { Badge, Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

export interface FormVariant {
  id?: string;
  sku: string;
  title?: string;
  barcode?: string;
  optionValues: Record<string, string>;
  price: string; // Rupees decimal string (e.g. "499.00")
  comparePrice?: string;
  isActive: boolean;
}

export interface OptionDefinition {
  name: string;
  values: string[];
}

interface VariantMatrixGeneratorProps {
  baseSku?: string;
  basePrice?: string;
  baseComparePrice?: string;
  initialVariants?: FormVariant[];
  disabled?: boolean;
  onChange: (variants: FormVariant[]) => void;
}

function sanitizeCode(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_');
}

function sanitizeSkuPart(text: string): string {
  return text
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

/** Computes the Cartesian product of an array of arrays */
function cartesianProduct<T>(arrays: T[][]): T[][] {
  return arrays.reduce<T[][]>(
    (acc, curr) => acc.flatMap((c) => curr.map((n) => [...c, n])),
    [[]],
  );
}

export function VariantMatrixGenerator({
  baseSku = 'SKU',
  basePrice = '0',
  baseComparePrice = '',
  initialVariants = [],
  disabled = false,
  onChange,
}: VariantMatrixGeneratorProps) {
  // Infer initial option definitions from initialVariants if available
  const [options, setOptions] = useState<OptionDefinition[]>(() => {
    if (initialVariants.length === 0) {
      return [
        { name: 'Size', values: ['S', 'M', 'L'] },
        { name: 'Color', values: ['Black', 'Blue'] },
      ];
    }
    const optionMap = new Map<string, Set<string>>();
    for (const v of initialVariants) {
      for (const [key, val] of Object.entries(v.optionValues)) {
        const normalizedKey = key.charAt(0).toUpperCase() + key.slice(1);
        if (!optionMap.has(normalizedKey)) {
          optionMap.set(normalizedKey, new Set());
        }
        optionMap.get(normalizedKey)!.add(val);
      }
    }
    return Array.from(optionMap.entries()).map(([name, set]) => ({
      name,
      values: Array.from(set),
    }));
  });

  const [tagInputs, setTagInputs] = useState<Record<number, string>>({});
  const [variants, setVariants] = useState<FormVariant[]>(initialVariants);
  const [bulkPrice, setBulkPrice] = useState('');
  const [bulkComparePrice, setBulkComparePrice] = useState('');

  // Synchronize initial variants when parent updates (e.g. on edit page load)
  useEffect(() => {
    if (initialVariants.length > 0 && variants.length === 0) {
      setVariants(initialVariants);
    }
  }, [initialVariants]);

  // Notify parent on variant changes
  function updateVariants(next: FormVariant[]) {
    setVariants(next);
    onChange(next);
  }

  // --- Option Management ---
  function addOption() {
    setOptions([...options, { name: '', values: [] }]);
  }

  function removeOption(index: number) {
    const next = options.filter((_, i) => i !== index);
    setOptions(next);
  }

  function updateOptionName(index: number, name: string) {
    const opt = options[index];
    if (!opt) return;
    const next = [...options];
    next[index] = { name, values: opt.values };
    setOptions(next);
  }

  function addTag(index: number, value: string) {
    const val = value.trim();
    if (!val) return;
    const opt = options[index];
    if (!opt) return;
    if (!opt.values.includes(val)) {
      const next = [...options];
      next[index] = { name: opt.name, values: [...opt.values, val] };
      setOptions(next);
    }
    setTagInputs({ ...tagInputs, [index]: '' });
  }

  function removeTag(optionIndex: number, tagIndex: number) {
    const opt = options[optionIndex];
    if (!opt) return;
    const next = [...options];
    next[optionIndex] = {
      name: opt.name,
      values: opt.values.filter((_, i) => i !== tagIndex),
    };
    setOptions(next);
  }

  // --- Matrix Generation ---
  function generateMatrix() {
    const validOptions = options.filter(
      (opt) => opt.name.trim().length > 0 && opt.values.length > 0,
    );

    if (validOptions.length === 0) return;

    // Create value tuples for Cartesian product
    const optionAxes = validOptions.map((opt) =>
      opt.values.map((v) => ({ code: sanitizeCode(opt.name), name: opt.name, value: v })),
    );

    const combinations = cartesianProduct(optionAxes);

    // Existing variants map by option signature for preserving edits
    const existingMap = new Map<string, FormVariant>();
    for (const v of variants) {
      const sig = Object.entries(v.optionValues)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, val]) => `${k}:${val}`)
        .join('|');
      existingMap.set(sig, v);
    }

    const prefix = baseSku.trim() ? sanitizeSkuPart(baseSku) : 'PROD';

    const nextVariants: FormVariant[] = combinations.map((comb) => {
      const optionValues: Record<string, string> = {};
      const titleParts: string[] = [];
      const skuParts: string[] = [];

      for (const item of comb) {
        optionValues[item.code] = item.value;
        titleParts.push(item.value);
        skuParts.push(sanitizeSkuPart(item.value));
      }

      const sig = Object.entries(optionValues)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, val]) => `${k}:${val}`)
        .join('|');

      const existing = existingMap.get(sig);
      if (existing) {
        return existing;
      }

      const generatedSku = `${prefix}-${skuParts.join('-')}`;
      return {
        sku: generatedSku,
        title: titleParts.join(' / '),
        optionValues,
        price: basePrice || '0',
        comparePrice: baseComparePrice || undefined,
        isActive: true,
      };
    });

    updateVariants(nextVariants);
  }

  // --- Variant Table Editing ---
  function updateVariantField<K extends keyof FormVariant>(
    index: number,
    field: K,
    val: FormVariant[K],
  ) {
    const target = variants[index];
    if (!target) return;
    const next = [...variants];
    next[index] = { ...target, [field]: val };
    updateVariants(next);
  }

  function removeVariant(index: number) {
    const next = variants.filter((_, i) => i !== index);
    updateVariants(next);
  }

  function addManualVariant() {
    const defaultOptionValues: Record<string, string> = {};
    for (const opt of options) {
      if (opt.name.trim()) {
        defaultOptionValues[sanitizeCode(opt.name)] = opt.values[0] || 'Default';
      }
    }
    const next: FormVariant = {
      sku: `${baseSku || 'SKU'}-CUSTOM-${Date.now().toString().slice(-4)}`,
      title: Object.values(defaultOptionValues).join(' / ') || 'Custom Variant',
      optionValues: defaultOptionValues,
      price: basePrice || '0',
      comparePrice: baseComparePrice || undefined,
      isActive: true,
    };
    updateVariants([...variants, next]);
  }

  // --- Bulk Actions ---
  function applyBulkPrice() {
    if (!bulkPrice) return;
    const next = variants.map((v) => ({ ...v, price: bulkPrice }));
    updateVariants(next);
  }

  function applyBulkComparePrice() {
    const next = variants.map((v) => ({ ...v, comparePrice: bulkComparePrice || undefined }));
    updateVariants(next);
  }

  function regenerateAllSkus() {
    const prefix = baseSku.trim() ? sanitizeSkuPart(baseSku) : 'PROD';
    const next = variants.map((v) => {
      const parts = Object.values(v.optionValues).map((val) => sanitizeSkuPart(val));
      return {
        ...v,
        sku: `${prefix}-${parts.join('-')}`,
      };
    });
    updateVariants(next);
  }

  function toggleAllActive() {
    const allActive = variants.every((v) => v.isActive);
    const next = variants.map((v) => ({ ...v, isActive: !allActive }));
    updateVariants(next);
  }

  const combinationCount = useMemo(() => {
    const valid = options.filter((o) => o.name.trim().length > 0 && o.values.length > 0);
    if (valid.length === 0) return 0;
    return valid.reduce((acc, curr) => acc * curr.values.length, 1);
  }, [options]);

  return (
    <div className="space-y-6">
      {/* 1. Attribute & Options Definition Section */}
      <div className="rounded-lg border border-border/80 bg-card p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
          <div>
            <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
              <Layers className="size-4 text-primary" />
              Variant Options & Attributes
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Define option axes (e.g. Size, Color) and enter their values to generate the product matrix.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={addOption}
            className="gap-1.5"
          >
            <Plus className="size-3.5" />
            Add Option
          </Button>
        </div>

        <div className="space-y-4">
          {options.map((opt, optIndex) => (
            <div
              key={optIndex}
              className="p-4 rounded-md border border-border/60 bg-muted/20 space-y-3"
            >
              <div className="flex items-center gap-3">
                <div className="w-48 shrink-0">
                  <Input
                    placeholder="Option Name (e.g. Size)"
                    value={opt.name}
                    disabled={disabled}
                    onChange={(e) => updateOptionName(optIndex, e.target.value)}
                    className="h-9 text-sm font-medium"
                  />
                </div>
                <span className="text-xs text-muted-foreground">Values:</span>
                <div className="flex-1 flex flex-wrap items-center gap-1.5 min-h-9 p-1 rounded-md border border-input bg-background">
                  {opt.values.map((val, tagIndex) => (
                    <span
                      key={tagIndex}
                      className="inline-flex items-center gap-1 rounded bg-primary/10 text-primary px-2 py-0.5 text-xs font-semibold"
                    >
                      {val}
                      {!disabled && (
                        <button
                          type="button"
                          onClick={() => removeTag(optIndex, tagIndex)}
                          className="hover:text-destructive focus:outline-none"
                        >
                          <X className="size-3" />
                        </button>
                      )}
                    </span>
                  ))}
                  <input
                    type="text"
                    placeholder={opt.values.length === 0 ? 'Type value & press Enter…' : 'Add more…'}
                    value={tagInputs[optIndex] || ''}
                    disabled={disabled}
                    onChange={(e) =>
                      setTagInputs({ ...tagInputs, [optIndex]: e.target.value })
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault();
                        addTag(optIndex, tagInputs[optIndex] || '');
                      }
                    }}
                    className="flex-1 min-w-[120px] bg-transparent text-xs px-1 py-0.5 focus:outline-none placeholder:text-muted-foreground"
                  />
                  {tagInputs[optIndex]?.trim() && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => addTag(optIndex, tagInputs[optIndex] || '')}
                      className="h-6 px-1.5 text-xs text-primary"
                    >
                      Add
                    </Button>
                  )}
                </div>
                {options.length > 1 && !disabled && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => removeOption(optIndex)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Generate Matrix CTA */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="text-xs text-muted-foreground">
            Combinations expected:{' '}
            <strong className="text-foreground font-semibold">{combinationCount}</strong> variants
            {combinationCount > 0 && ` (${options.filter((o) => o.name.trim()).map((o) => `${o.values.length} ${o.name}`).join(' × ')})`}
          </div>
          <Button
            type="button"
            variant="default"
            disabled={disabled || combinationCount === 0}
            onClick={generateMatrix}
            className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
          >
            <Sparkles className="size-4" />
            Generate Variants Matrix ({combinationCount})
          </Button>
        </div>
      </div>

      {/* 2. Variants Table & Bulk Actions Section */}
      <div className="rounded-lg border border-border/80 bg-card p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
          <div>
            <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
              Generated Variants ({variants.length})
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Configure individual SKUs, prices, compare-at prices, and active status for each variant.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={addManualVariant}
              className="gap-1.5"
            >
              <Plus className="size-3.5" />
              Add Custom Row
            </Button>
          </div>
        </div>

        {/* Bulk Actions Toolbar */}
        {variants.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 p-3 rounded-md bg-muted/40 border border-border/40 text-xs">
            <span className="font-semibold text-muted-foreground uppercase tracking-wider">Bulk Actions:</span>
            
            {/* Bulk Price */}
            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                step="0.01"
                placeholder="₹ Price"
                value={bulkPrice}
                disabled={disabled}
                onChange={(e) => setBulkPrice(e.target.value)}
                className="h-8 w-24 text-xs"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled || !bulkPrice}
                onClick={applyBulkPrice}
                className="h-8 px-2 text-xs"
              >
                Apply Price
              </Button>
            </div>

            {/* Bulk Compare Price */}
            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                step="0.01"
                placeholder="₹ Compare"
                value={bulkComparePrice}
                disabled={disabled}
                onChange={(e) => setBulkComparePrice(e.target.value)}
                className="h-8 w-24 text-xs"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled || !bulkComparePrice}
                onClick={applyBulkComparePrice}
                className="h-8 px-2 text-xs"
              >
                Apply Compare
              </Button>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={regenerateAllSkus}
              className="h-8 px-2 text-xs gap-1.5"
            >
              <RefreshCw className="size-3" />
              Regenerate SKUs
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={toggleAllActive}
              className="h-8 px-2 text-xs"
            >
              Toggle All Active
            </Button>
          </div>
        )}

        {/* Variants Matrix Table */}
        {variants.length === 0 ? (
          <div className="py-10 text-center text-muted-foreground text-sm space-y-2">
            <AlertCircle className="size-8 mx-auto text-muted-foreground/60" />
            <p>No variants generated yet.</p>
            <p className="text-xs">
              Define your options above and click <strong>"Generate Variants Matrix"</strong> to populate this table.
            </p>
          </div>
        ) : (
          <div className="rounded-md border border-border/80 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-48">Variant / Options</TableHead>
                  <TableHead className="w-48">SKU</TableHead>
                  <TableHead className="w-32">Price (₹)</TableHead>
                  <TableHead className="w-32">Compare Price (₹)</TableHead>
                  <TableHead className="w-36">Barcode</TableHead>
                  <TableHead className="w-20 text-center">Active</TableHead>
                  {!disabled && <TableHead className="w-16 text-right">Action</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {variants.map((variant, index) => (
                  <TableRow key={variant.id || index}>
                    {/* Option Values */}
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium text-xs text-foreground">
                          {variant.title || Object.values(variant.optionValues).join(' / ')}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(variant.optionValues).map(([key, val]) => (
                            <Badge key={key} variant="outline" className="text-[10px] px-1.5 py-0">
                              {key}: {val}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </TableCell>

                    {/* SKU */}
                    <TableCell>
                      <Input
                        value={variant.sku}
                        disabled={disabled}
                        onChange={(e) => updateVariantField(index, 'sku', e.target.value)}
                        className="h-8 text-xs font-mono"
                      />
                    </TableCell>

                    {/* Price */}
                    <TableCell>
                      <Input
                        type="number"
                        step="0.01"
                        value={variant.price}
                        disabled={disabled}
                        onChange={(e) => updateVariantField(index, 'price', e.target.value)}
                        className="h-8 text-xs tabular"
                      />
                    </TableCell>

                    {/* Compare Price */}
                    <TableCell>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Optional"
                        value={variant.comparePrice || ''}
                        disabled={disabled}
                        onChange={(e) =>
                          updateVariantField(index, 'comparePrice', e.target.value || undefined)
                        }
                        className="h-8 text-xs tabular"
                      />
                    </TableCell>

                    {/* Barcode */}
                    <TableCell>
                      <Input
                        placeholder="Optional"
                        value={variant.barcode || ''}
                        disabled={disabled}
                        onChange={(e) =>
                          updateVariantField(index, 'barcode', e.target.value || undefined)
                        }
                        className="h-8 text-xs font-mono"
                      />
                    </TableCell>

                    {/* Active */}
                    <TableCell className="text-center">
                      <input
                        type="checkbox"
                        checked={variant.isActive}
                        disabled={disabled}
                        onChange={(e) => updateVariantField(index, 'isActive', e.target.checked)}
                        className="size-4 rounded border-input text-primary focus:ring-primary"
                      />
                    </TableCell>

                    {/* Delete Action */}
                    {!disabled && (
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => removeVariant(index)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
