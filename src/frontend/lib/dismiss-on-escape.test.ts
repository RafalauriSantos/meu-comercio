import { describe, it, expect, vi } from 'vitest';
import { createEscapeDismiss } from './dismiss-on-escape';

function keyEvent(key: string) {
  return { key, stopPropagation: vi.fn() };
}

describe('createEscapeDismiss', () => {
  it('closes the popup on Escape and stops the event, so the global shortcut does not run', () => {
    const onClose = vi.fn();
    const event = keyEvent('Escape');

    createEscapeDismiss(onClose)(event);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
  });

  it('ignores every other key and lets it through', () => {
    const onClose = vi.fn();

    for (const key of ['Enter', 'Tab', 'F4', 'a']) {
      const event = keyEvent(key);
      createEscapeDismiss(onClose)(event);
      expect(event.stopPropagation).not.toHaveBeenCalled();
    }

    expect(onClose).not.toHaveBeenCalled();
  });
});
