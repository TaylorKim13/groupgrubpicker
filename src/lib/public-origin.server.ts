export function publicOrigin(request: Request): string {
  const configured = process.env['PUBLIC_SITE_URL'] || process.env['RENDER_EXTERNAL_URL'];
  if (!configured) return new URL(request.url).origin;
  const url = new URL(configured);
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('PUBLIC_SITE_URL must be a public HTTPS URL.');
  }
  return url.origin;
}
