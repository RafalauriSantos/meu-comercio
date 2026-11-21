import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getClientIp } from '@/modules/users/infrastructure/client-ip';
import { buildRecoveryServices } from '@/modules/users/infrastructure/recovery-services';
import { recoveryErrorResponse, recoveryJson, runAfterResponse } from '@/app/api/owner/email/recovery-error-response';

// The link goes out after the response (after()), which Vercel keeps alive until this limit.
export const maxDuration = 30;

// AC-13: the same message, status and fields for every e-mail.
const NEUTRAL_MESSAGE =
  'Se este e-mail estiver cadastrado e confirmado, enviaremos um link em alguns minutos. Ele vale 30 minutos. Não chegou? Veja a caixa de spam.';

const BodySchema = z.object({ email: z.string().max(1000) });

// Public. Nothing here depends on whether the e-mail exists.
export async function POST(request: NextRequest) {
  try {
    const { email } = BodySchema.parse(await request.json().catch(() => ({})));
    await buildRecoveryServices(runAfterResponse).requestPasswordReset.execute({
      email,
      ip: getClientIp(request),
      now: new Date(),
    });
    return recoveryJson({ message: NEUTRAL_MESSAGE });
  } catch (error) {
    return recoveryErrorResponse(error);
  }
}
