import type { SyncResult } from './offline-sync';

export interface OfflineSyncNotice {
  text: string;
  isSuccess: boolean;
}

const REFUSED_STATUSES = [400, 422];

/**
 * Turns the result of one offline sync into the message the cashier sees.
 * Only a 400 or 422 from the server is a refusal; a network failure or a 5xx is a sale not sent yet.
 * Both kinds stay in the queue, so both are reported. When the session expired, the unsent sales
 * wait for a new login and are not reported, but the sales that did synchronize still are.
 */
export function describeOfflineSync(result: SyncResult): OfflineSyncNotice | null {
  if (result.totalProcessed === 0) return null;

  const synced = result.syncedCount;
  const refusals = result.errors.filter((e) => e.status !== undefined && REFUSED_STATUSES.includes(e.status));
  const unsent = result.failedCount - refusals.length;

  const problems: string[] = [];
  if (refusals.length > 0) {
    const reasons = [...new Set(refusals.map((e) => e.error.replace(/\.$/, '')))].join('; ');
    problems.push(
      `${refusals.length} venda(s) offline recusada(s) pelo servidor e mantida(s) na fila: ${reasons}. Revise no caixa.`
    );
  }
  if (unsent > 0 && !result.sessionExpired) {
    problems.push(`${unsent} venda(s) offline não enviada(s) (sem conexão ou erro no servidor); seguem na fila.`);
  }

  if (problems.length === 0) {
    if (synced === 0) return null;
    return {
      text: `${synced} venda(s) offline sincronizada(s) com o servidor com sucesso!`,
      isSuccess: true,
    };
  }

  const prefix = synced > 0 ? `${synced} venda(s) offline sincronizada(s). ` : '';
  return { text: prefix + problems.join(' '), isSuccess: false };
}
