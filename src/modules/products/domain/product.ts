import { Money } from '@/shared/domain/money';
import { ProductUnit, isProductUnit } from '@/shared/domain/product-unit';

export interface ProductProps {
  id: string;
  merchantId: string;
  barcode: string;
  name: string;
  salePrice: Money;
  /** Missing means by the unit. */
  unit?: ProductUnit;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class Product {
  public readonly id: string;
  public readonly merchantId: string;
  public readonly barcode: string;
  public readonly name: string;
  public readonly salePrice: Money;
  public readonly unit: ProductUnit;
  public readonly active: boolean;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;

  constructor(props: ProductProps) {
    const trimmedBarcode = props.barcode?.trim();
    if (!trimmedBarcode) {
      throw new Error('Código de barras do produto é obrigatório.');
    }
    const trimmedName = props.name?.trim();
    if (!trimmedName || trimmedName.length < 2 || trimmedName.length > 160) {
      throw new Error('Nome do produto deve ter entre 2 e 160 caracteres.');
    }
    if (props.salePrice.isNegative()) {
      throw new Error('Preço de venda não pode ser negativo.');
    }

    this.id = props.id;
    this.merchantId = props.merchantId;
    this.barcode = trimmedBarcode;
    this.name = trimmedName;
    this.salePrice = props.salePrice;
    const unit = props.unit ?? 'UN';
    if (!isProductUnit(unit)) {
      throw new Error('Unidade do produto deve ser UN ou KG.');
    }
    this.unit = unit;
    this.active = props.active;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  public static create(
    merchantId: string,
    barcode: string,
    name: string,
    salePrice: Money,
    id = crypto.randomUUID(),
    unit: ProductUnit = 'UN'
  ): Product {
    const now = new Date();
    return new Product({
      id,
      merchantId,
      barcode,
      name,
      salePrice,
      unit,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
  }
}
