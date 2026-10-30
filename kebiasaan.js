const $=id=>document.getElementById(id);
const q=async promise=>{const{data,error}=await promise;if(error)throw error;return data};
let user=null,habits=[],logs=[],editingId=null,channel=null;
const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-")};
const keyFromDate=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
const dayIndex=d=>((d.getDay()+6)%7)+1;
const escapeHtml=s=>String(s??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
function toast(message){$("toast").textContent=message;$("toast").classList.remove("hidden");clearTimeout(toast.timer);toast.timer=setTimeout(()=>$("toast").classList.add("hidden"),2600)}
function mondayOf(d){const x=new Date(d);x.setHours(0,0,0,0);x.setDate(x.getDate()-((x.getDay()+6)%7));return x}
function dayNames(){return ["Sen","Sel","Rab","Kam","Jum","Sab","Min"]}
function scheduled(h,d){return h.frequency==="daily"||(h.days_of_week||[]).includes(dayIndex(d))}
function logFor(habitId,dateKey){return logs.some(x=>x.habit_id===habitId&&x.completed_on===dateKey)}
async function loadData(){
 const start=new Date();start.setDate(start.getDate()-30);
 const result=await Promise.all([
  q(sb.from("habits").select("*").order("sort_order").order("created_at")),
  q(sb.from("habit_logs").select("*").gte("completed_on",keyFromDate(start)).lte("completed_on",today()).order("completed_on"))
 ]);
 habits=result[0];logs=result[1];render();
}
function render(){
 const active=habits.filter(h=>h.active),prepared=habits.filter(h=>!h.active&&h.category==="Fitness"),now=today(),todayHabits=active.filter(h=>scheduled(h,new Date(now+"T00:00:00"))),doneToday=todayHabits.filter(h=>logFor(h.id,now));
 $("active-count").textContent=active.length;
 const weekStart=keyFromDate(mondayOf(new Date()));
 $("week-count").textContent=logs.filter(l=>l.completed_on>=weekStart).length;
 $("today-progress").textContent=doneToday.length+" / "+todayHabits.length;
 $("today-caption").textContent=todayHabits.length?"Kamu sudah menyelesaikan "+doneToday.length+" dari "+todayHabits.length+" kebiasaan hari ini.":"Belum ada kebiasaan yang dijadwalkan hari ini.";
 $("habit-list").innerHTML=(active.length?active.map(h=>{
  const done=logFor(h.id,now),days=(h.days_of_week||[]).map(n=>dayNames()[n-1]).join(", ");
  const schedule=h.frequency==="daily"?"SETIAP HARI":days.toUpperCase();
  return '<article class="habit-item '+(done?"done":"")+'"><div><div class="habit-title">'+escapeHtml(h.name)+'</div>'+
   (h.description?'<div class="habit-sub">'+escapeHtml(h.description)+'</div>':"")+
   '<div class="habit-tags"><span class="tag">'+escapeHtml(h.category)+'</span><span class="tag">'+schedule+'</span></div></div>'+
   '<div class="habit-actions"><button class="check-button" type="button" onclick="toggleToday(\''+h.id+'\')" aria-label="'+(done?"Batalkan":"Tandai")+' selesai">'+(done?"✓":"○")+'</button>'+
   '<button class="icon-button" type="button" onclick="editHabit(\''+h.id+'\')">EDIT</button>'+
   '<button class="icon-button" type="button" onclick="archiveHabit(\''+h.id+'\')">ARSIP</button></div></article>';
 }).join(""):'<div class="empty">Belum ada kebiasaan. Tekan + TAMBAH untuk membuat rutinitas pertamamu.</div>')+(prepared.length?'<div class="prepared-heading">DISIAPKAN · BELUM AKTIF</div>'+prepared.map(h=>'<article class="prepared-habit"><strong>'+escapeHtml(h.name)+'</strong><span>'+escapeHtml(h.description||"Belum diaktifkan")+'</span><small>Menunggu jadwal dan aktivasi</small></article>').join(""):"");
 renderWeek();
}
function renderWeek(){
 const start=mondayOf(new Date()),names=dayNames(),now=today();
 $("week-grid").innerHTML=Array.from({length:7},(_,i)=>{
  const d=new Date(start);d.setDate(start.getDate()+i);const key=keyFromDate(d);
  const scheduledToday=habits.filter(h=>h.active&&scheduled(h,d));
  const count=scheduledToday.filter(h=>logFor(h.id,key)).length;
  return '<div class="week-day '+(key===now?"today":"")+'"><strong>'+names[i]+'</strong><span>'+count+'/'+scheduledToday.length+'</span></div>';
 }).join("");
}
function resetForm(){
 editingId=null;$("habit-form").reset();$("habit-frequency").value="daily";$("days-picker").classList.add("hidden");
 $("save-habit").textContent="SIMPAN KEBIASAAN";$("cancel-edit").classList.add("hidden");$("habit-form").classList.add("hidden");
}
function openForm(){resetForm();$("habit-form").classList.remove("hidden");$("habit-name").focus()}
function editHabit(id){
 const h=habits.find(x=>x.id===id);if(!h)return;
 editingId=id;$("habit-name").value=h.name;$("habit-description").value=h.description||"";
 $("habit-category").value=h.category||"Personal";$("habit-frequency").value=h.frequency||"daily";
 $("days-picker").classList.toggle("hidden",h.frequency!=="custom");
 document.querySelectorAll("#days-picker input").forEach(el=>el.checked=(h.days_of_week||[]).includes(Number(el.value)));
 $("save-habit").textContent="SIMPAN PERUBAHAN";$("cancel-edit").classList.remove("hidden");
 $("habit-form").classList.remove("hidden");$("habit-form").scrollIntoView({behavior:"smooth",block:"nearest"});
}
async function saveHabit(e){
 e.preventDefault();
 const name=$("habit-name").value.trim(),description=$("habit-description").value.trim(),category=$("habit-category").value,frequency=$("habit-frequency").value;
 const days=frequency==="daily"?[1,2,3,4,5,6,7]:[...document.querySelectorAll("#days-picker input:checked")].map(x=>Number(x.value));
 if(!name)return toast("Masukkan nama kebiasaan.");
 if(frequency==="custom"&&!days.length)return toast("Pilih minimal satu hari.");
 const payload={name,description,category,frequency,days_of_week:days,target_per_week:days.length,active:true};
 try{
  if(editingId)await q(sb.from("habits").update(payload).eq("id",editingId));
  else await q(sb.from("habits").insert({...payload,user_id:user.id}));
  resetForm();await loadData();toast("Kebiasaan berhasil disimpan.");
 }catch(err){toast("Gagal menyimpan: "+err.message)}
}
async function toggleToday(id){
 const existing=logs.find(x=>x.habit_id===id&&x.completed_on===today());
 try{
  if(existing)await q(sb.from("habit_logs").delete().eq("id",existing.id));
  else await q(sb.from("habit_logs").insert({habit_id:id,user_id:user.id,completed_on:today()}));
  await loadData();toast(existing?"Checklist dibatalkan.":"Bagus! Kebiasaan ditandai selesai.");
 }catch(err){toast("Gagal memperbarui checklist: "+err.message)}
}
async function archiveHabit(id){
 const h=habits.find(x=>x.id===id);if(!h)return;
 if(!confirm('Arsipkan kebiasaan "'+h.name+'"?'))return;
 try{await q(sb.from("habits").update({active:false}).eq("id",id));await loadData();toast("Kebiasaan diarsipkan.")}catch(err){toast("Gagal mengarsipkan: "+err.message)}
}
async function init(){
 try{
  const{data,error}=await sb.auth.getSession();if(error)throw error;
  user=data?.session?.user;if(!user){location.href="index.html";return}
  await loadData();
  channel=sb.channel("habit-tracker-"+user.id)
   .on("postgres_changes",{event:"*",schema:"public",table:"habits",filter:"user_id=eq."+user.id},()=>loadData().catch(e=>toast(e.message)))
   .on("postgres_changes",{event:"*",schema:"public",table:"habit_logs",filter:"user_id=eq."+user.id},()=>loadData().catch(e=>toast(e.message)))
   .subscribe();
 }catch(err){toast("Gagal memuat data: "+err.message)}
}
$("add-toggle").addEventListener("click",()=>{if($("habit-form").classList.contains("hidden"))openForm();else resetForm()});
$("habit-frequency").addEventListener("change",e=>$("days-picker").classList.toggle("hidden",e.target.value!=="custom"));
$("habit-form").addEventListener("submit",saveHabit);
$("cancel-edit").addEventListener("click",resetForm);
window.addEventListener("beforeunload",()=>{if(channel)sb.removeChannel(channel)});
init();
