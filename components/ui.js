'use client';
import { useEffect, useState } from 'react';

export function Brand({ href = '/' }) {
  return (
    <a className="brand" href={href}>
      <span className="mark"><span /></span>Transcribe
    </a>
  );
}

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: { 'x-htr': '1', ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  if (res.status === 401 && typeof window !== 'undefined' && !path.includes('/login')) window.location.href = '/login';
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export function useToast() {
  const [msg, setMsg] = useState('');
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(''), 1800);
    return () => clearTimeout(t);
  }, [msg]);
  return [msg ? <div className="toast" role="status">{msg}</div> : null, setMsg];
}

export const bytes = (n) => {
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (n >= 1024 && i < 3) { n /= 1024; i++; }
  return `${n.toFixed(i ? 1 : 0)} ${u[i]}`;
};

export const duration = (sec) => {
  if (!sec && sec !== 0) return '—';
  const s = Math.round(sec), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m ${s % 60}s`;
};

export const when = (iso) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export function download(name, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
