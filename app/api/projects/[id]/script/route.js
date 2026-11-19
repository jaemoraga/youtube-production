// The script for one project: generation (admin), approval to show the client (admin),
// client comments and approval (client), and Implement revisions (admin).
import { adminAlert, siteUrl } from '@/lib/alerts.js';
import { notify } from '@/lib/email.js';
import { whoFromSession } from '@/lib/notify.js';
import { getProject } from '@/lib/projects.js';
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
  ? { script: S.forAdmin(script), ai: { ready: S.AI_READY(), model: S.SCRIPT_MODEL() } }
  : { script: S.forClient(script) });

export async function GET(request, { params }) {
  const { s, p, denied } = await load(request, params);
  if (denied) return denied;
  return Response.json(view(s, await S.getScript(p.id)));
}

export async function POST(request, { params }) {
  const { s, p, denied } = await load(request, params);
  if (denied) return denied;
  const a = await request.json().catch(() => ({}));
  const who = await whoFromSession(s);
  const adminUrl = `${siteUrl()}/admin/projects/${p.id}/script`;
  const clientUrl = `${siteUrl()}/client-submission/youtube/p/${p.id}/script`;
  const toClient = async (subject, text) => notify({ to: await companyContacts(p.company), subject, text: `Hi,\n\n${text}\n\n${clientUrl}\n\nHotel Tech Report` }).catch(() => {});
  try {
    let script; let extra = {};
    if (s.r === 'admin') {
      switch (a.type) {
        case 'start': script = await S.startScript(p, { website: a.website, who }); break;
        case 'step': {
          script = await S.runNextStep(p);
          if (script.status === 'done' && a.announce !== false && script.steps.at(-1).at && Date.now() - Date.parse(script.steps.at(-1).at) < 15000) {
            await adminAlert({ subject: `Script ready to review: ${p.companyName}`, text: `The script for ${p.name} has been written. Nothing has been shown to the client. Read it, edit it if needed, then approve it to share.\n\n${adminUrl}` }).catch(() => {});
          }
          break;
        }
        case 'redo': script = await S.redoFrom(p, a.key); break;
        case 'reset': await S.removeScript(p.id); script = null; break;
        case 'edit': script = await S.saveEdit(p, a.text, who); break;
        case 'share': {
          const r = await S.share(p, who); script = r.script;
          await toClient(r.first ? `Your script is ready to review: ${p.name}` : `Updated script: ${p.name}`,
            r.first ? `The script for ${p.name} is ready for your review. Open it to read it and leave comments on any paragraph, then send us your feedback or approve it.`
              : `We've updated the script for ${p.name}. Open it to see the latest version.`);
          break;
        }
        case 'unshare': script = await S.unshare(p); break;
        case 'revise': {
          const r = await S.implementRevisions(p, { only: a.only || null }); script = r.script;
          extra = { implemented: r.implemented, held: r.held };
          if (r.implemented) await toClient(`We've updated your script: ${p.name}`, `We've gone through your comments on the script for ${p.name}. ${r.implemented} ${r.implemented === 1 ? 'has' : 'have'} been worked into the script, and we've replied to each one so you can see what changed.${r.held ? ' We\'re still reviewing the rest and will reply shortly.' : ''}`);
          if (r.held) await adminAlert({ subject: `${r.held} script ${r.held === 1 ? 'request needs' : 'requests need'} your decision: ${p.companyName}`, text: `Implement revisions held back ${r.held} client ${r.held === 1 ? 'request' : 'requests'} on ${p.name} because ${r.held === 1 ? 'it affects' : 'they affect'} the editorial side of the review. Nothing was changed or sent for ${r.held === 1 ? 'it' : 'them'}.\n\n${adminUrl}` }).catch(() => {});
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
        case 'comment': script = await S.addComment(p, who, { para: a.para, quote: a.quote, text: a.text }); break;
        case 'uncomment': script = await S.removeComment(p, who, a.id); break;
        case 'submit': {
          const r = await S.clientSubmit(p, who); script = r.script;
          await adminAlert({ subject: `${p.companyName}: ${r.count} script ${r.count === 1 ? 'comment' : 'comments'}`, text: `${who.name} at ${p.companyName} sent ${r.count} ${r.count === 1 ? 'comment' : 'comments'} on the script for ${p.name}.\n\nOpen the script and click Implement revisions:\n${adminUrl}` }).catch(() => {});
          break;
        }
        case 'approve': {
          script = await S.clientApprove(p, who);
          await adminAlert({ subject: `Script approved by client: ${p.companyName}`, text: `${who.name} at ${p.companyName} approved the script for ${p.name}. It is locked for filming.\n\n${adminUrl}` }).catch(() => {});
          break;
        }
        default: return Response.json({ error: 'Unknown action' }, { status: 400 });
      }
    }
    return Response.json({ ...view(s, script), ...extra });
  } catch (e) {
    return Response.json({ error: e.message }, { status: e.status || 500 });
  }
}
