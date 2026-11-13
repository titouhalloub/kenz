import { getSupabaseClient } from './supabase';

const SESSION_LIFETIME_SECONDS = 10 * 60;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const CHUNK_BYTES = 16 * 1024;
const RTC_CONFIGURATION: RTCConfiguration = {
  iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }],
};

export type PeerTransferRole = 'sender' | 'receiver';
export interface ReceivedPeerFile { blob: Blob; name: string; mimeType: string; }
export interface PeerTransferCallbacks {
  onStatus?: (status: string) => void;
  onReceived?: (file: ReceivedPeerFile) => void;
  onProgress?: (sent: number, total: number) => void;
}

export function createPeerSessionCode(): string {
  const expires = Math.floor(Date.now() / 1000) + SESSION_LIFETIME_SECONDS;
  return `${crypto.randomUUID()}.${expires}`;
}

function parseSessionCode(code: string): { topic: string; expires: number } {
  const match = code.trim().match(/^([0-9a-f-]{36})\.(\d{10})$/i);
  if (!match) throw new Error('Invalid direct-channel code.');
  const expires = Number(match[2]);
  const now = Math.floor(Date.now() / 1000);
  if (expires <= now || expires > now + SESSION_LIFETIME_SECONDS + 30) {
    throw new Error('This direct-channel code has expired or is invalid.');
  }
  return { topic: `kenz-p2p:${match[1].toLowerCase()}:${expires}`, expires };
}

export class PeerTransferSession {
  private peer: RTCPeerConnection;
  private data: RTCDataChannel | null = null;
  private realtime: ReturnType<NonNullable<ReturnType<typeof getSupabaseClient>>['channel']>;
  private closed = false;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private receivedParts: BlobPart[] = [];
  private incomingMeta: { name: string; mimeType: string; size: number } | null = null;
  private receivedBytes = 0;

  private constructor(
    private role: PeerTransferRole,
    private callbacks: PeerTransferCallbacks,
    private client: NonNullable<ReturnType<typeof getSupabaseClient>>,
    topic: string,
  ) {
    this.peer = new RTCPeerConnection(RTC_CONFIGURATION);
    this.realtime = client.channel(topic, { config: { private: true, broadcast: { ack: true, self: false } } });
  }

  static async connect(code: string, role: PeerTransferRole, callbacks: PeerTransferCallbacks = {}) {
    const { topic } = parseSessionCode(code);
    const client = getSupabaseClient();
    if (!client) throw new Error('Kenz realtime service is not configured.');
    const { data: session } = await client.auth.getSession();
    if (!session.session?.user?.id) throw new Error('Sign in to Kenz before opening a direct channel.');
    await client.realtime.setAuth(session.session.access_token);
    const transfer = new PeerTransferSession(role, callbacks, client, topic);
    await transfer.start();
    return transfer;
  }

  private async start() {
    this.peer.onicecandidate = ({ candidate }) => {
      if (candidate) void this.signal({ type: 'candidate', candidate: candidate.toJSON() });
    };
    this.peer.onconnectionstatechange = () => {
      const state = this.peer.connectionState;
      this.callbacks.onStatus?.(state === 'connected' ? 'Direct device connection established.' : `Connection: ${state}`);
      if (state === 'failed' || state === 'closed') this.close();
    };
    this.peer.ondatachannel = (event) => this.attachDataChannel(event.channel);

    this.realtime.on('broadcast', { event: 'signal' }, ({ payload }) => {
      void this.handleSignal(payload as Record<string, unknown>);
    });
    await new Promise<void>((resolve, reject) => {
      this.realtime.subscribe((status, error) => {
        if (status === 'SUBSCRIBED') resolve();
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          reject(error || new Error(`Signaling channel: ${status}`));
        }
      });
    });

