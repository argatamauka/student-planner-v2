const $=id=>document.getElementById(id);
let user=null,profil=null,snapshot={},rt=null,photoUrl=null;
let aboutUpdateInfo=null;
const fields=[...document.querySelectorAll(".profile-input")],oldKeys=["nim","name","program","ijazah_name","financial_number","gender","birth_place_date","academic_status","religion","residence","marital_status","faculty","study_program","curriculum_name","academic_probation","race","address","mother_name","mother_phone","mother_address","father_name","father_phone","father_address","guardian_name","guardian_phone","guardian_address"];
async function q(p){let{data,error}=await p;if(error)throw error;return data}
const offlineStore=window.StudentPlannerOffline;
const cloudReady=()=>navigator.onLine!==false&&!sb?.__offlineFallback;
function updateOfflineUI(force=!cloudReady()){
let b=$("offline-banner");if(!b||!user)return;let n=offlineStore?.pending(user.id)||0;
b.classList.toggle("hidden",!force&&!n);$("offline-pending").innerText=n+" TERTUNDA";
}
function saveProfileOffline(){if(user&&profil)offlineStore?.cache(user.id,"profile",profil)}
async function syncOffline(){if(!user||!cloudReady())return;let r=await offlineStore.sync(sb,user.id);updateOfflineUI(false);if(r.error)tampilModal("Sebagian perubahan offline belum tersinkron: "+(r.error.message||r.error))}
async function runCloudOrQueue(cloud,local,op){
if(cloudReady()){try{await cloud();return false}catch(e){if(!offlineStore?.isNetworkError(e))throw e}}
local();offlineStore.queue(user.id,op);saveProfileOffline();updateOfflineUI(true);return true;
}
function formData(){let d={};fields.forEach(x=>d[x.dataset.field]=x.value.trim());return d}
function isiForm(d){fields.forEach(x=>x.value=d?.[x.dataset.field]??"");header()}
function header(){
let d=formData();$("nama-header").innerText=(d.name||"NAMA MAHASISWA").replace(",","").toUpperCase();$("nim-header").innerText=d.nim||"NIM";
$("status-header").innerText=(d.academic_status||"ACTIVE").split("/")[0].trim().toUpperCase();$("prodi-header").innerText=(d.study_program||"PROGRAM STUDI").split("/")[0].trim().toUpperCase();
}
async function migrasiProfil(){
let p=await q(sb.from("profiles").select("*").maybeSingle());
if(p){localStorage.setItem("studentPlannerProfileCloudMigrated","1");return p}
let d={user_id:user.id},raw=localStorage.getItem("studentPlannerProfileV1");
if(localStorage.getItem("studentPlannerProfileCloudMigrated")!=="1"&&raw)try{let a=JSON.parse(raw);if(Array.isArray(a))oldKeys.forEach((k,i)=>d[k]=a[i]??"")}catch{}
await q(sb.from("profiles").insert(d));
localStorage.setItem("studentPlannerProfileCloudMigrated","1");
return await q(sb.from("profiles").select("*").single());
}
async function migrasiFoto(){
if(profil?.avatar_path){localStorage.setItem("studentPlannerPhotoCloudMigrated","1");return}
if(localStorage.getItem("studentPlannerPhotoCloudMigrated")==="1")return;
let raw=localStorage.getItem("studentPlannerPhotoV1");if(!raw?.startsWith("data:image")){localStorage.setItem("studentPlannerPhotoCloudMigrated","1");return;}
try{
let blob=await (await fetch(raw)).blob(),path=`${user.id}/avatar.jpg`;
await q(sb.storage.from("profile-photos").upload(path,blob,{upsert:true,contentType:"image/jpeg"}));
await q(sb.from("profiles").update({avatar_path:path,updated_at:new Date().toISOString()}).eq("user_id",user.id));
profil.avatar_path=path;localStorage.setItem("studentPlannerPhotoCloudMigrated","1");
}catch{}
}
async function load(){
if(cloudReady()){
try{
profil=await q(sb.from("profiles").select("*").single());
saveProfileOffline();offlineStore.cache(user.id,"identity",{name:profil.name||"",nim:profil.nim||""});updateOfflineUI(false);
}catch(e){if(!offlineStore?.isNetworkError(e))throw e}
}
if(!profil)profil=offlineStore?.cached(user.id,"profile",null);
if(!profil)throw new Error("Belum ada profil offline. Hubungkan internet sekali untuk menyiapkan cache.");
isiForm(profil);
if(cloudReady()&&profil.avatar_path)await loadFoto(profil.avatar_path);else if(!$("foto-preview").src){$("foto-preview").classList.add("hidden");$("foto-placeholder").classList.remove("hidden")}
}
async function loadFoto(path){
try{let blob=await q(sb.storage.from("profile-photos").download(path));if(photoUrl)URL.revokeObjectURL(photoUrl);photoUrl=URL.createObjectURL(blob);$("foto-preview").src=photoUrl;$("foto-preview").classList.remove("hidden");$("foto-placeholder").classList.add("hidden")}catch{}
}
function mulaiEdit(){snapshot=formData();fields.forEach(x=>x.disabled=false);$("edit-btn").classList.add("hidden");$("edit-actions").classList.remove("hidden")}
function selesaiEdit(){fields.forEach(x=>x.disabled=true);$("edit-btn").classList.remove("hidden");$("edit-actions").classList.add("hidden")}
function batalEdit(){fields.forEach(x=>x.value=snapshot[x.dataset.field]??"");header();selesaiEdit()}
async function simpanProfil(){
let d=formData();if(!d.name||!d.nim)return tampilModal("Nama dan NIM tidak boleh kosong.");
try{
let data={...d,updated_at:new Date().toISOString()};
let queued=await runCloudOrQueue(
()=>q(sb.from("profiles").update(data).eq("user_id",user.id)),
()=>{profil={...profil,...data}},
{kind:"profile_update",data}
);
if(!queued)profil={...profil,...data};
offlineStore.cache(user.id,"identity",{name:d.name,nim:d.nim});saveProfileOffline();header();selesaiEdit();
tampilModal(queued?"Profil disimpan offline dan akan disinkronkan saat internet kembali.":"Profil berhasil diperbarui.");
}catch(e){tampilModal(e.message)}
}
function tampilModal(t){$("modal-message").innerText=t;$("saved-modal").classList.remove("hidden")}
function tutupModal(){$("saved-modal").classList.add("hidden")}
function toggleNotificationSettings(force){
let panel=$("notification-settings"),btn=$("notification-settings-toggle");
if(!panel||!btn)return;
let open=typeof force==="boolean"?force:panel.classList.contains("hidden");
panel.classList.toggle("hidden",!open);
btn.setAttribute("aria-expanded",String(open));
btn.querySelector("span:first-child").innerText=open?"TUTUP PENGATURAN":"ATUR NOTIFIKASI";
}
function notifKey(){return "studentPlannerNotificationPrefs:"+(user?.id||"guest")}
function defaultNotifPrefs(){return{enabled:false,schedule:true,scheduleMinutes:30,tasks:true,taskDays:1,taskHour:19}}
function getNotifPrefs(){
try{return{...defaultNotifPrefs(),...JSON.parse(localStorage.getItem(notifKey())||"{}")}}catch{return defaultNotifPrefs()}
}
function isiNotifPrefs(){
let p=getNotifPrefs();
$("notif-schedule").checked=!!p.schedule;
$("notif-schedule-minutes").value=String(p.scheduleMinutes||30);
$("notif-tasks").checked=!!p.tasks;
$("notif-task-days").value=String(p.taskDays||1);
$("notif-task-hour").value=String(p.taskHour??19);
let native=!!window.AndroidNotifications;
$("notification-status").innerText=p.enabled&&native?"AKTIF":"BELUM AKTIF";
$("notification-status").classList.toggle("active",p.enabled&&native);
$("save-notification-btn").innerText=p.enabled?"SIMPAN PENGATURAN":"AKTIFKAN & SIMPAN";
$("notification-help").innerText=native
?"Notifikasi dijadwalkan langsung oleh aplikasi Android di HP ini."
:"Pengaturan tersimpan, tetapi pengingat otomatis tersedia saat Student Planner dibuka melalui aplikasi Android.";
}
function buatPayloadNotifikasi(schedules,tasks,p){
let parsedSchedules=schedules.map(x=>{
let m=String(x.time_range||"").match(/(\d{1,2}):(\d{2})/);
if(!m)return null;
return{id:x.id,day:x.day,course:x.course_name,room:x.room||"",time:x.time_range,hour:Number(m[1]),minute:Number(m[2])};
}).filter(Boolean);
return{
userId:user.id,
scheduleEnabled:!!p.schedule,
scheduleMinutes:Number(p.scheduleMinutes||30),
taskEnabled:!!p.tasks,
taskDays:Number(p.taskDays||1),
taskHour:Number(p.taskHour??19),
schedules:parsedSchedules,
tasks:tasks.filter(x=>!x.completed).map(x=>({id:x.id,name:x.name,course:x.course_name,deadline:x.deadline}))
};
}
async function syncNotifDariCloud(p){
if(!window.AndroidNotifications||!p.enabled)return;
let schedules=[],tasks=[];
if(cloudReady()){
[schedules,tasks]=await Promise.all([
q(sb.from("schedules").select("id,day,course_name,time_range,room")),
q(sb.from("tasks").select("id,name,course_name,deadline,completed"))
]);
}else{
let c=offlineStore?.cached(user.id,"dashboard",null);
schedules=(c?.jadwal||[]).map(x=>({id:x.id,day:x.hari,course_name:x.matkul,time_range:x.waktu,room:x.ruangan||""}));
tasks=(c?.tugas||[]).map(x=>({id:x.id,name:x.nama,course_name:x.matkul,deadline:x.deadline,completed:!!x.selesai}));
}
window.AndroidNotifications.syncReminders(JSON.stringify(buatPayloadNotifikasi(schedules,tasks,p)));
}
async function simpanNotifikasi(){
let p={
enabled:true,
schedule:$("notif-schedule").checked,
scheduleMinutes:Number($("notif-schedule-minutes").value),
tasks:$("notif-tasks").checked,
taskDays:Number($("notif-task-days").value),
taskHour:Number($("notif-task-hour").value)
};
localStorage.setItem(notifKey(),JSON.stringify(p));
toggleNotificationSettings(true);
try{
if(window.AndroidNotifications){
window.AndroidNotifications.requestPermission();
await syncNotifDariCloud(p);
tampilModal("Pengingat berhasil diaktifkan. Android mungkin meminta izin notifikasi.");
}else{
tampilModal("Pengaturan tersimpan. Pengingat otomatis akan aktif saat kamu menggunakan aplikasi Android Student Planner.");
}
isiNotifPrefs();
}catch(e){tampilModal("Gagal menyimpan pengingat: "+e.message)}
}

