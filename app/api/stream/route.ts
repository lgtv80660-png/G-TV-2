// app/api/stream/route.ts
import { requireSession } from "@/lib/session";
import { buildStreamUrl } from "@/lib/xtream/urls";
import type { StreamKind } from "@/lib/xtream/types";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const creds = await requireSession();
    const { searchParams } = new URL(req.url);

    const type = searchParams.get("type") as StreamKind | null;
    const id = searchParams.get("id");
    let ext = searchParams.get("ext") || "m3u8";

    if (!type || !id) {
      return new Response("Missing type or id", { status: 400 });
    }

    // Adaptations des extensions selon le type
    if (type === "live") {
      ext = "m3u8"; // Force m3u8 pour HLS natif
    } else if (ext.toLowerCase() === "mkv") {
      ext = "mp4";
    }

    // Construction de l'URL cible directe du serveur IPTV
    const targetUrl = buildStreamUrl(creds, type, id, ext);

    // REDIRECTION 302 DIRECTE (Concept original /watch)
    // Cela permet au navigateur / hls.js de télécharger le flux directement
    // sans être limité par les timeouts de flux Vercel Serverless
    return NextResponse.redirect(targetUrl, {
      status: 302,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (err: any) {
    return new Response(`Authentication / Redirect Error: ${err.message}`, { status: 401 });
  }
}
