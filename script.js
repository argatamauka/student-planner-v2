const $=id=>document.getElementById(id),rupiah=n=>"Rp "+Number(n||0).toLocaleString("id-ID"),toggle=id=>$(id).classList.toggle("hidden");
const aman=t=>String(t??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
function info(t){$("info-text").innerText=t;$("info-modal").classList.remove("hidden")}
function toggleTambah(id,reset){let tutup=!$(id).classList.contains("hidden");reset();$(id).classList.toggle("hidden",tutup)}
let aksiConfirm=null,user=null,rt=null,refreshTimer=null,recoveryMode=false;
function confirmBox(t,a,b="LANJUTKAN"){$("confirm-text").innerText=t;$("confirm-ok").innerText=b;aksiConfirm=a;$("confirm-modal").classList.remove("hidden")}
function tutupConfirm(){$("confirm-modal").classList.add("hidden");aksiConfirm=null}
$("confirm-ok").onclick=()=>{let a=aksiConfirm;tutupConfirm();if(a)a()};
async function q(p){let{data,error}=await p;if(error)throw error;return data}
const offlineStore=window.StudentPlannerOffline;
const cloudReady=()=>navigator.onLine!==false&&!sb?.__offlineFallback;
function updateOfflineUI(forceOffline=!cloudReady()){
let banner=$("offline-banner");if(!banner||!user)return;
let pending=offlineStore?.pending(user.id)||0;
banner.classList.toggle("hidden",!forceOffline&&!pending);
$("offline-pending").innerText=pending+" TERTUNDA";
}
function saveDashboardOffline(){
if(!user||!offlineStore)return;
offlineStore.cache(user.id,"dashboard",{jadwal,tugas,wallets,transaksi,saving,dompetAktifId,savedAt:Date.now()});
}
function restoreDashboardOffline(){
let c=offlineStore?.cached(user?.id,"dashboard",null);if(!c)return false;
jadwal=Array.isArray(c.jadwal)?c.jadwal:[];
tugas=Array.isArray(c.tugas)?c.tugas:[];
wallets=Array.isArray(c.wallets)?c.wallets:[];
transaksi=Array.isArray(c.transaksi)?c.transaksi:[];
saving=c.saving||{target_name:"",target_amount:0,amount:0};
dompetAktifId=c.dompetAktifId||wallets[0]?.id||null;
renderSemua();syncAndroidReminders();updateOfflineUI(true);return true;
}
async function syncOfflineChanges(show=false){
if(!user||!offlineStore||!cloudReady())return;
let r=await offlineStore.sync(sb,user.id);updateOfflineUI(false);
if(r.error&&show)info("Sebagian perubahan offline belum bisa disinkronkan: "+(r.error.message||r.error));
}
async function runCloudOrQueue(cloudFn,offlineFn,operation){
if(cloudReady()){
try{await cloudFn();return false}catch(e){if(!offlineStore?.isNetworkError(e))throw e}
}
offlineFn();offlineStore.queue(user.id,operation);saveDashboardOffline();updateOfflineUI(true);return true;
}
function setLoading(show,text="MEMUAT..."){let el=$("app-loading");if(!el)return;if(text)$("loading-text").innerText=text;el.classList.toggle("hidden",!show)}
function setAuthButtons(disabled){["login-btn","register-btn"].forEach(id=>{let b=$(id);if(b)b.disabled=disabled})}
function namaPanggilan(nama){
nama=String(nama||"").trim();if(!nama)return"";
if(nama.includes(",")){let setelah=nama.split(",")[1]?.trim();if(setelah)return setelah.split(/\s+/)[0]}
return nama.split(/\s+/)[0];
}
async function loadIdentitas(){
let p=null;
if(cloudReady()){
try{
p=await q(sb.from("profiles").select("name,nim").maybeSingle());
if(p)offlineStore.cache(user.id,"identity",p);
}catch(e){if(!offlineStore?.isNetworkError(e))throw e}
}
if(!p)p=offlineStore?.cached(user.id,"identity",null);
if(!p){
$("onboarding-modal").classList.add("hidden");
$("sapaan-user").innerText="HALO!";
$("dashboard-avatar").innerText="?";
updateOfflineUI(true);
return false;
}
if(!p?.name?.trim()){
if(!cloudReady()){
$("onboarding-modal").classList.add("hidden");$("sapaan-user").innerText="HALO!";$("dashboard-avatar").innerText="?";return false;
}
$("onboarding-name").value="";$("onboarding-nim").value=p?.nim||"";$("onboarding-modal").classList.remove("hidden");
$("sapaan-user").innerText="HALO!";$("dashboard-avatar").innerText="?";return false;
}
let nama=namaPanggilan(p.name);
$("sapaan-user").innerText=`HALO, ${nama.toUpperCase()}!`;
$("dashboard-avatar").innerText=(nama[0]||"?").toUpperCase();
$("onboarding-modal").classList.add("hidden");return true;
}
async function simpanOnboarding(){
let name=$("onboarding-name").value.trim(),nim=$("onboarding-nim").value.trim();
if(name.length<2)return info("Masukkan nama lengkap terlebih dahulu.");
setLoading(true,"MENYIAPKAN PROFIL...");
try{
let data={name,nim:nim||null,updated_at:new Date().toISOString()};
let queued=await runCloudOrQueue(
()=>q(sb.from("profiles").upsert({user_id:user.id,...data},{onConflict:"user_id"})),
()=>offlineStore.cache(user.id,"identity",{name,nim:nim||null}),
{kind:"profile_update",data}
);
$("onboarding-modal").classList.add("hidden");
if(!queued)offlineStore.cache(user.id,"identity",{name,nim:nim||null});
await loadIdentitas();
info(queued?"Profil disimpan offline dan akan disinkronkan saat internet kembali.":`Selamat datang, ${namaPanggilan(name)}! Planner-mu siap digunakan 🎉`);
}catch(e){info("Gagal menyimpan profil: "+e.message)}
finally{setLoading(false)}
}


/* APP UPDATE */
let appUpdateInfo=null,appUpdateDownloadState="idle";
function compareVersions(a,b){
let aa=String(a||"0").split(".").map(n=>Number(n)||0),bb=String(b||"0").split(".").map(n=>Number(n)||0),len=Math.max(aa.length,bb.length);
for(let i=0;i<len;i++){let x=aa[i]||0,y=bb[i]||0;if(x>y)return 1;if(x<y)return -1}
return 0;
}
function installedAndroidVersion(){
try{
if(window.AndroidNotifications&&typeof window.AndroidNotifications.getVersionName==="function"){
let v=String(window.AndroidNotifications.getVersionName()||"").trim();
if(v)return v;
}
}catch{}
let m=navigator.userAgent.match(/StudentPlannerAndroid\/([0-9.]+)/i);
return m?m[1]:null;
}
async function checkAppUpdate(force=false){
let current=installedAndroidVersion();
if(!current){
if(force)info("Pemeriksaan update APK hanya tersedia di aplikasi Android Student Planner.");
return false;
}
try{
let release=null,cacheKey="studentPlannerLatestReleaseCache",cached=null;
try{cached=JSON.parse(localStorage.getItem(cacheKey)||"null")}catch{}
if(!force&&cached?.checkedAt&&Date.now()-cached.checkedAt<6*60*60*1000&&cached.release){
release=cached.release;
}else{
let res=await fetch("https://api.github.com/repos/argatamauka/student-planner-v2/releases/latest",{headers:{"Accept":"application/vnd.github+json"},cache:"no-store"});
if(!res.ok)throw new Error("Gagal memeriksa versi terbaru.");
release=await res.json();
localStorage.setItem(cacheKey,JSON.stringify({checkedAt:Date.now(),release}));
}
let latestVersion=String(release?.tag_name||"").replace(/^v/i,"");
let apk=(release?.assets||[]).find(x=>x.name==="Student-Planner-v2.apk");
if(!latestVersion||!apk?.browser_download_url)throw new Error("Release terbaru belum menyediakan APK.");
if(compareVersions(current,latestVersion)>=0){
if(force)info("Student Planner sudah menggunakan versi terbaru ✅");
return false;
}
let snoozeKey="studentPlannerUpdateSnooze:"+latestVersion;
let snoozed=Number(localStorage.getItem(snoozeKey)||0);
if(!force&&snoozed&&Date.now()-snoozed<12*60*60*1000)return false;
appUpdateInfo={latestVersion,downloadUrl:apk.browser_download_url,currentVersion:current};
$("update-current-version").innerText=current;
$("update-latest-version").innerText=latestVersion;
$("update-title").innerText="VERSI "+latestVersion+" TERSEDIA";
$("update-message").innerText="Ada pembaruan Student Planner. Update untuk mendapatkan perbaikan dan fitur terbaru.";
appUpdateDownloadState="idle";
$("update-download-progress").classList.add("hidden");
$("update-progress-fill").style.width="0%";
$("update-progress-percent").innerText="0%";
$("update-progress-label").innerText="MENYIAPKAN DOWNLOAD...";
$("update-now-btn").disabled=false;
$("update-later-btn").disabled=false;
let stagedUpdater=false,nativeUpdater=false;
try{
stagedUpdater=!!window.AndroidNotifications?.supportsStagedInAppUpdate?.();
nativeUpdater=!!window.AndroidNotifications?.supportsInAppUpdate?.();
}catch{}
$("update-now-btn").innerText=stagedUpdater?"UNDUH UPDATE":nativeUpdater?"UPDATE DI APLIKASI":"DOWNLOAD UPDATE";
$("app-update-modal").classList.remove("hidden");
return true;
}catch(e){
if(force)info("Gagal memeriksa update. Pastikan internet aktif lalu coba lagi.");
return false;
}
}
async function manualCheckAppUpdate(){
setLoading(true,"MEMERIKSA UPDATE...");
try{await checkAppUpdate(true)}finally{setLoading(false)}
}
function bukaTentangApp(){
try{
if(window.AndroidNotifications&&typeof window.AndroidNotifications.openAboutApp==="function"){
window.AndroidNotifications.openAboutApp();
return;
}
}catch{}
location.href="profil.html";
}
function laporkanBug(){
let version=installedAndroidVersion()||"WEB";
let subject=encodeURIComponent("Bug Student Planner v"+version);
let body=encodeURIComponent("Jelaskan masalah yang terjadi:\n\nLangkah sebelum masalah muncul:\n1. \n2. \n3. \n\nVersi aplikasi: "+version+"\nBrowser/Perangkat: "+navigator.userAgent);
location.href="mailto:argatamauka@gmail.com?subject="+subject+"&body="+body;
}
function tundaUpdateApp(){
if(appUpdateInfo)localStorage.setItem("studentPlannerUpdateSnooze:"+appUpdateInfo.latestVersion,String(Date.now()));
$("app-update-modal").classList.add("hidden");
}
window.onNativeUpdateProgress=function(state,progress){
let pct=Math.max(0,Math.min(100,Number(progress)||0));
appUpdateDownloadState=state;
$("app-update-modal").classList.remove("hidden");
$("update-download-progress").classList.remove("hidden");
$("update-progress-fill").style.width=pct+"%";
$("update-progress-percent").innerText=pct+"%";
if(state==="downloading"){
$("update-progress-label").innerText="MENGUNDUH UPDATE...";
$("update-now-btn").innerText="MENGUNDUH "+pct+"%";
$("update-now-btn").disabled=true;
$("update-later-btn").disabled=true;
}else if(state==="ready"){
$("update-progress-label").innerText="DOWNLOAD SELESAI ✅";
$("update-now-btn").innerText="INSTAL UPDATE";
$("update-now-btn").disabled=false;
$("update-later-btn").disabled=false;
}else if(state==="failed"){
$("update-progress-label").innerText="DOWNLOAD GAGAL";
$("update-now-btn").innerText="COBA LAGI";
$("update-now-btn").disabled=false;
$("update-later-btn").disabled=false;
}
};

function downloadUpdateApp(){
if(!appUpdateInfo?.downloadUrl)return;
try{
let staged=!!window.AndroidNotifications?.supportsStagedInAppUpdate?.();
if(staged&&appUpdateDownloadState==="ready"&&typeof window.AndroidNotifications.installDownloadedUpdate==="function"){
$("update-now-btn").disabled=true;
$("update-now-btn").innerText="MEMBUKA INSTALLER...";
window.AndroidNotifications.installDownloadedUpdate();
return;
}
if(staged&&typeof window.AndroidNotifications.downloadAndInstallUpdate==="function"){
appUpdateDownloadState="downloading";
$("update-download-progress").classList.remove("hidden");
$("update-progress-label").innerText="MEMULAI DOWNLOAD...";
$("update-progress-fill").style.width="0%";
$("update-progress-percent").innerText="0%";
$("update-now-btn").innerText="MENGUNDUH 0%";
$("update-now-btn").disabled=true;
$("update-later-btn").disabled=true;
window.AndroidNotifications.downloadAndInstallUpdate(appUpdateInfo.downloadUrl,appUpdateInfo.latestVersion);
return;
}
if(window.AndroidNotifications?.supportsInAppUpdate?.()&&typeof window.AndroidNotifications.downloadAndInstallUpdate==="function"){
window.AndroidNotifications.downloadAndInstallUpdate(appUpdateInfo.downloadUrl,appUpdateInfo.latestVersion);
$("app-update-modal").classList.add("hidden");
info("Versi ini sedang berpindah ke updater baru. Setelah update ini terpasang, versi berikutnya akan menampilkan progress download dan tombol INSTAL UPDATE.");
return;
}
}catch{}
$("app-update-modal").classList.add("hidden");
info("Versi APK ini belum mendukung update langsung di aplikasi.");
}

/* AUTH */
async function login(){
let email=$("email").value.trim(),password=$("password").value;
if(!email||!password)return info("Isi email dan password.");
setAuthButtons(true);setLoading(true,"MASUK KE AKUN...");
try{
let{data,error}=await sb.auth.signInWithPassword({email,password});
if(error)return info(error.message);
user=data.user;await bukaDashboard();
}finally{setLoading(false);setAuthButtons(false)}
}
async function daftar(){
let email=$("email").value.trim(),password=$("password").value;
if(!email||password.length<8)return info("Isi email dan password minimal 8 karakter.");
setAuthButtons(true);setLoading(true,"MEMBUAT AKUN...");
try{
let{data,error}=await sb.auth.signUp({email,password});
if(error){
let pesan=String(error.message||"").toLowerCase();
if(pesan.includes("already")||pesan.includes("registered")||pesan.includes("exists")){
return info("Akun dengan email ini sudah terdaftar. Silakan tekan MASUK atau gunakan LUPA PASSWORD.");
}
return info(error.message);
}
if(data?.user&&Array.isArray(data.user.identities)&&data.user.identities.length===0){
return info("Akun dengan email ini sudah terdaftar. Silakan tekan MASUK atau gunakan LUPA PASSWORD.");
}
if(data.session){user=data.user;await bukaDashboard()}
else info("Akun berhasil dibuat. Cek email untuk konfirmasi, lalu kembali dan tekan MASUK.");
}finally{setLoading(false);setAuthButtons(false)}
}
async function kirimResetPassword(){
let email=$("email").value.trim();
if(!email)return info("Masukkan email akunmu terlebih dahulu, lalu tekan LUPA PASSWORD.");
setLoading(true,"MENGIRIM LINK RESET...");
try{
let{error}=await sb.auth.resetPasswordForEmail(email);
if(error)return info(error.message);
info("Link reset password sudah dikirim. Cek inbox atau folder spam emailmu.");
}finally{setLoading(false)}
}
async function simpanPasswordBaru(){
let a=$("new-password").value,b=$("confirm-new-password").value;
if(a.length<8)return info("Password baru minimal 8 karakter.");
if(a!==b)return info("Konfirmasi password belum sama.");
setLoading(true,"MENYIMPAN PASSWORD...");
try{
let{error}=await sb.auth.updateUser({password:a});
if(error)return info(error.message);
$("password-recovery-modal").classList.add("hidden");
$("new-password").value=$("confirm-new-password").value="";
recoveryMode=false;
await sb.auth.signOut();
$("dashboard-screen").classList.add("hidden");
$("login-screen").classList.remove("hidden");
info("Password berhasil diubah. Silakan masuk menggunakan password baru.");
}finally{setLoading(false)}
}
async function batalRecovery(){
recoveryMode=false;
$("password-recovery-modal").classList.add("hidden");
await sb.auth.signOut();
$("dashboard-screen").classList.add("hidden");
$("login-screen").classList.remove("hidden");
}
function konfirmasiLogout(){confirmBox("Yakin ingin keluar dari Student Planner?",logout,"LOGOUT")}
async function logout(){if(rt)await sb.removeChannel(rt);try{window.AndroidNotifications?.clearReminders()}catch{}if(user)offlineStore?.clearUser(user.id);await sb.auth.signOut();$("dashboard-screen").classList.add("hidden");$("login-screen").classList.remove("hidden");$("email").value=$("password").value="";scrollTo(0,0)}
async function bukaDashboard(){
$("login-screen").classList.add("hidden");$("dashboard-screen").classList.remove("hidden");
setLoading(true,"MENYIAPKAN PLANNER...");
try{if(cloudReady())await migrasiLokal();await Promise.all([loadDashboard(),loadIdentitas()]);pasangRealtime();setTimeout(offerNotificationIntro,350);scrollTo(0,0)}
catch(e){info("Gagal memuat data: "+e.message)}
finally{setLoading(false)}
}

/* DATA */
const hariUrut=["Senin","Selasa","Rabu","Kamis","Jumat"],namaHari=["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"],hariIni=()=>namaHari[new Date().getDay()];
let jadwal=[],tugas=[],wallets=[],transaksi=[],saving={target_name:"",target_amount:0,amount:0},dompetAktifId=null;
let editJadwal=null,editTugas=null,editTransaksi=null,filterTransaksi="semua";

async function migrasiLokal(){
if(localStorage.getItem("studentPlannerCloudMigrated")==="1")return;
let raw=localStorage.getItem("studentPlannerV1");if(!raw)return;
let [a,b,c]=await Promise.all([
q(sb.from("schedules").select("id").limit(1)),
q(sb.from("tasks").select("id").limit(1)),
q(sb.from("wallets").select("id").limit(1))
]);
if(a.length||b.length||c.length)return;
let d;try{d=JSON.parse(raw)}catch{return}
if(Array.isArray(d.jadwal)&&d.jadwal.length)await q(sb.from("schedules").insert(d.jadwal.map(x=>({user_id:user.id,day:x.hari,course_name:x.matkul,time_range:x.waktu,room:x.ruangan||null}))));
if(Array.isArray(d.tugas)&&d.tugas.length)await q(sb.from("tasks").insert(d.tugas.map(x=>({user_id:user.id,name:x.nama,course_name:x.matkul,deadline:x.deadline,completed:!!x.selesai}))));
let map={};
if(d.dompet&&typeof d.dompet==="object"){
let rows=Object.entries(d.dompet).map(([name,balance])=>({user_id:user.id,name,balance:Number(balance||0)}));
if(rows.length){let w=await q(sb.from("wallets").insert(rows).select("id,name"));w.forEach(x=>map[x.name]=x.id);dompetAktifId=map[d.dompetAktif]||w[0]?.id}
}
if(Array.isArray(d.transaksi)&&d.transaksi.length)await q(sb.from("transactions").insert(d.transaksi.map(x=>({user_id:user.id,wallet_id:map[x.dompet]||null,wallet_name:x.dompet||"Dompet lama",amount:Number(x.nominal),type:x.tipe,category:x.kategori,tx_date:x.tanggal}))));
if(d.targetNama||d.targetNominal||d.tabungan)await q(sb.from("savings").upsert({user_id:user.id,target_name:d.targetNama||"",target_amount:Number(d.targetNominal||0),amount:Number(d.tabungan||0)}));
localStorage.setItem("studentPlannerCloudMigrated","1");
}

function notificationPrefs(){
if(!user)return{enabled:false};
try{return{enabled:false,schedule:true,scheduleMinutes:30,tasks:true,taskDays:1,taskHour:19,...JSON.parse(localStorage.getItem("studentPlannerNotificationPrefs:"+user.id)||"{}")}}catch{return{enabled:false}}
}
function buildReminderPayload(p){
let parsedSchedules=jadwal.map(x=>{
let m=String(x.waktu||"").match(/(\d{1,2}):(\d{2})/);
if(!m)return null;
return{id:x.id,day:x.hari,course:x.matkul,room:x.ruangan||"",time:x.waktu,hour:Number(m[1]),minute:Number(m[2])};
}).filter(Boolean);
return{
userId:user.id,
scheduleEnabled:!!p.schedule,
scheduleMinutes:Number(p.scheduleMinutes||30),
taskEnabled:!!p.tasks,
taskDays:Number(p.taskDays||1),
taskHour:Number(p.taskHour??19),
schedules:parsedSchedules,
tasks:tugas.filter(x=>!x.selesai).map(x=>({id:x.id,name:x.nama,course:x.matkul,deadline:x.deadline}))
};
}
function syncAndroidReminders(){
try{
let p=notificationPrefs();
if(window.AndroidNotifications&&p.enabled){
window.AndroidNotifications.syncReminders(JSON.stringify(buildReminderPayload(p)));
}
}catch{}
}
function offerNotificationIntro(){
try{
if(!window.AndroidNotifications||!user)return;
let key="studentPlannerNotificationIntro:"+user.id;
if(localStorage.getItem(key))return;
localStorage.setItem(key,"1");
if(!notificationPrefs().enabled)info("🔔 Pengingat jadwal dan deadline sudah tersedia. Aktifkan dari menu PROFIL.");
}catch{}
}
async function loadDashboard(){
if(!cloudReady()){
if(!restoreDashboardOffline())throw new Error("Belum ada data offline di perangkat ini. Hubungkan internet sekali untuk menyiapkan cache.");
return;
}
await syncOfflineChanges();
await Promise.all([loadJadwal(),loadTugas(),loadFinance()]);
renderSemua();syncAndroidReminders();saveDashboardOffline();updateOfflineUI(false);
}
async function loadJadwal(){
try{
let d=await q(sb.from("schedules").select("*"));
jadwal=d.map(x=>({id:x.id,hari:x.day,matkul:x.course_name,waktu:x.time_range,ruangan:x.room||""}));saveDashboardOffline();
}catch(e){if(offlineStore?.isNetworkError(e)&&restoreDashboardOffline())return;throw e}
}
async function loadTugas(){
try{
let d=await q(sb.from("tasks").select("*"));
tugas=d.map(x=>({id:x.id,nama:x.name,matkul:x.course_name,deadline:x.deadline,selesai:x.completed}));saveDashboardOffline();
}catch(e){if(offlineStore?.isNetworkError(e)&&restoreDashboardOffline())return;throw e}
}
async function loadFinance(){
try{
let [w,t,s]=await Promise.all([
q(sb.from("wallets").select("*").order("created_at")),
q(sb.from("transactions").select("*").order("tx_date",{ascending:false}).order("created_at",{ascending:false})),
q(sb.from("savings").select("*").maybeSingle())
]);
if(!w.length){await q(sb.from("wallets").insert({user_id:user.id,name:"Tunai",balance:0}));return loadFinance()}
wallets=w.map(x=>({...x,balance:Number(x.balance)}));
if(!wallets.some(x=>x.id===dompetAktifId))dompetAktifId=wallets[0].id;
transaksi=t.map(x=>({id:x.id,wallet_id:x.wallet_id,dompet:x.wallet_name,nominal:Number(x.amount),tipe:x.type,kategori:x.category,tanggal:x.tx_date}));
if(!s){await q(sb.from("savings").insert({user_id:user.id}));saving={target_name:"",target_amount:0,amount:0}}
else saving={target_name:s.target_name||"",target_amount:Number(s.target_amount||0),amount:Number(s.amount||0)};
renderDompet();renderTransaksi();renderTabungan();saveDashboardOffline();
}catch(e){if(offlineStore?.isNetworkError(e)&&restoreDashboardOffline())return;throw e}
}
function pasangRealtime(){
if(rt||!cloudReady())return;
let refresh=()=>{clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>loadDashboard().catch(e=>info(e.message)),250)};
rt=sb.channel("student-planner-"+user.id);
["schedules","tasks","wallets","transactions","savings"].forEach(table=>rt.on("postgres_changes",{event:"*",schema:"public",table,filter:`user_id=eq.${user.id}`},refresh));
rt.on("postgres_changes",{event:"*",schema:"public",table:"profiles",filter:`user_id=eq.${user.id}`},()=>loadIdentitas().catch(()=>{}));
rt.subscribe();
}

