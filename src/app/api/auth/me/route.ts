import { NextRequest, NextResponse } from 'next/server';
import { getCurrentSession } from '@/shared/infrastructure/auth/auth-context';

export async function GET(_request: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ message: 'Não autenticado.' }, { status: 401 });
  }

  const isOwner = session.authorities.includes('ROLE_OWNER');

  return NextResponse.json({
    username: session.username,
    merchantId: session.merchantId,
    authorities: session.authorities,
    isOwner,
  });
}
