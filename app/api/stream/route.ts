import { requireSession } from "@/lib/session";
import { buildStreamUrl } from "@/lib/xtream/urls";
import type { StreamKind } from "@/lib/xtream/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireSession();
  } catch {
    return new Response("Not authenticated", { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") as StreamKind | null;
  const id = searchParams.get("id");
  let ext = searchParams.get("ext") || "ts";

  if (!type || !id) return new Response("Bad request", { status: 400 });

  const creds = await requireSession();

  if (type === "live") {
    ext = "m3u8"; // Format HLS natif identique aux lecteurs Web IPTV
  } else if (ext.toLowerCase() === "mkv") {
    ext = "mp4";
  }

  // Construit l'URL directe du fournisseur Xtream
  const targetUrl = buildStreamUrl(creds, type, id, ext);

  // Redirection HTTP 302 directe : Le navigateur lit directement depuis le fournisseur
  return Response.redirect(targetUrl, 302);
}
