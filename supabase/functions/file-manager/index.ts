import { createClient } from 'npm:@supabase/supabase-js@2';
const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
function reply(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...headers,'Content-Type':'application/json'}})}
async function erase(file:{id:string;path:string}){
 const {error:mark}=await admin.from('files').update({status:'deleting'}).eq('id',file.id);if(mark)throw mark;
 if(new Date((file as {created_at?:string}).created_at||0).getTime()>Date.now()-3*3600000)return false;
 const {error}=await admin.storage.from('uploads').remove([file.path]);if(error)throw error;
 const {error:db}=await admin.from('files').delete().eq('id',file.id);if(db)throw db;
 return true;
}
async function cleanup(required=0){
 const {data,error}=await admin.from('files').select('*').order('created_at');if(error)throw error;
 const charged=(f:{created_at:string;size:number})=>new Date(f.created_at).getTime()>Date.now()-3*3600000?20000000:Number(f.size);
 let used=(data||[]).reduce((n,f)=>n+charged(f),0);
 const survivors=[];
 for(const file of data||[]){
  const expired=new Date(file.expires_at).getTime()<Date.now();
  // Signed upload URLs last 2 hours. Never release pending reservations sooner.
  const abandoned=file.status==='pending'&&new Date(file.created_at).getTime()<Date.now()-3*3600000;
  if(expired||abandoned||file.status==='deleting'){if(await erase(file))used-=charged(file)}
  else survivors.push(file);
 }
 // Only evict non-expired files after all expired objects have been removed.
 for(const file of survivors){
  if(required>0&&used+required>800000000&&file.status==='ready'){if(await erase(file))used-=charged(file)}
 }

}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers});
 if(req.method!=='POST')return reply({error:'Method not allowed'},405);
 try{
  const body=await req.json();const token=(req.headers.get('Authorization')||'').replace(/^Bearer /,'');
  if(body.action==='cleanup'){
   const secret=Deno.env.get('CLEANUP_SECRET');if(!secret||token!==secret)return reply({error:'Unauthorized'},401);
   await cleanup();return reply({ok:true});
  }
  if(body.action==='download'){
   if(typeof body.token!=='string'||!/^[a-f0-9]{48}$/.test(body.token))return reply({error:'Invalid link'},400);
   const {data:file}=await admin.from('files').select('*').eq('share_token',body.token).eq('status','ready').gt('expires_at',new Date().toISOString()).maybeSingle();
   if(!file)return reply({error:'This file has expired or was removed.'},404);
   const {data,error}=await admin.storage.from('uploads').createSignedUrl(file.path,60,{download:file.name});if(error)throw error;
   return reply({url:data.signedUrl});
  }
  if(typeof body.guest_key!=='string'||!/^[a-f0-9]{64}$/.test(body.guest_key))return reply({error:'A private browser key is required.'},401);
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(body.guest_key));
  const ownerKey=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
  const publicFields='id,name,size,created_at,expires_at,share_token,status';
  if(body.action==='list'){
   const {data,error}=await admin.from('files').select(`${publicFields},owner_key`).eq('status','ready').gt('expires_at',new Date().toISOString()).order('created_at',{ascending:false}).limit(100);if(error)throw error;
   const {data:usage,error:usageError}=await admin.rpc('storage_usage');if(usageError)throw usageError;
   const files=(data||[]).map(({owner_key,...file})=>({...file,owned:owner_key===ownerKey}));
   return reply({files,usage});
  }
  if(body.action==='reserve'){
   if(typeof body.name!=='string'||!body.name.trim()||body.name.length>255||!Number.isSafeInteger(body.size)||body.size<1||body.size>20000000)return reply({error:'Invalid file. Maximum size is 20 MB.'},400);
   const {count,error:rateError}=await admin.from('files').select('id',{count:'exact',head:true}).eq('owner_key',ownerKey).gt('created_at',new Date(Date.now()-3600000).toISOString());
   if(rateError)throw rateError;
   if((count||0)>=10)return reply({error:'Upload limit reached. Try again later.'},429);
   await cleanup(20000000);
   const {data:file,error}=await admin.rpc('reserve_guest_upload',{p_owner:ownerKey,p_name:body.name,p_size:body.size});if(error)throw error;
   const {data:upload,error:urlError}=await admin.storage.from('uploads').createSignedUploadUrl(file.path);if(urlError)throw urlError;
   return reply({id:file.id,upload_url:upload.signedUrl});
  }
  if(body.action==='delete'||body.action==='complete'){
   const {data:file}=await admin.from('files').select('*').eq('id',body.id).eq('owner_key',ownerKey).maybeSingle();if(!file)return reply({error:'File not found.'},404);
   if(body.action==='delete'){
    // Pending signed URLs cannot be revoked: retain quota until they expire.
    if(file.status==='pending'){return reply({ok:true,pending_cleanup:true})}
    await erase(file);return reply({ok:true});
   }
   if(file.status!=='pending')return reply({error:'Upload is no longer pending.'},409);
   const parts=file.path.split('/');const {data:objects,error}=await admin.storage.from('uploads').list(parts[0],{search:parts[1]});if(error)throw error;
   const object=objects?.find(o=>o.name===parts[1]);if(!object||Number(object.metadata?.size)!==Number(file.expected_size))return reply({error:'Uploaded size did not match the reservation.'},400);
   const {data:ready,error:update}=await admin.from('files').update({status:'ready',size:file.expected_size}).eq('id',file.id).eq('status','pending').select(publicFields).single();if(update)throw update;
   return reply({file:{...ready,owned:true}});
  }
  return reply({error:'Unknown action'},400);
 }catch(e){console.error(e);return reply({error:e instanceof Error?e.message:'The request could not be completed.'},400)}
});
