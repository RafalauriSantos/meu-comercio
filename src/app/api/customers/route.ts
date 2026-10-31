import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { requireAuthenticatedSession, UnauthorizedError } from '@/shared/infrastructure/auth/auth-context';
import { DrizzleCustomerRepository } from '@/modules/customers/infrastructure/drizzle-customer-repository';
import { DrizzleAuditAdapter } from '@/modules/audit/infrastructure/drizzle-audit-service';
import { CreateCustomerUseCase } from '@/modules/customers/application/create-customer.use-case';
import { CustomerAlreadyExistsError } from '@/modules/customers/domain/errors';
import { Money } from '@/shared/domain/money';

const CreateCustomerBodySchema = z.object({
  name: z.string().trim().min(1, 'Nome do cliente é obrigatório.'),
  phone: z.string().trim().min(1, 'Telefone do cliente é obrigatório.'),
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
    if (error instanceof Error && !(error instanceof TypeError)) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    console.error('Error creating customer:', error);
    return NextResponse.json({ message: 'Erro interno ao cadastrar cliente.' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const session = await requireAuthenticatedSession();
    const repo = new DrizzleCustomerRepository();
    const customers = await repo.findAllActive(session.merchantId);

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