/* JADWAL */
function htmlJadwal(j,i){return `<div class="item"><div class="item-info"><strong>${aman(j.matkul)}</strong><div class="meta">${aman(j.waktu)}${j.ruangan?" • "+aman(j.ruangan):""}</div></div><div class="item-actions"><button class="edit-small" onclick="bukaEditJadwal(${i})">EDIT</button><button class="delete" onclick="hapusJadwal(${i})">X</button></div></div>`}
function renderJadwal(){
let h=hariIni(),d=jadwal.map((x,i)=>({...x,index:i})).filter(x=>x.hari===h).sort((a,b)=>a.waktu.localeCompare(b.waktu));
$("hari-sekarang").innerText=h;$("summary-jadwal").innerText=d.length;
$("jadwal-ringkas").innerHTML=d.length?d.map(x=>htmlJadwal(x,x.index)).join(""):`<div class="empty"><strong>Belum ada kuliah hari ini.</strong><span>Tambahkan jadwal agar planner bisa mengingatkan aktivitas akademikmu.</span><button class="empty-action" onclick="bukaTambahJadwal()">+ TAMBAH JADWAL</button></div>`;
$("jadwal-lengkap").innerHTML=hariUrut.map(h=>{let x=jadwal.map((j,i)=>({...j,index:i})).filter(j=>j.hari===h).sort((a,b)=>a.waktu.localeCompare(b.waktu));return x.length?`<h3 class="badge white">${h}</h3>${x.map(j=>htmlJadwal(j,j.index)).join("")}`:""}).join("");
}
function resetFormJadwal(){editJadwal=null;["input-matkul","input-waktu","input-ruangan"].forEach(id=>$(id).value="");$("input-hari").value="";$("simpan-jadwal").innerText="SIMPAN";$("batal-edit-jadwal").classList.add("hidden")}
function bukaTambahJadwal(){toggleTambah("form-jadwal",resetFormJadwal)}
function bukaEditJadwal(i){let j=jadwal[i];editJadwal=i;$("input-hari").value=j.hari;$("input-matkul").value=j.matkul;$("input-waktu").value=j.waktu;$("input-ruangan").value=j.ruangan;$("simpan-jadwal").innerText="SIMPAN PERUBAHAN";$("batal-edit-jadwal").classList.remove("hidden");$("form-jadwal").classList.remove("hidden");$("form-jadwal").scrollIntoView({behavior:"smooth",block:"nearest"})}
function batalEditJadwal(){resetFormJadwal();$("form-jadwal").classList.add("hidden")}
async function simpanJadwal(){
let hari=$("input-hari").value,matkul=$("input-matkul").value.trim(),waktu=$("input-waktu").value.trim(),ruangan=$("input-ruangan").value.trim();
if(!hari||!matkul||!waktu)return info("Isi hari, mata kuliah, dan waktu terlebih dahulu.");
try{
let d={day:hari,course_name:matkul,time_range:waktu,room:ruangan||null};
let editing=editJadwal!==null,id=editing?jadwal[editJadwal].id:offlineStore.uuid(),idx=editJadwal;
let queued=await runCloudOrQueue(
()=>editing?q(sb.from("schedules").update(d).eq("id",id)):q(sb.from("schedules").insert({id,...d,user_id:user.id})),
()=>{let local={id,hari,matkul,waktu,ruangan};if(editing)jadwal[idx]=local;else jadwal.push(local)},
{kind:editing?"schedule_update":"schedule_insert",id,data:d}
);
resetFormJadwal();$("form-jadwal").classList.add("hidden");
if(!queued)await loadJadwal();renderJadwal();syncAndroidReminders();saveDashboardOffline();
}catch(e){info(e.message)}
}
function hapusJadwal(i){confirmBox(`Hapus jadwal ${jadwal[i].matkul}?`,async()=>{try{
let id=jadwal[i].id;
let queued=await runCloudOrQueue(
()=>q(sb.from("schedules").delete().eq("id",id)),
()=>jadwal.splice(i,1),
{kind:"schedule_delete",id}
);
batalEditJadwal();if(!queued)await loadJadwal();renderJadwal();syncAndroidReminders();saveDashboardOffline();
}catch(e){info(e.message)}},"HAPUS")}

