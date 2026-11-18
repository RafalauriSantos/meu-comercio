'use client';

import React from 'react';
import type { AuthUser } from '@/frontend/lib/api-client';
import { formatMoney } from '@/frontend/lib/formatters';
import { formatQuantity } from '@/shared/domain/product-unit';
import { LoadFailureNotice } from '@/frontend/ui/load-failure-notice';
import { ImportProductsPanel } from '@/frontend/management/import-products-panel';
import { matchesStockFilter, stockStatus, type StockFilter } from '@/frontend/management/stock';
import { needingRestockCount, shownText, stockValueText } from '@/frontend/management/products-list';
import { ProductEditPanel } from '@/frontend/management/product-edit-panel';
import { NewProductPanel } from '@/frontend/ui/new-product-panel';
import { useBarcodeScan } from '@/frontend/lib/use-barcode-scan';
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
    openNewProduct,
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
    showDeleted,
    showActive,
    showDeletedList,
    deleted,
    deletedCount,
    handleRestore,
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
  // The excluded list shows no stock: its search is over the 100 already read, by name or code.
  const showStock = stockControl && !showDeleted;
  const text = productQuery.trim().toLowerCase();
  const visibleProducts = showDeleted
    ? (deleted ?? []).filter((p) => text === '' || p.name.toLowerCase().includes(text) || p.barcode.includes(text))
    : products.filter((p) => !stockControl || matchesStockFilter(p.availableQuantity, stockFilter, p.unit));

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
            <section className="mg-summary" aria-label="Resumo do catálogo">
              <div className="mg-summary-facts">
                <div>
                  <span className="mg-summary-total num">{summary ? summary.total : '—'}</span>{' '}
                  <span className="muted">produtos cadastrados</span>
                </div>
                {stockControl && (
                  <div className="mg-summary-warn">
                    <strong className="num">{lowStockCount ?? '—'}</strong> Precisam de reposição
                  </div>
                )}
                {stockControl && (
                  <div>
                    <strong className="num">{stockValueText(summary)}</strong> Valor em estoque (a preço de venda)
                  </div>
                )}
                <div className="muted">
                  Controle de estoque: <strong>{stockControl ? 'ligado' : 'desligado'}</strong>.{' '}
                  {stockControl
                    ? 'As vendas baixam o estoque e não passam do saldo.'
                    : 'As vendas não dependem do estoque: não precisam de saldo e não baixam nada.'}
                </div>
              </div>
              {/* Interruptor do controle de estoque (só a dona) */}
              {user?.isOwner && (
                <button type="button" className="outline mg-summary-action" onClick={handleToggleStockControl} disabled={processing}>
                  {stockControl ? 'Desligar' : 'Ligar'}
                </button>
              )}
            </section>

            {showImport && user?.isOwner && (
              <ImportProductsPanel
                stockControl={stockControl}
                onClose={() => setShowImport(false)}
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
                  className="input mg-search mg-search-wide"
                  placeholder="Buscar por código de barras ou nome do produto..."
                  value={productQuery}
                  onChange={(e) => {
                    setProductQuery(e.target.value);
                    edit.close();
                    loadProducts(e.target.value);
                  }}
                />
                {user?.isOwner && (
                  <div role="group" aria-label="Lista de produtos" className="mg-filters">
                    <button
                      type="button"
                      className="mg-segment"
                      aria-pressed={!showDeleted}
                      onClick={() => {
                        showActive();
                        edit.close();
                      }}
                    >
                      Ativos ({summary ? summary.total : '—'})
                    </button>
                    <button type="button" className="mg-segment" aria-pressed={showDeleted} onClick={showDeletedList}>
                      Excluídos{deletedCount !== null && ` (${deletedCount})`}
                    </button>
                  </div>
                )}
                {showStock && (
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
                <button
                  type="button"
                  className="primary mg-toolbar-new"
                  aria-haspopup="dialog"
                  onClick={() => {
                    edit.close();
                    openNewProduct();
                  }}
                >
                  ＋ Novo Produto
                </button>
                {user?.isOwner && (
                  <button
                    type="button"
                    className="outline mg-toolbar-import"
                    aria-expanded={showImport}
                    onClick={() => setShowImport(!showImport)}
                  >
                    Importar planilha
                  </button>
                )}
              </div>

              <div className="mg-table-wrap">
                <div role="table" aria-label="Produtos" className={showStock ? 'mg-list mg-list-stock' : 'mg-list'}>
                  <div role="rowgroup">
                    <div role="row" className="mg-list-head">
                      <div role="columnheader">Produto</div>
                      {showStock && <div role="columnheader" className="mg-num">Em estoque</div>}
                      {showStock && <div role="columnheader" className="mg-num">Entrada</div>}
                      <div role="columnheader" className="mg-num">Preço</div>
                      <div role="columnheader">
                        <span className="sr-only">Ação</span>
                      </div>
                    </div>
                  </div>
                  <div role="rowgroup">
                    {visibleProducts.map((p) => {
                      const status = stockStatus(p.availableQuantity, p.unit);
                      const byWeight = p.unit === 'KG';
                      return (
                        <React.Fragment key={p.id}>
                          <div role="row" className="mg-row">
                            <div role="cell">
                              <strong>{p.name}</strong>
                              {showStock && status === 'low' && <span className="mg-tag mg-tag-warn">Estoque baixo</span>}
                              {showStock && status === 'out' && <span className="mg-tag mg-tag-danger">Sem estoque</span>}
                              <div className="muted mg-barcode num">{p.barcode}</div>
                            </div>
                            {showStock && (
                              <div role="cell" className={`mg-num mg-stock mg-stock-${status}`}>
                                {formatQuantity(p.availableQuantity, p.unit)}
                                {byWeight ? '' : ' un'}
                              </div>
                            )}
                            {showStock && (
                            <div role="cell" className="mg-num">
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
                            </div>
                            )}
                            <div role="cell" className="mg-num">
                              {formatMoney(p.salePrice)}
                              {byWeight ? ' /kg' : ''}
                            </div>
                            <div role="cell" className="mg-row-end">
                              {user?.isOwner && !showDeleted && (
                                <button
                                  type="button"
                                  className="outline mg-row-action"
                                  aria-haspopup="dialog"
                                  aria-label={`Editar ${p.name}`}
                                  onClick={() => startEdit(p)}
                                >
                                  Editar
                                </button>
                              )}
                              {showDeleted && (
                                <button
                                  type="button"
                                  className="outline mg-row-action"
                                  aria-label={`Restaurar ${p.name}`}
                                  disabled={processing}
                                  onClick={() => handleRestore(p)}
                                >
                                  Restaurar
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Box de Reposição */}
                          {showStock && restockingId === p.id && (
                            <div role="row" className="mg-restock-row">
                              <div role="cell" className="mg-row-full">
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
                              </div>
                            </div>
                          )}
                        </React.Fragment>
                      );
                    })}
                    {visibleProducts.length === 0 && (
                      <div role="row">
                        <div role="cell" className="mg-row-full mg-empty-cell">
                          {showDeleted
                            ? deleted === null
                              ? 'Carregando os produtos excluídos...'
                              : 'Nenhum produto excluído com a busca escolhida.'
                            : 'Nenhum produto cadastrado com os critérios pesquisados.'}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {showStock && stockFilter !== 'all' && hasMore && (
                <p className="mg-help mg-foot" role="status">
                  O filtro vale só para os produtos já carregados; use Carregar mais.
                </p>
              )}
              <p className="mg-foot">
                {shownText(visibleProducts.length, showDeleted ? null : summary ? summary.total : null)}
                {showStock && ' · Entrada registra compra ou reposição de estoque'}
              </p>
              {!showDeleted && (hasMore || loadMoreFailed) && (
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

            {showNewProduct && (
              <NewProductPanel
                barcode={newBarcode}
                name={newName}
                unit={newUnit}
                price={newPrice}
                stock={newStock}
                stockControl={stockControl}
                processing={processing}
                barcodeNote={barcodeNote}
                scanWarning={tab.newScanWarning}
                closing={tab.newClosing}
                error={tab.createError}
                nameRef={newNameRef}
                onBarcode={(value) => {
                  setNewBarcode(value);
                  setBarcodeNote(null);
                }}
                onName={setNewName}
                onUnit={setNewUnit}
                onPrice={setNewPrice}
                onStock={setNewStock}
                onSubmit={handleCreateProduct}
                onCancel={tab.closeNewProduct}
                onClosed={tab.finishCloseNewProduct}
                onBarcodeBlur={checkNewBarcode}
                onBarcodeKeyDown={handleNewBarcodeKeyDown}
              />
            )}

            {user?.isOwner && edit.target && (
              <ProductEditPanel
                target={edit.target}
                draft={edit.draft}
                processing={processing}
                barcodeNote={edit.barcodeNote}
                scanWarning={edit.scanWarning}
                closing={edit.closing}
                error={edit.error}
                stockControl={stockControl}
                deleteFlow={edit.deleteFlow}
                nameRef={edit.nameRef}
                onDraft={edit.changeDraft}
                onSubmit={edit.handleSubmit}
                onCancel={edit.close}
                onClosed={edit.finishClose}
                onReload={edit.handleReload}
                onBarcodeBlur={edit.checkBarcode}
                onBarcodeKeyDown={edit.handleBarcodeKeyDown}
                onGenerateBarcode={edit.handleGenerateBarcode}
              />
            )}
          </section>
  );
}
