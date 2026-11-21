import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuthSession } from '@/shared/infrastructure/auth/auth-context';
import { isSessionOwner } from '@/shared/infrastructure/auth/session';
import { getClientIp } from '@/modules/users/infrastructure/client-ip';
import { buildRecoveryServices } from '@/modules/users/infrastructure/recovery-services';
import { recoveryErrorResponse, recoveryJson } from './recovery-error-response';

const BodySchema = z.object({ email: z.string().max(1000), currentPassword: z.string().min(1).max(200) });

export async function GET() {
  try {
    const session = await requireAuthSession();
    if (!isSessionOwner(session)) {
      return recoveryJson({ message: 'Apenas a proprietária pode ver o e-mail de recuperação.' }, 403);
    }
    return recoveryJson(await buildRecoveryServices().getOwnerEmailStatus.execute({ username: session.username }));
  } catch (error) {
    return recoveryErrorResponse(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await requireAuthSession();
    if (!isSessionOwner(session)) {
      return recoveryJson({ message: 'Apenas a proprietária pode trocar o e-mail de recuperação.' }, 403);
    }

    const body = BodySchema.parse(await request.json().catch(() => ({})));
    const result = await buildRecoveryServices().changeOwnerEmail.execute({
      merchantId: session.merchantId,
      username: session.username,
      ip: getClientIp(request),
      email: body.email,
      currentPassword: body.currentPassword,
      now: new Date(),
    });
    return recoveryJson({ email: result.email });
  } catch (error) {
    return recoveryErrorResponse(error);
  }
}
