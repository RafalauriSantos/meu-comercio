import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(join(process.cwd(), 'src', 'app', 'globals.css'), 'utf8').replace(/\r\n/g, '\n');

// The declarations of the first rule that starts with `selector` at the beginning of a line (after
// optional indentation), as a name -> value map.
function declarations(selector: string): Map<string, string> {
  const start = css.search(new RegExp(`^\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{`, 'm'));
  expect(start, `rule not found: ${selector}`).toBeGreaterThanOrEqual(0);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  const result = new Map<string, string>();
  for (const line of body.split(';')) {
    const match = line.match(/^\s*([\w-]+)\s*:\s*([\s\S]+?)\s*$/);
    if (match) result.set(match[1], match[2].replace(/\s+/g, ' '));
  }
  return result;
}

describe('theme tokens', () => {
  const light = declarations(":root,\n[data-theme='light']");
  const darkBySystem = declarations(":root:not([data-theme='light'])");
  const darkForced = declarations("[data-theme='dark']");

  it('keeps the dark tokens of the system theme and of data-theme="dark" identical', () => {
    expect([...darkBySystem.entries()].sort()).toEqual([...darkForced.entries()].sort());
  });

  it('defines every dark token in the light theme too, so no screen is left without it', () => {
    const darkTokens = [...darkBySystem.keys()].filter((name) => name.startsWith('--'));
    const lightTokens = new Set(light.keys());

    for (const name of darkTokens) {
      expect(lightTokens.has(name), `${name} is missing in the light theme`).toBe(true);
    }
  });

  it('keeps the light ground of a page with a light part equal to the light tokens', () => {
    const lightPart = declarations(":root:has([data-theme='light'])");

    expect(lightPart.get('--bg')).toBe(light.get('--bg'));
    expect(lightPart.get('--text')).toBe(light.get('--text'));
    expect(lightPart.get('color-scheme')).toBe('light');
  });

  it('applies the dark theme without needing :has(), so older browsers still get it', () => {
    expect(css).toMatch(/@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme='light'\]\) \{/);
  });
});
