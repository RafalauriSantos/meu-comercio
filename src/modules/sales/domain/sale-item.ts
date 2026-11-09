import { Money } from '@/shared/domain/money';
import { ProductUnit, isProductUnit, lineSubtotal } from '@/shared/domain/product-unit';

export interface SaleItemProps {
  id: string;
  productId: string;
  productName: string;
  /** Price per unit, or per kg when the unit is 'KG'. */
  unitPrice: Money;
  /** Units, or grams when the unit is 'KG'. */
  quantity: number;
  unit?: ProductUnit;
}

export class SaleItem {
  public readonly id: string;
  public readonly productId: string;
  public readonly productName: string;
  public readonly unitPrice: Money;
  public readonly quantity: number;
  public readonly unit: ProductUnit;

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
    const unit = props.unit ?? 'UN';
    if (!isProductUnit(unit)) {
      throw new Error('Unidade do item deve ser UN ou KG.');
    }
    this.unit = unit;
  }

  public static create(
    productId: string,
    productName: string,
    unitPrice: Money,
    quantity: number,
    id = crypto.randomUUID(),
    unit: ProductUnit = 'UN'
  ): SaleItem {
    return new SaleItem({
      id,
      productId,
      productName,
      unitPrice,
      quantity,
      unit,
    });
  }

  public get subtotal(): Money {
    return lineSubtotal(this.unitPrice, this.quantity, this.unit);
  }

  public toJSON() {
    return {
      id: this.id,
      productId: this.productId,
      productName: this.productName,
      unitPrice: this.unitPrice.toDecimal(),
      quantity: this.quantity,
      unit: this.unit,
      subtotal: this.subtotal.toDecimal(),
    };
  }
}
