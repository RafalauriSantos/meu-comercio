import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CreditMetricsData, CustomerBalance, CustomerItem } from '@/frontend/lib/api-client';
import { CustomersTab } from './customers-tab';
import type { CustomerFilter } from './customers-list';
import type { useCustomersTab } from './use-customers-tab';

function customer(id: string, name: string, phone: string): CustomerItem {
  return { id, name, phone, creditLimit: '100.00' };
}

function balance(id: string, currentDebt: string, creditLimit = '100.00'): CustomerBalance {
  return {
    customerId: id,
    name: id,
    phone: '',
    active: true,
    creditLimit,
    currentDebt,
    availableCredit: '0.00',
    totalDebits: '0.00',
    totalCredits: '0.00',
  };
}

const customers = [
  customer('1', 'Maria Souza', '11981642350'),
  customer('2', 'Seu Antenor', '1532345678'),
  customer('3', 'João Pereira', '11999998888'),
  customer('4', 'Padaria Estrela', '15997771234'),
  customer('5', 'joazinho', '6261616161649496169'),
];
const balances = {
  '1': balance('1', '85.50'),
  '2': balance('2', '0.00', '150.00'),
  '3': balance('3', '230.00', '200.00'),
  '4': balance('4', '40.00', '300.00'),
  '5': balance('5', '0.00'),
};
const metrics: CreditMetricsData = { totalOutstandingCredit: '355.50', totalSettledCredit: '120.00', activeDebtorsCount: 3 };

function render({
  list = customers,
  bal = balances,
  filter = 'all',
  query = '',
  creditMetrics = metrics as CreditMetricsData | null,
  isOwner = true,
}: {
  isOwner?: boolean;
  list?: CustomerItem[];
  bal?: Record<string, CustomerBalance>;
  filter?: CustomerFilter;
  query?: string;
  creditMetrics?: CreditMetricsData | null;
} = {}) {
  const tab = {
    customers: list,
    customerBalances: bal,
    customerQuery: query,
    customerFilter: filter,
    showNewCustomer: false,
    settlingCustomer: null,
    creditMetrics,
    edit: { target: null },
    statement: { target: null },
  } as unknown as ReturnType<typeof useCustomersTab>;
  const user = { username: 'u', merchantId: 'm', authorities: [], isOwner };
  return renderToStaticMarkup(
    <CustomersTab tab={tab} user={user} loadFailed={{}} retrying={false} processing={false} retry={async () => {}} />,
  );
}

function names(html: string): string[] {
  return [...html.matchAll(/<li class="mg-crow"><div class="mg-ccell-name"><strong>([^<]*)<\/strong>/g)].map((m) => m[1]);
}

describe('CustomersTab summary', () => {
  it('shows the three facts from the metrics', () => {
    const html = render();
    expect(html).toContain('Fiado na rua');
    expect(html).toContain('R$ 355,50');
    expect(html).toContain('Clientes devendo');
    expect(html).toContain('Já recebido');
    expect(html).toContain('R$ 120,00');
  });

  it('does not show "Já recebido" before the metrics arrive', () => {
    expect(render({ creditMetrics: null })).not.toContain('Já recebido');
  });
});

describe('CustomersTab filters', () => {
  it('shows the count of each chip and marks the active one', () => {
    const html = render({ filter: 'owing' });
    expect(html).toMatch(/aria-pressed="false"[^>]*>Todos \(5\)</);
    expect(html).toMatch(/aria-pressed="true"[^>]*>Devendo \(3\)</);
    expect(html).toMatch(/aria-pressed="false"[^>]*>Acima do limite \(1\)</);
    expect(html).not.toContain('Perto do limite (');
  });

  it('shows only the customers of the chip, with the footer count', () => {
    const owing = render({ filter: 'owing' });
    expect(names(owing)).toEqual(['João Pereira', 'Maria Souza', 'Padaria Estrela']);
    expect(owing).toContain('Mostrando 3 de 5 clientes');
    const over = render({ filter: 'over' });
    expect(names(over)).toEqual(['João Pereira']);
    expect(over).toContain('Mostrando 1 de 5 clientes');
  });

  it('combines the search (name or phone digits) with the chip', () => {
    expect(names(render({ query: 'MARIA' }))).toEqual(['Maria Souza']);
    expect(names(render({ query: '11999' }))).toEqual(['João Pereira']);
    expect(names(render({ query: 'maria', filter: 'over' }))).toEqual([]);
  });
});

describe('CustomersTab rows', () => {
  it('orders by the biggest debt, a tie by name', () => {
    expect(names(render())).toEqual(['João Pereira', 'Maria Souza', 'Padaria Estrela', 'joazinho', 'Seu Antenor']);
  });

  it('shows the status badge of each customer', () => {
    const html = render();
    expect(html).toContain('Acima do limite</span>');
    expect(html).toContain('Perto do limite</span>');
    expect(html).toContain('Devendo</span>');
    expect(html).toContain('Em dia</span>');
  });

  it('masks a standard phone and marks an old one as off pattern', () => {
    const html = render();
    expect(html).toContain('(11) 98164-2350');
    expect(html).toContain('6261616161649496169');
    expect(html.match(/Telefone fora do padrão/g)).toHaveLength(1);
  });

  it('shows "Receber" only for customers who owe', () => {
    expect(render().match(/>Receber</g)).toHaveLength(3);
  });

  it('marks a blocked customer with the badge next to the status and keeps "Receber" for who owes', () => {
    const list = [{ ...customers[0], creditBlocked: true }, ...customers.slice(1)];
    const html = render({ list });
    expect(html.match(/Fiado bloqueado<\/span>/g)).toHaveLength(1);
    expect(html).toMatch(/<span class="mg-badge mg-badge-over">Fiado bloqueado<\/span>/);
    expect(html).toContain('aria-label="Receber de Maria Souza"');
    expect(html.match(/>Receber</g)).toHaveLength(3);
    expect(render()).not.toContain('Fiado bloqueado');
  });

  it('shows limit and available credit', () => {
    const html = render({ filter: 'owing' });
    expect(html).toContain('Limite R$ 100,00');
    expect(html).toContain('Disponível R$ 14,50');
  });

  it('with the balance not loaded shows no debt, no "Em dia" and no "Receber"', () => {
    const html = render({ list: [customer('1', 'Maria Souza', '11981642350')], bal: {} });
    expect(html).toContain('Saldo indisponível');
    expect(html).not.toContain('Em dia');
    expect(html).not.toContain('Receber');
    expect(html).not.toContain('R$ 0,00 ');
  });

  it('explains an empty list', () => {
    expect(render({ list: [], bal: {} })).toContain('Nenhum cliente cadastrado ainda.');
    const html = render({ query: 'zzz' });
    expect(html).toContain('Nenhum cliente encontrado');
    expect(html).not.toContain('<ul');
  });
});

describe('CustomersTab Editar button', () => {
  it('shows Editar on every row for the owner, even for who is up to date', () => {
    const html = render();
    expect(html.match(/aria-label="Editar /g)).toHaveLength(5);
    expect(html).toContain('aria-label="Editar Seu Antenor"');
  });

  it('hides Editar from the operator', () => {
    expect(render({ isOwner: false })).not.toContain('Editar');
  });
});

describe('CustomersTab Extrato button', () => {
  it('shows Extrato on every row for the owner and for the operator', () => {
    for (const isOwner of [true, false]) {
      const html = render({ isOwner });
      expect(html.match(/aria-label="Extrato de /g)).toHaveLength(5);
      expect(html).toContain('aria-label="Extrato de Seu Antenor"');
    }
  });
});
