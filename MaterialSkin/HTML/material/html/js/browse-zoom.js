/**
 * LMS-Material — browse pinch / trackpad zoom (browse list/grid only)
 *
 * Copyright (c) 2018-2026 Craig Drummond <craig.p.drummond@gmail.com>
 * MIT license.
 */
'use strict';

const BROWSE_ZOOM_MIN = 0.8;  /* -20% */
const BROWSE_ZOOM_MAX = 1.8;  /* +80% */
const BROWSE_ZOOM_DEFAULT = 1;
const BROWSE_ZOOM_STORAGE_KEY = 'browseZoom';
const BROWSE_ZOOM_HOME_STORAGE_KEY = 'browseZoomHome';
const BROWSE_ZOOM_PINCH_SENS = 0.85;

var _browseZoomSub = BROWSE_ZOOM_DEFAULT;
var _browseZoomHome = BROWSE_ZOOM_DEFAULT;
var _browseZoomLevel = BROWSE_ZOOM_DEFAULT;
var _browseZoomHandlersBound = false;
var _browseZoomGesture = null;
var _browseZoomWheelOpts = PASSIVE_SUPPORTED ? { passive: false, capture: true } : false;
var _browseZoomGestureOpts = PASSIVE_SUPPORTED ? { passive: false } : false;
var _browseZoomBlockNavUntil = 0;

function browseZoomBlockNav(ms) {
    _browseZoomBlockNavUntil = Date.now() + (undefined!=ms ? ms : 600);
}

/** Cancel long-press / click / drawer that would fire after a pinch. */
function browseZoomSuppressMenus(view) {
    browseZoomBlockNav(1200);
    if (!view) {
        return;
    }
    if (typeof view._listLongPressClear==='function') {
        view._listLongPressClear();
    }
    if (typeof view._previewSecondHoldClear==='function') {
        view._previewSecondHoldClear();
    }
    view.listSwipeSuppress = true;
    view.suppressBrowseClickUntil = Date.now() + 1200;
    if (view.clickTimer) {
        clearTimeout(view.clickTimer);
        view.clickTimer = undefined;
    }
    view._browseTap = undefined;
    view.browseNavSwipe = undefined;
    view.browsePullStart = undefined;
}

function browseZoomNavBlocked() {
    return Date.now() < _browseZoomBlockNavUntil;
}

function browseZoomClamp(z) {
    return Math.max(BROWSE_ZOOM_MIN, Math.min(BROWSE_ZOOM_MAX, z));
}

function browseZoomReadStoredKey(key) {
    let raw = parseFloat(getLocalStorageVal(key, '' + BROWSE_ZOOM_DEFAULT));
    if (isNaN(raw)) {
        return BROWSE_ZOOM_DEFAULT;
    }
    return browseZoomClamp(raw);
}

function browseZoomReadStored() {
    return browseZoomReadStoredKey(BROWSE_ZOOM_STORAGE_KEY);
}

function browseZoomContextIsHome(vm) {
    if (!vm) {
        vm = browseZoomGetBrowseVm();
    }
    return !!(vm && vm.isTop);
}

function browseZoomLoadBoth() {
    _browseZoomSub = browseZoomReadStoredKey(BROWSE_ZOOM_STORAGE_KEY);
    _browseZoomHome = browseZoomReadStoredKey(BROWSE_ZOOM_HOME_STORAGE_KEY);
}

function browseZoomActiveStorageKey(vm) {
    return browseZoomContextIsHome(vm) ? BROWSE_ZOOM_HOME_STORAGE_KEY : BROWSE_ZOOM_STORAGE_KEY;
}

function browseZoomPersist(level) {
    setLocalStorageVal(browseZoomActiveStorageKey(), browseZoomClamp(level));
}

/** Switch the live zoom to home or sub-page when navigating. */
function browseZoomSyncContext(vm) {
    let next = browseZoomContextIsHome(vm) ? _browseZoomHome : _browseZoomSub;
    _browseZoomLevel = next;
    browseZoomSetCss(next);
    if (vm && undefined !== vm.browseZoom) {
        vm.browseZoom = next;
    }
    bus.$emit('browseZoomChanged', next);
}

function browseZoomPinchDistance(touches) {
    if (!touches || touches.length < 2) {
        return 0;
    }
    let dx = touches[0].clientX - touches[1].clientX;
    let dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
}

