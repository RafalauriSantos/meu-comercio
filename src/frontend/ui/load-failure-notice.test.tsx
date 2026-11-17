import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LoadFailureNotice } from './load-failure-notice';

// No DOM here. LoadFailureNotice has no hooks, so it is called as a function and the element it returns is read
// (this is how the onClick wiring is proved); renderToStaticMarkup proves the markup.
type El = { type: unknown; props: { children?: unknown; [key: string]: unknown } };

function kids(el: El): unknown[] {
  const c = el.props.children;
  return Array.isArray(c) ? c.flat() : c === undefined ? [] : [c];
}

function text(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(text).join('');
  if (node && typeof node === 'object' && 'props' in node) return text((node as El).props.children);
  return '';
}

describe('LoadFailureNotice (the element it returns)', () => {
  const onRetry = vi.fn();
  const root = LoadFailureNotice({ what: 'a lista de clientes', onRetry }) as unknown as El;
  const [span, button] = kids(root) as El[];

  it('is a div.error with role="alert", the same classes as the feedback of the pages', () => {
    expect(root.type).toBe('div');
    expect(root.props.className).toBe('error');
    expect(root.props.role).toBe('alert');
  });

  it('says what did not load, in a span', () => {
    expect(span.type).toBe('span');
    expect(text(span)).toBe('Não foi possível carregar a lista de clientes.');
  });

  it('has a native button "Tentar de novo" wired to onRetry (keyboard reachable: type=button, no tabIndex)', () => {
    expect(button.type).toBe('button');
    expect(button.props.type).toBe('button');
    expect(button.props.className).toBe('soft');
    expect(button.props.onClick).toBe(onRetry);
    expect(text(button)).toBe('Tentar de novo');
    expect(button.props.tabIndex).toBeUndefined();
  });

  it('is enabled by default and disabled while busy', () => {
    expect(button.props.disabled).toBeFalsy();
    const busy = LoadFailureNotice({ what: 'x', onRetry, busy: true }) as unknown as El;
    expect((kids(busy)[1] as El).props.disabled).toBe(true);
    const idle = LoadFailureNotice({ what: 'x', onRetry, busy: false }) as unknown as El;
    expect((kids(idle)[1] as El).props.disabled).toBeFalsy();
  });
});

describe('LoadFailureNotice (server markup)', () => {
  it('renders role="alert", the text and the retry button', () => {
    const html = renderToStaticMarkup(<LoadFailureNotice what="os produtos" onRetry={() => {}} />);
    expect(html).toContain('class="error"');
    expect(html).toContain('role="alert"');
    expect(html).toContain('Não foi possível carregar os produtos.');
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>Tentar de novo<\/button>/);
    expect(html).toContain('class="soft"');
    expect(html).not.toContain('disabled');
  });

  it('marks the button disabled when busy', () => {
    const html = renderToStaticMarkup(<LoadFailureNotice what="os produtos" onRetry={() => {}} busy />);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Tentar de novo<\/button>/);
  });

  it('says why it failed after the sentence when a reason is given', () => {
    const html = renderToStaticMarkup(<LoadFailureNotice what="o PDV" reason="A conexão está lenta. Tente de novo." onRetry={() => {}} />);
    expect(html).toContain('Não foi possível carregar o PDV. A conexão está lenta. Tente de novo.');
  });
});
