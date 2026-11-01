import { z } from 'zod';
import { User, UserAuthority } from '../domain/user';
import { hashSecret } from '../domain/password';
import { UserRepository } from '../domain/user-repository.port';

export const RegisterMerchantSchema = z.object({
  merchantName: z.string().trim().min(2, 'O nome do comércio deve ter no mínimo 2 caracteres').max(160).default('Meu Comércio'),
  username: z.string().trim().regex(/^[a-zA-Z0-9._-]{3,120}$/, 'Nome de usuário inválido (3 a 120 caracteres alfanuméricos, ponto, traço ou underline)'),
  password: z.string().min(8, 'A senha deve ter no mínimo 8 caracteres'),
  authorizationPin: z.string().regex(/^\d{4,6}$/, 'O PIN de autorização deve conter de 4 a 6 dígitos numéricos'),
  email: z.string().trim().email('E-mail inválido').max(254).optional().nullable(),
});

export type RegisterMerchantInput = z.infer<typeof RegisterMerchantSchema>;

export class UsernameAlreadyTakenError extends Error {
  constructor(username: string) {
    super(`O nome de usuário '${username}' já está em uso.`);
    this.name = 'UsernameAlreadyTakenError';
  }
}

const OWNER_AUTHORITIES: UserAuthority[] = [
  'ROLE_OWNER',
  'CREATE_SALE',
  'OPEN_CASH',
  'CLOSE_CASH',
];

export class RegisterMerchantUseCase {
  constructor(private readonly userRepository: UserRepository) {}

  public async execute(rawInput: unknown): Promise<User> {
    const input = RegisterMerchantSchema.parse(rawInput);

    const existingUser = await this.userRepository.findByUsername(input.username);
    if (existingUser) {
      throw new UsernameAlreadyTakenError(input.username);
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
      authorities: OWNER_AUTHORITIES,
    });
  }
}
