// Prefer the existing Lovable gateway when configured; otherwise use Google's
// normal server APIs so the same room functions work on independent hosting.
export async function mapsFetch(path: string, init: RequestInit & { fieldMask?: string } = {}) {
  const gatewayKey = process.env['LOVABLE_API_KEY'];
  const googleKey = process.env['GOOGLE_MAPS_API_KEY'];
  if (!googleKey) throw new Error('Google Maps is not connected');
  const { fieldMask, ...options } = init;
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (fieldMask) headers.set('X-Goog-FieldMask', fieldMask);
  let url: URL;
  if (gatewayKey) {
    // Preserve the gateway's /google_maps prefix for absolute API paths.
    url = new URL(`https://connector-gateway.lovable.dev/google_maps${path}`);
    headers.set('Authorization', `Bearer ${gatewayKey}`);
    headers.set('X-Connection-Api-Key', googleKey);
  } else if (path.startsWith('/places/')) {
    url = new URL(path.replace(/^\/places/, ''), 'https://places.googleapis.com');
    headers.set('X-Goog-Api-Key', googleKey);
  } else {
    url = new URL(path, 'https://maps.googleapis.com');
    url.searchParams.set('key', googleKey);
  }
  const response = await fetch(url, { ...options, headers });
  if (!response.ok) throw new Error(`Map search failed (${response.status})`);
  return response.json();
}
