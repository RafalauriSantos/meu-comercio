import { describe, it, expect } from 'vitest';
import { PRODUCT_IMPORT_TEMPLATE } from './import-template';
import { parseProductCsv } from '@/modules/products/application/parse-product-csv';
import { ImportProductsUseCase } from '@/modules/products/application/import-products.use-case';

describe('product import template', () => {
  it('is a sheet the importer reads without any problem', async () => {
    expect(parseProductCsv(PRODUCT_IMPORT_TEMPLATE)).toHaveLength(2);

    const useCase = new ImportProductsUseCase({
      findExistingBarcodes: async () => new Set(),
      importAll: async () => {},
    });
    const report = await useCase.execute('m1', 'dona', PRODUCT_IMPORT_TEMPLATE, { dryRun: true });

    expect(report.errors).toEqual([]);
    expect(report.valid.map((row) => row.salePrice)).toEqual(['24.90', '8.50']);
  });
});
