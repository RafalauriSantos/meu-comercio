'use client';

import { useCallback, useEffect, useState } from 'react';

// Chrome and Edge tell the page when the app can be installed, and let it open their own install dialog
// from a button. Safari and Firefox do not send the event, so there the button never shows and the browser's
// own menu is the way to install.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function useInstallPrompt(): { canInstall: boolean; install: () => Promise<void> } {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    function handleBeforeInstall(event: Event) {
      // Keeps the browser's own mini bar from showing; the button asks when the person wants it.
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    }
    function handleInstalled() {
      setPromptEvent(null);
    }
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!promptEvent) return;
    await promptEvent.prompt();
    await promptEvent.userChoice;
    // The event works once: after the dialog, the browser sends a new one if the app is still installable.
    setPromptEvent(null);
  }, [promptEvent]);

  return { canInstall: promptEvent !== null, install };
}
