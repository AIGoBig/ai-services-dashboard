/* ============================================================
   Overview — Tab logic
   ============================================================ */

async function loadOverview() {
  showSkeleton('overview', 'overview');
  const [overviewData, webviewData] = await Promise.all([
    Api.fetchOverview(),
    Api.fetchWebViews()
  ]);
  if (overviewData) {
    renderOverview(overviewData, webviewData);
    updateSidebarStatus(overviewData);
  }
  document.getElementById('lastRefreshOverview').textContent =
    '上次更新: ' + new Date().toLocaleTimeString('zh-CN');
}

function renderOverview(data, webviewData) {
  const container = document.getElementById('overview');
  if (!container) return;
  let html = '';

  html += `
    <div class="overview-strip">
      <div class="summary-card"><div class="summary-count count-total">${data.total}</div><div class="summary-label">总计</div></div>
      <div class="summary-card"><div class="summary-count count-online">${data.online}</div><div class="summary-label">在线</div></div>
      <div class="summary-card"><div class="summary-count count-offline">${data.offline}</div><div class="summary-label">离线</div></div>
      <div class="summary-card"><div class="summary-count count-issues">${data.unhealthy}</div><div class="summary-label">异常</div></div>
    </div>`;

  if (data.byCategory && Object.keys(data.byCategory).length > 0) {
    html += '<div class="category-grid">';
    for (const [catId, cat] of Object.entries(data.byCategory)) {
      const dots = Array(cat.total).fill(0).map((_, i) =>
        `<span class="cat-dot ${i < cat.online ? 'online' : ''}"></span>`
      ).join('');
      html += `
        <div class="category-card" onclick="filterServicesByCategory('${catId}')">
          <div class="category-label" style="color:${cat.color}">${escapeHtml(cat.label)}</div>
          <div class="category-dots">${dots}</div>
          <div class="cat-count">${cat.online}/${cat.total} 在线</div>
        </div>`;
    }
    html += '</div>';
  }

  if (data.issues && data.issues.length > 0) {
    html += '<div class="issues-section">';
    html += `<div class="issues-title">需要关注 (${data.issues.length})</div>`;
    for (const issue of data.issues) {
      const statusDot = issue.status === 'online' && !issue.healthy
        ? '<span class="health-dot fail"></span>' : '<span class="status-dot inactive"></span>';
      const issueText = issue.status !== 'online' ? statusText(issue.status) : '健康检测异常';
      html += `
        <div class="issue-row">
          <div style="display:flex;align-items:center;gap:8px">
            ${statusDot}
            <span style="font-weight:600">${escapeHtml(issue.name)}</span>
            ${catBadge(issue.category)}
            <span style="color:var(--color-status-offline);font-size:12px">${issueText}</span>
          </div>
          <button class="btn-primary" style="font-size:11px;padding:4px 12px" onclick="unifiedSvcAction('${issue.id}', 'restart')">重启</button>
        </div>`;
    }
    html += '</div>';
  }

  // Mini Webview panels
  if (webviewData) {
    const pages = collectWebviewPages(webviewData.services || [], webviewData.webviews || []);
    if (pages.length > 0) {
      html += '<div class="overview-webview-section">';
      html += '<div class="overview-webview-header"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg><span>页面看板</span><button class="btn-ghost" style="font-size:11px;padding:2px 10px;margin-left:auto" onclick="switchTab(\'webviews\')">查看全部</button></div>';
      html += '<div class="overview-webview-grid">';
      for (const p of pages) {
        const categories = Store.get('categories');
        const c = (categories && categories[p.category]) || {};
        const color = c.color || '#888';
        const label = c.label || p.category || '';
        const healthDot = p.healthy ? '<span class="health-dot ok"></span>' : '<span class="health-dot fail"></span>';
        html += `<div class="overview-webview-card" id="ov-wv-${p.id}">
          <div class="overview-webview-card-bar">
            ${healthDot}
            <span class="overview-webview-card-name">${escapeHtml(p.name)}</span>
            ${label ? `<span class="webview-category" style="background:${color}20;color:${color}">${escapeHtml(label)}</span>` : ''}
            <div style="flex:1"></div>
            <button class="btn-ghost" style="font-size:10px;padding:1px 6px;min-height:24px" onclick="window.open('${p.url}','_blank')">↗</button>
          </div>
          <div class="overview-webview-frame">
            ${p.healthy
              ? `<iframe src="${p.url}" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" loading="lazy"></iframe>`
              : `<div class="webview-offline" style="padding:16px"><div class="webview-offline-icon" style="font-size:20px">&#11044;</div><div class="webview-offline-text" style="font-size:11px">离线</div></div>`
            }
          </div>
        </div>`;
      }
      html += '</div></div>';
    }
  }

  container.innerHTML = html;
}

function filterServicesByCategory(catId) {
  Store.set('svcFilter', catId);
  switchTab('services');
}
