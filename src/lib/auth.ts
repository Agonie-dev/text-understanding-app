import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { supabase } from './supabase';

const COOKIE_NAME = 'admin_session';
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'text-understanding-app-default-secret-change-me-in-production'
);

export interface AdminPayload {
  role: 'admin';
  exp: number;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function getAdminPasswordHash(): Promise<string | null> {
  const { data } = await supabase
    .from('app_config')
    .select('admin_password_hash')
    .eq('id', 1)
    .single();
  return data?.admin_password_hash || null;
}

export async function loginAdmin(password: string): Promise<{ token: string; success: boolean; message: string }> {
  const hash = await getAdminPasswordHash();
  if (!hash) {
    return { token: '', success: false, message: '系统未初始化' };
  }
  const valid = await verifyPassword(password, hash);
  if (!valid) {
    return { token: '', success: false, message: '密码错误' };
  }
  const token = await new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(JWT_SECRET);
  return { token, success: true, message: '登录成功' };
}

export async function verifyAdminToken(token: string): Promise<AdminPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, { clockTolerance: 60 });
    if (payload.role !== 'admin') return null;
    return payload as unknown as AdminPayload;
  } catch {
    return null;
  }
}

export function getTokenFromCookie(req: Request): string | null {
  const cookie = req.headers.get('cookie');
  if (!cookie) return null;
  const match = cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function setAdminCookie(token: string): string {
  const maxAge = 7 * 24 * 60 * 60; // 7 days
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearAdminCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export async function isAdmin(req: Request): Promise<boolean> {
  const token = getTokenFromCookie(req);
  if (!token) return false;
  const payload = await verifyAdminToken(token);
  return payload !== null;
}

export async function requireAdmin(req: Request): Promise<{ ok: boolean; response?: Response }> {
  const admin = await isAdmin(req);
  if (!admin) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: '未授权' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    };
  }
  return { ok: true };
}
