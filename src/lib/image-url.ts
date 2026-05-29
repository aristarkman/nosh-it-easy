// Build a Supabase Storage render-transform URL for thumbnails.
// Falls back to the original URL if it isn't a Supabase public object.
export function thumb(url: string | null | undefined, width = 224, quality = 70): string {
  if (!url) return "";
  const marker = "/storage/v1/object/public/";
  const idx = url.indexOf(marker);
  if (idx === -1) return url;
  const base = url.slice(0, idx);
  const path = url.slice(idx + marker.length);
  return `${base}/storage/v1/render/image/public/${path}?width=${width}&quality=${quality}`;
}
