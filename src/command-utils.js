export const COMMAND_CATEGORIES = ['Cisco', 'Fortinet', 'Check Point', 'Other'];
export function normalizeCommandCategory(value) {
  return COMMAND_CATEGORIES.includes(value) ? value : 'Other';
}
export function inferCommandFamily(machine, category) {
  if (COMMAND_CATEGORIES.includes(category)) return category;
  const value = String(machine ?? '').toLowerCase();
  if (value.includes('forti')) return 'Fortinet';
  if (value.includes('checkpoint') || value.includes('check point')) return 'Check Point';
  if (value.includes('cisco')) return 'Cisco';
  return 'Other';
}
export function commandTemplateFields(command) {
  return [...new Set([...String(command).matchAll(/\{\{([A-Z_]+)\}\}/g)].map((match) => match[1]))];
}
function validIp4(value) {
  if (typeof value !== 'string') return false;
  const parts = value.split('.');
  return parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}
export function fillCommandTemplate(command, values = {}) {
  const fields = commandTemplateFields(command);
  const unsupported = fields.filter((field) => !['IP','VLAN'].includes(field));
  if (unsupported.length) throw new Error('תבנית לא נתמכת: ' + unsupported.join(', '));
  for (const field of fields) {
    const value = String(values[field] ?? '').trim();
    if (field === 'IP' && !validIp4(value)) throw new Error('יש להזין כתובת IPv4 תקינה.');
    if (field === 'VLAN' && (!/^\d{1,4}$/.test(value) || +value < 1 || +value > 4094)) {
      throw new Error('VLAN חייב להיות בין 1 ל־4094.');
    }
  }
  return String(command).replace(/\{\{([A-Z_]+)\}\}/g, (_, field) => String(values[field]).trim());
}
