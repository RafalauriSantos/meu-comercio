import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SalesReport } from '@/frontend/lib/api-client';
import {
  bestAndWorstDays,
  changeDirection,
  dayBarWidths,
  decimalComma,
  formatDay,
  formatPercent,
  formatSoldQuantity,
  paymentLabel,
  reportFileName,
  reportToCsv,
} from './sales-report';

const report: SalesReport = {
  period: { kind: 'week', label: 'Esta semana, 09/11 a 15/11', from: '2026-11-09', to: '2026-11-15', timeZone: 'America/Sao_Paulo' },
  summary: { salesCount: 5, total: '250.50', averageTicket: '50.10' },
  previous: { label: 'semana passada', salesCount: 4, total: '200.00', changeAmount: '50.50', changePercent: 25.3 },
  byPayment: [
    { method: 'TAB', amount: '100.50', share: 40.1, count: 1 },
    { method: 'CASH', amount: '100.00', share: 39.9, count: 3 },
    { method: 'PIX', amount: '50.00', share: 20, count: 2 },
  ],
  byDay: [
    { date: '2026-11-09', salesCount: 1, total: '100.00' },
    { date: '2026-11-10', salesCount: 0, total: '0.00' },
    { date: '2026-11-11', salesCount: 4, total: '150.50' },
  ],
  topProducts: [
    { name: 'Queijo "Mussarela"; fatiado', unit: 'KG', quantity: 1250, amount: '53.63' },
    { name: 'Arroz 5kg', unit: 'UN', quantity: 4, amount: '102.00' },
  ],
  byOperator: [{ operatorId: 'tatiane', salesCount: 5, total: '250.50', share: 100 }],
  cancelled: { count: 1, total: '40.00' },
  fiado: { sold: '100.50', received: '75.00' },
};

describe('labels and numbers', () => {
  it('names the payment methods in Portuguese', () => {
    expect(['CASH', 'PIX', 'DEBIT_CARD', 'CREDIT_CARD', 'TAB'].map(paymentLabel)).toEqual(['Dinheiro', 'Pix', 'Débito', 'Crédito', 'Fiado']);
    expect(paymentLabel('OUTRO')).toBe('OUTRO');
  });

  it('writes the change with a sign, or a dash when there is nothing to compare', () => {
    expect(formatPercent(25.3)).toBe('+25,3%');
    expect(formatPercent(-16.7)).toBe('-16,7%');
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(null)).toBe('—');
  });

  it('tells whether the sales went up, down or stayed', () => {
    expect([changeDirection('50.50'), changeDirection('-0.01'), changeDirection('0.00')]).toEqual(['up', 'down', 'same']);
  });

  it('uses the decimal comma', () => {
    expect(decimalComma('250.50')).toBe('250,50');
  });

  it('shows a weight in kilograms and a unit count as units', () => {
    expect(formatSoldQuantity(report.topProducts[0])).toBe('1,25 kg');
    expect(formatSoldQuantity(report.topProducts[1])).toBe('4 un');
  });

  it('writes a day with its weekday', () => {
    expect(formatDay('2026-11-09')).toBe('09/11 seg');
    expect(formatDay('2026-11-15')).toBe('15/11 dom');
  });
});

describe('days', () => {
  it('sizes each bar against the best day, and an empty day has none', () => {
    expect(dayBarWidths(report.byDay)).toEqual([66, 0, 100]);
    expect(dayBarWidths([])).toEqual([]);
    expect(dayBarWidths([{ date: '2026-11-09', salesCount: 0, total: '0.00' }])).toEqual([0]);
  });

  it('finds the best and the worst day among the days that sold something', () => {
    expect(bestAndWorstDays(report.byDay)).toEqual({ best: '2026-11-11', worst: '2026-11-09' });
    expect(bestAndWorstDays([{ date: '2026-11-09', salesCount: 0, total: '0.00' }])).toBeNull();
  });
});

describe('reportToCsv', () => {
  const csv = reportToCsv(report);
  const lines = csv.replace(/^﻿/, '').split('\r\n');

  it('opens in Excel in Portuguese: byte order mark, semicolons and decimal commas', () => {
    expect(csv.startsWith('﻿')).toBe(true);
    expect(lines[0]).toBe('Relatório de vendas;Esta semana, 09/11 a 15/11');
    expect(lines).toContain('Total vendido;250,50');
    expect(lines).toContain('Ticket médio;50,10');
    expect(csv).not.toMatch(/\d\.\d{2}(?!\d)/);
  });

  it('has one block per table, with the totals of the period', () => {
    expect(lines).toContain('Comparação com semana passada;200,00;50,50;+25,3%');
    expect(lines).toContain('Forma de pagamento;Valor;% do total;Pagamentos');
    expect(lines).toContain('Fiado;100,50;40,1;1');
    expect(lines).toContain('2026-11-10;0;0,00');
    expect(lines).toContain('Vendas canceladas (fora do total);1;40,00');
    expect(lines).toContain('Fiado vendido;100,50');
    expect(lines).toContain('Fiado recebido;75,00');
  });

  it('quotes a product name that holds a quote or a semicolon', () => {
    expect(lines).toContain('"Queijo ""Mussarela""; fatiado";1,25 kg;53,63');
  });

  it('is named after the period', () => {
    expect(reportFileName(report)).toBe('relatorio-vendas-2026-11-09-a-2026-11-15.csv');
    expect(reportFileName({ ...report, period: { ...report.period, from: '2026-11-11', to: '2026-11-11' } })).toBe(
      'relatorio-vendas-2026-11-11.csv'
    );
  });
});

describe('the reports tab of the management panel', () => {
  const page = readFileSync(join(process.cwd(), 'src', 'app', 'gestao', 'page.tsx'), 'utf8').replace(/\r\n/g, '\n');

  it('is for the owner only, in the tab and in the content', () => {
    expect(page).toMatch(/user\?\.isOwner && \(\s*<button[^>]*\s*type="button"[^>]*aria-pressed=\{activeTab === 'relatorios'\}/);
    expect(page).toContain("{activeTab === 'relatorios' && user?.isOwner && <SalesReportPanel />}");
  });
});
