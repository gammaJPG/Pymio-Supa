export const notificationDayKey=(date=new Date(),timeZone='America/Santiago')=>{
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const values=Object.fromEntries(parts.map(part=>[part.type,part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

export const dailyNotificationId=(id,date=new Date(),timeZone='America/Santiago')=>`${id}:${notificationDayKey(date,timeZone)}`;

// This value is only an ordering anchor. UTC avoids hard-coding Chile's changing DST offset.
export const notificationDaySortTime=(date=new Date(),timeZone='America/Santiago')=>`${notificationDayKey(date,timeZone)}T00:00:00.000Z`;

export const notificationTimestamp=notification=>Date.parse(notification?.sortAt||notification?.createdAt||notification?.created_at||'')
  ||Number(String(notification?.id||'').match(/\d{13}/)?.[0])||0;

export const orderNotifications=(...sources)=>{
  const byId=new Map();
  for(const notification of sources.flat()){
    if(!notification?.id)continue;
    const id=String(notification.id),current=byId.get(id);
    if(!current||notificationTimestamp(notification)>notificationTimestamp(current))byId.set(id,notification);
  }
  return [...byId.values()].sort((a,b)=>notificationTimestamp(b)-notificationTimestamp(a)||String(b.id).localeCompare(String(a.id)));
};
