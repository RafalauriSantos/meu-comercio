interface LoadFailureNoticeProps {
  // What did not load, to finish "Não foi possível carregar ...".
  what: string;
  onRetry: () => void;
  // Disables the button while the retry runs, so a double click does not repeat the request.
  busy?: boolean;
  // Why it failed, in plain words (the message of the error).
  reason?: string;
}

// Same look as the error feedback of the pages (.error + .soft), so it needs no CSS of its own.
export function LoadFailureNotice({ what, onRetry, busy, reason }: LoadFailureNoticeProps) {
  return (
    <div className="error" role="alert">
      <span>Não foi possível carregar {what}.{reason ? ` ${reason}` : null}</span>
      <button type="button" className="soft" onClick={onRetry} disabled={busy}>Tentar de novo</button>
    </div>
  );
}
