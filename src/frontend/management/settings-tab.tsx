'use client';

import React from 'react';
import { OperatorsTab } from './operators-tab';
import { OwnerEmailTab } from './owner-email-tab';
import type { useOperatorsTab } from './use-operators-tab';
import type { useOwnerEmailTab } from './use-owner-email-tab';

interface SettingsTabProps {
  operatorsTab: ReturnType<typeof useOperatorsTab>;
  ownerEmailTab: ReturnType<typeof useOwnerEmailTab>;
  stockControl: boolean;
  onToggleStockControl: () => void;
  loadFailed: { operators?: boolean; ownerEmail?: boolean };
  retrying: boolean;
  processing: boolean;
  retry: (load: () => Promise<void>) => Promise<void>;
}

/** The settings tab of the management panel (owner only: the page decides who sees it): recovery e-mail, operators and the stock control switch, one under the other. */
export function SettingsTab({ operatorsTab, ownerEmailTab, stockControl, onToggleStockControl, loadFailed, retrying, processing, retry }: SettingsTabProps) {
  return (
    <>
      <OwnerEmailTab tab={ownerEmailTab} loadFailed={loadFailed} retrying={retrying} processing={processing} retry={retry} />
      <OperatorsTab tab={operatorsTab} loadFailed={loadFailed} retrying={retrying} processing={processing} retry={retry} />
      <section className="mg-section" aria-label="Controle de estoque">
        <div className="mg-section-head">
          <div>
            <h2>Controle de estoque</h2>
            <p className="muted">
              <strong>{stockControl ? 'Ligado' : 'Desligado'}.</strong>{' '}
              {stockControl
                ? 'As vendas baixam o estoque e não passam do saldo.'
                : 'As vendas não dependem do estoque: não precisam de saldo e não baixam nada.'}
            </p>
          </div>
          <button type="button" className="outline" onClick={onToggleStockControl} disabled={processing}>
            {stockControl ? 'Desligar' : 'Ligar'}
          </button>
        </div>
      </section>
    </>
  );
}
