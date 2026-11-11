// Offline, local-only Pocket commands library. No commands are executed or uploaded.
export const COMMANDS_KEY = 'work-tools:commands-v2';
export const LEGACY_COMMANDS_KEY = 'work-tools:commands-v1';
export const RECENT_COMMANDS_KEY = 'work-tools:commands-recent-v1';
export const MAX_COMMANDS = 3000;
export const MAX_RESULTS = 180;
const FAMILIES = ['Cisco', 'Fortinet', 'Check Point', 'Other'];
const EMPTY_DOCUMENT = () => ({ schema: 1, source: 'DashDash local commands', machines: [], commands: [] });

function normalized(value) {
  return String(value ?? '').normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}
function uniqueStrings(values, max = 90) {
  const seen = new Set();
  return (Array.isArray(values) ? values : []).filter((value) => {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > max) return false;
    const key = normalized(value);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).map((name) => name.trim());
}
function validRow(row, { legacy = false } = {}) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const id = typeof row.id === 'string' ? row.id.trim() : '';
  const originalMachine = typeof row.machine === 'string' ? row.machine.trim() : '';
  const machine = originalMachine || (legacy ? (FAMILIES.includes(row.category) ? row.category : 'Other') : '');
  const command = typeof row.command === 'string' ? row.command : '';
  const description = typeof row.description === 'string' ? row.description : '';
  const initialCategory = typeof row.category === 'string' ? row.category : 'Other';
  const category = legacy && row.topic && FAMILIES.includes(initialCategory)
    ? String(row.topic) : initialCategory;
  if (!id || id.length > 160 || !machine || machine.length > 90 ||
      command.length > 10000 || description.length > 300 || category.length > 100) return null;
  const result = {
    id, machine, category: category.trim() || 'Other',
    description: description.trim(), command, favorite: row.favorite === true,
  };
  if (Number.isSafeInteger(row.source_row) && row.source_row >= 0) result.source_row = row.source_row;
  if (row.template && typeof row.template === 'object' && !Array.isArray(row.template)) {
    result.template = row.template;
  }
  // Previously imported DashDash commands stored the original Pocket topic separately.
  return result;
}
export function validateCommandDocument(document, { legacy = false, allowDrafts = false } = {}) {
  const rows = Array.isArray(document) ? document : document?.commands;
  if (!Array.isArray(rows) || rows.length > MAX_COMMANDS) {
    throw new Error('יש לבחור קובץ JSON עם עד ' + MAX_COMMANDS + ' פקודות.');
  }
  const seen = new Set();
  const commands = [];
  let rejected = 0;
  for (const item of rows) {
    const row = validRow(item, {legacy});
    if (!row || (!allowDrafts && !row.command.trim())) { rejected++; continue; }
    if (seen.has(row.id)) { rejected++; continue; }
    seen.add(row.id);
    commands.push(row);
  }
  if (rows.length && !commands.length) throw new Error('קובץ הפקודות אינו מכיל רשומות תקינות.');
  const machines = uniqueStrings(document?.machines);
  for (const row of commands) {
    if (!machines.some((name) => normalized(name) === normalized(row.machine))) machines.push(row.machine);
  }
  return {
    document: {
      schema: 1,
      source: typeof document?.source === 'string' ? document.source.slice(0, 250) : 'Pocket / DashDash',
      machines, commands,
    }, rejected,
  };
}
export function readCommandLibrary(storage) {
  try {
    const saved = storage.getItem(COMMANDS_KEY);
    if (saved !== null) return validateCommandDocument(JSON.parse(saved), { allowDrafts:true }).document;
    const old = storage.getItem(LEGACY_COMMANDS_KEY);
    if (old !== null) {
      const parsed = JSON.parse(old);
      return validateCommandDocument(parsed, { legacy:true, allowDrafts:true }).document;
    }
  } catch { /* No storage access or invalid legacy data */ }
  return EMPTY_DOCUMENT();
}
export function saveCommandLibrary(storage, document) {
  // One atomic browser-storage write prevents half-imported libraries.
  const payload = JSON.stringify(document);
  storage.setItem(COMMANDS_KEY, payload);
  try { storage.removeItem(LEGACY_COMMANDS_KEY); } catch { /* Old data is ignored when v2 exists */ }
  return document;
}
export function mergeCommandDocument(existing, incoming) {
  const { document: parsed, rejected } = validateCommandDocument(incoming);
  const result = {
    ...existing,
    source: existing.commands.length ? existing.source : parsed.source,
    machines: uniqueStrings([...(existing.machines || []), ...parsed.machines]),
    commands: [...(existing.commands || [])],
  };
  const ids = new Set(result.commands.map((row) => row.id));
  const syntax = new Set(result.commands.map((row) => normalized(row.machine) + '\u0000' + normalized(row.command)));
  let added = 0;
  let duplicates = 0;
  for (const row of parsed.commands) {
    const key = normalized(row.machine) + '\u0000' + normalized(row.command);
    if (ids.has(row.id) || syntax.has(key)) { duplicates++; continue; }
    if (result.commands.length >= MAX_COMMANDS) throw new Error('הספרייה מלאה: ניתן לשמור עד ' + MAX_COMMANDS + ' פקודות.');
    result.commands.push(row);
    ids.add(row.id); syntax.add(key); added++;
  }
  result.machines = uniqueStrings([...result.machines, ...result.commands.map((row) => row.machine)]);
  return { document: result, added, duplicates, rejected };
}
export function listCommandMachines(document) {
  return uniqueStrings([...(document.machines || []), ...document.commands.map((row) => row.machine)])
    .sort((a, b) => normalized(a).localeCompare(normalized(b), 'en'));
}
export function listCommandCategories(document, machine = 'All machines') {
  return uniqueStrings(document.commands
    .filter((row) => machine === 'All machines' || row.machine === machine)
    .map((row) => row.category), 100).sort((a, b) => normalized(a).localeCompare(normalized(b), 'en'));
}
export function searchCommandLibrary(document, {query = '', machine = 'All machines', category = 'All categories', mode = 'all', recent = []} = {}) {
  const tokens = normalized(query).split(' ').filter(Boolean);
  const recentPos = new Map(recent.map((id, index) => [id, index]));
  const matches = [];
  for (const row of document.commands) {
    if (machine !== 'All machines' && row.machine !== machine) continue;
    if (category !== 'All categories' && row.category !== category) continue;
    if (mode === 'favorites' && !row.favorite) continue;
    if (mode === 'recent' && !recentPos.has(row.id)) continue;
    const command = normalized(row.command);
    const purpose = normalized(row.description);
    const context = normalized(row.machine + ' ' + row.category);
    if (!tokens.every((t) => command.includes(t) || purpose.includes(t) || context.includes(t))) continue;
    let score = tokens.reduce((sum,t) => sum + (command.startsWith(t) ? 6
      : command.includes(t) ? 4 : purpose.startsWith(t) ? 3 : purpose.includes(t) ? 2 : 1), 0);
    if (normalized(query) === command) score += 40;
    if (normalized(query) === purpose) score += 30;
    if (row.favorite) score++;
    matches.push({row,score});
  }
  matches.sort((a, b) => mode === 'recent'
    ? (recentPos.get(a.row.id) - recentPos.get(b.row.id))
    : (b.score - a.score || Number(a.row.description === 'Command reference') - Number(b.row.description === 'Command reference')
      || normalized(a.row.machine).localeCompare(normalized(b.row.machine))
      || normalized(a.row.description).localeCompare(normalized(b.row.description))));
  return {rows: matches.slice(0, MAX_RESULTS).map(({row}) => row), total: matches.length};
}
export function readCommandRecent(storage) {
  try {
    const value = JSON.parse(storage.getItem(RECENT_COMMANDS_KEY) || '[]');
    return Array.isArray(value) ? uniqueStrings(value, 160).slice(0, 15) : [];
  } catch { return []; }
}
export function updateCommandRecent(recent, id) {
  return [id, ...recent.filter((value) => value !== id)].slice(0, 15);
}
export function exportCommandDocument(document) {
  return {
    schema: 1,
    source: document.source || 'DashDash commands export',
    machines: listCommandMachines(document),
    commands: document.commands.map((row) => ({ ...row })),
  };
}
