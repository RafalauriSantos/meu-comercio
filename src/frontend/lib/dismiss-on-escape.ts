// Handler for a small popup that closes on Escape and must not let that Escape reach anything else
// (the PDV also uses Escape to clear the sale). Register it in the capture phase on the document,
// which runs before the window listener of the global shortcuts.
export function createEscapeDismiss(onClose: () => void) {
  return function handleEscape(event: Pick<KeyboardEvent, 'key' | 'stopPropagation'>): void {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    onClose();
  };
}
