import { ApiError, type CustomerItem, type CustomerPatch, type ProductItem, type ProductPatch } from '@/frontend/lib/api-client';
import { formatMoney, getErrorMessage } from '@/frontend/lib/formatters';
import { Money } from '@/shared/domain/money';
import { formatQuantity } from '@/shared/domain/product-unit';

// Pure rules of "Excluir" and "Restaurar" (D-27). Nothing is erased: the item is deactivated and can come back.
export const PIN_HELP = 'Por segurança, excluir um cliente pede o seu PIN (6 dígitos).';
export const WAIT_BALANCE_TEXT = 'Aguarde o saldo carregar.';
export const DELETE_HISTORY_NOTE = 'O histórico de vendas é mantido. Dá para ver os excluídos no filtro "Excluídos" e restaurar quando quiser.';

export type Kind = 'product' | 'customer';

export interface DeleteError {
  text: string;
  reload: boolean;
}

export type DeleteResult<T> = { kind: 'done'; item: T } | ({ kind: 'failed' } & DeleteError);

export const deletedNotice = (name: string) => `${name} foi excluído. Dá para restaurar no filtro "Excluídos".`;
export const restoredNotice = (name: string) => `${name} foi restaurado.`;

export const DELETE_HELP: Record<Kind, string> = {
  product: 'O produto sai do caixa e da busca. O histórico de vendas fica guardado.',
  customer: 'O cliente sai das listas e do caixa. O histórico de vendas e de fiado fica guardado.',
};

export const CONFIRM_TEXT: Record<Kind, string> = {
  product: 'Ele não aparece mais no caixa nem na busca, e o código dele continua reservado.',
  customer: 'Ele não aparece mais na lista nem na busca do caixa.',
};

/** Why a customer cannot be excluded now, or null when the debt is known to be zero (the server checks again). */
export function customerDeleteBlock(debtCents: number | null): string | null {
  if (debtCents === null) return WAIT_BALANCE_TEXT;
  return debtCents > 0 ? `Este cliente deve ${formatMoney(Money.fromCents(debtCents))}. Receba o valor para poder excluir.` : null;
}

/** The extra warning when the product still has stock (only with stock control on). */
export function productStockWarning(product: ProductItem, stockControl: boolean): string | null {
  if (!stockControl || product.availableQuantity <= 0) return null;
  const unitText = product.unit === 'KG' ? '' : ' un.';
  return `Este produto tem ${formatQuantity(product.availableQuantity, product.unit)}${unitText} em estoque. Ele continua guardado, mas o produto some do caixa.`;
}

export function isPinComplete(pin: string): boolean {
  return /^\d{6}$/.test(pin);
}

/** The count on the "Excluídos" button: the size of the list that was read, with a plus when the page was full. */
export function deletedCountText(count: number, hasMore: boolean): string {
  return `${count}${hasMore ? '+' : ''}`;
}

export function deleteErrorMessage(err: unknown, kind: Kind, active = false): DeleteError {
  if (err instanceof ApiError) {
    if (err.code === 'CUSTOMER_HAS_DEBT') return { text: err.message, reload: false };
    if (err.code === 'PRODUCT_CHANGED' || err.code === 'CUSTOMER_CHANGED') {
      const who = kind === 'product' ? 'produto' : 'cliente';
      return { text: `Este ${who} foi alterado por outra pessoa. Recarregue a lista e tente de novo.`, reload: true };
    }
    if (err.code === 'OWNER_PIN_REQUIRED') return { text: 'Digite o PIN da proprietária (6 dígitos).', reload: false };
    if (err.status === 404) return { text: `Este ${kind === 'product' ? 'produto' : 'cliente'} não existe mais na lista. Recarregue a lista.`, reload: true };
    if (err.status === 403) return { text: err.message, reload: false };
  }
  return { text: getErrorMessage(err, `Erro ao ${active ? 'restaurar' : 'excluir'} ${kind === 'product' ? 'produto' : 'cliente'}.`), reload: false };
}

/** Sends active=false (delete) or active=true (restore) with the version read when the item was listed. */
export async function submitProductActive(
  update: (id: string, patch: ProductPatch) => Promise<ProductItem>,
  target: ProductItem,
  active: boolean,
): Promise<DeleteResult<ProductItem>> {
  const patch: ProductPatch = { active };
  if (target.updatedAt) patch.expectedUpdatedAt = target.updatedAt;
  try {
    return { kind: 'done', item: await update(target.id, patch) };
  } catch (err) {
    return { kind: 'failed', ...deleteErrorMessage(err, 'product', active) };
  }
}

/** Same for a customer; deleting also sends the owner's PIN (restoring does not). */
export async function submitCustomerActive(
  update: (id: string, patch: CustomerPatch) => Promise<CustomerItem>,
  target: CustomerItem,
  active: boolean,
  ownerPin?: string,
): Promise<DeleteResult<CustomerItem>> {
  const patch: CustomerPatch = { active };
  if (!active && ownerPin) patch.ownerPin = ownerPin;
  if (target.updatedAt) patch.expectedUpdatedAt = target.updatedAt;
  try {
    return { kind: 'done', item: await update(target.id, patch) };
  } catch (err) {
    return { kind: 'failed', ...deleteErrorMessage(err, 'customer', active) };
  }
}
