'use client';
import { useState } from 'react';

export default function EditorLogin() {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  async function submit(e) {
    e.preventDefault();
    setErr('');
    const res = await fetch('/api/auth/editor', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: pw }) });
    const d = await res.json().catch(() => ({}));
    if (res.ok) window.location.href = d.redirect; else setErr(d.error || 'Sign in failed.');
  }
  return (
    <main className="login">
      <span className="brand"><span className="mark"><span /></span>Hotel Tech Report</span>
      <h1 style={{ marginTop: 28 }}>Editor access</h1>
      <form onSubmit={submit}>
        <input type="password" placeholder="Editor password" autoFocus required value={pw} onChange={(e) => setPw(e.target.value)} />
        <button className="btn primary big" style={{ marginTop: 12 }}>Sign in</button>
        {err && <div className="alert">{err}</div>}
      </form>
    </main>
  );
}
