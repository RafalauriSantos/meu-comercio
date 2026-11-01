'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  apiClient,
  ApiError,
  AuthUser,
  ProductItem,
  CustomerItem,
  CashSessionData,
} from '@/frontend/lib/api-client';
import { Money } from '@/shared/domain/money';
import {
  CartCalculator,
  CartItem as CalculatorCartItem,
  PaymentInput,
  PaymentMethod as CalcPaymentMethod,
} from '@/frontend/lib/cart-calculator';
import {
  OfflineSyncManager,
  OfflineSale,
} from '@/frontend/lib/offline-sync';
import {
  formatMoney,
  parseCurrencyInput,
  getErrorMessage,
} from '@/frontend/lib/formatters';
import '@/frontend/styles/pdv.css';

interface CartLine {
  product: ProductItem;
  quantity: number;
}

export default function PdvTerminalPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Conexão e Offline
  const [isOnline, setIsOnline] = useState(() =>
    typeof window !== 'undefined' ? navigator.onLine : true
  );
  const [offlineCount, setOfflineCount] = useState(0);
  const [syncingOffline, setSyncingOffline] = useState(false);
  const offlineManagerRef = useRef<OfflineSyncManager | null>(null);
  const userRef = useRef<AuthUser | null>(null);
  const syncingOfflineRef = useRef(false);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    syncingOfflineRef.current = syncingOffline;
  }, [syncingOffline]);

  // Caixa
  const [cashOpen, setCashOpen] = useState<boolean | null>(null);
  const [cashSession, setCashSession] = useState<CashSessionData | null>(null);

  // Carrinho e Código de Barras
  const [barcodeInput, setBarcodeInput] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [lastItem, setLastItem] = useState<ProductItem | null>(null);
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // Checkout Modal
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<CalcPaymentMethod>('CASH');
  const [receivedCash, setReceivedCash] = useState('');
  const [isSplit, setIsSplit] = useState(false);
  const [secondMethod, setSecondMethod] = useState<CalcPaymentMethod>('PIX');
  const [secondAmount, setSecondAmount] = useState('');

  // Fiado / Clientes
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');

  // Modal PIN Proprietária (quando fiado ultrapassa limite)
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [ownerPin, setOwnerPin] = useState('');

  // Notificações e Feedback
  const [message, setMessage] = useState<{ text: string; isError?: boolean } | null>(null);
  const [processing, setProcessing] = useState(false);

  // Relógio
  const [clock, setClock] = useState('');

  // Sincronização da Fila Offline
  async function triggerOfflineSync() {
    if (!offlineManagerRef.current || !userRef.current || !navigator.onLine || syncingOfflineRef.current) return;

    setSyncingOffline(true);
    try {
      const result = await offlineManagerRef.current.syncQueue(
        userRef.current.merchantId,
        userRef.current.username,
        async (sale: OfflineSale) => {
          await apiClient.createSale(
            {
              items: sale.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
              payments: sale.payments.map((p) => ({
                method: p.method,
                amount: p.amount,
                receivedAmount: p.receivedAmount,
              })),
              idempotencyKey: sale.idempotencyKey,
            },
            sale.idempotencyKey
          );
        }
      );

      if (result.syncedCount > 0) {
        setMessage({
          text: `${result.syncedCount} venda(s) offline sincronizada(s) com o servidor com sucesso!`,
        });
      }
      const count = offlineManagerRef.current.getQueue(
        userRef.current.merchantId,
        userRef.current.username
      ).length;
      setOfflineCount(count);
    } catch (err) {
      console.error('Falha na sincronização offline:', err);
    } finally {
      setSyncingOffline(false);
    }
  }

  // Inicializa Gerenciador Offline
  useEffect(() => {
    offlineManagerRef.current = new OfflineSyncManager();
  }, []);

  // Relógio em tempo real
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setClock(
        now.toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Monitor de Conexão Online/Offline
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      void triggerOfflineSync();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Carrega Usuário, Caixa e Clientes em paralelo para inicialização rápida
  useEffect(() => {
    async function init() {
      try {
        const [me, cash, custResult] = await Promise.all([
          apiClient.me(),
          apiClient.getCurrentCash(),
          apiClient.listCustomers().catch(() => ({ items: [] })),
        ]);

        setUser(me);
        setCashOpen(cash.open);
        setCashSession(cash.session);
        setCustomers(custResult.items || []);

        if (offlineManagerRef.current) {
          const count = offlineManagerRef.current.getQueue(me.merchantId, me.username).length;
          setOfflineCount(count);
        }
      } catch {
        router.push('/login');
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [router]);

  // Foco contínuo no leitor de código de barras
  useEffect(() => {
    if (!isCheckoutOpen && !isPinModalOpen) {
      barcodeInputRef.current?.focus();
    }
  }, [isCheckoutOpen, isPinModalOpen]);

  // Cálculos do Carrinho via CartCalculator
  const calculatorItems: CalculatorCartItem[] = useMemo(() => {
    return cart.map((line) => ({
      productId: line.product.id,
      name: line.product.name,
      price: Money.fromDecimal(line.product.salePrice),
      quantity: line.quantity,
    }));
  }, [cart]);

  const totalItemUnits = useMemo(() => {
    return cart.reduce((acc, l) => acc + l.quantity, 0);
  }, [cart]);

  const subtotalMoney = useMemo(() => {
    return CartCalculator.calculateSubtotal(calculatorItems);
  }, [calculatorItems]);

  const totalMoney = useMemo(() => {
    return CartCalculator.calculateTotal(subtotalMoney);
  }, [subtotalMoney]);

  // Lista de pagamentos para validação
  const paymentInputs: PaymentInput[] = useMemo(() => {
    if (!isCheckoutOpen || totalMoney.isZero()) return [];

    if (isSplit) {
      const secVal = parseCurrencyInput(secondAmount);
      const secMoney = Money.fromDecimal(Math.max(0, secVal));
      const firstMoney = totalMoney.greaterThan(secMoney)
        ? totalMoney.subtract(secMoney)
        : Money.zero();

      return [
        {
          method: paymentMethod,
          amount: firstMoney,
          receivedAmount:
            paymentMethod === 'CASH'
              ? Money.fromDecimal(parseCurrencyInput(receivedCash, firstMoney.toDecimal()))
              : undefined,
        },
        {
          method: secondMethod,
          amount: secMoney,
        },
      ];
    }

    const recVal = parseCurrencyInput(receivedCash);
    return [
      {
        method: paymentMethod,
        amount: totalMoney,
        receivedAmount:
          paymentMethod === 'CASH' && recVal > 0 ? Money.fromDecimal(recVal) : undefined,
        customerId: paymentMethod === 'TAB' ? selectedCustomerId : undefined,
      },
    ];
  }, [
    isCheckoutOpen,
    totalMoney,
    isSplit,
    paymentMethod,
    secondMethod,
    secondAmount,
    receivedCash,
    selectedCustomerId,
  ]);

  const cartSummary = useMemo(() => {
    return CartCalculator.getSummary(calculatorItems, paymentInputs);
  }, [calculatorItems, paymentInputs]);

  function resetCartAndCheckout() {
    setCart([]);
    setLastItem(null);
    setIsCheckoutOpen(false);
    setIsPinModalOpen(false);
    setOwnerPin('');
    setReceivedCash('');
    setSecondAmount('');
    setIsSplit(false);
  }

  function saveCashSaleOffline(noticeText: string) {
    if (!offlineManagerRef.current || !user) return;

    offlineManagerRef.current.enqueueSale(user.merchantId, user.username, {
      idempotencyKey: crypto.randomUUID(),
      merchantId: user.merchantId,
      operatorId: user.username,
      items: cart.map((line) => ({
        productId: line.product.id,
        quantity: line.quantity,
        barcode: line.product.barcode,
        name: line.product.name,
        salePrice: line.product.salePrice,
      })),
      payments: [
        {
          method: 'CASH',
          amount: totalMoney.toDecimal(),
          receivedAmount: receivedCash ? parseCurrencyInput(receivedCash) : totalMoney.toDecimal(),
        },
      ],
      createdAt: new Date().toISOString(),
    });

    setOfflineCount(offlineManagerRef.current.getQueue(user.merchantId, user.username).length);
    setMessage({ text: noticeText });
    resetCartAndCheckout();
  }

  // Atalhos de Teclado Globais (F2, F4, Esc)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Esc: fecha modais ou limpa carrinho
      if (e.key === 'Escape') {
        e.preventDefault();
        if (isPinModalOpen) {
          setIsPinModalOpen(false);
          setOwnerPin('');
          return;
        }
        if (isCheckoutOpen) {
          setIsCheckoutOpen(false);
          return;
        }
        if (cart.length > 0) {
          if (confirm('Deseja limpar todos os itens do carrinho?')) {
            resetCartAndCheckout();
            setMessage({ text: 'Carrinho limpo.' });
          }
        }
        return;
      }

      // F2: Nova Venda / Foco no leitor
      if (e.key === 'F2') {
        e.preventDefault();
        setIsCheckoutOpen(false);
        setIsPinModalOpen(false);
        barcodeInputRef.current?.focus();
        return;
      }

      // F4: Finalizar / Ir para Pagamento
      if (e.key === 'F4') {
        e.preventDefault();
        if (cart.length > 0 && !isCheckoutOpen) {
          setIsCheckoutOpen(true);
        }
        return;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart.length, isCheckoutOpen, isPinModalOpen]);

  // Adicionar produto por código de barras
  async function handleBarcodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    const code = barcodeInput.trim();
    if (!code) return;

    setBarcodeInput('');
    setMessage(null);

    try {
      let product: ProductItem | null = null;

      if (navigator.onLine) {
        product = await apiClient.findProductByBarcode(code);
        // Cacheia localmente para uso offline
        if (offlineManagerRef.current && user) {
          offlineManagerRef.current.saveProductsCache(user.merchantId, user.username, [
            {
              id: product.id,
              barcode: product.barcode,
              name: product.name,
              salePrice: parseCurrencyInput(product.salePrice),
              availableQuantity: product.availableQuantity,
            },
          ]);
        }
      } else {
        // Busca do cache offline
        if (offlineManagerRef.current && user) {
          const cached = offlineManagerRef.current.findProductByBarcode(
            user.merchantId,
            user.username,
            code
          );
          if (cached) {
            product = {
              id: cached.id,
              barcode: cached.barcode,
              name: cached.name,
              salePrice: cached.salePrice,
              availableQuantity: cached.availableQuantity ?? 999,
            };
          }
        }
      }

      if (!product) {
        setMessage({
          text: `Produto com código [${code}] não encontrado no catálogo.`,
          isError: true,
        });
        return;
      }

      // Atualiza carrinho
      setCart((current) => {
        const index = current.findIndex((item) => item.product.id === product!.id);
        if (index >= 0) {
          const updated = [...current];
          updated[index] = {
            ...updated[index],
            quantity: updated[index].quantity + 1,
          };
          return updated;
        }
        return [...current, { product: product!, quantity: 1 }];
      });

      setLastItem(product);
    } catch (err) {
      setMessage({
        text: getErrorMessage(err, 'Produto não encontrado.'),
        isError: true,
      });
    }
  }

  // Ajustar quantidade no carrinho
  function updateLineQuantity(productId: string, delta: number) {
    setCart((current) => {
      return current
        .map((line) => {
          if (line.product.id === productId) {
            const nextQty = line.quantity + delta;
            return nextQty > 0 ? { ...line, quantity: nextQty } : null;
          }
          return line;
        })
        .filter((l): l is CartLine => l !== null);
    });
  }

  // Finalizar Venda no Checkout
  async function handleFinalizeSale(pinToUse?: string) {
    if (processing || cart.length === 0) return;
    setProcessing(true);
    setMessage(null);

    try {
      // 1. Caso seja Venda Fiado
      if (paymentMethod === 'TAB') {
        if (!selectedCustomerId) {
          setMessage({ text: 'Selecione o cliente para registrar o fiado.', isError: true });
          setProcessing(false);
          return;
        }

        try {
          await apiClient.authorizeCreditSale(selectedCustomerId, {
            saleAmount: totalMoney.toDecimal(),
            ownerPin: pinToUse || ownerPin || undefined,
            ownerUsername: user?.username,
            note: 'Venda a fiado no balcão',
          });

          setMessage({
            text: `Venda fiada de ${totalMoney.formatBrl()} registrada com sucesso na caderneta!`,
          });
          resetCartAndCheckout();
          return;
        } catch (creditErr) {
          if (
            creditErr instanceof ApiError &&
            (creditErr.status === 403 || creditErr.message.includes('PIN') || creditErr.message.includes('limite'))
          ) {
            // Requer PIN da proprietária
            setIsPinModalOpen(true);
            setMessage({
              text: 'Limite de fiado excedido ou necessária autorização da proprietária.',
              isError: true,
            });
            return;
          }
          throw creditErr;
        }
      }

      // 2. Venda Normal (Dinheiro, Cartão, PIX ou Dividida)
      if (!navigator.onLine) {
        if (paymentMethod !== 'CASH' || isSplit) {
          setMessage({
            text: 'Sem conexão à internet. Apenas pagamentos simples em dinheiro são aceitos offline.',
            isError: true,
          });
          return;
        }

        saveCashSaleOffline('Venda em dinheiro salva no navegador (Modo Offline). Será sincronizada ao reconectar.');
        return;
      }

      // Venda Online
      const salePayload = {
        items: cart.map((line) => ({
          productId: line.product.id,
          quantity: line.quantity,
        })),
        payments: paymentInputs.map((p) => ({
          method: p.method as 'CASH' | 'PIX' | 'DEBIT_CARD' | 'CREDIT_CARD',
          amount: p.amount.toDecimal(),
          receivedAmount: p.receivedAmount ? p.receivedAmount.toDecimal() : undefined,
        })),
      };

      const idempotencyKey = crypto.randomUUID();
      const saleRes = await apiClient.createSale(salePayload, idempotencyKey);
      const changeMsg =
        paymentMethod === 'CASH' && cartSummary.changeAmount.isPositive()
          ? ` Troco: ${cartSummary.changeAmount.formatBrl()}`
          : '';

      setMessage({
        text: `Venda #${saleRes.id.slice(0, 8)} confirmada com sucesso!${changeMsg}`,
      });
      resetCartAndCheckout();
    } catch (err) {
      if (
        paymentMethod === 'CASH' &&
        !isSplit &&
        err instanceof TypeError &&
        offlineManagerRef.current &&
        user
      ) {
        saveCashSaleOffline('Conexão instável. Venda em dinheiro salva offline no terminal com segurança.');
        return;
      }

      setMessage({
        text: getErrorMessage(err, 'Não foi possível concluir a venda.'),
        isError: true,
      });
    } finally {
      setProcessing(false);
    }
  }

  if (loading) {
    return (
      <main className="pdv-page" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div className="card" style={{ padding: '32px', textAlign: 'center' }}>
          <h2>Iniciando Terminal PDV...</h2>
        </div>
      </main>
    );
  }

  const openedTimeString = cashSession?.openedAt
    ? new Date(cashSession.openedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Topbar do PDV */}
      <header className="topbar">
        <Link href="/" className="topbar-brand">
          <span className="brand-mark small">b</span>
          <b>Meu Comércio PDV</b>
        </Link>

        <nav className="nav-tabs">
          <Link href="/" className="active">
            Nova Venda (F2)
          </Link>
          <Link href="/gestao">
            Painel de Gestão & Estoque
          </Link>
        </nav>

        <div className="top-actions">
          <span className="operator-info">
            Op: <strong>{user?.username}</strong> {user?.isOwner && '(Dona)'}
          </span>
          <span className="clock mono">{clock}</span>
          <button
            className="ghost"
            onClick={async () => {
              await apiClient.logout();
              router.push('/login');
            }}
          >
            Sair
          </button>
        </div>
      </header>

      {/* Terminal de Balcão e Checkout */}
      <main className="pdv-page">
        {/* Banner de Feedback */}
        {message && (
          <div className={message.isError ? 'error' : 'notice'} role="alert">
            <span>{message.text}</span>
            <button className="soft" onClick={() => setMessage(null)}>
              Fechar
            </button>
          </div>
        )}

        <div className="pdv-grid">
          {/* COLUNA ESQUERDA: Leitor e Status */}
          <div className="pdv-left">
            {/* Leitor Contínuo */}
            <div className="card pdv-scan">
              <label htmlFor="barcode-scanner" className="eyebrow">
                Leitor de Código de Barras
              </label>
              <form onSubmit={handleBarcodeSubmit} className="barcode-row">
                <input
                  id="barcode-scanner"
                  ref={barcodeInputRef}
                  className="mono"
                  type="text"
                  autoFocus
                  placeholder="Escaneie ou digite e aperte Enter"
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                />
                <button className="primary" type="submit">
                  Adicionar Item
                </button>
              </form>
              <p className="hint" style={{ marginTop: '8px' }}>
                Atalhos: <kbd>Enter</kbd> Adicionar · <kbd>F4</kbd> Pagamento · <kbd>Esc</kbd> Limpar
              </p>
            </div>

            {/* Último Item Lido */}
            <div className="card">
              <span className="eyebrow">Último Item Lido</span>
              {lastItem ? (
                <div>
                  <span className="pdv-last-name">{lastItem.name}</span>
                  <div className="pdv-last-meta">
                    <small>Disponível: {lastItem.availableQuantity} un</small>
                    <strong className="mono">{formatMoney(lastItem.salePrice)}</strong>
                  </div>
                </div>
              ) : (
                <p className="muted" style={{ margin: '8px 0 0' }}>
                  Nenhum produto escaneado ainda.
                </p>
              )}
            </div>

            {/* Status da Operação */}
            <div className="card pdv-status-card">
              <span className="eyebrow">Status da Operação</span>
              <div>
                <span>Conexão</span>
                <span className={`status-badge ${isOnline ? 'open' : 'offline'}`}>
                  {isOnline ? '● Conectado Online' : '● Sem Internet (Modo Offline)'}
                </span>
              </div>
              <div>
                <span>Turno do Caixa</span>
                <span className={`status-badge ${cashOpen ? 'open' : 'closed'}`}>
                  {cashOpen ? `Aberto ${openedTimeString ? `(${openedTimeString})` : ''}` : 'Fechado'}
                </span>
              </div>
              <div>
                <span>Vendas Offline na Fila</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <strong className="mono">{offlineCount}</strong>
                  {offlineCount > 0 && isOnline && (
                    <button
                      className="soft"
                      style={{ padding: '2px 8px', fontSize: '12px' }}
                      onClick={triggerOfflineSync}
                      disabled={syncingOffline}
                    >
                      {syncingOffline ? 'Sincronizando...' : 'Sincronizar Agora'}
                    </button>
                  )}
                </div>
              </div>
            </div>

            <button
              className="soft pdv-clear"
              type="button"
              disabled={cart.length === 0}
              onClick={() => {
                if (confirm('Limpar todos os produtos deste carrinho?')) {
                  resetCartAndCheckout();
                  setMessage({ text: 'Carrinho limpo.' });
                }
              }}
            >
              Limpar Carrinho (Esc)
            </button>
          </div>

          {/* COLUNA CENTRAL: Carrinho Dinâmico */}
          <div className="card pdv-items">
            <div className="pdv-items-head">
              <span>#</span>
              <span>Produto</span>
              <span style={{ textAlign: 'center' }}>Qtd</span>
              <span style={{ textAlign: 'right' }}>Total</span>
            </div>

            <div className="cart-items">
              {cart.map((line, idx) => {
                const isLatest = lastItem?.id === line.product.id;
                const lineTotal = line.product.salePrice
                  ? Money.fromDecimal(line.product.salePrice).multiply(line.quantity)
                  : Money.zero();

                return (
                  <div key={line.product.id} className={`cart-item ${isLatest ? 'latest' : ''}`}>
                    <span className="mono muted">{idx + 1}</span>
                    <div className="cart-item-name">
                      <b>{line.product.name}</b>
                      <small className="mono">
                        {line.quantity} × {formatMoney(line.product.salePrice)}
                      </small>
                    </div>
                    <div className="cart-item-qty">
                      <button
                        className="soft"
                        type="button"
                        onClick={() => updateLineQuantity(line.product.id, -1)}
                      >
                        -
                      </button>
                      <span className="mono" style={{ fontWeight: 'bold' }}>
                        {line.quantity}
                      </span>
                      <button
                        className="soft"
                        type="button"
                        onClick={() => updateLineQuantity(line.product.id, 1)}
                      >
                        +
                      </button>
                    </div>
                    <strong className="mono cart-item-total">{lineTotal.formatBrl()}</strong>
                  </div>
                );
              })}

              {cart.length === 0 && (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--pdv-muted)' }}>
                  <h3 style={{ margin: '0 0 6px', color: 'var(--pdv-ink)' }}>Carrinho Vazio</h3>
                  <p>Escaneie ou digite o código de barras de um produto para iniciar a venda.</p>
                </div>
              )}
            </div>

            <div className="pdv-items-foot">
              <span>
                {cart.length} {cart.length === 1 ? 'item' : 'itens'} ({totalItemUnits} unidades)
              </span>
              <span>Subtotal: <strong className="mono">{subtotalMoney.formatBrl()}</strong></span>
            </div>
          </div>

          {/* COLUNA DIREITA: Resumo e Checkout */}
          <aside className="card pdv-checkout">
            <div className="pdv-total">
              <span className="eyebrow">Resumo da Venda</span>
              <div className="summary-line">
                <span>Itens no Carrinho</span>
                <b className="mono">{totalItemUnits}</b>
              </div>
              <div className="total-line">
                <span>Total a Pagar</span>
                <strong className="mono">{totalMoney.formatBrl()}</strong>
              </div>
            </div>

            <button
              className="primary wide"
              style={{ fontSize: '18px', padding: '16px' }}
              disabled={cart.length === 0}
              onClick={() => setIsCheckoutOpen(true)}
            >
              Ir para Pagamento (F4)
            </button>

            <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid var(--pdv-line)' }}>
              <Link href="/gestao" className="soft wide" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
                Gerenciar Caixa e Fiado
              </Link>
            </div>
          </aside>
        </div>

        {/* Rodapé com Atalhos */}
        <footer className="pdv-footer">
          <span><kbd>Enter</kbd> Adicionar item</span>
          <span><kbd>F4</kbd> Pagamento</span>
          <span><kbd>Esc</kbd> Limpar carrinho / Fechar</span>
          <span><kbd>F2</kbd> Nova venda</span>
        </footer>
      </main>

      {/* MODAL DE CHECKOUT COM DIVISÃO DE PAGAMENTOS */}
      {isCheckoutOpen && (
        <div className="dialog-backdrop">
          <div className="dialog-card" style={{ maxWidth: '520px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <h2>Finalizar Pagamento</h2>
              <strong className="mono" style={{ fontSize: '24px', color: 'var(--pdv-green)' }}>
                {totalMoney.formatBrl()}
              </strong>
            </div>

            {/* Seleção do Método Principal */}
            <div>
              <span className="eyebrow">Forma de Pagamento Principal</span>
              <fieldset className="pdv-methods">
                <label className="pdv-method">
                  <input
                    type="radio"
                    name="method"
                    value="CASH"
                    checked={paymentMethod === 'CASH'}
                    onChange={() => setPaymentMethod('CASH')}
                  />
                  <span>Dinheiro</span>
                </label>
                <label className="pdv-method">
                  <input
                    type="radio"
                    name="method"
                    value="PIX"
                    checked={paymentMethod === 'PIX'}
                    onChange={() => setPaymentMethod('PIX')}
                  />
                  <span>PIX</span>
                </label>
                <label className="pdv-method">
                  <input
                    type="radio"
                    name="method"
                    value="DEBIT_CARD"
                    checked={paymentMethod === 'DEBIT_CARD'}
                    onChange={() => setPaymentMethod('DEBIT_CARD')}
                  />
                  <span>Cartão Débito</span>
                </label>
                <label className="pdv-method">
                  <input
                    type="radio"
                    name="method"
                    value="CREDIT_CARD"
                    checked={paymentMethod === 'CREDIT_CARD'}
                    onChange={() => setPaymentMethod('CREDIT_CARD')}
                  />
                  <span>Cartão Crédito</span>
                </label>
                <label className="pdv-method" style={{ gridColumn: 'span 2' }}>
                  <input
                    type="radio"
                    name="method"
                    value="TAB"
                    checked={paymentMethod === 'TAB'}
                    onChange={() => {
                      setPaymentMethod('TAB');
                      setIsSplit(false);
                    }}
                  />
                  <span>Caderneta / Fiado</span>
                </label>
              </fieldset>
            </div>

            {/* Opções específicas para Fiado */}
            {paymentMethod === 'TAB' && (
              <div>
                <label className="eyebrow" htmlFor="customer-select">
                  Cliente Cadastrado no Fiado
                </label>
                <select
                  id="customer-select"
                  className="barcode-row"
                  style={{ width: '100%', padding: '10px' }}
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                >
                  <option value="">-- Selecione o cliente --</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.phone})
                    </option>
                  ))}
                </select>
                <p className="hint" style={{ marginTop: '4px' }}>
                  O sistema validará o limite disponível do cliente. Se ultrapassado, exigirá o PIN da dona.
                </p>
              </div>
            )}

            {/* Divisão de Pagamento (somente se não for fiado) */}
            {paymentMethod !== 'TAB' && (
              <div style={{ margin: '8px 0' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}>
                  <input
                    type="checkbox"
                    checked={isSplit}
                    onChange={(e) => setIsSplit(e.target.checked)}
                  />
                  Dividir pagamento com outra forma
                </label>
              </div>
            )}

            {/* Segunda forma de pagamento se dividida */}
            {isSplit && (
              <div style={{ background: '#f8faf9', padding: '12px', borderRadius: '8px', border: '1px solid var(--pdv-line)' }}>
                <span className="eyebrow">Segunda Forma de Pagamento</span>
                <fieldset className="pdv-methods three" style={{ margin: '6px 0' }}>
                  <label className="pdv-method">
                    <input
                      type="radio"
                      name="second-method"
                      value="PIX"
                      checked={secondMethod === 'PIX'}
                      onChange={() => setSecondMethod('PIX')}
                    />
                    <span>PIX</span>
                  </label>
                  <label className="pdv-method">
                    <input
                      type="radio"
                      name="second-method"
                      value="DEBIT_CARD"
                      checked={secondMethod === 'DEBIT_CARD'}
                      onChange={() => setSecondMethod('DEBIT_CARD')}
                    />
                    <span>Débito</span>
                  </label>
                  <label className="pdv-method">
                    <input
                      type="radio"
                      name="second-method"
                      value="CREDIT_CARD"
                      checked={secondMethod === 'CREDIT_CARD'}
                      onChange={() => setSecondMethod('CREDIT_CARD')}
                    />
                    <span>Crédito</span>
                  </label>
                </fieldset>

                <label className="eyebrow" htmlFor="second-val" style={{ marginTop: '8px' }}>
                  Valor da Segunda Parte (R$)
                </label>
                <input
                  id="second-val"
                  className="barcode-row mono"
                  style={{ width: '100%' }}
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={totalMoney.toDecimal()}
                  value={secondAmount}
                  onChange={(e) => setSecondAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            )}

            {/* Campo de Dinheiro Recebido e Cálculo de Troco */}
            {paymentMethod === 'CASH' && (
              <div>
                <label className="eyebrow" htmlFor="cash-received">
                  Valor em Dinheiro Recebido do Cliente (R$)
                </label>
                <input
                  id="cash-received"
                  className="barcode-row mono"
                  style={{ width: '100%', fontSize: '18px', fontWeight: 'bold' }}
                  type="number"
                  step="0.01"
                  min={0}
                  value={receivedCash}
                  onChange={(e) => setReceivedCash(e.target.value)}
                  placeholder={totalMoney.toDecimal()}
                />

                {cartSummary.changeAmount.isPositive() && (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      padding: '10px 14px',
                      background: 'var(--pdv-green-soft)',
                      borderRadius: '8px',
                      marginTop: '8px',
                    }}
                  >
                    <span style={{ fontWeight: 'bold', color: 'var(--pdv-green)' }}>Troco a Devolver:</span>
                    <strong className="mono" style={{ fontSize: '20px', color: 'var(--pdv-green)' }}>
                      {cartSummary.changeAmount.formatBrl()}
                    </strong>
                  </div>
                )}
              </div>
            )}

            <div className="dialog-actions">
              <button
                className="soft"
                type="button"
                onClick={() => setIsCheckoutOpen(false)}
                disabled={processing}
              >
                Voltar (Esc)
              </button>
              <button
                className="primary"
                type="button"
                onClick={() => handleFinalizeSale()}
                disabled={processing || (paymentMethod === 'TAB' && !selectedCustomerId)}
              >
                {processing ? 'Processando...' : 'Confirmar e Finalizar Venda'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE PIN DA PROPRIETÁRIA (PARA FIADO ACIMA DO LIMITE) */}
      {isPinModalOpen && (
        <div className="dialog-backdrop">
          <div className="dialog-card" style={{ maxWidth: '400px' }}>
            <span className="eyebrow">Autorização da Proprietária</span>
            <h2>PIN de Liberação</h2>
            <p className="muted">
              O limite de fiado do cliente foi ultrapassado. Digite o PIN da proprietária para autorizar esta venda a crédito na caderneta.
            </p>

            <div>
              <label className="eyebrow" htmlFor="owner-pin-input">PIN da Proprietária (4 a 6 dígitos)</label>
              <input
                id="owner-pin-input"
                className="barcode-row mono"
                style={{ width: '100%', fontSize: '24px', letterSpacing: '4px', textAlign: 'center' }}
                type="password"
                inputMode="numeric"
                maxLength={6}
                autoFocus
                value={ownerPin}
                onChange={(e) => setOwnerPin(e.target.value)}
                placeholder="••••"
              />
            </div>

            <div className="dialog-actions">
              <button
                className="soft"
                type="button"
                onClick={() => {
                  setIsPinModalOpen(false);
                  setOwnerPin('');
                }}
              >
                Cancelar
              </button>
              <button
                className="primary"
                type="button"
                disabled={processing || ownerPin.length < 4}
                onClick={() => handleFinalizeSale(ownerPin)}
              >
                {processing ? 'Autorizando...' : 'Autorizar e Registrar Fiado'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
