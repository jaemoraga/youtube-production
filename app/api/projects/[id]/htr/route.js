// Admin: pull a product's Hotel Tech Report profile into text for the internal dossier.
// Returns the text; the admin reviews it in the form and saves as usual.
import { adminAlert, siteUrl } from '@/lib/alerts.js';
import { htrSession } from '@/lib/htr.js';
import { pullProfile } from '@/lib/htr-profile.js';
import { getProject } from '@/lib/projects.js';
import { guard } from '@/lib/session.js';

export const maxDuration = 60;

export async function POST(request, { params }) {
  const [, denied] = await guard(request, ['admin']);
  if (denied) return denied;
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return Response.json({ error: 'Not found' }, { status: 404 });
  const link = `${siteUrl()}/projects/${id}`;
  const { productId } = await request.json().catch(() => ({}));
  if (!Number.isInteger(Number(productId)) || Number(productId) < 1) return Response.json({ error: 'Choose a product first.' }, { status: 400 });
  try {
    const call = await htrSession();
    const result = await pullProfile(call, productId);
    if (result.failed.length) {
      await adminAlert({
        subject: `HTR data pull incomplete: ${project.companyName}`,
        text: `Pulling ${result.source.name} for ${project.companyName} worked only partly. These sources failed, so their fields may be empty:\n\n${result.failed.map((f) => `• ${f}`).join('\n')}\n\n${link}`,
      });
    }
    return Response.json(result);
  } catch (e) {
    await adminAlert({
      subject: `HTR data pull FAILED: ${project.companyName}`,
      text: `Pulling HTR profile data (product ${productId}) for ${project.companyName} failed.\n\nReason: ${e.message}\n\nFill the internal dossier by hand, or try again later.\n\n${link}`,
    });
    return Response.json({ error: e.message }, { status: e.status || 502 });
  }
}
