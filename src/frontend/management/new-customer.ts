import type { CreateCustomerPayload } from '@/frontend/lib/api-client';
import { isStandardPhone } from '@/frontend/lib/phone-mask';

// Pure rules of registering a customer (the hook only holds the state and calls the api).
export interface NewCustomerDraft {
  name: string;
  /** Masked phone text. */
  phone: string;
  /** Masked text ("125,00"), never a number. Empty is zero. Only the owner can type it. */
  limit: string;
  /** The owner's PIN (6 digits), asked only when the limit is above zero. Cleared on close and after each send. */
  ownerPin: string;
}

export const EMPTY_NEW_CUSTOMER: NewCustomerDraft = { name: '', phone: '', limit: '', ownerPin: '' };

export const OPERATOR_LIMIT_NOTICE =
  'O cliente nasce com limite R$ 0,00. Só a proprietária libera valor para o fiado, editando o cliente.';

/** The owner types a limit above zero: only then the PIN is asked (D-22). The mask drops leading zeros, so "" is zero. */
export function newLimitAboveZero(draft: NewCustomerDraft, isOwner: boolean): boolean {
  return isOwner && draft.limit !== '';
}

export function canSaveNewCustomer(draft: NewCustomerDraft, isOwner: boolean): boolean {
  if (draft.name.trim() === '' || !isStandardPhone(draft.phone)) return false;
  return !newLimitAboveZero(draft, isOwner) || draft.ownerPin.length === 6;
}

/** The operator never sends a limit; the owner sends it (as a decimal string) with the PIN only when it is above zero. */
export function buildNewCustomerPayload(draft: NewCustomerDraft, isOwner: boolean): CreateCustomerPayload {
  const payload: CreateCustomerPayload = { name: draft.name.trim(), phone: draft.phone.trim() };
  if (newLimitAboveZero(draft, isOwner)) {
    payload.creditLimit = draft.limit.replace(',', '.');
    payload.ownerPin = draft.ownerPin;
  }
  return payload;
}

export function newCustomerSuccessText(isOwner: boolean): string {
  return isOwner ? 'Cliente cadastrado.' : 'Cliente cadastrado com limite R$ 0,00. A proprietária libera o limite editando o cliente.';
}
