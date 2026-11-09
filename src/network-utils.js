export const PORT_DESCRIPTIONS=Object.freeze({
  21:'FTP',22:'SSH',23:'Telnet',25:'SMTP',53:'DNS',80:'HTTP',110:'POP3',143:'IMAP',443:'HTTPS',445:'SMB',3389:'RDP',
  5900:'VNC',8080:'HTTP Alternative',8443:'HTTPS Alternative',8291:'MikroTik WinBox',8728:'RouterOS API',
});
export function portServiceLabel(port,apiService){ return PORT_DESCRIPTIONS[Number(port)]||apiService||'TCP'; }
export function readNetworkTargets(value){
  if(!Array.isArray(value))return [];
  return value.filter((item)=>item&&typeof item.value==='string'&&item.value.length<=160)
    .map((item)=>({value:item.value,favorite:item.favorite===true})).slice(0,12);
}
export function rememberNetworkTarget(items,value,favorite=false){
  const target=String(value||'').trim();
  if(!target||target.length>160)return items;
  const existing=items.find((item)=>item.value===target);
  return [{value:target,favorite:favorite||existing?.favorite===true},...items.filter((item)=>item.value!==target)].slice(0,12);
}
export function toggleNetworkFavorite(items,value){
  return items.map((item)=>item.value===value?{...item,favorite:!item.favorite}:item);
}
export function sortNetworkTargets(items){return [...items].sort((a,b)=>Number(b.favorite)-Number(a.favorite));}
