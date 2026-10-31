import { z } from 'zod';
import { User, UserAuthority } from '../domain/user';
import { hashSecret } from '../domain/password';
import { UserRepository } from '../domain/user-repository.port';

export const InitialOwnerSetupSchema = z.object({
  merchantName: z.string().trim().min(2).max(160).default('Meu Comércio'),
  username: z.string().trim().regex(/^[a-zA-Z0-9._-]{3,120}$/, 'Nome de usuário inválido (3 a 120 caracteres alfanuméricos, ponto, traço ou underline)'),
  password: z.string().min(8, 'A senha deve ter no mínimo 8 caracteres'),
  authorizationPin: z.string().regex(/^\d{4,6}$/, 'O PIN de autorização deve conter de 4 a 6 dígitos numéricos'),
  email: z.string().trim().email('E-mail inválido').max(254).optional().nullable(),
});

export type InitialOwnerSetupInput = z.infer<typeof InitialOwnerSetupSchema>;

export class SetupAlreadyCompletedError extends Error {
  constructor() {
    super('O cadastro inicial da proprietária já foi concluído anteriormente.');
    this.name = 'SetupAlreadyCompletedError';
  }
}

const INITIAL_AUTHORITIES: UserAuthority[] = [
  'ROLE_OWNER',
  'CREATE_SALE',
  'OPEN_CASH',
  'CLOSE_CASH',
];

export class InitialOwnerSetupUseCase {
  constructor(private readonly userRepository: UserRepository) {}

  public async execute(rawInput: unknown): Promise<User> {
    const input = InitialOwnerSetupSchema.parse(rawInput);

    const alreadyHasUsers = await this.userRepository.hasAnyUser();
    if (alreadyHasUsers) {
      throw new SetupAlreadyCompletedError();
    }

    const [passwordHash, authorizationPinHash] = await Promise.all([
      hashSecret(input.password),
      hashSecret(input.authorizationPin),
    ]);

    return this.userRepository.createInitialMerchantWithOwner({
      merchantName: input.merchantName,
      username: input.username,
      passwordHash,
      authorizationPinHash,
      email: input.email ?? null,
      authorities: INITIAL_AUTHORITIES,
    });
  }
}
