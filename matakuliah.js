const $=id=>document.getElementById(id),aman=t=>String(t??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
let user=null,editIndex=null,hapusIndex=null,matkul=[],rt=null;
async function q(p){let{data,error}=await p;if(error)throw error;return data}
const offlineStore=window.StudentPlannerOffline;
const cloudReady=()=>navigator.onLine!==false&&!sb?.__offlineFallback;
function updateOfflineUI(force=!cloudReady()){
let b=$("offline-banner");if(!b||!user)return;let n=offlineStore?.pending(user.id)||0;
b.classList.toggle("hidden",!force&&!n);$("offline-pending").innerText=n+" TERTUNDA";
}
function saveOffline(){if(user)offlineStore?.cache(user.id,"courses",matkul)}
function restoreOffline(){let c=offlineStore?.cached(user?.id,"courses",null);if(!Array.isArray(c))return false;matkul=c;render();updateOfflineUI(true);return true}
async function syncOffline(){if(!user||!cloudReady())return;let r=await offlineStore.sync(sb,user.id);updateOfflineUI(false);if(r.error)alert("Sebagian perubahan offline belum tersinkron: "+(r.error.message||r.error))}
async function runCloudOrQueue(cloud,local,op){
if(cloudReady()){try{await cloud();return false}catch(e){if(!offlineStore?.isNetworkError(e))throw e}}
local();offlineStore.queue(user.id,op);saveOffline();updateOfflineUI(true);return true;
}
async function migrasi(){
if(localStorage.getItem("studentPlannerMatkulCloudMigrated")==="1")return;
let old=localStorage.getItem("studentPlannerMatkulV1");if(!old)return;
let ada=await q(sb.from("courses").select("id").limit(1));if(ada.length){localStorage.setItem("studentPlannerMatkulCloudMigrated","1");return;}
let d;try{d=JSON.parse(old)}catch{return}
if(Array.isArray(d)&&d.length)await q(sb.from("courses").insert(d.map(x=>({user_id:user.id,name:x.nama,day:x.hari,time_range:x.waktu,room:x.ruangan||null}))));
localStorage.setItem("studentPlannerMatkulCloudMigrated","1");
}
async function load(){
if(!cloudReady()){if(!restoreOffline())throw new Error("Belum ada cache mata kuliah. Hubungkan internet sekali.");return}
try{
let d=await q(sb.from("courses").select("*").order("created_at"));
matkul=d.map(x=>({id:x.id,nama:x.name,hari:x.day,waktu:x.time_range,ruangan:x.room||""}));render();saveOffline();updateOfflineUI(false);
}catch(e){if(offlineStore?.isNetworkError(e)&&restoreOffline())return;throw e}
}
function render(){
$("total-matkul").innerText=matkul.length;$("total-hari").innerText=new Set(matkul.map(x=>x.hari)).size;
$("course-grid").innerHTML=matkul.length?matkul.map((m,i)=>`<article class="course-card c${i%5}"><span class="number">${String(i+1).padStart(2,"0")}</span><small>${aman(m.hari)}</small><h2>${aman(m.nama)}</h2><div class="info"><div><small>WAKTU</small><strong>${aman(m.waktu)}</strong></div><div><small>RUANGAN</small><strong>${aman(m.ruangan||"-")}</strong></div></div><div class="card-actions"><button class="edit-btn" onclick="editMatkul(${i})">EDIT</button><button class="delete-btn" onclick="mintaHapus(${i})">HAPUS</button></div></article>`).join(""):`<div class="empty">Belum ada mata kuliah.</div>`;
}
function bukaForm(i=null){
if(i===null&&!$("form-card").classList.contains("hidden"))return tutupForm();
editIndex=i;$("form-card").classList.remove("hidden");
if(i===null){$("form-label").innerText="MATA KULIAH BARU";$("form-title").innerText="TAMBAH";["nama","waktu","ruangan"].forEach(id=>$(id).value="");$("hari").value=""}
else{let m=matkul[i];$("form-label").innerText="EDIT MATA KULIAH";$("form-title").innerText="EDIT";$("nama").value=m.nama;$("hari").value=m.hari;$("waktu").value=m.waktu;$("ruangan").value=m.ruangan}
$("form-card").scrollIntoView({behavior:"smooth",block:"start"});
}
function tutupForm(){editIndex=null;$("form-card").classList.add("hidden");["nama","waktu","ruangan"].forEach(id=>$(id).value="");$("hari").value=""}
async function simpanMatkul(){
let nama=$("nama").value.trim(),hari=$("hari").value,waktu=$("waktu").value.trim(),ruangan=$("ruangan").value.trim();
if(!nama||!hari||!waktu)return alert("Isi nama, hari, dan waktu.");
try{
let d={name:nama,day:hari,time_range:waktu,room:ruangan||null},editing=editIndex!==null,idx=editIndex,id=editing?matkul[idx].id:offlineStore.uuid();
let queued=await runCloudOrQueue(
()=>editing?q(sb.from("courses").update(d).eq("id",id)):q(sb.from("courses").insert({id,...d,user_id:user.id})),
()=>{let local={id,nama,hari,waktu,ruangan};if(editing)matkul[idx]=local;else matkul.push(local)},
{kind:editing?"course_update":"course_insert",id,data:d}
);
tutupForm();if(!queued)await load();else{render();saveOffline()}
}catch(e){alert(e.message)}
}
function editMatkul(i){bukaForm(i)}
function mintaHapus(i){hapusIndex=i;$("modal-text").innerText=`Hapus mata kuliah "${matkul[i].nama}"?`;$("modal").classList.remove("hidden")}
function tutupModal(){hapusIndex=null;$("modal").classList.add("hidden")}
async function konfirmasiHapus(){if(hapusIndex!==null)try{
let i=hapusIndex,id=matkul[i].id;
let queued=await runCloudOrQueue(
()=>q(sb.from("courses").delete().eq("id",id)),
()=>matkul.splice(i,1),
{kind:"course_delete",id}
);
tutupModal();if(!queued)await load();else{render();saveOffline()}
}catch(e){alert(e.message)}}
(async()=>{
let{data:{session}}=await sb.auth.getSession();if(!session)return location.href="index.html";
user=session.user;try{
if(cloudReady()){await migrasi();await syncOffline()}
await load();
if(cloudReady())rt=sb.channel("courses-"+user.id).on("postgres_changes",{event:"*",schema:"public",table:"courses",filter:`user_id=eq.${user.id}`},()=>load()).subscribe();
}catch(e){alert("Gagal memuat data: "+e.message)}
})();

window.addEventListener("offline",()=>updateOfflineUI(true));
window.addEventListener("online",async()=>{if(!user||sb?.__offlineFallback)return;try{await syncOffline();await load()}catch{updateOfflineUI(true)}});
window.addEventListener("studentplanner:offlinequeue",()=>updateOfflineUI(!cloudReady()));
