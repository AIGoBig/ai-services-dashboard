/* ============================================================
   State — Centralized state store with pub/sub
   ============================================================ */
const Store = {
  _state: {
    currentTab: 'overview',
    services: [],
    categories: {},
    overview: null,
    tasks: [],
    aiCliData: null,
    dashLogs: [],
    loading: {},
    errors: {},
    sidebarCollapsed: false,
    svcFilter: '',
    openLogs: {},
    openDetails: {},
  },
  _listeners: {},

  get(key) {
    return this._state[key];
  },

  set(key, value) {
    const old = this._state[key];
    this._state[key] = value;
    this._emit(key, value, old);
  },

  on(key, fn) {
    if (!this._listeners[key]) this._listeners[key] = [];
    this._listeners[key].push(fn);
  },

  off(key, fn) {
    if (!this._listeners[key]) return;
    this._listeners[key] = this._listeners[key].filter(f => f !== fn);
  },

  _emit(key, value, old) {
    (this._listeners[key] || []).forEach(fn => fn(value, old));
  }
};
