import net from 'node:net';
const NAMES = {21:'FTP',22:'SSH',23:'Telnet',25:'SMTP',53:'DNS',80:'HTTP',110:'POP3',143:'IMAP',443:'HTTPS',445:'SMB',3389:'RDP',5900:'VNC',8080:'HTTP-alt',8443:'HTTPS-alt',8291:'WinBox',8728:'RouterOS API'};
function publicIPv4(ip) {
  if (net.isIP(ip) !== 4) return false;
  const [a,b,c] = ip.split('.').map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 || a === 100 && b >= 64 && b <= 127 || a === 192 && b === 0 || a === 192 && b === 0 && c === 2 || a === 198 && (b === 18 || b === 19 || b === 51 && c === 100) || a === 203 && b === 0 && c === 113 || a === 198 && b === 51 && c === 100 || a === 255 || a === 192 && b === 88 && c === 99);
}
function parsePorts(input) {
  if (typeof input !== 'string' || input.length > 200) throw Error('Invalid port list');
  const ports = new Set();
  for (const token of input.split(/[,;\s]+/).filter(Boolean)) {
    const match = /^(\d+)(?:-(\d+))?$/.exec(token);
    if (!match) throw Error('Invalid port: '+token);
    const start = Number(match[1]), end = match[2] ? Number(match[2]) : start;
    if (start < 1 || end > 65535 || end < start || end-start > 15) throw Error('Invalid port range');
    for (let i=start;i<=end;i++) ports.add(i);
    if (ports.size > 16) throw Error('Limit: 16 TCP ports per check');
  }
  if (!ports.size) throw Error('Enter at least one TCP port');
  return [...ports].sort((a,b)=>a-b);
}
function check(ip,port) {
  return new Promise(resolve => {
    const start = Date.now(), socket = new net.Socket();
    let finished = false;
    const done = status => { if (finished) return; finished = true; socket.destroy(); resolve({port,service:NAMES[port]||'—',status,ms:Date.now()-start}); };
    socket.setTimeout(1200);
    socket.on('connect',()=>done('OPEN'));
    socket.on('timeout',()=>done('TIMEOUT'));
    socket.on('error',e=>done(e.code === 'ECONNREFUSED' ? 'CLOSED' : 'TIMEOUT'));
    socket.connect(port,ip);
  });
}
export default async function handler(req,res) {
  if (req.method !== 'POST') {res.setHeader('Allow','POST'); return res.status(405).json({error:'Method not allowed'});}
  const ip = typeof req.body?.ip === 'string' ? req.body.ip.trim() : '';
  if (!publicIPv4(ip)) return res.status(400).json({error:'Only public IPv4 addresses are supported; local/private/reserved IPs are blocked.'});
  let ports; try {ports = parsePorts(req.body?.ports);} catch(e) {return res.status(400).json({error:e.message});}
  const results=[];
  for(let i=0;i<ports.length;i+=4) results.push(...await Promise.all(ports.slice(i,i+4).map(p=>check(ip,p))));
  res.setHeader('Cache-Control','no-store');
  return res.json({ip,results});
}
