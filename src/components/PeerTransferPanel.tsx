import React, { useEffect, useState } from 'react';
import { createPeerSessionCode, PeerTransferSession, type ReceivedPeerFile } from '../services/peerTransfer';

interface Props { enabled: boolean; }
export const PeerTransferPanel: React.FC<Props> = ({ enabled }) => {
  const [code, setCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [session, setSession] = useState<PeerTransferSession | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [received, setReceived] = useState<ReceivedPeerFile | null>(null);
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState({ sent: 0, total: 0 });
  const [busy, setBusy] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState('');

  useEffect(() => {
    if (!received) { setDownloadUrl(''); return; }
    const url = URL.createObjectURL(received.blob);
    setDownloadUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [received]);

  useEffect(() => () => session?.close(), [session]);

  const callbacks = {
    onStatus: (value: string) => setStatus(value),
    onReceived: (value: ReceivedPeerFile) => setReceived(value),
    onProgress: (sent: number, total: number) => setProgress({ sent, total }),
  };

  const startSender = async () => {
    setBusy(true); setStatus('');
    try {
      const invite = createPeerSessionCode();
      const connection = await PeerTransferSession.connect(invite, 'sender', callbacks);
      setSession(connection); setCode(invite); setStatus('Direct channel created. Send this short-lived code to the recipient inside Kenz.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not create a direct channel.');
    } finally { setBusy(false); }
  };

  const joinReceiver = async () => {
    setBusy(true); setStatus('');
    try {
      const connection = await PeerTransferSession.connect(joinCode, 'receiver', callbacks);
      setSession(connection); setStatus('Joined. Waiting for the sender to establish the direct connection.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not join this channel.');
    } finally { setBusy(false); }
  };

  const send = async () => {
    if (!session || !file) return;
    setBusy(true);
    try { await session.sendFile(file); }
    catch (error) { setStatus(error instanceof Error ? error.message : 'Transfer failed.'); }
    finally { setBusy(false); }
  };

  const close = () => {
    session?.close(); setSession(null); setCode(''); setJoinCode(''); setFile(null); setProgress({ sent: 0, total: 0 });
    setStatus('Direct channel closed.');
  };

  if (!enabled) return null;
  return (
    <section className="rounded-2xl border border-cyan-900/70 bg-slate-900 p-4 space-y-3">
      <div>
        <h2 className="text-sm font-bold text-cyan-200">Kenz Direct · WebRTC</h2>
        <p className="mt-1 text-[11px] text-slate-400">Transfer a photo or short clip directly between two connected devices. Kenz does not upload or store the file.</p>
      </div>
      {!session ? <div className="grid grid-cols-1 gap-2">
        <button disabled={busy} onClick={() => void startSender()} className="min-h-[40px] rounded-lg bg-cyan-800 text-white text-xs font-semibold disabled:opacity-50">Create a direct channel</button>
        <div className="flex gap-2">
          <input value={joinCode} onChange={(event) => setJoinCode(event.target.value)} placeholder="Paste the Kenz channel code" className="min-w-0 flex-1 h-10 rounded-lg bg-slate-950 border border-slate-700 px-3 text-xs text-white" />
          <button disabled={busy || !joinCode.trim()} onClick={() => void joinReceiver()} className="rounded-lg border border-cyan-800 px-3 text-xs text-cyan-200 disabled:opacity-50">Join</button>
        </div>
      </div> : <div className="space-y-2">
        {code && <div className="rounded-lg bg-slate-950 p-3">
          <p className="text-[10px] text-slate-400">Invite code · expires in 10 minutes</p>
          <p className="mt-1 break-all font-mono text-xs text-cyan-200">{code}</p>
          <button onClick={() => { void navigator.clipboard?.writeText(code); setStatus('Channel code copied.'); }} className="mt-2 text-[11px] text-cyan-300">Copy code</button>
        </div>}
        <input type="file" accept="image/*,video/mp4,video/webm" onChange={(event) => setFile(event.target.files?.[0] || null)} className="block w-full text-[11px] text-slate-300 file:mr-2 file:rounded-md file:border-0 file:bg-slate-700 file:px-3 file:py-2 file:text-xs file:text-white" />
        {file && <p className="text-[10px] text-slate-400">{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</p>}
        <button disabled={busy || !file} onClick={() => void send()} className="w-full min-h-[40px] rounded-lg bg-cyan-800 text-white text-xs disabled:opacity-50">Send directly to connected device</button>
        <button onClick={close} className="w-full min-h-[36px] rounded-lg border border-slate-700 text-xs text-slate-300">Close channel</button>
      </div>}
      {progress.total > 0 && <div className="space-y-1">
        <div className="h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full bg-cyan-500" style={{ width: `${Math.min(100, progress.sent / progress.total * 100)}%` }} /></div>
        <p className="text-[10px] text-slate-400">{(progress.sent / 1024 / 1024).toFixed(2)} / {(progress.total / 1024 / 1024).toFixed(2)} MB</p>
      </div>}
      {downloadUrl && received && <a href={downloadUrl} download={received.name} className="block rounded-lg border border-emerald-800 bg-emerald-950/30 p-3 text-xs text-emerald-200">Received {received.name} · Tap to save on this device</a>}
      {status && <p className="text-[11px] text-cyan-200" role="status">{status}</p>}
      <p className="text-[10px] text-slate-500">Direct connections can fail on some networks. This first version uses STUN only (no media relay), which can expose your public network IP to the peer. Only use it with someone you know and trust. Both users must be online, signed in and join the temporary invite channel.</p>
    </section>
  );
};
