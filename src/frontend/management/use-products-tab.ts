'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { apiClient } from '@/frontend/lib/api-client';
import { parseCurrencyInput, getErrorMessage } from '@/frontend/lib/formatters';
import { findProductWithBarcode, takenBarcodeMessage } from '@/frontend/management/barcode-check';
import type { ProductUnit } from '@/shared/domain/product-unit';
import { useProductsList } from '@/frontend/management/use-products-list';
import { initialStockToQuantity, restockToQuantity, type StockFilter } from '@/frontend/management/stock';

type Feedback = { text: string; isError?: boolean; isSuccess?: boolean } | null;

interface UseProductsTabParams {
  setFeedback: (feedback: Feedback) => void;
  setProcessing: (processing: boolean) => void;
  setLoadFailed: (update: (f: { products?: boolean }) => { products?: boolean }) => void;
  // Owned by the page: it is also read outside this tab, on the first load.
  stockControl: boolean;
  setStockControl: (enabled: boolean) => void;
}

/** State, load and handlers of the products tab. Called by the page, so a draft survives a tab change. */
export function useProductsTab({ setFeedback, setProcessing, setLoadFailed, stockControl, setStockControl }: UseProductsTabParams) {
  // Estados de Produtos
  const list = useProductsList({ setLoadFailed });
  const { products, loadProducts } = list;
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [productQuery, setProductQuery] = useState('');
  const [showNewProduct, setShowNewProduct] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [newBarcode, setNewBarcode] = useState('');
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newStock, setNewStock] = useState('0');
  const [newUnit, setNewUnit] = useState<ProductUnit>('UN');
  // Aviso de código de barras já cadastrado, e o campo do nome, para onde o foco vai depois do bipador.
  const [barcodeNote, setBarcodeNote] = useState<string | null>(null);
  const newNameRef = useRef<HTMLInputElement>(null);
  // Each scan that opens the form bumps this, and the effect below moves the cursor to the name once the form is on screen.
  const [nameFocusRequest, setNameFocusRequest] = useState(0);
  const [restockingId, setRestockingId] = useState<string | null>(null);
  const [restockQty, setRestockQty] = useState('1');
  const [restockReason, setRestockReason] = useState('');

  // --- Handlers de Produtos ---

  // A dona liga ou desliga o controle de estoque da loja.
  async function handleToggleStockControl() {
    const turningOff = stockControl;
    const question = turningOff
      ? 'Desligar o controle de estoque?\n\nAs vendas deixam de exigir saldo e de baixar o estoque, e as telas de estoque somem. Os saldos de hoje ficam guardados.'
      : 'Ligar o controle de estoque?\n\nAs vendas voltam a exigir saldo e a baixar o estoque. As vendas feitas com o controle desligado não baixaram nada, então os saldos podem estar desatualizados: confira os produtos depois de ligar.';
    if (!confirm(question)) return;

    setProcessing(true);
    setFeedback(null);
    try {
      const settings = await apiClient.updateStoreSettings({ stockControlEnabled: !stockControl });
      setStockControl(settings.stockControlEnabled);
      setFeedback({
        text: settings.stockControlEnabled
          ? 'Controle de estoque ligado. Confira os saldos dos produtos.'
          : 'Controle de estoque desligado. As vendas não dependem mais do estoque.',
        isSuccess: true,
      });
    } catch (err) {
      setFeedback({ text: getErrorMessage(err, 'Erro ao mudar o controle de estoque.'), isError: true });
    } finally {
      setProcessing(false);
    }
  }

  // Confere se o código (digitado ou lido pelo bipador) já está cadastrado.
  async function checkNewBarcode(code: string) {
    try {
      const existing = await findProductWithBarcode(apiClient.findProductByBarcode, code);
      setBarcodeNote(existing ? takenBarcodeMessage(existing) : null);
    } catch {
      // Sem resposta do servidor: o cadastro em si avisa se o código for repetido.
      setBarcodeNote(null);
    }
  }

  // O bipador envia Enter depois do código: em vez de enviar o formulário vazio, confere o código e vai para o nome.
  function handleNewBarcodeKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    void checkNewBarcode(e.currentTarget.value);
    newNameRef.current?.focus();
  }

  // The owner scanned a product with the tab open: a free code opens the form with it filled in; a taken one only warns.
  const handleScannedBarcode = useCallback(async (code: string) => {
    try {
      const existing = await findProductWithBarcode(apiClient.findProductByBarcode, code);
      if (existing) {
        setFeedback({ text: takenBarcodeMessage(existing), isError: true });
        return;
      }
    } catch {
      // Sem resposta do servidor: não perde o bip. O formulário abre e o cadastro avisa se o código for repetido.
    }
    setFeedback(null);
    setBarcodeNote(null);
    setNewBarcode(code);
    setShowNewProduct(true);
    setNameFocusRequest((n) => n + 1);
  }, [setFeedback]);

  useEffect(() => {
    if (nameFocusRequest > 0) newNameRef.current?.focus();
  }, [nameFocusRequest]);

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
      setFeedback({
        text: `Produto "${newName.trim()}" cadastrado com sucesso! Ele aparece em ordem alfabética: se não o vir, use Carregar mais.`,
        isSuccess: true,
      });
      setProductQuery('');
      setShowNewProduct(false);
      setNewBarcode('');
      setNewName('');
      setNewPrice('');
      setNewStock('0');
      setNewUnit('UN');
      setBarcodeNote(null);
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
      setFeedback({ text: 'Estoque reposto com sucesso!', isSuccess: true });
      setRestockingId(null);
      setRestockQty('1');
      setRestockReason('');
      list.applyRestock(productId, restockQuantity);
    } catch (err) {
      setFeedback({ text: getErrorMessage(err, 'Erro ao repor estoque.'), isError: true });
    } finally {
      setProcessing(false);
    }
  }

  return {
    products,
    hasMore: list.hasMore,
    summary: list.summary,
    loadingMore: list.loadingMore,
    loadMoreFailed: list.loadMoreFailed,
    loadMore: list.loadMore,
    stockFilter,
    setStockFilter,
    productQuery,
    setProductQuery,
    showNewProduct,
    setShowNewProduct,
    showImport,
    setShowImport,
    newBarcode,
    setNewBarcode,
    newName,
    setNewName,
    newPrice,
    setNewPrice,
    newStock,
    setNewStock,
    newUnit,
    setNewUnit,
    barcodeNote,
    setBarcodeNote,
    newNameRef,
    restockingId,
    setRestockingId,
    restockQty,
    setRestockQty,
    restockReason,
    setRestockReason,
    loadProducts,
    handleToggleStockControl,
    checkNewBarcode,
    handleNewBarcodeKeyDown,
    handleScannedBarcode,
    handleCreateProduct,
    handleRestock,
  };
}
