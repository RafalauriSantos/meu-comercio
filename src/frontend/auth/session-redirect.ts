/** How long the "session expired" notice stays before the person is taken to the login. */
export const SESSION_REDIRECT_DELAY_MS = 3000;

/** The timer and the "Entrar agora" button can both fire; the redirect runs only once. */
export function createOnce(action: () => void): () => void {
  let done = false;
  return () => {
    if (done) return;
    done = true;
    action();
  };
}
