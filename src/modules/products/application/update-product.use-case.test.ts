import { describe, it, expect, beforeEach } from 'vitest';
import { ZodError } from 'zod';
import { Money } from '@/shared/domain/money';
import { Product } from '../domain/product';
import { ProductChanges, ProductUpdateContext, ProductRepository } from '../domain/product-repository.port';
import { ProductBarcodeConflictError, ProductChangedError } from '../domain/product-errors';
import { BarcodeAlreadyExistsError, BarcodeGenerationFailedError } from './create-product.use-case';
import { isValidEan13 } from '../domain/generated-barcode';
import { UpdateProductUseCase, ProductNotFoundError } from './update-product.use-case';

const ID = '11111111-1111-4111-8111-111111111111';

// Only the part of the port the use case uses; the SQL behavior is covered by the integration test.
class FakeRepository {
  calls: Array<{ merchantId: string; id: string; changes: ProductChanges; context: ProductUpdateContext }> = [];
  result: Product | null = Product.create('m1', '1001', 'Arroz', Money.fromDecimal('24.90'), ID);
  error: Error | null = null;
  conflictsLeft = 0;

  async updateDetails(merchantId: string, id: string, changes: ProductChanges, context: ProductUpdateContext) {
    this.calls.push({ merchantId, id, changes, context });
    if (this.error) throw this.error;
    if (this.conflictsLeft-- > 0) throw new ProductBarcodeConflictError(changes.barcode ?? '');
    return this.result;
  }
}

