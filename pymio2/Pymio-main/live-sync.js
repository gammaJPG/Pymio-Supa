let source=null,reconnectTimer=0,fallbackTimer=0,active=false,base='';

const emit=(reason='live')=>document.dispatchEvent(new CustomEvent('pymio-live-business',{detail:{reason,at:Date.now()}}));
const clearTimers=()=>{clearTimeout(reconnectTimer);clearInterval(fallbackTimer);reconnectTimer=fallbackTimer=0;};

function startFallback(){
  if(fallbackTimer||!active)return;
  fallbackTimer=setInterval(()=>{if(!document.hidden&&navigator.onLine)emit('fallback');},15000);
}

function connect(){
  if(!active||document.hidden||!navigator.onLine||source)return;
  if(!window.EventSource){startFallback();return;}
  source=new EventSource(`${base}/api/live/stream`,{withCredentials:true});
  source.addEventListener('business',event=>{try{JSON.parse(event.data);}catch{return;}emit('stream');});
  source.addEventListener('open',()=>{clearInterval(fallbackTimer);fallbackTimer=0;});
  source.addEventListener('error',()=>{
    if(source?.readyState!==EventSource.CLOSED)return;
    source.close();source=null;startFallback();clearTimeout(reconnectTimer);reconnectTimer=setTimeout(connect,3000);
  });
}

export function startLiveSync({apiUrl='',demo=false}={}){
  stopLiveSync();if(demo)return;
  active=true;base=apiUrl;
  connect();
}

export function stopLiveSync(){
  active=false;clearTimers();if(source){source.close();source=null;}
}

document.addEventListener('visibilitychange',()=>{
  if(!active)return;
  if(document.hidden){if(source){source.close();source=null;}return;}
  emit('visible');connect();
});
window.addEventListener('online',()=>{if(active){emit('online');connect();}});
window.addEventListener('offline',()=>{if(source){source.close();source=null;}startFallback();});
