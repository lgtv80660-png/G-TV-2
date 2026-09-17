import { requireSession } from "@/lib/session";
import { buildStreamUrl } from "@/lib/xtream/urls";
import type { StreamKind } from "@/lib/xtream/types";
import http from "http";
import https from "https";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UA = "VLC/3.0.20 LibVLC/3.0.20";

const httpAgent = new http.Agent({ keepAlive: true, timeout: 60000 });
const httpsAgent = new https.Agent({ keepAlive: true, timeout: 60000, rejectUnauthorized: false });

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
    ext = "ts";
  } else if (ext.toLowerCase() === "mkv") {
    ext = "mp4";
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
        Connection: "keep-alive",
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
          agent: isHttps ? httpsAgent : httpAgent,
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

          const respHeaders = new Headers();
          const contentType =
            type === "live"
              ? "video/mp2t"
              : upstreamRes.headers["content-type"] || "video/mp4";

          respHeaders.set("Content-Type", contentType);
          respHeaders.set("Cache-Control", "no-cache, no-store, must-revalidate");
          respHeaders.set("Access-Control-Allow-Origin", "*");
          respHeaders.set("X-Accel-Buffering", "no");

          // On SUPPRIME Content-Length et Content-Range pour le Live pour éviter la fausse durée fixe (1:03)
          if (type !== "live") {
            if (upstreamRes.headers["content-length"]) {
              respHeaders.set("Content-Length", upstreamRes.headers["content-length"]);
            }
            if (upstreamRes.headers["content-range"]) {
              respHeaders.set("Content-Range", upstreamRes.headers["content-range"]);
            }
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

          resolve(
            new Response(stream, {
              status: upstreamRes.statusCode || 200,
              headers: respHeaders,
            })
          );
        }
      );

      proxyReq.on("error", (err) => {
        resolve(new Response(`Stream Error: ${err.message}`, { status: 502 }));
      });

      proxyReq.end();
    } catch (err: any) {
      resolve(new Response(`Fatal Error: ${err.message}`, { status: 500 }));
    }
  });
}
