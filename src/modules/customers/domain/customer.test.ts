import { describe, it, expect } from 'vitest';
import { Money } from '@/shared/domain/money';
import { Customer } from './customer';
import { CustomerCreditBlockedError, InvalidCreditLimitError, InvalidPhoneError } from './errors';

function existing(phone = '11999998888', creditBlocked = false) {
  return new Customer({
    id: 'c1',
    merchantId: 'm1',
    name: 'Maria Silva',
    phone,
    creditLimit: Money.fromDecimal('150.00'),
    active: true,
    creditBlocked,
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

  it('troca só o limite e mantém nome, telefone e ativo', () => {
    const next = existing().withChanges({ creditLimit: Money.fromDecimal('150.05') });

    expect(next.creditLimit.toDecimal()).toBe('150.05');
    expect(next.name).toBe('Maria Silva');
    expect(next.phone).toBe('11999998888');
    expect(next.active).toBe(true);
  });

  it('troca o ativo (D-27) sem mexer no resto, inclusive no bloqueio, e sem ativo ele fica como estava', () => {
    const blocked = existing().withChanges({ creditBlocked: true });
    const excluded = blocked.withChanges({ active: false });

    expect(excluded).toMatchObject({ active: false, creditBlocked: true, name: 'Maria Silva', phone: '11999998888' });
    expect(excluded.creditLimit.toDecimal()).toBe(blocked.creditLimit.toDecimal());
    expect(excluded.withChanges({ active: true })).toMatchObject({ active: true, creditBlocked: true });
    expect(existing().withChanges({ name: 'X' }).active).toBe(true);
  });

  it('changesTo lista o ativo de/para e nada quando é o mesmo valor', () => {
    const before = existing();

    expect(before.changesTo(before.withChanges({ active: false }))).toEqual({ active: { from: true, to: false } });
    expect(before.changesTo(before.withChanges({ active: true }))).toEqual({});
  });

  it.each(['0', '0.00', '500', '500.00', '499.99', '500.004'])('aceita o limite %s', (value) => {
    const next = existing().withChanges({ creditLimit: Money.fromDecimal(value) });

    expect(next.creditLimit.toDecimal()).toBe(Money.fromDecimal(value).toDecimal());
  });

  it.each(['500.01', '500.005', '1000000', '100000', '-0.01', '-1'])('recusa o limite %s com mensagem em português', (value) => {
    const change = () => existing().withChanges({ creditLimit: Money.fromDecimal(value) });

    expect(change).toThrow(InvalidCreditLimitError);
    expect(change).toThrow('O limite de fiado deve ser de R$ 0,00 a R$ 500,00.');
  });

  it('D-22: cliente antigo acima do teto é lido sem erro e editar o nome não revalida o limite', () => {
    const old = new Customer({ ...existing(), creditLimit: Money.fromDecimal('100000.00') });

    expect(old.creditLimit.toDecimal()).toBe('100000.00');
    const renamed = old.withChanges({ name: 'Maria Souza' });
    expect(renamed.creditLimit.toDecimal()).toBe('100000.00');
    expect(() => old.withChanges({ creditLimit: Money.fromDecimal('500.01') })).toThrow(InvalidCreditLimitError);
  });

  it('o limite é medido em centavos, sem ponto flutuante: 0.1 + 0.2 vira 0.30', () => {
    const next = existing().withChanges({ creditLimit: Money.fromDecimal('0.1').add(Money.fromDecimal('0.2')) });

    expect(next.creditLimit.toCents()).toBe(30);
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

  it('o limite entra na lista de/para em texto com duas casas', () => {
    const before = existing();

    expect(before.changesTo(before.withChanges({ creditLimit: Money.fromDecimal('150.05') }))).toEqual({
      creditLimit: { from: '150.00', to: '150.05' },
    });
  });

  it('o mesmo limite, escrito de outro jeito, não é mudança', () => {
    const before = existing();

    expect(before.changesTo(before.withChanges({ creditLimit: Money.fromDecimal('150') }))).toEqual({});
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

describe('Customer.creditBlocked (D-26)', () => {
  it('o construtor não lança com dado antigo sem o campo e trata como desbloqueado', () => {
    const legacy = new Customer({
      id: 'c1',
      merchantId: 'm1',
      name: 'Maria',
      phone: '11999998888',
      creditLimit: Money.zero(),
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    expect(legacy.creditBlocked).toBe(false);
  });

  it('Customer.create nasce desbloqueado', () => {
    expect(Customer.create({ merchantId: 'm1', name: 'Ana', phone: '11999998888' }).creditBlocked).toBe(false);
  });

  it('withChanges liga e desliga só o bloqueio, mantendo o resto', () => {
    const blocked = existing().withChanges({ creditBlocked: true });

    expect(blocked.creditBlocked).toBe(true);
    expect(blocked.name).toBe('Maria Silva');
    expect(blocked.creditLimit.toDecimal()).toBe('150.00');
    expect(blocked.active).toBe(true);
    expect(blocked.withChanges({ creditBlocked: false }).creditBlocked).toBe(false);
  });

  it('withChanges sem o campo mantém o bloqueio', () => {
    expect(existing('11999998888', true).withChanges({ name: 'Outro' }).creditBlocked).toBe(true);
  });

  it('changesTo traz o bloqueio de/para, só quando muda', () => {
    const before = existing();

    expect(before.changesTo(before.withChanges({ creditBlocked: true }))).toEqual({
      creditBlocked: { from: false, to: true },
    });
    expect(before.changesTo(before.withChanges({ creditBlocked: false }))).toEqual({});
  });

  it('desativar, reativar e mudar o limite não mudam o bloqueio', () => {
    const blocked = existing('11999998888', true);

    expect(blocked.deactivate().creditBlocked).toBe(true);
    expect(blocked.deactivate().activate().creditBlocked).toBe(true);
    expect(blocked.updateCreditLimit(Money.fromDecimal('10')).creditBlocked).toBe(true);
  });

  it('ensureCreditNotBlocked lança só quando bloqueado', () => {
    expect(() => existing().ensureCreditNotBlocked()).not.toThrow();
    expect(() => existing('11999998888', true).ensureCreditNotBlocked()).toThrow(CustomerCreditBlockedError);
    expect(() => existing('11999998888', true).ensureCreditNotBlocked()).toThrow(
      'Este cliente está com o fiado bloqueado. A venda só pode ser feita à vista.'
    );
  });

  it('toJSON traz creditBlocked', () => {
    expect(existing('11999998888', true).toJSON().creditBlocked).toBe(true);
  });
});
