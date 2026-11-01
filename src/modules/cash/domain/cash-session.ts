import { Money } from '@/shared/domain/money';

export type CashSessionStatus = 'OPEN' | 'CLOSED';

export type CashMovementType =
  | 'OPENING_BALANCE'
  | 'CLOSING_BALANCE'
  | 'SALE_RECEIPT'
  | 'SALE_REFUND'
  | 'CREDIT_PAYMENT'
  | 'DEBT_PAYMENT'
  | 'SUPPLY'
  | 'BLEED'
  | 'WITHDRAWAL'
  | 'DEPOSIT'
  | 'CASH_CANCEL';

const CASH_INFLOW_TYPES: ReadonlySet<CashMovementType> = new Set([
  'OPENING_BALANCE',
  'SALE_RECEIPT',
  'CREDIT_PAYMENT',
  'DEBT_PAYMENT',
  'SUPPLY',
  'DEPOSIT',
]);

const CASH_OUTFLOW_TYPES: ReadonlySet<CashMovementType> = new Set([
  'SALE_REFUND',
  'BLEED',
  'WITHDRAWAL',
  'CASH_CANCEL',
]);

export function applyCashMovement(currentTotal: Money, type: CashMovementType, amount: Money): Money {
  if (CASH_INFLOW_TYPES.has(type)) {
    return currentTotal.add(amount);
  }
  if (CASH_OUTFLOW_TYPES.has(type)) {
    return currentTotal.subtract(amount);
  }
  return currentTotal;
}

export interface CashSessionProps {
  id: string;
  merchantId: string;
  openedBy: string;
  openingBalance: Money;
  openedAt: Date;
  status: CashSessionStatus;
  closedBy?: string | null;
  closingBalance?: Money | null;
  closedAt?: Date | null;
}

export class CashSession {
  public readonly id: string;
  public readonly merchantId: string;
  public readonly openedBy: string;
  public readonly openingBalance: Money;
  public readonly openedAt: Date;
  private _status: CashSessionStatus;
  private _closedBy: string | null;
  private _closingBalance: Money | null;
  private _closedAt: Date | null;

  constructor(props: CashSessionProps) {
    if (!props.openedBy?.trim()) {
      throw new Error('Operador de abertura é obrigatório.');
    }
    if (props.openingBalance.isNegative()) {
      throw new Error('Saldo inicial de abertura não pode ser negativo.');
    }

    this.id = props.id;
    this.merchantId = props.merchantId;
    this.openedBy = props.openedBy.trim().toLowerCase();
    this.openingBalance = props.openingBalance;
    this.openedAt = props.openedAt;
    this._status = props.status;
    this._closedBy = props.closedBy ?? null;
    this._closingBalance = props.closingBalance ?? null;
    this._closedAt = props.closedAt ?? null;
  }

  public static create(merchantId: string, operatorId: string, openingBalance: Money, id = crypto.randomUUID()): CashSession {
    return new CashSession({
      id,
      merchantId,
      openedBy: operatorId,
      openingBalance,
      openedAt: new Date(),
      status: 'OPEN',
    });
  }

  public get status(): CashSessionStatus {
    return this._status;
  }

  public get closedBy(): string | null {
    return this._closedBy;
  }

  public get closingBalance(): Money | null {
    return this._closingBalance;
  }

  public get closedAt(): Date | null {
    return this._closedAt;
  }

  public isOpen(): boolean {
    return this._status === 'OPEN';
  }

  public isClosed(): boolean {
    return this._status === 'CLOSED';
  }

  public close(operatorId: string, closingBalance: Money, closedAt = new Date()): void {
    if (!this.isOpen()) {
      throw new Error('A sessão de caixa já está fechada.');
    }
    if (!operatorId?.trim()) {
      throw new Error('Operador de fechamento é obrigatório.');
    }
    if (closingBalance.isNegative()) {
      throw new Error('Saldo final contado não pode ser negativo.');
    }

    this._status = 'CLOSED';
    this._closedBy = operatorId.trim().toLowerCase();
    this._closingBalance = closingBalance;
    this._closedAt = closedAt;
  }
}
