import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.3";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const respond=(status:number,body:Record<string,unknown>)=>new Response(JSON.stringify(body),{status,headers:cors});
const toBase64=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes));
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
 if(req.method!=="POST") return respond(405,{error:"Method not allowed"});
 try {
  const bearer=req.headers.get("Authorization")?.match(/^Bearer\\s+(.+)$/i)?.[1];
  if(!bearer) return respond(401,{error:"Sign in is required."});
  const url=Deno.env.get("SUPABASE_URL"), anon=Deno.env.get("SUPABASE_ANON_KEY");
  const turnHost=Deno.env.get("TURN_HOST"), turnSecret=Deno.env.get("TURN_SHARED_SECRET");
  if(!url||!anon) return respond(500,{error:"Supabase function configuration is incomplete."});
  if(!turnHost||!turnSecret) return respond(503,{error:"Peer media relay is not configured. Add TURN_HOST and TURN_SHARED_SECRET."});
  const db=createClient(url,anon,{global:{headers:{Authorization:"Bearer "+bearer}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await db.auth.getUser(bearer);
  if(error||!data.user) return respond(401,{error:"Your session is invalid or expired."});
  const expiry=Math.floor(Date.now()/1000)+600, username=expiry+":"+data.user.id;
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(turnSecret),{name:"HMAC",hash:"SHA-1"},false,["sign"]);
  const signature=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(username));
  return respond(200,{iceServers:[{urls:["stun:stun.l.google.com:19302"]},{urls:["turn:"+turnHost+":3479?transport=udp","turns:"+turnHost+":5350?transport=tcp"],username,credential:toBase64(new Uint8Array(signature))}],expiresAt:new Date(expiry*1000).toISOString()});
 } catch(error) {
  console.error("kenz-webrtc-ice-credentials",error);
  return respond(500,{error:"Unable to create temporary peer connection credentials."});
 }
});