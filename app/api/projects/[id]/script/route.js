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
  ? { script: S.forAdmin(script), ai: { ready: S.AI_READY(), model: S.SCRIPT_MODEL(), provider: S.PROVIDER() } }
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
        case 'start': script = await S.startScript(p, { website: a.website, product: a.product, who }); break;
        case 'step': {
          script = await S.runNextStep(p);
          if (script.status === 'done' && a.announce !== false && script.steps.at(-1).at && Date.now() - Date.parse(script.steps.at(-1).at) < 15000) {
            await adminAlert({ subject: `Script ready to review: ${p.companyName}`, text: `The script for ${p.name} has been written. Nothing has been shown to the client. Read it, edit it if needed, then approve it to share.\n\n${adminUrl}` }).catch(() => {});
          }
          break;
        }
        case 'redo': script = await S.redoFrom(p, a.key); break;
        case 'regenerate': script = await S.regenerateScript(p, { product: a.product, who }); break;
        case 'reset': await S.removeScript(p.id); script = null; break;
        case 'edit': script = await S.saveEdit(p, a.text, who); break;
        case 'share': {
          const r = await S.share(p, who); script = r.script;
          await toClient(r.first ? `Your script is ready to review: ${p.name}` : `Updated script: ${p.name}`,
            r.first ? `The script for ${p.name} is ready for your review. Open it to read it and leave comments on any paragraph, then send us your feedback or approve it.`
              : r.released ? `We've gone through your comments on the script for ${p.name} and updated it. We've replied to ${r.released === 1 ? 'your comment' : `${r.released} of your comments`} so you can see what changed.`
                : `We've updated the script for ${p.name}. Open it to see the latest version.`);
          break;
        }
        case 'draft-reply': script = await S.editDraftReply(p, a.id, a.text); break;
        case 'unshare': script = await S.unshare(p); break;
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
