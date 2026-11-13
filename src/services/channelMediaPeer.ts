import { getSupabaseClient } from './supabase';

export interface ReceivedKenzMedia {
  postId: string;
  file: File;
}
export interface KenzChannelMediaRoom {
  channelId: string;
  onlinePeers(): string[];
  sendFile(postId: string, file: File): Promise<{ online: number; sent: number }>;
  close(): void;
}
type Signal = {
  type: 'offer' | 'answer' | 'candidate' | 'complete';
  from: string;
  to: string;
  transferId: string;
  postId?: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};
type TransferMeta = { kind: 'meta'; postId: string; name: string; mime: string; size: number };
let cachedIceServers: RTCIceServer[] | null = null;
let iceExpiresAt = 0;

async function getPeerIceServers(): Promise<RTCIceServer[]> {
  if (cachedIceServers && Date.now() < iceExpiresAt - 30000) return cachedIceServers;
  const db = getSupabaseClient();
  if (!db) throw new Error('Supabase is not configured.');
  const { data, error } = await db.functions.invoke('kenz-webrtc-ice-credentials', { body: {} });
  if (error) throw error;
  if (!Array.isArray(data?.iceServers) || !data.iceServers.length) {
    throw new Error(data?.error || 'TURN credentials are not available.');
  }
  cachedIceServers = data.iceServers as RTCIceServer[];
  iceExpiresAt = data.expiresAt ? new Date(data.expiresAt).getTime() : Date.now() + 5 * 60 * 1000;
  return cachedIceServers;
}

