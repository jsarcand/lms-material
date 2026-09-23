/**
 * LMS-Material
 *
 * Copyright (c) 2018-2026 Craig Drummond <craig.p.drummond@gmail.com>
 * MIT license.
 */
'use strict';

Vue.component('lms-volume', {
    template: `
<div>
 <!-- ===== Mobile: glass browse surface + swipe volume + player dock ===== -->
 <div v-if="show && mobileLayout" class="msk-vol-glass-root noselect" @click.self="close">
  <div class="msk-vol-glass-area"
       @touchstart.passive="glassTouchStart"
       @touchmove="glassTouchMove"
       @touchend="glassTouchEnd"
       @touchcancel="glassTouchEnd"
       @wheel.prevent="glassWheel"
       @click.stop>
   <div class="msk-vol-glass-hint">{{hintText}}</div>
   <div class="msk-vol-glass-pct" v-bind:class="{'dimmed':activeMuted}">{{volumeLabel}}</div>
   <div class="msk-vol-glass-name ellipsis">{{activeName}}</div>
   <v-btn icon flat class="msk-vol-glass-close" @click.stop="close" :title="i18n('Close')"><v-icon>close</v-icon></v-btn>
  </div>
  <div class="msk-vol-glass-dock" v-if="playerList.length>1" @click.stop>
   <div class="msk-vol-glass-dock-label">{{i18n('Players')}}</div>
   <div class="msk-vol-glass-dock-list">
    <div v-for="p in playerList" :key="p.id"
         class="msk-vol-glass-player"
         v-bind:class="{'active': p.id===activeId, 'dimmed': p.muted}"
         @click="selectPlayer(p)">
     <lms-vol-icon :volume="p.volume" :muted="p.muted" :size="20"></lms-vol-icon>
     <span class="msk-vol-glass-player-name ellipsis">{{p.name}}</span>
     <span class="msk-vol-glass-player-pct">{{p.muted ? i18n('Muted') : ((isNaN(p.volume)?0:p.volume)+'%')}}</span>
    </div>
   </div>
  </div>
 </div>

 <!-- ===== Desktop / narrow: compact popover (unchanged) ===== -->
 <div v-else-if="show" class="vol-modal-root noselect" v-clickoutside="outsideClick">
  <div class="vol-modal-scrim" @click="close"></div>
  <div ref="sheet" class="vol-sheet vol-sheet-modal vol-sheet-compact vol-sheet-popover" :style="[sheetStyle, {'--vol-player-count': 1}]">
   <div class="vol-popover-arrow" aria-hidden="true"></div>
   <div class="vol-modal-header vol-modal-header-compact">
    <v-btn icon flat small class="vol-modal-mute-btn" :title="muteTitle" @click.stop.prevent="toggleMute">
     <lms-vol-icon :volume="playerVolume" :muted="muted" :size="22"></lms-vol-icon>
    </v-btn>
    <div class="vol-modal-title-block">
     <div class="vol-modal-pct-compact" v-bind:class="{'dimmed':muted}">{{volumeLabelDesktop}}</div>
     <div class="vol-modal-sub-compact ellipsis" v-if="playerName">{{playerName}}</div>
     <div class="vol-modal-sub-compact" v-else-if="dvc==VOL_FIXED">{{i18n('Volume is fixed')}}</div>
    </div>
    <v-btn v-if="dvc==VOL_STD" flat small class="vol-modal-mute-text" :class="{'vol-modal-mute-text-on':muted}" @click.stop.prevent="toggleMute">{{muted ? i18n('Unmute') : i18n('Mute')}}</v-btn>
    <v-btn icon flat small class="vol-modal-close" @click.stop="close" :title="i18n('Close')"><v-icon>close</v-icon></v-btn>
   </div>
   <div class="vol-modal-body vol-modal-body-compact" v-if="dvc==VOL_STD">
    <volume-control class="vol-modal-control vol-modal-control-compact" :value="playerVolume" :muted="muted" :playing="true" :dvc="dvc" :layout="0" :hideLabel="true" style="--vol-player-count:1" @inc="volumeUp" @dec="volumeDown" @changed="setVolume" @moving="movingSlider" @toggleMute="toggleMute"></volume-control>
   </div>
  </div>
 </div>
</div>
    `,
    props: [],
    data() {
        return {
            show: false,
            showing: false,
            playerVolume: 0,
            muted: false,
            dvc: VOL_STD,
            movingVolumeSlider: false,
            sheetStyle: undefined,
            mutePending: false,
            /* Mobile glass */
            activeId: undefined,
            playerList: [],
            glassTouch: undefined,
            lastSentVolume: -1
        }
    },
    computed: {
        mobileLayout() {
            return !this.$store.state.desktopLayout;
        },
        playerName() {
            return this.$store.state.player ? this.$store.state.player.name : undefined;
        },
        activePlayer() {
            if (!this.playerList.length) {
                return null;
            }
            for (let i=0, len=this.playerList.length; i<len; ++i) {
                if (this.playerList[i].id===this.activeId) {
                    return this.playerList[i];
                }
            }
            return this.playerList[0];
        },
        activeName() {
            let p = this.activePlayer;
            return p ? p.name : (this.playerName || '');
        },
        activeMuted() {
            let p = this.activePlayer;
            if (p) {
                return !!p.muted;
            }
            return this.muted;
        },
        volumeLabel() {
            if (this.activeMuted) {
                return i18n('Muted');
            }
            let p = this.activePlayer;
            let v = p ? p.volume : this.playerVolume;
            if (VOL_FIXED==this.dvc) {
                return '';
            }
            return (isNaN(v) ? 0 : v) + '%';
        },
        volumeLabelDesktop() {
            if (this.muted) {
                return i18n('Muted');
            }
            if (VOL_FIXED==this.dvc) {
                return '';
            }
            return (isNaN(this.playerVolume) ? 0 : this.playerVolume) + '%';
        },
        muteTitle() {
            return this.muted ? i18n('Unmute') : i18n('Mute');
        },
        hintText() {
            return i18n('Swipe up to raise volume, down to lower');
        }
    },
    mounted() {
        this.closeTimer = undefined;
        this.sendVolumeTimer = undefined;
        this._onResize = function() {
            if (this.show && !this.mobileLayout) {
                this.positionSheet();
            }
        }.bind(this);
        window.addEventListener('resize', this._onResize);

        bus.$on('playerStatus', function(playerStatus) {
            if (!(this.show || this.showing)) {
                return;
            }
            // Update list entry for current player
            this.syncPlayerFromStatus(playerStatus, true);
            if (!this.mobileLayout && !this.movingVolumeSlider) {
                if (!this.mutePending || playerStatus.muted===this.muted) {
                    this.muted = playerStatus.muted;
                    this.mutePending = false;
                }
                var vol = playerStatus.volume;
                if (vol!=this.playerVolume) {
                    this.playerVolume = vol;
                }
                this.dvc = playerStatus.dvc;
                if (this.showing) {
                    this.showing = false;
                    this.movingVolumeSlider = false;
                    this.show = true;
                    this.$nextTick(function() {
                        this.positionSheet();
                        this.resetCloseTimer();
                    }.bind(this));
                }
            } else if (this.showing) {
                this.showing = false;
                this.show = true;
                this.resetCloseTimer();
            }
        }.bind(this));

        bus.$on('otherPlayerStatus', function(player) {
            if (!this.show || !this.mobileLayout || !player || !player.id) {
                return;
            }
            this.syncPlayerFromStatus(player, false);
        }.bind(this));

        bus.$on('volumePreview', function(vol) {
            if (this.show && vol>=0 && !this.mobileLayout) {
                this.playerVolume = vol;
            }
        }.bind(this));

        bus.$on('volume.open', function(status) {
            if (queryParams.party) {
                return;
            }
            if (this.show) {
                this.close();
                return;
            }
            this.showing=true;
            this.mutePending = false;
            this.openTime = new Date().getTime();
            this.buildPlayerList(status);
            if (status) {
                if (undefined!=status.muted) {
                    this.muted = !!status.muted;
                }
                if (undefined!=status.volume) {
                    this.playerVolume = Math.abs(status.volume);
                }
                if (undefined!=status.dvc) {
                    this.dvc = status.dvc;
                }
            }
            bus.$emit('refreshStatus');
            // Ask other players for status so dock stays fresh
            this.refreshOtherPlayers();
            if (this.mobileLayout) {
                this.showing = false;
                this.show = true;
                this.resetCloseTimer();
            }
        }.bind(this));
        bus.$on('noPlayers', function() {
            this.close();
        }.bind(this));
        bus.$on('closeDialog', function(dlg) {
            if (dlg == 'volume') {
                this.close();
            }
        }.bind(this));
        bus.$on('dialogOpen', function(name, open) {
            if (open && name!='volume') {
                this.close();
            }
        }.bind(this));
        bus.$on('menuOpen', function() {
            this.close();
        }.bind(this));
        bus.$on('adjustVolume', function() {
            if (this.show) {
                this.cancelUpdateTimer();
                this.updateTimer = setTimeout(function() { bus.$emit('refreshStatus'); }.bind(this), 100);
            }
        }.bind(this));
    },
    beforeDestroy() {
        this.cancelCloseTimer();
        this.cancelSendVolumeTimer();
        window.removeEventListener('resize', this._onResize);
    },
    methods: {
        buildPlayerList(status) {
            let list = [];
            let players = this.$store.state.players || [];
            let cur = this.$store.state.player;
            let curId = cur ? cur.id : undefined;
            let groupIds = undefined;
            if ((status && status.synced) || (cur && cur.isgroup)) {
                groupIds = {};
                if (curId) { groupIds[curId] = true; }
                if (status && status.syncmaster) { groupIds[status.syncmaster] = true; }
                (status && status.syncslaves ? status.syncslaves : []).forEach(function(id) { if (id) { groupIds[id] = true; } });
                (cur && cur.members ? cur.members : []).forEach(function(id) { if (id) { groupIds[id] = true; } });
            }
            for (let i=0, len=players.length; i<len; ++i) {
                let p = players[i];
                if (!p || !p.id) {
                    continue;
                }
                if (groupIds && !groupIds[p.id]) {
                    continue;
                }
                let entry = {
                    id: p.id,
                    name: p.name || p.id,
                    isgroup: !!p.isgroup,
                    volume: 0,
                    muted: false,
                    dvc: VOL_STD
                };
                if (curId && p.id===curId && status) {
                    entry.volume = Math.abs(undefined!=status.volume ? status.volume : 0);
                    entry.muted = !!status.muted;
                    entry.dvc = undefined!=status.dvc ? status.dvc : VOL_STD;
                }
                list.push(entry);
            }
            if (list.length===0 && curId) {
                list.push({
                    id: curId,
                    name: this.playerName || curId,
                    volume: status && undefined!=status.volume ? Math.abs(status.volume) : this.playerVolume,
                    muted: status ? !!status.muted : this.muted,
                    dvc: status && undefined!=status.dvc ? status.dvc : this.dvc
                });
            }
            this.playerList = list;
            this.activeId = curId || (list[0] && list[0].id);
        },
        refreshOtherPlayers() {
            let curId = this.$store.state.player ? this.$store.state.player.id : undefined;
            for (let i=0, len=this.playerList.length; i<len; ++i) {
                let id = this.playerList[i].id;
                if (!id || id===curId) {
                    continue;
                }
                bus.$emit('refreshStatus', id);
            }
        },
        setListVolume(id, vol, muted) {
            for (let i=0, len=this.playerList.length; i<len; ++i) {
                if (this.playerList[i].id===id) {
                    this.$set(this.playerList[i], 'volume', vol);
                    if (undefined!=muted) {
                        this.$set(this.playerList[i], 'muted', !!muted);
                    }
                    break;
                }
            }
        },
        setListMuted(id, muted) {
            for (let i=0, len=this.playerList.length; i<len; ++i) {
                if (this.playerList[i].id===id) {
                    this.$set(this.playerList[i], 'muted', !!muted);
                    break;
                }
            }
        },
        syncPlayerFromStatus(playerStatus, isCurrent) {
            if (!playerStatus) {
                return;
            }
            let id = playerStatus.id || (isCurrent && this.$store.state.player ? this.$store.state.player.id : undefined);
            if (!id) {
                return;
            }
            let vol = playerStatus.volume;
            if (undefined!=vol) {
                vol = Math.abs(vol);
            }
            let found = false;
            for (let i=0, len=this.playerList.length; i<len; ++i) {
                if (this.playerList[i].id===id) {
                    if (undefined!=vol && !this.glassTouch) {
                        this.$set(this.playerList[i], 'volume', vol);
                    }
                    if (undefined!=playerStatus.muted) {
                        this.$set(this.playerList[i], 'muted', !!playerStatus.muted);
                    }
                    if (undefined!=playerStatus.dvc) {
                        this.$set(this.playerList[i], 'dvc', playerStatus.dvc);
                    }
                    found = true;
                    break;
                }
            }
            if (!found && id) {
                this.playerList.push({
                    id: id,
                    name: playerStatus.name || id,
                    volume: undefined!=vol ? vol : 0,
                    muted: !!playerStatus.muted,
                    dvc: undefined!=playerStatus.dvc ? playerStatus.dvc : VOL_STD
                });
            }
            if (isCurrent && !this.glassTouch && undefined!=vol) {
                this.playerVolume = vol;
            }
            if (isCurrent && undefined!=playerStatus.muted && !this.mutePending) {
                this.muted = !!playerStatus.muted;
            }
        },
        selectPlayer(p) {
            if (!p || !p.id) {
                return;
            }
            this.activeId = p.id;
            this.playerVolume = isNaN(p.volume) ? 0 : p.volume;
            this.muted = !!p.muted;
            this.dvc = undefined!=p.dvc ? p.dvc : VOL_STD;
            this.resetCloseTimer();
        },
        activeVolume() {
            let p = this.activePlayer;
            if (p && undefined!=p.volume) {
                return Math.abs(p.volume);
            }
            return Math.abs(this.playerVolume||0);
        },
        applyVolumeDelta(inc, steps) {
            steps = steps || 1;
            let vol = this.activeVolume();
            for (let i=0; i<steps; ++i) {
                if (typeof adjustVolume==='function') {
                    vol = adjustVolume(Math.abs(vol), inc);
                } else {
                    vol = Math.max(0, Math.min(100, vol + (inc ? 1 : -1)));
                }
                if (vol<=0) { vol=0; break; }
                if (vol>=100) { vol=100; break; }
            }
            this.setActiveVolume(vol);
        },
        setActiveVolume(vol) {
            vol = Math.max(0, Math.min(100, Math.round(vol)));
            let id = this.activeId || (this.$store.state.player && this.$store.state.player.id);
            this.playerVolume = vol;
            if (id) {
                this.setListVolume(id, vol, false);
            }
            this.muted = false;
            this.resetSendVolumeTimer();
            this.resetCloseTimer();
        },
        sendVolumeNow() {
            let id = this.activeId || (this.$store.state.player && this.$store.state.player.id);
            if (!id) {
                return;
            }
            let vol = this.activeVolume();
            if (vol===this.lastSentVolume) {
                return;
            }
            this.lastSentVolume = vol;
            let curId = this.$store.state.player && this.$store.state.player.id;
            if (id===curId) {
                bus.$emit('playerCommand', ["mixer", "volume", vol]);
            } else if (typeof lmsCommand==='function') {
                lmsCommand(id, ["mixer", "volume", vol]).then(function() {
                    bus.$emit('adjustVolume');
                }).catch(function(){});
            }
        },
        cancelSendVolumeTimer() {
            if (undefined!==this.sendVolumeTimer) {
                clearTimeout(this.sendVolumeTimer);
                this.sendVolumeTimer = undefined;
            }
        },
        resetSendVolumeTimer() {
            this.cancelSendVolumeTimer();
            this.sendVolumeTimer = setTimeout(function () {
                this.sendVolumeNow();
            }.bind(this), typeof LMS_VOLUME_DEBOUNCE!=='undefined' ? LMS_VOLUME_DEBOUNCE : 100);
        },
        glassTouchStart(ev) {
            if (!ev.touches || !ev.touches.length || VOL_STD!=this.dvc && VOL_STD!=(this.activePlayer&&this.activePlayer.dvc)) {
                // still allow if dvc unknown
            }
            if (!ev.touches || !ev.touches.length) {
                return;
            }
            let p = this.activePlayer;
            if (p && p.dvc===VOL_FIXED) {
                return;
            }
            this.glassTouch = {
                x: ev.touches[0].clientX,
                y: ev.touches[0].clientY,
                moving: false
            };
            this.lastSentVolume = this.activeVolume();
        },
        glassTouchMove(ev) {
            if (!this.glassTouch || !ev.touches || !ev.touches.length) {
                return;
            }
            let tx = ev.touches[0].clientX;
            let ty = ev.touches[0].clientY;
            if (Math.abs(tx - this.glassTouch.x) > 72) {
                return;
            }
            if (!this.glassTouch.moving && Math.abs(ty - this.glassTouch.y) > 6) {
                this.glassTouch.moving = true;
            }
            const VOL_STEP_PX = 18;
            if (this.glassTouch.moving && Math.abs(ty - this.glassTouch.y) >= VOL_STEP_PX) {
                let steps = Math.floor(Math.abs(ty - this.glassTouch.y) / VOL_STEP_PX);
                if (steps > 0) {
                    let inc = ty < this.glassTouch.y; // finger up → volume up
                    this.applyVolumeDelta(inc, steps);
                    this.glassTouch.y += steps * VOL_STEP_PX * (inc ? -1 : 1);
                }
                if (ev.cancelable) {
                    try { ev.preventDefault(); } catch (e) {}
                }
            }
        },
        glassTouchEnd() {
            if (this.glassTouch && this.glassTouch.moving) {
                this.sendVolumeNow();
            }
            this.glassTouch = undefined;
        },
        glassWheel(ev) {
            if (ev.deltaY < 0) {
                this.applyVolumeDelta(true, 1);
            } else if (ev.deltaY > 0) {
                this.applyVolumeDelta(false, 1);
            }
            this.sendVolumeNow();
        },
        close() {
            this.sendVolumeNow();
            this.show=false;
            this.showing=false;
            this.mutePending = false;
            this.sheetStyle = undefined;
            this.glassTouch = undefined;
            this.cancelCloseTimer();
            this.cancelSendVolumeTimer();
        },
        outsideClick() {
            if ((new Date().getTime()-this.openTime)>150) {
                this.close();
            }
        },
        volumeDown() {
            bus.$emit('playerCommand', ["mixer", "volume", "-"+lmsOptions.volumeStep]);
            this.resetCloseTimer();
        },
        volumeUp() {
            bus.$emit('playerCommand', ["mixer", "volume", "+"+lmsOptions.volumeStep]);
            this.resetCloseTimer();
        },
        setVolume(val) {
            if (!this.show) {
                return;
            }
            this.playerVolume = val;
            if (this.muted) {
                this.muted = false;
                this.mutePending = false;
            }
            bus.$emit('playerCommand', ["mixer", "volume", this.playerVolume]);
            bus.$emit('volumePreview', this.playerVolume);
            this.resetCloseTimer();
        },
        toggleMute() {
            if (!this.show && !this.showing) {
                return;
            }
            if (VOL_STD!=this.dvc || queryParams.party) {
                return;
            }
            var next = !this.muted;
            this.muted = next;
            this.mutePending = true;
            let id = this.activeId || (this.$store.state.player && this.$store.state.player.id);
            let curId = this.$store.state.player && this.$store.state.player.id;
            if (id && id!==curId && typeof lmsCommand==='function') {
                lmsCommand(id, ['mixer', 'muting', next ? 1 : 0]);
            } else {
                bus.$emit('playerCommand', ['mixer', 'muting', next ? 1 : 0]);
            }
            this.setListMuted(id, next);
            bus.$emit('refreshStatus');
            setTimeout(function() {
                this.mutePending = false;
                bus.$emit('refreshStatus');
            }.bind(this), 600);
            this.resetCloseTimer();
        },
        positionSheet() {
            let sheet = this.$refs.sheet;
            if (!sheet) {
                return;
            }
            let anchor = document.getElementById('vol-btn')
                || document.getElementById('vol-label')
                || document.querySelector('.vol-full-slider .vol-btn.vol-right')
                || document.querySelector('.vol-full-slider');
            let pad = 8;
            let sheetW = sheet.offsetWidth || 320;
            let top;
            let left;
            let arrowX;
            if (anchor) {
                let r = anchor.getBoundingClientRect();
                top = Math.round(r.bottom + 8);
                left = Math.round(r.left + r.width/2 - sheetW/2);
                left = Math.max(pad, Math.min(left, window.innerWidth - sheetW - pad));
                arrowX = Math.round(r.left + r.width/2 - left);
            } else {
                top = Math.round((parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--main-toolbar-height'))||48) + 6);
                left = Math.max(pad, window.innerWidth - sheetW - pad);
                arrowX = sheetW - 36;
            }
            arrowX = Math.max(18, Math.min(arrowX, sheetW - 18));
            this.sheetStyle = {
                top: top + 'px',
                left: left + 'px',
                right: 'auto',
                '--vol-arrow-x': arrowX + 'px'
            };
        },
        i18n(str) {
            if (this.show || this.showing) {
                return i18n(str);
            } else {
                return str;
            }
        },
        movingSlider(moving) {
            this.movingVolumeSlider=moving;
            if (moving) {
                this.cancelCloseTimer();
            } else {
                this.resetCloseTimer();
            }
        },
        cancelCloseTimer() {
            if (undefined!==this.closeTimer) {
                clearTimeout(this.closeTimer);
                this.closeTimer = undefined;
            }
        },
        resetCloseTimer() {
            this.cancelCloseTimer();
            this.closeTimer = setTimeout(function () {
                this.close();
            }.bind(this), typeof LMS_VOLUME_CLOSE_TIMEOUT!=='undefined' ? LMS_VOLUME_CLOSE_TIMEOUT : 3000);
        },
        cancelUpdateTimer() {
            if (undefined!==this.updateTimer) {
                clearTimeout(this.updateTimer);
                this.updateTimer = undefined;
            }
        }
    },
    watch: {
        'show': function(val) {
            this.$store.commit('dialogOpen', {name:'volume', shown:val});
            this.$store.commit('menuVisible', {name:'volume', shown:val});
            try {
                document.documentElement.classList.toggle('msk-vol-glass-active', !!(val && this.mobileLayout));
            } catch (e) {}
            if (val) {
                this.$nextTick(function() {
                    if (!this.mobileLayout) {
                        this.positionSheet();
                    }
                    this.resetCloseTimer();
                }.bind(this));
            } else {
                try {
                    document.documentElement.classList.remove('msk-vol-glass-active');
                } catch (e) {}
            }
            this.cancelUpdateTimer();
        }
    }
})
