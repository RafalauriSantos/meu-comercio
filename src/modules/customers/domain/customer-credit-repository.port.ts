import { Money } from '@/shared/domain/money';
import { CreditMovement } from './credit-movement';

export interface CustomerCreditBalance {
  currentDebt: Money;
  totalDebits: Money;
  totalCredits: Money;
}

export interface CreditMetrics {
  totalOutstandingCredit: Money;
  totalSettledCredit: Money;
  activeDebtorsCount: number;
}

export interface CustomerCreditRepository {
  saveMovement(movement: CreditMovement): Promise<void>;
  getBalance(merchantId: string, customerId: string): Promise<CustomerCreditBalance>;
  getMovementsByCustomerId(merchantId: string, customerId: string): Promise<CreditMovement[]>;
  getCreditMetrics?(merchantId: string): Promise<CreditMetrics>;
  findMovementsBySaleId?(merchantId: string, saleId: string): Promise<CreditMovement[]>;
}