export async function subscribeToKenzChannelMedia(
  channelId: string,
  userId: string,
  onFile: (media: ReceivedKenzMedia) => void,
): Promise<KenzChannelMediaRoom> {
  const db = getSupabaseClient();
  if (!db) throw new Error('Supabase is not configured.');
  const iceServers = await getPeerIceServers();
  const topic = 'kenz-media:' + channelId;
  const channel = db.channel(topic, { config: { private: true, presence: { key: userId } } });
  const connections = new Map<string, RTCPeerConnection>();
  const pendingIce = new Map<string, RTCIceCandidateInit[]>();
  const completion = new Map<string, (success: boolean) => void>();
  let closed = false;

  const sendSignal = async (signal: Omit<Signal, 'from'>) => {
    if (closed) return;
    await channel.send({
      type: 'broadcast',
      event: 'signal',
      payload: { ...signal, from: userId },
    });
  };
  const flushCandidates = async (transferId: string, pc: RTCPeerConnection) => {
    const queued = pendingIce.get(transferId) || [];
    pendingIce.delete(transferId);
    for (const candidate of queued) {
      try { await pc.addIceCandidate(candidate); } catch { /* stale ICE candidate */ }
    }
  };
  const attachIce = (transferId: string, to: string, pc: RTCPeerConnection) => {
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        void sendSignal({ type: 'candidate', to, transferId, candidate: event.candidate.toJSON() });
      }
    };
  };
  const attachReceiver = (transferId: string, from: string, dataChannel: RTCDataChannel) => {
    dataChannel.binaryType = 'arraybuffer';
    let meta: TransferMeta | null = null;
    const chunks: BlobPart[] = [];
    let received = 0;
    dataChannel.onmessage = async (event) => {
      if (typeof event.data === 'string') {
        let message: any;
        try { message = JSON.parse(event.data); } catch { return; }
        if (message.kind === 'meta') {
          meta = message as TransferMeta;
          return;
        }
        if (message.kind === 'end' && meta) {
          const blob = new Blob(chunks, { type: meta.mime });
          if (blob.size === meta.size) {
            const file = new File([blob], meta.name, { type: meta.mime });
            onFile({ postId: meta.postId, file });
            await sendSignal({ type: 'complete', to: from, transferId });
          }
          dataChannel.close();
          connections.get(transferId)?.close();
          connections.delete(transferId);
          return;
        }
      } else if (meta) {
        const part = event.data instanceof Blob ? await event.data.arrayBuffer() : event.data as ArrayBuffer;
        chunks.push(part);
        received += part.byteLength;
      }
    };
  };

  const handleSignal = async (raw: any) => {
    const signal = raw as Signal;
    if (closed || !signal || signal.to !== userId || signal.from === userId) return;
    try {
      if (signal.type === 'offer' && signal.sdp) {
        const pc = new RTCPeerConnection({ iceServers });
        connections.set(signal.transferId, pc);
        attachIce(signal.transferId, signal.from, pc);
        pc.ondatachannel = (event) => attachReceiver(signal.transferId, signal.from, event.channel);
        await pc.setRemoteDescription(signal.sdp);
        await flushCandidates(signal.transferId, pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await sendSignal({ type: 'answer', to: signal.from, transferId: signal.transferId, sdp: pc.localDescription || undefined });
        return;
      }
      const pc = connections.get(signal.transferId);
      if (signal.type === 'answer' && signal.sdp && pc) {
        await pc.setRemoteDescription(signal.sdp);
        await flushCandidates(signal.transferId, pc);
      } else if (signal.type === 'candidate' && signal.candidate) {
        if (pc?.remoteDescription) {
          await pc.addIceCandidate(signal.candidate);
        } else {
          const queue = pendingIce.get(signal.transferId) || [];
          queue.push(signal.candidate);
          pendingIce.set(signal.transferId, queue);
        }
      } else if (signal.type === 'complete') {
        completion.get(signal.transferId)?.(true);
      }
    } catch (error) {
      console.warn('Kenz P2P signal failed', error);
      completion.get(signal.transferId)?.(false);
    }
  };
  channel.on('broadcast', { event: 'signal' }, ({ payload }) => { void handleSignal(payload); });

  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('Media channel subscription timed out.')), 15000);
    channel.subscribe((status, error) => {
      if (status === 'SUBSCRIBED') {
        window.clearTimeout(timeout);
        resolve();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        window.clearTimeout(timeout);
        reject(error || new Error('Unable to join the private media channel.'));
      }
    });
  });
  await channel.track({ user_id: userId, joined_at: new Date().toISOString() });

  const sendToPeer = async (recipientId: string, postId: string, file: File): Promise<boolean> => {
    const transferId = crypto.randomUUID();
    const pc = new RTCPeerConnection({ iceServers });
    connections.set(transferId, pc);
    attachIce(transferId, recipientId, pc);
    const dc = pc.createDataChannel('kenz-media', { ordered: true });
    const opened = new Promise<boolean>((resolve) => {
      dc.addEventListener('open', () => resolve(true), { once: true });
      dc.addEventListener('error', () => resolve(false), { once: true });
      dc.addEventListener('close', () => resolve(false), { once: true });
    });
    const received = new Promise<boolean>((resolve) => completion.set(transferId, resolve));
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await sendSignal({ type: 'offer', to: recipientId, transferId, postId, sdp: pc.localDescription || undefined });

    const isOpen = await Promise.race([
      opened,
      new Promise<boolean>((resolve) => window.setTimeout(() => resolve(false), 20000)),
    ]);
    if (!isOpen) {
      pc.close(); connections.delete(transferId); completion.delete(transferId);
      return false;
    }

    const meta: TransferMeta = { kind: 'meta', postId, name: file.name, mime: file.type, size: file.size };
    dc.send(JSON.stringify(meta));
    const chunkSize = 16 * 1024;
    for (let offset = 0; offset < file.size; offset += chunkSize) {
      if (dc.readyState !== 'open') break;
      if (dc.bufferedAmount > 512 * 1024) {
        await new Promise<void>((resolve) => {
          dc.bufferedAmountLowThreshold = 256 * 1024;
          dc.addEventListener('bufferedamountlow', () => resolve(), { once: true });
        });
      }
      dc.send(await file.slice(offset, Math.min(offset + chunkSize, file.size)).arrayBuffer());
    }
    if (dc.readyState === 'open') dc.send(JSON.stringify({ kind: 'end' }));
    const success = await Promise.race([
      received,
      new Promise<boolean>((resolve) => window.setTimeout(() => resolve(false), 60000)),
    ]);
    completion.delete(transferId);
    pc.close(); connections.delete(transferId);
    return success;
  };

  return {
    channelId,
    onlinePeers: () => Object.keys(channel.presenceState()).filter((id) => id !== userId),
    sendFile: async (postId, file) => {
      if (file.size > 30 * 1024 * 1024) throw new Error('P2P media limit is 30 MB per file.');
      const peers = Object.keys(channel.presenceState()).filter((id) => id !== userId).slice(0, 8);
      let sent = 0;
      for (const recipient of peers) {
        if (await sendToPeer(recipient, postId, file)) sent += 1;
      }
      return { online: peers.length, sent };
    },
    close: () => {
      closed = true;
      for (const resolve of completion.values()) resolve(false);
      completion.clear();
      connections.forEach((pc) => pc.close());
      connections.clear();
      void db.removeChannel(channel);
    },
  };
}
