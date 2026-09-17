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
          // Amortisseur anti-freeze
          enableStashBuffer: true,
          stashInitialSize: 512 * 1024,        // 512 KB de buffer initial pour lisser la lecture
          
          // Tolérance de latence (évite le saut d'images brutal qui fait sauter le lecteur)
          liveBufferLatencyChasing: true,
          liveBufferLatencyMax: 6.0,            // Tolère jusqu'à 6s de retard avant de recaler le flux
          liveBufferLatencyMin: 2.0,            // Conserve 2s de marge de sécurité réseau
          
          // Nettoyage mémoire
          autoCleanupSourceBuffer: true,
          autoCleanupMaxBackwardDuration: 10,
          autoCleanupMinBackwardDuration: 5,
        }
      );

      player.attachMediaElement(video);
      player.load();
      player.play().catch(() => {});

      // Auto-récupération invisible en cas de freeze ou rupture de paquet TS
      player.on(mpegts.Events.ERROR, (errType: string, errDetail: string) => {
        if (
          errType === mpegts.ErrorTypes.MEDIA_ERROR ||
          errType === mpegts.ErrorTypes.NETWORK_ERROR ||
          errDetail?.includes("appendBuffer") ||
          errDetail?.includes("SourceBuffer")
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
