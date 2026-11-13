import { Room, RoomEvent } from 'livekit-client';
import { getSupabaseClient } from './supabase';

export interface ReceivedKenzMedia { postId: string; file: File; }
export interface KenzChannelMediaRoom {
  channelId: string;
  onlinePeers(): number;
  sendFile(postId: string, file: File): Promise<{ online: number; relayed: boolean }>;
  close(): void;
}
type TransferMeta = { kind: 'meta'; postId: string; name: string; mime: string; size: number };
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const topic = 'kenz-channel-media';
const controlPacket = (value: Record<string, unknown>) => {
  const encoded = encoder.encode(JSON.stringify(value));
  const packet = new Uint8Array(encoded.length + 1);
  packet[0] = 0;
  packet.set(encoded, 1);
  return packet;
};
const binaryPacket = (value: Uint8Array) => {
  const packet = new Uint8Array(value.length + 1);
  packet[0] = 1;
  packet.set(value, 1);
  return packet;
};

export async function connectKenzChannelMediaRoom(
  channelId: string,
  onFile: (media: ReceivedKenzMedia) => void,
): Promise<KenzChannelMediaRoom> {
  const db = getSupabaseClient();
  if (!db) throw new Error('Supabase is not configured.');
  const { data, error } = await db.functions.invoke('kenz-livekit-token', { body: { channelId } });
  if (error) throw error;
  if (!data?.token || !data?.serverUrl) throw new Error(data?.error || 'Channel media relay is not configured.');

  const room = new Room({ adaptiveStream: true, dynacast: true });
  let currentMeta: TransferMeta | null = null;
  let chunks: BlobPart[] = [];
  const handleData = (payload: Uint8Array, _participant: unknown, _kind: unknown, packetTopic?: string) => {
    if (packetTopic !== topic || !payload?.length) return;
    if (payload[0] === 0) {
      let message: any;
      try { message = JSON.parse(decoder.decode(payload.subarray(1))); } catch { return; }
      if (message.kind === 'meta') {
        currentMeta = message as TransferMeta;
        chunks = [];
      } else if (message.kind === 'end' && currentMeta) {
        const blob = new Blob(chunks, { type: currentMeta.mime });
        if (blob.size === currentMeta.size) {
          onFile({ postId: currentMeta.postId, file: new File([blob], currentMeta.name, { type: currentMeta.mime }) });
        }
        currentMeta = null;
        chunks = [];
      }
      return;
    }
    if (payload[0] === 1 && currentMeta) {
      chunks.push(payload.slice(1));
    }
  };
  room.on(RoomEvent.DataReceived, handleData);
  await room.connect(data.serverUrl, data.token, { autoSubscribe: true });

  return {
    channelId,
    onlinePeers: () => room.remoteParticipants.size,
    sendFile: async (postId, file) => {
      if (file.size > 30 * 1024 * 1024) throw new Error('P2P media limit is 30 MB per file.');
      const online = room.remoteParticipants.size;
      if (!online) return { online: 0, relayed: false };
      const meta: TransferMeta = { kind: 'meta', postId, name: file.name, mime: file.type, size: file.size };
      await room.localParticipant.publishData(controlPacket(meta), { reliable: true, topic });
      const chunkSize = 12 * 1024;
      for (let offset = 0; offset < file.size; offset += chunkSize) {
        const bytes = new Uint8Array(await file.slice(offset, Math.min(offset + chunkSize, file.size)).arrayBuffer());
        await room.localParticipant.publishData(binaryPacket(bytes), { reliable: true, topic });
      }
      await room.localParticipant.publishData(controlPacket({ kind: 'end', postId }), { reliable: true, topic });
      return { online, relayed: true };
    },
    close: () => {
      room.removeAllListeners();
      void room.disconnect();
    },
  };
}
