import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ZodError } from 'zod';
import { Money } from '@/shared/domain/money';
import { Customer } from '../domain/customer';
import { CustomerRepository } from '../domain/customer-repository.port';
import { CustomerAlreadyExistsError, CustomerChangedError, CustomerNotFoundError, InvalidCreditLimitError, InvalidPhoneError } from '../domain/errors';
import { UpdateCustomerUseCase } from './update-customer.use-case';

const customer = Customer.create({ id: 'c1', merchantId: 'm1', name: 'Maria', phone: '11999998888', creditLimit: Money.fromDecimal('50') });

describe('UpdateCustomerUseCase', () => {
  const updateDetails = vi.fn();
  const useCase = new UpdateCustomerUseCase({ updateDetails } as unknown as CustomerRepository);

  beforeEach(() => {
    vi.clearAllMocks();
    updateDetails.mockResolvedValue(customer);
  });

  it('manda só os campos enviados, o ator e o expectedUpdatedAt como Date', async () => {
    const result = await useCase.execute('m1', 'dona', 'c1', {
      name: '  Maria Souza ',
      expectedUpdatedAt: '2026-11-17T10:00:00.000Z',
    });

    expect(result).toBe(customer);
    expect(updateDetails).toHaveBeenCalledWith(
      'm1',
      'c1',
      { name: 'Maria Souza' },
      { actorId: 'dona', expectedUpdatedAt: new Date('2026-11-17T10:00:00.000Z') }
    );
  });

  it.each([
    ['string com centavos', '150.05', '150.05'],
    ['string inteira', '150', '150.00'],
    ['zero', '0', '0.00'],
    ['o teto', '100000.00', '100000.00'],
    ['número JSON', 150.5, '150.50'],
  ])('aceita só o limite (%s) e manda Money em centavos', async (_label, creditLimit, expected) => {
    await useCase.execute('m1', 'dona', 'c1', { creditLimit });

    const sent = updateDetails.mock.calls[0][2];
    expect(Object.keys(sent)).toEqual(['creditLimit']);
    expect(sent.creditLimit).toBeInstanceOf(Money);
    expect(sent.creditLimit.toDecimal()).toBe(expected);
  });

  it.each(['100000.01', '-0.01', '-5', '999999999'])('limite %s fora do intervalo: InvalidCreditLimitError e não chama o repositório', async (creditLimit) => {
    await expect(useCase.execute('m1', 'dona', 'c1', { creditLimit })).rejects.toBeInstanceOf(InvalidCreditLimitError);
    expect(updateDetails).not.toHaveBeenCalled();
  });

  it('nome e limite juntos vão na mesma chamada', async () => {
    await useCase.execute('m1', 'dona', 'c1', { name: 'Maria', creditLimit: '20' });

    expect(updateDetails.mock.calls[0][2].name).toBe('Maria');
    expect(updateDetails.mock.calls[0][2].creditLimit.toDecimal()).toBe('20.00');
  });

  it.each([true, false])('aceita só creditBlocked=%s e manda só ele', async (creditBlocked) => {
    await useCase.execute('m1', 'dona', 'c1', { creditBlocked });

    expect(updateDetails).toHaveBeenCalledWith('m1', 'c1', { creditBlocked }, { actorId: 'dona', expectedUpdatedAt: undefined });
  });

  it('creditBlocked junto de nome e limite vai na mesma chamada', async () => {
    await useCase.execute('m1', 'dona', 'c1', { name: 'Maria', creditLimit: '20', creditBlocked: true });

    expect(updateDetails.mock.calls[0][2]).toMatchObject({ name: 'Maria', creditBlocked: true });
  });

  it('aceita só o telefone e deixa a regra D-21 para o domínio', async () => {
    await useCase.execute('m1', 'dona', 'c1', { phone: '(11) 98888-7777' });

    expect(updateDetails).toHaveBeenCalledWith('m1', 'c1', { phone: '(11) 98888-7777' }, { actorId: 'dona', expectedUpdatedAt: undefined });
  });

  it.each([
    ['corpo vazio', {}],
    ['só expectedUpdatedAt', { expectedUpdatedAt: '2026-11-17T10:00:00.000Z' }],
    ['active', { name: 'A', active: false }],
    ['creditBlocked como texto', { creditBlocked: 'true' }],
    ['creditBlocked como número', { creditBlocked: 1 }],
    ['creditBlocked nulo', { creditBlocked: null }],
    ['limite mal formado', { creditLimit: 'dez' }],
    ['limite vazio', { creditLimit: '' }],
    ['limite em notação científica', { creditLimit: '1e3' }],
    ['limite hexadecimal', { creditLimit: '0x10' }],
    ['limite nulo', { creditLimit: null }],
    ['limite infinito', { creditLimit: Infinity }],
    ['campo desconhecido', { name: 'A', foo: 1 }],
    ['nome vazio', { name: '   ' }],
    ['nome com 161 caracteres', { name: 'a'.repeat(161) }],
    ['telefone com 33 caracteres', { phone: '1'.repeat(33) }],
    ['expectedUpdatedAt inválido', { name: 'A', expectedUpdatedAt: 'ontem' }],
    ['corpo nulo', null],
  ])('recusa %s e não chama o repositório', async (_label, body) => {
    await expect(useCase.execute('m1', 'dona', 'c1', body)).rejects.toBeInstanceOf(ZodError);
    expect(updateDetails).not.toHaveBeenCalled();
  });

  it('cliente que não existe nessa loja vira CustomerNotFoundError', async () => {
    updateDetails.mockResolvedValue(null);

    await expect(useCase.execute('m1', 'dona', 'c1', { name: 'A' })).rejects.toBeInstanceOf(CustomerNotFoundError);
  });

  it.each([new CustomerAlreadyExistsError('11999998888'), new CustomerChangedError(), new InvalidPhoneError()])(
    'repassa o erro de domínio %s',
    async (error) => {
      updateDetails.mockRejectedValue(error);

      await expect(useCase.execute('m1', 'dona', 'c1', { name: 'A' })).rejects.toBe(error);
    }
  );
});
