'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, Brand, duration, useToast, when } from './ui.js';

export default function Dashboard() {
  const [jobs, setJobs] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');
  const [toast, say] = useToast();

  const load = useCallback(async () => {
    try {
      const [j, c] = await Promise.all([api('/api/jobs'), api('/api/companies')]);
      setJobs(j.jobs); setCompanies(c.companies); setError('');
    } catch (e) { setError(e.message); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!jobs?.some((j) => j.status === 'processing')) return;
    const t = setTimeout(load, 15000);
    return () => clearTimeout(t);
  }, [jobs, load]);

  const shown = (jobs || []).filter((j) => !filter || j.companySlug === filter);
  const companyOptions = [...new Map((jobs || []).map((j) => [j.companySlug, j.companyName])).entries()];

  return (
    <div className="wrap">
      <header className="top">
        <Brand />
        <div className="row">
          <a className="btn primary" href="/upload">Upload</a>
          <button className="linkbtn" onClick={async () => { await api('/api/logout', { method: 'POST' }); location.href = '/login'; }}>Sign out</button>
        </div>
      </header>

      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <h1>Transcripts</h1>
        {companyOptions.length > 1 && (
          <select style={{ width: 'auto' }} value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">All companies</option>
            {companyOptions.map(([slug, name]) => <option key={slug} value={slug}>{name}</option>)}
          </select>
        )}
      </div>
      {error && <div className="alert">{error}</div>}

      <div className="card">
        {jobs === null ? <div className="empty">Loading…</div> : shown.length === 0 ? (
          <div className="empty">No transcripts yet. Upload a video, or send a client their upload link below.</div>
        ) : (
          <table>
            <thead><tr><th>File</th><th className="hide-sm">Company</th><th>Uploaded</th><th className="hide-sm">Length</th><th>Status</th></tr></thead>
            <tbody>
              {shown.map((j) => (
                <tr key={j.id} className="click" onClick={() => { location.href = `/jobs/${j.id}`; }}>
                  <td className="name" title={j.filename}>{j.filename}</td>
                  <td className="hide-sm">{j.companyName}{j.source === 'client' ? <span className="muted small"> · client</span> : null}</td>
                  <td className="muted">{when(j.createdAt)}</td>
                  <td className="hide-sm muted">{j.duration ? duration(j.duration) : '—'}</td>
                  <td><span className={`pill ${j.status}`}>{j.status === 'processing' ? 'Transcribing' : j.status === 'done' ? 'Ready' : 'Failed'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Companies companies={companies} reload={load} say={say} />
      {toast}
    </div>
  );
}

function Companies({ companies, reload, say }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const origin = typeof window === 'undefined' ? '' : window.location.origin;

  async function add(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try { await api('/api/companies', { method: 'POST', body: { name } }); setName(''); await reload(); say('Company added'); }
    catch (err) { say(err.message); } finally { setBusy(false); }
  }

  return (
    <>
      <h2>Client upload links</h2>
      <p className="muted small" style={{ marginTop: -6 }}>
        Each company gets its own private link. Clients only see their own company name and can only upload; they never see transcripts or other clients.
      </p>
      <div className="card">
        {companies.map((c) => <CompanyRow key={c.slug} c={c} origin={origin} reload={reload} say={say} />)}
        <form className="company row" onSubmit={add}>
          <input type="text" style={{ flex: 1, minWidth: 200 }} placeholder="New company name" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn" disabled={busy}>Add company</button>
        </form>
      </div>
    </>
  );
}

function CompanyRow({ c, origin, reload, say }) {
  const [open, setOpen] = useState(false);
  const [terms, setTerms] = useState((c.keyterms || []).join(', '));
  const link = `${origin}/u/${c.token}`;

  const patch = async (body, msg) => {
    try { await api(`/api/companies/${c.slug}`, { method: 'PATCH', body }); await reload(); say(msg); } catch (e) { say(e.message); }
  };

  return (
    <div className="company">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 500 }}>{c.name}</div>
          <div className="link">{link}</div>
        </div>
        <div className="row">
          <button className="btn" onClick={() => navigator.clipboard.writeText(link).then(() => say('Link copied'))}>Copy link</button>
          <button className="linkbtn" onClick={() => setOpen(!open)}>{open ? 'Close' : 'Edit'}</button>
        </div>
      </div>
      {open && (
        <div style={{ marginTop: 12 }}>
          <label className="field" style={{ marginTop: 0 }}>
            <span>Spelling hints for this company</span>
            <textarea value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="Product names, executives' names, acronyms. Comma separated." />
            <div className="hint">Used on every video for this company. Only list terms that are actually said; a listed term can occasionally appear where it wasn&apos;t spoken.</div>
          </label>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn primary" onClick={() => patch({ keyterms: terms }, 'Saved')}>Save terms</button>
            <button className="btn" onClick={() => { if (confirm('Make a new link? The current link will stop working.')) patch({ newLink: true }, 'New link created'); }}>New link</button>
            <button className="btn danger" onClick={async () => {
              if (!confirm(`Remove ${c.name}? Their link stops working. Existing transcripts are kept.`)) return;
              try { await api(`/api/companies/${c.slug}`, { method: 'DELETE' }); await reload(); } catch (e) { say(e.message); }
            }}>Remove</button>
          </div>
        </div>
      )}
    </div>
  );
}
