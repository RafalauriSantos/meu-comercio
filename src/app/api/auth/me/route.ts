import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/shared/infrastructure/auth/auth-context';
import { isSessionOwner } from '@/shared/infrastructure/auth/session';

export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ message: 'Não autenticado.' }, { status: 401 });
  }

  return NextResponse.json({
    username: session.username,
    merchantId: session.merchantId,
    authorities: session.authorities,
    isOwner: isSessionOwner(session),
  });
}
