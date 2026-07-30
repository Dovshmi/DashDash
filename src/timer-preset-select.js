const selector = '.timer-preset-select';
const PELE_URL = 'https://b-pele.bezeq.com/local/dashboardplus/view.php';
const enhancedSelects = new WeakMap();
let enhancementScheduled = false;

function isMobileView() {
  return window.matchMedia('(max-width: 700px)').matches;
}

function optionLabel(option) {
  return (option.textContent ?? '').split('·', 1)[0].trim();
}

function blockDashboardDrag(event) {
  event.stopPropagation();
}

function closeAllPresetMenus(except = null) {
  document.querySelectorAll('.timer-preset-menu').forEach((menu) => {
    if (menu === except) return;
    menu.hidden = true;
    menu.previousElementSibling?.setAttribute('aria-expanded', 'false');
  });
}

function placePresetControl(select, control) {
  const heading = select.closest('.card-heading');
  if (!heading) return;

  const mobile = isMobileView();
  heading.classList.toggle('timer-mobile-preset-title', mobile);

  if (mobile) {
    const titleSlot = heading.querySelector(':scope > div:first-child');
    if (titleSlot && control.parentElement !== titleSlot) titleSlot.append(control);
    return;
  }

  if (select.nextElementSibling !== control) select.insertAdjacentElement('afterend', control);
}

function updateTopActionButton() {
  const button = document.querySelector('.bsmart');
  if (!button) return;
  button.textContent = isMobileView() ? 'הפלא ↗' : 'BSMART ↗';
  button.setAttribute('aria-label', isMobileView() ? 'פתח את הפלא' : 'פתח את BSMART');
}

function enhancePresetSelect(select) {
  select.querySelectorAll('option').forEach((option) => {
    const label = optionLabel(option);
    if (option.textContent !== label) option.textContent = label;
  });

  let elements = enhancedSelects.get(select);
  if (!elements?.control?.isConnected) {
    const control = document.createElement('div');
    control.className = 'timer-preset-control';

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'timer-preset-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-label', 'בחירת סוג הזמן');

    const menu = document.createElement('div');
    menu.className = 'timer-preset-menu';
    menu.setAttribute('role', 'listbox');
    menu.hidden = true;

    control.addEventListener('pointerdown', blockDashboardDrag);
    control.addEventListener('mousedown', blockDashboardDrag);
    control.addEventListener('touchstart', blockDashboardDrag, { passive: true });

    trigger.addEventListener('click', (event) => {
      event.stopPropagation();
      if (select.disabled) return;
      const willOpen = menu.hidden;
      closeAllPresetMenus(willOpen ? menu : null);
      menu.hidden = !willOpen;
      trigger.setAttribute('aria-expanded', String(willOpen));
    });

    control.append(trigger, menu);
    select.insertAdjacentElement('afterend', control);
    select.addEventListener('change', () => scheduleEnhancement());
    elements = { control, trigger, menu, signature: '' };
    enhancedSelects.set(select, elements);
  }

  const { control, trigger, menu } = elements;
  placePresetControl(select, control);

  const selectedOption = select.options[select.selectedIndex] ?? select.options[0];
  trigger.textContent = selectedOption ? optionLabel(selectedOption) : 'בחר זמן';
  trigger.disabled = select.disabled;
  control.classList.toggle('running', select.disabled || select.classList.contains('running'));

  const signature = [...select.options]
    .map((option) => `${option.value}:${optionLabel(option)}:${option.selected}`)
    .join('|');

  if (signature === elements.signature) return;
  elements.signature = signature;
  menu.replaceChildren();

  [...select.options].forEach((option) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'timer-preset-option';
    item.textContent = optionLabel(option);
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', String(option.value === select.value));

    item.addEventListener('click', (event) => {
      event.stopPropagation();
      if (select.disabled) return;
      select.value = option.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      trigger.textContent = optionLabel(option);
      menu.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      scheduleEnhancement();
    });

    menu.append(item);
  });
}

function enhanceAllPresetSelects() {
  enhancementScheduled = false;
  document.querySelectorAll(selector).forEach(enhancePresetSelect);
  updateTopActionButton();
}

function scheduleEnhancement() {
  if (enhancementScheduled) return;
  enhancementScheduled = true;
  requestAnimationFrame(enhanceAllPresetSelects);
}

function startPresetSelectEnhancement() {
  scheduleEnhancement();

  const observer = new MutationObserver(scheduleEnhancement);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'disabled', 'value'],
  });

  document.addEventListener('click', (event) => {
    const topAction = event.target.closest?.('.bsmart');
    if (topAction && isMobileView()) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      window.open(PELE_URL, '_blank', 'noopener,noreferrer');
      return;
    }
    closeAllPresetMenus();
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeAllPresetMenus();
  });

  window.addEventListener('resize', scheduleEnhancement);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startPresetSelectEnhancement, { once: true });
} else {
  startPresetSelectEnhancement();
}
