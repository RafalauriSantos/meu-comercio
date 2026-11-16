'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  apiClient,
  AuthUser,
  CashSessionData,
} from '@/frontend/lib/api-client';
import { formatMoney, parseCurrencyInput, getErrorMessage } from '@/frontend/lib/formatters';
import { AppHeader } from '@/frontend/ui/app-header';
import { VersionLabel } from '@/frontend/ui/version-label';
import { useAutoDismiss } from '@/frontend/lib/use-auto-dismiss';
import { LoadFailureNotice } from '@/frontend/ui/load-failure-notice';
import { useSkeletonGate } from '@/frontend/lib/use-skeleton-gate';
import { ManagementDataSkeleton } from '@/frontend/management/management-skeleton';
import { SalesReportPanel } from '@/frontend/management/sales-report-panel';
import { OperatorsTab } from '@/frontend/management/operators-tab';
import { useOperatorsTab } from '@/frontend/management/use-operators-tab';
import { ProductsTab } from '@/frontend/management/products-tab';
import { CustomersTab } from '@/frontend/management/customers-tab';
import { useCustomersTab } from '@/frontend/management/use-customers-tab';
import { useProductsTab } from '@/frontend/management/use-products-tab';
import '@/frontend/styles/management.css';

type LoadKey = 'products' | 'customers' | 'balances' | 'cash' | 'metrics' | 'operators';

