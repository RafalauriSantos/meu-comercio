'use client';

import { useEffect, type RefObject } from 'react';

/** Gives the focus back to what had it before the panel opened, if that is still on the page. */
export function returnFocusTo(opener: Element | null) {
  if (opener && opener.isConnected && 'focus' in opener && typeof opener.focus === 'function') opener.focus();
}

/**
 * Opens a native <dialog> as a modal when the panel mounts (the browser traps the focus and sends Esc as `cancel`),
 * puts the focus in `firstFieldRef`, and gives the focus back to the opener when the panel unmounts.
 */
export function useDialogPanel(dialogRef: RefObject<HTMLDialogElement | null>, firstFieldRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const opener = document.activeElement;
    if (!dialog.open) dialog.showModal();
    firstFieldRef.current?.focus();
    return () => returnFocusTo(opener);
  }, [dialogRef, firstFieldRef]);
}