describe('UpdateProductUseCase', () => {
  let repo: FakeRepository;
  let useCase: UpdateProductUseCase;

  beforeEach(() => {
    repo = new FakeRepository();
    useCase = new UpdateProductUseCase(repo as unknown as ProductRepository);
  });

  it('sends only the fields given, trimmed, with the price as Money and the actor', async () => {
    await useCase.execute('m1', 'dona', ID, { name: '  Arroz 5 kg ', salePrice: '12.50' });

    expect(repo.calls).toHaveLength(1);
    const { merchantId, id, changes, context } = repo.calls[0];
    expect(merchantId).toBe('m1');
    expect(id).toBe(ID);
    expect(Object.keys(changes).sort()).toEqual(['name', 'salePrice']);
    expect(changes.name).toBe('Arroz 5 kg');
    expect(changes.salePrice?.toDecimal()).toBe(Money.fromDecimal('12.50').toDecimal());
    expect(context).toEqual({ actorId: 'dona', expectedUpdatedAt: undefined });
  });

  it('passes expectedUpdatedAt as a Date', async () => {
    await useCase.execute('m1', 'dona', ID, { name: 'Arroz', expectedUpdatedAt: '2026-11-16T10:00:00.000Z' });

    expect(repo.calls[0].context.expectedUpdatedAt).toEqual(new Date('2026-11-16T10:00:00.000Z'));
  });

  it.each([
    ['empty body', {}],
    ['only expectedUpdatedAt', { expectedUpdatedAt: '2026-11-16T10:00:00.000Z' }],
    ['name too short', { name: 'A' }],
    ['name too long', { name: 'x'.repeat(161) }],
    ['empty barcode', { barcode: '  ' }],
    ['barcode too long', { barcode: '1'.repeat(65) }],
    ['price zero', { salePrice: '0' }],
    ['price zero as number', { salePrice: 0 }],
    ['negative price', { salePrice: '-1' }],
    ['price text', { salePrice: 'abc' }],
    ['empty price', { salePrice: '' }],
    ['unit', { name: 'Arroz', unit: 'KG' }],
    ['active', { name: 'Arroz', active: false }],
    ['bad expectedUpdatedAt', { name: 'Arroz', expectedUpdatedAt: 'ontem' }],
  ])('refuses %s without touching the repository', async (_label, body) => {
    await expect(useCase.execute('m1', 'dona', ID, body)).rejects.toBeInstanceOf(ZodError);
    expect(repo.calls).toHaveLength(0);
  });

  it('throws ProductNotFoundError when the repository finds no product in the shop', async () => {
    repo.result = null;
    await expect(useCase.execute('m1', 'dona', ID, { name: 'Arroz' })).rejects.toBeInstanceOf(ProductNotFoundError);
  });

  it('turns the barcode conflict of the repository into BarcodeAlreadyExistsError', async () => {
    repo.error = new ProductBarcodeConflictError('2002');
    const promise = useCase.execute('m1', 'dona', ID, { barcode: '2002' });
    await expect(promise).rejects.toBeInstanceOf(BarcodeAlreadyExistsError);
    await expect(promise).rejects.toThrow('2002');
  });

  it('lets ProductChangedError through', async () => {
    repo.error = new ProductChangedError();
    await expect(useCase.execute('m1', 'dona', ID, { name: 'Arroz' })).rejects.toBeInstanceOf(ProductChangedError);
  });

  it('returns the product the repository gives back', async () => {
    const product = await useCase.execute('m1', 'dona', ID, { name: 'Arroz' });
    expect(product).toBe(repo.result);
  });

  describe('generateBarcode (D-24)', () => {
    // random() yields the digits of `digits` one by one, then repeats the last one.
    const digitsRandom = (digits: string) => {
      let i = 0;
      return () => Number(digits[Math.min(i++, digits.length - 1)]) / 10;
    };

    it('sends a generated EAN-13 as the only change, flagged as generated, with expectedUpdatedAt', async () => {
      await useCase.execute('m1', 'dona', ID, {
        generateBarcode: true,
        expectedUpdatedAt: '2026-11-16T10:00:00.000Z',
      });

      expect(repo.calls).toHaveLength(1);
      const { changes, context } = repo.calls[0];
      expect(Object.keys(changes)).toEqual(['barcode']);
      expect(changes.barcode).toMatch(/^29\d{11}$/);
      expect(isValidEan13(changes.barcode!)).toBe(true);
      expect(context).toEqual({
        actorId: 'dona',
        expectedUpdatedAt: new Date('2026-11-16T10:00:00.000Z'),
        barcodeGenerated: true,
      });
    });

    it('a plain edit is not flagged as generated', async () => {
      await useCase.execute('m1', 'dona', ID, { name: 'Arroz 2' });
      expect(repo.calls[0].context).not.toHaveProperty('barcodeGenerated');
    });

    it('draws again on collision: 4 collisions and a free 5th writes the 5th code', async () => {
      repo.conflictsLeft = 4;
      const random = digitsRandom('0000000000' + '1111111111' + '2222222222' + '3333333333' + '4444444444');
      useCase = new UpdateProductUseCase(repo as unknown as ProductRepository, random);

      await useCase.execute('m1', 'dona', ID, { generateBarcode: true });

      expect(repo.calls).toHaveLength(5);
      expect(repo.calls[4].changes.barcode!.startsWith('294444444444')).toBe(true);
    });

    it('after 5 collisions throws BarcodeGenerationFailedError with no driver text', async () => {
      repo.conflictsLeft = 99;
      useCase = new UpdateProductUseCase(repo as unknown as ProductRepository, () => 0);

      const promise = useCase.execute('m1', 'dona', ID, { generateBarcode: true });

      await expect(promise).rejects.toBeInstanceOf(BarcodeGenerationFailedError);
      await expect(promise).rejects.toHaveProperty('message', new BarcodeGenerationFailedError().message);
      expect(repo.calls).toHaveLength(5);
    });

    it('does not retry other errors', async () => {
      repo.error = new ProductChangedError();
      await expect(useCase.execute('m1', 'dona', ID, { generateBarcode: true })).rejects.toBeInstanceOf(ProductChangedError);
      expect(repo.calls).toHaveLength(1);
    });

    it('throws ProductNotFoundError when the product is not in the shop', async () => {
      repo.result = null;
      await expect(useCase.execute('m1', 'dona', ID, { generateBarcode: true })).rejects.toBeInstanceOf(ProductNotFoundError);
    });

    it.each([
      ['with barcode', { generateBarcode: true, barcode: '2002' }],
      ['false alone (nothing to change)', { generateBarcode: false }],
      ['not a boolean', { generateBarcode: 'yes' }],
    ])('refuses %s without touching the repository', async (_label, body) => {
      await expect(useCase.execute('m1', 'dona', ID, body)).rejects.toBeInstanceOf(ZodError);
      expect(repo.calls).toHaveLength(0);
    });
  });
});
