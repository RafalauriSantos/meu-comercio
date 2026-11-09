'use client';

import React, { useRef, useState } from 'react';
import { apiClient, type ProductImportReport } from '@/frontend/lib/api-client';
import { formatMoney, getErrorMessage } from '@/frontend/lib/formatters';
import { PRODUCT_IMPORT_TEMPLATE } from './import-template';
import { readSpreadsheetAsCsv } from './spreadsheet-to-csv';

interface ImportProductsPanelProps {
  onImported: (createdCount: number) => void | Promise<void>;
}

export function ImportProductsPanel({ onImported }: ImportProductsPanelProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [report, setReport] = useState<ProductImportReport | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setReport(null);
    setMessage(null);
    setCsv(null);
    if (!file) return;
    setFileName(file.name);
    setBusy(true);
    try {
      const text = await readSpreadsheetAsCsv(file);
      setCsv(text);
      setReport(await apiClient.importProducts({ csv: text, dryRun: true }));
    } catch (err) {
      setMessage(getErrorMessage(err, 'Não foi possível ler a planilha.'));
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm() {
    if (!csv) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await apiClient.importProducts({ csv, dryRun: false });
      setReport(null);
      setCsv(null);
      setFileName('');
      if (fileInput.current) fileInput.current.value = '';
      await onImported(result.valid.length);
    } catch (err) {
      setMessage(getErrorMessage(err, 'Não foi possível importar a planilha.'));
    } finally {
      setBusy(false);
    }
  }

  function downloadTemplate() {
    const blob = new Blob(['﻿', PRODUCT_IMPORT_TEMPLATE], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'modelo-produtos.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  const canConfirm = !!report && report.errors.length === 0 && report.valid.length > 0 && !busy;

  return (
    <section className="card mg-stack" aria-label="Importar produtos de uma planilha">
      <h3>Importar produtos de uma planilha</h3>
      <p className="mg-help">
        Use uma planilha do Excel (.xlsx) ou um CSV, com as colunas código de barras, nome, preço e estoque (até 500
        produtos por vez). Deixe a coluna do código de barras como Texto, para o Excel não cortar zeros do começo.
        Produtos cujo código de barras já existe não são alterados.
      </p>
      <div className="mg-import-actions">
        <button type="button" className="outline" onClick={downloadTemplate}>
          Baixar planilha-modelo
        </button>
        <label className="field-label mg-import-file" htmlFor="import-file">
          Escolher arquivo (Excel ou CSV)
        </label>
        <input
          id="import-file"
          ref={fileInput}
          className="input mg-import-input"
          type="file"
          accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={handleFile}
          disabled={busy}
        />
      </div>

      {message && (
        <div className="error" role="alert">
          {message}
        </div>
      )}

      {report && (
        <div className="mg-stack" aria-live="polite">
          <p>
            <strong>{fileName}</strong>: {report.valid.length} para criar
            {report.skipped.length > 0 && `, ${report.skipped.length} já existem (serão ignorados)`}
            {report.errors.length > 0 && `, ${report.errors.length} com problema`}.
          </p>

          {report.errors.length > 0 && (
            <div className="error" role="alert">
              <p>Corrija estas linhas na planilha e escolha o arquivo de novo. Nada foi importado.</p>
              <ul>
                {report.errors.slice(0, 50).map((error) => (
                  <li key={`${error.line}-${error.message}`}>
                    Linha {error.line}: {error.message}
                  </li>
                ))}
              </ul>
              {report.errors.length > 50 && <p>E mais {report.errors.length - 50} linhas com problema.</p>}
            </div>
          )}

          {report.valid.length > 0 && (
            <div className="mg-table-wrap">
              <table className="mg-table">
                <caption className="sr-only">Produtos que serão criados</caption>
                <thead>
                  <tr>
                    <th scope="col">Produto</th>
                    <th scope="col" className="mg-num">Preço</th>
                    <th scope="col" className="mg-num">Estoque</th>
                  </tr>
                </thead>
                <tbody>
                  {report.valid.slice(0, 20).map((row) => (
                    <tr key={row.line}>
                      <td>
                        {row.name}
                        <div className="mg-barcode num">{row.barcode}</div>
                      </td>
                      <td className="mg-num">{formatMoney(Number(row.salePrice))}</td>
                      <td className="mg-num">{row.initialStock}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {report.valid.length > 20 && (
                <p className="mg-help">Mostrando 20 de {report.valid.length} produtos.</p>
              )}
            </div>
          )}

          <button type="button" className="primary" onClick={handleConfirm} disabled={!canConfirm}>
            {busy ? 'Importando...' : `Importar ${report.valid.length} produtos`}
          </button>
        </div>
      )}
    </section>
  );
}