/** Scale layoutGrid size object; recalculates column count from zoomed cell width. */
function browseZoomApplySize(sz, listWidth, zoom) {
    if (!sz || !listWidth) {
        return sz;
    }
    zoom = browseZoomClamp(undefined !== zoom ? zoom : _browseZoomLevel);
    if (zoom === BROWSE_ZOOM_DEFAULT) {
        return sz;
    }
    let w = Math.max(40, Math.round(sz.w * zoom));
    let h = Math.max(40, Math.round(sz.h * zoom));
    let maxColumns = Math.floor(listWidth / w);
    let numColumns = Math.max(Math.min(maxColumns, 20), 1);
    return { w: w, h: h, s: sz.s, mc: maxColumns, nc: numColumns };
}

function browseZoomTextFactor(zoom) {
    return Math.min(1, browseZoomClamp(undefined!==zoom ? zoom : _browseZoomLevel));
}

function browseZoomSetLiveClass(on) {
    try {
        document.documentElement.classList.toggle('msk-browse-zooming', !!on);
    } catch (e) {}
}

function browseZoomApplyCssVars(el, zoom, textZoom) {
    if (!el || !el.style) {
        return;
    }
    el.style.setProperty('--browse-zoom', ''+zoom);
    el.style.setProperty('--browse-text-zoom', ''+textZoom);
}

function browseZoomSetCss(zoom) {
    let z = browseZoomGridModeActive() ? browseZoomClamp(zoom) : BROWSE_ZOOM_DEFAULT;
    let textZ = browseZoomTextFactor(z);
    /* Scope zoom to browse pane only — not queue, sidebars, or info panel */
    document.documentElement.style.removeProperty('--browse-zoom');
    document.documentElement.style.removeProperty('--browse-text-zoom');
    let browseView = document.getElementById('browse-view');
    if (browseView) {
        browseZoomApplyCssVars(browseView, z, textZ);
    }
    try {
        let fusion = document.querySelector('.lib-fusion');
        if (fusion) {
            browseZoomApplyCssVars(fusion, z, textZ);
        }
    } catch (e) {}
    let queueView = document.getElementById('queue-view');
    if (queueView) {
        queueView.style.removeProperty('--browse-zoom');
        queueView.style.removeProperty('--browse-text-zoom');
    }
}

var _browseZoomLayoutRaf = 0;

function browseZoomEmitLayout() {
    _browseZoomLayoutRaf = 0;
    bus.$emit('browseZoomChanged', _browseZoomLevel);
}

function browseZoomApplyLevel(zoom, persist) {
    if (!browseZoomGridModeActive()) {
        return false;
    }
    let next = browseZoomClamp(zoom);
    let live = persist===false;
    browseZoomSetLiveClass(live);
    if (next===_browseZoomLevel) {
        return false;
    }
    _browseZoomLevel = next;
    if (browseZoomContextIsHome()) {
        _browseZoomHome = next;
    } else {
        _browseZoomSub = next;
    }
    browseZoomSetCss(next);
    if (live) {
        /* CSS scales cells immediately; RecycleScroller columns/row heights
         * need a rAF layout so sub-pages reflow with the gesture, not at lift. */
        if (!_browseZoomLayoutRaf) {
            _browseZoomLayoutRaf = requestAnimationFrame(browseZoomEmitLayout);
        }
        return true;
    }
    if (_browseZoomLayoutRaf) {
        cancelAnimationFrame(_browseZoomLayoutRaf);
        _browseZoomLayoutRaf = 0;
    }
    browseZoomPersist(next);
    bus.$emit('browseZoomChanged', next);
    return true;
}

function browseZoomStoreActive(store) {
    if (!store) {
        return false;
    }
    if (store.state.desktopLayout) {
        return true;
    }
    return store.state.page === 'browse';
}

function browseZoomEventInZone(ev) {
    if (!ev || !ev.target || !ev.target.closest) {
        return false;
    }
    /* Never zoom from sidebars, splitter, or artist info panel */
    if (ev.target.closest('.browse-home-pane, #browse-home-pane, .np-info, .lms-splitter .splitter')) {
        return false;
    }
    /* My Music Fusion album grid */
    if (ev.target.closest('.lib-fusion, .lib-fusion-album-grid, .lib-fusion-albums-tab')) {
        return true;
    }
    if (ev.target.closest('#browse-view .browse-main-pane, #browse-list')) {
        return true;
    }
    return false;
}