export default function GestaoPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'produtos' | 'fiado' | 'caixa' | 'operadores' | 'relatorios'>('produtos');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const skeletonGate = useSkeletonGate(loading);
  const [feedback, setFeedback] = useState<{ text: string; isError?: boolean } | null>(null);
  useAutoDismiss(feedback, () => setFeedback(null));

  // Estados de Caixa
  const [cashSession, setCashSession] = useState<CashSessionData | null>(null);
  const [cashOpen, setCashOpen] = useState(false);
  const [closingCounted, setClosingCounted] = useState('');
  const [discrepancyReason, setDiscrepancyReason] = useState('');
  const [openingBalance, setOpeningBalance] = useState('100.00');
  const [processing, setProcessing] = useState(false);

  // Sangria e Suprimento
  const [isCashOpModalOpen, setIsCashOpModalOpen] = useState(false);
  const [cashOpType, setCashOpType] = useState<'WITHDRAWAL' | 'DEPOSIT'>('WITHDRAWAL');
  const [cashOpAmount, setCashOpAmount] = useState('');
  const [cashOpReason, setCashOpReason] = useState('');

  const [loadFailed, setLoadFailed] = useState<Partial<Record<LoadKey, boolean>>>({});
  // Um pedido por vez (limite de 30 requisições por minuto): enquanto um retry roda, todos os botões ficam bloqueados.
  const [retrying, setRetrying] = useState(false);
  const operatorsTab = useOperatorsTab({ setFeedback, setProcessing, setLoadFailed });
  const { operators, loadOperators } = operatorsTab;
  // Se a loja controla o estoque. Desligado, somem o saldo, as entradas, os alertas e o valor em estoque.
  const [stockControl, setStockControl] = useState(true);
  const productsTab = useProductsTab({ setFeedback, setProcessing, setLoadFailed, stockControl, setStockControl });
  const { summary, loadProducts } = productsTab;

  const loadCash = useCallback(async () => {
    try {
      const cash = await apiClient.getCurrentCash();
      setCashOpen(cash.open);
      setCashSession(cash.session);
      setLoadFailed((f) => ({ ...f, cash: false }));
    } catch (err) {
      setLoadFailed((f) => ({ ...f, cash: true }));
      console.error('Erro ao carregar caixa:', err);
    }
  }, []);

  const customersTab = useCustomersTab({ setFeedback, setProcessing, setLoadFailed, loadCash });
  const { customers, loadCustomers, loadCreditMetrics } = customersTab;

  async function retry(load: () => Promise<void>) {
    setRetrying(true);
    try {
      await load();
    } finally {
      setRetrying(false);
    }
  }

  useEffect(() => {
    async function init() {
      try {
        const me = await apiClient.me();
        setUser(me);
        const tasks: Promise<unknown>[] = [
          // Sem resposta, vale o controle de estoque ligado, como era antes.
          apiClient
            .getStoreSettings()
            .then((settings) => setStockControl(settings.stockControlEnabled))
            .catch(() => undefined),
          loadProducts(),
          loadCustomers(),
          loadCash(),
          loadCreditMetrics(),
        ];
        if (me.isOwner) {
          tasks.push(loadOperators());
        }
        await Promise.all(tasks);
      } catch {
        router.push('/login');
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [router, loadProducts, loadCustomers, loadCash, loadCreditMetrics, loadOperators]);

  // --- Handlers de Caixa ---
  async function handleOpenCash(e: React.FormEvent) {
    e.preventDefault();
    setProcessing(true);
    setFeedback(null);
    try {
      await apiClient.openCash({ openingBalance: parseCurrencyInput(openingBalance) });
      setFeedback({ text: 'Caixa aberto com sucesso!' });
      await loadCash();
    } catch (err) {
      setFeedback({ text: getErrorMessage(err, 'Erro ao abrir caixa.'), isError: true });
    } finally {
      setProcessing(false);
    }
  }

  async function handleCloseCash(e: React.FormEvent) {
    e.preventDefault();
    if (!cashSession) return;
    setProcessing(true);
    setFeedback(null);
    try {
      const closingVal = parseCurrencyInput(closingCounted);
      const res = await apiClient.closeCash({
        sessionId: cashSession.id,
        closingBalance: closingVal,
        discrepancyReason: discrepancyReason.trim() || undefined,
      });
      const diff = parseCurrencyInput(res.difference);
      const diffMsg = diff === 0 ? 'sem quebra' : diff > 0 ? `com sobra de ${formatMoney(diff)}` : `com quebra de ${formatMoney(Math.abs(diff))}`;
      setFeedback({ text: `Caixa fechado com sucesso (${diffMsg}).` });
      setClosingCounted('');
      setDiscrepancyReason('');
      await loadCash();
    } catch (err) {
      setFeedback({ text: getErrorMessage(err, 'Erro ao fechar caixa.'), isError: true });
    } finally {
      setProcessing(false);
    }
  }

  async function handleCashOperation(e: React.FormEvent) {
    e.preventDefault();
    setProcessing(true);
    setFeedback(null);
    try {
      const val = parseCurrencyInput(cashOpAmount);
      if (val <= 0) {
        setFeedback({ text: 'O valor da operação deve ser maior que zero.', isError: true });
        return;
      }
      if (cashOpReason.trim().length < 3) {
        setFeedback({ text: 'O motivo deve conter no mínimo 3 caracteres.', isError: true });
        return;
      }
      if (cashOpType === 'WITHDRAWAL') {
        const res = await apiClient.recordWithdrawal({
          amount: val,
          reason: cashOpReason.trim(),
        });
        setFeedback({
          text: `Sangria de ${formatMoney(res.amount)} realizada com sucesso! Novo saldo esperado: ${formatMoney(res.expectedCash)}.`,
        });
      } else {
        const res = await apiClient.recordDeposit({
          amount: val,
          reason: cashOpReason.trim(),
        });
        setFeedback({
          text: `Suprimento de ${formatMoney(res.amount)} registrado com sucesso! Novo saldo esperado: ${formatMoney(res.expectedCash)}.`,
        });
      }
      setIsCashOpModalOpen(false);
      setCashOpAmount('');
      setCashOpReason('');
      await loadCash();
    } catch (err) {
      setFeedback({
        text: getErrorMessage(err, 'Erro ao registrar operação de caixa.'),
        isError: true,
      });
    } finally {
      setProcessing(false);
    }
  }

  const expectedCashNum = cashSession ? parseCurrencyInput(cashSession.expectedCash) : 0;
  const countedNum = parseCurrencyInput(closingCounted);
  const difference = closingCounted ? countedNum - expectedCashNum : 0;

  async function handleLogout() {
    await apiClient.logout();
    router.push('/login');
  }

  function closeCashOpModal() {
    setIsCashOpModalOpen(false);
    setCashOpAmount('');
    setCashOpReason('');
  }


  const shape = skeletonGate === 'skeleton';

  return (
    <>
      <AppHeader
        active="gestao"
        username={user?.username}
        isOwner={user?.isOwner}
        onLogout={handleLogout}
      />

      <main className="management-page">
        <div className="mg-titlebar">
          <div>
            <h1>Painel de Gestão do Comércio</h1>
            <p className="muted">Retaguarda & Controle</p>
          </div>
        </div>

        {/* Alertas */}
        {feedback && (
          <div className={feedback.isError ? 'error' : 'notice'} role={feedback.isError ? 'alert' : 'status'}>
            <span>{feedback.text}</span>
            <button type="button" className="soft" onClick={() => setFeedback(null)}>Fechar</button>
          </div>
        )}

        {loading ? <ManagementDataSkeleton shape={shape} /> : (<>
        {/* Abas */}
        <div role="group" aria-label="Seções da gestão" className="mg-tabs">
          <button
            type="button"
            className="mg-segment"
            aria-pressed={activeTab === 'produtos'}
            onClick={() => setActiveTab('produtos')}
          >
            Catálogo & Estoque ({summary ? summary.total : '—'})
          </button>
          <button
            type="button"
            className="mg-segment"
            aria-pressed={activeTab === 'fiado'}
            onClick={() => setActiveTab('fiado')}
          >
            Clientes & Fiado ({customers.length})
          </button>
          <button
            type="button"
            className="mg-segment"
            aria-pressed={activeTab === 'caixa'}
            onClick={() => setActiveTab('caixa')}
          >
            Controle de Caixa {cashOpen ? '● Aberto' : '● Fechado'}
          </button>
          {user?.isOwner && (
            <button
              type="button"
              className="mg-segment"
              aria-pressed={activeTab === 'relatorios'}
              onClick={() => setActiveTab('relatorios')}
            >
              Relatórios
            </button>
          )}
          {user?.isOwner && (
            <button
              type="button"
              className="mg-segment"
              aria-pressed={activeTab === 'operadores'}
              onClick={() => setActiveTab('operadores')}
            >
              Operadores ({operators.length})
            </button>
          )}
        </div>

        {/* TAB 1: PRODUTOS */}
        {activeTab === 'produtos' && (
          <ProductsTab tab={productsTab} stockControl={stockControl} user={user} setFeedback={setFeedback} loadFailed={loadFailed} retrying={retrying} processing={processing} retry={retry} />
        )}

        {/* TAB 2: CLIENTES & FIADO */}
        {activeTab === 'fiado' && (
          <CustomersTab tab={customersTab} loadFailed={loadFailed} retrying={retrying} processing={processing} retry={retry} />
        )}

        {/* TAB 3: CONTROLE & FECHAMENTO DE CAIXA */}
        {activeTab === 'caixa' && (
          <section className="mg-section">
            {loadFailed.cash && (
              <LoadFailureNotice what="o caixa" busy={retrying} onRetry={() => retry(loadCash)} />
            )}
            {cashOpen && cashSession ? (
              <div className="mg-cash">
                <div className="mg-col">
                  <div className="card">
                    <h2 className="mg-display">Fechar caixa</h2>
                    <p className="muted">
                      Conferência cega: conte o dinheiro da gaveta antes de fechar o turno.
                    </p>
                  </div>

                  <div className="card mg-card-flush">
                    <h3 className="mg-card-title">Dados do turno</h3>
                    <dl className="mg-details">
                      <div>
                        <dt>Operador Responsável</dt>
                        <dd>{cashSession.openedBy}</dd>
                      </div>
                      <div>
                        <dt>Aberto em</dt>
                        <dd className="num">{new Date(cashSession.openedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</dd>
                      </div>
                      <div>
                        <dt>Fundo de Troco Inicial</dt>
                        <dd className="num">{formatMoney(cashSession.openingBalance)}</dd>
                      </div>
                      <div>
                        <dt>Movimentações Registradas</dt>
                        <dd className="num">{cashSession.movementsCount ?? 0}</dd>
                      </div>
                    </dl>
                    <p className="mg-note">
                      O valor esperado na gaveta fica oculto até o fechamento, para que a contagem seja cega.
                    </p>
                  </div>

                  <div className="card">
                    <h3>Movimentações do caixa</h3>
                    <div className="mg-actions">
                      <button
                        type="button"
                        className="outline"
                        onClick={() => {
                          setCashOpType('WITHDRAWAL');
                          setIsCashOpModalOpen(true);
                        }}
                      >
                        - Registrar Sangria (Retirada)
                      </button>
                      <button
                        type="button"
                        className="outline"
                        onClick={() => {
                          setCashOpType('DEPOSIT');
                          setIsCashOpModalOpen(true);
                        }}
                      >
                        + Registrar Suprimento (Entrada)
                      </button>
                    </div>
                  </div>

                  <aside className="card">
                    <h3>Regras da Operação</h3>
                    <ul className="mg-rules">
                      <li>Na conferência cega, conte todas as cédulas e moedas físicas da gaveta.</li>
                      <li>Vendas em PIX e cartão de crédito/débito não entram na gaveta de dinheiro.</li>
                      <li>Quitações de fiado em dinheiro entram diretamente no saldo da gaveta.</li>
                      <li>Qualquer quebra ou sobra de caixa gera auditoria fiscal e rastreabilidade para a proprietária.</li>
                    </ul>
                  </aside>
                </div>

                <form onSubmit={handleCloseCash} className="mg-col">
                  <div className="card">
                    <label className="field-label" htmlFor="cash-closing">
                      Quanto tem na gaveta? (R$)
                    </label>
                    <input
                      id="cash-closing"
                      className="input mg-count num"
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={closingCounted}
                      onChange={(e) => setClosingCounted(e.target.value)}
                      placeholder="0.00"
                    />

                    {closingCounted && (
                      <div
                        role="status"
                        className={`mg-difference ${
                          difference === 0 ? 'even' : difference > 0 ? 'over' : 'short'
                        }`}
                      >
                        {difference === 0
                          ? '✓ Valores conferem perfeitamente com o esperado!'
                          : difference > 0
                          ? `Sobra de Caixa: + ${formatMoney(difference)}`
                          : `Quebra de Caixa: - ${formatMoney(Math.abs(difference))}`}
                      </div>
                    )}

                    {closingCounted && difference !== 0 && (
                      <div className="mg-reason">
                        <label className="field-label" htmlFor="discrepancy-reason">
                          Justificativa Obrigatória da Diferença
                        </label>
                        <input
                          id="discrepancy-reason"
                          className="input"
                          required
                          value={discrepancyReason}
                          onChange={(e) => setDiscrepancyReason(e.target.value)}
                          placeholder="Ex: Troco arredondado, erro na contagem inicial, etc."
                        />
                      </div>
                    )}

                    <p className="mg-note-inline">
                      Se a diferença não for zero, o sistema pede o motivo antes de fechar.
                    </p>
                  </div>

                  <div className="mg-close-actions">
                    <button className="primary mg-close-btn" type="submit" disabled={processing || !closingCounted}>
                      <span>{processing ? 'Fechando Turno...' : 'Fechar caixa'}</span>
                      <span className="kbd">Enter</span>
                    </button>
                    <Link href="/pdv" className="soft mg-back-btn">
                      Voltar para a venda
                    </Link>
                  </div>
                  <p className="mg-note-inline">Ao fechar, o turno fica registrado no histórico do caixa.</p>
                </form>
              </div>
            ) : (
              <div className="card mg-open-cash">
                <h2>Abertura de Caixa</h2>
                <p className="muted">O caixa está fechado no momento. Abra um novo turno para registrar vendas em dinheiro.</p>
                <form onSubmit={handleOpenCash}>
                  <label className="field-label" htmlFor="open-bal">Fundo de Troco Inicial (R$)</label>
                  <input
                    id="open-bal"
                    className="input mg-amount num"
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={openingBalance}
                    onChange={(e) => setOpeningBalance(e.target.value)}
                  />
                  <button className="primary mg-form-submit mg-full" type="submit" disabled={processing}>
                    {processing ? 'Abrindo...' : 'Abrir Caixa do Turno'}
                  </button>
                </form>
              </div>
            )}
          </section>
        )}

        {/* TAB 4: OPERADORES DE CAIXA */}
        {/* TAB: RELATÓRIOS (só a dona) */}
        {activeTab === 'relatorios' && user?.isOwner && <SalesReportPanel />}

        {activeTab === 'operadores' && user?.isOwner && (
          <OperatorsTab tab={operatorsTab} loadFailed={loadFailed} retrying={retrying} processing={processing} retry={retry} />
        )}

        {/* MODAL DE SANGRIA E SUPRIMENTO DE CAIXA */}
        {isCashOpModalOpen && (
          <div className="mg-backdrop">
            <form
              onSubmit={handleCashOperation}
              className="mg-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="cash-op-title"
            >
              <div className="mg-dialog-head">
                <div>
                  <span className="mg-meta">Gestão de Caixa</span>
                  <h2 id="cash-op-title">{cashOpType === 'WITHDRAWAL' ? 'Registrar Sangria' : 'Registrar Suprimento'}</h2>
                </div>
                <button type="button" className="mg-dialog-close" aria-label="Fechar" onClick={closeCashOpModal}>
                  ×
                </button>
              </div>
              <p className="muted">
                {cashOpType === 'WITHDRAWAL'
                  ? 'Retirada de dinheiro da gaveta para cofre ou pagamentos.'
                  : 'Aporte de dinheiro na gaveta para troco ou moedas.'}
              </p>

              <div className="mg-segmented" role="group" aria-label="Tipo de operação">
                <button
                  type="button"
                  className="mg-segment"
                  aria-pressed={cashOpType === 'WITHDRAWAL'}
                  onClick={() => setCashOpType('WITHDRAWAL')}
                >
                  Sangria (Saída)
                </button>
                <button
                  type="button"
                  className="mg-segment"
                  aria-pressed={cashOpType === 'DEPOSIT'}
                  onClick={() => setCashOpType('DEPOSIT')}
                >
                  Suprimento (Entrada)
                </button>
              </div>

              <div>
                <label className="field-label" htmlFor="gestao-cash-amount">Valor (R$)</label>
                <input
                  id="gestao-cash-amount"
                  className="input mg-amount num"
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  autoFocus
                  value={cashOpAmount}
                  onChange={(e) => setCashOpAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="field-label" htmlFor="gestao-cash-reason">Motivo (mínimo 3 caracteres)</label>
                <input
                  id="gestao-cash-reason"
                  className="input"
                  required
                  value={cashOpReason}
                  onChange={(e) => setCashOpReason(e.target.value)}
                  placeholder={cashOpType === 'WITHDRAWAL' ? 'Ex: Pagamento fornecedor pão' : 'Ex: Troco de moedas'}
                />
              </div>

              <div className="mg-dialog-actions">
                <button className="soft" type="button" onClick={closeCashOpModal}>
                  Cancelar
                </button>
                <button
                  className="primary"
                  type="submit"
                  disabled={processing || !cashOpAmount || cashOpReason.trim().length < 3}
                >
                  {processing ? 'Processando...' : cashOpType === 'WITHDRAWAL' ? 'Confirmar Sangria' : 'Confirmar Suprimento'}
                </button>
              </div>
            </form>
          </div>
        )}

        </>)}

        <p className="app-version-line">
          <VersionLabel />
        </p>
      </main>
    </>
  );
}
