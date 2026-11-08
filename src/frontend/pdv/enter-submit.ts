// In the payment modal, Enter confirms the sale only from the "valor recebido" field (or on a
// button, where it is a click anyway). Enter in any other field, such as the second amount of a split
// payment or the fiado customer select, must not register a sale by accident.
export const ENTER_SUBMIT_FIELD_ID = 'cash-received';

interface KeyTarget {
  id?: string;
  tagName?: string;
}

// True when the implicit form submission caused by this key press must be blocked.
export function blocksImplicitSubmit(key: string, target: KeyTarget | null): boolean {
  if (key !== 'Enter' || !target) return false;

  const tag = target.tagName?.toUpperCase();
  if (tag === 'BUTTON' || tag === 'TEXTAREA') return false;

  return target.id !== ENTER_SUBMIT_FIELD_ID;
}
