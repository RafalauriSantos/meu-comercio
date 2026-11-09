'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
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
import {
  formatSaleReceipt,
  formatCreditNote,
} from '@/frontend/lib/thermal-printer';
import { createCheckoutKeyStore } from '@/frontend/lib/checkout-idempotency';
import { PdvSkeleton } from '@/frontend/pdv/pdv-skeleton';
import { blocksImplicitSubmit } from '@/frontend/pdv/enter-submit';
import { createEscapeDismiss } from '@/frontend/lib/dismiss-on-escape';
import { isNameSearch, moveHighlight, SEARCH_DEBOUNCE_MS } from '@/frontend/pdv/product-search';
import { SearchResults, SEARCH_LIST_ID, searchOptionId } from '@/frontend/pdv/search-results';
import { useAutoDismiss } from '@/frontend/lib/use-auto-dismiss';
import { settleOfflineSale } from '@/frontend/lib/offline-sale-sender';
import {
  suggestCashAmounts,
  centsToInputValue,
  quickAmountLabel,
} from '@/frontend/pdv/quick-amounts';
import { AppHeader } from '@/frontend/ui/app-header';
import { WeightPrompt } from '@/frontend/pdv/weight-prompt';
import { CancelSaleModal } from '@/frontend/pdv/cancel-sale-modal';
import { VersionLabel } from '@/frontend/ui/version-label';
import { WEIGHT_STEP_GRAMS } from '@/frontend/pdv/weight-input';
import { formatQuantity, lineSubtotal } from '@/shared/domain/product-unit';
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
  const checkoutKeys = useRef(createCheckoutKeyStore());

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

  // Busca por nome no mesmo campo do código de barras. Os resultados só valem para o texto que os gerou.
  const [searchResults, setSearchResults] = useState<ProductItem[]>([]);
  const [searchFor, setSearchFor] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const searchText = barcodeInput.trim();
  const showSearch = isNameSearch(searchText) && searchFor === searchText && searchResults.length > 0;

  // Checkout Modal
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  // Produto vendido por peso à espera do peso da balança.
  const [weightProduct, setWeightProduct] = useState<ProductItem | null>(null);
  // Fiado stays behind the three-dots button until the operator opens it.
  const [showMoreMethods, setShowMoreMethods] = useState(false);
  const dotsButtonRef = useRef<HTMLButtonElement>(null);
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

  // Sangria e Suprimento
  // Cancelar uma venda já finalizada (a da lista de hoje), com o PIN da proprietária
  const [isCancelSaleOpen, setIsCancelSaleOpen] = useState(false);
  const [isCashOpModalOpen, setIsCashOpModalOpen] = useState(false);
  const [cashOpType, setCashOpType] = useState<'WITHDRAWAL' | 'DEPOSIT'>('WITHDRAWAL');
  const [cashOpAmount, setCashOpAmount] = useState('');
  const [cashOpReason, setCashOpReason] = useState('');

  // Impressão Térmica pós-venda
  const [printModalData, setPrintModalData] = useState<{
    receiptText: string;
    creditNoteText?: string;
    activeTab: 'receipt' | 'creditNote';
  } | null>(null);

  // Notificações e Feedback
  const [message, setMessage] = useState<{ text: string; isError?: boolean } | null>(null);
  useAutoDismiss(message, () => setMessage(null));
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
        (sale: OfflineSale) =>
          settleOfflineSale(() =>
            apiClient.createSale(
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
            )
          )
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

  // The fiado menu closes on an outside click or on Escape. Escape is stopped here, so it does not
  // also reach the global shortcut that clears the sale.
  useEffect(() => {
    if (!showMoreMethods) return;
    function handleOutsideClick(event: MouseEvent) {
      if (!(event.target as HTMLElement | null)?.closest('.pdv-menu')) setShowMoreMethods(false);
    }
    // Escape closes the menu and puts the focus back on the three-dots button.
    const handleEscape = createEscapeDismiss(() => {
      setShowMoreMethods(false);
      dotsButtonRef.current?.focus();
    });
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape, true);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape, true);
    };
  }, [showMoreMethods]);

  // Procura por nome enquanto a pessoa digita (só online; o cache offline guarda por código de barras).
  useEffect(() => {
    if (!isNameSearch(searchText) || !isOnline) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const { items } = await apiClient.searchProducts(searchText);
        if (cancelled) return;
        setSearchResults(items);
        setSearchFor(searchText);
        setHighlighted(0);
      } catch {
        if (!cancelled) setSearchResults([]);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchText, isOnline]);

  // Esc fecha a lista de produtos sem limpar a venda.
  useEffect(() => {
    if (!showSearch) return;
    const handleEscape = createEscapeDismiss(() => {
      setSearchResults([]);
      setSearchFor('');
    });
    document.addEventListener('keydown', handleEscape, true);
    return () => document.removeEventListener('keydown', handleEscape, true);
  }, [showSearch]);

  // Foco contínuo no leitor de código de barras
  useEffect(() => {
    if (!isCheckoutOpen && !isPinModalOpen && !weightProduct && !isCancelSaleOpen) {
      barcodeInputRef.current?.focus();
    }
  }, [isCheckoutOpen, isPinModalOpen, weightProduct, isCancelSaleOpen]);

  // Cálculos do Carrinho via CartCalculator
  const calculatorItems: CalculatorCartItem[] = useMemo(() => {
    return cart.map((line) => ({
      productId: line.product.id,
      name: line.product.name,
      price: Money.fromDecimal(line.product.salePrice),
      quantity: line.quantity,
      unit: line.product.unit,
    }));
  }, [cart]);

  const totalItemUnits = useMemo(() => {
    // Um produto vendido por peso conta como 1 item, não como gramas.
    return cart.reduce((acc, l) => acc + (l.product.unit === 'KG' ? 1 : l.quantity), 0);
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
    checkoutKeys.current.reset();
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
      // Same key as the failed online attempt: if the server already recorded it, the sync gets 409 and treats it as done.
      idempotencyKey: checkoutKeys.current.current(),
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
      // A janela do peso e a de cancelar venda têm os próprios atalhos (Enter e Esc).
      if (weightProduct || isCancelSaleOpen) return;

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
  }, [cart.length, isCheckoutOpen, isPinModalOpen, weightProduct, isCancelSaleOpen]);

  // Produto por unidade entra com 1; produto por peso pergunta o peso antes.
  function addProductToCart(product: ProductItem) {
    if (product.unit === 'KG') {
      setLastItem(product);
      setWeightProduct(product);
      return;
    }
    addQuantityToCart(product, 1);
  }

  function addWeighedToCart(product: ProductItem, grams: number) {
    setWeightProduct(null);
    addQuantityToCart(product, grams);
    barcodeInputRef.current?.focus();
  }

  function addQuantityToCart(product: ProductItem, quantity: number) {
    setCart((current) => {
      const index = current.findIndex((item) => item.product.id === product.id);
      if (index >= 0) {
        const updated = [...current];
        updated[index] = {
          ...updated[index],
          quantity: updated[index].quantity + quantity,
        };
        return updated;
      }
      return [...current, { product, quantity }];
    });

    setLastItem(product);
  }

  function pickSearchResult(product: ProductItem) {
    setBarcodeInput('');
    setSearchResults([]);
    setSearchFor('');
    setMessage(null);
    addProductToCart(product);
    barcodeInputRef.current?.focus();
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showSearch) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((current) => moveHighlight(current, searchResults.length, e.key));
    }
  }

  // Adicionar produto por código de barras (ou, com texto, o produto escolhido na lista)
  async function handleBarcodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    const code = barcodeInput.trim();
    if (!code) return;

    // Com a lista de nomes aberta, Enter escolhe o produto destacado. Sem lista (o leitor de código de barras
    // digita e envia antes da busca terminar), segue como código de barras.
    if (showSearch && searchResults[highlighted]) {
      pickSearchResult(searchResults[highlighted]);
      return;
    }

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
              unit: product.unit,
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
              unit: cached.unit,
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

      addProductToCart(product);
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
            const step = line.product.unit === 'KG' ? WEIGHT_STEP_GRAMS : 1;
            const nextQty = line.quantity + delta * step;
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
      // Venda fiado: o cliente é obrigatório. A checagem de limite e o PIN
      // da dona são feitos pelo servidor, em /api/sales.
      if (paymentMethod === 'TAB' && !selectedCustomerId) {
        setMessage({ text: 'Selecione o cliente para registrar o fiado.', isError: true });
        return;
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
          method: p.method as 'CASH' | 'PIX' | 'DEBIT_CARD' | 'CREDIT_CARD' | 'TAB',
          amount: p.amount.toDecimal(),
          receivedAmount: p.receivedAmount ? p.receivedAmount.toDecimal() : undefined,
          externalReference: p.method === 'TAB' ? selectedCustomerId || undefined : undefined,
        })),
        ownerPin: paymentMethod === 'TAB' ? (pinToUse || ownerPin || undefined) : undefined,
      };

      // Same key on every retry of this checkout, so the server records the sale once.
      const idempotencyKey = checkoutKeys.current.current();
      const saleRes = await apiClient.createSale(salePayload, idempotencyKey);
      const changeMsg =
        paymentMethod === 'CASH' && cartSummary.changeAmount.isPositive()
          ? ` Troco: ${cartSummary.changeAmount.formatBrl()}`
          : '';

      const receiptText = formatSaleReceipt({
        store: { name: 'Meu Comércio' },
        saleId: saleRes.id.slice(0, 8),
        date: new Date(),
        items: cart.map((line) => {
          const unit = Money.fromDecimal(line.product.salePrice);
          const subtotalOfLine = lineSubtotal(unit, line.quantity, line.product.unit);
          return {
            name: line.product.name,
            quantity: line.quantity,
            unitPrice: unit.toDecimal(),
            subtotal: subtotalOfLine.toDecimal(),
            unit: line.product.unit,
          };
        }),
        subtotal: cartSummary.subtotal.toDecimal(),
        total: cartSummary.total.toDecimal(),
        payments: paymentInputs.map((p) => ({
          method: p.method === 'CASH' ? 'DINHEIRO' : p.method === 'TAB' ? 'FIADO' : p.method,
          amount: p.amount.toDecimal(),
          receivedAmount: p.receivedAmount ? p.receivedAmount.toDecimal() : undefined,
          changeAmount:
            p.method === 'CASH' && cartSummary.changeAmount.isPositive()
              ? cartSummary.changeAmount.toDecimal()
              : undefined,
        })),
        operatorName: user?.username,
      });

      if (paymentMethod === 'TAB') {
        const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);
        const creditNoteText = formatCreditNote({
          store: { name: 'Meu Comércio' },
          saleId: saleRes.id.slice(0, 8),
          date: new Date(),
          customer: {
            name: selectedCustomer?.name ?? 'Cliente Caderneta',
            phone: selectedCustomer?.phone ?? '',
          },
          previousDebt: '0.00',
          amount: cartSummary.total.toDecimal(),
          newDebt: cartSummary.total.toDecimal(),
          operatorName: user?.username,
        });
        setPrintModalData({
          receiptText: creditNoteText,
          creditNoteText,
          activeTab: 'creditNote',
        });
      } else {
        setPrintModalData({
          receiptText,
          activeTab: 'receipt',
        });
      }

      setMessage({
        text: `Venda #${saleRes.id.slice(0, 8)} confirmada com sucesso!${changeMsg}`,
      });
      resetCartAndCheckout();
    } catch (err) {
      // The server already recorded this checkout (for example, the first response was lost).
      // Do not let the operator sell it again.
      if (err instanceof ApiError && err.code === 'DUPLICATE_SALE') {
        resetCartAndCheckout();
        setMessage({
          text: 'Esta venda já havia sido registrada. O carrinho foi limpo. Confira o histórico antes de repetir.',
        });
        return;
      }

      if (paymentMethod === 'TAB' && err instanceof ApiError && err.status === 403 && !pinToUse) {
        setIsPinModalOpen(true);
        setMessage({
          text: 'Limite de fiado excedido ou necessária autorização da proprietária.',
          isError: true,
        });
        return;
      }

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

  async function handleCashOperation(e: React.FormEvent) {
    e.preventDefault();
    setProcessing(true);
    try {
      const val = parseCurrencyInput(cashOpAmount);
      if (val <= 0) {
        setMessage({ text: 'O valor da operação deve ser maior que zero.', isError: true });
        return;
      }
      if (cashOpReason.trim().length < 3) {
        setMessage({ text: 'O motivo deve conter no mínimo 3 caracteres.', isError: true });
        return;
      }

      if (cashOpType === 'WITHDRAWAL') {
        const res = await apiClient.recordWithdrawal({
          amount: val,
          reason: cashOpReason.trim(),
        });
        setMessage({
          text: `Sangria de ${formatMoney(res.amount)} realizada com sucesso! Saldo em caixa: ${formatMoney(res.expectedCash)}.`,
        });
      } else {
        const res = await apiClient.recordDeposit({
          amount: val,
          reason: cashOpReason.trim(),
        });
        setMessage({
          text: `Suprimento de ${formatMoney(res.amount)} realizado com sucesso! Saldo em caixa: ${formatMoney(res.expectedCash)}.`,
        });
      }

      const updatedCash = await apiClient.getCurrentCash();
      setCashSession(updatedCash.session);
      setIsCashOpModalOpen(false);
      setCashOpAmount('');
      setCashOpReason('');
    } catch (err) {
      setMessage({
        text: getErrorMessage(err, 'Erro ao registrar operação de caixa.'),
        isError: true,
      });
    } finally {
      setProcessing(false);
    }
  }

  if (loading) {
    return <PdvSkeleton />;
  }

  const openedTimeString = cashSession?.openedAt
    ? new Date(cashSession.openedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : '';

  const itemsSummary = `${cart.length} ${cart.length === 1 ? 'item' : 'itens'} · ${totalItemUnits} ${
    totalItemUnits === 1 ? 'unidade' : 'unidades'
  }`;

  // Valor da primeira forma de pagamento (o total inteiro, ou o restante quando a venda é dividida).
  const cashDueCents = Math.round(Number(paymentInputs[0]?.amount.toDecimal() ?? '0') * 100);
  const quickAmounts = suggestCashAmounts(cashDueCents);

  async function handleLogout() {
    await apiClient.logout();
    router.push('/login');
  }

  function clearCartWithConfirmation() {
    if (confirm('Limpar todos os produtos deste carrinho?')) {
      resetCartAndCheckout();
      setMessage({ text: 'Carrinho limpo.' });
    }
  }

  function selectMethod(method: CalcPaymentMethod) {
    setPaymentMethod(method);
    if (method === 'TAB') setIsSplit(false);
  }

  function startPayment(method: CalcPaymentMethod) {
    selectMethod(method);
    setIsCheckoutOpen(true);
  }

  const mainMethods: { value: CalcPaymentMethod; label: string }[] = [
    { value: 'CASH', label: 'Dinheiro' },
    { value: 'PIX', label: 'Pix' },
    { value: 'DEBIT_CARD', label: 'Débito' },
    { value: 'CREDIT_CARD', label: 'Crédito' },
  ];

  // Fiado is kept out of the main buttons: it shows up behind the three-dots button.
  const tabMethod: { value: CalcPaymentMethod; label: string } = { value: 'TAB', label: 'Fiado' };

  const secondMethods: { value: CalcPaymentMethod; label: string }[] = [
    { value: 'PIX', label: 'Pix' },
    { value: 'DEBIT_CARD', label: 'Débito' },
    { value: 'CREDIT_CARD', label: 'Crédito' },
  ];

  return (
    <div className="pdv-app">
      <AppHeader
        active="venda"
        username={user?.username}
        isOwner={user?.isOwner}
        clock={clock}
        onLogout={handleLogout}
      />

      <main className="pdv-main">
        {message && (
          <div className={message.isError ? 'error' : 'notice'} role="alert">
            <span>{message.text}</span>
            <button className="soft" type="button" onClick={() => setMessage(null)}>
              Fechar
            </button>
          </div>
        )}

        {!isOnline && (
          <div className="pdv-offline" role="status">
            Sem conexão com a internet. Apenas vendas simples em dinheiro são aceitas; elas ficam salvas neste
            terminal e sincronizam quando a conexão voltar.
          </div>
        )}

        <section className="pdv-col" aria-label="Venda atual">
          <div className="card pdv-scan">
            <label htmlFor="barcode-scanner" className="pdv-card-title">
              Adicionar produto
            </label>
            <form onSubmit={handleBarcodeSubmit} className="pdv-scan-row">
              <input
                id="barcode-scanner"
                ref={barcodeInputRef}
                className="pdv-scan-input"
                type="text"
                autoFocus
                autoComplete="off"
                placeholder="Escaneie, digite o código ou o nome do produto"
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                role="combobox"
                aria-expanded={showSearch}
                aria-controls={SEARCH_LIST_ID}
                aria-autocomplete="list"
                aria-activedescendant={showSearch ? searchOptionId(highlighted) : undefined}
              />
              <button className="primary pdv-scan-submit" type="submit">
                Adicionar
              </button>
            </form>
            {showSearch && <SearchResults results={searchResults} highlighted={highlighted} onPick={pickSearchResult} />}
            <p className="pdv-scan-hint pdv-hide-sm">
              Enter adiciona · F4 recebe · Esc limpa a venda
            </p>
            <p className="sr-only" aria-live="polite">
              {lastItem ? (
                <>
                  <span className="muted">Último lido:</span> <strong>{lastItem.name}</strong>
                  <span className="muted num">
                    {' '}
                    · {formatMoney(lastItem.salePrice)} · disponível: {formatQuantity(lastItem.availableQuantity, lastItem.unit)}{lastItem.unit === 'KG' ? '' : ' un'}
                  </span>
                </>
              ) : (
                <span className="muted">Nenhum produto escaneado ainda.</span>
              )}
            </p>
          </div>

          <div className="card pdv-cart">
            <div className="pdv-cart-head">
              <h2 className="pdv-title">Itens da venda</h2>
              <span className="pdv-meta">{itemsSummary}</span>
            </div>

            <div className="pdv-table-wrap">
              <table className="pdv-table">
                <thead>
                  <tr>
                    <th scope="col">Produto</th>
                    <th scope="col" className="pdv-center">
                      Qtd
                    </th>
                    <th scope="col" className="pdv-right pdv-hide-sm">
                      Preço
                    </th>
                    <th scope="col" className="pdv-right">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map((line) => {
                    const isLatest = lastItem?.id === line.product.id;
                    const lineTotal = line.product.salePrice
                      ? lineSubtotal(Money.fromDecimal(line.product.salePrice), line.quantity, line.product.unit)
                      : Money.zero();

                    return (
                      <tr key={line.product.id} className={isLatest ? 'is-latest' : undefined}>
                        <td className="pdv-product">
                          {line.product.name}
                          {isLatest && <span className="pdv-latest-tag pdv-hide-sm">último lido</span>}
                          <span className="pdv-unit num">
                            {formatMoney(line.product.salePrice)} {line.product.unit === 'KG' ? 'por kg' : 'cada'}
                          </span>
                        </td>
                        <td className="pdv-center">
                          <span className="pdv-qty">
                            <button
                              className="pdv-qbtn"
                              type="button"
                              aria-label={`Diminuir quantidade de ${line.product.name}`}
                              onClick={() => updateLineQuantity(line.product.id, -1)}
                            >
                              −
                            </button>
                            <span className="pdv-qty-value num">{formatQuantity(line.quantity, line.product.unit)}</span>
                            <button
                              className="pdv-qbtn"
                              type="button"
                              aria-label={`Aumentar quantidade de ${line.product.name}`}
                              onClick={() => updateLineQuantity(line.product.id, 1)}
                            >
                              +
                            </button>
                          </span>
                        </td>
                        <td className="pdv-right pdv-hide-sm pdv-price num">{formatMoney(line.product.salePrice)}
                          {line.product.unit === 'KG' ? '/kg' : ''}
                        </td>
                        <td className="pdv-right pdv-line-total num">{lineTotal.formatBrl()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {cart.length === 0 && (
                <div className="pdv-empty">
                  <p className="pdv-empty-title">Carrinho vazio</p>
                  <p className="muted">Escaneie ou digite o código de barras de um produto para iniciar a venda.</p>
                </div>
              )}
            </div>
          </div>
        </section>

        <aside className="pdv-col pdv-side" aria-label="Pagamento">
          <div className="pdv-total-card">
            <div className="pdv-total-label">Total a pagar</div>
            <div className="pdv-total-value num">{totalMoney.formatBrl()}</div>
            <div className="pdv-total-meta">{itemsSummary}</div>
            <button
              className="primary pdv-pay"
              type="button"
              disabled={cart.length === 0}
              onClick={() => setIsCheckoutOpen(true)}
            >
              <span>Receber pagamento</span>
              <kbd className="kbd">F4</kbd>
            </button>
            <button
              className="pdv-cancel"
              type="button"
              disabled={cart.length === 0}
              onClick={clearCartWithConfirmation}
            >
              Cancelar venda · Esc
            </button>
          </div>

          <div className="card pdv-methods-card">
            <div className="pdv-methods-head">
              <h2 className="pdv-card-title">Forma de pagamento</h2>
              <div className="pdv-menu">
                <button
                  type="button"
                  ref={dotsButtonRef}
                  className="pdv-dots"
                  aria-label="Mais opções de pagamento"
                  aria-expanded={showMoreMethods}
                  aria-controls="pdv-more-methods"
                  onClick={() => setShowMoreMethods((open) => !open)}
                >
                  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="currentColor">
                    <circle cx="5" cy="12" r="2" />
                    <circle cx="12" cy="12" r="2" />
                    <circle cx="19" cy="12" r="2" />
                  </svg>
                </button>
                {showMoreMethods && (
                  <div id="pdv-more-methods" className="pdv-menu-list">
                    <button
                      type="button"
                      className="pdv-menu-item"
                      disabled={cart.length === 0}
                      onClick={() => {
                        setShowMoreMethods(false);
                        startPayment('TAB');
                      }}
                    >
                      Fiado
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="pdv-quick-methods">
              {mainMethods.map((method) => (
                <button
                  key={method.value}
                  className="outline pdv-method-btn"
                  type="button"
                  disabled={cart.length === 0}
                  onClick={() => startPayment(method.value)}
                >
                  {method.label}
                </button>
              ))}
            </div>
          </div>
        </aside>
      </main>

      <footer className="pdv-status">
        <span className="pdv-conn">
          <span className={`pdv-dot${isOnline ? '' : ' is-offline'}`} aria-hidden="true" />
          <strong>{isOnline ? 'Online' : 'Sem internet'}</strong>
        </span>
        <span className="pdv-hide-sm">
          {cashOpen
            ? `Caixa aberto${openedTimeString ? ` desde ${openedTimeString}` : ''}`
            : 'Caixa fechado'}{' '}
          · {offlineCount} {offlineCount === 1 ? 'venda offline' : 'vendas offline'}
        </span>
        <span className="pdv-hide-sm">
          <VersionLabel />
        </span>
        {offlineCount > 0 && isOnline && (
          <button
            className="outline pdv-small"
            type="button"
            onClick={triggerOfflineSync}
            disabled={syncingOffline}
          >
            {syncingOffline ? 'Sincronizando...' : 'Sincronizar agora'}
          </button>
        )}
        <span className="pdv-status-actions">
          <button
            type="button"
            className="outline pdv-small pdv-danger-outline"
            disabled={!cashOpen || !isOnline}
            onClick={() => setIsCancelSaleOpen(true)}
          >
            Cancelar venda finalizada
          </button>
          <button
            type="button"
            className="outline pdv-small"
            disabled={!cashOpen}
            onClick={() => {
              setCashOpType('WITHDRAWAL');
              setIsCashOpModalOpen(true);
            }}
          >
            Sangria
          </button>
          <button
            type="button"
            className="outline pdv-small"
            disabled={!cashOpen}
            onClick={() => {
              setCashOpType('DEPOSIT');
              setIsCashOpModalOpen(true);
            }}
          >
            Suprimento
          </button>
        </span>
        <span className="pdv-hide-sm">Enter adicionar · F4 receber · Esc limpar · F2 nova venda</span>
      </footer>

      {/* MODAL DE PAGAMENTO (FORMA ÚNICA OU DIVIDIDA) */}
      {isCheckoutOpen && (
        <div className="pdv-overlay">
          <form
            className="pdv-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pdv-pay-title"
            onKeyDown={(e) => {
              // Enter confirms the sale only from the received amount field.
              if (blocksImplicitSubmit(e.key, e.target as HTMLElement)) e.preventDefault();
            }}
            onSubmit={(e) => {
              e.preventDefault();
              if (paymentMethod === 'TAB' && !selectedCustomerId) return;
              void handleFinalizeSale();
            }}
          >
            <header className="pdv-modal-head">
              <h2 id="pdv-pay-title" className="pdv-title">
                Receber pagamento
              </h2>
              <button
                className="pdv-close"
                type="button"
                aria-label="Fechar"
                onClick={() => setIsCheckoutOpen(false)}
                disabled={processing}
              >
                ✕
              </button>
            </header>

            <div className="pdv-modal-body">
              <div className="pdv-modal-total">
                <span className="pdv-total-caption">Total da venda</span>
                <span className="pdv-modal-total-value num">{totalMoney.formatBrl()}</span>
              </div>

              <div role="group" aria-label="Forma de pagamento" className="pdv-choices">
                {[...mainMethods, ...(paymentMethod === 'TAB' ? [tabMethod] : [])].map((method) => (
                  <button
                    key={method.value}
                    type="button"
                    className="pdv-choice"
                    aria-pressed={paymentMethod === method.value}
                    onClick={() => selectMethod(method.value)}
                  >
                    {method.label}
                  </button>
                ))}
              </div>

              {paymentMethod === 'TAB' && (
                <div className="pdv-field">
                  <label className="field-label" htmlFor="customer-select">
                    Cliente cadastrado no fiado
                  </label>
                  <select
                    id="customer-select"
                    className="input"
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
                  <p className="hint pdv-field-hint">
                    O sistema validará o limite disponível do cliente. Se ultrapassado, exigirá o PIN da dona.
                  </p>
                </div>
              )}

              {paymentMethod !== 'TAB' && (
                <label className="pdv-check">
                  <input type="checkbox" checked={isSplit} onChange={(e) => setIsSplit(e.target.checked)} />
                  Dividir pagamento com outra forma
                </label>
              )}

              {isSplit && (
                <div className="pdv-split">
                  <div role="group" aria-label="Segunda forma de pagamento" className="pdv-choices is-three">
                    {secondMethods.map((method) => (
                      <button
                        key={method.value}
                        type="button"
                        className="pdv-choice"
                        aria-pressed={secondMethod === method.value}
                        onClick={() => setSecondMethod(method.value)}
                      >
                        {method.label}
                      </button>
                    ))}
                  </div>

                  <label className="field-label" htmlFor="second-val">
                    Valor da segunda parte (R$)
                  </label>
                  <input
                    id="second-val"
                    className="input num"
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

              {paymentMethod === 'CASH' && (
                <div className="pdv-field">
                  <label className="pdv-card-title" htmlFor="cash-received">
                    Valor recebido (R$)
                  </label>
                  <input
                    id="cash-received"
                    className="pdv-big-input num"
                    type="number"
                    step="0.01"
                    min={0}
                    value={receivedCash}
                    onChange={(e) => setReceivedCash(e.target.value)}
                    placeholder={totalMoney.toDecimal()}
                  />

                  {cashDueCents > 0 && (
                    <div className="pdv-quick-amounts">
                      <button
                        type="button"
                        className="outline"
                        onClick={() => setReceivedCash(centsToInputValue(cashDueCents))}
                      >
                        Exato
                      </button>
                      {quickAmounts.map((cents) => (
                        <button
                          key={cents}
                          type="button"
                          className="outline"
                          onClick={() => setReceivedCash(centsToInputValue(cents))}
                        >
                          {quickAmountLabel(cents)}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="pdv-change" aria-live="polite">
                    <span className="pdv-change-label">Troco</span>
                    <strong className="pdv-change-value num">{cartSummary.changeAmount.formatBrl()}</strong>
                  </div>
                </div>
              )}
            </div>

            <footer className="pdv-modal-foot">
              <button
                className="outline pdv-back"
                type="button"
                onClick={() => setIsCheckoutOpen(false)}
                disabled={processing}
              >
                Voltar · Esc
              </button>
              <button
                className="primary pdv-confirm"
                type="submit"
                disabled={processing || (paymentMethod === 'TAB' && !selectedCustomerId)}
              >
                <span>{processing ? 'Processando...' : 'Confirmar venda'}</span>
                {!processing && <kbd className="kbd">Enter</kbd>}
              </button>
            </footer>
          </form>
        </div>
      )}

      {/* MODAL DE PIN DA PROPRIETÁRIA (PARA FIADO ACIMA DO LIMITE) */}
      {isCancelSaleOpen && (
        <CancelSaleModal
          onClose={() => {
            setIsCancelSaleOpen(false);
            barcodeInputRef.current?.focus();
          }}
          onCancelled={(shortId) => {
            setIsCancelSaleOpen(false);
            setMessage({
              text: `Venda ${shortId} cancelada. Os produtos voltaram ao estoque e os valores foram estornados.`,
            });
            barcodeInputRef.current?.focus();
          }}
        />
      )}

      {weightProduct && (
        <WeightPrompt
          product={weightProduct}
          onConfirm={(grams) => addWeighedToCart(weightProduct, grams)}
          onCancel={() => {
            setWeightProduct(null);
            barcodeInputRef.current?.focus();
          }}
        />
      )}

      {isPinModalOpen && (
        <div className="pdv-overlay">
          <div className="pdv-modal is-narrow" role="dialog" aria-modal="true" aria-labelledby="pdv-pin-title">
            <div className="pdv-modal-body">
              <p className="pdv-eyebrow">Autorização da proprietária</p>
              <h2 id="pdv-pin-title" className="pdv-title">
                PIN de liberação
              </h2>
              <p className="muted pdv-modal-text">
                O limite de fiado do cliente foi ultrapassado. Digite o PIN da proprietária para autorizar esta venda
                a crédito na caderneta.
              </p>

              <label className="field-label" htmlFor="owner-pin-input">
                PIN da proprietária (6 dígitos)
              </label>
              <input
                id="owner-pin-input"
                className="input pdv-pin"
                type="password"
                inputMode="numeric"
                maxLength={6}
                autoFocus
                value={ownerPin}
                onChange={(e) => setOwnerPin(e.target.value)}
                placeholder="••••••"
              />
            </div>

            <footer className="pdv-modal-foot">
              <button
                className="outline pdv-back"
                type="button"
                onClick={() => {
                  setIsPinModalOpen(false);
                  setOwnerPin('');
                }}
              >
                Cancelar
              </button>
              <button
                className="primary pdv-confirm"
                type="button"
                disabled={processing || !/^\d{6}$/.test(ownerPin)}
                onClick={() => handleFinalizeSale(ownerPin)}
              >
                {processing ? 'Autorizando...' : 'Autorizar e registrar fiado'}
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* MODAL DE SANGRIA E SUPRIMENTO DE CAIXA */}
      {isCashOpModalOpen && (
        <div className="pdv-overlay">
          <form
            onSubmit={handleCashOperation}
            className="pdv-modal is-narrow"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pdv-cashop-title"
          >
            <div className="pdv-modal-body">
              <p className="pdv-eyebrow">Operação de balcão</p>
              <h2 id="pdv-cashop-title" className="pdv-title">
                {cashOpType === 'WITHDRAWAL' ? 'Sangria de caixa' : 'Suprimento de caixa'}
              </h2>
              <p className="muted pdv-modal-text">
                {cashOpType === 'WITHDRAWAL'
                  ? 'Retirada de dinheiro da gaveta para cofre, pagamento de despesa ou recolhimento de segurança.'
                  : 'Entrada de dinheiro na gaveta para reforço de troco ou moeda inicial.'}
              </p>

              <div role="group" aria-label="Tipo de operação" className="pdv-choices is-two">
                <button
                  type="button"
                  className="pdv-choice"
                  aria-pressed={cashOpType === 'WITHDRAWAL'}
                  onClick={() => setCashOpType('WITHDRAWAL')}
                >
                  Sangria (saída)
                </button>
                <button
                  type="button"
                  className="pdv-choice"
                  aria-pressed={cashOpType === 'DEPOSIT'}
                  onClick={() => setCashOpType('DEPOSIT')}
                >
                  Suprimento (entrada)
                </button>
              </div>

              <div className="pdv-field">
                <label className="field-label" htmlFor="cash-op-amount">
                  Valor (R$)
                </label>
                <input
                  id="cash-op-amount"
                  className="input num"
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

              <div className="pdv-field">
                <label className="field-label" htmlFor="cash-op-reason">
                  Motivo obrigatório (mínimo 3 caracteres)
                </label>
                <input
                  id="cash-op-reason"
                  className="input"
                  required
                  value={cashOpReason}
                  onChange={(e) => setCashOpReason(e.target.value)}
                  placeholder={cashOpType === 'WITHDRAWAL' ? 'Ex: Recolhimento para cofre' : 'Ex: Moedas de troco'}
                />
              </div>
            </div>

            <footer className="pdv-modal-foot">
              <button
                className="outline pdv-back"
                type="button"
                onClick={() => {
                  setIsCashOpModalOpen(false);
                  setCashOpAmount('');
                  setCashOpReason('');
                }}
              >
                Cancelar
              </button>
              <button
                className="primary pdv-confirm"
                type="submit"
                disabled={processing || !cashOpAmount || cashOpReason.trim().length < 3}
              >
                {processing ? 'Registrando...' : cashOpType === 'WITHDRAWAL' ? 'Confirmar sangria' : 'Confirmar suprimento'}
              </button>
            </footer>
          </form>
        </div>
      )}

      {/* MODAL DE IMPRESSÃO TÉRMICA PÓS-VENDA */}
      {printModalData && (
        <div className="pdv-overlay no-print">
          <div className="pdv-modal is-narrow" role="dialog" aria-modal="true" aria-labelledby="pdv-print-title">
            <div className="pdv-modal-body">
              <p className="pdv-eyebrow">Pós-venda · impressão térmica</p>
              <h2 id="pdv-print-title" className="pdv-title">
                Comprovante da venda
              </h2>

              {printModalData.creditNoteText && (
                <div role="group" aria-label="Tipo de comprovante" className="pdv-choices is-two">
                  <button
                    type="button"
                    className="pdv-choice"
                    aria-pressed={printModalData.activeTab === 'receipt'}
                    onClick={() => setPrintModalData({ ...printModalData, activeTab: 'receipt' })}
                  >
                    Cupom não fiscal
                  </button>
                  <button
                    type="button"
                    className="pdv-choice"
                    aria-pressed={printModalData.activeTab === 'creditNote'}
                    onClick={() => setPrintModalData({ ...printModalData, activeTab: 'creditNote' })}
                  >
                    Canhoto fiado (assinatura)
                  </button>
                </div>
              )}

              <pre className="pdv-receipt">
                {printModalData.activeTab === 'receipt'
                  ? printModalData.receiptText
                  : printModalData.creditNoteText}
              </pre>
            </div>

            <footer className="pdv-modal-foot">
              <button className="outline pdv-back" type="button" onClick={() => setPrintModalData(null)}>
                Fechar
              </button>
              <button className="primary pdv-confirm" type="button" onClick={() => window.print()}>
                Imprimir (Ctrl+P)
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Elemento de impressão térmica invisível em tela e renderizado no print */}
      {printModalData && (
        <div className="thermal-print-area" aria-hidden="true">
          {printModalData.activeTab === 'receipt'
            ? printModalData.receiptText
            : printModalData.creditNoteText}
        </div>
      )}
    </div>
  );
}
