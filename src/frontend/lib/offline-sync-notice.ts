import type { SyncResult } from './offline-sync';

export interface OfflineSyncNotice {
  text: string;
  isSuccess: boolean;
}

/**
 * Turns the result of one offline sync into the message the cashier sees.
 * A sale the server refused stays in the queue, so it must be reported, not hidden.
 * When the session expired, the sales wait for a new login and no refusal is reported.
 */
export function describeOfflineSync(result: SyncResult): OfflineSyncNotice | null {
  if (result.totalProcessed === 0) return null;
  if (result.sessionExpired) return null;

  const synced = result.syncedCount;
  const refused = result.failedCount;

  if (refused === 0) {
    return {
      text: `${synced} venda(s) offline sincronizada(s) com o servidor com sucesso!`,
      isSuccess: true,
    };
  }

  const reason = (result.errors[0]?.error ?? 'motivo não informado').replace(/\.$/, '');
  const refusal = `${refused} venda(s) offline recusada(s) pelo servidor e mantida(s) na fila: ${reason}. Revise no caixa.`;
  const text = synced > 0 ? `${synced} venda(s) offline sincronizada(s). ${refusal}` : refusal;
  return { text, isSuccess: false };
}
