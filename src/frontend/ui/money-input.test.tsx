import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readScreenSource } from '@/test-utils/read-screen-source';
import { MoneyInput } from './money-input';

describe('MoneyInput (22.5)', () => {
  it('is a text field with the numeric keypad, not a number field, and keeps what the screen passes', () => {
    const markup = renderToStaticMarkup(
      <MoneyInput id="amount" className="input num" value="12,50" required autoFocus placeholder="0,00" onValueChange={() => {}} />
    );

    expect(markup).toMatch(/<input[^>]*type="text"/);
    expect(markup).toContain('inputMode="numeric"');
    expect(markup).toContain('id="amount"');
    expect(markup).toContain('class="input num"');
    expect(markup).toContain('value="12,50"');
    expect(markup).toContain('required=""');
    expect(markup).toContain('placeholder="0,00"');
    expect(markup).not.toContain('type="number"');
  });

  it('turns the digits typed into the masked value: 125 becomes 1,25', () => {
    const onValueChange = vi.fn();
    const element = MoneyInput({ value: '', onValueChange }) as { props: { onChange: (e: { target: { value: string } }) => void } };

    element.props.onChange({ target: { value: '125' } });
    element.props.onChange({ target: { value: '1,25' + '9' } });
    element.props.onChange({ target: { value: 'abc' } });

    expect(onValueChange.mock.calls.map(([v]) => v)).toEqual(['1,25', '12,59', '']);
  });
});

describe('the money fields of the screens use the mask', () => {
  const sources: Array<[string, string]> = [
    ['gestao', readScreenSource('gestao')],
    ['pdv', readScreenSource('pdv')],
    ['cash open screen', readFileSync(join(process.cwd(), 'src', 'frontend', 'auth', 'cash-open-screen.tsx'), 'utf8')],
  ];

  it.each(sources)('%s has no number input for money', (_name, source) => {
    expect(source).not.toContain('type="number"');
  });
});
