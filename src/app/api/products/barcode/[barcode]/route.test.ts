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

const mockFindByBarcode = vi.fn();
vi.mock('@/modules/products/infrastructure/drizzle-product-repository', () => ({
  DrizzleProductRepository: class MockDrizzleProductRepository {
    findByBarcode = mockFindByBarcode;
  },
}));

vi.mock('@/modules/inventory/infrastructure/drizzle-inventory-repository', () => ({
  DrizzleInventoryRepository: class MockDrizzleInventoryRepository {
    getAvailableQuantity = async () => 4;
  },
}));

function product(active: boolean) {
  return new Product({
    id: 'p1',
    merchantId: 'merchant-1',
    barcode: '1001',
    name: 'Arroz Tio João',
    salePrice: Money.fromDecimal('12.50'),
    unit: 'UN',
    active,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-11-18T10:00:00.000Z'),
  });
}

function get(barcode = '1001') {
  return GET(new NextRequest(`http://localhost/api/products/barcode/${barcode}`), {
    params: Promise.resolve({ barcode }),
  });
}

describe('GET /api/products/barcode/[barcode]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockRequireAuthSession.mockResolvedValue({ merchantId: 'merchant-1', username: 'caixa', authorities: ['ROLE_OPERATOR'] });
  });

  it('returns 401 without a session', async () => {
    mockRequireAuthSession.mockRejectedValue(new UnauthorizedError());

    expect((await get()).status).toBe(401);
  });

  it('returns the active product with its stock', async () => {
    mockFindByBarcode.mockResolvedValue(product(true));

    const response = await get();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: 'p1', name: 'Arroz Tio João', availableQuantity: 4 });
  });

  it('returns 404 without a code when nobody has the barcode', async () => {
    mockFindByBarcode.mockResolvedValue(null);

    const response = await get('999');

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ message: 'Produto com código de barras [999] não encontrado.' });
  });

  it.each([
    ['operator', { merchantId: 'merchant-1', username: 'caixa', authorities: ['ROLE_OPERATOR'] }],
    ['owner', { merchantId: 'merchant-1', username: 'dona', authorities: ['ROLE_OWNER'] }],
  ])('returns 404 PRODUCT_INACTIVE with the name for a deactivated product, same for the %s (D-27)', async (_who, session) => {
    mockRequireAuthSession.mockResolvedValue(session);
    mockFindByBarcode.mockResolvedValue(product(false));

    const response = await get();

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      code: 'PRODUCT_INACTIVE',
      message: 'Produto "Arroz Tio João" está desativado.',
    });
  });
});
