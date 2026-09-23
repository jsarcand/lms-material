/**
 * LMS-Material — list item swipe gestures
 *
 * Browse:  swipe left  → play next (INSERT)
 *          swipe right → append to queue (ADD)
 * Queue:   swipe left  → remove track
 *
 * Provides shared constants + mixin helpers for browse/queue pages.
 */
'use strict';

var LIST_SWIPE_THRESH = 56;
var LIST_SWIPE_MAX = 92;
var LIST_SWIPE_COMMIT = 64;

function listSwipeKey(item, index, mode) {
    if (!item) { return mode + ':' + index; }
    return mode + ':' + (item.key || item.id || index);
}

function listSwipeCanBrowse(item, view) {
    if (!item || item.header || item.type=='text' || item.type=='html' || item.type=='search' || item.type=='entry' || undefined!=item.input) {
        return false;
    }
    if (queryParams.party) { return false; }
    if (view && view.selection && view.selection.size>0) { return false; }
    // Home screen: never item-swipe — horizontal playlist/radio "sliders" (ihe
    // strips) need free pan, and home tiles are for navigation not queue gestures.
    if (view && view.isTop) { return false; }
    // Horizontal scroller rows (home extras, search cats) — pan only
    if (item.ihe || item.gridScroll) { return false; }
    if (undefined!=item.stdItem && item.stdItem<=STD_ITEM_MAX) {
        // Tracks / albums / playlists / artists etc. (inside browse, not home)
        if (item.stdItem==STD_ITEM_TRACK || item.stdItem==STD_ITEM_ALBUM_TRACK ||
            item.stdItem==STD_ITEM_PLAYLIST_TRACK || item.stdItem==STD_ITEM_REMOTE_PLAYLIST_TRACK ||
            item.stdItem==STD_ITEM_ALBUM || item.stdItem==STD_ITEM_PLAYLIST ||
            item.stdItem==STD_ITEM_REMOTE_PLAYLIST || item.stdItem==STD_ITEM_ARTIST ||
            item.stdItem==STD_ITEM_ONLINE_ALBUM || item.stdItem==STD_ITEM_ONLINE_ARTIST ||
            item.stdItem==STD_ITEM_WORK || item.stdItem==STD_ITEM_RANDOM_MIX) {
            return true;
        }
        // Other std items that support play menus
        return item.stdItem<=STD_ITEM_MAX;
    }
    if (item.menu && item.menu.length>0 && (item.menu[0]==PLAY_ACTION || item.menu[0]==PLAY_ALL_ACTION ||
        item.menu.indexOf(ADD_ACTION)>=0 || item.menu.indexOf(INSERT_ACTION)>=0)) {
        return true;
    }
    return false;
}

function listSwipeCanQueue(item, view) {
    if (!item || item.isGrpHeader || item.isWorkHeader) { return false; }
    if (queryParams.party) { return false; }
    if (view && view.selection && view.selection.size>0) { return false; }
    return true;
}

function listSwipePointFromEvent(ev) {
    if (!ev) { return null; }
    if (ev.touches && ev.touches[0]) {
        return { x: ev.touches[0].clientX, y: ev.touches[0].clientY };
    }
    if (ev.changedTouches && ev.changedTouches[0]) {
        return { x: ev.changedTouches[0].clientX, y: ev.changedTouches[0].clientY };
    }
    // Mouse / pen / trackpad pointer
    if (undefined!=ev.clientX) {
        return { x: ev.clientX, y: ev.clientY };
    }
    return null;
}

function listSwipeIsInteractiveTarget(ev) {
    if (!ev || !ev.target || !ev.target.closest) { return false; }
    return !!ev.target.closest('button, .v-btn, a, input, textarea, select, .menu-btn, .grid-btn, .list-btn, .queue-action, .list-btns, .grid-btns, .hover-btn, .cstats-home-card-play, .cstats-home-card-dismiss');
}

function listSwipePreviewKey(item, index) {
    if (item && item.id!==undefined && item.id!==null && item.id!=='') {
        return String(item.id);
    }
    return 'idx:' + index;
}

function listSwipeIsTextField(el) {
    if (!el || !el.tagName) { return false; }
    var t = el.tagName;
    if (t==='INPUT' || t==='TEXTAREA' || t==='SELECT' || el.isContentEditable) {
        return true;
    }
    return !!(el.closest && el.closest('input, textarea, select, [contenteditable="true"], .v-text-field, .v-input, .lms-search, .browse-inline-search, .browse-lib-search-host, .v-dialog, .lms-dialog'));
}

