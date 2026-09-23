/* ==========================================================================
   안심ON — State
   One object, persisted to localStorage, with a change subscription.
   Storage can be unavailable (private windows, blocked site data), so every
   access is guarded and the app falls back to memory-only state.
   ========================================================================== */

window.App = window.App || {};

App.store = (function () {
  var KEY = "ansim-on:v1";
  var state = {};
  var listeners = [];
  var persistOk = true;

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      state = raw ? JSON.parse(raw) : {};
    } catch (e) {
      persistOk = false;
      state = {};
    }
  }

  function persist() {
    if (!persistOk) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      persistOk = false;
    }
  }

  function emit() {
    listeners.forEach(function (fn) { fn(state); });
  }

  /** Install a default only if this key has never been written. */
  function seed(key, value) {
    if (!(key in state)) {
      state[key] = value;
      persist();
    }
    return state[key];
  }

  function get(key, fallback) {
    return key in state ? state[key] : fallback;
  }

  function set(key, value) {
    state[key] = value;
    persist();
    emit();
    return value;
  }

  /** Read-modify-write. Return a value, or mutate in place and return nothing. */
  function update(key, fn) {
    var next = fn(state[key]);
    return set(key, next === undefined ? state[key] : next);
  }

  function subscribe(fn) {
    listeners.push(fn);
    return function () {
      listeners = listeners.filter(function (l) { return l !== fn; });
    };
  }

  /** Drop everything and re-seed from the view modules. */
  function reset() {
    state = {};
    try { localStorage.removeItem(KEY); } catch (e) { /* nothing to clear */ }
    location.reload();
  }

  load();

  return {
    seed: seed, get: get, set: set, update: update,
    subscribe: subscribe, reset: reset,
    get persistent() { return persistOk; }
  };
})();
