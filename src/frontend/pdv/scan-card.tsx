import React from 'react';
import { type ProductItem } from '@/frontend/lib/api-client';
import { formatMoney } from '@/frontend/lib/formatters';
import { formatQuantity } from '@/shared/domain/product-unit';
import { SearchResults, SEARCH_LIST_ID, searchOptionId } from '@/frontend/pdv/search-results';

// The "Adicionar produto" card: barcode / name field and the search list. Moved from the page as it was;
// the state and the handlers stay in the page and come in by props.
export function ScanCard({
  barcodeInput,
  onBarcodeInputChange,
  barcodeInputRef,
  onSubmit,
  onKeyDown,
  showSearch,
  searchResults,
  highlighted,
  onPick,
  stockControl,
  lastItem,
}: {
  barcodeInput: string;
  onBarcodeInputChange: (value: string) => void;
  barcodeInputRef: React.RefObject<HTMLInputElement | null>;
  onSubmit: (e: React.FormEvent) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  showSearch: boolean;
  searchResults: ProductItem[];
  highlighted: number;
  onPick: (product: ProductItem) => void;
  stockControl: boolean;
  lastItem: ProductItem | null;
}) {
  return (
    <div className="card pdv-scan">
      <label htmlFor="barcode-scanner" className="pdv-card-title">
        Adicionar produto
      </label>
      <form onSubmit={onSubmit} className="pdv-scan-row">
        <input
          id="barcode-scanner"
          ref={barcodeInputRef}
          className="pdv-scan-input"
          type="text"
          autoFocus
          autoComplete="off"
          placeholder="Escaneie, digite o código ou o nome do produto"
          value={barcodeInput}
          onChange={(e) => onBarcodeInputChange(e.target.value)}
          onKeyDown={onKeyDown}
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
      {showSearch && (
        <SearchResults
          results={searchResults}
          highlighted={highlighted}
          onPick={onPick}
          showStock={stockControl}
        />
      )}
      <p className="pdv-scan-hint pdv-hide-sm">
        Enter adiciona · F4 recebe · Esc limpa a venda
      </p>
      <p className="sr-only" aria-live="polite">
        {lastItem ? (
          <>
            <span className="muted">Último lido:</span> <strong>{lastItem.name}</strong>
            <span className="muted num">
              {' '}
              · {formatMoney(lastItem.salePrice)} {stockControl && (
                <>
                  {' '}
                  · disponível: {formatQuantity(lastItem.availableQuantity, lastItem.unit)}
                  {lastItem.unit === 'KG' ? '' : ' un'}
                </>
              )}
            </span>
          </>
        ) : (
          <span className="muted">Nenhum produto escaneado ainda.</span>
        )}
      </p>
    </div>
  );
}
