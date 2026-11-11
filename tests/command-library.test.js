import { describe, expect, it } from 'vitest';
import {
  COMMANDS_KEY, LEGACY_COMMANDS_KEY, RECENT_COMMANDS_KEY, exportCommandDocument,
  listCommandCategories, listCommandMachines, mergeCommandDocument, readCommandLibrary,
  readCommandRecent, saveCommandLibrary, searchCommandLibrary, updateCommandRecent,
  validateCommandDocument,
} from '../src/command-library.js';
import { createDashBackup, parseDashBackup, restoreDashBackup, isBackupKey } from '../src/backup.js';

function storage() {
  const map = new Map();
  return {
    get length() { return map.size; },
    key(i) { return [...map.keys()][i] ?? null; },
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k,v) { map.set(k,String(v)); },
    removeItem(k) { map.delete(k); },
  };
}
const file = {
  schema: 1, source: 'Pocket curated library',
  machines: ['7750', 'Cisco', 'Fortigate', 'Nokia 7210', 'Juniper SRX'],
  commands: [
    {id:'original-cisco',machine:'Cisco',description:'Check VLAN and status',command:'show vlan brief',
      category:'VLAN / L2',source_row:9},
    {id:'original-forti',machine:'Fortigate',description:'בדיקת ניתוב',command:'get router info routing-table all',
      category:'Routing',source_row:12},
    {id:'original-nokia',machine:'Nokia 7210',description:'Display interface',command:'show port',
      category:'Interfaces',source_row:15},
  ],
};
describe('Pocket commands.json imported as a persistent local reference library', () => {
  it('preserves source identifiers, exact machine labels, topic categories and provenance', () => {
    const {document, rejected} = validateCommandDocument(file);
    expect(rejected).toBe(0);
    expect(document.commands[0]).toMatchObject({
      id:'original-cisco',machine:'Cisco',category:'VLAN / L2',source_row:9,
    });
    expect(document.commands[1].category).toBe('Routing');
    expect(listCommandMachines(document)).toEqual(['7750','Cisco','Fortigate','Juniper SRX','Nokia 7210']);
    expect(listCommandCategories(document,'Fortigate')).toEqual(['Routing']);
  });
  it('merges the file idempotently without creating new IDs or duplicates', () => {
    const blank=readCommandLibrary(storage());
    const first=mergeCommandDocument(blank,file);
    expect(first.added).toBe(3);
    expect(first.document.commands.map((x)=>x.id)).toEqual(file.commands.map((x)=>x.id));
    const second=mergeCommandDocument(first.document,file);
    expect(second).toMatchObject({added:0,duplicates:3});
    expect(second.document.commands).toHaveLength(3);
  });
  it('keeps user edits, favorites and approved template metadata on reimport', () => {
    const first=mergeCommandDocument(readCommandLibrary(storage()),file).document;
    const edited={...first,commands:first.commands.map((row)=>row.id==='original-cisco'
      ? {...row,description:'Edited by user',favorite:true,template:{
        version:1,source_command:row.command,format:'show vlan {{VLAN}}',
        fields:[{name:'VLAN',label:'VLAN',type:'vlan'}],
      }} : row)};
    const merged=mergeCommandDocument(edited,file);
    expect(merged.added).toBe(0);
    expect(merged.document.commands[0].description).toBe('Edited by user');
    expect(merged.document.commands[0].favorite).toBe(true);
    expect(merged.document.commands[0].template.fields[0].name).toBe('VLAN');
  });
  it('searches exact devices, categories and Hebrew purposes using AND tokens', () => {
    const library=validateCommandDocument(file).document;
    expect(searchCommandLibrary(library,{query:'show vlan',machine:'Cisco'}).rows.map((r)=>r.id)).toEqual(['original-cisco']);
    expect(searchCommandLibrary(library,{query:'ניתוב fortigate',machine:'Fortigate'}).rows.map((r)=>r.id)).toEqual(['original-forti']);
    expect(searchCommandLibrary(library,{query:'show',category:'Routing'}).total).toBe(0);
    expect(searchCommandLibrary(library,{query:'show',machine:'7750'}).total).toBe(0);
    expect(searchCommandLibrary(library,{mode:'favorites'}).total).toBe(0);
    expect(searchCommandLibrary(library,{mode:'recent',recent:['original-nokia']}).rows[0].id).toBe('original-nokia');
  });
  it('stores library across refreshes and includes it in normal DashDash backups', () => {
    const browser=storage();
    const library=validateCommandDocument(file).document;
    saveCommandLibrary(browser,library);
    expect(JSON.parse(browser.getItem(COMMANDS_KEY)).commands).toHaveLength(3);
    expect(readCommandLibrary(browser)).toEqual(library);
    expect(isBackupKey(COMMANDS_KEY)).toBe(true);
    const backup=createDashBackup(browser);
    const newBrowser=storage();
    restoreDashBackup(newBrowser,parseDashBackup(backup));
    expect(readCommandLibrary(newBrowser)).toEqual(library);
    expect(exportCommandDocument(library).machines).toContain('7750');
  });
  it('migrates older DashDash groups to actual Pocket topics and retains local edits', () => {
    const browser=storage();
    browser.setItem(LEGACY_COMMANDS_KEY,JSON.stringify([{
      id:'old',machine:'Fortigate',category:'Fortinet',topic:'Routing',
      description:'Routes',command:'get router info routing-table all',favorite:true,
    }]));
    const library=readCommandLibrary(browser);
    expect(library.commands[0]).toMatchObject({category:'Routing',machine:'Fortigate',favorite:true});
    saveCommandLibrary(browser,library);
    expect(browser.getItem(LEGACY_COMMANDS_KEY)).toBeNull();
    expect(readCommandLibrary(browser).commands[0].id).toBe('old');
  });
  it('keeps recent copied IDs separate from the command library', () => {
    const browser=storage();
    browser.setItem(RECENT_COMMANDS_KEY,JSON.stringify(updateCommandRecent(['old'],'new')));
    expect(readCommandRecent(browser)).toEqual(['new','old']);
  });
  it('skips malformed command rows rather than corrupting the library', () => {
    const corrupt={commands:[...file.commands,{id:'wrong',machine:'Cisco',description:'Invalid',command:42}]};
    const result=mergeCommandDocument(readCommandLibrary(storage()),corrupt);
    expect(result).toMatchObject({added:3,rejected:1});
    expect(()=>mergeCommandDocument(result.document,{commands:[{machine:'Cisco'}]})).toThrow();
  });
});
