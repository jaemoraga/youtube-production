'use client';
// The script screen. role="admin": generate, read, edit, approve for the client, implement revisions.
// role="client": read the approved script, comment on any paragraph, send feedback or approve.
import { useEffect, useRef, useState } from 'react';
import { api, download, useToast } from './ui.js';

const HEADING = /^\[[A-Z][A-Z &/\-]{2,40}\]$/;
const paragraphsOf = (text) => String(text || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
// Dates are only formatted in the browser, so the server and the browser never disagree on time zone.
function When({ at }) {
  const [t, setT] = useState('');
  useEffect(() => { setT(new Date(at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })); }, [at]);
  return <span suppressHydrationWarning>{t}</span>;
}
const STATUS = {
  open: ['Waiting for Hotel Tech Report', 'st-submitted'], implemented: ['Updated in the script', 'st-approved'],
  declined: ['Answered', 'st-todo'], 'needs-decision': ['Needs your decision', 'st-changes'],
  drafted: ['Drafted, not sent to the client', 'st-changes'],
};

export default function ScriptView({ projectId, project, role, initial, ai = null, suggestedWebsite = '' }) {
  const admin = role === 'admin';
  const [script, setScript] = useState(initial);
  const [toast, say] = useToast();
  const [busy, setBusy] = useState('');
  const [problem, setProblem] = useState('');
  const url = `/api/projects/${projectId}/script`;

  const post = async (body, ok) => {
    setProblem('');
    try {
      const d = await api(url, { method: 'POST', body });
      setScript(d.script);
      if (ok) say(typeof ok === 'function' ? ok(d) : ok);
      return d;
    } catch (e) { setProblem(e.message); return null; }
  };

  // Generation runs one step per request; the page asks for the next one until all are written.
  const looping = useRef(false);
  const writeAll = async () => {
    if (looping.current) return;
    looping.current = true; setBusy('writing'); setProblem('');
    try {
      for (;;) {
        const d = await api(url, { method: 'POST', body: { type: 'step' } });
        setScript(d.script);
        if (!d.script || d.script.steps.every((s) => s.status === 'done')) break;
      }
      say('Script written');
    } catch (e) { setProblem(e.message); try { setScript((await api(url)).script); } catch { /* keep what we have */ } }
    looping.current = false; setBusy('');
  };

  return (
    <div className="script-stack">
      {admin
        ? <AdminScript {...{ script, project, ai, busy, setBusy, post, writeAll, say, suggestedWebsite, projectId }} />
        : <ClientScript {...{ script, project, busy, setBusy, post, say }} />}
      {problem && <div className="callout script-problem"><b>That didn&apos;t work.</b> {problem}</div>}
      {toast}
    </div>
  );
}

