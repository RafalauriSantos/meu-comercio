import { Money } from '@/shared/domain/money';
import { CustomerRepository } from '../domain/customer-repository.port';
import {
  CustomerCreditRepository,
  CreditMetrics,
} from '../domain/customer-credit-repository.port';

export interface GetCreditMetricsDTO {
  merchantId: string;
}

export class GetCreditMetricsUseCase {
  constructor(
    private readonly customerCreditRepository: CustomerCreditRepository,
    private readonly customerRepository?: CustomerRepository
  ) {}

  async execute(dto: GetCreditMetricsDTO): Promise<CreditMetrics> {
    if (!dto.merchantId?.trim()) {
      throw new Error('Merchant ID é obrigatório.');
    }

    // Se o repositório fornece implementação otimizada direta, utilize-a
    if (typeof this.customerCreditRepository.getCreditMetrics === 'function') {
      return this.customerCreditRepository.getCreditMetrics(dto.merchantId);
    }

    // Fallback: calcular via customerRepository se fornecido
    if (this.customerRepository) {
      const activeCustomers = await this.customerRepository.findAllActive(dto.merchantId);
      let totalOutstandingCredit = Money.zero();
      let totalSettledCredit = Money.zero();
      let activeDebtorsCount = 0;

      for (const customer of activeCustomers) {
        const balance = await this.customerCreditRepository.getBalance(
          dto.merchantId,
          customer.id
        );

        if (balance.currentDebt.isPositive()) {
          totalOutstandingCredit = totalOutstandingCredit.add(balance.currentDebt);
          activeDebtorsCount++;
        }

        totalSettledCredit = totalSettledCredit.add(balance.totalCredits);
      }

      return {
        totalOutstandingCredit,
        totalSettledCredit,
        activeDebtorsCount,
      };
    }

    return {
      totalOutstandingCredit: Money.zero(),
      totalSettledCredit: Money.zero(),
      activeDebtorsCount: 0,
    };
  }
}
