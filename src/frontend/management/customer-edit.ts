import { ApiError, type CustomerItem, type CustomerPatch } from '@/frontend/lib/api-client';
import { getErrorMessage } from '@/frontend/lib/formatters';
import { maskCurrencyDigits, priceToDigits } from '@/frontend/lib/currency-mask';
import { displayPhone } from '@/frontend/lib/phone-mask';
import { Money } from '@/shared/domain/money';

// Pure rules of editing a customer (the hook only holds the state and passes the api call in).
export interface CustomerDraft {
  name: string;
  /** Masked when the stored phone follows the rule; an old free-form one stays as it is until it is typed over. */
  phone: string;
  /** Masked text ("125,00"), never a number. Empty is zero. */
  limit: string;
}

export interface CustomerEditError {
  text: string;
  reload: boolean;
}

export type CustomerEditResult =
  | { kind: 'nochange' }
  | { kind: 'saved'; item: CustomerItem }
  | ({ kind: 'failed' } & CustomerEditError);

/** R$ 100.000,00, in cents. */
export const LIMIT_MAX = Money.fromCents(10_000_000);
export const LIMIT_BELOW_DEBT_WARNING =
  'O limite é menor que a dívida. O cliente não perde o que deve, e a próxima venda no fiado pede o PIN da proprietária.';

export function draftFromCustomer(customer: CustomerItem): CustomerDraft {
  return { name: customer.name, phone: displayPhone(customer.phone), limit: priceToDigits(customer.creditLimit ?? '0') };
}

function limitMoney(masked: string): Money {
  return Money.fromDecimal(masked === '' ? '0' : masked.replace(',', '.'));
}

/** The cents mask, but a value above the ceiling is not accepted: the field keeps what it had. */
export function maskLimit(raw: string, previous: string): string {
  const masked = maskCurrencyDigits(raw);
  return limitMoney(masked).isGreaterThan(LIMIT_MAX) ? previous : masked;
}

/** True when the new limit is under the debt (cents; a debt not loaded yet gives no warning). */
export function limitBelowDebt(limit: string, debtCents: number | null): boolean {
  return debtCents !== null && limitMoney(limit).isLessThan(Money.fromCents(debtCents));
}

/** Only what changed, or null when nothing did. The limit goes as text with a dot ("125.00"). */
export function buildCustomerPatch(target: CustomerItem, draft: CustomerDraft): CustomerPatch | null {
  const initial = draftFromCustomer(target);
  const patch: CustomerPatch = {};
  if (draft.name.trim() !== target.name) patch.name = draft.name.trim();
  if (draft.phone.trim() !== initial.phone) patch.phone = draft.phone.trim();
  if (draft.limit !== initial.limit) patch.creditLimit = (draft.limit === '' ? '0,00' : draft.limit).replace(',', '.');
  if (Object.keys(patch).length === 0) return null;
  if (target.updatedAt) patch.expectedUpdatedAt = target.updatedAt;
  return patch;
}

export function isDraftValid(draft: CustomerDraft): boolean {
  return draft.name.trim().length >= 1;
}

export function editErrorMessage(err: unknown): CustomerEditError {
  if (err instanceof ApiError) {
    if (err.code === 'CUSTOMER_CHANGED') {
      return { text: 'Este cliente foi alterado por outra pessoa depois que você abriu a edição. Recarregue e edite de novo.', reload: true };
    }
    if (err.status === 404) return { text: 'Este cliente não existe mais na lista. Recarregue a lista.', reload: true };
  }
  return { text: getErrorMessage(err, 'Erro ao editar cliente.'), reload: false };
}

/** Builds the patch and sends it with the given update function (the api call is injected, so this runs without a screen). */
export async function submitCustomerEdit(
  update: (id: string, patch: CustomerPatch) => Promise<CustomerItem>,
  target: CustomerItem,
  draft: CustomerDraft,
): Promise<CustomerEditResult> {
  const patch = buildCustomerPatch(target, draft);
  if (!patch) return { kind: 'nochange' };
  try {
    return { kind: 'saved', item: await update(target.id, patch) };
  } catch (err) {
    return { kind: 'failed', ...editErrorMessage(err) };
  }
}
