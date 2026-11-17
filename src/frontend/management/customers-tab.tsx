'use client';

import React from 'react';
import { formatMoney, parseCurrencyInput } from '@/frontend/lib/formatters';
import { Money } from '@/shared/domain/money';
import { LoadFailureNotice } from '@/frontend/ui/load-failure-notice';
import { CUSTOMER_FILTERS, STATUS_CLASS, STATUS_LABEL, buildRows, filterCounts, shownText, visibleRows } from './customers-list';
import type { useCustomersTab } from './use-customers-tab';

interface CustomersTabProps {
  tab: ReturnType<typeof useCustomersTab>;
  loadFailed: { customers?: boolean; balances?: boolean; metrics?: boolean };
  retrying: boolean;
  processing: boolean;
  retry: (load: () => Promise<void>) => Promise<void>;
}

/** The customers and credit tab of the management panel. Only draws: the money rules are the ones that were on the page. */
export function CustomersTab({ tab, loadFailed, retrying, processing, retry }: CustomersTabProps) {
  const {
    customers,
    customerBalances,
    customerQuery,
    setCustomerQuery,
    customerFilter,
    setCustomerFilter,
    showNewCustomer,
    setShowNewCustomer,
    newCustName,
    setNewCustName,
    newCustPhone,
    setNewCustPhone,
    newCustLimit,
    setNewCustLimit,
    settlingCustomer,
    setSettlingCustomer,
    settleAmount,
    setSettleAmount,
    settleNote,
    setSettleNote,
    creditMetrics,
    loadCustomers,
    loadCreditMetrics,
    loadMissingBalances,
    handleCreateCustomer,
    handleSettleDebt,
  } = tab;

  const missingBalances = customers.filter((c) => !customerBalances[c.id]).length;
  const allRows = buildRows(customers, customerBalances);
  const counts = filterCounts(allRows);
  const rows = visibleRows(allRows, customerFilter, customerQuery);
  const money = (cents: number | null) => (cents === null ? '—' : formatMoney(Money.fromCents(cents)));

  return (
          <section className="mg-section">
            {loadFailed.customers && (
              <LoadFailureNotice what="a lista de clientes" busy={retrying} onRetry={() => retry(loadCustomers)} />
            )}
            {loadFailed.balances && missingBalances > 0 && (
              <LoadFailureNotice
                what={`o saldo de ${missingBalances} cliente(s)`}
                busy={retrying}
                onRetry={() => retry(loadMissingBalances)}
              />
            )}
            {loadFailed.metrics && (
              <LoadFailureNotice what="as métricas de fiado" busy={retrying} onRetry={() => retry(loadCreditMetrics)} />
            )}
            {/* Resumo do fiado */}
            <section className="mg-facts" aria-label="Resumo do fiado">
              <div className="mg-fact">
                <span className="mg-meta">Fiado na rua</span>
                <span className="mg-fact-value num">
                  {formatMoney(creditMetrics ? creditMetrics.totalOutstandingCredit : 0)}
                </span>
              </div>
              <div className="mg-fact">
                <span className="mg-meta">Clientes devendo</span>
                <span className="mg-fact-value num">{creditMetrics?.activeDebtorsCount ?? 0}</span>
              </div>
              {creditMetrics && (
                <div className="mg-fact">
                  <span className="mg-meta">Já recebido</span>
                  <span className="mg-fact-value num">{formatMoney(creditMetrics.totalSettledCredit)}</span>
                </div>
              )}
            </section>

            <div className="card mg-card-flush">
              <div className="mg-toolbar">
                <label htmlFor="customer-search" className="sr-only">Buscar cliente</label>
                <input
                  id="customer-search"
                  type="text"
                  className="input mg-search"
                  placeholder="Buscar cliente por nome ou telefone..."
                  value={customerQuery}
                  onChange={(e) => setCustomerQuery(e.target.value)}
                />
                <button type="button" className="outline mg-row-action" onClick={loadCreditMetrics}>
                  ↻ Atualizar Indicadores
                </button>
                <button
                  type="button"
                  className="primary mg-toolbar-action"
                  onClick={() => setShowNewCustomer(!showNewCustomer)}
                >
                  {showNewCustomer ? 'Cancelar' : '＋ Novo Cliente'}
                </button>
              </div>
              <div role="group" aria-label="Filtro de clientes" className="mg-filters mg-clist-filters">
                {CUSTOMER_FILTERS.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    className="mg-segment"
                    aria-pressed={customerFilter === f.value}
                    onClick={() => setCustomerFilter(f.value)}
                  >
                    {f.label} ({counts[f.value]})
                  </button>
                ))}
              </div>
            </div>

            {/* Form Novo Cliente */}
            {showNewCustomer && (
              <form onSubmit={handleCreateCustomer} className="card">
                <h3>Cadastrar Cliente para Fiado</h3>
                <div className="mg-form-grid">
                  <div>
                    <label className="field-label" htmlFor="nc-name">Nome Completo</label>
                    <input
                      id="nc-name"
                      className="input"
                      required
                      value={newCustName}
                      onChange={(e) => setNewCustName(e.target.value)}
                      placeholder="Ex: Seu Antenor da Esquina"
                    />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="nc-phone">Telefone / WhatsApp</label>
                    <input
                      id="nc-phone"
                      className="input num"
                      required
                      value={newCustPhone}
                      onChange={(e) => setNewCustPhone(e.target.value)}
                      placeholder="11999998888"
                    />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="nc-limit">Limite de Fiado (R$)</label>
                    <input
                      id="nc-limit"
                      className="input num"
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={newCustLimit}
                      onChange={(e) => setNewCustLimit(e.target.value)}
                    />
                  </div>
                </div>
                <button className="primary mg-form-submit" type="submit" disabled={processing}>
                  {processing ? 'Salvando...' : 'Cadastrar Cliente'}
                </button>
              </form>
            )}

            {/* Lista de clientes e dívidas: linhas no computador, cartões no celular */}
            <section className="card mg-card-flush" aria-label="Clientes e dívidas">
              <div className="mg-clist-head" aria-hidden="true">
                <div>Cliente</div>
                <div>Dívida</div>
                <div>Limite</div>
                <div />
              </div>
              {rows.length === 0 ? (
                <p className="mg-empty-cell">
                  {customers.length === 0
                    ? 'Nenhum cliente cadastrado ainda.'
                    : 'Nenhum cliente encontrado com a busca e o filtro escolhidos.'}
                </p>
              ) : (
                <ul className="mg-clist">
                  {rows.map((r) => (
                    <li key={r.id} className="mg-crow">
                      <div className="mg-ccell-name">
                        <strong>{r.name}</strong>
                        <span className="muted num">{r.phoneText}</span>
                        {r.offPattern && <span className="mg-badge mg-badge-near">Telefone fora do padrão</span>}
                      </div>
                      <div className="mg-ccell-debt">
                        <strong className="num">{money(r.debtCents)}</strong>
                        <span className={STATUS_CLASS[r.status]}>{STATUS_LABEL[r.status]}</span>
                      </div>
                      <div className="mg-ccell-limit">
                        <div className="mg-limit-bar">
                          <div
                            className={`mg-limit-fill ${r.status === 'over' ? 'exceeded' : r.status === 'near' ? 'warning' : ''}`}
                            style={{ width: `${r.percent}%` }}
                          />
                        </div>
                        <div className="mg-limit-legend num">
                          <span>Limite {money(r.limitCents)}</span>
                          {r.availableCents !== null && <span>Disponível {money(r.availableCents)}</span>}
                        </div>
                      </div>
                      <div className="mg-ccell-actions">
                        {r.balance && r.debtCents !== null && r.debtCents > 0 && (
                          <button
                            type="button"
                            className="primary mg-row-action"
                            aria-label={`Receber de ${r.name}`}
                            onClick={() => {
                              setSettlingCustomer(r.balance);
                              setSettleAmount(String(parseCurrencyInput(r.balance?.currentDebt)));
                            }}
                          >
                            Receber
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mg-foot" role="status">{shownText(rows.length, customers.length)}</p>
            </section>

            {/* Modal de Quitação de Dívida */}
            {settlingCustomer && (
              <div className="mg-backdrop">
                <form
                  onSubmit={handleSettleDebt}
                  className="mg-dialog"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="settle-title"
                >
                  <div className="mg-dialog-head">
                    <h2 id="settle-title">Quitação de Fiado no Caixa</h2>
                    <button
                      type="button"
                      className="mg-dialog-close"
                      aria-label="Fechar"
                      onClick={() => setSettlingCustomer(null)}
                    >
                      ×
                    </button>
                  </div>
                  <p className="muted">
                    Cliente: <strong>{settlingCustomer.name}</strong><br />
                    Saldo Devedor Atual: <strong className="num">{formatMoney(settlingCustomer.currentDebt)}</strong>
                  </p>

                  <div>
                    <label className="field-label" htmlFor="settle-val">Valor Pago em Dinheiro (R$)</label>
                    <input
                      id="settle-val"
                      className="input mg-amount num"
                      type="number"
                      step="0.01"
                      min="0.01"
                      max={parseCurrencyInput(settlingCustomer.currentDebt)}
                      required
                      value={settleAmount}
                      onChange={(e) => setSettleAmount(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="field-label" htmlFor="settle-note">Observação / Recibo (opcional)</label>
                    <input
                      id="settle-note"
                      className="input"
                      value={settleNote}
                      onChange={(e) => setSettleNote(e.target.value)}
                      placeholder="Ex: Pago em dinheiro no balcão"
                    />
                  </div>

                  <div className="mg-dialog-actions">
                    <button className="soft" type="button" onClick={() => setSettlingCustomer(null)}>
                      Cancelar
                    </button>
                    <button className="primary" type="submit" disabled={processing}>
                      {processing ? 'Processando...' : 'Confirmar Recebimento e Entrada no Caixa'}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </section>
  );
}
