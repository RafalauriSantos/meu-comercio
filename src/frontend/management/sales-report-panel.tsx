'use client';

import React, { useEffect, useState } from 'react';
import { apiClient, type SalesReport } from '@/frontend/lib/api-client';
import { formatMoney, getErrorMessage } from '@/frontend/lib/formatters';
import type { PeriodKind } from '@/modules/reports/domain/report-period';
import {
  PERIOD_OPTIONS,
  bestAndWorstDays,
  changeDirection,
  dayBarWidths,
  formatDay,
  formatPercent,
  formatSoldQuantity,
  paymentLabel,
  reportFileName,
  reportToCsv,
} from './sales-report';

const DIRECTION_ARROW = { up: '▲', down: '▼', same: '•' } as const;

interface ReportRequest {
  period: PeriodKind;
  from?: string;
  to?: string;
  /** Changes on every request, so asking for the same period again ("Tentar de novo") asks again. */
  attempt: number;
}

/** The sales report of the management panel: how much was sold in a period, and how it compares with the last. */
export function SalesReportPanel() {
  // The button that is selected, and the request that is being shown (a custom period only becomes a request
  // when the dates are confirmed).
  const [selected, setSelected] = useState<PeriodKind>('today');
  const [request, setRequest] = useState<ReportRequest>({ period: 'today', attempt: 0 });
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [report, setReport] = useState<SalesReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Asks for the report whenever the request changes. A request that is no longer the current one is dropped,
  // so an old, slower answer never replaces a newer one.
  useEffect(() => {
    let current = true;
    apiClient
      .getSalesReport({ period: request.period, from: request.from, to: request.to })
      .then((result) => {
        if (!current) return;
        setReport(result);
        setError(null);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!current) return;
        setError(getErrorMessage(err, 'Não foi possível carregar o relatório.'));
        setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [request]);

  function ask(next: Omit<ReportRequest, 'attempt'>) {
    setLoading(true);
    setError(null);
    setRequest((previous) => ({ ...next, attempt: previous.attempt + 1 }));
  }

  function handleSelect(kind: PeriodKind) {
    setSelected(kind);
    if (kind !== 'custom') ask({ period: kind });
  }

  function handleCustom(event: React.FormEvent) {
    event.preventDefault();
    if (from && to) ask({ period: 'custom', from, to });
  }

  function handleExport() {
    if (!report) return;
    const blob = new Blob([reportToCsv(report)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = reportFileName(report);
    link.click();
    URL.revokeObjectURL(url);
  }

  const bars = report ? dayBarWidths(report.byDay) : [];
  const extremes = report ? bestAndWorstDays(report.byDay) : null;
  const direction = report ? changeDirection(report.previous.changeAmount) : 'same';

  return (
    <section className="mg-section" aria-label="Relatório de vendas">
      <div className="mg-section-head">
        <div>
          <h2 className="mg-display">Relatório de vendas</h2>
          <p className="muted">{report ? report.period.label : 'Quanto a loja vendeu no período.'}</p>
        </div>
        <button type="button" className="outline" onClick={handleExport} disabled={!report || loading}>
          Exportar CSV
        </button>
      </div>

      <div role="group" aria-label="Período" className="mg-filters">
        {PERIOD_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className="mg-segment"
            aria-pressed={selected === option.value}
            onClick={() => handleSelect(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {selected === 'custom' && (
        <form className="mg-period-custom" onSubmit={handleCustom}>
          <div>
            <label className="field-label" htmlFor="report-from">De</label>
            <input id="report-from" className="input" type="date" required value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="field-label" htmlFor="report-to">Até</label>
            <input id="report-to" className="input" type="date" required value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
          </div>
          <button type="submit" className="primary" disabled={!from || !to || loading}>
            Ver relatório
          </button>
        </form>
      )}

      {error && (
        <div className="error" role="alert">
          <span>{error}</span>
          <button type="button" className="soft" onClick={() => ask({ period: request.period, from: request.from, to: request.to })}>
            Tentar de novo
          </button>
        </div>
      )}

      {loading && !report && <p className="muted" role="status">Carregando o relatório...</p>}

      {report && (
        <div className="mg-stack" aria-busy={loading} data-loading={loading || undefined}>
          <div className="mg-kpis">
            <div className="mg-kpi">
              <div className="mg-kpi-label">Total vendido</div>
              <div className="mg-kpi-value num">{formatMoney(report.summary.total)}</div>
              <div className={`mg-delta mg-delta-${direction}`}>
                {DIRECTION_ARROW[direction]} {formatMoney(report.previous.changeAmount)} ({formatPercent(report.previous.changePercent)})
                <span className="mg-delta-note"> em relação a {report.previous.label}</span>
              </div>
            </div>
            <div className="mg-kpi">
              <div className="mg-kpi-label">Vendas</div>
              <div className="mg-kpi-value num">{report.summary.salesCount}</div>
              <div className="mg-delta-note">{report.previous.salesCount} em {report.previous.label}</div>
            </div>
            <div className="mg-kpi">
              <div className="mg-kpi-label">Ticket médio</div>
              <div className="mg-kpi-value num">{formatMoney(report.summary.averageTicket)}</div>
              <div className="mg-delta-note">valor médio de cada venda</div>
            </div>
          </div>

          {report.summary.salesCount === 0 && <p className="muted">Nenhuma venda neste período.</p>}

          <div className="mg-report-grid">
            <section className="card mg-card-flush" aria-label="Forma de pagamento">
              <h3 className="mg-card-title">Forma de pagamento</h3>
              <div className="mg-table-wrap">
                <table className="mg-table">
                  <thead>
                    <tr>
                      <th scope="col">Forma</th>
                      <th scope="col" className="mg-num">Valor</th>
                      <th scope="col" className="mg-num">% do total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.byPayment.map((row) => (
                      <tr key={row.method}>
                        <td>{paymentLabel(row.method)}</td>
                        <td className="mg-num">{formatMoney(row.amount)}</td>
                        <td className="mg-num">{String(row.share).replace('.', ',')}%</td>
                      </tr>
                    ))}
                    {report.byPayment.length === 0 && (
                      <tr><td colSpan={3} className="muted">Sem pagamentos no período.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="card mg-card-flush" aria-label="Produtos mais vendidos">
              <h3 className="mg-card-title">Produtos mais vendidos</h3>
              <div className="mg-table-wrap">
                <table className="mg-table">
                  <thead>
                    <tr>
                      <th scope="col">Produto</th>
                      <th scope="col" className="mg-num">Vendido</th>
                      <th scope="col" className="mg-num">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.topProducts.map((row) => (
                      <tr key={`${row.name}-${row.unit}`}>
                        <td>{row.name}</td>
                        <td className="mg-num">{formatSoldQuantity(row)}</td>
                        <td className="mg-num">{formatMoney(row.amount)}</td>
                      </tr>
                    ))}
                    {report.topProducts.length === 0 && (
                      <tr><td colSpan={3} className="muted">Sem produtos vendidos no período.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <section className="card mg-card-flush" aria-label="Vendas por dia">
            <h3 className="mg-card-title">
              Por dia
              {extremes && (
                <span className="mg-delta-note">
                  {' '}· melhor dia {formatDay(extremes.best)}, pior dia {formatDay(extremes.worst)}
                </span>
              )}
            </h3>
            <div className="mg-table-wrap">
              <table className="mg-table">
                <thead>
                  <tr>
                    <th scope="col">Dia</th>
                    <th scope="col" className="mg-num">Vendas</th>
                    <th scope="col" className="mg-num">Total</th>
                    <th scope="col"><span className="sr-only">Comparação com o melhor dia</span></th>
                  </tr>
                </thead>
                <tbody>
                  {report.byDay.map((row, index) => (
                    <tr key={row.date}>
                      <td>{formatDay(row.date)}</td>
                      <td className="mg-num">{row.salesCount}</td>
                      <td className="mg-num">{formatMoney(row.total)}</td>
                      <td className="mg-bar" aria-hidden="true">
                        <span className="mg-bar-fill" style={{ width: `${bars[index]}%` }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="mg-report-grid">
            <section className="card mg-card-flush" aria-label="Por operador">
              <h3 className="mg-card-title">Por operador</h3>
              <div className="mg-table-wrap">
                <table className="mg-table">
                  <thead>
                    <tr>
                      <th scope="col">Operador</th>
                      <th scope="col" className="mg-num">Vendas</th>
                      <th scope="col" className="mg-num">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.byOperator.map((row) => (
                      <tr key={row.operatorId}>
                        <td>{row.operatorId}</td>
                        <td className="mg-num">{row.salesCount}</td>
                        <td className="mg-num">{formatMoney(row.total)}</td>
                      </tr>
                    ))}
                    {report.byOperator.length === 0 && (
                      <tr><td colSpan={3} className="muted">Sem vendas no período.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="card mg-card-flush" aria-label="Fiado e cancelamentos">
              <h3 className="mg-card-title">Fiado e cancelamentos</h3>
              <dl className="mg-report-facts">
                <div>
                  <dt>Fiado vendido</dt>
                  <dd className="num">{formatMoney(report.fiado.sold)}</dd>
                </div>
                <div>
                  <dt>Fiado recebido</dt>
                  <dd className="num">{formatMoney(report.fiado.received)}</dd>
                </div>
                <div>
                  <dt>Vendas canceladas (fora do total)</dt>
                  <dd className="num">
                    {report.cancelled.count} · {formatMoney(report.cancelled.total)}
                  </dd>
                </div>
              </dl>
            </section>
          </div>
        </div>
      )}
    </section>
  );
}
