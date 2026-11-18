import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ZodError } from 'zod';
import { Money } from '@/shared/domain/money';
import { Customer } from '../domain/customer';
import { CustomerRepository } from '../domain/customer-repository.port';
import { CustomerAlreadyExistsError, CustomerChangedError, CustomerNotFoundError, InvalidCreditLimitError, InvalidOwnerPinError, InvalidPhoneError, OwnerPinRequiredError } from '../domain/errors';
import { OwnerPinVerifier } from '../domain/owner-pin-verifier.port';
import { UpdateCustomerUseCase } from './update-customer.use-case';

const customer = Customer.create({ id: 'c1', merchantId: 'm1', name: 'Maria', phone: '11999998888', creditLimit: Money.fromDecimal('50') });

describe('UpdateCustomerUseCase', () => {
  const updateDetails = vi.fn();
  const findById = vi.fn();
  const authorizeOwnerPin = vi.fn();
  const useCase = new UpdateCustomerUseCase(
    { updateDetails, findById } as unknown as CustomerRepository,
    { authorizeOwnerPin } as unknown as OwnerPinVerifier
  );
  const PIN = '123456';

  beforeEach(() => {
    vi.clearAllMocks();
    updateDetails.mockResolvedValue(customer);
    findById.mockResolvedValue(customer); // limit R$ 50,00
    authorizeOwnerPin.mockResolvedValue('dona');
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
    ['o teto', '500.00', '500.00'],
    ['número JSON', 150.5, '150.50'],
  ])('aceita só o limite (%s) e manda Money em centavos', async (_label, creditLimit, expected) => {
    await useCase.execute('m1', 'dona', 'c1', { creditLimit, ownerPin: PIN });

    const sent = updateDetails.mock.calls[0][2];
    expect(Object.keys(sent)).toEqual(['creditLimit']);
    expect(sent.creditLimit).toBeInstanceOf(Money);
    expect(sent.creditLimit.toDecimal()).toBe(expected);
  });

  it.each(['500.01', '-0.01', '-5', '999999999'])('limite %s fora do intervalo: InvalidCreditLimitError e não chama o repositório', async (creditLimit) => {
    await expect(useCase.execute('m1', 'dona', 'c1', { creditLimit })).rejects.toBeInstanceOf(InvalidCreditLimitError);
    expect(updateDetails).not.toHaveBeenCalled();
    expect(authorizeOwnerPin).not.toHaveBeenCalled();
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
    ['PIN com 5 dígitos', { creditLimit: '60', ownerPin: '12345' }],
    ['PIN com letras', { creditLimit: '60', ownerPin: 'abcdef' }],
    ['PIN vazio', { creditLimit: '60', ownerPin: '' }],
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

  describe('D-22: aumento do limite exige o PIN da proprietária', () => {
    it('aumento sem PIN: OwnerPinRequiredError, sem gastar tentativa e sem gravar', async () => {
      await expect(useCase.execute('m1', 'dona', 'c1', { creditLimit: '50.01' })).rejects.toBeInstanceOf(OwnerPinRequiredError);
      expect(authorizeOwnerPin).not.toHaveBeenCalled();
      expect(updateDetails).not.toHaveBeenCalled();
    });

    it('PIN errado ou loja bloqueada (verificador devolve null): InvalidOwnerPinError e não grava', async () => {
      authorizeOwnerPin.mockResolvedValue(null);

      await expect(useCase.execute('m1', 'dona', 'c1', { creditLimit: '60', ownerPin: PIN })).rejects.toBeInstanceOf(InvalidOwnerPinError);
      expect(updateDetails).not.toHaveBeenCalled();
    });

    it('aumento com PIN certo: confere o PIN da própria sessão e manda quem autorizou, sem o PIN', async () => {
      await useCase.execute('m1', 'dona', 'c1', { creditLimit: '60', ownerPin: PIN });

      expect(authorizeOwnerPin).toHaveBeenCalledWith('m1', 'dona', PIN);
      const [, , changes, context] = updateDetails.mock.calls[0];
      expect(context.limitIncreaseAuthorizedBy).toBe('dona');
      expect(JSON.stringify([changes, context])).not.toContain(PIN);
    });

    it.each(['50', '49.99', '0'])('manter ou reduzir (%s) não pede PIN', async (creditLimit) => {
      await useCase.execute('m1', 'dona', 'c1', { creditLimit });

      expect(authorizeOwnerPin).not.toHaveBeenCalled();
      expect(updateDetails.mock.calls[0][3].limitIncreaseAuthorizedBy).toBeUndefined();
    });

    it('PIN enviado sem aumento é ignorado e não gasta tentativa', async () => {
      await useCase.execute('m1', 'dona', 'c1', { creditLimit: '10', ownerPin: PIN });

      expect(authorizeOwnerPin).not.toHaveBeenCalled();
    });

    it('editar só o nome não lê o cliente nem pede PIN', async () => {
      await useCase.execute('m1', 'dona', 'c1', { name: 'Maria S' });

      expect(findById).not.toHaveBeenCalled();
      expect(authorizeOwnerPin).not.toHaveBeenCalled();
    });

    it('limite em cliente inexistente: CustomerNotFoundError antes do PIN', async () => {
      findById.mockResolvedValue(null);

      await expect(useCase.execute('m1', 'dona', 'c1', { creditLimit: '60', ownerPin: PIN })).rejects.toBeInstanceOf(CustomerNotFoundError);
      expect(authorizeOwnerPin).not.toHaveBeenCalled();
    });
  });
});
