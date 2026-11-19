import { useState } from 'react';
import { exportProducts } from '@/frontend/lib/api-client';
import { getErrorMessage } from '@/frontend/lib/formatters';
import { countCsvRows, exportedText } from './export-products';
import type { ExportNoticeData } from './export-products-view';

/** State and API call of the Exportar planilha button: ask the server for the CSV and hand it to the browser as a download. */
export function useExportProducts() {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<ExportNoticeData | null>(null);

  async function handleExport() {
    setBusy(true);
    setNotice(null);
    try {
      const { blob, filename } = await exportProducts();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      const count = await blob.text().then(countCsvRows, () => null);
      setNotice({ error: false, text: exportedText(count, filename) });
    } catch (err) {
      setNotice({ error: true, text: getErrorMessage(err, 'Não foi possível gerar a planilha.') });
    } finally {
      setBusy(false);
    }
  }

  return { busy, notice, handleExport };
}
