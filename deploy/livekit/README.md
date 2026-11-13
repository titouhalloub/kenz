# Kenz LiveKit SFU + TURN deployment

Kenz uses LiveKit as the WebRTC Selective Forwarding Unit (SFU). The SFU receives a creator's camera/microphone tracks once and forwards them to subscribed viewers. The LiveKit embedded TURN service provides relay connectivity for restrictive networks. Channel photo/video posts use the private Supabase Storage bucket so media remains available after the live session ends; live camera video is real-time WebRTC and is not recorded by default.

## Requirements

- A Linux VM with a public IPv4 address and Docker Compose v2.
- A domain you control, with DNS A records for `live.example.com` and `turn.example.com` pointing to that VM.
- A trusted TLS certificate for `turn.example.com`. LiveKit TURN/TLS must use a publicly trusted certificate.
- Firewall access for TCP 80, 443, 7881, 5349; UDP 3478 and 50000-60000.

A single small VM is suitable only for initial testing. Real traffic needs bandwidth and CPU capacity; scale the SFU separately as viewer counts grow.

## Configure the server

1. Copy `livekit.yaml.example` to `livekit.yaml` and `Caddyfile.example` to `Caddyfile`.
2. Replace both hostnames with your DNS names.
3. Generate a strong API key and secret on the server. Put the same key/secret pair in the `keys` map in `livekit.yaml`. Never commit the real file.
4. Obtain a trusted certificate for the TURN hostname and ensure the paths in `livekit.yaml` point to its `fullchain.pem` and `privkey.pem`. The certificate must renew automatically.
5. Start the services with `docker compose up -d`.
6. Check `docker compose logs -f livekit caddy`.

LiveKit's WSS endpoint is `wss://live.example.com`. The embedded TURN endpoints are advertised on UDP 3478 and TLS 5349. Open all ports listed above in both the VM firewall and cloud firewall.

## Configure Supabase

In Supabase Dashboard → Edge Functions → Secrets, set:

- `LIVEKIT_URL` = `wss://live.example.com`
- `LIVEKIT_API_KEY` = the API key from `livekit.yaml`
- `LIVEKIT_API_SECRET` = the matching API secret from `livekit.yaml`

The deployed `kenz-livekit-token` Edge Function signs short-lived participant JWTs after checking the authenticated user's channel ownership or public live-room access. Do not put the API secret in Vite variables, the APK, or any client code.

## Kenz client behavior

- Channel owners can start a public live room from their channel.
- Viewers can join a live room with subscribe-only tokens.
- Only the channel owner receives publish permission.
- Ending the stream closes the room listing; the SFU room is closed when participants disconnect.
- Image/video posts upload to the private `kenz-channel-media` bucket, with row-level and object-level ownership policies.
- File upload limit is 200 MB; accepted types are JPEG, PNG, WebP, AVIF, MP4, WebM and QuickTime.

## Important operational notes

- TURN relays media and consumes bandwidth. It is not a free unlimited bandwidth service.
- The included compose file is a single-node starter deployment, not a TikTok-scale cluster.
- Do not enable recording or public recording URLs without a separate consent and retention design.
- Keep server keys and TLS private keys out of Git. Back up the VM config securely.
