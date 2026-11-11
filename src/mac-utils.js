// Accept MACs inside pasted logs, tables and mixed text without treating unrelated text as addresses.
const MAC_PATTERN = /^(?:[0-9a-f]{12}|[0-9a-f]{2}(?::[0-9a-f]{2}){5}|[0-9a-f]{2}(?:-[0-9a-f]{2}){5}|[0-9a-f]{4}(?:\.[0-9a-f]{4}){2})$/i;
// Token boundaries prevent accepting a valid-looking prefix of a malformed address.
// A trailing sentence period is permitted.
const MAC_IN_TEXT = /(?<![a-z0-9_:.-])(?:[0-9a-f]{2}(?::[0-9a-f]{2}){5}|[0-9a-f]{2}(?:-[0-9a-f]{2}){5}|[0-9a-f]{4}(?:\.[0-9a-f]{4}){2}|[0-9a-f]{12})(?![a-z0-9_:-]|\.[a-z0-9])/gi;

export function normalizeMac(value) {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  return MAC_PATTERN.test(raw) ? raw.replace(/[:.-]/g, '').toUpperCase() : null;
}

export function extractMacAddresses(text) {
  const found = new Set();
  for (const match of String(text ?? '').matchAll(MAC_IN_TEXT)) {
    const mac = normalizeMac(match[0]);
    if (mac) found.add(mac.match(/.{2}/g).join(':'));
    // The API accepts 100 addresses. Stop once an excessive batch is detected.
    if (found.size > 100) break;
  }
  return [...found];
}
