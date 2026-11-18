import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { StatementItem } from '@/frontend/lib/api-client';
import { CustomerStatementPanel } from './customer-statement-panel';

const purchase: StatementItem = {
  id: 'm1',
  type: 'PURCHASE',
  amount: '100.00',
  balanceAfter: '100.00',
  createdAt: '2026-11-17T17:35:00.000Z',
  saleId: 's1',
  operator: 'rafael',
  note: 'Venda fiado',
};
const payment: StatementItem = { ...purchase, id: 'm2', type: 'PAYMENT', amount: '30.00', balanceAfter: '70.00', saleId: null, note: 'Pago' };
const reversal: StatementItem = { ...purchase, id: 'm3', type: 'REVERSAL', amount: '20.00', balanceAfter: '50.00', note: 'Cliente desistiu' };

const noop = () => {};
function render(over: Partial<React.ComponentProps<typeof CustomerStatementPanel>> = {}) {
  return renderToStaticMarkup(
    <CustomerStatementPanel
      name="Maria Souza"
      debtCents={5000}
      items={[]}
      loading={false}
      hasMore={false}
      error={null}
      closing={false}
      closeRef={{ current: null }}
      onClose={noop}
      onClosed={noop}
      onLoadMore={noop}
      onRetry={noop}
      {...over}
    />,
  );
}

describe('CustomerStatementPanel', () => {
  it('shows the name and the current balance at the top', () => {
    const html = render();
    expect(html).toContain('Extrato de Maria Souza');
    expect(html).toContain('Saldo atual: R$ 50,00');
  });

  it('shows the three type labels, the balance after each line and the operator', () => {
    const html = render({ items: [reversal, payment, purchase] });
    expect(html).toContain('Compra no fiado');
    expect(html).toContain('Pagamento');
    expect(html).toContain('Estorno por cancelamento');
    expect(html).toContain('Saldo: R$ 70,00');
    expect(html).toContain('17/11/2026 14:35');
    expect(html).toContain('rafael');
  });

  it('shows the reason of the reversal only', () => {
    const html = render({ items: [reversal, payment, purchase] });
    expect(html).toContain('Cliente desistiu');
    expect(html).not.toContain('Pago<');
    expect(html).not.toContain('Venda fiado');
  });

  it('shows loading, the empty phrase, and nothing else while the first page loads', () => {
    expect(render({ loading: true })).toContain('Carregando');
    expect(render({ loading: true })).not.toContain('ainda não tem movimentos');
    expect(render()).toContain('Este cliente ainda não tem movimentos.');
  });

  it('shows the error with Tentar de novo and keeps the lines already loaded', () => {
    const html = render({ items: [purchase], error: 'Sem conexão.' });
    expect(html).toContain('Sem conexão.');
    expect(html).toContain('Tentar de novo');
    expect(html).toContain('Compra no fiado');
    expect(html).not.toContain('ainda não tem movimentos');
  });

  it('shows Carregar mais only with a next page, disabled while loading', () => {
    expect(render({ items: [purchase] })).not.toContain('Carregar mais');
    expect(render({ items: [purchase], hasMore: true })).toMatch(/<button(?![^>]*disabled)[^>]*>Carregar mais<\/button>/);
    expect(render({ items: [purchase], hasMore: true, loading: true })).toMatch(/<button[^>]*disabled=""[^>]*>Carregando\.\.\.<\/button>/);
  });
});
