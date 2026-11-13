import React, { useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, type LocalTrack, type RemoteTrack } from 'livekit-client';

interface Props {
  token: string;
  serverUrl: string;
  role: 'host' | 'viewer';
  onReady?: () => void;
  onError?: (message: string) => void;
}
export const LiveRoomStage: React.FC<Props> = ({ token, serverUrl, role, onReady, onError }) => {
  const mediaRoot = useRef<HTMLDivElement>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(true);

  useEffect(() => {
    let active = true;
    const room = new Room({ adaptiveStream: true, dynacast: true });
    const attach = (track: RemoteTrack | LocalTrack) => {
      const element = track.attach();
      element.autoplay = true;
      if (element instanceof HTMLVideoElement) {
        element.playsInline = true;
        element.className = 'h-full w-full rounded-xl bg-black object-contain';
      } else {
        element.className = 'hidden';
      }
      mediaRoot.current?.appendChild(element);
      void element.play().catch(() => undefined);
    };
    const detach = (track: RemoteTrack | LocalTrack) => {
      track.detach().forEach((element) => element.remove());
    };

    room.on(RoomEvent.TrackSubscribed, (track) => attach(track));
    room.on(RoomEvent.TrackUnsubscribed, (track) => detach(track));
    room.on(RoomEvent.LocalTrackPublished, (publication) => {
      if (publication.track) attach(publication.track);
    });
    room.on(RoomEvent.LocalTrackUnpublished, (publication) => {
      if (publication.track) detach(publication.track);
    });
    room.on(RoomEvent.Disconnected, () => {
      if (active) setConnected(false);
    });

    const connect = async () => {
      try {
        await room.connect(serverUrl, token, { autoSubscribe: true });
        if (!active) return;
        if (role === 'host') {
          await room.localParticipant.enableCameraAndMicrophone();
        }
        if (!active) return;
        setConnected(true);
        setConnecting(false);
        onReady?.();
      } catch (error) {
        if (!active) return;
        setConnecting(false);
        onError?.(error instanceof Error ? error.message : 'تعذر الاتصال بالبث.');
      }
    };
    void connect();

    return () => {
      active = false;
      room.removeAllListeners();
      void room.disconnect();
      if (mediaRoot.current) mediaRoot.current.replaceChildren();
    };
  }, [token, serverUrl, role, onReady, onError]);

  return <div className="space-y-3">
    <div className="relative min-h-[240px] overflow-hidden rounded-2xl bg-black sm:min-h-[420px]">
      <div ref={mediaRoot} className="grid min-h-[240px] h-full w-full grid-cols-1 gap-2 sm:min-h-[420px] sm:grid-cols-2" />
      {connecting && <div className="absolute inset-0 flex items-center justify-center bg-slate-950/90 text-sm text-slate-300">جارٍ الاتصال بالبث…</div>}
      {!connecting && !connected && <div className="absolute inset-0 flex items-center justify-center bg-slate-950/90 px-5 text-center text-sm text-rose-300">انقطع الاتصال بالبث.</div>}
    </div>
    <div className="flex items-center gap-2 text-xs text-slate-400">
      <span className={connected ? 'h-2 w-2 rounded-full bg-emerald-400' : 'h-2 w-2 rounded-full bg-amber-400'} />
      {connected ? (role === 'host' ? 'أنت تبث مباشرة عبر WebRTC' : 'متصل بالبث المباشر') : 'جارٍ تجهيز الاتصال'}
    </div>
  </div>;
};