/* TUGAS */
function statusDeadline(t){
if(t.selesai)return["SELESAI","complete"];
let n=new Date();n.setHours(0,0,0,0);let d=new Date(t.deadline+"T00:00:00"),s=Math.round((d-n)/86400000);
if(s<0)return["TERLAMBAT","urgent"];if(s===0)return["HARI INI","urgent"];if(s===1)return["BESOK","soon"];if(s<=3)return[`${s} HARI LAGI`,"soon"];
return[d.toLocaleDateString("id-ID",{day:"2-digit",month:"short"}).toUpperCase(),""];
}
function htmlTugas(t,i){let[s,k]=statusDeadline(t);return `<div class="item task ${t.selesai?"done":""}"><input type="checkbox" ${t.selesai?"checked":""} onchange="toggleTugas(${i})"><div class="item-info"><strong>${aman(t.nama)}</strong><div><span class="task-tag">${aman(t.matkul)}</span> <span class="task-tag ${k}">${s}</span></div></div><div class="item-actions"><button class="edit-small" onclick="bukaEditTugas(${i})">EDIT</button><button class="delete" onclick="hapusTugas(${i})">X</button></div></div>`}
function renderTugas(){
let d=tugas.map((x,i)=>({...x,index:i})).sort((a,b)=>a.selesai!==b.selesai?a.selesai-b.selesai:new Date(a.deadline)-new Date(b.deadline)),aktif=d.filter(x=>!x.selesai),selesai=d.filter(x=>x.selesai);
$("count-tugas").innerText=$("summary-tugas").innerText=aktif.length;$("count-selesai").innerText=selesai.length;
$("tugas-ringkas").innerHTML=aktif.length?aktif.map(x=>htmlTugas(x,x.index)).join(""):`<div class="empty"><strong>Belum ada tugas aktif 🎉</strong><span>Tambahkan tugas baru supaya deadline tetap terpantau.</span><button class="empty-action" onclick="bukaTambahTugas()">+ TAMBAH TUGAS</button></div>`;
$("tugas-selesai-list").innerHTML=selesai.length?selesai.map(x=>htmlTugas(x,x.index)).join(""):`<div class="empty">Belum ada tugas selesai.</div>`;
}
function resetFormTugas(){editTugas=null;["input-tugas","input-matkul-tugas","input-deadline"].forEach(id=>$(id).value="");$("simpan-tugas").innerText="SIMPAN";$("batal-edit-tugas").classList.add("hidden")}
function bukaTambahTugas(){toggleTambah("form-tugas",resetFormTugas)}
function bukaEditTugas(i){let t=tugas[i];editTugas=i;$("input-tugas").value=t.nama;$("input-matkul-tugas").value=t.matkul;$("input-deadline").value=t.deadline;$("simpan-tugas").innerText="SIMPAN PERUBAHAN";$("batal-edit-tugas").classList.remove("hidden");$("form-tugas").classList.remove("hidden");$("form-tugas").scrollIntoView({behavior:"smooth",block:"nearest"})}
function batalEditTugas(){resetFormTugas();$("form-tugas").classList.add("hidden")}
async function simpanTugas(){
let nama=$("input-tugas").value.trim(),matkul=$("input-matkul-tugas").value.trim(),deadline=$("input-deadline").value;
if(!nama||!matkul||!deadline)return info("Isi nama tugas, mata kuliah, dan deadline.");
try{
let d={name:nama,course_name:matkul,deadline},editing=editTugas!==null,id=editing?tugas[editTugas].id:offlineStore.uuid(),idx=editTugas;
if(!editing)d.completed=false;
let queued=await runCloudOrQueue(
()=>editing?q(sb.from("tasks").update(d).eq("id",id)):q(sb.from("tasks").insert({id,...d,user_id:user.id})),
()=>{let old=editing?tugas[idx]:null,local={id,nama,matkul,deadline,selesai:editing?!!old.selesai:false};if(editing)tugas[idx]=local;else tugas.push(local)},
{kind:editing?"task_update":"task_insert",id,data:d}
);
resetFormTugas();$("form-tugas").classList.add("hidden");if(!queued)await loadTugas();renderTugas();syncAndroidReminders();saveDashboardOffline();
}catch(e){info(e.message)}
}
async function toggleTugas(i){try{
let id=tugas[i].id,completed=!tugas[i].selesai;
let queued=await runCloudOrQueue(
()=>q(sb.from("tasks").update({completed}).eq("id",id)),
()=>{tugas[i].selesai=completed},
{kind:"task_update",id,data:{completed}}
);
if(!queued)await loadTugas();renderTugas();syncAndroidReminders();saveDashboardOffline();
}catch(e){info(e.message)}}
function hapusTugas(i){confirmBox(`Hapus tugas ${tugas[i].nama}?`,async()=>{try{
let id=tugas[i].id;
let queued=await runCloudOrQueue(
()=>q(sb.from("tasks").delete().eq("id",id)),
()=>tugas.splice(i,1),
{kind:"task_delete",id}
);
batalEditTugas();if(!queued)await loadTugas();renderTugas();syncAndroidReminders();saveDashboardOffline();
}catch(e){info(e.message)}},"HAPUS")}

