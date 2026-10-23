const DISMISS_KEY='pymio:install-dismissed-until:v2';
const DISMISS_TIME=24*60*60*1000;
const isStandalone=()=>matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;
const isMobileSurface=()=>matchMedia('(pointer: coarse)').matches&&matchMedia('(max-width: 950px)').matches;
let deferredPrompt=null,card=null;

export const canInstallPymio=()=>Boolean(deferredPrompt)&&!isStandalone();
const announceState=()=>window.dispatchEvent(new CustomEvent('pymio:install-state',{detail:{available:canInstallPymio()}}));
const close=(remember=true)=>{card?.remove();card=null;if(remember)localStorage.setItem(DISMISS_KEY,String(Date.now()+DISMISS_TIME));};

export async function requestPymioInstall(){
  if(!canInstallPymio())return false;
  const prompt=deferredPrompt;deferredPrompt=null;close(false);announceState();
  prompt.prompt();
  const choice=await prompt.userChoice.catch(()=>({outcome:'dismissed'}));
  if(choice.outcome!=='accepted')localStorage.setItem(DISMISS_KEY,String(Date.now()+DISMISS_TIME));
  announceState();
  return choice.outcome==='accepted';
}

export function setupInstallPrompt(){
  if(isStandalone()||!isMobileSurface())return;
  const dismissed=()=>Number(localStorage.getItem(DISMISS_KEY)||0)>Date.now();
  const show=()=>{
    if(card||dismissed()||!canInstallPymio())return;
    card=document.createElement('aside');card.className='pwa-install-prompt';card.setAttribute('role','region');card.setAttribute('aria-label','Instalar Pymio');
    card.innerHTML='<img src="assets/pymio-icon-transparent.png" alt=""><div><strong>Instala Pymio en tu celular</strong><p>Accede más rápido y úsala incluso con conexión inestable.</p></div><button type="button" class="pwa-install-action">Instalar</button><button type="button" class="pwa-install-close" aria-label="Cerrar sugerencia">×</button>';
    card.querySelector('.pwa-install-close').onclick=()=>close(true);
    card.querySelector('.pwa-install-action').onclick=requestPymioInstall;
    document.body.append(card);
  };
  window.addEventListener('beforeinstallprompt',event=>{
    event.preventDefault();deferredPrompt=event;
    if(card){card.remove();card=null;}
    announceState();
    show();
  });
  window.addEventListener('appinstalled',()=>{deferredPrompt=null;close(false);announceState();});
}
