import React, { useRef, useState } from 'react';
import { apiClient, type ProductImportReport } from '@/frontend/lib/api-client';
import { getErrorMessage } from '@/frontend/lib/formatters';
import { useAutoDismiss } from '@/frontend/lib/use-auto-dismiss';
import { readSpreadsheetAsCsv } from './spreadsheet-to-csv';

/** State and API calls of the import card: read the sheet, preview (dry run), confirm. */
export function useImportProducts(onImported: () => void | Promise<void>) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [report, setReport] = useState<ProductImportReport | null>(null);
  const [onlyNames, setOnlyNames] = useState(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useAutoDismiss(message, () => setMessage(null));

  function clearFile() {
    setReport(null);
    setCsv(null);
    setDone(false);
    setOnlyNames(false);
    if (fileInput.current) fileInput.current.value = '';
  }

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    clearFile();
    setMessage(null);
    if (!file) return;
    setFileName(file.name);
    setBusy(true);
    try {
      const text = await readSpreadsheetAsCsv(file);
      setCsv(text);
      setReport(await apiClient.importProducts({ csv: text, dryRun: true, onlyNames: false }));
    } catch (err) {
      setMessage(getErrorMessage(err, 'Não foi possível ler a planilha.'));
    } finally {
      setBusy(false);
    }
  }

  /** Changing the checkbox asks the server for the preview again. */
  async function handleToggleOnlyNames() {
    if (!csv) return;
    const next = !onlyNames;
    setOnlyNames(next);
    setBusy(true);
    setMessage(null);
    try {
      setReport(await apiClient.importProducts({ csv, dryRun: true, onlyNames: next }));
    } catch (err) {
      setMessage(getErrorMessage(err, 'Não foi possível atualizar a prévia.'));
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm() {
    if (!csv) return;
    setBusy(true);
    setMessage(null);
    try {
      // The final numbers come from the server: they can differ from the preview if the catalog changed meanwhile.
      setReport(await apiClient.importProducts({ csv, dryRun: false, onlyNames }));
      setDone(true);
      setCsv(null);
      await onImported();
    } catch (err) {
      setMessage(getErrorMessage(err, 'Não foi possível importar a planilha.'));
    } finally {
      setBusy(false);
    }
  }

  function handleCancel() {
    clearFile();
    setFileName('');
    setMessage(null);
  }

  return { fileInput, fileName, report, onlyNames, done, message, busy, handleFile, handleToggleOnlyNames, handleConfirm, handleCancel };
}
