import { z } from 'zod';
import { Money } from '@/shared/domain/money';
import { Customer, toValidCreditLimit } from '../domain/customer';
import { CustomerChanges, CustomerRepository } from '../domain/customer-repository.port';
import { CustomerNotFoundError } from '../domain/errors';

// A decimal text with a dot (or a finite JSON number), like the product price; the range is checked in the domain.
const creditLimitInput = z.union([
  z.string().regex(/^-?\d+(\.\d+)?$/, 'Limite de fiado inválido. Informe o valor em reais, como 150.00.'),
  z.number('Limite de fiado inválido. Informe o valor em reais, como 150.00.'),
]);

// Partial body: .strict() refuses active and any unknown field.
export const UpdateCustomerSchema = z
  .object({
    name: z.string().trim().min(1, 'Nome do cliente é obrigatório.').max(160, 'Nome do cliente deve ter no máximo 160 caracteres.').optional(),
    phone: z.string().trim().min(1, 'Telefone do cliente é obrigatório.').max(32, 'Telefone deve ter no máximo 32 caracteres.').optional(),
    creditLimit: creditLimitInput.optional(),
    // The updatedAt the caller read. If the customer changed since, the edit is refused.
    expectedUpdatedAt: z.iso.datetime('Data de leitura do cliente inválida').optional(),
  })
  .strict()
  .refine(
    (input) => input.name !== undefined || input.phone !== undefined || input.creditLimit !== undefined,
    'Informe ao menos um campo para alterar: nome, telefone ou limite de fiado.'
  );

export class UpdateCustomerUseCase {
  constructor(private readonly customerRepository: CustomerRepository) {}

  public async execute(merchantId: string, actorId: string, customerId: string, rawInput: unknown): Promise<Customer> {
    const input = UpdateCustomerSchema.parse(rawInput);

    const changes: CustomerChanges = {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.phone !== undefined && { phone: input.phone }),
      ...(input.creditLimit !== undefined && { creditLimit: toValidCreditLimit(Money.fromDecimal(input.creditLimit)) }),
    };

    const customer = await this.customerRepository.updateDetails(merchantId, customerId, changes, {
      actorId,
      expectedUpdatedAt: input.expectedUpdatedAt ? new Date(input.expectedUpdatedAt) : undefined,
    });
    if (!customer) throw new CustomerNotFoundError(customerId);
    return customer;
  }
}
