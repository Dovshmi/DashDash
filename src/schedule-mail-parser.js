import { cleanText, weekFromText } from './work-schedule-parser.js';

const MONTHS = { 'ינו':1,'ינואר':1,'פבר':2,'פברואר':2,'מרץ':3,'אפר':4,'אפריל':4,'מאי':5,'יונ':6,'יוני':6,'יול':7,'יולי':7,'אוג':8,'אוגוסט':8,'ספט':9,'ספטמבר':9,'אוק':10,'אוקטובר':10,'נוב':11,'נובמבר':11,'דצמ':12,'דצמבר':12 };
const DAYS = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
const MAX_SOURCE = 3_000_000;
const timePattern = /(?:^|[^\d])([01]?\d|2[0-3]):([0-5]\d)\s*[-–—]\s*([01]?\d|2[0-3]):([0-5]\d)(?:$|[^\d])/;
const datePattern = /^(\d{1,2})\s*[-./]\s*(\d{1,2}|[\u0590-\u05ff]{2,12})(?:\s*[-./]\s*(20\d{2}))?$/;
const scheduleRangePattern = /סידור\s*עבודה[^\n]{0,60}?(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[-–]\s*(\d{1,2})\s*[/.-]\s*(\d{1,2})/i;
const weekPattern = /(?:סידור\s*עבודה\s*ל)?שבוע\s*[:#-]?\s*(\d{1,2})/i;
const categoryHeadings = /^(?:מנהלי משמרת|מומחים|רמה 3|תגבור רמה 3|מענה\s*SOC|סייבר|VC|תומכי ווצאפ|מיילים|ניטור|לילות(?:\s*-\s*מהמוקד.*)?|מחוץ למוקד|פעילויות\s*OFFLINE)$/i;
const subHeadings = /^(?:פעילויות\s*OFFLINE|הפעלות\s*\/\s*מיגרציות|חופשים|מילואים)$/i;

const normal = (value) => cleanText(String(value || '').replace(/\u00a0/g, ' '));
const uniq = (values) => [...new Set(values.map(normal).filter(Boolean))];
function extractDate(value) {
  const match = normal(value).match(datePattern);
  if (!match) return null;
  const day = Number(match[1]);
  const month = /^\d+$/.test(match[2]) ? Number(match[2]) : MONTHS[match[2]];
  if (!month || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return {day, month, year: match[3] ? Number(match[3]) : null};
}
function dayOfWeek(value) {
  const text = normal(value).replace(/^יום\s+/, '');
  const direct = DAYS.findIndex((d) => text === d || text.startsWith(d + ' '));
  if (direct >= 0) return direct;
  if (/^ראשון\s*[-–]/.test(text)) return 0;
  if (/^שני\s*[-–]/.test(text)) return 1;
  if (/^שלישי\s*[-–]/.test(text)) return 2;
  if (/^רביעי\s*[-–]/.test(text)) return 3;
  if (/^חמישי\s*[-–]/.test(text)) return 4;
  if (/^שישי\s*[-–]/.test(text)) return 5;
  if (/^שבת\s*[-–]/.test(text)) return 6;
  const short = {'א':0,'ב':1,'ג':2,'ד':3,'ה':4,'ו':5,'ש':6};
  return Object.hasOwn(short,text) ? short[text] : -1;
}
function deriveDateIndex(value,range) {
  const date=extractDate(value);
  if (!date || !range) return -1;
  const start = Date.UTC(2024,range.start.month-1,range.start.day);
  const current = Date.UTC(2024,date.month-1,date.day);
  let diff=Math.round((current-start)/86400000);
  if (diff < -300) diff+=366; // year boundary
  if (diff >= 0 && diff <= 6) return diff;
  return -1;
}
function weekFromBody(body, tableText) {
  const first = (tableText || '').match(weekPattern)?.[1];
  if (first && Number(first) >= 1 && Number(first) <= 53) return Number(first);
  const schedule = body.match(/(?:מצורף\s+)?סידור\s+עבודה\s+לשבוע\s+(\d{1,2})/i)?.[1];
  if (schedule && Number(schedule) >= 1 && Number(schedule) <= 53) return Number(schedule);
  return weekFromText(body);
}
function dateRangeFromBody(body) {
  const match = body.match(scheduleRangePattern);
  if (!match) return null;
  return {start:{day:Number(match[1]),month:Number(match[2])},end:{day:Number(match[3]),month:Number(match[4])}};
}
function extractNotices(body) {
  const notices=[];
  const lines=body.split(/\n/).map(normal).filter(Boolean);
  for (const line of lines) {
    if (/^(?:חובה להגיע|כמו כן בימים|אילוצים לשבוע|צהוב\s*=)/.test(line))notices.push(line);
  }
  // Word/Outlook often divides sentences across <p> tags or hard line breaks.
  const flat=normal(body);
  const required=flat.match(/(חובה\s+להגיע\s+למוקד.{0,240}?)(?=כמו\s+כן\s+בימים|סידור\s+עבודה\s+\d{1,2}\s*[/.-]|$)/);
  const training=flat.match(/(כמו\s+כן\s+בימים\s+של\s+הדרכות.{0,220}?)(?=סידור\s+עבודה\s+\d{1,2}\s*[/.-]|$)/);
  const deadlines=flat.match(/(אילוצים\s+לשבוע\s+\d{1,2}.{0,120}?)(?=שבת\s+שלום|נקודות\s+חשובות|$)/);
  for(const found of [required,training,deadlines])if(found?.[1])notices.push(found[1]);
  return uniq(notices).slice(0,25);
}
function safeHtmlDocument(text) {
  if (typeof DOMParser === 'undefined') throw new Error('הדפדפן אינו תומך בניתוח HTML.');
  return new DOMParser().parseFromString(text,'text/html');
}
function cellText(cell) {
  if (!cell) return '';
  return normal(cell.textContent);
}
function expandTable(table) {
  const matrix=[], pending=[];
  const rows=[...table.querySelectorAll('tr')].slice(0,2500);
  for(let ri=0;ri<rows.length;ri++){
    const output=[];
    for(let j=0;j<pending.length;j++) {
      const p=pending[j];
      if (p && p.remaining>0) { output[j]=p.cell; p.remaining-=1; if(!p.remaining)pending[j]=null; }
    }
    let column=0;
    for(const element of [...rows[ri].children].filter((el)=>['TD','TH'].includes(el.tagName))){
      while(output[column])column++;
      const colspan=Math.min(40,Math.max(1,Number(element.getAttribute('colspan'))||1));
      const rowspan=Math.min(100,Math.max(1,Number(element.getAttribute('rowspan'))||1));
      const cell={text:cellText(element),originRow:ri,originCol:column,colspan,rowspan};
      for(let j=0;j<colspan;j++){
        output[column+j]=cell;
        if(rowspan>1)pending[column+j]={cell,remaining:rowspan-1};
      }
      column+=colspan;
    }
    matrix.push(output.slice(0,40));
  }
  return matrix;
}
function titleFromDay(row,dayIndex,range) {
  const rawDate = row[0]?.text || '';
  return rawDate && deriveDateIndex(rawDate,range)===dayIndex ? rawDate : DAYS[dayIndex];
}
function eventAdd(events, event) {
  const title=normal(event.title);
  const details=normal(event.details || '');
  if (!title || event.day<0 || event.day>6) return;
  const data={ id:'mail-'+events.length, day:event.day, dayLabel:DAYS[event.day], category:event.category || 'פעילות',
    title:title.slice(0,320), time:normal(event.time || '').slice(0,90), details:details.slice(0,1300),
    peopleText:normal(event.peopleText || '').slice(0,1300), location:normal(event.location || '').slice(0,130),
    kind:event.kind || 'assignment', source:event.source || 'טבלת המייל' };
  const signature=[data.day,data.category,data.title,data.time,data.details,data.peopleText].join('|');
  if (events.some((existing) => [existing.day,existing.category,existing.title,existing.time,existing.details,existing.peopleText].join('|')===signature)) return;
  events.push(data);
}
function categoryFromTitle(title, section) {
  const name=normal(title+' '+section);
  if (/הדרכ|קורס|חניכ|לומד|מבחן|SDWAN|BCAM|BWIFI|ERICSSON|AI/i.test(name)) return 'הדרכות ומבחנים';
  if (/מיגרצ|התקנ|שדרוג|הפעל|עבוד|החלפ|GBIC|DR\b|SDWAN/i.test(name)) return 'עבודות ומיגרציות';
  if (/חופש|מילואים|מחוץ למוקד|היעדרות/.test(name)) return 'היעדרויות';
  if (/SOC|תורנ|ניטור|מומח|רמה 3|תגבור|מנהל משמרת|ווצאפ|מיילים|VC|סייבר/i.test(name)) return 'תורנויות ותפקידים';
  return 'פעילויות נוספות';
}
function parseEmailTable(doc, events, range, warnings) {
  const tables=[...doc.querySelectorAll('table')].filter((t)=>t.querySelectorAll('tr').length>=2);
  const table=tables.sort((a,b)=>b.querySelectorAll('tr').length-a.querySelectorAll('tr').length)[0];
  if(!table) { warnings.push('לא נמצאה טבלה מובנית ב-HTML; ייתכן שההודעה הועתקה ללא הטבלאות.'); return ''; }
  const matrix=expandTable(table);
  const tableText=table.textContent||'';
  let roster=false, day=-1,section='',subSection='';
  let headers=[0,1,2,3,4];
  let trainingLocation='';
  for(let ri=0;ri<matrix.length;ri++){
    const row=matrix[ri], cells=Array.from({length:8},(_,i)=>row[i]?.text || '');
    const a=cells[0], b=cells[1], c=cells[2];
    if (/מנהלי\s*משמרת/.test(a) && !roster) { roster=true;section='מנהלי משמרת'; }
    if (!roster) {
      const dayIndex=deriveDateIndex(a,range);
      if(dayIndex>=0){day=dayIndex;trainingLocation=c;}
      if (day>=0 && timePattern.test(cells[3]) && cells[4] && !/^יום הדרכות/.test(cells[4])) {
        const participants=uniq(cells.slice(5,8));
        eventAdd(events,{day,category:categoryFromTitle(cells[4],''),title:cells[4],time:cells[3],
          peopleText:participants.join(' · '),location:trainingLocation,kind:'training',source:'לוח הדרכות'});
      }
      continue;
    }
    if(categoryHeadings.test(a) && row[0]?.originRow===ri){ section=normal(a);subSection=''; }
    if(subHeadings.test(b) && row[1]?.originRow===ri){subSection=normal(b);if (/פעילויות\s*OFFLINE/.test(b)){section=subSection;subSection='';}}
    const headerWords=cells.slice(3,8).map(dayOfWeek);
    const dateWords=cells.slice(3,8).map((value)=>deriveDateIndex(value,range));
    if (headerWords.filter((n)=>n>=0).length>=3) {headers=headerWords;continue;}
    if (dateWords.filter((n)=>n>=0).length>=3) {headers=dateWords;continue;}
    const category=subSection ? section+' / '+subSection : section;
    const role=uniq([b,c]).filter((v)=>v && !/^(?:ראשון|שני|שלישי|רביעי|חמישי)$/.test(v)).join(' · ');
    if (cells.slice(3,8).every((value)=>!value)) continue;
    for(let col=3;col<8;col++){
      const value=cells[col];
      if(!value || !category || /^ראשון$|^שני$|^שלישי$|^רביעי$|^חמישי$/.test(value))continue;
      const offset=headers[col-3];
      if(!Number.isInteger(offset)||offset<0||offset>6)continue;
      // Skip repeated headers and explanatory rows that span the entire week.
      if(row[col]?.colspan>1 || row[col]?.originCol!==col)continue;
      const title = role && !subHeadings.test(role) ? category+' · '+role : category+' · '+value.slice(0,105);
      eventAdd(events,{day:offset,category:categoryFromTitle(title,category),title,
        details:value,peopleText:value,kind:'duty',source:'טבלאות תורנויות ומשימות'});
    }
  }
  return tableText;
}
// When a mail client loses HTML table structure, recover only rows that are
// unambiguously a label followed by exactly five non-empty day values.
// Partial or collapsed rows are intentionally skipped instead of guessing.
function parsePlainDutyRows(lines,events){
  const start=lines.findIndex((line)=>/^מנהלי משמרת$/.test(line));
  if(start<0)return;
  let section='',parsed=0;
  function roleForSection(label,context){
    if(context==='מנהלי משמרת')return /^מנהל משמרת (?:בוקר|ערב)$/.test(label);
    if(context==='מומחים')return /^מומחה|^08:30$/.test(label);
    if(context==='רמה 3')return /^תורן (?:בוקר|ערב)/.test(label);
    if(context==='תגבור רמה 3')return /^סבב מתגברים|^מתגבר הפסקות|^DAY 2$/.test(label);
    if(context==='מענה SOC')return /^(?:08:00|09:30)$|^תורן ערב/.test(label);
    if(context==='סייבר')return /^תורן ניטור|^התקנות/.test(label);
    if(context==='תומכי ווצאפ')return /^(?:08:25|10:00|גיבוי|ירושלים)/.test(label);
    if(context==='מיילים')return /^08:00/.test(label);
    if(context==='ניטור')return /^(?:בוקר|ערב|9:00)/.test(label);
    return false;
  }
  for(let i=start;i<lines.length && i<3500;i++){
    const value=lines[i];
    if(categoryHeadings.test(value)) {section=value;continue;}
    if(!section||!roleForSection(value,section))continue;
    const five=lines.slice(i+1,i+6);
    if(five.length!==5 || five.some((candidate) =>
      !candidate || categoryHeadings.test(candidate) || subHeadings.test(candidate) ||
      roleForSection(candidate,section) || extractDate(candidate) || dayOfWeek(candidate)>=0))continue;
    five.forEach((assignment,day)=>eventAdd(events,{day,category:categoryFromTitle(value,section),
      title:section+' · '+value,peopleText:assignment,details:assignment,
      kind:'duty',source:'טבלת תורנויות מטקסט — מבנה שורה משוער'}));
    parsed+=5;i+=5;
  }
  return parsed;
}

function parseTextEvents(text,events,range,warnings,format){
  const lines=text.split(/\r?\n/).map(normal).filter(Boolean);
  if(/\[Message clipped\]|View entire message/i.test(text))warnings.push('הטקסט שהועתק מג׳ימייל נקטע. יש להציג את כל ההודעה או להשתמש ב-HTML.');
  let day=-1, inside=false, done=false,location='';
  for(let i=0;i<lines.length&&i<3500;i++){
    const line=lines[i];
    if (/^מנהלי משמרת$/.test(line)){done=true;break;}
    if(scheduleRangePattern.test(line))inside=true;
    const newDay=extractDate(line);
    if(inside && newDay && deriveDateIndex(line,range)>=0){
      day=deriveDateIndex(line,range);
      location='';
      continue;
    }
    if(!inside||day<0||done)continue;
    if (/^יום הדרכות/.test(line)){location=line;continue;}
    const timing=line.match(timePattern);
    if(!timing)continue;
    const next=[];
    let j=i+1;
    while(j<lines.length && next.length<7 && !timePattern.test(lines[j]) && deriveDateIndex(lines[j],range)<0 && !/^מנהלי משמרת$/.test(lines[j])) {
      if(dayOfWeek(lines[j])<0 && !/^יום הדרכות/.test(lines[j]))next.push(lines[j]);
      j++;
    }
    const title=next.shift()||'';
    if(title){
      eventAdd(events,{day,category:categoryFromTitle(title,''),title,time:line,
        peopleText:next.join(' · '),location,kind:'training',source:'טקסט המייל'});
    }
    i=j-1;
  }
  if(format!=='pdf')parsePlainDutyRows(lines,events);
  warnings.push(format==='pdf' ? 'סדר הטקסט שחולץ מ-PDF עלול להיות שונה ממבנה הטבלה. מידע שלא זוהה נשמר לעיון במקור; מומלץ HTML אם אפשר.' :
    'הדבקת טקסט רגיל אינה שומרת על עמודות טבלאות התורנויות. המידע נשמר לעיון, אך לשיוך מלא מומלץ להדביק HTML או להעלות קובץ HTM.');
}
export function parseScheduleMail(value,{format='text',filename='תוכן מהמייל'}={}){
  if(typeof value!=='string'||!value.trim()) throw new Error('לא נמצא תוכן מייל לקריאה.');
  if(value.length>MAX_SOURCE)throw new Error('המייל גדול מדי לניתוח בדפדפן.');
  const warnings=[],events=[];
  let text=value.replace(/\r\n?/g,'\n'),tableText='';
  if(format==='html'){
    const doc=safeHtmlDocument(value);
    [...doc.querySelectorAll('script,style,iframe,object,embed,template')].forEach((el)=>el.remove());
    text=doc.body?.textContent?.replace(/\r\n?/g,'\n')||'';
    let range=dateRangeFromBody(text);
    const preferredTable=[...doc.querySelectorAll('table')].find((t)=>/סידור\s*עבודה\s*\d{1,2}\s*[/.-]/.test(t.textContent||''));
    if(preferredTable)range=dateRangeFromBody(preferredTable.textContent||'')||range;
    tableText=parseEmailTable(doc,events,range,warnings);
  }
  const range=dateRangeFromBody(tableText)||dateRangeFromBody(text);
  if(format!=='html')parseTextEvents(text,events,range,warnings,format);
  const notices=extractNotices(text);
  const week=weekFromBody(text,tableText);
  if(!range)warnings.push('לא זוהה טווח תאריכים ברור של סידור העבודה במייל.');
  if(!week)warnings.push('לא זוהה מספר שבוע במייל.');
  if(!events.length)warnings.push('לא זוהו פעילויות מתוארכות לשיוך אישי; ניתן עדיין לקרוא את תוכן המייל.');
  return {filename,format,week,range,notices,events,warnings,rawText:text.slice(0,180000),
    eventsCount:events.length};
}
export function decodeMailHtml(buffer){
  const bytes=new Uint8Array(buffer);
  if(bytes.byteLength>MAX_SOURCE*2)throw new Error('קובץ HTML גדול מדי.');
  if(bytes[0]===255&&bytes[1]===254)return new TextDecoder('utf-16le').decode(bytes.slice(2));
  if(bytes[0]===254&&bytes[1]===255)return new TextDecoder('utf-16be').decode(bytes.slice(2));
  if(bytes[0]===60&&bytes[1]===0)return new TextDecoder('utf-16le').decode(bytes);
  return new TextDecoder('utf-8').decode(bytes);
}
export function matchScheduleWeek(schedule,mail,sheet){
  if(!mail)return {state:'missing',message:''};
  if(schedule?.week && mail.week && schedule.week!==mail.week)
    return {state:'mismatch',message:'סידור האקסל הוא לשבוע '+schedule.week+' והמייל לשבוע '+mail.week+'. לא נבצע שיוך אוטומטי.'};
  const headings=sheet?.rows||[];
  const headerTexts=headings.slice(0,5).flatMap((row)=>Object.values(row.cells));
  const first=mail.range?.start;
  if(first){
    const dates=headerTexts.map(extractDate).filter(Boolean);
    if(dates.length>=2 && !dates.some((date)=>date.day===first.day&&date.month===first.month))
      return {state:'mismatch',message:'תאריכי המייל אינם תואמים לתאריכי הטבלה. יש לוודא שהמסמכים מאותו שבוע.'};
  }
  const verified=Boolean(schedule?.week&&mail.week&&schedule.week===mail.week);
  return {state:verified?'matched':'unverified',message:verified?'מספר השבוע אומת מול קובץ האקסל.':'מספר השבוע לא אומת בשני המקורות. יש לבדוק ששניהם מאותו שבוע לפני הסתמכות על השיוכים.'};
}
function normalPerson(text){
  return normal(text).replace(/["'׳״.,()\-–]/g,' ').replace(/\s+/g,' ').trim();
}
export function mentionsEmployee(value,employee){
  const name=normalPerson(employee);
  if(name.split(/\s+/).length<2 || name.length<5)return false;
  const source=' '+normalPerson(value)+' ';
  const target=' '+name+' ';
  return source.includes(target);
}
export function activitiesForCell(mail,employee,day,verifiedState='unverified') {
  if(!mail||verifiedState==='mismatch')return {personal:[],dayGeneral:[],otherDay:[],weekly:[],notices:verifiedState==='mismatch'?[]:(mail?.notices||[])};
  const personal=mail.events.filter((event)=>event.day===day && mentionsEmployee([event.peopleText,event.details].join(' '),employee));
  const weekly=mail.events.filter((event)=>mentionsEmployee([event.peopleText,event.details].join(' '),employee));
  const dayGeneral=mail.events.filter((event)=>event.day===day && event.kind==='training' && !event.peopleText && !personal.includes(event));
  const otherDay=mail.events.filter((event)=>event.day===day && !personal.includes(event) && !dayGeneral.includes(event));
  return {personal,weekly,dayGeneral,otherDay,notices:mail.notices};
}
