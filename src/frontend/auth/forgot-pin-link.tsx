/** "Esqueci o PIN" next to every place that asks for the owner's PIN. A new tab keeps the open sale or form (AC-26). */
export function ForgotPinLink() {
  return (
    <a href="/esqueci-pin" target="_blank" rel="noopener noreferrer" className="forgot-pin-link">
      Esqueci o PIN
    </a>
  );
}
