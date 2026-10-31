import { Money } from '@/shared/domain/money';

export type CreditMovementType = 'DEBIT' | 'CREDIT';

export interface CreditMovementProps {
  id: string;
  merchantId: string;
  customerId: string;
  type: CreditMovementType;
  amount: Money;
  operatorId: string;
  authorizedBy?: string | null;
  saleId?: string | null;
  cashSessionId?: string | null;
  note?: string | null;
  createdAt: Date;
}

export class CreditMovement {
  public readonly id: string;
  public readonly merchantId: string;
  public readonly customerId: string;
  public readonly type: CreditMovementType;
  public readonly amount: Money;
  public readonly operatorId: string;
  public readonly authorizedBy: string | null;
  public readonly saleId: string | null;
  public readonly cashSessionId: string | null;
  public readonly note: string | null;
  public readonly createdAt: Date;

  constructor(props: CreditMovementProps) {
    if (!props.operatorId || !props.operatorId.trim()) {
      throw new Error('Operator ID is required for credit movement');
    }

    if (!props.amount.isPositive()) {
      throw new Error('Credit movement amount must be greater than zero');
    }

    this.id = props.id;
    this.merchantId = props.merchantId;
    this.customerId = props.customerId;
    this.type = props.type;
    this.amount = props.amount;
    this.operatorId = props.operatorId.trim();
    this.authorizedBy = props.authorizedBy ?? null;
    this.saleId = props.saleId ?? null;
    this.cashSessionId = props.cashSessionId ?? null;
    this.note = props.note ?? null;
    this.createdAt = props.createdAt;
  }

  public toJSON() {
    return {
      id: this.id,
      merchantId: this.merchantId,
      customerId: this.customerId,
      type: this.type,
      amount: this.amount.toDecimal(),
      operatorId: this.operatorId,
      authorizedBy: this.authorizedBy,
      saleId: this.saleId,
      cashSessionId: this.cashSessionId,
      note: this.note,
      createdAt: this.createdAt.toISOString(),
    };
  }

  public static create(params: {
    id?: string;
    merchantId: string;
    customerId: string;
    type: CreditMovementType;
    amount: Money;
    operatorId: string;
    authorizedBy?: string | null;
    saleId?: string | null;
    cashSessionId?: string | null;
    note?: string | null;
    now?: Date;
  }): CreditMovement {
    return new CreditMovement({
      id: params.id ?? crypto.randomUUID(),
      merchantId: params.merchantId,
      customerId: params.customerId,
      type: params.type,
      amount: params.amount,
      operatorId: params.operatorId,
      authorizedBy: params.authorizedBy,
      saleId: params.saleId,
      cashSessionId: params.cashSessionId,
      note: params.note,
      createdAt: params.now ?? new Date(),
    });
  }
}
