/* ============================================================
   Components — Safe DOM creation helpers + utility functions
   ============================================================ */

/**
 * Create a DOM element safely.
 * Usage: h('div', { className: 'foo', onclick: handler }, h('span', null, 'text'))
 */
function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'className') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else el.setAttribute(k, v);
    }
  }
  for (const child of (children.flat() || [])) {
    if (typeof child === 'string') el.appendChild(document.createTextNode(child));
    else if (child) el.appendChild(child);
  }
  return el;
}

/* ---- Utility functions ---- */

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatUptime(ms) {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return sec + 's';
  const min = Math.floor(sec / 60);
  if (min < 60) return min + 'm';
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr + 'h' + (min % 60) + 'm';
  const day = Math.floor(hr / 24);
  return day + 'd' + (hr % 24) + 'h';
}

function statusText(s) {
  const map = { success: '成功', failed: '失败', running: '执行中', online: '在线', stopped: '已停止', 'waiting restart': '等待重启' };
  return map[s] || s;
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '-';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1073741824).toFixed(2) + ' GB';
}

function catBadge(category) {
  const categories = Store.get('categories');
  const c = (categories && categories[category]) || {};
  const label = c.label || category;
  const color = c.color || '#888';
  return `<span class="svc-cat-badge" style="background:${color}20;color:${color}">${escapeHtml(label)}</span>`;
}

/* ---- Skeleton Loading ---- */

function showSkeleton(containerId, type) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const skeletons = {
    overview: `
      <div class="overview-strip">${Array(4).fill('<div class="summary-card"><div class="skeleton skeleton-card" style="height:60px"></div></div>').join('')}</div>
      <div class="category-grid" style="margin-top:16px">${Array(3).fill('<div class="skeleton skeleton-card" style="height:70px"></div>').join('')}</div>`,
    services: `
      ${Array(3).fill('<div class="skeleton skeleton-card" style="height:140px;margin-bottom:16px"></div>').join('')}`,
    tasks: `
      ${Array(2).fill('<div class="skeleton skeleton-card" style="height:180px;margin-bottom:20px"></div>').join('')}`,
    aicli: `
      <div class="skeleton skeleton-card" style="height:200px"></div>`,
    logs: `
      <div class="skeleton skeleton-card" style="height:300px"></div>`,
    webviews: `
      ${Array(2).fill('<div class="skeleton skeleton-card" style="height:300px"></div>').join('')}`
  };
  container.innerHTML = skeletons[type] || '<div class="skeleton skeleton-card" style="height:120px"></div>';
}
