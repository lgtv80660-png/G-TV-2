export type EngineKind = "hls" | "native";

export interface EngineHandle {
  kind: EngineKind;
  destroy: () => void;
}

export async function attach(
  video: HTMLVideoElement,
  opts: { url: string; ext: string; isLive: boolean }
): Promise<EngineHandle> {
  const u = opts.url.toLowerCase();

  if (u.includes("/api/hls") || u.includes(".m3u8") || opts.isLive) {
    const Hls = (await import("hls.js")).default;
    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 10,
        liveSyncDurationCount: 3,
        liveMaxLatencyDurationCount: 10,
      });

      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
        else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
        else hls.destroy();
      });

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
