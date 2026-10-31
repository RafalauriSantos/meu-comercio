import { Money } from '@/shared/domain/money';
import { SaleItem } from './sale-item';
import { Payment } from './payment';

export type SaleStatus = 'PENDING_PAYMENT' | 'CONFIRMED' | 'CANCELLED' | 'REFUNDED';

export interface SaleProps {
  id: string;
  merchantId: string;
  cashSessionId: string;
  operatorId: string;
  status: SaleStatus;
  items: SaleItem[];
  payments: Payment[];
  discountAmount: Money;
  idempotencyKey?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class Sale {
  public readonly id: string;
  public readonly merchantId: string;
  public readonly cashSessionId: string;
  public readonly operatorId: string;
  private _status: SaleStatus;
  private _items: SaleItem[];
  private _payments: Payment[];
  private _discountAmount: Money;
  public readonly idempotencyKey: string | null;
  public readonly createdAt: Date;
  public updatedAt: Date;

  constructor(props: SaleProps) {
    if (!props.merchantId?.trim()) {
      throw new Error('Merchant ID é obrigatório.');
    }
    if (!props.cashSessionId?.trim()) {
      throw new Error('Sessão de caixa é obrigatória para a venda.');
    }
    if (!props.operatorId?.trim()) {
      throw new Error('Operador da venda é obrigatório.');
    }
    if (props.discountAmount.isNegative()) {
      throw new Error('Desconto não pode ser negativo.');
    }

    this.id = props.id;
    this.merchantId = props.merchantId.trim();
    this.cashSessionId = props.cashSessionId.trim();
    this.operatorId = props.operatorId.trim();
    this._status = props.status;
    this._items = [...props.items];
    this._payments = [...props.payments];
    this._discountAmount = props.discountAmount;
    this.idempotencyKey = props.idempotencyKey ?? null;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;

    if (this._discountAmount.greaterThan(this.subtotal)) {
      throw new Error('Desconto não pode ser maior que o subtotal da venda.');
    }
  }

  public static create(
    merchantId: string,
    cashSessionId: string,
    operatorId: string,
    options?: {
      idempotencyKey?: string | null;
      id?: string;
    }
  ): Sale {
    const now = new Date();
    return new Sale({
      id: options?.id ?? crypto.randomUUID(),
      merchantId,
      cashSessionId,
      operatorId,
      status: 'PENDING_PAYMENT',
      items: [],
      payments: [],
      discountAmount: Money.zero(),
      idempotencyKey: options?.idempotencyKey,
      createdAt: now,
      updatedAt: now,
    });
  }

  public get status(): SaleStatus {
    return this._status;
  }

  public isConfirmed(): boolean {
    return this._status === 'CONFIRMED';
  }

  public isPendingPayment(): boolean {
    return this._status === 'PENDING_PAYMENT';
  }

  public get items(): ReadonlyArray<SaleItem> {
    return Object.freeze([...this._items]);
  }

  public get payments(): ReadonlyArray<Payment> {
    return Object.freeze([...this._payments]);
  }

  public get discountAmount(): Money {
    return this._discountAmount;
  }

  public get subtotal(): Money {
    return this._items.reduce(
      (sum, item) => sum.add(item.subtotal),
      Money.zero()
    );
  }

  public get total(): Money {
    return this.subtotal.subtract(this._discountAmount);
  }

  public get cashReceived(): Money {
    return this._payments
      .filter((p) => p.isCash())
      .reduce((sum, p) => sum.add(p.receivedAmount), Money.zero());
  }

  public get changeAmount(): Money {
    return this._payments
      .filter((p) => p.isCash())
      .reduce((sum, p) => sum.add(p.changeAmount), Money.zero());
  }

  public get cashPaid(): Money {
    return this._payments
      .filter((p) => p.isCash())
      .reduce((sum, p) => sum.add(p.amount), Money.zero());
  }

  public addItem(item: SaleItem): void {
    this.ensurePendingPayment();
    this._items.push(item);
    this.updatedAt = new Date();
  }

  public applyDiscount(amount: Money): void {
    this.ensurePendingPayment();
    if (amount.isNegative()) {
      throw new Error('Desconto não pode ser negativo.');
    }
    if (amount.greaterThan(this.subtotal)) {
      throw new Error('Desconto não pode exceder o subtotal da venda.');
    }
    this._discountAmount = amount;
    this.updatedAt = new Date();
  }

  public confirmPayments(approvals: Payment[]): void {
    this.ensurePendingPayment();
    if (!approvals || approvals.length === 0) {
      throw new Error('Pelo menos um pagamento é obrigatório.');
    }
    if (this._items.length === 0) {
      throw new Error('Venda não pode ser finalizada sem itens.');
    }

    const unapproved = approvals.find((p) => !p.isApproved());
    if (unapproved) {
      throw new Error('Apenas pagamentos aprovados podem confirmar a venda.');
    }

    const totalPaid = approvals.reduce(
      (sum, p) => sum.add(p.amount),
      Money.zero()
    );

    if (!totalPaid.equals(this.total)) {
      throw new Error(
        `A soma dos pagamentos (${totalPaid.toDecimal()}) deve ser exatamente igual ao total da venda (${this.total.toDecimal()}).`
      );
    }

    this._payments = [...approvals];
    this._status = 'CONFIRMED';
    this.updatedAt = new Date();
  }

  public toJSON() {
    return {
      id: this.id,
      merchantId: this.merchantId,
      cashSessionId: this.cashSessionId,
      operatorId: this.operatorId,
      status: this._status,
      subtotal: this.subtotal.toDecimal(),
      discountAmount: this._discountAmount.toDecimal(),
      total: this.total.toDecimal(),
      cashReceived: this.cashReceived.toDecimal(),
      changeAmount: this.changeAmount.toDecimal(),
      idempotencyKey: this.idempotencyKey,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
      items: this._items.map((item) => item.toJSON()),
      payments: this._payments.map((payment) => payment.toJSON()),
    };
  }

  private ensurePendingPayment(): void {
    if (!this.isPendingPayment()) {
      throw new Error('Operação não permitida: a venda já foi finalizada ou cancelada.');
    }
  }
}
