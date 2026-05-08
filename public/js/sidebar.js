/* ============================================================
   Sidebar — Navigation logic
   ============================================================ */

function switchTab(tab) {
  Store.set('currentTab', tab);

  // Update sidebar nav items
  document.querySelectorAll('.nav-item').forEach(n => {
    const isActive = n.dataset.tab === tab;
    n.classList.toggle('active', isActive);
    n.setAttribute('aria-selected', isActive);
  });

  // Update tab content
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  const tabEl = document.getElementById('tab-' + tab);
  if (tabEl) tabEl.classList.add('active');

  // Load data
  if (tab === 'overview') loadOverview();
  if (tab === 'services') loadUnifiedServices();
  if (tab === 'tasks') loadTasks();
  if (tab === 'aicli') loadAiCli();
  if (tab === 'logs') loadDashLogs();
  if (tab === 'webviews') loadWebViews();

  // Close mobile sidebar if open
  closeMobileSidebar();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('collapsed');
  const isCollapsed = document.getElementById('sidebar').classList.contains('collapsed');
  Store.set('sidebarCollapsed', isCollapsed);
  localStorage.setItem('sidebar-collapsed', isCollapsed);
}

function toggleMobileSidebar() {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  const isOpen = sidebar.classList.contains('mobile-open');
  if (isOpen) {
    closeMobileSidebar();
  } else {
    sidebar.classList.add('mobile-open');
    backdrop.style.display = 'block';
    requestAnimationFrame(() => backdrop.classList.add('visible'));
  }
}

function closeMobileSidebar() {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  sidebar.classList.remove('mobile-open');
  backdrop.classList.remove('visible');
  setTimeout(() => { backdrop.style.display = 'none'; }, 200);
}

// Update sidebar status strip
function updateSidebarStatus(data) {
  const textEl = document.getElementById('sidebarStatusText');
  const issueDot = document.getElementById('sidebarIssueDot');
  const issueText = document.getElementById('sidebarIssueText');
  if (textEl) textEl.textContent = `${data.online}/${data.total} 在线`;
  if (issueDot && issueText) {
    if (data.unhealthy > 0) {
      issueDot.style.display = '';
      issueText.style.display = '';
      issueText.textContent = `${data.unhealthy} 异常`;
    } else {
      issueDot.style.display = 'none';
      issueText.style.display = 'none';
    }
  }
}

// Restore sidebar state from localStorage
(function restoreSidebar() {
  const saved = localStorage.getItem('sidebar-collapsed');
  if (saved === 'true') {
    document.getElementById('sidebar').classList.add('collapsed');
    Store.set('sidebarCollapsed', true);
  }
})();

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
  // Ctrl+1-6: switch tabs
  if (e.ctrlKey && !e.altKey && !e.shiftKey) {
    const tabs = ['overview', 'services', 'tasks', 'aicli', 'logs', 'webviews'];
    const num = e.key - 1;
    if (num >= 0 && num < tabs.length) { e.preventDefault(); switchTab(tabs[num]); }
    if (e.key === 'b') { e.preventDefault(); toggleSidebar(); }
  }
  // Escape: close mobile sidebar
  if (e.key === 'Escape') closeMobileSidebar();
  // Arrow keys in sidebar
  if (e.target.classList.contains('nav-item') && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    e.preventDefault();
    const items = Array.from(document.querySelectorAll('.nav-item'));
    const idx = items.indexOf(e.target);
    const next = e.key === 'ArrowDown' ? Math.min(idx + 1, items.length - 1) : Math.max(idx - 1, 0);
    items[next].focus();
  }
  // Enter/Space on nav item
  if (e.target.classList.contains('nav-item') && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    e.target.click();
  }
});
