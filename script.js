const $=id=>document.getElementById(id),rupiah=n=>"Rp "+Number(n||0).toLocaleString("id-ID"),toggle=id=>$(id).classList.toggle("hidden");
const aman=t=>String(t??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
function info(t){$("info-text").innerText=t;$("info-modal").classList.remove("hidden")}
function toggleTambah(id,reset){let tutup=!$(id).classList.contains("hidden");reset();$(id).classList.toggle("hidden",tutup)}
let aksiConfirm=null,user=null,rt=null,refreshTimer=null,recoveryMode=false;
function confirmBox(t,a,b="LANJUTKAN"){$("confirm-text").innerText=t;$("confirm-ok").innerText=b;aksiConfirm=a;$("confirm-modal").classList.remove("hidden")}
function tutupConfirm(){$("confirm-modal").classList.add("hidden");aksiConfirm=null}
$("confirm-ok").onclick=()=>{let a=aksiConfirm;tutupConfirm();if(a)a()};
async function q(p){let{data,error}=await p;if(error)throw error;return data}
function setLoading(show,text="MEMUAT..."){let el=$("app-loading");if(!el)return;if(text)$("loading-text").innerText=text;el.classList.toggle("hidden",!show)}
function setAuthButtons(disabled){["login-btn","register-btn"].forEach(id=>{let b=$(id);if(b)b.disabled=disabled})}
function namaPanggilan(nama){
nama=String(nama||"").trim();if(!nama)return"";
if(nama.includes(",")){let setelah=nama.split(",")[1]?.trim();if(setelah)return setelah.split(/\s+/)[0]}
return nama.split(/\s+/)[0];
}
async function loadIdentitas(){
let p=await q(sb.from("profiles").select("name,nim").maybeSingle());
if(!p?.name?.trim()){
$("onboarding-name").value="";
$("onboarding-nim").value=p?.nim||"";
$("onboarding-modal").classList.remove("hidden");
$("sapaan-user").innerText="HALO!";
$("dashboard-avatar").innerText="?";
return false;
}
let nama=namaPanggilan(p.name);
$("sapaan-user").innerText=`HALO, ${nama.toUpperCase()}!`;
$("dashboard-avatar").innerText=(nama[0]||"?").toUpperCase();
$("onboarding-modal").classList.add("hidden");
return true;
}
async function simpanOnboarding(){
let name=$("onboarding-name").value.trim(),nim=$("onboarding-nim").value.trim();
if(name.length<2)return info("Masukkan nama lengkap terlebih dahulu.");
setLoading(true,"MENYIAPKAN PROFIL...");
try{
await q(sb.from("profiles").upsert({user_id:user.id,name,nim:nim||null,updated_at:new Date().toISOString()},{onConflict:"user_id"}));
$("onboarding-modal").classList.add("hidden");
await loadIdentitas();
info(`Selamat datang, ${namaPanggilan(name)}! Planner-mu siap digunakan 🎉`);
}catch(e){info("Gagal menyimpan profil: "+e.message)}
finally{setLoading(false)}
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
if(!email||password.length<6)return info("Isi email dan password minimal 6 karakter.");
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
if(a.length<6)return info("Password baru minimal 6 karakter.");
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
async function logout(){if(rt)await sb.removeChannel(rt);try{window.AndroidNotifications?.clearReminders()}catch{}await sb.auth.signOut();$("dashboard-screen").classList.add("hidden");$("login-screen").classList.remove("hidden");$("email").value=$("password").value="";scrollTo(0,0)}
async function bukaDashboard(){
$("login-screen").classList.add("hidden");$("dashboard-screen").classList.remove("hidden");
setLoading(true,"MENYIAPKAN PLANNER...");
try{await migrasiLokal();await Promise.all([loadDashboard(),loadIdentitas()]);pasangRealtime();setTimeout(offerNotificationIntro,350);scrollTo(0,0)}
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
async function loadDashboard(){await Promise.all([loadJadwal(),loadTugas(),loadFinance()]);renderSemua();syncAndroidReminders()}
async function loadJadwal(){
let d=await q(sb.from("schedules").select("*"));
jadwal=d.map(x=>({id:x.id,hari:x.day,matkul:x.course_name,waktu:x.time_range,ruangan:x.room||""}));
}
async function loadTugas(){
let d=await q(sb.from("tasks").select("*"));
tugas=d.map(x=>({id:x.id,nama:x.name,matkul:x.course_name,deadline:x.deadline,selesai:x.completed}));
}
async function loadFinance(){
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
renderDompet();renderTransaksi();renderTabungan();
}
function pasangRealtime(){
if(rt)return;
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
editJadwal===null?await q(sb.from("schedules").insert({...d,user_id:user.id})):await q(sb.from("schedules").update(d).eq("id",jadwal[editJadwal].id));
resetFormJadwal();$("form-jadwal").classList.add("hidden");await loadJadwal();renderJadwal();syncAndroidReminders();
}catch(e){info(e.message)}
}
function hapusJadwal(i){confirmBox(`Hapus jadwal ${jadwal[i].matkul}?`,async()=>{try{await q(sb.from("schedules").delete().eq("id",jadwal[i].id));batalEditJadwal();await loadJadwal();renderJadwal();syncAndroidReminders()}catch(e){info(e.message)}},"HAPUS")}

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
let d={name:nama,course_name:matkul,deadline};
editTugas===null?await q(sb.from("tasks").insert({...d,user_id:user.id,completed:false})):await q(sb.from("tasks").update(d).eq("id",tugas[editTugas].id));
resetFormTugas();$("form-tugas").classList.add("hidden");await loadTugas();renderTugas();syncAndroidReminders();
}catch(e){info(e.message)}
}
async function toggleTugas(i){try{await q(sb.from("tasks").update({completed:!tugas[i].selesai}).eq("id",tugas[i].id));await loadTugas();renderTugas();syncAndroidReminders()}catch(e){info(e.message)}}
function hapusTugas(i){confirmBox(`Hapus tugas ${tugas[i].nama}?`,async()=>{try{await q(sb.from("tasks").delete().eq("id",tugas[i].id));batalEditTugas();await loadTugas();renderTugas();syncAndroidReminders()}catch(e){info(e.message)}},"HAPUS")}

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
try{let d=await q(sb.from("wallets").insert({user_id:user.id,name,balance}).select().single());dompetAktifId=d.id;$("input-nama-dompet").value=$("input-saldo-dompet").value="";toggle("form-dompet");await loadFinance()}catch(e){info(e.code==="23505"?"Dompet tersebut sudah ada.":e.message)}
}
function hapusDompet(){
if(wallets.length<=1)return info("Minimal harus ada satu dompet.");
let w=walletAktif();confirmBox(`Hapus dompet "${w.name}" dengan saldo ${rupiah(w.balance)}? Riwayat transaksi tetap disimpan.`,async()=>{try{await q(sb.from("wallets").delete().eq("id",w.id));dompetAktifId=null;await loadFinance()}catch(e){info(e.message)}},"HAPUS");
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
async function simpanTransaksi(){
let nominal=Number($("nominal-uang").value),tipe=$("tipe-uang").value,kategori=$("kategori-uang").value,tanggal=$("tanggal-transaksi").value;
if(!nominal||nominal<=0)return info("Masukkan nominal transaksi yang valid.");if(!tanggal)return info("Pilih tanggal transaksi terlebih dahulu.");
let run=async()=>{try{
if(editTransaksi===null)await q(sb.rpc("record_transaction",{p_wallet_id:dompetAktifId,p_amount:nominal,p_type:tipe,p_category:kategori,p_tx_date:tanggal}));
else await q(sb.rpc("update_transaction",{p_transaction_id:transaksi[editTransaksi].id,p_amount:nominal,p_type:tipe,p_category:kategori,p_tx_date:tanggal}));
resetFormTransaksi();$("form-transaksi").classList.add("hidden");await loadFinance();
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
confirmBox(pesan,async()=>{try{await q(sb.rpc("delete_transaction",{p_transaction_id:t.id}));batalEditTransaksi();await loadFinance()}catch(e){info(e.message)}},"HAPUS");
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
try{await q(sb.from("savings").upsert({user_id:user.id,target_name,target_amount,amount:Math.min(saving.amount,target_amount),updated_at:new Date().toISOString()}));$("input-nama-target").value=$("input-nominal-target").value="";toggle("form-target");await loadFinance()}catch(e){info(e.message)}
}
async function menabung(){
if(!saving.target_amount)return info("Atur target tabungan terlebih dahulu.");
let n=Number($("nominal-tabung").value);if(!n||n<=0)return info("Masukkan nominal tabungan.");
try{let before=saving.amount;await q(sb.rpc("deposit_savings",{p_wallet_id:dompetAktifId,p_amount:n}));$("nominal-tabung").value="";await loadFinance();if(before<saving.target_amount&&saving.amount>=saving.target_amount)info(`Target "${saving.target_name}" berhasil tercapai 🎉`)}catch(e){info(e.message)}
}
function tarikTabungan(){
if(!saving.target_amount)return info("Belum ada target tabungan.");
let n=Number($("nominal-tabung").value);if(!n||n<=0)return info("Masukkan nominal yang ingin ditarik.");if(n>saving.amount)return info(`Tabungan hanya ${rupiah(saving.amount)}.`);
confirmBox(`Tarik ${rupiah(n)} ke ${walletAktif()?.name}?`,async()=>{try{await q(sb.rpc("withdraw_savings",{p_wallet_id:dompetAktifId,p_amount:n}));$("nominal-tabung").value="";await loadFinance()}catch(e){info(e.message)}},"TARIK");
}
function renderTabungan(){
let p=saving.target_amount?Math.min(100,Math.round(saving.amount/saving.target_amount*100)):0;
$("nama-target").innerText=saving.target_name||"Belum Ada Target";$("teks-tabungan").innerText=`${rupiah(saving.amount)} / ${rupiah(saving.target_amount)}`;$("persen-tabungan").innerText=p+"%";$("progress-fill").style.width=p+"%";
$("sisa-target").innerText=!saving.target_amount?"Atur target tabungan terlebih dahulu.":saving.amount>=saving.target_amount?"Target tercapai 🎉":`Kurang ${rupiah(saving.target_amount-saving.amount)} lagi.`;
}

/* START */
sb.auth.onAuthStateChange((event,session)=>{
if(event==="PASSWORD_RECOVERY"){
recoveryMode=true;user=session?.user||null;
$("password-recovery-modal").classList.remove("hidden");
$("login-screen").classList.add("hidden");
}
});
function renderSemua(){renderJadwal();renderTugas();renderDompet();renderTransaksi();renderTabungan()}
(async()=>{let{data:{session}}=await sb.auth.getSession();if(session&&!recoveryMode){user=session.user;await bukaDashboard()}})();
document.addEventListener("keydown",e=>{if(e.key==="Escape"){tutupConfirm();$("info-modal").classList.add("hidden")}});
