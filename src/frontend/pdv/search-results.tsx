import type { ProductItem } from '@/frontend/lib/api-client';
import { formatMoney } from '@/frontend/lib/formatters';

export const SEARCH_LIST_ID = 'pdv-search-results';

export function searchOptionId(index: number): string {
  return `${SEARCH_LIST_ID}-${index}`;
}

interface SearchResultsProps {
  results: ProductItem[];
  highlighted: number;
  onPick: (product: ProductItem) => void;
}

export function SearchResults({ results, highlighted, onPick }: SearchResultsProps) {
  return (
    <ul id={SEARCH_LIST_ID} className="pdv-search-list" role="listbox" aria-label="Produtos encontrados">
      {results.map((product, index) => (
        <li
          key={product.id}
          id={searchOptionId(index)}
          role="option"
          aria-selected={index === highlighted}
          className="pdv-search-option"
          // The field keeps the focus: picking with the mouse must not blur it first.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onPick(product)}
        >
          <span className="pdv-search-name">{product.name}</span>
          <span className="pdv-search-meta num">
            {formatMoney(product.salePrice)} · {product.availableQuantity} un
          </span>
        </li>
      ))}
    </ul>
  );
}
