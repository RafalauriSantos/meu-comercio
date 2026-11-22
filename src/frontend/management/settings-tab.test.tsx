import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SettingsTab } from './settings-tab';
import type { useOperatorsTab } from './use-operators-tab';
import type { useOwnerEmailTab } from './use-owner-email-tab';

const noop = () => {};
const operatorsTab = { operators: [], showNewOperator: false, newOpUsername: '', newOpPassword: '' } as unknown as ReturnType<typeof useOperatorsTab>;
const ownerEmailTab = {
  status: { email: 'maria@gmail.com', verified: true },
  email: '',
  currentPassword: '',
  sentTo: null,
  error: null,
  seconds: 0,
} as unknown as ReturnType<typeof useOwnerEmailTab>;

function render({ stockControl, processing = false }: { stockControl: boolean; processing?: boolean }) {
  return renderToStaticMarkup(
    <SettingsTab
      operatorsTab={operatorsTab}
      ownerEmailTab={ownerEmailTab}
      stockControl={stockControl}
      onToggleStockControl={noop}
      loadFailed={{}}
      retrying={false}
      processing={processing}
      retry={async () => {}}
    />
  );
}

describe('settings tab', () => {
  it('stacks the recovery e-mail, the operators and the stock control, in this order', () => {
    const html = render({ stockControl: true });
    const email = html.indexOf('E-mail de recuperação');
    const operators = html.indexOf('Equipe &amp; Operadores de Caixa');
    const stock = html.indexOf('Controle de estoque');
    expect(email).toBeGreaterThan(-1);
    expect(operators).toBeGreaterThan(email);
    expect(stock).toBeGreaterThan(operators);
  });

  it('has no card inside a card', () => {
    const html = render({ stockControl: true });
    expect(html).not.toMatch(/class="card[^"]*"[^>]*>(?:(?!<\/(?:div|form)>).)*class="card/);
  });

  it('says the stock control is on and offers to turn it off', () => {
    const html = render({ stockControl: true });
    expect(html).toContain('<strong>Ligado.</strong>');
    expect(html).toContain('As vendas baixam o estoque e não passam do saldo.');
    expect(html).toMatch(/class="outline"[^>]*>Desligar<\/button>/);
  });

  it('says the stock control is off and offers to turn it on', () => {
    const html = render({ stockControl: false });
    expect(html).toContain('<strong>Desligado.</strong>');
    expect(html).toContain('As vendas não dependem do estoque: não precisam de saldo e não baixam nada.');
    expect(html).toMatch(/class="outline"[^>]*>Ligar<\/button>/);
  });

  it('blocks the stock switch while something is being saved', () => {
    expect(render({ stockControl: true, processing: true })).toMatch(/<button[^>]*disabled=""[^>]*>Desligar<\/button>/);
    expect(render({ stockControl: true })).not.toMatch(/<button[^>]*disabled=""[^>]*>Desligar<\/button>/);
  });
});
