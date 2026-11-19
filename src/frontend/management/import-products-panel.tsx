'use client';

import React from 'react';
import { ImportProductsPreview } from './import-products-preview';
import { useImportProducts } from './use-import-products';

interface ImportProductsPanelProps {
  /** Whether the shop controls its stock: off, the Estoque column of the sheet is ignored and not shown. */
  stockControl: boolean;
  onImported: () => void | Promise<void>;
  onClose: () => void;
}

/** Only a drawing of the sheet: nothing to download. Every code is a valid one; the last row is sold by weight. */
const SHEET_EXAMPLE = [
  { barcode: '7891000100103', name: 'Arroz Tipo 1 5kg', price: '24,90', stock: '12', unit: 'un' },
  { barcode: '7891000200209', name: 'Feijão Carioca 1kg', price: '8,50', stock: '30', unit: 'un' },
  { barcode: '2000000000909', name: 'Queijo Mussarela', price: '42,90', stock: '2,5', unit: 'kg' },
];

export function ImportProductsPanel({ stockControl, onImported, onClose }: ImportProductsPanelProps) {
  const {
    fileInput, fileName, report, onlyNames, done, message, busy,
    handleFile, handleToggleOnlyNames, handleConfirm, handleCancel,
  } = useImportProducts(onImported);

  return (
    <section className="card mg-stack" aria-label="Importar produtos de uma planilha">
      <div className="mg-import-head">
        <h3>Importar produtos de uma planilha</h3>
        <button type="button" className="outline" aria-label="Fechar a importação" onClick={onClose}>
          Fechar
        </button>
      </div>
      <p className="mg-help">
        Corrija os nomes e os preços na sua planilha e importe: produtos com o mesmo código de barras são corrigidos. O estoque da planilha é ignorado nos produtos que já existem. Até 1.000 produtos.
      </p>
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
          Deixe o código de barras como Texto, para o Excel não cortar zeros do começo. É só um desenho: não há arquivo para baixar.
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
        <span className="mg-import-drop-hint">Excel (.xlsx) ou CSV · até 1.000 produtos</span>
      </label>

      {message && (
        <div className="error" role="alert">
          {message}
        </div>
      )}

      {report && (
        <ImportProductsPreview
          report={report}
          stockControl={stockControl}
          onlyNames={onlyNames}
          done={done}
          busy={busy}
          onToggleOnlyNames={handleToggleOnlyNames}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </section>
  );
}
