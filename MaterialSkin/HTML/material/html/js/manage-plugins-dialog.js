/**
 * LMS-Material
 *
 * Copyright (c) 2018-2026 Craig Drummond <craig.p.drummond@gmail.com>
 * MIT license.
 */
'use strict';

const PLUGIN_CAT_KEYS = ['musicservices', 'radio', 'hardware', 'skin', 'information', 'playlists', 'scanning', 'tools', 'misc'];
const PLUGIN_WIDE_MIN = 800;

function pluginCategoryLabel(cat) {
    const labels = {
        musicservices: i18n('Music services'),
        radio: i18n('Radio'),
        hardware: i18n('Hardware'),
        skin: i18n('Skins'),
        information: i18n('Information'),
        playlists: i18n('Playlists'),
        scanning: i18n('Scanning'),
        tools: i18n('Tools'),
        misc: i18n('Miscellaneous')
    };
    return labels[cat] || labels.misc;
}

function pluginCategorySort(a, b) {
    let ai = PLUGIN_CAT_KEYS.indexOf(a);
    let bi = PLUGIN_CAT_KEYS.indexOf(b);
    if (ai < 0) {
        ai = PLUGIN_CAT_KEYS.length;
    }
    if (bi < 0) {
        bi = PLUGIN_CAT_KEYS.length;
    }
    return ai !== bi ? (ai < bi ? -1 : 1) : a < b ? -1 : a > b ? 1 : 0;
}

function pluginInstalls(p) {
    let n = p && p.installations != null ? parseInt(p.installations) : 0;
    return isNaN(n) ? 0 : n;
}

function pluginPopularitySort(a, b) {
    let d = pluginInstalls(b) - pluginInstalls(a);
    return 0 != d ? d : titleSort(a, b);
}

function pluginDescrPlain(plug) {
    if (!plug) {
        return '';
    }
    if (plug._plainDescr != null) {
        return plug._plainDescr;
    }
    let d = plug.descr || plug.desc || '';
    if (!d) {
        plug._plainDescr = '';
        return '';
    }
    plug._plainDescr = String(d).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
    return plug._plainDescr;
}

/** Precompute lowercase haystack once (HTML strip is expensive on large catalogs). */
function pluginBuildSearchText(plug) {
    if (!plug) {
        return '';
    }
    if (plug._searchText) {
        return plug._searchText;
    }
    let parts = [
        plug.title || '',
        plug.name || '',
        plug.creator || '',
        plug.category || '',
        plug.repoTitle || '',
        plug.repo || '',
        pluginDescrPlain(plug)
    ];
    plug._searchText = parts.join(' ').toLowerCase().replace(/\s+/g, ' ').trim();
    return plug._searchText;
}

function pluginMatchesQuery(plug, q) {
    if (!q) {
        return true;
    }
    return pluginBuildSearchText(plug).indexOf(q) >= 0;
}

function pluginNameByAuthor(plug) {
    if (!plug) {
        return '';
    }
    let name = plug.title || plug.name || '';
    let author = plug.creator || '';
    if (name && author) {
        return name + ' ' + i18n('by') + ' ' + author;
    }
    return name || author;
}

function pluginIconSrc(icon) {
    if (!icon) {
        return '';
    }
    let s = String(icon).trim();
    if (!s) {
        return '';
    }
    if (s.indexOf('http://') === 0 || s.indexOf('https://') === 0 || s.indexOf('data:') === 0) {
        return s;
    }
    if (s.charAt(0) === '/') {
        return s;
    }
    return '/' + s;
}

