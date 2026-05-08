/* ============================================================
   Search — Ctrl+K Command Palette with fuzzy search
   ============================================================ */

(function () {
  'use strict';

  /* ── Static tab definitions ──────────────────────────────── */
  var TABS = [
    { id: 'overview', label: '总览' },
    { id: 'services', label: '服务' },
    { id: 'tasks', label: '定时任务' },
    { id: 'aicli', label: 'AI CLI' },
    { id: 'logs', label: '日志' },
    { id: 'webviews', label: '页面看板' }
  ];

  var RESULT_TYPES = {
    tab: 'tab',
    service: 'service',
    task: 'task'
  };

  /* ── Inject CSS ──────────────────────────────────────────── */
  var styleEl = document.createElement('style');
  styleEl.textContent = [
    '/* Command Palette */',
    '.cmd-palette-overlay {',
    '  position: fixed;',
    '  inset: 0;',
    '  z-index: var(--z-modal);',
    '  display: flex;',
    '  align-items: flex-start;',
    '  justify-content: center;',
    '  padding-top: 18vh;',
    '  background: rgba(0,0,0,0.55);',
    '  backdrop-filter: blur(6px);',
    '  -webkit-backdrop-filter: blur(6px);',
    '  animation: cmdPaletteFadeIn var(--duration-fast) var(--ease-out);',
    '}',
    '',
    '@keyframes cmdPaletteFadeIn {',
    '  from { opacity: 0; }',
    '  to   { opacity: 1; }',
    '}',
    '',
    '@keyframes cmdPaletteSlideIn {',
    '  from { opacity: 0; transform: translateY(-12px) scale(0.98); }',
    '  to   { opacity: 1; transform: translateY(0) scale(1); }',
    '}',
    '',
    '.cmd-palette {',
    '  width: 520px;',
    '  max-width: 92vw;',
    '  max-height: 60vh;',
    '  display: flex;',
    '  flex-direction: column;',
    '  background: var(--color-bg-secondary);',
    '  border: 1px solid var(--color-border-hover);',
    '  border-radius: var(--radius-lg);',
    '  box-shadow: var(--shadow-xl), 0 0 0 1px rgba(255,255,255,0.03);',
    '  animation: cmdPaletteSlideIn var(--duration-normal) var(--ease-out);',
    '  overflow: hidden;',
    '}',
    '',
    '.cmd-palette-input-wrap {',
    '  display: flex;',
    '  align-items: center;',
    '  gap: var(--space-sm);',
    '  padding: var(--space-md) var(--space-lg);',
    '  border-bottom: 1px solid var(--color-border-subtle);',
    '}',
    '',
    '.cmd-palette-input-wrap svg {',
    '  flex-shrink: 0;',
    '  width: 18px;',
    '  height: 18px;',
    '  color: var(--color-text-muted);',
    '}',
    '',
    '.cmd-palette-input {',
    '  flex: 1;',
    '  background: none;',
    '  border: none;',
    '  outline: none;',
    '  color: var(--color-text-primary);',
    '  font-family: var(--font-sans);',
    '  font-size: var(--text-md);',
    '  caret-color: var(--color-status-online);',
    '}',
    '',
    '.cmd-palette-input::placeholder {',
    '  color: var(--color-text-faint);',
    '}',
    '',
    '.cmd-palette-hint {',
    '  flex-shrink: 0;',
    '  font-size: var(--text-xs);',
    '  color: var(--color-text-ghost);',
    '  background: var(--color-bg-tertiary);',
    '  border: 1px solid var(--color-border-subtle);',
    '  border-radius: var(--radius-xs);',
    '  padding: 2px 6px;',
    '  line-height: 1.4;',
    '  font-family: var(--font-mono);',
    '}',
    '',
    '.cmd-palette-results {',
    '  overflow-y: auto;',
    '  padding: var(--space-xs) 0;',
    '  flex: 1;',
    '}',
    '',
    '.cmd-palette-results::-webkit-scrollbar {',
    '  width: 4px;',
    '}',
    '',
    '.cmd-palette-results::-webkit-scrollbar-thumb {',
    '  background: var(--color-border-default);',
    '  border-radius: var(--radius-full);',
    '}',
    '',
    '.cmd-palette-group-label {',
    '  padding: var(--space-sm) var(--space-lg) var(--space-xs);',
    '  font-size: var(--text-xs);',
    '  font-weight: var(--weight-semibold);',
    '  color: var(--color-text-faint);',
    '  text-transform: uppercase;',
    '  letter-spacing: 0.5px;',
    '}',
    '',
    '.cmd-palette-item {',
    '  display: flex;',
    '  align-items: center;',
    '  gap: var(--space-sm);',
    '  padding: var(--space-sm) var(--space-lg);',
    '  cursor: pointer;',
    '  transition: background var(--duration-instant) var(--ease-default);',
    '}',
    '',
    '.cmd-palette-item:hover,',
    '.cmd-palette-item.active {',
    '  background: var(--color-bg-hover);',
    '}',
    '',
    '.cmd-palette-item-icon {',
    '  flex-shrink: 0;',
    '  width: 28px;',
    '  height: 28px;',
    '  display: flex;',
    '  align-items: center;',
    '  justify-content: center;',
    '  border-radius: var(--radius-sm);',
    '  font-size: var(--text-sm);',
    '}',
    '',
    '.cmd-palette-item-icon.type-tab {',
    '  background: var(--color-surface-info);',
    '  color: var(--color-status-info);',
    '}',
    '',
    '.cmd-palette-item-icon.type-service {',
    '  background: var(--color-surface-online);',
    '  color: var(--color-status-online);',
    '}',
    '',
    '.cmd-palette-item-icon.type-task {',
    '  background: var(--color-surface-purple);',
    '  color: var(--color-status-purple);',
    '}',
    '',
    '.cmd-palette-item-body {',
    '  flex: 1;',
    '  min-width: 0;',
    '}',
    '',
    '.cmd-palette-item-name {',
    '  font-size: var(--text-base);',
    '  color: var(--color-text-primary);',
    '  white-space: nowrap;',
    '  overflow: hidden;',
    '  text-overflow: ellipsis;',
    '}',
    '',
    '.cmd-palette-item-name mark {',
    '  background: none;',
    '  color: var(--color-status-online);',
    '  font-weight: var(--weight-semibold);',
    '}',
    '',
    '.cmd-palette-item-sub {',
    '  font-size: var(--text-xs);',
    '  color: var(--color-text-muted);',
    '  white-space: nowrap;',
    '  overflow: hidden;',
    '  text-overflow: ellipsis;',
    '}',
    '',
    '.cmd-palette-item-badge {',
    '  flex-shrink: 0;',
    '  font-size: var(--text-xs);',
    '  padding: 2px 7px;',
    '  border-radius: var(--radius-full);',
    '  border: 1px solid var(--color-border-subtle);',
    '  color: var(--color-text-muted);',
    '  background: var(--color-bg-tertiary);',
    '}',
    '',
    '.cmd-palette-empty {',
    '  padding: var(--space-xl) var(--space-lg);',
    '  text-align: center;',
    '  color: var(--color-text-muted);',
    '  font-size: var(--text-base);',
    '}',
    '',
    '.cmd-palette-empty svg {',
    '  width: 32px;',
    '  height: 32px;',
    '  margin-bottom: var(--space-sm);',
    '  color: var(--color-text-faint);',
    '}',
    '',
    '/* End command palette CSS */'
  ].join('\n');
  document.head.appendChild(styleEl);

  /* ── DOM refs ────────────────────────────────────────────── */
  var overlay = null;
  var inputEl = null;
  var resultsEl = null;
  var activeIndex = -1;
  var currentResults = [];

  /* ── Build palette DOM ───────────────────────────────────── */
  function buildPalette() {
    overlay = document.createElement('div');
    overlay.className = 'cmd-palette-overlay';
    overlay.style.display = 'none';

    overlay.innerHTML =
      '<div class="cmd-palette">' +
        '<div class="cmd-palette-input-wrap">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
          '<input class="cmd-palette-input" type="text" placeholder="搜索服务、任务、页面…" autocomplete="off" spellcheck="false">' +
          '<span class="cmd-palette-hint">ESC</span>' +
        '</div>' +
        '<div class="cmd-palette-results"></div>' +
      '</div>';

    inputEl = overlay.querySelector('.cmd-palette-input');
    resultsEl = overlay.querySelector('.cmd-palette-results');

    document.body.appendChild(overlay);

    /* Events */
    overlay.addEventListener('mousedown', function (e) {
      if (e.target === overlay) closePalette();
    });

    inputEl.addEventListener('input', function () {
      renderResults(inputEl.value);
    });

    inputEl.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closePalette();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        moveActive(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        moveActive(-1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        selectActive();
      }
    });
  }

  /* ── Open / Close ────────────────────────────────────────── */
  function openPalette() {
    if (!overlay) buildPalette();
    overlay.style.display = '';
    inputEl.value = '';
    activeIndex = -1;
    currentResults = [];
    renderResults('');
    requestAnimationFrame(function () { inputEl.focus(); });
  }

  function closePalette() {
    if (!overlay) return;
    overlay.style.display = 'none';
    inputEl.value = '';
  }

  function isOpen() {
    return overlay && overlay.style.display !== 'none';
  }

  /* ── Data gathering ──────────────────────────────────────── */
  function gatherItems() {
    var items = [];

    /* Tabs */
    TABS.forEach(function (tab) {
      items.push({
        type: RESULT_TYPES.tab,
        id: tab.id,
        name: tab.label,
        sub: '切换页面',
        action: function () { switchTab(tab.id); }
      });
    });

    /* Services */
    var services = Store.get('services') || [];
    services.forEach(function (s) {
      items.push({
        type: RESULT_TYPES.service,
        id: s.id,
        name: s.name || s.id,
        sub: s.category ? (s.category + (s.status ? ' · ' + statusText(s.status) : '')) : (s.status ? statusText(s.status) : ''),
        action: function () {
          if (s.category) {
            Store.set('svcFilter', s.category);
          } else {
            Store.set('svcFilter', '');
          }
          switchTab('services');
        }
      });
    });

    /* Tasks */
    var tasks = Store.get('tasks') || [];
    tasks.forEach(function (t) {
      items.push({
        type: RESULT_TYPES.task,
        id: t.id,
        name: t.name || t.id,
        sub: t.schedule ? t.schedule : (t.enabled ? '运行中' : '已暂停'),
        action: function () { switchTab('tasks'); }
      });
    });

    return items;
  }

  /* ── Fuzzy search ────────────────────────────────────────── */
  function fuzzyMatch(query, text) {
    if (!query) return true;
    var q = query.toLowerCase();
    var t = text.toLowerCase();
    return t.indexOf(q) !== -1;
  }

  function highlightMatch(text, query) {
    if (!query) return escapeHtml(text);
    var q = query.toLowerCase();
    var t = text.toLowerCase();
    var idx = t.indexOf(q);
    if (idx === -1) return escapeHtml(text);
    var before = text.slice(0, idx);
    var match = text.slice(idx, idx + query.length);
    var after = text.slice(idx + query.length);
    return escapeHtml(before) + '<mark>' + escapeHtml(match) + '</mark>' + escapeHtml(after);
  }

  function searchItems(query) {
    var items = gatherItems();
    if (!query) return items;

    var q = query.toLowerCase();
    var scored = [];

    items.forEach(function (item) {
      var nameLower = item.name.toLowerCase();
      var subLower = (item.sub || '').toLowerCase();
      var nameIdx = nameLower.indexOf(q);
      var subIdx = subLower.indexOf(q);

      if (nameIdx !== -1 || subIdx !== -1) {
        var score = 0;
        if (nameIdx === 0) score += 100;        // name starts with query
        else if (nameIdx > 0) score += 50;       // name contains query
        if (subIdx === 0) score += 20;            // sub starts with query
        else if (subIdx > 0) score += 10;         // sub contains query
        if (item.type === RESULT_TYPES.tab) score += 5; // slight boost for tabs when exact
        scored.push({ item: item, score: score });
      }
    });

    scored.sort(function (a, b) { return b.score - a.score; });
    return scored.map(function (s) { return s.item; });
  }

  /* ── Render ──────────────────────────────────────────────── */
  var TYPE_LABELS = {
    tab: '页面',
    service: '服务',
    task: '任务'
  };

  var TYPE_ICONS = {
    tab: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>',
    service: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><circle cx="6" cy="6" r="1"/><circle cx="6" cy="18" r="1"/></svg>',
    task: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>'
  };

  function renderResults(query) {
    var results = searchItems(query);
    currentResults = results;
    activeIndex = -1;

    if (results.length === 0) {
      resultsEl.innerHTML =
        '<div class="cmd-palette-empty">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
          '<div>未找到匹配项</div>' +
        '</div>';
      return;
    }

    /* Group results by type */
    var groups = {};
    var groupOrder = [RESULT_TYPES.tab, RESULT_TYPES.service, RESULT_TYPES.task];
    results.forEach(function (r) {
      if (!groups[r.type]) groups[r.type] = [];
      groups[r.type].push(r);
    });

    var html = '';
    groupOrder.forEach(function (type) {
      var items = groups[type];
      if (!items || items.length === 0) return;
      html += '<div class="cmd-palette-group-label">' + TYPE_LABELS[type] + '</div>';
      items.forEach(function (item) {
        html +=
          '<div class="cmd-palette-item" data-type="' + item.type + '" data-id="' + escapeHtml(item.id) + '">' +
            '<div class="cmd-palette-item-icon type-' + item.type + '">' + TYPE_ICONS[item.type] + '</div>' +
            '<div class="cmd-palette-item-body">' +
              '<div class="cmd-palette-item-name">' + highlightMatch(item.name, query) + '</div>' +
              (item.sub ? '<div class="cmd-palette-item-sub">' + escapeHtml(item.sub) + '</div>' : '') +
            '</div>' +
            '<span class="cmd-palette-item-badge">' + TYPE_LABELS[item.type] + '</span>' +
          '</div>';
      });
    });

    resultsEl.innerHTML = html;

    /* Bind click on items */
    var itemEls = resultsEl.querySelectorAll('.cmd-palette-item');
    itemEls.forEach(function (el, idx) {
      el.addEventListener('mouseenter', function () {
        setActive(idx);
      });
      el.addEventListener('click', function () {
        selectItem(idx);
      });
    });
  }

  /* ── Keyboard navigation ─────────────────────────────────── */
  function setActive(idx) {
    var items = resultsEl.querySelectorAll('.cmd-palette-item');
    items.forEach(function (el) { el.classList.remove('active'); });
    activeIndex = idx;
    if (idx >= 0 && idx < items.length) {
      items[idx].classList.add('active');
      items[idx].scrollIntoView({ block: 'nearest' });
    }
  }

  function moveActive(dir) {
    var items = resultsEl.querySelectorAll('.cmd-palette-item');
    if (items.length === 0) return;
    var next = activeIndex + dir;
    if (next < 0) next = items.length - 1;
    if (next >= items.length) next = 0;
    setActive(next);
  }

  function selectActive() {
    if (activeIndex >= 0 && activeIndex < currentResults.length) {
      selectItem(activeIndex);
    }
  }

  function selectItem(idx) {
    if (idx < 0 || idx >= currentResults.length) return;
    var item = currentResults[idx];
    closePalette();
    if (item.action) item.action();
  }

  /* ── Global keyboard shortcut ────────────────────────────── */
  document.addEventListener('keydown', function (e) {
    // Ctrl+K or Cmd+K to open
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      if (isOpen()) {
        closePalette();
      } else {
        openPalette();
      }
    }
    // Escape to close
    if (e.key === 'Escape' && isOpen()) {
      e.preventDefault();
      closePalette();
    }
  });

})();