// ---------------------------------------------------------------- admin
function AdminScript({ script, project, ai, busy, setBusy, post, writeAll, say, suggestedWebsite, projectId }) {
  const [website, setWebsite] = useState(suggestedWebsite);
  const [editing, setEditing] = useState(null);
  const steps = script?.steps || [];
  const done = steps.filter((s) => s.status === 'done').length;
  const v = script?.versions?.[script.versions.length - 1] || null;
  const run = async (key, body, ok) => { setBusy(key); const d = await post(body, ok); setBusy(''); return d; };
  const regenerate = async () => { if (window.confirm('Regenerate the script from scratch with the current writing process? The current script and its steps are archived, not deleted. Takes 5 to 10 minutes; keep this page open.') && await run('regenerate', { type: 'regenerate' })) writeAll(); };

  if (!script) {
    return (
      <section className="card pad">
        <div className="step-title">Generate the script</div>
        <p className="muted small" style={{ marginTop: 0 }}>
          Plans the video first (hook, case study, the three to five workflows worth showing), writes the seven sections one at a time
          to a word budget, assembles and edits them for spoken delivery, has the draft scored independently, then makes targeted fixes.
          It reads the client&apos;s dossier, the internal dossier and the demo transcript. Takes about 5 to 10 minutes. Keep this page open.
        </p>
        {!project.ready && <div className="callout" style={{ margin: '10px 0' }}>{project.blocker}</div>}
        {!ai?.ready && <div className="callout" style={{ margin: '10px 0' }}>The AI writer is not connected yet. Add your OpenAI key as <b>OPENAI_API_KEY</b> in Vercel (Settings, Environment Variables) and redeploy. Nothing else is needed.</div>}
        <label className="small muted" htmlFor="site">Vendor website, read for the platform overview step</label>
        <div className="row" style={{ flexWrap: 'nowrap', marginTop: 4 }}>
          <input id="site" type="text" placeholder="https://www.vendor.com" value={website} onChange={(e) => setWebsite(e.target.value)} />
          <button className="btn primary" disabled={!!busy || !ai?.ready || !project.ready}
            onClick={async () => { if (await run('start', { type: 'start', website })) writeAll(); }}>
            {busy ? 'Starting…' : 'Generate script'}
          </button>
        </div>
        <p className="hint">Nothing is shown to the client until you approve it.</p>
      </section>
    );
  }

  const writing = busy === 'writing';
  const open = script.comments.filter((c) => c.status === 'open');
  const held = script.comments.filter((c) => c.status === 'needs-decision');
  const drafted = script.comments.filter((c) => c.status === 'drafted');
  const sharedV = script.shared?.version || null;

  return (
    <>
      {!v && (
        <section className="card pad">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div className="step-title">{writing ? 'Writing the script…' : 'Script not finished'}</div>
            <span className="pill st-submitted">{done} of {steps.length} steps</span>
          </div>
          <ol className="script-steps">
            {steps.map((s, i) => {
              const now = writing && i === done;
              return <li key={s.key} className={s.status === 'done' ? 'ok' : now ? 'now' : s.status === 'error' ? 'bad' : ''}>
                <span>{s.title}</span>
                <span className="muted small">{s.status === 'done' ? `done${s.ms ? ` in ${Math.round(s.ms / 1000)}s` : ''}` : now ? 'writing…' : s.status === 'error' ? 'stopped' : ''}</span>
              </li>;
            })}
          </ol>
          {script.previous && <p className="hint">Regenerating. The previous script ran {script.previous.words.toLocaleString('en-US')} spoken words{script.previous.draftScore ? ` and its draft scored ${script.previous.draftScore}/100` : ''}; it is archived.</p>}
          {!writing && <div className="row">{script.currentProcess ? <button className="btn primary" onClick={writeAll}>Continue writing</button> : <button className="btn primary" disabled={!!busy || !ai?.ready} onClick={regenerate}>Regenerate script</button>}
            <button className="linkbtn" onClick={() => window.confirm('Throw away what has been written and start over?') && run('reset', { type: 'reset' })}>Start over</button></div>}
          {writing && <p className="hint">Keep this page open. If you close it, come back and click Continue writing; finished steps are kept.</p>}
        </section>
      )}

      {v && (
        <>
          <section className={`card pad script-share ${sharedV ? 'on' : ''}`}>
            <div>
              <div className="step-title">
                {script.client?.approvedAt ? 'Approved by the client. Locked for filming.'
                  : drafted.length ? `Revisions are drafted. The client still sees version ${sharedV}.`
                    : sharedV ? `The client can see version ${sharedV}` : 'Not shown to the client'}
              </div>
              <div className="muted small">
                {script.client?.approvedAt ? <>Approved <When at={script.client.approvedAt} />{script.client.approvedBy ? ` by ${script.client.approvedBy}` : ''}.</>
                  : drafted.length ? `Nothing has been sent. Read version ${v.n} and the ${drafted.length === 1 ? 'reply' : `${drafted.length} replies`} below, change anything you like, then approve to send the script and the replies together.`
                  : sharedV ? <>Shared <When at={script.shared.at} />. {sharedV < v.n ? `You have a newer version (${v.n}) they have not seen.` : 'They can comment on any paragraph.'}</>
                    : 'Read it, edit anything you like, then approve it. The client is emailed a link when you do.'}
              </div>
            </div>
            <div className="row">
              {(!sharedV || sharedV < v.n || drafted.length > 0) && <button className="btn ok" disabled={!!busy} onClick={() => run('share', { type: 'share' }, 'Shared. The client was emailed.')}>{drafted.length ? 'Approve and send revisions to client' : sharedV ? `Show version ${v.n} to the client` : 'Approve and show to client'}</button>}
              {sharedV && !script.client?.approvedAt && <button className="linkbtn" disabled={!!busy} onClick={() => run('unshare', { type: 'unshare' }, 'Hidden from the client')}>Hide from client</button>}
              {!sharedV && !script.client?.approvedAt && <button className="btn" disabled={!!busy || !ai?.ready} title="Write the whole script again with the current process. The current one is archived." onClick={regenerate}>{busy === 'regenerate' ? 'Starting…' : 'Regenerate script'}</button>}
            </div>
          </section>

          {(open.length > 0 || held.length > 0 || drafted.length > 0) && (
            <section className="card pad">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div>
                  <div className="step-title">Client feedback</div>
                  <div className="muted small">
                    {open.length ? `${open.length} new ${open.length === 1 ? 'comment' : 'comments'}${script.client?.submittedAt ? ', sent for review' : ', not sent yet (the client is still commenting)'}.` : 'No new comments.'}
                    {drafted.length ? ` ${drafted.length} worked into version ${v.n}, waiting for your review.` : ''}
                    {held.length ? ` ${held.length} waiting on your decision.` : ''}
                  </div>
                </div>
                {open.length > 0 && <button className="btn primary" disabled={!!busy} onClick={() => run('revise', { type: 'revise' }, (d) => `Done. ${d.implemented} drafted, ${d.held} held for you. Nothing was sent.`)}>{busy === 'revise' ? 'Working through comments…' : 'Implement revisions'}</button>}
              </div>
              {open.length > 0 && <p className="hint">Straightforward requests are worked into a new draft with a reply written for each. Anything that touches the editorial side is held for your decision. You are emailed when it is done, and nothing goes to the client until you approve it.</p>}
              {drafted.map((c) => <Drafted key={c.id} c={c} busy={busy} run={run} />)}
              {held.map((c) => <Decision key={c.id} c={c} busy={busy} run={run} />)}
            </section>
          )}

          <Quality script={script} v={v} />

          <section className="card pad">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div className="step-title">Script <span className="muted" style={{ fontWeight: 400 }}>· version {v.n} · {v.source === 'generated' ? 'as written' : v.source === 'revision' ? 'after client revisions' : 'edited by you'} · {v.text.split(/\s+/).length.toLocaleString('en-US')} words</span></div>
              <div className="row">
                {editing === null && !script.client?.approvedAt && <button className="btn" onClick={() => setEditing(v.text)}>Edit</button>}
                <button className="btn" onClick={async () => { await navigator.clipboard.writeText(v.text); say('Copied'); }}>Copy</button>
                <button className="btn" onClick={() => download(`${project.fileStem} script v${v.n}.txt`, new Blob([v.text], { type: 'text/plain' }))}>TXT</button>
                <button className="btn" onClick={() => docx(project, v)}>Word</button>
              </div>
            </div>
            {editing !== null ? (
              <>
                <textarea className="script-edit" value={editing} onChange={(e) => setEditing(e.target.value)} />
                <div className="row">
                  <button className="btn primary" disabled={!!busy} onClick={async () => { if (await run('edit', { type: 'edit', text: editing }, 'Saved as a new version')) setEditing(null); }}>Save as new version</button>
                  <button className="linkbtn" onClick={() => setEditing(null)}>Cancel</button>
                  {sharedV && <span className="hint" style={{ margin: 0 }}>The client keeps seeing version {sharedV} until you show them the new one.</span>}
                </div>
              </>
            ) : <Paragraphs text={v.text} comments={script.comments} version={v.n} admin />}
          </section>

          {v.editorNotes && (
            <details className="card pad script-how">
              <summary>Editor directions <span className="muted">· for your video editor, never shown to the client</span></summary>
              <pre className="script-notes">{v.editorNotes}</pre>
            </details>
          )}

          <Earlier comments={script.comments} version={v.n} admin />

          <details className="card pad script-how">
            <summary>How it was written <span className="muted">· {steps.length} steps · {script.model}</span></summary>
            <p className="muted small">Each step&apos;s full answer, including its grade and critique. {script.websiteRead ? `The website ${script.website} was read for the platform overview.` : 'The vendor website could not be read, so the platform overview used the dossiers and transcript.'}</p>
            {steps.map((s) => (
              <details key={s.key} className="script-step">
                <summary>{s.title}</summary>
                <pre>{s.output}</pre>
                {!sharedV && script.currentProcess && <button className="linkbtn" disabled={!!busy} onClick={async () => { if (window.confirm(`Write "${s.title}" and every step after it again? The current script is replaced.`) && await run('redo', { type: 'redo', key: s.key })) writeAll(); }}>Write this step and everything after it again</button>}
              </details>
            ))}
            {!sharedV && <button className="linkbtn" disabled={!!busy} onClick={() => window.confirm('Delete this script and start over?') && run('reset', { type: 'reset' })}>Start over</button>}
          </details>
        </>
      )}
    </>
  );
}

