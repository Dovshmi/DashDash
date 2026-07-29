const englishToHebrew = {
  q: '/', w: "'", e: 'ק', r: 'ר', t: 'א', y: 'ט', u: 'ו', i: 'ן', o: 'ם', p: 'פ', '[': ']', ']': '[',
  a: 'ש', s: 'ד', d: 'ג', f: 'כ', g: 'ע', h: 'י', j: 'ח', k: 'ל', l: 'ך', ';': 'ף', "'": ',',
  z: 'ז', x: 'ס', c: 'ב', v: 'ה', b: 'נ', n: 'מ', m: 'צ', ',': 'ת', '.': 'ץ', '/': '.',
};

const hebrewToEnglish = Object.fromEntries(
  Object.entries(englishToHebrew).map(([english, hebrew]) => [hebrew, english]),
);

export function keyboardTranslate(text) {
  return [...text].map((character) => {
    if (englishToHebrew[character]) return englishToHebrew[character];
    if (englishToHebrew[character.toLowerCase()]) {
      return englishToHebrew[character.toLowerCase()];
    }
    return hebrewToEnglish[character] ?? character;
  }).join('');
}

export function formatDuration(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

export function removeHistoryItem(items, id) {
  return items.filter((item) => item.id !== id);
}

export function formatSessionDuration(session) {
  const duration = new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime();
  return formatDuration(duration);
}

export function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function totalPersonalMilliseconds(sessions) {
  return sessions.reduce((total, session) => {
    const start = new Date(session.startedAt).getTime();
    const end = new Date(session.endedAt).getTime();
    return total + Math.max(0, end - start);
  }, 0);
}

export function formatPersonalTotal(sessions) {
  const totalSeconds = Math.floor(totalPersonalMilliseconds(sessions) / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export function totalPersonalMinutes(sessions) {
  return Math.round(totalPersonalMilliseconds(sessions) / 60_000);
}
