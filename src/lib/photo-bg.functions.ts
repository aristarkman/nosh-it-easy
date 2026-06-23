import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BG_HEX = "#EFDBC1"; // warm cream beige sampled from reference photo

const PROMPT = `Replace ONLY the background of this product photo with a smooth, evenly-lit warm cream beige backdrop (color ${BG_HEX}). The backdrop should be soft and matte with a very subtle natural light falloff — like a seamless paper photo backdrop. Do not alter the food/product subject in any way: keep its exact shape, colors, textures, plating, garnish, shadows on the plate, and proportions identical. Preserve the original framing and cropping. Output a clean product photo with the new cream background only.`;

async function listAdminPhotos(supabase: any, userId: string) {
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!isAdmin) throw new Response("Forbidden", { status: 403 });
}

export const listMenuPhotosForBgJob = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await listAdminPhotos(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("menu_item_photos")
      .select("id,menu_item_id,url,sort_order")
      .order("sort_order");
    if (error) throw new Error(error.message);
    return { photos: data ?? [] };
  });

export const replacePhotoBackground = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ photoId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await listAdminPhotos(context.supabase, context.userId);
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: photo, error: pErr } = await supabaseAdmin
      .from("menu_item_photos")
      .select("id,menu_item_id,url,sort_order")
      .eq("id", data.photoId)
      .single();
    if (pErr || !photo) throw new Error(pErr?.message ?? "Photo not found");

    // Download original
    const imgRes = await fetch(photo.url);
    if (!imgRes.ok) throw new Error(`Failed to fetch source image: ${imgRes.status}`);
    const buf = new Uint8Array(await imgRes.arrayBuffer());
    const contentType = imgRes.headers.get("content-type") || "image/webp";
    const b64 = Buffer.from(buf).toString("base64");
    const dataUrl = `data:${contentType};base64,${b64}`;

    // Call Gemini nano banana via Lovable AI Gateway (OpenRouter chat-completions image shape)
    const gwRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",
        modalities: ["image", "text"],
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: PROMPT },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
    });

    if (!gwRes.ok) {
      const txt = await gwRes.text().catch(() => "");
      throw new Error(`AI gateway ${gwRes.status}: ${txt.slice(0, 300)}`);
    }

    const payload = (await gwRes.json()) as any;
    // Gateway normalizes Gemini image output to OpenAI shape; image can be in
    // choices[0].message.images[0].image_url.url, or .content blocks, or data[0].b64_json.
    let outB64: string | null = null;
    let outMime = "image/png";
    const choice = payload?.choices?.[0]?.message;
    const imgsField = choice?.images?.[0]?.image_url?.url;
    if (typeof imgsField === "string" && imgsField.startsWith("data:")) {
      const m = imgsField.match(/^data:([^;]+);base64,(.+)$/);
      if (m) { outMime = m[1]; outB64 = m[2]; }
    }
    if (!outB64 && Array.isArray(choice?.content)) {
      for (const block of choice.content) {
        if (block?.type === "image_url" && typeof block?.image_url?.url === "string") {
          const m = String(block.image_url.url).match(/^data:([^;]+);base64,(.+)$/);
          if (m) { outMime = m[1]; outB64 = m[2]; break; }
        }
      }
    }
    if (!outB64 && payload?.data?.[0]?.b64_json) {
      outB64 = payload.data[0].b64_json as string;
    }
    if (!outB64) {
      throw new Error("AI gateway returned no image data");
    }

    const outBytes = Buffer.from(outB64, "base64");
    const ext = outMime.includes("png") ? "png" : outMime.includes("webp") ? "webp" : "jpg";
    const path = `bg-${photo.menu_item_id}-${Date.now()}.${ext}`;
    const blob = new Blob([outBytes], { type: outMime });
    const { error: upErr } = await supabaseAdmin.storage
      .from("menu-photos")
      .upload(path, blob, { upsert: true, contentType: outMime });
    if (upErr) throw new Error(upErr.message);
    const { data: pub } = supabaseAdmin.storage.from("menu-photos").getPublicUrl(path);
    const newUrl = pub.publicUrl;

    const { error: updErr } = await supabaseAdmin
      .from("menu_item_photos")
      .update({ url: newUrl })
      .eq("id", photo.id);
    if (updErr) throw new Error(updErr.message);

    // Keep menu_items.photo_url in sync if this was the primary
    if (photo.sort_order === 0) {
      await supabaseAdmin.from("menu_items").update({ photo_url: newUrl }).eq("id", photo.menu_item_id);
    }

    return { ok: true, photoId: photo.id, newUrl };
  });
