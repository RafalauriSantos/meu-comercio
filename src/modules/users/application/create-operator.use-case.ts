import { z } from 'zod';
import { User, UserAuthority } from '../domain/user';
import { hashSecret } from '../domain/password';
import { UserRepository } from '../domain/user-repository.port';

export const CreateOperatorSchema = z.object({
  merchantId: z.string().uuid(),
  username: z.string().trim().regex(/^[a-zA-Z0-9._-]{3,120}$/, 'Nome de usuário inválido (3 a 120 caracteres alfanuméricos, ponto, traço ou underline)'),
  password: z.string().min(6, 'A senha deve ter no mínimo 6 caracteres'),
});

export type CreateOperatorInput = z.infer<typeof CreateOperatorSchema>;

export class UsernameAlreadyExistsError extends Error {
  constructor(username: string) {
    super(`O usuário '${username}' já existe no sistema.`);
    this.name = 'UsernameAlreadyExistsError';
  }
}

const OPERATOR_AUTHORITIES: UserAuthority[] = [
  'ROLE_OPERATOR',
  'CREATE_SALE',
  'OPEN_CASH',
  'CLOSE_CASH',
];

export class CreateOperatorUseCase {
  constructor(private readonly userRepository: UserRepository) {}

  public async execute(rawInput: unknown): Promise<User> {
    const input = CreateOperatorSchema.parse(rawInput);

    const existingUser = await this.userRepository.findByUsername(input.username);
    if (existingUser) {
      throw new UsernameAlreadyExistsError(input.username);
    }

    const passwordHash = await hashSecret(input.password);

    return this.userRepository.createOperator({
      merchantId: input.merchantId,
      username: input.username,
      passwordHash,
      authorities: OPERATOR_AUTHORITIES,
    });
  }
}
