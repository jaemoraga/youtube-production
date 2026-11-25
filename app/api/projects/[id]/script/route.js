// The script for one project: generation (admin), approval to show the client (admin),
// client comments and approval (client), and Implement revisions (admin).
import { adminAlert, siteUrl } from '@/lib/alerts.js';
import { notify } from '@/lib/email.js';
import { whoFromSession } from '@/lib/notify.js';
import { announce, syncScriptStamps } from '@/lib/production.js';
import { applyAction, getProject } from '@/lib/projects.js';
import { stageOf, windowOpen } from '@/lib/stages.js';
import * as S from '@/lib/script.js';
import { guard } from '@/lib/session.js';
import { companyContacts } from '@/lib/users.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function load(request, params) {
  const [s, denied] = await guard(request, ['admin', 'client']);
  if (denied) return { denied };
  const { id } = await params;
  const p = await getProject(id);
  if (!p || (s.r === 'client' && p.company !== s.c)) return { denied: Response.json({ error: 'Not found' }, { status: 404 }) };
  return { s, p };
}

const view = (s, script) => (s.r === 'admin'
  ? { script: S.forAdmin(script), ai: { ready: S.AI_READY(), model: S.SCRIPT_MODEL(), provider: S.PROVIDER() } }
  : { script: S.forClient(script) });

export async function GET(request, { params }) {
  const { s, p, denied } = await load(request, params);
  if (denied) return denied;
  const script = await S.getScript(p.id);
  if (s.r === 'admin') await syncScriptStamps(p, script, await whoFromSession(s)).catch(() => null);
  return Response.json({ ...view(s, script), window: p.script?.window ? { deadline: p.script.window.deadline, closedAt: p.script.window.closedAt } : null });
}

