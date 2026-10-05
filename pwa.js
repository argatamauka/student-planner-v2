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