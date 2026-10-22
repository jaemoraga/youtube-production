// Issues a short-lived signed URL so the browser can send a file straight into private Blob
// storage. The file never passes through this function, so there is no size or time limit here.
//   uploads/<company>/<file>              a video to transcribe
//   assets/<company>/<project>/<file>     brand materials for a project
import { issueSignedToken } from '@vercel/blob';
import { handleUploadPresigned } from '@vercel/blob/client';
import { assetPathParts, companyForUpload, slugFromPath } from '@/lib/access.js';
import { MAX_UPLOAD_BYTES } from '@/lib/config.js';
import { ASSET_TYPES, MEDIA_TYPES, assetType, mediaType } from '@/lib/media.js';
import { getProject } from '@/lib/projects.js';

const VIDEO_TYPES = [...new Set(Object.values(MEDIA_TYPES))];
const ASSET_CONTENT_TYPES = [...new Set(Object.values(ASSET_TYPES))];

async function check(pathname, token) {
  const asset = assetPathParts(pathname);
  if (asset) {
    const company = await companyForUpload({ token, slug: asset.slug });
    const project = company && (await getProject(asset.projectId));
    if (!project || project.company !== asset.slug) throw new Error('This upload is not allowed.');
    if (!assetType(pathname)) throw new Error('That file type is not supported. Use images, PDFs, ZIPs, decks or videos.');
    return ASSET_CONTENT_TYPES;
  }
  const slug = slugFromPath(pathname);
  const company = slug && (await companyForUpload({ token, slug }));
  if (!company || company.slug !== slug) throw new Error('This upload link is not valid.');
  if (!mediaType(pathname)) throw new Error('Please upload a video or audio file.');
  return VIDEO_TYPES;
}

export async function POST(request) {
  const body = await request.json();
  try {
    const result = await handleUploadPresigned({
      body,
      request,
      getSignedToken: async (pathname, clientPayload) => {
        const { token } = JSON.parse(clientPayload || '{}');
        const types = await check(pathname, token);
        const signed = await issueSignedToken({
          pathname,
          operations: ['put'],
          allowedContentTypes: types,
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          validUntil: Date.now() + 6 * 3600e3, // long enough for a slow multi-GB upload
        });
        return {
          token: signed,
          urlOptions: { allowedContentTypes: types, maximumSizeInBytes: MAX_UPLOAD_BYTES, addRandomSuffix: true, allowOverwrite: false },
        };
      },
    });
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}
