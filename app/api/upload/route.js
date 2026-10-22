// Issues a one-time token so the browser can send the video straight into private Blob storage.
// The video never passes through this function, so there is no size or time limit here.
import { handleUpload } from '@vercel/blob/client';
import { companyForUpload, slugFromPath } from '@/lib/access.js';
import { MAX_UPLOAD_BYTES } from '@/lib/config.js';
import { MEDIA_TYPES, mediaType } from '@/lib/media.js';

export async function POST(request) {
  const body = await request.json();
  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const { token } = JSON.parse(clientPayload || '{}');
        const slug = slugFromPath(pathname);
        const company = slug && (await companyForUpload({ token, slug }));
        if (!company || company.slug !== slug) throw new Error('This upload link is not valid.');
        if (!mediaType(pathname)) throw new Error('Please upload a video or audio file.');
        return {
          allowedContentTypes: [...new Set(Object.values(MEDIA_TYPES))],
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          addRandomSuffix: true,
          allowOverwrite: false,
        };
      },
    });
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}
