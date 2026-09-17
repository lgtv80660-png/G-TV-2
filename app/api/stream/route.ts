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
  let ext = searchParams.get("ext") || "ts";

  if (!type || !id) return new Response("Bad request", { status: 400 });

  const creds = await requireSession();
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

          const respHeaders = new Headers();
          respHeaders.set("Content-Type", upstreamRes.headers["content-type"] || "video/mp2t");
          respHeaders.set("Cache-Control", "no-cache, no-store, must-revalidate");
          respHeaders.set("Access-Control-Allow-Origin", "*");

          // On transfère directement sans y toucher
          resolve(
            new Response(upstreamRes as any, {
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
