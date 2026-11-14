# Video channels (P2P-assisted delivery)

Plan: the "Kenz Channels — Peer-to-Peer Video & Live Plan" document. This file records what is built and how to deploy it.

## Built (branch `feat/price-simulator-community`)
- `supabase/migrations/051_video_channels.sql`: videos, follows, likes, comments, reports, creator storage mirrors, sharing settings, playback stats, RLS, moderator function, buckets `channel-staging` (private) and `channel-origin` (public).
- `src/domain/channels/*`: signed manifests (ECDSA P-256), segment hash validation, mirror endpoint allow-list (SSRF guard) and failover, opt-in sharing policy, upload limits. Unit tested.
- `src/server/videoPipeline.ts`: ffmpeg to fMP4 HLS, 4 s segments, metadata stripped, hashes. Tested against real ffmpeg.
- `src/server/channelRoutes.ts`: upload to staging, moderator approve (re-hash, sign, publish to origin, copy to creator mirrors), reject/remove (deletes public copies), playback info, connect/disconnect S3-compatible mirrors (credentials sealed with AES-256-GCM).
- `src/services/p2pPlayback.ts`, `ChannelPlayer.tsx`, `ChannelsView.tsx`: hls.js + P2P Media Loader, every playlist/segment verified against the signed manifest, mirror then origin fallback, tracker-based peers, feed with For you / Following / Short / Long, upload, like, follow, comments, report, block, sharing settings, storage mirrors, moderator queue.

## Deploy checklist
1. `node scripts/generate-channel-keys.mjs`; set `CHANNEL_SIGNING_PRIVATE_KEY`, `CHANNEL_MASTER_KEY`, `SUPABASE_SERVICE_ROLE_KEY` on the server, and `VITE_CHANNEL_SIGNING_PUBLIC_KEY`, `VITE_CHANNEL_TRACKERS` (comma-separated `wss://` tracker URLs), optional `VITE_CHANNEL_STUN` in the app build.
2. Server needs `ffmpeg` and `ffprobe` on PATH (Supabase alone cannot transcode).
3. Apply migration 051 (it follows 044 on this branch; main has its own 045–050).
4. Add moderators to `community_moderators`.
5. Run the Phase-0 gate on three real Android phones before relying on P2P savings: playback, rejection of a bad piece, origin fallback.

## Not done / not verified
- Live streaming (Phase 3 in the plan) is not built.
- P2P in the Android WebView is not verified on a device; with no tracker configured the player runs origin/mirror only.
- No TURN server; peers behind strict NATs fall back to origin/mirrors.
- Mirror deletion on takedown is best-effort; large videos finish copying after approval, not before.
- Migration 051 has not been applied to any database.
