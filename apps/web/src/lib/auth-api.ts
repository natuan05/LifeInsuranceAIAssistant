import { coreApiUrl } from './core-api';

export type Actor = { id: string; accountCode: string; email: string; role: 'STAFF' | 'CUSTOMER'; fullName: string; passwordChangeRecommended: boolean };
export type Session = { actor: Actor; csrfToken: string };
export class AuthError extends Error {
  constructor(public readonly status: number) {
    super(status === 401 ? 'Email hoặc mật khẩu không đúng, tài khoản không thuộc cổng đăng nhập này, bị khóa hoặc phiên đã hết hạn.'
      : status === 400 ? 'Vui lòng nhập email và mật khẩu hợp lệ.'
      : status === 429 ? 'Bạn đã thử quá nhiều lần. Vui lòng thử lại sau 15 phút.'
        : status === 403 ? 'Không thể xác nhận yêu cầu. Hãy tải lại trang rồi thử lại.'
          : 'Chưa kết nối được dịch vụ. Vui lòng thử lại.');
  }
}
function apiBase() {
  if (coreApiUrl.startsWith('/')) return coreApiUrl;
  const url = new URL(coreApiUrl);
  if (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)
    && ['localhost', '127.0.0.1'].includes(url.hostname)) url.hostname = window.location.hostname;
  return url.toString().replace(/\/$/, '');
}
export async function coreRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBase()}/${path}`, { ...options, credentials: 'include', cache: 'no-store', signal: options.signal ?? AbortSignal.timeout(15000) });
  if (!response.ok) throw new AuthError(response.status);
  return response.json();
}
const request = <T,>(path: string, options: RequestInit = {}) => coreRequest<T>(`auth/${path}`, options);
export const me = () => request<Session>('me');
export const login = (email: string, password: string, role: Actor['role']) => request<Session>(role === 'STAFF' ? 'staff/login' : 'login', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Auth-Request': '1' }, body: JSON.stringify({ email, password }),
});
export const changePassword = (currentPassword: string, newPassword: string, confirmPassword: string, csrfToken: string) => request<Session>('change-password', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Auth-Request': '1', 'X-CSRF-Token': csrfToken },
  body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
});
export async function logout() {
  const current = await me();
  return request<{ ok: boolean }>('logout', { method: 'POST', headers: {
    'Content-Type': 'application/json', 'X-Auth-Request': '1', 'X-CSRF-Token': current.csrfToken,
  }, body: '{}' });
}
