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

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") as StreamKind | null;
  const id = searchParams.get("id");
  let requestedExt = searchParams.get("ext");

  if (!type || !id) return new Response("Bad request", { status: 400 });

  const creds = await requireSession();

  // Détermination stricte des extensions selon le type
  let ext = "mp4";
  if (type === "live") {
    ext = requestedExt === "ts" ? "ts" : "m3u8";
  } else {
    // Pour movies et series, on utilise mp4 (ou la valeur explicite demandée)
    if (requestedExt && requestedExt.toLowerCase() !== "m3u8") {
      ext = requestedExt.toLowerCase() === "mkv" ? "mp4" : requestedExt;
    } else {
      ext = "mp4";
    }
  }

  const targetUrl = buildStreamUrl(creds, type, id, ext);

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
            return resolve(fetch(nextUrl, { headers: { "User-Agent": UA } }));
          }

          // Attribution rigoureuse du Content-Type
          let contentType = "video/mp4";
          if (type === "live") {
            contentType = ext === "m3u8" ? "application/vnd.apple.mpegurl" : "video/mp2t";
          } else {
            contentType = upstreamRes.headers["content-type"] || "video/mp4";
          }

          const respHeaders = new Headers();
          respHeaders.set("Content-Type", contentType);
          respHeaders.set("Cache-Control", "no-cache, no-store, must-revalidate");
          respHeaders.set("Access-Control-Allow-Origin", "*");
          respHeaders.set("X-Accel-Buffering", "no");

          if (upstreamRes.headers["content-length"]) {
            respHeaders.set("Content-Length", upstreamRes.headers["content-length"]);
          }
          if (upstreamRes.headers["content-range"]) {
            respHeaders.set("Content-Range", upstreamRes.headers["content-range"]);
          }

          const stream = new ReadableStream({
            start(controller) {
              upstreamRes.on("data", (chunk) => {
                try {
                  controller.enqueue(chunk);
                } catch {}
              });
              upstreamRes.on("end", () => {
                try {
                  controller.close();
                } catch {}
              });
              upstreamRes.on("error", () => {
                try {
                  controller.close();
                } catch {}
              });
            },
            cancel() {
              upstreamRes.destroy();
            },
          });

          resolve(
            new Response(stream, {
              status: upstreamRes.statusCode || 200,
              headers: respHeaders,
            })
          );
        }
      );

      proxyReq.on("error", (err) => {
        resolve(new Response(`Direct Stream Error: ${err.message}`, { status: 502 }));
      });

      proxyReq.end();
    } catch (err: any) {
      resolve(new Response(`Fatal Error: ${err.message}`, { status: 500 }));
    }
  });
}
