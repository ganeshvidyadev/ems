/**
 * CSV parsing and generation utilities for Console bulk import/export.
 */

export interface ParsedCsvResult {
  headers: string[];
  rows: Record<string, string>[];
  errors: string[];
}

/**
 * Parses a standard RFC 4180 CSV string into headers and row objects,
 * properly handling commas, quoted strings, escaped quotes (""), and newlines.
 */
export function parseCsvText(text: string): ParsedCsvResult {
  const result: ParsedCsvResult = { headers: [], rows: [], errors: [] };
  const lines: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      currentRow.push(currentField.trim());
      currentField = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++; // skip \n in \r\n
      }
      currentRow.push(currentField.trim());
      if (currentRow.some((field) => field.length > 0)) {
        lines.push(currentRow);
      }
      currentRow = [];
      currentField = '';
    } else {
      currentField += char;
    }
  }

  // Push any remaining field/row
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((field) => field.length > 0)) {
      lines.push(currentRow);
    }
  }

  if (lines.length === 0) {
    result.errors.push('The CSV file is empty.');
    return result;
  }

  const rawHeaders = lines[0];
  if (!rawHeaders || rawHeaders.length === 0) {
    result.errors.push('No headers found in the first row.');
    return result;
  }

  // Normalize headers (lowercase, trimmed, strip quotes)
  const headers = rawHeaders.map((h) => h.toLowerCase().replace(/[^a-z0-9_]/g, ''));
  result.headers = headers;

  for (let rowIndex = 1; rowIndex < lines.length; rowIndex++) {
    const line = lines[rowIndex]!;
    const rowObj: Record<string, string> = {};

    for (let colIndex = 0; colIndex < headers.length; colIndex++) {
      const header = headers[colIndex]!;
      rowObj[header] = line[colIndex] ?? '';
    }

    result.rows.push(rowObj);
  }

  return result;
}

/**
 * Generates an RFC 4180 compliant CSV string from headers and 2D row data.
 */
export function generateCsvText(
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][],
): string {
  function escapeField(field: unknown): string {
    if (field === null || field === undefined) return '""';
    const str = String(field);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return `"${str}"`;
  }

  const headerLine = headers.map(escapeField).join(',');
  const dataLines = rows.map((row) => row.map(escapeField).join(','));

  return [headerLine, ...dataLines].join('\r\n');
}

/**
 * Initiates an automatic browser download of a CSV file.
 */
export function downloadCsvFile(filename: string, csvContent: string): void {
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Initiates an automatic browser download of a JSON file.
 */
export function downloadJsonFile(filename: string, data: unknown): void {
  const jsonContent = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename.endsWith('.json') ? filename : `${filename}.json`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Returns a ready-to-use Sample Product Import CSV template with instructions.
 */
export function getSampleProductTemplateCsv(): string {
  const headers = [
    'name',
    'sku',
    'price',
    'comparePrice',
    'status',
    'type',
    'shortDescription',
    'barcode',
    'hsnCode',
    'weightGrams',
    'trackInventory',
  ];

  const sampleRows = [
    [
      'Premium Organic Honey (500g)',
      'HONEY-ORG-500',
      '499.00',
      '599.00',
      'ACTIVE',
      'SIMPLE',
      '100% Pure raw wild forest honey rich in antioxidants.',
      '8901234567890',
      '04090000',
      '550',
      'TRUE',
    ],
    [
      'Classic Cotton T-Shirt',
      'TSHIRT-COT-01',
      '799.00',
      '999.00',
      'ACTIVE',
      'SIMPLE',
      'Soft breathable 100% combed cotton crew neck tee.',
      '8901234567891',
      '61091000',
      '220',
      'TRUE',
    ],
    [
      'Stainless Steel Water Bottle (1L)',
      'BOTTLE-SS-1000',
      '650.00',
      '750.00',
      'ACTIVE',
      'SIMPLE',
      'Double-walled vacuum insulated leak-proof bottle.',
      '8901234567892',
      '73239390',
      '400',
      'TRUE',
    ],
  ];

  return generateCsvText(headers, sampleRows);
}