/* DOMPET */
const walletAktif=()=>wallets.find(x=>x.id===dompetAktifId);
function renderDompet(){
if(!wallets.length)return;
if(!walletAktif())dompetAktifId=wallets[0].id;
$("pilih-dompet").innerHTML=wallets.map(x=>`<option value="${x.id}" ${x.id===dompetAktifId?"selected":""}>${aman(x.name)}</option>`).join("");
$("saldo-display").innerText=rupiah(walletAktif()?.balance||0);
}
function gantiDompet(){dompetAktifId=$("pilih-dompet").value;renderDompet()}
async function tambahDompet(){
let name=$("input-nama-dompet").value.trim(),balance=Number($("input-saldo-dompet").value||0);
if(!name)return info("Masukkan nama dompet.");if(balance<0)return info("Saldo awal tidak boleh negatif.");
if(wallets.some(w=>w.name.toLowerCase()===name.toLowerCase()))return info("Dompet tersebut sudah ada.");
try{
let id=offlineStore.uuid();
let queued=await runCloudOrQueue(
()=>q(sb.from("wallets").insert({id,user_id:user.id,name,balance})),
()=>wallets.push({id,user_id:user.id,name,balance}),
{kind:"wallet_insert",id,data:{name,balance}}
);
dompetAktifId=id;$("input-nama-dompet").value=$("input-saldo-dompet").value="";toggle("form-dompet");
if(!queued)await loadFinance();else{renderDompet();saveDashboardOffline()}
}catch(e){info(e.code==="23505"?"Dompet tersebut sudah ada.":e.message)}
}
function hapusDompet(){
if(wallets.length<=1)return info("Minimal harus ada satu dompet.");
let w=walletAktif();confirmBox(`Hapus dompet "${w.name}" dengan saldo ${rupiah(w.balance)}? Riwayat transaksi tetap disimpan.`,async()=>{try{
let id=w.id;
let queued=await runCloudOrQueue(
()=>q(sb.from("wallets").delete().eq("id",id)),
()=>{wallets=wallets.filter(x=>x.id!==id);transaksi.forEach(t=>{if(t.wallet_id===id)t.wallet_id=null})},
{kind:"wallet_delete",id}
);
dompetAktifId=null;if(!queued)await loadFinance();else{dompetAktifId=wallets[0]?.id||null;renderDompet();renderTransaksi();saveDashboardOffline()}
}catch(e){info(e.message)}},"HAPUS");
}