function listSwipeCanSelectText(el) {
    if (!el || !el.closest) { return false; }
    if (listSwipeIsTextField(el)) {
        return true;
    }
    return !!el.closest('.selectable, .browse-text, .browse-text-inrecycler, .browse-html');
}

function listSwipeFieldIsFocused() {
    try {
        var ae = document.activeElement;
        return !!(ae && listSwipeIsTextField(ae));
    } catch (e) {
        return false;
    }
}

/** iOS webapp: never start a native text-selection except in real text fields. */
function listSwipeInstallIosSelectGuard() {
    if (listSwipeInstallIosSelectGuard.done) { return; }
    if (typeof IS_IOS==='undefined' || !IS_IOS) { return; }
    listSwipeInstallIosSelectGuard.done = true;
    var block = function(ev) {
        if (!ev) { return; }
        if (listSwipeFieldIsFocused() || listSwipeCanSelectText(ev.target)) { return; }
        try { ev.preventDefault(); } catch (e) {}
        if (typeof browsePreviewClearNativeSelection==='function') {
            browsePreviewClearNativeSelection();
        }
    };
    document.addEventListener('selectstart', block, { capture: true, passive: false });
    document.addEventListener('gesturestart', block, { capture: true, passive: false });
    var syncIosFieldClass = function() {
        try {
            document.documentElement.classList.toggle('msk-ios-field', listSwipeFieldIsFocused());
        } catch (e3) {}
    };
    document.addEventListener('focusin', syncIosFieldClass, true);
    document.addEventListener('focusout', function() {
        setTimeout(syncIosFieldClass, 0);
    }, true);
    document.addEventListener('selectionchange', function() {
        try {
            if (listSwipeFieldIsFocused()) {
                return;
            }
            var sel = window.getSelection && window.getSelection();
            if (!sel || !sel.rangeCount) { return; }
            var node = sel.anchorNode;
            var el = node && node.nodeType===1 ? node : (node && node.parentElement);
            if (listSwipeCanSelectText(el)) { return; }
            sel.removeAllRanges();
        } catch (e2) {}
    }, true);
}

function listSwipeArmPreviewNosel(view) {
    if (typeof browsePreviewSetNoSelect==='function') {
        browsePreviewSetNoSelect(true);
    }
    if (typeof browsePreviewBindSelectBlock==='function') {
        browsePreviewBindSelectBlock(view);
    }
    if (view._previewArmNoselTimer) {
        clearTimeout(view._previewArmNoselTimer);
    }
    view._previewArmNoselTimer = setTimeout(function() {
        view._previewArmNoselTimer = undefined;
        if (!view._previewHoldMode && !view._previewSecondHoldTimer && !view._previewHoldActive) {
            if (typeof browsePreviewUnbindSelectBlock==='function') {
                browsePreviewUnbindSelectBlock(view);
            }
        }
    }, 1000);
}

function listSwipeReleaseCapture(s, ev) {
    if (!s || s.pointerId===undefined || !s.captureEl || !s.captureEl.releasePointerCapture) { return; }
    try { s.captureEl.releasePointerCapture(s.pointerId); } catch (e) {}
    if (ev && ev.pointerId===s.pointerId && ev.currentTarget && ev.currentTarget.releasePointerCapture) {
        try { ev.currentTarget.releasePointerCapture(s.pointerId); } catch (e2) {}
    }
}

