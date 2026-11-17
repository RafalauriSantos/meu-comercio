'use client';

import React from 'react';
import type { AuthUser } from '@/frontend/lib/api-client';
import { formatMoney } from '@/frontend/lib/formatters';
import { maskCurrencyDigits } from '@/frontend/lib/currency-mask';
import { formatQuantity } from '@/shared/domain/product-unit';
import { LoadFailureNotice } from '@/frontend/ui/load-failure-notice';
import { ImportProductsPanel } from '@/frontend/management/import-products-panel';
import { matchesStockFilter, stockStatus, type StockFilter } from '@/frontend/management/stock';
import { needingRestockCount, shownText, stockValueText } from '@/frontend/management/products-list';
import { ProductEditRow } from '@/frontend/management/product-edit-row';
import { useBarcodeScan } from '@/frontend/management/use-barcode-scan';
import type { useProductsTab } from './use-products-tab';

interface ProductsTabProps {
  tab: ReturnType<typeof useProductsTab>;
  stockControl: boolean;
  user: AuthUser | null;
  setFeedback: (feedback: { text: string; isError?: boolean; isSuccess?: boolean } | null) => void;
  loadFailed: { products?: boolean };
  retrying: boolean;
  processing: boolean;
  retry: (load: () => Promise<void>) => Promise<void>;
}

