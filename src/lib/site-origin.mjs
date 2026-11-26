export function httpsOrigin(value) {
 try {
  const url = new URL(value);
  return url.protocol === 'https:' && url.href === url.origin + '/' ? url.origin : null;
 } catch {
  return null;
 }
}
