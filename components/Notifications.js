'use client';
// The audit trail: every email the app sent the client and what happened to it, plus the client's
// sign-ins and page views. For the day a client says "nobody told me".
import { useEffect, useState } from 'react';
import { api, when } from './ui.js';

const TONE = { clicked: 'st-approved', opened: 'st-approved', delivered: 'st-submitted', sent: 'st-todo', bounced: 'st-changes', 'marked as spam': 'st-changes' };

export default function Notifications({ projectId }) {
  const [log, setLog] = useState(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { if (open && !log) api(`/api/projects/${projectId}/notifications`).then(setLog).catch(() => setLog({ emails: [], visits: [], error: true })); }, [open, log, projectId]);
  return (
    <details className="card pad" style={{ marginTop: 12 }} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary><span className="step-title">Notifications and visits</span> <span className="muted small">· the audit trail for this client</span></summary>
      <p className="muted small">Each client email with what the mail service reported back, and every sign-in and page view from the client. Sign-ins and page views are recorded by this app and are the firm evidence; opens come from a tracking pixel and can be missed or triggered by a mail app, and clicks can come from a security scanner.</p>
      {!log ? <div className="muted small">Loading…</div> : (
        <>
          <div className="step-title small" style={{ marginTop: 12 }}>Emails to the client ({log.emails.length})</div>
          {log.emails.length === 0 && <div className="muted small">None yet. Emails sent before this trail existed are not listed.</div>}
          {log.emails.length > 0 && (
            <table className="small">
              <thead><tr><th>Sent</th><th>Subject</th><th className="hide-sm">To</th><th>Status</th><th className="hide-sm">Detail</th></tr></thead>
              <tbody>
                {log.emails.map((e, i) => (
                  <tr key={e.id || i}>
                    <td className="muted" style={{ whiteSpace: 'nowrap' }}>{when(e.at)}</td>
                    <td>{e.subject}</td>
                    <td className="hide-sm muted">{e.to.join(', ')}</td>
                    <td><span className={`pill ${TONE[e.status] || 'st-todo'}`}>{e.status}</span></td>
                    <td className="hide-sm muted">{e.events.map((x, j) => <div key={j}>{x.type} {when(x.at)}{x.link ? ` · ${x.link.replace(/^https?:\/\//, '').slice(0, 50)}` : ''}</div>)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="step-title small" style={{ marginTop: 16 }}>Client sign-ins and page views ({log.visits.length})</div>
          {log.visits.length === 0 ? <div className="muted small">None recorded yet.</div> : (
            <ul className="timeline">{log.visits.map((v, i) => <li key={i}><span className="muted small">{when(v.at)}</span> · {v.email || 'client'} · {v.page}</li>)}</ul>
          )}
        </>
      )}
    </details>
  );
}
