// =========================================================
// 3. МОНТИРУЕМ ИКОНКУ ТЕМЫ В ШАПКУ ШТОРКИ
//    (справа от «КУТ: БИЗНЕС», без текста)
// =========================================================
function mountSidebarThemeToggle() {
  const themeApi = window.KUT_THEME;
  if (!themeApi || typeof themeApi.toggle !== 'function') return;

  const slot = document.getElementById('sidebar-theme-slot');
  if (!slot) return;
  if (slot.querySelector('.sidebar-theme')) return; // уже смонтирована

  const isLight = themeApi.get() === 'light';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'sidebar-theme';
  btn.setAttribute('aria-label', isLight ? 'Включить тёмную тему' : 'Включить светлую тему');
  btn.setAttribute('title',       isLight ? 'Тёмная тема'         : 'Светлая тема');
  btn.textContent = isLight ? '☀️' : '🌙';

  btn.addEventListener('click', () => {
    themeApi.toggle();
    const nowLight = themeApi.get() === 'light';
    btn.textContent = nowLight ? '☀️' : '🌙';
    btn.setAttribute('aria-label', nowLight ? 'Включить тёмную тему' : 'Включить светлую тему');
    btn.setAttribute('title',       nowLight ? 'Тёмная тема'         : 'Светлая тема');
  });

  slot.appendChild(btn);
}