function browseZoomGetAppStore() {
    try {
        let app = document.getElementById('app');
        if (app && app.__vue__ && app.__vue__.$store) {
            return app.__vue__.$store;
        }
    } catch (e) {}
    return undefined;
}

function browseZoomGetBrowseVm() {
    try {
        let el = document.getElementById('browse-view');
        if (el && el.__vue__) {
            return el.__vue__;
        }
    } catch (e) {}
    return undefined;
}

/** Pinch / trackpad zoom applies to image grid only — not list layout. */
function browseZoomGridModeActive(vm) {
    if (!vm) {
        vm = browseZoomGetBrowseVm();
    }
    if (!vm) {
        return false;
    }
    /* My Music Fusion: album grid (and artists with art) support pinch-zoom */
    if (vm.fusionMode && vm.current && typeof TOP_MYMUSIC_ID !== 'undefined' && vm.current.id === TOP_MYMUSIC_ID) {
        return true;
    }
    /* Fusion component may own the gesture when browse-list is hidden */
    try {
        if (document.querySelector('.lib-fusion .lib-fusion-album-grid, .lib-fusion.lib-fusion-zoomable')) {
            return true;
        }
    } catch (e) {}
    return !!(vm.grid && vm.grid.allowed && vm.grid.use);
}

var _browseZoomPersistT = 0;
function browseZoomSchedulePersist() {
    if (_browseZoomPersistT) {
        clearTimeout(_browseZoomPersistT);
    }
    _browseZoomPersistT = setTimeout(function() {
        _browseZoomPersistT = 0;
        browseZoomSetLiveClass(false);
        browseZoomPersist(_browseZoomLevel);
        if (_browseZoomLayoutRaf) {
            cancelAnimationFrame(_browseZoomLayoutRaf);
            _browseZoomLayoutRaf = 0;
        }
        bus.$emit('browseZoomChanged', _browseZoomLevel);
    }, 140);
}

function browseZoomWheelGlobal(ev) {
    let store = browseZoomGetAppStore();
    if (!store || !browseZoomStoreActive(store) || !browseZoomGridModeActive() || !browseZoomEventInZone(ev)) {
        return;
    }
    if (!ev.ctrlKey && !ev.metaKey) {
        return;
    }
    let dy = ev.deltaY || 0;
    if (Math.abs(dy) < 0.01) {
        return;
    }
    try { ev.preventDefault(); } catch (e) {}
    try { ev.stopPropagation(); } catch (e) {}
    let step = -dy * 0.004;
    if (Math.abs(step) < 0.012) {
        step = step < 0 ? -0.012 : 0.012;
    }
    browseZoomApplyLevel(_browseZoomLevel + step, false);
    browseZoomSchedulePersist();
}

function browseZoomGestureStartGlobal(ev) {
    let store = browseZoomGetAppStore();
    if (!store || !browseZoomStoreActive(store) || !browseZoomGridModeActive() || !browseZoomEventInZone(ev)) {
        return;
    }
    try { ev.preventDefault(); } catch (e) {}
    _browseZoomGesture = { base: _browseZoomLevel };
    browseZoomSuppressMenus(browseZoomGetBrowseVm());
}

function browseZoomGestureChangeGlobal(ev) {
    if (!_browseZoomGesture) {
        return;
    }
    try { ev.preventDefault(); } catch (e) {}
    let scale = ev.scale || 1;
    browseZoomApplyLevel(_browseZoomGesture.base * scale, false);
}

function browseZoomGestureEndGlobal(ev) {
    if (!_browseZoomGesture) {
        return;
    }
    try { ev.preventDefault(); } catch (e) {}
    browseZoomSetLiveClass(false);
    browseZoomPersist(_browseZoomLevel);
    if (_browseZoomLayoutRaf) {
        cancelAnimationFrame(_browseZoomLayoutRaf);
        _browseZoomLayoutRaf = 0;
    }
    bus.$emit('browseZoomChanged', _browseZoomLevel);
    _browseZoomGesture = null;
    browseZoomSuppressMenus(browseZoomGetBrowseVm());
}

