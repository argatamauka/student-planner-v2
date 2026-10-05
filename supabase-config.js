const SUPABASE_URL="https://yhbqnnwqpmwrealftejl.supabase.co";
const SUPABASE_KEY="sb_publishable_pGEWEgVoIJRhyMxJV7wyog_Sazd22l3";
const SUPABASE_REF="yhbqnnwqpmwrealftejl";

function readOfflineSupabaseSession(){
  const base="sb-"+SUPABASE_REF+"-auth-token";
  let raw=localStorage.getItem(base);
  if(!raw){
    const parts=Object.keys(localStorage)
      .filter(k=>k.startsWith(base+"."))
      .sort((a,b)=>Number(a.split(".").pop())-Number(b.split(".").pop()))
      .map(k=>localStorage.getItem(k)||"");
    if(parts.length)raw=parts.join("");
  }
  if(!raw)return null;
  try{
    if(raw.startsWith("base64-")){
      let b=raw.slice(7).replace(/-/g,"+").replace(/_/g,"/");
      while(b.length%4)b+="=";
      raw=decodeURIComponent(Array.prototype.map.call(atob(b),c=>"%"+c.charCodeAt(0).toString(16).padStart(2,"0")).join(""));
    }
    const value=JSON.parse(raw);
    return value?.currentSession||value?.session||value;
  }catch{return null}
}
function offlineAuthError(){return{message:"Tidak ada koneksi internet. Gunakan akun yang sebelumnya sudah pernah login di perangkat ini."}}
function createOfflineSupabaseFallback(){
  const authKey="sb-"+SUPABASE_REF+"-auth-token";
  const clearAuth=()=>Object.keys(localStorage).filter(k=>k===authKey||k.startsWith(authKey+".")).forEach(k=>localStorage.removeItem(k));
  return{
    __offlineFallback:true,
    auth:{
      async getSession(){return{data:{session:readOfflineSupabaseSession()},error:null}},
      onAuthStateChange(){return{data:{subscription:{unsubscribe(){}}}}},
      async signOut(){clearAuth();return{error:null}},
      async signInWithPassword(){return{data:{user:null,session:null},error:offlineAuthError()}},
      async signUp(){return{data:{user:null,session:null},error:offlineAuthError()}},
      async resetPasswordForEmail(){return{error:offlineAuthError()}},
      async updateUser(){return{data:{user:null},error:offlineAuthError()}}
    },
    channel(){return{on(){return this},subscribe(){return this}}},
    async removeChannel(){},
    from(){throw offlineAuthError()},
    rpc(){return Promise.resolve({data:null,error:offlineAuthError()})},
    storage:{from(){return{upload:async()=>({data:null,error:offlineAuthError()}),download:async()=>({data:null,error:offlineAuthError()})}}},
    functions:{invoke:async()=>({data:null,error:offlineAuthError()})}
  };
}
const sb=typeof supabase!=="undefined"
  ?supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}})
  :createOfflineSupabaseFallback();
window.sb=sb;
