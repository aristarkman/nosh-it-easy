// Convert any uploaded raster image to WebP in the browser.
// Returns the original File if conversion fails or isn't beneficial.
export async function toWebP(file: File, quality = 0.85, maxDim = 2048): Promise<File> {
  if (file.type === "image/webp") return file;
  if (!file.type.startsWith("image/")) return file;
  // SVG/GIF: skip (would lose vector / animation)
  if (file.type === "image/svg+xml" || file.type === "image/gif") return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob: Blob | null = await new Promise((res) =>
      canvas.toBlob(res, "image/webp", quality)
    );
    if (!blob) return file;
    const base = file.name.replace(/\.[^.]+$/, "");
    return new File([blob], `${base}.webp`, { type: "image/webp" });
  } catch {
    return file;
  }
}
