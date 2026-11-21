import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getClientIp } from '@/modules/users/infrastructure/client-ip';
import { buildRecoveryServices } from '@/modules/users/infrastructure/recovery-services';
import { recoveryErrorResponse, recoveryJson, runAfterResponse } from '@/app/api/owner/email/recovery-error-response';

// Public: whoever holds the link sets the new password. Token and passwords in the body. The length rules
// (8 to 72) are in the use case, so a refused password does not use the link.
const BodySchema = z.object({
  token: z.string().min(1).max(200),
  password: z.string().max(1000),
  confirmPassword: z.string().max(1000),
});

export async function POST(request: NextRequest) {
  try {
    const { token, password, confirmPassword } = BodySchema.parse(await request.json().catch(() => ({})));
    await buildRecoveryServices(runAfterResponse).resetPassword.execute({
      ip: getClientIp(request),
      token,
      password,
      confirmPassword,
      now: new Date(),
    });
    return recoveryJson({ ok: true });
  } catch (error) {
    return recoveryErrorResponse(error);
  }
}
