'use client';

import React, { useState, useCallback } from 'react';
import { apiClient, CustomerItem, CustomerBalance, CreditMetricsData } from '@/frontend/lib/api-client';
import { formatMoney, parseCurrencyInput, getErrorMessage } from '@/frontend/lib/formatters';
import type { CustomerFilter } from './customers-list';
import { useCustomerEdit } from './use-customer-edit';
import { useNewCustomer } from './use-new-customer';
import { useCustomerStatement } from './use-customer-statement';

type Feedback = { text: string; isError?: boolean; isSuccess?: boolean } | null;
type CustomersLoadFailed = { customers?: boolean; balances?: boolean; metrics?: boolean };

interface UseCustomersTabParams {
  setFeedback: (feedback: Feedback) => void;
  setProcessing: (processing: boolean) => void;
  setLoadFailed: (update: (f: CustomersLoadFailed) => CustomersLoadFailed) => void;
  // Owned by the page: the settlement reloads the cash too, in the same order as before.
  loadCash: () => Promise<void>;
}

/** State, loads and handlers of the customers and credit tab. Called by the page, so a draft survives a tab change. */
export function useCustomersTab({ setFeedback, setProcessing, setLoadFailed, loadCash }: UseCustomersTabParams) {
  // Estados de Clientes / Fiado
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [customerBalances, setCustomerBalances] = useState<Record<string, CustomerBalance>>({});
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerFilter, setCustomerFilter] = useState<CustomerFilter>('all');

  // Quitação de Fiado
  const [settlingCustomer, setSettlingCustomer] = useState<CustomerBalance | null>(null);
  const [settleAmount, setSettleAmount] = useState('');
  const [settleNote, setSettleNote] = useState('');

  // Métricas de Fiado na Rua
  const [creditMetrics, setCreditMetrics] = useState<CreditMetricsData | null>(null);

  // Returns the list (null when it failed), so a conflict in the edit panel can reopen with the new data.
  const loadCustomers = useCallback(async (): Promise<CustomerItem[] | null> => {
    try {
      const res = await apiClient.listCustomers();
      const list = res.items || [];
      setCustomers(list);
      // A marca só vale para "saldo pedido e falhou", não para "saldo ainda não chegou".
      setLoadFailed((f) => ({ ...f, balances: false }));

      // Carregar saldos devedores de cada cliente em paralelo
      const balancePromises = list.map(async (c) => {
        try {
          const b = await apiClient.getCustomerBalance(c.id);
          return { id: c.id, balance: b };
        } catch {
          return null;
        }
      });
      const results = await Promise.all(balancePromises);
      const balances: Record<string, CustomerBalance> = {};
      for (const r of results) {
        if (r) balances[r.id] = r.balance;
      }
      setCustomerBalances(balances);
      setLoadFailed((f) => ({ ...f, customers: false, balances: list.some((c) => !balances[c.id]) }));
      return list;
    } catch (err) {
      setLoadFailed((f) => ({ ...f, customers: true }));
      console.error('Erro ao carregar clientes:', err);
      return null;
    }
  }, [setLoadFailed]);

  const loadCreditMetrics = useCallback(async () => {
    try {
      const data = await apiClient.getCreditMetrics();
      setCreditMetrics(data);
      setLoadFailed((f) => ({ ...f, metrics: false }));
    } catch (err) {
      setLoadFailed((f) => ({ ...f, metrics: true }));
      console.error('Erro ao carregar métricas de fiado:', err);
    }
  }, [setLoadFailed]);

  // Repete só os saldos que faltaram, sem refazer a lista de clientes.
  async function loadMissingBalances() {
    const found: Record<string, CustomerBalance> = {};
    await Promise.all(
      customers
        .filter((c) => !customerBalances[c.id])
        .map(async (c) => {
          try {
            found[c.id] = await apiClient.getCustomerBalance(c.id);
          } catch {
            // continua faltando; o aviso fica
          }
        }),
    );
    // O que já está no estado (ex.: de um loadCustomers mais novo) sempre vence o saldo do retry.
    setCustomerBalances((prev) => ({ ...found, ...prev }));
  }

  const edit = useCustomerEdit({
    setFeedback,
    setProcessing,
    // The new name and limit show at once; the balances are read again for the badge and the bar.
    applyEdit: (item) => {
      setCustomers((cur) => cur.map((c) => (c.id === item.id ? { ...c, ...item } : c)));
      void loadCustomers();
    },
    reload: loadCustomers,
  });

  const statement = useCustomerStatement();

  const create = useNewCustomer({ setFeedback, setProcessing, reload: loadCustomers });

  // --- Handlers de Clientes / Fiado ---
  async function handleSettleDebt(e: React.FormEvent) {
    e.preventDefault();
    if (!settlingCustomer) return;
    setProcessing(true);
    setFeedback(null);
    try {
      const val = parseCurrencyInput(settleAmount);
      await apiClient.settleCustomerDebt(settlingCustomer.customerId, {
        amount: val,
        note: settleNote.trim() || undefined,
      });
      setFeedback({ text: `Quitação de ${formatMoney(val)} realizada com sucesso e registrada no caixa!`, isSuccess: true });
      setSettlingCustomer(null);
      setSettleAmount('');
      setSettleNote('');
      await Promise.all([loadCustomers(), loadCash(), loadCreditMetrics()]);
    } catch (err) {
      setFeedback({ text: getErrorMessage(err, 'Erro ao quitar débito de fiado.'), isError: true });
    } finally {
      setProcessing(false);
    }
  }

  return {
    customers,
    customerBalances,
    customerQuery,
    setCustomerQuery,
    customerFilter,
    setCustomerFilter,
    settlingCustomer,
    setSettlingCustomer,
    settleAmount,
    setSettleAmount,
    settleNote,
    setSettleNote,
    creditMetrics,
    loadCustomers,
    loadCreditMetrics,
    loadMissingBalances,
    handleSettleDebt,
    create,
    edit,
    statement,
  };
}