function browseZoomBindGlobalHandlers() {
    if (_browseZoomHandlersBound) {
        return;
    }
    _browseZoomHandlersBound = true;
    window.addEventListener('wheel', browseZoomWheelGlobal, _browseZoomWheelOpts);
    let gestureEl = document.getElementById('app') || document;
    gestureEl.addEventListener('gesturestart', browseZoomGestureStartGlobal, _browseZoomGestureOpts);
    gestureEl.addEventListener('gesturechange', browseZoomGestureChangeGlobal, _browseZoomGestureOpts);
    gestureEl.addEventListener('gestureend', browseZoomGestureEndGlobal, _browseZoomGestureOpts);
}

function browseZoomListItemSize(baseHeight) {
    if (!browseZoomGridModeActive()) {
        let base = baseHeight || LMS_LIST_ELEMENT_SIZE;
        try {
            let parsed = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--list-elem-height'));
            if (!isNaN(parsed) && parsed > 0) {
                base = parsed;
            }
        } catch (e) {}
        return Math.max(36, Math.round(base));
    }
    let zoom = _browseZoomLevel;
    let base = baseHeight || LMS_LIST_ELEMENT_SIZE;
    try {
        let parsed = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--list-elem-height'));
        if (!isNaN(parsed) && parsed > 0) {
            base = parsed;
        }
    } catch (e) {}
    return Math.max(36, Math.round(base * zoom));
}

function browseZoomList3ItemSize() {
    if (!browseZoomGridModeActive()) {
        let base = LMS_LIST_3LINE_ELEMENT_SIZE;
        try {
            let parsed = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--list-elem-3line-height'));
            if (!isNaN(parsed) && parsed > 0) {
                base = parsed;
            }
        } catch (e) {}
        return Math.max(48, Math.round(base));
    }
    let zoom = _browseZoomLevel;
    let base = LMS_LIST_3LINE_ELEMENT_SIZE;
    try {
        let parsed = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--list-elem-3line-height'));
        if (!isNaN(parsed) && parsed > 0) {
            base = parsed;
        }
    } catch (e) {}
    return Math.max(48, Math.round(base * zoom));
}

function browseZoomSyncComponent(vm) {
    if (vm && undefined !== vm.browseZoom) {
        vm.browseZoom = _browseZoomLevel;
    }
}

/** RecycleScroller does not watch itemSize — positions stay stale until a
 *  scroll event. Banners (CSS flex) reflow live; sub-page grids need a kick. */
function browseZoomKickScroller(vm) {
    if (!vm) {
        return;
    }
    let kick = function() {
        let sc = vm.$refs && vm.$refs.browseGridScroller;
        if (Array.isArray(sc)) {
            sc = sc[0];
        }
        if (!sc) {
            return;
        }
        try {
            if (typeof sc.updateVisibleItems==='function') {
                sc.updateVisibleItems(true);
            } else if (typeof sc.handleResize==='function') {
                sc.handleResize();
            }
        } catch (e) {}
    };
    if (typeof vm.$nextTick==='function') {
        vm.$nextTick(function() {
            kick();
            requestAnimationFrame(kick);
        });
    } else {
        requestAnimationFrame(kick);
    }
}

function browseZoomOnChanged(vm, zoom) {
    browseZoomSyncComponent(vm);
    let live = false;
    try {
        live = document.documentElement.classList.contains('msk-browse-zooming');
    } catch (eL) {}
    if (vm && vm.grid && vm.grid.allowed && vm.grid.use && typeof vm.layoutGrid === 'function') {
        /* Live: column/height math only. Full rebuild at finger-up. */
        vm.layoutGrid(!live);
    }
    browseZoomKickScroller(vm);
}

