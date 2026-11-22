import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getClientIp } from '@/modules/users/infrastructure/client-ip';
import { buildRecoveryServices } from '@/modules/users/infrastructure/recovery-services';
import { recoveryErrorResponse, recoveryJson, runAfterResponse } from '@/app/api/owner/email/recovery-error-response';

// Public: whoever holds the link sets the new password and PIN together (AC-28). Token, passwords and PINs in the
// body. The format rules are in the use case, so a refused field does not use the link.
const BodySchema = z.object({
  token: z.string().min(1).max(200),
  password: z.string().max(1000),
  confirmPassword: z.string().max(1000),
  pin: z.string().max(100),
  confirmPin: z.string().max(100),
});

export async function POST(request: NextRequest) {
  try {
    const { token, password, confirmPassword, pin, confirmPin } = BodySchema.parse(await request.json().catch(() => ({})));
    await buildRecoveryServices(runAfterResponse).resetPin.execute({
      ip: getClientIp(request),
      token,
      password,
      confirmPassword,
      pin,
      confirmPin,
      now: new Date(),
    });
    return recoveryJson({ ok: true });
  } catch (error) {
    return recoveryErrorResponse(error);
  }
}