/* TRANSAKSI */
function formatTanggalTransaksi(t){return new Date(t+"T00:00:00").toLocaleDateString("id-ID",{day:"2-digit",month:"short",year:"numeric"})}
function resetFormTransaksi(){editTransaksi=null;$("nominal-uang").value="";$("tanggal-transaksi").value="";$("tipe-uang").value="keluar";$("kategori-uang").selectedIndex=0;$("simpan-transaksi").innerText="SIMPAN TRANSAKSI";$("batal-edit-transaksi").classList.add("hidden");$("transaksi-dompet-info").classList.add("hidden")}
function bukaTambahTransaksi(){toggleTambah("form-transaksi",resetFormTransaksi)}
function bukaEditTransaksi(i){
let t=transaksi[i];if(!t.wallet_id||!wallets.some(w=>w.id===t.wallet_id))return info(`Dompet "${t.dompet}" sudah dihapus, jadi transaksi ini tidak bisa diedit.`);
editTransaksi=i;$("nominal-uang").value=t.nominal;$("tipe-uang").value=t.tipe;$("kategori-uang").value=t.kategori;$("tanggal-transaksi").value=t.tanggal;$("simpan-transaksi").innerText="SIMPAN PERUBAHAN";$("batal-edit-transaksi").classList.remove("hidden");$("transaksi-dompet-info").innerText=`DOMPET: ${t.dompet}`;$("transaksi-dompet-info").classList.remove("hidden");$("form-transaksi").classList.remove("hidden");$("form-transaksi").scrollIntoView({behavior:"smooth",block:"nearest"});
}
function batalEditTransaksi(){resetFormTransaksi();$("form-transaksi").classList.add("hidden")}
function applyLocalTxRecord(id,nominal,tipe,kategori,tanggal){
let w=walletAktif();if(w)w.balance+=tipe==="masuk"?nominal:-nominal;
transaksi.unshift({id,wallet_id:w?.id||null,dompet:w?.name||"Dompet",nominal,tipe,kategori,tanggal});
}
function applyLocalTxUpdate(i,nominal,tipe,kategori,tanggal){
let old=transaksi[i],w=wallets.find(x=>x.id===old.wallet_id);
if(w){w.balance+=old.tipe==="masuk"?-old.nominal:old.nominal;w.balance+=tipe==="masuk"?nominal:-nominal}
transaksi[i]={...old,nominal,tipe,kategori,tanggal};
}
async function simpanTransaksi(){
let nominal=Number($("nominal-uang").value),tipe=$("tipe-uang").value,kategori=$("kategori-uang").value,tanggal=$("tanggal-transaksi").value;
if(!nominal||nominal<=0)return info("Masukkan nominal transaksi yang valid.");if(!tanggal)return info("Pilih tanggal transaksi terlebih dahulu.");
let run=async()=>{try{
let editing=editTransaksi!==null,idx=editTransaksi,id=editing?transaksi[idx].id:offlineStore.uuid();
let data={wallet_id:editing?transaksi[idx].wallet_id:dompetAktifId,amount:nominal,type:tipe,category:kategori,tx_date:tanggal};
let queued=await runCloudOrQueue(
()=>editing
?q(sb.rpc("update_transaction",{p_transaction_id:id,p_amount:nominal,p_type:tipe,p_category:kategori,p_tx_date:tanggal}))
:q(sb.rpc("record_transaction_offline",{p_transaction_id:id,p_wallet_id:dompetAktifId,p_amount:nominal,p_type:tipe,p_category:kategori,p_tx_date:tanggal})),
()=>editing?applyLocalTxUpdate(idx,nominal,tipe,kategori,tanggal):applyLocalTxRecord(id,nominal,tipe,kategori,tanggal),
{kind:editing?"tx_update":"tx_record",id,data}
);
resetFormTransaksi();$("form-transaksi").classList.add("hidden");if(!queued)await loadFinance();else{renderDompet();renderTransaksi();saveDashboardOffline()}
}catch(e){info(e.message)}};
if(editTransaksi===null&&tipe==="keluar"&&(walletAktif()?.balance||0)<nominal)return confirmBox("Saldo tidak cukup. Tetap catat hingga saldo menjadi minus?",run,"TETAP CATAT");
if(editTransaksi!==null&&tipe==="keluar"){
let old=transaksi[editTransaksi],w=wallets.find(x=>x.id===old.wallet_id),saldoDasar=(w?.balance||0)+(old.tipe==="keluar"?old.nominal:-old.nominal);
if(saldoDasar<nominal)return confirmBox("Perubahan ini membuat saldo dompet menjadi minus. Tetap simpan?",run,"TETAP SIMPAN");
}
run();
}
function hapusTransaksi(i){
let t=transaksi[i],ada=t.wallet_id&&wallets.some(w=>w.id===t.wallet_id);
let pesan=ada?`Hapus transaksi ${t.kategori} ${rupiah(t.nominal)}? Saldo ${t.dompet} akan dikoreksi otomatis.`:`Hapus transaksi ${t.kategori} ${rupiah(t.nominal)}? Hanya riwayat yang dihapus karena dompet sudah tidak ada.`;
confirmBox(pesan,async()=>{try{
let id=t.id;
let queued=await runCloudOrQueue(
()=>q(sb.rpc("delete_transaction",{p_transaction_id:id})),
()=>{let w=wallets.find(x=>x.id===t.wallet_id);if(w)w.balance+=t.tipe==="masuk"?-t.nominal:t.nominal;transaksi.splice(i,1)},
{kind:"tx_delete",id}
);
batalEditTransaksi();if(!queued)await loadFinance();else{renderDompet();renderTransaksi();saveDashboardOffline()}
}catch(e){info(e.message)}},"HAPUS");
}

