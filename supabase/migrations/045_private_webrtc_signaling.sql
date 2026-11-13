-- Short-lived WebRTC signaling only. SDP/ICE messages are Broadcast events and are
-- not inserted into Postgres. Media bytes travel over the WebRTC DataChannel.
-- A session code is a bearer capability: only share it with the intended recipient.
alter table realtime.messages enable row level security;

drop policy if exists "Kenz authenticated P2P session read" on realtime.messages;
create policy "Kenz authenticated P2P session read"
on realtime.messages
for select
to authenticated
using (
  extension = 'broadcast'
  and case
    when realtime.topic() ~ '^kenz-p2p:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}:[0-9]{10}
);

drop policy if exists "Kenz authenticated P2P session write" on realtime.messages;
create policy "Kenz authenticated P2P session write"
on realtime.messages
for insert
to authenticated
with check (
  extension = 'broadcast'
  and realtime.topic() ~ '^kenz-p2p:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}:[0-9]{10}$'
  and split_part(realtime.topic(), ':', 3)::bigint > extract(epoch from now())::bigint
  and split_part(realtime.topic(), ':', 3)::bigint <= extract(epoch from now() + interval '11 minutes')::bigint
);

    then split_part(realtime.topic(), ':', 3)::bigint > extract(epoch from now())::bigint
      and split_part(realtime.topic(), ':', 3)::bigint <= extract(epoch from now() + interval '11 minutes')::bigint
    else false
  end
);

drop policy if exists "Kenz authenticated P2P session write" on realtime.messages;
create policy "Kenz authenticated P2P session write"
on realtime.messages
for insert
to authenticated
with check (
  extension = 'broadcast'
  and case
    when realtime.topic() ~ '^kenz-p2p:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}:[0-9]{10}
);

    then split_part(realtime.topic(), ':', 3)::bigint > extract(epoch from now())::bigint
      and split_part(realtime.topic(), ':', 3)::bigint <= extract(epoch from now() + interval '11 minutes')::bigint
    else false
  end
);
