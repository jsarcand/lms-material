/**
 * LMS-Material
 *
 * Copyright (c) 2018-2026 Craig Drummond <craig.p.drummond@gmail.com>
 * MIT license.
 */
'use strict';

Vue.component('lms-toolbar', {
    template: `
<div v-bind:style="{'z-index':toolbarStackZ}"> <!-- Prevent np-cover leak -->
<div v-if="!desktopLayout" class="tb-status-scrolltop" @click.stop="scrollPageToTop"></div>
<v-toolbar fixed dense app class="lms-toolbar noselect" v-bind:class="{'trans-toolbar':nowPlayingFull, 'maintoolbar-glass':maintoolbarGlass, 'tb-vol-mode':volExpanded, 'tb-vol-mode-open':volExpanded && volExpandOpen && !volExpandClosing, 'tb-vol-mode-closing':volExpandClosing}" @mousedown="mouseDown" id="main-toolbar">
<lms-windowcontrols v-if="queryParams.nativeTitlebar && queryParams.tbarBtnsPos=='l'"></lms-windowcontrols>
<div class="drag-area-left"></div>
<div v-if="showClock" class="toolbar-clock" @click.stop="scrollPageToTop">
 <div class="maintoolbar-title">{{time}}</div>
 <div class="maintoolbar-subtitle subtext">{{date}}</div>
</div>
<v-layout @click.stop="openNavDrawer" @contextmenu.prevent="playerContextMenu" v-bind:class="{'navdrawer-selector':!mobileNoNowPlaying, 'link-item':!coloredToolbars, 'link-item-ct': coloredToolbars}">
 <v-btn icon class="toolbar-button" @click.stop="onToolbarNavClick" :aria-label="volMenuIsPlayers ? (volShowAllPlayers ? i18n('Hide other players') : i18n('Show other players')) : i18n('Main Menu')">
  <v-icon v-if="!connected" class="red">error</v-icon>
  <img v-else-if="updatesAvailable" class="svg-img" :src="'update' | menuIcon(darkUi, coloredToolbars&&!nowPlayingFull)"></img>
  <img v-else-if="restartRequired" class="svg-img" :src="'restart' | menuIcon(darkUi, coloredToolbars&&!nowPlayingFull)"></img>
  <span v-else class="tb-nav-morph" :class="{'is-chevron': volMenuIsPlayers, 'is-chevron-up': volMenuIsPlayers && volShowAllPlayers}" aria-hidden="true"><span></span><span></span><span></span></span>
 </v-btn>
 <!-- Always mounted: fades out when volume expands, fades back on close (no flash) -->
 <v-toolbar-title class="tb-player-title" v-bind:class="{'link-item':!coloredToolbars, 'link-item-ct': coloredToolbars, 'maintoolbar-title-clock':showClock, 'tb-player-title-out':volExpanded && !volExpandClosing, 'tb-player-title-in':!volExpanded || volExpandClosing}" @click.stop="openNavDrawer">
  <div class="maintoolbar-title ellipsis" v-bind:class="{'dimmed': !playerStatus.ison, 'nd-title-fix':navdrawerVisible}">
   {{noPlayer ? trans.noplayer : player.name}}<v-icon v-if="playerStatus.sleepTime" class="player-status-icon dimmed" v-bind:class="{'link-item':!IS_MOBILE}" @click.stop="openSleep">hotel</v-icon><v-icon v-if="playerStatus.alarmStr" class="player-status-icon dimmed" v-bind:class="{'link-item':!IS_MOBILE}" @click.stop="openAlarms">alarm</v-icon><v-icon v-if="playerStatus.synced" class="player-status-icon dimmed" v-bind:class="{'link-item':!IS_MOBILE}" @click.stop="openSync">link</v-icon></div>
  <div v-if="!desktopLayout && !noPlayer && MBAR_NONE==mobileBar" class="maintoolbar-subtitle subtext ellipsis" v-bind:class="{'dimmed' : !playerStatus.ison}">{{playerStatus.count<1 ? trans.nothingplaying : isNowPlayingPage ? queueInfo : npInfo}}</div>
 </v-toolbar-title>
</v-layout>
 <div v-if="volExpanded && !showVolumeSlider && playerDvc!=VOL_HIDDEN" class="tb-vol-expand" :class="{'tb-vol-expand-open':volExpandOpen && !volExpandClosing, 'tb-vol-expand-closing':volExpandClosing, 'tb-vol-pct-live':volPctLive}" @click.stop>
  <!-- Slot keeps layout width; icon may be position:fixed while flying so layout can't overshoot home -->
  <span class="tb-vol-expand-icon-slot">
   <span class="tb-vol-expand-icon link-item" :style="volIconFlyStyle" @click.stop="toggleMute" :title="playerMuted ? i18n('Unmute') : i18n('Mute')">
    <lms-vol-icon :volume="playerVolume" :muted="playerMuted" :size="22"></lms-vol-icon>
   </span>
  </span>
  <v-slider class="tb-vol-expand-slider" step="1" min="0" max="100" v-model="playerVolume"
   :disabled="VOL_FIXED==playerDvc || noPlayer || queryParams.party || playerMuted"
   @start="onVolExpandStart(masterPlayerId)" @end="onVolExpandEnd" @change="setVolume" @wheel.native="volWheel($event)"></v-slider>
  <span class="tb-vol-expand-pct" v-bind:class="{'dimmed':playerMuted}">{{playerVolume|displayVolume(playerDvc)}}</span>
 </div>
 <v-spacer v-show="!volExpanded" class="drag-area" style="flex-grow:1000!important"></v-spacer>
 <!-- Update/download free space as soon as volume expands (not after animation) -->
 <div v-if="updateProgress.show && showUpdateProgress && downloadCount<=0" v-show="!volExpanded" class="ellipsis subtext tb-vol-hide-on-expand">{{updateProgress.text}}</div>
 <v-btn v-if="downloadCount>0" v-show="!volExpanded" icon flat class="tb-vol-hide-on-expand" @click="bus.$emit('dlg.open', 'downloadstatus')" :title="trans.downloading"><v-icon class="dimmed">cloud_download</v-icon></v-btn>
 <v-btn v-else-if="updateProgress.show" v-show="!volExpanded" icon flat class="tb-vol-hide-on-expand" @click="bus.$emit('showMessage', updateProgress.text)" :title="updateProgress.text"><v-icon class="dimmed">refresh</v-icon></v-btn>
 <v-btn v-show="playerStatus.synced && showVolumeSlider" icon flat class="toolbar-button hide-for-mini" id="vol-group-btn" :title="trans.groupVol" @click="bus.$emit('dlg.open', 'groupvolume', playerStatus)"><v-icon>speaker_group</v-icon></v-btn>
 <volume-control class="vol-full-slider" v-if="showVolumeSlider" :value="playerVolume" :muted="playerMuted" :playing="playerStatus.isplaying" :dvc="playerDvc" :layout="1" @inc="volumeUp" @dec="volumeDown" @changed="setVolume" @moving="movingVolumeSlider" @toggleMute="toggleMute"></volume-control>
 <!-- Always mounted when applicable: ghosted while expanded so speaker can FLIP home with no flash -->
 <v-btn v-else-if="playerDvc!=VOL_HIDDEN" v-bind:class="{'disabled':noPlayer, 'tb-vol-btn-ghost':volExpanded && desktopLayout, 'tb-vol-btn-close':volExpanded && !desktopLayout}" icon flat class="toolbar-button" v-longpress="volumeBtn" @click.middle="toggleMute" @wheel="volWheel($event)" id="vol-btn" :title="volExpanded && !desktopLayout ? i18n('Close') : trans.showVol">
  <v-icon v-if="volExpanded && !desktopLayout && !volExpandClosing">close</v-icon>
  <lms-vol-icon v-else-if="!(volExpanded && !desktopLayout)" :volume="playerVolume" :muted="playerMuted" :size="24"></lms-vol-icon>
  <div v-if="!(volExpanded && !desktopLayout)" v-bind:class="{'disabled':noPlayer,'vol-btn-label':!desktopLayout||!showVolumeSlider,'dimmed':playerMuted}" >{{playerVolume|displayVolume(playerDvc)}}</div>
 </v-btn>
 <v-btn icon :title="trans.info | tooltip(LMS_TRACK_INFO_KEYBOARD,keyboardControl)" v-if="showMai" @click.native="emitInfo" class="toolbar-button hide-for-mini" id="inf" v-bind:class="{'disabled':!LMS_P_MAI || maiUnavailable || (playerStatus.count<1 && !infoOpen)}">
  <img class="svg-img" :src="(infoOpen ? 'mai-filled' : 'mai') | svgIcon(darkUi, coloredToolbars&&!nowPlayingFull)"></img>
 </v-btn>
 <v-btn icon v-if="!desktopLayout && MBAR_THICK!=mobileBar && MBAR_REP_NAV!=mobileBar && !isNowPlayingPage" v-longpress="playPauseButton" class="toolbar-button hide-for-mini" id="pp" :title="playerStatus.isplaying ? trans.pause : trans.play" v-bind:class="{'disabled':playerStatus.count<1}">
  <v-icon>{{playerStatus.isplaying ? 'pause_circle_filled' : 'play_circle_filled'}}</v-icon>
 </v-btn>
 <v-btn icon :title="trans.info | tooltip(LMS_TRACK_INFO_KEYBOARD,keyboardControl)" v-if="desktopLayout" @click.native="emitInfo" class="toolbar-button hide-for-mini" v-bind:class="{'disabled':!LMS_P_MAI || maiUnavailable || (playerStatus.count<1 && !infoOpen)}" id="info-btn">
  <img class="svg-img" :src="(infoOpen ? 'mai-filled' : 'mai') | svgIcon(darkUi, coloredToolbars&&!nowPlayingFull)"></img>
 </v-btn>
 <v-btn icon :title="(nowPlayingExpanded ? trans.hideLarge : trans.showLarge) | tooltip(LMS_EXPAND_NP_KEYBOARD,keyboardControl,true)" v-if="desktopLayout" @click.native="expandNowPlaying()" class="toolbar-button hide-for-mini" v-bind:class="{'disabled':playerStatus.count<1 && !nowPlayingExpanded}" id="np-expand">
  <v-icon v-if="nowPlayingExpanded">keyboard_arrow_down</v-icon>
  <img class="svg-img" v-else :src="'expand-np' | svgIcon(darkUi, coloredToolbars)" oncontextmenu="return false;"></img>
 </v-btn>
 <v-btn icon :title="trans.toggleQueue | tooltip(LMS_TOGGLE_QUEUE_KEYBOARD,keyboardControl,true)" v-if="desktopLayout" @click.native.stop="toggleQueue()" class="toolbar-button hide-for-mini">
  <v-icon v-if="showQueue">queue_music</v-icon>
  <img v-else class="svg-img" :src="'queue_music_outline' | svgIcon(darkUi, coloredToolbars&&!nowPlayingFull)"></img>
 </v-btn>
 <div class="drag-area-right"></div>
 <lms-windowcontrols v-if="queryParams.nativeTitlebar && queryParams.tbarBtnsPos=='r'"></lms-windowcontrols>
</v-toolbar>
<!-- Bottom list: only when sync group, or when header chevron is expanded (all players). Master volume stays in the header. -->
<div v-if="volExpanded && !showVolumeSlider && showVolGroupPanel" class="tb-vol-group-panel" :class="{'tb-vol-expand-open':volExpandOpen && !volExpandClosing, 'tb-vol-expand-closing':volExpandClosing}" :style="volGroupPanelStyle" @click.stop @touchstart.stop>
 <div class="tb-vol-group-toolbar" v-if="volGroupPanelTitle">
  <span class="tb-vol-group-toolbar-title ellipsis">{{volGroupPanelTitle}}</span>
 </div>
 <div class="tb-vol-group-list" v-if="visibleVolPlayers.length>0">
  <div class="tb-vol-group-row" v-for="gp in visibleVolPlayers" :key="gp.id"
       :class="{'tb-vol-row-selected': isVolTarget(gp.id)}"
       @click.stop="selectVolTarget(gp.id)">
   <span class="tb-vol-group-name ellipsis">{{gp.name}}</span>
   <v-slider class="tb-vol-group-slider" step="1" min="0" max="100" v-model="gp.volume"
    @click.stop @start="onVolExpandStart(gp.id)" @end="onVolExpandEnd" @change="setGroupPlayerVolume(gp)"></v-slider>
   <span class="tb-vol-expand-pct" v-bind:class="{'tb-vol-pct-on':volPctLive}">{{gp.volume}}%</span>
  </div>
 </div>
</div>
<!-- Mobile: darkened browse/queue surface (drawer scrim) + vertical volume swipe while expanded -->
<div v-if="volExpanded && !desktopLayout && !showVolumeSlider && playerDvc!=VOL_HIDDEN"
     class="tb-vol-swipe-zone noselect"
     :class="{'tb-vol-swipe-active':volSwipeActive, 'tb-vol-swipe-has-panel':showVolGroupPanel, 'tb-vol-swipe-closing':volExpandClosing}"
     :style="volSwipeZoneStyle"
     @touchstart.passive="volSwipeStart"
     @touchmove="volSwipeMove"
     @touchend="volSwipeEnd"
     @touchcancel="volSwipeEnd"
     @wheel.prevent="volSwipeWheel"
     @click="onVolSwipeZoneClick">
 <div class="tb-vol-swipe-glass">
  <div class="tb-vol-swipe-hint" :class="{'tb-vol-swipe-hint-out': volSwipeHintFaded}">{{i18n('Swipe to adjust volume')}}</div>
  <div class="tb-vol-swipe-pct" v-show="volPctLive" v-bind:class="{'dimmed':playerMuted}">{{volSwipeDisplayPct}}</div>
  <div class="tb-vol-swipe-target ellipsis" v-show="volPctLive && volTargetLabel">{{volTargetLabel}}</div>
 </div>
</div>
<v-menu v-model="menu.show" :position-x="menu.x" :position-y="menu.y">
 <v-list>
  <template v-for="(entry, index) in menu.items">
   <v-list-tile role="menuitem" @click="menuAction(entry.cmd, $event)">
    <v-list-tile-avatar>
     <v-icon v-if="undefined==entry.svg" v-bind:class="{'dimmed': entry.dimmed}">{{entry.icon}}</v-icon>
     <img v-else class="svg-img" :src="entry.svg | svgIcon(darkUi)"></img>
    </v-list-tile-avatar>
    <v-list-tile-title>{{entry.title}}</v-list-tile-title>
   </v-list-tile>
  </template>
 </v-list>
<v-menu>
</div>
    `,
    data() {
        return { playlist: { count: "", duration: "" },
                 playerStatus: { ison: 1, isplaying: false, volume: 0, synced: false, sleepTime: undefined, count:0, alarm: undefined, alarmStr: undefined },
                 maiUnavailable: false,
                 npInfo: "...",
                 queueInfo: "...",
                 trans:{nothingplaying:undefined, info:undefined, showLarge:undefined, hideLarge:undefined, showVol:undefined, downloading:undefined,
                        play:undefined, pause:undefined, toggleQueue:undefined, groupVol:undefined, browse:undefined, queue:undefined},
                 infoOpen: false,
                 nowPlayingExpanded: false,
                 playerVolume: 0,
                 playerMuted: false,
                 playerDvc: VOL_STD,
                 movingVolumeSlider: false,
                 volumePreviewActive: false,
                 volExpanded: false,
                 volExpandOpen: false,
                 volExpandClosing: false,
                 volShowAllPlayers: getLocalStorageBool('volShowAllPlayers', false),
                 volTargetId: undefined,
                 volSwipeActive: false,
                 volSwipeShowPct: false,
                 volGroupPanelHeight: 0,
                 volPanelTop: 0,
                 volIconFlyStyle: undefined,
                 groupPlayers: [],
                 connected: true,
                 width: 100,
                 height: 300,
                 updateProgress: {show:false, text:undefined},
                 date: undefined,
                 time: undefined,
                 navdrawerVisible: false,
                 windowControlsOverlayRight:0,
                 menu: {show:false, items:[]}
               }
    },
    mounted() {
        if (queryParams.nativeTitlebar) {
            document.documentElement.style.setProperty('--drag-area-height', '0px');
        }
        setTimeout(function () {
            this.width = Math.floor(window.innerWidth/50)*50;
            this.height = Math.floor(window.innerHeight/50)*50;
        }.bind(this), 1000);
        bus.$on('windowWidthChanged', function() {
            this.width = Math.floor(window.innerWidth/50)*50;
        }.bind(this));
        bus.$on('windowHeightChanged', function() {
            this.height = Math.floor(window.innerHeight/50)*50;
        }.bind(this));
        bus.$on('navdrawer', function(visible) {
            this.navdrawerVisible = visible;
        }.bind(this));
        bus.$on('scanProgress', function(text) {
            if (undefined!=text) {
                this.updateProgress.show=true;
                this.updateProgress.text=text=='?' ? i18n("In progress") : text;
            } else if (this.updateProgress.show) {
                this.updateProgress.show=false;
                this.updateProgress.text=undefined;
            }
        }.bind(this));

        bus.$on('queueStatus', function(count, duration) {
            this.queueInfo = (count>0 ? i18np("1 Track", "%1 Tracks", count) : "") + (duration>0 ? (SEPARATOR + formatSeconds(Math.floor(duration))) : "")
            if (isEmpty(this.queueInfo)) {
                this.queueInfo = "...";
            }
        }.bind(this));
        bus.$on('nowPlayingBrief', function(np) {
            this.npInfo = isEmpty(np) ? "..." : np;
        }.bind(this));
        bus.$on('playerStatus', function(playerStatus) {
            if (playerStatus.ison!=this.playerStatus.ison) {
                this.playerStatus.ison = playerStatus.ison;
            }
            if (playerStatus.isplaying!=this.playerStatus.isplaying) {
                this.playerStatus.isplaying = playerStatus.isplaying;
            }
            if (playerStatus.volume!=this.playerStatus.volume) {
                this.playerStatus.volume = playerStatus.volume;
            }
            if (playerStatus.synced!=this.playerStatus.synced) {
                this.playerStatus.synced = playerStatus.synced;
            }
            if (playerStatus.syncmaster!=this.playerStatus.syncmaster) {
                this.playerStatus.syncmaster = playerStatus.syncmaster;
            }
            if (playerStatus.syncslaves!=this.playerStatus.syncslaves) {
                this.playerStatus.syncslaves = playerStatus.syncslaves;
            }
            this.playerStatus.count=playerStatus.playlist ? playerStatus.playlist.count : 0;
            // Disable Music Artist Info for WiiM Bluetooth / Optical / RCA / etc.
            this.maiUnavailable = isWiimLiveInput(playerStatus.current);
            this.playerDvc = playerStatus.dvc;
            this.playerMuted = playerStatus.muted;
            var vol = playerStatus.volume;
            if (vol != this.playerVolume && !this.movingVolumeSlider && !this.volumePreviewActive) {
                this.playerVolume = vol;
            }
            if (this.playerStatus.sleepTime!=playerStatus.will_sleep_in) {
                this.playerStatus.sleepTime=playerStatus.will_sleep_in;
            }
            this.playerId = ""+this.$store.state.player.id;
            if (this.playerStatus.alarm!=playerStatus.alarm) {
                if (undefined==playerStatus.alarm) {
                    this.playerStatus.alarmStr = undefined;
                } else {
                    let alarmDate = new Date(playerStatus.alarm*1000);
                    this.playerStatus.alarmStr = dateStr(alarmDate, this.$store.state.lang)+" "+timeStr(alarmDate, this.$store.state.lang);
                }
                this.playerStatus.alarm=playerStatus.alarm;
            }
        }.bind(this));
        
        bus.$on('langChanged', function() {
            this.initItems();
        }.bind(this));
        this.initItems();

        bus.$on('infoDialog', function(val) {
            this.infoOpen = val;
            this.initItems();
        }.bind(this));
        bus.$on('nowPlayingExpanded', function(val) {
            this.nowPlayingExpanded = val;
        }.bind(this));

        bus.$on('playerChanged', function() {
            // Ensure we update volume when player changes.
            this.playerVolume = undefined;
            this.volumePreviewActive = false;
            if (this.volExpanded) {
                this.collapseVolume();
            }
        }.bind(this));

        bus.$on('volumePreview', function(vol) {
            if (undefined==vol || vol<0) {
                this.volumePreviewActive = false;
                if (this._volPreviewClearTimer) {
                    clearTimeout(this._volPreviewClearTimer);
                    this._volPreviewClearTimer = undefined;
                }
                return;
            }
            this.volumePreviewActive = true;
            if (vol != this.playerVolume) {
                this.playerVolume = vol;
            }
            // Auto-clear preview lock so status can re-sync after wheel/swipe settle
            if (this._volPreviewClearTimer) {
                clearTimeout(this._volPreviewClearTimer);
            }
            this._volPreviewClearTimer = setTimeout(function() {
                this._volPreviewClearTimer = undefined;
                if (!this.movingVolumeSlider && !this.volSwipeActive) {
                    this.volumePreviewActive = false;
                }
            }.bind(this), 900);
        }.bind(this));

        bus.$on('nowPlayingClockChanged', function() {
            this.controlClock();
        }.bind(this));
        this.controlClock();

        bus.$on('networkStatus', function(connected) {
            if (connected) {
                this.connected = true;
                this.cancelDisconnectedTimer();
            } else if (this.connected && !this.disconnectedTimer) {
                // Delay showing warning for 5s
                this.disconnectedTimer = setInterval(function () {
                    this.connected = false;
                }.bind(this), 5000);
            }
        }.bind(this));

        if (!IS_MOBILE && !LMS_KIOSK_MODE) {
            bindKey(LMS_TOGGLE_QUEUE_KEYBOARD, 'mod+shift');
            bus.$on('keyboard', function(key, modifier) {
                if (this.$store.state.openDialogs.length>1 || (1==this.$store.state.openDialogs.length && this.$store.state.openDialogs[0]!='info-dialog')) {
                    return;
                }
                if ('mod+shift'==modifier && LMS_TOGGLE_QUEUE_KEYBOARD==key && this.$store.state.desktopLayout) {
                    this.toggleQueue();
                }
            }.bind(this));
        }
        bus.$on('windowControlsOverlayChanged', function() {
            this.updateWindowControlsOverlay();
        }.bind(this));
        this.updateWindowControlsOverlay();
    },
    methods: {
        initItems() {
            this.trans = {noplayer:i18n('No Player'), nothingplaying:i18n('Nothing playing'), info:i18n("Show current track information"),
                          showLarge:i18n("Expand now playing"), hideLarge:i18n("Collapse now playing"), showVol:i18n("Show volume"), play:i18n("Play"), 
                          pause:i18n("Pause"), toggleQueue:i18n('Toggle queue'), downloading:i18n('Downloading'),
                          groupVol:i18n('Adjust volume of associated players'), browse:i18n('Browse'), queue:i18n('Queue')};
        },
        updateWindowControlsOverlay() {
            let val = parseInt(window.getComputedStyle(document.documentElement).getPropertyValue('--window-area-right').replace('px', ''));
            this.windowControlsOverlayRight = undefined==val ? 0 : val;
        },
        scrollPageToTop() {
            if (this.volExpanded) {
                return;
            }
            bus.$emit('scrollCurrentToTop');
        },
        emitInfo() {
            if (this.$store.state.visibleMenus.size>0 || this.maiUnavailable || (this.playerStatus.count<1 && !this.infoOpen)) {
                return;
            }
            if (LMS_P_MAI) {
                bus.$emit('info');
            }
        },
        expandNowPlaying() {
            if (this.$store.state.visibleMenus.size>0) {
                return;
            }
            if (!this.nowPlayingExpanded && this.playerStatus.count<1) {
                return;
            }
            bus.$emit('expandNowPlaying', !this.nowPlayingExpanded);
            if (!this.$store.state.pinQueue && this.$store.state.showQueue) {
                this.$store.commit('setShowQueue', false);
            }
        },
        volumeBtn(longPress, el) {
            if (this.$store.state.visibleMenus.size>0 || this.noPlayer || undefined==el || undefined==el.id || queryParams.party) {
                return;
            }
            if (this.playerMuted) {
                bus.$emit('playerCommand', ['mixer', 'muting', 0]);
                return;
            }
            if (longPress && VOL_STD==this.playerDvc) {
                bus.$emit('playerCommand', ['mixer', 'muting', 1]);
                return;
            }
            /* Header expand animation (mobile + desktop). Same pad for fixed-100% and adjustable. */
            if (!this.showVolumeSlider && VOL_HIDDEN!=this.playerDvc) {
                if (this.volExpanded) {
                    this.collapseVolume();
                    return;
                }
                this.expandVolume();
                return;
            }
            bus.$emit('dlg.open', window.innerHeight>=250 && this.playerStatus.synced && !queryParams.single && this.$store.state.desktopLayout ? 'groupvolume' : 'volume', this.playerStatus, true);
        },
        expandVolume() {
            if (this._volUnmountTimer) {
                clearTimeout(this._volUnmountTimer);
                this._volUnmountTimer = undefined;
            }
            if (this._volIconLandTimer) {
                clearTimeout(this._volIconLandTimer);
                this._volIconLandTimer = undefined;
            }
            this.volIconFlyStyle = undefined;
            // A sync / player-group never opens as "all players"
            if (this.isVolGroupContext()) {
                this.volShowAllPlayers = false;
            } else {
                this.volShowAllPlayers = getLocalStorageBool('volShowAllPlayers', false);
            }
            this.volTargetId = this.$store.state.player ? this.$store.state.player.id : undefined;
            this.volSwipeActive = false;
            this.volSwipeShowPct = false;
            this.volGroupPanelHeight = 0;
            this.measureVolPanelTop();
            /* Home = speaker glyph of #vol-btn (far right, or 2nd-from-right if info present). */
            this.cacheVolBtnHome();
            this.volExpanded = true;
            this.volExpandClosing = false;
            this.volExpandOpen = false; /* mount expand collapsed first */
            this.refreshGroupPlayers();
            this.bindVolOutside();
            this.$nextTick(function() {
                let home = this._volBtnHome;
                let box = this.volIconBoxSize();
                /* Pin expand icon fixed at home so layout reflow cannot drag it */
                if (home) {
                    this.setVolIconFixed(home.cx - box / 2, home.cy - box / 2, box, false);
                }
                requestAnimationFrame(function() {
                    requestAnimationFrame(function() {
                        this.volExpandOpen = true;
                        /* Wait for title collapse + slider grow before measuring open slot */
                        this.$nextTick(function() {
                            this.measureVolGroupPanelHeight();
                            requestAnimationFrame(function() {
                                let open = this.measureVolIconSlot();
                                if (open) {
                                    this.setVolIconFixed(open.left, open.top, box, true);
                                } else {
                                    this.volIconFlyStyle = undefined;
                                }
                                this.measureVolGroupPanelHeight();
                                /* Release fixed after land so further layout is normal */
                                if (this._volIconLandTimer) {
                                    clearTimeout(this._volIconLandTimer);
                                }
                                this._volIconLandTimer = setTimeout(function() {
                                    this._volIconLandTimer = undefined;
                                    if (this.volExpanded && this.volExpandOpen && !this.volExpandClosing) {
                                        this.volIconFlyStyle = undefined;
                                    }
                                    this.measureVolGroupPanelHeight();
                                }.bind(this), 500);
                            }.bind(this));
                        }.bind(this));
                    }.bind(this));
                }.bind(this));
            }.bind(this));
            // Desktop only auto-collapse; mobile stays open while user adjusts group rows
            this.scheduleVolCollapse(5000);
        },
        volIconBoxSize() {
            return 28;
        },
        setVolIconFixed(left, top, box, animate) {
            let b = undefined!=box ? box : this.volIconBoxSize();
            this.volIconFlyStyle = {
                position: 'fixed',
                left: left.toFixed(1) + 'px',
                top: top.toFixed(1) + 'px',
                width: b + 'px',
                height: b + 'px',
                margin: '0',
                transform: 'none',
                zIndex: 60,
                transition: animate
                    ? 'left 0.48s cubic-bezier(0.22, 1, 0.36, 1), top 0.48s cubic-bezier(0.22, 1, 0.36, 1)'
                    : 'none'
            };
        },
        /** In-flow slot rect for the expand icon (left of slider). */
        measureVolIconSlot() {
            try {
                let root = this.$el;
                let slot = root && root.querySelector && root.querySelector('.tb-vol-expand-icon-slot');
                if (!slot) {
                    return null;
                }
                let r = slot.getBoundingClientRect();
                if (!r.width && !r.height) {
                    return null;
                }
                let box = this.volIconBoxSize();
                return {
                    left: r.left + (r.width - box) / 2,
                    top: r.top + (r.height - box) / 2
                };
            } catch (e) {
                return null;
            }
        },
        cacheVolBtnHome() {
            try {
                let root = this.$el;
                let btn = root && root.querySelector && root.querySelector('#vol-btn');
                if (!btn) {
                    this._volBtnHome = null;
                    return;
                }
                /* Prefer speaker glyph (not the % label) so home matches visual icon. */
                let target = btn.querySelector('.v-btn__content > *:first-child') ||
                    btn.querySelector('img, svg, .v-icon, i') ||
                    btn.querySelector('.v-btn__content') || btn;
                let tr = target.getBoundingClientRect();
                if (!tr.width) {
                    this._volBtnHome = null;
                    return;
                }
                this._volBtnHome = {
                    left: tr.left,
                    top: tr.top,
                    width: tr.width,
                    height: tr.height,
                    cx: tr.left + tr.width / 2,
                    cy: tr.top + tr.height / 2
                };
            } catch (e) {
                this._volBtnHome = null;
            }
        },
        collapseVolume() {
            if (!this.volExpanded || this.volExpandClosing) {
                return;
            }
            if (this._volIconLandTimer) {
                clearTimeout(this._volIconLandTimer);
                this._volIconLandTimer = undefined;
            }
            /* Pin at current on-screen position (in-flow or already fixed), then fly home */
            try {
                let root = this.$el;
                let icon = root && root.querySelector && root.querySelector('.tb-vol-expand-icon');
                if (icon) {
                    let ir = icon.getBoundingClientRect();
                    if (ir.width) {
                        this.setVolIconFixed(ir.left, ir.top, ir.width, false);
                    }
                }
            } catch (e) {}
            this.volExpandClosing = true;
            this.volExpandOpen = false;
            if (this._volCollapseTimer) {
                clearTimeout(this._volCollapseTimer);
                this._volCollapseTimer = undefined;
            }
            this.unbindVolOutside();
            if (this._volUnmountTimer) {
                clearTimeout(this._volUnmountTimer);
            }
            let home = this._volBtnHome;
            let box = this.volIconBoxSize();
            requestAnimationFrame(function() {
                requestAnimationFrame(function() {
                    if (home) {
                        this.setVolIconFixed(home.cx - box / 2, home.cy - box / 2, box, true);
                    }
                }.bind(this));
            }.bind(this));
            this._volUnmountTimer = setTimeout(function() {
                this._volUnmountTimer = undefined;
                this.volExpanded = false;
                this.volExpandClosing = false;
                this.volIconFlyStyle = undefined;
                this.groupPlayers = [];
                // Keep volShowAllPlayers remembered across sessions — only clear transient UI
                this.volTargetId = undefined;
                this.volSwipeActive = false;
                this.volSwipeShowPct = false;
                this.volGroupPanelHeight = 0;
                this.volPanelTop = 0;
            }.bind(this), 520);
        },
        bindVolOutside() {
            this.unbindVolOutside();
            this._volOutsideAt = Date.now() + 500; /* ignore opening gesture */
            this._onVolOutside = function(ev) {
                if (!this.volExpanded || this.movingVolumeSlider || this.volSwipeActive) {
                    return;
                }
                if (Date.now() < (this._volOutsideAt||0)) {
                    return;
                }
                let t = ev.target;
                if (!t || !t.closest) {
                    return;
                }
                // Stay open while interacting with volume UI (header strip, group panel, sliders, swipe zone)
                if (t.closest('.tb-vol-expand') || t.closest('.tb-vol-group-panel') ||
                    t.closest('.tb-vol-swipe-zone') || t.closest('#vol-btn') ||
                    t.closest('.v-slider') || t.closest('.v-input') || t.closest('.v-menu__content')) {
                    return;
                }
                this.collapseVolume();
            }.bind(this);
            document.addEventListener('pointerdown', this._onVolOutside, true);
            document.addEventListener('touchstart', this._onVolOutside, true);
        },
        unbindVolOutside() {
            if (this._onVolOutside) {
                document.removeEventListener('pointerdown', this._onVolOutside, true);
                document.removeEventListener('touchstart', this._onVolOutside, true);
                this._onVolOutside = undefined;
            }
        },
        /** Auto-collapse after idle on both desktop and mobile (outside tap still dismisses). */
        isVolAutoCollapse() {
            return true;
        },
        scheduleVolCollapse(ms) {
            if (this._volCollapseTimer) {
                clearTimeout(this._volCollapseTimer);
                this._volCollapseTimer = undefined;
            }
            if (!this.isVolAutoCollapse() || !this.volExpanded) {
                return;
            }
            this._volCollapseTimer = setTimeout(function() {
                this._volCollapseTimer = undefined;
                if (!this.movingVolumeSlider && !this.volSwipeActive && this.volExpanded) {
                    this.collapseVolume();
                } else if (this.movingVolumeSlider || this.volSwipeActive) {
                    // Still adjusting — retry shortly after interaction ends
                    this.scheduleVolCollapse(1500);
                }
            }.bind(this), undefined==ms ? 5000 : ms);
        },
        /** Anchor all-players drawer flush under the live toolbar bottom (no gap). */
        measureVolPanelTop() {
            try {
                let tb = document.getElementById('main-toolbar');
                if (tb && tb.getBoundingClientRect) {
                    this.volPanelTop = Math.round(tb.getBoundingClientRect().bottom);
                    return;
                }
            } catch (e) {}
            this.volPanelTop = 0;
        },
        measureVolGroupPanelHeight() {
            try {
                this.measureVolPanelTop();
                let root = this.$el;
                let panel = root && root.querySelector && root.querySelector('.tb-vol-group-panel.tb-vol-expand-open');
                this.volGroupPanelHeight = panel ? Math.ceil(panel.getBoundingClientRect().height) : 0;
            } catch (e) {
                this.volGroupPanelHeight = 0;
            }
        },
        onVolExpandStart(targetId) {
            if (targetId) {
                this.selectVolTarget(targetId);
            }
            this.movingVolumeSlider = true;
            this.volSwipeShowPct = true;
            this._volOutsideAt = Date.now() + 800; /* don't treat drag-end as outside dismiss */
            if (this._volCollapseTimer) {
                clearTimeout(this._volCollapseTimer);
                this._volCollapseTimer = undefined;
            }
            if (this._volPctHideTimer) {
                clearTimeout(this._volPctHideTimer);
                this._volPctHideTimer = undefined;
            }
        },
        onVolExpandEnd() {
            this.movingVolumeSlider = false;
            this._volOutsideAt = Date.now() + 450;
            // Allow status to re-sync after drag; keep local value until then
            if (this._volPreviewClearTimer) {
                clearTimeout(this._volPreviewClearTimer);
            }
            this._volPreviewClearTimer = setTimeout(function() {
                this._volPreviewClearTimer = undefined;
                this.volumePreviewActive = false;
            }.bind(this), 500);
            this.scheduleVolPctHide();
            this.scheduleVolCollapse(2000);
        },
        scheduleVolPctHide() {
            if (this._volPctHideTimer) {
                clearTimeout(this._volPctHideTimer);
            }
            this._volPctHideTimer = setTimeout(function() {
                this._volPctHideTimer = undefined;
                if (!this.movingVolumeSlider && !this.volSwipeActive) {
                    this.volSwipeShowPct = false;
                }
            }.bind(this), 900);
        },
        selectVolTarget(id) {
            if (!id) { return; }
            this.volTargetId = id;
            this.volSwipeShowPct = true;
            this._volOutsideAt = Date.now() + 300;
            this.scheduleVolPctHide();
            // Stay open — selection must never auto-collapse the panel
            if (this._volCollapseTimer) {
                clearTimeout(this._volCollapseTimer);
                this._volCollapseTimer = undefined;
            }
        },
        isVolTarget(id) {
            let tid = this.volTargetId || this.masterPlayerId;
            return !!id && id === tid;
        },
        isVolGroupContext() {
            if (this.playerStatus && this.playerStatus.synced) {
                return true;
            }
            let p = this.$store.state.player;
            return !!(p && p.isgroup);
        },
        collectVolGroupIds() {
            let ids = [];
            let seen = {};
            let add = function(id) {
                if (!id || seen[id]) { return; }
                seen[id] = true;
                ids.push(id);
            };
            if (this.playerStatus) {
                add(this.playerStatus.syncmaster);
                (this.playerStatus.syncslaves || []).forEach(add);
            }
            let p = this.$store.state.player;
            if (p && p.isgroup) {
                add(p.id);
                (p.members || []).forEach(add);
            }
            return ids;
        },
        toggleVolShowAllPlayers() {
            if (this.isVolGroupContext()) {
                return;
            }
            this.volShowAllPlayers = !this.volShowAllPlayers;
            try { setLocalStorageVal('volShowAllPlayers', this.volShowAllPlayers); } catch (e) {}
            this._volOutsideAt = Date.now() + 400;
            if (this.volShowAllPlayers) {
                this.refreshAllPlayersVolumes();
            } else if (this.isVolGroupContext()) {
                this.refreshGroupPlayers();
            } else {
                // Collapsed + not a group → hide bottom list
                this.groupPlayers = [];
                this.volGroupPanelHeight = 0;
                // Keep swipe target on current player
                this.volTargetId = this.masterPlayerId;
            }
            this.$nextTick(function() {
                this.measureVolGroupPanelHeight();
                setTimeout(function() { this.measureVolGroupPanelHeight(); }.bind(this), 480);
            }.bind(this));
            this.scheduleVolCollapse(8000);
        },
        refreshGroupPlayers() {
            this.groupPlayers = [];
            if (!this.isVolGroupContext()) {
                if (this.volShowAllPlayers) {
                    this.refreshAllPlayersVolumes();
                    return;
                }
                this.volGroupPanelHeight = 0;
                return;
            }
            let pmap = {};
            (this.$store.state.players || []).forEach(function(p) { pmap[p.id] = p; });
            let self = this;
            let curId = this.$store.state.player && this.$store.state.player.id;
            this.collectVolGroupIds().forEach(function(id) {
                if (!id || id===curId) {
                    return;
                }
                let p = pmap[id];
                if (!p || p.isgroup) { return; }
                self.groupPlayers.push({id: id, name: p.name, volume: 0});
                self._fetchPlayerVolume(id, 'group');
            });
            this.$nextTick(function() { this.measureVolGroupPanelHeight(); }.bind(this));
        },
        refreshAllPlayersVolumes() {
            let self = this;
            let curId = this.$store.state.player && this.$store.state.player.id;
            let list = [];
            (this.$store.state.players || []).forEach(function(p) {
                if (!p || !p.id || p.id===curId) { return; }
                list.push({id: p.id, name: p.name, volume: 0});
            });
            this.groupPlayers = list;
            list.forEach(function(gp) {
                self._fetchPlayerVolume(gp.id, 'all');
            });
            this.$nextTick(function() { this.measureVolGroupPanelHeight(); }.bind(this));
        },
        _fetchPlayerVolume(id, tag) {
            let self = this;
            lmsCommand(id, ["status", "-", 1, "tags:uB"]).then(function(res) {
                let data = res.data || res;
                let r = data && data.result;
                if (!r) { return; }
                let vol = Math.abs(parseInt(r["mixer volume"]));
                if (isNaN(vol)) { return; }
                for (let i=0; i<self.groupPlayers.length; ++i) {
                    if (self.groupPlayers[i].id==id) {
                        self.$set(self.groupPlayers, i, Object.assign({}, self.groupPlayers[i], {volume: vol}));
                        break;
                    }
                }
            }).catch(function(){});
        },
        volTargetVolume() {
            let tid = this.volTargetId || this.masterPlayerId;
            if (!tid || tid === this.masterPlayerId) {
                return isNaN(this.playerVolume) ? 0 : this.playerVolume;
            }
            for (let i = 0; i < this.groupPlayers.length; ++i) {
                if (this.groupPlayers[i].id === tid) {
                    let v = this.groupPlayers[i].volume;
                    return isNaN(v) ? 0 : v;
                }
            }
            return isNaN(this.playerVolume) ? 0 : this.playerVolume;
        },
        applyVolTargetVolume(nv) {
            let tid = this.volTargetId || this.masterPlayerId;
            if (!tid || tid === this.masterPlayerId) {
                this.playerVolume = nv;
                this.playerStatus.volume = nv;
                bus.$emit('volumePreview', nv);
                return;
            }
            for (let i = 0; i < this.groupPlayers.length; ++i) {
                if (this.groupPlayers[i].id === tid) {
                    this.$set(this.groupPlayers, i, Object.assign({}, this.groupPlayers[i], {volume: nv}));
                    return;
                }
            }
        },
        commitVolTargetVolume(nv) {
            let tid = this.volTargetId || this.masterPlayerId;
            if (!tid || tid === this.masterPlayerId) {
                this.setVolume(nv);
                return;
            }
            let gp = null;
            for (let i = 0; i < this.groupPlayers.length; ++i) {
                if (this.groupPlayers[i].id === tid) {
                    gp = this.groupPlayers[i];
                    break;
                }
            }
            if (gp) {
                gp.volume = nv;
                this.setGroupPlayerVolume(gp);
            }
        },
        volTargetCanAdjust() {
            let tid = this.volTargetId || this.masterPlayerId;
            if (!tid || tid===this.masterPlayerId) {
                return VOL_STD==this.playerDvc;
            }
            let players = this.$store.state.players || [];
            for (let i=0; i<players.length; ++i) {
                if (players[i] && players[i].id===tid) {
                    return players[i].dvc==null || players[i].dvc===VOL_STD;
                }
            }
            return true;
        },
        volSwipeStart(ev) {
            if (!ev.touches || !ev.touches[0] || VOL_HIDDEN==this.playerDvc) {
                return;
            }
            this._volSwipe = {
                y0: ev.touches[0].clientY,
                v0: this.volTargetVolume(),
                tid: this.volTargetId || this.masterPlayerId,
                moved: false,
                lastSent: -1
            };
            this.volSwipeActive = true;
            if (this._volCollapseTimer) {
                clearTimeout(this._volCollapseTimer);
                this._volCollapseTimer = undefined;
            }
            if (this._volPctHideTimer) {
                clearTimeout(this._volPctHideTimer);
                this._volPctHideTimer = undefined;
            }
        },
        volSwipeMove(ev) {
            if (!this._volSwipe || !ev.touches || !ev.touches[0]) {
                return;
            }
            let dy = this._volSwipe.y0 - ev.touches[0].clientY; // finger up → +vol
            // Larger dead-zone so light finger jitter does not start adjusting
            if (Math.abs(dy) < 14 && !this._volSwipe.moved) {
                return;
            }
            this._volSwipe.moved = true;
            this.volSwipeShowPct = true;
            if (!this.volTargetCanAdjust()) {
                if (ev.cancelable) {
                    try { ev.preventDefault(); } catch (e) {}
                }
                return;
            }
            // Less sensitive: ~6.5px finger travel per volume percent (was ~2.4)
            let nv = Math.round(this._volSwipe.v0 + dy / 6.5);
            if (nv < 0) { nv = 0; }
            if (nv > 100) { nv = 100; }
            this.applyVolTargetVolume(nv);
            if (Math.abs(nv - this._volSwipe.lastSent) >= (lmsOptions.volumeStep || 1)) {
                this._volSwipe.lastSent = nv;
                let tid = this._volSwipe.tid || this.masterPlayerId;
                try {
                    lmsCommand(tid, ["mixer", "volume", nv]);
                } catch (e) {}
            }
            if (ev.cancelable) {
                ev.preventDefault();
            }
        },
        volSwipeEnd() {
            if (!this._volSwipe) {
                this.volSwipeActive = false;
                return;
            }
            let moved = this._volSwipe.moved;
            let v = this.volTargetVolume();
            this._volSwipe = null;
            this.volSwipeActive = false;
            if (moved && this.volTargetCanAdjust()) {
                this.commitVolTargetVolume(v);
                // Suppress synthetic click after swipe so zone does not immediately close
                this._volSuppressZoneClickUntil = Date.now() + 350;
            }
            this._volOutsideAt = Date.now() + 350;
            this.scheduleVolPctHide();
            // Mobile: no auto-collapse after swipe
            this.scheduleVolCollapse(2000);
        },
        volSwipeWheel(ev) {
            if (!this.volTargetCanAdjust()) {
                return;
            }
            let step = lmsOptions.volumeStep || 1;
            let v = this.volTargetVolume();
            if (ev.deltaY < 0) {
                v = Math.min(100, v + step);
            } else if (ev.deltaY > 0) {
                v = Math.max(0, v - step);
            }
            this.applyVolTargetVolume(v);
            this.commitVolTargetVolume(v);
            this.volSwipeShowPct = true;
            this.scheduleVolPctHide();
            this.scheduleVolCollapse(2000);
        },
        onVolSwipeZoneClick() {
            /* Tap darkened zone: full dismiss (not after a swipe/drag release) */
            if (this.volSwipeActive || this.movingVolumeSlider) {
                return;
            }
            if (Date.now() < (this._volSuppressZoneClickUntil||0) || Date.now() < (this._volOutsideAt||0)) {
                return;
            }
            this.collapseVolume();
        },
        setGroupPlayerVolume(gp) {
            if (!gp || !gp.id) { return; }
            if (gp.id) {
                this.volTargetId = gp.id;
            }
            bus.$emit('playerCommand', ["mixer", "volume", gp.volume], gp.id);
            /* some builds only accept current player — use lmsCommand directly */
            try { lmsCommand(gp.id, ["mixer", "volume", gp.volume]); } catch (e) {}
            this._volOutsideAt = Date.now() + 400;
            this.scheduleVolCollapse(2000);
        },
        setVolume(val) {
            if (queryParams.party) {
                return;
            }
            this.playerVolume = val;
            this.playerStatus.volume = val;
            bus.$emit('playerCommand', ["mixer", "volume", this.playerVolume]);
            if (this.volExpanded) {
                this._volOutsideAt = Date.now() + 400;
                this.scheduleVolCollapse(2000);
            }
        },
        movingVolumeSlider(moving) {
            this.movingVolumeSlider = moving;
        },
        toggleMute() {
            if (this.noPlayer || VOL_STD!=this.playerDvc || queryParams.party || this.$store.state.visibleMenus.size>0) {
                return;
            }
            bus.$emit('playerCommand', ['mixer', 'muting', this.playerMuted ? 0 : 1]);
        },
        volumeUp() {
            if (queryParams.party || this.$store.state.visibleMenus.size>0) {
                return;
            }
            bus.$emit('playerCommand', ["mixer", "volume", "+"+lmsOptions.volumeStep]);
        },
        volumeDown() {
            if (queryParams.party || this.$store.state.visibleMenus.size>0) {
                return;
            }
            bus.$emit('playerCommand', ["mixer", "volume", "-"+lmsOptions.volumeStep]);
        },
        volWheel(event) {
            if (queryParams.party || this.$store.state.visibleMenus.size>0 || VOL_STD!=this.playerDvc || this.noPlayer) {
                return;
            }
            let step = lmsOptions.volumeStep || 1;
            let v = isNaN(this.playerVolume) ? 0 : this.playerVolume;
            if (event.deltaY<0) {
                v = Math.min(100, v + step);
            } else if (event.deltaY>0) {
                v = Math.max(0, v - step);
            } else {
                return;
            }
            // Optimistic local update so the thumb tracks trackpad/wheel immediately
            this.playerVolume = v;
            this.playerStatus.volume = v;
            bus.$emit('volumePreview', v);
            bus.$emit('playerCommand', ["mixer", "volume", v]);
            if (this.volExpanded) {
                this.volSwipeShowPct = true;
                this.scheduleVolPctHide();
                this.scheduleVolCollapse(2000);
            }
            if (event.preventDefault) {
                event.preventDefault();
            }
        },
        changePage() {
            this.$store.commit('setPage', this.currentPage=='browse' ? 'queue' : 'browse');
        },
        playPauseButton(long) {
            if (this.$store.state.visibleMenus.size>0 || this.noPlayer) {
                return;
            }
            if (long) {
                bus.$emit('dlg.open', 'sleep', this.$store.state.player);
            } else {
                bus.$emit('playerCommand', [this.playerStatus.isplaying ? 'pause' : 'play']);
            }
        },
        openSleep() {
            if (this.$store.state.visibleMenus.size>0) {
                return;
            }
            if (IS_MOBILE) {
                this.openNavDrawer();
                return;
            }
            bus.$emit('dlg.open', 'sleep', this.$store.state.player);
        },
        openAlarms() {
            if (this.$store.state.visibleMenus.size>0) {
                return;
            }
            if (IS_MOBILE) {
                this.openNavDrawer();
                return;
            }
            bus.$emit('dlg.open', 'playersettings', undefined, 'alarms');
        },
        openSync() {
            if (this.$store.state.visibleMenus.size>0) {
                return;
            }
            if (IS_MOBILE) {
                this.openNavDrawer();
                return;
            }
            bus.$emit('dlg.open', 'sync', this.$store.state.player);
        },
        cancelDisconnectedTimer() {
            if (undefined!==this.disconnectedTimer) {
                clearInterval(this.disconnectedTimer);
                this.disconnectedTimer = undefined;
            }
        },
        controlClock() {
            if (this.$store.state.nowPlayingClock) {
                if (undefined==this.clockTimer) {
                    this.updateClock();
                }
            } else {
                this.cancelClockTimer();
            }
        },
        cancelClockTimer() {
            if (undefined!==this.clockTimer) {
                clearTimeout(this.clockTimer);
                this.clockTimer = undefined;
            }
        },
        updateClock() {
            var date = new Date();
            this.date = dateStr(date, this.$store.state.lang);
            this.time = timeStr(date, this.$store.state.lang);
            if (undefined!==this.clockTimer) {
                clearTimeout(this.clockTimer);
            }
            var next = 60-date.getSeconds();
            this.clockTimer = setTimeout(function () {
                this.updateClock();
            }.bind(this), (next*1000)+25);
        },
        toggleQueue() {
            bus.$emit('toggleQueue');
        },
        mouseDown(ev) {
            toolbarMouseDown(ev);
        },
        playerContextMenu(ev) {
            if (!this.$store.state.player) {
                return;
            }
            let items = [PMGR_SETTINGS_ACTION, this.$store.state.player.ison ? PMGR_POWER_OFF_ACTION : PMGR_POWER_ON_ACTION, PMGR_SLEEP_ACTION];
            if (this.$store.state.players && this.$store.state.players.length>1) {
                items.push(PMGR_SYNC_ACTION);
            }
            showMenu(this, {show:true, items:items, x:event.clientX, y:event.clientY});
        },
        menuAction(cmd, event) {
            if (!this.$store.state.player) {
                return;
            }
            storeClickOrTouchPos(event, this.menu);
            if (PMGR_SYNC_ACTION.cmd==cmd) {
                bus.$emit('dlg.open', 'sync', this.$store.state.player);
            } else if (PMGR_SETTINGS_ACTION.cmd==cmd) {
                bus.$emit('dlg.open', 'playersettings', this.$store.state.player);
            } else if (PMGR_POWER_ON_ACTION.cmd==cmd || PMGR_POWER_OFF_ACTION.cmd==cmd) {
                lmsCommand(this.$store.state.player.id, ["power", this.$store.state.player.ison ? "0" : "1"]).then(({data}) => {
                    bus.$emit('refreshStatus', this.$store.state.player.id);
                });
            } else if (PMGR_SLEEP_ACTION.cmd==cmd) {
                bus.$emit('dlg.open', 'sleep', this.$store.state.player);
            }
        },
        onToolbarNavClick() {
            if (this.volMenuIsPlayers) {
                this.toggleVolShowAllPlayers();
                return;
            }
            this.openNavDrawer();
        },
        openNavDrawer() {
            if (this.$store.state.visibleMenus.size>0) {
                return;
            }
            if (typeof browseZoomNavBlocked==='function' && browseZoomNavBlocked()) {
                return;
            }
            // iOS: Unity filter/sort taps can synthesize a delayed click on the
            // player title and open the nav/player drawer — ignore those ghosts.
            try {
                if (typeof window !== 'undefined' && window._mskFusionChromeTouch &&
                    (Date.now() - window._mskFusionChromeTouch) < 500) {
                    return;
                }
            } catch (e) {}
            bus.$emit('navDrawer');
        }
    },
    computed: {
        player () {
            return this.$store.state.player
        },
        players () {
            return this.$store.state.players
        },
        isNowPlayingPage() {
            return this.desktopLayout ? this.$store.state.npSheetOpen : (MBAR_NONE==this.mobileBar ? this.$store.state.page=='now-playing' : this.$store.state.npSheetOpen)
        },
        npSheetOpen() {
            return this.$store.state.npSheetOpen
        },
        maintoolbarGlass() {
            return !this.desktopLayout && !this.nowPlayingFull
        },
        toolbarStackZ() {
            // Volume group drawer is a fixed child of this stack — must sit above
            // browse/subtoolbar (z~3–4), np-bar (z~7) and mobile sheet (z~5).
            if (this.volExpanded) {
                return 40;
            }
            return (this.$store.state.npSheetOpen || this.infoOpen) ? 10 : 2
        },
        currentPage() {
            return this.$store.state.desktopLayout ? this.npSheetOpen ? 'now-playing' : this.showQueue ? 'queue' : 'other' : this.$store.state.page
        },
        mobileBar() {
            return this.$store.state.mobileBar
        },
        noPlayer () {
            return !this.$store.state.players || this.$store.state.players.length<1
        },
        darkUi () {
            return this.$store.state.darkUi
        },
        updatesAvailable() {
            return this.$store.state.unlockAll && this.$store.state.updatesAvailable.size>0
        },
        restartRequired() {
            return this.$store.state.unlockAll && this.$store.state.restartRequired
        },
        keyboardControl() {
            return this.$store.state.keyboardControl && !IS_MOBILE
        },
        desktopLayout() {
            return this.$store.state.desktopLayout
        },
        volMenuIsClose() {
            return !this.desktopLayout && this.volExpanded && !this.volExpandClosing
        },
        volMenuIsPlayers() {
            return !this.desktopLayout && this.volExpanded && !this.volExpandClosing && this.showVolChevron;
        },
        volSwipeHintFaded() {
            return this.volSwipeActive || this.volSwipeShowPct
        },
        showQueue() {
            return this.nowPlayingExpanded ? this.$store.state.showQueueNp : this.$store.state.showQueue
        },
        showVolumeSlider() {
            // Narrower control + freer toolbar (no mobile MAI) → show inline slider earlier.
            return VOL_HIDDEN!=this.playerDvc && this.width>=this.windowControlsOverlayRight + (this.$store.state.desktopLayout ? (this.height>=200 ? 620 : 500) : (this.$store.state.nowPlayingClock ? 980 : (this.$store.state.mobileBar==MBAR_NONE ? 560 : 480)))
        },
        /** Show % in toolbar expand only while adjusting (mobile) / always on desktop open */
        volPctLive() {
            if (this.desktopLayout) {
                return true;
            }
            return !!(this.volSwipeShowPct || this.movingVolumeSlider || this.volSwipeActive);
        },
        masterPlayerId() {
            return this.$store.state.player ? this.$store.state.player.id : undefined;
        },
        /** Chevron: other players, never on a sync/player-group (members list is automatic). */
        showVolChevron() {
            if (queryParams.single || queryParams.party || this.showVolumeSlider) {
                return false;
            }
            if (this.isVolGroupContext()) {
                return false;
            }
            return (this.$store.state.players || []).length > 1;
        },
        /**
         * Bottom section: sync/player-group members, or chevron "other players".
         * Collapsed + not grouped → header volume only.
         */
        showVolGroupPanel() {
            if (this.isVolGroupContext()) {
                return true;
            }
            if (!this.showVolChevron) {
                return false;
            }
            return !!this.volShowAllPlayers;
        },
        volGroupPanelTitle() {
            if (this.isVolGroupContext()) {
                return i18n('Group volume');
            }
            if (this.volShowAllPlayers) {
                return i18n('All players');
            }
            return '';
        },
        visibleVolPlayers() {
            return this.groupPlayers || [];
        },
        volTargetLabel() {
            let tid = this.volTargetId || this.masterPlayerId;
            if (!tid || tid === this.masterPlayerId) {
                return this.player ? this.player.name : '';
            }
            for (let i = 0; i < this.groupPlayers.length; ++i) {
                if (this.groupPlayers[i].id === tid) {
                    return this.groupPlayers[i].name;
                }
            }
            return '';
        },
        volSwipeDisplayPct() {
            if (this.playerMuted && (!this.volTargetId || this.volTargetId === this.masterPlayerId)) {
                return i18n('Muted');
            }
            return (this.volTargetVolume()) + '%';
        },
        /** Panel sits flush under measured toolbar bottom */
        volGroupPanelStyle() {
            let t = this.volPanelTop || 0;
            if (t > 0) {
                return { top: t + 'px' };
            }
            return undefined;
        },
        /** Push swipe zone below the group panel so row taps never hit the scrim */
        volSwipeZoneStyle() {
            let t = this.volPanelTop || 0;
            let h = this.volGroupPanelHeight || 0;
            if (t > 0) {
                return { top: (t + h) + 'px' };
            }
            if (h > 0) {
                return { top: 'calc(var(--main-toolbar-height, 48px) + var(--top-pad, 0px) + ' + h + 'px)' };
            }
            return undefined;
        },
        showUpdateProgress() {
            return (!this.$store.state.nowPlayingClock || (this.$store.state.desktopLayout ? !this.nowPlayingExpanded : (this.$store.state.page != 'now-playing'))) && this.width>=1050
        },
        showClock() {
            return this.$store.state.nowPlayingClock && (this.$store.state.desktopLayout
                                                            ? (this.nowPlayingExpanded && this.width>=1300) : (this.$store.state.page == 'now-playing' && this.width>=500))
        },
        downloadCount() {
            return this.$store.state.downloadStatus.length
        },
        coloredToolbars() {
            return this.$store.state.coloredToolbars
        },
        nowPlayingFull() {
            return this.$store.state.nowPlayingFull && !this.infoOpen && this.$store.state.nowPlayingBackdrop && (this.desktopLayout ? this.npSheetOpen : this.isNowPlayingPage)
        },
        mobileNoNowPlaying() {
            return !this.$store.state.desktopLayout && this.$store.state.mobileBar==MBAR_NONE
        },
        showMai() {
            // Integrated mode: MAI is swiped inside now playing. Independent mode: toolbar button.
            if (!LMS_P_MAI || this.desktopLayout) {
                return false;
            }
            return !this.$store.state.maiIntegrated;
        },
    },
    filters: {
        displayVolume: function (value, dvc) {
            if (undefined==value || VOL_HIDDEN==dvc) {
                return '';
            }
            return (isNaN(value) ? 0 : value)+"%";
        },
        menuIcon: function (name, dark, coloredToolbars) {
            return "/material/svg/menu-"+name+"?c="+(dark || coloredToolbars ? LMS_DARK_SVG : LMS_LIGHT_SVG)+"&c2="+(coloredToolbars ? LMS_DARK_SVG : LMS_UPDATE_SVG)+"&r="+LMS_MATERIAL_REVISION;
        },
        tooltip: function (str, shortcut, showShortcut, shift) {
            return showShortcut ? ttShortcutStr(str, shortcut, shift) : str;
        },
        playerShortcut: function(index) {
            return IS_APPLE ? ("⌥+"+(9==index ? 0 : index+1)) : i18n("Alt+%1", 9==index ? 0 : index+1);
        }
    },
    beforeDestroy() {
        this.cancelDisconnectedTimer();
        this.cancelClockTimer();
    },
    watch: {
        'menu.show': function(val) {
            this.$store.commit('menuVisible', {name:'toolbar', shown:val});
            if (!val) {
                this.menu.closed = new Date().getTime();
            }
        }
    }
})