function compareAppVersions(a,b){
let aa=String(a||"0").split(".").map(n=>Number(n)||0),bb=String(b||"0").split(".").map(n=>Number(n)||0),len=Math.max(aa.length,bb.length);
for(let i=0;i<len;i++){let x=aa[i]||0,y=bb[i]||0;if(x>y)return 1;if(x<y)return -1}
return 0;
}
function installedAppVersion(){
try{
if(window.AndroidNotifications&&typeof window.AndroidNotifications.getVersionName==="function"){
let v=String(window.AndroidNotifications.getVersionName()||"").trim();
if(v)return v;
}
}catch{}
let m=navigator.userAgent.match(/StudentPlannerAndroid\/([0-9.]+)/i);
return m?m[1]:"WEB";
}
function loadAboutApp(){
let current=installedAppVersion();
if($("about-current-version"))$("about-current-version").innerText=current;
}
async function cekUpdateProfil(){
let btn=$("about-check-update-btn"),status=$("about-update-status"),download=$("about-download-update-btn");
btn.disabled=true;btn.innerText="MEMERIKSA...";
download.classList.add("hidden");
aboutUpdateInfo=null;
try{
let res=await fetch("https://api.github.com/repos/argatamauka/student-planner-v2/releases/latest",{headers:{"Accept":"application/vnd.github+json"},cache:"no-store"});
if(!res.ok)throw new Error("Gagal memeriksa update.");
let release=await res.json(),latest=String(release?.tag_name||"").replace(/^v/i,""),current=installedAppVersion();
let apk=(release?.assets||[]).find(x=>x.name==="Student-Planner-v2.apk");
if(!latest||!apk?.browser_download_url)throw new Error("APK release terbaru belum tersedia.");
$("about-latest-version").innerText=latest;
if(current==="WEB"){
status.innerText="Versi APK hanya dapat diperiksa dari aplikasi Android Student Planner.";
return;
}
if(compareAppVersions(current,latest)>=0){
status.innerText="Student Planner sudah menggunakan versi terbaru ✅";
return;
}
aboutUpdateInfo={version:latest,url:apk.browser_download_url};
status.innerText="Update v"+latest+" tersedia. Tekan UNDUH UPDATE untuk memulai.";
download.innerText="UNDUH v"+latest;
download.classList.remove("hidden");
}catch(e){
status.innerText="Gagal memeriksa update. Pastikan internet aktif lalu coba lagi.";
}finally{
btn.disabled=false;btn.innerText="CEK UPDATE";
}
}
function laporkanBugProfil(){
let version=installedAppVersion();
let subject=encodeURIComponent("Bug Student Planner v"+version);
let body=encodeURIComponent("Jelaskan masalah yang terjadi:\n\nLangkah sebelum masalah muncul:\n1. \n2. \n3. \n\nVersi aplikasi: "+version+"\nBrowser/Perangkat: "+navigator.userAgent);
location.href="mailto:argatamauka@gmail.com?subject="+subject+"&body="+body;
}
function updateDariProfil(){
if(!aboutUpdateInfo)return;
try{
if(window.AndroidNotifications?.supportsInAppUpdate?.()&&typeof window.AndroidNotifications.downloadAndInstallUpdate==="function"){
window.AndroidNotifications.downloadAndInstallUpdate(aboutUpdateInfo.url,aboutUpdateInfo.version);
$("about-update-status").innerText="Download update dimulai. Ikuti progress yang muncul di aplikasi.";
$("about-download-update-btn").classList.add("hidden");
return;
}
}catch{}
tampilModal("Update langsung hanya tersedia di aplikasi Android Student Planner.");
}

