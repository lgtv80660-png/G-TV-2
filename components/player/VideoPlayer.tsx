// components/player/VideoPlayer.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { Loader2 } from "lucide-react";

interface VideoPlayerProps {
  sources: string[];
  ext?: string;
  isLive?: boolean;
  title?: string;
  poster?: string;
}

export function VideoPlayer({ sources, ext = "mp4", isLive = false, poster }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !sources.length || !sources[0]) return;

    let hlsInstance: Hls | null = null;
    let isMounted = true;

    setLoading(true);
    setError(false);

    const streamUrl = sources[0];
    const isHls = isLive || ext === "m3u8" || streamUrl.includes("ext=m3u8");

    if (isHls && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
      });

      hlsInstance = hls;
      hls.loadSource(streamUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (isMounted) {
          setLoading(false);
          video.play().catch(() => {});
        }
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            hls.startLoad();
          } else if (isMounted) {
            setLoading(false);
            setError(true);
          }
        }
      });
    } else {
      // Pour Safari natif ou VOD/Séries (MP4)
      video.src = streamUrl;
      video
        .play()
        .then(() => {
          if (isMounted) setLoading(false);
        })
        .catch(() => {});
    }

    const handleCanPlay = () => isMounted && setLoading(false);
    const handleError = () => {
      if (isMounted) {
        setLoading(false);
        setError(true);
      }
    };

    video.addEventListener("canplay", handleCanPlay);
    video.addEventListener("playing", handleCanPlay);
    video.addEventListener("error", handleError);

    return () => {
      isMounted = false;
      video.removeEventListener("canplay", handleCanPlay);
      video.removeEventListener("playing", handleCanPlay);
      video.removeEventListener("error", handleError);

      if (hlsInstance) {
        hlsInstance.destroy();
      }
    };
  }, [sources, ext, isLive]);

  return (
    <div className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden rounded-xl">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10">
          <Loader2 className="w-8 h-8 text-iris-400 animate-spin" />
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black z-10 text-white p-4 text-center">
          <p className="text-sm font-semibold text-rose-500">Erreur de lecture du flux</p>
          <p className="text-xs text-fog-400 mt-1">Le flux est indisponible ou a été interrompu.</p>
        </div>
      )}

      <video
        ref={videoRef}
        poster={poster}
        controls
        autoPlay
        playsInline
        className="w-full h-full object-contain bg-black block"
      />
    </div>
  );
}
