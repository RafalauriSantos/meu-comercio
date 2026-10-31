export type UserRole = 'ROLE_OWNER' | 'ROLE_OPERATOR';

export type UserAuthority = 'ROLE_OWNER' | 'ROLE_OPERATOR' | 'CREATE_SALE' | 'OPEN_CASH' | 'CLOSE_CASH';

export interface UserProps {
  username: string;
  merchantId: string;
  passwordHash: string;
  authorizationPinHash?: string | null;
  email?: string | null;
  enabled: boolean;
  failedLoginAttempts: number;
  lockedUntil?: Date | null;
  authorities: UserAuthority[];
  createdAt: Date;
}

export class User {
  public readonly username: string;
  public readonly merchantId: string;
  public readonly passwordHash: string;
  public readonly authorizationPinHash: string | null;
  public readonly email: string | null;
  public readonly enabled: boolean;
  public readonly failedLoginAttempts: number;
  public readonly lockedUntil: Date | null;
  public readonly authorities: ReadonlySet<UserAuthority>;
  public readonly createdAt: Date;

  constructor(props: UserProps) {
    this.username = props.username.trim().toLowerCase();
    this.merchantId = props.merchantId;
    this.passwordHash = props.passwordHash;
    this.authorizationPinHash = props.authorizationPinHash ?? null;
    this.email = props.email ? props.email.trim().toLowerCase() : null;
    this.enabled = props.enabled;
    this.failedLoginAttempts = props.failedLoginAttempts;
    this.lockedUntil = props.lockedUntil ?? null;
    this.authorities = new Set(props.authorities);
    this.createdAt = props.createdAt;
  }

  public isOwner(): boolean {
    return this.authorities.has('ROLE_OWNER');
  }

  public hasAuthority(authority: UserAuthority): boolean {
    if (!this.enabled || this.isLocked()) {
      return false;
    }
    // Owners always possess all operational authorities
    if (this.isOwner()) {
      return true;
    }
    return this.authorities.has(authority);
  }

  public isLocked(now: Date = new Date()): boolean {
    if (!this.lockedUntil) {
      return false;
    }
    return this.lockedUntil.getTime() > now.getTime();
  }
}