function setFilterTransaksi(f){filterTransaksi=f;renderTransaksi()}
function renderTransaksi(){
let masuk=transaksi.filter(x=>x.tipe==="masuk").reduce((a,b)=>a+b.nominal,0),keluar=transaksi.filter(x=>x.tipe==="keluar").reduce((a,b)=>a+b.nominal,0);
$("total-masuk").innerText=rupiah(masuk);$("total-keluar").innerText=rupiah(keluar);["semua","masuk","keluar"].forEach(f=>$("filter-"+f).classList.toggle("active",filterTransaksi===f));
let d=transaksi.map((x,i)=>({...x,index:i})).filter(x=>filterTransaksi==="semua"||x.tipe===filterTransaksi);
$("daftar-riwayat").innerHTML=d.length?d.map(x=>`<div class="history-row"><div class="history-info"><strong>${aman(x.kategori)}</strong><small>${aman(x.dompet)} • ${formatTanggalTransaksi(x.tanggal)}</small></div><div class="history-side"><span class="amount ${x.tipe==="masuk"?"in":""}">${x.tipe==="masuk"?"+":"-"}${rupiah(x.nominal)}</span><div class="history-actions"><button class="edit-small" onclick="bukaEditTransaksi(${x.index})">EDIT</button><button class="delete" onclick="hapusTransaksi(${x.index})">X</button></div></div></div>`).join(""):`<div class="empty"><strong>${filterTransaksi==="semua"?"Belum ada transaksi.":`Belum ada transaksi ${filterTransaksi}.`}</strong><span>Catat pemasukan atau pengeluaran supaya saldo dan riwayatmu tetap rapi.</span></div>`;
}

