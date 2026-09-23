/**
 * LMS-Material — native Presets Editor (Squeezebox / player hardware preset keys)
 * Hierarchical source picker: categories (Favorites, Playlists, …) → items.
 * Replaces classic iframe Slim::Plugin::PresetsEditor UI.
 */
'use strict';

function _clampMode(v) {
    v = parseInt(v, 10);
    return (v === 1 || v === 2) ? v : 0;
}

Vue.component('lms-presets-editor', {
    template: `
<div>
 <v-dialog v-model="show" v-if="show" persistent no-click-animation scrollable fullscreen>
  <v-card class="presets-editor-card">
   <v-card-title class="settings-title">
    <v-toolbar app-data class="dialog-toolbar" id="presets-editor-toolbar">
     <v-btn flat icon @click="close" :title="ttShortcutStr(i18n('Go back'), 'esc')"><v-icon>{{BACK_ICON}}</v-icon></v-btn>
     <v-toolbar-title>{{title}}</v-toolbar-title>
     <v-spacer></v-spacer>
     <v-icon v-if="saveOk" class="settings-save-ok" :title="i18n('Saved')">check</v-icon>
    </v-toolbar>
   </v-card-title>
   <v-card-text class="presets-editor-body">
    <v-list two-line class="presets-editor-list">
     <div class="presets-editor-hint subtext">{{i18n('Assign playlists or streams to the numbered preset keys. Drag to reorder. Shuffle and repeat apply when that preset is played, including from a WiiM Home /preset/N shortcut.')}}</div>
     <div class="presets-editor-sortable msk-sortable-host" ref="presetsSortable" id="presets-editor-sortable">
      <div v-for="(item, index) in presets" :key="item._uid"
           class="presets-editor-sort-row" :data-msk-index="index">
       <v-list-tile class="presets-editor-row" :class="{'presets-editor-row--ph': slotsLoading}"
                    @click="onRowClick(item, index, $event)">
        <v-icon class="presets-editor-drag-handle" :title="i18n('Drag to reorder')">drag_indicator</v-icon>
        <!-- Slot number is the row position; it updates after drop, not during drag. -->
        <div class="presets-editor-pill" aria-hidden="true">{{index + 1}}</div>
        <v-list-tile-avatar v-if="!slotsLoading && item.icon" :tile="false" class="presets-editor-avatar">
         <img :src="item.icon" class="presets-editor-icon" onerror="this.style.display='none'" @dragstart.prevent="">
        </v-list-tile-avatar>
        <v-list-tile-avatar v-else :tile="false" class="presets-editor-avatar"
                            :class="{'presets-editor-avatar-empty': !slotsLoading, 'presets-editor-avatar-ph': slotsLoading}">
         <v-icon v-if="!slotsLoading" small>music_note</v-icon>
        </v-list-tile-avatar>
        <v-list-tile-content>
         <template v-if="slotsLoading">
          <div class="presets-editor-ph-bar"></div>
          <div class="presets-editor-ph-bar presets-editor-ph-bar--sub"></div>
         </template>
         <template v-else>
          <v-list-tile-title class="ellipsis">{{item.text ? displayTitle(item) : emptyLabel}}</v-list-tile-title>
          <v-list-tile-sub-title v-if="item.text" class="ellipsis subtext">{{itemSubtitleLine(item)}}</v-list-tile-sub-title>
          <v-list-tile-sub-title v-else class="ellipsis subtext">{{i18n('Empty')}}</v-list-tile-sub-title>
         </template>
        </v-list-tile-content>
        <v-list-tile-action class="presets-editor-actions" @click.stop>
         <v-btn icon flat small class="presets-editor-mode-btn"
                :class="{'presets-editor-mode-on': item.shuffle}"
                :title="shuffleTitle(item.shuffle)"
                @click.stop="cycleShuffle(index, $event)">
          <v-icon small>shuffle</v-icon>
         </v-btn>
         <v-btn icon flat small class="presets-editor-mode-btn"
                :class="{'presets-editor-mode-on': item.repeat}"
                :title="repeatTitle(item.repeat)"
                @click.stop="cycleRepeat(index, $event)">
          <v-icon small>{{item.repeat===1 ? 'repeat_one' : 'repeat'}}</v-icon>
         </v-btn>
         <v-btn icon flat small :title="i18n('Menu')" @click.stop="openRowMenu(item, index, $event)">
          <v-icon small>more_vert</v-icon>
         </v-btn>
        </v-list-tile-action>
       </v-list-tile>
      </div>
     </div>
    </v-list>
   </v-card-text>
  </v-card>
 </v-dialog>

 <!-- Row actions (phone): categories as submenus + link / clear -->
 <div v-if="menu.show && !desktopLayout" class="msk-context-scrim presets-editor-ctx-scrim" @click="ctxSheetClose()" @touchmove.prevent=""></div>
 <v-menu v-model="menu.show" :position-x="menu.x" :position-y="menu.y"
         absolute :close-on-content-click="false"
         :content-class="!desktopLayout ? 'msk-context-sheet presets-editor-menu-sheet' : 'presets-editor-menu'">
  <div class="msk-ctx-chrome" v-if="!desktopLayout && menu.show"
       @touchstart.passive="ctxSheetTouchStart"
       @pointerdown="ctxSheetTouchStart"
       @mousedown="ctxSheetTouchStart">
   <div class="msk-ctx-handle" aria-hidden="true"></div>
   <div class="msk-ctx-header" v-if="menu.item">
    <div class="msk-ctx-art">
     <img v-if="menuItemMeta.image" class="msk-ctx-cover" :src="menuItemMeta.image" onerror="this.style.display='none'"></img>
     <v-icon v-else>music_note</v-icon>
    </div>
    <div class="msk-ctx-meta">
     <div class="msk-ctx-title">{{menuItemMeta.title}}</div>
     <div class="msk-ctx-sub" v-for="(line, li) in menuItemMeta.lines" :key="'prctx'+li">{{line}}</div>
    </div>
   </div>
  </div>
  <!-- iOS-style dual panels: categories → items (lateral slide, sticky chrome/back) -->
  <div v-bind:class="{'msk-ctx-panels': !desktopLayout, 'msk-ctx-panels-info': !desktopLayout && !!menu.category, 'presets-menu-panels': true}">
   <!-- Level 0: sources / categories -->
   <div v-bind:class="{'msk-ctx-panel': !desktopLayout}"
        class="presets-menu-panel">
    <div v-bind:class="{'msk-ctx-body': !desktopLayout}"
         class="presets-menu-scroll"
         ref="presetsMenuRootScroll"
         @scroll.passive="ctxSheetOnBodyScroll"
         @touchstart.passive="ctxSheetBodyTouchStart"
         @touchmove="ctxSheetBodyTouchMove"
         @touchend="ctxSheetBodyTouchEnd"
         @touchcancel="ctxSheetBodyTouchEnd">
     <v-list v-if="menu.show" class="presets-editor-menu-list">
      <template v-for="(cat, cidx) in optionCategories">
       <v-divider v-if="showSoundSeparatorBefore(cat, cidx)" :key="'mcs-'+cidx" class="presets-menu-sound-sep"></v-divider>
       <v-list-tile role="menuitem" :key="'mc-'+cidx"
                    class="presets-submenu-row" @click.stop="openCategory(cat.label)">
        <v-list-tile-avatar><v-icon>{{categoryIcon(cat.label)}}</v-icon></v-list-tile-avatar>
        <v-list-tile-content>
         <v-list-tile-title>{{cat.label}}</v-list-tile-title>
        </v-list-tile-content>
        <v-list-tile-action class="presets-submenu-chevron" aria-hidden="true">
         <span class="presets-gt">›</span>
        </v-list-tile-action>
       </v-list-tile>
      </template>
      <v-list-tile v-if="optionsLoading" class="disabled">
       <v-list-tile-title class="subtext">{{i18n('Loading sources…')}}</v-list-tile-title>
      </v-list-tile>
      <v-divider v-if="optionCategories.length || optionsLoading"></v-divider>
      <v-list-tile role="menuitem" @click.stop="enterLink">
       <v-list-tile-avatar><v-icon>link</v-icon></v-list-tile-avatar>
       <v-list-tile-title>{{i18n('Enter link')}}</v-list-tile-title>
      </v-list-tile>
      <v-list-tile role="menuitem" @click.stop="copyWiimLink(menu.item && menu.item.preset)" v-if="isWiim">
       <v-list-tile-avatar><v-icon>content_copy</v-icon></v-list-tile-avatar>
       <v-list-tile-title>{{i18n('Copy direct link')}}</v-list-tile-title>
      </v-list-tile>
      <v-divider v-if="menu.item && menu.item.preset && (menu.item.preset.url || menu.item.preset.text)"></v-divider>
      <v-list-tile role="menuitem" @click.stop="clearPreset" v-if="menu.item && menu.item.preset && (menu.item.preset.url || menu.item.preset.text)">
       <v-list-tile-avatar><v-icon>clear</v-icon></v-list-tile-avatar>
       <v-list-tile-title>{{i18n('Clear')}}</v-list-tile-title>
      </v-list-tile>
     </v-list>
    </div>
   </div>
   <!-- Level 1: items (sticky back bar + scrollable list) -->
   <div v-bind:class="{'msk-ctx-panel': !desktopLayout}"
        class="presets-menu-panel presets-menu-panel-items">
    <div class="presets-menu-nav" v-if="menu.category">
     <v-btn icon flat small class="presets-menu-nav-back" @click.stop="menuCategoryBack" :title="i18n('Go back')">
      <v-icon>{{BACK_ICON}}</v-icon>
     </v-btn>
     <span class="presets-menu-nav-title ellipsis">{{menu.category}}</span>
    </div>
    <div v-bind:class="{'msk-ctx-body': !desktopLayout}"
         class="presets-menu-scroll"
         ref="presetsMenuItemsScroll"
         @scroll.passive="ctxSheetOnBodyScroll"
         @touchstart.passive="ctxSheetBodyTouchStart"
         @touchmove="ctxSheetBodyTouchMove"
         @touchend="ctxSheetBodyTouchEnd"
         @touchcancel="ctxSheetBodyTouchEnd">
     <v-list v-if="menu.show" class="presets-editor-menu-list">
      <v-list-tile role="menuitem" v-for="(opt, oidx) in menuCategoryItems" :key="'mi-'+oidx"
                   @click.stop="applyOption(opt)">
       <v-list-tile-avatar v-if="opt.icon" :tile="true">
        <img :src="opt.icon" class="presets-menu-item-art" onerror="this.style.display='none'" @dragstart.prevent="">
       </v-list-tile-avatar>
       <v-list-tile-avatar v-else><v-icon>music_note</v-icon></v-list-tile-avatar>
       <v-list-tile-content>
        <v-list-tile-title class="ellipsis">{{displayTitle(opt)}}</v-list-tile-title>
        <v-list-tile-sub-title v-if="displaySubtitle(opt)" class="ellipsis subtext presets-source-sub">{{displaySubtitle(opt)}}</v-list-tile-sub-title>
       </v-list-tile-content>
      </v-list-tile>
      <v-list-tile v-if="menu.category && !menuCategoryItems.length" class="disabled">
       <v-list-tile-title class="subtext">{{i18n('No items in this category')}}</v-list-tile-title>
      </v-list-tile>
     </v-list>
    </div>
   </div>
  </div>
 </v-menu>

 <!--
  Hierarchical picker (desktop / when not using the mobile sheet drill-down).
  Mounted to document.body so position:fixed is never trapped by dialog transforms.
 -->
 <div v-show="picker.show" ref="pickerRoot" class="presets-picker-root" role="presentation">
  <div class="presets-picker-scrim" @click="closePicker"></div>
  <div class="presets-picker-panel noselect"
       :class="[desktopLayout ? 'presets-picker-panel--dialog' : 'presets-picker-panel--sheet', darkUi ? 'presets-picker-panel--dark' : '']"
       role="dialog" :aria-label="pickerTitle">
   <div v-if="!desktopLayout" class="presets-picker-handle" aria-hidden="true"></div>
   <div class="presets-picker-head">
    <v-btn v-if="picker.category" icon flat small class="presets-picker-back"
           @click="pickerBack" :title="i18n('Go back')"><v-icon small>{{BACK_ICON}}</v-icon></v-btn>
    <span class="presets-picker-title ellipsis">{{pickerTitle}}</span>
    <v-btn icon flat small @click="closePicker" :title="i18n('Close')"><v-icon small>close</v-icon></v-btn>
   </div>
   <div class="presets-picker-list">
    <template v-if="!picker.category">
     <template v-for="(cat, cidx) in optionCategories">
      <div v-if="showSoundSeparatorBefore(cat, cidx)" :key="'pcs-'+cidx" class="presets-picker-sep" role="separator"></div>
      <button type="button" class="presets-picker-item presets-picker-item--cat"
              :key="'pc-'+cidx"
              @click="openCategory(cat.label)">
       <v-icon class="presets-picker-cat-icon">{{categoryIcon(cat.label)}}</v-icon>
       <span class="ellipsis presets-picker-item-text">
        <span class="presets-picker-item-title">{{cat.label}}</span>
       </span>
       <span class="presets-gt" aria-hidden="true">›</span>
      </button>
     </template>
     <div v-if="optionsLoading" class="presets-picker-empty">{{i18n('Loading sources…')}}</div>
     <div v-else-if="!optionCategories.length" class="presets-picker-empty">{{i18n('No sources found')}}</div>
    </template>
    <template v-else>
     <button type="button" class="presets-picker-item"
             v-for="(opt, oidx) in pickerItems" :key="'pi-'+oidx"
             @click="applyOption(opt)">
      <img v-if="opt.icon" class="presets-picker-icon" :src="opt.icon" onerror="this.style.display='none'" @dragstart.prevent="">
      <v-icon v-else small class="presets-picker-icon-fallback">music_note</v-icon>
      <span class="ellipsis presets-picker-item-text">
       <span class="presets-picker-item-title">{{displayTitle(opt)}}</span>
       <span v-if="displaySubtitle(opt)" class="presets-picker-item-sub presets-source-sub">{{displaySubtitle(opt)}}</span>
      </span>
     </button>
     <div v-if="!pickerItems.length" class="presets-picker-empty">{{i18n('No items in this category')}}</div>
    </template>
   </div>
   <div v-if="desktopLayout" class="presets-picker-footer">
    <v-spacer></v-spacer>
    <v-btn flat @click="closePicker">{{i18n('Cancel')}}</v-btn>
   </div>
  </div>
 </div>
</div>
`,
    data() {
        return {
            show: false,
            loading: false,
            slotsLoading: false,
            optionsLoading: false,
            playerId: '',
            playerName: '',
            presets: [],
            options: [],
            isWiim: false,
            saveOk: false,
            dirty: false,
            emptyLabel: '',
            menu: { show: false, x: 0, y: 0, item: null, index: -1, category: null },
            picker: { show: false, category: null },
            _saveTimer: undefined,
            _saveOkTimer: undefined,
            _pickerMounted: false,
            _presetsSortable: undefined
        };
    },
    computed: {
        title() {
            let t = this.i18n('Presets editor');
            return this.playerName ? (t + SEPARATOR + this.playerName) : t;
        },
        desktopLayout() {
            return this.$store.state.desktopLayout;
        },
        darkUi() {
            return this.$store.state.darkUi;
        },
        menuItemMeta() {
            return typeof contextMenuItemMeta==='function'
                ? contextMenuItemMeta(this.menu && this.menu.item)
                : { title: '', lines: [], image: undefined, icon: undefined, svg: undefined };
        },
        optionCategories() {
            let map = {};
            let order = [];
            for (let i = 0; i < this.options.length; i++) {
                let o = this.options[i];
                let cat = o.category || this.i18n('Other');
                if (!map[cat]) {
                    map[cat] = [];
                    order.push(cat);
                }
                map[cat].push(o);
            }
            order = this._sortCategoryLabels(order);
            return order.map(function(label) {
                return { label: label, items: map[label] };
            });
        },
        pickerTitle() {
            if (this.picker.category) {
                return this.picker.category;
            }
            return this.i18n('Select source');
        },
        pickerItems() {
            return this._itemsForCategory(this.picker.category);
        },
        menuCategoryItems() {
            return this._itemsForCategory(this.menu.category);
        }
    },
    mounted() {
        bus.$on('presetseditor.open', function(playerId, playerName) {
            this.open(playerId, playerName);
        }.bind(this));
        bus.$on('closeDialog', function(dlg) {
            if (dlg === 'presetseditor' && this.show) {
                this.close();
            }
        }.bind(this));
        bus.$on('esc', function() {
            if (this.picker.show) {
                if (this.picker.category) {
                    this.pickerBack();
                } else {
                    this.closePicker();
                }
                return;
            }
            if (this.menu.show) {
                if (this.menu.category) {
                    this.menuCategoryBack();
                } else {
                    this.closeRowMenu();
                }
                return;
            }
            if (this.show) {
                this.close();
            }
        }.bind(this));
        this.$nextTick(function() {
            this._ensurePickerOnBody();
        }.bind(this));
    },
    beforeDestroy() {
        this.destroyPresetsSortable();
        let el = this.$refs.pickerRoot;
        if (el && el.parentNode === document.body) {
            try { document.body.removeChild(el); } catch (e) {}
        }
    },
    methods: Object.assign({
        i18n(str, def) {
            if (typeof i18n === 'function') {
                let t = i18n(str);
                if (t === '' || t === undefined || t === null) {
                    return def || str;
                }
                return t;
            }
            return def || str;
        },
        i18np(s, p, n) {
            if (typeof i18np === 'function') {
                return i18np(s, p, n);
            }
            return n === 1 ? s : String(p).replace('%1', n);
        },
        _itemsForCategory(label) {
            if (!label) { return []; }
            let cats = this.optionCategories;
            for (let i = 0; i < cats.length; i++) {
                if (cats[i].label === label) {
                    // Already alpha-sorted in load(); keep stable order
                    return cats[i].items;
                }
            }
            return [];
        },
        /**
         * Preferred category order:
         * 1) Current playlist first
         * 2) Favorites / playlists / random mix (same group, before sound separator)
         * 3) Sound effects then other sound groups
         */
        _categoryRank(label) {
            let s = String(label || '').toLowerCase();
            if (/current|en cours|courante/.test(s)) { return 0; }
            if (/favor/.test(s)) { return 10; }
            if (/playlist|listes de lecture|^listes\b/.test(s) && !/en cours|courante/.test(s)) { return 20; }
            // Random mix with media sources (before sound separator)
            if (/random|al[eé]atoire|\bmix\b/.test(s)) { return 25; }
            if (/effet|sound effect/.test(s)) { return 40; }
            if (/alarm|alarme/.test(s)) { return 50; }
            if (/musical/.test(s)) { return 51; }
            if (/naturel|nature/.test(s)) { return 52; }
            if (/\bson|sound/.test(s)) { return 55; }
            return 30;
        },
        _sortCategoryLabels(labels) {
            let self = this;
            return (labels || []).slice().sort(function(a, b) {
                let ra = self._categoryRank(a);
                let rb = self._categoryRank(b);
                if (ra !== rb) { return ra - rb; }
                return String(a).localeCompare(String(b), undefined, { sensitivity: 'base' });
            });
        },
        isSoundCategory(label) {
            let s = String(label || '').toLowerCase();
            return /effet|sound effect|alarm|alarme|musical|naturel|nature|\bson|sound/.test(s);
        },
        showSoundSeparatorBefore(cat, cidx) {
            if (!cat || !this.isSoundCategory(cat.label)) { return false; }
            if (cidx <= 0) { return true; }
            let prev = this.optionCategories[cidx - 1];
            return !prev || !this.isSoundCategory(prev.label);
        },
        inferTypeFromUrl(url) {
            let u = String(url || '');
            let m = u.match(/^spotify:(album|artist|track|playlist|episode|show):/i)
                || u.match(/^spotify:\/\/(album|artist|track|playlist)\//i);
            if (m) { return m[1].toLowerCase(); }
            if (/^db:album\./i.test(u)) { return 'album'; }
            if (/^db:contributor\.|^db:artist\./i.test(u)) { return 'artist'; }
            return '';
        },
        /** Strip "Spotify : " prefix; set source tag for subtitle. */
        parseTitleSource(title, url, sourceHint) {
            let t = String(title || '');
            let source = sourceHint || '';
            let m = t.match(/^\s*spotify\s*:\s*(.*)$/i);
            if (m) {
                t = m[1] || t;
                source = source || 'spotify';
            }
            if (!source && url && /^spotify:/i.test(url)) {
                source = 'spotify';
            }
            if (!source && url && /^qobuz:/i.test(url)) {
                source = 'qobuz';
            }
            // Client-side split of "Title par Artist de Album" if server didn't
            let artist = '';
            let album = '';
            let pm = t.match(/^(.*?)\s+par\s+(.+?)\s+de\s+(.+)$/i)
                || t.match(/^(.*?)\s+by\s+(.+?)\s+from\s+(.+)$/i);
            if (pm) {
                t = pm[1]; artist = pm[2]; album = pm[3];
            } else {
                pm = t.match(/^(.*?)\s+par\s+(.+)$/i) || t.match(/^(.*?)\s+by\s+(.+)$/i);
                if (pm) { t = pm[1]; artist = pm[2]; }
            }
            t = t.replace(/^\s+|\s+$/g, '');
            return { title: t, source: source, artist: artist, album: album };
        },
        displayTitle(opt) {
            if (!opt) { return ''; }
            let raw = opt.title || opt.text || '';
            let parsed = this.parseTitleSource(raw, opt.url, opt.source);
            return parsed.title || raw;
        },
        displaySubtitle(opt) {
            if (!opt) { return ''; }
            let parts = [];
            let type = (opt.type || this.inferTypeFromUrl(opt.url || '') || '').toLowerCase();
            let artist = opt.artist || '';
            let album = opt.album || '';
            // Fallback parse from title if meta missing
            if ((!artist || !album) && (opt.title || opt.text)) {
                let p = this.parseTitleSource(opt.title || opt.text || '', opt.url || '', opt.source || '');
                if (!artist && p.artist) { artist = p.artist; }
                if (!album && p.album) { album = p.album; }
            }
            if (type === 'album') {
                if (artist) { parts.push(artist); }
            } else if (type === 'track' || type === 'audio') {
                if (artist) { parts.push(artist); }
                if (album) { parts.push(album); }
            } else if (type === 'artist') {
                // title is the artist name; no need to repeat
            } else if (type === 'playlist') {
                // playlists: only source line unless we have owner later
            } else {
                // Unknown type: show whatever meta we have
                if (artist) { parts.push(artist); }
                if (album) { parts.push(album); }
            }
            let src = opt.source || this.parseTitleSource(opt.title || opt.text || '', opt.url || '', '').source;
            if (src === 'spotify') {
                parts.push(this.i18n('on Spotify'));
            } else if (src === 'qobuz') {
                parts.push(this.i18n('on Qobuz'));
            }
            return parts.filter(Boolean).join(' · ');
        },
        itemSubtitleLine(item) {
            let meta = this.displaySubtitle(item);
            if (meta) { return meta; }
            return this.itemCategoryLabel(item) || '';
        },
        categoryIcon(label) {
            let s = String(label || '').toLowerCase();
            if (/current|en cours|courante/.test(s)) { return 'queue_music'; }
            if (/favor/.test(s)) { return 'favorite'; }
            if (/playlist|listes de lecture|listes/.test(s) && !/en cours/.test(s)) { return 'library_music'; }
            if (/random|al[eé]atoire|mix/.test(s)) { return 'shuffle'; }
            if (/sound|son|nature|alarm|effet|musical/.test(s)) { return 'graphic_eq'; }
            if (/radio/.test(s)) { return 'radio'; }
            if (/podcast/.test(s)) { return 'podcasts'; }
            return 'folder';
        },
        open(playerId, playerName) {
            this.playerId = playerId || (this.$store.state.player && this.$store.state.player.id) || '';
            this.playerName = playerName || (this.$store.state.player && this.$store.state.player.name) || '';
            this.emptyLabel = this.desktopLayout ? this.i18n('Click to assign') : this.i18n('Tap to assign');
            this.dirty = false;
            this.saveOk = false;
            this.closePicker();
            this.closeRowMenu();
            this.options = [];
            this.presets = this._emptyPresets();
            this.loading = false;
            this.slotsLoading = true;
            this.optionsLoading = true;
            this.show = true;
            this.loadSlots();
            this.loadOptions();
        },
        close() {
            this.flushSave(true);
            this.show = false;
            this.closePicker();
            this.closeRowMenu();
        },
        closeRowMenu() {
            if (this.menu) {
                this.menu.show = false;
                this.menu.category = null;
            }
            if (typeof this.ctxSheetResetStyles==='function') {
                this.ctxSheetResetStyles();
            }
        },
        menuCategoryBack() {
            // Lateral slide back — do not recreate the sheet
            if (this.menu) {
                this.$set(this.menu, 'category', null);
            }
        },
        _syncPresetsPickerTheme() {
            try {
                document.documentElement.classList.toggle('presets-picker-dark', !!this.darkUi);
            } catch (e) {}
        },
        closePicker() {
            this.picker.show = false;
            this.picker.category = null;
            try {
                document.documentElement.classList.remove('presets-picker-open');
                document.documentElement.classList.remove('presets-picker-dark');
            } catch (e) {}
        },
        pickerBack() {
            this.picker.category = null;
        },
        _ensurePickerOnBody() {
            let el = this.$refs.pickerRoot;
            if (el && el.parentNode !== document.body) {
                document.body.appendChild(el);
                this._pickerMounted = true;
            }
        },
        openCategory(label) {
            if (!label) { return; }
            // Mobile sheet: lateral drill-in (same drawer — never re-run enter animation)
            if (!this.desktopLayout) {
                if (this.menu) {
                    this.$set(this.menu, 'category', label);
                    this.$set(this.menu, 'show', true);
                }
                this.$nextTick(function() {
                    let sc = this.$refs.presetsMenuItemsScroll;
                    if (sc) {
                        try { sc.scrollTop = 0; } catch (e) {}
                    }
                }.bind(this));
                return;
            }
            // Desktop: body portal at category level
            this.closeRowMenu();
            this.picker.category = label;
            this.picker.show = true;
            this.$nextTick(function() {
                this._ensurePickerOnBody();
                try {
                    document.documentElement.classList.add('presets-picker-open');
                    this._syncPresetsPickerTheme();
                } catch (e) {}
            }.bind(this));
        },
        _parsePresetSlot(p, i) {
            p = p || {};
            let url = p.url || '';
            let parsed = this.parseTitleSource(p.text || '', url, p.source || '');
            return {
                index: parseInt(p.index, 10) || (i + 1),
                text: parsed.title || p.text || '',
                url: url,
                type: p.type || this.inferTypeFromUrl(url) || 'audio',
                icon: this.resolveIcon(p.icon || '') || this.iconForUrl(url),
                source: parsed.source || p.source || '',
                artist: p.artist || '',
                album: p.album || '',
                shuffle: _clampMode(p.shuffle),
                repeat: _clampMode(p.repeat),
                _uid: 'pr-' + (i + 1) + '-' + (url || 'empty')
            };
        },
        loadSlots() {
            if (!this.playerId) {
                this.slotsLoading = false;
                this.presets = this._emptyPresets();
                return;
            }
            this.slotsLoading = true;
            let self = this;
            lmsCommand('', ['material-skin', 'player-presets', 'player:' + this.playerId, 'part:slots']).then(function(res) {
                let r = res && res.data && res.data.result;
                self.slotsLoading = false;
                if (!r || r.error) {
                    self.presets = self._emptyPresets();
                    self.$nextTick(function() { self.initPresetsSortable(); });
                    return;
                }
                self.isWiim = !!(r.is_wiim);
                if (r.player_name) {
                    self.playerName = r.player_name;
                }
                let loop = r.presets_loop || [];
                let list = [];
                for (let i = 0; i < 10; i++) {
                    list.push(self._parsePresetSlot(loop[i], i));
                }
                self.presets = list;
                self._refreshPresetIcons();
                self.$nextTick(function() { self.initPresetsSortable(); });
            }).catch(function() {
                self.slotsLoading = false;
                self.presets = self._emptyPresets();
                self.$nextTick(function() { self.initPresetsSortable(); });
            });
        },
        loadOptions() {
            if (!this.playerId) {
                this.optionsLoading = false;
                this.options = [];
                return;
            }
            this.optionsLoading = true;
            let self = this;
            lmsCommand('', ['material-skin', 'player-presets', 'player:' + this.playerId, 'part:options']).then(function(res) {
                self.optionsLoading = false;
                let r = res && res.data && res.data.result;
                if (!r || r.error) {
                    self.options = [];
                    return;
                }
                if (r.is_wiim) { self.isWiim = true; }
                let opts = r.options_loop || [];
                self.options = opts.map(function(o) {
                    let parsed = self.parseTitleSource(o.title || '', o.url || '', o.source || '');
                    return {
                        category: o.category || '',
                        title: parsed.title || o.title || '',
                        url: o.url || '',
                        icon: self.resolveIcon(o.icon || ''),
                        source: parsed.source || o.source || '',
                        type: o.type || self.inferTypeFromUrl(o.url || ''),
                        artist: o.artist || '',
                        album: o.album || ''
                    };
                }).filter(function(o) { return o.title; });
                let catFirst = {};
                let catIdx = 0;
                for (let i = 0; i < self.options.length; i++) {
                    let c = self.options[i].category || '';
                    if (catFirst[c] === undefined) {
                        catFirst[c] = catIdx++;
                    }
                }
                self.options.sort(function(a, b) {
                    let ca = (catFirst[a.category || ''] || 0) - (catFirst[b.category || ''] || 0);
                    if (ca !== 0) { return ca; }
                    return (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base', numeric: true });
                });
                self._refreshPresetIcons();
            }).catch(function() {
                self.optionsLoading = false;
                self.options = [];
            });
        },
        destroyPresetsSortable() {
            if (typeof mskSortableDestroy === 'function') {
                mskSortableDestroy(this._presetsSortable);
            }
            this._presetsSortable = undefined;
        },
        _presetsPointerY(evt) {
            let oe = (evt && (evt.originalEvent || evt)) || null;
            if (!oe) { return null; }
            if (typeof oe.clientY === 'number' && (oe.clientY !== 0 || (oe.changedTouches && oe.changedTouches.length))) {
                if (oe.changedTouches && oe.changedTouches[0]) {
                    return oe.changedTouches[0].clientY;
                }
                if (oe.touches && oe.touches[0]) {
                    return oe.touches[0].clientY;
                }
                return oe.clientY;
            }
            let t = (oe.changedTouches && oe.changedTouches[0]) || (oe.touches && oe.touches[0]);
            return (t && typeof t.clientY === 'number') ? t.clientY : null;
        },
        _presetsRowList(host, dragged) {
            let rows = [];
            let kids = host && host.children ? host.children : [];
            for (let i = 0; i < kids.length; i++) {
                let k = kids[i];
                if (!k || !k.classList || !k.classList.contains('presets-editor-sort-row')) {
                    continue;
                }
                if (k.classList.contains('sortable-fallback')) {
                    continue;
                }
                if (k.classList.contains('msk-sortable-drag') && k !== dragged) {
                    continue;
                }
                rows.push(k);
            }
            return rows;
        },
        /**
         * Destination slot = the numbered row the pointer was released on
         * (pill 1–10), not Sortable's insert-gap / auto-scroll index.
         */
        _presetsDropIndex(evt, host) {
            if (!evt || !host) { return -1; }
            let rows = this._presetsRowList(host, evt.item);
            if (!rows.length) { return -1; }
            let y = this._presetsPointerY(evt);
            let hit = -1;
            if (y != null) {
                for (let i = 0; i < rows.length; i++) {
                    let r = rows[i].getBoundingClientRect();
                    if (y >= r.top && y <= r.bottom) {
                        hit = i;
                        break;
                    }
                }
                if (hit < 0) {
                    let bestD = Infinity;
                    for (let i = 0; i < rows.length; i++) {
                        let r = rows[i].getBoundingClientRect();
                        let d = Math.abs(y - ((r.top + r.bottom) / 2));
                        if (d < bestD) {
                            bestD = d;
                            hit = i;
                        }
                    }
                }
            } else {
                hit = rows.indexOf(evt.item);
                if (hit < 0) {
                    for (let i = 0; i < rows.length; i++) {
                        if (rows[i].contains(evt.item)) {
                            hit = i;
                            break;
                        }
                    }
                }
            }
            return hit;
        },
        initPresetsSortable() {
            this.destroyPresetsSortable();
            if (!this.show || this.slotsLoading || !this.presets || this.presets.length < 2) {
                return;
            }
            let list = this.$refs.presetsSortable
                || document.getElementById('presets-editor-sortable');
            if (!list || typeof mskSortableCreate !== 'function') {
                return;
            }
            this._presetsSortable = mskSortableCreate(list, {
                draggable: '> .presets-editor-sort-row',
                handle: '.presets-editor-drag-handle',
                forceFallback: true,
                fallbackOnBody: true,
                fallbackTolerance: 4,
                delay: 0,
                delayOnTouchOnly: true,
                touchStartThreshold: 5,
                filter: '.presets-editor-actions, .presets-editor-actions *',
                preventOnFilter: false,
                emitDragActive: false,
                // 10 rows: auto-scroll near the bottom made drop-on-8 land on 9.
                scroll: false,
                bubbleScroll: false,
                onEnd: function(evt) {
                    let from = -1;
                    let to = -1;
                    if (evt && evt.item) {
                        from = parseInt(evt.item.getAttribute('data-msk-index'), 10);
                        if (isNaN(from)) {
                            from = (typeof evt.oldIndex === 'number') ? evt.oldIndex : -1;
                        }
                        to = this._presetsDropIndex(evt, evt.to || list);
                    }
                    if (from >= 0 && to >= 0 && from !== to) {
                        this.reorderPresets(from, to);
                    }
                    this.$nextTick(function() { this.initPresetsSortable(); }.bind(this));
                }.bind(this)
            });
        },
        /**
         * Move content between fixed preset slots (pills 1–10 stay in place after refresh).
         * Item that lands on slot N is saved as preset N.
         */
        reorderPresets(from, to) {
            if (from === to || from < 0 || to < 0 || !this.presets || this.presets.length < 2) {
                return;
            }
            if (from >= this.presets.length || to >= this.presets.length) {
                return;
            }
            let payloads = this.presets.map(function(p) {
                return {
                    text: p.text || '',
                    url: p.url || '',
                    type: p.type || 'audio',
                    icon: p.icon || '',
                    source: p.source || '',
                    artist: p.artist || '',
                    album: p.album || '',
                    shuffle: _clampMode(p.shuffle),
                    repeat: _clampMode(p.repeat),
                    _uid: p._uid
                };
            });
            let moved = typeof arrayMove === 'function'
                ? arrayMove(payloads.slice(), from, to)
                : this._arrayMoveFallback(payloads.slice(), from, to);
            let list = [];
            for (let i = 0; i < moved.length; i++) {
                list.push(Object.assign({}, moved[i], { index: i + 1 }));
            }
            this.presets = list;
            this.scheduleSave();
        },
        _arrayMoveFallback(arr, from, to) {
            if (!arr || from === to) { return arr; }
            let item = arr.splice(from, 1)[0];
            arr.splice(to, 0, item);
            return arr;
        },
        _emptyPresets() {
            let list = [];
            for (let i = 1; i <= 10; i++) {
                list.push({ index: i, text: '', url: '', type: 'audio', icon: '', shuffle: 0, repeat: 0, _uid: 'pr-' + i + '-empty' });
            }
            return list;
        },
        resolveIcon(icon) {
            if (!icon) { return ''; }
            let s = String(icon);
            if (typeof resolveImageUrl === 'function') {
                try {
                    let sized = resolveImageUrl(s, (typeof LMS_LIST_IMAGE_SIZE !== 'undefined') ? LMS_LIST_IMAGE_SIZE : undefined);
                    if (sized) { return sized; }
                } catch (e) { /* fall through */ }
            }
            if (s.indexOf('http') === 0) {
                return '/imageproxy/' + encodeURIComponent(s) + '/image.png';
            }
            if (s.indexOf('/') === 0) {
                return s;
            }
            if (s.indexOf('plugins/') === 0 || s.indexOf('html/') === 0 || s.indexOf('music/') === 0 || s.indexOf('imageproxy/') === 0) {
                return '/' + s.replace(/^\/+/, '');
            }
            return s;
        },
        iconForUrl(url) {
            if (!url) { return ''; }
            let u = String(url);
            for (let i = 0; i < this.options.length; i++) {
                let ou = this.options[i].url || '';
                if (!ou || !this.options[i].icon) { continue; }
                if (ou === u || ou === u.replace(/^spotify:\/\//i, 'spotify:') ||
                    u === ou.replace(/^spotify:\/\//i, 'spotify:')) {
                    return this.options[i].icon;
                }
            }
            return '';
        },
        _refreshPresetIcons() {
            if (!this.presets || !this.presets.length) { return; }
            for (let i = 0; i < this.presets.length; i++) {
                let p = this.presets[i];
                if (!p) { continue; }
                // Fill missing icons from loaded sources (and keep existing)
                let ic = p.icon || (p.url ? this.iconForUrl(p.url) : '');
                if (ic) {
                    let resolved = this.resolveIcon(ic);
                    if (resolved && resolved !== p.icon) {
                        this.$set(this.presets[i], 'icon', resolved);
                    }
                }
                // Fill missing category subtitle via options match
                if (p.url && !p.text) {
                    for (let j = 0; j < this.options.length; j++) {
                        if (this.options[j].url === p.url && this.options[j].title) {
                            this.$set(this.presets[i], 'text', this.options[j].title);
                            if (this.options[j].icon && !p.icon) {
                                this.$set(this.presets[i], 'icon', this.resolveIcon(this.options[j].icon));
                            }
                            break;
                        }
                    }
                }
            }
        },
        itemCategoryLabel(item) {
            if (!item || !item.url) { return ''; }
            for (let i = 0; i < this.options.length; i++) {
                if (this.options[i].url === item.url && this.options[i].category) {
                    return this.options[i].category;
                }
            }
            let u = String(item.url);
            if (u.length > 48) {
                return u.substring(0, 45) + '…';
            }
            return u;
        },
        shuffleTitle(v) {
            v = _clampMode(v);
            if (v === 1) { return this.i18n('Shuffle songs'); }
            if (v === 2) { return this.i18n('Shuffle albums'); }
            return this.i18n('Shuffle off');
        },
        repeatTitle(v) {
            v = _clampMode(v);
            if (v === 1) { return this.i18n('Repeat one'); }
            if (v === 2) { return this.i18n('Repeat all'); }
            return this.i18n('Repeat off');
        },
        cycleShuffle(index, event) {
            if (event) { try { event.stopPropagation(); } catch (e) {} }
            if (this.slotsLoading || index < 0 || !this.presets[index]) { return; }
            let n = _clampMode(this.presets[index].shuffle) + 1;
            if (n > 2) { n = 0; }
            this.$set(this.presets[index], 'shuffle', n);
            this.scheduleSave();
        },
        cycleRepeat(index, event) {
            if (event) { try { event.stopPropagation(); } catch (e) {} }
            if (this.slotsLoading || index < 0 || !this.presets[index]) { return; }
            let cur = _clampMode(this.presets[index].repeat);
            let n = cur === 0 ? 2 : (cur === 2 ? 1 : 0);
            this.$set(this.presets[index], 'repeat', n);
            this.scheduleSave();
        },
        onRowClick(item, index, event) {
            if (this.slotsLoading) { return; }
            if (document.body.classList.contains('msk-sortable-active')) {
                return;
            }
            if (this.desktopLayout) {
                this.openPicker(item, index);
            } else {
                this.openRowMenu(item, index, event);
            }
        },
        _presetMenuItem(item) {
            if (!item) { return null; }
            let sub = item.text ? this.itemCategoryLabel(item) : this.i18n('Empty');
            return {
                id: 'preset-' + item.index,
                title: item.text || this.emptyLabel || (this.i18n('Preset') + ' ' + item.index),
                image: item.icon || undefined,
                artist: sub || (this.i18n('Preset') + ' ' + item.index),
                preset: item
            };
        },
        openRowMenu(item, index, event) {
            if (event) {
                try { storeClickOrTouchPos(event, this.menu); } catch (e) {}
            }
            let pseudo = this._presetMenuItem(item);
            let pos = (event && typeof browseMenuCoords==='function')
                ? browseMenuCoords(event)
                : { x: (event && event.clientX) || 0, y: (event && event.clientY) || 0 };
            // Do NOT use showMenu() — it delay-replaces `menu` and wipes `category`
            // after openCategory() has already drilled into a submenu.
            let next = {
                show: true,
                item: pseudo,
                index: index,
                category: null,
                x: this.desktopLayout ? (pos.x || window.innerWidth - 40) : 0,
                y: this.desktopLayout ? (pos.y || 80) : (window.innerHeight || document.documentElement.clientHeight || 800),
                sheet: !this.desktopLayout
            };
            this.menu = next;
            if (!this.desktopLayout) {
                this.$nextTick(function() {
                    if (typeof this.ctxSheetPrepareOpen === 'function') {
                        try { this.ctxSheetPrepareOpen(); } catch (e) {}
                    }
                }.bind(this));
            }
        },
        /** Open hierarchical picker at category root. */
        openPicker(item, index) {
            if (undefined!=index && index>=0) {
                // keep index for applyOption
            }
            // Mobile: open drawer at sources (level 0) — hierarchy lives in the sheet
            if (!this.desktopLayout) {
                this.openRowMenu(item, index, null);
                return;
            }
            if (item) {
                this.menu.item = this._presetMenuItem(item);
            }
            if (undefined!=index && index>=0) {
                this.menu.index = index;
            }
            this.closeRowMenu();
            this.picker.category = null;
            this.picker.show = true;
            this.$nextTick(function() {
                this._ensurePickerOnBody();
                try {
                    document.documentElement.classList.add('presets-picker-open');
                    this._syncPresetsPickerTheme();
                } catch (e) {}
            }.bind(this));
        },
        enterLink() {
            let idx = this.menu.index;
            this.closeRowMenu();
            let cur = (this.presets[idx] && this.presets[idx].url) || '';
            promptForText(this.i18n('Enter link'), this.i18n('URL or stream'), cur).then(function(resp) {
                if (!resp || !resp.ok) { return; }
                let url = (resp.value || '').trim();
                if (!url) {
                    this.clearAt(idx);
                    return;
                }
                let text = (this.presets[idx] && this.presets[idx].text) || '';
                if (!text) {
                    try {
                        let parts = url.split('/');
                        text = decodeURIComponent(parts[parts.length - 1] || url);
                        text = text.replace(/\.(m3u8?|pls|xspf)$/i, '');
                    } catch (e) {
                        text = url;
                    }
                }
                this.$set(this.presets, idx, {
                    index: idx + 1,
                    text: text,
                    url: url,
                    type: 'audio',
                    icon: this.resolveIcon(this.iconForUrl(url) || ''),
                    shuffle: _clampMode(this.presets[idx] && this.presets[idx].shuffle),
                    repeat: _clampMode(this.presets[idx] && this.presets[idx].repeat),
                    _uid: (this.presets[idx] && this.presets[idx]._uid) || ('pr-' + (idx + 1) + '-' + url)
                });
                this.scheduleSave();
            }.bind(this));
        },
        clearPreset() {
            let idx = this.menu.index;
            this.closeRowMenu();
            this.clearAt(idx);
        },
        clearAt(idx) {
            if (idx < 0 || idx >= this.presets.length) { return; }
            this.$set(this.presets, idx, {
                index: idx + 1,
                text: '',
                url: '',
                type: 'audio',
                icon: '',
                shuffle: _clampMode(this.presets[idx] && this.presets[idx].shuffle),
                repeat: _clampMode(this.presets[idx] && this.presets[idx].repeat),
                _uid: (this.presets[idx] && this.presets[idx]._uid) || ('pr-' + (idx + 1) + '-empty')
            });
            this.scheduleSave();
        },
        applyOption(opt) {
            let idx = this.menu.index;
            this.closePicker();
            this.closeRowMenu();
            if (idx < 0 || !opt) { return; }
            let parsed = this.parseTitleSource(opt.title || '', opt.url || '', opt.source || '');
            this.$set(this.presets, idx, {
                index: idx + 1,
                text: parsed.title || opt.title || '',
                url: opt.url || '',
                type: opt.type || this.inferTypeFromUrl(opt.url || '') || 'audio',
                icon: this.resolveIcon(opt.icon || '') || this.iconForUrl(opt.url || ''),
                source: parsed.source || opt.source || '',
                artist: opt.artist || parsed.artist || '',
                album: opt.album || parsed.album || '',
                shuffle: _clampMode(this.presets[idx] && this.presets[idx].shuffle),
                repeat: _clampMode(this.presets[idx] && this.presets[idx].repeat),
                _uid: (this.presets[idx] && this.presets[idx]._uid) || ('pr-' + (idx + 1) + '-' + (opt.url || 'empty'))
            });
            this.scheduleSave();
        },
        copyWiimLink(item) {
            this.closeRowMenu();
            if (!item) { return; }
            let num = item.index || 1;
            let base = '';
            try {
                base = String(window.location.origin || '').replace(/\/$/, '');
            } catch (e) {}
            // Clean /preset/N — shuffle/repeat come from this slot in the editor,
            // not from query params on the WiiM shortcut URL.
            let url = base ? (base + '/preset/' + num) : ('/preset/' + num);
            let done = function() {
                bus.$emit('showMessage', this.i18n('Link copied'));
            }.bind(this);
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(url).then(done).catch(function() {
                        this._copyFallback(url, done);
                    }.bind(this));
                    return;
                }
            } catch (e) {}
            this._copyFallback(url, done);
        },
        _copyFallback(url, done) {
            try {
                let ta = document.createElement('textarea');
                ta.value = url;
                ta.style.cssText = 'position:fixed;left:-9999px';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                if (done) { done(); }
            } catch (e) {
                bus.$emit('showMessage', url);
            }
        },
        scheduleSave() {
            this.dirty = true;
            if (this._saveTimer) {
                clearTimeout(this._saveTimer);
            }
            this._saveTimer = setTimeout(function() {
                this._saveTimer = undefined;
                this.flushSave(false);
            }.bind(this), 400);
        },
        flushSave(silent) {
            if (this._saveTimer) {
                clearTimeout(this._saveTimer);
                this._saveTimer = undefined;
            }
            if (!this.dirty || !this.playerId) {
                return;
            }
            this.dirty = false;
            let payload = this.presets.map(function(p) {
                return {
                    text: p.text || '',
                    url: p.url || '',
                    type: p.type || 'audio',
                    shuffle: _clampMode(p.shuffle),
                    repeat: _clampMode(p.repeat)
                };
            });
            let json = JSON.stringify(payload);
            lmsCommand('', ['material-skin', 'player-presets-set', 'player:' + this.playerId, 'presets:' + json]).then(function() {
                if (!silent) {
                    this.flashSaveOk();
                }
            }.bind(this)).catch(function() {
                bus.$emit('showError', undefined, this.i18n('Failed to save'));
            }.bind(this));
        },
        flashSaveOk() {
            this.saveOk = true;
            if (this._saveOkTimer) {
                clearTimeout(this._saveOkTimer);
            }
            this._saveOkTimer = setTimeout(function() {
                this.saveOk = false;
                this._saveOkTimer = undefined;
            }.bind(this), 1600);
        }
    }, typeof contextSheetMethods!=='undefined' ? contextSheetMethods : {}),
    watch: {
        show(val) {
            this.$store.commit('dialogOpen', { name: 'presetseditor', shown: val });
            if (val) {
                this.$nextTick(function() { this.initPresetsSortable(); }.bind(this));
            } else {
                this.destroyPresetsSortable();
                this.flushSave(true);
                this.closeRowMenu();
                this.closePicker();
            }
        },
        'menu.show'(val) {
            this.$store.commit('menuVisible', { name: 'presetseditor-row', shown: val });
            if (val) {
                this._syncPresetsPickerTheme();
                if (typeof this.ctxSheetPrepareOpen==='function' && !this.desktopLayout) {
                    this.ctxSheetPrepareOpen();
                }
            } else {
                if (typeof this.ctxSheetResetStyles==='function') {
                    this.ctxSheetResetStyles();
                }
                if (!this.picker || !this.picker.show) {
                    try { document.documentElement.classList.remove('presets-picker-dark'); } catch (e) {}
                }
            }
        },
        'picker.show'(val) {
            this.$store.commit('menuVisible', { name: 'presetseditor-picker', shown: val });
            try {
                document.documentElement.classList.toggle('presets-picker-open', !!val);
            } catch (e) {}
            if (val) {
                this._syncPresetsPickerTheme();
                this.$nextTick(function() { this._ensurePickerOnBody(); }.bind(this));
            } else {
                try { document.documentElement.classList.remove('presets-picker-dark'); } catch (e) {}
            }
        }
    }
});
