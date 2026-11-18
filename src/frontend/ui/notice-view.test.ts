import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readScreenSource } from '@/test-utils/read-screen-source';
import { noticeView } from './notice-view';

const css = readFileSync(join(process.cwd(), 'src', 'app', 'globals.css'), 'utf8').replace(/\r\n/g, '\n');
const gestao = readScreenSource('gestao');
const pdv = readScreenSource('pdv');

describe('noticeView', () => {
  it('shows an error in red with role alert', () => {
    expect(noticeView({ text: 'x', isError: true })).toEqual({ className: 'error', role: 'alert' });
  });

  it('shows a confirmation in green with role status', () => {
    expect(noticeView({ text: 'x', isSuccess: true })).toEqual({ className: 'success', role: 'status' });
  });

  it('keeps an informative notice blue with role status', () => {
    expect(noticeView({ text: 'x' })).toEqual({ className: 'notice', role: 'status' });
  });
});

describe('success styles', () => {
  it('declares the success tokens on the light theme (the only theme)', () => {
    const rule = css.match(/^:root,\n\[data-theme='light'\] \{([^}]*)\}/m)?.[1] ?? '';

    expect(rule).toMatch(/--success:\s*#[0-9a-f]{6};/i);
    expect(rule).toMatch(/--success-soft:\s*#[0-9a-f]{6};/i);
  });

  it('has a .success class that shares the layout with .notice and .error', () => {
    expect(css).toMatch(/\.notice,\n\.error,\n\.success \{[^}]*display: flex/);
    expect(css).toMatch(/\.success \{\n  background: var\(--success-soft\);\n  color: var\(--success\);/);
  });

  it('keeps the success notice full width in the PDV grid', () => {
    const pdvCss = readFileSync(join(process.cwd(), 'src', 'frontend', 'styles', 'pdv.css'), 'utf8');

    expect(pdvCss).toContain('.pdv-main > .success');
  });
});

describe('screens choose success for confirmations', () => {
  it('both screens render the notice through noticeView', () => {
    expect(gestao).toContain('noticeView(feedback)');
    expect(pdv).toContain('noticeView(message)');
    expect(pdv).not.toContain('message.isError ?');
    expect(gestao).not.toContain('feedback.isError ?');
  });

  it.each([
    [
      'gestao',
      gestao,
      [
        'Caixa aberto com sucesso',
        'Caixa fechado com sucesso',
        'Sangria de',
        'Suprimento de',
        'newCustomerSuccessText(isOwner)',
        'realizada com sucesso e registrada',
        'cadastrado com sucesso!`',
        'cadastrado com sucesso!${typedBarcode',
        'Estoque reposto com sucesso',
        'produtos importados com sucesso',
        'Controle de estoque ligado',
      ],
    ],
    ['pdv', pdv, ['offline sincronizada(s)', 'confirmada com sucesso', 'Sangria de', 'Suprimento de', 'Os produtos voltaram ao estoque']],
  ])('%s: each confirmation is marked isSuccess', (_name, src, texts) => {
    for (const t of texts) {
      const i = src.indexOf(t);
      expect(i, `${t} not found`).toBeGreaterThan(-1);
      const call = src.slice(i, src.indexOf('});', i) + 3);
      expect(call, `${t} should be isSuccess`).toContain('isSuccess: true');
      expect(call).not.toContain('isError');
    }
  });

  it('keeps informative messages blue', () => {
    for (const t of ['Carrinho limpo.', 'Esta venda já havia sido registrada']) {
      const i = pdv.indexOf(t);
      expect(i).toBeGreaterThan(-1);
      expect(pdv.slice(i, pdv.indexOf('}', i + t.length + 40))).not.toContain('isSuccess');
    }
  });

  it('keeps errors with isError', () => {
    expect(gestao).toContain("'Erro ao abrir caixa.'), isError: true");
    expect(pdv).toMatch(/'Não foi possível concluir a venda\.'\),\s*isError: true/);
  });
});
