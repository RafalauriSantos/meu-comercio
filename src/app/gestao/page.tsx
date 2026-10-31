'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  apiClient,
  AuthUser,
  ProductItem,
  CustomerItem,
  CustomerBalance,
  CashSessionData,
} from '@/frontend/lib/api-client';
import { formatMoney, parseCurrencyInput, getErrorMessage } from '@/frontend/lib/formatters';
import '@/frontend/styles/management.css';

export default function GestaoPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'produtos' | 'fiado' | 'caixa'>('produtos');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ text: string; isError?: boolean } | null>(null);

  // Estados de Produtos
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [productQuery, setProductQuery] = useState('');
  const [showNewProduct, setShowNewProduct] = useState(false);
  const [newBarcode, setNewBarcode] = useState('');
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newStock, setNewStock] = useState('0');
  const [restockingId, setRestockingId] = useState<string | null>(null);
  const [restockQty, setRestockQty] = useState('1');
  const [restockReason, setRestockReason] = useState('');

  // Estados de Clientes / Fiado
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [customerBalances, setCustomerBalances] = useState<Record<string, CustomerBalance>>({});
  const [customerQuery, setCustomerQuery] = useState('');
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustLimit, setNewCustLimit] = useState('100.00');

  // Quitação de Fiado
  const [settlingCustomer, setSettlingCustomer] = useState<CustomerBalance | null>(null);
  const [settleAmount, setSettleAmount] = useState('');
  const [settleNote, setSettleNote] = useState('');

  // Estados de Caixa
  const [cashSession, setCashSession] = useState<CashSessionData | null>(null);
  const [cashOpen, setCashOpen] = useState(false);
  const [closingCounted, setClosingCounted] = useState('');
  const [discrepancyReason, setDiscrepancyReason] = useState('');
  const [openingBalance, setOpeningBalance] = useState('100.00');
  const [processing, setProcessing] = useState(false);

  const loadProducts = useCallback(async (query = '') => {
    try {
      const res = await apiClient.listProducts(query);
      setProducts(res.items || []);
    } catch (err) {
      console.error('Erro ao carregar produtos:', err);
    }
  }, []);

  const loadCustomers = useCallback(async () => {
    try {
      const res = await apiClient.listCustomers();
      const list = res.items || [];
      setCustomers(list);

      // Carregar saldos devedores de cada cliente
      const balances: Record<string, CustomerBalance> = {};
      await Promise.all(
        list.map(async (c) => {
          try {
            const b = await apiClient.getCustomerBalance(c.id);
            balances[c.id] = b;
          } catch {
            // Se falhar em um, continua
          }
        })
      );
      setCustomerBalances(balances);
    } catch (err) {
      console.error('Erro ao carregar clientes:', err);
    }
  }, []);

  const loadCash = useCallback(async () => {
    try {
      const cash = await apiClient.getCurrentCash();
      setCashOpen(cash.open);
      setCashSession(cash.session);
    } catch (err) {
      console.error('Erro ao carregar caixa:', err);
    }
  }, []);

  useEffect(() => {
    async function init() {
      try {
        const me = await apiClient.me();
        setUser(me);
        await Promise.all([loadProducts(), loadCustomers(), loadCash()]);
      } catch {
        router.push('/login');
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [router, loadProducts, loadCustomers, loadCash]);

  // --- Handlers de Produtos ---
  async function handleCreateProduct(e: React.FormEvent) {
    e.preventDefault();
    setProcessing(true);
    setFeedback(null);
    try {
      await apiClient.createProduct({
        barcode: newBarcode.trim(),
        name: newName.trim(),
        salePrice: parseCurrencyInput(newPrice),
        initialStock: parseInt(newStock, 10) || 0,
      });
      setFeedback({ text: 'Produto cadastrado com sucesso!' });
      setShowNewProduct(false);
      setNewBarcode('');
      setNewName('');
      setNewPrice('');
      setNewStock('0');
      await loadProducts();
    } catch (err) {
      setFeedback({ text: getErrorMessage(err, 'Erro ao cadastrar produto.'), isError: true });
    } finally {
      setProcessing(false);
    }
  }

  async function handleRestock(e: React.FormEvent, productId: string) {
    e.preventDefault();
    setProcessing(true);
    setFeedback(null);
    try {
      await apiClient.restockInventory({
        productId,
        quantity: parseInt(restockQty, 10) || 1,
        reason: restockReason.trim() || 'Reposição manual de balcão',
      });
      setFeedback({ text: 'Estoque reposto com sucesso!' });
      setRestockingId(null);
      setRestockQty('1');
      setRestockReason('');
      await loadProducts();
    } catch (err) {
      setFeedback({ text: getErrorMessage(err, 'Erro ao repor estoque.'), isError: true });
    } finally {
      setProcessing(false);
    }
  }

  // --- Handlers de Clientes / Fiado ---
  async function handleCreateCustomer(e: React.FormEvent) {
    e.preventDefault();
    setProcessing(true);
    setFeedback(null);
    try {
      await apiClient.createCustomer({
        name: newCustName.trim(),
        phone: newCustPhone.trim(),
        creditLimit: parseCurrencyInput(newCustLimit),
      });
      setFeedback({ text: 'Cliente cadastrado com sucesso!' });
      setShowNewCustomer(false);
      setNewCustName('');
      setNewCustPhone('');
      setNewCustLimit('100.00');
      await loadCustomers();
    } catch (err) {
      setFeedback({ text: getErrorMessage(err, 'Erro ao cadastrar cliente.'), isError: true });
    } finally {
      setProcessing(false);
    }
  }

  async function handleSettleDebt(e: React.FormEvent) {
    e.preventDefault();
    if (!settlingCustomer) return;
    setProcessing(true);
    setFeedback(null);
    try {
      const val = parseCurrencyInput(settleAmount);
      await apiClient.settleCustomerDebt(settlingCustomer.customerId, {
        amount: val,
        note: settleNote.trim() || undefined,
      });
      setFeedback({ text: `Quitação de ${formatMoney(val)} realizada com sucesso e registrada no caixa!` });
      setSettlingCustomer(null);
      setSettleAmount('');
      setSettleNote('');
      await Promise.all([loadCustomers(), loadCash()]);
    } catch (err) {
      setFeedback({ text: getErrorMessage(err, 'Erro ao quitar débito de fiado.'), isError: true });
    } finally {
      setProcessing(false);
    }
  }

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

  const expectedCashNum = cashSession ? parseCurrencyInput(cashSession.expectedCash) : 0;
  const countedNum = parseCurrencyInput(closingCounted);
  const difference = closingCounted ? countedNum - expectedCashNum : 0;

  if (loading) {
    return (
      <main className="management-page">
        <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
          <h2>Carregando Painel de Gestão...</h2>
        </div>
      </main>
    );
  }

  return (
    <div className="management-page">
      {/* Topbar com navegação */}
      <header className="page-heading">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span className="brand-mark small">b</span>
            <span className="eyebrow">Retaguarda & Controle</span>
          </div>
          <h1>Painel de Gestão do Comércio</h1>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <Link href="/" className="primary" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
            Voltar ao PDV Balcão
          </Link>
          <button
            className="ghost"
            onClick={async () => {
              await apiClient.logout();
              router.push('/login');
            }}
          >
            Sair ({user?.username})
          </button>
        </div>
      </header>

      {/* Alertas */}
      {feedback && (
        <div className={feedback.isError ? 'error' : 'notice'}>
          <span>{feedback.text}</span>
          <button className="soft" onClick={() => setFeedback(null)}>Fechar</button>
        </div>
      )}

      {/* Tabs */}
      <nav className="management-tabs">
        <button
          className={activeTab === 'produtos' ? 'active' : ''}
          onClick={() => setActiveTab('produtos')}
        >
          Catálogo & Estoque ({products.length})
        </button>
        <button
          className={activeTab === 'fiado' ? 'active' : ''}
          onClick={() => setActiveTab('fiado')}
        >
          Clientes & Fiado ({customers.length})
        </button>
        <button
          className={activeTab === 'caixa' ? 'active' : ''}
          onClick={() => setActiveTab('caixa')}
        >
          Controle de Caixa {cashOpen ? '● Aberto' : '● Fechado'}
        </button>
      </nav>

      {/* TAB 1: PRODUTOS */}
      {activeTab === 'produtos' && (
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div className="toolbar" style={{ flex: 1, margin: 0 }}>
              <input
                type="text"
                placeholder="Buscar por código de barras ou nome do produto..."
                value={productQuery}
                onChange={(e) => {
                  setProductQuery(e.target.value);
                  loadProducts(e.target.value);
                }}
              />
            </div>
            <button
              className="primary"
              style={{ marginLeft: '12px' }}
              onClick={() => setShowNewProduct(!showNewProduct)}
            >
              {showNewProduct ? 'Cancelar' : '＋ Novo Produto'}
            </button>
          </div>

          {/* Form Novo Produto */}
          {showNewProduct && (
            <form onSubmit={handleCreateProduct} className="card" style={{ marginBottom: '20px' }}>
              <h3 style={{ marginTop: 0 }}>Cadastrar Novo Produto</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                <div>
                  <label className="eyebrow" htmlFor="np-barcode">Código de Barras</label>
                  <input
                    id="np-barcode"
                    style={{ width: '100%', padding: '10px' }}
                    required
                    value={newBarcode}
                    onChange={(e) => setNewBarcode(e.target.value)}
                    placeholder="789..."
                  />
                </div>
                <div>
                  <label className="eyebrow" htmlFor="np-name">Nome do Produto</label>
                  <input
                    id="np-name"
                    style={{ width: '100%', padding: '10px' }}
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Ex: Arroz Tipo 1 5kg"
                  />
                </div>
                <div>
                  <label className="eyebrow" htmlFor="np-price">Preço de Venda (R$)</label>
                  <input
                    id="np-price"
                    style={{ width: '100%', padding: '10px' }}
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={newPrice}
                    onChange={(e) => setNewPrice(e.target.value)}
                    placeholder="24.90"
                  />
                </div>
                <div>
                  <label className="eyebrow" htmlFor="np-stock">Estoque Inicial</label>
                  <input
                    id="np-stock"
                    style={{ width: '100%', padding: '10px' }}
                    type="number"
                    min="0"
                    value={newStock}
                    onChange={(e) => setNewStock(e.target.value)}
                  />
                </div>
              </div>
              <button className="primary" type="submit" disabled={processing} style={{ marginTop: '16px' }}>
                {processing ? 'Salvando...' : 'Salvar Produto'}
              </button>
            </form>
          )}

          {/* Lista de Produtos */}
          <div className="product-list">
            {products.map((p) => (
              <div key={p.id} className="product-entry">
                <div className="card product-row">
                  <div>
                    <strong style={{ fontSize: '16px' }}>{p.name}</strong>
                    <div className="muted mono" style={{ fontSize: '13px' }}>{p.barcode}</div>
                  </div>
                  <strong className="mono" style={{ fontSize: '16px', color: 'var(--pdv-green)' }}>
                    {formatMoney(p.salePrice)}
                  </strong>
                  <div>
                    <span className={`stock-badge ${p.availableQuantity <= 5 ? 'low' : 'ok'}`}>
                      {p.availableQuantity} un
                    </span>
                  </div>
                  <div>
                    <button
                      className="soft"
                      onClick={() => setRestockingId(restockingId === p.id ? null : p.id)}
                    >
                      {restockingId === p.id ? 'Fechar' : 'Repor Estoque'}
                    </button>
                  </div>
                </div>

                {/* Box de Reposição */}
                {restockingId === p.id && (
                  <form onSubmit={(e) => handleRestock(e, p.id)} className="restock-box">
                    <label>
                      Quantidade a Adicionar
                      <input
                        type="number"
                        min="1"
                        required
                        value={restockQty}
                        onChange={(e) => setRestockQty(e.target.value)}
                      />
                    </label>
                    <label style={{ flex: 2 }}>
                      Motivo da Reposição
                      <input
                        type="text"
                        required
                        placeholder="Ex: Entrega de fornecedor, acerto semanal"
                        value={restockReason}
                        onChange={(e) => setRestockReason(e.target.value)}
                      />
                    </label>
                    <button className="primary" type="submit" disabled={processing}>
                      Confirmar Reposição
                    </button>
                  </form>
                )}
              </div>
            ))}
            {products.length === 0 && (
              <div className="card" style={{ textAlign: 'center', padding: '30px' }}>
                <p className="muted">Nenhum produto cadastrado com os critérios pesquisados.</p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* TAB 2: CLIENTES & FIADO */}
      {activeTab === 'fiado' && (
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div className="toolbar" style={{ flex: 1, margin: 0 }}>
              <input
                type="text"
                placeholder="Buscar cliente por nome ou telefone..."
                value={customerQuery}
                onChange={(e) => setCustomerQuery(e.target.value)}
              />
            </div>
            <button
              className="primary"
              style={{ marginLeft: '12px' }}
              onClick={() => setShowNewCustomer(!showNewCustomer)}
            >
              {showNewCustomer ? 'Cancelar' : '＋ Novo Cliente'}
            </button>
          </div>

          {/* Form Novo Cliente */}
          {showNewCustomer && (
            <form onSubmit={handleCreateCustomer} className="card" style={{ marginBottom: '20px' }}>
              <h3 style={{ marginTop: 0 }}>Cadastrar Cliente para Fiado</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                <div>
                  <label className="eyebrow" htmlFor="nc-name">Nome Completo</label>
                  <input
                    id="nc-name"
                    style={{ width: '100%', padding: '10px' }}
                    required
                    value={newCustName}
                    onChange={(e) => setNewCustName(e.target.value)}
                    placeholder="Ex: Seu Antenor da Esquina"
                  />
                </div>
                <div>
                  <label className="eyebrow" htmlFor="nc-phone">Telefone / WhatsApp</label>
                  <input
                    id="nc-phone"
                    style={{ width: '100%', padding: '10px' }}
                    required
                    value={newCustPhone}
                    onChange={(e) => setNewCustPhone(e.target.value)}
                    placeholder="11999998888"
                  />
                </div>
                <div>
                  <label className="eyebrow" htmlFor="nc-limit">Limite de Fiado (R$)</label>
                  <input
                    id="nc-limit"
                    style={{ width: '100%', padding: '10px' }}
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={newCustLimit}
                    onChange={(e) => setNewCustLimit(e.target.value)}
                  />
                </div>
              </div>
              <button className="primary" type="submit" disabled={processing} style={{ marginTop: '16px' }}>
                {processing ? 'Salvando...' : 'Cadastrar Cliente'}
              </button>
            </form>
          )}

          {/* Grid de Clientes e Dívidas */}
          <div className="management-grid">
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
                  <div key={c.id} className="card customer-card">
                    <div className="customer-card-header">
                      <b>{c.name}</b>
                      <span className="muted" style={{ fontSize: '13px' }}>{c.phone}</span>
                    </div>

                    <div style={{ marginTop: '8px' }}>
                      <span className="eyebrow">Dívida Atual em Aberto</span>
                      <div className={`debt-amount ${debt === 0 ? 'zero' : ''}`}>
                        {formatMoney(debt)}
                      </div>
                    </div>

                    <div className="limit-bar">
                      <div
                        className={`limit-bar-fill ${ratio >= 100 ? 'exceeded' : ratio >= 80 ? 'warning' : ''}`}
                        style={{ width: `${ratio}%` }}
                      />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--pdv-muted)' }}>
                      <span>Limite: {formatMoney(limit)}</span>
                      <span>Disponível: {formatMoney(bal ? bal.availableCredit : limit - debt)}</span>
                    </div>

                    <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                      {debt > 0 && (
                        <button
                          className="primary"
                          style={{ flex: 1, padding: '8px' }}
                          onClick={() => {
                            setSettlingCustomer(bal || null);
                            setSettleAmount(String(debt));
                          }}
                        >
                          Quitar Fiado no Caixa
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>

          {/* Modal de Quitação de Dívida */}
          {settlingCustomer && (
            <div className="dialog-backdrop">
              <form onSubmit={handleSettleDebt} className="dialog-card">
                <h2>Quitação de Fiado no Caixa</h2>
                <p className="muted">
                  Cliente: <strong>{settlingCustomer.name}</strong><br />
                  Saldo Devedor Atual: <strong>{formatMoney(settlingCustomer.currentDebt)}</strong>
                </p>

                <div>
                  <label className="eyebrow" htmlFor="settle-val">Valor Pago em Dinheiro (R$)</label>
                  <input
                    id="settle-val"
                    className="barcode-row mono"
                    style={{ width: '100%', fontSize: '20px', fontWeight: 'bold' }}
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
                  <label className="eyebrow" htmlFor="settle-note">Observação / Recibo (opcional)</label>
                  <input
                    id="settle-note"
                    className="barcode-row"
                    style={{ width: '100%' }}
                    value={settleNote}
                    onChange={(e) => setSettleNote(e.target.value)}
                    placeholder="Ex: Pago em dinheiro no balcão"
                  />
                </div>

                <div className="dialog-actions">
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
      )}

      {/* TAB 3: CONTROLE & FECHAMENTO DE CAIXA */}
      {activeTab === 'caixa' && (
        <section className="cash-layout">
          <div className="card">
            <h2>{cashOpen ? 'Conferência Cega e Fechamento de Caixa' : 'Abertura de Caixa'}</h2>

            {cashOpen && cashSession ? (
              <div>
                <dl className="cash-details-list">
                  <div>
                    <dt>Operador Responsável</dt>
                    <dd>{cashSession.openedBy}</dd>
                  </div>
                  <div>
                    <dt>Aberto em</dt>
                    <dd>{new Date(cashSession.openedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</dd>
                  </div>
                  <div>
                    <dt>Fundo de Troco Inicial</dt>
                    <dd className="mono">{formatMoney(cashSession.openingBalance)}</dd>
                  </div>
                  <div>
                    <dt>Movimentações Registradas</dt>
                    <dd>{cashSession.movementsCount ?? 0}</dd>
                  </div>
                </dl>

                <form onSubmit={handleCloseCash} style={{ marginTop: '20px' }}>
                  <label className="eyebrow" htmlFor="cash-closing">
                    Conferência Cega: Dinheiro Contado na Gaveta (R$)
                  </label>
                  <input
                    id="cash-closing"
                    className="barcode-row mono"
                    style={{ width: '100%', fontSize: '22px', fontWeight: 'bold' }}
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
                      className={`cash-difference-alert ${
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
                    <div style={{ marginTop: '12px' }}>
                      <label className="eyebrow" htmlFor="discrepancy-reason">
                        Justificativa Obrigatória da Diferença
                      </label>
                      <input
                        id="discrepancy-reason"
                        className="barcode-row"
                        style={{ width: '100%' }}
                        required
                        value={discrepancyReason}
                        onChange={(e) => setDiscrepancyReason(e.target.value)}
                        placeholder="Ex: Troco arredondado, erro na contagem inicial, etc."
                      />
                    </div>
                  )}

                  <button
                    className="primary wide"
                    type="submit"
                    disabled={processing || !closingCounted}
                    style={{ marginTop: '20px', background: '#ad2819' }}
                  >
                    {processing ? 'Fechando Turno...' : 'Finalizar e Fechar Turno do Caixa'}
                  </button>
                </form>
              </div>
            ) : (
              <div>
                <p className="muted">O caixa está fechado no momento. Abra um novo turno para registrar vendas em dinheiro.</p>
                <form onSubmit={handleOpenCash} style={{ marginTop: '16px' }}>
                  <label className="eyebrow" htmlFor="open-bal">Fundo de Troco Inicial (R$)</label>
                  <input
                    id="open-bal"
                    className="barcode-row mono"
                    style={{ width: '100%', fontSize: '20px', fontWeight: 'bold' }}
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={openingBalance}
                    onChange={(e) => setOpeningBalance(e.target.value)}
                  />
                  <button className="primary wide" type="submit" disabled={processing} style={{ marginTop: '16px' }}>
                    {processing ? 'Abrindo...' : 'Abrir Caixa do Turno'}
                  </button>
                </form>
              </div>
            )}
          </div>

          <aside className="card">
            <h3>Regras da Operação</h3>
            <ul style={{ paddingLeft: '18px', color: 'var(--pdv-muted)', lineHeight: '1.6' }}>
              <li>Na conferência cega, conte todas as cédulas e moedas físicas da gaveta.</li>
              <li>Vendas em PIX e cartão de crédito/débito não entram na gaveta de dinheiro.</li>
              <li>Quitações de fiado em dinheiro entram diretamente no saldo da gaveta.</li>
              <li>Qualquer quebra ou sobra de caixa gera auditoria fiscal e rastreabilidade para a proprietária.</li>
            </ul>
          </aside>
        </section>
      )}
    </div>
  );
}
