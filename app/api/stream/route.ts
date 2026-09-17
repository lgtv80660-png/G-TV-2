import { requireSession } from "@/lib/session";
import { buildStreamUrl } from "@/lib/xtream/urls";
import type { StreamKind } from "@/lib/xtream/types";
import http from "http";
import https from "https";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UA = "VLC/3.0.20 LibVLC/3.0.20";

export async function GET(req: Request) {
  try {
    await requireSession();
  } catch {
    return new Response("Not authenticated", { status: 401 });
  }

  const { searchParams, origin } = new URL(req.url);
  const type = searchParams.get("type") as StreamKind | null;
  const id = searchParams.get("id");
  let ext = searchParams.get("ext") || "ts";
  const directUrl = searchParams.get("url");

  const creds = await requireSession();

  // 1. Si on demande une URL directe (segment .ts interne au manifeste)
  if (directUrl) {
    return fetchUpstream(directUrl, req);
  }

  if (!type || !id) return new Response("Bad request", { status: 400 });

  // Forcer m3u8 si c'est du live
  if (type === "live") {
    if (ext !== "m3u8") ext = "ts";
  } else if (ext.toLowerCase() === "mkv") {
    ext = "mp4";
  }

  const targetUrl = buildStreamUrl(creds, type, id, ext);

  // 2. Traitement spécifique des playlists .m3u8 pour le Live
  if (type === "live" && ext === "m3u8") {
    try {
      const res = await fetch(targetUrl, {
        headers: { "User-Agent": UA },
      });

      if (!res.ok) {
        return new Response(`Upstream HLS Error: ${res.statusText}`, { status: res.status });
      }

      let m3u8Text = await res.text();
      const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf("/") + 1);

      // Réécriture des URLs relatives/absolues des segments .ts du fichier m3u8
      const rewrittenM3u8 = m3u8Text
        .split("\n")
        .map((line) => {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) return line;

          let segmentUrl = trimmed;
          if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
            segmentUrl = new URL(trimmed, baseUrl).toString();
          }

          return `${origin}/api/stream?url=${encodeURIComponent(segmentUrl)}`;
        })
        .join("\n");

      return new Response(rewrittenM3u8, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.apple.mpegurl",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (err: any) {
      return new Response(`Manifest Error: ${err.message}`, { status: 500 });
    }
  }

  // 3. Traitement standard des flux (VOD, TS direct)
  return fetchUpstream(targetUrl, req);
}

async function fetchUpstream(targetUrl: string, req: Request) {
  return new Promise<Response>((resolve) => {
    try {
      const parsed = new URL(targetUrl);
      const isHttps = parsed.protocol === "https:";
      const client = isHttps ? https : http;

      const headers: Record<string, string> = {
        "User-Agent": UA,
        Accept: "*/*",
      };

      const range = req.headers.get("range");
      if (range) headers["Range"] = range;

      const proxyReq = client.request(
        {
          hostname: parsed.hostname,
          port: parsed.port || (isHttps ? 443 : 80),
          path: parsed.pathname + parsed.search,
          method: "GET",
          headers,
          rejectUnauthorized: false,
        },
        (upstreamRes) => {
          if (
            upstreamRes.statusCode &&
            [301, 302, 303, 307, 308].includes(upstreamRes.statusCode) &&
            upstreamRes.headers.location
          ) {
            const nextUrl = new URL(upstreamRes.headers.location, targetUrl).toString();
            return resolve(fetchUpstream(nextUrl, req));
          }

          const respHeaders = new Headers();
          respHeaders.set("Content-Type", upstreamRes.headers["content-type"] || "video/mp2t");
          respHeaders.set("Cache-Control", "no-cache, no-store, must-revalidate");
          respHeaders.set("Access-Control-Allow-Origin", "*");
          respHeaders.set("X-Accel-Buffering", "no");

          if (upstreamRes.headers["content-length"]) {
            respHeaders.set("Content-Length", upstreamRes.headers["content-length"]);
          }

          const stream = new ReadableStream({
            start(controller) {
              upstreamRes.on("data", (chunk) => {
                try { controller.enqueue(chunk); } catch {}
              });
              upstreamRes.on("end", () => {
                try { controller.close(); } catch {}
              });
              upstreamRes.on("error", () => {
                try { controller.close(); } catch {}
              });
            },
            cancel() {
              upstreamRes.destroy();
            },
          });

          resolve(new Response(stream, { status: upstreamRes.statusCode || 200, headers: respHeaders }));
        }
      );

      proxyReq.on("error", (err) => {
        resolve(new Response(`Proxy Stream Error: ${err.message}`, { status: 502 }));
      });

      proxyReq.end();
    } catch (err: any) {
      resolve(new Response(`Fatal Error: ${err.message}`, { status: 500 }));
    }
  });
}
