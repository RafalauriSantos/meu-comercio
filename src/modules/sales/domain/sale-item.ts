import { Money } from '@/shared/domain/money';

export interface SaleItemProps {
  id: string;
  productId: string;
  productName: string;
  unitPrice: Money;
  quantity: number;
}

export class SaleItem {
  public readonly id: string;
  public readonly productId: string;
  public readonly productName: string;
  public readonly unitPrice: Money;
  public readonly quantity: number;

  constructor(props: SaleItemProps) {
    if (!props.productId?.trim()) {
      throw new Error('ID do produto é obrigatório.');
    }
    if (!props.productName?.trim()) {
      throw new Error('Nome do produto é obrigatório.');
    }
    if (props.unitPrice.isNegative()) {
      throw new Error('Preço unitário não pode ser negativo.');
    }
    if (props.quantity <= 0 || !Number.isInteger(props.quantity)) {
      throw new Error('Quantidade do item deve ser um número inteiro positivo.');
    }

    this.id = props.id;
    this.productId = props.productId.trim();
    this.productName = props.productName.trim();
    this.unitPrice = props.unitPrice;
    this.quantity = props.quantity;
  }

  public static create(
    productId: string,
    productName: string,
    unitPrice: Money,
    quantity: number,
    id = crypto.randomUUID()
  ): SaleItem {
    return new SaleItem({
      id,
      productId,
      productName,
      unitPrice,
      quantity,
    });
  }

  public get subtotal(): Money {
    return this.unitPrice.multiply(this.quantity);
  }

  public toJSON() {
    return {
      id: this.id,
      productId: this.productId,
      productName: this.productName,
      unitPrice: this.unitPrice.toDecimal(),
      quantity: this.quantity,
      subtotal: this.subtotal.toDecimal(),
    };
  }
}