function Drafted({ c, busy, run }) {
  const [reply, setReply] = useState(c.draftReply || '');
  return (
    <div className="decision">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <b>{c.by?.name || 'Client'}</b>
        <span className="pill st-approved">Worked into the draft</span>
      </div>
      {(c.quote || c.paraText) && <blockquote>{c.quote || c.paraText}</blockquote>}
      <div className="msg-text">{c.text}</div>
      {c.change && <div className="decision-rec" style={{ background: 'var(--ok-soft)' }}><b>What changed.</b> {c.change}</div>}
      <label className="small muted">Reply the client will get when you approve</label>
      <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={2} />
      {reply.trim() !== (c.draftReply || '') && <button className="btn" disabled={!!busy || !reply.trim()} onClick={() => run(`draft-${c.id}`, { type: 'draft-reply', id: c.id, text: reply }, 'Reply saved')}>Save reply</button>}
    </div>
  );
}

// Length against budget, the independent score of the draft, and the app's own checks.
function Quality({ script, v }) {
  const a = script.analysis;
  if (!a?.sections?.length) return null;
  const before = v.draft?.sections || [];
  return (
    <section className="card pad">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="step-title">Length and quality</div>
        <span className="muted small">{a.words.toLocaleString('en-US')} spoken words · about {a.runtime} at 140 words a minute · budget allows up to {a.target}</span>
      </div>
      <table className="script-budget">
        <thead><tr><th>Section</th><th>Words</th><th>Budget</th>{before.length > 0 && v.source === 'generated' && <th>Before fixes</th>}</tr></thead>
        <tbody>
          {a.sections.map((x, i) => (
            <tr key={i} className={x.over ? 'over' : ''}>
              <td>{x.label}</td><td>{x.words}</td><td>{x.max ? `${x.min} to ${x.max}` : ''}</td>
              {before.length > 0 && v.source === 'generated' && <td className="muted">{before.find((b) => b.id === x.id)?.words ?? ''}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {v.draftScore && <p className="small" style={{ margin: '10px 0 0' }}><b>Independent score of the draft: {v.draftScore}/100.</b> <span className="muted">Scored in a separate conversation before the final fixes, so the finished script should be better than this number. The full scorecard is under How it was written.</span></p>}
      {script.checks.length > 0
        ? <ul className="script-checks">{script.checks.map((c, i) => <li key={i}>{c}</li>)}</ul>
        : <p className="small muted" style={{ margin: '8px 0 0' }}>Checks passed: every section is within budget, no ruled-out phrases, one review count throughout, ends on a verdict or call to action.</p>}
      {!script.currentProcess && <p className="hint">Written with the earlier process. Click Regenerate script at the top to rewrite it with the current one; the old run is kept in the archive.</p>}
      {script.previous && v.source === 'generated' && <p className="small muted" style={{ margin: '8px 0 0' }}>Previous run: {script.previous.words.toLocaleString('en-US')} spoken words{script.previous.draftScore ? `, draft scored ${script.previous.draftScore}/100` : ''}{script.previous.pipeline !== script.pipeline ? ', earlier writing process' : ''}. Archived.</p>}
    </section>
  );
}

function Decision({ c, busy, run }) {
  const [reply, setReply] = useState(c.proposedReply || '');
  return (
    <div className="decision">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <b>{c.by?.name || 'Client'}</b>
        <span className="pill st-changes">{c.category === 'C' ? 'Recommend declining' : 'Needs your approval'}</span>
      </div>
      {(c.quote || c.paraText) && <blockquote>{c.quote || c.paraText}</blockquote>}
      <div className="msg-text">{c.text}</div>
      <div className="decision-rec"><b>Recommendation.</b> {c.recommendation}</div>
      <label className="small muted">Reply to the client</label>
      <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={3} />
      <div className="row">
        <button className="btn" disabled={!!busy || !reply.trim()} onClick={() => run(`reply-${c.id}`, { type: 'reply', id: c.id, text: reply }, 'Reply sent. The script was not changed.')}>Send reply, leave the script</button>
        <button className="btn" disabled={!!busy} onClick={() => run('revise', { type: 'revise', only: c.id }, 'Worked into the draft. Nothing was sent.')}>{busy === 'revise' ? 'Working…' : 'Implement it anyway'}</button>
      </div>
    </div>
  );
}

async function docx(project, v) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import('docx');
  const children = [
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(`${project.product} review script`)] }),
    new Paragraph({ children: [new TextRun({ text: `Hotel Tech Report · version ${v.n}`, color: '6B6F76', size: 18 })] }),
    ...paragraphsOf(v.text).map((p) => (HEADING.test(p)
      ? new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 360 }, children: [new TextRun(p.replace(/[\[\]]/g, ''))] })
      : new Paragraph({ spacing: { before: 200 }, children: p.split('\n').flatMap((line, i) => [...(i ? [new TextRun({ break: 1 })] : []), new TextRun(line)]) }))),
    ...(v.editorNotes ? [
      new Paragraph({ pageBreakBefore: true, heading: HeadingLevel.HEADING_1, children: [new TextRun('Editor directions (not spoken)')] }),
      ...v.editorNotes.split('\n').filter((l) => l.trim()).map((l) => new Paragraph({ spacing: { before: 160 }, children: [new TextRun({ text: l, size: 20 })] })),
    ] : []),
  ];
  const doc = new Document({ styles: { default: { document: { run: { font: 'Calibri', size: 24 } } } }, sections: [{ children }] });
  download(`${project.fileStem} script v${v.n}.docx`, await Packer.toBlob(doc));
}