/** The products tab of the management panel (catalog and stock). The owner-only controls are decided here by `user?.isOwner`, as before. */
export function ProductsTab({ tab, stockControl, user, setFeedback, loadFailed, retrying, processing, retry }: ProductsTabProps) {
  const {
    products,
    hasMore,
    summary,
    loadingMore,
    loadMoreFailed,
    loadMore,
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
    edit,
    startEdit,
  } = tab;

  useBarcodeScan(handleScannedBarcode);

  const lowStockCount = needingRestockCount(summary);
  const visibleProducts = products.filter(
    (p) => !stockControl || matchesStockFilter(p.availableQuantity, stockFilter, p.unit)
  );

  const stockFilters: { value: StockFilter; label: string }[] = [
    { value: 'all', label: 'Todos' },
    { value: 'low', label: 'Estoque baixo' },
    { value: 'out', label: 'Sem estoque' },
  ];

  return (
          <section className="mg-section">
            {loadFailed.products && (
              <LoadFailureNotice what="os produtos" busy={retrying} onRetry={() => retry(() => loadProducts(productQuery))} />
            )}
            <div className="mg-kpis">
              <div className="mg-kpi">
                <div className="mg-kpi-label">Produtos cadastrados</div>
                <div className="mg-kpi-value num">{summary ? summary.total : '—'}</div>
              </div>
              {stockControl && (
                <>
                  <div className="mg-kpi mg-kpi-warn">
                    <div className="mg-kpi-label">Precisam de reposição</div>
                    <div className="mg-kpi-value num">{lowStockCount ?? '—'}</div>
                  </div>
                  <div className="mg-kpi">
                    <div className="mg-kpi-label">Valor em estoque (a preço de venda)</div>
                    <div className="mg-kpi-value num">{stockValueText(summary)}</div>
                  </div>
                </>
              )}
            </div>

            {/* Interruptor do controle de estoque (só a dona) */}
            {user?.isOwner && (
              <section className="card mg-stock-switch" aria-label="Controle de estoque">
                <div>
                  <strong>Controle de estoque: {stockControl ? 'ligado' : 'desligado'}</strong>
                  <p className="muted mg-stock-switch-note">
                    {stockControl
                      ? 'As vendas baixam o estoque e não passam do saldo.'
                      : 'As vendas não dependem do estoque: não precisam de saldo e não baixam nada.'}
                  </p>
                </div>
                <button type="button" className="outline" onClick={handleToggleStockControl} disabled={processing}>
                  {stockControl ? 'Desligar' : 'Ligar'}
                </button>
              </section>
            )}

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
                      autoFocus
                      autoComplete="off"
                      value={newBarcode}
                      onChange={(e) => {
                        setNewBarcode(e.target.value);
                        setBarcodeNote(null);
                      }}
                      onKeyDown={handleNewBarcodeKeyDown}
                      onBlur={(e) => void checkNewBarcode(e.target.value)}
                      placeholder="Bipe o produto ou digite o código"
                    />
                    {barcodeNote && (
                      <span className="mg-help mg-help-warn" role="alert">
                        {barcodeNote}
                      </span>
                    )}
                  </div>
                  <div>
                    <label className="field-label" htmlFor="np-name">Nome do Produto</label>
                    <input
                      id="np-name"
                      ref={newNameRef}
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
                      type="text"
                      inputMode="numeric"
                      required
                      value={newPrice}
                      onChange={(e) => setNewPrice(maskCurrencyDigits(e.target.value))}
                      placeholder="24,90"
                    />
                  </div>
                  {stockControl && (
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
                  )}
                </div>
                <button className="primary mg-form-submit" type="submit" disabled={processing}>
                  {processing ? 'Salvando...' : 'Salvar Produto'}
                </button>
              </form>
            )}

            {showImport && user?.isOwner && (
              <ImportProductsPanel
                stockControl={stockControl}
                onImported={async (createdCount) => {
                  setShowImport(false);
                  setFeedback({
                    text: createdCount === 1 ? '1 produto importado com sucesso!' : `${createdCount} produtos importados com sucesso!`,
                    isSuccess: true,
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
                    edit.close();
                    loadProducts(e.target.value);
                  }}
                />
                {stockControl && (
                  <div role="group" aria-label="Filtro de estoque" className="mg-filters">
                    {stockFilters.map((f) => (
                      <button
                        key={f.value}
                        type="button"
                        className="mg-segment"
                        aria-pressed={stockFilter === f.value}
                        onClick={() => {
                          setStockFilter(f.value);
                          edit.close();
                        }}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                )}
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
                  onClick={() => {
                    edit.close();
                    setShowNewProduct(!showNewProduct);
                  }}
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
                      {stockControl && <th scope="col" className="mg-num">Em estoque</th>}
                      {stockControl && <th scope="col" className="mg-num">Ação</th>}
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
                              {stockControl && status === 'low' && <span className="mg-tag mg-tag-warn">Estoque baixo</span>}
                              {stockControl && status === 'out' && <span className="mg-tag mg-tag-danger">Sem estoque</span>}
                              <div className="muted mg-barcode num">{p.barcode}</div>
                              {user?.isOwner && (
                                <button
                                  type="button"
                                  className="outline mg-row-action"
                                  aria-expanded={edit.targetId === p.id}
                                  aria-label={`Editar ${p.name}`}
                                  onClick={() => startEdit(p)}
                                >
                                  Editar
                                </button>
                              )}
                            </td>
                            <td className="mg-num">
                              {formatMoney(p.salePrice)}
                              {byWeight ? ' /kg' : ''}
                            </td>
                            {stockControl && (
                              <td className={`mg-num mg-stock mg-stock-${status}`}>
                                {formatQuantity(p.availableQuantity, p.unit)}
                                {byWeight ? '' : ' un'}
                              </td>
                            )}
                            {stockControl && (
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
                            )}
                          </tr>

                          {user?.isOwner && edit.target && edit.targetId === p.id && (
                            <ProductEditRow
                              target={edit.target}
                              draft={edit.draft}
                              colSpan={stockControl ? 4 : 2}
                              processing={processing}
                              barcodeNote={edit.barcodeNote}
                              error={edit.error}
                              nameRef={edit.nameRef}
                              onDraft={edit.changeDraft}
                              onSubmit={edit.handleSubmit}
                              onCancel={edit.close}
                              onReload={edit.handleReload}
                              onBarcodeBlur={edit.checkBarcode}
                              onBarcodeKeyDown={edit.handleBarcodeKeyDown}
                            />
                          )}

                          {/* Box de Reposição */}
                          {stockControl && restockingId === p.id && (
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
                        <td colSpan={stockControl ? 4 : 2} className="mg-empty-cell">
                          Nenhum produto cadastrado com os critérios pesquisados.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {stockControl && stockFilter !== 'all' && hasMore && (
                <p className="mg-help mg-foot" role="status">
                  O filtro vale só para os produtos já carregados; use Carregar mais.
                </p>
              )}
              <p className="mg-foot">
                {shownText(visibleProducts.length, summary ? summary.total : null)}
                {stockControl && ' · Entrada registra compra ou reposição de estoque'}
              </p>
              {(hasMore || loadMoreFailed) && (
                <div className="mg-foot">
                  {loadMoreFailed && (
                    <span className="mg-help mg-help-warn" role="alert">
                      Não foi possível carregar mais produtos. A lista acima continua aqui.
                    </span>
                  )}
                  <button type="button" className="outline" onClick={loadMore} disabled={loadingMore}>
                    {loadingMore ? 'Carregando...' : loadMoreFailed ? 'Tentar de novo' : 'Carregar mais'}
                  </button>
                </div>
              )}
            </section>
          </section>
  );
}
