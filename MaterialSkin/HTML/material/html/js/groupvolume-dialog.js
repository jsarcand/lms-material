/**
 * LMS-Material
 *
 * Copyright (c) 2018-2026 Craig Drummond <craig.p.drummond@gmail.com>
 * MIT license.
 */
'use strict';

const GRP_PLAYER_ID = "grp";

Vue.component('lms-groupvolume', {
    template: `
<div v-if="show" class="vol-modal-root group-vol-modal noselect" v-clickoutside="outsideClick">
 <div class="vol-modal-scrim" @click="close"></div>
 <div class="vol-sheet vol-sheet-modal vol-sheet-compact group-vol-sheet" :style="{'--vol-player-count': Math.max(1, players.length)}">
  <div class="vol-modal-header vol-modal-header-compact">
   <v-icon class="vol-modal-group-icon">speaker_group</v-icon>
   <div class="vol-modal-title-block">
    <div class="vol-modal-pct-compact ellipsis">{{groupTitle}}</div>
    <div class="vol-modal-sub-compact" v-if="hasEndpoints && !expanded">{{endpointCountLabel}}</div>
   </div>
   <v-btn v-if="hasEndpoints" icon flat small class="vol-modal-expand" @click="toggleExpanded" :title="expanded ? i18n('Hide individual volumes') : i18n('Show individual volumes')"><v-icon>{{expanded ? 'expand_less' : 'expand_more'}}</v-icon></v-btn>
   <v-btn icon flat small class="vol-modal-close" @click="close" :title="i18n('Close')"><v-icon>close</v-icon></v-btn>
  </div>
  <div class="group-vol-list" id="gv-container" v-bind:class="{'group-vol-list-expanded':expanded}">
   <div v-if="groupRowPlayer" class="group-vol-row group-vol-grp-row" v-bind:class="{'active-player':currentPlayer && currentPlayer.id === groupRowPlayer.id}" :id="currentPlayer && currentPlayer.id === groupRowPlayer.id ? 'gv-active' : 'gv-grp'">
    <volume-control :value="groupRowPlayer.volume" :muted="groupRowPlayer.muted" :playing="groupRowPlayer.isplaying" :dvc="groupRowPlayer.dvc" :layout="3" :id="groupRowPlayer.id" :groupRow="true" @inc="volumeUp" @dec="volumeDown" @changed="setVolume" @moving="movingSlider" @toggleMute="toggleMute"></volume-control>
   </div>
   <div v-if="expanded && hasEndpoints" class="group-vol-endpoints">
    <div v-for="(player, index) in endpointPlayers" :key="player.id" class="group-vol-row group-vol-endpoint-row" v-bind:class="{'active-player':currentPlayer && currentPlayer.id === player.id}" :id="currentPlayer && currentPlayer.id === player.id ? 'gv-active' : ('gv-'+index)">
     <volume-control :value="player.volume" :muted="player.muted" :playing="player.isplaying" :dvc="player.dvc" :layout="4" :name="player.name" :id="player.id" @inc="volumeUp" @dec="volumeDown" @changed="setVolume" @moving="movingSlider" @toggleMute="toggleMute"></volume-control>
    </div>
   </div>
  </div>
 </div>
</div>
    `,
    props: [],
    data() {
        return { 
                 show: false,
                 playing: false,
                 sync: false,
                 players: [],
                 expanded: getLocalStorageBool('groupVolExpanded', true),
               }
    },
    mounted() {
        this.closeTimer = undefined;
        bus.$on('groupvolume.open', function(playerStatus, scrollCurrent) {
            if (undefined!=this.closeTime && new Date().getTime()-this.closeTime<25) {
                return;
            }
            this.openTime = new Date().getTime();
            if (queryParams.party || queryParams.single) {
                return;
            }
            if (this.show) {
                this.close();
                return;
            }
            this.sync = getLocalStorageBool('groupVolSync', this.sync);
            var pMap = {};
            for (var p=0, len=this.$store.state.players.length; p<len; ++p) {
                pMap[this.$store.state.players[p].id]={name: this.$store.state.players[p].name, isgroup: this.$store.state.players[p].isgroup};
            }

            // Save any existing volume entries, and use these as default values below...
            let playerVolMap = {}
            if (this.players.length>0) {
                for (let i=0, loop=this.players, len=loop.length; i<len; ++i) {
                    playerVolMap[loop[i].id]=loop[i].volume;
                }
            }

            this.players = [{id: playerStatus.syncmaster, master:true, name:pMap[playerStatus.syncmaster].name, isgroup:pMap[playerStatus.syncmaster].isgroup, 
                             volume:undefined, dvc:VOL_STD, muted:false}];
            if (this.$store.state.player.id==playerStatus.syncmaster) {
                this.players[0].volume = playerStatus.volume;
            }
            for (var p=0, len=playerStatus.syncslaves.length; p<len; ++p) {
                if (pMap[playerStatus.syncslaves[p]]==undefined) {
                    continue;
                }
                this.players.push({id: playerStatus.syncslaves[p], master:false, name:pMap[playerStatus.syncslaves[p]].name, isgroup:pMap[playerStatus.syncslaves[p]].isgroup,
                                   volume:playerVolMap[playerStatus.syncslaves[p]], dvc:VOL_STD, muted:false, isplaying:false});
                if (this.$store.state.player.id==playerStatus.syncslaves[p]) {
                    this.players[this.players.length-1].volume = playerStatus.volume;
                }
            }
            let cur = this.$store.state.player;
            if (cur && cur.isgroup && cur.members) {
                let have = {};
                for (let i=0; i<this.players.length; ++i) { have[this.players[i].id] = true; }
                for (let i=0; i<cur.members.length; ++i) {
                    let mid = cur.members[i];
                    if (!mid || have[mid] || !pMap[mid] || pMap[mid].isgroup) { continue; }
                    have[mid] = true;
                    this.players.push({id: mid, master:false, name:pMap[mid].name, isgroup:false,
                                       volume:playerVolMap[mid], dvc:VOL_STD, muted:false, isplaying:false});
                }
            }
            this.playerMap={};
            let haveGroupPlayer = pMap[playerStatus.syncmaster].isgroup;
            for (var p=0, len=this.players.length; p<len; ++p) {
                this.playerMap[this.players[p].id]=haveGroupPlayer ? p : (p+1);
                this.refreshPlayer(this.players[p]);
            }
            if (!haveGroupPlayer) {
                this.players.unshift({id:GRP_PLAYER_ID, master:true, name:i18n('Average Volume'), isgroup:false,
                                      volume:playerVolMap[GRP_PLAYER_ID], dvc:VOL_STD, muted:false, isplaying:false});
                this.playerMap[GRP_PLAYER_ID]=0;
            }
            this.setAverage();

            if (scrollCurrent && this.$store.state.player && this.groupRowPlayer && this.$store.state.player.id!=this.groupRowPlayer.id) {
                this.expanded = true;
            }

            if (scrollCurrent) {
                // Scroll current player's volume into view
                var scrollChecks = 0;
                var scrollInterval = setInterval(function() {
                    var current = document.getElementById('gv-active');
                    if (undefined!=current) {
                        document.getElementById('gv-container').scrollTop = current.offsetTop;
                        clearInterval(scrollInterval);
                    } else if (scrollChecks<50) {
                        scrollChecks++;
                    } else {
                        clearInterval(scrollInterval);
                    }
                }, 10);
            }
            this.show=true;
        }.bind(this));
        bus.$on('noPlayers', function() {
            this.close();
        }.bind(this));
        bus.$on('closeDialog', function(dlg) {
            if (dlg == 'groupvolume') {
                this.close();
            }
        }.bind(this));
        bus.$on('dialogOpen', function(name, open) {
            if (open && name!='groupvolume') {
                this.close();
            }
        }.bind(this));
        bus.$on('menuOpen', function() {
            this.close();
        }.bind(this));
        bus.$on('playerStatus', function(player) {
            this.updatePlayer(player);
        }.bind(this));

        bus.$on('otherPlayerStatus', function(player) {
            this.updatePlayer(player);
        }.bind(this));
        bus.$on('adjustVolume', function() {
            if (this.show) {
                this.cancelUpdateTimer();
                this.updateTimer = setTimeout(function() { this.refreshAll(); }.bind(this), 100);
            }
        }.bind(this));
    },
    beforeDestroy() {
        this.cancelCloseTimer();
    },
    methods: {
        outsideClick() {
            if ((new Date().getTime()-this.openTime)>150) {
                this.close();
            }
        },
        close() {
            this.show=false;
            this.showing=false;
            this.cancelCloseTimer();
            this.closeTime = new Date().getTime();
        },
        i18n(str) {
            if (this.show) {
                return i18n(str);
            } else {
                return str;
            }
        },
        refreshPlayer(player) {
            if (player.id!=GRP_PLAYER_ID) {
                bus.$emit('refreshStatus', player.id);
            }
        },
        refreshAll() {
            if (!this.show) {
                return;
            }
            for (var i=0, len=this.players.length; i<len; ++i) {
                this.refreshPlayer(this.players[i]);
            }
        },
        updatePlayer(player) {
            if (!this.show) {
                return;
            }
            var idx = this.playerMap[player.id];
            if (undefined==idx) {
                return;
            }
            if (this.$store.state.player && this.$store.state.player.id==player.id && !player.synced) {
                // Current player no longer is sync group? Then close dialog.
                this.show = false;
            }
            this.players[idx].dvc = player.dvc;
            this.players[idx].muted = player.muted;
            this.players[idx].volume = player.volume;
            this.players[idx].isplaying = player.isplaying;
            this.setAverage();
        },
        setAverage() {
            if (GRP_PLAYER_ID==this.players[0].id) {
                let total = 0;
                let count = 0;
                for (let i=1, len=this.players.length; i<len; ++i) {
                    if (undefined!=this.players[i].volume) {
                        total += this.players[i].volume;
                        count++;
                    }
                }
                this.players[0].volume = Math.round(total / count);
                this.players[0].prevVol = this.players[0].volume;
            }
        },
        volumeUp(id) {
            this.adjustVolume(id, true)
        },
        volumeDown(id) {
            this.adjustVolume(id, false)
        },
        movingSlider(moving) {
            if (moving) {
                this.cancelCloseTimer();
            } else {
                this.resetCloseTimer();
            }
        },
        idList() {
            let ids = [];
            for (let i=0, len=this.players.length; i<len; ++i) {
                if (this.players[i].id!=GRP_PLAYER_ID) {
                    ids.push(this.players[i].id);
                }
            }
            return ids.join(",");
        },
        adjustVolume(id, inc) {
            if (!this.show || this.$store.state.visibleMenus.size>1) { // We pretend to be a menu!
                return;
            }
            var idx = this.playerMap[id];
            if (undefined==idx || idx<0 || idx>=this.players.length) {
                return;
            }
            let player = this.players[idx];
            if (VOL_HIDDEN==player.dvc) {
                return;
            }
            this.resetCloseTimer();
            if (player.muted) {
                this.toggleMute(id);
            } else {
                let pid = player.id==GRP_PLAYER_ID ? "" : player.id;
                let cmd = player.id==GRP_PLAYER_ID
                            ? ["material-skin", "mixer", "cmd:set", "val:"+(this.players[0].volume+(lmsOptions.volumeStep*(inc ? 1 : -1))), "players:"+this.idList(), "old:"+this.players[0].prevVol]
                            : ["mixer", "volume", (inc ? "+" : "-")+lmsOptions.volumeStep];
                lmsCommand(pid, cmd).then(({data}) => {
                    this.refreshAll();
                });
            }
        },
        setVolume(vol, id) {
            if (!this.show) {
                return;
            }
            var idx = this.playerMap[id];
            if (undefined==idx || idx<0 || idx>=this.players.length) {
                return;
            }
            let player = this.players[idx];
            if (VOL_STD!=player.dvc) {
                player.volume = 100;
                return;
            }
            this.resetCloseTimer();
            let pid = player.id==GRP_PLAYER_ID ? "" : player.id;
            let cmd = player.id==GRP_PLAYER_ID
                        ? ["material-skin", "mixer", "cmd:set", "val:"+vol, "players:"+this.idList(), "old:"+this.players[0].prevVol]
                        : ["mixer", "volume", vol];
            lmsCommand(pid, cmd).then(({data}) => {
                player.volume = vol;
                player.muted = vol<0;
                this.refreshAll();
            }).catch(err => {
                this.refreshAll();
            });
        },
        toggleMute(id) {
            var idx = this.playerMap[id];
            if (undefined==idx || idx<0 || idx>=this.players.length) {
                return;
            }
            let player = this.players[idx];
            if (VOL_STD!=player.dvc || !this.show) {
                return;
            }
            let muted = player.muted;
            if (player.id==GRP_PLAYER_ID) {
                muted = true;
                for (let i=1; i<this.players.length && muted; ++i) {
                    muted = this.players[i].muted;
                }
            }
            this.resetCloseTimer();
            let pid = player.id==GRP_PLAYER_ID ? "" : player.id;
            let cmd = player.id==GRP_PLAYER_ID
                        ? ["material-skin", "mixer", "cmd:mute", "val:"+(muted ? 0 : 1), "players:"+this.idList(), "old:"+this.players[0].prevVol]
                        : ['mixer', 'muting', player.muted ? 0 : 1];
            lmsCommand(pid, cmd).then(({data}) => {
                this.refreshAll();
                // Status seems to take while to update, so check again 1/2 second later...
                setTimeout(function () {
                    this.refreshAll();
                }.bind(this), 500);
            }).catch(err => {
                this.refreshAll();
            });
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
            }.bind(this), LMS_VOLUME_CLOSE_TIMEOUT);
        },
        cancelUpdateTimer() {
            if (undefined!==this.updateTimer) {
                clearTimeout(this.updateTimer);
                this.updateTimer = undefined;
            }
        },
        toggleExpanded() {
            this.expanded = !this.expanded;
            if (this.expanded) {
                this.$nextTick(function() {
                    var current = document.getElementById('gv-active');
                    if (undefined!=current && undefined!=document.getElementById('gv-container')) {
                        document.getElementById('gv-container').scrollTop = current.offsetTop;
                    }
                }.bind(this));
            }
        }
    },
    watch: {
        'expanded': function(val) {
            setLocalStorageVal('groupVolExpanded', val);
        },
        'show': function(val) {
            this.$store.commit('dialogOpen', {name:'groupvolume', shown:val});
            this.$store.commit('menuVisible', {name:'groupvolume', shown:val});
            this.resetCloseTimer();
            this.cancelUpdateTimer();
            bus.$emit('subscribeAll', val);
        }
    },
    computed: {
        currentPlayer () {
            return this.$store.state.player
        },
        groupRowPlayer() {
            for (var i=0, len=this.players.length; i<len; ++i) {
                if (GRP_PLAYER_ID==this.players[i].id || this.players[i].isgroup) {
                    return this.players[i];
                }
            }
            return this.players.length>0 ? this.players[0] : null;
        },
        endpointPlayers() {
            var grp = this.groupRowPlayer;
            if (null==grp) {
                return [];
            }
            var endpoints = [];
            for (var i=0, len=this.players.length; i<len; ++i) {
                if (this.players[i].id!=grp.id) {
                    endpoints.push(this.players[i]);
                }
            }
            return endpoints;
        },
        hasEndpoints() {
            return this.endpointPlayers.length>0;
        },
        endpointCountLabel() {
            var n = this.endpointPlayers.length;
            return n==1 ? i18n('1 player') : i18n('%1 players').replace('%1', n);
        },
        groupTitle() {
            var grp = this.groupRowPlayer;
            return grp && grp.name ? grp.name : i18n('Group Volume');
        }
    }
})