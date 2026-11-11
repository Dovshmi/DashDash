const validOctet = (value) => /^\d{1,3}$/.test(value) && Number(value) <= 255;
export const MAX_SUBNET_ROWS = 128;

function toIp(address) {
  return address.split('.').reduce((result, octet) => ((result << 8) | Number(octet)) >>> 0, 0);
}
function fromIp(value) {
  return [24, 16, 8, 0].map((bits) => ((value >>> bits) & 255)).join('.');
}

function prefixFromNotation(value) {
  const raw = String(value ?? '').trim().replace(/^\//, '').trim();
  if (/^\d{1,2}$/.test(raw)) {
    const prefix = Number(raw);
    if (prefix <= 32) return prefix;
    throw new Error('אורך הקידומת חייב להיות בין 0 ל־32.');
  }
  const octets = raw.split('.');
  if (octets.length === 4 && octets.every(validOctet)) {
    const mask = toIp(raw);
    const wildcard = (~mask) >>> 0;
    // In a valid subnet mask, all wildcard bits are contiguous trailing ones.
    if ((wildcard & (wildcard + 1)) !== 0) {
      throw new Error('מסכת רשת אינה רציפה. לדוגמה: 255.255.255.0');
    }
    return 32 - Math.log2(wildcard + 1);
  }
  throw new Error('יש להזין CIDR בין 0 ל־32 או מסכת רשת תקינה (למשל 255.255.255.0).');
}

export function calculateIpv4Subnet(value) {
  if (typeof value !== 'string') throw new Error('יש להזין כתובת IPv4 וקידומת או מסכת רשת.');
  const trimmed = value.trim();
  const parts = trimmed.includes('/')
    ? trimmed.split('/').map((part) => part.trim())
    : trimmed.split(/\s+/);
  if (parts.length !== 2 || parts[0].split('.').length !== 4 ||
      !parts[0].split('.').every(validOctet)) {
    throw new Error('פורמט לא תקין. לדוגמה: 192.168.1.10/24 או 192.168.1.10/255.255.255.0');
  }
  const prefix = prefixFromNotation(parts[1]);
  const ip = toIp(parts[0]);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const network = (ip & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  const hostStart = prefix < 31 ? network + 1 : network;
  const hostEnd = prefix < 31 ? broadcast - 1 : broadcast;
  const total = 2 ** (32 - prefix);
  return {
    input: fromIp(ip) + '/' + prefix,
    cidr: fromIp(network) + '/' + prefix,
    prefix,
    network: fromIp(network),
    broadcast: fromIp(broadcast),
    mask: fromIp(mask),
    wildcard: fromIp((~mask) >>> 0),
    first: fromIp(hostStart >>> 0),
    last: fromIp(hostEnd >>> 0),
    usableRange: fromIp(hostStart >>> 0) + ' – ' + fromIp(hostEnd >>> 0),
    total,
    usable: prefix < 31 ? Math.max(0, total - 2) : total,
  };
}

export function splitIpv4Subnet(networkCidr, childNotation, limit = MAX_SUBNET_ROWS) {
  const parent = calculateIpv4Subnet(networkCidr);
  const childPrefix = prefixFromNotation(childNotation);
  if (childPrefix < parent.prefix) {
    throw new Error('הקידומת החדשה חייבת להיות בין /' + parent.prefix + ' ל־/32.');
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_SUBNET_ROWS) {
    throw new Error('ניתן להציג בין 1 ל־' + MAX_SUBNET_ROWS + ' רשתות משנה.');
  }
  const count = 2 ** (childPrefix - parent.prefix);
  const step = 2 ** (32 - childPrefix);
  const base = toIp(parent.network);
  const rows = [];
  for (let i = 0; i < Math.min(count, limit); i++) {
    const subnet = calculateIpv4Subnet(fromIp(base + i * step) + '/' + childPrefix);
    rows.push({
      cidr: subnet.cidr,
      usable: subnet.usable,
      range: subnet.first === subnet.last ? subnet.first : subnet.first + ' – ' + subnet.last,
    });
  }
  return { count, shown: rows.length, rows, truncated: count > limit, prefix: childPrefix };
}
