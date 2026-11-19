import React from 'react';
import type { ProductImportReport } from '@/frontend/lib/api-client';
import { formatMoney } from '@/frontend/lib/formatters';
import { formatQuantity } from '@/shared/domain/product-unit';

interface ImportProductsPreviewProps {
  report: ProductImportReport;
  stockControl: boolean;
  onlyNames: boolean;
  /** The sheet was already written: the numbers are the final ones. */
  done: boolean;
  busy: boolean;
  onToggleOnlyNames: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function ImportProductsPreview({
  report,
  stockControl,
  onlyNames,
  done,
  busy,
  onToggleOnlyNames,
  onConfirm,
  onCancel,
}: ImportProductsPreviewProps) {
  const { valid, corrected, unchanged, skipped, errors } = report;
  const hasErrors = errors.length > 0;
  const hasChanges = valid.length + corrected.length > 0;
  const doneMessage = `Pronto. ${plural(corrected.length, 'produto corrigido', 'produtos corrigidos')}, ${plural(valid.length, 'novo', 'novos')}.`;
  const counts = [
    { label: 'Novos', n: valid.length },
    { label: 'Corrigidos', n: corrected.length },
    { label: 'Sem mudança', n: unchanged.length },
    { label: 'Ignorados', n: skipped.length },
    { label: 'Com erro', n: errors.length },
  ];

  return (
    <div className="mg-stack">
      {!done && (
        <label className="mg-import-check">
          <input type="checkbox" checked={onlyNames} onChange={onToggleOnlyNames} disabled={busy} />
          <span>Corrigir só os nomes, não mexer nos preços</span>
        </label>
      )}

      <div className="mg-import-counts">
        {counts.map((count) => (
          <div
            key={count.label}
            className="mg-import-count"
            data-tone={done ? 'done' : count.label === 'Com erro' && count.n > 0 ? 'error' : undefined}
          >
            <div className="mg-import-count-n num">{count.n}</div>
            <div className="mg-import-count-label">{count.label}</div>
          </div>
        ))}
      </div>

      {done && (
        <div className="success" role="status">
          <strong>{doneMessage}</strong>
        </div>
      )}

      {!done && hasErrors && (
        <div className="error" role="alert">
          <div>
            <p>
              <strong>Nada foi gravado enquanto houver erro.</strong>
            </p>
            <ul>
              {errors.slice(0, 50).map((error) => (
                <li key={`${error.line}-${error.message}`}>
                  Linha {error.line}: {error.message}
                </li>
              ))}
            </ul>
            {errors.length > 50 && <p>E mais {errors.length - 50} linhas com problema.</p>}
            <p className="mg-import-hint">Corrija na planilha e escolha o arquivo de novo.</p>
          </div>
        </div>
      )}

      {!done && !hasErrors && !hasChanges && (
        <div className="notice" role="status">
          <strong>Nenhum produto precisa de correção.</strong>
        </div>
      )}

      {skipped.length > 0 && (
        <div>
          <p className="mg-import-list-title">Ignorados: produtos excluídos ficam como estão</p>
          <ul className="mg-help">
            {skipped.slice(0, 50).map((row) => (
              <li key={`${row.line}-${row.barcode}`}>
                Linha {row.line}: {row.name} ({row.barcode}). {row.reason}
              </li>
            ))}
          </ul>
          {skipped.length > 50 && <p className="mg-help">E mais {skipped.length - 50} ignorados.</p>}
        </div>
      )}

      {corrected.length > 0 && (
        <div>
          <p className="mg-import-list-title">Produtos a corrigir: antes e depois</p>
          <div className="mg-fixes" role="region" aria-label="Lista de correções, antes e depois" tabIndex={0}>
            <table className="mg-table">
              <caption className="sr-only">Produtos a corrigir: antes e depois</caption>
              <thead>
                <tr>
                  <th scope="col">Código de barras</th>
                  <th scope="col">Nome: antes → depois</th>
                  <th scope="col">Preço: antes → depois</th>
                  <th scope="col">Aviso</th>
                </tr>
              </thead>
              <tbody>
                {corrected.map((row) => {
                  const warn = row.priceChangeOver50 && !onlyNames;
                  return (
                    <tr key={row.line} data-warn={warn || undefined}>
                      <td className="mg-barcode num">{row.barcode}</td>
                      <td>
                        <span className="mg-import-before">{row.before.name}</span> → <strong>{row.after.name}</strong>
                      </td>
                      <td>
                        <span className="mg-import-before">{formatMoney(row.before.salePrice)}</span> →{' '}
                        {onlyNames ? (
                          <>
                            <s className="mg-import-before">{formatMoney(row.after.salePrice)}</s>{' '}
                            <span className="mg-import-kept">mantido</span>
                          </>
                        ) : (
                          <strong className={row.after.salePrice !== row.before.salePrice ? 'mg-import-new-price' : undefined}>
                            {formatMoney(row.after.salePrice)}
                          </strong>
                        )}
                      </td>
                      <td>{warn && <span className="mg-import-warn">Preço mudou mais de 50%</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mg-help">
            {corrected.length === 1 ? 'Mostrando a única correção' : `Mostrando todas as ${corrected.length} correções`}
          </p>
        </div>
      )}

      {!done && valid.length > 0 && (
        <div className="mg-table-wrap">
          <table className="mg-table">
            <caption className="sr-only">Produtos que serão criados</caption>
            <thead>
              <tr>
                <th scope="col">Produto novo</th>
                <th scope="col" className="mg-num">Preço</th>
                {stockControl && <th scope="col" className="mg-num">Estoque</th>}
              </tr>
            </thead>
            <tbody>
              {valid.slice(0, 20).map((row) => (
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
          {valid.length > 20 && <p className="mg-help">Mostrando 20 de {valid.length} produtos novos.</p>}
        </div>
      )}

      {!done && (
        <div className="mg-import-actions">
          <button type="button" className="primary" onClick={onConfirm} disabled={hasErrors || !hasChanges || busy}>
            Confirmar e gravar
          </button>
          <button type="button" className="outline" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}
