export type EngineKind = "mpegts" | "hls" | "native";

export interface EngineHandle {
  kind: EngineKind;
  destroy: () => void;
}

export function pickEngine(url: string, ext: string, isLive: boolean): EngineKind {
  const u = url.toLowerCase();
  const e = ext.toLowerCase().replace(/^\./, "");

  if (u.includes(".m3u8") || e === "m3u8") return "hls";
  if (isLive || e === "ts") return "mpegts";

  return "native";
}

export async function attach(
  video: HTMLVideoElement,
  opts: { url: string; ext: string; isLive: boolean }
): Promise<EngineHandle> {
  const kind = pickEngine(opts.url, opts.ext, opts.isLive);

  if (kind === "mpegts") {
    const mpegts = (await import("mpegts.js")).default;
    if (mpegts.getFeatureList().mseLivePlayback || mpegts.isSupported()) {
      const player = mpegts.createPlayer(
        {
          type: "mpegts",
          isLive: true,
          url: opts.url,
        },
        {
          enableStashBuffer: true,
          stashInitialSize: 384 * 1024,
          liveBufferLatencyChasing: true,
          liveBufferLatencyMax: 4.0,
          liveBufferLatencyMin: 1.0,
          autoCleanupSourceBuffer: true,
        }
      );

      player.attachMediaElement(video);
      player.load();
      player.play().catch(() => {});

      return {
        kind: "mpegts",
        destroy: () => {
          try {
            player.unload();
            player.detachMediaElement();
            player.destroy();
          } catch {}
        },
      };
    }
  }

  if (kind === "hls") {
    const Hls = (await import("hls.js")).default;
    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true });
      hls.loadSource(opts.url);
      hls.attachMedia(video);
      video.play().catch(() => {});
      return { kind: "hls", destroy: () => hls.destroy() };
    }
  }

  video.src = opts.url;
  video.load();
  video.play().catch(() => {});

  return {
    kind: "native",
    destroy: () => {
      video.pause();
      video.removeAttribute("src");
      video.load();
    },
  };
}
