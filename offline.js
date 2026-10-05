(function(){
const PREFIX="studentPlannerOfflineV1";

function key(userId,name){return PREFIX+":"+String(userId||"guest")+":"+name}
function read(userId,name,fallback=null){
  try{let v=localStorage.getItem(key(userId,name));return v?JSON.parse(v):fallback}catch{return fallback}
}
function write(userId,name,value){
  try{localStorage.setItem(key(userId,name),JSON.stringify(value));return true}catch{return false}
}
function uuid(){
  if(globalThis.crypto?.randomUUID)return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,c=>{
    let r=Math.random()*16|0,v=c==="x"?r:(r&3|8);return v.toString(16)
  });
}
function isNetworkError(error){
  if(navigator.onLine===false)return true;
  let m=String(error?.message||error||"").toLowerCase();
  return m.includes("failed to fetch")||m.includes("network")||m.includes("load failed")||m.includes("timeout")||m.includes("fetch");
}
function queue(userId,operation){
  let q=read(userId,"queue",[]);
  q.push({...operation,queued_at:Date.now()});
  write(userId,"queue",q);
  window.dispatchEvent(new CustomEvent("studentplanner:offlinequeue",{detail:{pending:q.length}}));
  return q.length;
}
function pending(userId){return read(userId,"queue",[]).length}
function removeFirst(userId,q){
  q.shift();write(userId,"queue",q);
  window.dispatchEvent(new CustomEvent("studentplanner:offlinequeue",{detail:{pending:q.length}}));
}
async function exec(sb,userId,op){
  const d=op.data||{};
  switch(op.kind){
    case "schedule_insert":{
      let{error}=await sb.from("schedules").insert({id:op.id,user_id:userId,...d});
      if(error&&error.code!=="23505")throw error;return;
    }
    case "schedule_update":{let{error}=await sb.from("schedules").update(d).eq("id",op.id);if(error)throw error;return}
    case "schedule_delete":{let{error}=await sb.from("schedules").delete().eq("id",op.id);if(error)throw error;return}
    case "task_insert":{
      let{error}=await sb.from("tasks").insert({id:op.id,user_id:userId,...d});
      if(error&&error.code!=="23505")throw error;return;
    }
    case "task_update":{let{error}=await sb.from("tasks").update(d).eq("id",op.id);if(error)throw error;return}
    case "task_delete":{let{error}=await sb.from("tasks").delete().eq("id",op.id);if(error)throw error;return}
    case "course_insert":{
      let{error}=await sb.from("courses").insert({id:op.id,user_id:userId,...d});
      if(error&&error.code!=="23505")throw error;return;
    }
    case "course_update":{let{error}=await sb.from("courses").update(d).eq("id",op.id);if(error)throw error;return}
    case "course_delete":{let{error}=await sb.from("courses").delete().eq("id",op.id);if(error)throw error;return}
    case "wallet_insert":{
      let{error}=await sb.from("wallets").insert({id:op.id,user_id:userId,...d});
      if(error&&error.code!=="23505")throw error;return;
    }
    case "wallet_delete":{let{error}=await sb.from("wallets").delete().eq("id",op.id);if(error)throw error;return}
    case "tx_record":{
      let{error}=await sb.rpc("record_transaction_offline",{
        p_transaction_id:op.id,
        p_wallet_id:d.wallet_id,
        p_amount:d.amount,
        p_type:d.type,
        p_category:d.category,
        p_tx_date:d.tx_date
      });if(error)throw error;return;
    }
    case "tx_update":{
      let{error}=await sb.rpc("update_transaction",{
        p_transaction_id:op.id,
        p_amount:d.amount,
        p_type:d.type,
        p_category:d.category,
        p_tx_date:d.tx_date
      });if(error)throw error;return;
    }
    case "tx_delete":{let{error}=await sb.rpc("delete_transaction",{p_transaction_id:op.id});if(error)throw error;return}
    case "savings_target":{
      let{error}=await sb.from("savings").upsert({user_id:userId,...d});if(error)throw error;return;
    }
    case "savings_deposit":{
      let{error}=await sb.rpc("deposit_savings",{p_wallet_id:d.wallet_id,p_amount:d.amount});if(error)throw error;return;
    }
    case "savings_withdraw":{
      let{error}=await sb.rpc("withdraw_savings",{p_wallet_id:d.wallet_id,p_amount:d.amount});if(error)throw error;return;
    }
    case "profile_update":{
      let{error}=await sb.from("profiles").upsert({user_id:userId,...d},{onConflict:"user_id"});if(error)throw error;return;
    }
    default: throw new Error("Unknown offline operation: "+op.kind);
  }
}
async function sync(sb,userId){
  let q=read(userId,"queue",[]);
  if(!q.length)return{synced:0,pending:0,error:null};
  if(navigator.onLine===false||sb?.__offlineFallback)return{synced:0,pending:q.length,error:null};
  let synced=0;
  while(q.length){
    try{
      await exec(sb,userId,q[0]);
      removeFirst(userId,q);
      synced++;
    }catch(error){
      if(isNetworkError(error))return{synced,pending:q.length,error:null};
      return{synced,pending:q.length,error};
    }
  }
  return{synced,pending:0,error:null};
}
function cache(userId,scope,value){return write(userId,"cache:"+scope,value)}
function cached(userId,scope,fallback=null){return read(userId,"cache:"+scope,fallback)}
function clearUser(userId){
  try{
    Object.keys(localStorage).filter(k=>k.startsWith(PREFIX+":"+userId+":")).forEach(k=>localStorage.removeItem(k));
  }catch{}
}
window.StudentPlannerOffline={uuid,isNetworkError,queue,pending,sync,cache,cached,clearUser};
window.addEventListener("online",()=>{
  if(location.pathname.startsWith("/__offline__/"))location.replace("/");
});
})();