export type ExportFormat = 'json' | 'xlsx' | 'zip';

export function generateFilename(symbol: string, format: ExportFormat): string {
  const today = new Date().toISOString().slice(0, 10);
  const ext = format === 'json' ? 'json' : format === 'zip' ? 'zip' : 'xlsx';
  return `stock_report_${symbol.toUpperCase()}_${today}.${ext}`;
}

export function triggerFileDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function validateExportFormat(value: unknown): value is ExportFormat {
  return value === 'json' || value === 'xlsx' || value === 'zip';
}


