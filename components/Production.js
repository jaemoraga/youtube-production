'use client';
// Everything after the script is locked: the raw footage (HTR and the editor), the two Frame.io cuts the
// client reviews, the shot clocks, and HTR's controls over them (close early, extend quietly).
// role: 'admin' | 'client' | 'editor'. act(action, okMessage) posts to /api/projects/<id>.
import { useEffect, useState } from 'react';
import { STAGE, WINDOW_LABEL, activeWindow, daysLeft, stageOf, windowClosed, windowOpen } from '@/lib/stages.js';
import { when } from './ui.js';

// A deadline in the reader's own time zone. Rendered only in the browser so server and client agree.
export function Deadline({ at }) {
  const [t, setT] = useState('');
  useEffect(() => { setT(new Date(at).toLocaleString(undefined, { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })); }, [at]);
  return <span suppressHydrationWarning>{t}</span>;
}

// The countdown. Ticks every minute; turns amber under 2 days and red under 1.
export function ShotClock({ window: w, label, compact = false }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60e3); return () => clearInterval(t); }, []);
  if (!w?.deadline) return null;
  if (windowClosed(w, now)) return <div className={`clock closed${compact ? ' compact' : ''}`}><b>Closed.</b> {w.closedBy === 'client' ? 'Feedback received.' : `The ${label} window has ended.`}</div>;
  const left = daysLeft(w, now);
  const d = Math.floor(left); const h = Math.floor((left - d) * 24); const m = Math.floor(((left - d) * 24 - h) * 60);
  const tone = left < 1 ? 'urgent' : left < 2 ? 'soon' : '';
  return (
    <div className={`clock ${tone}${compact ? ' compact' : ''}`}>
      <div className="clock-num" suppressHydrationWarning>{d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`}</div>
      <div className="clock-text">left to {label}. Closes <Deadline at={w.deadline} />.</div>
    </div>
  );
}

const CLIENT_WORD = { script: 'send your script edit requests', v1: 'leave feedback on the first cut', v2: 'leave your final feedback' };

// ---------------------------------------------------------------- client
export function ClientProduction({ p, act, preview }) {
  const st = stageOf(p);
  const order = STAGE[st].order;
  if (order < STAGE['script-client'].order) return null;
  const active = activeWindow(p);
  const round = st === 'v1-client' || st === 'v1-revisions' ? 'v1' : st === 'v2-client' || st === 'final-revisions' ? 'v2' : null;
  return (
    <section className="card step st-border-submitted" style={{ marginTop: 12 }}>
      <header className="step-head">
        <span className={`num ${st === 'complete' ? 'st-approved' : 'st-submitted'}`}>{st === 'complete' ? '✓' : 5}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="step-title">Your video</div>
          <div className="muted small">{
            st === 'shooting' || st === 'script-revisions' ? 'Your script is with us. We will let you know when the first cut is ready.'
              : st === 'editing' ? 'Filmed. Your first cut is being edited.'
                : st === 'v1-client' ? 'The first cut is ready. Watch it and leave every comment on the video itself.'
                  : st === 'v1-revisions' ? 'We have your first-cut feedback and are working on the next version.'
                    : st === 'v2-client' ? 'The updated cut is ready. This is the final round of feedback.'
                      : st === 'final-revisions' ? 'Final changes are being made.'
                        : st === 'complete' ? 'Complete. Thank you!' : ''
          }</div>
        </div>
      </header>
      {(st === 'v1-client' || st === 'v2-client') && (
        <div className="step-body">
          <ShotClock window={active.window} label={CLIENT_WORD[active.key]} />
          <p className="small" style={{ margin: '12px 0' }}>Leave all your feedback as comments on the video. When everything is in, tell us here so the editor can start.</p>
          <div className="row">
            <a className="btn primary" href={preview ? undefined : p[round].url} target="_blank" rel="noreferrer">Open the {round === 'v1' ? 'first' : 'final'} cut</a>
            <button className="btn ok" disabled={!windowOpen(active.window)} onClick={() => window.confirm('Confirm that all your feedback is on the video? The editor will start implementing it and this round will close.') && act({ type: 'cut.done', round }, 'Thank you. The editor has been told.')}>My feedback is complete</button>
          </div>
        </div>
      )}
      {(st === 'v1-revisions' || st === 'final-revisions') && p[round]?.url && (
        <div className="step-body"><a className="linkbtn" href={p[round].url} target="_blank" rel="noreferrer">Open the {round === 'v1' ? 'first' : 'final'} cut</a></div>
      )}
      {st === 'complete' && p.finalUrl && <div className="step-body"><a className="btn primary" href={p.finalUrl} target="_blank" rel="noreferrer">Watch the finished video</a></div>}
    </section>
  );
}

// ---------------------------------------------------------------- admin and editor
function LinkForm({ label, hint, value, onSave, button = 'Save', disabled = false, confirm = null }) {
  const [url, setUrl] = useState(value || '');
  const [editing, setEditing] = useState(!value);
  useEffect(() => { setUrl(value || ''); setEditing(!value); }, [value]);
  if (value && !editing) {
    return <div className="row" style={{ marginTop: 6 }}><a href={value} target="_blank" rel="noreferrer" style={{ wordBreak: 'break-all' }}>{value}</a><button className="linkbtn" onClick={() => setEditing(true)}>Change</button></div>;
  }
  return (
    <div style={{ marginTop: 6 }}>
      <div className="row">
        <input type="url" style={{ flex: 1, minWidth: 240 }} placeholder={hint} value={url} onChange={(e) => setUrl(e.target.value)} disabled={disabled} />
        <button className="btn primary" disabled={disabled || !/^https:\/\//.test(url.trim())} onClick={async () => { if (confirm && !window.confirm(confirm)) return; if (await onSave(url.trim())) setEditing(false); }}>{button}</button>
        {value && <button className="linkbtn" onClick={() => { setUrl(value); setEditing(false); }}>Cancel</button>}
      </div>
      {label && <div className="hint">{label}</div>}
    </div>
  );
}

function Extend({ p, keyName, act }) {
  const [days, setDays] = useState(3);
  const [note, setNote] = useState('');
  const [tell, setTell] = useState(false);
  const [open, setOpen] = useState(false);
  const w = p[keyName]?.window;
  if (!w?.deadline || (w.closedAt && w.closedBy !== 'clock')) return null;
  return (
    <div style={{ marginTop: 10 }}>
      <button className="linkbtn" onClick={() => setOpen(!open)}>{open ? 'Cancel' : 'Give them more time'}</button>
      {open && (
        <div className="callout" style={{ marginTop: 8 }}>
          <div className="row">
            <label className="row" style={{ gap: 6 }}>Add <input type="number" min={1} max={30} style={{ width: 64 }} value={days} onChange={(e) => setDays(Number(e.target.value))} /> days</label>
            <input type="text" style={{ flex: 1, minWidth: 160 }} placeholder="Why (HTR only)" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <label className="row small" style={{ gap: 6, marginTop: 8 }}><input type="checkbox" checked={tell} onChange={(e) => setTell(e.target.checked)} /> Send the client a reminder with the new closing date (it reads as an ordinary reminder, not an extension)</label>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn primary" disabled={!(days > 0)} onClick={async () => { if (await act({ type: 'window.extend', window: keyName, days, note, notifyClient: tell }, `Deadline moved ${days} day${days === 1 ? '' : 's'}`)) { setOpen(false); setNote(''); setTell(false); } }}>Move the deadline</button>
            <span className="muted small">The client sees the new date on their shot clock and nothing else. Logged in the timeline for HTR only.</span>
          </div>
        </div>
      )}
      {!!w.extensions?.length && <div className="muted small" style={{ marginTop: 6 }}>Extended {w.extensions.length}×: {w.extensions.map((x) => `+${x.days}d on ${when(x.at)}${x.by ? ` by ${x.by.split('@')[0]}` : ''}${x.note ? ` (${x.note})` : ''}`).join('; ')}</div>}
    </div>
  );
}

function WindowRow({ p, keyName, act, admin }) {
  const w = p[keyName]?.window;
  if (!w?.deadline) return null;
  const closed = windowClosed(w);
  return (
    <div style={{ marginTop: 8 }}>
      <ShotClock window={w} label={CLIENT_WORD[keyName]} compact />
      {!closed && <div className="muted small" style={{ marginTop: 4 }}>Reminders sent: {Object.keys(w.reminders || {}).map(Number).sort((a, b) => b - a).map((t) => (t === 0.5 ? '12h' : `${t}d`)).join(', ') || 'none'}. Opened {when(w.openedAt)}.</div>}
      {closed && w.closedAt && <div className="muted small" style={{ marginTop: 4 }}>Closed {when(w.closedAt)} by {w.closedBy === 'client' ? 'the client' : w.closedBy === 'clock' ? 'the clock' : 'Hotel Tech Report'}.</div>}
      {admin && !closed && <button className="linkbtn" style={{ marginTop: 6 }} onClick={() => window.confirm(`Close the ${WINDOW_LABEL[keyName]} window now? The client can no longer comment and the next step opens.`) && act({ type: 'window.close', window: keyName }, 'Window closed')}>Close the window now</button>}
      {admin && <Extend p={p} keyName={keyName} act={act} />}
    </div>
  );
}

export function StaffProduction({ p, act, role }) {
  const admin = role === 'admin';
  const st = stageOf(p);
  const o = STAGE[st].order;
  const at = (k) => STAGE[k].order;
  const scriptLocked = !!p.script?.lockedAt;
  const v1Closed = !!p.v1?.doneAt || (p.v1?.window && !windowOpen(p.v1.window));
  const row = (n, title, sub, body, state) => (
    <section className={`card step st-border-${state}`} style={{ marginTop: 12 }}>
      <header className="step-head">
        <span className={`num st-${state}`}>{state === 'approved' ? '✓' : n}</span>
        <div style={{ flex: 1, minWidth: 0 }}><div className="step-title">{title}</div>{sub && <div className="muted small">{sub}</div>}</div>
      </header>
      {body && <div className="step-body">{body}</div>}
    </section>
  );
  const stateOf = (done, active) => (done ? 'approved' : active ? 'submitted' : 'todo');
  return (
    <>
      <h2 className="section-title" style={{ marginTop: 32 }}>Production</h2>
      <p className="muted small" style={{ marginTop: -6 }}>
        {admin ? 'The editor can do these steps from the editor view too. Links to the raw footage are never shown to the client.' : 'Paste each link here as it is ready. Pasting a Frame.io link sends it to the client and starts their feedback window; you are emailed when their feedback is in or the window closes.'}
      </p>

      {admin && row(1, 'Script', scriptLocked ? `Locked for filming ${when(p.script.lockedAt)}${p.script.lockedBy === 'client' ? ' (approved by the client)' : ''}.` : p.script?.releasedAt ? 'Released to the client.' : 'Not released yet. Release it from the script page.',
        <>
          {p.script?.window && <WindowRow p={p} keyName="script" act={act} admin={admin} />}
          {!scriptLocked && p.script?.releasedAt && <div className="row" style={{ marginTop: 10 }}><button className="btn ok" onClick={() => window.confirm('Lock the script for filming? The client is told their requests are in and the project moves to Shooting.') && act({ type: 'script.lock' }, 'Script locked')}>Revisions implemented: lock the script</button><span className="muted small">Do this once Implement revisions is through and you have released the final version.</span></div>}
          {scriptLocked && !p.footage?.url && p.script.lockedBy !== 'client' && <button className="linkbtn" onClick={() => window.confirm('Unlock the script? The project goes back to Script revisions.') && act({ type: 'stage.reopen', what: 'lock' }, 'Unlocked')}>Unlock</button>}
        </>, stateOf(scriptLocked, o >= at('script-client')))}

      {row(admin ? 2 : 1, 'Raw footage', p.footage?.url ? `Attached ${when(p.footage.addedAt)}${p.footage.by?.role === 'editor' ? ' by the editor' : ''}. HTR and the editor only.` : scriptLocked ? 'Filmed? Paste the link to the raw footage (a Google Drive folder, usually).' : 'Available once the script is locked.',
        <>
          <LinkForm value={p.footage?.url} hint="https://drive.google.com/…" label="Google Drive, Dropbox or any https link. The client never sees it." disabled={!scriptLocked} button="Attach footage" onSave={(url) => act({ type: 'footage.set', url }, 'Footage attached. The editor has been emailed.')} />
          {admin && p.footage?.url && !p.v1?.url && <button className="linkbtn" style={{ marginTop: 6 }} onClick={() => window.confirm('Remove the raw footage link? The project goes back to Shooting.') && act({ type: 'stage.reopen', what: 'footage' }, 'Removed')}>Remove</button>}
        </>, stateOf(!!p.footage?.url, o >= at('shooting')))}

      {row(admin ? 3 : 2, 'First cut (V1)', p.v1?.url ? (p.v1.doneAt ? `Client feedback complete ${when(p.v1.doneAt)}.` : windowOpen(p.v1.window) ? 'With the client for feedback.' : 'Feedback window closed.') : p.footage?.url ? 'Paste the Frame.io link to send it to the client. They get 7 days to comment on the video.' : 'Available once the footage is attached.',
        <>
          <LinkForm value={p.v1?.url} hint="https://f.io/… or https://app.frame.io/…" label={p.v1?.url ? '' : 'Sending it emails the client and starts a 7-day feedback window with reminders at 5, 3 and 1 days.'} disabled={!p.footage?.url} button="Send V1 to the client" confirm={p.v1?.url ? null : 'Send the first cut to the client now? This emails them and starts their 7-day feedback window.'} onSave={(url) => act({ type: 'cut.set', round: 'v1', url }, p.v1?.url ? 'Link updated' : 'Sent. The client has been emailed.')} />
          {p.v1?.url && <WindowRow p={p} keyName="v1" act={act} admin={admin} />}
          {admin && p.v1?.url && !p.v2?.url && <button className="linkbtn" style={{ marginTop: 6 }} onClick={() => window.confirm('Remove the first cut? Its feedback window is discarded and the project goes back to Editing.') && act({ type: 'stage.reopen', what: 'v1' }, 'Removed')}>Remove</button>}
        </>, stateOf(v1Closed, o >= at('v1-client')))}

      {row(admin ? 4 : 3, 'Final cut (V2)', p.v2?.url ? (p.v2.doneAt ? `Client feedback complete ${when(p.v2.doneAt)}.` : windowOpen(p.v2.window) ? 'With the client for final feedback.' : 'Final feedback window closed.') : v1Closed ? 'V1 feedback is in. Cut V2, then paste its Frame.io link: the client gets 3 days for the last round.' : 'Available once the first-cut feedback is in.',
        <>
          <LinkForm value={p.v2?.url} hint="https://f.io/… or https://app.frame.io/…" label={p.v2?.url ? '' : 'Sending it emails the client and starts a 3-day final window with reminders at 1 day and 12 hours.'} disabled={!v1Closed} button="Send V2 to the client" confirm={p.v2?.url ? null : 'Send the final cut to the client now? This emails them and starts their 3-day window.'} onSave={(url) => act({ type: 'cut.set', round: 'v2', url }, p.v2?.url ? 'Link updated' : 'Sent. The client has been emailed.')} />
          {p.v2?.url && <WindowRow p={p} keyName="v2" act={act} admin={admin} />}
          {admin && p.v2?.url && !p.completedAt && <button className="linkbtn" style={{ marginTop: 6 }} onClick={() => window.confirm('Remove the final cut? Its window is discarded and the project goes back to V1 revisions.') && act({ type: 'stage.reopen', what: 'v2' }, 'Removed')}>Remove</button>}
        </>, stateOf(!!p.v2?.doneAt || (p.v2?.window && !windowOpen(p.v2.window)), o >= at('v2-client')))}

      {row(admin ? 5 : 4, 'Complete', p.completedAt ? `Marked complete ${when(p.completedAt)}${p.completedBy?.role === 'editor' ? ' by the editor' : ''}.` : st === 'final-revisions' ? 'Final feedback is in. Once it is implemented, mark the project complete.' : 'Available after the final feedback round.',
        <>
          {!p.completedAt && <Complete disabled={st !== 'final-revisions'} act={act} />}
          {p.completedAt && p.finalUrl && <a href={p.finalUrl} target="_blank" rel="noreferrer">{p.finalUrl}</a>}
          {admin && p.completedAt && <div><button className="linkbtn" style={{ marginTop: 6 }} onClick={() => window.confirm('Reopen the project? It goes back to Final revisions.') && act({ type: 'stage.reopen', what: 'complete' }, 'Reopened')}>Reopen</button></div>}
        </>, stateOf(!!p.completedAt, st === 'final-revisions'))}
    </>
  );
}

function Complete({ disabled, act }) {
  const [url, setUrl] = useState('');
  return (
    <div className="row" style={{ marginTop: 6 }}>
      <input type="url" style={{ flex: 1, minWidth: 240 }} placeholder="Link to the finished video (optional)" value={url} onChange={(e) => setUrl(e.target.value)} disabled={disabled} />
      <button className="btn ok" disabled={disabled} onClick={() => window.confirm('Mark this project complete? The client is emailed that their video is done.') && act({ type: 'complete', url: url.trim() || undefined }, 'Complete')}>Mark complete</button>
    </div>
  );
}
