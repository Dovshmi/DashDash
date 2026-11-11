import { describe, expect, it } from 'vitest';
import { closeNotebookTab, duplicateNotebookTab, normalizeNotebook, restoreClosedNotebookTab, singleNotebookWidgets, sortNotebookTabs } from '../src/notebook-data.js';
import { calculateIpv4Subnet } from '../src/subnet.js';

describe('notebook migration', () => {
  it('converts existing scratchpad widgets into title tabs without losing their text', () => {
    const data = normalizeNotebook(null, { notes: 'first text', 'notes:extra': 'second text' }, '2026-11-09T00:00:00.000Z');
    expect(data.notes.map((note) => note.text)).toEqual(['first text', 'second text']);
    expect(data.notes.map((note) => note.title)).toEqual(['פתק 1', 'פתק 2']);
    expect(data.activeId).toBe(data.notes[0].id);
  });
  it('keeps saved notebook titles, phone numbers and the selected tab', () => {
    const saved = { notes: [{ id: 'a', title: 'לקוח', phone: '050-1234567', text: 'טקסט', createdAt: '2026-11-01' }], activeId: 'a' };
    expect(normalizeNotebook(saved, null)).toEqual({ ...saved, notes: [{ ...saved.notes[0], pinned: false }] });
  });
  it('starts with one blank note and collapses duplicate old note widgets', () => {
    expect(normalizeNotebook(null, null).notes).toHaveLength(1);
    expect(singleNotebookWidgets(['timer', 'notes:extra', 'notes', 'drawing'])).toEqual(['timer', 'notes', 'drawing']);
  });
});

describe('tab-specific close behavior', () => {
  const notes = [
    { id: 'first', title: 'A', text: 'one' },
    { id: 'second', title: 'B', text: 'two' },
    { id: 'third', title: 'C', text: 'three' },
  ];
  const blank = { id: 'new-empty', title: 'פתק 1', phone: '', text: '' };

  it('removes only the tab whose × was clicked, not the currently selected tab', () => {
    const result = closeNotebookTab({ notes, activeId: 'third' }, 'first', blank);
    expect(result.notes.map((note) => note.id)).toEqual(['second', 'third']);
    expect(result.activeId).toBe('third');
  });
  it('selects the nearest remaining tab when closing the active tab', () => {
    const result = closeNotebookTab({ notes, activeId: 'second' }, 'second', blank);
    expect(result.notes.map((note) => note.id)).toEqual(['first', 'third']);
    expect(result.activeId).toBe('third');
  });
  it('keeps the notebook editable when its final tab closes', () => {
    const result = closeNotebookTab({ notes: [notes[0]], activeId: 'first' }, 'first', blank);
    expect(result).toEqual({ notes: [blank], activeId: 'new-empty' });
  });
  it('ignores stale tab identifiers instead of deleting another note', () => {
    const current = { notes, activeId: 'second' };
    expect(closeNotebookTab(current, 'missing', blank)).toBe(current);
  });
});

describe('additional notebook actions', () => {
  const notes = [
    { id:'one', title:'One', phone:'050', text:'hello', pinned:false },
    { id:'two', title:'Two', phone:'', text:'world', pinned:true },
  ];
  it('pins tabs to the start without changing their saved order', () => {
    expect(sortNotebookTabs(notes).map((n) => n.id)).toEqual(['two', 'one']);
    expect(notes[0].id).toBe('one');
  });
  it('duplicates notes without sharing their IDs', () => {
    const copy = duplicateNotebookTab({notes,activeId:'one'},'one','duplicate','2026-11-09');
    expect(copy.notes.map(n=>n.id)).toEqual(['one','duplicate','two']);
    expect(copy.notes[1]).toMatchObject({text:'hello',phone:'050',pinned:false,title:'One (עותק)'});
  });
  it('undoes closing the last tab without leaving an unused blank', () => {
    const original = {notes:[notes[0]],activeId:'one'};
    const blank = {id:'blank',title:'פתק 1',text:'',phone:''};
    const closed = closeNotebookTab(original,'one',blank);
    expect(restoreClosedNotebookTab(closed,{note:notes[0],index:0,blankId:'blank'})).toEqual(original);
  });
  it('keeps pin flag when reloading stored notebook', () => {
    const saved = {notes,activeId:'two'};
    expect(normalizeNotebook(saved,null).notes[1].pinned).toBe(true);
  });
});

describe('IPv4 subnet calculator', () => {
  it('calculates a /24 including the network and usable range', () => {
    expect(calculateIpv4Subnet('192.168.1.10/24')).toMatchObject({
      network: '192.168.1.0', broadcast: '192.168.1.255',
      mask: '255.255.255.0', wildcard: '0.0.0.255',
      usableRange: '192.168.1.1 – 192.168.1.254', total: 256, usable: 254,
    });
  });
  it('handles special /31 and /32 prefixes and /0', () => {
    expect(calculateIpv4Subnet('10.0.0.4/31').usable).toBe(2);
    expect(calculateIpv4Subnet('10.0.0.4/32').usable).toBe(1);
    expect(calculateIpv4Subnet('10.0.0.4/0').total).toBe(4294967296);
  });
  it('rejects invalid IP addresses and CIDRs', () => {
    expect(() => calculateIpv4Subnet('999.0.0.1/24')).toThrow();
    expect(() => calculateIpv4Subnet('192.168.1.1/33')).toThrow();
  });
});
