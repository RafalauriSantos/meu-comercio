import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from './route';
import {
  BarcodeAlreadyExistsError,
  BarcodeGenerationFailedError,
} from '@/modules/products/application/create-product.use-case';
import { Money } from '@/shared/domain/money';
import { Product } from '@/modules/products/domain/product';
import { InvalidBarcodeError } from '@/modules/products/domain/product-errors';
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

const mockGetAvailableQuantity = vi.fn();
vi.mock('@/modules/inventory/infrastructure/drizzle-inventory-repository', () => ({
  DrizzleInventoryRepository: class MockDrizzleInventoryRepository {
    getAvailableQuantity = mockGetAvailableQuantity;
  },
}));

vi.mock('@/modules/audit/infrastructure/drizzle-audit-service', () => ({
  DrizzleAuditService: class MockDrizzleAuditService {},
}));

const mockExecute = vi.fn();
vi.mock('@/modules/products/application/create-product.use-case', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/products/application/create-product.use-case')>()),
  CreateProductUseCase: class MockCreateProductUseCase {
    execute = mockExecute;
  },
}));

function get(search = '') {
  return GET(new NextRequest(`http://localhost/api/products${search}`));
}

describe('GET /api/products', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuthSession.mockResolvedValue({ merchantId: 'merchant-1', username: 'caixa', authorities: ['ROLE_OPERATOR'] });
    mockListPage.mockResolvedValue({ items: [], hasMore: false });
  });

  it('lists only the active products by default and with active=true, for any user (D-27)', async () => {
    await get();
    await get('?active=true');

    expect(mockListPage).toHaveBeenNthCalledWith(1, 'merchant-1', expect.objectContaining({ active: true }));
    expect(mockListPage).toHaveBeenNthCalledWith(2, 'merchant-1', expect.objectContaining({ active: true }));
  });

  it('lists the deactivated products with active=false for the owner (D-27)', async () => {
    mockRequireAuthSession.mockResolvedValue({ merchantId: 'merchant-1', username: 'dona', authorities: ['ROLE_OWNER'] });

    const response = await get('?active=false&q=arroz');

    expect(response.status).toBe(200);
    expect(mockListPage).toHaveBeenCalledWith('merchant-1', { query: 'arroz', page: 1, pageSize: 100, active: false });
  });

  it('returns 403 to an operator who asks for the deactivated products, and lists nothing (D-27)', async () => {
    const response = await get('?active=false');

    expect(response.status).toBe(403);
    expect(mockListPage).not.toHaveBeenCalled();
  });

  it('returns 400 for an active filter that is not true or false', async () => {
    const response = await get('?active=talvez');

    expect(response.status).toBe(400);
    expect(mockListPage).not.toHaveBeenCalled();
  });

  it('returns 401 without a session', async () => {
    mockRequireAuthSession.mockRejectedValue(new UnauthorizedError());

    const response = await get();

    expect(response.status).toBe(401);
    expect(mockListPage).not.toHaveBeenCalled();
  });

  it('without parameters asks for page 1 with 100 items, for the session merchant', async () => {
    await get();

    expect(mockListPage).toHaveBeenCalledWith('merchant-1', { query: '', page: 1, pageSize: 100, active: true });
  });

  it('passes page, pageSize and q to the repository', async () => {
    await get('?page=3&pageSize=50&q=arroz');

    expect(mockListPage).toHaveBeenCalledWith('merchant-1', { query: 'arroz', page: 3, pageSize: 50, active: true });
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

describe('POST /api/products', () => {
  function post(body: unknown) {
    return POST(
      new NextRequest('http://localhost/api/products', { method: 'POST', body: JSON.stringify(body) })
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockRequireAuthSession.mockResolvedValue({ merchantId: 'merchant-1', username: 'dona', authorities: ['ROLE_OWNER'] });
    mockGetAvailableQuantity.mockResolvedValue(0);
  });

  it('answers 401 without a session and does not create', async () => {
    mockRequireAuthSession.mockRejectedValue(new UnauthorizedError());

    const response = await post({ name: 'Arroz', salePrice: '10.00' });

    expect(response.status).toBe(401);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it.each([
    ['owner', ['ROLE_OWNER']],
    ['operator', []],
  ])('answers 400 with the message when the barcode is not a real one, as the %s (D-30)', async (_who, authorities) => {
    mockRequireAuthSession.mockResolvedValue({ merchantId: 'merchant-1', username: 'u', authorities });
    mockExecute.mockRejectedValue(new InvalidBarcodeError());

    const response = await post({ barcode: '123', name: 'Arroz', salePrice: '10.00' });

    expect(response.status).toBe(400);
    expect((await response.json()).message).toBe(
      'Código de barras inválido. Use um código de barras de verdade ou deixe em branco para gerar um.'
    );
  });

  describe('as an operator (D-25)', () => {
    beforeEach(() => {
      mockRequireAuthSession.mockResolvedValue({ merchantId: 'merchant-1', username: 'ana', authorities: [] });
    });

    it('answers 201 and creates in the session merchant with the operator as author', async () => {
      mockExecute.mockResolvedValue(
        Product.create('merchant-1', '7891000100103', 'Arroz', Money.fromDecimal('10.00'), 'p1')
      );

      const response = await post({ barcode: '7891000100103', name: 'Arroz', salePrice: '10.00', merchantId: 'other' });

      expect(response.status).toBe(201);
      expect(mockExecute.mock.calls[0].slice(0, 2)).toEqual(['merchant-1', 'ana']);
    });

    it('answers 400 in Portuguese for price zero and does not create', async () => {
      const response = await post({ name: 'Arroz', salePrice: '0.00' });

      expect(response.status).toBe(400);
      expect((await response.json()).message).toBe('O preço de venda deve ser maior que zero.');
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it('answers 400 for initial stock above zero and does not create', async () => {
      const response = await post({ name: 'Arroz', salePrice: '10.00', initialStock: 3 });

      expect(response.status).toBe(400);
      expect((await response.json()).message).toMatch(/estoque inicial/i);
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it('answers 400 for invalid data', async () => {
      expect((await post({ name: 'A', salePrice: '10.00' })).status).toBe(400);
      expect(mockExecute).not.toHaveBeenCalled();
    });
  });

  it('lets the owner register with price zero', async () => {
    mockExecute.mockResolvedValue(
      Product.create('merchant-1', '7891000100103', 'Brinde', Money.fromDecimal('0.00'), 'p1')
    );

    const response = await post({ barcode: '789', name: 'Brinde', salePrice: '0.00' });

    expect(response.status).toBe(201);
    expect(mockExecute).toHaveBeenCalledWith('merchant-1', 'dona', { barcode: '789', name: 'Brinde', salePrice: '0.00' });
  });

  it('answers 201 with the generated barcode in the body', async () => {
    mockExecute.mockResolvedValue(
      Product.create('merchant-1', '2912345678903', 'Arroz', Money.fromDecimal('10.00'), 'p1')
    );

    const response = await post({ name: 'Arroz', salePrice: '10.00' });

    expect(response.status).toBe(201);
    expect((await response.json()).barcode).toBe('2912345678903');
    expect(mockExecute).toHaveBeenCalledWith('merchant-1', 'dona', { name: 'Arroz', salePrice: '10.00' });
  });

  it('answers 409 for a repeated typed barcode', async () => {
    mockExecute.mockRejectedValue(new BarcodeAlreadyExistsError('123'));

    expect((await post({ barcode: '123', name: 'Arroz', salePrice: '10.00' })).status).toBe(409);
  });

  it('answers a generic 500 when the barcode could not be generated', async () => {
    mockExecute.mockRejectedValue(new BarcodeGenerationFailedError());

    const response = await post({ name: 'Arroz', salePrice: '10.00' });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(JSON.stringify(body)).not.toMatch(/23505|constraint|uq_products/i);
  });
});
