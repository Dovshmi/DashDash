// Pocket-compatible, opt-in smart CLI templates. They are copy-only.
export const TEMPLATE_FIELD_TYPES = ['text','ipv4','ipv6','cidr','ipv6_cidr','port','vlan','integer','interface','vrf','mac','choice'];
const TOKEN = /\{\{([A-Za-z][A-Za-z0-9_]{0,31})\}\}/g;
const FIELD_NAME = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;
const HINTS = /(?<!\{)\{([A-Za-z][\w -]{0,35})\}(?!\})|<([^<>\n]{1,44})>|\[([^\[\]\n]{1,48})\]|[xX]\.[xX]\.[xX]\.[xX](?:\s*\((start|end|source|destination|lan|wan)\))?|\*[A-Za-z][A-Za-z0-9_-]{1,23}\*|\bx\/x(?:\/x)?\b/g;
const MAX_FIELDS = 12;
const MAX_FORMAT = 6000;

export function templateFieldNames(format) {
  return [...new Set([...String(format || '').matchAll(TOKEN)].map((match) => match[1]))];
}
export function guessFieldType(name) {
  const key = String(name || '').toLowerCase();
  if (key.includes('ipv6') && (key.includes('cidr') || key.includes('prefix') || key.includes('subnet'))) return 'ipv6_cidr';
  if (key.includes('cidr') || key.includes('prefix') || key.includes('subnet')) return 'cidr';
  if (key.includes('ipv6')) return 'ipv6';
  if (key.includes('mac')) return 'mac';
  if (key.includes('vlan') || key.includes('svlan') || key.includes('cvlan')) return 'vlan';
  if (key.includes('vrf') || key.includes('routing instance')) return 'vrf';
  if (['interface','iface','ifname','int_name','uplink','ממשק'].some((t) => key.includes(t))) return 'interface';
  if (['port_number','portnumber','tcp_port','udp_port'].some((t) => key.includes(t))) return 'port';
  if (['ipv4','_ip','ip_','ip','gateway','neighbor','wan'].some((t) => key.includes(t))) return 'ipv4';
  if (['count','repeat','number','num','size'].some((t) => key.includes(t))) return 'integer';
  return 'text';
}
export function defaultTemplateFields(format, oldFields = []) {
  const previous = new Map((Array.isArray(oldFields) ? oldFields : [])
    .filter((row) => row && typeof row.name === 'string').map((row) => [row.name,row]));
  return templateFieldNames(format).map((name) => {
    const prior = previous.get(name) || {};
    const field = {
      name, label: typeof prior.label === 'string' && prior.label.trim() ? prior.label : name.replace(/_/g,' '),
      type: TEMPLATE_FIELD_TYPES.includes(prior.type) ? prior.type : guessFieldType(name),
    };
    if (field.type === 'choice' && Array.isArray(prior.options)) field.options = prior.options;
    return field;
  });
}
function uniqueHintName(text, used, allowReuse) {
  let base = String(text || '').toUpperCase().replace(/[^A-Z0-9_]+/g,'_').replace(/^_+|_+$/g,'').slice(0,25);
  if (!base || !/^[A-Z]/.test(base)) base = 'VALUE';
  if (allowReuse && used.has(base)) return base;
  let name = base;
  let n = 1;
  while (used.has(name)) { n++; name = base.slice(0,25) + '_' + n; }
  used.add(name);
  return name;
}
export function suggestSmartTemplate(command) {
  if (typeof command !== 'string' || !command.trim()) return null;
  const explicit = templateFieldNames(command);
  if (explicit.length) return {
    version:1, source_command:command, format:command,
    fields: defaultTemplateFields(command),
    warnings:['Review all fields and syntax before saving.'],
  };
  let formatted = '';
  let cursor = 0;
  const used = new Set();
  const fields = [];
  for (const match of command.matchAll(HINTS)) {
    const raw = match[0];
    let label;
    let type;
    let reuse = false;
    if (match[1]) { label = match[1].trim(); reuse = true; }
    else if (match[2]) { label = match[2].trim(); if (!/[a-z]/i.test(label)) continue; }
    else if (match[3]) {
      label = match[3].trim();
      if (!/[a-z]/i.test(label) || label.includes('|') || (label.match(/\//g)||[]).length > 1) continue;
    }
    else if (/^[xX]\.[xX]\.[xX]\.[xX]/.test(raw)) {
      label = match[4] ? (match[4].toUpperCase() + '_IP') : 'IP';
      type = 'ipv4';
    } else if (raw.startsWith('*')) label = raw.slice(1,-1);
    else if (/^x\/x/.test(raw)) { label = 'INTERFACE'; type = 'interface'; }
    else continue;
    if (match.index < cursor) continue;
    const name = uniqueHintName(label, used, reuse);
    formatted += command.slice(cursor,match.index) + '{{' + name + '}}';
    if (!fields.some((field) => field.name === name)) {
      fields.push({name,label:label.replace(/_/g,' '),type:type || guessFieldType(label)});
    }
    cursor = match.index + raw.length;
    if (fields.length > MAX_FIELDS) return null;
  }
  formatted += command.slice(cursor);
  if (!fields.length || formatted === command) return null;
  return {
    version:1,source_command:command,format:formatted,fields,
    warnings:['Review all suggested fields and syntax before saving.'],
  };
}
export function validateSmartTemplate(template, sourceCommand) {
  if (!template || typeof template !== 'object' || typeof sourceCommand !== 'string') {
    throw new Error('מבנה טמפלייט לא תקין.');
  }
  const format = template.format;
  if (typeof format !== 'string' || !format.trim() || format.length > MAX_FORMAT) {
    throw new Error('פורמט הטמפלייט חייב להכיל עד 6,000 תווים.');
  }
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(format)) throw new Error('תו בקרה אינו נתמך בטמפלייט.');
  const names = templateFieldNames(format);
  if (!names.length || names.length > MAX_FIELDS) throw new Error('נדרשים 1–12 שדות {{NAME}}.');
  if (format.replace(TOKEN,'').includes('{{') || format.replace(TOKEN,'').includes('}}')) {
    throw new Error('יש להשתמש רק במשתנים במבנה {{NAME}}.');
  }
  if (!Array.isArray(template.fields) || template.fields.length !== names.length) {
    throw new Error('יש להגדיר כל שדה שמופיע בפורמט.');
  }
  const byName = new Map();
  for (const field of template.fields) {
    if (!field || !FIELD_NAME.test(field.name || '') || !names.includes(field.name) || byName.has(field.name)) {
      throw new Error('שם שדה לא תקין או כפול.');
    }
    const label = typeof field.label === 'string' ? field.label.trim() : '';
    if (!label || label.length > 80) throw new Error('לשדה חייבת להיות כותרת באורך עד 80 תווים.');
    if (!TEMPLATE_FIELD_TYPES.includes(field.type)) throw new Error('סוג שדה לא נתמך: ' + field.name);
    const cleaned = {name:field.name,label,type:field.type};
    if (field.type === 'choice') {
      const options = field.options;
      if (!Array.isArray(options) || options.length < 2 || options.length > 30 ||
          options.some((option) => typeof option !== 'string' || !option.trim() ||
            option.length > 100 || /[\r\n]/.test(option)) ||
          new Set(options).size !== options.length) {
        throw new Error('שדה בחירה דורש 2–30 אפשרויות שונות.');
      }
      cleaned.options = [...options];
    }
    byName.set(field.name, cleaned);
  }
  return {version:1,source_command:sourceCommand,format,fields:names.map((name) => byName.get(name))};
}
export function smartTemplateState(row) {
  if (!row?.template) return 'plain';
  if (row.template.version !== 1 || row.template.source_command !== row.command) return 'needs-review';
  try { validateSmartTemplate(row.template,row.command); return 'configured'; }
  catch { return 'needs-review'; }
}
function ipv4(value) {
  const values = value.split('.');
  return values.length === 4 && values.every((piece) => /^\d{1,3}$/.test(piece) && +piece <= 255);
}
function ipv6(value) {
  // The WHATWG URL parser performs IPv6 syntax validation without network access.
  try { return new URL('http://[' + value + ']/').hostname.length > 2; }
  catch { return false; }
}
function verifyValue(field, raw) {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value || value.length > 250 || /[\x00-\x1f\x7f]/.test(value)) {
    throw new Error('יש להזין ערך תקין בשורה אחת עבור ' + field.label + '.');
  }
  const type = field.type;
  const integer = /^\d+$/.test(value) ? Number(value) : NaN;
  if (type === 'ipv4' && !ipv4(value)) throw new Error(field.label + ': כתובת IPv4 לא תקינה.');
  if (type === 'ipv6' && !ipv6(value)) throw new Error(field.label + ': כתובת IPv6 לא תקינה.');
  if (type === 'cidr' || type === 'ipv6_cidr') {
    const tokens = value.split('/');
    const max = type === 'cidr' ? 32 : 128;
    const okay = tokens.length === 2 && /^\d{1,3}$/.test(tokens[1]) && +tokens[1] <= max
      && (type === 'cidr' ? ipv4(tokens[0]) : ipv6(tokens[0]));
    if (!okay) throw new Error(field.label + ': כתובת רשת / CIDR לא תקינה.');
  }
  if (['vlan','port','integer'].includes(type)) {
    const max = type === 'vlan' ? 4094 : type === 'port' ? 65535 : 2147483647;
    const min = type === 'integer' ? 0 : 1;
    if (!Number.isSafeInteger(integer) || integer < min || integer > max) {
      throw new Error(field.label + ': המספר חייב להיות בין ' + min + ' ל־' + max + '.');
    }
  }
  if (['interface','vrf'].includes(type) && !/^[A-Za-z0-9_./:@-]+$/.test(value)) {
    throw new Error(field.label + ': תווים לא תקינים בשם הממשק או VRF.');
  }
  if (type === 'mac' && !/^(?:[0-9a-f]{2}(?::[0-9a-f]{2}){5}|[0-9a-f]{2}(?:-[0-9a-f]{2}){5})$/i.test(value)) {
    throw new Error(field.label + ': כתובת MAC לא תקינה.');
  }
  if (type === 'choice' && !field.options.includes(value)) throw new Error(field.label + ': בחר ערך מהרשימה.');
  if (type === 'text' && /;|&&|\|\||[|\x60]/.test(value)) {
    throw new Error(field.label + ': אין להזין שרשור פקודות בערך חופשי.');
  }
  return value;
}
export function renderSmartTemplate(row, values = {}) {
  if (smartTemplateState(row) !== 'configured') {
    throw new Error('יש לאשר טמפלייט מעודכן לפני מילוי והעתקה.');
  }
  const template = validateSmartTemplate(row.template,row.command);
  const resolved = Object.fromEntries(template.fields.map((field) => [field.name,verifyValue(field,values[field.name])]));
  const result = template.format.replace(TOKEN, (_,name) => resolved[name]);
  if (result.includes('{{') || result.includes('}}')) throw new Error('נשארו שדות שלא הוחלפו.');
  return result;
}
