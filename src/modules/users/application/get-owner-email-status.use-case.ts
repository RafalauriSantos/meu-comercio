import { OwnerEmailRepository } from '../domain/owner-email-repository.port';

/** What Gestão needs to know to ask the owner for an e-mail: is there one, and is it confirmed. */
export class GetOwnerEmailStatusUseCase {
  constructor(private readonly deps: { owners: OwnerEmailRepository }) {}

  public async execute(input: { username: string }): Promise<{ email: string | null; verified: boolean }> {
    const record = await this.deps.owners.getEmail(input.username);
    return { email: record?.email ?? null, verified: record?.verifiedAt != null };
  }
}
