import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuthSession } from '@/shared/infrastructure/auth/auth-context';
import { isSessionOwner } from '@/shared/infrastructure/auth/session';
import { getClientIp } from '@/modules/users/infrastructure/client-ip';
import { buildRecoveryServices } from '@/modules/users/infrastructure/recovery-services';
import { recoveryErrorResponse, recoveryJson } from '../recovery-error-response';

// Without `email` (or with the e-mail already on the account), the link is sent again. Any other e-mail
// needs the current password, as in PUT /api/owner/email.
const BodySchema = z.object({ email: z.string().max(1000).optional(), currentPassword: z.string().max(200).optional() });

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuthSession();
    if (!isSessionOwner(session)) {
      return recoveryJson({ message: 'Apenas a proprietária pode cadastrar o e-mail de recuperação.' }, 403);
    }

    const body = BodySchema.parse(await request.json().catch(() => ({})));
    const result = await buildRecoveryServices().requestEmailVerification.execute({
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
