/**
 * Lyrion.app preferences inside Material (Tauri shell via postMessage).
 */
'use strict';

Vue.component('lms-app-settings', {
    template: `
<v-dialog v-model="show" v-if="show" persistent no-click-animation scrollable fullscreen>
 <v-card>
  <v-card-title class="settings-title">
   <v-toolbar app-data class="dialog-toolbar" id="appsettings-toolbar">
    <div class="drag-area-left"></div>
    <v-btn flat icon @click.stop="close" :title="i18n('Go back')"><v-icon>{{BACK_ICON}}</v-icon></v-btn>
    <v-toolbar-title>{{title}}</v-toolbar-title>
    <v-icon v-if="savedFlash" class="settings-save-ok" :title="i18n('Saved')">check</v-icon>
    <v-spacer class="drag-area"></v-spacer>
   </v-toolbar>
  </v-card-title>
  <v-card-text>
   <v-list two-line subheader class="settings-list" v-if="cfg">
    <v-header class="dialog-section-header">{{i18n('Display')}}</v-header>
    <v-list-tile>
     <v-list-tile-content @click="showDockIcon = !showDockIcon" class="switch-label">
      <v-list-tile-title>{{i18n('Show Dock icon')}}</v-list-tile-title>
      <v-list-tile-sub-title>{{i18n('Keep the window open and draggable.')}}</v-list-tile-sub-title>
     </v-list-tile-content>
     <v-list-tile-action><m3-switch v-model="showDockIcon"></m3-switch></v-list-tile-action>
    </v-list-tile>
    <v-divider></v-divider>
    <v-list-tile>
     <v-select :items="hotkeyPresets" :label="i18n('Show / hide hotkey')" v-model="cfg.window.globalHotkey" item-text="label" item-value="value"></v-select>
    </v-list-tile>
    <v-list-tile v-if="hotkeyError">
     <v-list-tile-content>
      <v-list-tile-sub-title class="red--text">{{hotkeyError}}</v-list-tile-sub-title>
     </v-list-tile-content>
    </v-list-tile>

    <div class="dialog-padding"></div>
    <v-header class="dialog-section-header">{{i18n('Local player')}}</v-header>
    <v-list-tile>
     <v-list-tile-content class="switch-label">
      <v-list-tile-title>{{i18n('Enable')}}</v-list-tile-title>
      <v-list-tile-sub-title>{{i18n('A preview player stays available for local visualisation.')}}</v-list-tile-sub-title>
     </v-list-tile-content>
     <v-list-tile-action><m3-switch v-model="clientRunning" @change="togglePlayer"></m3-switch></v-list-tile-action>
    </v-list-tile>
    <v-divider></v-divider>
    <v-list-tile>
     <v-list-tile-content @click="cfg.client.keepOpen = !cfg.client.keepOpen" class="switch-label">
      <v-list-tile-title>{{i18n('Keep open when the application is closed')}}</v-list-tile-title>
     </v-list-tile-content>
     <v-list-tile-action><m3-switch v-model="cfg.client.keepOpen"></m3-switch></v-list-tile-action>
    </v-list-tile>
    <v-divider></v-divider>
    <v-list-tile>
     <v-list-tile-content>
      <v-text-field :label="i18n('Player name')" v-model="cfg.client.name" class="lms-search" hide-details></v-text-field>
     </v-list-tile-content>
    </v-list-tile>

    <div class="dialog-padding"></div>
    <v-header class="dialog-section-header">{{i18n('Server')}}</v-header>
    <v-list-tile>
     <v-list-tile-content>
      <v-list-tile-title>{{discovering ? i18n('Looking for servers…') : i18n('Servers on the network')}}</v-list-tile-title>
      <v-list-tile-sub-title v-if="!discovering">{{servers.length ? i18n('Select one, or Other to enter a host.') : i18n('None found yet. You can still pick Local server or Other.')}}</v-list-tile-sub-title>
     </v-list-tile-content>
     <v-list-tile-action>
      <v-btn icon :disabled="discovering" @click.stop="discoverServers" :title="i18n('Scan again')"><v-icon>refresh</v-icon></v-btn>
     </v-list-tile-action>
    </v-list-tile>
    <v-list-tile v-for="s in remoteServers" :key="'srv-'+s.host+':'+s.port" @click="pickServer(s)" class="lms-list-item">
     <v-list-tile-content>
      <v-list-tile-title>{{s.name || s.host}}</v-list-tile-title>
      <v-list-tile-sub-title>{{s.host}}:{{s.port}}</v-list-tile-sub-title>
     </v-list-tile-content>
     <v-list-tile-action v-if="isPicked(s)"><v-icon>check</v-icon></v-list-tile-action>
    </v-list-tile>
    <v-divider></v-divider>
    <v-list-tile @click="pickLocal" class="lms-list-item">
     <v-list-tile-content>
      <v-list-tile-title>{{i18n('Local server')}}</v-list-tile-title>
      <v-list-tile-sub-title>{{localServerSubtitle}}</v-list-tile-sub-title>
     </v-list-tile-content>
     <v-list-tile-action v-if="localSelected"><v-icon>check</v-icon></v-list-tile-action>
    </v-list-tile>
    <v-divider></v-divider>
    <v-list-tile @click="pickOther" class="lms-list-item">
     <v-list-tile-content>
      <v-list-tile-title>{{i18n('Other')}}</v-list-tile-title>
      <v-list-tile-sub-title>{{i18n('Enter host and port manually')}}</v-list-tile-sub-title>
     </v-list-tile-content>
     <v-list-tile-action v-if="otherSelected"><v-icon>check</v-icon></v-list-tile-action>
    </v-list-tile>
    <v-list-tile v-if="otherSelected">
     <v-list-tile-content>
      <v-text-field :label="i18n('Host')" v-model="cfg.server.host" class="lms-search" hide-details @blur="commitServer" @keyup.enter="commitServer"></v-text-field>
     </v-list-tile-content>
    </v-list-tile>
    <v-list-tile v-if="otherSelected">
     <v-list-tile-content>
      <v-text-field :label="i18n('Port')" v-model="cfg.server.port" class="lms-search" hide-details @blur="commitServer" @keyup.enter="commitServer"></v-text-field>
     </v-list-tile-content>
    </v-list-tile>

    <div class="dialog-padding"></div>
    <v-header class="dialog-section-header">{{i18n('Lyrion Music Server on this computer')}}</v-header>
    <v-list-tile>
     <v-list-tile-content>
      <v-list-tile-title>{{lmsStatusTitle}}</v-list-tile-title>
      <v-list-tile-sub-title>{{lmsStatusText || lmsProgress || i18n('Install, start, or stop the server on this Mac.')}}</v-list-tile-sub-title>
     </v-list-tile-content>
    </v-list-tile>
    <v-list-tile>
     <v-btn v-if="lmsInstalled && !lmsRunning" flat @click="appAction('start-local')" :disabled="lmsBusy">{{i18n('Start')}}</v-btn>
     <v-btn v-if="lmsRunning" flat @click="appAction('stop-local')" :disabled="lmsBusy">{{i18n('Stop')}}</v-btn>
     <v-btn v-if="lmsRunning" flat @click="appAction('restart-local')" :disabled="lmsBusy">{{i18n('Restart')}}</v-btn>
     <v-btn v-if="!lmsInstalled" flat @click="appAction('install-lms')" :disabled="lmsBusy">{{i18n('Download & install')}}</v-btn>
     <v-btn v-if="lmsInstalled" flat @click="appAction('install-lms')" :disabled="lmsBusy">{{i18n('Install or update')}}</v-btn>
    </v-list-tile>
    <v-list-tile>
     <v-btn flat @click="appAction('open-docs')">{{i18n('Getting started')}}</v-btn>
     <v-btn flat @click="appAction('open-logs')" :disabled="!lmsRunning">{{i18n('View logs')}}</v-btn>
    </v-list-tile>
    <v-list-tile v-if="lmsError">
     <v-list-tile-content>
      <v-list-tile-sub-title class="red--text">{{lmsError}}</v-list-tile-sub-title>
     </v-list-tile-content>
    </v-list-tile>
    <div class="dialog-padding"></div>
   </v-list>
   <div v-else class="infodetails" style="padding:24px">{{i18n('Waiting for Lyrion.app…')}}</div>
  </v-card-text>
 </v-card>
</v-dialog>
`,
    data() {
        return {
            show: false,
            cfg: null,
            version: '',
            clientRunning: false,
            showDockIcon: false,
            hotkeyPresets: [],
            hotkeyError: '',
            servers: [],
            discovering: false,
            wantOther: false,
            thisMachineHosts: [],
            lmsStatusText: '',
            lmsProgress: '',
            lmsError: '',
            lmsBusy: false,
            lmsInstalled: false,
            lmsRunning: false,
            savedFlash: false,
            committedHost: '',
            committedPort: 9000
        };
    },
    computed: {
        title() {
            return this.version
                ? (i18n('Application') + ' · v' + this.version)
                : i18n('Application settings');
        },
        remoteServers() {
            var self = this;
            return (this.servers || []).filter(function(s) {
                return !self.isThisMachine(s.host);
            });
        },
        localSelected() {
            return !this.wantOther && this.isThisMachine(this.committedHost);
        },
        otherSelected() {
            if (this.wantOther) return true;
            if (this.localSelected) return false;
            var self = this;
            return !this.remoteServers.some(function(s) { return self.isPicked(s); });
        },
        localServerSubtitle() {
            if (this.lmsRunning) return i18n('Running on this computer');
            if (this.lmsInstalled) return i18n('Installed — will start when selected');
            return i18n('Will install Lyrion Music Server on this computer');
        },
        lmsStatusTitle() {
            if (this.lmsRunning) return i18n('Active');
            if (this.lmsInstalled) return i18n('Installed, not running');
            return i18n('Not installed');
        }
    },
    mounted() {
        this._onMsg = this.onParentMessage.bind(this);
        window.addEventListener('message', this._onMsg);
        bus.$on('appsettings.open', function() {
            this._silent = true;
            this.show = true;
            this.savedFlash = false;
            this.wantOther = false;
            this.post('open-ack');
            this.post('get-config');
            this.discoverServers();
        }.bind(this));
        bus.$on('closeDialog', function(dlg) {
            if (dlg === 'appsettings' && this.show) {
                this.show = false;
            }
        }.bind(this));
    },
    beforeDestroy() {
        window.removeEventListener('message', this._onMsg);
    },
    methods: {
        post(type, extra) {
            try {
                if (window.parent && window.parent !== window) {
                    window.parent.postMessage(Object.assign({ source: 'lyrion-minim', type: type }, extra || {}), '*');
                }
            } catch (e) {}
        },
        isThisMachine(host) {
            var h = String(host || '').trim().toLowerCase();
            if (!h) return false;
            if (h === '127.0.0.1' || h === 'localhost' || h === '::1') return true;
            var list = this.thisMachineHosts || [];
            for (var i = 0; i < list.length; i++) {
                if (String(list[i] || '').toLowerCase() === h) return true;
            }
            return false;
        },
        isPicked(s) {
            return s && s.host == this.committedHost && String(s.port) == String(this.committedPort);
        },
        onParentMessage(ev) {
            var d = ev && ev.data;
            if (!d || d.source !== 'lyrion-app') return;
            if (d.type === 'open-app-settings') {
                bus.$emit('dlg.open', 'appsettings');
            } else if (d.type === 'config') {
                if (this._silent || !this.cfg) {
                    this.applySnapshot(d);
                    this._silent = false;
                } else {
                    this.clientRunning = !!d.clientRunning;
                    if (d.thisMachineHosts) this.thisMachineHosts = d.thisMachineHosts;
                    if (d.lmsInstall && d.lmsInstall.status) {
                        this.lmsStatusText = d.lmsInstall.status.message || '';
                        this.lmsInstalled = !!d.lmsInstall.status.appInstalled;
                        this.lmsRunning = !!d.lmsInstall.status.serverRunning;
                    }
                    if (d.config && d.config.server && !this.wantOther) {
                        this.cfg.server.host = d.config.server.host;
                        this.cfg.server.port = d.config.server.port;
                        this.committedHost = d.config.server.host;
                        this.committedPort = d.config.server.port;
                        this.syncWantOther();
                    }
                    if (d.config && d.config.client && d.config.client.name && !this.cfg.client.name) {
                        this.cfg.client.name = d.config.client.name;
                    }
                }
            } else if (d.type === 'servers') {
                this.discovering = false;
                this.servers = d.servers || [];
                this.syncWantOther();
            } else if (d.type === 'config-saved') {
                this.savedFlash = true;
                this.hotkeyError = d.hotkeyError || '';
                setTimeout(function() { this.savedFlash = false; }.bind(this), 1500);
            } else if (d.type === 'lms-status') {
                this.lmsBusy = !!d.busy;
                this.lmsProgress = d.progress || '';
                this.lmsError = d.error || '';
                if (d.status) {
                    this.lmsStatusText = d.status.message || '';
                    this.lmsInstalled = !!d.status.appInstalled;
                    this.lmsRunning = !!d.status.serverRunning;
                }
            }
        },
        applySnapshot(d) {
            this.version = d.version || '';
            this.cfg = JSON.parse(JSON.stringify(d.config || {}));
            if (!this.cfg.client) this.cfg.client = { name: '', enabled: true, keepOpen: false };
            if (this.cfg.client.keepOpen === undefined) this.cfg.client.keepOpen = false;
            if (this.cfg.client.enabled === undefined) {
                this.cfg.client.enabled = this.cfg.client.autostart !== false;
            }
            if (!this.cfg.server) this.cfg.server = { host: '', port: 9000, autodetect: true };
            if (!this.cfg.window) this.cfg.window = { globalHotkey: 'CmdOrControl+Shift+Space', showDockIcon: false };
            this.clientRunning = !!d.clientRunning;
            this.showDockIcon = !!(d.showDockIcon || (this.cfg.window && this.cfg.window.showDockIcon));
            this.hotkeyPresets = d.hotkeyPresets && d.hotkeyPresets.length
                ? d.hotkeyPresets
                : [{ value: 'CmdOrControl+Shift+Space', label: '⌘⇧Space' }];
            this.hotkeyError = d.hotkeyError || '';
            this.thisMachineHosts = d.thisMachineHosts || [];
            if (d.lmsInstall && d.lmsInstall.status) {
                this.lmsStatusText = d.lmsInstall.status.message || '';
                this.lmsInstalled = !!d.lmsInstall.status.appInstalled;
                this.lmsRunning = !!d.lmsInstall.status.serverRunning;
            }
            this.lmsProgress = (d.lmsInstall && d.lmsInstall.progress) || '';
            this.lmsError = (d.lmsInstall && d.lmsInstall.error) || '';
            this.lmsBusy = !!(d.lmsInstall && d.lmsInstall.busy);
            this.committedHost = this.cfg.server.host;
            this.committedPort = this.cfg.server.port;
            this.syncWantOther();
        },
        syncWantOther() {
            if (this.isThisMachine(this.committedHost)) {
                this.wantOther = false;
                return;
            }
            var self = this;
            if ((this.servers || []).some(function(s) { return self.isPicked(s); })) {
                this.wantOther = false;
            } else if (this.committedHost) {
                this.wantOther = true;
            }
        },
        togglePlayer() {
            if (this.cfg) this.cfg.client.enabled = !!this.clientRunning;
            this.post('app-action', { action: this.clientRunning ? 'start-player' : 'stop-player' });
        },
        discoverServers() {
            this.discovering = true;
            this.post('app-action', { action: 'detect-servers' });
        },
        pickServer(s) {
            this.wantOther = false;
            this.cfg.server.autodetect = false;
            this.cfg.server.host = s.host;
            this.cfg.server.port = s.port;
            this.commitServer();
        },
        pickLocal() {
            this.wantOther = false;
            this.appAction('activate-local');
        },
        pickOther() {
            this.wantOther = true;
        },
        appAction(action) {
            this.post('app-action', { action: action });
        },
        scheduleSave() {
            if (this._silent || !this.show || !this.cfg) return;
            if (this._saveTimer) {
                clearTimeout(this._saveTimer);
            }
            this._saveTimer = setTimeout(function() {
                this.save(false);
            }.bind(this), 280);
        },
        commitServer() {
            if (this._silent || !this.show || !this.cfg) return;
            if (this._saveTimer) {
                clearTimeout(this._saveTimer);
                this._saveTimer = null;
            }
            this.save(true);
        },
        save(includeServerEndpoint) {
            if (!this.cfg) return;
            this.cfg.window.showDockIcon = this.showDockIcon;
            var payload = JSON.parse(JSON.stringify(this.cfg));
            if (!includeServerEndpoint) {
                if (this.committedHost) payload.server.host = this.committedHost;
                if (this.committedPort) payload.server.port = this.committedPort;
            } else {
                this.committedHost = payload.server.host;
                this.committedPort = payload.server.port;
            }
            this.post('set-config', { config: payload });
        },
        close() {
            if (this._saveTimer) {
                clearTimeout(this._saveTimer);
                this._saveTimer = null;
            }
            this.save(true);
            this.show = false;
        }
    },
    watch: {
        show: function(val) {
            this.$store.commit('dialogOpen', {name:'appsettings', shown:val});
        },
        cfg: {
            deep: true,
            handler: function() { this.scheduleSave(); }
        },
        showDockIcon: function() { this.scheduleSave(); }
    }
});
