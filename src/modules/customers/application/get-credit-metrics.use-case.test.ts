import { describe, it, expect, beforeEach } from 'vitest';
import { Money } from '@/shared/domain/money';
import { Customer } from '../domain/customer';
import { CreditMovement } from '../domain/credit-movement';
import { CustomerRepository } from '../domain/customer-repository.port';
import {
  CustomerCreditRepository,
  CustomerCreditBalance,
  CreditMetrics,
} from '../domain/customer-credit-repository.port';
import { GetCreditMetricsUseCase } from './get-credit-metrics.use-case';

class InMemoryCustomerRepository implements CustomerRepository {
  public customers: Map<string, Customer> = new Map();

  async save(customer: Customer): Promise<void> {
    this.customers.set(`${customer.merchantId}:${customer.id}`, customer);
  }

  async findById(merchantId: string, customerId: string): Promise<Customer | null> {
    return this.customers.get(`${merchantId}:${customerId}`) ?? null;
  }

  async findByPhone(merchantId: string, phone: string): Promise<Customer | null> {
    return (
      Array.from(this.customers.values()).find(
        (c) => c.merchantId === merchantId && c.phone === phone
      ) ?? null
    );
  }

  async findAllActive(merchantId: string): Promise<Customer[]> {
    return Array.from(this.customers.values()).filter(
      (c) => c.merchantId === merchantId && c.active
    );
  }

  async search(merchantId: string, query: string): Promise<Customer[]> {
    const q = query.toLowerCase();
    return Array.from(this.customers.values()).filter(
      (c) =>
        c.merchantId === merchantId &&
        (c.name.toLowerCase().includes(q) || c.phone.includes(q))
    );
  }
}

class InMemoryCustomerCreditRepository implements CustomerCreditRepository {
  public movements: CreditMovement[] = [];

  async saveMovement(movement: CreditMovement): Promise<void> {
    this.movements.push(movement);
  }

  async getBalance(merchantId: string, customerId: string): Promise<CustomerCreditBalance> {
    const customerMovements = this.movements.filter(
      (m) => m.merchantId === merchantId && m.customerId === customerId
    );
    const totalDebits = customerMovements
      .filter((m) => m.type === 'DEBIT')
      .reduce((sum, m) => sum.add(m.amount), Money.zero());
    const totalCredits = customerMovements
      .filter((m) => m.type === 'CREDIT')
      .reduce((sum, m) => sum.add(m.amount), Money.zero());
    const currentDebt = totalDebits.subtract(totalCredits);

    return {
      currentDebt: currentDebt.isNegative() ? Money.zero() : currentDebt,
      totalDebits,
      totalCredits,
    };
  }

  async getMovementsByCustomerId(merchantId: string, customerId: string): Promise<CreditMovement[]> {
    return this.movements.filter(
      (m) => m.merchantId === merchantId && m.customerId === customerId
    );
  }

  async getCreditMetrics(merchantId: string): Promise<CreditMetrics> {
    const merchantMovements = this.movements.filter((m) => m.merchantId === merchantId);

    // Agrupa movimentos por cliente para calcular saldo líquido de cada um
    const customerIds = Array.from(new Set(merchantMovements.map((m) => m.customerId)));
    let totalOutstanding = Money.zero();
    let activeDebtorsCount = 0;

    for (const custId of customerIds) {
      const balance = await this.getBalance(merchantId, custId);
      if (balance.currentDebt.isPositive()) {
        totalOutstanding = totalOutstanding.add(balance.currentDebt);
        activeDebtorsCount++;
      }
    }

    // Total quitado/amortizado historicamente neste comerciante
    const totalSettled = merchantMovements
      .filter((m) => m.type === 'CREDIT')
      .reduce((sum, m) => sum.add(m.amount), Money.zero());

    return {
      totalOutstandingCredit: totalOutstanding,
      totalSettledCredit: totalSettled,
      activeDebtorsCount,
    };
  }
}