/* TABUNGAN */
async function aturTarget(){
let target_name=$("input-nama-target").value.trim(),target_amount=Number($("input-nominal-target").value);
if(!target_name||target_amount<=0)return info("Isi nama dan nominal target tabungan.");
try{
let data={target_name,target_amount,amount:Math.min(saving.amount,target_amount),updated_at:new Date().toISOString()};
let queued=await runCloudOrQueue(
()=>q(sb.from("savings").upsert({user_id:user.id,...data})),
()=>saving={...saving,...data},
{kind:"savings_target",data}
);
$("input-nama-target").value=$("input-nominal-target").value="";toggle("form-target");if(!queued)await loadFinance();else{renderTabungan();saveDashboardOffline()}
}catch(e){info(e.message)}
}
async function menabung(){
if(!saving.target_amount)return info("Atur target tabungan terlebih dahulu.");
let n=Number($("nominal-tabung").value);if(!n||n<=0)return info("Masukkan nominal tabungan.");
let add=Math.min(n,Math.max(saving.target_amount-saving.amount,0)),w=walletAktif();
if(add<=0)return info("Target tabungan sudah tercapai.");if((w?.balance||0)<add)return info("Saldo dompet tidak cukup.");
try{
let before=saving.amount;
let queued=await runCloudOrQueue(
()=>q(sb.rpc("deposit_savings",{p_wallet_id:dompetAktifId,p_amount:n})),
()=>{w.balance-=add;saving.amount+=add;saving.updated_at=new Date().toISOString()},
{kind:"savings_deposit",data:{wallet_id:dompetAktifId,amount:n}}
);
$("nominal-tabung").value="";if(!queued)await loadFinance();else{renderDompet();renderTabungan();saveDashboardOffline()}
if(before<saving.target_amount&&saving.amount>=saving.target_amount)info(`Target "${saving.target_name}" berhasil tercapai 🎉`);
}catch(e){info(e.message)}
}
function tarikTabungan(){
if(!saving.target_amount)return info("Belum ada target tabungan.");
let n=Number($("nominal-tabung").value);if(!n||n<=0)return info("Masukkan nominal yang ingin ditarik.");if(n>saving.amount)return info(`Tabungan hanya ${rupiah(saving.amount)}.`);
confirmBox(`Tarik ${rupiah(n)} ke ${walletAktif()?.name}?`,async()=>{try{
let w=walletAktif();
let queued=await runCloudOrQueue(
()=>q(sb.rpc("withdraw_savings",{p_wallet_id:dompetAktifId,p_amount:n})),
()=>{saving.amount-=n;if(w)w.balance+=n;saving.updated_at=new Date().toISOString()},
{kind:"savings_withdraw",data:{wallet_id:dompetAktifId,amount:n}}
);
$("nominal-tabung").value="";if(!queued)await loadFinance();else{renderDompet();renderTabungan();saveDashboardOffline()}
}catch(e){info(e.message)}},"TARIK");
}

