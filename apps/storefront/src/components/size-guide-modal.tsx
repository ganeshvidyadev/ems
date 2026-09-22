'use client';

import { useState } from 'react';
import { Ruler, X, Check, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui';

interface SizeGuideModalProps {
  productName?: string;
  category?: string;
}

export function SizeGuideModal({ productName, category }: SizeGuideModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [unit, setUnit] = useState<'cm' | 'in'>('cm');

  const CLOTHING_SIZES = [
    { size: 'XS', chestCm: '84-88', chestIn: '33-35', waistCm: '68-72', waistIn: '27-28', hipCm: '90-94', hipIn: '35-37' },
    { size: 'S', chestCm: '89-94', chestIn: '35-37', waistCm: '73-78', waistIn: '29-31', hipCm: '95-100', hipIn: '37-39' },
    { size: 'M', chestCm: '95-101', chestIn: '38-40', waistCm: '79-85', waistIn: '31-33', hipCm: '101-106', hipIn: '40-42' },
    { size: 'L', chestCm: '102-109', chestIn: '40-43', waistCm: '86-93', waistIn: '34-37', hipCm: '107-113', hipIn: '42-44' },
    { size: 'XL', chestCm: '110-117', chestIn: '43-46', waistCm: '94-102', waistIn: '37-40', hipCm: '114-121', hipIn: '45-48' },
    { size: 'XXL', chestCm: '118-126', chestIn: '46-50', waistCm: '103-112', waistIn: '40-44', hipCm: '122-130', hipIn: '48-51' },
  ];

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand hover:underline transition focus-visible:outline-none"
      >
        <Ruler className="h-3.5 w-3.5" />
        <span>Size & Dimension Guide</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div
            className="fixed inset-0"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />

          <div className="relative w-full max-w-2xl rounded-2xl border border-line bg-surface p-6 shadow-2xl z-10 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-line pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand/10 text-brand">
                    <Ruler className="h-4 w-4" />
                  </span>
                  <h3 className="font-heading text-lg font-bold text-ink">
                    Size & Fit Reference Guide
                  </h3>
                </div>
                <p className="mt-1 text-xs text-ink-muted">
                  Standard sizing specifications for {productName ?? 'this item'}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-lg p-1.5 text-ink-muted hover:bg-surface-alt hover:text-ink transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Unit Switcher */}
            <div className="my-5 flex items-center justify-between rounded-xl bg-surface-alt/60 p-3 border border-line/60">
              <span className="text-xs font-medium text-ink">Measurement Units</span>
              <div className="flex rounded-lg border border-line bg-surface p-0.5">
                <button
                  type="button"
                  onClick={() => setUnit('cm')}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition ${
                    unit === 'cm'
                      ? 'bg-brand text-brand-foreground shadow-xs'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  Centimeters (cm)
                </button>
                <button
                  type="button"
                  onClick={() => setUnit('in')}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition ${
                    unit === 'in'
                      ? 'bg-brand text-brand-foreground shadow-xs'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  Inches (in)
                </button>
              </div>
            </div>

            {/* Sizing Table */}
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-line bg-surface-alt font-semibold text-ink">
                  <tr>
                    <th className="py-2.5 px-3">Size</th>
                    <th className="py-2.5 px-3">Chest / Bust ({unit})</th>
                    <th className="py-2.5 px-3">Waist ({unit})</th>
                    <th className="py-2.5 px-3">Hips ({unit})</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {CLOTHING_SIZES.map((row) => (
                    <tr key={row.size} className="hover:bg-surface-alt/40 transition">
                      <td className="py-2.5 px-3 font-bold text-brand">{row.size}</td>
                      <td className="py-2.5 px-3 text-ink-muted">
                        {unit === 'cm' ? row.chestCm : row.chestIn}
                      </td>
                      <td className="py-2.5 px-3 text-ink-muted">
                        {unit === 'cm' ? row.waistCm : row.waistIn}
                      </td>
                      <td className="py-2.5 px-3 text-ink-muted">
                        {unit === 'cm' ? row.hipCm : row.hipIn}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Measuring Instructions */}
            <div className="mt-5 space-y-2.5 rounded-xl border border-line bg-surface-alt/40 p-4 text-xs">
              <h4 className="font-bold text-ink flex items-center gap-1.5">
                <HelpCircle className="h-4 w-4 text-brand" />
                How to Measure Correctly
              </h4>
              <ul className="space-y-1.5 text-ink-muted list-disc list-inside">
                <li><strong>Chest / Bust:</strong> Measure around the fullest part of your chest, keeping the tape horizontal.</li>
                <li><strong>Waist:</strong> Measure around the narrowest part of your waistline (typically where your body bends side to side).</li>
                <li><strong>Hips:</strong> Stand with feet together and measure around the fullest point of your hips.</li>
              </ul>
            </div>

            {/* Footer */}
            <div className="mt-6 flex justify-end">
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => setIsOpen(false)}
              >
                Got It, Thanks
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