describe('GetCreditMetricsUseCase — Métricas de Fiado na Rua', () => {
  let customerRepo: InMemoryCustomerRepository;
  let creditRepo: InMemoryCustomerCreditRepository;
  let useCase: GetCreditMetricsUseCase;

  const MERCHANT_A = 'merchant-mercearia-silva';
  const MERCHANT_B = 'merchant-outro-bairro';
  const OPERATOR_ID = 'operador-1';

  beforeEach(async () => {
    customerRepo = new InMemoryCustomerRepository();
    creditRepo = new InMemoryCustomerCreditRepository();
    useCase = new GetCreditMetricsUseCase(creditRepo, customerRepo);
  });

  it('deve retornar métricas zeradas quando não há clientes ou movimentações', async () => {
    const metrics = await useCase.execute({ merchantId: MERCHANT_A });

    expect(metrics.totalOutstandingCredit.toDecimal()).toBe('0.00');
    expect(metrics.totalSettledCredit.toDecimal()).toBe('0.00');
    expect(metrics.activeDebtorsCount).toBe(0);
  });

  it('deve calcular corretamente o total em aberto na rua e o total quitado historicamente', async () => {
    // Cliente 1: Compra 100, paga 40 -> Devedor 60, Quitado 40
    const cust1 = Customer.create({
      merchantId: MERCHANT_A,
      name: 'Seu Zé',
      phone: '11999990001',
    });
    await customerRepo.save(cust1);
    await creditRepo.saveMovement(
      CreditMovement.create({
        merchantId: MERCHANT_A,
        customerId: cust1.id,
        type: 'DEBIT',
        amount: Money.fromDecimal('100.00'),
        operatorId: OPERATOR_ID,
      })
    );
    await creditRepo.saveMovement(
      CreditMovement.create({
        merchantId: MERCHANT_A,
        customerId: cust1.id,
        type: 'CREDIT',
        amount: Money.fromDecimal('40.00'),
        operatorId: OPERATOR_ID,
      })
    );

    // Cliente 2: Compra 200, não pagou nada -> Devedor 200, Quitado 0
    const cust2 = Customer.create({
      merchantId: MERCHANT_A,
      name: 'Dona Maria',
      phone: '11999990002',
    });
    await customerRepo.save(cust2);
    await creditRepo.saveMovement(
      CreditMovement.create({
        merchantId: MERCHANT_A,
        customerId: cust2.id,
        type: 'DEBIT',
        amount: Money.fromDecimal('200.00'),
        operatorId: OPERATOR_ID,
      })
    );

    // Cliente 3: Compra 50, quitou integralmente 50 -> Devedor 0, Quitado 50
    const cust3 = Customer.create({
      merchantId: MERCHANT_A,
      name: 'Carlos Mendes',
      phone: '11999990003',
    });
    await customerRepo.save(cust3);
    await creditRepo.saveMovement(
      CreditMovement.create({
        merchantId: MERCHANT_A,
        customerId: cust3.id,
        type: 'DEBIT',
        amount: Money.fromDecimal('50.00'),
        operatorId: OPERATOR_ID,
      })
    );
    await creditRepo.saveMovement(
      CreditMovement.create({
        merchantId: MERCHANT_A,
        customerId: cust3.id,
        type: 'CREDIT',
        amount: Money.fromDecimal('50.00'),
        operatorId: OPERATOR_ID,
      })
    );

    const metrics = await useCase.execute({ merchantId: MERCHANT_A });

    // Total em aberto na rua: 60 + 200 = 260.00
    expect(metrics.totalOutstandingCredit.toDecimal()).toBe('260.00');

    // Total quitado historicamente: 40 + 50 = 90.00
    expect(metrics.totalSettledCredit.toDecimal()).toBe('90.00');

    // Contagem de clientes com saldo devedor ativo (> 0): 2 (Seu Zé e Dona Maria)
    expect(metrics.activeDebtorsCount).toBe(2);
  });

  it('deve garantir isolamento absoluto multi-tenant sem misturar débitos de outro comerciante', async () => {
    // Merchant A: Cliente com dívida de R$ 50,00
    const custA = Customer.create({
      merchantId: MERCHANT_A,
      name: 'Cliente Loja A',
      phone: '11911111111',
    });
    await customerRepo.save(custA);
    await creditRepo.saveMovement(
      CreditMovement.create({
        merchantId: MERCHANT_A,
        customerId: custA.id,
        type: 'DEBIT',
        amount: Money.fromDecimal('50.00'),
        operatorId: OPERATOR_ID,
      })
    );

    // Merchant B: Cliente com dívida massiva de R$ 10.000,00 e quitação de R$ 5.000,00
    const custB = Customer.create({
      merchantId: MERCHANT_B,
      name: 'Cliente Loja B',
      phone: '11922222222',
    });
    await customerRepo.save(custB);
    await creditRepo.saveMovement(
      CreditMovement.create({
        merchantId: MERCHANT_B,
        customerId: custB.id,
        type: 'DEBIT',
        amount: Money.fromDecimal('10000.00'),
        operatorId: OPERATOR_ID,
      })
    );
    await creditRepo.saveMovement(
      CreditMovement.create({
        merchantId: MERCHANT_B,
        customerId: custB.id,
        type: 'CREDIT',
        amount: Money.fromDecimal('5000.00'),
        operatorId: OPERATOR_ID,
      })
    );

    // Consulta para Merchant A não deve sofrer qualquer interferência de Merchant B
    const metricsA = await useCase.execute({ merchantId: MERCHANT_A });
    expect(metricsA.totalOutstandingCredit.toDecimal()).toBe('50.00');
    expect(metricsA.totalSettledCredit.toDecimal()).toBe('0.00');
    expect(metricsA.activeDebtorsCount).toBe(1);

    // Consulta para Merchant B
    const metricsB = await useCase.execute({ merchantId: MERCHANT_B });
    expect(metricsB.totalOutstandingCredit.toDecimal()).toBe('5000.00');
    expect(metricsB.totalSettledCredit.toDecimal()).toBe('5000.00');
    expect(metricsB.activeDebtorsCount).toBe(1);
  });
});