export async function POST(request, { params }) {
  const { s, p, denied } = await load(request, params);
  if (denied) return denied;
  const a = await request.json().catch(() => ({}));
  const who = await whoFromSession(s);
  const adminUrl = `${siteUrl()}/admin/projects/${p.id}/script`;
  const clientUrl = `${siteUrl()}/client-submission/youtube/p/${p.id}/script`;
  const toClient = async (subject, text) => notify({ to: await companyContacts(p.company), subject, text: `Hi,\n\n${text}\n\n${clientUrl}\n\nHotel Tech Report` }).catch(() => {});
  // Keeps the project's ladder in step with the script: draft written, released, requests in, locked.
  const stamp = async (event, text = '') => {
    const before = stageOf(p);
    const r = await applyAction(p, who, { type: 'script.stamp', event, text });
    Object.assign(p, r.project);
    await announce(p, who, before, r.stage, { type: 'script.stamp', event }).catch((e) => console.error('announce failed', e.message));
  };
  const clientWindowOpen = () => windowOpen(p.script?.window);
  try {
    let script; let extra = {};
    if (s.r === 'admin') {
      switch (a.type) {
        case 'start': script = await S.startScript(p, { website: a.website, product: a.product, who }); break;
        case 'step': {
          script = await S.runNextStep(p);
          if (script.status === 'done' && a.announce !== false && script.steps.at(-1).at && Date.now() - Date.parse(script.steps.at(-1).at) < 15000) {
            const a = S.analyze(script.versions.at(-1)?.text || '');
            await stamp('draft', `${a.words.toLocaleString('en-US')} words`);
            await adminAlert({ subject: `Script ready to review: ${p.companyName} (${a.words.toLocaleString('en-US')} words)`, text: `The script for ${p.name} has been written.\n\nWord count: ${a.words.toLocaleString('en-US')} spoken words (about ${a.runtime} at 140 words a minute). Headings and demo timestamps are not counted.\n\nNothing has been shown to the client. Read it, edit it if needed, then approve it to share.\n\n${adminUrl}` }).catch(() => {});
          }
          break;
        }
        case 'redo': script = await S.redoFrom(p, a.key); break;
        case 'regenerate': script = await S.regenerateScript(p, { product: a.product, who }); await stamp('cleared'); break;
        case 'reset': await S.removeScript(p.id); script = null; await stamp('cleared'); break;
        case 'import': {
          script = await S.importScript(p, a.text, who);
          await applyAction(p, who, { type: 'note', kind: 'script.imported', text: `${S.analyze(script.versions[0].text).words.toLocaleString('en-US')} spoken words` }).catch(() => {});
          await stamp('draft', 'imported');
          break;
        }
        case 'edit': script = await S.saveEdit(p, a.text, who); break;
        case 'share': {
          const r = await S.share(p, who); script = r.script;
          if (!p.script?.releasedAt) await stamp('released');   // opens the review window and sends the release email
          else await toClient(`Updated script: ${p.name}`,
            r.released ? `We've gone through your comments on the script for ${p.name} and updated it. We've replied to ${r.released === 1 ? 'your comment' : `${r.released} of your comments`} so you can see what changed.`
              : `We've updated the script for ${p.name}. Open it to see the latest version.`);
          break;
        }
        case 'draft-reply': script = await S.editDraftReply(p, a.id, a.text); break;
        case 'unshare': script = await S.unshare(p); await stamp('hidden'); break;
        // Revisions are in: the script is final for filming. Moves the project to Shooting and tells the client.
        case 'lock': script = await S.getScript(p.id); if (!script?.shared) throw Object.assign(new Error('Release the script to the client first.'), { status: 400 }); await stamp('locked'); break;
        case 'revise': {
          const r = await S.implementRevisions(p, { only: a.only || null }); script = r.script;
          extra = { implemented: r.implemented, held: r.held };
          await adminAlert({
            subject: `Revisions ready for your review: ${p.companyName}`,
            text: `Implement revisions has finished on ${p.name}.\n\n${r.implemented} ${r.implemented === 1 ? 'request was' : 'requests were'} worked into a new draft, each with a drafted reply.\n${r.held} ${r.held === 1 ? 'request is' : 'requests are'} held for your decision.\n\nThe client has not been shown anything. Review the draft and the replies, then approve to send them.\n\n${adminUrl}`,
          }).catch(() => {});
          break;
        }
        case 'reply': {
          script = await S.replyToComment(p, who, a.id, a.text);
          await toClient(`Reply on your script comment: ${p.name}`, `We've replied to one of your comments on the script for ${p.name}:\n\n"${String(a.text).trim()}"`);
          break;
        }
        default: return Response.json({ error: 'Unknown action' }, { status: 400 });
      }
    } else {
      switch (a.type) {
        case 'comment':
          if (p.script?.window && !clientWindowOpen()) throw Object.assign(new Error('The review window for this script has closed.'), { status: 400 });
          script = await S.addComment(p, who, { para: a.para, quote: a.quote, text: a.text }); break;
        case 'uncomment': script = await S.removeComment(p, who, a.id); break;
        case 'submit': {
          if (p.script?.window && !clientWindowOpen()) throw Object.assign(new Error('The review window for this script has closed.'), { status: 400 });
          const r = await S.clientSubmit(p, who); script = r.script;
          if (p.script?.releasedAt) await stamp('requests', `${r.count} ${r.count === 1 ? 'comment' : 'comments'}`);
          else await adminAlert({ subject: `${p.companyName}: ${r.count} script ${r.count === 1 ? 'comment' : 'comments'}`, text: `${who.name} at ${p.companyName} sent ${r.count} ${r.count === 1 ? 'comment' : 'comments'} on the script for ${p.name}.\n\nOpen the script and click Implement revisions:\n${adminUrl}` }).catch(() => {});
          break;
        }
        case 'approve': {
          if (p.script?.window && !clientWindowOpen()) throw Object.assign(new Error('The review window for this script has closed.'), { status: 400 });
          script = await S.clientApprove(p, who);
          await stamp('locked');
          await adminAlert({ subject: `Script approved by client: ${p.companyName}`, text: `${who.name} at ${p.companyName} approved the script for ${p.name}. It is locked for filming.\n\n${adminUrl}` }).catch(() => {});
          break;
        }
        default: return Response.json({ error: 'Unknown action' }, { status: 400 });
      }
    }
    return Response.json({ ...view(s, script), ...extra, window: p.script?.window ? { deadline: p.script.window.deadline, closedAt: p.script.window.closedAt } : null, stage: stageOf(p) });
  } catch (e) {
    return Response.json({ error: e.message }, { status: e.status || 500 });
  }
}
