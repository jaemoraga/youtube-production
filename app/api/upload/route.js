// Issues a short-lived signed URL so the browser can send the video straight into private Blob
// storage. The video never passes through this function, so there is no size or time limit here.
// Uses Vercel's presigned uploads, which work with the store's default OIDC credentials
// (no long-lived BLOB_READ_WRITE_TOKEN needed).
import { issueSignedToken } from '@vercel/blob';
import { handleUploadPresigned } from '@vercel/blob/client';
import { companyForUpload, slugFromPath } from '@/lib/access.js';
import { MAX_UPLOAD_BYTES } from '@/lib/config.js';
import { MEDIA_TYPES, mediaType } from '@/lib/media.js';

const CONTENT_TYPES = [...new Set(Object.values(MEDIA_TYPES))];

export async function POST(request) {
  const body = await request.json();
  try {
    const result = await handleUploadPresigned({
      body,
      request,
      getSignedToken: async (pathname, clientPayload) => {
        const { token } = JSON.parse(clientPayload || '{}');
        const slug = slugFromPath(pathname);
        const company = slug && (await companyForUpload({ token, slug }));
        if (!company || company.slug !== slug) throw new Error('This upload link is not valid.');
        if (!mediaType(pathname)) throw new Error('Please upload a video or audio file.');
        const signed = await issueSignedToken({
          pathname,
          operations: ['put'],
          allowedContentTypes: CONTENT_TYPES,
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          validUntil: Date.now() + 6 * 3600e3, // long enough for a slow multi-GB upload
        });
        return {
          token: signed,
          urlOptions: {
            allowedContentTypes: CONTENT_TYPES,
            maximumSizeInBytes: MAX_UPLOAD_BYTES,
            addRandomSuffix: true,
            allowOverwrite: false,
          },
        };
      },
    });
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}
