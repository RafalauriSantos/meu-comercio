import { describe, expect, it } from 'vitest';
import { describeOfflineSync } from './offline-sync-notice';
import type { SyncResult } from './offline-sync';

const base: SyncResult = {
  totalProcessed: 0,
  syncedCount: 0,
  failedCount: 0,
  remainingCount: 0,
  errors: [],
};

describe('describeOfflineSync (23.4: venda offline recusada precisa aparecer no caixa)', () => {
  it('não mostra nada quando não há venda processada', () => {
    expect(describeOfflineSync(base)).toBeNull();
  });

  it('mostra sucesso quando todas as vendas foram sincronizadas', () => {
    const notice = describeOfflineSync({ ...base, totalProcessed: 2, syncedCount: 2 });
    expect(notice).toEqual({ text: '2 venda(s) offline sincronizada(s) com o servidor com sucesso!', isSuccess: true });
  });

  it('avisa em erro quando uma venda foi recusada e ficou na fila, com o motivo do servidor', () => {
    const notice = describeOfflineSync({
      totalProcessed: 1,
      syncedCount: 0,
      failedCount: 1,
      remainingCount: 1,
      errors: [{ idempotencyKey: 'k1', error: 'Pagamentos não cobrem o total da venda.', status: 400 }],
    });
    expect(notice).toEqual({
      text: '1 venda(s) offline recusada(s) pelo servidor e mantida(s) na fila: Pagamentos não cobrem o total da venda. Revise no caixa.',
      isSuccess: false,
    });
  });

  it('mostra as duas coisas quando há venda sincronizada e venda recusada', () => {
    const notice = describeOfflineSync({
      totalProcessed: 2,
      syncedCount: 1,
      failedCount: 1,
      remainingCount: 1,
      errors: [{ idempotencyKey: 'k2', error: 'Produto desativado.', status: 400 }],
    });
    expect(notice).toEqual({
      text: '1 venda(s) offline sincronizada(s). 1 venda(s) offline recusada(s) pelo servidor e mantida(s) na fila: Produto desativado. Revise no caixa.',
      isSuccess: false,
    });
  });

  it('falha de rede ou 5xx não é tratada como recusa do servidor', () => {
    const notice = describeOfflineSync({
      totalProcessed: 1,
      syncedCount: 0,
      failedCount: 1,
      remainingCount: 1,
      errors: [{ idempotencyKey: 'k4', error: 'Failed to fetch' }],
    });
    expect(notice).toEqual({
      text: '1 venda(s) offline não enviada(s) (sem conexão ou erro no servidor); seguem na fila.',
      isSuccess: false,
    });
  });

  it('mantém o aviso de sincronizadas quando a sessão expira no meio (sucesso parcial)', () => {
    const notice = describeOfflineSync({
      totalProcessed: 3,
      syncedCount: 2,
      failedCount: 1,
      remainingCount: 1,
      errors: [{ idempotencyKey: 'k5', error: 'Sessão expirada.', status: 401 }],
      sessionExpired: true,
    });
    expect(notice).toEqual({ text: '2 venda(s) offline sincronizada(s) com o servidor com sucesso!', isSuccess: true });
  });

  it('lista todos os motivos de recusa, sem repetir', () => {
    const notice = describeOfflineSync({
      totalProcessed: 3,
      syncedCount: 0,
      failedCount: 3,
      remainingCount: 3,
      errors: [
        { idempotencyKey: 'a', error: 'Produto desativado.', status: 400 },
        { idempotencyKey: 'b', error: 'Pagamentos não cobrem o total da venda.', status: 400 },
        { idempotencyKey: 'c', error: 'Produto desativado.', status: 400 },
      ],
    });
    expect(notice).toEqual({
      text: '3 venda(s) offline recusada(s) pelo servidor e mantida(s) na fila: Produto desativado; Pagamentos não cobrem o total da venda. Revise no caixa.',
      isSuccess: false,
    });
  });

  it('não dá aviso de recusa quando a sessão expirou (as vendas esperam novo login)', () => {
    const notice = describeOfflineSync({
      totalProcessed: 1,
      syncedCount: 0,
      failedCount: 1,
      remainingCount: 1,
      errors: [{ idempotencyKey: 'k3', error: 'Sessão expirada.', status: 401 }],
      sessionExpired: true,
    });
    expect(notice).toBeNull();
  });
});
