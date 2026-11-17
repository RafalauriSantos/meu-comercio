import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ZodError } from 'zod';
import { Money } from '@/shared/domain/money';
import { Customer } from '../domain/customer';
import { CustomerRepository } from '../domain/customer-repository.port';
import { CustomerAlreadyExistsError, CustomerChangedError, CustomerNotFoundError, InvalidPhoneError } from '../domain/errors';
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

  it('aceita só o telefone e deixa a regra D-21 para o domínio', async () => {
    await useCase.execute('m1', 'dona', 'c1', { phone: '(11) 98888-7777' });

    expect(updateDetails).toHaveBeenCalledWith('m1', 'c1', { phone: '(11) 98888-7777' }, { actorId: 'dona', expectedUpdatedAt: undefined });
  });

  it.each([
    ['corpo vazio', {}],
    ['só expectedUpdatedAt', { expectedUpdatedAt: '2026-11-17T10:00:00.000Z' }],
    ['creditLimit', { name: 'A', creditLimit: '10' }],
    ['active', { name: 'A', active: false }],
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
