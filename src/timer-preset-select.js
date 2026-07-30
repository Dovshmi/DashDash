const selector = '.timer-preset-select';

function simplifyPresetLabels(root = document) {
  root.querySelectorAll(selector).forEach((select) => {
    select.querySelectorAll('option').forEach((option) => {
      const label = option.textContent ?? '';
      if (!label.includes('·')) return;
      option.textContent = label.split('·', 1)[0].trim();
    });
  });
}

function startPresetSelectEnhancement() {
  simplifyPresetLabels();

  const observer = new MutationObserver(() => simplifyPresetLabels());
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startPresetSelectEnhancement, { once: true });
} else {
  startPresetSelectEnhancement();
}
