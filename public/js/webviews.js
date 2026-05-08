/* ============================================================
   WebViews — Page dashboard tab
   ============================================================ */

function collectWebviewPages(services, webviews) {
  const pages = [];
  for (const svc of services) {
    if (svc.webview && svc.webview.url) {
      pages.push({ id: svc.id, name: svc.name, url: svc.webview.url, category: svc.category, healthy: svc.webviewHealthy, svcStatus: svc.status, svcManager: svc.manager, port: svc.port, description: svc.description });
    }
  }
  const coveredIds = new Set(pages.map(p => p.id));
  for (const wv of webviews) {
    if (!coveredIds.has(wv.id)) {
      pages.push({ id: wv.id, name: wv.name, url: wv.url, category: wv.category, healthy: wv.healthy, port: wv.port, description: wv.description });
    }
  }
  return pages;
}

async function loadWebViews() {
  showSkeleton('webviews', 'webviews');
  const data = await Api.fetchWebViews();
  if (data) {
    renderWebViews(data.services, data.webviews);
  }
  document.getElementById('lastRefreshWebViews').textContent =
    '上次更新: ' + new Date().toLocaleTimeString('zh-CN');
}

function renderWebViews(services, webviews) {
  const container = document.getElementById('webviews');
  const categories = Store.get('categories');
  const pages = collectWebviewPages(services, webviews);

  if (pages.length === 0) {
    container.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg><div class="empty-state-title">暂无页面看板</div><div class="empty-state-desc">在 services.json 中配置 webview 字段</div></div>';
    return;
  }

  container.innerHTML = pages.map(p => {
    const c = (categories && categories[p.category]) || {};
    const color = c.color || '#888';
    const label = c.label || p.category || '';
    const healthDot = p.healthy ? '<span class="health-dot ok"></span>' : '<span class="health-dot fail"></span>';
    const healthText = p.healthy ? '在线' : '离线';
    const svcBar = p.svcStatus
      ? `<div class="webview-svc-bar">
           ${healthDot}
           <span style="color:${p.svcStatus === 'online' ? 'var(--color-status-online)' : 'var(--color-status-offline)'}">${statusText(p.svcStatus)}</span>
           <span style="color:var(--color-text-muted)">·</span>
           <span style="color:var(--color-text-secondary)">${p.svcManager === 'pm2' ? 'PM2' : 'LaunchAgent'}</span>
           <div style="flex:1"></div>
           <button class="btn-primary" style="font-size:10px;padding:2px 10px" onclick="unifiedSvcAction('${p.id}','restart')">重启服务</button>
         </div>`
      : '';

    return `
      <div class="webview-card" id="wv-card-${p.id}">
        <div class="webview-card-header">
          <div class="webview-card-title">
            ${escapeHtml(p.name)}
            ${label ? `<span class="webview-category" style="background:${color}20;color:${color}">${escapeHtml(label)}</span>` : ''}
            <span class="health-indicator">${healthDot}${healthText}</span>
          </div>
          <div class="webview-card-actions">
            <button class="btn-ghost" style="font-size:11px;padding:4px 10px" onclick="toggleWebviewExpand('${p.id}')">展开</button>
            <button class="btn-ghost" style="font-size:11px;padding:4px 10px" onclick="window.open('${p.url}','_blank')">新窗口</button>
          </div>
        </div>
        ${svcBar}
        <div class="webview-frame-wrap">
          ${p.healthy
            ? `<iframe src="${p.url}" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" loading="lazy"></iframe>`
            : `<div class="webview-offline"><div class="webview-offline-icon">&#11044;</div><div class="webview-offline-text">服务离线 · ${p.url}</div><button class="btn-secondary" style="margin-top:4px;font-size:11px;padding:4px 12px" onclick="loadWebViews()">重试</button></div>`
          }
        </div>
        ${p.description ? `<div class="webview-desc">${escapeHtml(p.description)}</div>` : ''}
      </div>`;
  }).join('');
}

function toggleWebviewExpand(id) {
  const card = document.getElementById('wv-card-' + id);
  if (!card) return;
  card.classList.toggle('expanded');
  const btn = card.querySelector('.webview-card-actions .btn-ghost');
  if (btn) btn.textContent = card.classList.contains('expanded') ? '收起' : '展开';
}
