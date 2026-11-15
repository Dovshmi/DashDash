// Israeli mobile, landline and VoIP numbering formats. Pure client/server helper.
// No network request, storage, or identity inference takes place in this module.
const LOCAL_SEPARATORS = /[\s().\-–—]/g;
export function parseIsraeliPhone(input) {
  if (typeof input !== 'string' || input.length > 80) return null;
  const raw = input.trim();
  if (!raw) return null;
  let digits = raw.replace(LOCAL_SEPARATORS, '');
  // Allow local and E.164 formats, including the international dial-out prefix.
  if (digits.startsWith('+972')) digits = '0' + digits.slice(4).replace(/^0/, '');
  else if (digits.startsWith('00972')) digits = '0' + digits.slice(5).replace(/^0/, '');
  else if (digits.startsWith('972')) digits = '0' + digits.slice(3).replace(/^0/, '');
  if (!/^\d+$/.test(digits)) return null;

  let type;
  if (/^05\d{8}$/.test(digits)) type = 'mobile';
  else if (/^0[23489]\d{7}$/.test(digits)) type = 'landline';
  else if (/^07\d{8}$/.test(digits)) type = 'voip';
  else return null;

  const label = {mobile: 'טלפון נייד', landline: 'טלפון קווי', voip: 'טלפוניה / VoIP'}[type];
  return { national: digits, e164: '+972' + digits.slice(1), type, label };
}

export function externalPhoneLinks(phone) {
  const parsed = typeof phone === 'string' ? parseIsraeliPhone(phone) : phone;
  if (!parsed) return null;
  const number = parsed.national;
  const search = '"' + number + '" OR "' + parsed.e164 + '"';
  return {
    index: 'https://theindex.co.il/phone/' + number + '/',
    truecaller: 'https://www.truecaller.com/reverse-phone-number-lookup',
    me: 'https://me.app/phone-search/',
    nocall: 'https://nocall.io/il',
    google: 'https://www.google.com/search?q=' + encodeURIComponent(search)
  };
}
