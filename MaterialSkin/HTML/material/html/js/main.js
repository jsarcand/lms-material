/**
 * LMS-Material
 *
 * Copyright (c) 2018-2026 Craig Drummond <craig.p.drummond@gmail.com>
 * MIT license.
 */
'use strict';

Vue.use(VueLazyload, {error:DEFAULT_COVER});
if (typeof VueAwesomeSwiper !== 'undefined') {
    Vue.use(VueAwesomeSwiper);
}

Vue.filter("svgIcon", (name, dark, inColoredToolbar, colorHex) => {
    // Chrome mode: bake primary/cover color into the SVG (same as Material icons using --browse-chrome-ink)
    if (inColoredToolbar==='chrome' || colorHex==='chrome') {
        var col = '';
        if (inColoredToolbar==='chrome' && colorHex && (''+colorHex).length>=3 && (''+colorHex)!=='chrome') {
            col = (''+colorHex).replace("#", "").trim();
        } else if (colorHex==='chrome' && dark && (''+dark).length>=3 && dark!==true && dark!==false) {
            col = (''+dark).replace("#", "").trim();
        }
        if ((!col || col.length<3 || col.indexOf('(')>=0) && typeof document!=='undefined') {
            try {
                var el = document.getElementById("browse-view") || document.documentElement;
                var cs = getComputedStyle(el);
                col = (cs.getPropertyValue("--primary-color") || "").replace("#", "").trim();
            } catch (e) {}
        }
        if (col && col.length>=3 && col.indexOf('(')<0) {
            return "/material/svg/"+name+"?c="+col+"&r="+LMS_MATERIAL_REVISION;
        }
        var isDark = dark===true || dark===1 || dark==='1';
        return "/material/svg/"+name+"?c="+(isDark ? LMS_DARK_SVG : LMS_LIGHT_SVG)+"&r="+LMS_MATERIAL_REVISION;
    }
    return "/material/svg/"+name+"?c="+(dark || inColoredToolbar ? LMS_DARK_SVG : LMS_LIGHT_SVG)+"&r="+LMS_MATERIAL_REVISION;
} );

Vue.filter("displayTime", (value) => {
    if (!value || value<0.000000000001) {
        return '';
    }
    let str = formatSeconds(Math.floor(value));
    if (isEmpty(str)) {
        return '';
    }
    return str;
});

const IGNORE_SWIPE_START_ON = new Set(["image-grid-item", "image-grid-text", "v-avatar"]);

let prevWindowArea={l:0, r:0, rmin:0};
let windowAreaTimeout = null;
function setWindowArea() {
    if (null!=windowAreaTimeout) {
        return;
    }
    windowAreaTimeout = setTimeout(function() {
        windowAreaTimeout=  null;
        let rect = undefined;
        try {
            rect = window.navigator.windowControlsOverlay.getTitlebarAreaRect();
        } catch (e) { }
        if (undefined==rect) {
            return;
        }
        let fullscreen = window.innerWidth==screen.width && window.innerHeight==screen.height;
        let left = fullscreen ? 0 : rect.left;
        let right = rect.width<=0 || fullscreen ? 0 : ((window.innerWidth - rect.right) - 8);
        if (left<0 || right<0) {
            return;
        }
        // When theme-color is changed (i.e using colour from cover) Chrome flashes the website name
        // briefly. This causes items to shift left. So, we ignore right change unless rmin==0 or this change
        // is <=rmin
        if (left!=prevWindowArea.l || (right!=prevWindowArea.r && 0==prevWindowArea.rmin || right<=prevWindowArea.rmin)) {
            prevWindowArea.l=left;
            prevWindowArea.r=right;
            if (right>0 && (0==prevWindowArea.rmin || right<prevWindowArea.rmin)) {
                prevWindowArea.rmin = right;
            }
            queryParams['dragleft']=left;
            document.documentElement.style.setProperty('--window-area-left', left+'px');
            document.documentElement.style.setProperty('--window-area-right', right+'px');
            document.documentElement.style.setProperty('--window-controls-space', right+'px');
            bus.$emit('windowControlsOverlayChanged');
        }
    }, 50);
}

function toggleButtonDueToKeyboard(id, keyboardShown) {
    let elem = document.getElementById(id);
    if (elem) {
        elem.style.display = keyboardShown ? 'none' : 'block';
    }
}

