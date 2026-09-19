'use client';

import { useState, useRef, type ChangeEvent } from 'react';
import { Upload, FileSpreadsheet, Download, CheckCircle2, AlertCircle, AlertTriangle, Loader2 } from 'lucide-react';
import type { CreateProductRequest, ProductStatus, ProductType } from '@ems/contracts';
import { Button, Dialog, Badge, Alert, Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/primitives';
import { parseCsvText, downloadCsvFile, getSampleProductTemplateCsv } from '@/lib/csv-helper';
import { useCreateProduct } from '@/lib/queries/products';

interface ProductImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: string;
  onSuccess?: () => void;
}

interface RowValidation {
  rowNumber: number;
  data: Record<string, string>;
  isValid: boolean;
  errors: string[];
}

export function ProductImportModal({ open, onOpenChange, storeId, onSuccess }: ProductImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [validations, setValidations] = useState<RowValidation[]>([]);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [importSummary, setImportSummary] = useState<{ success: number; failed: number; errors: string[] } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const createProduct = useCreateProduct();

  function resetState() {
    setFile(null);
    setValidations([]);
    setGlobalError(null);
    setIsProcessing(false);
    setProgress(null);
    setImportSummary(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function handleClose(nextOpen: boolean) {
    if (!nextOpen && isProcessing) return; // prevent closing while importing
    if (!nextOpen) resetState();
    onOpenChange(nextOpen);
  }

  function onDownloadTemplate() {
    const csv = getSampleProductTemplateCsv();
    downloadCsvFile('ems_products_import_template.csv', csv);
  }

  function handleFileSelected(e: ChangeEvent<HTMLInputElement>) {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    resetState();
    setFile(selectedFile);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        if (!text) {
          setGlobalError('The selected file is empty.');
          return;
        }

        const parsed = parseCsvText(text);
        if (parsed.errors.length > 0) {
          setGlobalError(parsed.errors.join('; '));
          return;
        }

        if (parsed.rows.length === 0) {
          setGlobalError('No data rows found in the CSV file.');
          return;
        }

        // Validate each row
        const rowVal: RowValidation[] = parsed.rows.map((row, idx) => {
          const errors: string[] = [];
          const rowNumber = idx + 2; // +1 for header, +1 for 1-based index

          // 1. Name is required
          if (!row.name || row.name.trim().length === 0) {
            errors.push('Product name is required');
          }

          // 2. SKU is required
          if (!row.sku || row.sku.trim().length === 0) {
            errors.push('SKU is required');
          }

          // 3. Price validation
          const rawPrice = row.price ? row.price.replace(/[$,₹ ]/g, '') : '';
          const numPrice = parseFloat(rawPrice);
          if (isNaN(numPrice) || numPrice < 0) {
            errors.push('Price must be a valid positive number');
          }

          // 4. ComparePrice validation (if present)
          if (row.compareprice || row.compare_price) {
            const rawComp = (row.compareprice || row.compare_price || '').replace(/[$,₹ ]/g, '');
            const numComp = parseFloat(rawComp);
            if (isNaN(numComp) || numComp < 0) {
              errors.push('Compare Price must be a valid positive number');
            }
          }

          return {
            rowNumber,
            data: row,
            isValid: errors.length === 0,
            errors,
          };
        });

        setValidations(rowVal);
      } catch (err) {
        setGlobalError(err instanceof Error ? err.message : 'Failed to parse CSV file');
      }
    };
    reader.onerror = () => {
      setGlobalError('Failed to read the file.');
    };
    reader.readAsText(selectedFile);
  }

  async function startImport() {
    const validRows = validations.filter((v) => v.isValid);
    if (validRows.length === 0) {
      setGlobalError('No valid rows available to import.');
      return;
    }

    setIsProcessing(true);
    setProgress({ current: 0, total: validRows.length });
    const errors: string[] = [];
    let successCount = 0;

    for (let i = 0; i < validRows.length; i++) {
      const { rowNumber, data } = validRows[i]!;
      setProgress({ current: i + 1, total: validRows.length });

      try {
        const rawPrice = (data.price || '0').replace(/[$,₹ ]/g, '');
        const priceMinor = Math.round(parseFloat(rawPrice) * 100).toString();

        let comparePriceMinor: string | undefined;
        const rawComp = (data.compareprice || data.compare_price || '').replace(/[$,₹ ]/g, '');
        if (rawComp && !isNaN(parseFloat(rawComp))) {
          comparePriceMinor = Math.round(parseFloat(rawComp) * 100).toString();
        }

        const type = (data.type ? data.type.toUpperCase() : 'SIMPLE') as ProductType;
        const status = (data.status ? data.status.toUpperCase() : 'ACTIVE') as ProductStatus;

        const weightRaw = data.weightgrams || data.weight_grams;
        const weightGrams = weightRaw && !isNaN(parseInt(weightRaw, 10)) ? parseInt(weightRaw, 10) : undefined;

        const trackInventoryRaw = (data.trackinventory || data.track_inventory || 'true').toLowerCase();
        const trackInventory = trackInventoryRaw !== 'false' && trackInventoryRaw !== '0';

        const payload: CreateProductRequest = {
          storeId,
          name: (data.name || '').trim(),
          sku: (data.sku || '').trim(),
          type,
          status,
          visibility: 'VISIBLE',
          priceMinor,
          comparePriceMinor,
          currency: 'INR',
          shortDescription: data.shortdescription || data.short_description || undefined,
          barcode: data.barcode?.trim() || undefined,
          hsnCode: (data.hsncode || data.hsn_code)?.trim() || undefined,
          weightGrams,
          trackInventory,
          allowBackorder: false,
          requiresShipping: true,
          isFeatured: false,
          isShareable: false,
        };

        await createProduct.mutateAsync(payload);
        successCount++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        errors.push(`Row ${rowNumber} (${data.sku}): ${msg}`);
      }
    }

    setIsProcessing(false);
    setImportSummary({
      success: successCount,
      failed: errors.length,
      errors,
    });

    if (onSuccess && successCount > 0) {
      onSuccess();
    }
  }

  const validCount = validations.filter((v) => v.isValid).length;
  const invalidCount = validations.filter((v) => !v.isValid).length;

  return (
    <Dialog
      open={open}
      onOpenChange={handleClose}
      title="Bulk Import Products from CSV"
      description="Upload a CSV file with your product catalog to import or create products in bulk."
    >
      <div className="space-y-4 py-2">
        {/* Template Download Banner */}
        <div className="flex items-center justify-between rounded-lg border border-line bg-surface-alt p-3.5">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="h-8 w-8 text-primary shrink-0" />
            <div>
              <p className="text-sm font-medium text-ink">Need the standard import format?</p>
              <p className="text-xs text-ink-muted">Download our pre-formatted template with sample rows and headers.</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={onDownloadTemplate} className="gap-1.5 shrink-0">
            <Download className="h-3.5 w-3.5" />
            Download CSV Template
          </Button>
        </div>

        {/* Global Error Alert */}
        {globalError && (
          <Alert variant="error" className="text-xs">
            {globalError}
          </Alert>
        )}

        {/* File Dropzone / Uploader */}
        {!importSummary && (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-line p-6 hover:border-primary/50 cursor-pointer bg-surface hover:bg-surface-alt transition-colors"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileSelected}
              className="hidden"
            />
            <Upload className="h-9 w-9 text-ink-muted mb-2" />
            <p className="text-sm font-medium text-ink">
              {file ? file.name : 'Click to browse or drag and drop your CSV file'}
            </p>
            <p className="text-xs text-ink-muted mt-1">
              Supports .csv files up to 5MB (UTF-8 encoded)
            </p>
          </div>
        )}

        {/* Validation Overview */}
        {validations.length > 0 && !importSummary && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-ink">Parsed Rows: {validations.length}</span>
                <Badge variant={validCount > 0 ? 'success' : 'default'} className="text-[11px]">
                  {validCount} Valid
                </Badge>
                {invalidCount > 0 && (
                  <Badge variant="destructive" className="text-[11px]">
                    {invalidCount} Invalid
                  </Badge>
                )}
              </div>
              <span className="text-xs text-ink-muted">Showing preview of first 5 rows</span>
            </div>

            {/* Table Preview */}
            <div className="max-h-56 overflow-auto rounded-md border border-line">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12 text-xs">Row</TableHead>
                    <TableHead className="text-xs">Product Name</TableHead>
                    <TableHead className="text-xs">SKU</TableHead>
                    <TableHead className="text-xs">Price</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Validation</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {validations.slice(0, 5).map((v) => (
                    <TableRow key={v.rowNumber} className={v.isValid ? '' : 'bg-destructive/5'}>
                      <TableCell className="text-xs font-mono">{v.rowNumber}</TableCell>
                      <TableCell className="text-xs font-medium max-w-[180px] truncate">
                        {v.data.name || <span className="text-destructive">Missing</span>}
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        {v.data.sku || <span className="text-destructive">Missing</span>}
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        ₹{v.data.price || '0'}
                      </TableCell>
                      <TableCell className="text-xs">
                        <Badge variant={v.data.status?.toUpperCase() === 'ACTIVE' ? 'success' : 'default'} className="text-[10px]">
                          {v.data.status || 'ACTIVE'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {v.isValid ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                            <CheckCircle2 className="h-3 w-3" /> Ready
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-destructive font-medium" title={v.errors.join(', ')}>
                            <AlertCircle className="h-3 w-3" /> {v.errors[0]}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* Progress Bar while importing */}
        {isProcessing && progress && (
          <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-center justify-between text-xs font-medium text-primary">
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Importing products... ({progress.current} of {progress.total})
              </span>
              <span>{Math.round((progress.current / progress.total) * 100)}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-line">
              <div
                className="h-full bg-primary transition-all duration-200"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Success / Finished Summary */}
        {importSummary && (
          <div className="space-y-3">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
              <div className="flex items-center gap-2 font-semibold">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                Import Batch Completed!
              </div>
              <p className="mt-1 text-xs text-emerald-800">
                Successfully created <strong>{importSummary.success}</strong> products.
                {importSummary.failed > 0 && (
                  <span className="text-destructive font-semibold ml-1">
                    ({importSummary.failed} failed due to SKU conflicts or invalid data)
                  </span>
                )}
              </p>
            </div>

            {importSummary.errors.length > 0 && (
              <div className="max-h-36 overflow-auto rounded-md border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive space-y-1">
                <div className="font-semibold">Failed Rows:</div>
                {importSummary.errors.map((err, i) => (
                  <div key={i}>{err}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal Actions */}
      <div className="mt-4 flex items-center justify-end gap-2 border-t border-line pt-3">
        {importSummary ? (
          <Button onClick={() => handleClose(false)}>Done</Button>
        ) : (
          <>
            <Button variant="outline" onClick={() => handleClose(false)} disabled={isProcessing}>
              Cancel
            </Button>
            <Button
              onClick={startImport}
              disabled={validCount === 0 || isProcessing}
              className="gap-1.5"
            >
              {isProcessing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isProcessing ? 'Importing...' : `Import ${validCount} Product${validCount === 1 ? '' : 's'}`}
            </Button>
          </>
        )}
      </div>
    </Dialog>
  );
}
