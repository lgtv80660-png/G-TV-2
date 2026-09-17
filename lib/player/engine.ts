export type EngineKind = "native" | "hls";

export interface EngineHandle {
  kind: EngineKind;
  destroy: () => void;
}

export async function attach(
  video: HTMLVideoElement,
  opts: { url: string; ext: string; isLive: boolean }
): Promise<EngineHandle> {
  const u = opts.url.toLowerCase();

  // Si c'est un flux HLS (.m3u8)
  if (u.includes(".m3u8")) {
    const Hls = (await import("hls.js")).default;
    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true });
      hls.loadSource(opts.url);
      hls.attachMedia(video);
      video.play().catch(() => {});
      return { kind: "hls", destroy: () => hls.destroy() };
    }
  }

  // Pour TOUT le reste (Live TS, VOD MP4) : Passage direct au navigateur
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