var app = new Vue({
    el: '#app',
    data() {
        return { dialogs: { uisettings: false, playersettings: false, info: false, sync: false, group: false, volume: false,
                            manage: false, rndmix: false, favorite: false, rating: false, sleep: false,
                            iteminfo: false, iframe: false, dstm: false, savequeue: false, icon: false, prompt:false,
                            addtoplaylist: false, file: false, groupvolume: false, advancedsearch: false, downloadstatus:false,
                            gallery: false, choice: false, playersettingsplugin: false, playerlist: false, npshare: false,
                            manageplugins: false, presetseditor: false, appsettings: false
                          },
                 loaded: false,
                 snackbar:{ show: false, msg: undefined},
                 nowPlayingExpanded: false,
                 infoOpen: false,
                 infoExpanded: false,
                 queueEmpty: true,
                 touchIgnoreSwipe: false,
                 shortcutScrollTouch: false,
                 jumplistTouch: false
                }
    },
    created() {
        let lmsApp = this;
        if (IS_MOBILE) {
            // Disable hover effects for buttons in mobile, as these can get 'stuck'. This /should/ be automatic, but
            // is failing. Placing in "@media (hover: none)" did not seem to work. So, apply here for just mobile...
            var s = document.createElement("style");
            s.innerHTML = ".v-btn:hover:before {background-color:transparent!important;}" +
                          ".lms-list .v-list__tile--link:hover,.dialog-main-list .v-list__tile--link:hover {background:transparent!important};";
            document.getElementsByTagName("head")[0].appendChild(s);
            document.getElementsByTagName("body")[0].classList.add("msk-is-touch");
        } else {
            document.getElementsByTagName("body")[0].classList.add("msk-is-non-touch");
        }
        lmsApp.botPad = queryParams.botPad>0 ? queryParams.botPad : queryParams.addpad || IS_IOS ? 12 : 0;
        if (lmsApp.botPad>0) {
            document.documentElement.style.setProperty('--bottom-pad', lmsApp.botPad + 'px');
            if (lmsApp.botPad>6) {
                document.documentElement.style.setProperty('--desktop-np-bottom-pad', (lmsApp.botPad-6) + 'px');
            }
            if (lmsApp.botPad>20) {
                document.documentElement.style.setProperty('--desktop-np-bottom-pad-alt', '0px');
                document.documentElement.style.setProperty('--desktop-np-bottom-pad-alt2', (lmsApp.botPad-6) + 'px');
                document.documentElement.style.setProperty('--desktop-np-bottom-pad-alt3', (lmsApp.botPad-6) + 'px');
            } else {
                document.documentElement.style.setProperty('--desktop-np-bottom-pad-alt', (lmsApp.botPad-6) + 'px');
                document.documentElement.style.setProperty('--desktop-np-bottom-pad-alt2', '0px');
                document.documentElement.style.setProperty('--desktop-np-bottom-pad-alt3', ((lmsApp.botPad-6)/2) + 'px');
            }
        }
        if (queryParams.topPad>0) {
            document.documentElement.style.setProperty('--top-pad', queryParams.topPad + 'px');
        }
        if (queryParams.dlgPad>0) {
            document.documentElement.style.setProperty('--dialog-pad', queryParams.dlgPad + 'px');
        }
        this.autoLayout = true;
        this.$store.commit('initUiSettings');
        this.$store.commit('setShowQueue', getLocalStorageBool('showQueue', true));
        if (queryParams.player) {
            document.title += SEPARATOR + unescape(queryParams.player);
        }

        let chosenLayout = undefined;
        if (undefined!=queryParams.layout) {
            chosenLayout = queryParams.layout;
        } else {
            chosenLayout = getLocalStorageVal("layout", undefined);
        }

        if (chosenLayout=='desktop') {
            /* Saved desktop pref must not force desktop on portrait phones */
            if (IS_MOBILE && !shouldUseDesktopLayout()) {
                this.setLayout();
            } else {
                this.setLayout(true);
            }
        } else if (chosenLayout=='mobile') {
            this.setLayout(false);
        } else {
            this.setLayout();
        }

        if (IS_MOBILE) {
            /* iOS may report a wide viewport before meta/viewport settle */
            setTimeout(function() { lmsApp.checkLayout(); }, 150);
            setTimeout(function() { lmsApp.checkLayout(); }, 600);
            window.addEventListener('orientationchange', function() {
                setTimeout(function() { lmsApp.checkLayout(); }, 100);
            });
        }

        var storedTrans = getLocalStorageVal('translation', undefined);
        if (storedTrans!=undefined) {
            setTranslation(JSON.parse(storedTrans));
        }

        initIconMap();
        initEmblems();
        initCustomActions();
        initTrackSources();
        initLmsOptions();

        this.setLanguage(LMS_LANG);
        bus.$on('lmsLangChanged', function(lang) {
            this.setLanguage(lang);
        }.bind(this));

        if (LMS_VERSION<90001) {
            lmsOptions.conductorGenres = new Set(["Classical", "Avant-Garde", "Baroque", "Chamber Music", "Chant", "Choral", "Classical Crossover",
                                                  "Early Music", "High Classical", "Impressionist", "Medieval", "Minimalism","Modern Composition",
                                                  "Opera", "Orchestral", "Renaissance", "Romantic", "Symphony", "Wedding Music"]);
            lmsOptions.composerGenres = new Set([...new Set(["Jazz"]), ...lmsOptions.conductorGenres]);
        }

        if (lmsOptions.allowDownload && queryParams.download!='browser' && queryParams.download!='native') {
            lmsOptions.allowDownload = false;
        }
        if (undefined!=queryParams.hidePlayers) {
            setLocalStorageVal('hidePlayers', queryParams.hidePlayers);
            // Normalize (lowercase trim) so MAC-style playerids match LMS
            let hideSet = new Set();
            String(queryParams.hidePlayers).split(',').forEach(function(p) {
                let s = (p || '').trim();
                if (s) {
                    hideSet.add(s);
                    hideSet.add(s.toLowerCase());
                }
            });
            lmsOptions.hidePlayers = hideSet;
        }
        lmsCommand("", ["material-skin", "prefs"]).then(({data}) => {
            if (data && data.result) {
                if (LMS_VERSION<90001) {
                    for (var t=0, len=SKIN_GENRE_TAGS.length; t<len; ++t ) {
                        if (data.result[SKIN_GENRE_TAGS[t]+'genres']) {
                            var genres = splitConfigString(data.result[SKIN_GENRE_TAGS[t]+'genres']);
                            if (genres.length>0) {
                                lmsOptions[SKIN_GENRE_TAGS[t]+'Genres'] = new Set(genres);
                                logJsonMessage(SKIN_GENRE_TAGS[t].toUpperCase()+"_GENRES", genres);
                                setLocalStorageVal(SKIN_GENRE_TAGS[t]+"genres", data.result[SKIN_GENRE_TAGS[t]+'genres']);
                            }
                        }
                    }
                }
                for (var i=0, len=SKIN_BOOL_OPTS.length; i<len; ++i) {
                    lmsOptions[SKIN_BOOL_OPTS[i]] = undefined!=data.result[SKIN_BOOL_OPTS[i]] && 1 == parseInt(data.result[SKIN_BOOL_OPTS[i]]);
                    setLocalStorageVal(SKIN_BOOL_OPTS[i], lmsOptions[SKIN_BOOL_OPTS[i]]);
                }
                for (var i=0, len=SKIN_INT_OPTS.length; i<len; ++i) {
                    if (undefined!=data.result[SKIN_INT_OPTS[i]]) {
                        lmsOptions[SKIN_INT_OPTS[i]] = parseInt(data.result[SKIN_INT_OPTS[i]]);
                        setLocalStorageVal(SKIN_INT_OPTS[i], lmsOptions[SKIN_INT_OPTS[i]]);
                    }
                }
                if (lmsOptions.allowDownload && queryParams.download!='browser' && queryParams.download!='native') {
                    lmsOptions.allowDownload = false;
                    setLocalStorageVal('allowDownload', false);
                }
                if (undefined!=data.result['releaseTypeOrder']) {
                    let arr = splitConfigString(data.result['releaseTypeOrder']);
                    lmsOptions.releaseTypeOrder = arr.length>0 ? arr : undefined;
                }
                if (undefined!=data.result['hidePlayers'] && undefined==queryParams.hidePlayers) {
                    setLocalStorageVal('hidePlayers', data.result['hidePlayers']);
                    lmsOptions.hidePlayers = new Set(data.result['hidePlayers'].split(','));
                }
                bus.$emit('screensaverDisplayChanged');
                // Context Stats: server-wide prefs (Material Skin plugin settings — not client UI)
                if (undefined!=data.result.contextStatsHome) {
                    let csh = !!(parseInt(data.result.contextStatsHome));
                    lmsOptions.contextStatsHome = csh;
                    setLocalStorageVal('contextStatsHome', csh);
                    try {
                        if (this.$store) {
                            this.$store.commit('setUiSettings', {contextStatsHome: csh});
                        }
                    } catch (e) {}
                }
                if (undefined!=data.result.sessionEnhance) {
                    let se = !!(parseInt(data.result.sessionEnhance));
                    lmsOptions.contextStatsSessionEnhance = se;
                    setLocalStorageVal('contextStatsSessionEnhance', se);
                    try {
                        if (this.$store) {
                            this.$store.commit('setUiSettings', {contextStatsSessionEnhance: se});
                        }
                    } catch (e) {}
                }
            }
            // Prefer sessions-prefs for enhance when available (same server flag)
            lmsCommand('', ['material-skin', 'sessions-prefs']).then(({data: sdata}) => {
                if (sdata && sdata.result) {
                    let on = !!(sdata.result.enhance && parseInt(sdata.result.enhance) !== 0);
                    lmsOptions.contextStatsSessionEnhance = on;
                    setLocalStorageVal('contextStatsSessionEnhance', on);
                    try {
                        if (this.$store) {
                            this.$store.commit('setUiSettings', {contextStatsSessionEnhance: on});
                        }
                    } catch (e) {}
                }
            }).catch(() => {});
        });

        setTimeout(function () {
            this.loaded = true;
        }.bind(this), 500);

        // Work-around 100vh behaviour in mobile chrome
        // See https://css-tricks.com/the-trick-to-viewport-units-on-mobile/
        let lastWinHeight = window.innerHeight;
        let lastReportedHeight = lastWinHeight;
        let lastWinWidth = window.innerWidth;
        let timeout = undefined;
        this.bottomBar = {height: undefined, shown:true};

        // Only need to do 100vh work-around when running within mobile browsers, not when installled to homescreen.
        let appMode = !IS_MOBILE ||
                      window.matchMedia('(display-mode: standalone)').matches ||
                      window.matchMedia('(display-mode: fullscreen)').matches ||
                      (("standalone" in window.navigator) && window.navigator.standalone);
        if (!appMode) {
            document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
        }

        if (!IS_MOBILE && IS_APPLE) {
            document.documentElement.style.setProperty('--scrollbar-size', MACOS_SCROLLBAR_SIZE+'px');
        }
        // Try to detect if we are on Firefox with overlay scrollbars - if so need to add padding
        if (undefined!=navigator && undefined!=navigator.userAgent && navigator.userAgent.indexOf(" Gecko/")>0) {
            let div = document.createElement('div');
            div.style.overflowY = 'scroll';
            div.style.width = '50px';
            div.style.height = '50px';
            document.body.append(div);
            let sbarWidth = div.offsetWidth - div.clientWidth;
            div.remove();
            if (sbarWidth<=0) {
                document.documentElement.style.setProperty('--overlay-sb-pad', '8px');
            }
        }
        lmsApp.keyboardShown = false;
        window.addEventListener('resize', () => {
            if (timeout) {
                clearTimeout(timeout);
            }
            timeout = setTimeout(function () {
                let heightChange = 0;
                let widthChange = 0;
                let adjustLayout = false;
                // Only update if changed
                if (lastWinHeight!=window.innerHeight) {
                    if (!appMode) {
                        document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
                    }
                    heightChange = lastWinHeight - window.innerHeight;
                    lastWinHeight = window.innerHeight;
                    adjustLayout = true;
                }
                if (Math.abs(lastWinWidth-window.innerWidth)>=3) {
                    widthChange = lastWinWidth - window.innerWidth;
                    lastWinWidth = window.innerWidth;
                    let autoShowHome = window.innerWidth>=LMS_AUTO_SHOW_HOME_BUTTON_MIN_WIDTH;
                    if (autoShowHome!=lmsApp.$store.state.autoShowHomeButton) {
                        lmsApp.$store.commit('setAutoShowHomeButton', autoShowHome);
                    }
                    bus.$emit('windowWidthChanged');
                    adjustLayout = true;
                }
                if (Math.abs(lastReportedHeight-window.innerHeight)>=3) {
                    lastReportedHeight = window.innerHeight;
                    bus.$emit('windowHeightChanged');
                }
                if (adjustLayout) {
                    lmsApp.checkLayout();
                }

                // Check entries are visible
                if (IS_MOBILE) {
                    var keyboardShown = 0==widthChange && heightChange>100;
                    if (keyboardShown != lmsApp.keyboardShown) {
                        if (keyboardShown) {
                            lmsApp.heights = [];
                            let vars = ['--bottom-toolbar-height', '--desktop-npbar-height', '--mobile-npbar-height-thin', '--mobile-npbar-height-thick', '--mobile-npbar-height', '--bottom-pad', '--desktop-np-bottom-pad'];
                            for (let v=0, len=vars.length; v<len; ++v) {
                                lmsApp.heights.push([vars[v], getComputedStyle(document.documentElement).getPropertyValue(vars[v])]);
                            }
                        }
                        lmsApp.keyboardShown = keyboardShown;
                        toggleButtonDueToKeyboard('nav-bar', keyboardShown);
                        toggleButtonDueToKeyboard('np-bar', keyboardShown);
                        toggleButtonDueToKeyboard('browse-search-btn', keyboardShown);
                        for (let v=0, list=lmsApp.heights, len=list.length; v<len; ++v) {
                            if (undefined!=list[v][1]) {
                                document.documentElement.style.setProperty(list[v][0], keyboardShown ? '0px' : list[v][1]);
                            }
                        }
                    }
                    if (document.activeElement.tagName=="INPUT" || document.activeElement.tagName=="TEXTAREA") {
                        let elem = document.activeElement;
                        let found = false;
                        let foundListItem = false;
                        let makeVisible = true;
                        for (let i=0; i<10 && !found && elem; ++i) {
                            if (elem.classList.contains("lms-list-item")) {
                                found = foundListItem = true;
                            } else if (elem.classList.contains("subtoolbar")) {
                                // No need to scroll an input field in subtoolbar into view - see #342
                                found = true;
                                makeVisible = false;
                            } else {
                                elem = elem.parentElement;
                            }
                        }
                        if (makeVisible) {
                            window.requestAnimationFrame(function () {
                                if (foundListItem) {
                                    if (isVisible(elem)) {
                                        return;
                                    }
                                    let list = elem.parentElement;
                                    while (undefined!=list) {
                                        if (list.classList.contains("lms-list")) {
                                            list.scrollTop = elem.offsetTop - list.offsetTop;
                                            return;
                                        } else {
                                            list = list.parentElement;
                                        }
                                    }
                                }
                                ensureVisible(found ? elem : document.activeElement);
                            });
                        }
                    }
                }
            }, 50);
        }, false);

        if (!queryParams.dontTrapBack) {
            window.mskHistoryLen = 0;
            // https://stackoverflow.com/questions/43329654/android-back-button-on-a-progressive-web-application-closes-de-app
            window.addEventListener('load', function() {
                addBrowserHistoryItem();
            }, false);
            window.addEventListener('popstate', function(event) {
                if (store.state.visibleMenus.has('navdrawer')) {
                    bus.$emit('closeMenu');
                    window.mskHistoryLen = Math.max(0, window.mskHistoryLen - 1);
                    try {
                        window.history.pushState({}, '');
                    } catch (e) {}
                    event.preventDefault();
                    return;
                }
                // Mobile browse/queue: edge-back toggles views instead of leaving the app
                if (!store.state.desktopLayout && (store.state.page=='browse' || store.state.page=='queue')) {
                    if ('browse'==store.state.page && !store.state.queueEmpty) {
                        store.commit('setPage', 'queue');
                    } else if ('queue'==store.state.page) {
                        store.commit('setPage', 'browse');
                    }
                    window.mskHistoryLen = Math.max(0, window.mskHistoryLen - 1);
                    try {
                        window.history.pushState({}, '');
                    } catch (e) {}
                    event.preventDefault();
                    return;
                }
                bus.$emit('esc');
                window.mskHistoryLen--;
                if (window.mskHistoryLen<0) {
                    window.mskHistoryLen=0;
                }
                event.preventDefault();
            }, false);
        }

        // https://github.com/timruffles/mobile-drag-drop/issues/77
        if (IS_MOBILE) {
            this._edgeSwipeMove = function(ev) {
                if (ev.touches && ev.touches.length>1) {
                    this.edgeSwipe = undefined;
                    return;
                }
                if (typeof browseZoomNavBlocked==='function' && browseZoomNavBlocked()) {
                    this.edgeSwipe = undefined;
                    return;
                }
                if (undefined!=this.edgeSwipe && ev.touches && ev.touches.length>0) {
                    let dx = ev.touches[0].clientX-this.edgeSwipe.x;
                    let dy = Math.abs(ev.touches[0].clientY-this.edgeSwipe.y);
                    if (dx>8 && dx>dy) {
                        ev.preventDefault();
                    }
                }
            }.bind(this);
            document.addEventListener('touchmove', this._edgeSwipeMove, {passive: false});
            document.addEventListener('touchcancel', function() {
                this.edgeSwipe = undefined;
            }.bind(this), false);
        } else {
            window.addEventListener('touchmove', function() {}, {passive: false});
        }

        window.addEventListener('keyup', function(event) {
            if (event.keyCode === 27 && bus.$store.state.keyboardControl) {
                bus.$emit('esc');
            }
        });

        if (document.addEventListener) {
            document.addEventListener('click', this.clickListener);
            document.addEventListener('touchend', this.touchListener);
        } else if (document.attachEvent) {
            document.attachEvent('onclick', this.clickListener);
            document.addEventListener('touchend', this.touchListener);
        }

        try {
            window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
                if (this.$store.state.chosenTheme.startsWith(AUTO_THEME)) {
                    this.$store.commit('toggleDarkLight');
                }
            }, false);
        } catch (e) { }
        if (undefined!=window.navigator && undefined!=window.navigator.windowControlsOverlay && 0==queryParams.nativeTitlebar) {
            setWindowArea();
            try {
                window.matchMedia('(display-mode: window-controls-overlay)').addEventListener('change', () => {
                    setWindowArea();
                }, false);
            } catch (e) { }
            try {
                navigator.windowControlsOverlay.addEventListener("geometrychange", (event) => {
                    setWindowArea();
                }, false);
            } catch (e) { }
        }

        bindKey('backspace');
        bus.$on('keyboard', function(key, modifier) {
            if (!modifier && 'backspace'==key) {
                bus.$emit('esc');
            }
        }.bind(this));
        bus.$on('esc', function() {
            this.handleEsc();
        }.bind(this));

        // Native plugin manager sets show=false on close; also unmount shell so it
        // cannot remain above server-settings (sidebar handoff).
        bus.$on('manageplugins-closed', function() {
            this.dialogs.manageplugins = false;
        }.bind(this));
        bus.$on('closeDialog', function(dlg) {
            if (dlg === 'manageplugins') {
                this.dialogs.manageplugins = false;
            }
            // Unmount iframe shell so next Extras open is a clean mount
            if (dlg === 'iframe') {
                this.dialogs.iframe = false;
            }
        }.bind(this));

        bus.$on('dlg.open', function(name, a, b, c, d, e, f, g, h) {
            if (typeof DEFERRED_LOADED != 'undefined') {
                if ('manageplugins'==name && typeof openManagePlugins == 'undefined') {
                    setTimeout(function() { bus.$emit('dlg.open', name, a, b, c, d, e, f, g, h)}, 50);
                    return;
                }
                // presets-editor is eager-loaded; wait only if script not yet registered
                if ('appsettings'==name) {
                    let asReady = false;
                    try {
                        asReady = !!(Vue.options && Vue.options.components && Vue.options.components['lms-app-settings']);
                    } catch (e) { asReady = false; }
                    if (!asReady) {
                        window._mskAppSettingsTries = (window._mskAppSettingsTries || 0) + 1;
                        if (window._mskAppSettingsTries < 40) {
                            setTimeout(function() { bus.$emit('dlg.open', name, a, b, c, d, e, f, g, h)}, 50);
                        }
                        return;
                    }
                    window._mskAppSettingsTries = 0;
                }
                if ('presetseditor'==name) {
                    let peReady = false;
                    try {
                        peReady = !!(Vue.options && Vue.options.components && Vue.options.components['lms-presets-editor']);
                    } catch (e) { peReady = false; }
                    if (!peReady) {
                        setTimeout(function() { bus.$emit('dlg.open', name, a, b, c, d, e, f, g, h)}, 50);
                        return;
                    }
                }
                // iframe-dialog.js is deferred and loaded async — component may not be
                // registered yet when Extras is opened quickly on mobile.
                if ('iframe'==name) {
                    let ready = false;
                    try {
                        ready = !!(Vue.options && Vue.options.components && Vue.options.components['lms-iframe-dialog']);
                    } catch (e) { ready = false; }
                    if (!ready) {
                        setTimeout(function() { bus.$emit('dlg.open', name, a, b, c, d, e, f, g, h)}, 80);
                        return;
                    }
                    // Stash open args so the dialog can self-open even if bus emit races
                    try {
                        window.mskIframePendingOpen = {
                            page: a, title: b, actions: c, showHome: d,
                            playerId: e, isLmsPage: f, initialSection: g
                        };
                    } catch (e) {}
                }
                if ('serversettings'==name) {
                    if (typeof openServerSettings == 'undefined') {
                        setTimeout(function() { bus.$emit('dlg.open', name, a, b, c, d, e, f, g, h)}, 50);
                        return;
                    }
                    if (store.state.unlockAll) {
                        lmsCommand("", ["material-skin", "server"]).then(({data}) => {
                            if (data && data.result) {
                                openServerSettings(data.result.libraryname, 0);
                            }
                        }).catch(err => {
                        });
                    }
                } else {
                    // Opening server settings dismisses plugin manager (PM stacks ON TOP of
                    // a living iframe when opened from settings — do not kill iframe here).
                    if ('iframe'==name && this.dialogs.manageplugins) {
                        bus.$emit('closeDialog', 'manageplugins');
                        this.dialogs.manageplugins = false;
                    }
                    let emitOpen = function() {
                        bus.$emit(name+".open", a, b, c, d, e, f, g, h);
                    };
                    this.dialogs[name] = true; // Mount
                    // First open: child mounts after parent flag; wait for bus listeners
                    if ('manageplugins'==name || 'iframe'==name) {
                        this.$nextTick(function () {
                            this.$nextTick(function () {
                                requestAnimationFrame(function() {
                                    emitOpen();
                                    // Retry once more if still pending (mobile race)
                                    if (name=='iframe') {
                                        setTimeout(function() {
                                            try {
                                                if (window.mskIframePendingOpen) {
                                                    bus.$emit('iframe.open',
                                                        window.mskIframePendingOpen.page,
                                                        window.mskIframePendingOpen.title,
                                                        window.mskIframePendingOpen.actions,
                                                        window.mskIframePendingOpen.showHome,
                                                        window.mskIframePendingOpen.playerId,
                                                        window.mskIframePendingOpen.isLmsPage,
                                                        window.mskIframePendingOpen.initialSection);
                                                }
                                            } catch (e) {}
                                        }, 120);
                                    }
                                });
                            }.bind(this));
                        }.bind(this));
                    } else {
                        this.$nextTick(emitOpen);
                    }
                }
            } else {
                setTimeout(function() { bus.$emit('dlg.open', name, a, b, c, d, e, f, g, h)}, 50);
            }
        }.bind(this));
        if (queryParams.actions.length>0) {
            this.$nextTick(function () {
                this.doQueryActions(false);
            });
            bus.$on('playerListChanged', function () {
                this.doQueryActions(true);
            }.bind(this));
        }

        bus.$on('changeLayout', function(layout) {
            this.setLayout(layout);
        }.bind(this));
        bus.$store = this.$store;

        bus.$on('setPlayer', function(id) {
            this.$store.commit('setPlayer', id);
        }.bind(this));

        bus.$on('showError', function(err, msg, timeout) {
            this.snackbar = {msg: (msg ? stripLinkTags(msg) : i18n("Something went wrong!")) + (err && !(""+err).indexOf("AxiosError")<0 ? " (" + err+")" : ""),
                             show: true, color: 'error', timeout: undefined!=timeout && timeout>0 && timeout<=30 ? timeout*1000 : undefined};
        }.bind(this));
        bus.$on('showMessage', function(msg, timeout) {
            if (undefined!=msg && msg.length>0 && !msgIsEmpty(msg)) {
                this.snackbar = {msg: stripLinkTags(msg), show: true, timeout: undefined!=timeout && timeout>0 && timeout<=30 ? timeout*1000 : undefined };
            }
        }.bind(this));
        bus.$on('infoDialog', function(val) {
            this.infoOpen = val;
            if (!val) {
                this.infoExpanded = false;
            }
        }.bind(this));
        bus.$on('infoExpanded', function(val) {
            this.infoExpanded = val;
        }.bind(this));
        bus.$on('nowPlayingExpanded', function(val) {
            this.nowPlayingExpanded = val;
        }.bind(this));
        bus.$on('queueStatus', function(size) {
            this.queueEmpty = size<1;
        }.bind(this));
        bus.$on('shortcutScrollTouch', function(active) {
            this.shortcutScrollTouch = !!active;
        }.bind(this));
        bus.$on('jumplistTouch', function(active) {
            this.jumplistTouch = !!active;
        }.bind(this));
        this.browseItemSwipeActive = false;
        this.browseItemSwipeHandled = false;
        bus.$on('browseItemSwipeActive', function(active) {
            this.browseItemSwipeActive = !!active;
        }.bind(this));
        bus.$on('browseItemSwipeHandled', function() {
            this.browseItemSwipeHandled = true;
            this.browseItemSwipeActive = false;
        }.bind(this));
        this.$store.commit('setLocalIpAddresses', queryParams.ipAddresses);
        // LMS-seen HTTP client IP — match Mac squeezelite / LyrPlay on this device
        try {
            axios.get('/material/client-ip', {timeout: 3000}).then(function(resp) {
                let ip = resp && resp.data && resp.data.ip;
                if (!ip) {
                    return;
                }
                lmsOptions.clientIp = String(ip);
                let existing = queryParams.ipAddresses || '';
                let all = existing ? (String(existing)+','+ip) : String(ip);
                this.$store.commit('setLocalIpAddresses', all);
            }.bind(this)).catch(function(){});
        } catch (eClientIp) {}
        this.npPageWheelAccum = 0;
        this.npPageWheelTimer = undefined;
        this.npBarWheelAccum = 0;
        this.npBarWheelTimer = undefined;
        this._npBarWheel = function(ev) {
            if (!this.$store.state.desktopLayout && MBAR_NONE==this.$store.state.mobileBar) {
                return;
            }
            let npBar = document.getElementById('np-bar');
            if (undefined==npBar || undefined==ev.target || !npBar.contains(ev.target)) {
                return;
            }
            let dx = npBarWheelDeltaX(ev);
            if (Math.abs(dx)<1 || Math.abs(dx)<=Math.abs(ev.deltaY)*0.5) {
                return;
            }
            ev.preventDefault();
            ev.stopPropagation();
            this.npBarWheelAccum += dx;
            if (undefined!=this.npBarWheelTimer) {
                clearTimeout(this.npBarWheelTimer);
            }
            this.npBarWheelTimer = setTimeout(function() {
                this.npBarWheelTimer = undefined;
                let accum = this.npBarWheelAccum;
                this.npBarWheelAccum = 0;
                if (Math.abs(accum)>=20) {
                    bus.$emit('npBarSwipe', accum<0 ? 'left' : 'right');
                }
            }.bind(this), 70);
        }.bind(this);
        this._npSheetWheel = function(ev) {
            if (!this.$store.state.npSheetOpen) {
                return;
            }
            if (!this.$store.state.desktopLayout && MBAR_NONE==this.$store.state.mobileBar) {
                return;
            }
            let npPage = document.getElementById('np-page');
            if (undefined==npPage || undefined==ev.target || !npPage.contains(ev.target)) {
                return;
            }
            let t = ev.target;
            // Artist / album / lyrics text boxes: never intercept vertical trackpad —
            // native overflow scroll must work. Horizontal is handled by npPageWheel.
            let scrollEl = t && t.closest
                ? t.closest('.np-card-panel-scroll, .np-lyrics-slide-scroll')
                : null;
            let onInfoCard = !!(t && t.closest && t.closest(
                '.np-main-slide-lyrics, .np-main-slide-artist, .np-main-slide-album, .np-card-swipe-zone, .np-meta-block, .np-controls'
            ));
            let onCover = !!(t && t.closest && t.closest('.np-cover, .np-cover-stack, .np-cover-block'));
            let dx = npBarWheelDeltaX(ev);
            let horiz = Math.abs(dx)>=1 && Math.abs(dx)>Math.abs(ev.deltaY)*0.5;

            // Horizontal trackpad on cover only → track change (same as touch on art)
            if (horiz && onCover) {
                ev.preventDefault();
                ev.stopPropagation();
                this.npBarWheelAccum += dx;
                if (undefined!=this.npBarWheelTimer) {
                    clearTimeout(this.npBarWheelTimer);
                }
                this.npBarWheelTimer = setTimeout(function() {
                    this.npBarWheelTimer = undefined;
                    let accum = this.npBarWheelAccum;
                    this.npBarWheelAccum = 0;
                    if (Math.abs(accum)>=20) {
                        bus.$emit('npBarSwipe', accum<0 ? 'left' : 'right');
                    }
                }.bind(this), 70);
                return;
            }
            // Horizontal elsewhere on the multi-card sheet → leave for npPageWheel (card change)
            if (horiz) {
                return;
            }
            // Vertical over scrollable card body → do not preventDefault / collapse
            if (scrollEl || (onInfoCard && t && t.closest && t.closest(
                '.np-card-panel-bio, .np-card-panel-sections, .np-info-card-list, .np-card-panel-media, .np-grid-sect, .np-info-lyrics, .np-lyrics-wrap, .np-card-panel-head'
            ))) {
                return;
            }
            // NP slide / empty chrome: vertical trackpad can lower the sheet
            if (ev.deltaY<=0 || Math.abs(ev.deltaY)<=Math.abs(ev.deltaX)) {
                return;
            }
            ev.preventDefault();
            this.npPageWheelAccum += ev.deltaY;
            if (undefined!=this.npPageWheelTimer) {
                clearTimeout(this.npPageWheelTimer);
            }
            this.npPageWheelTimer = setTimeout(function() {
                this.npPageWheelTimer = undefined;
                let accum = this.npPageWheelAccum;
                this.npPageWheelAccum = 0;
                if (accum>=24) {
                    bus.$emit('collapseNpSheetRestore');
                }
            }.bind(this), 80);
        }.bind(this);
        window.addEventListener('wheel', this._npBarWheel, {passive: false, capture: true});
        window.addEventListener('wheel', this._npSheetWheel, {passive: false, capture: true});
        if (!IS_MOBILE) {
            window.addEventListener('focus', () => {
                document.body.classList.remove('window-no-focus');
            });

            window.addEventListener('blur', () => {
                document.body.classList.add('window-no-focus');
            });
        }
    },
    mounted() {
        var start = Date.now();
        var revealed = false;
        var reveal = function() {
            if (revealed) {
                return;
            }
            revealed = true;
            var wait = Math.max(0, 320 - (Date.now() - start));
            setTimeout(function() {
                var html = document.documentElement;
                if (!html.classList.contains('msk-ready')) {
                    html.classList.add('msk-ready');
                }
                setTimeout(function() {
                    html.classList.remove('msk-booting');
                }, 700);
            }, wait);
        };
        bus.$on('mskBrowseReady', reveal);
        setTimeout(reveal, 1100);
    },
    computed: {
        darkUi() {
            return this.$store.state.darkUi;
        },
        lang() {
            return this.$store.state.lang;
        },
        page() {
            return this.$store.state.page;
        },
        desktopLayout() {
            return this.$store.state.desktopLayout
        },
        mobileBar() {
            return this.$store.state.mobileBar
        },
        showQueue() {
            return this.$store.state.showQueue
        },
        showQueuePane() {
            if (!this.desktopLayout) {
                return 'queue'==this.page;
            }
            if (this.$store.state.pinQueue) {
                return this.showQueue;
            }
            return this.showQueue || this.$store.state.showQueueNp || this.$store.state.queueOverlayClosing;
        },
        npSheetOpen() {
            return this.$store.state.npSheetOpen;
        },
        nowPlayingFull() {
            return this.$store.state.nowPlayingFull && !this.infoOpen && this.$store.state.nowPlayingBackdrop && (this.desktopLayout ? this.nowPlayingExpanded : this.mobileNpActive)
        },
        mobileNpActive() {
            if (this.desktopLayout) {
                return this.$store.state.npSheetOpen;
            }
            return MBAR_NONE==this.mobileBar ? this.$store.state.page=='now-playing' : this.$store.state.npSheetOpen;
        },
        tinted() {
            return this.$store.state.tinted && this.$store.state.cMixSupported && (!this.queueEmpty || this.$store.state.colorUsage!=COLOR_USE_FROM_COVER)
        },
        lyrionColors() {
            return COLOR_USE_STANDARD==this.$store.state.colorUsage && this.$store.state.color=='lyrion'
        }
    },
    methods: {
        setLanguage(lang) {
            // Ensure LMS's lang is <lowercase>[-<uppercase>]
            lang = ""+lang;
            let parts = lang.split('_'); // lms uses (e.g.) en_gb, want en-GB
            if (parts.length>1) {
                lang = parts[0].toLowerCase()+'-'+parts[1].toUpperCase();
            } else {
                lang = lang.toLowerCase();
            }

            if (lang == '?') {
                lang = 'en';
            }
            if (lang == 'en') {
                // LMS is set to 'en'. Check if browser is (e.g.) 'en-gb', and if so use that as the
                // language for Material. We only consider 'en*' here - so that LMS 'en' is not mixed
                // with browser (e.g.) 'de'
                var browserLang = window.navigator.userLanguage || window.navigator.language;
                if (undefined!=browserLang) {
                    let parts = browserLang.split('-');
                    if (parts.length>1) {
                        browserLang = parts[0].toLowerCase()+'-'+parts[1].toUpperCase();
                    } else {
                        browserLang = browserLang.toLowerCase();
                    }
                    if (browserLang.startsWith('en')) {
                        lang = browserLang;
                    }
                }
            }

            this.$store.commit('setLang', lang);
            if (lang == 'en' || lang == 'en-US') {
                // All strings are en-US by default, so remove any previous translation
                // from storage.
                if (getLocalStorageVal('translation', undefined)!=undefined) {
                    removeLocalStorage('translation');
                    removeLocalStorage('lang');
                    setTranslation(undefined);
                    bus.$emit('langChanged');
                    lmsOptions.lang = undefined;
                }
            } else {
                lmsOptions.lang = lang;

                // Get translation files - these are all lowercase
                let lowerLang = lang.toLowerCase();
                if (!LMS_SKIN_LANGUAGES.has(lowerLang)) {
                    let mainLang = lowerLang.substr(0, 2);
                    if (LMS_SKIN_LANGUAGES.has(mainLang)) {
                        lowerLang = mainLang;
                    }
                }
                if (getLocalStorageVal("lang", "")!=(lowerLang+"@"+LMS_MATERIAL_REVISION)) {
                    axios.get("html/lang/"+lowerLang+".json?r=" + LMS_MATERIAL_REVISION).then(function (resp) {
                        var trans = eval(resp.data);
                        setLocalStorageVal('translation', JSON.stringify(trans));
                        setLocalStorageVal('lang', lowerLang+"@"+LMS_MATERIAL_REVISION);
                        setTranslation(trans);
                        bus.$emit('langChanged');
                    }).catch(err => {
                        window.console.error(err);
                    });
                }
            }
        },
        touchStart(ev) {
            this.edgeSwipe = undefined;
            if (ev && ev.touches && ev.touches.length>1) {
                return;
            }
            if (typeof browseZoomNavBlocked==='function' && browseZoomNavBlocked()) {
                return;
            }
            if (!this.$store.state.desktopLayout) {
                let edgePos = getTouchPos(ev);
                if (edgePos && edgePos.x<=28) {
                    this.edgeSwipe = {x:edgePos.x, y:edgePos.y};
                }
            }
            this.touchIgnoreSwipe = false;
            // For some reason scrolling the 'Explore' list can cause the view to change?
            if (!this.$store.state.desktopLayout && this.$store.state.page=='browse' && this.$store.state.detailedHomeItems.length>0 &&
                intersect(new Set(ev.target.classList), IGNORE_SWIPE_START_ON).size>0) {
                return;
            }
            let t = ev.target;
            if (t && t.closest && (t.closest('#nav-bar') || t.closest('.nav-shortcut-bar') || t.closest('.nav-shortcuts-wrap') ||
                t.closest('.nav-shortcuts-scroll') || t.closest('.nav-shortcut-fixed') || t.closest('.lms-jumplist'))) {
                this.touchIgnoreSwipe = true;
                this.touch = undefined;
                return;
            }
            this.touch = getTouchPos(ev);
        },
        touchEnd(ev) {
            if (typeof browseZoomNavBlocked==='function' && browseZoomNavBlocked()) {
                this.edgeSwipe = undefined;
                this.touch = undefined;
                return;
            }
            if (this.edgeSwipe) {
                let edgeEnd = getTouchPos(ev);
                let edgeDx = edgeEnd.x-this.edgeSwipe.x;
                let edgeDy = Math.abs(edgeEnd.y-this.edgeSwipe.y);
                let edgeOpened = false;
                if (edgeDx>=40 && edgeDx>edgeDy && edgeDy<48 &&
                    this.$store.state.visibleMenus.size==0 && this.$store.state.openDialogs.length==0) {
                    // Browse drill-in: edge swipe-right goes back in hierarchy (iPod style).
                    // Only open nav drawer when there is nothing to go back to.
                    if ('browse'==this.$store.state.page && !this.$store.state.npSheetOpen) {
                        bus.$emit('browseEdgeSwipeBack');
                    } else {
                        bus.$emit('navDrawer');
                    }
                    edgeOpened = true;
                }
                this.edgeSwipe = undefined;
                if (edgeOpened) {
                    this.touch = undefined;
                    this.touchIgnoreSwipe = false;
                    return;
                }
            }
            if (this.touchIgnoreSwipe || this.shortcutScrollTouch || this.jumplistTouch) {
                this.touchIgnoreSwipe = false;
                this.touch = undefined;
                return;
            }
            // Browse song-row swipe (play next / append) owns the gesture — do not also
            // toggle queue or change pages on the same horizontal motion.
            if (this.browseItemSwipeActive || this.browseItemSwipeHandled) {
                this.browseItemSwipeHandled = false;
                this.touch = undefined;
                return;
            }
            if (undefined!=this.touch) {
                let end = getTouchPos(ev);
                let diffX = Math.abs(this.touch.x-end.x);
                let diffY = Math.abs(this.touch.y-end.y);
                let horizValid = diffX>diffY && diffX>60 && diffY<40 && (this.touch.x>48 && this.touch.x<window.innerWidth-48) && (end.x>48 && end.x<window.innerWidth-48);
                let vertValid = diffX<diffY && diffX<40 && diffY>60;
                if (!this.$store.state.desktopLayout) {
                    let npBar = document.getElementById('np-bar');
                    // Miniplayer banner: track-change swipes are owned by npBarTouchEnd on #np-bar.
                    // Do not emit npBarSwipe here — that double-fires next/prev on iOS.
                    if (npBar && undefined!=ev.target && npBar.contains(ev.target) && !this.$store.state.npSheetOpen) {
                        this.touch = undefined;
                        return;
                    }
                    if (this.$store.state.npSheetOpen && (this.$store.state.desktopLayout || MBAR_NONE!=this.$store.state.mobileBar)) {
                        let npPage = document.getElementById('np-page');
                        if (npPage && undefined!=ev.target && npPage.contains(ev.target)) {
                            if (vertValid && end.y>this.touch.y) {
                                // Artist/album: do not lower from mid-card scroll flicks
                                let t = ev.target;
                                if (t && t.closest && t.closest('.np-main-slide-artist, .np-main-slide-album, .np-main-slide-lyrics')) {
                                    if (t.closest('.np-card-panel-bio, .np-card-panel-sections, .np-info-card-list, .np-card-panel-media')) {
                                        this.touch = undefined;
                                        return;
                                    }
                                    let scroll = t.closest('.np-card-panel-scroll');
                                    if (scroll && scroll.scrollTop > 4) {
                                        this.touch = undefined;
                                        return;
                                    }
                                }
                                // NP slide: allow lower from meta/controls (beside/under art), not from cover track-swipe
                                if (t && t.closest && t.closest('.np-main-slide-np')) {
                                    if (t.closest('.np-cover-block, .np-cover-stack, .np-slider')) {
                                        this.touch = undefined;
                                        return;
                                    }
                                    bus.$emit('collapseNpSheetRestore');
                                    this.touch = undefined;
                                    return;
                                }
                                // Left/right thirds: lower immediately (edge swipe-down)
                                let third = window.innerWidth/3;
                                if (this.touch.x<third || this.touch.x>2*third) {
                                    bus.$emit('collapseNpSheetRestore');
                                    this.touch = undefined;
                                    return;
                                }
                            }
                        }
                    }
                }
                if (horizValid && !this.$store.state.desktopLayout && this.mobileNpActive) {
                    // Ignore swipes on position slider...
                    var elem = document.getElementById("pos-slider");
                    if (elem) {
                        var rect = elem.getBoundingClientRect();
                        if ((rect.x-16)<=this.touch.x && (rect.x+rect.width+16)>=this.touch.x &&
                            (rect.y-32)<=this.touch.y && (rect.y+rect.height+32)>=this.touch.y) {
                            horizValid = false;
                        }
                    }
                }
                if (vertValid && (window.innerHeight-this.touch.y)<100) {
                    vertValid = false;
                }
                if (horizValid) {
                    this.swipe(end.x>this.touch.x ? 'right' : 'left', ev);
                } else if (vertValid) {
                    this.swipe(end.y>this.touch.y ? 'down' : 'up', ev);
                }
                this.touch = undefined;
            }
        },
        /**
         * Mobile browse↔queue lateral swipe is limited to the app header
         * (main toolbar + browse/queue subheader). List content keeps free
         * horizontal gestures for song-row swipe, scroll, etc.
         */
        touchStartedInMobileHeader(ev) {
            if (ev && ev.target && ev.target.closest) {
                if (ev.target.closest('#main-toolbar, .lms-toolbar, .browse-subheader-wrap, .browse-subheader, #queue-view > .subtoolbar, #queue-view .subtoolbar, .subtoolbar.browse-subheader')) {
                    return true;
                }
                // Swipes that start on list/grid content never count as header
                if (ev.target.closest('#browse-list, #queue-list, .lms-image-grid, .browse-home-pane, .lms-jumplist, #np-bar, #np-page, #nav-bar')) {
                    return false;
                }
            }
            let y = this.touch && undefined!=this.touch.y ? this.touch.y : undefined;
            if (undefined==y) {
                return false;
            }
            let bottom = 0;
            let toolbar = document.getElementById('main-toolbar') || document.querySelector('#main-toolbar.lms-toolbar, .lms-app > .lms-toolbar');
            if (toolbar) {
                bottom = Math.max(bottom, toolbar.getBoundingClientRect().bottom);
            } else {
                let th = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--main-toolbar-height'));
                bottom = isNaN(th) ? 48 : th;
            }
            let sub = document.querySelector('#browse-view .browse-subheader-wrap, #queue-view > .subtoolbar, #queue-view .subtoolbar');
            if (sub) {
                let sr = sub.getBoundingClientRect();
                if (sr.height > 0) {
                    bottom = Math.max(bottom, sr.bottom);
                }
            }
            return y <= bottom + 6;
        },
        swipe(direction, ev) {
            if (this.$store.state.visibleMenus.size>0) {
                return;
            }
            if (undefined!=ev.target && ev.target &&
                 ( (('up'==direction || 'down'==direction) && (ev.target.scrollHeight>ev.target.clientHeight)) ||
                   (('left'==direction || 'right'==direction) && (ev.target.scrollWidth>ev.target.clientWidth)) ) ) {
                return;
            }
            if (this.$store.state.openDialogs.length>0) {
                if (this.$store.state.openDialogs.length==1) {
                    // Info dialog is open. If not on now-playing, can still swipe to change main nav.
                    // ...if in now-playing, then use to change info tab.
                    if ('info-dialog'==this.$store.state.openDialogs[0]) {
                        if (this.mobileNpActive ||
                           (this.$store.state.desktopLayout && !this.$store.state.showQueue && (!this.$store.state.pinQueue || window.innerWidth<MIN_PQ_PIN_WIDTH))) {
                            bus.$emit('info-swipe', direction, ev);
                            return;
                        }
                    } else {
                        return;
                    }
                } else {
                    return;
                }
            }
            // Track swipe: cover, or collapsed mini strip (art / title / play).
            // Lyrics + card zones change cards, never tracks.
            if (undefined!=ev.target && ev.target.closest) {
                if (ev.target.closest('.np-card-swipe-zone, .np-lyrics-panel, .np-side-progress')) {
                    return;
                }
                let trackZone = ev.target.closest('.np-track-swipe-zone, .np-cover, .np-cover-stack, .np-cover-block, .np-sheet-mini-pp');
                let miniStrip = ev.target.closest('.np-main-sheet-collapsed .np-sheet-hero, .np-main-sheet-collapsing .np-sheet-hero');
                if (trackZone || miniStrip) {
                    if (queryParams.party) {
                        return;
                    }
                    // Mini strip always allows track change; cover needs setting (or mini)
                    if (miniStrip || this.$store.state.swipeChangeTrack || ev.target.closest('.np-track-swipe-zone')) {
                        if ('left'==direction) {
                            bus.$emit('playerCommand', ['playlist', 'index', '+1']);
                        } else if ('right'==direction) {
                            bus.$emit('playerCommand', ['button', 'jump_rew']);
                        }
                    }
                    return;
                }
            }
            if (this.$store.state.desktopLayout) {
                if (this.$store.state.showQueueNp) {
                    return;
                }
                if (this.$store.state.npSheetOpen && ('left'==direction || 'right'==direction)) {
                    if ('left'==direction) {
                        bus.$emit('playerCommand', ['playlist', 'index', '+1']);
                    } else {
                        bus.$emit('playerCommand', ['button', 'jump_rew']);
                    }
                    return;
                }
                if ('up'==direction) {
                    bus.$emit('swipeUp');
                } else if ('down'==direction) {
                    bus.$emit('swipeDown');
                } else if (!this.$store.state.pinQueue) {
                    this.$store.commit('setShowQueue', 'left'==direction);
                }
            } else {
                let mbar = this.$store.state.mobileBar;
                let shortcutNav = MBAR_NONE!=mbar && MBAR_REP_NAV!=mbar;
                if (this.$store.state.npSheetOpen && (this.$store.state.desktopLayout || MBAR_NONE!=mbar)) {
                    if ('down'==direction) {
                        // Artist/album cards: never lower from content scroll — only top-band pull (NP owns that).
                        let t = ev && ev.target;
                        if (t && t.closest && t.closest('.np-card-panel-scroll, .np-card-panel-bio, .np-card-panel-sections, .np-info-card-list')) {
                            let scroll = t.closest('.np-card-panel-scroll') || document.querySelector('#np-page .np-main-slide-artist .np-card-panel-scroll, #np-page .np-main-slide-album .np-card-panel-scroll');
                            // Only allow if gesture started in the top chrome of the card (handled by NP page drag)
                            if (scroll && scroll.scrollTop > 4) {
                                return;
                            }
                            if (t.closest('.np-card-panel-bio, .np-card-panel-sections, .np-info-card-list, .np-card-panel-media')) {
                                return;
                            }
                        }
                        bus.$emit('collapseNpSheetRestore');
                    } else if ('up'==direction) {
                        bus.$emit('swipeUp');
                    }
                    return;
                }
                // Browse ↔ queue: only from the header strip (not list body)
                let pageNavFromHeader = this.touchStartedInMobileHeader(ev);
                if (('left'==direction || 'right'==direction) && shortcutNav &&
                    (this.$store.state.page=='browse' || this.$store.state.page=='queue')) {
                    if (!pageNavFromHeader) {
                        return;
                    }
                    if (this.queueEmpty && 'browse'==this.$store.state.page) {
                        return;
                    }
                    this.$store.commit('setPage', 'browse'==this.$store.state.page ? 'queue' : 'browse');
                    return;
                }
                if ('left'==direction) {
                    if (mbar==MBAR_REP_NAV) {
                        if (!pageNavFromHeader && (this.$store.state.page=='browse' || this.$store.state.page=='queue')) {
                            return;
                        }
                        this.$store.commit('setPage', this.queueEmpty || this.$store.state.page=='queue' ? 'browse' : 'queue');
                    } else if (this.$store.state.page=='browse') {
                        if (MBAR_NONE==mbar) {
                            this.$store.commit('setPage', 'now-playing');
                        } else {
                            bus.$emit('expandNpSheet');
                        }
                    } else if (this.mobileNpActive) {
                        this.$store.commit('setPage', 'queue');
                    } else if (this.$store.state.page=='queue') {
                        if (!pageNavFromHeader) {
                            return;
                        }
                        this.$store.commit('setPage', 'browse');
                    }
                } else if ('right'==direction) {
                    if (mbar==MBAR_REP_NAV) {
                        if (!pageNavFromHeader && (this.$store.state.page=='browse' || this.$store.state.page=='queue')) {
                            return;
                        }
                        this.$store.commit('setPage', this.queueEmpty || this.$store.state.page=='queue' ? 'browse' : 'queue');
                    } else if (this.$store.state.page=='browse') {
                        if (!pageNavFromHeader) {
                            return;
                        }
                        this.$store.commit('setPage', 'queue');
                    } else if (this.mobileNpActive) {
                        this.$store.commit('setPage', 'browse');
                    } else if (this.$store.state.page=='queue') {
                        if (MBAR_NONE==mbar) {
                            this.$store.commit('setPage', 'now-playing');
                        } else {
                            bus.$emit('expandNpSheet');
                        }
                    }
                } else if (this.mobileNpActive) {
                    if ('up'==direction) {
                        bus.$emit('swipeUp');
                    } else if ('down'==direction) {
                        bus.$emit('swipeDown');
                    }
                }
            }
        },
        doQueryActions(actOnPlayers) {
            for (var i=0; i<queryParams.actions.length; i++) {
                var act = queryParams.actions[i];
                var parts = act.split('/');
                var params = [];
                if (parts.length>1) {
                    params = parts[1].split(',');
                }
                if (parts.length>2) { // Check required player exists
                    var playerId = parts[2];
                    var found = false;
                    if (this.$store.state.players) {
                        for (var j=0, len=this.$store.state.players.length; j<len && !found; ++j) {
                            if (this.$store.state.players[j].id == playerId || this.$store.state.players[j].name == playerId) {
                                found = true;
                            }
                        }
                    }
                    if (!found) {
                        continue;
                    }
                }
                bus.$emit(parts[0], params.length>0 ? params[0] : undefined, params.length>1 ? params[1] : undefined, params.length>2 ? params[2] : undefined);
                queryParams.actions.splice(i, 1);
            }
        },
        checkLayout() {
            if (!this.autoLayout) {
                return;
            }
            let wantDesktop = shouldUseDesktopLayout();
            if (wantDesktop!=this.$store.state.desktopLayout && (wantDesktop || window.innerHeight>180 /*Don't swap to mobile if mini*/)) {
                this.setLayout();
            }
        },
        setLayout(forceDesktop) {
            this.autoLayout = undefined==forceDesktop;
            this.$store.commit('setDesktopLayout', undefined==forceDesktop ? shouldUseDesktopLayout() : forceDesktop);
        },
        clickListener(event) {
            try { storeClickOrTouchPos(event); } catch (e) { }
            if (this.$store.state.openDialogs.length>1) {
                return;
            }
            let page = undefined;
            if (this.$store.state.desktopLayout) {
                page = this.$store.state.openDialogs.length==0 ? 'browse' : (this.$store.state.openDialogs[0]=='info-dialog' ? 'now-playing' : undefined);
            } else {
                page = this.$store.state.page=='now-playing'
                            ? this.$store.state.openDialogs.length==1 && 'info-dialog'==this.$store.state.openDialogs[0] ? this.$store.state.page : undefined
                            : this.$store.state.page=='browse' ? this.$store.state.page : undefined;
            }

            if (undefined!=page) {
                let target = event.target || event.srcElement;
                if (target.tagName === 'A') {
                    let href = target.getAttribute('href');
                    //let follow = target.getAttribute('follow');
                    if (undefined!=href && null!=href && href.length>10) { // 10 = http://123
                        /*
                        if (undefined!=follow) {
                            openWindow(href);
                            event.preventDefault();
                            return;
                        }
                        let text = target.text;
                        if (undefined==text || text.length<1) {
                            text = target.textContent;
                        }
                        if (undefined!=text && text.length>0) {
                            let menu = [{title:ACTIONS[FOLLOW_LINK_ACTION].title, icon:ACTIONS[FOLLOW_LINK_ACTION].icon, act:FOLLOW_LINK_ACTION, link:href},
                                        {title:ACTIONS[SEARCH_TEXT_ACTION].title+SEPARATOR+text, icon:ACTIONS[SEARCH_TEXT_ACTION].icon, act:SEARCH_TEXT_ACTION, text:text}]
                            bus.$emit('showLinkMenu.'+page, event.clientX, event.clientY, menu);
                        }
                        */
                        openWindow(href);
                        event.preventDefault();
                    }
                }
            }
        },
        touchListener(event) {
            storeClickOrTouchPos(event);
        },
        handleEsc() {
            // Can receive 'esc' 120ish milliseconds after dialog was closed with 'esc' - so filter out
            if (undefined!=this.$store.state.lastDialogClose && (new Date().getTime()-this.$store.state.lastDialogClose)<=250) {
                return;
            }
            if (this.$store.state.visibleMenus.size>0) {
                bus.$emit('closeMenu');
                return;
            }
            if ('info-dialog'==this.$store.state.activeDialog && this.$store.state.desktopLayout) {
                bus.$emit('infoRetract');
                return;
            }
            // Hide queue if visible, unpinned, and no current dialog or current dialog is info-dialog
            if (this.$store.state.desktopLayout && !this.$store.state.pinQueue && this.$store.state.showQueue &&
                (undefined==this.$store.state.activeDialog || 'info-dialog'==this.$store.state.activeDialog)) {
                bus.$emit('closeQueue');
                return;
            }
            if (undefined!=this.$store.state.activeDialog) {
                if (this.$store.state.activeDialog!='info-dialog' || this.$store.state.desktopLayout || this.$store.state.page=='now-playing') {
                    bus.$emit('closeDialog', this.$store.state.activeDialog);
                    return;
                }
            }
            bus.$emit('escPressed');
        }
    },
    store,
    lmsServer
})
