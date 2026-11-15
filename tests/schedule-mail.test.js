import { beforeAll, describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { activitiesForCell, decodeMailHtml, matchScheduleWeek, mentionsEmployee, parseScheduleMail } from '../src/schedule-mail-parser.js';

beforeAll(()=>{globalThis.DOMParser=new JSDOM('').window.DOMParser;});

const html = [
  '<html><body><p>נושא: RE: סידור עבודה לשבוע 45</p>',
  '<p>מצורף סידור עבודה לשבוע 47 – 15/11-21/11</p>',
  '<p>נקודות חשובות :</p><p>חובה להגיע למוקד בהתאם למשמרת שהוקצתה לכם בקובץ אקסל. צהוב = הגעה למוקד</p>',
  '<table><tr><td colspan="8">סידור עבודה 15/11-21/11</td></tr>',
  '<tr><td colspan="2">שבוע 47</td><td colspan="6"></td></tr>',
  '<tr><td rowspan="2">15-נוב</td><td rowspan="2">א</td><td rowspan="2">יום הדרכות חולון</td>',
  '<td>12:00-14:00</td><td>הדרכת BWIFI - נאור</td><td>עומר רודריג, רוני שמידוב</td><td></td><td></td></tr>',
  '<tr><td>16:00-18:00</td><td>הדרכת BWIFI - נאור ש.נ.</td><td colspan="2">עומר רודריג, רוני שמידוב עידו יעקובי</td><td></td></tr>',
  '<tr><td>16-נוב</td><td>ב</td><td>יום הדרכות חולון</td><td>08:00-09:00</td><td>הכנות SDWAN</td><td>אלונה גורביץ</td><td></td><td></td></tr>',
  '<tr><td>מנהלי משמרת</td><td colspan="2"></td><td>15-נוב</td><td>16-נוב</td><td>17-נוב</td><td>18-נוב</td><td>19-נוב</td></tr>',
  '<tr><td></td><td colspan="2">מנהל משמרת בוקר</td><td>מאור</td><td>אדיר</td><td>שרית</td><td>מאור</td><td>אדיר</td></tr>',
  '<tr><td>מומחים</td><td colspan="2">מומחה מנהל שיחות</td><td>רוני שמידוב</td><td>אלירן כהן</td><td>רוני שמידוב</td><td>רוני שמידוב</td><td>רוני שמידוב</td></tr>',
  '<tr><td>פעילויות OFFLINE</td><td colspan="2">הפעלות / מיגרציות</td><td>מיגרציית קו - רוני שמידוב</td><td></td><td></td><td></td><td></td></tr>',
  '<tr><td>מחוץ למוקד</td><td colspan="2">חופשים</td><td>אלון פרידמן</td><td></td><td></td><td></td><td></td></tr>',
  '</table></body></html>'
].join('');

describe('optional email schedule intelligence',()=>{
  it('prioritizes actual table week over misleading forwarded subject and parses merged Excel-like Outlook rows',()=>{
    const parsed=parseScheduleMail(html,{format:'html',filename:'RE סידור עבודה לשבוע 45.htm'});
    expect(parsed.week).toBe(47);
    expect(parsed.range).toMatchObject({start:{day:15,month:11},end:{day:21,month:11}});
    expect(parsed.notices.join(' ')).toContain('חובה להגיע למוקד');
    const trainings=parsed.events.filter((e)=>e.kind==='training');
    expect(trainings).toHaveLength(3);
    expect(trainings.map((e)=>[e.day,e.time])).toEqual([[0,'12:00-14:00'],[0,'16:00-18:00'],[1,'08:00-09:00']]);
    expect(parsed.events.some((e)=>e.title.includes('מנהל משמרת בוקר')&&e.day===0)).toBe(true);
    expect(parsed.events.some((e)=>e.title.includes('מיגרציית קו')&&e.day===0)).toBe(true);
    expect(parsed.events.some((e)=>e.category==='היעדרויות'&&e.day===0)).toBe(true);
    expect(parsed.events.length).toBeGreaterThan(10);
  });

  it('matches named employee only on exact whole name and keeps other activities unassigned',()=>{
    const parsed=parseScheduleMail(html,{format:'html'});
    expect(mentionsEmployee('עומר רודריג, רוני שמידוב עידו יעקובי','רוני שמידוב')).toBe(true);
    expect(mentionsEmployee('אור יצחקי', 'אור יצחק')).toBe(false);
    expect(mentionsEmployee('רוני','רוני')).toBe(false);
    const day=activitiesForCell(parsed,'רוני שמידוב',0,'matched');
    expect(day.personal.some((e)=>e.title.includes('BWIFI'))).toBe(true);
    expect(day.personal.some((e)=>e.title.includes('מיגרציית קו'))).toBe(true);
    expect(day.personal.some((e)=>e.title.includes('מנהל משמרת בוקר'))).toBe(false);
    expect(day.weekly.some((e)=>e.day===2)).toBe(true);
    expect(day.otherDay.some((e)=>e.title.includes('מנהל משמרת בוקר'))).toBe(true);
  });

  it('blocks mismatching weeks and supports uncertain clipboard-only week',()=>{
    const parsed=parseScheduleMail(html,{format:'html'});
    expect(matchScheduleWeek({week:46},parsed,{rows:[]} ).state).toBe('mismatch');
    expect(activitiesForCell(parsed,'רוני שמידוב',0,'mismatch').personal).toEqual([]);
    expect(matchScheduleWeek({week:47},parsed,{rows:[]} ).state).toBe('matched');
    expect(matchScheduleWeek({week:null},parsed,{rows:[]} ).state).toBe('unverified');
  });

  it('reads Gmail text without HTML and warns about clipped content/flat roster tables',()=>{
    const text=['Skip to content','מצורף סידור עבודה לשבוע 47 – 15/11-21/11','סידור עבודה 15/11-21/11','שבוע 47','15-נוב','א','יום הדרכות חולון','12:00-14:00','הדרכת BWIFI - נאור','עומר רודריג, רוני שמידוב','16-נוב','ב','08:00-09:00','הכנות SDWAN','אלונה גורביץ','מנהלי משמרת','[Message clipped] View entire message'].join('\n');
    const parsed=parseScheduleMail(text);
    expect(parsed.events.length).toBe(2);
    expect(parsed.events[0]).toMatchObject({day:0,title:'הדרכת BWIFI - נאור'});
    expect(parsed.events[0].peopleText).toContain('רוני שמידוב');
    expect(parsed.warnings.join(' ')).toMatch(/נקטע/);
    expect(parsed.warnings.join(' ')).toMatch(/HTML/);
    expect(parsed.rawText).toContain('מנהלי משמרת');
  });

  it('decodes Microsoft Outlook UTF-16LE HTML with a byte order mark',()=>{
    const utf16=new Uint8Array([255,254,...[...'<html>שבוע 47</html>'].flatMap((char)=>[char.charCodeAt(0)&255,char.charCodeAt(0)>>8])]);
    expect(decodeMailHtml(utf16.buffer)).toBe('<html>שבוע 47</html>');
  });

  it('does not execute or render scripts embedded in imported email HTML',()=>{
    const parsed=parseScheduleMail('<html><body><script>alert(1)</script><p>סידור עבודה 15/11-21/11</p></body></html>',{format:'html'});
    expect(parsed.rawText).not.toContain('alert(1)');
    expect(parsed.events).toHaveLength(0);
  });
});
