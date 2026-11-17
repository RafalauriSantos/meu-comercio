'use client';

import { useEffect, useRef, type RefObject } from 'react';

/** Gives the focus back to what had it before the panel opened, if that is still on the page. */
export function returnFocusTo(opener: Element | null) {
  if (opener && opener.isConnected && 'focus' in opener && typeof opener.focus === 'function') opener.focus();
}

/** If the exit transition never ends (no support, tab in the background), the panel leaves after this time anyway. */
export const CLOSE_SAFETY_MS = 400;

/**
 * The exit of a panel: calls `onDone` once, when the transition ends or the safety time passes.
 * `immediate` (reduced motion) leaves at once. `cancel` is for a panel opened again while it was closing.
 */
export function createCloseGate(onDone: () => void, immediate: boolean) {
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    onDone();
  };
  const timer = setTimeout(finish, immediate ? 0 : CLOSE_SAFETY_MS);
  return {
    transitionEnded: finish,
    cancel() {
      finished = true;
      clearTimeout(timer);
    },
  };
}

/**
 * Opens a native <dialog> as a modal when the panel mounts (the browser traps the focus and sends Esc as `cancel`),
 * puts the focus in `firstFieldRef`, and gives the focus back to the opener when the panel unmounts.
 * While `closing`, the panel plays its exit and then calls `onClosed`, which unmounts it.
 */
export function useDialogPanel(
  dialogRef: RefObject<HTMLDialogElement | null>,
  firstFieldRef: RefObject<HTMLElement | null>,
  closing: boolean,
  onClosed: () => void,
) {
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const opener = document.activeElement;
    if (!dialog.open) dialog.showModal();
    firstFieldRef.current?.focus();
    return () => {
      // Another panel opened in its place has the focus: leave it there.
      if (!document.activeElement || document.activeElement === document.body) returnFocusTo(opener);
    };
  }, [dialogRef, firstFieldRef]);

  const onClosedRef = useRef(onClosed);
  useEffect(() => {
    onClosedRef.current = onClosed;
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!closing || !dialog) return;
    const gate = createCloseGate(() => onClosedRef.current(), matchMedia('(prefers-reduced-motion: reduce)').matches);
    const onEnd = (e: TransitionEvent) => {
      if (e.target === dialog && e.propertyName === 'transform') gate.transitionEnded();
    };
    dialog.addEventListener('transitionend', onEnd);
    return () => {
      gate.cancel();
      dialog.removeEventListener('transitionend', onEnd);
    };
  }, [dialogRef, closing]);
}
