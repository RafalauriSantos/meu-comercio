import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SearchResults, SEARCH_LIST_ID, searchOptionId } from './search-results';

const products = [
  { id: 'a', barcode: '1', name: 'Isqueiro Grande', salePrice: 4.5, availableQuantity: 60 },
  { id: 'b', barcode: '2', name: 'Isqueiro Pequeno', salePrice: 3, availableQuantity: 0 },
];

describe('SearchResults', () => {
  const markup = renderToStaticMarkup(<SearchResults results={products} highlighted={1} onPick={() => {}} />);

  it('is a listbox with one option per product, with price and stock', () => {
    expect(markup).toContain(`id="${SEARCH_LIST_ID}"`);
    expect(markup).toContain('role="listbox"');
    expect(markup.match(/role="option"/g)).toHaveLength(2);
    expect(markup).toContain('Isqueiro Grande');
    expect(markup).toContain('60 un');
    expect(markup).toContain('0 un');
  });

  it('marks only the highlighted option as selected, with the id the field points to', () => {
    expect(markup).toContain(`id="${searchOptionId(1)}" role="option" aria-selected="true"`);
    expect(markup).toContain(`id="${searchOptionId(0)}" role="option" aria-selected="false"`);
  });
});
