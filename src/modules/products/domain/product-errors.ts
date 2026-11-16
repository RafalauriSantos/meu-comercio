/** Thrown by the repository when the unique index (merchant, barcode) refuses the new barcode. */
export class ProductBarcodeConflictError extends Error {
  constructor(public readonly barcode: string) {
    super(`Já existe um produto cadastrado com o código de barras [${barcode}].`);
    this.name = 'ProductBarcodeConflictError';
  }
}

/** The product was changed by someone else after the caller read it. */
export class ProductChangedError extends Error {
  constructor() {
    super('Este produto foi alterado por outra pessoa. Recarregue a página para ver os dados atuais e tente de novo.');
    this.name = 'ProductChangedError';
  }
}
