import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';
import { Money } from '@/shared/domain/money';
import { Product } from '@/modules/products/domain/product';
import { UnauthorizedError } from '@/shared/infrastructure/auth/auth-context';

const mockRequireAuthSession = vi.fn();
vi.mock('@/shared/infrastructure/auth/auth-context', () => ({
  requireAuthSession: () => mockRequireAuthSession(),
  UnauthorizedError: class UnauthorizedError extends Error {
    constructor() {
      super('Não autorizado.');
      this.name = 'UnauthorizedError';
    }
  },
}));

const mockListPage = vi.fn();
vi.mock('@/modules/products/infrastructure/drizzle-product-repository', () => ({
  DrizzleProductRepository: class MockDrizzleProductRepository {
    listPage = mockListPage;
  },
}));

vi.mock('@/modules/inventory/infrastructure/drizzle-inventory-repository', () => ({
  DrizzleInventoryRepository: class MockDrizzleInventoryRepository {},
}));

function get(search = '') {
  return GET(new NextRequest(`http://localhost/api/products${search}`));
}

describe('GET /api/products', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthSession.mockResolvedValue({ merchantId: 'merchant-1', username: 'dona' });
    mockListPage.mockResolvedValue({ items: [], hasMore: false });
  });

  it('returns 401 without a session', async () => {
    mockRequireAuthSession.mockRejectedValue(new UnauthorizedError());

    const response = await get();

    expect(response.status).toBe(401);
    expect(mockListPage).not.toHaveBeenCalled();
  });

  it('without parameters asks for page 1 with 100 items, for the session merchant', async () => {
    await get();

    expect(mockListPage).toHaveBeenCalledWith('merchant-1', { query: '', page: 1, pageSize: 100 });
  });

  it('passes page, pageSize and q to the repository', async () => {
    await get('?page=3&pageSize=50&q=arroz');

    expect(mockListPage).toHaveBeenCalledWith('merchant-1', { query: 'arroz', page: 3, pageSize: 50 });
  });

  it('keeps the item format and adds hasMore', async () => {
    const product = new Product({
      id: 'p1',
      merchantId: 'merchant-1',
      barcode: '1001',
      name: 'Arroz',
      salePrice: Money.fromDecimal('24.90'),
      unit: 'UN',
      active: true,
      createdAt: new Date(),
      updatedAt: new Date('2026-05-01T12:00:00.123Z'),
    });
    mockListPage.mockResolvedValue({ items: [{ product, availableQuantity: 7 }], hasMore: true });

    const response = await get();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      items: [{ id: 'p1', barcode: '1001', name: 'Arroz', salePrice: '24.90', unit: 'UN', availableQuantity: 7, active: true, updatedAt: '2026-05-01T12:00:00.123Z' }],
      hasMore: true,
    });
  });

  it.each([
    ['page=0'],
    ['page=-1'],
    ['page=abc'],
    ['page=1.5'],
    ['pageSize=0'],
    ['pageSize=101'],
    ['pageSize=abc'],
  ])('returns 400 with a clear message for %s', async (search) => {
    const response = await get(`?${search}`);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toMatch(/página|tamanho/i);
    expect(mockListPage).not.toHaveBeenCalled();
  });
});
