// Local file/directory shortcuts: browser-only File System Access handles.
// Store handles in IndexedDB, never in JSON/localStorage, never upload file contents.
export const LOCAL_SHORTCUT_DB = 'dashdash-shortcut-handles';
export const LOCAL_SHORTCUT_STORE = 'handles';
export const MAX_LOCAL_SHORTCUTS = 100;
export const MAX_FOLDER_ENTRIES = 150;
export const MAX_TEXT_PREVIEW_BYTES = 512 * 1024;
export const MAX_MEDIA_PREVIEW_BYTES = 12 * 1024 * 1024;

const TEXT_EXTENSIONS = new Set([
  'txt','md','markdown','log','csv','tsv','json','jsonl','yaml','yml','xml',
  'ini','cfg','conf','config','properties','env','sql','js','jsx','ts','tsx',
  'css','html','htm','py','sh','ps1','bat','cmd','java','go','rs','c','cpp',
  'h','hpp','rb','php','toml','gradle',
]);
const IMAGE_EXTENSIONS = new Set(['png','jpg','jpeg','gif','webp','bmp','avif']);

export function supportsLocalFilePicker(browser = typeof window === 'undefined' ? null : window) {
  return !!browser && typeof browser.showOpenFilePicker === 'function';
}
export function supportsLocalFolderPicker(browser = typeof window === 'undefined' ? null : window) {
  return !!browser && typeof browser.showDirectoryPicker === 'function';
}
export function isLocalHandleRow(row) {
  return !!row && typeof row.id === 'string' && row.id.startsWith('handle:') &&
    typeof row.name === 'string' && row.name.length > 0 && row.name.length <= 160 &&
    (row.kind === 'file' || row.kind === 'directory') &&
    row.handle?.kind === row.kind && typeof row.handle.name === 'string';
}
export function filePreviewType(file) {
  const name = String(file?.name || '').toLowerCase();
  const extension = name.split('.').at(-1);
  const type = String(file?.type || '').toLowerCase();
  if (TEXT_EXTENSIONS.has(extension)) return 'text';
  if (IMAGE_EXTENSIONS.has(extension) && (!type || type.startsWith('image/'))) return 'image';
  if (extension === 'pdf' && (!type || type === 'application/pdf')) return 'pdf';
  return 'unsupported';
}
export function validatePreviewFile(file) {
  if (!file || typeof file.size !== 'number' || file.size < 0) {
    throw new Error('לא ניתן לקרוא את הקובץ.');
  }
  const kind = filePreviewType(file);
  if (kind === 'unsupported') {
    throw new Error('סוג הקובץ אינו נתמך בתצוגה מקדימה. אין אפשרות להפעיל תוכנות או קבצי EXE.');
  }
  const limit = kind === 'text' ? MAX_TEXT_PREVIEW_BYTES : MAX_MEDIA_PREVIEW_BYTES;
  if (file.size > limit) {
    throw new Error('הקובץ גדול מדי לתצוגה מקדימה (' +
      (limit / (1024 * 1024)).toFixed(kind === 'text' ? 1 : 0) + 'MB לכל היותר).');
  }
  return kind;
}
export function sortDirectoryEntries(entries) {
  return entries.slice().sort((a,b) => Number(b.kind === 'directory') - Number(a.kind === 'directory')
    || a.name.localeCompare(b.name, 'he', {numeric:true}));
}
export async function readDirectoryEntries(handle, limit = MAX_FOLDER_ENTRIES) {
  if (!handle || handle.kind !== 'directory') throw new Error('ההפניה לתיקייה אינה תקינה.');
  const results = [];
  let truncated = false;
  for await (const child of handle.values()) {
    if (child.kind !== 'directory' && child.kind !== 'file') continue;
    if (results.length >= limit) { truncated = true; break; }
    results.push({name:child.name,kind:child.kind,handle:child});
  }
  return {entries:sortDirectoryEntries(results),truncated};
}
export async function verifyReadPermission(handle) {
  if (!handle || (handle.kind !== 'file' && handle.kind !== 'directory')) return false;
  if (typeof handle.queryPermission !== 'function' || typeof handle.requestPermission !== 'function') {
    // Some browsers support a picker but not these permission methods. Access
    // is still verified by getFile()/values() and may throw NotAllowedError.
    return true;
  }
  if ((await handle.queryPermission({mode:'read'})) === 'granted') return true;
  return (await handle.requestPermission({mode:'read'})) === 'granted';
}
function requireIndexedDB(indexedDB) {
  if (!indexedDB || typeof indexedDB.open !== 'function') {
    throw new Error('אחסון IndexedDB אינו זמין בדפדפן. בדוק מצב גלישה פרטית והרשאות.');
  }
}
async function openDatabase(indexedDB) {
  requireIndexedDB(indexedDB);
  return new Promise((resolve,reject) => {
    const request = indexedDB.open(LOCAL_SHORTCUT_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(LOCAL_SHORTCUT_STORE)) {
        db.createObjectStore(LOCAL_SHORTCUT_STORE, {keyPath:'id'});
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('לא ניתן לפתוח IndexedDB.'));
    request.onblocked = () => reject(new Error('מסד הנתונים המקומי נעול על ידי חלון אחר.'));
  });
}
async function storeOperation(method, value, indexedDB) {
  const db = await openDatabase(indexedDB);
  try {
    return await new Promise((resolve,reject) => {
      let result;
      let transaction;
      try {
        transaction = db.transaction(LOCAL_SHORTCUT_STORE, method === 'getAll' ? 'readonly' : 'readwrite');
        const store = transaction.objectStore(LOCAL_SHORTCUT_STORE);
        const request = method === 'getAll' ? store.getAll()
          : method === 'put' ? store.put(value) : store.delete(value);
        request.onsuccess = () => { result = request.result; };
        transaction.oncomplete = () => resolve(result);
        transaction.onabort = () => reject(transaction.error || new Error('פעולת האחסון בוטלה.'));
        transaction.onerror = () => reject(transaction.error || new Error('שמירת הקיצור נכשלה.'));
      } catch (error) { reject(error); }
    });
  } finally { db.close(); }
}
export async function listLocalShortcuts(indexedDB = globalThis.indexedDB) {
  const result = await storeOperation('getAll',undefined,indexedDB);
  return (Array.isArray(result) ? result : []).filter(isLocalHandleRow)
    .sort((a,b) => a.name.localeCompare(b.name,'he',{numeric:true}));
}
export async function saveLocalShortcut(entry, indexedDB = globalThis.indexedDB) {
  if (!isLocalHandleRow(entry)) throw new Error('יש לבחור קובץ או תיקייה באמצעות הדפדפן.');
  await storeOperation('put',entry,indexedDB);
  return entry;
}
export async function deleteLocalShortcut(id, indexedDB = globalThis.indexedDB) {
  if (typeof id !== 'string' || !id.startsWith('handle:')) throw new Error('מזהה קיצור לא תקין.');
  await storeOperation('delete',id,indexedDB);
}
