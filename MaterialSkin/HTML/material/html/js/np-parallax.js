/**
 * LMS-Material — motion-activated now-playing parallax (mobile)
 *
 * Copyright (c) 2018-2026 Craig Drummond <craig.p.drummond@gmail.com>
 * MIT license.
 */
'use strict';

const NP_PARALLAX_DISABLED = true;
const NP_PARALLAX_BG_MAX = 14;
const NP_PARALLAX_COVER_MAX = 10;
const NP_PARALLAX_EASE = 0.14;
const NP_PARALLAX_TILT_SCALE = 30;

var _npParallaxVm = undefined;
var _npParallaxActive = false;
var _npParallaxBound = false;
var _npParallaxRaf = undefined;
var _npParallaxPermission = 'unknown';
var _npParallaxPrompting = false;
var _npParallaxDeclinedKey = 'npParallaxDeclined';
var _npParallaxTarget = {bx:0, by:0, cx:0, cy:0};
var _npParallaxCurrent = {bx:0, by:0, cx:0, cy:0};

function npParallaxMotionReduced() {
    try {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) {
        return false;
    }
}

function npParallaxGetStore() {
    try {
        let app = document.getElementById('app');
        if (app && app.__vue__ && app.__vue__.$store) {
            return app.__vue__.$store;
        }
    } catch (e) { }
    return undefined;
}

function npParallaxShouldRun() {
    if (NP_PARALLAX_DISABLED) {
        return false;
    }
    if (!IS_MOBILE || npParallaxMotionReduced() || typeof DeviceOrientationEvent === 'undefined') {
        return false;
    }
    if (_npParallaxPermission === 'denied') {
        return false;
    }
    let store = npParallaxGetStore();
    if (!store || store.state.desktopLayout) {
        return false;
    }
    if (_npParallaxVm && _npParallaxVm.info && _npParallaxVm.info.show) {
        return false;
    }
    if (store.state.page === 'now-playing') {
        return true;
    }
    return store.state.npSheetOpen;
}

function npParallaxApplyCss() {
    let root = document.documentElement;
    root.style.setProperty('--np-parallax-bg-x', _npParallaxCurrent.bx.toFixed(2) + 'px');
    root.style.setProperty('--np-parallax-bg-y', _npParallaxCurrent.by.toFixed(2) + 'px');
    root.style.setProperty('--np-parallax-cover-x', _npParallaxCurrent.cx.toFixed(2) + 'px');
    root.style.setProperty('--np-parallax-cover-y', _npParallaxCurrent.cy.toFixed(2) + 'px');
}

function npParallaxResetCss() {
    _npParallaxTarget = {bx:0, by:0, cx:0, cy:0};
    _npParallaxCurrent = {bx:0, by:0, cx:0, cy:0};
    let root = document.documentElement;
    root.classList.remove('np-parallax-active');
    root.style.removeProperty('--np-parallax-bg-x');
    root.style.removeProperty('--np-parallax-bg-y');
    root.style.removeProperty('--np-parallax-cover-x');
    root.style.removeProperty('--np-parallax-cover-y');
}

function npParallaxNeedsFrame() {
    return Math.abs(_npParallaxTarget.bx - _npParallaxCurrent.bx) > 0.05 ||
           Math.abs(_npParallaxTarget.by - _npParallaxCurrent.by) > 0.05 ||
           Math.abs(_npParallaxTarget.cx - _npParallaxCurrent.cx) > 0.05 ||
           Math.abs(_npParallaxTarget.cy - _npParallaxCurrent.cy) > 0.05;
}

function npParallaxTick() {
    _npParallaxRaf = undefined;
    if (!_npParallaxActive || !npParallaxShouldRun()) {
        npParallaxStop();
        return;
    }
    let ease = NP_PARALLAX_EASE;
    _npParallaxCurrent.bx += (_npParallaxTarget.bx - _npParallaxCurrent.bx) * ease;
    _npParallaxCurrent.by += (_npParallaxTarget.by - _npParallaxCurrent.by) * ease;
    _npParallaxCurrent.cx += (_npParallaxTarget.cx - _npParallaxCurrent.cx) * ease;
    _npParallaxCurrent.cy += (_npParallaxTarget.cy - _npParallaxCurrent.cy) * ease;
    npParallaxApplyCss();
    if (npParallaxNeedsFrame()) {
        npParallaxScheduleFrame();
    }
}

