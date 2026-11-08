import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CashOpenScreen } from './cash-open-screen';

const noop = () => {};

function render(overrides: Partial<Parameters<typeof CashOpenScreen>[0]> = {}): string {
  return renderToStaticMarkup(
    <CashOpenScreen
      username="maria"
      openingBalance="100.00"
      onOpeningBalanceChange={noop}
      onSubmit={noop}
      onBack={noop}
      processing={false}
      error=""
      now={new Date(2026, 10, 8, 13, 20)}
      {...overrides}
    />
  );
}

describe('CashOpenScreen', () => {
  it('has one h1, the closed status and the operator in the top bar and under the title', () => {
    const markup = render();

    expect(markup.split('<h1').length - 1).toBe(1);
    expect(markup).toContain('Abrir caixa</h1>');
    expect(markup).toContain('Caixa fechado');
    expect(markup).toContain('<span class="auth-topbar-user">maria</span>');
    expect(markup).toContain('Operador: maria');
    expect(markup).toContain('08/11/2026');
  });

  it('keeps the money field as it was: a labelled number input with the default value', () => {
    const markup = render();

    expect(markup).toMatch(/<label[^>]*for="opening-balance"[^>]*>Fundo de troco em dinheiro<\/label>/);
    expect(markup).toMatch(/<input[^>]*id="opening-balance"[^>]*type="number"/);
    expect(markup).toContain('value="100.00"');
    expect(markup).toContain('step="0.01"');
  });

  it('offers the four quick amounts and marks the one that is set', () => {
    const markup = render();

    for (const label of ['R$ 50', 'R$ 100', 'R$ 150', 'R$ 200']) {
      expect(markup).toContain(`>${label}</button>`);
    }
    expect(markup).toMatch(/aria-pressed="true"[^>]*>R\$ 100</);
    expect(markup.split('aria-pressed="true"').length - 1).toBe(1);
  });

  it('has the primary button with the Enter hint, the existing back action and the footer note', () => {
    const markup = render();

    expect(markup).toMatch(/<button[^>]*class="primary"[^>]*type="submit"[^>]*><span>Abrir caixa<\/span><span class="kbd"[^>]*>Enter<\/span>/);
    expect(markup).toContain('Ir para a gestão');
    expect(markup).toContain('Sem caixa aberto, as vendas ficam bloqueadas.');
    expect(markup).not.toContain('Último fechamento');
  });

  it('shows the loading state and the error', () => {
    const markup = render({ processing: true, error: 'Erro ao abrir caixa.' });

    expect(markup).toContain('Abrindo o caixa…');
    expect(markup).toContain('disabled');
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('Erro ao abrir caixa.');
  });
});
