'use client';

import React from 'react';
import { LoadFailureNotice } from '@/frontend/ui/load-failure-notice';
import type { useOperatorsTab } from './use-operators-tab';

interface OperatorsTabProps {
  tab: ReturnType<typeof useOperatorsTab>;
  loadFailed: { operators?: boolean };
  retrying: boolean;
  processing: boolean;
  retry: (load: () => Promise<void>) => Promise<void>;
}

/** The operators tab of the management panel (owner only: the page decides who sees it). */
export function OperatorsTab({ tab, loadFailed, retrying, processing, retry }: OperatorsTabProps) {
  const {
    operators,
    showNewOperator,
    setShowNewOperator,
    newOpUsername,
    setNewOpUsername,
    newOpPassword,
    setNewOpPassword,
    loadOperators,
    handleCreateOperator,
  } = tab;

  return (
          <section className="mg-section">
            {loadFailed.operators && (
              <LoadFailureNotice what="os operadores" busy={retrying} onRetry={() => retry(loadOperators)} />
            )}
            <div className="mg-section-head">
              <div>
                <h2>Equipe & Operadores de Caixa</h2>
                <p className="muted">
                  Cadastre e gerencie operadores para registrar vendas e abrir turnos de caixa no balcão.
                </p>
              </div>
              <button
                type="button"
                className="primary"
                onClick={() => setShowNewOperator(!showNewOperator)}
              >
                {showNewOperator ? 'Cancelar' : '＋ Novo Operador'}
              </button>
            </div>

            {/* Form Novo Operador */}
            {showNewOperator && (
              <form onSubmit={handleCreateOperator} className="card mg-narrow">
                <h3>Cadastrar Novo Operador</h3>
                <div className="mg-stack">
                  <div>
                    <label className="field-label" htmlFor="op-username">Usuário de Acesso</label>
                    <input
                      id="op-username"
                      className="input"
                      required
                      value={newOpUsername}
                      onChange={(e) => setNewOpUsername(e.target.value)}
                      placeholder="Ex: joao.caixa ou maria"
                    />
                    <small className="mg-help">
                      O usuário que o operador usará para entrar no PDV.
                    </small>
                  </div>
                  <div>
                    <label className="field-label" htmlFor="op-password">Senha de Acesso</label>
                    <input
                      id="op-password"
                      className="input"
                      type="password"
                      required
                      minLength={6}
                      value={newOpPassword}
                      onChange={(e) => setNewOpPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                    />
                  </div>
                </div>
                <button className="primary mg-form-submit" type="submit" disabled={processing}>
                  {processing ? 'Salvando...' : 'Salvar Operador'}
                </button>
              </form>
            )}

            {/* Tabela de Operadores */}
            <div className="card mg-card-flush">
              <div className="mg-table-wrap">
                <table className="mg-table">
                  <thead>
                    <tr>
                      <th scope="col">Usuário</th>
                      <th scope="col">Função</th>
                      <th scope="col">Status</th>
                      <th scope="col">Cadastrado em</th>
                    </tr>
                  </thead>
                  <tbody>
                    {operators.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="mg-empty-cell">
                          Nenhum operador cadastrado ainda. Clique em &quot;＋ Novo Operador&quot; para adicionar funcionários ao caixa.
                        </td>
                      </tr>
                    ) : (
                      operators.map((op) => (
                        <tr key={op.username}>
                          <td><strong>{op.username}</strong></td>
                          <td>
                            <span className="mg-pill">Operador de Caixa</span>
                          </td>
                          <td>
                            <span className={`mg-status ${op.enabled ? 'on' : 'off'}`}>
                              {op.enabled ? '● Ativo' : '● Inativo'}
                            </span>
                          </td>
                          <td className="muted num">
                            {new Date(op.createdAt).toLocaleDateString('pt-BR')}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
  );
}
