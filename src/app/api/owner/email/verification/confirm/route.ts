import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getClientIp } from '@/modules/users/infrastructure/client-ip';
import { buildRecoveryServices } from '@/modules/users/infrastructure/recovery-services';
import { recoveryErrorResponse, recoveryJson } from '../../recovery-error-response';

// Public, like inspect: whoever holds the link confirms. Token in the body.
const BodySchema = z.object({ token: z.string().min(1).max(200) });

export async function POST(request: NextRequest) {
  try {
    const { token } = BodySchema.parse(await request.json().catch(() => ({})));
    const result = await buildRecoveryServices().confirmEmailVerification.execute({
      ip: getClientIp(request),
      token,
      now: new Date(),
    });
    return recoveryJson({ email: result.email });
  } catch (error) {
    return recoveryErrorResponse(error);
  }
}
