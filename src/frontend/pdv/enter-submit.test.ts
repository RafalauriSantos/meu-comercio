import { describe, it, expect } from 'vitest';
import { blocksImplicitSubmit } from './enter-submit';

describe('blocksImplicitSubmit', () => {
  it('lets Enter confirm from the received amount field', () => {
    expect(blocksImplicitSubmit('Enter', { id: 'cash-received', tagName: 'INPUT' })).toBe(false);
  });

  it('blocks Enter in the other fields of the modal', () => {
    expect(blocksImplicitSubmit('Enter', { id: 'second-val', tagName: 'INPUT' })).toBe(true);
    expect(blocksImplicitSubmit('Enter', { id: 'customer-select', tagName: 'SELECT' })).toBe(true);
    expect(blocksImplicitSubmit('Enter', { tagName: 'INPUT' })).toBe(true);
  });

  it('does not touch Enter on a button, which is a click', () => {
    expect(blocksImplicitSubmit('Enter', { id: 'x', tagName: 'BUTTON' })).toBe(false);
  });

  it('does not touch any other key', () => {
    expect(blocksImplicitSubmit('Tab', { id: 'second-val', tagName: 'INPUT' })).toBe(false);
    expect(blocksImplicitSubmit(' ', { id: 'second-val', tagName: 'INPUT' })).toBe(false);
  });

  it('does nothing without a target', () => {
    expect(blocksImplicitSubmit('Enter', null)).toBe(false);
  });
});
