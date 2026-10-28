let dialog;
let current;

function downloadFile(file,fileName){
  const url=URL.createObjectURL(file),link=document.createElement('a');
  link.href=url;link.download=fileName;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function shareText({text='',url=''}){return [text,url].filter(Boolean).join('\n');}
async function copyText(value){
  if(navigator.clipboard?.writeText)return navigator.clipboard.writeText(value);
  const area=document.createElement('textarea');area.value=value;area.style.position='fixed';area.style.opacity='0';document.body.appendChild(area);area.select();document.execCommand('copy');area.remove();
}

function ensureDialog(){
  if(dialog)return dialog;
  dialog=document.createElement('dialog');dialog.className='pymio-share-dialog';dialog.setAttribute('aria-labelledby','pymio-share-title');
  dialog.innerHTML=`<section><header><div><span>Compartir</span><h2 id="pymio-share-title"></h2></div><button type="button" data-share-close aria-label="Cerrar">×</button></header><p data-share-help></p><div class="pymio-share-actions" data-share-actions></div><p class="pymio-share-status" data-share-status role="status" hidden></p></section>`;
  document.body.appendChild(dialog);
  dialog.querySelector('[data-share-close]').onclick=()=>dialog.close();
  dialog.addEventListener('cancel',event=>{event.preventDefault();dialog.close();});
  dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
  dialog.querySelector('[data-share-actions]').onclick=async event=>{
    const button=event.target.closest('[data-share-action]');if(!button||!current)return;
    const action=button.dataset.shareAction,body=shareText(current),encoded=encodeURIComponent(body),subject=encodeURIComponent(current.title||'Compartir desde Pymio');
    const status=dialog.querySelector('[data-share-status]');status.hidden=true;
    if(action==='download'){downloadFile(current.file,current.fileName);status.textContent='Archivo descargado.';status.hidden=false;return;}
    if(action==='copy'){await copyText(body);status.textContent=current.url?'Enlace copiado.':'Texto copiado.';status.hidden=false;return;}
    if(current.file)downloadFile(current.file,current.fileName);
    let target='';
    if(action==='whatsapp')target=`https://wa.me/?text=${encoded}`;
    if(action==='facebook')target=current.url?`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(current.url)}`:'https://www.facebook.com/';
    if(action==='instagram')target='https://www.instagram.com/';
    if(action==='email')target=`mailto:?subject=${subject}&body=${encoded}`;
    window.open(target,'_blank','noopener,noreferrer');
    if(['facebook','instagram'].includes(action))copyText(body).catch(()=>{});
    if(current.file){status.textContent='El comprobante fue descargado para que puedas adjuntarlo.';status.hidden=false;}
  };
  return dialog;
}

export function openShareChooser({title,text='',url='',file=null,fileName='archivo.pdf'}={}){
  current={title,text,url,file,fileName};const modal=ensureDialog(),actions=modal.querySelector('[data-share-actions]');
  modal.querySelector('#pymio-share-title').textContent=title;
  modal.querySelector('[data-share-help]').textContent=file?'Elige descargarlo o compartirlo. Al elegir una aplicación, el comprobante se descargará para que puedas adjuntarlo.':'Elige dónde quieres compartir la invitación.';
  modal.querySelector('[data-share-status]').hidden=true;
  actions.innerHTML=`${file?'<button type="button" data-share-action="download"><span aria-hidden="true">↓</span>Descargar al dispositivo</button>':''}<button type="button" data-share-action="whatsapp">WhatsApp</button><button type="button" data-share-action="facebook">Facebook</button><button type="button" data-share-action="instagram">Instagram</button><button type="button" data-share-action="email">Correo</button><button type="button" data-share-action="copy">${url?'Copiar enlace':'Copiar mensaje'}</button>`;
  if(modal.open)modal.close();modal.showModal();
}
