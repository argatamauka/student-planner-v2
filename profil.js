const $=id=>document.getElementById(id);
let user=null,profil=null,snapshot={},rt=null,photoUrl=null;
const fields=[...document.querySelectorAll(".profile-input")],oldKeys=["nim","name","program","ijazah_name","financial_number","gender","birth_place_date","academic_status","religion","residence","marital_status","faculty","study_program","curriculum_name","academic_probation","race","address","mother_name","mother_phone","mother_address","father_name","father_phone","father_address","guardian_name","guardian_phone","guardian_address"];
async function q(p){let{data,error}=await p;if(error)throw error;return data}
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
profil=await q(sb.from("profiles").select("*").single());isiForm(profil);
if(profil.avatar_path)await loadFoto(profil.avatar_path);else{$("foto-preview").classList.add("hidden");$("foto-placeholder").classList.remove("hidden")}
}
async function loadFoto(path){
try{let blob=await q(sb.storage.from("profile-photos").download(path));if(photoUrl)URL.revokeObjectURL(photoUrl);photoUrl=URL.createObjectURL(blob);$("foto-preview").src=photoUrl;$("foto-preview").classList.remove("hidden");$("foto-placeholder").classList.add("hidden")}catch{}
}
function mulaiEdit(){snapshot=formData();fields.forEach(x=>x.disabled=false);$("edit-btn").classList.add("hidden");$("edit-actions").classList.remove("hidden")}
function selesaiEdit(){fields.forEach(x=>x.disabled=true);$("edit-btn").classList.remove("hidden");$("edit-actions").classList.add("hidden")}
function batalEdit(){fields.forEach(x=>x.value=snapshot[x.dataset.field]??"");header();selesaiEdit()}
async function simpanProfil(){
let d=formData();if(!d.name||!d.nim)return tampilModal("Nama dan NIM tidak boleh kosong.");
try{await q(sb.from("profiles").update({...d,updated_at:new Date().toISOString()}).eq("user_id",user.id));profil={...profil,...d};header();selesaiEdit();tampilModal("Profil berhasil diperbarui.")}catch(e){tampilModal(e.message)}
}
function tampilModal(t){$("modal-message").innerText=t;$("saved-modal").classList.remove("hidden")}
function tutupModal(){$("saved-modal").classList.add("hidden")}
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
let file=e.target.files[0];if(!file)return;if(!file.type.startsWith("image/"))return tampilModal("Pilih file gambar.");
let r=new FileReader();r.onload=()=>{let im=new Image();im.onload=()=>{let max=700,s=Math.min(1,max/Math.max(im.width,im.height)),c=document.createElement("canvas");c.width=Math.round(im.width*s);c.height=Math.round(im.height*s);c.getContext("2d").drawImage(im,0,0,c.width,c.height);c.toBlob(async blob=>{try{let path=`${user.id}/avatar.jpg`;await q(sb.storage.from("profile-photos").upload(path,blob,{upsert:true,contentType:"image/jpeg"}));await q(sb.from("profiles").update({avatar_path:path,updated_at:new Date().toISOString()}).eq("user_id",user.id));profil.avatar_path=path;await loadFoto(path);tampilModal("Foto profil berhasil diperbarui.")}catch(err){tampilModal(err.message)}},"image/jpeg",.8)};im.src=r.result};r.readAsDataURL(file);
});
document.addEventListener("keydown",e=>{if(e.key==="Escape"){$("saved-modal").classList.add("hidden");tutupHapusAkun()}});
(async()=>{
let{data:{session}}=await sb.auth.getSession();if(!session)return location.href="index.html";
user=session.user;try{profil=await migrasiProfil();await migrasiFoto();await load();rt=sb.channel("profile-"+user.id).on("postgres_changes",{event:"*",schema:"public",table:"profiles",filter:`user_id=eq.${user.id}`},()=>load()).subscribe()}catch(e){tampilModal("Gagal memuat profil: "+e.message)}
})();
