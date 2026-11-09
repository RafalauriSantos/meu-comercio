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
  OperatorItem,
  CreditMetricsData,
} from '@/frontend/lib/api-client';
import { formatMoney, parseCurrencyInput, getErrorMessage } from '@/frontend/lib/formatters';
import { AppHeader } from '@/frontend/ui/app-header';
import { formatQuantity, type ProductUnit } from '@/shared/domain/product-unit';
import { useAutoDismiss } from '@/frontend/lib/use-auto-dismiss';
import { ManagementSkeleton } from '@/frontend/management/management-skeleton';
import { ImportProductsPanel } from '@/frontend/management/import-products-panel';
import {
  countNeedingRestock,
  inventoryValue,
  initialStockToQuantity,
  matchesStockFilter,
  restockToQuantity,
  stockStatus,
  type StockFilter,
} from '@/frontend/management/stock';
import '@/frontend/styles/management.css';

export default function GestaoPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'produtos' | 'fiado' | 'caixa' | 'operadores'>('produtos');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ text: string; isError?: boolean } | null>(null);

  // Estados de Produtos
  const [products, setProducts] = useState<ProductItem[]>([]);
  // Catálogo completo (última carga sem busca): base dos indicadores, que não mudam com a busca.
  const [catalog, setCatalog] = useState<ProductItem[]>([]);
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [productQuery, setProductQuery] = useState('');
  useAutoDismiss(feedback, () => setFeedback(null));
  const [showNewProduct, setShowNewProduct] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [newBarcode, setNewBarcode] = useState('');
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newStock, setNewStock] = useState('0');
  const [newUnit, setNewUnit] = useState<ProductUnit>('UN');
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

  // Métricas de Fiado na Rua
  const [creditMetrics, setCreditMetrics] = useState<CreditMetricsData | null>(null);

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

  // Cancelamento de Venda
  const [isCancelSaleModalOpen, setIsCancelSaleModalOpen] = useState(false);
  const [cancelSaleId, setCancelSaleId] = useState('');
  const [cancelOwnerPin, setCancelOwnerPin] = useState('');
  const [cancelReason, setCancelReason] = useState('');

  // Estados de Operadores (Equipe)
  const [operators, setOperators] = useState<OperatorItem[]>([]);
  const [showNewOperator, setShowNewOperator] = useState(false);
  const [newOpUsername, setNewOpUsername] = useState('');
  const [newOpPassword, setNewOpPassword] = useState('');

  const loadProducts = useCallback(async (query = '') => {
    try {
      const res = await apiClient.listProducts(query);
      const items = res.items || [];
      setProducts(items);
      if (!query) setCatalog(items);
    } catch (err) {
      console.error('Erro ao carregar produtos:', err);
    }
  }, []);

  const loadCustomers = useCallback(async () => {
    try {
      const res = await apiClient.listCustomers();
      const list = res.items || [];
      setCustomers(list);

      // Carregar saldos devedores de cada cliente em paralelo
      const balancePromises = list.map(async (c) => {
        try {
          const b = await apiClient.getCustomerBalance(c.id);
          return { id: c.id, balance: b };
        } catch {
          return null;
        }
      });
      const results = await Promise.all(balancePromises);
      const balances: Record<string, CustomerBalance> = {};
      for (const r of results) {
        if (r) balances[r.id] = r.balance;
      }
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

  const loadOperators = useCallback(async () => {
    try {
      const res = await apiClient.listOperators();
      setOperators(res.items || []);
    } catch (err) {
      console.error('Erro ao carregar operadores:', err);
    }
  }, []);

  const loadCreditMetrics = useCallback(async () => {
    try {
      const data = await apiClient.getCreditMetrics();
      setCreditMetrics(data);
    } catch (err) {
      console.error('Erro ao carregar métricas de fiado:', err);
    }
  }, []);

  useEffect(() => {
    async function init() {
      try {
        const me = await apiClient.me();
        setUser(me);
        const tasks: Promise<unknown>[] = [
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

  // --- Handlers de Produtos ---
  async function handleCreateProduct(e: React.FormEvent) {
    e.preventDefault();
    setProcessing(true);
    setFeedback(null);
    try {
      const initialStock = initialStockToQuantity(newStock, newUnit);
      if (initialStock === null) {
        setFeedback({
          text: newUnit === 'KG' ? 'Estoque inicial inválido. Use quilos, como 2,5.' : 'Estoque inicial inválido. Use um número inteiro.',
          isError: true,
        });
        return;
      }
      await apiClient.createProduct({
        barcode: newBarcode.trim(),
        name: newName.trim(),
        salePrice: parseCurrencyInput(newPrice),
        initialStock,
        unit: newUnit,
      });
      setFeedback({ text: 'Produto cadastrado com sucesso!' });
      setShowNewProduct(false);
      setNewBarcode('');
      setNewName('');
      setNewPrice('');
      setNewStock('0');
      setNewUnit('UN');
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
      const unit = products.find((p) => p.id === productId)?.unit ?? 'UN';
      const restockQuantity = restockToQuantity(restockQty, unit);
      if (restockQuantity === null) {
        setFeedback({
          text: unit === 'KG' ? 'Quantidade inválida. Use quilos, como 1,5.' : 'Quantidade inválida. Use um número inteiro de 1 em diante.',
          isError: true,
        });
        return;
      }
      await apiClient.restockInventory({
        productId,
        quantity: restockQuantity,
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
      await Promise.all([loadCustomers(), loadCash(), loadCreditMetrics()]);
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

  async function handleCreateOperator(e: React.FormEvent) {
    e.preventDefault();
    setProcessing(true);
    setFeedback(null);
    try {
      await apiClient.createOperator({
        username: newOpUsername.trim(),
        password: newOpPassword,
      });
      setFeedback({ text: `Operador '${newOpUsername.trim()}' cadastrado com sucesso!` });
      setShowNewOperator(false);
      setNewOpUsername('');
      setNewOpPassword('');
      await loadOperators();
    } catch (err) {
      setFeedback({ text: getErrorMessage(err, 'Erro ao cadastrar operador.'), isError: true });
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

  async function handleCancelSale(e: React.FormEvent) {
    e.preventDefault();
    setProcessing(true);
    setFeedback(null);
    try {
      if (!cancelSaleId.trim()) {
        setFeedback({ text: 'Informe o ID da venda a ser cancelada.', isError: true });
        return;
      }
      if (!/^\d{6}$/.test(cancelOwnerPin.trim())) {
        setFeedback({ text: 'O PIN da proprietária deve conter exatamente 6 dígitos numéricos.', isError: true });
        return;
      }
      if (cancelReason.trim().length < 3) {
        setFeedback({ text: 'O motivo do cancelamento deve conter no mínimo 3 caracteres.', isError: true });
        return;
      }

      await apiClient.cancelSale(cancelSaleId.trim(), {
        ownerPin: cancelOwnerPin.trim(),
        reason: cancelReason.trim(),
      });

      setFeedback({
        text: `Venda ${cancelSaleId.trim().slice(0, 8)} cancelada com sucesso! Produtos retornados ao estoque e valores estornados.`,
      });
      setIsCancelSaleModalOpen(false);
      setCancelSaleId('');
      setCancelOwnerPin('');
      setCancelReason('');
      await Promise.all([loadProducts(), loadCash(), loadCreditMetrics()]);
    } catch (err) {
      setFeedback({
        text: getErrorMessage(err, 'Erro ao cancelar venda.'),
        isError: true,
      });
    } finally {
      setProcessing(false);
    }
  }

  const expectedCashNum = cashSession ? parseCurrencyInput(cashSession.expectedCash) : 0;
  const countedNum = parseCurrencyInput(closingCounted);
  const difference = closingCounted ? countedNum - expectedCashNum : 0;

  const lowStockCount = countNeedingRestock(catalog);
  const stockValue = inventoryValue(catalog);
  const visibleProducts = products.filter((p) => matchesStockFilter(p.availableQuantity, stockFilter, p.unit));

  async function handleLogout() {
    await apiClient.logout();
    router.push('/login');
  }

  function closeCashOpModal() {
    setIsCashOpModalOpen(false);
    setCashOpAmount('');
    setCashOpReason('');
  }

  function closeCancelSaleModal() {
    setIsCancelSaleModalOpen(false);
    setCancelSaleId('');
    setCancelOwnerPin('');
    setCancelReason('');
  }

  if (loading) {
    return <ManagementSkeleton />;
  }

  const stockFilters: { value: StockFilter; label: string }[] = [
    { value: 'all', label: 'Todos' },
    { value: 'low', label: 'Estoque baixo' },
    { value: 'out', label: 'Sem estoque' },
  ];

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
          <button type="button" className="outline mg-danger-outline" onClick={() => setIsCancelSaleModalOpen(true)}>
            Cancelar Venda
          </button>
        </div>

        {/* Alertas */}
        {feedback && (
          <div className={feedback.isError ? 'error' : 'notice'} role={feedback.isError ? 'alert' : 'status'}>
            <span>{feedback.text}</span>
            <button type="button" className="soft" onClick={() => setFeedback(null)}>Fechar</button>
          </div>
        )}

        {/* Abas */}
        <div role="group" aria-label="Seções da gestão" className="mg-tabs">
          <button
            type="button"
            className="mg-segment"
            aria-pressed={activeTab === 'produtos'}
            onClick={() => setActiveTab('produtos')}
          >
            Catálogo & Estoque ({catalog.length})
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
              aria-pressed={activeTab === 'operadores'}
              onClick={() => setActiveTab('operadores')}
            >
              Operadores ({operators.length})
            </button>
          )}
        </div>

        {/* TAB 1: PRODUTOS */}
        {activeTab === 'produtos' && (
          <section className="mg-section">
            <div className="mg-kpis">
              <div className="mg-kpi">
                <div className="mg-kpi-label">Produtos cadastrados</div>
                <div className="mg-kpi-value num">{catalog.length}</div>
              </div>
              <div className="mg-kpi mg-kpi-warn">
                <div className="mg-kpi-label">Precisam de reposição</div>
                <div className="mg-kpi-value num">{lowStockCount}</div>
              </div>
              <div className="mg-kpi">
                <div className="mg-kpi-label">Valor em estoque (a preço de venda)</div>
                <div className="mg-kpi-value num">{formatMoney(stockValue)}</div>
              </div>
            </div>

            {/* Form Novo Produto */}
            {showNewProduct && (
              <form onSubmit={handleCreateProduct} className="card">
                <h3>Cadastrar Novo Produto</h3>
                <div className="mg-form-grid">
                  <div>
                    <label className="field-label" htmlFor="np-barcode">Código de Barras</label>
                    <input
                      id="np-barcode"
                      className="input"
                      required
                      value={newBarcode}
                      onChange={(e) => setNewBarcode(e.target.value)}
                      placeholder="789..."
                    />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="np-name">Nome do Produto</label>
                    <input
                      id="np-name"
                      className="input"
                      required
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Ex: Arroz Tipo 1 5kg"
                    />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="np-unit">Como é vendido</label>
                    <select
                      id="np-unit"
                      className="input"
                      value={newUnit}
                      onChange={(e) => setNewUnit(e.target.value === 'KG' ? 'KG' : 'UN')}
                    >
                      <option value="UN">Por unidade</option>
                      <option value="KG">Por peso (preço por quilo)</option>
                    </select>
                  </div>
                  <div>
                    <label className="field-label" htmlFor="np-price">
                      {newUnit === 'KG' ? 'Preço por Quilo (R$)' : 'Preço de Venda (R$)'}
                    </label>
                    <input
                      id="np-price"
                      className="input num"
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
                    <label className="field-label" htmlFor="np-stock">
                      {newUnit === 'KG' ? 'Estoque Inicial (kg)' : 'Estoque Inicial'}
                    </label>
                    <input
                      id="np-stock"
                      className="input num"
                      type={newUnit === 'KG' ? 'text' : 'number'}
                      inputMode={newUnit === 'KG' ? 'decimal' : undefined}
                      min={newUnit === 'KG' ? undefined : '0'}
                      value={newStock}
                      onChange={(e) => setNewStock(e.target.value)}
                    />
                  </div>
                </div>
                <button className="primary mg-form-submit" type="submit" disabled={processing}>
                  {processing ? 'Salvando...' : 'Salvar Produto'}
                </button>
              </form>
            )}

            {showImport && user?.isOwner && (
              <ImportProductsPanel
                onImported={async (createdCount) => {
                  setShowImport(false);
                  setFeedback({
                    text: createdCount === 1 ? '1 produto importado com sucesso!' : `${createdCount} produtos importados com sucesso!`,
                  });
                  await loadProducts();
                }}
              />
            )}

            <section className="card mg-card-flush" aria-label="Catálogo de produtos">
              <div className="mg-toolbar">
                <label htmlFor="product-search" className="sr-only">Buscar produto</label>
                <input
                  id="product-search"
                  type="text"
                  className="input mg-search"
                  placeholder="Buscar por código de barras ou nome do produto..."
                  value={productQuery}
                  onChange={(e) => {
                    setProductQuery(e.target.value);
                    loadProducts(e.target.value);
                  }}
                />
                <div role="group" aria-label="Filtro de estoque" className="mg-filters">
                  {stockFilters.map((f) => (
                    <button
                      key={f.value}
                      type="button"
                      className="mg-segment"
                      aria-pressed={stockFilter === f.value}
                      onClick={() => setStockFilter(f.value)}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                {user?.isOwner && (
                  <button
                    type="button"
                    className="outline mg-toolbar-action"
                    aria-expanded={showImport}
                    onClick={() => setShowImport(!showImport)}
                  >
                    {showImport ? 'Fechar importação' : 'Importar planilha'}
                  </button>
                )}
                <button
                  type="button"
                  className="primary mg-toolbar-secondary"
                  onClick={() => setShowNewProduct(!showNewProduct)}
                >
                  {showNewProduct ? 'Cancelar' : '＋ Novo Produto'}
                </button>
              </div>

              <div className="mg-table-wrap">
                <table className="mg-table">
                  <thead>
                    <tr>
                      <th scope="col">Produto</th>
                      <th scope="col" className="mg-num">Preço</th>
                      <th scope="col" className="mg-num">Em estoque</th>
                      <th scope="col" className="mg-num">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleProducts.map((p) => {
                      const status = stockStatus(p.availableQuantity, p.unit);
                      const byWeight = p.unit === 'KG';
                      return (
                        <React.Fragment key={p.id}>
                          <tr>
                            <td>
                              <strong>{p.name}</strong>
                              {status === 'low' && <span className="mg-tag mg-tag-warn">Estoque baixo</span>}
                              {status === 'out' && <span className="mg-tag mg-tag-danger">Sem estoque</span>}
                              <div className="muted mg-barcode num">{p.barcode}</div>
                            </td>
                            <td className="mg-num">
                              {formatMoney(p.salePrice)}
                              {byWeight ? ' /kg' : ''}
                            </td>
                            <td className={`mg-num mg-stock mg-stock-${status}`}>
                              {formatQuantity(p.availableQuantity, p.unit)}
                              {byWeight ? '' : ' un'}
                            </td>
                            <td className="mg-num">
                              <button
                                type="button"
                                className="outline mg-row-action"
                                aria-expanded={restockingId === p.id}
                                aria-label={
                                  restockingId === p.id
                                    ? `Fechar entrada de estoque de ${p.name}`
                                    : `Registrar entrada de estoque de ${p.name}`
                                }
                                onClick={() => setRestockingId(restockingId === p.id ? null : p.id)}
                              >
                                {restockingId === p.id ? 'Fechar' : 'Entrada'}
                              </button>
                            </td>
                          </tr>

                          {/* Box de Reposição */}
                          {restockingId === p.id && (
                            <tr className="mg-restock-row">
                              <td colSpan={4}>
                                <form onSubmit={(e) => handleRestock(e, p.id)} className="mg-restock">
                                  <div>
                                    <label className="field-label" htmlFor={`restock-qty-${p.id}`}>
                                      {byWeight ? 'Quantidade a Adicionar (kg)' : 'Quantidade a Adicionar'}
                                    </label>
                                    <input
                                      id={`restock-qty-${p.id}`}
                                      className="input num"
                                      type={byWeight ? 'text' : 'number'}
                                      inputMode={byWeight ? 'decimal' : undefined}
                                      min={byWeight ? undefined : '1'}
                                      placeholder={byWeight ? 'Ex: 2,5' : undefined}
                                      required
                                      value={restockQty}
                                      onChange={(e) => setRestockQty(e.target.value)}
                                    />
                                  </div>
                                  <div className="mg-restock-reason">
                                    <label className="field-label" htmlFor={`restock-reason-${p.id}`}>Motivo da Reposição</label>
                                    <input
                                      id={`restock-reason-${p.id}`}
                                      className="input"
                                      type="text"
                                      required
                                      placeholder="Ex: Entrega de fornecedor, acerto semanal"
                                      value={restockReason}
                                      onChange={(e) => setRestockReason(e.target.value)}
                                    />
                                  </div>
                                  <button className="primary" type="submit" disabled={processing}>
                                    Confirmar Reposição
                                  </button>
                                </form>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                    {visibleProducts.length === 0 && (
                      <tr>
                        <td colSpan={4} className="mg-empty-cell">
                          Nenhum produto cadastrado com os critérios pesquisados.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <p className="mg-foot">
                Mostrando {visibleProducts.length} de {catalog.length} produtos · Entrada registra compra ou reposição de estoque
              </p>
            </section>
          </section>
        )}

        {/* TAB 2: CLIENTES & FIADO */}
        {activeTab === 'fiado' && (
          <section className="mg-section">
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
        )}

        {/* TAB 3: CONTROLE & FECHAMENTO DE CAIXA */}
        {activeTab === 'caixa' && (
          <section className="mg-section">
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
                      <button
                        type="button"
                        className="outline mg-danger-outline"
                        onClick={() => setIsCancelSaleModalOpen(true)}
                      >
                        Cancelar Venda (PIN)
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
        {activeTab === 'operadores' && user?.isOwner && (
          <section className="mg-section">
            <div className="mg-section-head">
              <div>
                <h2>Equipe & Operadores de Caixa</h2>
                <p className="muted">
                  Cadastre e gerencie operadores para registrar vendas e abrir turnos de caixa no balcão.
                </p>
              </div>
              <button
                type="button"
                className="primary"
                onClick={() => setShowNewOperator(!showNewOperator)}
              >
                {showNewOperator ? 'Cancelar' : '＋ Novo Operador'}
              </button>
            </div>

            {/* Form Novo Operador */}
            {showNewOperator && (
              <form onSubmit={handleCreateOperator} className="card mg-narrow">
                <h3>Cadastrar Novo Operador</h3>
                <div className="mg-stack">
                  <div>
                    <label className="field-label" htmlFor="op-username">Usuário de Acesso</label>
                    <input
                      id="op-username"
                      className="input"
                      required
                      value={newOpUsername}
                      onChange={(e) => setNewOpUsername(e.target.value)}
                      placeholder="Ex: joao.caixa ou maria"
                    />
                    <small className="mg-help">
                      O usuário que o operador usará para entrar no PDV.
                    </small>
                  </div>
                  <div>
                    <label className="field-label" htmlFor="op-password">Senha de Acesso</label>
                    <input
                      id="op-password"
                      className="input"
                      type="password"
                      required
                      minLength={6}
                      value={newOpPassword}
                      onChange={(e) => setNewOpPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                    />
                  </div>
                </div>
                <button className="primary mg-form-submit" type="submit" disabled={processing}>
                  {processing ? 'Salvando...' : 'Salvar Operador'}
                </button>
              </form>
            )}

            {/* Tabela de Operadores */}
            <div className="card mg-card-flush">
              <div className="mg-table-wrap">
                <table className="mg-table">
                  <thead>
                    <tr>
                      <th scope="col">Usuário</th>
                      <th scope="col">Função</th>
                      <th scope="col">Status</th>
                      <th scope="col">Cadastrado em</th>
                    </tr>
                  </thead>
                  <tbody>
                    {operators.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="mg-empty-cell">
                          Nenhum operador cadastrado ainda. Clique em &quot;＋ Novo Operador&quot; para adicionar funcionários ao caixa.
                        </td>
                      </tr>
                    ) : (
                      operators.map((op) => (
                        <tr key={op.username}>
                          <td><strong>{op.username}</strong></td>
                          <td>
                            <span className="mg-pill">Operador de Caixa</span>
                          </td>
                          <td>
                            <span className={`mg-status ${op.enabled ? 'on' : 'off'}`}>
                              {op.enabled ? '● Ativo' : '● Inativo'}
                            </span>
                          </td>
                          <td className="muted num">
                            {new Date(op.createdAt).toLocaleDateString('pt-BR')}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
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

        {/* MODAL DE CANCELAMENTO DE VENDA COM PIN DA PROPRIETÁRIA */}
        {isCancelSaleModalOpen && (
          <div className="mg-backdrop">
            <form
              onSubmit={handleCancelSale}
              className="mg-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="cancel-sale-title"
            >
              <div className="mg-dialog-head">
                <div>
                  <span className="mg-meta mg-meta-danger">Segurança & Auditoria</span>
                  <h2 id="cancel-sale-title">Cancelar Venda</h2>
                </div>
                <button type="button" className="mg-dialog-close" aria-label="Fechar" onClick={closeCancelSaleModal}>
                  ×
                </button>
              </div>
              <p className="muted">
                O cancelamento de venda devolve integralmente os itens ao estoque, estorna o valor em dinheiro do caixa e anula o fiado (se houver).
              </p>

              <div>
                <label className="field-label" htmlFor="cancel-sale-id">ID ou Código da Venda (UUID)</label>
                <input
                  id="cancel-sale-id"
                  className="input num"
                  required
                  autoFocus
                  value={cancelSaleId}
                  onChange={(e) => setCancelSaleId(e.target.value)}
                  placeholder="Ex: 550e8400-e29b-41d4-a716-446655440000"
                />
              </div>

              <div>
                <label className="field-label" htmlFor="cancel-owner-pin">PIN da Proprietária (6 dígitos)</label>
                <input
                  id="cancel-owner-pin"
                  className="input mg-pin num"
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  value={cancelOwnerPin}
                  onChange={(e) => setCancelOwnerPin(e.target.value)}
                  placeholder="••••••"
                />
              </div>

              <div>
                <label className="field-label" htmlFor="cancel-reason">Motivo Obrigatório do Cancelamento</label>
                <input
                  id="cancel-reason"
                  className="input"
                  required
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Ex: Cliente desistiu da compra / erro no registro"
                />
              </div>

              <div className="mg-dialog-actions">
                <button className="soft" type="button" onClick={closeCancelSaleModal}>
                  Voltar
                </button>
                <button
                  className="primary mg-danger-solid"
                  type="submit"
                  disabled={
                    processing ||
                    !cancelSaleId.trim() ||
                    !/^\d{6}$/.test(cancelOwnerPin.trim()) ||
                    cancelReason.trim().length < 3
                  }
                >
                  {processing ? 'Processando Cancelamento...' : 'Confirmar Cancelamento'}
                </button>
              </div>
            </form>
          </div>
        )}
      </main>
    </>
  );
}
