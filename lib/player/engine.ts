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
  const e = opts.ext.toLowerCase().replace(/^\./, "");

  // Si c'est un flux HLS (ex: VOD/Série m3u8 ou stream explicite), on conserve HLS.js
  if (u.includes(".m3u8") || e === "m3u8") {
    const Hls = (await import("hls.js")).default;
    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true });
      hls.loadSource(opts.url);
      hls.attachMedia(video);
      video.play().catch(() => {});
      return { kind: "hls", destroy: () => hls.destroy() };
    }
  }

  // Pour le Live (.ts) ainsi que les VOD/Séries (.mp4 / .mkv) : lecture directe HTML5 native sans parser JS
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
