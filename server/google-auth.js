'use strict';
const GOOGLE_CLIENT_ID=String(process.env.GOOGLE_CLIENT_ID||'').trim();
async function verifyGoogleCredential(credential){
  const token=String(credential||'').trim();
  if(!GOOGLE_CLIENT_ID||!token)return {ok:false,reason:!GOOGLE_CLIENT_ID?'not_configured':'invalid'};
  const response=await fetch('https://oauth2.googleapis.com/tokeninfo?id_token='+encodeURIComponent(token));
  if(!response.ok)return {ok:false,reason:'invalid'};
  const data=await response.json();
  if(String(data.aud||'')!==GOOGLE_CLIENT_ID)return {ok:false,reason:'invalid'};
  if(String(data.iss||'')!=='https://accounts.google.com'&&String(data.iss||'')!=='accounts.google.com')return {ok:false,reason:'invalid'};
  if(String(data.sub||'').length<8)return {ok:false,reason:'invalid'};
  if(String(data.email_verified||'').toLowerCase()!=='true'&&data.email_verified!==true)return {ok:false,reason:'unverified'};
  if(Number(data.exp||0)*1000<=Date.now())return {ok:false,reason:'expired'};
  return {ok:true,sub:String(data.sub),email:String(data.email||'')};
}
module.exports={GOOGLE_CLIENT_ID,verifyGoogleCredential};
