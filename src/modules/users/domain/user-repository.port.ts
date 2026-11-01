import { User, UserAuthority } from './user';

export interface CreateMerchantWithOwnerParams {
  merchantName: string;
  username: string;
  passwordHash: string;
  authorizationPinHash: string;
  email?: string | null;
  authorities: UserAuthority[];
}

export interface CreateOperatorParams {
  merchantId: string;
  username: string;
  passwordHash: string;
  authorities: UserAuthority[];
}

export interface UserRepository {
  hasAnyUser(): Promise<boolean>;
  findByUsername(username: string): Promise<User | null>;
  createInitialMerchantWithOwner(params: CreateMerchantWithOwnerParams): Promise<User>;
  createOperator(params: CreateOperatorParams): Promise<User>;
  listOperators(merchantId: string): Promise<User[]>;
  updateFailedLoginAttempts(username: string, attempts: number, lockedUntil: Date | null): Promise<void>;
  resetFailedLoginAttempts(username: string): Promise<void>;
}

