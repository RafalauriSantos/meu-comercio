import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import manifest from './manifest';

const publicDir = join(process.cwd(), 'public');

// Width and height of a PNG file, read from its header.
function pngSize(file: string): { width: number; height: number } {
  const bytes = readFileSync(file);
  expect(bytes.subarray(1, 4).toString('ascii')).toBe('PNG');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe('web app manifest', () => {
  const data = manifest();

  it('makes the app installable in its own window, in Portuguese, with the brand color', () => {
    expect(data.name).toBe('Meu Comércio');
    expect(data.short_name).toBe('Meu Comércio');
    expect(data.display).toBe('standalone');
    expect(data.lang).toBe('pt-BR');
    expect(data.theme_color).toBe('#2457c5');
    expect(data.background_color).toBe('#f3f6fa');
  });

  it('opens at the login, which sends a signed in person to the PDV, inside the whole site', () => {
    expect(data.start_url).toBe('/login');
    expect(data.scope).toBe('/');
  });

  it('has the 192 and 512 icons a browser asks for, and a maskable one', () => {
    const icons = data.icons ?? [];

    expect(icons.some((i) => i.sizes === '192x192' && i.purpose === 'any')).toBe(true);
    expect(icons.some((i) => i.sizes === '512x512' && i.purpose === 'any')).toBe(true);
    expect(icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable')).toBe(true);
  });

  it('points only at icon files that exist, with the size it says', () => {
    for (const icon of data.icons ?? []) {
      const file = join(publicDir, icon.src);
      expect(existsSync(file), icon.src).toBe(true);
      const [width, height] = String(icon.sizes).split('x').map(Number);
      expect(pngSize(file), icon.src).toEqual({ width, height });
    }
  });

  it('offers the two screens as shortcuts of the installed app', () => {
    expect((data.shortcuts ?? []).map((s) => s.url)).toEqual(['/pdv', '/gestao']);
  });

  it('has an Apple touch icon of 180 px for iPhone and iPad, as a file Next.js turns into the tag', () => {
    expect(pngSize(join(process.cwd(), 'src', 'app', 'apple-icon.png'))).toEqual({ width: 180, height: 180 });
  });

  it('keeps the favicon: the layout must not set `icons`, which would hide icon.svg', () => {
    const layout = readFileSync(join(process.cwd(), 'src', 'app', 'layout.tsx'), 'utf8');

    expect(existsSync(join(process.cwd(), 'src', 'app', 'icon.svg'))).toBe(true);
    expect(layout).not.toMatch(/^\s*icons\s*:/m);
  });
});
