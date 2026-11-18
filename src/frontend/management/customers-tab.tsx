'use client';

import React from 'react';
import { formatMoney, parseCurrencyInput } from '@/frontend/lib/formatters';
import { Money } from '@/shared/domain/money';
import type { AuthUser } from '@/frontend/lib/api-client';
import { LoadFailureNotice } from '@/frontend/ui/load-failure-notice';
import { CUSTOMER_FILTERS, STATUS_CLASS, STATUS_LABEL, buildRows, filterCounts, shownText, visibleRows } from './customers-list';
import { CustomerEditPanel } from './customer-edit-panel';
import { NewCustomerPanel } from './new-customer-panel';
import { CustomerStatementPanel } from './customer-statement-panel';
import type { useCustomersTab } from './use-customers-tab';

interface CustomersTabProps {
  tab: ReturnType<typeof useCustomersTab>;
  user: AuthUser | null;
  loadFailed: { customers?: boolean; balances?: boolean; metrics?: boolean };
  retrying: boolean;
  processing: boolean;
  retry: (load: () => Promise<void>) => Promise<void>;
}

/** The customers and credit tab of the management panel. Only draws: the money rules are the ones that were on the page. */
export function CustomersTab({ tab, user, loadFailed, retrying, processing, retry }: CustomersTabProps) {
  const {
    customers,
    customerBalances,
    customerQuery,
    setCustomerQuery,
    customerFilter,
    setCustomerFilter,
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
    handleSettleDebt,
    create,
    edit,
    statement,
  } = tab;

  const missingBalances = customers.filter((c) => !customerBalances[c.id]).length;
  const allRows = buildRows(customers, customerBalances);
  const counts = filterCounts(allRows);
  const rows = visibleRows(allRows, customerFilter, customerQuery);
  const money = (cents: number | null) => (cents === null ? '—' : formatMoney(Money.fromCents(cents)));

  return (
          <section className="mg-section">
            {loadFailed.customers && (
              <LoadFailureNotice what="a lista de clientes" busy={retrying} onRetry={() => retry(async () => { await loadCustomers(); })} />
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
                  aria-haspopup="dialog"
                  onClick={create.open}
                >
                  ＋ Novo Cliente
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

            {create.isOpen && (
              <NewCustomerPanel
                isOwner={user?.isOwner === true}
                draft={create.draft}
                processing={processing}
                closing={create.closing}
                error={create.error}
                nameRef={create.nameRef}
                onDraft={create.changeDraft}
                onSubmit={(e) => create.handleSubmit(e, user?.isOwner === true)}
                onCancel={create.close}
                onClosed={create.finishClose}
              />
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
                        {r.creditBlocked && <span className="mg-badge mg-badge-over">Fiado bloqueado</span>}
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
                        <button
                          type="button"
                          className="outline mg-row-action"
                          aria-haspopup="dialog"
                          aria-label={`Extrato de ${r.name}`}
                          onClick={() => statement.open({ id: r.id, name: r.name })}
                        >
                          Extrato
                        </button>
                        {user?.isOwner && (
                          <button
                            type="button"
                            className="outline mg-row-action"
                            aria-haspopup="dialog"
                            aria-label={`Editar ${r.name}`}
                            onClick={() => {
                              const item = customers.find((c) => c.id === r.id);
                              if (item) edit.open(item);
                            }}
                          >
                            Editar
                          </button>
                        )}
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

            {user?.isOwner && edit.target && (
              <CustomerEditPanel
                target={edit.target}
                draft={edit.draft}
                debtCents={allRows.find((r) => r.id === edit.target?.id)?.debtCents ?? null}
                processing={processing}
                closing={edit.closing}
                error={edit.error}
                nameRef={edit.nameRef}
                onDraft={edit.changeDraft}
                onSubmit={edit.handleSubmit}
                onCancel={edit.close}
                onClosed={edit.finishClose}
                onReload={edit.handleReload}
              />
            )}

            {statement.target && (
              <CustomerStatementPanel
                name={statement.target.name}
                debtCents={allRows.find((r) => r.id === statement.target?.id)?.debtCents ?? null}
                items={statement.items}
                loading={statement.loading}
                hasMore={statement.nextCursor !== null}
                error={statement.error}
                closing={statement.closing}
                closeRef={statement.closeRef}
                onClose={statement.close}
                onClosed={statement.finishClose}
                onLoadMore={statement.loadMore}
                onRetry={statement.retry}
              />
            )}

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
