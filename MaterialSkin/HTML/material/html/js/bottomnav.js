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
 <div v-if="useShortcutNav" class="nav-shortcut-bar" v-bind:class="{'nav-shortcuts-overflow':shortcutOverflow}">
  <div class="nav-shortcut-fixed">
   <v-btn flat icon class="nav-page-toggle" @click="toggleBrowseQueue" :title="pageToggleTitle">
    <v-icon v-if="pageToggleActive" class="nav-shortcut-icon">{{pageToggleActiveIcon}}</v-icon>
    <img v-else class="nav-svg-img nav-shortcut-icon" :src="pageToggleInactiveSvg | svgIcon(darkUi|(coloredToolbars&&!useTransparentFooter))" oncontextmenu="return false;"></img>
   </v-btn>
   <label for="browse-search-input" class="v-btn v-btn--flat v-btn--icon nav-search-fixed" @click.stop="openSearch" :title="searchTitle" v-if="showSearchBtn">
    <img class="nav-svg-img nav-shortcut-icon" :src="searchSvg | svgIcon(darkUi|(coloredToolbars&&!useTransparentFooter))" oncontextmenu="return false;"></img>
   </label>
  </div>
  <div class="nav-shortcut-sep" aria-hidden="true"></div>
  <div class="nav-shortcuts-wrap" v-bind:class="{'nav-shortcuts-overflow':shortcutOverflow, 'nav-shortcuts-can-left':shortcutCanLeft, 'nav-shortcuts-can-right':shortcutCanRight}">
   <div class="nav-shortcuts-fade" aria-hidden="true"></div>
   <div class="nav-shortcuts-scroll" ref="shortcutScroll" @scroll.passive="updateShortcutOverflow" @touchstart.passive="shortcutTouchStart" @touchmove.passive="shortcutTouchMove" @touchend.passive="shortcutTouchEnd" @touchcancel.passive="shortcutTouchEnd">
    <v-btn flat icon class="nav-shortcut-btn" v-for="(item, index) in scrollShortcuts" :key="'ns-'+item.id+'-'+index" @click="openShortcut(item, $event)" :title="item.title" v-bind:class="{'nav-shortcut-active':isShortcutActive(item), 'nav-shortcut-player-prefs':item.id==PLAYER_PREFS_SHORTCUT}">
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
        }.bind(this));
    },
    beforeDestroy() {
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
                        this.shortcuts.push({id:item.id, icon:item.icon, svg:item.svg, title:item.title});
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
            // When not on browse, only Home is "active" for orientation
            if (this.$store.state.page!='browse' && this.$store.state.page!='queue') {
                return item.id==HOME_SHORTCUT && this.$store.state.page=='browse';
            }
            return item.id==this.activeShortcutId;
        },
        openShortcut(item, ev) {
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
            bus.$emit('browse-shortcut', item.id);
        },
        openSearch() {
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
        applyShortcutsCollapsedClass(collapsed) {
            try {
                let app = document.querySelector('.lms-app');
                if (!app) {
                    return;
                }
                // When already docked, shortcuts are hidden by dock CSS — don't stack states
                if (app.classList.contains('np-bar-docked') || app.classList.contains('np-sheet-open')) {
                    app.classList.remove('nav-shortcuts-auto-collapsed');
                    return;
                }
                if (collapsed && this.autoCollapseEnabled) {
                    app.classList.add('nav-shortcuts-auto-collapsed');
                } else {
                    app.classList.remove('nav-shortcuts-auto-collapsed');
                }
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
        /* Scrollable strip: home + player prefs (if available) + pinned items (search is fixed) */
        scrollShortcuts() {
            let list = this.shortcuts.filter(function(s) {
                return s.id!=SEARCH_SHORTCUT && s.id!=PLAYER_PREFS_SHORTCUT;
            });
            if (this.npPlayerPrefsAvailable) {
                let prefs = {
                    id: PLAYER_PREFS_SHORTCUT,
                    icon: 'tune',
                    title: this.npPlayerPrefsTitle || i18n('Player options')
                };
                // After Home when present, else first
                let homeIdx = -1;
                for (let i=0; i<list.length; ++i) {
                    if (list[i].id==HOME_SHORTCUT) {
                        homeIdx = i;
                        break;
                    }
                }
                if (homeIdx>=0) {
                    list.splice(homeIdx+1, 0, prefs);
                } else {
                    list.unshift(prefs);
                }
            }
            return list;
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
