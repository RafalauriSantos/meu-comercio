'use client';

import React, { useState, useCallback } from 'react';
import { apiClient, OperatorItem } from '@/frontend/lib/api-client';
import { getErrorMessage } from '@/frontend/lib/formatters';

type Feedback = { text: string; isError?: boolean; isSuccess?: boolean } | null;

interface UseOperatorsTabParams {
  setFeedback: (feedback: Feedback) => void;
  setProcessing: (processing: boolean) => void;
  setLoadFailed: (update: (f: { operators?: boolean }) => { operators?: boolean }) => void;
}

/** State, load and create handler of the operators tab. Called by the page, so a draft survives a tab change. */
export function useOperatorsTab({ setFeedback, setProcessing, setLoadFailed }: UseOperatorsTabParams) {
  // Estados de Operadores (Equipe)
  const [operators, setOperators] = useState<OperatorItem[]>([]);
  const [showNewOperator, setShowNewOperator] = useState(false);
  const [newOpUsername, setNewOpUsername] = useState('');
  const [newOpPassword, setNewOpPassword] = useState('');

  const loadOperators = useCallback(async () => {
    try {
      const res = await apiClient.listOperators();
      setOperators(res.items || []);
      setLoadFailed((f) => ({ ...f, operators: false }));
    } catch (err) {
      setLoadFailed((f) => ({ ...f, operators: true }));
      console.error('Erro ao carregar operadores:', err);
    }
  }, [setLoadFailed]);

  async function handleCreateOperator(e: React.FormEvent) {
    e.preventDefault();
    setProcessing(true);
    setFeedback(null);
    try {
      await apiClient.createOperator({
        username: newOpUsername.trim(),
        password: newOpPassword,
      });
      setFeedback({ text: `Operador '${newOpUsername.trim()}' cadastrado com sucesso!`, isSuccess: true });
      setShowNewOperator(false);
      setNewOpUsername('');
      setNewOpPassword('');
      await loadOperators();
    } catch (err) {
      setFeedback({ text: getErrorMessage(err, 'Erro ao cadastrar operador.'), isError: true });
    } finally {
      setProcessing(false);
    }
  }

  return {
    operators,
    showNewOperator,
    setShowNewOperator,
    newOpUsername,
    setNewOpUsername,
    newOpPassword,
    setNewOpPassword,
    loadOperators,
    handleCreateOperator,
  };
}
