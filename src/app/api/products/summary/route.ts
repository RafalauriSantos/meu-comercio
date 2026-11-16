import { NextResponse } from 'next/server';
import { requireAuthSession, UnauthorizedError } from '@/shared/infrastructure/auth/auth-context';
import { db } from '@/shared/infrastructure/db/connection';
import { DrizzleProductRepository } from '@/modules/products/infrastructure/drizzle-product-repository';
import { DrizzleStoreSettingsRepository } from '@/modules/settings/infrastructure/drizzle-store-settings-repository';

// Numbers of the products tab over ALL active products of the shop (not one page). With stock control off the
// screen shows only the total, so the stock numbers go as null.
export async function GET() {
  try {
    const session = await requireAuthSession();
    const [summary, settings] = await Promise.all([
      new DrizzleProductRepository().getSummary(session.merchantId),
      new DrizzleStoreSettingsRepository(db).get(session.merchantId),
    ]);

    const stock = settings.stockControlEnabled;
    return NextResponse.json(
      {
        total: summary.total,
        lowStockCount: stock ? summary.lowStockCount : null,
        outOfStockCount: stock ? summary.outOfStockCount : null,
        stockValue: stock ? summary.stockValue.toDecimal() : null,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }
    console.error('Error summarizing products:', error);
    return NextResponse.json({ message: 'Erro interno ao resumir os produtos.' }, { status: 500 });
  }
}
