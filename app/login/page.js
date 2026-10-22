'use client';
import { useState } from 'react';
import { Brand } from '@/components/ui.js';

export default function Login() {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  async function submit(e) {
    e.preventDefault();
    setErr('');
    const res = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: pw }) });
    if (res.ok) { window.location.href = '/'; return; }
    setErr((await res.json().catch(() => ({}))).error || 'Sign in failed.');
  }
  return (
    <main className="login">
      <Brand href="/login" />
      <form onSubmit={submit} style={{ marginTop: 20 }}>
        <input type="password" placeholder="Password" autoFocus required value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
        <button className="btn primary big" style={{ marginTop: 12 }}>Sign in</button>
        {err && <div className="alert">{err}</div>}
      </form>
    </main>
  );
}
