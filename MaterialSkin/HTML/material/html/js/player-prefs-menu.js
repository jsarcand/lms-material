/**
 * LMS-Material — desktop NP-bar player preferences menu helpers
 * WiiM input/output, SqueezeDSP presets, Denon/Marantz source select.
 */
'use strict';

(function(global) {
    var CAP_TTL_MS = 60000;
    var capCache = {}; /* playerId -> { ts, wiim, dsp, denon } */

    function now() {
        return Date.now ? Date.now() : (new Date()).getTime();
    }

    function playerIdOf(storeOrId) {
        if (!storeOrId) { return ''; }
        if (typeof storeOrId === 'string') { return storeOrId; }
        try {
            if (storeOrId.state && storeOrId.state.player && storeOrId.state.player.id) {
                return storeOrId.state.player.id;
            }
        } catch (e) {}
        return '';
    }

    function playerMeta(store) {
        try {
            var p = store && store.state && store.state.player;
            if (!p) { return { id: '', name: '', model: '', isgroup: false }; }
            return {
                id: p.id || '',
                name: p.name || '',
                model: p.model || p.modelname || '',
                modelname: p.modelname || p.model || '',
                isgroup: !!p.isgroup
            };
        } catch (e) {
            return { id: '', name: '', model: '', isgroup: false };
        }
    }

    function isWiimHeuristic(meta) {
        var m = ((meta && (meta.modelname || meta.model)) || '') + ' ' + ((meta && meta.name) || '');
        return /wiim/i.test(m);
    }

    function rpcResult(r) {
        // axios response: { data: { result: {...} } }
        if (!r) { return null; }
        if (r.data && r.data.result) { return r.data.result; }
        if (r.result) { return r.result; }
        if (r.data && !r.data.method) { return r.data; }
        return null;
    }

    function canCmd(playerId, cmdParts) {
        if (typeof lmsCommand !== 'function') {
            return Promise.resolve(false);
        }
        var args = ['can'].concat(cmdParts).concat(['?']);
        return lmsCommand(playerId || '', args).then(function(r) {
            var res = rpcResult(r);
            var v = res && (res._can != null ? res._can : res.can);
            return v === 1 || v === '1' || v === true;
        }).catch(function() { return false; });
    }

    /**
     * SqueezeDSP is registered globally, so `can squeezedsp.filters` is true for every
     * player. Per-player enablement is Client.Bypass in the player JSON
     * (Bypass "1" = DSP off — default for new players in SqueezeDSP).
     */
    function isDspEnabledForPlayer(playerId) {
        return canCmd(playerId, ['squeezedsp.filters']).then(function(can) {
            if (!can) {
                return false;
            }
            return lmsCommand(playerId, ['squeezedsp.readclientSettings']).then(function(r) {
                var res = rpcResult(r);
                if (!res) {
                    return false;
                }
                // Fresh player with no settings file → SqueezeDSP leaves Bypass on
                if (res.fresh_player === 1 || res.fresh_player === '1' || res.fresh_player === true) {
                    return false;
                }
                try {
                    var j = res.json
                        ? (typeof res.json === 'string' ? JSON.parse(res.json) : res.json)
                        : res;
                    if (!j || typeof j !== 'object') {
                        return false;
                    }
                    // Empty defaults: only Bypass/Revision → treat as disabled
                    var client = (j.Client && typeof j.Client === 'object') ? j.Client : {};
                    var bypass = (client.Bypass != null) ? client.Bypass
                        : (j.Bypass != null ? j.Bypass : null);
                    if (bypass === 1 || bypass === '1' || bypass === true) {
                        return false;
                    }
                    // Explicit Bypass off → enabled. Missing Bypass on a real settings
                    // file also means the player has been configured (enabled).
                    return true;
                } catch (e) {
                    return false;
                }
            }).catch(function() {
                return false;
            });
        });
    }

    function detectCaps(playerId, meta) {
        var id = playerId || (meta && meta.id) || '';
        if (!id) {
            return Promise.resolve({ wiim: false, dsp: false, denon: false, ts: now() });
        }
        var cached = capCache[id];
        if (cached && (now() - cached.ts) < CAP_TTL_MS) {
            return Promise.resolve(cached);
        }
        if (meta && meta.isgroup) {
            var empty = { wiim: false, dsp: false, denon: false, ts: now() };
            capCache[id] = empty;
            return Promise.resolve(empty);
        }
        return Promise.all([
            canCmd(id, ['wiimintegration', 'sources']).then(function(ok) {
                return ok || isWiimHeuristic(meta);
            }),
            isDspEnabledForPlayer(id),
            canCmd(id, ['avpSourceSelect'])
        ]).then(function(flags) {
            var caps = {
                wiim: !!flags[0],
                dsp: !!flags[1],
                denon: !!flags[2],
                ts: now()
            };
            // Denon avpSourceSelect can report can=1 for all players — require
            // a non-empty source list later; keep flag as "try denon".
            capCache[id] = caps;
            return caps;
        });
    }

    function invalidateCaps(playerId) {
        if (playerId) {
            delete capCache[playerId];
        } else {
            capCache = {};
        }
    }

    function parseItemLoop(result) {
        var loop = (result && result.item_loop) ? result.item_loop : [];
        return loop.map(function(it, i) {
            var cmd = null;
            var actions = it.actions || {};
            var doAct = actions.do || actions.go;
            if (doAct && doAct.cmd && doAct.cmd.length) {
                cmd = doAct.cmd.slice();
            }
            return {
                id: it.id || ('item-' + i),
                text: it.text || it.title || '',
                radio: !!(it.radio === 1 || it.radio === '1' || it.radio === true),
                cmd: cmd,
                raw: it
            };
        }).filter(function(it) { return it.text; });
    }

    function loadWiimSources(playerId) {
        return lmsCommand(playerId, ['wiimintegration', 'sources', 0, 50]).then(function(r) {
            var res = rpcResult(r);
            return parseItemLoop(res).map(function(it) {
                // cmd: ['wiimintegration','source','bluetooth']
                var mode = (it.cmd && it.cmd.length >= 3) ? it.cmd[2] : null;
                return {
                    id: it.id,
                    label: it.text,
                    mode: mode,
                    selected: it.radio,
                    section: 'input',
                    apply: ['wiimintegration', 'source', mode]
                };
            }).filter(function(it) { return it.mode; });
        }).catch(function() { return []; });
    }

    function loadWiimLineouts(playerId) {
        return lmsCommand(playerId, ['wiimintegration', 'lineouts', 0, 20]).then(function(r) {
            var res = rpcResult(r);
            var current = res && res.current != null ? String(res.current) : '';
            return parseItemLoop(res).map(function(it) {
                var mode = (it.cmd && it.cmd.length >= 3) ? String(it.cmd[2]) : null;
                var label = String(it.text || '').replace(/\s*✓\s*$/, '');
                return {
                    id: it.id,
                    label: label,
                    mode: mode,
                    selected: it.radio || (current !== '' && mode === current),
                    section: 'output',
                    apply: ['wiimintegration', 'lineout', mode]
                };
            }).filter(function(it) { return it.mode; });
        }).catch(function() { return []; });
    }

    /** Base URL for WiiM Integration HTTP bridges (preset/N, control/…). */
    function wiimBridgeBaseUrl() {
        try {
            if (typeof window !== 'undefined' && window.location && window.location.origin) {
                return String(window.location.origin).replace(/\/$/, '');
            }
        } catch (e) {}
        return '';
    }

    function wiimPresetCopyUrl(num, playerId) {
        var base = wiimBridgeBaseUrl();
        var n = parseInt(num, 10) || 1;
        return base ? (base + '/preset/' + n) : ('/preset/' + n);
    }

    /**
     * WiiM hardware presets 1–6 (physical buttons on the device / app).
     * Each item carries a copyUrl for the LMS bridge endpoint from WiimIntegration.
     */
    function loadWiimPresets(playerId) {
        return lmsCommand(playerId, ['wiimintegration', 'presets', 0, 20]).then(function(r) {
            var res = rpcResult(r);
            var items = parseItemLoop(res);
            if (!items.length) {
                // Plugin falls back to 1..6 server-side; mirror if empty
                items = [];
                for (var n = 1; n <= 6; n++) {
                    items.push({
                        id: 'wiim_preset_' + n,
                        text: 'Preset ' + n,
                        radio: false,
                        cmd: ['wiimintegration', 'preset', String(n)]
                    });
                }
            }
            return items.map(function(it) {
                var num = null;
                if (it.cmd && it.cmd.length >= 3) {
                    num = parseInt(it.cmd[it.cmd.length - 1], 10);
                }
                if (!num || isNaN(num)) {
                    var m = String(it.id || it.text || '').match(/(\d+)/);
                    num = m ? parseInt(m[1], 10) : null;
                }
                if (!num || isNaN(num)) {
                    return null;
                }
                var label = String(it.text || '').replace(/\s*✓\s*$/, '') || ('Preset ' + num);
                return {
                    id: it.id || ('wiim_preset_' + num),
                    label: label,
                    number: num,
                    selected: it.radio,
                    section: 'presets',
                    apply: ['wiimintegration', 'preset', String(num)]
                };
            }).filter(function(it) { return it; }).sort(function(a, b) {
                return (a.number || 0) - (b.number || 0);
            });
        }).catch(function() {
            // Fallback static 1–6 if query fails but player is WiiM
            var out = [];
            for (var n = 1; n <= 6; n++) {
                out.push({
                    id: 'wiim_preset_' + n,
                    label: 'Preset ' + n,
                    number: n,
                    selected: false,
                    section: 'presets',
                    apply: ['wiimintegration', 'preset', String(n)]
                });
            }
            return out;
        });
    }

    function displayNameFromPresetPath(path) {
        var s = String(path || '');
        // basename
        var slash = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
        if (slash >= 0) { s = s.substring(slash + 1); }
        s = s.replace(/\.preset\.json$/i, '');
        // SqueezeDSP UI uses value="-" for None — keep as sentinel, not a real label
        if (s === '-' || s === 'undefined' || !s) {
            return null;
        }
        // File literally named "None" is the clear-preset option, not a real preset
        if (/^none$/i.test(s)) {
            return null;
        }
        return s;
    }

    function normalizePathKey(path) {
        return String(path || '').replace(/\\/g, '/').toLowerCase();
    }

    function normalizeLabelKey(label) {
        // Collapse whitespace + case so "Late Night Music" / "Late  Night Music" match
        return String(label || '').replace(/\s+/g, ' ').trim().toLowerCase();
    }

    function noneLabel() {
        return (typeof i18n === 'function') ? i18n('None') : 'None';
    }

    /**
     * SqueezeDSP: setval key:Preset is broken upstream (calls missing Utils::loadPrefs).
     * The working load path is squeezedsp.readpresetSettings with full preset path.
     * Current selection comes from squeezedsp.readclientSettings JSON.
     */
    function loadCurrentDspPreset(playerId) {
        return lmsCommand(playerId, ['squeezedsp.readclientSettings']).then(function(r) {
            var res = rpcResult(r);
            var cur = { path: '', name: '', last: '', bypass: null };
            if (!res) { return cur; }
            try {
                var j = res.json ? (typeof res.json === 'string' ? JSON.parse(res.json) : res.json) : res;
                var client = (j && j.Client) || {};
                cur.path = client.Preset || j.Preset || '';
                cur.last = client.Last_preset || j.Last_preset || '';
                cur.name = j.PresetName || cur.last || displayNameFromPresetPath(cur.path) || '';
                cur.bypass = (client.Bypass != null) ? client.Bypass : (j.Bypass != null ? j.Bypass : null);
            } catch (e) {}
            return cur;
        }).catch(function() {
            return { path: '', name: '', last: '', bypass: null };
        });
    }

    function isNoneSelection(current) {
        if (!current) { return true; }
        var p = String(current.path || '').trim();
        if (!p || p === '-' || /^none$/i.test(p)) { return true; }
        // Basename "-" / empty after strip
        if (!displayNameFromPresetPath(p)) { return true; }
        var n = String(current.name || current.last || '').trim();
        if (/^none$/i.test(n) || n === '-') { return true; }
        return false;
    }

    function loadDspPresets(playerId) {
        return Promise.all([
            lmsCommand(playerId, ['squeezedsp.filters']),
            loadCurrentDspPreset(playerId)
        ]).then(function(pair) {
            var res = rpcResult(pair[0]);
            var current = pair[1] || {};
            var loop = (res && res.Preset_loop) ? res.Preset_loop : [];
            var curPath = normalizePathKey(current.path);
            var curName = normalizeLabelKey(current.name || current.last || '');
            var out = [];
            for (var i = 0; i < loop.length; i++) {
                var entry = loop[i];
                // filtersQuery stores path under numeric key "0"
                var path = entry && (entry[0] != null ? entry[0]
                    : (entry['0'] != null ? entry['0']
                    : (entry.path || entry.preset || entry.name)));
                path = path != null ? String(path) : '';
                var label = displayNameFromPresetPath(path);
                if (!label) { continue; }
                var basenam = path;
                var slash = Math.max(basenam.lastIndexOf('/'), basenam.lastIndexOf('\\'));
                if (slash >= 0) { basenam = basenam.substring(slash + 1); }
                var pathKey = normalizePathKey(path);
                var labelKey = normalizeLabelKey(label);
                var selected = !!(curPath && pathKey === curPath) ||
                    !!(curName && labelKey === curName);
                out.push({
                    id: 'dsp-' + labelKey,
                    label: label,
                    path: path,
                    basename: basenam,
                    selected: selected,
                    section: 'dsp',
                    // Custom apply path (see applyDspPreset): readpresetSettings only
                    // copies the file; saveall writes + forces DSP reload via seek.
                    apply: ['squeezedsp.readpresetSettings', 'presetFileName:' + path],
                    applyDsp: true
                });
            }
            // de-dupe by normalized label (prefer selected; else first path)
            var seen = {};
            var deduped = [];
            for (var j = 0; j < out.length; j++) {
                var it = out[j];
                var key = normalizeLabelKey(it.label);
                if (seen[key] != null) {
                    if (it.selected) {
                        deduped[seen[key]] = it;
                    }
                    continue;
                }
                seen[key] = deduped.length;
                deduped.push(it);
            }
            // SqueezeDSP UI always offers value="-" → None (not in Preset_loop)
            var noneSelected = isNoneSelection(current);
            if (noneSelected) {
                for (var k = 0; k < deduped.length; k++) {
                    deduped[k].selected = false;
                }
            }
            deduped.unshift({
                id: 'dsp-none',
                label: noneLabel(),
                path: '-',
                basename: '-',
                selected: noneSelected,
                section: 'dsp',
                applyDsp: true,
                clearDsp: true
            });
            return deduped;
        }).catch(function() { return []; });
    }

    function loadDenonSources(playerId) {
        return lmsCommand(playerId, ['avpSourceSelect']).then(function(r) {
            var res = rpcResult(r);
            var count = res && res.count != null ? parseInt(res.count, 10) : 0;
            if (!count) { return []; }
            return parseItemLoop(res).map(function(it) {
                var src = (it.cmd && it.cmd.length >= 2) ? it.cmd[1] : null;
                return {
                    id: it.id || ('denon-' + src),
                    label: it.text,
                    mode: src,
                    selected: it.radio,
                    section: 'source',
                    apply: src ? ['avpSetSource', src] : null
                };
            }).filter(function(it) { return it.apply; });
        }).catch(function() { return []; });
    }

    /**
     * Load all applicable sections for the player.
     * Returns { sections: [{id,title,items:[]}], hasAnything:bool }
     */
    function loadMenu(store) {
        var meta = playerMeta(store);
        var id = meta.id;
        if (!id || meta.isgroup) {
            return Promise.resolve({ sections: [], hasAnything: false, caps: null });
        }
        // Always re-probe caps when opening the menu (Bypass can change in SqueezeDSP UI)
        invalidateCaps(id);
        return detectCaps(id, meta).then(function(caps) {
            var jobs = [];
            var order = [];
            if (caps.wiim) {
                order.push('input');
                jobs.push(loadWiimSources(id));
                order.push('output');
                jobs.push(loadWiimLineouts(id));
            }
            if (caps.dsp) {
                order.push('dsp');
                jobs.push(loadDspPresets(id));
            }
            if (caps.denon) {
                order.push('source');
                jobs.push(loadDenonSources(id));
            }
            // WiiM hardware presets last — plain text list (not pills)
            if (caps.wiim) {
                order.push('presets');
                jobs.push(loadWiimPresets(id));
            }
            if (!jobs.length) {
                return { sections: [], hasAnything: false, caps: caps };
            }
            return Promise.all(jobs).then(function(lists) {
                var titles = {
                    input: (typeof i18n === 'function') ? i18n('Input') : 'Input',
                    output: (typeof i18n === 'function') ? i18n('Output') : 'Output',
                    presets: (typeof i18n === 'function') ? i18n('Presets') : 'Presets',
                    dsp: (typeof i18n === 'function') ? i18n('DSP presets') : 'DSP presets',
                    source: (typeof i18n === 'function') ? i18n('Source') : 'Source'
                };
                var sections = [];
                for (var i = 0; i < order.length; i++) {
                    var items = lists[i] || [];
                    if (!items.length) { continue; }
                    var sid = order[i];
                    var currentLabel = '';
                    var currentNum = null;
                    for (var j = 0; j < items.length; j++) {
                        if (items[j].selected) {
                            currentLabel = items[j].label || '';
                            currentNum = items[j].number != null ? items[j].number : null;
                            break;
                        }
                    }
                    sections.push({
                        id: sid,
                        title: titles[sid] || sid,
                        items: items,
                        layout: 'list',
                        expanded: true,
                        currentLabel: currentLabel,
                        currentNum: currentNum
                    });
                }
                return {
                    sections: sections,
                    hasAnything: sections.length > 0,
                    caps: caps
                };
            });
        });
    }

    /**
     * Load + apply a SqueezeDSP preset the same way the SqueezeDSP web UI does:
     * 1) readpresetSettings — copy preset → client settings.json
     * 2) saveall — rewrite settings and force DSP reload (seek 0.5s while playing)
     * setval key:Preset is broken (missing Utils::loadPrefs) so we never use it.
     */
    function parseSettingsJson(raw) {
        if (!raw) { return null; }
        try {
            return (typeof raw === 'string') ? JSON.parse(raw) : raw;
        } catch (e) {
            return null;
        }
    }

    function saveClientSettings(playerId, data) {
        if (!data || typeof data !== 'object') {
            data = {};
        }
        if (!data.Client || typeof data.Client !== 'object') {
            data.Client = {};
        }
        var payload = JSON.stringify(data);
        return lmsCommand(playerId, ['squeezedsp.saveall', 'val:' + payload]).then(function() {
            return lmsCommand(playerId, ['time', '+0.5']).catch(function() {
                return null;
            });
        }).then(function() {
            return true;
        });
    }

    /** Clear active preset (SqueezeDSP UI "None" / value="-"). */
    function clearDspPreset(playerId) {
        return lmsCommand(playerId, ['squeezedsp.readclientSettings']).then(function(r) {
            var res = rpcResult(r);
            var data = parseSettingsJson(res && res.json) || {};
            if (!data.Client || typeof data.Client !== 'object') {
                data.Client = {};
            }
            data.Client.Last_preset = '';
            data.Client.Preset = '';
            data.PresetName = noneLabel();
            return saveClientSettings(playerId, data);
        }).catch(function() {
            return false;
        });
    }

    function applyDspPreset(playerId, item) {
        if (!item || typeof lmsCommand !== 'function') {
            return Promise.resolve(false);
        }
        // None / clear selection
        if (item.clearDsp || item.path === '-' || item.path === '' || /^none$/i.test(String(item.path || ''))) {
            return clearDspPreset(playerId);
        }
        var path = item.path ? String(item.path) : '';
        if (!path) {
            return Promise.resolve(false);
        }
        var label = item.label || displayNameFromPresetPath(path) || '';

        return lmsCommand(playerId, ['squeezedsp.readpresetSettings', 'presetFileName:' + path]).then(function(r) {
            var res = rpcResult(r);
            var data = parseSettingsJson(res && res.json);
            if (data) {
                return data;
            }
            // Fallback: re-read after copy
            return lmsCommand(playerId, ['squeezedsp.readclientSettings']).then(function(r2) {
                var res2 = rpcResult(r2);
                return parseSettingsJson(res2 && res2.json) || {};
            });
        }).then(function(data) {
            if (!data || typeof data !== 'object') {
                data = {};
            }
            if (!data.Client || typeof data.Client !== 'object') {
                data.Client = {};
            }
            // Stamp selection metadata so checkmarks and next load stay consistent.
            // Do not touch data.Revision — SqueezeDSP stores a version string there
            // (e.g. "0.1.08"), not a counter.
            data.Client.Last_preset = label;
            data.Client.Preset = path;
            data.PresetName = label;
            return saveClientSettings(playerId, data);
        }).catch(function() {
            return false;
        });
    }

    function applyItem(playerId, item) {
        if (!item || typeof lmsCommand !== 'function') {
            return Promise.resolve(false);
        }
        if (item.applyDsp || item.section === 'dsp') {
            return applyDspPreset(playerId, item);
        }
        if (!item.apply || !item.apply.length) {
            return Promise.resolve(false);
        }
        return lmsCommand(playerId, item.apply.slice()).then(function() {
            var extras = item.applyExtra || [];
            if (!extras.length) {
                return true;
            }
            var chain = Promise.resolve();
            for (var i = 0; i < extras.length; i++) {
                (function(cmd) {
                    chain = chain.then(function() {
                        return lmsCommand(playerId, cmd.slice()).catch(function() { return null; });
                    });
                })(extras[i]);
            }
            return chain.then(function() { return true; });
        }).catch(function() {
            return false;
        });
    }

    global.PlayerPrefsMenu = {
        detectCaps: detectCaps,
        invalidateCaps: invalidateCaps,
        loadMenu: loadMenu,
        applyItem: applyItem,
        playerMeta: playerMeta,
        isWiimHeuristic: isWiimHeuristic,
        wiimPresetCopyUrl: wiimPresetCopyUrl,
        wiimBridgeBaseUrl: wiimBridgeBaseUrl
    };
})(typeof window !== 'undefined' ? window : this);
