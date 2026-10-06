let installPrompt=null;
const installButtons=()=>document.querySelectorAll(".install-app");
const standalone=()=>window.matchMedia("(display-mode: standalone)").matches||window.navigator.standalone===true;

function setInstallButtons(show){installButtons().forEach(btn=>btn.classList.toggle("hidden",!show))}

window.addEventListener("beforeinstallprompt",e=>{
  e.preventDefault();
  installPrompt=e;
  if(!standalone())setInstallButtons(true);
});

window.addEventListener("appinstalled",()=>{
  installPrompt=null;
  setInstallButtons(false);
});

async function installApp(){
  if(standalone())return;
  if(installPrompt){
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt=null;
    setInstallButtons(false);
    return;
  }
  const ios=/iphone|ipad|ipod/i.test(navigator.userAgent);
  alert(ios?"Di Safari tekan Bagikan, lalu pilih Tambahkan ke Layar Utama.":"Buka menu browser lalu pilih Install app atau Tambahkan ke layar utama.");
}

if("serviceWorker" in navigator){
  window.addEventListener("load",()=>navigator.serviceWorker.register("/sw.js").catch(()=>{}));
}
if(standalone())setInstallButtons(false);

function showInternetRequiredOverlay(){
  if(document.getElementById("internet-required-overlay"))return;
  const overlay=document.createElement("div");
  overlay.id="internet-required-overlay";
  overlay.setAttribute("role","alert");
  overlay.innerHTML=`
    <div style="width:min(390px,100%);padding:20px;border:4px solid #000;border-radius:12px;background:#fff;box-shadow:6px 6px 0 #000">
      <span style="display:inline-block;padding:4px 8px;border:2px solid #000;border-radius:999px;background:#fde047;font:700 10px 'Space Grotesk',sans-serif">KONEKSI INTERNET</span>
      <h1 style="margin:14px 0 8px;font:700 24px/1.05 'Space Grotesk',sans-serif;color:#000">HARAP HUBUNGKAN<br>KE INTERNET</h1>
      <p style="margin:0 0 16px;font:600 12px/1.45 'Space Grotesk',sans-serif;color:#555">Student Planner membutuhkan koneksi internet untuk memuat dan menyinkronkan data.</p>
      <button type="button" onclick="location.reload()" style="width:100%;padding:11px;border:3px solid #000;border-radius:7px;background:#4ade80;color:#000;box-shadow:3px 3px 0 #000;font:700 12px 'Space Grotesk',sans-serif">REFRESH</button>
    </div>`;
  Object.assign(overlay.style,{
    position:"fixed",inset:"0",zIndex:"99999",display:"grid",placeItems:"center",
    padding:"22px",background:"#f4f0e6",boxSizing:"border-box"
  });
  document.body.appendChild(overlay);
}
function hideInternetRequiredOverlay(){
  document.getElementById("internet-required-overlay")?.remove();
}
if(!navigator.onLine){
  window.addEventListener("DOMContentLoaded",showInternetRequiredOverlay,{once:true});
}else{
  hideInternetRequiredOverlay();
}
window.addEventListener("offline",showInternetRequiredOverlay);
