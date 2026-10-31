import { CashSessionRepository, CurrentCashSessionSummary } from '../domain/cash-session-repository.port';

export class GetCurrentCashSessionUseCase {
  constructor(private readonly cashRepository: CashSessionRepository) {}

  public async execute(merchantId: string): Promise<CurrentCashSessionSummary | null> {
    return this.cashRepository.findCurrentOpenSession(merchantId);
  }
}
