import React, { useEffect, useRef, useState } from 'react';
import { fetchPlaybackInfo, loadVerifiedManifest, startPlayback, type PlayerSession } from '../services/p2pPlayback';
import { DailyUploadMeter, type SharingSettings } from '../domain/channels/sharingPolicy';
import { getSupabaseClient } from '../services/supabase';

const meter = new DailyUploadMeter();

interface Props { videoId: string; userId?: string; active: boolean; sharing: SharingSettings; loop?: boolean }

/** Plays one verified video; starts only while `active` so off-screen cards cost no data or peers. */
export const ChannelPlayer: React.FC<Props> = ({ videoId, userId, active, sharing, loop = true }) => {
  const ref = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const el = ref.current;
    if (!active || !el) return;
    let session: PlayerSession | null = null;
    let cancelled = false;
    (async () => {
      try {
        const info = await fetchPlaybackInfo(videoId);
        const manifest = await loadVerifiedManifest(info);
        if (cancelled) return;
        session = await startPlayback({ video: el, info, manifest, sharing, meter });
        if (cancelled) { session.destroy(); session = null; return; }
        el.play().catch(() => undefined);
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : 'error'); }
    })();
    return () => {
      cancelled = true;
      const stats = session?.destroy();
      el.removeAttribute('src');
      const total = stats ? stats.bytesOrigin + stats.bytesMirror + stats.bytesPeer : 0;
      const supabase = getSupabaseClient();
      if (stats && userId && supabase && total > 0) {
        void supabase.from('channel_playback_stats').insert({
          viewer_id: userId, video_id: videoId, bytes_origin: stats.bytesOrigin, bytes_mirror: stats.bytesMirror,
          bytes_peer: stats.bytesPeer, rejected_pieces: stats.rejectedPieces,
        });
      }
    };
  }, [active, videoId, userId, sharing]);

  return (
    <div className="relative w-full h-full bg-black">
      <video ref={ref} className="w-full h-full object-contain" playsInline muted={false} loop={loop} controls={active} preload="none" />
      {error && <div className="absolute inset-0 flex items-center justify-center text-xs text-red-300 p-4 text-center">{error}</div>}
    </div>
  );
};
