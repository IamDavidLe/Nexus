const storageKey = 'nexus-settings';
const form = document.querySelector('[data-settings-form]');
const status = document.querySelector('[data-save-status]');

const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');

Object.entries(saved.fields || {}).forEach(([name, value]) => {
  const field = form.elements.namedItem(name);
  if (field) field.value = value;
});

document.querySelectorAll('[data-setting]').forEach((toggle) => {
  const value = saved.toggles?.[toggle.dataset.setting];
  if (typeof value === 'boolean') toggle.setAttribute('aria-pressed', String(value));

  toggle.addEventListener('click', () => {
    toggle.setAttribute('aria-pressed', String(toggle.getAttribute('aria-pressed') !== 'true'));
    status.textContent = 'Unsaved changes';
  });
});

form.addEventListener('input', () => { status.textContent = 'Unsaved changes'; });
form.addEventListener('submit', (event) => {
  event.preventDefault();
  const fields = Object.fromEntries(new FormData(form));
  const toggles = Object.fromEntries([...document.querySelectorAll('[data-setting]')].map((toggle) => [toggle.dataset.setting, toggle.getAttribute('aria-pressed') === 'true']));
  localStorage.setItem(storageKey, JSON.stringify({ fields, toggles }));
  status.textContent = 'Changes saved on this device';
});

/* ---------- Mobile rail ---------- */
{
  const rail = document.querySelector('[data-rail]');
  const railToggle = document.querySelector('[data-rail-toggle]');
  const scrim = document.querySelector('.rail__scrim');
  const closeControls = document.querySelectorAll('[data-rail-close]');
  const setRail = (open) => {
    if (!rail) return;
    rail.classList.toggle('is-open', open);
    railToggle?.setAttribute('aria-expanded', String(open));
    railToggle?.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
    scrim?.classList.toggle('is-visible', open);
  };

  railToggle?.addEventListener('click', (event) => {
    event.preventDefault();
    setRail(!rail?.classList.contains('is-open'));
  });
  closeControls.forEach((control) => control.addEventListener('click', () => setRail(false)));
  document.querySelectorAll('.rail__scroll .nav-item').forEach((link) =>
    link.addEventListener('click', () => setRail(false))
  );
  addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && rail?.classList.contains('is-open')) setRail(false);
  });
}
