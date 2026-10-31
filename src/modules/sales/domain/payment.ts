import { Money } from '@/shared/domain/money';

export type PaymentMethod = 'CASH' | 'PIX' | 'DEBIT_CARD' | 'CREDIT_CARD';

export type PaymentStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'DECLINED'
  | 'CANCELLED'
  | 'REFUNDED'
  | 'FAILED';

export interface PaymentProps {
  id: string;
  method: PaymentMethod;
  amount: Money;
  receivedAmount?: Money;
  changeAmount?: Money;
  status?: PaymentStatus;
  installments?: number;
  externalReference?: string | null;
}

export class Payment {
  public readonly id: string;
  public readonly method: PaymentMethod;
  public readonly amount: Money;
  public readonly receivedAmount: Money;
  public readonly changeAmount: Money;
  public readonly status: PaymentStatus;
  public readonly installments: number;
  public readonly externalReference: string | null;

  constructor(props: PaymentProps) {
    if (!props.method) {
      throw new Error('Método de pagamento é obrigatório.');
    }
    if (props.amount.isZero() || props.amount.isNegative()) {
      throw new Error('Valor do pagamento deve ser maior que zero.');
    }

    const received = props.receivedAmount ?? props.amount;
    const installments = props.installments ?? 1;

    if (props.method === 'CASH') {
      if (received.lessThan(props.amount)) {
        throw new Error('Valor recebido em dinheiro é inferior ao valor do pagamento.');
      }
    } else {
      if (!received.equals(props.amount)) {
        throw new Error('Valor recebido para pagamentos digitais/cartão deve ser exatamente igual ao valor do pagamento.');
      }
      if (installments > 1 && props.method !== 'CREDIT_CARD') {
        throw new Error('Parcelamento só é permitido para pagamento com cartão de crédito.');
      }
    }

    if (installments < 1 || !Number.isInteger(installments)) {
      throw new Error('Número de parcelas deve ser um número inteiro positivo.');
    }

    const calculatedChange = props.method === 'CASH'
      ? received.subtract(props.amount)
      : Money.zero(props.amount.currency);

    this.id = props.id;
    this.method = props.method;
    this.amount = props.amount;
    this.receivedAmount = received;
    this.changeAmount = props.changeAmount ?? calculatedChange;
    this.status = props.status ?? 'APPROVED';
    this.installments = installments;
    this.externalReference = props.externalReference ?? null;
  }

  public static create(
    method: PaymentMethod,
    amount: Money,
    options?: {
      receivedAmount?: Money;
      installments?: number;
      externalReference?: string | null;
      id?: string;
    }
  ): Payment {
    return new Payment({
      id: options?.id ?? crypto.randomUUID(),
      method,
      amount,
      receivedAmount: options?.receivedAmount,
      installments: options?.installments,
      externalReference: options?.externalReference,
      status: 'APPROVED',
    });
  }

  public isCash(): boolean {
    return this.method === 'CASH';
  }

  public isApproved(): boolean {
    return this.status === 'APPROVED';
  }

  public toJSON() {
    return {
      id: this.id,
      method: this.method,
      amount: this.amount.toDecimal(),
      receivedAmount: this.receivedAmount.toDecimal(),
      changeAmount: this.changeAmount.toDecimal(),
      status: this.status,
      installments: this.installments,
      externalReference: this.externalReference,
    };
  }
}
