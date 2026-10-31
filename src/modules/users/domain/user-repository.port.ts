import { User, UserAuthority } from './user';

export interface CreateMerchantWithOwnerParams {
  merchantName: string;
  username: string;
  passwordHash: string;
  authorizationPinHash: string;
  email?: string | null;
  authorities: UserAuthority[];
}

export interface UserRepository {
  hasAnyUser(): Promise<boolean>;
  findByUsername(username: string): Promise<User | null>;
  createInitialMerchantWithOwner(params: CreateMerchantWithOwnerParams): Promise<User>;
  updateFailedLoginAttempts(username: string, attempts: number, lockedUntil: Date | null): Promise<void>;
  resetFailedLoginAttempts(username: string): Promise<void>;
}
