// Small rules of the window that cancels a finished sale at the PDV.

/** The owner's PIN: exactly six digits. */
export function isOwnerPin(text: string): boolean {
  return /^\d{6}$/.test(text.trim());
}

/** The reason of a cancellation: at least three characters, as the server asks. */
export function isReasonValid(text: string): boolean {
  return text.trim().length >= 3;
}

/** "22:05" for the time of a sale, on the wall clock of Brasília. */
export function formatSaleTime(isoDate: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(isoDate));
}
