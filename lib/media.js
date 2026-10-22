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
