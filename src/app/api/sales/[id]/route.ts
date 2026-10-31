import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedSession, UnauthorizedError } from '@/shared/infrastructure/auth/auth-context';
import { DrizzleSaleRepository } from '@/modules/sales/infrastructure/drizzle-sale-repository';
import { GetSaleByIdUseCase } from '@/modules/sales/application/get-sale-by-id.use-case';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuthenticatedSession();
    const { id } = await params;

    const useCase = new GetSaleByIdUseCase(new DrizzleSaleRepository());
    const sale = await useCase.execute(session.merchantId, id);

    if (!sale) {
      return NextResponse.json(
        { message: `Venda [${id}] não encontrada.` },
        { status: 404 }
      );
    }

    return NextResponse.json(sale.toJSON());
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) {
      throw error;
    }
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }
    console.error('Error fetching sale by id:', error);
    return NextResponse.json({ message: 'Erro interno ao consultar venda.' }, { status: 500 });
  }
}
