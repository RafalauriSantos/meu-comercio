'use client';

import React from 'react';
import { formatMoney, parseCurrencyInput } from '@/frontend/lib/formatters';
import { LoadFailureNotice } from '@/frontend/ui/load-failure-notice';
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
            {/* Indicadores: Fiado na Rua */}
            <div className="mg-kpis">
              <div className="mg-kpi">
                <div className="mg-kpi-label">Total de Fiado na Rua</div>
                <div className="mg-kpi-value num">
                  {formatMoney(creditMetrics ? creditMetrics.totalOutstandingCredit : 0)}
                </div>
              </div>
              <div className="mg-kpi">
                <div className="mg-kpi-label">Clientes com dívida ativa na caderneta</div>
                <div className="mg-kpi-value num">{creditMetrics?.activeDebtorsCount ?? 0}</div>
              </div>
              {creditMetrics && (
                <div className="mg-kpi">
                  <div className="mg-kpi-label">Total já liquidado/recebido</div>
                  <div className="mg-kpi-value num">{formatMoney(creditMetrics.totalSettledCredit)}</div>
                </div>
              )}
            </div>

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

            {/* Grid de Clientes e Dívidas */}
            <div className="mg-grid">
              {customers
                .filter(
                  (c) =>
                    c.name.toLowerCase().includes(customerQuery.toLowerCase()) ||
                    c.phone.includes(customerQuery)
                )
                .map((c) => {
                  const bal = customerBalances[c.id];
                  const debt = bal ? parseCurrencyInput(bal.currentDebt) : 0;
                  const limit = bal ? parseCurrencyInput(bal.creditLimit) : parseCurrencyInput(c.creditLimit);
                  const ratio = limit > 0 ? Math.min(100, (debt / limit) * 100) : debt > 0 ? 100 : 0;

                  return (
                    <div key={c.id} className="card mg-customer">
                      <div className="mg-customer-head">
                        <strong>{c.name}</strong>
                        <span className="muted num">{c.phone}</span>
                      </div>

                      <div>
                        <span className="mg-meta">Dívida Atual em Aberto</span>
                        <div className={`mg-debt num ${debt === 0 ? 'zero' : ''}`}>
                          {formatMoney(debt)}
                        </div>
                      </div>

                      <div className="mg-limit-bar">
                        <div
                          className={`mg-limit-fill ${ratio >= 100 ? 'exceeded' : ratio >= 80 ? 'warning' : ''}`}
                          style={{ width: `${ratio}%` }}
                        />
                      </div>
                      <div className="mg-limit-legend num">
                        <span>Limite: {formatMoney(limit)}</span>
                        <span>Disponível: {formatMoney(bal ? bal.availableCredit : limit - debt)}</span>
                      </div>

                      {debt > 0 && (
                        <button
                          type="button"
                          className="primary"
                          onClick={() => {
                            setSettlingCustomer(bal || null);
                            setSettleAmount(String(debt));
                          }}
                        >
                          Quitar Fiado no Caixa
                        </button>
                      )}
                    </div>
                  );
                })}
            </div>

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
