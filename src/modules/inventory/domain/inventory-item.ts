export class InsufficientStockError extends Error {
  constructor(
    public readonly productId: string,
    public readonly available: number,
    public readonly requested: number
  ) {
    super(`Estoque insuficiente. Saldo disponível: ${available}, solicitado: ${requested}.`);
    this.name = 'InsufficientStockError';
  }
}

export interface InventoryItemProps {
  merchantId: string;
  productId: string;
  availableQuantity: number;
  updatedAt: Date;
}

export class InventoryItem {
  public readonly merchantId: string;
  public readonly productId: string;
  private _availableQuantity: number;
  public updatedAt: Date;

  constructor(props: InventoryItemProps) {
    if (props.availableQuantity < 0) {
      throw new Error('Quantidade em estoque não pode ser negativa.');
    }
    this.merchantId = props.merchantId;
    this.productId = props.productId;
    this._availableQuantity = props.availableQuantity;
    this.updatedAt = props.updatedAt;
  }

  public get availableQuantity(): number {
    return this._availableQuantity;
  }

  public hasSufficientStock(requested: number): boolean {
    return this._availableQuantity >= requested;
  }

  public restock(quantity: number): void {
    if (quantity <= 0 || !Number.isInteger(quantity)) {
      throw new Error('A quantidade de reposição deve ser um número inteiro positivo.');
    }
    this._availableQuantity += quantity;
    this.updatedAt = new Date();
  }

  public deduct(quantity: number): void {
    if (quantity <= 0 || !Number.isInteger(quantity)) {
      throw new Error('A quantidade de baixa deve ser um número inteiro positivo.');
    }
    if (!this.hasSufficientStock(quantity)) {
      throw new InsufficientStockError(this.productId, this._availableQuantity, quantity);
    }
    this._availableQuantity -= quantity;
    this.updatedAt = new Date();
  }
}
