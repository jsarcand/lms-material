/**
 * Lyrion Minim — bridge script for the Tauri shell.
 * Loaded via: &js=msk--minim  →  /material/customjs/msk--minim
 *
 * Keep this file tiny and exception-safe. It must never throw or block Material.
 */
(function () {
  'use strict';

  var SETTINGS_HREF = 'minim-app-settings';

  function post(type, payload) {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(
          Object.assign({ source: 'lyrion-minim', type: type }, payload || {}),
          '*'
        );
      }
    } catch (e) {
      /* ignore cross-origin / missing parent */
    }
  }

  function openAppSettingsInMaterial() {
    try {
      if (typeof bus !== 'undefined' && bus && bus.$emit) {
        bus.$emit('dlg.open', 'appsettings');
        return true;
      }
    } catch (e) {}
    post('open-settings');
    return false;
  }

  function ensureAppSettings() {
    try {
      if (typeof queryParams === 'undefined') return false;
      if (!queryParams.appSettings) {
        queryParams.appSettings = SETTINGS_HREF;
      }
      return true;
    } catch (e) {
      return true;
    }
  }

  document.addEventListener(
    'click',
    function (ev) {
      try {
        var el = ev.target;
        if (!el || !el.closest) return;
        var link = el.closest(
          'a[href="' + SETTINGS_HREF + '"], a[href*="minim-app-settings"]'
        );
        var tile = el.closest('.nd-footer-settings a, .nd-footer-settings .v-list-tile');
        var href = tile && tile.getAttribute ? tile.getAttribute('href') || '' : '';
        if (
          link ||
          (tile && href && href.indexOf('minim-app-settings') >= 0) ||
          (tile && href === SETTINGS_HREF)
        ) {
          ev.preventDefault();
          ev.stopPropagation();
          openAppSettingsInMaterial();
        }
      } catch (e) {
        /* never break Material click handling */
      }
    },
    true
  );

  window.addEventListener('message', function (ev) {
    try {
      var d = ev && ev.data;
      if (!d || d.source !== 'lyrion-app') return;
      if (d.type === 'open-app-settings') {
        openAppSettingsInMaterial();
      } else if (d.type === 'open-server-settings') {
        try {
          if (typeof openServerSettings === 'function') {
            openServerSettings(undefined, 0);
          } else if (typeof bus !== 'undefined' && bus && bus.$emit) {
            bus.$emit('dlg.open', 'serversettings');
          }
        } catch (e2) {}
      } else if (d.type === 'open-ui-settings') {
        try {
          if (typeof bus !== 'undefined' && bus && bus.$emit) {
            bus.$emit('dlg.open', 'uisettings');
          }
        } catch (e2) {}
      } else if (d.type === 'reorder-players') {
        try {
          var ids = d.ids || [];
          var map = {};
          for (var i = 0; i < ids.length; i++) map[ids[i]] = i;
          if (typeof lmsOptions !== 'undefined') {
            lmsOptions.playerWeightMap = map;
            lmsOptions.playersAlphaSort = false;
          }
          try {
            localStorage.setItem('playerWeightMap', JSON.stringify(map));
            localStorage.setItem('playersAlphaSort', 'false');
          } catch (e0) {}
          if (typeof store !== 'undefined' && store.state && store.state.players && typeof playerSort === 'function') {
            store.commit('setPlayers', store.state.players.slice().sort(playerSort));
          }
        } catch (e2) {}
      } else if (d.type === 'set-player') {
        try {
          var sid = d.playerId || d.id || '';
          if (sid && typeof store !== 'undefined' && store && store.commit) {
            store.commit('setPlayer', sid);
          }
        } catch (e2) {}
      } else if (d.type === 'open-player-settings') {
        try {
          if (typeof bus === 'undefined' || !bus || !bus.$emit) return;
          var pid = d.playerId || d.id || '';
          if (pid && typeof store !== 'undefined' && store && store.commit) {
            store.commit('setPlayer', pid);
          }
          bus.$emit('dlg.open', 'playersettings', pid || undefined);
        } catch (e2) {}
      } else if (d.type === 'open-plugins') {
        try {
          if (typeof openManagePlugins === 'function') {
            openManagePlugins(undefined);
          } else if (typeof bus !== 'undefined' && bus && bus.$emit) {
            bus.$emit('dlg.open', 'manageplugins');
          }
        } catch (e2) {}
      } else if (d.type === 'open-logs') {
        try {
          if (typeof bus !== 'undefined' && bus && bus.$emit) {
            var href = d.href || '/material/server.log';
            bus.$emit('iframe-href', href, true, undefined, '/material/settings/server/debugging.html');
          }
        } catch (e2) {}
      } else if (d.type === 'browse-nav') {
        try {
          var action = d.action || '';
          if (typeof bus === 'undefined' || !bus || !bus.$emit) return;
          if (action === 'search') {
            bus.$emit('browse-shortcut', typeof SEARCH_SHORTCUT !== 'undefined' ? SEARCH_SHORTCUT : '-s');
          } else if (action === 'home') {
            bus.$emit('browse-shortcut', typeof HOME_SHORTCUT !== 'undefined' ? HOME_SHORTCUT : '-h');
          } else if (action === 'grid') {
            bus.$emit('browse-set-layout', true);
          } else if (action === 'list') {
            bus.$emit('browse-set-layout', false);
          } else if (action) {
            bus.$emit('browse-shortcut', action);
          }
        } catch (e3) {}
      }
    } catch (e) {}
  });

  var tries = 0;
  (function wait() {
    if (ensureAppSettings() || tries++ > 80) return;
    setTimeout(wait, 50);
  })();

  function reportPlayers() {
    try {
      var list = [];
      var current = '';
      if (typeof store !== 'undefined' && store && store.state) {
        var players = store.state.players || [];
        for (var i = 0; i < players.length; i++) {
          var p = players[i];
          if (!p || !p.id) continue;
          var nm = String(p.name || '');
          if (nm.toLowerCase().indexOf('preview') >= 0) continue;
          list.push({ id: p.id, name: nm || p.id });
        }
        if (store.state.player && store.state.player.id) {
          current = store.state.player.id;
        }
      }
      post('players', { players: list, current: current });
    } catch (e) {}
  }

  var playerTries = 0;
  (function waitPlayers() {
    try {
      if (typeof store !== 'undefined' && store && store.state && store.state.players) {
        reportPlayers();
        if (typeof bus !== 'undefined' && bus && bus.$on) {
          bus.$on('playerChanged', reportPlayers);
          bus.$on('playerListChanged', reportPlayers);
        }
        return;
      }
    } catch (e) {}
    if (playerTries++ > 80) return;
    setTimeout(waitPlayers, 250);
  })();

  function enableAppMedia() {
    try {
      try {
        localStorage.setItem('mediaControls', true);
        localStorage.setItem('keyboardControl', true);
      } catch (e0) {}
      if (typeof store !== 'undefined' && store && store.commit) {
        store.commit('setUiSettings', { mediaControls: true, keyboardControl: true });
      }
    } catch (e) {}
  }

  var mediaTries = 0;
  (function waitMedia() {
    try {
      if (typeof store !== 'undefined' && store && store.commit) {
        enableAppMedia();
        return;
      }
    } catch (e) {}
    if (mediaTries++ > 80) return;
    setTimeout(waitMedia, 50);
  })();

  function typingTarget(el) {
    if (!el) return false;
    var tag = (el.tagName || '').toUpperCase();
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!el.isContentEditable;
  }

  document.addEventListener(
    'keydown',
    function (ev) {
      try {
        if (typingTarget(ev.target)) return;
        var meta = !!(ev.metaKey || ev.ctrlKey);
        var key = ev.key || '';
        var code = ev.code || '';
        if (meta && (key === 'ArrowUp' || code === 'ArrowUp')) {
          ev.preventDefault();
          ev.stopPropagation();
          if (typeof bus !== 'undefined' && bus && bus.$emit) {
            bus.$emit('adjustVolume', true);
          }
          return;
        }
        if (meta && (key === 'ArrowDown' || code === 'ArrowDown')) {
          ev.preventDefault();
          ev.stopPropagation();
          if (typeof bus !== 'undefined' && bus && bus.$emit) {
            bus.$emit('adjustVolume', false);
          }
          return;
        }
        if (key === 'MediaPlayPause' || code === 'MediaPlayPause') {
          ev.preventDefault();
          if (typeof bus !== 'undefined' && bus && bus.$emit) {
            bus.$emit('playerCommand', ['pause']);
          }
        } else if (key === 'MediaTrackNext' || code === 'MediaTrackNext') {
          ev.preventDefault();
          if (typeof bus !== 'undefined' && bus && bus.$emit) {
            bus.$emit('playerCommand', ['playlist', 'index', '+1']);
          }
        } else if (key === 'MediaTrackPrevious' || code === 'MediaTrackPrevious') {
          ev.preventDefault();
          if (typeof bus !== 'undefined' && bus && bus.$emit) {
            bus.$emit('playerCommand', ['button', 'jump_rew']);
          }
        }
      } catch (e) {}
    },
    true
  );

  post('ready');

  // RecycleScroller page-mode inside the Tauri iframe often misses the first
  // layout. A resize after paint forces it to measure #browse-list.
  setTimeout(function () {
    try { window.dispatchEvent(new Event('resize')); } catch (e) {}
    try {
      if (typeof bus !== 'undefined' && bus && bus.$emit) {
        bus.$emit('windowWidthChanged');
      }
    } catch (e2) {}
  }, 250);
})();
