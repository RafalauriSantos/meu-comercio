import { Money } from '@/shared/domain/money';
import { CustomerRepository } from '../domain/customer-repository.port';
import { CustomerStatementReader } from '../domain/customer-credit-repository.port';
import {
  classifyMovement,
  decodeStatementCursor,
  encodeStatementCursor,
  lockAtZero,
  StatementEntryType,
} from '../domain/customer-statement';
import { CustomerNotFoundError, InvalidStatementLimitError } from '../domain/errors';

export const DEFAULT_STATEMENT_LIMIT = 20;
export const MAX_STATEMENT_LIMIT = 50;

export interface GetCustomerStatementDTO {
  merchantId: string;
  customerId: string;
  limit?: number;
  cursor?: string;
}

export interface StatementItem {
  id: string;
  type: StatementEntryType;
  amount: Money;
  balanceAfter: Money;
  createdAt: Date;
  saleId: string | null;
  operator: string;
  /** Only the reversal carries its reason (D-28). */
  note: string | null;
}

export interface CustomerStatementResult {
  items: StatementItem[];
  nextCursor: string | null;
}

export class GetCustomerStatementUseCase {
  constructor(
    private readonly customerRepository: CustomerRepository,
    private readonly statementReader: CustomerStatementReader
  ) {}

  public async execute(dto: GetCustomerStatementDTO): Promise<CustomerStatementResult> {
    const limit = dto.limit ?? DEFAULT_STATEMENT_LIMIT;
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_STATEMENT_LIMIT) {
      throw new InvalidStatementLimitError();
    }
    const after = dto.cursor === undefined ? undefined : decodeStatementCursor(dto.customerId, dto.cursor);

    const customer = await this.customerRepository.findById(dto.merchantId, dto.customerId);
    if (!customer) {
      throw new CustomerNotFoundError(dto.customerId);
    }

    // One extra row tells whether there is a next page without a second query.
    const rows = await this.statementReader.getStatementPage(dto.merchantId, dto.customerId, {
      limit: limit + 1,
      after,
    });
    const page = rows.slice(0, limit);

    const items = page.map(({ movement, runningBalance }): StatementItem => {
      const type = classifyMovement(movement);
      return {
        id: movement.id,
        type,
        amount: movement.amount,
        balanceAfter: lockAtZero(runningBalance),
        createdAt: movement.createdAt,
        saleId: movement.saleId,
        operator: movement.operatorId,
        note: type === 'REVERSAL' ? movement.note : null,
      };
    });

    const last = page[page.length - 1];
    const nextCursor = rows.length > limit && last ? encodeStatementCursor(dto.customerId, last.position) : null;

    return { items, nextCursor };
  }
}