Vue.component('lms-manage-plugins', {
    // embedded=true → content panel inside server-settings shell (uses THAT sidebar)
    props: {
        embedded: { type: Boolean, default: false }
    },
    template: `
<div id="manage-plugins-page-root" v-show="show" class="manage-plugins-root"
     :class="{'manage-plugins-embedded-host': embedded}">
 <div class="manage-plugins-card manage-plugins-card-fill" :class="{'manage-plugins-card-wide': !embedded && wideLayout}">
  <div class="manage-plugins-body manage-plugins-body-fill">
   <!-- No local settings rail when embedded — server-settings shell owns the sidebar -->
   <div class="manage-plugins-main">
    <div class="manage-plugins-chrome">
     <div class="manage-plugins-tabs noselect" role="tablist" :aria-label="i18n('Plugins')">
      <button type="button" role="tab" class="manage-plugins-tab"
       v-for="tab in mainTabs" :key="'tab-'+tab.key"
       :class="{'manage-plugins-tab-on': isMainTabOn(tab.key)}"
       :aria-selected="isMainTabOn(tab.key) ? 'true' : 'false'"
       @click.stop="selectMainTab(tab.key)">{{tab.label}}</button>
     </div>
     <div class="manage-plugins-search-row">
      <div class="manage-plugins-search-field">
       <v-icon class="manage-plugins-search-ico">search</v-icon>
       <input ref="pluginSearchInput" type="search" class="manage-plugins-search-input"
        :value="search" :placeholder="i18n('Search plugins')"
        autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
        @input="onSearchInputNative" @keydown.stop />
       <button v-if="search" type="button" class="manage-plugins-search-clear"
        :title="i18n('Clear')" @click.stop.prevent="clearSearch">
        <v-icon small>close</v-icon>
       </button>
      </div>
      <div class="manage-plugins-search-actions">
       <button type="button" ref="optionsMenuBtn" class="manage-plugins-action-btn"
        :class="{'manage-plugins-action-active': chromeMenuOpen}"
        :title="i18n('Options')" @click.stop="toggleChromeMenu('options')">
        <v-icon>tune</v-icon>
       </button>
      </div>
     </div>
    </div>
  <div id="manage-plugins-page" class="manage-plugins-page" tabindex="0" @keydown="onPageKeydown">
   <div v-if="needsRestart" class="manage-plugins-restart-banner">
    <img class="svg-img manage-plugins-restart-icon" :src="'restart' | svgIcon(darkUi)"></img>
    <div class="manage-plugins-restart-text">
     <div class="manage-plugins-restart-title">{{i18n('Restart required')}}</div>
     <div class="manage-plugins-restart-sub">{{i18n('Lyrion Music Server must be restarted for plugin changes to take effect.')}}</div>
    </div>
    <v-btn flat class="manage-plugins-restart-btn" @click.stop="restartServer" :title="i18n('Restart server')">
     <img class="svg-img btn-icon" :src="'restart' | svgIcon(darkUi)"></img>
     <span v-if="wideLayout">{{i18n('Restart')}}</span>
    </v-btn>
   </div>

   <!-- Updates: own block, not mixed into installed/catalog lists -->
   <div v-if="showUpdatesSection" id="mp-sec-updates" class="manage-plugins-updates-block">
    <div class="manage-plugins-updates-head">
     <div class="manage-plugins-updates-text">
      <div class="manage-plugins-updates-title">{{i18n('Updates available')}}</div>
      <div class="manage-plugins-updates-sub">{{downloading ? i18n('Downloading plugin updates') : i18np('1 plugin', '%1 plugins', visibleUpdates.length)}}</div>
     </div>
     <v-btn v-if="!downloading && visibleUpdates.length>0" flat class="manage-plugins-update-all-btn" @click.stop="updateAll" :disabled="updating" :title="i18n('Update all')">
      <img class="svg-img btn-icon" :src="'update' | svgIcon(darkUi)"></img>
      <span class="manage-plugins-update-all-label">{{i18n('Update all')}}</span>
     </v-btn>
     <v-progress-circular v-if="downloading" indeterminate size="22" width="2" class="manage-plugins-updates-spinner"></v-progress-circular>
    </div>
    <v-list-tile v-for="plug in visibleUpdates" :key="'upd-'+plug.name" class="manage-plugins-row manage-plugins-update-row" :class="{'manage-plugins-row-desc':showDescription}" :title="pluginHoverTitle(plug)" @click="pluginInfo(plug)">
     <v-list-tile-avatar class="manage-plugins-avatar">
      <img v-if="pluginIconUrl(plug)" :src="pluginIconUrl(plug)" class="manage-plugins-icon" :class="{'manage-plugins-icon-mono':pluginIconIsMono(plug)}" :alt="plug.title" :title="pluginHoverTitle(plug)" @error="onPluginIconError($event, plug)" @dragstart.prevent="">
      <v-icon v-else>extension</v-icon>
     </v-list-tile-avatar>
     <v-list-tile-content class="manage-plugins-row-main">
      <v-list-tile-title class="manage-plugins-title-line ellipsis">{{pluginNameByAuthor(plug)}}</v-list-tile-title>
      <v-list-tile-sub-title v-if="showDescription && pluginDescrPlain(plug)" class="manage-plugins-desc subtext">{{pluginDescrPlain(plug)}}</v-list-tile-sub-title>
      <v-list-tile-sub-title v-else-if="showVersion && plug.version" class="subtext">{{i18n('Version')}} {{plug.version}}</v-list-tile-sub-title>
     </v-list-tile-content>
     <v-list-tile-action class="manage-plugins-col-action manage-plugins-col-action-install" @click.stop>
      <span class="manage-plugins-install-status subtext">{{updateRowStatus(plug)}}</span>
     </v-list-tile-action>
    </v-list-tile>
   </div>

   <template v-if="showInstalledList">
    <template v-for="section in groupedSections">
     <v-header v-if="section.label" class="dialog-section-header" :id="'mp-sec-'+section.key" :key="'hdr-'+section.key">{{section.label}}</v-header>
     <div v-else :id="'mp-sec-'+section.key" :key="'hdr-anchor-'+section.key" class="manage-plugins-sec-anchor"></div>
     <v-list-tile v-for="plug in section.items" :key="'mp-'+plug.name" class="manage-plugins-row" :class="{'manage-plugins-row-desc':showDescription}" :title="pluginHoverTitle(plug)" @click="pluginInfo(plug)">
      <v-list-tile-avatar class="manage-plugins-avatar">
       <img v-if="pluginIconUrl(plug)" :src="pluginIconUrl(plug)" class="manage-plugins-icon" :class="{'manage-plugins-icon-mono':pluginIconIsMono(plug)}" :alt="plug.title" :title="pluginHoverTitle(plug)" @error="onPluginIconError($event, plug)" @dragstart.prevent="">
       <v-icon v-else>extension</v-icon>
      </v-list-tile-avatar>
      <v-list-tile-content class="manage-plugins-row-main">
       <v-list-tile-title class="manage-plugins-title-line ellipsis">{{pluginNameByAuthor(plug)}}</v-list-tile-title>
       <v-list-tile-sub-title v-if="showDescription && pluginDescrPlain(plug)" class="manage-plugins-desc subtext">{{pluginDescrPlain(plug)}}</v-list-tile-sub-title>
       <v-list-tile-sub-title v-else-if="rowMetaLine(plug)" class="subtext ellipsis">{{rowMetaLine(plug)}}</v-list-tile-sub-title>
      </v-list-tile-content>
      <v-list-tile-action class="manage-plugins-actions" @click.stop>
       <v-btn v-if="plug.settings" icon flat small class="manage-plugins-settings-btn" :title="i18n('Settings')" @click.stop="openPluginSettings(plug)"><v-icon small>settings</v-icon></v-btn>
       <m3-switch :value="plug.enabled" @input="setEnabled(plug, $event)" :disabled="plug.busy"></m3-switch>
      </v-list-tile-action>
     </v-list-tile>
    </template>
    <v-list-tile-sub-title v-if="visiblePlugins.length<1 && !loadingPlugins" style="padding:16px">{{i18n('No plugins match your search.')}}</v-list-tile-sub-title>
   </template>

   <v-divider v-if="showCatalog"></v-divider>
   <div id="mp-sec-catalog" class="manage-plugins-sec-anchor"></div>
   <v-list-tile v-if="catalogLoading">
    <v-list-tile-avatar><v-progress-circular indeterminate size="24" width="2"></v-progress-circular></v-list-tile-avatar>
    <v-list-tile-content><v-list-tile-title>{{i18n('Loading available plugins…')}}</v-list-tile-title></v-list-tile-content>
   </v-list-tile>
   <template v-if="showCatalog && !catalogLoading">
    <template v-for="section in visibleCatalogSections">
     <v-header v-if="section.title" class="dialog-section-header" :key="'cat-hdr-'+section.repo">{{section.title}}</v-header>
     <v-list-tile v-for="plug in section.items" :key="'cat-'+plug.name" class="manage-plugins-row manage-plugins-catalog-row" :class="{'manage-plugins-row-desc':showDescription}" :title="pluginHoverTitle(plug)" @click="pluginInfo(plug)">
      <v-list-tile-avatar class="manage-plugins-avatar">
       <img v-if="pluginIconUrl(plug)" :src="pluginIconUrl(plug)" class="manage-plugins-icon" :class="{'manage-plugins-icon-mono':pluginIconIsMono(plug)}" :alt="plug.title" :title="pluginHoverTitle(plug)" @error="onPluginIconError($event, plug)" @dragstart.prevent="">
       <v-icon v-else>extension</v-icon>
      </v-list-tile-avatar>
      <v-list-tile-content class="manage-plugins-row-main">
       <v-list-tile-title class="manage-plugins-title-line ellipsis">{{pluginNameByAuthor(plug)}}</v-list-tile-title>
       <v-list-tile-sub-title v-if="showDescription && pluginDescrPlain(plug)" class="manage-plugins-desc subtext">{{pluginDescrPlain(plug)}}</v-list-tile-sub-title>
       <v-list-tile-sub-title v-else-if="rowMetaLine(plug) || plug.unsupported" class="subtext ellipsis">
        <span v-if="plug.unsupported" class="manage-plugins-unsupported">{{i18n('Unsupported')}}</span>
        <span v-if="plug.unsupported && rowMetaLine(plug)"> · </span>
        <span v-if="rowMetaLine(plug)">{{rowMetaLine(plug)}}</span>
       </v-list-tile-sub-title>
      </v-list-tile-content>
      <v-list-tile-action class="manage-plugins-actions manage-plugins-col-action-install" @click.stop>
       <v-btn flat small class="manage-plugins-install-btn" :disabled="installBtnDisabled(plug)" :title="installBtnLabel(plug)" @click.stop="installPlugin(plug)">
        <v-icon v-if="installBtnIcon(plug)" small>{{installBtnIcon(plug)}}</v-icon>
        <v-progress-circular v-else-if="installBtnBusy(plug)" :indeterminate="true" size="16" width="2" class="manage-plugins-install-spin"></v-progress-circular>
        <span class="manage-plugins-install-label">{{installBtnLabel(plug)}}</span>
       </v-btn>
      </v-list-tile-action>
     </v-list-tile>
    </template>
   </template>

   <!-- Hide repo/auto-update prefs while searching so filter results stay clear -->
   <template v-if="!hasSearchQuery && showSettingsBlock">
    <v-divider v-if="showMode!='settings'"></v-divider>
    <v-header id="mp-sec-settings" class="dialog-section-header">{{i18n('Plugin settings')}}</v-header>
    <v-list-tile class="manage-plugins-settings-tile">
     <v-list-tile-content @click="setAutoUpdate(!settings.auto)" class="switch-label">
      <v-list-tile-title>{{i18n('Update plugins automatically')}}</v-list-tile-title>
      <v-list-tile-sub-title>{{i18n('Allow Lyrion Music Server to check for plugin updates and download them to be applied on the next server restart.')}}</v-list-tile-sub-title>
     </v-list-tile-content>
     <v-list-tile-action><m3-switch :value="settings.auto" @input="setAutoUpdate" :disabled="settingsSaving"></m3-switch></v-list-tile-action>
    </v-list-tile>
    <v-list-tile class="manage-plugins-settings-tile manage-plugins-unsupported-tile">
     <v-list-tile-content @click="setUseUnsupported(!settings.useUnsupported)" class="switch-label">
      <v-list-tile-title>{{i18n('Use unsupported plugins')}}</v-list-tile-title>
      <v-list-tile-sub-title class="manage-plugins-disclaimer">{{unsupportedDisclaimer}}</v-list-tile-sub-title>
     </v-list-tile-content>
     <v-list-tile-action class="manage-plugins-settings-action"><m3-switch :value="settings.useUnsupported" @input="setUseUnsupported" :disabled="settingsSaving"></m3-switch></v-list-tile-action>
    </v-list-tile>
    <v-list-tile class="manage-plugins-repos-header manage-plugins-settings-tile">
     <v-list-tile-content>
      <v-list-tile-title>{{i18n('Additional repositories')}}</v-list-tile-title>
      <v-list-tile-sub-title>{{i18n('Add third-party plugin repositories by entering their URL below. Make sure you trust any repository you add.')}}</v-list-tile-sub-title>
     </v-list-tile-content>
    </v-list-tile>
    <v-list-tile v-for="(repo, index) in settings.repos" :key="'repo-'+index" class="manage-plugins-repo-row">
     <v-text-field clearable autocorrect="off" :label="i18n('Repository URL')" v-model="settings.repos[index]" class="lms-search manage-plugins-repo-field" hide-details @blur="saveSettings" @keyup.enter="saveSettings"></v-text-field>
    </v-list-tile>
    <v-list-tile>
     <v-btn flat @click="addRepoSlot"><v-icon left>add</v-icon>{{i18n('Add repository')}}</v-btn>
    </v-list-tile>
   </template>
   <div v-if="hasSearchQuery && noSearchHits" class="manage-plugins-empty-search">{{i18n('No plugins match your search.')}}</div>

   <div class="dialog-bottom-pad"></div>
  </div><!-- manage-plugins-page -->
   </div><!-- manage-plugins-main -->
  </div><!-- manage-plugins-body -->
 </div><!-- manage-plugins-card -->
</div>
`,
    data() {
        return {
            show: false,
            title: i18n('Manage plugins'),
            serverName: undefined,
            settingsSectionGroups: [],
            settingsActive: 'SETUP_PLUGINS',
            settingsNavMenu: false,
            sidebarActiveId: 'installed',
            plugins: [],
            updates: [],
            updateNames: new Set(),
            popularityMap: {},
            search: '',
            /** Debounced lowercase query used by list filters (avoids re-filter every key). */
            filterQuery: '',
            showMode: 'all',
            sortMode: 'category',
            sortDesc: false,
            showUnsupported: false,
            groupByRepo: true,
            showDescription: true,
            showVersion: true,
            wideLayout: false,
            needsRestart: false,
            downloading: false,
            updating: false,
            activeInstallName: '',
            pendingInstallNames: {},
            showMenu: false,
            chromeMenuOpen: false,
            statusTimer: undefined,
            loadingPlugins: false,
            loadError: false,
            catalogSections: [],
            catalogLoading: false,
            installing: false,
            settings: { auto: false, useUnsupported: false, repos: [''] },
            settingsSaving: false,
            settingsTimer: undefined
        };
    },
    mounted() {
        this._onResize = function() {
            this.updateLayout();
        }.bind(this);
        window.addEventListener('resize', this._onResize, PASSIVE_SUPPORTED ? { passive: true } : false);
        this.updateLayout();

        bus.$on('manageplugins.setSortMode', function(mode) {
            // From settings shell ⋮ (category vs alphabetical) — not full settings list
            if (!this.show) {
                return;
            }
            // Only category / name from the outer shell; keep other modes via plugin Options
            let next = (mode === 'name') ? 'name' : (mode === 'category' ? 'category' : this.normalizeSortMode(mode));
            this.setSortMode(next, true, false);
        }.bind(this));
        bus.$on('manageplugins.open', function(serverName) {
            this.serverName = serverName;
            this.title = i18n('Manage plugins') + (serverName ? SEPARATOR + serverName : '');
            this.search = '';
            this.filterQuery = '';
            this.cancelFilterTimer();
            this.sortDesc = getLocalStorageBool('pluginSortDesc', false);
            // Prefer showMode; fall back to older pluginFilter key
            // Normalize legacy modes onto tab keys where possible
            let sm = getLocalStorageVal('pluginShowMode', getLocalStorageVal('pluginFilter', 'all')) || 'all';
            if (sm === 'pluginFilter') { sm = 'all'; }
            this.showMode = sm;
            this.sortMode = this.normalizeSortMode(getLocalStorageVal('pluginSortMode', 'category') || 'category');
            this.showUnsupported = getLocalStorageBool('pluginShowUnsupported', false);
            this.groupByRepo = getLocalStorageBool('pluginGroupByRepo', true);
            this.showDescription = getLocalStorageBool('pluginShowDescription', true);
            this.showVersion = getLocalStorageBool('pluginShowVersion', true);
            this.updateLayout();
            this.closeAllMenus();
            this.settingsActive = 'SETUP_PLUGINS';
            this.loadSettingsSectionsCache();
            this.show = true;
            this.loadError = false;
            this.fetchSettings();
            this.fetchPlugins();
            this.fetchCatalog();
            this.fetchUpdates();
            this.startStatusPoll();
            this.$nextTick(function() {
                if (this.$refs.pluginSearch && this.$refs.pluginSearch.focus) {
                    this.$refs.pluginSearch.focus();
                }
            }.bind(this));
        }.bind(this));
        bus.$on('closeDialog', function(dlg) {
            if (dlg == 'manageplugins') {
                this.close(true);
            }
        }.bind(this));
        // Embedded into settings shell: open as soon as we mount
        if (this.embedded) {
            this.$nextTick(function() {
                bus.$emit('manageplugins.open');
            });
        }
    },
    methods: {
        fetchPlugins() {
            this.loadingPlugins = true;
            lmsCommand('', ['material-skin', 'plugins-manage']).then(({data}) => {
                this.loadingPlugins = false;
                if (!data || !data.result) {
                    this.loadError = true;
                    return;
                }
                let loop = data.result.plugins_loop || [];
                this.plugins = [];
                for (let i = 0, len = loop.length; i < len; ++i) {
                    let p = loop[i];
                    let row = {
                        name: p.name,
                        title: p.title,
                        descr: p.descr,
                        creator: p.creator,
                        homepage: p.homepage,
                        email: p.email,
                        version: p.version,
                        category: p.category || 'misc',
                        icon: p.icon || '',
                        iconBroken: false,
                        enabled: 1 == parseInt(p.enabled),
                        pending: 1 == parseInt(p.pending),
                        error: p.error,
                        installType: p.installType,
                        settings: p.settings || '',
                        installations: this.popularityMap[p.name] || 0,
                        installed: true,
                        busy: false
                    };
                    pluginBuildSearchText(row);
                    this.plugins.push(row);
                }
                this.plugins.sort(titleSort);
                this.mergePopularity();
                this.needsRestart = 1 == parseInt(data.result.needs_restart);
                this.$store.commit('setRestartRequired', this.needsRestart);
            }).catch(err => {
                this.loadingPlugins = false;
                this.loadError = true;
                logError(err);
                bus.$emit('showError', err, i18n('Failed to load plugins'));
            });
        },
        fetchSettings() {
            lmsCommand('', ['material-skin', 'plugins-settings']).then(({data}) => {
                if (!data || !data.result) {
                    return;
                }
                let repos = [];
                try {
                    repos = JSON.parse(data.result.repos || '[]');
                } catch (e) {
                    repos = [];
                }
                if (!repos.length) {
                    repos = [''];
                } else if (repos[repos.length - 1]) {
                    repos.push('');
                }
                this.settings = {
                    auto: 1 == parseInt(data.result.auto),
                    useUnsupported: 1 == parseInt(data.result.useUnsupported),
                    repos: repos
                };
            }).catch(err => {
                logError(err);
            });
        },
        fetchCatalog() {
            this.catalogLoading = true;
            lmsCommand('', ['material-skin', 'plugins-catalog'], undefined, 60000).then(({data}) => {
                this.catalogLoading = false;
                if (!data || !data.result) {
                    return;
                }
                let sections = [];
                let pop = {};
                let loop = data.result.catalog_sections_loop || [];
                for (let i = 0, len = loop.length; i < len; ++i) {
                    let key = 'catalog_' + i + '_plugins_loop';
                    let items = data.result[key] || [];
                    let plugins = [];
                    for (let p = 0, plen = items.length; p < plen; ++p) {
                        let plug = items[p];
                        let installs = parseInt(plug.installations) || 0;
                        if (plug.name) {
                            pop[plug.name] = Math.max(pop[plug.name] || 0, installs);
                        }
                        let istate = '';
                        if (this.pendingInstallNames[plug.name]) {
                            istate = 'pending';
                        } else if (this.activeInstallName === plug.name) {
                            istate = this.downloading ? 'downloading' : 'installing';
                        }
                        let row = {
                            name: plug.name,
                            title: plug.title,
                            descr: plug.descr,
                            creator: plug.creator,
                            homepage: plug.homepage,
                            email: plug.email,
                            version: plug.version,
                            category: plug.category || 'misc',
                            icon: plug.icon || '',
                            iconBroken: false,
                            url: plug.url,
                            sha: plug.sha,
                            installations: installs,
                            unsupported: 1 == parseInt(plug.unsupported),
                            repo: loop[i].repo,
                            repoTitle: loop[i].title,
                            installed: false,
                            busy: istate === 'downloading' || istate === 'installing',
                            installState: istate
                        };
                        pluginBuildSearchText(row);
                        plugins.push(row);
                    }
                    if (plugins.length > 0) {
                        sections.push({
                            repo: loop[i].repo,
                            title: loop[i].title,
                            items: plugins
                        });
                    }
                }
                this.catalogSections = sections;
                this.popularityMap = pop;
                this.mergePopularity();
            }).catch(err => {
                this.catalogLoading = false;
                logError(err);
                bus.$emit('showError', err, i18n('Failed to load available plugins'));
            });
        },
        mergePopularity() {
            if (!this.plugins.length || !this.popularityMap) {
                return;
            }
            for (let i = 0, len = this.plugins.length; i < len; ++i) {
                let n = this.plugins[i].name;
                if (this.popularityMap[n] != null) {
                    this.plugins[i].installations = this.popularityMap[n];
                }
            }
        },
        saveSettings() {
            if (this.settingsSaving) {
                return;
            }
            this.cancelSettingsTimer();
            this.settingsTimer = setTimeout(function() {
                this.settingsSaving = true;
                let repos = [];
                for (let i = 0, len = this.settings.repos.length; i < len; ++i) {
                    let r = (this.settings.repos[i] || '').trim();
                    if (r.length > 0) {
                        repos.push(r);
                    }
                }
                lmsCommand('', ['material-skin', 'plugins-settings-set',
                    'auto:' + (this.settings.auto ? 1 : 0),
                    'useUnsupported:' + (this.settings.useUnsupported ? 1 : 0),
                    'repos:' + JSON.stringify(repos)]).then(() => {
                    this.settingsSaving = false;
                    let padded = repos.slice();
                    padded.push('');
                    this.settings.repos = padded;
                    this.fetchCatalog();
                }).catch(err => {
                    this.settingsSaving = false;
                    logError(err);
                    bus.$emit('showError', err);
                });
            }.bind(this), 400);
        },
        cancelSettingsTimer() {
            if (this.settingsTimer) {
                clearTimeout(this.settingsTimer);
                this.settingsTimer = undefined;
            }
        },
        setAutoUpdate(val) {
            this.settings.auto = val;
            this.saveSettings();
        },
        setUseUnsupported(val) {
            let apply = function() {
                this.settings.useUnsupported = val;
                this.saveSettings();
                if (val) {
                    this.showUnsupported = true;
                    setLocalStorageVal('pluginShowUnsupported', true);
                    this.fetchCatalog();
                }
            }.bind(this);
            if (val) {
                confirm(this.unsupportedDisclaimer, i18n('Enable'), i18n('Cancel')).then(function(resp) {
                    if (resp) {
                        apply();
                    }
                });
            } else {
                apply();
            }
        },
        addRepoSlot() {
            this.settings.repos.push('');
        },
        installPlugin(plug) {
            if (!plug || this.installBtnDisabled(plug)) {
                return;
            }
            if (plug.unsupported && !this.settings.useUnsupported) {
                bus.$emit('showMessage', i18n('Enable unsupported plugins before installing this plugin.'));
                return;
            }
            let doInstall = function() {
                this.$set(plug, 'busy', true);
                this.$set(plug, 'installState', 'installing');
                this.installing = true;
                this.activeInstallName = plug.name || '';
                lmsCommand('', ['material-skin', 'plugin-install',
                    'name:' + plug.name,
                    'url:' + (plug.url || ''),
                    'sha:' + (plug.sha || '')]).then(({data}) => {
                    this.installing = false;
                    if (data && data.result && 1 == parseInt(data.result.downloading)) {
                        this.downloading = true;
                        this.$set(plug, 'installState', 'downloading');
                        bus.$emit('showMessage', i18n('Downloading plugin.'));
                    } else {
                        // Install accepted; treat as pending restart until status says otherwise
                        this.markInstallPending(plug.name);
                        this.$set(plug, 'installState', 'pending');
                        this.$set(plug, 'busy', false);
                        this.activeInstallName = '';
                    }
                    this.fetchPlugins();
                    this.fetchCatalog();
                }).catch(err => {
                    this.$set(plug, 'busy', false);
                    this.$set(plug, 'installState', '');
                    this.installing = false;
                    this.activeInstallName = '';
                    logError(err);
                    bus.$emit('showError', err, i18n('Failed to install plugin'));
                });
            }.bind(this);
            if (plug.unsupported) {
                confirm(this.unsupportedDisclaimer, i18n('Install'), i18n('Cancel')).then(function(resp) {
                    if (resp) {
                        doInstall();
                    }
                });
            } else {
                doInstall();
            }
        },
        markInstallPending(name) {
            if (!name) {
                return;
            }
            this.$set(this.pendingInstallNames, name, true);
        },
        clearInstallPending(name) {
            if (!name || !this.pendingInstallNames[name]) {
                return;
            }
            this.$delete(this.pendingInstallNames, name);
        },
        installStateOf(plug) {
            if (!plug) {
                return '';
            }
            if (this.pendingInstallNames[plug.name]) {
                return 'pending';
            }
            if (plug.installState) {
                return plug.installState;
            }
            if (plug.busy && this.downloading && this.activeInstallName === plug.name) {
                return 'downloading';
            }
            if (plug.busy || (this.installing && this.activeInstallName === plug.name)) {
                return 'installing';
            }
            return '';
        },
        installBtnLabel(plug) {
            let s = this.installStateOf(plug);
            if ('downloading' === s) {
                return i18n('Downloading');
            }
            if ('installing' === s) {
                return i18n('Installing');
            }
            if ('pending' === s) {
                return i18n('Pending restart');
            }
            return i18n('Install');
        },
        installBtnIcon(plug) {
            let s = this.installStateOf(plug);
            if ('pending' === s) {
                return 'schedule';
            }
            if (!s) {
                return 'get_app';
            }
            return '';
        },
        installBtnBusy(plug) {
            let s = this.installStateOf(plug);
            return 'downloading' === s || 'installing' === s;
        },
        installBtnDisabled(plug) {
            if (!plug) {
                return true;
            }
            let s = this.installStateOf(plug);
            if (s) {
                return true;
            }
            // Only one install at a time
            return this.installing || !!this.activeInstallName;
        },
        updateRowStatus(plug) {
            if (this.downloading || this.updating) {
                return i18n('Downloading');
            }
            if (this.pendingInstallNames[plug && plug.name] || this.needsRestart) {
                return i18n('Pending restart');
            }
            return i18n('Update available');
        },
        fetchUpdates() {
            if (!this.$store.state.unlockAll) {
                this.updates = [];
                this.updateNames = new Set();
                return;
            }
            axios.get(location.protocol + '//' + location.hostname + (location.port ? ':' + location.port : '') + '/updateinfo.json?x=time' + (new Date().getTime())).then((resp) => {
                let info = eval(resp.data);
                this.updates = [];
                this.updateNames = new Set();
                if (info && info.plugins) {
                    for (let i = 0, len = info.plugins.length; i < len; ++i) {
                        if (info.plugins[i]) {
                            this.updateNames.add(info.plugins[i].name);
                            pluginBuildSearchText(info.plugins[i]);
                            this.updates.push(info.plugins[i]);
                        }
                    }
                    this.updates.sort(titleSort);
                }
            }).catch(err => {
                logError(err);
            });
        },
        startStatusPoll() {
            this.stopStatusPoll();
            this.statusTimer = setInterval(function() {
                if (!this.show) {
                    return;
                }
                lmsCommand('', ['material-skin', 'plugins-status']).then(({data}) => {
                    if (!data || !data.result) {
                        return;
                    }
                    let dl = 1 == parseInt(data.result.downloading);
                    if (dl != this.downloading) {
                        if (!dl && this.downloading) {
                            // Download finished: active install becomes pending restart
                            if (this.activeInstallName) {
                                this.markInstallPending(this.activeInstallName);
                                this.setCatalogInstallState(this.activeInstallName, 'pending');
                                this.activeInstallName = '';
                            }
                            this.fetchPlugins();
                            this.fetchCatalog();
                            this.fetchUpdates();
                        }
                        this.downloading = dl;
                    }
                    if (dl && this.activeInstallName) {
                        this.setCatalogInstallState(this.activeInstallName, 'downloading');
                    }
                    let nr = 1 == parseInt(data.result.needs_restart);
                    if (nr != this.needsRestart) {
                        this.needsRestart = nr;
                    }
                    if (!nr) {
                        // Restart cleared pending install markers
                        this.pendingInstallNames = {};
                    }
                    this.$store.commit('setRestartRequired', nr);
                });
            }.bind(this), 2000);
        },
        setCatalogInstallState(name, state) {
            if (!name) {
                return;
            }
            for (let i = 0, len = this.catalogSections.length; i < len; ++i) {
                let items = this.catalogSections[i].items || [];
                for (let p = 0, plen = items.length; p < plen; ++p) {
                    if (items[p].name === name) {
                        this.$set(items[p], 'installState', state || '');
                        this.$set(items[p], 'busy', state === 'downloading' || state === 'installing');
                    }
                }
            }
        },
        stopStatusPoll() {
            if (this.statusTimer) {
                clearInterval(this.statusTimer);
                this.statusTimer = undefined;
            }
        },
        setEnabled(plug, enabled) {
            if (plug.busy || plug.enabled == enabled) {
                return;
            }
            plug.busy = true;
            let prev = plug.enabled;
            plug.enabled = enabled;
            lmsCommand('', ['material-skin', 'plugin-enabled', 'name:' + plug.name, 'enabled:' + (enabled ? 1 : 0)]).then(({data}) => {
                plug.busy = false;
                if (!data || !data.result) {
                    plug.enabled = prev;
                    return;
                }
                plug.pending = true;
                this.needsRestart = 1 == parseInt(data.result.needs_restart);
                this.$store.commit('setRestartRequired', this.needsRestart);
            }).catch(err => {
                plug.busy = false;
                plug.enabled = prev;
                logError(err);
                bus.$emit('showError', err);
            });
        },
        restartServer() {
            lmsCommand('', ['restartserver']).then(() => {
                this.close();
                bus.$emit('showMessage', i18n('Server is being restarted.'));
                setTimeout(function() { location.reload(); }, 2500);
            }).catch(() => {
                this.close();
                bus.$emit('showMessage', i18n('Server is being restarted.'));
            });
        },
        updateAll() {
            if (this.updating || this.updates.length < 1) {
                return;
            }
            let payload = [];
            for (let i = 0, len = this.updates.length; i < len; ++i) {
                payload.push({name: this.updates[i].name, url: this.updates[i].url, sha: this.updates[i].sha});
            }
            this.updating = true;
            lmsCommand('', ['material-skin', 'plugins-update', 'plugins:' + JSON.stringify(payload)]).then(({data}) => {
                this.updating = false;
                if (data && data.result && parseInt(data.result.updating) > 0) {
                    bus.$emit('showMessage', i18n('Updating plugins.'));
                    this.downloading = true;
                    for (let i = 0, len = this.updates.length; i < len; ++i) {
                        if (this.updates[i] && this.updates[i].name) {
                            this.markInstallPending(this.updates[i].name);
                        }
                    }
                }
            }).catch(err => {
                this.updating = false;
                logError(err);
            });
        },
        pluginInfo(plug) {
            if (!plug) {
                return;
            }
            // Build a plain info payload so the dialog always has something to show
            // (catalog/installed shapes differ; empty descr still shows title/version).
            let info = {
                title: plug.title || plug.name || '',
                descr: plug.descr || plug.desc || pluginDescrPlain(plug) || '',
                version: plug.version || '',
                creator: plug.creator || '',
                email: plug.email || '',
                homepage: plug.homepage || '',
                url: plug.url || '',
                changes: plug.changes || ''
            };
            bus.$emit('dlg.open', 'iteminfo', info);
        },
        updateLayout() {
            this.wideLayout = (window.innerWidth || 0) >= PLUGIN_WIDE_MIN;
        },
        jumpToPluginSection(nav) {
            if (!nav) {
                return;
            }
            this.sidebarActiveId = nav.id;
            if (nav.showMode && nav.showMode !== this.showMode) {
                this.setShowMode(nav.showMode);
            }
            this.$nextTick(function() {
                let page = document.getElementById('manage-plugins-page');
                let el = nav.anchor ? document.getElementById(nav.anchor) : null;
                // Fallback: scroll list top when anchor is a generic installed section
                if (!el && page && (nav.id === 'installed' || nav.anchor === 'mp-sec-all')) {
                    if (typeof page.scrollTo === 'function') {
                        page.scrollTo({ top: 0, behavior: 'smooth' });
                    } else {
                        page.scrollTop = 0;
                    }
                    return;
                }
                if (el && page) {
                    let top = el.offsetTop - 8;
                    if (typeof page.scrollTo === 'function') {
                        page.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
                    } else {
                        page.scrollTop = Math.max(0, top);
                    }
                } else if (el && el.scrollIntoView) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }.bind(this));
        },
        pluginNameByAuthor(plug) {
            return pluginNameByAuthor(plug);
        },
        pluginDescrPlain(plug) {
            return pluginDescrPlain(plug);
        },
        rowMetaLine(plug) {
            if (!plug) {
                return '';
            }
            let parts = [];
            if (this.showVersion && plug.version) {
                parts.push(i18n('Version') + ' ' + plug.version);
            }
            let installs = pluginInstalls(plug);
            if (installs > 0 && this.showMode == 'available') {
                parts.push(String(installs));
            }
            return parts.join(' · ');
        },
        setShowDescription(val) {
            this.showDescription = !!val;
            setLocalStorageVal('pluginShowDescription', this.showDescription);
        },
        toggleShowDescription() {
            this.setShowDescription(!this.showDescription);
        },
        setShowVersion(val) {
            this.showVersion = !!val;
            setLocalStorageVal('pluginShowVersion', this.showVersion);
        },
        toggleShowVersion() {
            this.setShowVersion(!this.showVersion);
        },
        openPluginSettings(plug) {
            if (!plug || !plug.settings) {
                return;
            }
            let path = plug.settings;
            if (path.indexOf('/material/') !== 0 && path.indexOf('material/') !== 0) {
                if (path.charAt(0) === '/') {
                    path = '/material' + path;
                } else {
                    path = '/material/' + path;
                }
            } else if (path.indexOf('material/') === 0) {
                path = '/' + path;
            }
            // Mobile: open plugin settings as a bottom drawer sheet (not a floating menu / full jump only)
            if (this._isMobileChrome()) {
                this.openPluginSettingsDrawer(plug, path);
                return;
            }
            openServerSettings(this.serverName, 0, path);
        },
        openPluginSettingsDrawer(plug, path) {
            this.closePluginSettingsDrawer();
            var self = this;
            var scrim = document.createElement('div');
            scrim.className = 'manage-plugins-settings-drawer-scrim';
            scrim.style.cssText = 'position:fixed;inset:0;z-index:10060;background:rgba(0,0,0,0.5);';
            var panel = document.createElement('div');
            panel.className = 'manage-plugins-settings-drawer noselect';
            var isLight = false;
            try {
                isLight = !!(document.body && document.body.classList.contains('theme--light'));
            } catch (e) {}
            panel.className += isLight ? ' theme--light' : ' theme--dark';
            panel.setAttribute('role', 'dialog');
            panel.setAttribute('aria-label', (plug && plug.title) ? plug.title : i18n('Settings'));
            panel.innerHTML =
                '<div class="manage-plugins-settings-drawer-head">' +
                '<div class="manage-plugins-drawer-handle" aria-hidden="true"></div>' +
                '<div class="manage-plugins-settings-drawer-title-row">' +
                '<span class="manage-plugins-settings-drawer-title ellipsis"></span>' +
                '<button type="button" class="manage-plugins-settings-drawer-close" aria-label="' +
                (typeof i18n==='function' ? i18n('Close') : 'Close') + '">' +
                '<i class="material-icons">close</i></button></div></div>' +
                '<div class="manage-plugins-settings-drawer-body">' +
                '<iframe class="manage-plugins-settings-drawer-iframe" frameborder="0" title="settings"></iframe>' +
                '</div>';
            var titleEl = panel.querySelector('.manage-plugins-settings-drawer-title');
            if (titleEl) {
                titleEl.textContent = (plug && (plug.title || plug.name)) ? (plug.title || plug.name) : i18n('Settings');
            }
            var iframe = panel.querySelector('iframe');
            if (iframe) {
                iframe.src = path;
            }
            var close = function() { self.closePluginSettingsDrawer(); };
            scrim.addEventListener('click', close);
            var closeBtn = panel.querySelector('.manage-plugins-settings-drawer-close');
            if (closeBtn) {
                closeBtn.addEventListener('click', close);
            }
            document.body.appendChild(scrim);
            document.body.appendChild(panel);
            this._pluginSettingsScrim = scrim;
            this._pluginSettingsDrawer = panel;
            // Animate in next frame
            requestAnimationFrame(function() {
                scrim.classList.add('open');
                panel.classList.add('open');
            });
        },
        closePluginSettingsDrawer() {
            var scrim = this._pluginSettingsScrim;
            var panel = this._pluginSettingsDrawer;
            this._pluginSettingsScrim = null;
            this._pluginSettingsDrawer = null;
            if (panel) {
                panel.classList.remove('open');
            }
            if (scrim) {
                scrim.classList.remove('open');
            }
            setTimeout(function() {
                if (panel && panel.parentNode) { panel.parentNode.removeChild(panel); }
                if (scrim && scrim.parentNode) { scrim.parentNode.removeChild(scrim); }
            }, 280);
        },
        openClassicManager() {
            this.showMenu = false;
            this.close();
            openServerSettings(this.serverName, 0, '/material/plugins/Extensions/settings/basic.html');
        },
        openServerPrefs() {
            this.showMenu = false;
            this.close();
            openServerSettings(this.serverName, 0);
        },
        loadSettingsSectionsCache() {
            // Prefer live cache helper from iframe-dialog when available
            let groups = [];
            if (typeof iframeLoadCachedServerSettingsNav === 'function') {
                groups = iframeLoadCachedServerSettingsNav() || [];
            } else {
                try {
                    let raw = getLocalStorageVal('msk.serverSettingsNav', '');
                    if (raw) {
                        let data = JSON.parse(raw);
                        groups = data && data.groups ? data.groups : [];
                    }
                } catch (e) {
                    groups = [];
                }
            }
            this.settingsSectionGroups = this.ensurePluginsInSections(groups);
            // First open / empty cache: scrape choose_setting from server settings HTML once
            if (this.settingsSectionGroups.length<=1) {
                this.bootstrapSettingsSections();
            }
        },
        ensurePluginsInSections(groups) {
            groups = groups ? groups.slice() : [];
            let hasPlugins = false;
            for (let g=0; g<groups.length && !hasPlugins; ++g) {
                let items = groups[g].items || [];
                for (let i=0; i<items.length; ++i) {
                    if (items[i].value=='SETUP_PLUGINS') {
                        hasPlugins = true;
                        break;
                    }
                }
            }
            if (!hasPlugins) {
                groups.push({
                    label: '',
                    items: [{ value: 'SETUP_PLUGINS', text: i18n('Plugins') }]
                });
            }
            return groups;
        },
        bootstrapSettingsSections() {
            if (this._settingsSectionsBootstrapping) {
                return;
            }
            this._settingsSectionsBootstrapping = true;
            // Defer network+DOMParser so dialog paint/filter menus stay responsive on open
            setTimeout(function() {
                axios.get('/material/settings/server/basic.html', { timeout: 12000 }).then(function(resp) {
                    this._settingsSectionsBootstrapping = false;
                    if (!this.show) {
                        return;
                    }
                    let html = resp && resp.data ? String(resp.data) : '';
                    if (!html || html.length > 2500000) {
                        return;
                    }
                    let groups = this.parseChooseSettingHtml(html);
                    if (groups.length>0) {
                        this.settingsSectionGroups = this.ensurePluginsInSections(groups);
                        try {
                            setLocalStorageVal('msk.serverSettingsNav', JSON.stringify({ groups: this.settingsSectionGroups, ts: Date.now() }));
                        } catch (e) {}
                    }
                }.bind(this)).catch(function() {
                    this._settingsSectionsBootstrapping = false;
                }.bind(this));
            }.bind(this), 300);
        },
        parseChooseSettingHtml(html) {
            let groups = [];
            try {
                let doc = new DOMParser().parseFromString(html, 'text/html');
                let sel = doc.getElementById('choose_setting') || doc.querySelector('select[name="choose_setting"]');
                if (!sel || !sel.options) {
                    return groups;
                }
                if (typeof iframeParseSettingsSections === 'function') {
                    return iframeParseSettingsSections(sel);
                }
                let current = { label: '', items: [] };
                for (let i=0, len=sel.options.length; i<len; ++i) {
                    let opt = sel.options[i];
                    let parent = opt.parentNode;
                    let groupLabel = (parent && parent.tagName && 'OPTGROUP'==parent.tagName.toUpperCase()) ? (parent.label || '') : '';
                    if (groupLabel != current.label && (current.items.length>0 || current.label)) {
                        groups.push(current);
                        current = { label: groupLabel, items: [] };
                    } else if (0==current.items.length) {
                        current.label = groupLabel;
                    }
                    if (!opt.value) {
                        continue;
                    }
                    current.items.push({ value: opt.value, text: (opt.text || opt.value).trim() });
                }
                if (current.items.length>0) {
                    groups.push(current);
                }
            } catch (e) {}
            return groups;
        },
        selectSettingsSection(value) {
            this.settingsNavMenu = false;
            if (!value || value=='SETUP_PLUGINS') {
                return;
            }
            // Leave native plugin manager and open/navigate server settings.
            // Always use openServerSettings as the reliable path: it closes the PM
            // shell (main.dialogs.manageplugins) and ensures the iframe is mounted
            // with the requested section. The old hybrid path (requestSettingsSection
            // only) silently no-op'd when auto-save was stuck or the selector was stale.
            let serverName = this.serverName;
            let section = value;
            this.settingsActive = value;
            this.closeAllMenus();
            this.stopStatusPoll();
            this.cancelSettingsTimer();
            this.show = false;
            this.$nextTick(function() {
                if (typeof openServerSettings === 'function') {
                    openServerSettings(serverName, 0, undefined, section);
                } else {
                    setTimeout(function() {
                        if (typeof openServerSettings === 'function') {
                            openServerSettings(serverName, 0, undefined, section);
                        }
                    }, 50);
                }
            });
        },
        closeAllMenus() {
            this.showMenu = false;
            this.settingsNavMenu = false;
            this.closeChromeMenus(true);
            // Detach any orphaned Vuetify menu overlays (toolbar ⋮ still uses v-menu)
            this.$nextTick(function() {
                this.showMenu = false;
                this.settingsNavMenu = false;
                try {
                    let overlays = document.querySelectorAll('.v-menu__content.menuable__content__active');
                    for (let i=0; i<overlays.length; ++i) {
                        if (overlays[i].offsetParent === null || overlays[i].clientHeight < 1) {
                            overlays[i].classList.remove('menuable__content__active');
                            overlays[i].style.display = 'none';
                        }
                    }
                } catch (e) {}
            }.bind(this));
        },
        /* Body-level Show/Display/Sort menus.
         * Must NOT use Vue reactive flags: flipping showDisplayMenu re-renders the
         * entire plugin catalog and freezes the UI. Build a single DOM popover on body. */
        _chromeEsc(s) {
            return String(s == null ? '' : s)
                .replace(/&/g, '&amp;').replace(/</g, '&lt;')
                .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        },
        _chromeIcon(name) {
            // No inline opacity/color — CSS sets high-contrast unselected/selected states
            return '<i class="material-icons" aria-hidden="true">' + this._chromeEsc(name) + '</i>';
        },
        _chromeItem(opts) {
            // opts: {action, arg, on, icon, label}
            var cls = 'manage-plugins-popover-item' + (opts.on ? ' on' : '');
            var arg = opts.arg != null ? ' data-arg="' + this._chromeEsc(opts.arg) + '"' : '';
            return '<button type="button" class="' + cls + '" data-action="' + this._chromeEsc(opts.action) + '"' + arg + '>' +
                this._chromeIcon(opts.icon) +
                '<span class="ellipsis">' + this._chromeEsc(opts.label) + '</span></button>';
        },
        ensureChromePopover() {
            if (this._chromePopoverEl && this._chromePopoverEl.parentNode) {
                return this._chromePopoverEl;
            }
            var el = document.createElement('div');
            // Theme class on the node itself (popover lives on <body>, outside dialog)
            var isLight = false;
            try {
                isLight = !!(document.body && document.body.classList && document.body.classList.contains('theme--light'))
                    || !!(document.documentElement && document.documentElement.classList && document.documentElement.classList.contains('theme--light'))
                    || !!(document.querySelector && document.querySelector('.application.theme--light, .v-application.theme--light'));
            } catch (e) {}
            el.className = 'manage-plugins-popover noselect ' + (isLight ? 'theme--light' : 'theme--dark');
            el.setAttribute('role', 'menu');
            el.style.cssText = 'position:fixed;z-index:10050;display:none;';
            el.addEventListener('click', function(e) { e.stopPropagation(); });
            var self = this;
            el.addEventListener('click', function(e) {
                var btn = e.target && e.target.closest ? e.target.closest('[data-action]') : null;
                if (!btn || !el.contains(btn)) {
                    return;
                }
                e.preventDefault();
                e.stopPropagation();
                var action = btn.getAttribute('data-action');
                var arg = btn.getAttribute('data-arg');
                if (action === 'showMode') {
                    self.setShowMode(arg, true);
                } else if (action === 'sortMode') {
                    self.setSortMode(arg, true, true);
                } else if (action === 'toggleDescription') {
                    self.toggleShowDescription();
                    self._fillChromePopover('options');
                } else if (action === 'toggleVersion') {
                    self.toggleShowVersion();
                    self._fillChromePopover('options');
                } else if (action === 'toggleUnsupported') {
                    self.toggleShowUnsupported();
                    self._fillChromePopover('options');
                } else if (action === 'toggleGroupByRepo') {
                    self.toggleGroupByRepo();
                    self._fillChromePopover('options');
                }
            });
            document.body.appendChild(el);
            this._chromePopoverEl = el;
            return el;
        },
        _fillChromePopover(/* which */) {
            var el = this.ensureChromePopover();
            // Refresh theme class each open (body-level node is outside the dialog tree)
            try {
                var isLight = !!(document.querySelector && document.querySelector('.application.theme--light, .v-application.theme--light, body.theme--light, .theme--light'));
                el.classList.toggle('theme--light', !!isLight);
                el.classList.toggle('theme--dark', !isLight);
            } catch (e) {}
            var html = '';
            // Status filters (secondary — main views are header tabs)
            html += '<div class="manage-plugins-popover-head">' + this._chromeEsc(i18n('Status')) + '</div>';
            var statusModes = [
                {key: 'enabled', label: i18n('Enabled')},
                {key: 'disabled', label: i18n('Disabled')}
            ];
            for (var i = 0; i < statusModes.length; ++i) {
                var m = statusModes[i];
                var on = this.showMode === m.key;
                html += this._chromeItem({
                    action: 'showMode', arg: m.key, on: on,
                    icon: on ? 'radio_button_checked' : 'radio_button_unchecked',
                    label: m.label
                });
            }
            html += '<div class="manage-plugins-popover-sep"></div>';
            html += '<div class="manage-plugins-popover-head">' + this._chromeEsc(i18n('Display')) + '</div>';
            html += this._chromeItem({
                action: 'toggleDescription', on: !!this.showDescription,
                icon: this.showDescription ? 'check_box' : 'check_box_outline_blank',
                label: i18n('Description')
            });
            html += this._chromeItem({
                action: 'toggleVersion', on: !!this.showVersion,
                icon: this.showVersion ? 'check_box' : 'check_box_outline_blank',
                label: i18n('Version')
            });
            html += this._chromeItem({
                action: 'toggleUnsupported', on: !!this.showUnsupported,
                icon: this.showUnsupported ? 'check_box' : 'check_box_outline_blank',
                label: i18n('Show unsupported')
            });
            html += this._chromeItem({
                action: 'toggleGroupByRepo', on: !!this.groupByRepo,
                icon: this.groupByRepo ? 'check_box' : 'check_box_outline_blank',
                label: i18n('Show by repository')
            });
            html += '<div class="manage-plugins-popover-sep"></div>';
            html += '<div class="manage-plugins-popover-head">' + this._chromeEsc(i18n('Sort by')) + '</div>';
            var sorts = [
                {key: 'category', label: i18n('Category')},
                {key: 'name', label: i18n('Name')},
                {key: 'popularity', label: i18n('Popularity')},
                {key: 'status', label: i18n('Status')},
                {key: 'creator', label: i18n('Author')}
            ];
            for (var j = 0; j < sorts.length; ++j) {
                var s = sorts[j];
                var son = this.sortMode === s.key;
                html += this._chromeItem({
                    action: 'sortMode', arg: s.key, on: son,
                    icon: son ? 'radio_button_checked' : 'radio_button_unchecked',
                    label: s.label
                });
            }
            el.innerHTML = html;
            return el;
        },
        _isMobileChrome() {
            try {
                if (this.$store && this.$store.state && this.$store.state.desktopLayout === false) {
                    return true;
                }
            } catch (e) {}
            return !!(typeof IS_MOBILE !== 'undefined' && IS_MOBILE) ||
                (window.innerWidth || 0) < 700;
        },
        _ensureChromeScrim() {
            if (this._chromeScrimEl && this._chromeScrimEl.parentNode) {
                return this._chromeScrimEl;
            }
            var scrim = document.createElement('div');
            scrim.className = 'manage-plugins-drawer-scrim';
            scrim.style.cssText = 'position:fixed;inset:0;z-index:10040;display:none;background:rgba(0,0,0,0.45);';
            var self = this;
            scrim.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                self.closeChromeMenus(true);
            });
            document.body.appendChild(scrim);
            this._chromeScrimEl = scrim;
            return scrim;
        },
        _positionChromePopover(/* which */) {
            var el = this.ensureChromePopover();
            var mobile = this._isMobileChrome();
            el.classList.toggle('manage-plugins-popover-drawer', mobile);
            el.classList.toggle('manage-plugins-popover-menu', !mobile);

            if (mobile) {
                // Bottom sheet / contextual drawer
                var scrim = this._ensureChromeScrim();
                scrim.style.display = 'block';
                el.style.cssText = 'position:fixed;z-index:10050;display:block;' +
                    'left:0;right:0;bottom:0;top:auto;width:100%;max-width:100%;' +
                    'min-width:0;max-height:78vh;overflow:auto;' +
                    'border-radius:16px 16px 0 0;visibility:visible;';
                // Prepend a drag handle if missing
                if (!el.querySelector('.manage-plugins-drawer-handle')) {
                    var handle = document.createElement('div');
                    handle.className = 'manage-plugins-drawer-handle';
                    handle.setAttribute('aria-hidden', 'true');
                    el.insertBefore(handle, el.firstChild);
                }
                return;
            }

            // Desktop: anchored popover
            if (this._chromeScrimEl) {
                this._chromeScrimEl.style.display = 'none';
            }
            var btn = this.$refs.optionsMenuBtn;
            if (btn && btn.$el) {
                btn = btn.$el;
            }
            var pad = 8;
            var menuW = 260;
            var vw = window.innerWidth || 800;
            var vh = window.innerHeight || 600;
            var top = 64;
            var left = vw - menuW - pad;
            if (btn && btn.getBoundingClientRect) {
                var r = btn.getBoundingClientRect();
                top = Math.round(r.bottom + 4);
                left = Math.round(r.right - menuW);
            }
            el.style.visibility = 'hidden';
            el.style.display = 'block';
            el.style.position = 'fixed';
            el.style.bottom = 'auto';
            el.style.right = 'auto';
            el.style.maxHeight = '';
            el.style.borderRadius = '';
            el.style.width = '';
            el.style.overflow = '';
            var mh = el.offsetHeight || 280;
            left = Math.max(pad, Math.min(left, vw - menuW - pad));
            if (top + mh + pad > vh) {
                top = Math.max(pad, vh - mh - pad);
            }
            el.style.top = top + 'px';
            el.style.left = left + 'px';
            el.style.minWidth = menuW + 'px';
            el.style.visibility = 'visible';
        },
        _syncChromeBtnActive() {
            var btn = this.$refs.optionsMenuBtn;
            if (btn && btn.$el) { btn = btn.$el; }
            if (!btn || !btn.classList) { return; }
            if (this._chromeMenuWhich) {
                btn.classList.add('manage-plugins-action-active');
                this.chromeMenuOpen = true;
            } else {
                btn.classList.remove('manage-plugins-action-active');
                this.chromeMenuOpen = false;
            }
        },
        _bindChromeOutside() {
            if (this._chromeOutsideBound) {
                return;
            }
            this._chromeOutsideBound = true;
            var self = this;
            this._onChromeOutside = function(ev) {
                if (self._chromeMenuIgnoreOutside) {
                    return;
                }
                if (!self._chromeMenuWhich) {
                    return;
                }
                var pop = self._chromePopoverEl;
                if (pop && pop.contains && pop.contains(ev.target)) {
                    return;
                }
                var b = self.$refs.optionsMenuBtn;
                if (b && b.$el) { b = b.$el; }
                if (b && b.contains && b.contains(ev.target)) {
                    return;
                }
                self.closeChromeMenus(true);
            };
            document.addEventListener('mousedown', this._onChromeOutside, true);
            document.addEventListener('touchstart', this._onChromeOutside, true);
        },
        _unbindChromeOutside() {
            if (!this._chromeOutsideBound) {
                return;
            }
            this._chromeOutsideBound = false;
            if (this._onChromeOutside) {
                document.removeEventListener('mousedown', this._onChromeOutside, true);
                document.removeEventListener('touchstart', this._onChromeOutside, true);
                this._onChromeOutside = null;
            }
        },
        destroyChromePopover() {
            this._unbindChromeOutside();
            this._chromeMenuWhich = null;
            var el = this._chromePopoverEl;
            this._chromePopoverEl = null;
            if (el && el.parentNode) {
                el.parentNode.removeChild(el);
            }
            var scrim = this._chromeScrimEl;
            this._chromeScrimEl = null;
            if (scrim && scrim.parentNode) {
                scrim.parentNode.removeChild(scrim);
            }
        },
        closeChromeMenus(/* force unused — kept for call sites */) {
            if (this._chromePopoverEl) {
                this._chromePopoverEl.style.display = 'none';
                this._chromePopoverEl.innerHTML = '';
                this._chromePopoverEl.classList.remove('manage-plugins-popover-drawer');
            }
            if (this._chromeScrimEl) {
                this._chromeScrimEl.style.display = 'none';
            }
            this._chromeMenuWhich = null;
            this.chromeMenuOpen = false;
            this._syncChromeBtnActive();
        },
        toggleChromeMenu(which) {
            which = which || 'options';
            if (this._chromeMenuWhich === which) {
                this.closeChromeMenus(true);
                return;
            }
            // Pure DOM open — no Vue reactive menu flags.
            this._chromeMenuWhich = which;
            this._fillChromePopover(which);
            this._positionChromePopover(which);
            this._syncChromeBtnActive();
            this._bindChromeOutside();
            this._chromeMenuIgnoreOutside = true;
            var self = this;
            setTimeout(function() { self._chromeMenuIgnoreOutside = false; }, 120);
        },
        isMainTabOn(key) {
            if (key === 'settings') {
                return this.showMode === 'settings';
            }
            // enabled/disabled still highlight Installed tab as the parent view
            if (key === 'installed') {
                return this.showMode === 'installed' || this.showMode === 'enabled' || this.showMode === 'disabled';
            }
            return this.showMode === key;
        },
        selectMainTab(key) {
            if (key === 'settings') {
                this.setShowMode('settings');
                this.$nextTick(function() {
                    let page = document.getElementById('manage-plugins-page');
                    let el = document.getElementById('mp-sec-settings');
                    if (el && page) {
                        let top = el.offsetTop - 8;
                        if (typeof page.scrollTo === 'function') {
                            page.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
                        } else {
                            page.scrollTop = Math.max(0, top);
                        }
                    } else if (el && el.scrollIntoView) {
                        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                }.bind(this));
                return;
            }
            this.setShowMode(key);
        },
        setShowMode(key, keepMenu) {
            // Map legacy filter key "all" stays; "installed" = installed only (no catalog)
            var next = key || 'all';
            if (next === 'pluginFilter') { next = 'all'; }
            this.showMode = next;
            setLocalStorageVal('pluginShowMode', this.showMode);
            setLocalStorageVal('pluginFilter', this.showMode); // legacy key
            if (!keepMenu) {
                this.closeChromeMenus(true);
            } else {
                this._fillChromePopover('options');
            }
        },
        normalizeSortMode(key) {
            // Removed: version, settings (preference), manual/custom order
            let allowed = {category:1, name:1, popularity:1, status:1, creator:1};
            return allowed[key] ? key : 'category';
        },
        setSortMode(key, keepDesc, keepMenu) {
            let next = this.normalizeSortMode(key || 'category');
            if (next !== this.sortMode) {
                this.sortMode = next;
                if (!keepDesc) {
                    this.sortDesc = false;
                }
            }
            setLocalStorageVal('pluginSortMode', this.sortMode);
            setLocalStorageVal('pluginSortDesc', this.sortDesc ? 'true' : 'false');
            if (!keepMenu) {
                this.closeChromeMenus(true);
            } else {
                this._fillChromePopover('options');
            }
        },
        cancelFilterTimer() {
            if (this._filterTimer) {
                clearTimeout(this._filterTimer);
                this._filterTimer = undefined;
            }
        },
        scheduleFilterQuery() {
            // Debounce list recompute so typing stays responsive with large catalogs.
            // 280ms + rAF: avoid locking the main thread mid-keystroke on big catalogs.
            this.cancelFilterTimer();
            let self = this;
            this._filterTimer = setTimeout(function() {
                self._filterTimer = undefined;
                let q = (self.search || '').trim().toLowerCase();
                if (q === self.filterQuery) {
                    return;
                }
                if (typeof requestAnimationFrame === 'function') {
                    requestAnimationFrame(function() {
                        if (q === (self.search || '').trim().toLowerCase()) {
                            self.filterQuery = q;
                        }
                    });
                } else {
                    self.filterQuery = q;
                }
            }, 280);
        },
        toggleSettingsNavMenu() {
            this.settingsNavMenu = !this.settingsNavMenu;
            if (this.settingsNavMenu) {
                this.closeChromeMenus(true);
            }
        },
        onSearchInputNative(ev) {
            let s = '';
            if (ev && ev.target && typeof ev.target.value === 'string') {
                s = ev.target.value;
            } else if (ev != null && typeof ev !== 'object') {
                s = String(ev);
            }
            this.search = s;
            this.scheduleFilterQuery();
        },
        clearSearch() {
            this.cancelFilterTimer();
            this.search = '';
            this.filterQuery = '';
            this.$nextTick(function() {
                let el = this.$refs.pluginSearchInput;
                if (el) {
                    el.value = '';
                    if (typeof el.focus === 'function') {
                        el.focus();
                    }
                }
            }.bind(this));
        },
        setShowUnsupported(val) {
            this.showUnsupported = !!val;
            setLocalStorageVal('pluginShowUnsupported', this.showUnsupported);
        },
        toggleShowUnsupported() {
            this.setShowUnsupported(!this.showUnsupported);
        },
        setGroupByRepo(val) {
            this.groupByRepo = !!val;
            setLocalStorageVal('pluginGroupByRepo', this.groupByRepo);
        },
        toggleGroupByRepo() {
            this.setGroupByRepo(!this.groupByRepo);
        },
        formatInstalls(plug) {
            let n = pluginInstalls(plug);
            return n > 0 ? String(n) : '';
        },
        pluginHoverTitle(plug) {
            return pluginDescrPlain(plug);
        },
        pluginIconUrl(plug) {
            if (!plug || plug.iconBroken) {
                return '';
            }
            return pluginIconSrc(plug.icon);
        },
        pluginIconIsMono(plug) {
            // Invert likely monochrome icons on dark UI (black SVG/PNG glyphs on transparent)
            let s = plug && plug.icon ? String(plug.icon).toLowerCase() : '';
            if (!s) {
                return false;
            }
            if (s.indexOf('http://') === 0 || s.indexOf('https://') === 0 || s.indexOf('data:') === 0) {
                return false;
            }
            return s.indexOf('.svg') >= 0
                || s.indexOf('html/images/') >= 0
                || /icon(_svg)?\.png$/.test(s)
                || /\/icon\.png$/.test(s);
        },
        onPluginIconError(ev, plug) {
            if (plug) {
                this.$set(plug, 'iconBroken', true);
            }
            if (ev && ev.target) {
                ev.target.style.display = 'none';
            }
        },
        sortPluginList(list) {
            let mode = this.normalizeSortMode(this.sortMode);
            if ('name' == mode) {
                list.sort(titleSort);
            } else if ('creator' == mode) {
                list.sort(function(a, b) {
                    let ac = (a.creator || '').toLowerCase();
                    let bc = (b.creator || '').toLowerCase();
                    if (ac !== bc) {
                        return ac < bc ? -1 : 1;
                    }
                    return titleSort(a, b);
                });
            } else if ('popularity' == mode) {
                list.sort(pluginPopularitySort);
            } else if ('status' == mode) {
                list.sort(function(a, b) {
                    if (a.enabled != b.enabled) {
                        return a.enabled ? -1 : 1;
                    }
                    return titleSort(a, b);
                });
            } else {
                // category (default)
                list.sort(function(a, b) {
                    let c = pluginCategorySort(a.category, b.category);
                    return 0 != c ? c : titleSort(a, b);
                });
            }
            if (this.sortDesc) {
                list.reverse();
            }
            return list;
        },
        matchesSearch(p, q) {
            return pluginMatchesQuery(p, q);
        },
        onPageKeydown(ev) {
            if (!this.show || !ev || ev.ctrlKey || ev.metaKey || ev.altKey) {
                return;
            }
            let t = ev.target;
            let tag = t && t.tagName ? t.tagName.toLowerCase() : '';
            if (tag === 'input' || tag === 'textarea' || (t && t.isContentEditable)) {
                return;
            }
            if (ev.key === 'Backspace') {
                if (this.search && this.search.length) {
                    this.search = this.search.slice(0, -1);
                    this.scheduleFilterQuery();
                    ev.preventDefault();
                }
                return;
            }
            if (ev.key === 'Escape' || ev.key === 'Tab' || ev.key === 'Enter' || !ev.key || ev.key.length !== 1) {
                return;
            }
            this.search = (this.search || '') + ev.key;
            this.scheduleFilterQuery();
            let el = this.$refs.pluginSearchInput;
            if (el && typeof el.focus === 'function') {
                el.focus();
            }
            ev.preventDefault();
        },
        close(fromParent) {
            this.closeAllMenus();
            this.destroyChromePopover();
            this.cancelFilterTimer();
            this.show = false;
            this.stopStatusPoll();
            this.cancelSettingsTimer();
            // Tell settings shell to hide the native panel (unless parent already did)
            if (this.embedded && !fromParent) {
                try { bus.$emit('iframe-native-plugins', false); } catch (e) {}
            }
            try {
                bus.$emit('manageplugins-closed');
            } catch (e) {}
        },
        mouseDown(ev) {
            toolbarMouseDown(ev);
        },
        i18n(str) {
            return this.show ? i18n(str) : str;
        },
        i18np(s, p, n) {
            return this.show ? i18np(s, p, n) : p;
        }
    },
    computed: {
        settingsActiveLabel() {
            if (this.settingsActive=='SETUP_PLUGINS') {
                return i18n('Plugins');
            }
            for (let g=0, groups=this.settingsSectionGroups, glen=groups.length; g<glen; ++g) {
                let items = groups[g].items || [];
                for (let i=0, len=items.length; i<len; ++i) {
                    if (items[i].value==this.settingsActive) {
                        return items[i].text;
                    }
                }
            }
            return i18n('Section');
        },
        darkUi() {
            return this.$store.state.darkUi;
        },
        /** Primary header tabs — not every LMS plugin category */
        mainTabs() {
            return [
                {key: 'all', label: i18n('All')},
                {key: 'installed', label: i18n('Installed')},
                {key: 'available', label: i18n('Available')},
                // "Paramètres" in FR via Plugin settings string
                {key: 'settings', label: i18n('Plugin settings')}
            ];
        },
        showModeItems() {
            return [
                {key: 'all', label: i18n('All')},
                {key: 'installed', label: i18n('Installed')},
                {key: 'enabled', label: i18n('Enabled')},
                {key: 'disabled', label: i18n('Disabled')},
                {key: 'updates', label: i18n('Updates')},
                {key: 'available', label: i18n('Available')},
                {key: 'settings', label: i18n('Plugin settings')}
            ];
        },
        showSectionSubHeader() {
            // Narrow only: section sheet for jumping into LMS server settings sections
            return !this.wideLayout && this.settingsSectionGroups && this.settingsSectionGroups.length > 0;
        },
        showModeLabel() {
            let items = this.showModeItems;
            for (let i = 0; i < items.length; ++i) {
                if (items[i].key === this.showMode) {
                    return items[i].label;
                }
            }
            return i18n('Show');
        },
        sortLabel() {
            let items = this.sortItems;
            for (let i = 0; i < items.length; ++i) {
                if (items[i].key === this.sortMode) {
                    return items[i].label;
                }
            }
            return i18n('Sort by');
        },
        showCatalog() {
            return 'available' == this.showMode || 'all' == this.showMode;
        },
        showCatalogOnly() {
            return 'available' == this.showMode;
        },
        showInstalledList() {
            // installed / all / enabled / disabled — not updates, available-only, or settings tab
            return 'updates' != this.showMode && 'available' != this.showMode && 'settings' != this.showMode;
        },
        showSettingsBlock() {
            // Always with other views (at bottom); alone when Settings tab selected
            return !this.hasSearchQuery;
        },
        unsupportedDisclaimer() {
            return i18n('WARNING - These are third-party plugins that are not guaranteed to work with the current version of Lyrion Music Server. They have been abandoned by their authors and are no longer maintained. In the worst case, they could prevent your Lyrion Music Server from working. Use at your own risk.');
        },
        visibleCatalogSections() {
            let q = this.searchQuery;
            let flat = [];
            for (let i = 0, len = this.catalogSections.length; i < len; ++i) {
                let section = this.catalogSections[i];
                let items = section.items || [];
                for (let p = 0, plen = items.length; p < plen; ++p) {
                    let plug = items[p];
                    if (!this.showUnsupported && plug.unsupported) {
                        continue;
                    }
                    if (!this.matchesSearch(plug, q)) {
                        continue;
                    }
                    flat.push(plug);
                }
            }
            this.sortPluginList(flat);
            if (!this.groupByRepo) {
                return flat.length ? [{repo: 'all', title: i18n('Available to install'), items: flat}] : [];
            }
            let map = {};
            let order = [];
            for (let i = 0, len = flat.length; i < len; ++i) {
                let plug = flat[i];
                let key = plug.repo || 'other';
                if (!map[key]) {
                    map[key] = {repo: key, title: plug.repoTitle || key, items: []};
                    order.push(key);
                }
                map[key].items.push(plug);
            }
            let sections = [];
            for (let i = 0, len = order.length; i < len; ++i) {
                sections.push(map[order[i]]);
            }
            return sections;
        },
        sortItems() {
            return [
                {key: 'category', label: i18n('Category')},
                {key: 'name', label: i18n('Name')},
                {key: 'popularity', label: i18n('Popularity')},
                {key: 'status', label: i18n('Status')},
                {key: 'creator', label: i18n('Author')}
            ];
        },
        sortArrow() {
            return this.sortDesc ? 'arrow_upward' : 'arrow_downward';
        },
        showUpdatesSection() {
            if ('available' == this.showMode || 'settings' == this.showMode) {
                return false;
            }
            // Dedicated updates mode always shows the block when any updates exist
            if ('updates' == this.showMode) {
                return this.updates.length > 0 || this.downloading;
            }
            if (this.downloading && this.updates.length > 0) {
                return true;
            }
            return this.visibleUpdates.length > 0;
        },
        visibleUpdates() {
            let q = this.searchQuery;
            let list = this.updates.slice();
            if (q.length > 0) {
                list = list.filter(function(p) {
                    return this.matchesSearch(p, q);
                }.bind(this));
            }
            return list;
        },
        hasSearchQuery() {
            return !!(this.filterQuery && this.filterQuery.length);
        },
        searchQuery() {
            // Prefer debounced filterQuery so list work is not on every keydown.
            return this.filterQuery || '';
        },
        filteredPlugins() {
            let q = this.searchQuery;
            let list = this.plugins.slice();
            let mode = this.showMode || 'all';
            if ('enabled' == mode) {
                list = list.filter(function(p) { return !!p.enabled; });
            } else if ('disabled' == mode) {
                list = list.filter(function(p) { return !p.enabled; });
            } else if ('updates' == mode) {
                // Updates live only in the dedicated block above
                list = [];
            } else if ('available' == mode || 'settings' == mode) {
                list = [];
            }
            // Keep update-available plugins out of the installed list (shown in updates block)
            // 'installed' = installed only (no catalog); 'all' = installed + catalog
            if ('all' == mode || 'installed' == mode || 'enabled' == mode || 'disabled' == mode) {
                list = list.filter(function(p) {
                    return !this.updateNames.has(p.name);
                }.bind(this));
            }
            if (q.length > 0) {
                list = list.filter(function(p) {
                    return this.matchesSearch(p, q);
                }.bind(this));
            }
            return list;
        },
        visiblePlugins() {
            let list = this.filteredPlugins.slice();
            this.sortPluginList(list);
            return list;
        },
        noSearchHits() {
            if (!this.hasSearchQuery) {
                return false;
            }
            if (this.visibleUpdates.length > 0) {
                return false;
            }
            if (this.showInstalledList && this.visiblePlugins.length > 0) {
                return false;
            }
            if (this.showCatalog) {
                let secs = this.visibleCatalogSections || [];
                for (let i = 0; i < secs.length; ++i) {
                    if (secs[i].items && secs[i].items.length) {
                        return false;
                    }
                }
            }
            return !this.loadingPlugins && !this.catalogLoading;
        },
        groupedSections() {
            let sections = [];
            let map = {};
            let list = this.visiblePlugins;
            if ('category' == this.normalizeSortMode(this.sortMode)) {
                for (let i = 0, len = list.length; i < len; ++i) {
                    let cat = list[i].category || 'misc';
                    if (!map[cat]) {
                        map[cat] = [];
                    }
                    map[cat].push(list[i]);
                }
                let cats = Object.keys(map).sort(pluginCategorySort);
                for (let i = 0, len = cats.length; i < len; ++i) {
                    sections.push({key: cats[i], label: pluginCategoryLabel(cats[i]), items: map[cats[i]]});
                }
            } else {
                sections.push({key: 'all', label: '', items: list});
            }
            return sections;
        }
    },
    watch: {
        show(val) {
            this.$store.commit('dialogOpen', {name: 'manageplugins', shown: val});
            if (!val) {
                this.cancelFilterTimer();
                this.closeChromeMenus(true);
                if (typeof this.closePluginSettingsDrawer === 'function') {
                    this.closePluginSettingsDrawer();
                }
            }
        }
    },
    beforeDestroy() {
        this.cancelFilterTimer();
        this.stopStatusPoll();
        this.cancelSettingsTimer();
        this.destroyChromePopover();
        if (typeof this.closePluginSettingsDrawer === 'function') {
            this.closePluginSettingsDrawer();
        }
        if (this._onResize) {
            window.removeEventListener('resize', this._onResize);
        }
    }
});

function openManagePlugins(serverName) {
    if (typeof openServerSettings == 'undefined') {
        setTimeout(function() { openManagePlugins(serverName); }, 50);
        return;
    }
    if (lmsOptions.nativeManagePlugins) {
        // Always host inside the server-settings shell so the Material
        // settings section rail (Paramètres / Plugins / …) is the sidebar.
        try {
            if (typeof iframeInfo !== 'undefined') {
                iframeInfo.pendingSettingsSection = 'SETUP_PLUGINS';
                iframeInfo.pendingNativePlugins = true;
            }
        } catch (e) {}
        openServerSettings(serverName, 0, undefined, 'SETUP_PLUGINS');
        // If settings shell is already open, activate the native panel now
        bus.$emit('iframe-native-plugins', true, serverName);
    } else {
        openServerSettings(serverName, 0, '/material/plugins/Extensions/settings/basic.html');
    }
}