function renderTabungan(){
let p=saving.target_amount?Math.min(100,Math.round(saving.amount/saving.target_amount*100)):0;
$("nama-target").innerText=saving.target_name||"Belum Ada Target";$("teks-tabungan").innerText=`${rupiah(saving.amount)} / ${rupiah(saving.target_amount)}`;$("persen-tabungan").innerText=p+"%";$("progress-fill").style.width=p+"%";
$("sisa-target").innerText=!saving.target_amount?"Atur target tabungan terlebih dahulu.":saving.amount>=saving.target_amount?"Target tercapai 🎉":`Kurang ${rupiah(saving.target_amount-saving.amount)} lagi.`;
}

window.addEventListener("offline",()=>updateOfflineUI(true));
window.addEventListener("online",async()=>{
if(!user||sb?.__offlineFallback)return;
try{await syncOfflineChanges(true);await Promise.all([loadDashboard(),loadIdentitas()]);pasangRealtime()}catch(e){updateOfflineUI(true)}
});
window.addEventListener("studentplanner:offlinequeue",()=>updateOfflineUI(!cloudReady()));

/* START */
sb.auth.onAuthStateChange((event,session)=>{
if(event==="PASSWORD_RECOVERY"){
recoveryMode=true;user=session?.user||null;
$("password-recovery-modal").classList.remove("hidden");
$("login-screen").classList.add("hidden");
}
});
function renderSemua(){renderJadwal();renderTugas();renderDompet();renderTransaksi();renderTabungan()}
(async()=>{checkAppUpdate();let{data:{session}}=await sb.auth.getSession();if(session&&!recoveryMode){user=session.user;await bukaDashboard()}})();
document.addEventListener("keydown",e=>{
if(e.key==="Escape"){tutupConfirm();$("info-modal").classList.add("hidden")}
if(e.key==="Enter"&&!$("login-screen").classList.contains("hidden")&&["email","password"].includes(document.activeElement?.id))login();
});
