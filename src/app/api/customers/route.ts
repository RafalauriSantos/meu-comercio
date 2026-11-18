import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { requireAuthenticatedSession, UnauthorizedError } from '@/shared/infrastructure/auth/auth-context';
import { isSessionOwner } from '@/shared/infrastructure/auth/session';
import { DrizzleCustomerRepository } from '@/modules/customers/infrastructure/drizzle-customer-repository';
import { DrizzleAuditAdapter } from '@/modules/audit/infrastructure/drizzle-audit-service';
import { CreateCustomerUseCase } from '@/modules/customers/application/create-customer.use-case';
import { CustomerAlreadyExistsError, InvalidPhoneError } from '@/modules/customers/domain/errors';
import { Money } from '@/shared/domain/money';

const CreateCustomerBodySchema = z.object({
  name: z.string().trim().min(1, 'Nome do cliente é obrigatório.').max(160, 'Nome do cliente deve ter no máximo 160 caracteres.'),
  phone: z.string().trim().min(1, 'Telefone do cliente é obrigatório.').max(32, 'Telefone deve ter no máximo 32 caracteres.'),
  creditLimit: z
    .union([z.number(), z.string()])
    .optional()
    .nullable()
    .refine((val) => {
      if (val === undefined || val === null) return true;
      try {
        const m = Money.fromDecimal(val);
        return !m.isNegative();
      } catch {
        return false;
      }
    }, 'Limite de crédito deve ser um valor válido e não negativo.'),
});

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuthenticatedSession();
    const rawBody = await request.json().catch(() => ({}));
    const parsed = CreateCustomerBodySchema.parse(rawBody);

    const useCase = new CreateCustomerUseCase(
      new DrizzleCustomerRepository(),
      new DrizzleAuditAdapter()
    );

    const customer = await useCase.execute({
      merchantId: session.merchantId,
      name: parsed.name,
      phone: parsed.phone,
      creditLimit:
        parsed.creditLimit !== undefined && parsed.creditLimit !== null
          ? Money.fromDecimal(parsed.creditLimit)
          : Money.zero(),
      operatorId: session.username,
    });

    return NextResponse.json(customer.toJSON(), { status: 201 });
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) {
      throw error;
    }
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }
    if (error instanceof CustomerAlreadyExistsError) {
      return NextResponse.json({ message: error.message }, { status: 409 });
    }
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          message: 'Dados de cliente inválidos.',
          errors: error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
        },
        { status: 400 }
      );
    }
    if (error instanceof InvalidPhoneError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    console.error('Error creating customer:', error);
    return NextResponse.json({ message: 'Erro ao cadastrar cliente.' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuthenticatedSession();
    // D-27: ?active=false lists only the excluded customers, and only for the owner. The default is the active ones.
    const activeParam = new URL(request.url).searchParams.get('active');
    if (activeParam !== null && activeParam !== 'true' && activeParam !== 'false') {
      return NextResponse.json({ message: 'O filtro de ativos deve ser true ou false.' }, { status: 400 });
    }
    const onlyInactive = activeParam === 'false';
    if (onlyInactive && !isSessionOwner(session)) {
      return NextResponse.json({ message: 'Apenas a proprietária pode ver os clientes excluídos.' }, { status: 403 });
    }
    const repo = new DrizzleCustomerRepository();
    const customers = onlyInactive
      ? await repo.findAllInactive(session.merchantId)
      : await repo.findAllActive(session.merchantId);

    return NextResponse.json({
      items: customers.map((c) => c.toJSON()),
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) {
      throw error;
    }
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }
    console.error('Error fetching customers:', error);
    return NextResponse.json({ message: 'Erro interno ao consultar clientes.' }, { status: 500 });
  }
}
