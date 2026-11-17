import { describe, it, expect } from 'vitest';
import { ApiError, type CustomerItem } from '@/frontend/lib/api-client';
import { CREDIT_BLOCKED_NOTICE, creditBlockedCustomer, isCreditBlockedError } from './credit-block';

const ana: CustomerItem = { id: 'a', name: 'Ana', phone: '11981642350' };
const bia: CustomerItem = { id: 'b', name: 'Bia', phone: '11999998888', creditBlocked: true };

describe('creditBlockedCustomer', () => {
  it('is true only for the chosen customer when the fiado is blocked', () => {
    expect(creditBlockedCustomer([ana, bia], 'b')).toBe(true);
    expect(creditBlockedCustomer([ana, bia], 'a')).toBe(false);
  });
  it('is false with no choice or an unknown id', () => {
    expect(creditBlockedCustomer([ana, bia], '')).toBe(false);
    expect(creditBlockedCustomer([ana, bia], 'zzz')).toBe(false);
  });
});

describe('isCreditBlockedError', () => {
  it('recognizes the server refusal by its code', () => {
    expect(isCreditBlockedError(new ApiError(409, 'x', undefined, 'CUSTOMER_CREDIT_BLOCKED'))).toBe(true);
    expect(isCreditBlockedError(new ApiError(409, 'x', undefined, 'DUPLICATE_SALE'))).toBe(false);
    expect(isCreditBlockedError(new Error('x'))).toBe(false);
  });
});

it('the notice is the text of the server refusal', () => {
  expect(CREDIT_BLOCKED_NOTICE).toBe('Este cliente está com o fiado bloqueado. A venda só pode ser feita à vista.');
});
