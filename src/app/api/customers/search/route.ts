import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedSession, UnauthorizedError } from '@/shared/infrastructure/auth/auth-context';
import { DrizzleCustomerRepository } from '@/modules/customers/infrastructure/drizzle-customer-repository';

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuthenticatedSession();
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || searchParams.get('query') || '';

    const customerRepo = new DrizzleCustomerRepository();
    const items = query.trim()
      ? await customerRepo.search(session.merchantId, query)
      : await customerRepo.findAllActive(session.merchantId);

    return NextResponse.json({
      items: items.map((c) => c.toJSON()),
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) {
      throw error;
    }
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }
    console.error('Error searching customers:', error);
    return NextResponse.json({ message: 'Erro interno ao buscar clientes.' }, { status: 500 });
  }
}