var browseZoomMethods = {
    browseZoomLevel() {
        return _browseZoomLevel;
    },
    browseZoomInit() {
        browseZoomLoadBoth();
        _browseZoomLevel = this.isTop ? _browseZoomHome : _browseZoomSub;
        browseZoomSetCss(_browseZoomLevel);
        this.browseZoom = _browseZoomLevel;
        this._browseZoomPinch = null;
        browseZoomBindGlobalHandlers();
        if (!this._browseZoomChangedBound) {
            this._browseZoomChangedBound = function(zoom) {
                browseZoomOnChanged(this, zoom);
            }.bind(this);
            bus.$on('browseZoomChanged', this._browseZoomChangedBound);
        }
        /* Grid column math uses browseZoomLevel(); relayout after stored zoom is applied */
        let vm = this;
        this.$nextTick(function() {
            if (typeof vm.layoutGrid === 'function') {
                vm.layoutGrid(true);
            }
            requestAnimationFrame(function() {
                if (typeof vm.layoutGrid === 'function') {
                    vm.layoutGrid(true);
                }
            });
        });
    },
    browseZoomActive() {
        return browseZoomStoreActive(this.$store);
    },
    browseZoomEventInView(ev) {
        return browseZoomEventInZone(ev);
    },
    browseZoomBind(el) {
        browseZoomBindGlobalHandlers();
        browseZoomSetCss(_browseZoomLevel);
    },
    browseZoomUnbind() {
        if (this._browseZoomChangedBound) {
            bus.$off('browseZoomChanged', this._browseZoomChangedBound);
            this._browseZoomChangedBound = undefined;
        }
    },
    browseZoomSyncLayout() {
        browseZoomSetCss(_browseZoomLevel);
        if (!browseZoomGridModeActive(this) && typeof this.$forceUpdate === 'function') {
            this.$forceUpdate();
        }
    },
    browseZoomSet(zoom, persist) {
        if (!browseZoomApplyLevel(zoom, persist)) {
            return;
        }
        browseZoomSyncComponent(this);
    },
    browseZoomAdjust(delta) {
        if (!delta) {
            return;
        }
        this.browseZoomSet(_browseZoomLevel + delta);
    },
    browseZoomWheel(ev) {
        browseZoomWheelGlobal(ev);
    },
    browseZoomGestureStart(ev) {
        browseZoomGestureStartGlobal(ev);
    },
    browseZoomGestureChange(ev) {
        browseZoomGestureChangeGlobal(ev);
    },
    browseZoomGestureEnd(ev) {
        browseZoomGestureEndGlobal(ev);
    },
    browseZoomTouchStart(ev) {
        if (!this.browseZoomActive() || !browseZoomGridModeActive(this) || !ev.touches || ev.touches.length < 2) {
            return false;
        }
        this._browseZoomPinch = {
            dist: browseZoomPinchDistance(ev.touches),
            zoom: _browseZoomLevel
        };
        this.browseNavSwipe = undefined;
        this.browsePullStart = undefined;
        browseZoomSuppressMenus(this);
        return true;
    },
    browseZoomTouchMove(ev) {
        let pinch = this._browseZoomPinch;
        if (!pinch || !ev.touches || ev.touches.length < 2) {
            return false;
        }
        browseZoomSuppressMenus(this);
        let dist = browseZoomPinchDistance(ev.touches);
        if (dist < 8 || pinch.dist < 8) {
            return true;
        }
        try { ev.preventDefault(); } catch (e) {}
        let ratio = dist / pinch.dist;
        let target = pinch.zoom * Math.pow(ratio, BROWSE_ZOOM_PINCH_SENS);
        this.browseZoomSet(target, false);
        return true;
    },
    browseZoomTouchEnd(ev) {
        if (this._browseZoomPinch) {
            browseZoomSetLiveClass(false);
            browseZoomPersist(_browseZoomLevel);
            if (_browseZoomLayoutRaf) {
                cancelAnimationFrame(_browseZoomLayoutRaf);
                _browseZoomLayoutRaf = 0;
            }
            bus.$emit('browseZoomChanged', _browseZoomLevel);
            this._browseZoomPinch = null;
            this.browseNavSwipe = undefined;
            this.browsePullStart = undefined;
            browseZoomSuppressMenus(this);
            return true;
        }
        if (ev && ev.touches && ev.touches.length >= 2) {
            return true;
        }
        return false;
    }
};

function browseZoomData() {
    return {
        browseZoom: BROWSE_ZOOM_DEFAULT
    };
}

/* Apply stored zoom before Vue mount so first paint matches layout math.
 * First view is Accueil, so start from the home level. */
browseZoomLoadBoth();
_browseZoomLevel = _browseZoomHome;
function browseZoomApplyStoredCss() {
    browseZoomSetCss(_browseZoomLevel);
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', browseZoomApplyStoredCss);
} else {
    browseZoomApplyStoredCss();
}