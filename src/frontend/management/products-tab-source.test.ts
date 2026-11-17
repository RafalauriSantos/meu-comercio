import { describe, it, expect } from 'vitest';
import { readScreenSource } from '@/test-utils/read-screen-source';

// No jsdom (backlog 18.1): the parts of the products tab that are not pure are locked by reading the code.
const source = readScreenSource('gestao');

describe('products tab: paged list and summary (source locks)', () => {
  it('the top numbers come from the summary, not from the loaded list', () => {
    expect(source).toContain('apiClient.getProductsSummary(');
    expect(source).not.toContain('catalog.length');
  });

  it('a failed summary does not flag the list as failed: it only clears the numbers (dash)', () => {
    expect(source).toMatch(/catch \(err\) \{\s*if \(mine === summaryToken\.current\) setSummary\(null\);/);
    expect(source).toContain("'—'");
  });

  it('has Carregar mais, a retry text, and the warning that the stock filter only covers what is loaded', () => {
    expect(source).toContain('Carregar mais');
    expect(source).toContain('Tentar de novo');
    expect(source).toContain('O filtro vale só para os produtos já carregados');
  });

  it('a new product clears the search and names the product in the feedback', () => {
    expect(source).toMatch(/setProductQuery\(''\);[\s\S]*await loadProducts\(\)/);
    expect(source).toContain('${newName.trim()}');
  });
});
