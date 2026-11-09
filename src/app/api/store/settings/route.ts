import { NextRequest, NextResponse, connection } from 'next/server';
import { z } from 'zod';
import { requireAuthSession, UnauthorizedError } from '@/shared/infrastructure/auth/auth-context';
import { isSessionOwner } from '@/shared/infrastructure/auth/session';
import { db } from '@/shared/infrastructure/db/connection';
import { DrizzleStoreSettingsRepository } from '@/modules/settings/infrastructure/drizzle-store-settings-repository';
import { DrizzleAuditService } from '@/modules/audit/infrastructure/drizzle-audit-service';
import { UpdateStoreSettingsUseCase } from '@/modules/settings/application/update-store-settings.use-case';

const UpdateSchema = z.object({
  stockControlEnabled: z.boolean({ message: 'Informe se o controle de estoque fica ligado ou desligado.' }),
});

// The settings of the shop. Anyone signed in reads them (the PDV and the management panel change what they
// show); only the owner changes them.
export async function GET() {
  // Reads the database for every request; keeps it out of the build.
  await connection();

  try {
    const session = await requireAuthSession();
    const settings = await new DrizzleStoreSettingsRepository(db).get(session.merchantId);
    return NextResponse.json(settings, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }
    console.error('Error reading the store settings:', error);
    return NextResponse.json({ message: 'Erro interno ao ler as configurações da loja.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  await connection();

  try {
    const session = await requireAuthSession();

    if (!isSessionOwner(session)) {
      return NextResponse.json({ message: 'Apenas a proprietária pode mudar as configurações da loja.' }, { status: 403 });
    }

    const body = UpdateSchema.parse(await request.json().catch(() => ({})));
    const useCase = new UpdateStoreSettingsUseCase(new DrizzleStoreSettingsRepository(db), new DrizzleAuditService());
    const settings = await useCase.execute(session.merchantId, session.username, body);

    return NextResponse.json(settings, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ message: error.message }, { status: 401 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: error.issues[0]?.message ?? 'Dados inválidos.' }, { status: 400 });
    }
    console.error('Error updating the store settings:', error);
    return NextResponse.json({ message: 'Erro interno ao salvar as configurações da loja.' }, { status: 500 });
  }
}
