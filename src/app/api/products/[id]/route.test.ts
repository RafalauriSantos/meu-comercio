import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { PATCH } from './route';
import { Money } from '@/shared/domain/money';
import { Product } from '@/modules/products/domain/product';
import { ProductBarcodeConflictError, ProductChangedError } from '@/modules/products/domain/product-errors';
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

const mockUpdateDetails = vi.fn();
vi.mock('@/modules/products/infrastructure/drizzle-product-repository', () => ({
  DrizzleProductRepository: class MockDrizzleProductRepository {
    updateDetails = mockUpdateDetails;
  },
}));

const mockGetAvailableQuantity = vi.fn();
vi.mock('@/modules/inventory/infrastructure/drizzle-inventory-repository', () => ({
  DrizzleInventoryRepository: class MockDrizzleInventoryRepository {
    getAvailableQuantity = mockGetAvailableQuantity;
  },
}));

const ID = '11111111-1111-4111-8111-111111111111';
const owner = { merchantId: 'merchant-1', username: 'dona', authorities: ['ROLE_OWNER'] };
const operator = { merchantId: 'merchant-1', username: 'caixa', authorities: ['ROLE_OPERATOR', 'CREATE_SALE'] };

function patch(body: unknown, id = ID) {
  return PATCH(
    new NextRequest(`http://localhost/api/products/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    { params: Promise.resolve({ id }) }
  );
}

describe('PATCH /api/products/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockRequireAuthSession.mockResolvedValue(owner);
    mockGetAvailableQuantity.mockResolvedValue(7);
    mockUpdateDetails.mockResolvedValue(
      new Product({
        id: ID,
        merchantId: 'merchant-1',
        barcode: '1001',
        name: 'Arroz Tio João',
        salePrice: Money.fromDecimal('12.50'),
        unit: 'KG',
        active: true,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-11-16T10:00:00.000Z'),
      })
    );
  });

  it('returns 401 without a session', async () => {
    mockRequireAuthSession.mockRejectedValue(new UnauthorizedError());

    expect((await patch({ name: 'Arroz' })).status).toBe(401);
    expect(mockUpdateDetails).not.toHaveBeenCalled();
  });

  it('returns 403 for an operator and writes nothing', async () => {
    mockRequireAuthSession.mockResolvedValue(operator);

    const response = await patch({ name: 'Arroz' });

    expect(response.status).toBe(403);
    expect((await response.json()).message).toBe('Apenas a proprietária pode editar produtos do catálogo.');
    expect(mockUpdateDetails).not.toHaveBeenCalled();
  });

  it('returns 403 for an operator who sends active, even with an unreadable body, and writes nothing (D-27)', async () => {
    mockRequireAuthSession.mockResolvedValue(operator);

    expect((await patch({ active: false })).status).toBe(403);
    expect((await patch({ active: true })).status).toBe(403);
    const unreadable = await PATCH(
      new NextRequest(`http://localhost/api/products/${ID}`, { method: 'PATCH', body: 'isto não é json' }),
      { params: Promise.resolve({ id: ID }) }
    );
    expect(unreadable.status).toBe(403);
    expect(mockUpdateDetails).not.toHaveBeenCalled();
  });

  it.each([false, true])('returns 200 for active=%s alone and passes it with expectedUpdatedAt (D-27)', async (active) => {
    mockUpdateDetails.mockResolvedValue(
      new Product({
        id: ID,
        merchantId: 'merchant-1',
        barcode: '1001',
        name: 'Arroz Tio João',
        salePrice: Money.fromDecimal('12.50'),
        unit: 'KG',
        active,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-11-18T10:00:00.000Z'),
      })
    );

    const response = await patch({ active, expectedUpdatedAt: '2026-11-16T10:00:00.000Z' });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ active, availableQuantity: 7, updatedAt: '2026-11-18T10:00:00.000Z' });
    expect(mockUpdateDetails).toHaveBeenCalledWith(
      'merchant-1',
      ID,
      { active },
      { actorId: 'dona', expectedUpdatedAt: new Date('2026-11-16T10:00:00.000Z') }
    );
  });

  it('returns 200 with the item in the list format, the price as decimal text', async () => {
    const response = await patch({ name: 'Arroz Tio João', salePrice: '12.50' });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: ID,
      barcode: '1001',
      name: 'Arroz Tio João',
      salePrice: '12.50',
      unit: 'KG',
      availableQuantity: 7,
      active: true,
      updatedAt: '2026-11-16T10:00:00.000Z',
    });
    expect(mockUpdateDetails).toHaveBeenCalledTimes(1);
    expect(mockUpdateDetails.mock.calls[0][0]).toBe('merchant-1');
    expect(mockUpdateDetails.mock.calls[0][1]).toBe(ID);
    expect(mockUpdateDetails.mock.calls[0][3]).toEqual({ actorId: 'dona', expectedUpdatedAt: undefined });
  });

  it.each([
    ['empty body', {}],
    ['unit', { name: 'Arroz', unit: 'UN' }],
    ['active as text', { active: 'false' }],
    ['active null', { active: null }],
    ['unknown field', { name: 'Arroz', foo: 1 }],
    ['price zero', { salePrice: '0' }],
    ['negative price', { salePrice: '-1' }],
    ['short name', { name: 'A' }],
    ['empty barcode', { barcode: '' }],
    ['bad expectedUpdatedAt', { name: 'Arroz', expectedUpdatedAt: 'ontem' }],
  ])('returns 400 for %s and writes nothing', async (_label, body) => {
    const response = await patch(body);

    expect(response.status).toBe(400);
    expect((await response.json()).message).toBe('Dados de edição de produto inválidos.');
    expect(mockUpdateDetails).not.toHaveBeenCalled();
  });

  it('returns 400 for a body that is not JSON', async () => {
    const response = await PATCH(
      new NextRequest(`http://localhost/api/products/${ID}`, { method: 'PATCH', body: 'isto não é json' }),
      { params: Promise.resolve({ id: ID }) }
    );

    expect(response.status).toBe(400);
  });

  it('returns 400 for an id that is not a uuid, before touching the database', async () => {
    const response = await patch({ name: 'Arroz' }, 'nao-e-uuid');

    expect(response.status).toBe(400);
    expect(mockUpdateDetails).not.toHaveBeenCalled();
  });

  it('returns 404 when the product is not in the shop of the session', async () => {
    mockUpdateDetails.mockResolvedValue(null);

    const response = await patch({ name: 'Arroz' });

    expect(response.status).toBe(404);
    expect((await response.json()).message).toBe('Produto não encontrado.');
  });

  it('returns 409 with the message when the barcode is used by another product', async () => {
    mockUpdateDetails.mockRejectedValue(new ProductBarcodeConflictError('2002'));

    const response = await patch({ barcode: '2002' });

    expect(response.status).toBe(409);
    expect((await response.json()).message).toContain('2002');
  });

  it('returns 409 PRODUCT_CHANGED asking for a reload when the product changed meanwhile', async () => {
    mockUpdateDetails.mockRejectedValue(new ProductChangedError());

    const response = await patch({ name: 'Arroz', expectedUpdatedAt: '2026-11-16T09:00:00.000Z' });

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.code).toBe('PRODUCT_CHANGED');
    expect(body.message).toContain('Recarregue');
  });

  describe('generateBarcode (D-24)', () => {
    it('returns 200 with the item and sends a generated EAN-13 flagged as generated', async () => {
      const response = await patch({ generateBarcode: true, expectedUpdatedAt: '2026-11-16T10:00:00.000Z' });

      expect(response.status).toBe(200);
      const [, , changes, context] = mockUpdateDetails.mock.calls[0];
      expect(changes.barcode).toMatch(/^29\d{11}$/);
      expect(context).toEqual({
        actorId: 'dona',
        expectedUpdatedAt: new Date('2026-11-16T10:00:00.000Z'),
        barcodeGenerated: true,
      });
    });

    it('returns 400 when sent together with barcode and writes nothing', async () => {
      const response = await patch({ generateBarcode: true, barcode: '2002' });

      expect(response.status).toBe(400);
      expect(mockUpdateDetails).not.toHaveBeenCalled();
    });

    it('returns 403 for an operator and writes nothing', async () => {
      mockRequireAuthSession.mockResolvedValue(operator);

      expect((await patch({ generateBarcode: true })).status).toBe(403);
      expect(mockUpdateDetails).not.toHaveBeenCalled();
    });

    it('returns 409 PRODUCT_CHANGED for a stale expectedUpdatedAt', async () => {
      mockUpdateDetails.mockRejectedValue(new ProductChangedError());

      const response = await patch({ generateBarcode: true, expectedUpdatedAt: '2026-11-16T09:00:00.000Z' });

      expect(response.status).toBe(409);
      expect((await response.json()).code).toBe('PRODUCT_CHANGED');
    });

    it('returns a generic 500 after 5 collisions, without the code or driver text', async () => {
      mockUpdateDetails.mockRejectedValue(new ProductBarcodeConflictError('2900000000004'));

      const response = await patch({ generateBarcode: true });
      const text = JSON.stringify(await response.json());

      expect(response.status).toBe(500);
      expect(mockUpdateDetails).toHaveBeenCalledTimes(5);
      expect(text).not.toMatch(/2900000000004|23505|constraint|uq_products/i);
    });
  });

  it('returns 500 without leaking internal details', async () => {
    mockUpdateDetails.mockRejectedValue(new Error('connection refused at 10.0.0.1'));

    const response = await patch({ name: 'Arroz' });

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('10.0.0.1');
  });
});
