'use client';

import React, { useRef, useState } from 'react';
import { apiClient, type ProductImportReport } from '@/frontend/lib/api-client';
import { formatMoney, getErrorMessage } from '@/frontend/lib/formatters';
import { useAutoDismiss } from '@/frontend/lib/use-auto-dismiss';
import { formatQuantity } from '@/shared/domain/product-unit';
import { readSpreadsheetAsCsv } from './spreadsheet-to-csv';

interface ImportProductsPanelProps {
  /** Whether the shop controls its stock: off, the Estoque column of the sheet is ignored and not shown. */
  stockControl: boolean;
  onImported: (createdCount: number) => void | Promise<void>;
  onClose: () => void;
}

/** Only a drawing of the sheet: nothing to download. Every code is a valid one; the last row is sold by weight. */
const SHEET_EXAMPLE = [
  { barcode: '7891000100103', name: 'Arroz Tipo 1 5kg', price: '24,90', stock: '12', unit: 'un' },
  { barcode: '7891000200209', name: 'Feijão Carioca 1kg', price: '8,50', stock: '30', unit: 'un' },
  { barcode: '2000000000909', name: 'Queijo Mussarela', price: '42,90', stock: '2,5', unit: 'kg' },
];

export function ImportProductsPanel({ stockControl, onImported, onClose }: ImportProductsPanelProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [report, setReport] = useState<ProductImportReport | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useAutoDismiss(message, () => setMessage(null));

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

  const canConfirm = !!report && report.errors.length === 0 && report.valid.length > 0 && !busy;

  return (
    <section className="card mg-stack" aria-label="Importar produtos de uma planilha">
      <div className="mg-import-head">
        <h3>Importar produtos de uma planilha</h3>
        <button type="button" className="outline" aria-label="Fechar a importação" onClick={onClose}>
          Fechar
        </button>
      </div>
      <div>
        <p className="mg-import-example-title">
          <strong>Como a planilha deve ficar</strong>
          <span className="mg-import-example-tag">Exemplo, só para ver o formato</span>
        </p>
        <div
          role="img"
          aria-label={`Exemplo de planilha com as colunas Código de barras, Nome, Preço${stockControl ? ', Estoque' : ''} e Unidade`}
          className={stockControl ? 'mg-sheet mg-sheet-stock' : 'mg-sheet'}
        >
          <div className="mg-sheet-row mg-sheet-head">
            <span>Código de barras</span>
            <span>Nome</span>
            <span>Preço</span>
            {stockControl && <span>Estoque</span>}
            <span>Unidade</span>
          </div>
          {SHEET_EXAMPLE.map((row) => (
            <div key={row.barcode} className="mg-sheet-row">
              <span>{row.barcode}</span>
              <span>{row.name}</span>
              <span>{row.price}</span>
              {stockControl && <span>{row.stock}</span>}
              <span>{row.unit}</span>
            </div>
          ))}
        </div>
        <p className="mg-help">
          O <strong>código de barras</strong> é obrigatório e precisa ser um código de barras de verdade (13, 12, 8 ou 14
          dígitos). Para produto vendido por peso, use a unidade <strong>kg</strong> (preço por quilo
          {stockControl ? ' e estoque em quilos' : ''}).{' '}
          {!stockControl && 'O controle de estoque está desligado: a coluna Estoque, se houver, é ignorada. '}
          Deixe o código de barras como Texto, para o Excel não cortar zeros do começo. Produtos cujo código já existe não
          são alterados. É só um desenho: não há arquivo para baixar.
        </p>
      </div>
      <label className="mg-import-drop" data-busy={busy || undefined}>
        <input
          ref={fileInput}
          className="mg-import-input"
          type="file"
          accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={handleFile}
          disabled={busy}
        />
        <span className="mg-import-drop-title">
          {busy ? 'Lendo a planilha...' : fileName || 'Escolher a planilha'}
        </span>
        <span className="mg-import-drop-hint">Excel (.xlsx) ou CSV · até 500 produtos</span>
      </label>

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
                    {stockControl && <th scope="col" className="mg-num">Estoque</th>}
                  </tr>
                </thead>
                <tbody>
                  {report.valid.slice(0, 20).map((row) => (
                    <tr key={row.line}>
                      <td>
                        {row.name}
                        <div className="mg-barcode num">{row.barcode}</div>
                      </td>
                      <td className="mg-num">
                        {formatMoney(Number(row.salePrice))}
                        {row.unit === 'KG' ? ' /kg' : ''}
                      </td>
                      {stockControl && <td className="mg-num">{formatQuantity(row.initialStock, row.unit)}</td>}
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
