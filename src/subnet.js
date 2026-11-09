const validOctet = (value) => /^\d{1,3}$/.test(value) && Number(value) <= 255;

function toIp(address) {
  return address.split('.').reduce((result, octet) => ((result << 8) | Number(octet)) >>> 0, 0);
}
function fromIp(value) {
  return [24, 16, 8, 0].map((bits) => ((value >>> bits) & 255)).join('.');
}

export function calculateIpv4Subnet(value) {
  if (typeof value !== 'string') throw new Error('יש להזין כתובת IPv4/CIDR.');
  const match = /^([^/]+)\/(\d{1,2})$/.exec(value.trim());
  if (!match || !match[1].split('.').every(validOctet) || match[1].split('.').length !== 4) {
    throw new Error('פורמט לא תקין. לדוגמה: 192.168.1.10/24');
  }
  const prefix = Number(match[2]);
  if (prefix > 32) throw new Error('אורך הקידומת חייב להיות בין 0 ל־32.');
  const ip = toIp(match[1]);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const network = (ip & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  const hostStart = prefix < 31 ? network + 1 : network;
  const hostEnd = prefix < 31 ? broadcast - 1 : broadcast;
  const total = 2 ** (32 - prefix);
  return {
    input: fromIp(ip) + '/' + prefix,
    network: fromIp(network),
    broadcast: fromIp(broadcast),
    mask: fromIp(mask),
    wildcard: fromIp((~mask) >>> 0),
    usableRange: fromIp(hostStart >>> 0) + ' – ' + fromIp(hostEnd >>> 0),
    total,
    usable: prefix < 31 ? Math.max(0, total - 2) : total,
  };
}
