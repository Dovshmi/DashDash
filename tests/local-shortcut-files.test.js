import {describe,expect,it,vi} from 'vitest';
import {
  LOCAL_SHORTCUT_DB, LOCAL_SHORTCUT_STORE, MAX_FOLDER_ENTRIES,
  deleteLocalShortcut, filePreviewType, isLocalHandleRow, listLocalShortcuts,
  readDirectoryEntries, saveLocalShortcut, sortDirectoryEntries,
  supportsLocalFilePicker, supportsLocalFolderPicker, validatePreviewFile,
  verifyReadPermission,
} from '../src/local-shortcut-files.js';

function handle(kind,name) { return {kind,name}; }

// Minimal asynchronous IndexedDB test double: exercises the real storage API
// contracts without using network, browser files, or an extra dependency.
function fakeIndexedDB() {
  const records = new Map();
  let exists = false;
  const db = {
    objectStoreNames:{contains:(name) => exists && name === LOCAL_SHORTCUT_STORE},
    createObjectStore(name,opts) {
      expect(name).toBe(LOCAL_SHORTCUT_STORE);
      expect(opts).toEqual({keyPath:'id'});
      exists = true;
    },
    transaction(storeName,mode) {
      expect(storeName).toBe(LOCAL_SHORTCUT_STORE);
      const tx = {
        objectStore() {
          function pending(fn) {
            const req = {};
            queueMicrotask(() => {
              try {
                req.result = fn();
                req.onsuccess?.();
                queueMicrotask(() => tx.oncomplete?.());
              } catch (error) {
                tx.error = error;
                tx.onerror?.();
              }
            });
            return req;
          }
          return {
            getAll() { expect(mode).toBe('readonly'); return pending(() => [...records.values()]); },
            put(value) {
              expect(mode).toBe('readwrite');
              return pending(() => { records.set(value.id,value); return value.id; });
            },
            delete(key) {
              expect(mode).toBe('readwrite');
              return pending(() => { records.delete(key); });
            },
          };
        },
      };
      return tx;
    },
    close:vi.fn(),
  };
  return {
    open(name,version) {
      expect(name).toBe(LOCAL_SHORTCUT_DB);
      expect(version).toBe(1);
      const req={result:db};
      queueMicrotask(() => {
        if (!exists) req.onupgradeneeded?.();
        req.onsuccess?.();
      });
      return req;
    },
  };
}

describe('browser-native local shortcuts (PWA)', () => {
  it('detects browser capability without assuming PWA installation bypasses permissions', () => {
    expect(supportsLocalFilePicker(null)).toBe(false);
    expect(supportsLocalFolderPicker({showOpenFilePicker() {}})).toBe(false);
    expect(supportsLocalFilePicker({showOpenFilePicker() {}})).toBe(true);
    expect(supportsLocalFolderPicker({showDirectoryPicker() {}})).toBe(true);
  });
  it('stores file and folder handles in IndexedDB across reads, without reading file content', async () => {
    const indexedDB=fakeIndexedDB();
    const getFile=vi.fn();
    const file={id:'handle:file-1',kind:'file',name:'Report',handle:{...handle('file','report.txt'),getFile}};
    const folder={id:'handle:folder-1',kind:'directory',name:'Projects',handle:handle('directory','Projects')};
    expect(await listLocalShortcuts(indexedDB)).toEqual([]);
    await saveLocalShortcut(file,indexedDB);
    await saveLocalShortcut(folder,indexedDB);
    const recovered=await listLocalShortcuts(indexedDB);
    expect(recovered).toHaveLength(2);
    expect(recovered.find((row)=>row.id==='handle:file-1').handle).toBe(file.handle);
    expect(getFile).not.toHaveBeenCalled();
    await deleteLocalShortcut(file.id,indexedDB);
    expect((await listLocalShortcuts(indexedDB)).map((row)=>row.id)).toEqual([folder.id]);
  });
  it('does not accept arbitrary entries pretending to be browser handles', async () => {
    const fake=fakeIndexedDB();
    expect(isLocalHandleRow({id:'handle:1',name:'abc',kind:'file',handle:handle('directory','abc')})).toBe(false);
    await expect(saveLocalShortcut({id:'handle:1',kind:'file',name:'x',handle:{kind:'file'}},fake)).rejects.toThrow();
    await expect(deleteLocalShortcut('bad-id',fake)).rejects.toThrow();
    await expect(listLocalShortcuts(null)).rejects.toThrow(/IndexedDB/);
  });
  it('requests read-only access and respects a denied permission', async () => {
    const requestPermission=vi.fn().mockResolvedValue('granted');
    const root={...handle('directory','Projects'),
      queryPermission:vi.fn().mockResolvedValue('prompt'),requestPermission};
    expect(await verifyReadPermission(root)).toBe(true);
    expect(requestPermission).toHaveBeenCalledWith({mode:'read'});
    expect(await verifyReadPermission({...root,queryPermission:async()=> 'denied',
      requestPermission:async()=> 'denied'})).toBe(false);
    expect(await verifyReadPermission({...root,queryPermission:async()=> 'granted',
      requestPermission:vi.fn()})).toBe(true);
    expect(await verifyReadPermission(handle('file','plain.txt'))).toBe(true);
  });
  it('opens only the first 150 entries per folder, with directories first', async () => {
    const children=[
      handle('file','z.txt'),handle('directory','Docs'),handle('file','a.txt'),
    ];
    const mock={...handle('directory','Root'),async *values() {
      for (const item of children) yield item;
    }};
    const result=await readDirectoryEntries(mock);
    expect(result.truncated).toBe(false);
    expect(result.entries.map((row)=>row.name)).toEqual(['Docs','a.txt','z.txt']);
    expect(sortDirectoryEntries(result.entries)).toEqual(result.entries);
    expect(MAX_FOLDER_ENTRIES).toBe(150);
    const trimmed=await readDirectoryEntries(mock,2);
    expect(trimmed.truncated).toBe(true);
    expect(trimmed.entries).toHaveLength(2);
    await expect(readDirectoryEntries(handle('file','x.txt'))).rejects.toThrow();
  });
  it('reads text/images/PDF by explicit action only and never treats executables as previewable', () => {
    expect(filePreviewType({name:'config.cfg',type:''})).toBe('text');
    expect(filePreviewType({name:'diagram.png',type:'image/png'})).toBe('image');
    expect(filePreviewType({name:'network.pdf',type:'application/pdf'})).toBe('pdf');
    expect(filePreviewType({name:'script.exe',type:''})).toBe('unsupported');
    expect(filePreviewType({name:'page.svg',type:'image/svg+xml'})).toBe('unsupported');
    expect(validatePreviewFile({name:'test.log',size:100,type:''})).toBe('text');
    expect(()=>validatePreviewFile({name:'debug.txt',size:900000,type:''})).toThrow(/גדול/);
    expect(()=>validatePreviewFile({name:'archive.jpg',size:30*1024*1024,type:'image/jpeg'})).toThrow();
    expect(()=>validatePreviewFile({name:'setup.exe',size:200,type:''})).toThrow();
  });
});
