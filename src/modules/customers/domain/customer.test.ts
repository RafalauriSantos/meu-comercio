import { describe, it, expect } from 'vitest';
import { Money } from '@/shared/domain/money';
import { Customer } from './customer';
import { InvalidPhoneError } from './errors';

function existing(phone = '11999998888') {
  return new Customer({
    id: 'c1',
    merchantId: 'm1',
    name: 'Maria Silva',
    phone,
    creditLimit: Money.fromDecimal('150.00'),
    active: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-02-01T00:00:00.000Z'),
  });
}

describe('Customer.withChanges', () => {
  it('troca o nome (com trim) e mantém o resto', () => {
    const next = existing().withChanges({ name: '  Maria Souza  ' });

    expect(next.name).toBe('Maria Souza');
    expect(next.phone).toBe('11999998888');
    expect(next.creditLimit.toDecimal()).toBe('150.00');
    expect(next.active).toBe(true);
    expect(next.updatedAt).toEqual(existing().updatedAt);
  });

  it('o telefone novo passa pela regra D-21 e vira só dígitos', () => {
    expect(existing().withChanges({ phone: '+55 (11) 98888-7777' }).phone).toBe('11988887777');
  });

  it.each(['123', 'abc', '11111111111', '(10) 99999-8888', '1'.repeat(40)])('recusa o telefone %s', (phone) => {
    expect(() => existing().withChanges({ phone })).toThrow(InvalidPhoneError);
  });

  it('recusa nome vazio, só espaços e acima de 160 caracteres; aceita 160', () => {
    expect(() => existing().withChanges({ name: '' })).toThrow();
    expect(() => existing().withChanges({ name: '   ' })).toThrow();
    expect(() => existing().withChanges({ name: 'a'.repeat(161) })).toThrow();
    expect(existing().withChanges({ name: 'a'.repeat(160) }).name).toHaveLength(160);
  });

  it('só o nome de um cliente com telefone antigo fora do padrão não exige nem altera o telefone', () => {
    const legacy = existing('(11) 9999');

    const next = legacy.withChanges({ name: 'Novo Nome' });

    expect(next.phone).toBe('(11) 9999');
    expect(legacy.changesTo(next)).toEqual({ name: { from: 'Maria Silva', to: 'Novo Nome' } });
  });

  it('não aceita limite de crédito nem ativo: o valor fica como estava', () => {
    const next = existing().withChanges({ name: 'X', creditLimit: Money.fromDecimal('1'), active: false } as never);

    expect(next.creditLimit.toDecimal()).toBe('150.00');
    expect(next.active).toBe(true);
  });
});

describe('Customer.changesTo', () => {
  it('lista de/para só dos campos que mudaram', () => {
    const before = existing();
    const next = before.withChanges({ name: 'Maria Souza', phone: '(11) 98888-7777' });

    expect(before.changesTo(next)).toEqual({
      name: { from: 'Maria Silva', to: 'Maria Souza' },
      phone: { from: '11999998888', to: '11988887777' },
    });
  });

  it('o mesmo valor não é mudança', () => {
    const before = existing();

    expect(before.changesTo(before.withChanges({ name: ' Maria Silva ', phone: '(11) 99999-8888' }))).toEqual({});
  });

  it('telefone antigo mascarado reenviado igual vira mudança de formato', () => {
    const legacy = existing('(11) 99999-8888');

    expect(legacy.changesTo(legacy.withChanges({ phone: '11999998888' }))).toEqual({
      phone: { from: '(11) 99999-8888', to: '11999998888' },
    });
  });
});
