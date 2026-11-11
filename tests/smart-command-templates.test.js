import { describe, expect, it } from 'vitest';
import {
  defaultTemplateFields, renderSmartTemplate, smartTemplateState, suggestSmartTemplate,
  templateFieldNames, validateSmartTemplate,
} from '../src/smart-command-templates.js';

function record(command) { return {id:'pocket',machine:'Fortigate',category:'Diagnostics',description:'Ping',command}; }
describe('Pocket smart CLI templates in DashDash', () => {
  it('does not auto-transform commands that contain no hints', () => {
    const row=record('show ip route');
    expect(suggestSmartTemplate(row.command)).toBeNull();
    expect(smartTemplateState(row)).toBe('plain');
  });
  it('suggests IPv4 placeholders while preserving original command text', () => {
    const row=record('execute ping x.x.x.x');
    const suggested=suggestSmartTemplate(row.command);
    expect(suggested.format).toBe('execute ping {{IP}}');
    expect(suggested.fields).toEqual([{name:'IP',label:'IP',type:'ipv4'}]);
    expect(row.command).toBe('execute ping x.x.x.x');
    expect(smartTemplateState(row)).toBe('plain');
    row.template=validateSmartTemplate(suggested,row.command);
    expect(smartTemplateState(row)).toBe('configured');
    expect(renderSmartTemplate(row,{IP:'192.0.2.10'})).toBe('execute ping 192.0.2.10');
  });
  it('keeps distinct generic IP hints and reuses explicit repeated field names', () => {
    const suggestion=suggestSmartTemplate('route x.x.x.x (start) x.x.x.x (end)');
    expect(templateFieldNames(suggestion.format)).toEqual(['START_IP','END_IP']);
    expect(templateFieldNames(suggestSmartTemplate('show route {VRF} and {VRF}').format)).toEqual(['VRF']);
  });
  it('supports user-authored templates, a custom source command, and choices', () => {
    const row=record('set internet-connection name disable / enable');
    const template=validateSmartTemplate({
      format:'set status {{MODE}}',
      fields:[{name:'MODE',label:'Mode',type:'choice',options:['enable','disable']}],
    },row.command);
    row.template=template;
    expect(renderSmartTemplate(row,{MODE:'enable'})).toBe('set status enable');
    expect(()=>renderSmartTemplate(row,{MODE:'shutdown'})).toThrow();
  });
  it('validates field types and blocks unresolved or invalid values', () => {
    const row=record('show {{IP}} vlan {{VLAN}} on {{IFACE}}');
    row.template=validateSmartTemplate({
      format:row.command,fields:defaultTemplateFields(row.command),
    },row.command);
    expect(renderSmartTemplate(row,{IP:'10.0.0.1',VLAN:'200',IFACE:'ge-0/0/1'}))
      .toBe('show 10.0.0.1 vlan 200 on ge-0/0/1');
    expect(()=>renderSmartTemplate(row,{IP:'999.0.0.1',VLAN:'200',IFACE:'ge-0/0/1'})).toThrow();
    expect(()=>renderSmartTemplate(row,{IP:'10.0.0.1',VLAN:'5000',IFACE:'ge-0/0/1'})).toThrow();
    expect(()=>renderSmartTemplate(row,{IP:'10.0.0.1',VLAN:'200',IFACE:'wan;reload'})).toThrow();
  });
  it('invalidates templates when original CLI is edited, without changing the source', () => {
    const row=record('execute ping x.x.x.x');
    row.template=validateSmartTemplate(suggestSmartTemplate(row.command),row.command);
    row.command='execute ping x.x.x.x source wan1';
    expect(smartTemplateState(row)).toBe('needs-review');
    expect(()=>renderSmartTemplate(row,{IP:'10.0.0.1'})).toThrow();
    row.template=validateSmartTemplate(row.template,row.command);
    expect(smartTemplateState(row)).toBe('configured');
  });
  it('rejects unsafe or ambiguous template definitions', () => {
    const command='show {{A}}';
    const bad=[{format:'show {{A}}',fields:[]},{format:'show {{A}} {{B}}',
      fields:[{name:'A',label:'A',type:'text'}]},{format:'show {{A}',fields:[{name:'A',label:'A',type:'text'}]}];
    for(const template of bad) expect(()=>validateSmartTemplate(template,command)).toThrow();
  });
  it('rejects separators in free text and validates network, MAC and port values', () => {
    const row=record('ping');
    row.template=validateSmartTemplate({
      format:'ping {{HOST}} {{SUBNET}} {{PORT}} {{MAC}}',
      fields:[
        {name:'HOST',label:'Host',type:'text'},{name:'SUBNET',label:'Network',type:'cidr'},
        {name:'PORT',label:'Port',type:'port'},{name:'MAC',label:'Mac',type:'mac'},
      ],
    },row.command);
    expect(renderSmartTemplate(row,{HOST:'Router-1',SUBNET:'192.0.2.0/24',PORT:'443',MAC:'aa:bb:cc:dd:ee:ff'}))
      .toContain('192.0.2.0/24');
    expect(()=>renderSmartTemplate(row,{HOST:'a;rm',SUBNET:'192.0.2.0/24',PORT:'443',MAC:'aa:bb:cc:dd:ee:ff'})).toThrow();
  });
});
