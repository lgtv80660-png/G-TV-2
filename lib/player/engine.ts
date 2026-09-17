export type EngineKind = "mpegts" | "hls" | "native" | "unsupported";

export interface EngineHandle {
  kind: EngineKind;
  destroy: () => void;
}

export function pickEngine(url: string, ext: string, isLive: boolean): EngineKind {
  if (isLive || ext.toLowerCase().replace(/^\./, "") === "ts") return "mpegts";
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
          enableStashBuffer: false,
          stashInitialSize: 0,
          lazyLoad: false,
          liveBufferLatencyChasing: true,
          autoCleanupSourceBuffer: true,
          // Réduis le crash quand le SourceBuffer rencontre des données corrompues
          accurateSeek: false,
        }
      );

      player.attachMediaElement(video);
      player.load();
      player.play().catch(() => {});

      // Interception des erreurs appendBuffer & MediaSource
      player.on(mpegts.Events.ERROR, (errType: string, errDetail: string) => {
        // Empêche le crash fatale sur appendBuffer
        if (
          errType === mpegts.ErrorTypes.MEDIA_ERROR ||
          errType === mpegts.ErrorTypes.NETWORK_ERROR ||
          errDetail?.includes("appendBuffer")
        ) {
          try {
            player.unload();
            player.detachMediaElement();
            player.attachMediaElement(video);
            player.load();
            player.play().catch(() => {});
          } catch {}
        }
      });

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

  video.src = opts.url;
  return {
    kind: "native",
    destroy: () => {
      video.removeAttribute("src");
      video.load();
    },
  };
}
