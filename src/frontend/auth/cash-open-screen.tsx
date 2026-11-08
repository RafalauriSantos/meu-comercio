import type { FormEvent } from 'react';
import { BrandMark } from '@/frontend/ui/brand-mark';
import { parseCurrencyInput } from '@/frontend/lib/formatters';
import { FormError } from './form-error';
import { formatCashDate } from './format-cash-date';

export const QUICK_AMOUNTS = [50, 100, 150, 200] as const;

interface CashOpenScreenProps {
  username: string;
  openingBalance: string;
  onOpeningBalanceChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onBack: () => void;
  processing: boolean;
  error: string;
  now: Date;
}

// Open cash register: the operator is signed in and the register is closed.
export function CashOpenScreen({
  username,
  openingBalance,
  onOpeningBalanceChange,
  onSubmit,
  onBack,
  processing,
  error,
  now,
}: CashOpenScreenProps) {
  const current = parseCurrencyInput(openingBalance);

  return (
    <div className="auth-app">
      <header className="auth-topbar">
        <BrandMark size={32} />
        Meu Comércio
        <span className="auth-topbar-user">{username}</span>
      </header>

      <main className="auth-main">
        <section className="cash-card" aria-labelledby="cash-title">
          <p className="cash-status">Caixa fechado</p>
          <h1 className="cash-title" id="cash-title">
            Abrir caixa
          </h1>
          <p className="cash-meta">
            {formatCashDate(now)} · Operador: {username}
          </p>

          {error && (
            <div style={{ marginTop: 16 }}>
              <FormError message={error} />
            </div>
          )}

          <form onSubmit={onSubmit}>
            <label className="cash-label" htmlFor="opening-balance">
              Fundo de troco em dinheiro
            </label>
            <input
              id="opening-balance"
              className="cash-amount"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              required
              autoFocus
              value={openingBalance}
              onChange={(event) => onOpeningBalanceChange(event.target.value)}
            />
            <p className="cash-hint">
              Conte as notas e moedas antes de confirmar. É o valor que você tem para dar troco.
            </p>

            <div className="cash-quick" role="group" aria-label="Valores rápidos">
              {QUICK_AMOUNTS.map((amount) => (
                <button
                  key={amount}
                  type="button"
                  aria-pressed={current === amount}
                  onClick={() => onOpeningBalanceChange(amount.toFixed(2))}
                >
                  R$ {amount}
                </button>
              ))}
            </div>

            <div className="cash-actions">
              <button className="outline" type="button" onClick={onBack}>
                Ir para a gestão
              </button>
              <button className="primary" type="submit" disabled={processing}>
                {processing ? (
                  <>
                    <span className="auth-loading-spinner" />
                    <span>Abrindo o caixa…</span>
                  </>
                ) : (
                  <>
                    <span>Abrir caixa</span>
                    <span className="kbd" aria-hidden="true">
                      Enter
                    </span>
                  </>
                )}
              </button>
            </div>
          </form>
        </section>
      </main>

      <footer className="auth-note">Sem caixa aberto, as vendas ficam bloqueadas.</footer>
    </div>
  );
}
