export type Session = { code: string; memberId: string; token: string };
const key = (code: string) => `groupgrub:${code.toUpperCase()}`;

export function saveSession(s: Session) {
  localStorage.setItem(key(s.code), JSON.stringify(s));
}
export function loadSession(code: string): Session | null {
  try {
    const raw = localStorage.getItem(key(code));
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}
export function clearSession(code: string) {
  localStorage.removeItem(key(code));
}
