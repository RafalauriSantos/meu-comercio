import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/shared/infrastructure/auth/auth-context';

export async function POST() {
  await clearSessionCookie();
  return NextResponse.json({ success: true, message: 'Sessão encerrada com sucesso.' });
}
