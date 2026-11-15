interface LoadFailureNoticeProps {
  // What did not load, to finish "Não foi possível carregar ...".
  what: string;
  onRetry: () => void;
  // Disables the button while the retry runs, so a double click does not repeat the request.
  busy?: boolean;
}

// Same look as the error feedback of the pages (.error + .soft), so it needs no CSS of its own.
export function LoadFailureNotice({ what, onRetry, busy }: LoadFailureNoticeProps) {
  return (
    <div className="error" role="alert">
      <span>Não foi possível carregar {what}.</span>
      <button type="button" className="soft" onClick={onRetry} disabled={busy}>Tentar de novo</button>
    </div>
  );
}