    if (this.role === 'sender') {
      this.attachDataChannel(this.peer.createDataChannel('kenz-file-transfer', { ordered: true }));
      const offer = await this.peer.createOffer();
      await this.peer.setLocalDescription(offer);
      await this.signal({ type: 'offer', description: offer });
      this.callbacks.onStatus?.('Waiting for the other device to join this channel.');
    } else {
      this.callbacks.onStatus?.('Channel joined. Waiting for the sender.');
    }
  }

  private attachDataChannel(channel: RTCDataChannel) {
    this.data = channel;
    channel.binaryType = 'arraybuffer';
    channel.bufferedAmountLowThreshold = 256 * 1024;
    channel.onopen = () => this.callbacks.onStatus?.('Direct channel ready. Files are sent between devices.');
    channel.onclose = () => this.callbacks.onStatus?.('Direct channel closed.');
    channel.onerror = () => this.callbacks.onStatus?.('Direct data channel error.');
    channel.onmessage = (event) => this.handleData(event.data);
  }

  private async signal(payload: Record<string, unknown>) {
    if (this.closed) return;
    const { error } = await this.realtime.send({ type: 'broadcast', event: 'signal', payload });
    if (error) throw error;
  }

  private async handleSignal(payload: Record<string, unknown>) {
    if (this.closed) return;
    try {
      if (payload.type === 'ready' && this.role === 'sender' && this.peer.localDescription) {\n        await this.signal({ type: 'offer', description: this.peer.localDescription.toJSON() });\n      } else if (payload.type === 'offer' && this.role === 'receiver') {
        const description = payload.description as RTCSessionDescriptionInit;
        await this.peer.setRemoteDescription(description);
        const answer = await this.peer.createAnswer();
        await this.peer.setLocalDescription(answer);
        await this.signal({ type: 'answer', description: answer });
        await this.flushCandidates();
      } else if (payload.type === 'answer' && this.role === 'sender') {
        await this.peer.setRemoteDescription(payload.description as RTCSessionDescriptionInit);
        await this.flushCandidates();
      } else if (payload.type === 'candidate') {
        const candidate = payload.candidate as RTCIceCandidateInit;
        if (this.peer.remoteDescription) await this.peer.addIceCandidate(candidate);
        else this.pendingCandidates.push(candidate);
      }
    } catch (error) {
      this.callbacks.onStatus?.(error instanceof Error ? error.message : 'WebRTC signaling failed.');
    }
  }

  private async flushCandidates() {
    for (const candidate of this.pendingCandidates.splice(0)) await this.peer.addIceCandidate(candidate);
  }

  private handleData(data: unknown) {
    if (typeof data === 'string') {
      try {
        const message = JSON.parse(data) as Record<string, unknown>;
        if (message.type === 'file-start') {
          this.receivedParts = [];
          this.receivedBytes = 0;
          this.incomingMeta = {
            name: String(message.name || 'kenz-file'),
            mimeType: String(message.mimeType || 'application/octet-stream'),
            size: Number(message.size) || 0,
          };
          this.callbacks.onProgress?.(0, this.incomingMeta.size);
        } else if (message.type === 'file-end' && this.incomingMeta) {
          const blob = new Blob(this.receivedParts, { type: this.incomingMeta.mimeType });
          if (blob.size === this.incomingMeta.size) {
            this.callbacks.onReceived?.({ blob, name: this.incomingMeta.name, mimeType: this.incomingMeta.mimeType });
            this.callbacks.onStatus?.('File received directly from the other device.');
          } else {
            this.callbacks.onStatus?.('Transfer incomplete: received file size does not match.');
          }
          this.incomingMeta = null;
          this.receivedParts = [];
        }
      } catch {
        this.callbacks.onStatus?.('Received an invalid transfer message.');
      }
    } else if (data instanceof ArrayBuffer && this.incomingMeta) {
      this.receivedParts.push(data);
      this.receivedBytes += data.byteLength;
      this.callbacks.onProgress?.(this.receivedBytes, this.incomingMeta.size);
    }
  }

  async sendFile(file: File) {
    if (file.size <= 0 || file.size > MAX_FILE_BYTES) throw new Error('Choose a file between 1 byte and 25 MB.');
    if (!this.data || this.data.readyState !== 'open') throw new Error('The other device is not connected yet.');
    this.data.send(JSON.stringify({ type: 'file-start', name: file.name.slice(0, 120), mimeType: file.type || 'application/octet-stream', size: file.size }));
    let sent = 0;
    while (sent < file.size) {
      if (this.closed || this.data.readyState !== 'open') throw new Error('Transfer was interrupted.');
      if (this.data.bufferedAmount > 512 * 1024) {
        await new Promise<void>((resolve) => {
          const current = this.data;
          if (!current) return resolve();
          current.addEventListener('bufferedamountlow', () => resolve(), { once: true });
        });
      }
      const chunk = await file.slice(sent, sent + CHUNK_BYTES).arrayBuffer();
      this.data.send(chunk);
      sent += chunk.byteLength;
      this.callbacks.onProgress?.(sent, file.size);
    }
    this.data.send(JSON.stringify({ type: 'file-end' }));
    this.callbacks.onStatus?.('File sent directly to the other device.');
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.data?.close();
    this.peer.close();
    void this.client.removeChannel(this.realtime);
  }
}
