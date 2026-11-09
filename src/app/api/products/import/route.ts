import { NextRequest, NextResponse } from 'next/server';
import { requireAuthSession, UnauthorizedError } from '@/shared/infrastructure/auth/auth-context';
import { isSessionOwner } from '@/shared/infrastructure/auth/session';
import { db } from '@/shared/infrastructure/db/connection';
import { DrizzleProductImportStore } from '@/modules/products/infrastructure/drizzle-product-import-store';
import { ImportProductsUseCase } from '@/modules/products/application/import-products.use-case';
import { ImportFileError } from '@/modules/products/application/parse-product-csv';

const MAX_CSV_CHARACTERS = 300_000;

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuthSession();

    if (!isSessionOwner(session)) {
      return NextResponse.json(
        { message: 'Apenas a proprietária pode importar produtos para o catálogo.' },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => null);
    const csv = body && typeof body === 'object' ? (body as { csv?: unknown }).csv : undefined;
    const dryRun = body && typeof body === 'object' ? (body as { dryRun?: unknown }).dryRun !== false : true;

    if (typeof csv !== 'string' || csv.trim() === '') {
      return NextResponse.json({ message: 'Envie o conteúdo da planilha.' }, { status: 400 });
    }
    if (csv.length > MAX_CSV_CHARACTERS) {
      return NextResponse.json({ message: 'A planilha é grande demais. Divida em partes.' }, { status: 413 });
    }

    const useCase = new ImportProductsUseCase(new DrizzleProductImportStore(db));
    const report = await useCase.execute(session.merchantId, session.username, csv, { dryRun });

    // Confirming with a problem in the sheet creates nothing.
    if (!dryRun && report.errors.length > 0) {
      return NextResponse.json(
        { ...report, message: 'A planilha tem linhas com problema. Nada foi importado.' },
        { status: 422 }
      );
    }
    return NextResponse.json(report);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }
    if (error instanceof ImportFileError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    console.error('Error importing products:', error);
    return NextResponse.json({ message: 'Erro interno ao importar produtos.' }, { status: 500 });
  }
}
