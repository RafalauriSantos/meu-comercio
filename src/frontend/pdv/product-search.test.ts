import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isNameSearch, moveHighlight } from './product-search';

describe('isNameSearch', () => {
  it('treats digits as a barcode, even long ones', () => {
    expect(isNameSearch('7891000100103')).toBe(false);
    expect(isNameSearch('12')).toBe(false);
    expect(isNameSearch('  789  ')).toBe(false);
  });

  it('treats text with a letter as a name once it has two characters', () => {
    expect(isNameSearch('is')).toBe(true);
    expect(isNameSearch('Isqueiro')).toBe(true);
    expect(isNameSearch('açúcar')).toBe(true);
    expect(isNameSearch('ISQ1')).toBe(true);
  });

  it('waits for two characters and ignores spaces and symbols alone', () => {
    expect(isNameSearch('i')).toBe(false);
    expect(isNameSearch('  ')).toBe(false);
    expect(isNameSearch('--')).toBe(false);
  });
});

describe('moveHighlight', () => {
  it('moves down and up, wrapping around the ends', () => {
    expect(moveHighlight(0, 3, 'ArrowDown')).toBe(1);
    expect(moveHighlight(2, 3, 'ArrowDown')).toBe(0);
    expect(moveHighlight(0, 3, 'ArrowUp')).toBe(2);
    expect(moveHighlight(1, 3, 'ArrowUp')).toBe(0);
  });

  it('keeps the row for other keys and for an empty list', () => {
    expect(moveHighlight(1, 3, 'a')).toBe(1);
    expect(moveHighlight(5, 0, 'ArrowDown')).toBe(0);
  });
});

describe('PDV search by name', () => {
  const page = readFileSync(join(process.cwd(), 'src', 'app', 'pdv', 'page.tsx'), 'utf8').replace(/\r\n/g, '\n');

  it('keeps Enter as a barcode lookup when the list is not showing (the scanner sends Enter at once)', () => {
    expect(page).toContain('if (showSearch && searchResults[highlighted]) {');
    expect(page).toContain('apiClient.findProductByBarcode(code)');
  });

  it('closes the list on Escape without clearing the sale', () => {
    expect(page).toMatch(/createEscapeDismiss\(\(\) => \{\s*setSearchResults\(\[\]\);/);
  });

  it('adds the picked product through the same cart update as a barcode', () => {
    expect(page).toContain('function addProductToCart(product: ProductItem)');
    expect(page.match(/addProductToCart\(/g)!.length).toBeGreaterThanOrEqual(3);
  });
});
