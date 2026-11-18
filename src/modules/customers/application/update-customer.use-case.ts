import { z } from 'zod';
import { Money } from '@/shared/domain/money';
import { Customer, toValidCreditLimit } from '../domain/customer';
import { CustomerChanges, CustomerRepository } from '../domain/customer-repository.port';
import { CustomerNotFoundError, InvalidOwnerPinError, OwnerPinRequiredError } from '../domain/errors';
import { OwnerPinVerifier } from '../domain/owner-pin-verifier.port';

// A decimal text with a dot (or a finite JSON number), like the product price; the range is checked in the domain.
const creditLimitInput = z.union([
  z.string().regex(/^-?\d+(\.\d+)?$/, 'Limite de fiado inválido. Informe o valor em reais, como 150.00.'),
  z.number('Limite de fiado inválido. Informe o valor em reais, como 150.00.'),
]);

// Partial body: .strict() refuses any unknown field. `active` (D-27) is a field like the others: alone or together with them.
export const UpdateCustomerSchema = z
  .object({
    name: z.string().trim().min(1, 'Nome do cliente é obrigatório.').max(160, 'Nome do cliente deve ter no máximo 160 caracteres.').optional(),
    phone: z.string().trim().min(1, 'Telefone do cliente é obrigatório.').max(32, 'Telefone deve ter no máximo 32 caracteres.').optional(),
    creditLimit: creditLimitInput.optional(),
    creditBlocked: z.boolean('Fiado bloqueado deve ser verdadeiro ou falso.').optional(),
    // D-27: false excludes (deactivates) the customer, only with zero debt; true restores.
    active: z.boolean('Ativo deve ser verdadeiro ou falso.').optional(),
    // The updatedAt the caller read. If the customer changed since, the edit is refused.
    expectedUpdatedAt: z.iso.datetime('Data de leitura do cliente inválida').optional(),
    // D-22: the owner PIN, only used when the limit goes up. Never stored, logged or returned.
    ownerPin: z.string().trim().regex(/^\d{6}$/, 'PIN da proprietária deve ter 6 dígitos.').optional(),
  })
  .strict()
  .refine(
    (input) => input.name !== undefined || input.phone !== undefined ||
      input.creditLimit !== undefined || input.creditBlocked !== undefined || input.active !== undefined,
    'Informe ao menos um campo para alterar: nome, telefone, limite de fiado, bloqueio do fiado ou se o cliente está ativo.'
  );

export class UpdateCustomerUseCase {
  constructor(
    private readonly customerRepository: CustomerRepository,
    private readonly ownerPinVerifier: OwnerPinVerifier
  ) {}

  public async execute(merchantId: string, actorId: string, customerId: string, rawInput: unknown): Promise<Customer> {
    const input = UpdateCustomerSchema.parse(rawInput);

    const newLimit = input.creditLimit !== undefined ? toValidCreditLimit(Money.fromDecimal(input.creditLimit)) : undefined;
    const changes: CustomerChanges = {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.phone !== undefined && { phone: input.phone }),
      ...(input.creditBlocked !== undefined && { creditBlocked: input.creditBlocked }),
      ...(newLimit && { creditLimit: newLimit }),
      ...(input.active !== undefined && { active: input.active }),
    };

    // D-22: an increase needs the owner PIN. This read only decides whether to ask for it (and spend an attempt);
    // the repository checks the increase again against the limit read under the row lock.
    let limitIncreaseAuthorizedBy: string | undefined;
    if (newLimit) {
      const current = await this.customerRepository.findById(merchantId, customerId);
      if (!current) throw new CustomerNotFoundError(customerId);
      if (newLimit.isGreaterThan(current.creditLimit)) {
        if (!input.ownerPin) throw new OwnerPinRequiredError();
        const authorizedBy = await this.ownerPinVerifier.authorizeOwnerPin(merchantId, actorId, input.ownerPin);
        if (authorizedBy === null) throw new InvalidOwnerPinError();
        limitIncreaseAuthorizedBy = authorizedBy;
      }
    }

    const customer = await this.customerRepository.updateDetails(merchantId, customerId, changes, {
      actorId,
      expectedUpdatedAt: input.expectedUpdatedAt ? new Date(input.expectedUpdatedAt) : undefined,
      limitIncreaseAuthorizedBy,
    });
    if (!customer) throw new CustomerNotFoundError(customerId);
    return customer;
  }
}
