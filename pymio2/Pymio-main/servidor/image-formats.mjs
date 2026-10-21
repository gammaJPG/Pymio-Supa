export const SUPPORTED_IMAGE_MIME_TYPES = new Set(['image/webp','image/png','image/jpeg']);

export function detectImageFormat(body) {
  if (!body || body.length < 3) return null;
  if (body.length >= 12 && body.subarray(0,4).toString() === 'RIFF' && body.subarray(8,12).toString() === 'WEBP') return {mime:'image/webp',extension:'webp'};
  if (body.length >= 8 && body[0] === 0x89 && body[1] === 0x50 && body[2] === 0x4e && body[3] === 0x47 && body[4] === 0x0d && body[5] === 0x0a && body[6] === 0x1a && body[7] === 0x0a) return {mime:'image/png',extension:'png'};
  if (body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) return {mime:'image/jpeg',extension:'jpg'};
  return null;
}

export function validateImageFormat(body, declaredMime) {
  const normalized=String(declaredMime||'').split(';')[0].trim().toLowerCase();
  if (!SUPPORTED_IMAGE_MIME_TYPES.has(normalized)) return null;
  const detected=detectImageFormat(body);
  return detected?.mime === normalized ? detected : null;
}
