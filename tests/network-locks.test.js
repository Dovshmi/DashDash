// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';

it('adds the same persistent lock controls to MAC and Port widgets', async () => {
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal('requestAnimationFrame', (fn) => setTimeout(fn, 0));
  localStorage.setItem('work-tools:active-widgets-v1', JSON.stringify(['mac','ports']));
  localStorage.setItem('work-tools:dashboard-layout-v3', JSON.stringify([
    { i:'mac',x:0,y:24,w:6,h:12,static:true,isDraggable:false,isResizable:false },
    { i:'ports',x:6,y:24,w:6,h:12 },
  ]));
  document.body.innerHTML = `
    <div class="dashboard-widget" data-widget-id="mac"><section class="card network-card"><p class="eyebrow">IEEE OUI</p></section></div>
    <div class="dashboard-widget" data-widget-id="ports"><section class="card network-card"><p class="eyebrow">TCP CONNECT</p></section></div>
  `;
  await import('../src/widget-locks.js');
  document.dispatchEvent(new Event('DOMContentLoaded'));
  await new Promise((resolve) => setTimeout(resolve, 40));
  const mac = document.querySelector('[data-widget-id="mac"]');
  const port = document.querySelector('[data-widget-id="ports"]');
  expect(mac.querySelector('.widget-lock')).toBeTruthy();
  expect(port.querySelector('.widget-lock')).toBeTruthy();
  expect(mac.querySelector('.widget-lock').getAttribute('aria-pressed')).toBe('true');
  expect(port.querySelector('.widget-lock').getAttribute('aria-pressed')).toBe('false');
  expect(mac.classList.contains('widget-locked')).toBe(true);
});