// ---------------------------------------------------------------- shared pieces
function Thread({ c, admin, onRemove }) {
  const [label, cls] = STATUS[c.status] || STATUS.open;
  return (
    <div className="msg script-comment">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="small"><b>{c.by?.name || 'Client'}</b> <span className="muted">· <When at={c.at} /></span></span>
        <span className={`pill ${cls}`}>{!admin && c.status === 'open' ? 'Sent to Hotel Tech Report' : label}</span>
      </div>
      {c.quote && <blockquote>{c.quote}</blockquote>}
      <div className="msg-text">{c.text}</div>
      {admin && c.status === 'drafted' && c.draftReply && <div className="msg"><div className="small muted">Draft reply, not sent</div><div className="msg-text">{c.draftReply}</div></div>}
      {c.reply && <div className="msg from-htr"><div className="small"><b>Hotel Tech Report</b>{c.replyAt ? <span className="muted"> · <When at={c.replyAt} /></span> : null}</div><div className="msg-text">{c.reply}</div></div>}
      {onRemove && c.status === 'open' && <button className="linkbtn" onClick={() => onRemove(c.id)}>Remove</button>}
    </div>
  );
}

function Paragraphs({ text, comments, version, admin, onComment, onRemove, locked }) {
  const [at, setAt] = useState(null);
  const [draft, setDraft] = useState('');
  const [quote, setQuote] = useState('');
  const startComment = (i) => {
    const sel = typeof window !== 'undefined' ? String(window.getSelection() || '').trim() : '';
    setQuote(sel && paragraphsOf(text)[i].includes(sel) ? sel.slice(0, 600) : ''); setDraft(''); setAt(i);
  };
  return (
    <div className="script-body">
      {paragraphsOf(text).map((p, i) => {
        const mine = comments.filter((c) => c.version === version && c.para === i);
        return (
          <div key={i} className={`script-para${mine.length ? ' has' : ''}${HEADING.test(p) ? ' head' : ''}`}>
            <p>{HEADING.test(p) ? p.replace(/[\[\]]/g, '') : p}</p>
            {onComment && !locked && at !== i && !HEADING.test(p) && <button className="linkbtn script-add" onClick={() => startComment(i)}>Comment</button>}
            {at === i && (
              <div className="script-new">
                {quote && <blockquote>{quote}</blockquote>}
                <textarea autoFocus rows={3} placeholder="What should change here, and why?" value={draft} onChange={(e) => setDraft(e.target.value)} />
                <div className="row">
                  <button className="btn primary" disabled={!draft.trim()} onClick={async () => { if (await onComment({ para: i, quote, text: draft })) setAt(null); }}>Add comment</button>
                  <button className="linkbtn" onClick={() => setAt(null)}>Cancel</button>
                </div>
              </div>
            )}
            {mine.map((c) => <Thread key={c.id} c={c} admin={admin} onRemove={onRemove} />)}
          </div>
        );
      })}
      {comments.filter((c) => c.version === version && c.para === null).map((c) => <Thread key={c.id} c={c} admin={admin} onRemove={onRemove} />)}
    </div>
  );
}