function bukaHapusAkun(){
$("delete-password").value="";
$("delete-confirm-text").value="";
$("delete-account-modal").classList.remove("hidden");
setTimeout(()=>$("delete-password").focus(),50);
}
function tutupHapusAkun(){
$("delete-account-modal").classList.add("hidden");
$("delete-password").value="";
$("delete-confirm-text").value="";
}
async function hapusAkun(){
if(!cloudReady())return tampilModal("Menghapus akun membutuhkan koneksi internet.");
let password=$("delete-password").value,confirmText=$("delete-confirm-text").value.trim().toUpperCase(),btn=$("delete-account-confirm");
if(!password)return tampilModal("Masukkan password akunmu.");
if(confirmText!=="HAPUS")return tampilModal('Ketik "HAPUS" untuk mengonfirmasi penghapusan akun.');
if(!user?.email)return tampilModal("Email akun tidak ditemukan. Silakan login ulang.");

btn.disabled=true;btn.innerText="MENGHAPUS...";
try{
let{error:reauthError}=await sb.auth.signInWithPassword({email:user.email,password});
if(reauthError)return tampilModal("Password salah. Akun belum dihapus.");

let{data,error}=await sb.functions.invoke("delete-account",{body:{confirm:true}});
if(error)throw error;
if(!data?.ok)throw new Error(data?.error||"Gagal menghapus akun.");

if(rt)try{await sb.removeChannel(rt)}catch{}
[
"studentPlannerV1","studentPlannerCloudMigrated",
"studentPlannerProfileV1","studentPlannerProfileCloudMigrated",
"studentPlannerPhotoV1","studentPlannerPhotoCloudMigrated",
"studentPlannerMatkulV1","studentPlannerMatkulCloudMigrated"
].forEach(k=>localStorage.removeItem(k));
try{await sb.auth.signOut({scope:"local"})}catch{}
location.replace("index.html");
}catch(e){
tampilModal("Gagal menghapus akun: "+(e?.message||"Terjadi kesalahan."));
}finally{
btn.disabled=false;btn.innerText="HAPUS PERMANEN";
}
}
$("foto-input").addEventListener("change",e=>{
if(!cloudReady()){e.target.value="";return tampilModal("Mengganti foto profil membutuhkan koneksi internet.")}
let file=e.target.files[0];if(!file)return;if(!file.type.startsWith("image/"))return tampilModal("Pilih file gambar.");
let r=new FileReader();r.onload=()=>{let im=new Image();im.onload=()=>{let max=700,s=Math.min(1,max/Math.max(im.width,im.height)),c=document.createElement("canvas");c.width=Math.round(im.width*s);c.height=Math.round(im.height*s);c.getContext("2d").drawImage(im,0,0,c.width,c.height);c.toBlob(async blob=>{try{let path=`${user.id}/avatar.jpg`;await q(sb.storage.from("profile-photos").upload(path,blob,{upsert:true,contentType:"image/jpeg"}));await q(sb.from("profiles").update({avatar_path:path,updated_at:new Date().toISOString()}).eq("user_id",user.id));profil.avatar_path=path;await loadFoto(path);tampilModal("Foto profil berhasil diperbarui.")}catch(err){tampilModal(err.message)}},"image/jpeg",.8)};im.src=r.result};r.readAsDataURL(file);
});
document.addEventListener("keydown",e=>{if(e.key==="Escape"){$("saved-modal").classList.add("hidden");tutupHapusAkun()}});
(async()=>{
let{data:{session}}=await sb.auth.getSession();if(!session)return location.href="index.html";
user=session.user;try{
loadAboutApp();
if(cloudReady()){profil=await migrasiProfil();await migrasiFoto();await syncOffline()}
await load();isiNotifPrefs();
if(cloudReady())rt=sb.channel("profile-"+user.id).on("postgres_changes",{event:"*",schema:"public",table:"profiles",filter:`user_id=eq.${user.id}`},()=>load()).subscribe();
updateOfflineUI();
}catch(e){tampilModal("Gagal memuat profil: "+e.message)}
})();

window.addEventListener("offline",()=>updateOfflineUI(true));
window.addEventListener("online",async()=>{if(!user||sb?.__offlineFallback)return;try{await syncOffline();profil=null;await load()}catch{updateOfflineUI(true)}});
window.addEventListener("studentplanner:offlinequeue",()=>updateOfflineUI(!cloudReady()));
