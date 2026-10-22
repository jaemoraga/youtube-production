// File types accepted for upload. Shared by the browser and the server.
export const MEDIA_TYPES = {
  mp4: 'video/mp4', m4v: 'video/x-m4v', mov: 'video/quicktime', webm: 'video/webm',
  mkv: 'video/x-matroska', avi: 'video/x-msvideo', mpeg: 'video/mpeg', mpg: 'video/mpeg',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', aac: 'audio/aac',
  flac: 'audio/flac', ogg: 'audio/ogg', opus: 'audio/ogg',
};

export function mediaType(filename) {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  return MEDIA_TYPES[ext] || null;
}

// Keep the original name readable but safe as a storage path.
export function safeName(filename) {
  const cleaned = filename.normalize('NFKD').replace(/[^\w.\- ]+/g, '').replace(/\s+/g, '-');
  return cleaned.slice(-120) || 'upload';
}

// Brand materials: images, design files, documents, archives, and short videos.
export const ASSET_TYPES = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
  heic: 'image/heic', tif: 'image/tiff', tiff: 'image/tiff', eps: 'application/postscript', ai: 'application/postscript',
  psd: 'image/vnd.adobe.photoshop', pdf: 'application/pdf', zip: 'application/zip',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  key: 'application/x-iwork-keynote-sffkey', ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2',
  ...MEDIA_TYPES,
};

export function assetType(filename) {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  return ASSET_TYPES[ext] || null;
}
