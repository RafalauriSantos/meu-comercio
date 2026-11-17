import { describe, it, expect, vi } from 'vitest';
import { Product } from '../domain/product';
import { ProductBarcodeConflictError } from '../domain/product-errors';
import { isValidEan13 } from '../domain/generated-barcode';
import type { ProductRepository } from '../domain/product-repository.port';
import type { InventoryRepository } from '@/modules/inventory/domain/inventory-repository.port';
import type { AuditPort } from '@/modules/audit/domain/audit.port';
import {
  CreateProductUseCase,
  CreateProductSchema,
  ProductRowSchema,
  BarcodeAlreadyExistsError,
  BarcodeGenerationFailedError,
} from './create-product.use-case';

const MERCHANT = 'm1';
const BASE = { name: 'Arroz 5kg', salePrice: '24.90' };
// "29" + ten 0 digits + check digit.
const ZEROS_CODE = '2900000000001';

// Fake repository: `existing` is what findByBarcode sees; `raceOn` holds codes the insert refuses (23505)
// even though findByBarcode did not see them.
function setup(opts: { existing?: string[]; raceOn?: string[]; random?: () => number } = {}) {
  const stored: Product[] = [];
  const existing = new Set(opts.existing ?? []);
  const raceOn = new Set(opts.raceOn ?? []);
  const repo = {
    findByBarcode: vi.fn(async (_m: string, barcode: string) =>
      existing.has(barcode) ? ({ barcode } as Product) : null
    ),
    create: vi.fn(async (product: Product) => {
      if (raceOn.has(product.barcode)) throw new ProductBarcodeConflictError(product.barcode);
      stored.push(product);
    }),
  } as unknown as ProductRepository;
  const inventory = { save: vi.fn(), addMovement: vi.fn() } as unknown as InventoryRepository;
  const audit = { record: vi.fn() } as unknown as AuditPort;
  const useCase = new CreateProductUseCase(repo, inventory, audit, opts.random);
  return { useCase, repo, inventory, audit, stored };
}

// Random source that yields the given digits in order (then repeats); each digit d gives d/10 + 0.05.
function digitsRandom(digits: string) {
  let i = 0;
  return () => Number(digits[i++ % digits.length]) / 10 + 0.05;
}

describe('CreateProductUseCase generated barcode (D-23)', () => {
  it.each([[undefined], [''], ['   ']])('generates a valid EAN-13 starting with 29 when barcode is %j', async (barcode) => {
    const { useCase, stored } = setup();

    const product = await useCase.execute(MERCHANT, 'dona', { ...BASE, barcode });

    expect(product.barcode).toMatch(/^29\d{11}$/);
    expect(isValidEan13(product.barcode)).toBe(true);
    expect(stored).toHaveLength(1);
  });

  it('never replaces a typed barcode (trimmed) and audits barcodeGenerated false', async () => {
    const { useCase, audit } = setup();

    const product = await useCase.execute(MERCHANT, 'dona', { ...BASE, barcode: '  7891000100103 ' });

    expect(product.barcode).toBe('7891000100103');
    expect(audit.record).toHaveBeenCalledWith(
      MERCHANT, 'PRODUCT_CREATED', 'dona', 'PRODUCT', product.id,
      expect.objectContaining({ barcode: '7891000100103', barcodeGenerated: false })
    );
  });

  it('audits the generated barcode with barcodeGenerated true', async () => {
    const { useCase, audit } = setup();

    const product = await useCase.execute(MERCHANT, 'dona', BASE);

    expect(audit.record).toHaveBeenCalledWith(
      MERCHANT, 'PRODUCT_CREATED', 'dona', 'PRODUCT', product.id,
      expect.objectContaining({ barcode: product.barcode, barcodeGenerated: true })
    );
  });

  it('a typed duplicate still answers BarcodeAlreadyExistsError and is never regenerated', async () => {
    const { useCase, repo } = setup({ existing: ['123'] });

    await expect(useCase.execute(MERCHANT, 'dona', { ...BASE, barcode: '123' })).rejects.toThrow(BarcodeAlreadyExistsError);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('a typed barcode that loses a race at insert becomes BarcodeAlreadyExistsError', async () => {
    const { useCase } = setup({ raceOn: ['123'] });

    await expect(useCase.execute(MERCHANT, 'dona', { ...BASE, barcode: '123' })).rejects.toThrow(BarcodeAlreadyExistsError);
  });

  it('draws again when the first generated code already exists', async () => {
    const { useCase, repo } = setup({ existing: [ZEROS_CODE], random: digitsRandom('00000000001111111111') });

    const product = await useCase.execute(MERCHANT, 'dona', BASE);

    expect(product.barcode.startsWith('291111111111')).toBe(true);
    expect(repo.findByBarcode).toHaveBeenCalledTimes(2);
  });

  it('draws again when the insert hits the unique index (race)', async () => {
    const { useCase, repo, stored } = setup({ raceOn: [ZEROS_CODE], random: digitsRandom('00000000002222222222') });

    const product = await useCase.execute(MERCHANT, 'dona', BASE);

    expect(product.barcode.startsWith('292222222222')).toBe(true);
    expect(repo.create).toHaveBeenCalledTimes(2);
    expect(stored).toHaveLength(1);
  });

  it('after 5 collisions throws BarcodeGenerationFailedError and writes no stock or audit', async () => {
    const { useCase, repo, inventory, audit } = setup({ raceOn: [ZEROS_CODE], random: digitsRandom('0') });

    await expect(useCase.execute(MERCHANT, 'dona', { ...BASE, initialStock: 3 })).rejects.toThrow(BarcodeGenerationFailedError);
    expect(repo.create).toHaveBeenCalledTimes(5);
    expect(inventory.save).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('does not swallow other insert errors', async () => {
    const { useCase, repo } = setup();
    (repo.create as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('connection lost'));

    await expect(useCase.execute(MERCHANT, 'dona', BASE)).rejects.toThrow('connection lost');
    expect(repo.create).toHaveBeenCalledTimes(1);
  });

  it('the exhaustion message carries no driver text', () => {
    expect(new BarcodeGenerationFailedError().message).not.toMatch(/23505|constraint|uq_products/i);
  });

  it('create makes the barcode optional while the row schema (CSV import) still requires it', () => {
    expect(CreateProductSchema.parse({ ...BASE, barcode: '  ' }).barcode).toBeUndefined();
    expect(ProductRowSchema.safeParse({ ...BASE, barcode: '' }).success).toBe(false);
  });
});
