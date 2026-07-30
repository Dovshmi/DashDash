const DESKTOP_LAYOUT_KEY = 'work-tools:dashboard-layout-v3';
const MOBILE_LAYOUT_KEY = 'work-tools:mobile-dashboard-layout-v2';
const DESKTOP_WIDGETS_KEY = 'work-tools:active-widgets-v1';
const MOBILE_WIDGETS_KEY = 'work-tools:mobile-active-widgets-v1';
const DEFAULT_DESKTOP_WIDGETS = ['translate', 'timer', 'notes', 'drawing'];
const DEFAULT_MOBILE_WIDGETS = ['timer', 'notes', 'drawing'];

let enhancementScheduled = false;

function readJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
}

function currentStorage() {
  const mobile = window.matchMedia('(max-width: 700px)').matches;
  return mobile
    ? { layoutKey: MOBILE_LAYOUT_KEY, widgetsKey: MOBILE_WIDGETS_KEY, defaults: DEFAULT_MOBILE_WIDGETS }
    : { layoutKey: DESKTOP_LAYOUT_KEY, widgetsKey: DESKTOP_WIDGETS_KEY, defaults: DEFAULT_DESKTOP_WIDGETS };
}

function currentWidgetIds() {
  const { widgetsKey, defaults } = currentStorage();
  const saved = readJson(widgetsKey, defaults);
  return Array.isArray(saved) ? saved : defaults;
}

function currentLayout() {
  const { layoutKey } = currentStorage();
  const saved = readJson(layoutKey, []);
  return Array.isArray(saved) ? saved : [];
}

function identifyWidgets() {
  const ids = currentWidgetIds();
  const notesIds = ids.filter((id) => id === 'notes' || id.startsWith('notes:'));
  const drawingIds = ids.filter((id) => id === 'drawing' || id.startsWith('drawing:'));
  let notesIndex = 0;
  let drawingIndex = 0;

  document.querySelectorAll('.dashboard-widget').forEach((widget) => {
    let id = '';
    if (widget.querySelector('.translate-card')) id = 'translate';
    else if (widget.querySelector('.timer-card')) id = 'timer';
    else if (widget.querySelector('.notes-card')) id = notesIds[notesIndex++] ?? '';
    else if (widget.querySelector('.drawing-card')) id = drawingIds[drawingIndex++] ?? '';

    if (id) widget.dataset.widgetId = id;
  });
}

function isWidgetLocked(widgetId) {
  return currentLayout().some((item) => item?.i === widgetId && item.static === true);
}

function widgetLabel(widget) {
  return widget.querySelector('.eyebrow')?.textContent?.trim() || 'כלי';
}

function updateLockButton(widget, button) {
  const widgetId = widget.dataset.widgetId;
  if (!widgetId) return;

  const locked = isWidgetLocked(widgetId);
  widget.classList.toggle('widget-locked', locked);
  button.textContent = locked ? '🔒' : '🔓';
  button.setAttribute('aria-pressed', String(locked));
  button.setAttribute('aria-label', locked ? `פתח את ${widgetLabel(widget)}` : `נעל את ${widgetLabel(widget)}`);
  button.title = locked ? 'פתח כלי להזזה ושינוי גודל' : 'נעל כלי במקום ובגודל הנוכחיים';
}

function toggleWidgetLock(widget) {
  const widgetId = widget.dataset.widgetId;
  if (!widgetId) return;

  const { layoutKey } = currentStorage();
  const layout = currentLayout();
  const itemIndex = layout.findIndex((item) => item?.i === widgetId);
  if (itemIndex === -1) return;

  const nextLocked = layout[itemIndex].static !== true;
  const nextItem = { ...layout[itemIndex] };

  if (nextLocked) {
    nextItem.static = true;
    nextItem.isDraggable = false;
    nextItem.isResizable = false;
  } else {
    delete nextItem.static;
    delete nextItem.isDraggable;
    delete nextItem.isResizable;
  }

  layout[itemIndex] = nextItem;
  localStorage.setItem(layoutKey, JSON.stringify(layout));

  // Reload once so React Grid Layout receives the new static property directly.
  // The saved x/y/w/h values are unchanged, so the widget stays exactly in place.
  window.location.reload();
}

function enhanceWidget(widget) {
  const widgetId = widget.dataset.widgetId;
  if (!widgetId) return;

  let button = widget.querySelector(':scope > .widget-lock');
  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.className = 'widget-lock';

    ['pointerdown', 'mousedown', 'touchstart'].forEach((eventName) => {
      button.addEventListener(eventName, (event) => event.stopPropagation(), { passive: eventName === 'touchstart' });
    });

    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleWidgetLock(widget);
    });

    widget.append(button);
  }

  widget.classList.toggle('timer-widget', Boolean(widget.querySelector('.timer-card')));
  updateLockButton(widget, button);
}

function enhanceAllWidgets() {
  enhancementScheduled = false;
  identifyWidgets();
  document.querySelectorAll('.dashboard-widget').forEach(enhanceWidget);
}

function scheduleEnhancement() {
  if (enhancementScheduled) return;
  enhancementScheduled = true;
  requestAnimationFrame(enhanceAllWidgets);
}

function startWidgetLocks() {
  scheduleEnhancement();

  const observer = new MutationObserver(scheduleEnhancement);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener('resize', scheduleEnhancement);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startWidgetLocks, { once: true });
} else {
  startWidgetLocks();
}
