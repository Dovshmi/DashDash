// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildShiftHoverPreview, placeShiftHover } from '../src/schedule-hover.js';
import ShiftDayHover from '../src/ShiftDayHover.jsx';
import ScheduleWeekGrid from '../src/ScheduleWeekGrid.jsx';
import { guessMapping } from '../src/work-schedule-parser.js';
import { readScheduleClipboard } from '../src/schedule-clipboard.js';
import { renderToStaticMarkup } from 'react-dom/server';

const staff = 'דנה בדיקה';
const events = [
  {id:'p1', day:0, title:'הדרכת BWIFI', time:'12:00-14:00', category:'הדרכות', peopleText:'דנה בדיקה, נועם מדגם', kind:'training',details:''},
  {id:'p2', day:0, title:'מבחן מיפוי ידע', time:'08:00-09:00', category:'הדרכות', peopleText:'דנה בדיקה', kind:'training',details:''},
  {id:'x', day:0, title:'שיבוץ של עובד אחר', time:'11:00-12:00',category:'תורנות',peopleText:'אורי דוגמה', kind:'duty',details:''},
  {id:'g', day:0, title:'הדרכת היכרות כללית', time:'09:00-10:00',category:'הדרכות',peopleText:'',kind:'training',details:''},
  {id:'later',day:1,title:'משימה של מחר',time:'13:00-14:00',category:'תורנות',peopleText:'דנה בדיקה',kind:'duty',details:''},
];
const mail = {events, notices:[], week:47};
const matched = {state:'matched',message:''};
const weekgrid = readScheduleClipboard([
  'מנהל צוות\tסקיל\tשם\tיום א -15/11\tיום ב -16/11',
  'אורן\tמוקד IP\tדנה בדיקה\t08:00 - 18:00\t07:45 - 16:30',
  'אורן\tמוקד IP\tאורי דוגמה\t08:00 - 16:30\t08:00 - 16:30',
].join('\n')).sheets[0];

describe('daily shift hover preview', () => {
  it('shows only personal and explicitly general activities, sorted by hour', () => {
    const preview = buildShiftHoverPreview({mail,mailWeek:matched,employee:staff,day:0,dayLabel:'ראשון 15/11',shift:'08:00 - 18:00'});
    expect(preview.shift).toBe('08:00 - 18:00');
    expect(preview.count).toBe(2);
    expect(preview.generalCount).toBe(1);
    expect(preview.entries.map((event)=>event.id)).toEqual(['p2','g','p1']);
    expect(preview.entries[1].assignment).toBe('general');
    expect(preview.entries.some((event)=>event.title==='שיבוץ של עובד אחר')).toBe(false);
    expect(preview.entries.some((event)=>event.title==='משימה של מחר')).toBe(false);
  });

  it('does not leak activities from mismatched weeks or from employees not named', () => {
    const bad = buildShiftHoverPreview({mail,mailWeek:{state:'mismatch',message:'לא אותו שבוע'},employee:staff,day:0,shift:'08:00'});
    expect(bad.entries).toEqual([]);
    expect(bad.warning).toContain('לא אותו שבוע');
    const other = buildShiftHoverPreview({mail,mailWeek:matched,employee:'עובד לא מוזכר',day:0,shift:'08:00'});
    expect(other.count).toBe(0);
    expect(other.entries.every((event)=>event.assignment==='general')).toBe(true);
  });

  it('handles no email and limits preview to five items with a remainder count', () => {
    expect(buildShiftHoverPreview({employee:staff,day:0,shift:'Day Off'}).entries).toHaveLength(0);
    const many={events:Array.from({length:9},(_,i)=>({id:String(i),day:0,title:'פעילות '+i,time:String(8+i).padStart(2,'0')+':00-09:00',peopleText:staff,kind:'training',details:''}))};
    const p=buildShiftHoverPreview({mail:many,mailWeek:matched,employee:staff,day:0,shift:'08:00'});
    expect(p.entries).toHaveLength(5);
    expect(p.overflow).toBe(4);
    const html=renderToStaticMarkup(<ShiftDayHover preview={p} position={{top:12,left:12,width:350}} />);
    expect(html).toContain('לחיצה על התא');
    expect(html).toContain('ועוד 4 פעילויות');
    expect(html).not.toContain('פעילות 8');
  });

  it('positions tooltip inside the viewport near edges and above bottom cells', () => {
    const a=placeShiftHover({left:980,width:100,top:670,bottom:700},{width:1080,height:760},4);
    expect(a.left).toBeGreaterThanOrEqual(8);
    expect(a.left+a.width).toBeLessThanOrEqual(1072);
    expect(a.top).toBeLessThan(670);
    const b=placeShiftHover({left:0,width:80,top:15,bottom:45},{width:320,height:480},1);
    expect(b.left).toBe(8);
    expect(b.top).toBeGreaterThanOrEqual(8);
    const c=placeShiftHover({left:0,width:50,top:20,bottom:50},{width:230,height:240},2);
    expect(c.top).toBeGreaterThanOrEqual(8);
    expect(c.top).toBeLessThanOrEqual(232);
  });
});

describe('actual weekday cell hover interaction',()=>{
  let host,root;
  beforeEach(()=>{globalThis.IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.append(host);root=createRoot(host);});
  afterEach(async()=>{await act(async()=>root.unmount());host.remove();document.querySelectorAll('.schedule-shift-hover,.schedule-cell-overlay').forEach((node)=>node.remove());});

  it('appears on hover, hides on mouse leave, and keeps click-to-open details',async()=>{
    await act(async()=>root.render(<ScheduleWeekGrid sheet={weekgrid} mapping={guessMapping(weekgrid)} query="" setQuery={()=>{}} mail={mail} mailWeek={matched}/>));
    const button=host.querySelector('.schedule-week-day-button');
    expect(button).toBeTruthy();
    button.getBoundingClientRect=()=>({left:300,right:422,width:122,top:200,bottom:235,height:35});
    await act(async()=>button.dispatchEvent(new MouseEvent('mouseover',{bubbles:true})));
    const tooltip=document.querySelector('[role="tooltip"]');
    expect(tooltip).toBeTruthy();
    expect(tooltip.textContent).toContain('08:00 - 18:00');
    expect(tooltip.textContent).toContain('מבחן מיפוי ידע');
    expect(tooltip.textContent).not.toContain('שיבוץ של עובד אחר');
    await act(async()=>button.dispatchEvent(new MouseEvent('mouseout',{bubbles:true})));
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
    await act(async()=>button.dispatchEvent(new MouseEvent('click',{bubbles:true})));
    expect(document.querySelector('[role="dialog"]')).toBeTruthy();
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
  });

  it('supports keyboard focus and dismisses tooltip on scroll',async()=>{
    await act(async()=>root.render(<ScheduleWeekGrid sheet={weekgrid} mapping={guessMapping(weekgrid)} query="" setQuery={()=>{}} mail={mail} mailWeek={matched}/>));
    const button=host.querySelector('.schedule-week-day-button');
    button.getBoundingClientRect=()=>({left:100,width:120,top:200,bottom:240,height:40});
    await act(async()=>button.focus());
    expect(document.querySelector('[role="tooltip"]')).toBeTruthy();
    await act(async()=>window.dispatchEvent(new Event('scroll')));
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
  });
});
