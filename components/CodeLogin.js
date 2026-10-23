'use client';
import { useState } from 'react';

async function post(path, body) {
  const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

// Email -> (new clients: name + company) -> 6-digit code -> signed in for 7 days.
// as="admin": company-domain staff. as="client": sponsors. passwordFallback: admin password until email is set up.
export default function CodeLogin({ as, heading, sub, passwordFallback = false, embedded = false }) {
  const [step, setStep] = useState(passwordFallback ? 'password' : 'email');
  const [f, setF] = useState({ email: '', first: '', last: '', company: '', code: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function run(fn) {
    setErr(''); setBusy(true);
    try { await fn(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  const sendCode = (e) => {
    e?.preventDefault();
    run(async () => {
      const body = { email: f.email, as, ...(step === 'register' ? { first: f.first, last: f.last, company: f.company } : {}) };
      const r = await post('/api/auth/start', body);
      if (r.needsRegistration) setStep('register');
      else setStep('code');
    });
  };

  const verify = (e) => {
    e.preventDefault();
    run(async () => { const r = await post('/api/auth/verify', { email: f.email, code: f.code }); window.location.href = r.redirect; });
  };

  const password = (e) => {
    e.preventDefault();
    run(async () => { const r = await post('/api/login', { password: f.password }); window.location.href = r.redirect || '/'; });
  };

  const forms = (
    <>

      {step === 'password' && (
        <form onSubmit={password}>
          <input type="password" placeholder="Admin password" autoFocus required value={f.password} onChange={set('password')} autoComplete="current-password" />
          <button className="btn primary big" style={{ marginTop: 12 }} disabled={busy}>Sign in</button>
          <p className="hint">Email codes are not set up yet, so admins use the password for now.</p>
        </form>
      )}

      {step === 'email' && (
        <form onSubmit={sendCode}>
          <input type="text" inputMode="email" placeholder={as === 'admin' ? 'you@hoteltechreport.com' : 'Work email'} autoFocus required
            value={f.email} onChange={set('email')} autoComplete="email" />
          <button className="btn primary big" style={{ marginTop: 12 }} disabled={busy}>{busy ? 'Sending…' : 'Email me a code'}</button>
        </form>
      )}

      {step === 'register' && (
        <form onSubmit={sendCode}>
          <p className="muted small" style={{ marginTop: 0 }}>Welcome! Tell us who you are. We&apos;ll email a code to <b>{f.email}</b>.</p>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <input type="text" placeholder="First name" required autoFocus value={f.first} onChange={set('first')} autoComplete="given-name" />
            <input type="text" placeholder="Last name" required value={f.last} onChange={set('last')} autoComplete="family-name" />
          </div>
          <input type="text" placeholder="Company name" required value={f.company} onChange={set('company')} autoComplete="organization" style={{ marginTop: 8 }} />
          <p className="hint">We&apos;ll use it to name your project, e.g. &ldquo;Acme Analytics YouTube video&rdquo;.</p>
          <button className="btn primary big" style={{ marginTop: 12 }} disabled={busy}>{busy ? 'Sending…' : 'Email me a code'}</button>
          <button type="button" className="linkbtn" style={{ marginTop: 8 }} onClick={() => setStep('email')}>Use a different email</button>
        </form>
      )}

      {step === 'code' && (
        <form onSubmit={verify}>
          <p className="muted small" style={{ marginTop: 0 }}>We sent a 6-digit code to <b>{f.email}</b>. It expires in 10 minutes.</p>
          <input type="text" inputMode="numeric" autoComplete="one-time-code" placeholder="123456" maxLength={6} autoFocus required
            value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.replace(/\D/g, '') })} className="code-input" />
          <button className="btn primary big" style={{ marginTop: 12 }} disabled={busy || f.code.length !== 6}>Sign in</button>
          <div className="row" style={{ marginTop: 8, justifyContent: 'space-between' }}>
            <button type="button" className="linkbtn" onClick={() => setStep('email')}>Use a different email</button>
            <button type="button" className="linkbtn" onClick={() => sendCode()} disabled={busy}>Send a new code</button>
          </div>
        </form>
      )}

      {err && <div className="alert">{err}</div>}
    </>
  );

  if (embedded) {
    return (
      <div>
        {heading && <div className="signin-title">{heading}</div>}
        {sub && <p className="muted small" style={{ margin: '2px 0 14px' }}>{sub}</p>}
        {forms}
      </div>
    );
  }
  return (
    <main className="login">
      <span className="brand"><span className="mark"><span /></span>Hotel Tech Report</span>
      <h1 style={{ marginTop: 28 }}>{heading}</h1>
      {sub && <p className="sub" style={{ marginBottom: 18 }}>{sub}</p>}
      {forms}
    </main>
  );
}
