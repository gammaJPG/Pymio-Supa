const DISMISS_KEY='pymio:install-dismissed-until:v2';
const DISMISS_TIME=24*60*60*1000;
const isStandalone=()=>matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;
const isMobileSurface=()=>matchMedia('(pointer: coarse)').matches&&matchMedia('(max-width: 950px)').matches;

export function setupInstallPrompt(){
  if(isStandalone()||!isMobileSurface())return;
  let deferredPrompt=null,manual=false,card=null;
  const dismissed=()=>Number(localStorage.getItem(DISMISS_KEY)||0)>Date.now();
  const close=(remember=true)=>{card?.remove();card=null;if(remember)localStorage.setItem(DISMISS_KEY,String(Date.now()+DISMISS_TIME));};
  const show=()=>{
    if(card||dismissed()||isStandalone())return;
    card=document.createElement('aside');card.className='pwa-install-prompt';card.setAttribute('role','region');card.setAttribute('aria-label','Instalar Pymio');
    card.innerHTML=`<img src="assets/pymio-icon-transparent.png" alt=""><div><strong>Instala Pymio en tu celular</strong><p>${manual?'Abre el menú del navegador y elige “Agregar a pantalla de inicio”.':'Accede más rápido y úsala incluso con conexión inestable.'}</p></div><button type="button" class="pwa-install-action">${manual?'Entendido':'Instalar'}</button><button type="button" class="pwa-install-close" aria-label="Cerrar sugerencia">×</button>`;
    card.querySelector('.pwa-install-close').onclick=()=>close(true);
    card.querySelector('.pwa-install-action').onclick=async()=>{
      if(!deferredPrompt){close(true);return;}
      deferredPrompt.prompt();const choice=await deferredPrompt.userChoice.catch(()=>({outcome:'dismissed'}));
      if(choice.outcome==='accepted')close(false);else close(true);deferredPrompt=null;
    };
    document.body.append(card);
  };
  window.addEventListener('beforeinstallprompt',event=>{
    event.preventDefault();deferredPrompt=event;manual=false;
    if(card){card.remove();card=null;}
    show();
  });
  window.addEventListener('appinstalled',()=>close(false));
  setTimeout(()=>{if(!deferredPrompt){manual=true;show();}},2500);
}
