/**
 * LMS-Material
 *
 * Copyright (c) 2018-2026 Craig Drummond <craig.p.drummond@gmail.com>
 * MIT license.
 */
'use strict';

Vue.component('lms-bottomnav', {
    template: `
<v-footer class="lms-footer" v-bind:class="{'trans-footer':useTransparentFooter, 'nav-text':nowPlayingFull&&!coloredToolbars, 'nav-shortcut-footer':useShortcutNav}" id="nav-bar">
 <!-- One/dual-line miniplayer modes: fixed browse/queue + search, then scrollable shortcuts -->
 <div v-if="useShortcutNav" class="nav-shortcut-bar" v-bind:class="{'nav-shortcuts-overflow':shortcutOverflow, 'nav-shortcuts-drop':shortcutDropHover}" @dragover.prevent="onShortcutDragOver" @dragenter.prevent="onShortcutDragEnter" @dragleave="onShortcutDragLeave" @drop.prevent="onShortcutDrop">
  <div class="nav-shortcut-fixed">
   <v-btn flat icon class="nav-page-toggle" v-bind:class="{'nav-shortcut-active':pageToggleActive}" @click="toggleBrowseQueue" :title="pageToggleTitle">
    <v-icon v-if="pageToggleActive" class="nav-shortcut-icon">{{pageToggleActiveIcon}}</v-icon>
    <img v-else class="nav-svg-img nav-shortcut-icon" :src="pageToggleInactiveSvg | svgIcon(darkUi|(coloredToolbars&&!useTransparentFooter))" oncontextmenu="return false;"></img>
   </v-btn>
   <label for="browse-search-input" class="v-btn v-btn--flat v-btn--icon nav-search-fixed" v-bind:class="{'nav-shortcut-active':searchShortcutActive}" @click.stop="openSearch" :title="searchTitle" v-if="showSearchBtn">
    <img class="nav-svg-img nav-shortcut-icon" :src="searchSvg | svgIcon(darkUi|(coloredToolbars&&!useTransparentFooter))" oncontextmenu="return false;"></img>
   </label>
  </div>
  <div class="nav-shortcut-sep" aria-hidden="true"></div>
  <div class="nav-shortcuts-wrap" v-bind:class="{'nav-shortcuts-overflow':shortcutOverflow, 'nav-shortcuts-can-left':shortcutCanLeft, 'nav-shortcuts-can-right':shortcutCanRight}">
   <div class="nav-shortcuts-fade" aria-hidden="true"></div>
   <div class="nav-shortcuts-scroll" ref="shortcutScroll" @scroll.passive="updateShortcutOverflow" @touchstart.passive="shortcutTouchStart" @touchmove.passive="shortcutTouchMove" @touchend.passive="shortcutTouchEnd" @touchcancel.passive="shortcutTouchEnd">
    <v-btn flat icon class="nav-shortcut-btn" v-for="(item, index) in scrollShortcuts" :key="'ns-'+item.id+'-'+index"
     @click="openShortcut(item, $event)" :title="item.title"
     :draggable="canUnpinShortcut(item)"
     @dragstart="shortcutHtmlDragStart(item, $event)"
     @dragend="shortcutHtmlDragEnd(item, $event)"
     @touchstart="shortcutBtnTouchStart(item, $event)"
     @touchmove="shortcutBtnTouchMove(item, $event)"
     @touchend="shortcutBtnTouchEnd(item, $event)"
     @touchcancel="shortcutBtnTouchEnd(item, $event)"
     v-bind:class="{'nav-shortcut-active':isShortcutActive(item), 'nav-shortcut-player-prefs':item.id==PLAYER_PREFS_SHORTCUT, 'nav-shortcut-dragging':shortcutGhost && shortcutGhost.id==item.id}">
     <v-icon v-if="undefined!=item.icon" class="nav-shortcut-icon">{{item.icon}}</v-icon>
     <img v-else-if="item.svg" class="nav-svg-img nav-shortcut-icon" :src="item.svg | svgIcon(darkUi|(coloredToolbars&&!useTransparentFooter))" oncontextmenu="return false;"></img>
    </v-btn>
   </div>
   <div class="nav-shortcuts-fade-right" aria-hidden="true"></div>
  </div>
 </div>
 <!-- Classic three-tab nav -->
 <v-bottom-nav v-else class="lms-bottom-nav" :active="activeBtn">
  <template v-for="(item, index) in items">
   <v-btn flat class="lms-bottom-nav-button" @click="btnPressed(index)" v-bind:class="{'active-nav': activeBtn==index, 'inactive-nav': activeBtn!=index}">
    <span>{{item.text}}</span>
    <div class="pill-bg" v-if="activeBtn==index && item.page=='now-playing' && pillPalette"></div>
    <div class="pill" v-bind:class="{'pill-ct':coloredToolbars}" v-if="activeBtn==index" v-longpress:nomove="icnPressed" :id="'navbtn-'+index"></div>
    <v-icon v-if="activeBtn==index">{{item.active}}</v-icon>
    <img v-else class="nav-svg-img" :src="item.inactive | svgIcon(darkUi|(coloredToolbars&&!useTransparentFooter))" oncontextmenu="return false;"></img>
   </v-btn>
  </template>
 </v-bottom-nav>
</v-footer>
`,
    props: [],
    data() {
        return {
            items: [],
            infoOpen: false,
            pillPalette: false,
            shortcuts: [],
            activeShortcutId: HOME_SHORTCUT,
            shortcutOverflow: false,
            shortcutCanLeft: false,
            shortcutCanRight: false,
            shortcutTouchActive: false,
            shortcutsCollapsed: false,
            shortcutDropHover: false,
            shortcutGhost: null,
            npPlayerPrefsAvailable: false,
            npPlayerPrefsTitle: ''
        }
    },
    created() {
        bus.$on('currentCover', function(url) {
            this.pillPalette = undefined!=url && !url.includes(DEFAULT_COVER) && !url.includes(LMS_BLANK_COVER) && !url.includes(DEFAULT_RADIO_COVER);
        }.bind(this));
        bus.$emit('getCurrentCover');
        bus.$on('langChanged', function() {
            this.initItems();
            if (!this.npPlayerPrefsTitle) {
                this.npPlayerPrefsTitle = i18n('Player options');
            }
        }.bind(this));
        this.initItems();
        this.npPlayerPrefsTitle = i18n('Player options');
        bus.$on('infoDialog', function(val) {
            this.infoOpen = val;
        }.bind(this));
        bus.$on('homeScreenItems', function(view) {
            this.updateShortcuts(view);
        }.bind(this));
        // Show player prefs/presets in shortcut strip when the current player supports it
        bus.$on('npPlayerPrefsAvailable', function(available, title) {
            this.npPlayerPrefsAvailable = !!available;
            if (title) {
                this.npPlayerPrefsTitle = title;
            }
            this.$nextTick(function() {
                this.updateShortcutOverflow();
            }.bind(this));
        }.bind(this));
        // Highlight currently activated space (top-level browse root / home)
        bus.$on('browseShortcutActive', function(id) {
            if (undefined!=id) {
                this.activeShortcutId = id;
            }
        }.bind(this));
        bus.$on('shortcutPinDrag', function(msg) {
            this.onBrowsePinDrag(msg);
        }.bind(this));
        bus.$on('shortcutSizeChanged', function() {
            this.$nextTick(function() {
                this.updateShortcutOverflow();
            }.bind(this));
        }.bind(this));
        bus.$on('browse-shortcut', function(id) {
            if (undefined!=id) {
                this.activeShortcutId = id;
            }
        }.bind(this));
        // Auto-collapse shortcuts while browsing / queue scrolling (mobile pref)
        bus.$on('mobileContentScroll', function(scrollTop) {
            this.onContentScroll(scrollTop);
        }.bind(this));
        if (!IS_MOBILE) {
            bindKey('f1');
            bindKey('f2');
            bindKey('f3');
            bus.$on('keyboard', function(key, modifier) {
                if (!this.$store.state.keyboardControl || undefined!=modifier || this.$store.state.openDialogs.length>0 || this.$store.state.visibleMenus.size>0) {
                    return;
                }
                if (2==key.length && 'f'==key[0]) {
                    let idx = parseInt(key[1])-1;
                    if (idx>=0 && idx<this.items.length) {
                        if (this.$store.state.page!=this.items[idx].page) {
                            this.tabPressed(this.items[idx].page, false);
                            return;
                        }
                    }
                }
            }.bind(this));
        }
        this._shortcutResize = function() {
            this.updateShortcutOverflow();
        }.bind(this);
        window.addEventListener('resize', this._shortcutResize, PASSIVE_SUPPORTED ? { passive: true } : false);
    },
    mounted() {
        // Component is v-if="!desktopLayout" — created only when switching to mobile.
        // homeScreenItems was already emitted while on desktop; re-request the strip.
        this.$nextTick(function() {
            bus.$emit('getHomeScreenItems');
            bus.$emit('requestNpPlayerPrefsAvailable');
            this.updateShortcutOverflow();
            this.observeShortcutScroll();
            this.bindShortcutPinch();
        }.bind(this));
    },
    beforeDestroy() {
        if (this._scGhostEl && this._scGhostEl.parentNode) {
            this._scGhostEl.parentNode.removeChild(this._scGhostEl);
            this._scGhostEl = undefined;
        }
        if (this._shortcutResize) {
            window.removeEventListener('resize', this._shortcutResize);
        }
        if (this._shortcutOverflowTimer) {
            clearTimeout(this._shortcutOverflowTimer);
        }
        if (this._shortcutResizeObserver) {
            this._shortcutResizeObserver.disconnect();
            this._shortcutResizeObserver = undefined;
        }
        if (this._shortcutTouchTimer) {
            clearTimeout(this._shortcutTouchTimer);
        }
        if (this._shortcutExpandTimer) {
            clearTimeout(this._shortcutExpandTimer);
        }
        this.setShortcutsCollapsed(false);
        bus.$emit('shortcutScrollTouch', false);
    },
    methods: {
        initItems() {
            this.items = [
                          { text: i18n('Browse'),  page: 'browse',      active:'library_music', inactive:'library-music-outline'},
                          { text: i18n('Playing'), page: 'now-playing', active:'music_note',    inactive:'music-note-outline' },
                          { text: i18n('Queue'),   page: 'queue',       active:'queue_music',   inactive:'queue_music_outline' },
                         ];
        },
        updateShortcuts(view) {
            this.shortcuts = [];
            if (undefined!=view && undefined!=view.top) {
                for (let i=0, items=view.top, len=items.length; i<len; ++i) {
                    let item = items[i];
                    if ((undefined==item.menu || item.menu.length<1 || item.menu[0]!=PLAY_ACTION) && item.stdItem!=STD_ITEM_RANDOM_MIX && !view.hidden.has(item.id) && item.id!=START_RANDOM_MIX_ID && (item.id!=TOP_RADIO_ID || !lmsOptions.combineAppsAndRadio)) {
                        this.shortcuts.push({id:item.id, icon:item.icon, svg:item.svg, title:item.title, isPinned:!!item.isPinned});
                    }
                }
                // Home first in the scrollable strip (search is fixed separately)
                if (this.shortcuts.length>0) {
                    this.shortcuts.unshift({id:HOME_SHORTCUT, icon:'home', title:i18n('Home')});
                } else {
                    this.shortcuts.push({id:HOME_SHORTCUT, icon:'home', title:i18n('Home')});
                }
            }
            this.$nextTick(function() {
                this.updateShortcutOverflow();
                this.observeShortcutScroll();
            }.bind(this));
        },
        observeShortcutScroll() {
            if (undefined==window.ResizeObserver) {
                return;
            }
            let el = this.$refs.shortcutScroll;
            if (!el) {
                return;
            }
            if (this._shortcutResizeObserver) {
                this._shortcutResizeObserver.disconnect();
            }
            this._shortcutResizeObserver = new ResizeObserver(function() {
                this.updateShortcutOverflow();
            }.bind(this));
            this._shortcutResizeObserver.observe(el);
        },
        setShortcutScrollTouch(active) {
            this.shortcutTouchActive = active;
            bus.$emit('shortcutScrollTouch', active);
        },
        canUnpinShortcut(item) {
            return !!(item && item.isPinned && item.id!=HOME_SHORTCUT && item.id!=PLAYER_PREFS_SHORTCUT);
        },
        shortcutBarRect() {
            let el = this.$el && this.$el.querySelector ? this.$el.querySelector('.nav-shortcut-bar') : null;
            return el ? el.getBoundingClientRect() : null;
        },
        pointInShortcutBar(x, y) {
            let r = this.shortcutBarRect();
            if (!r) { return false; }
            return x>=r.left && x<=r.right && y>=r.top && y<=r.bottom;
        },
        setShortcutGhost(item, x, y) {
            if (!item) {
                this.shortcutGhost = null;
                if (this._scGhostEl) {
                    this._scGhostEl.style.display = 'none';
                }
                return;
            }
            this.shortcutGhost = { id: item.id, icon: item.icon, svg: item.svg };
            let el = this._scGhostEl;
            if (!el) {
                el = document.createElement('div');
                el.className = 'nav-shortcut-ghost';
                document.body.appendChild(el);
                this._scGhostEl = el;
            }
            el.innerHTML = '';
            if (item.icon) {
                let ic = document.createElement('i');
                ic.className = 'v-icon material-icons nav-shortcut-icon';
                ic.textContent = item.icon;
                el.appendChild(ic);
            }
            el.style.display = 'flex';
            el.style.left = x + 'px';
            el.style.top = y + 'px';
        },
        unpinShortcut(item) {
            if (!this.canUnpinShortcut(item)) {
                return;
            }
            bus.$emit('unpinShortcutId', item.id);
        },
        onShortcutDragEnter() {
            if (undefined!=window.mskBrowseDrag || window.mskShortcutDrag) {
                this.shortcutDropHover = true;
            }
        },
        onShortcutDragOver() {
            if (undefined!=window.mskBrowseDrag || window.mskShortcutDrag) {
                this.shortcutDropHover = true;
            }
        },
        onShortcutDragLeave() {
            this.shortcutDropHover = false;
        },
        onShortcutDrop() {
            this.shortcutDropHover = false;
            if (window.mskShortcutDrag) {
                this._scDroppedOnBar = true;
                return;
            }
            let idx = window.mskBrowseDrag;
            if (undefined==idx) {
                return;
            }
            bus.$emit('pinBrowseDragItem', idx);
        },
        shortcutHtmlDragStart(item, ev) {
            if (!this.canUnpinShortcut(item)) {
                try { ev.preventDefault(); } catch (e) {}
                return;
            }
            this._scDroppedOnBar = false;
            window.mskShortcutDrag = item.id;
            this._scHtmlDragItem = item;
            try {
                ev.dataTransfer.effectAllowed = 'move';
                ev.dataTransfer.setData('text/plain', item.title || '');
            } catch (e2) {}
        },
        shortcutHtmlDragEnd(item) {
            let stay = !!this._scDroppedOnBar;
            this._scDroppedOnBar = false;
            window.mskShortcutDrag = undefined;
            this._scHtmlDragItem = undefined;
            this.shortcutDropHover = false;
            if (!stay) {
                this.unpinShortcut(item);
            }
        },
        shortcutBtnTouchStart(item, ev) {
            if (!ev || !ev.touches || !ev.touches[0]) {
                return;
            }
            if (!this.canUnpinShortcut(item)) {
                this._scDrag = undefined;
                return;
            }
            let t = ev.touches[0];
            this._scDrag = { item: item, x: t.clientX, y: t.clientY, started: false };
        },
        shortcutBtnTouchMove(item, ev) {
            let d = this._scDrag;
            if (!d || !ev.touches || !ev.touches[0]) {
                return;
            }
            let t = ev.touches[0];
            let dx = t.clientX - d.x;
            let dy = t.clientY - d.y;
            if (!d.started) {
                if (Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy) * 1.15) {
                    this._scDrag = undefined;
                    return;
                }
                if (Math.abs(dy) > 16 || Math.abs(dx) > 22) {
                    d.started = true;
                    this._scDragSkipClick = true;
                    this.setShortcutScrollTouch(true);
                    try { ev.preventDefault(); } catch (e) {}
                    this.setShortcutGhost(d.item, t.clientX, t.clientY);
                }
                return;
            }
            try { ev.preventDefault(); } catch (e2) {}
            this.setShortcutGhost(d.item, t.clientX, t.clientY);
            this.shortcutDropHover = this.pointInShortcutBar(t.clientX, t.clientY);
        },
        shortcutBtnTouchEnd(item, ev) {
            let d = this._scDrag;
            this._scDrag = undefined;
            if (!d || !d.started) {
                this.setShortcutGhost(null);
                this.shortcutDropHover = false;
                return;
            }
            let t = (ev && ev.changedTouches && ev.changedTouches[0]) ? ev.changedTouches[0] : null;
            let x = t ? t.clientX : 0;
            let y = t ? t.clientY : 0;
            let onBar = this.pointInShortcutBar(x, y);
            this.setShortcutGhost(null);
            this.shortcutDropHover = false;
            this._scDragSkipClick = true;
            setTimeout(function() { this._scDragSkipClick = false; }.bind(this), 400);
            if (!onBar) {
                this.unpinShortcut(d.item);
            }
        },
        onBrowsePinDrag(msg) {
            if (!msg || !msg.phase) {
                return;
            }
            if (msg.phase==='start' || msg.phase==='move') {
                this.setShortcutGhost({ id: 'pin-drag', icon: msg.icon, svg: msg.svg }, msg.x, msg.y);
                this.shortcutDropHover = this.pointInShortcutBar(msg.x, msg.y);
                return;
            }
            if (msg.phase==='end') {
                let onBar = this.pointInShortcutBar(msg.x, msg.y);
                this.setShortcutGhost(null);
                this.shortcutDropHover = false;
                if (onBar && undefined!=msg.index) {
                    bus.$emit('pinBrowseDragItem', msg.index);
                }
            }
        },
        bindShortcutPinch() {
            let el = this.$el && this.$el.querySelector ? this.$el.querySelector('.nav-shortcut-bar') : null;
            if (!el || el._scPinchBound) {
                return;
            }
            el._scPinchBound = true;
            let self = this;
            let opts = { passive: false };
            el.addEventListener('gesturestart', function(ev) {
                try { ev.preventDefault(); } catch (e) {}
                self._scPinchBase = clampShortcutSize(self.$store.state.shortcutSize);
                self._scPinchLive = self._scPinchBase;
            }, opts);
            el.addEventListener('gesturechange', function(ev) {
                try { ev.preventDefault(); } catch (e) {}
                let scale = ev.scale || 1;
                let delta = Math.round((scale - 1) / 0.14);
                let next = clampShortcutSize((self._scPinchBase || 3) + delta);
                if (next !== self._scPinchLive) {
                    self._scPinchLive = next;
                    applyShortcutSize(next);
                }
            }, opts);
            el.addEventListener('gestureend', function(ev) {
                try { ev.preventDefault(); } catch (e) {}
                let n = clampShortcutSize(self._scPinchLive || self._scPinchBase || self.$store.state.shortcutSize);
                self.$store.commit('setUiSettings', { shortcutSize: n });
            }, opts);
        },
        shortcutTouchStart() {
            this.setShortcutScrollTouch(true);
        },
        shortcutTouchMove() {
            this.setShortcutScrollTouch(true);
        },
        shortcutTouchEnd() {
            if (this._shortcutTouchTimer) {
                clearTimeout(this._shortcutTouchTimer);
            }
            this._shortcutTouchTimer = setTimeout(function() {
                this._shortcutTouchTimer = undefined;
                this.setShortcutScrollTouch(false);
            }.bind(this), 120);
        },
        updateShortcutOverflow() {
            if (this._shortcutOverflowTimer) {
                clearTimeout(this._shortcutOverflowTimer);
            }
            this._shortcutOverflowTimer = setTimeout(function() {
                let el = this.$refs.shortcutScroll;
                if (!el) {
                    this.shortcutOverflow = false;
                    this.shortcutCanLeft = false;
                    this.shortcutCanRight = false;
                    return;
                }
                let maxScroll = el.scrollWidth - el.clientWidth;
                this.shortcutOverflow = maxScroll > 2;
                this.shortcutCanLeft = el.scrollLeft > 2;
                this.shortcutCanRight = maxScroll - el.scrollLeft > 2;
            }.bind(this), 30);
        },
        isShortcutActive(item) {
            if (!item) {
                return false;
            }
            // Player prefs is an action, not a browse destination
            if (item.id==PLAYER_PREFS_SHORTCUT) {
                return false;
            }
            // Queue uses the page toggle. Now Playing has no browse highlight.
            if (this.$store.state.page!='browse') {
                return false;
            }
            return item.id==this.activeShortcutId;
        },
        openShortcut(item, ev) {
            if (this._scDragSkipClick) {
                this._scDragSkipClick = false;
                return;
            }
            if (item && item.id==PLAYER_PREFS_SHORTCUT) {
                // Always open/toggle the player options bottom drawer (presets/input/DSP)
                if (ev) {
                    try { ev.stopPropagation(); } catch (e) {}
                    try { ev.preventDefault(); } catch (e2) {}
                }
                bus.$emit('toggleNpPlayerPrefs', ev);
                return;
            }
            if (this.$store.state.visibleMenus.size>0) {
                return;
            }
            this.activeShortcutId = item.id;
            bus.$emit('browse-shortcut', item.id, {title: item.title, isPinned: !!item.isPinned});
        },
        openSearch() {
            window._mskLibSearchArm = true;
            if (typeof focusBrowseSearchInput==='function') {
                focusBrowseSearchInput();
            }
            bus.$emit('browse-shortcut', SEARCH_SHORTCUT);
        },
        toggleBrowseQueue() {
            if (this.$store.state.visibleMenus.size>0) {
                return;
            }
            let page = this.$store.state.page;
            if ('queue'==page) {
                this.$store.commit('setPage', 'browse');
            } else if ('browse'==page) {
                this.$store.commit('setPage', 'queue');
            } else {
                this.$store.commit('setPage', 'browse');
            }
        },
        btnPressed(idx) {
            if (this.$store.state.visibleMenus.size>0) {
                return;
            }
            this.tabPressed(this.items[idx].page, false)
        },
        icnPressed(longPress, el, ev) {
            if (this.$store.state.visibleMenus.size>0) {
                return;
            }
            let idx = parseInt(el.id.split("-")[1]);
            if (idx<0 || idx>this.items.length) {
                return;
            }
            try { ev.preventDefault(); } catch(e) { }
            try { ev.stopPropagation();} catch(e) { }
            this.tabPressed(this.items[idx].page, longPress);
        },
        tabPressed(page, longPress) {
            if (page!=this.$store.state.page) {
                this.$store.commit('setPage', page);
            } else {
                bus.$emit('nav', page, longPress);
            }
        },
        expandShortcutsBar() {
            if (this._shortcutExpandTimer) {
                clearTimeout(this._shortcutExpandTimer);
                this._shortcutExpandTimer = undefined;
            }
            this.setShortcutsCollapsed(false);
            this._lastContentScrollTop = undefined;
        },
        scheduleExpandShortcutsBar() {
            if (this._shortcutExpandTimer) {
                clearTimeout(this._shortcutExpandTimer);
            }
            // Reappear after idle when user stops scrolling down
            this._shortcutExpandTimer = setTimeout(function() {
                this._shortcutExpandTimer = undefined;
                if (this.autoCollapseEnabled) {
                    this.setShortcutsCollapsed(false);
                }
            }.bind(this), 1600);
        },
        setShortcutsCollapsed(collapsed) {
            collapsed = !!collapsed;
            if (this.shortcutsCollapsed === collapsed) {
                // Still ensure DOM class matches (e.g. after dock/undock)
                this.applyShortcutsCollapsedClass(collapsed);
                return;
            }
            this.shortcutsCollapsed = collapsed;
            this.applyShortcutsCollapsedClass(collapsed);
        },
        /* Shortcut show/hide uses the same 0.22s linear as the dock snap.
           An inline cubic-bezier on the np-bar ran beside that linear and
           read as a second, bouncing move. clearDockFooterDrag can leave
           transition:none, which would hide the stylesheet timing — clear
           that override and do not install another curve. */
        armShortcutCollapseMotion() {
            try {
                if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                    return;
                }
            } catch (e) {}
            let app = document.querySelector('.lms-app');
            if (app) {
                app.classList.add('nav-shortcut-collapse-motion');
            }
            let nodes = [document.getElementById('nav-bar'), document.getElementById('np-bar')];
            for (let i=0; i<nodes.length; ++i) {
                let el = nodes[i];
                if (!el || el.classList.contains('nav-shortcut-drag') || el.classList.contains('np-bar-dock-dragging')) {
                    continue;
                }
                if (el.style.transition==='none' || el.style.webkitTransition==='none') {
                    el.style.transition = '';
                    el.style.webkitTransition = '';
                }
            }
            if (nodes[0]) {
                void nodes[0].offsetHeight;
            }
            if (this._shortcutMotionTimer) {
                clearTimeout(this._shortcutMotionTimer);
            }
            this._shortcutMotionTimer = setTimeout(function() {
                this._shortcutMotionTimer = undefined;
                if (app) {
                    app.classList.remove('nav-shortcut-collapse-motion');
                }
                let fade = document.querySelector('.msk-bottom-fade');
                let bar = document.getElementById('np-bar');
                if (fade && (!bar || !bar.classList.contains('np-bar-dock-dragging'))) {
                    fade.style.transition = '';
                    fade.style.webkitTransition = '';
                }
            }.bind(this), 260);
        },
        /* Used px. getPropertyValue of calc() / min() is the specified text, and parseFloat is NaN. */
        shortcutCssPx(name) {
            let raw = '';
            try {
                raw = getComputedStyle(document.documentElement).getPropertyValue(name);
            } catch (e) {}
            let n = parseFloat(raw);
            if (!isNaN(n) && /px\s*$/.test(String(raw))) {
                return n;
            }
            let probe = document.createElement('div');
            probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;width:0;height:var(' + name + ')';
            document.documentElement.appendChild(probe);
            let h = probe.offsetHeight || 0;
            if (probe.parentNode) {
                probe.parentNode.removeChild(probe);
            }
            return h;
        },
        /* Raised rest is 0. Docked or auto-collapsed drops by the shortcut strip, minus the home-indicator lift. */
        shortcutFadeRestY() {
            let app = document.querySelector('.lms-app');
            if (!app || app.classList.contains('np-sheet-open')) {
                return 0;
            }
            if (!app.classList.contains('np-bar-docked') && !app.classList.contains('nav-shortcuts-auto-collapsed')) {
                return 0;
            }
            let lift = this.shortcutCssPx('--np-bar-dock-lift');
            if (!(lift > 0)) {
                let footer = document.getElementById('nav-bar');
                lift = footer && footer.offsetHeight ? footer.offsetHeight : 0;
            }
            let rest = this.shortcutCssPx('--np-home-rest');
            if (!(rest > 0) || rest >= lift) {
                rest = 0;
            }
            return Math.max(0, Math.round(lift - rest));
        },
        applyShortcutFadeRest(fade) {
            fade = fade || document.querySelector('.msk-bottom-fade');
            if (!fade) {
                return;
            }
            let t = 'translate3d(0,' + this.shortcutFadeRestY() + 'px,0)';
            fade.style.transform = t;
            fade.style.webkitTransform = t;
        },
        /* Pixel translate. A CSS var inside transform often waits for the next scroll on iOS. */
        syncShortcutFade(collapsed) {
            let fade = document.querySelector('.msk-bottom-fade');
            if (!fade) {
                return;
            }
            this._shortcutFadeHold = !!collapsed;
            let y = collapsed ? this.shortcutFadeRestY() : 0;
            let ease = 'transform 0.22s linear';
            try {
                if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                    ease = 'none';
                }
            } catch (e) {}
            fade.style.transition = ease;
            fade.style.webkitTransition = ease;
            try { void fade.offsetHeight; } catch (e2) {}
            fade.style.transform = 'translate3d(0,' + y + 'px,0)';
            fade.style.webkitTransform = 'translate3d(0,' + y + 'px,0)';
        },
        clearShortcutFadeInline() {
            this._shortcutFadeHold = false;
            let fade = document.querySelector('.msk-bottom-fade');
            if (!fade) {
                return;
            }
            fade.style.transition = '';
            fade.style.webkitTransition = '';
            // Leave used pixels. Emptying the inline transform hands the fade back to a
            // CSS calc that iOS does not paint until the next scroll.
            this.applyShortcutFadeRest(fade);
        },
        applyShortcutsCollapsedClass(collapsed) {
            try {
                let app = document.querySelector('.lms-app');
                if (!app) {
                    return;
                }
                // When already docked, shortcuts are hidden by dock CSS — don't stack states
                if (app.classList.contains('np-bar-docked') || app.classList.contains('np-sheet-open')) {
                    app.classList.remove('nav-shortcuts-auto-collapsed');
                    this.clearShortcutFadeInline();
                    return;
                }
                let want = !!(collapsed && this.autoCollapseEnabled);
                if (app.classList.contains('nav-shortcuts-auto-collapsed')===want) {
                    return;
                }
                this.armShortcutCollapseMotion();
                if (want) {
                    app.classList.add('nav-shortcuts-auto-collapsed');
                } else {
                    app.classList.remove('nav-shortcuts-auto-collapsed');
                }
                this.syncShortcutFade(want);
            } catch (e) {}
        },
        onContentScroll(scrollTop) {
            if (!this.autoCollapseEnabled) {
                if (this.shortcutsCollapsed) {
                    this.expandShortcutsBar();
                }
                return;
            }
            if (this.shortcutTouchActive) {
                return;
            }
            try {
                let app = document.querySelector('.lms-app');
                if (app && app.classList.contains('np-bar-docked')) {
                    this._lastContentScrollTop = scrollTop;
                    return;
                }
            } catch (e) {}
            let top = (undefined==scrollTop || isNaN(scrollTop)) ? 0 : scrollTop;
            let prev = this._lastContentScrollTop;
            this._lastContentScrollTop = top;
            if (undefined===prev) {
                return;
            }
            let dy = top - prev;
            // Near top of list: always show
            if (top < 12) {
                this.expandShortcutsBar();
                return;
            }
            if (dy > 6) {
                // Scrolling down → collapse; restart idle re-show timer
                this.setShortcutsCollapsed(true);
                this.scheduleExpandShortcutsBar();
            } else if (dy < -6) {
                // Reverse scroll → show immediately
                this.expandShortcutsBar();
            } else if (this.shortcutsCollapsed) {
                // Small jitter while collapsed: keep delaying re-show
                this.scheduleExpandShortcutsBar();
            }
        }
    },
    computed: {
        darkUi () {
            return this.$store.state.darkUi
        },
        activeBtn() {
            for (let i=0; i<this.items.length; ++i) {
                if (this.items[i].page==this.$store.state.page) {
                    return i;
                }
            }
            return 0;
        },
        coloredToolbars() {
            return this.$store.state.coloredToolbars
        },
        useTransparentFooter() {
            let npActive = MBAR_NONE==this.$store.state.mobileBar ? this.$store.state.page=='now-playing' : this.$store.state.npSheetOpen;
            return this.$store.state.nowPlayingFull && this.$store.state.nowPlayingBackdrop && npActive && !this.infoOpen
        },
        nowPlayingFull() {
            return this.$store.state.nowPlayingFull
        },
        useShortcutNav() {
            // All miniplayer modes (thin, thick 2-line, replace-nav) keep the shortcut
            // strip so the dock gesture can pull the bar up to reveal it.
            let m = this.$store.state.mobileBar;
            return !this.$store.state.desktopLayout && MBAR_NONE!=m;
        },
        autoCollapseEnabled() {
            return !!(this.$store.state.autoCollapseShortcuts) &&
                this.useShortcutNav &&
                !this.$store.state.desktopLayout &&
                !this.$store.state.npSheetOpen;
        },
        pageToggleTitle() {
            return 'queue'==this.$store.state.page ? i18n('Browse') : i18n('Queue');
        },
        pageToggleActive() {
            return 'queue'==this.$store.state.page;
        },
        searchShortcutActive() {
            return 'browse'==this.$store.state.page && this.activeShortcutId==SEARCH_SHORTCUT;
        },
        pageToggleActiveIcon() {
            return 'library_music';
        },
        pageToggleInactiveSvg() {
            return 'queue_music_outline';
        },
        showSearchBtn() {
            return true;
        },
        searchTitle() {
            return (ACTIONS[SEARCH_LIB_ACTION] && ACTIONS[SEARCH_LIB_ACTION].title) ? ACTIONS[SEARCH_LIB_ACTION].title : i18n('Search');
        },
        searchSvg() {
            return (ACTIONS[SEARCH_LIB_ACTION] && ACTIONS[SEARCH_LIB_ACTION].svg) ? ACTIONS[SEARCH_LIB_ACTION].svg : 'search-library';
        },
        /* Scrollable strip: home + pinned items. Search is fixed.
           Player options stay in the pull-to-refresh menu, not this bar. */
        scrollShortcuts() {
            return this.shortcuts.filter(function(s) {
                return s.id!=SEARCH_SHORTCUT && s.id!=PLAYER_PREFS_SHORTCUT;
            });
        }
    },
    watch: {
        useShortcutNav(val) {
            if (val) {
                this.$nextTick(function() {
                    // Miniplayer mode toggled on: ensure strip is populated
                    if (!this.shortcuts || this.shortcuts.length<1) {
                        bus.$emit('getHomeScreenItems');
                    }
                    this.updateShortcutOverflow();
                    this.observeShortcutScroll();
                }.bind(this));
            } else {
                this.expandShortcutsBar();
            }
        },
        '$store.state.autoCollapseShortcuts'(val) {
            if (!val) {
                this.expandShortcutsBar();
            }
        },
        '$store.state.npSheetOpen'(val) {
            if (val) {
                this.expandShortcutsBar();
            }
        },
        '$store.state.page'() {
            this.expandShortcutsBar();
        }
    }
})
