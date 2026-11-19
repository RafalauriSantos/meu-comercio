import { NextResponse, connection } from 'next/server';
import { requireAuthSession, UnauthorizedError } from '@/shared/infrastructure/auth/auth-context';
import { isSessionOwner } from '@/shared/infrastructure/auth/session';
import { db } from '@/shared/infrastructure/db/connection';
import { DrizzleStoreSettingsRepository } from '@/modules/settings/infrastructure/drizzle-store-settings-repository';
import { DrizzleProductExportReader } from '@/modules/products/infrastructure/drizzle-product-export-reader';
import { ExportProductsUseCase } from '@/modules/products/application/export-products.use-case';
import { ExportTooLargeError, NoProductsToExportError } from '@/modules/products/domain/product-errors';

export async function GET() {
  // Cache Components prerenders a handler that reads no request data and `cookies()` then rejects at build.
  await connection();

  try {
    const session = await requireAuthSession();

    if (!isSessionOwner(session)) {
      return NextResponse.json(
        { message: 'Apenas a proprietária pode exportar os produtos do catálogo.' },
        { status: 403 }
      );
    }

    // A shop that does not control its stock has no Estoque column in the sheet.
    const { stockControlEnabled } = await new DrizzleStoreSettingsRepository(db).get(session.merchantId);
    const { csv, filename } = await new ExportProductsUseCase(new DrizzleProductExportReader(db)).execute(session.merchantId, {
      stockControl: stockControlEnabled,
    });

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }
    if (error instanceof NoProductsToExportError || error instanceof ExportTooLargeError) {
      return NextResponse.json({ message: error.message }, { status: 422 });
    }
    console.error('Error exporting products:', error);
    return NextResponse.json({ message: 'Erro interno ao exportar produtos.' }, { status: 500 });
  }
}
