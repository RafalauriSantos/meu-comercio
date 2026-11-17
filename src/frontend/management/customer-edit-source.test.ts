import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// No jsdom: what the hook, the tab and the panel wire together is locked by reading the code.
const read = (file: string) => readFileSync(join(__dirname, file), 'utf8').replace(/\r\n/g, '\n');
const tab = read('customers-tab.tsx');
const hook = read('use-customer-edit.ts');
const panel = read('customer-edit-panel.tsx');

describe('customer edit (source locks)', () => {
  it('only the owner sees the Editar button and the panel', () => {
    expect(tab).toMatch(/\{user\?\.isOwner && \(\s*<button\s+type="button"\s+className="outline mg-row-action"\s+aria-haspopup="dialog"/);
    expect(tab).toContain('aria-label={`Editar ${r.name}`}');
    expect(tab).toMatch(/\{user\?\.isOwner && edit\.target && \(\s*<CustomerEditPanel/);
  });

  it('the panel is a modal dialog: Esc handled by the app, focus on the name, no close on the background', () => {
    expect(panel).toMatch(/<dialog[\s\S]*?ref=\{dialogRef\}[\s\S]*?className="mg-panel"[\s\S]*?aria-labelledby=\{titleId\}/);
    expect(panel).toMatch(/onCancel=\{\(e\) => \{\s*e\.preventDefault\(\);\s*onCancel\(\);/);
    expect(panel).toContain('useDialogPanel(dialogRef, nameRef, closing, onClosed)');
    expect(panel).not.toMatch(/e\.target === e\.currentTarget/);
  });

  it('the component only draws: no state, effect or api call', () => {
    expect(panel).not.toMatch(/useState|useEffect|apiClient/);
  });

  it('closing keeps the target until the exit ends, and success confirms in green', () => {
    expect(hook).toMatch(/function close\(\) \{\s*setClosing\(true\);\s*\}/);
    expect(hook).toMatch(/function finishClose\(\) \{\s*setTarget\(null\);\s*setClosing\(false\);/);
    expect(hook).toContain("text: 'Cliente atualizado.', isSuccess: true");
  });

  it('calls the api only through submitCustomerEdit (no call without a change)', () => {
    expect(hook).toContain('submitCustomerEdit(apiClient.updateCustomer,');
  });
});