function Earlier({ comments, version, admin }) {
  const old = comments.filter((c) => c.version !== version);
  if (!old.length) return null;
  return (
    <details className="card pad script-how" open={!admin}>
      <summary>Feedback on earlier versions <span className="muted">· {old.length}</span></summary>
      {old.map((c) => <div key={c.id}>{!c.quote && c.paraText && <blockquote className="script-old">{c.paraText}</blockquote>}<Thread c={c} admin={admin} /></div>)}
    </details>
  );
}

// ---------------------------------------------------------------- client
function ClientScript({ script, project, busy, setBusy, post, say }) {
  const [general, setGeneral] = useState('');
  if (!script) return <section className="card pad"><div className="step-title">Your script isn&apos;t ready yet</div><p className="muted small" style={{ margin: 0 }}>We&apos;ll email you as soon as it is.</p></section>;
  const run = async (key, body, ok) => { setBusy(key); const d = await post(body, ok); setBusy(''); return d; };
  const locked = !!script.approvedAt;
  const open = script.comments.filter((c) => c.status === 'open' && c.version === script.version);
  return (
    <>
      <h1>{project.product} review script</h1>
      <p className="sub">
        {locked ? <>You approved this script on <When at={script.approvedAt} />. It&apos;s locked for filming.</>
          : 'Read it through, then click Comment under any paragraph you would like changed. Highlight a phrase first to point at it exactly. When you are done, send your feedback, or approve the script if it is good to film.'}
      </p>
      {!locked && (
        <section className="card pad script-share on">
          <div className="muted small">
            {script.submittedAt ? 'Feedback sent. We\'ll reply to each comment and update the script.'
              : open.length ? `${open.length} ${open.length === 1 ? 'comment' : 'comments'} ready to send.` : 'No comments yet.'}
          </div>
          <div className="row">
            <button className="btn primary" disabled={!!busy || !open.length || !!script.submittedAt} onClick={() => run('submit', { type: 'submit' }, 'Feedback sent')}>Send feedback</button>
            <button className="btn ok" disabled={!!busy || open.length > 0} title={open.length ? 'Send or remove your comments first' : ''} onClick={() => window.confirm('Approve this script for filming? You won\'t be able to comment afterwards.') && run('approve', { type: 'approve' }, 'Script approved. Thank you!')}>Approve script</button>
          </div>
        </section>
      )}
      <section className="card pad">
        <Paragraphs text={script.text} comments={script.comments} version={script.version} locked={locked}
          onComment={(c) => post({ type: 'comment', ...c }, 'Comment added')} onRemove={(id) => post({ type: 'uncomment', id })} />
      </section>
      {!locked && (
        <section className="card pad">
          <div className="step-title">A comment on the script as a whole</div>
          <textarea rows={3} placeholder="Anything that isn't about one paragraph" value={general} onChange={(e) => setGeneral(e.target.value)} />
          <button className="btn" style={{ marginTop: 8 }} disabled={!general.trim()} onClick={async () => { if (await post({ type: 'comment', para: null, text: general }, 'Comment added')) setGeneral(''); }}>Add comment</button>
        </section>
      )}
      <Earlier comments={script.comments} version={script.version} />
    </>
  );
}