/** Shared Vue methods mixed into browse/queue components */
var listSwipeMethods = {
    listSwipeStart: function(item, index, mode, ev) {
        // Avoid double-handling: touch already covered by touch* handlers
        if (ev && ev.type && ev.type.indexOf('pointer')===0 && ev.pointerType==='touch') { return; }
        // Never hijack clicks on play/menu/buttons (queue double-click + row actions)
        if (listSwipeIsInteractiveTarget(ev)) { return; }
        var pt = listSwipePointFromEvent(ev);
        if (!pt) { return; }
        // Ignore non-primary mouse buttons
        if (ev.button!==undefined && ev.button!==0) { return; }
        var canSwipe = true;
        if (mode==='browse' && !listSwipeCanBrowse(item, this)) { canSwipe = false; }
        if (mode==='queue' && !listSwipeCanQueue(item, this)) { return; }
        if (this.dragActive || this.listSwipeRemoving) { return; }
        if (ev && ev.touches && ev.touches.length>=2) {
            this._listLongPressClear();
            this._previewSecondHoldClear();
            return;
        }
        if (typeof browseZoomNavBlocked==='function' && browseZoomNavBlocked()) {
            this._listLongPressClear();
            return;
        }
        if (mode==='queue' && this.queueDragHoldActive && this.queueDragHoldActive()) {
            return;
        }
        if (mode==='browse' && this.isTop && !this.grid.use && this.homeListSortableActive && this.homeListSortableActive()) {
            canSwipe = false;
        }

        // Remember the press target so hold-preview can capture the pointer later
        // (needed so move events keep firing while the finger slides over other rows).
        var pressEl = (ev && (ev.currentTarget || (ev.target && ev.target.closest && ev.target.closest('.list-swipe-row, .image-grid-item, .grid-scroll')))) || undefined;
        if (pressEl && pressEl.closest) {
            var hscroll = pressEl.closest('.grid-scroll');
            if (hscroll) {
                var selfHs = this;
                var onHScroll = function() {
                    selfHs._listLongPressClear();
                    selfHs._previewSecondHoldClear();
                };
                hscroll.addEventListener('scroll', onHScroll, { passive: true, once: true });
            }
        }

        // Gestures (browse):
        //  • Long-press anywhere on ROW → contextual drawer (mobile) — never preview
        //  • Double-tap with 2nd press held → soft-preview while held (20s max, fade-out)
        //  • Quick double-tap (2nd press released fast) → Play (browseClick)
        //  • Desktop: right-click / ⋮ for menu; same double-click-hold for preview
        this._listLongPressClear();
        this._previewSecondHoldClear();
        // If a previous *hold* preview is still running, stop it.
        // Sticky drawer preview keeps playing until the sheet closes or || is tapped.
        if ((this._previewHoldMode || this._previewHoldActive) && !this._previewSticky) {
            this._previewHoldUnbindDoc();
            this._previewHoldMode = false;
            if (typeof browsePreviewHoldStop==='function') {
                try { browsePreviewHoldStop(this); } catch (eStop) {}
            }
        }
        this._listLongPressOpened = false;
        this._previewHoldMode = false;
        listSwipeInstallIosSelectGuard();
        var isDesktopLayout = !!(this.$store && this.$store.state && this.$store.state.desktopLayout);
        var canPreview = mode==='browse' && typeof browseItemCanPreviewHold==='function' && browseItemCanPreviewHold(item, this);
        var now = Date.now();
        var dblMs = (typeof LMS_DOUBLE_CLICK_TIMEOUT==='number' ? LMS_DOUBLE_CLICK_TIMEOUT : 300) + 500;
        var key = listSwipePreviewKey(item, index);
        var arm = this._previewTapArm;
        var tap = this._browseTap;
        var isSecondPress = !!(canPreview && (
            (arm && arm.id===key && (now - arm.t) < dblMs) ||
            (tap && tap.id===item.id && (now - tap.t) < dblMs)
        ));

        // Second press of a double-tap: hold → preview (do not open menu)
        if (isSecondPress) {
            // iOS: double-tap-and-hold starts native text selection. Swallow it
            // immediately; a quick release still plays (listSwipeEnd synthesizes Play).
            var isTouch = !!(ev && (ev.touches || ev.pointerType==='touch' || (ev.type && ev.type.indexOf('touch')===0)));
            if (isTouch || (typeof IS_IOS!=='undefined' && IS_IOS)) {
                try { ev.preventDefault(); } catch (ePrev) {}
                this._previewBlockedIosSelect = true;
                listSwipeArmPreviewNosel(this);
                if (typeof browsePreviewClearNativeSelection==='function') {
                    browsePreviewClearNativeSelection();
                }
            }
            var selfPrev = this;
            var holdMs = (typeof BROWSE_PREVIEW_HOLD_MS==='number' ? BROWSE_PREVIEW_HOLD_MS : 180);
            // Cancel any pending single-tap / double-tap-play timer — held second
            // press is preview, not play. Quick release still lets click fire play.
            this._previewSecondHoldItem = item;
            this._previewSecondHoldIndex = index;
            this._previewSecondHoldTimer = setTimeout(function() {
                selfPrev._previewSecondHoldTimer = undefined;
                var s = selfPrev.listSwipe;
                if (s && s.active) { return; }
                // Enter soft-preview while finger stays down
                selfPrev._listLongPressOpened = true;
                selfPrev.listSwipeSuppress = true;
                selfPrev.suppressBrowseClickUntil = Date.now() + 900;
                setTimeout(function() { selfPrev.listSwipeSuppress = false; }, 900);
                if (selfPrev.clickTimer) {
                    clearTimeout(selfPrev.clickTimer);
                    selfPrev.clickTimer = undefined;
                }
                selfPrev._browseTap = undefined;
                selfPrev._previewTapArm = undefined;
                try {
                    if (navigator.vibrate) { navigator.vibrate(10); }
                } catch (eVib) {}
                selfPrev._previewHoldMode = true;
                if (s) {
                    s.previewHold = true;
                    s.longPressOnly = true;
                    if (!s.captureEl && pressEl) { s.captureEl = pressEl; }
                    if (s.pointerId!==undefined && s.captureEl && s.captureEl.setPointerCapture) {
                        try { s.captureEl.setPointerCapture(s.pointerId); } catch (eCap) {}
                    }
                }
                selfPrev._previewHoldBindDoc();
                if (typeof browsePreviewHoldStart==='function') {
                    browsePreviewHoldStart(selfPrev, item);
                }
            }, holdMs);
        }

        // Mobile long-press → contextual drawer (never used for preview)
        var wantMenuHold = mode==='browse' && !isDesktopLayout && !isSecondPress &&
            item && !item.header && item.type!='text' && item.type!='html' &&
            item.type!='search' && item.type!='entry';
        if (wantMenuHold) {
            var self = this;
            var startX = pt.x;
            var startY = pt.y;
            this._listLongPressTimer = setTimeout(function() {
                self._listLongPressTimer = undefined;
                var s = self.listSwipe;
                // Active horizontal swipe wins over long-press
                if (s && s.active) {
                    return;
                }
                if (self._browseZoomPinch || (typeof browseZoomNavBlocked==='function' && browseZoomNavBlocked())) {
                    return;
                }
                self._listLongPressOpened = true;
                self._previewTapArm = undefined;
                self._previewSecondHoldClear();
                // Suppress the synthetic click that follows touchend / mouseup
                self.listSwipeSuppress = true;
                self.suppressBrowseClickUntil = Date.now() + 750;
                setTimeout(function() { self.listSwipeSuppress = false; }, 750);
                if (self.clickTimer) {
                    clearTimeout(self.clickTimer);
                    self.clickTimer = undefined;
                }
                self._browseTap = undefined;
                try {
                    if (navigator.vibrate) { navigator.vibrate(14); }
                } catch (eVib) {}
                if (typeof self.itemMenu==='function') {
                    self.itemMenu(item, index, {
                        clientX: startX, clientY: startY,
                        pageX: startX, pageY: startY
                    });
                }
            }, 420);
        }

        if (!canSwipe) {
            // Still track finger so move/end can cancel long-press on scroll
            this.listSwipe = {
                key: listSwipeKey(item, index, mode),
                mode: mode,
                item: item,
                index: index,
                x: pt.x,
                y: pt.y,
                t: Date.now(),
                dx: 0,
                active: false,
                longPressOnly: true,
                pointer: !!(ev.pointerType || (ev.type && ev.type.indexOf('mouse')===0) || (ev.type && ev.type.indexOf('pointer')===0)),
                pointerId: ev && ev.pointerId!==undefined ? ev.pointerId : undefined,
                captureEl: pressEl
            };
            return;
        }

        this.listSwipe = {
            key: listSwipeKey(item, index, mode),
            mode: mode,
            item: item,
            index: index,
            x: pt.x,
            y: pt.y,
            t: Date.now(),
            dx: 0,
            active: false,
            pointer: !!(ev.pointerType || (ev.type && ev.type.indexOf('mouse')===0) || (ev.type && ev.type.indexOf('pointer')===0)),
            pointerId: ev && ev.pointerId!==undefined ? ev.pointerId : undefined,
            captureEl: pressEl
        };
        // Do NOT capture pointer yet — early capture breaks click / double-click
        // (queue "play now") on desktop trackpads and mice.
    },
    _listLongPressClear: function() {
        if (this._listLongPressTimer) {
            clearTimeout(this._listLongPressTimer);
            this._listLongPressTimer = undefined;
        }
    },
    _previewSecondHoldClear: function() {
        if (this._previewSecondHoldTimer) {
            clearTimeout(this._previewSecondHoldTimer);
            this._previewSecondHoldTimer = undefined;
        }
        this._previewSecondHoldItem = undefined;
        this._previewSecondHoldIndex = undefined;
    },
    /** While hold-preview is active, track finger anywhere so scrub works across rows. */
    _previewHoldBindDoc: function() {
        if (this._previewHoldDocBound) { return; }
        this._previewHoldDocBound = true;
        var self = this;
        this._previewHoldOnMove = function(ev) {
            if (!self._previewHoldMode && !self._previewHoldActive) { return; }
            // Skip redundant pointer events for touch (touchmove already handles)
            if (ev && ev.type && ev.type.indexOf('pointer')===0 && ev.pointerType==='touch') { return; }
            var pt = listSwipePointFromEvent(ev);
            if (!pt) { return; }
            if (typeof browsePreviewHoldScrub==='function') {
                browsePreviewHoldScrub(self, pt.x, pt.y);
            }
            try { ev.preventDefault(); } catch (ePrev) {}
        };
        this._previewHoldOnEnd = function(ev) {
            if (!self._previewHoldMode && !self._previewHoldActive) { return; }
            if (ev && ev.type && ev.type.indexOf('pointer')===0 && ev.pointerType==='touch') { return; }
            self.listSwipeEnd(ev);
        };
        var moveOpts = { passive: false, capture: true };
        var endOpts = { passive: true, capture: true };
        document.addEventListener('touchmove', this._previewHoldOnMove, moveOpts);
        document.addEventListener('pointermove', this._previewHoldOnMove, moveOpts);
        document.addEventListener('touchend', this._previewHoldOnEnd, endOpts);
        document.addEventListener('touchcancel', this._previewHoldOnEnd, endOpts);
        document.addEventListener('pointerup', this._previewHoldOnEnd, endOpts);
        document.addEventListener('pointercancel', this._previewHoldOnEnd, endOpts);
    },
    _previewHoldUnbindDoc: function() {
        if (!this._previewHoldDocBound) { return; }
        this._previewHoldDocBound = false;
        var moveOpts = { capture: true };
        var endOpts = { capture: true };
        if (this._previewHoldOnMove) {
            document.removeEventListener('touchmove', this._previewHoldOnMove, moveOpts);
            document.removeEventListener('pointermove', this._previewHoldOnMove, moveOpts);
            this._previewHoldOnMove = undefined;
        }
        if (this._previewHoldOnEnd) {
            document.removeEventListener('touchend', this._previewHoldOnEnd, endOpts);
            document.removeEventListener('touchcancel', this._previewHoldOnEnd, endOpts);
            document.removeEventListener('pointerup', this._previewHoldOnEnd, endOpts);
            document.removeEventListener('pointercancel', this._previewHoldOnEnd, endOpts);
            this._previewHoldOnEnd = undefined;
        }
    },
    listSwipeMove: function(ev) {
        var s = this.listSwipe;
        if (!s) { return; }
        if (s.mode==='queue' && this.queueDragHoldActive && this.queueDragHoldActive()) {
            this._listLongPressClear();
            this.listSwipe = null;
            return;
        }
        if (s.mode==='browse' && this.isTop && !this.grid.use && this.homeListSortableActive && this.homeListSortableActive()) {
            this._listLongPressClear();
            this.listSwipe = null;
            return;
        }
        var pt = listSwipePointFromEvent(ev);
        if (!pt) { return; }
        // Hold-scrub preview: finger slides across items → switch sample, no scroll/swipe
        if (this._previewHoldMode || s.previewHold || this._previewHoldActive) {
            s.previewHold = true;
            s.longPressOnly = true;
            if (typeof browsePreviewHoldScrub==='function') {
                browsePreviewHoldScrub(this, pt.x, pt.y);
            }
            try { ev.preventDefault(); } catch (ePrev) {}
            return;
        }
        var dx = pt.x - s.x;
        var dy = pt.y - s.y;
        if (!s.active) {
            // Phone finger jitter is larger than desktop — keep long-press alive
            // unless the user clearly scrolls or starts a swipe (~36px).
            var absX = Math.abs(dx);
            var absY = Math.abs(dy);
            if (absX < 14 && absY < 14) { return; }
            // Second-press hold: ignore iOS selection jitter; only drop on a real scroll
            if (this._previewSecondHoldTimer) {
                if (absY >= 72 && absY > absX) {
                    this._previewSecondHoldClear();
                }
                try { ev.preventDefault(); } catch (eHold) {}
                return;
            }
            // Album/track rows are swipeable — do not kill long-press on finger
            // jitter. Cancel only on a clear vertical scroll; a real swipe
            // (s.active below) also cancels via the timer callback.
            // long-press-only trackers never become a swipe
            // Home / non-swipeable rows: allow more finger jitter so long-press
            // can open the contextual drawer without being cancelled.
            if (s.longPressOnly) {
                if (absX >= 48 || absY >= 48) {
                    this._listLongPressClear();
                    this.listSwipe = null;
                }
                return;
            }
            // Not yet enough for swipe, but keep tracking (long-press may still fire)
            if (absX < 14 && absY < 14) { return; }
            // Need clear horizontal intent before activating swipe
            if (absX < 18) { return; }
            if (s.mode==='queue') {
                if (Date.now() - (s.t || 0) > 400) {
                    this.listSwipe = null;
                    return;
                }
                if (Math.abs(dy) >= Math.abs(dx)) {
                    this.listSwipe = null;
                    return;
                }
            }
            if (s.mode==='browse' && this.isTop && !this.grid.use) {
                if (Date.now() - (s.t || 0) > 400) {
                    this.listSwipe = null;
                    return;
                }
                if (Math.abs(dy) >= Math.abs(dx)) {
                    this.listSwipe = null;
                    return;
                }
            }
            // Vertical scroll wins — only abandon the gesture after a clear scroll
            // (preview hold is handled earlier and never reaches here)
            if (absY > absX * 1.15 && absY >= 36) {
                this._listLongPressClear();
                this.listSwipe = null;
                return;
            }
            if (absY > absX * 1.15) {
                // Small vertical drift: keep waiting for long-press
                return;
            }
            // Queue: only left
            if (s.mode==='queue' && dx > 0) {
                this.listSwipe = null;
                return;
            }
            s.active = true;
            this._listLongPressClear();
            bus.$emit('browseItemSwipeActive', true);
            // Capture only after a real horizontal swipe is established
            if (s.pointerId!==undefined && ev && ev.currentTarget && ev.currentTarget.setPointerCapture) {
                try {
                    ev.currentTarget.setPointerCapture(s.pointerId);
                    s.captureEl = ev.currentTarget;
                } catch (e) {}
            }
        }
        // Clamp
        if (s.mode==='queue') {
            dx = Math.max(-LIST_SWIPE_MAX, Math.min(0, dx));
        } else {
            dx = Math.max(-LIST_SWIPE_MAX, Math.min(LIST_SWIPE_MAX, dx));
        }
        s.dx = dx;
        // Force reactivity
        this.listSwipe = Object.assign({}, s);
        try { if (s.active) { ev.preventDefault(); } } catch (e) {}
    },
    listSwipeEnd: function(ev) {
        // Hold-to-preview: finger up → stop sample immediately (not sticky drawer preview)
        if ((this._previewHoldMode || (this.listSwipe && this.listSwipe.previewHold) || this._previewHoldActive) && !this._previewSticky) {
            this._listLongPressClear();
            this._previewSecondHoldClear();
            this._previewHoldUnbindDoc();
            this._previewHoldMode = false;
            this._previewTapArm = undefined;
            this._previewBlockedIosSelect = false;
            if (typeof browsePreviewUnbindSelectBlock==='function') {
                browsePreviewUnbindSelectBlock(this);
            }
            var sHold = this.listSwipe;
            listSwipeReleaseCapture(sHold, ev);
            if (typeof browsePreviewHoldStop==='function') {
                browsePreviewHoldStop(this);
            }
            this.listSwipe = null;
            this._listLongPressOpened = true; // swallow click
            this.listSwipeSuppress = true;
            this.suppressBrowseClickUntil = Date.now() + 400;
            setTimeout(function() { this.listSwipeSuppress = false; this._listLongPressOpened = false; }.bind(this), 400);
            bus.$emit('browseItemSwipeActive', false);
            return;
        }
        // Second press released before preview threshold → Play.
        // On iOS we preventDefault the 2nd touchstart (to block text selection),
        // so the synthetic click never arrives — fire Play here instead.
        var wasSecondArm = !!this._previewSecondHoldTimer;
        var blockedSelect = !!this._previewBlockedIosSelect;
        this._previewBlockedIosSelect = false;
        if (!this._previewSticky && typeof browsePreviewUnbindSelectBlock==='function') {
            browsePreviewUnbindSelectBlock(this);
        }
        this._previewSecondHoldClear();

        // If long-press already opened the menu, keep suppress and drop swipe state.
        // Leave _listLongPressOpened true so the subsequent click is swallowed.
        if (this._listLongPressOpened) {
            this._listLongPressClear();
            this._previewTapArm = undefined;
            this.listSwipe = null;
            bus.$emit('browseItemSwipeActive', false);
            return;
        }
        this._listLongPressClear();
        var s = this.listSwipe;
        if (!s) { return; }
        // Arm first-tap for double-tap-hold preview (browse only, non-swipe)
        if (!wasSecondArm && s.mode==='browse' && s.item && !s.active &&
            typeof browseItemCanPreviewHold==='function' && browseItemCanPreviewHold(s.item, this)) {
            this._previewTapArm = { id: listSwipePreviewKey(s.item, s.index), t: Date.now() };
            listSwipeArmPreviewNosel(this);
        } else if (wasSecondArm) {
            // Quick second tap: clear arm so a 3rd press does not re-preview by accident
            this._previewTapArm = undefined;
            if (blockedSelect && !s.active && s.item) {
                if (this.clickTimer) {
                    clearTimeout(this.clickTimer);
                    this.clickTimer = undefined;
                }
                this._browseTap = undefined;
                this.listSwipeSuppress = true;
                this.suppressBrowseClickUntil = Date.now() + 380;
                setTimeout(function() { this.listSwipeSuppress = false; }.bind(this), 380);
                var playItem = s.item;
                var playIndex = s.index;
                var playAct = (playItem.menu && playItem.menu.indexOf(PLAY_ALL_ACTION)>=0) ? PLAY_ALL_ACTION : PLAY_ACTION;
                listSwipeReleaseCapture(s, ev);
                this.listSwipe = null;
                bus.$emit('browseItemSwipeActive', false);
                try {
                    if (typeof this.itemAction === 'function') {
                        this.itemAction(playAct, playItem, playIndex, ev);
                    }
                } catch (ePlay) {}
                return;
            }
        }
        var pt = listSwipePointFromEvent(ev);
        var dx = s.dx || 0;
        if (pt && s.active) {
            dx = pt.x - s.x;
            if (s.mode==='queue') {
                dx = Math.max(-LIST_SWIPE_MAX, Math.min(0, dx));
            } else {
                dx = Math.max(-LIST_SWIPE_MAX, Math.min(LIST_SWIPE_MAX, dx));
            }
        }
        var active = !!s.active;
        var item = s.item;
        var index = s.index;
        var mode = s.mode;
        var key = s.key;
        listSwipeReleaseCapture(s, ev);
        this.listSwipe = null;
        bus.$emit('browseItemSwipeActive', false);
        if (!active) { return; }

        var committed = mode==='queue'
            ? (dx <= -LIST_SWIPE_COMMIT)
            : (dx <= -LIST_SWIPE_COMMIT || dx >= LIST_SWIPE_COMMIT);

        // Only swallow the following click for a *committed* swipe.
        // Incomplete drags used to set suppress and kill queue double-click / play.
        if (committed) {
            this.listSwipeSuppress = true;
            setTimeout(function() { this.listSwipeSuppress = false; }.bind(this), 380);
            // Prevent page swipe-back / nav from treating this gesture as go-back
            bus.$emit('browseItemSwipeHandled');
        }

        if (mode==='queue') {
            if (committed) {
                this.listSwipeDoRemove(item, index, key);
            }
            return;
        }
        // browse
        if (dx <= -LIST_SWIPE_COMMIT) {
            // left → play next
            this.listSwipeFlash(key, 'next');
            try {
                if (typeof this.itemAction === 'function') {
                    this.itemAction(item.header ? INSERT_ALL_ACTION : INSERT_ACTION, item, index, ev);
                }
            } catch (e) {}
        } else if (dx >= LIST_SWIPE_COMMIT) {
            // right → append to queue
            this.listSwipeFlash(key, 'add');
            try {
                if (typeof this.itemAction === 'function') {
                    this.itemAction(item.header ? ADD_ALL_ACTION : ADD_ACTION, item, index, ev);
                }
            } catch (e) {}
        }
    },
    /** Mac trackpad: horizontal two-finger swipe arrives as wheel deltaX */
    listSwipeWheel: function(item, index, mode, ev) {
        if (!ev || (mode==='browse' && !listSwipeCanBrowse(item, this)) || (mode==='queue' && !listSwipeCanQueue(item, this))) {
            return;
        }
        if (this.dragActive || this.listSwipeRemoving) { return; }
        var dx = ev.deltaX || 0;
        var dy = ev.deltaY || 0;
        // Require clear horizontal intent
        if (Math.abs(dx) < 18 || Math.abs(dx) <= Math.abs(dy) * 1.05) {
            return;
        }
        try { ev.preventDefault(); } catch (e) {}
        var key = listSwipeKey(item, index, mode);
        // Accumulate small trackpad deltas into a commit
        if (!this._listSwipeWheelAcc || this._listSwipeWheelAcc.key!==key) {
            this._listSwipeWheelAcc = { key: key, sum: 0, t: Date.now() };
        }
        if (Date.now() - this._listSwipeWheelAcc.t > 450) {
            this._listSwipeWheelAcc.sum = 0;
        }
        this._listSwipeWheelAcc.t = Date.now();
        this._listSwipeWheelAcc.sum += dx;
        var sum = this._listSwipeWheelAcc.sum;
        // Visual feedback
        this.listSwipe = {
            key: key, mode: mode, item: item, index: index,
            x: 0, y: 0,
            dx: Math.max(-LIST_SWIPE_MAX, Math.min(LIST_SWIPE_MAX, mode==='queue' ? Math.min(0, -Math.abs(sum)) : -sum)),
            active: true
        };
        clearTimeout(this._listSwipeWheelTimer);
        this._listSwipeWheelTimer = setTimeout(function() {
            var acc = this._listSwipeWheelAcc ? this._listSwipeWheelAcc.sum : 0;
            this._listSwipeWheelAcc = null;
            this.listSwipe = null;
            if (mode==='queue') {
                if (acc > 48 || acc < -48) { // either direction maps to remove on queue for trackpad
                    this.listSwipeDoRemove(item, index, key);
                }
                return;
            }
            if (acc > 48) {
                // swipe content right? trackpad deltaX positive often means fingers moved right → content left visually
                this.listSwipeFlash(key, 'next');
                try { if (typeof this.itemAction === 'function') {
                    this.itemAction(item.header ? INSERT_ALL_ACTION : INSERT_ACTION, item, index, ev);
                } } catch (e) {}
            } else if (acc < -48) {
                this.listSwipeFlash(key, 'add');
                try { if (typeof this.itemAction === 'function') {
                    this.itemAction(item.header ? ADD_ALL_ACTION : ADD_ACTION, item, index, ev);
                } } catch (e) {}
            }
        }.bind(this), 90);
    },
    listSwipeFlash: function(key, kind) {
        this.listSwipeFlashKey = key;
        this.listSwipeFlashKind = kind;
        clearTimeout(this._listSwipeFlashTimer);
        this._listSwipeFlashTimer = setTimeout(function() {
            this.listSwipeFlashKey = null;
            this.listSwipeFlashKind = null;
        }.bind(this), 320);
    },
    listSwipeDoRemove: function(item, index, key) {
        // Contract row, then delete
        this.listSwipeRemoving = key;
        var doDelete = function() {
            try {
                if (typeof this.itemAction === 'function') {
                    this.itemAction(REMOVE_ACTION, item, index);
                } else {
                    bus.$emit('playerCommand', ["playlist", "delete", index]);
                }
            } catch (e) {}
            this.listSwipeRemoving = null;
        }.bind(this);
        setTimeout(doDelete, 240);
    },
    listSwipeStyle: function(item, index, mode) {
        var key = listSwipeKey(item, index, mode);
        if (this.listSwipeRemoving === key) {
            return {
                transform: 'translate3d(-110%,0,0)',
                opacity: '0',
                transition: 'transform 0.22s cubic-bezier(0.32,0.72,0,1), opacity 0.18s ease'
            };
        }
        var s = this.listSwipe;
        if (!s || s.key !== key || !s.dx) {
            return { transition: 'transform 0.22s cubic-bezier(0.32,0.72,0,1)' };
        }
        return {
            transform: 'translate3d(' + s.dx + 'px,0,0)',
            transition: s.active ? 'none' : 'transform 0.22s cubic-bezier(0.32,0.72,0,1)',
            willChange: 'transform'
        };
    },
    listSwipeRowClass: function(item, index, mode) {
        var key = listSwipeKey(item, index, mode);
        var s = this.listSwipe;
        var cls = {
            'list-swipe-row': true,
            'list-swipe-enabled': mode==='browse' ? listSwipeCanBrowse(item, this) : listSwipeCanQueue(item, this),
            'list-swipe-active': s && s.key===key && s.active,
            'list-swipe-removing': this.listSwipeRemoving===key,
            'list-swipe-flash-next': this.listSwipeFlashKey===key && this.listSwipeFlashKind==='next',
            'list-swipe-flash-add': this.listSwipeFlashKey===key && this.listSwipeFlashKind==='add'
        };
        if (s && s.key===key && s.dx) {
            cls['list-swipe-left'] = s.dx < 0;
            cls['list-swipe-right'] = s.dx > 0;
            cls['list-swipe-armed'] = Math.abs(s.dx) >= LIST_SWIPE_COMMIT;
        }
        return cls;
    },
    listSwipeClickGuard: function() {
        if (this.listSwipeSuppress) {
            this.listSwipeSuppress = false;
            return true;
        }
        return false;
    }
};

function listSwipeData() {
    return {
        listSwipe: null,
        listSwipeSuppress: false,
        listSwipeRemoving: null,
        listSwipeFlashKey: null,
        listSwipeFlashKind: null
    };
}

try {
    if (document.readyState==='loading') {
        document.addEventListener('DOMContentLoaded', listSwipeInstallIosSelectGuard);
    } else {
        listSwipeInstallIosSelectGuard();
    }
} catch (eGuard) {}