function npParallaxScheduleFrame() {
    if (undefined === _npParallaxRaf) {
        _npParallaxRaf = requestAnimationFrame(npParallaxTick);
    }
}

function npParallaxOnOrientation(ev) {
    if (!_npParallaxActive || !npParallaxShouldRun()) {
        return;
    }
    let gamma = ev.gamma;
    let beta = ev.beta;
    if (undefined === gamma || undefined === beta || isNaN(gamma) || isNaN(beta)) {
        return;
    }
    let nx = Math.max(-1, Math.min(1, gamma / NP_PARALLAX_TILT_SCALE));
    let ny = Math.max(-1, Math.min(1, (beta - 45) / NP_PARALLAX_TILT_SCALE));
    _npParallaxTarget.bx = nx * NP_PARALLAX_BG_MAX;
    _npParallaxTarget.by = ny * NP_PARALLAX_BG_MAX;
    _npParallaxTarget.cx = nx * NP_PARALLAX_COVER_MAX;
    _npParallaxTarget.cy = ny * NP_PARALLAX_COVER_MAX;
    npParallaxScheduleFrame();
}

function npParallaxBindListener() {
    if (_npParallaxBound) {
        return;
    }
    _npParallaxBound = true;
    window.addEventListener('deviceorientation', npParallaxOnOrientation, true);
}

function npParallaxUnbindListener() {
    if (!_npParallaxBound) {
        return;
    }
    _npParallaxBound = false;
    window.removeEventListener('deviceorientation', npParallaxOnOrientation, true);
}

function npParallaxStart() {
    if (_npParallaxActive || !npParallaxShouldRun()) {
        return;
    }
    _npParallaxActive = true;
    document.documentElement.classList.add('np-parallax-active');
    npParallaxBindListener();
    npParallaxScheduleFrame();
}

function npParallaxStop() {
    _npParallaxActive = false;
    if (undefined !== _npParallaxRaf) {
        cancelAnimationFrame(_npParallaxRaf);
        _npParallaxRaf = undefined;
    }
    npParallaxResetCss();
}

function npParallaxUpdate() {
    if (npParallaxShouldRun() && _npParallaxPermission !== 'denied') {
        if (_npParallaxPermission === 'granted' || typeof DeviceOrientationEvent.requestPermission !== 'function') {
            npParallaxStart();
        }
    } else {
        npParallaxStop();
    }
}

function npParallaxPermissionRequired() {
    return typeof DeviceOrientationEvent !== 'undefined' &&
           typeof DeviceOrientationEvent.requestPermission === 'function';
}

function npParallaxUserDeclinedPrompt() {
    try {
        return getLocalStorageBool(_npParallaxDeclinedKey, false);
    } catch (e) {
        return false;
    }
}

function npParallaxSetDeclined(declined) {
    try {
        setLocalStorageVal(_npParallaxDeclinedKey, declined ? 'true' : 'false');
    } catch (e) { }
}

function npParallaxRequestPermission() {
    if (typeof DeviceOrientationEvent === 'undefined') {
        _npParallaxPermission = 'unsupported';
        return Promise.resolve(false);
    }
    if (!npParallaxPermissionRequired()) {
        _npParallaxPermission = 'granted';
        npParallaxUpdate();
        return Promise.resolve(true);
    }
    if (_npParallaxPermission === 'granted') {
        npParallaxUpdate();
        return Promise.resolve(true);
    }
    if (_npParallaxPermission === 'denied') {
        return Promise.resolve(false);
    }
    return DeviceOrientationEvent.requestPermission().then(function(state) {
        _npParallaxPermission = 'granted' === state ? 'granted' : 'denied';
        if ('granted' === state) {
            npParallaxSetDeclined(false);
            npParallaxUpdate();
            return true;
        }
        return false;
    }).catch(function() {
        _npParallaxPermission = 'denied';
        return false;
    });
}

