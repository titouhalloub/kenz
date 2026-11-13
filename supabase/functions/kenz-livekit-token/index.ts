import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { AccessToken } from "npm:livekit-server-sdk@2.19.2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const respond=(status:number,body:Record<string,unknown>)=>new Response(JSON.stringify(body),{status,headers:cors});
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
 if(req.method!=="POST") return respond(405,{error:"Method not allowed"});
 try {
  const bearer=req.headers.get("Authorization")?.match(/^Bearer\\s+(.+)$/i)?.[1];
  if(!bearer) return respond(401,{error:"Sign in is required."});
  const supabaseUrl=Deno.env.get("SUPABASE_URL"), anonKey=Deno.env.get("SUPABASE_ANON_KEY");
  const livekitUrl=Deno.env.get("LIVEKIT_URL"), apiKey=Deno.env.get("LIVEKIT_API_KEY"), apiSecret=Deno.env.get("LIVEKIT_API_SECRET");
  if(!supabaseUrl||!anonKey) return respond(500,{error:"Supabase function configuration is incomplete."});
  if(!livekitUrl||!apiKey||!apiSecret) return respond(503,{error:"Live streaming is not configured. Add LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET."});
  const supabase=createClient(supabaseUrl,anonKey,{global:{headers:{Authorization:"Bearer "+bearer}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:authData,error:authError}=await supabase.auth.getUser(bearer);
  if(authError||!authData.user) return respond(401,{error:"Your session is invalid or expired."});
  const body=await req.json().catch(()=>({}));
  const roomId=typeof body.roomId==="string"?body.roomId:"";
  const role=body.role==="host"?"host":"viewer";
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(roomId)) return respond(400,{error:"A valid live room is required."});
  const {data:room,error:roomError}=await supabase.from("kenz_channel_live_rooms").select("id,channel_id,host_id,room_name,title,status,kenz_channels!inner(owner_id,is_public)").eq("id",roomId).maybeSingle();
  if(roomError||!room) return respond(404,{error:"Live room was not found or is not visible."});
  const channel=Array.isArray(room.kenz_channels)?room.kenz_channels[0]:room.kenz_channels;
  const isHost=room.host_id===authData.user.id&&channel?.owner_id===authData.user.id;
  if(role==="host"&&(!isHost||room.status!=="live")) return respond(403,{error:"Only the channel owner can publish this stream."});
  if(role==="viewer"&&(room.status!=="live"||!channel?.is_public)) return respond(403,{error:"This live stream is not publicly available."});
  const token=new AccessToken(apiKey,apiSecret,{identity:authData.user.id,ttl:"1h"});
  token.addGrant({roomJoin:true,room:room.room_name,canPublish:role==="host"&&isHost,canSubscribe:true,canPublishData:false});
  return respond(200,{token:await token.toJwt(),serverUrl:livekitUrl,role,roomTitle:room.title});
 } catch(error) {
  console.error("kenz-livekit-token",error);
  return respond(500,{error:"Unable to prepare the live stream."});
 }
});