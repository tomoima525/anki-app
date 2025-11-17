import { cookies } from 'next/headers';
import { verifySession, getSessionCookieConfig } from './auth';

export async function getSession() {
  const cookieStore = cookies();
  const { name } = getSessionCookieConfig();
  const token = cookieStore.get(name)?.value;

  if (!token) {
    return null;
  }

  return await verifySession(token);
}

export async function requireSession() {
  const session = await getSession();

  if (!session) {
    throw new Error('Unauthorized');
  }

  return session;
}