function npParallaxPromptAndRequest() {
    if (NP_PARALLAX_DISABLED) {
        return Promise.resolve(false);
    }
    if (_npParallaxPrompting) {
        return Promise.resolve(false);
    }
    if (!IS_MOBILE || npParallaxMotionReduced() || !npParallaxPermissionRequired()) {
        return npParallaxRequestPermission();
    }
    if (_npParallaxPermission === 'granted') {
        npParallaxUpdate();
        return Promise.resolve(true);
    }
    if (_npParallaxPermission === 'denied' || npParallaxUserDeclinedPrompt()) {
        return Promise.resolve(false);
    }
    if (!npParallaxShouldRun()) {
        return Promise.resolve(false);
    }
    _npParallaxPrompting = true;
    let msg = i18n('Tilt your device for a subtle parallax effect on the now playing artwork. Allow motion sensor access?');
    let enableBtn = i18n('Enable motion');
    let declineBtn = i18n('Not now');
    if (typeof confirm !== 'function') {
        _npParallaxPrompting = false;
        return npParallaxRequestPermission();
    }
    return confirm(msg, enableBtn, declineBtn).then(function(ok) {
        _npParallaxPrompting = false;
        if (!ok) {
            npParallaxSetDeclined(true);
            return false;
        }
        return npParallaxRequestPermission();
    });
}

function npParallaxTryEnableFromGesture() {
    if (NP_PARALLAX_DISABLED) {
        return;
    }
    if (!IS_MOBILE || npParallaxMotionReduced()) {
        return;
    }
    if ('granted' === _npParallaxPermission || !npParallaxPermissionRequired()) {
        npParallaxUpdate();
        return;
    }
    if ('denied' === _npParallaxPermission || npParallaxUserDeclinedPrompt()) {
        return;
    }
    if ('unknown' === _npParallaxPermission) {
        npParallaxPromptAndRequest();
    }
}

function npParallaxInit(vm) {
    if (NP_PARALLAX_DISABLED || !IS_MOBILE) {
        npParallaxStop();
        return;
    }
    _npParallaxVm = vm;
    if (!_npParallaxVm._npParallaxPageBound) {
        _npParallaxVm._npParallaxPageBound = function() {
            npParallaxUpdate();
        };
        bus.$on('pageChanged', _npParallaxVm._npParallaxPageBound);
        bus.$on('expandNpSheet', _npParallaxVm._npParallaxPageBound);
        bus.$on('collapseNpSheetRestore', _npParallaxVm._npParallaxPageBound);
        bus.$on('escPressed', _npParallaxVm._npParallaxPageBound);
    }
    if (typeof DeviceOrientationEvent.requestPermission !== 'function') {
        _npParallaxPermission = 'granted';
    }
    if (!vm._npParallaxInfoWatch) {
        vm._npParallaxInfoWatch = vm.$watch('info.show', function() {
            npParallaxUpdate();
        });
    }
    npParallaxUpdate();
}

function npParallaxTeardown() {
    npParallaxStop();
    npParallaxUnbindListener();
    if (_npParallaxVm) {
        if (_npParallaxVm._npParallaxPageBound) {
            bus.$off('pageChanged', _npParallaxVm._npParallaxPageBound);
            bus.$off('expandNpSheet', _npParallaxVm._npParallaxPageBound);
            bus.$off('collapseNpSheetRestore', _npParallaxVm._npParallaxPageBound);
            bus.$off('escPressed', _npParallaxVm._npParallaxPageBound);
            _npParallaxVm._npParallaxPageBound = undefined;
        }
        if (_npParallaxVm._npParallaxInfoWatch) {
            _npParallaxVm._npParallaxInfoWatch();
            _npParallaxVm._npParallaxInfoWatch = undefined;
        }
    }
    _npParallaxVm = undefined;
    _npParallaxPermission = 'unknown';
}