// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import PhoneLookup from '../src/PhoneLookup.jsx';

let root;
let container;
const setInput = async (selector, value) => {
  const input = container.querySelector(selector);
  if (!input) throw new Error('Missing input: ' + selector);
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  sessionStorage.clear();
  vi.useFakeTimers();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<PhoneLookup />); });
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});
describe('automatic caller-name lookup', () => {
  it('does not contact the provider without the users key', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await setInput('input[aria-label="מספר טלפון ישראלי"]', '0501234567');
    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it('waits for a complete number and debounce, then displays the result', async () => {
    const fetchSpy = vi.fn(async () => ({ ok:true, json:async()=>({
      number:'0501234567',name:'Example Caller',lineType:'mobile',
      checkedAt:'2026-11-15T00:00:00Z'
    }) }));
    vi.stubGlobal('fetch',fetchSpy);
    await setInput('input[aria-label="Numbers Online API key"]','nol_0123456789abcdefgh');
    await setInput('input[aria-label="מספר טלפון ישראלי"]','050123456');
    await act(async()=>{vi.advanceTimersByTime(2000);});
    expect(fetchSpy).not.toHaveBeenCalled();
    await setInput('input[aria-label="מספר טלפון ישראלי"]','0501234567');
    await act(async()=>{vi.advanceTimersByTime(1499);});
    expect(fetchSpy).not.toHaveBeenCalled();
    await act(async()=>{
      await vi.advanceTimersByTimeAsync(2);
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url,options]=fetchSpy.mock.calls[0];
    expect(url).toBe('/api/phone-lookup');
    expect(JSON.parse(options.body).number).toBe('0501234567');
    expect(container.textContent).toContain('Example Caller');
    expect(sessionStorage.getItem('work-tools:phone-lookup-session-key-v1')).toBeNull();
  });
  it('cancels a scheduled lookup if the number changes before the debounce',async()=>{
    const fetchSpy = vi.fn(async()=>({ok:true,json:async()=>({number:'0507654321',name:null})}));
    vi.stubGlobal('fetch',fetchSpy);
    await setInput('input[aria-label="Numbers Online API key"]','nol_0123456789abcdefgh');
    await setInput('input[aria-label="מספר טלפון ישראלי"]','0501234567');
    await act(async()=>{vi.advanceTimersByTime(1200);});
    await setInput('input[aria-label="מספר טלפון ישראלי"]','0507654321');
    await act(async()=>{await vi.advanceTimersByTimeAsync(1501);});
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body).number).toBe('0507654321');
  });
});
