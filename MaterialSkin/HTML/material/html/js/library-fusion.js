/**
 * LMS-Material — Library Fusion browser (preliminary)
 * Scoped to My Music: Artists | Albums | Songs
 * Default artists = Album Artists (role_id:ALBUMARTIST)
 */
'use strict';

(function() {
    if (typeof Vue === 'undefined') {
        return;
    }

    /* First paint: large pages are fine for RecycleScroller; prefer lighter tags */
    var FUSION_BATCH = 10000;
    var FUSION_ALBUM_TAGS_LIGHT = 'tags:ajlswyK'; /* skip slow/rare genre tags on first load */
    var SONG_ROW_H = 40;
    /**
     * Ignored articles for sort / A–Z — mirrors LMS server pref “ignoredarticles”
     * (Ma musique → prefixes). Fallback matches LMS default + common Romance articles.
     */
    var SORT_ARTICLES_RE = null;
    var SORT_ARTICLES_LOADED = false;
    function defaultArticlesList() {
        return ['The', 'A', 'An', 'El', 'La', 'Los', 'Las', 'Le', 'Les'];
    }
    function buildArticlesRe(list) {
        var arts = (list && list.length) ? list : defaultArticlesList();
        // Longest first so “Los ” wins over “La ”
        arts = arts.slice().filter(Boolean).sort(function(a, b) {
            return String(b).length - String(a).length;
        });
        var esc = arts.map(function(a) {
            return String(a).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        });
        if (!esc.length) {
            return null;
        }
        return new RegExp('^(' + esc.join('|') + ')\\s+', 'i');
    }
    function ensureArticlesRe() {
        if (SORT_ARTICLES_RE) {
            return SORT_ARTICLES_RE;
        }
        // Prefer live LMS pref if already cached on lmsOptions
        try {
            if (typeof lmsOptions !== 'undefined' && lmsOptions.ignoredArticlesRe) {
                SORT_ARTICLES_RE = lmsOptions.ignoredArticlesRe;
                return SORT_ARTICLES_RE;
            }
            if (typeof lmsOptions !== 'undefined' && lmsOptions.ignoredArticles) {
                SORT_ARTICLES_RE = buildArticlesRe(lmsOptions.ignoredArticles);
                return SORT_ARTICLES_RE;
            }
        } catch (e) {}
        SORT_ARTICLES_RE = buildArticlesRe(defaultArticlesList());
        return SORT_ARTICLES_RE;
    }
    function setIgnoredArticlesFromPref(raw) {
        var list = String(raw || '').trim().split(/\s+/).filter(Boolean);
        if (!list.length) {
            list = defaultArticlesList();
        }
        SORT_ARTICLES_RE = buildArticlesRe(list);
        SORT_ARTICLES_LOADED = true;
        try {
            if (typeof lmsOptions !== 'undefined') {
                lmsOptions.ignoredArticles = list;
                lmsOptions.ignoredArticlesRe = SORT_ARTICLES_RE;
            }
        } catch (e) {}
    }
    function loadIgnoredArticlesPref(onDone) {
        var done = typeof onDone === 'function' ? onDone : function() {};
        if (SORT_ARTICLES_LOADED) {
            done();
            return;
        }
        if (typeof lmsCommand !== 'function') {
            ensureArticlesRe();
            SORT_ARTICLES_LOADED = true;
            done();
            return;
        }
        lmsCommand('', ['pref', 'ignoredarticles', '?']).then(function(r) {
            var v = r && r.data && r.data.result && (r.data.result._p2 != null ? r.data.result._p2 : r.data.result.pref);
            if (v == null && r && r.data && r.data.result) {
                // Some LMS builds return { _ignoredarticles: "..." } or plain value
                var res = r.data.result;
                v = res._p2 != null ? res._p2 : (res.ignoredarticles != null ? res.ignoredarticles : res._pref);
            }
            if (v != null && String(v).length) {
                setIgnoredArticlesFromPref(v);
            } else {
                ensureArticlesRe();
                SORT_ARTICLES_LOADED = true;
            }
            done();
        }).catch(function() {
            ensureArticlesRe();
            SORT_ARTICLES_LOADED = true;
            done();
        });
    }
    function sortKey(str) {
        var s = String(str || '').replace(/^\s+/, '');
        var re = ensureArticlesRe();
        if (re) {
            s = s.replace(re, '');
        }
        // Also drop leading non-alphanumeric quotes/punctuation
        s = s.replace(/^["'`“”‘’.\-–—]+\s*/, '');
        return s;
    }
    function sortLetter(str) {
        var s = sortKey(str).trim();
        if (!s) { return '?'; }
        var ch = s.charAt(0).toUpperCase();
        if (ch >= '0' && ch <= '9') { return '#'; }
        if (ch < 'A' || ch > 'Z') { return '?'; }
        return ch;
    }
    function cmpSortKey(a, b) {
        // Prefer Material fixedSort when available (same article handling as browse lists)
        if (typeof fixedSort === 'function') {
            var fa = sortKey(a).toLowerCase();
            var fb = sortKey(b).toLowerCase();
            if (fa < fb) { return -1; }
            if (fa > fb) { return 1; }
            return 0;
        }
        return sortKey(a).localeCompare(sortKey(b), undefined, { sensitivity: 'base', numeric: true });
    }
    /** Map LMS / Material Ma musique album sort keys → fusion primary + secondary + reverse */
    function mapMyMusicAlbumSort() {
        var by = 'album';
        var rev = false;
        try {
            if (typeof getAlbumSort === 'function') {
                var s = getAlbumSort({ command: ['albums'], params: [] }, null, null);
                if (s && s.by) {
                    by = s.by;
                    rev = !!s.rev;
                }
            } else if (typeof getLocalStorageVal === 'function') {
                var parts = String(getLocalStorageVal('albumSort', 'album') || 'album').split('.');
                by = parts[0] || 'album';
                rev = parts.length > 1;
            }
        } catch (e) {}
        // LMS sort:new is newest-first; fusion "added" is ascending unless reverse
        if (by === 'new') {
            return { primary: 'added', secondary: 'none', reverse: !rev };
        }
        if (by === 'artistalbum' || by === 'artflow') {
            return { primary: 'artist', secondary: 'album', reverse: rev };
        }
        if (by === 'yearalbum') {
            return { primary: 'year', secondary: 'album', reverse: rev };
        }
        if (by === 'yearartistalbum') {
            return { primary: 'year', secondary: 'artist', reverse: rev };
        }
        return { primary: 'album', secondary: 'none', reverse: rev };
    }
    function mapMyMusicArtistAlbumSort() {
        var by = 'yearalbum';
        var rev = false;
        try {
            if (typeof getAlbumSort === 'function') {
                var s = getAlbumSort({ command: ['albums'], params: ['artist_id:0'] }, null, null);
                if (s && s.by) {
                    by = s.by;
                    rev = !!s.rev;
                }
            } else if (typeof getLocalStorageVal === 'function') {
                var parts = String(getLocalStorageVal('artistAlbumSort', 'yearalbum') || 'yearalbum').split('.');
                by = parts[0] || 'yearalbum';
                rev = parts.length > 1;
            }
        } catch (e) {}
        if (by === 'new') {
            return { primary: 'added', secondary: 'none', reverse: !rev };
        }
        if (by === 'artistalbum' || by === 'artflow') {
            return { primary: 'artist', secondary: 'album', reverse: rev };
        }
        if (by === 'yearalbum') {
            return { primary: 'year', secondary: 'album', reverse: rev };
        }
        if (by === 'yearartistalbum') {
            return { primary: 'year', secondary: 'artist', reverse: rev };
        }
        if (by === 'album') {
            return { primary: 'album', secondary: 'none', reverse: rev };
        }
        return { primary: 'year', secondary: 'album', reverse: rev };
    }
    /**
     * Text used for A–Z jumplist keys — must match the primary sort field
     * so “jump to B” lands on the first item whose sort key starts with B.
     */
    function jlSortText(item, primary, kind) {
        if (!item) { return ''; }
        var id = primary || '';
        if (kind === 'album') {
            if (id === 'artist') { return item.artist || ''; }
            if (id === 'genre') { return item.genre || ''; }
            if (id === 'year') {
                return item.year ? String(item.year) : (item.yearNum ? String(item.yearNum) : '');
            }
            // album / added / default → album title
            return item.title || '';
        }
        if (kind === 'song') {
            if (id === 'artist') { return item.artist || ''; }
            if (id === 'album') { return item.album || ''; }
            if (id === 'genre') { return item.genre || ''; }
            if (id === 'year') {
                return item.year ? String(item.year) : (item.yearNum ? String(item.yearNum) : '');
            }
            // title / duration / added / default
            return item.title || '';
        }
        // artist list
        return item.title || '';
    }
    /** Letter (or year) key for jumplist from an item under the current sort */
    function jlLetter(item, primary, kind) {
        var text = jlSortText(item, primary, kind);
        // Year primary: use full year (or “?”) so the strip can jump by year groups
        if (primary === 'year') {
            var y = String(text || '').replace(/\D/g, '');
            if (y.length >= 4) { return y.slice(0, 4); }
            if (y.length) { return y; }
            return '?';
        }
        // Numeric-only sorts (duration/added) — no meaningful A–Z; fall back to title
        if (primary === 'duration' || primary === 'added') {
            return sortLetter(item && item.title);
        }
        return sortLetter(text);
    }
    var SONG_ROW_H_NARROW = 52; /* title + artist stacked */
    var ARTIST_ROW_H = 52;

    /* Primary sort keys (direction is a separate Reverse toggle) */
    var ARTIST_SORTS = [
        { id: 'name', label: 'Name' }
    ];
    var ALBUM_SORTS = [
        { id: 'album', label: 'Album' },
        { id: 'artist', label: 'Artist' },
        { id: 'year', label: 'Year' },
        { id: 'genre', label: 'Genre' },
        { id: 'added', label: 'Date added' }
    ];
    var SONG_SORTS = [
        { id: 'title', label: 'Title' },
        { id: 'artist', label: 'Artist' },
        { id: 'album', label: 'Album' },
        { id: 'genre', label: 'Genre' },
        { id: 'duration', label: 'Duration' },
        { id: 'year', label: 'Year' },
        { id: 'added', label: 'Date added' }
    ];
    var SORT_NONE = { id: 'none', label: 'None' };

    /** Migrate legacy single-key sorts (e.g. year_desc → year + reverse) */
    function migrateSortPrimary(id) {
        var map = {
            name_desc: 'name',
            artistalbum: 'artist',
            yearalbum: 'year',
            year_desc: 'year',
            duration_desc: 'duration'
        };
        return map[id] || id || 'name';
    }
    function migrateSortReverse(id) {
        return id === 'name_desc' || id === 'year_desc' || id === 'duration_desc';
    }
    function migrateSortSecondary(id) {
        if (id === 'artistalbum' || id === 'yearalbum') {
            return 'album';
        }
        return 'none';
    }
    /** Songs table columns (title always on) */
    var SONG_COLS = [
        { id: 'title', label: 'Title', locked: true },
        { id: 'artist', label: 'Artist' },
        { id: 'album', label: 'Album' },
        { id: 'duration', label: 'Duration' },
        { id: 'genre', label: 'Genre' },
        { id: 'year', label: 'Year' },
        { id: 'added', label: 'Date added' },
        { id: 'tracknum', label: 'Track #' }
    ];
    var DEFAULT_SONG_COLS = {
        title: true,
        artist: true,
        album: true,
        duration: true,
        genre: false,
        year: false,
        added: false,
        tracknum: false
    };
    function parseAddedNum(raw) {
        if (raw == null || raw === '') { return 0; }
        // LMS titles tag D returns unix seconds as string/number
        var n = parseInt(raw, 10);
        if (!isNaN(n) && n > 0) {
            // Heuristic: ms vs sec (ms > year ~2100 in seconds)
            if (n > 1e12) { n = Math.floor(n / 1000); }
            return n;
        }
        var d = Date.parse(String(raw));
        if (!isNaN(d)) { return Math.floor(d / 1000); }
        return 0;
    }
    function fmtAddedDate(secs) {
        var n = parseInt(secs, 10);
        if (!n) { return ''; }
        var d = new Date(n * 1000);
        if (isNaN(d.getTime())) { return ''; }
        try {
            return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
        } catch (e) {
            var mo = d.getMonth() + 1;
            var da = d.getDate();
            return d.getFullYear() + '-' + (mo < 10 ? '0' : '') + mo + '-' + (da < 10 ? '0' : '') + da;
        }
    }

    function libIdFromStore(vm) {
        try {
            if (vm.$store && vm.$store.state && vm.$store.state.library) {
                return vm.$store.state.library;
            }
        } catch (e) {}
        if (typeof LMS_DEFAULT_LIBRARY !== 'undefined' && LMS_DEFAULT_LIBRARY) {
            return LMS_DEFAULT_LIBRARY;
        }
        return undefined;
    }

    function addLibParam(params, vm) {
        var lib = libIdFromStore(vm);
        if (lib) {
            params.push('library_id:' + lib);
        }
        return params;
    }

    function matchFilter(text, q) {
        if (!q) {
            return true;
        }
        return String(text || '').toLowerCase().indexOf(q) !== -1;
    }

    Vue.component('lms-library-fusion', {
        template:
            '<div class="lib-fusion noselect lib-fusion-zoomable" tabindex="0" ref="root" @keydown="onKeyDown"' +
            '     :class="{\'lib-fusion-chrome-collapsed\':chromeCollapsed}"' +
            '     @touchstart="fusionTouchStart" @touchmove="fusionTouchMove" @touchend="fusionTouchEnd" @touchcancel="fusionTouchEnd"' +
            '     @gesturestart.prevent="fusionGestureStart" @gesturechange.prevent="fusionGestureChange" @gestureend.prevent="fusionGestureEnd">' +
            /* Selection bar */
            ' <div v-if="selectedCount>0" class="lib-fusion-selbar lib-fusion-frost">' +
            '  <span class="lib-fusion-selcount">{{selectedCount}} selected</span>' +
            '  <button type="button" class="lib-fusion-icon-btn" @click.stop="playSelection" :title="tPlay"><v-icon>play_arrow</v-icon></button>' +
            '  <button type="button" class="lib-fusion-icon-btn" @click.stop="addSelection" :title="tAdd"><v-icon>playlist_add</v-icon></button>' +
            '  <button type="button" class="lib-fusion-icon-btn" @click.stop="invertSelection" :title="tInvert"><v-icon>swap_horiz</v-icon></button>' +
            '  <button type="button" class="lib-fusion-icon-btn" @click.stop="clearSelection" :title="tClear"><v-icon>close</v-icon></button>' +
            ' </div>' +
            /* stop + chromeTouchBlock: iOS ghost-clicks must not hit toolbar (player/nav drawer) */
            ' <div class="lib-fusion-tabs lib-fusion-frost" role="tablist" @click.stop @mousedown.stop @touchstart.stop="chromeTouchBlock" @touchend.stop="chromeTouchBlock">' +
            '  <div class="lib-fusion-seg" role="presentation" :style="segPillStyle">' +
            '   <div class="lib-fusion-seg-pill" aria-hidden="true"></div>' +
            '   <button type="button" class="lib-fusion-tab" role="tab" :aria-selected="tab===\'artists\'"' +
            '           :class="{\'lib-fusion-tab-active\':tab===\'artists\'}" @click.prevent.stop="setTab(\'artists\')">{{tArtists}}</button>' +
            '   <button type="button" class="lib-fusion-tab" role="tab" :aria-selected="tab===\'albums\'"' +
            '           :class="{\'lib-fusion-tab-active\':tab===\'albums\'}" @click.prevent.stop="setTab(\'albums\')">{{tAlbums}}</button>' +
            '   <button type="button" class="lib-fusion-tab" role="tab" :aria-selected="tab===\'songs\'"' +
            '           :class="{\'lib-fusion-tab-active\':tab===\'songs\'}" @click.prevent.stop="setTab(\'songs\')">{{tSongs}}</button>' +
            '  </div>' +
            '  <div class="lib-fusion-filter-wrap" :class="{\'lib-fusion-filter-open\':filterExpanded}" @touchstart.stop="chromeTouchBlock" @touchend.stop="chromeTouchBlock">' +
            '   <button type="button" class="lib-fusion-filter-btn" v-if="!filterExpanded"' +
            '           @click.prevent.stop="openFilter" :title="tFilter">' +
            '    <img class="svg-img lib-fusion-filter-icn" :src="iconSearch" alt="">' +
            '   </button>' +
            '   <input v-show="filterExpanded" type="search" class="lib-fusion-filter" ref="filterInput"' +
            '          :value="filter" :placeholder="tFilter" autocomplete="off" spellcheck="false"' +
            '          @input="onFilterInput" @click.stop @touchstart.stop="chromeTouchBlock" @keydown.stop="onFilterKey" @blur="onFilterBlur">' +
            /* Always show X when open — closes filter mode (not only clears text) */
            '   <button v-if="filterExpanded" type="button" class="lib-fusion-filter-clear"' +
            '           @click.prevent.stop="resetFilter" :title="tClose" :aria-label="tClose">' +
            '    <v-icon small>close</v-icon></button>' +
            '  </div>' +
            '  <div class="lib-fusion-sort-wrap" @touchstart.stop="chromeTouchBlock" @touchend.stop="chromeTouchBlock">' +
            '   <button type="button" class="lib-fusion-dd-btn" @click.prevent.stop="toggleSortMenu" :title="tSort">' +
            '    <v-icon small>sort</v-icon><v-icon small class="lib-fusion-dd-caret">arrow_drop_down</v-icon>' +
            '   </button>' +
            '   <div v-if="showSort" class="lib-fusion-sort-menu" @click.stop @touchstart.stop="chromeTouchBlock">' +
            '    <div class="lib-fusion-sort-head">{{tSortPrimary}}</div>' +
            '    <button type="button" class="lib-fusion-sort-opt" v-for="o in currentSortOptions" :key="\'p-\'+o.id"' +
            '            :class="{\'lib-fusion-sort-opt-on\':o.id===currentSortId}" @click.prevent.stop="setSort(o.id)">{{o.label}}</button>' +
            '    <div class="lib-fusion-sort-sep" role="separator"></div>' +
            '    <div class="lib-fusion-sort-head">{{tSortThen}}</div>' +
            '    <button type="button" class="lib-fusion-sort-opt" v-for="o in currentSecondaryOptions" :key="\'s-\'+o.id"' +
            '            :class="{\'lib-fusion-sort-opt-on\':o.id===currentSort2Id}" @click.prevent.stop="setSort2(o.id)">{{o.label}}</button>' +
            '    <div class="lib-fusion-sort-sep" role="separator"></div>' +
            '    <button type="button" class="lib-fusion-sort-opt lib-fusion-sort-reverse" ' +
            '            :class="{\'lib-fusion-sort-opt-on\':currentSortRev}" @click.prevent.stop="toggleSortRev()">' +
            '     <span class="lib-fusion-disp-check" :class="{\'lib-fusion-disp-check-on\':currentSortRev}">{{currentSortRev ? "✓" : ""}}</span>' +
            '     <span>{{tSortReverse}}</span>' +
            '    </button>' +
            '   </div>' +
            '  </div>' +
            /* Songs: column display menu */
            '  <div class="lib-fusion-disp-wrap" v-if="tab===\'songs\'" @touchstart.stop="chromeTouchBlock" @touchend.stop="chromeTouchBlock">' +
            '   <button type="button" class="lib-fusion-dd-btn" @click.prevent.stop="toggleDispMenu" :title="tDisplay">' +
            '    <v-icon small>view_column</v-icon><v-icon small class="lib-fusion-dd-caret">arrow_drop_down</v-icon>' +
            '   </button>' +
            '   <div v-if="showDisp" class="lib-fusion-sort-menu lib-fusion-disp-menu" @click.stop @touchstart.stop="chromeTouchBlock">' +
            '    <div class="lib-fusion-disp-head">{{tDisplayCols}}</div>' +
            '    <button type="button" class="lib-fusion-disp-opt" v-for="c in songColDefs" :key="c.id"' +
            '            :class="{\'lib-fusion-disp-locked\':c.locked}" @click.prevent.stop="toggleSongCol(c)">' +
            '     <span class="lib-fusion-disp-check" :class="{\'lib-fusion-disp-check-on\':songCols[c.id]}">{{songCols[c.id] ? "✓" : ""}}</span>' +
            '     <span>{{c.label}}</span>' +
            '    </button>' +
            '   </div>' +
            '  </div>' +
            ' </div>' +
            /* Contextual menu uses global browse v-menu (see openCtx → browseShowItemMenu) */
            /* Artists | Albums | Songs — host keeps height while push runs (no content drop) */
            ' <div class="lib-fusion-slide-host">' +
            ' <transition :name="pushName">' +
            ' <div :key="tab" class="lib-fusion-slide-root">' +
            /* Artists — narrow: iPod artists → albums → tracks */
            ' <div v-if="tab===\'artists\'" class="lib-fusion-body lib-fusion-artists"' +
            '      :class="isNarrow ? (\'lib-fusion-drill-\' + drillLevel) : \'\'">' +
            '  <div class="lib-fusion-artists-track">' +
            /* pane 0 — artist list */
            '  <div class="lib-fusion-col lib-fusion-artist-list">' +
            '   <div class="lib-fusion-col-scroll">' +
            '    <div class="lib-fusion-col-head">{{tArtists}}' +
            '     <span class="lib-fusion-count" v-if="filteredArtists.length">{{filteredArtists.length}}</span>' +
            '     <span class="lib-fusion-count" v-if="filter && artists.length && filteredArtists.length!==artists.length">/ {{artists.length}}</span>' +
            '    </div>' +
            '    <div v-if="loadingArtists" class="lib-fusion-loading">{{tLoading}} <span v-if="loadStatus" class="lib-fusion-status">{{loadStatus}}</span></div>' +
            '    <div v-else-if="!filteredArtists.length" class="lib-fusion-empty">{{err || (filter ? tNoMatch : tNoArtists)}}</div>' +
            '    <RecycleScroller ref="artistScroller" v-else class="lib-fusion-scroller" :items="filteredArtists" :item-size="artistRowH" key-field="key" :buffer="120">' +
            '     <div slot-scope="{item}" class="lib-fusion-artist-row"' +
            '          :class="{\'lib-fusion-row-active\':selectedArtist && selectedArtist.id===item.id,' +
            '                   \'lib-fusion-kb\':kbKey===item.key,' +
            '                   \'lib-fusion-picked\':isSelected(item.key)}"' +
            '          @click="onArtistClick(item, $event)" @contextmenu.prevent="openCtx(item, \'artist\', $event)" :title="item.title">' +
            '      <span class="lib-fusion-check" v-if="selectedCount>0 || isSelected(item.key)"' +
            '            :class="{\'lib-fusion-check-on\':isSelected(item.key)}" @click.stop="toggleSelect(item, $event)"></span>' +
            '      <img class="lib-fusion-artist-art" :src="item.image" loading="lazy" @error="imgErr">' +
            '      <span class="lib-fusion-artist-name ellipsis">{{item.title}}</span>' +
            '      <div class="grid-btn list-btn hover-btn menu-btn lib-fusion-item-menu" role="button"' +
            '           @click.stop="openCtx(item, \'artist\', $event)" :aria-label="tMenu" :title="tMenu"></div>' +
            '      <span class="lib-fusion-chevron" v-if="isNarrow">›</span>' +
            '     </div>' +
            '    </RecycleScroller>' +
            '   </div>' +
            '  </div>' +
            /* pane 1 — artist albums */
            '  <div class="lib-fusion-col lib-fusion-detail">' +
            '   <div v-if="!selectedArtist" class="lib-fusion-empty lib-fusion-empty-pad">{{tSelectArtist}}</div>' +
            '   <div v-else class="lib-fusion-col-scroll">' +
            '    <div class="lib-fusion-detail-head">' +
            '     <button v-if="isNarrow" type="button" class="lib-fusion-back-btn" @click.stop="drillBack" :title="tBack">‹</button>' +
            '     <img class="lib-fusion-detail-art" :src="selectedArtist.image || artistImage(selectedArtist)" loading="lazy" @error="imgErr">' +
            '     <div class="lib-fusion-detail-title ellipsis">{{selectedArtist.title}}</div>' +
            '     <div class="lib-fusion-detail-actions">' +
            '      <button type="button" class="lib-fusion-icon-btn" @click="playArtist" :title="tPlay"><v-icon>play_arrow</v-icon></button>' +
            '      <button type="button" class="lib-fusion-icon-btn" @click="shuffleArtist" :title="tShuffle"><v-icon>shuffle</v-icon></button>' +
            '     </div>' +
            '    </div>' +
            '     <div v-if="artistBio && !isNarrow" class="lib-fusion-bio">{{artistBio}}</div>' +
            '     <div v-if="loadingAlbums" class="lib-fusion-loading">{{tLoading}}</div>' +
            '     <div v-else-if="!albums.length" class="lib-fusion-empty">{{tNoAlbums}}</div>' +
            '     <div v-for="alb in albums" :key="alb.key" class="lib-fusion-album"' +
            '          :class="swipeRowClass(alb)" :style="swipeRowStyle(alb)"' +
            '          @touchstart="itemSwipeStart(alb, \'album\', $event)" @touchmove="itemSwipeMove($event)" @touchend="itemSwipeEnd($event)" @touchcancel="itemSwipeEnd($event)">' +
            '      <div class="lib-fusion-swipe-bg lib-fusion-swipe-add" aria-hidden="true"><v-icon>playlist_add</v-icon><span>{{tAdd}}</span></div>' +
            '      <div class="lib-fusion-swipe-bg lib-fusion-swipe-next" aria-hidden="true"><v-icon>playlist_play</v-icon><span>{{tPlayNext}}</span></div>' +
            '      <div class="lib-fusion-album-head" @click="onArtistAlbumClick(alb, $event)"' +
            '           @dblclick.prevent.stop="onArtistAlbumDblClick(alb)"' +
            '           @contextmenu.prevent="openCtx(alb, \'artistAlbum\', $event)"' +
            '           @mouseenter="hoverKey=alb.key" @mouseleave="hoverKey=\'\'">' +
            '       <img class="lib-fusion-album-art" :src="alb.image" loading="lazy" @error="imgErr">' +
            '       <div class="lib-fusion-album-meta">' +
            '        <div class="lib-fusion-album-title ellipsis">{{alb.title}}</div>' +
            '        <div class="lib-fusion-album-sub ellipsis subtext">{{alb.subtitle}}</div>' +
            '       </div>' +
            /* Hover play cluster sits left of ⋮ (+ expand); never covers them */
            '       <div class="lib-fusion-row-btns list-btns" v-if="!isTouch && hoverKey===alb.key" @click.stop @dblclick.stop>' +
            '        <img class="other-btn grid-btn lib-fusion-ibtn" role="button" @click.stop="addAlbum(alb)" :title="tAdd" :src="iconAdd">' +
            '        <img class="other-btn grid-btn lib-fusion-ibtn" role="button" @click.stop="insertAlbum(alb)" :title="tPlayNext" :src="iconPlayNext">' +
            '        <img class="other-btn grid-btn lib-fusion-ibtn" role="button" @click.stop="shuffleAlbum(alb)" :title="tShuffle" :src="iconShuffle">' +
            '        <img class="main-btn grid-btn lib-fusion-ibtn lib-fusion-mat-main" role="button" @click.stop="playAlbum(alb)" :title="tPlay" :src="iconPlay">' +
            '       </div>' +
            '       <div class="grid-btn list-btn hover-btn menu-btn lib-fusion-item-menu" role="button"' +
            '            @click.stop="openCtx(alb, \'artistAlbum\', $event)" :aria-label="tMenu" :title="tMenu"></div>' +
            '       <span class="lib-fusion-expand" v-if="!isNarrow" @click.stop="toggleAlbum(alb)">{{alb.expanded ? "▲" : "▼"}}</span>' +
            '       <span class="lib-fusion-chevron" v-else>›</span>' +
            '      </div>' +
            /* desktop only: expand tracks under album — Material list-like */
            '      <div v-if="!isNarrow && alb.expanded" class="lib-fusion-tracks">' +
            '       <div v-if="alb.loadingTracks" class="lib-fusion-loading">{{tLoading}}</div>' +
            '       <div v-else-if="!alb.tracks || !alb.tracks.length" class="lib-fusion-empty">{{tNoTracks}}</div>' +
            '       <div v-else class="lib-fusion-track-list">' +
            '        <div v-for="tr in alb.tracks" :key="tr.key" class="lib-fusion-track-row lib-fusion-track-row-mat"' +
            '             @mouseenter="hoverKey=tr.key" @mouseleave="hoverKey=\'\'"' +
            '             @click="playTrack(tr)"' +
            '             @contextmenu.prevent="openCtx(tr, \'track\', $event)">' +
            '         <span class="lib-fusion-track-num">{{tr.tracknum || ""}}</span>' +
            '         <span class="lib-fusion-track-title ellipsis">{{tr.title}}</span>' +
            '         <span class="lib-fusion-track-time subtext">{{tr.durationStr}}</span>' +
            '         <div class="lib-fusion-row-btns list-btns list-btns-track" v-if="!isTouch && hoverKey===tr.key" @click.stop>' +
            '          <img class="other-btn grid-btn lib-fusion-ibtn" role="button" @click.stop="addTrack(tr)" :title="tAdd" :src="iconAdd">' +
            '          <img class="other-btn grid-btn lib-fusion-ibtn" role="button" @click.stop="insertTrack(tr)" :title="tPlayNext" :src="iconPlayNext">' +
            '          <img class="main-btn grid-btn lib-fusion-ibtn lib-fusion-mat-main" role="button" @click.stop="playTrack(tr)" :title="tPlay" :src="iconPlay">' +
            '         </div>' +
            '         <div class="grid-btn list-btn hover-btn menu-btn lib-fusion-item-menu" role="button"' +
            '              @click.stop="openCtx(tr, \'track\', $event)" :aria-label="tMenu" :title="tMenu"></div>' +
            '        </div>' +
            '       </div>' +
            '      </div>' +
            '     </div>' +
            '   </div>' +
            '  </div>' +
            /* pane 2 — album tracks (narrow iPod) */
            '  <div class="lib-fusion-col lib-fusion-tracks-pane" v-if="isNarrow || drillAlbum">' +
            '   <div class="lib-fusion-col-scroll">' +
            '    <div class="lib-fusion-detail-head">' +
            '     <button type="button" class="lib-fusion-back-btn" @click.stop="drillBack" :title="tBack">‹</button>' +
            '     <img v-if="drillAlbum" class="lib-fusion-detail-art lib-fusion-detail-art-sq" :src="drillAlbum.image" loading="lazy" @error="imgErr">' +
            '     <div class="lib-fusion-detail-title ellipsis">{{drillAlbum ? drillAlbum.title : ""}}</div>' +
            '     <div class="lib-fusion-detail-actions" v-if="drillAlbum">' +
            '      <button type="button" class="lib-fusion-icon-btn" @click="playAlbum(drillAlbum)" :title="tPlay"><v-icon>play_arrow</v-icon></button>' +
            '      <button type="button" class="lib-fusion-icon-btn" @click="shuffleAlbum(drillAlbum)" :title="tShuffle"><v-icon>shuffle</v-icon></button>' +
            '     </div>' +
            '    </div>' +
            '    <div v-if="!drillAlbum" class="lib-fusion-empty">{{tNoTracks}}</div>' +
            '    <div v-else-if="drillAlbum.loadingTracks" class="lib-fusion-loading">{{tLoading}}</div>' +
            '    <div v-else-if="!drillAlbum.tracks || !drillAlbum.tracks.length" class="lib-fusion-empty">{{tNoTracks}}</div>' +
            '    <div v-else class="lib-fusion-simple-list lib-fusion-track-list">' +
            '     <div v-for="tr in drillAlbum.tracks" :key="tr.key" class="lib-fusion-track-row lib-fusion-track-row-mat lib-fusion-track-row-pad"' +
            '          :class="swipeRowClass(tr)" :style="swipeRowStyle(tr)"' +
            '          @touchstart="itemSwipeStart(tr, \'track\', $event)" @touchmove="itemSwipeMove($event)" @touchend="itemSwipeEnd($event)" @touchcancel="itemSwipeEnd($event)"' +
            '          @click="playTrack(tr)" @contextmenu.prevent="openCtx(tr, \'track\', $event)">' +
            '      <div class="lib-fusion-swipe-bg lib-fusion-swipe-add" aria-hidden="true"><v-icon>playlist_add</v-icon></div>' +
            '      <div class="lib-fusion-swipe-bg lib-fusion-swipe-next" aria-hidden="true"><v-icon>playlist_play</v-icon></div>' +
            '      <span class="lib-fusion-track-num">{{tr.tracknum || ""}}</span>' +
            '      <span class="lib-fusion-track-title ellipsis">{{tr.title}}</span>' +
            '      <span class="lib-fusion-track-time subtext">{{tr.durationStr}}</span>' +
            '      <div class="grid-btn list-btn hover-btn menu-btn lib-fusion-item-menu" role="button"' +
            '           @click.stop="openCtx(tr, \'track\', $event)" :aria-label="tMenu" :title="tMenu"></div>' +
            '     </div>' +
            '    </div>' +
            '   </div>' +
            '  </div>' +
            '  </div>' +
            ' </div>' +
            /* Albums tab — narrow: grid → tracks slide */
            ' <div v-else-if="tab===\'albums\'" class="lib-fusion-body lib-fusion-albums-tab"' +
            '      :class="isNarrow && albumDrill ? \'lib-fusion-album-drill\' : \'\'">' +
            '  <div class="lib-fusion-albums-track">' +
            '  <div class="lib-fusion-col lib-fusion-albums-grid-pane">' +
            '  <div class="lib-fusion-col-scroll">' +
            '   <div class="lib-fusion-col-head lib-fusion-tab-head">{{tAlbums}}' +
            '    <span class="lib-fusion-count" v-if="filteredAlbums.length">{{filteredAlbums.length}}</span>' +
            '    <span class="lib-fusion-count" v-if="filter && allAlbums.length && filteredAlbums.length!==allAlbums.length">/ {{allAlbums.length}}</span>' +
            '   </div>' +
            '   <div v-if="loadingAllAlbums" class="lib-fusion-loading">{{tLoading}}</div>' +
            '   <div v-else-if="!filteredAlbums.length" class="lib-fusion-empty">{{filter ? tNoMatch : tNoAlbums}}</div>' +
            '   <div v-else class="lib-fusion-album-grid">' +
            '    <div v-for="(alb, aidx) in filteredAlbums" :key="alb.key" class="lib-fusion-grid-item" :title="alb.title"' +
            '         :class="[{\'lib-fusion-kb\':kbKey===alb.key,\'lib-fusion-picked\':isSelected(alb.key)}, swipeRowClass(alb)]"' +
            '         :style="swipeRowStyle(alb)"' +
            '         @touchstart="itemSwipeStart(alb, \'album\', $event)" @touchmove="itemSwipeMove($event)" @touchend="itemSwipeEnd($event)" @touchcancel="itemSwipeEnd($event)"' +
            '         @click="onAlbumGridClick(alb, $event)" @dblclick.prevent.stop="openAlbum(alb)"' +
            '         @contextmenu.prevent="openCtx(alb, \'album\', $event)">' +
            '     <div class="lib-fusion-swipe-bg lib-fusion-swipe-add" aria-hidden="true"><v-icon>playlist_add</v-icon><span>{{tAdd}}</span></div>' +
            '     <div class="lib-fusion-swipe-bg lib-fusion-swipe-next" aria-hidden="true"><v-icon>playlist_play</v-icon><span>{{tPlayNext}}</span></div>' +
            '     <div class="lib-fusion-cover-wrap">' +
            '      <span class="lib-fusion-check lib-fusion-check-grid" v-if="selectedCount>0 || isSelected(alb.key)"' +
            '            :class="{\'lib-fusion-check-on\':isSelected(alb.key)}" @click.stop="toggleSelect(alb, $event)"></span>' +
            '      <img :src="alb.image" loading="lazy" @error="imgErr">' +
            '      <div class="lib-fusion-grid-btns" v-if="selectedCount<1 && !isTouch">' +
            '       <img class="other-btn grid-btn lib-fusion-gbtn" role="button" @click.stop="addAlbum(alb)" :title="tAdd" :src="iconAdd">' +
            '       <img class="other-btn grid-btn lib-fusion-gbtn" role="button" @click.stop="insertAlbum(alb)" :title="tPlayNext" :src="iconPlayNext">' +
            '       <img class="other-btn grid-btn lib-fusion-gbtn" role="button" @click.stop="shuffleAlbum(alb)" :title="tShuffle" :src="iconShuffle">' +
            '       <img class="main-btn grid-btn lib-fusion-gbtn lib-fusion-gbtn-main" role="button" @click.stop="playAlbum(alb)" :title="tPlay" :src="iconPlay">' +
            '      </div>' +
            '     </div>' +
            '     <div class="lib-fusion-grid-text">' +
            '      <div class="lib-fusion-grid-title ellipsis">{{alb.title}}</div>' +
            '      <div class="lib-fusion-grid-sub ellipsis subtext link-item" @click.stop="goArtist({artist:alb.artist, artistId:alb.artistId})">{{alb.artist}}</div>' +
            '      <div class="grid-btn list-btn hover-btn menu-btn lib-fusion-item-menu lib-fusion-grid-menu-side" role="button"' +
            '           @click.stop="openCtx(alb, \'album\', $event)" :aria-label="tMenu" :title="tMenu"></div>' +
            '     </div>' +
            '    </div>' +
            '   </div>' +
            '  </div>' +
            '  </div>' +
            '  <div class="lib-fusion-col lib-fusion-tracks-pane" v-if="isNarrow">' +
            '   <div class="lib-fusion-col-scroll">' +
            '    <div class="lib-fusion-detail-head">' +
            '     <button type="button" class="lib-fusion-back-btn" @click.stop="closeAlbumDrill" :title="tBack">‹</button>' +
            '     <img v-if="drillAlbum" class="lib-fusion-detail-art lib-fusion-detail-art-sq" :src="drillAlbum.image" loading="lazy" @error="imgErr">' +
            '     <div class="lib-fusion-detail-title ellipsis">{{drillAlbum ? drillAlbum.title : ""}}</div>' +
            '     <div class="lib-fusion-detail-actions" v-if="drillAlbum">' +
            '      <button type="button" class="lib-fusion-icon-btn" @click="playAlbum(drillAlbum)" :title="tPlay"><v-icon>play_arrow</v-icon></button>' +
            '      <button type="button" class="lib-fusion-icon-btn" @click="shuffleAlbum(drillAlbum)" :title="tShuffle"><v-icon>shuffle</v-icon></button>' +
            '     </div>' +
            '    </div>' +
            '    <div v-if="!drillAlbum" class="lib-fusion-empty">{{tNoTracks}}</div>' +
            '    <div v-else-if="drillAlbum.loadingTracks" class="lib-fusion-loading">{{tLoading}}</div>' +
            '    <div v-else-if="!drillAlbum.tracks || !drillAlbum.tracks.length" class="lib-fusion-empty">{{tNoTracks}}</div>' +
            '    <div v-else class="lib-fusion-simple-list lib-fusion-track-list">' +
            '     <div v-for="tr in drillAlbum.tracks" :key="tr.key" class="lib-fusion-track-row lib-fusion-track-row-mat lib-fusion-track-row-pad"' +
            '          :class="swipeRowClass(tr)" :style="swipeRowStyle(tr)"' +
            '          @touchstart="itemSwipeStart(tr, \'track\', $event)" @touchmove="itemSwipeMove($event)" @touchend="itemSwipeEnd($event)" @touchcancel="itemSwipeEnd($event)"' +
            '          @click="playTrack(tr)" @contextmenu.prevent="openCtx(tr, \'track\', $event)">' +
            '      <div class="lib-fusion-swipe-bg lib-fusion-swipe-add" aria-hidden="true"><v-icon>playlist_add</v-icon></div>' +
            '      <div class="lib-fusion-swipe-bg lib-fusion-swipe-next" aria-hidden="true"><v-icon>playlist_play</v-icon></div>' +
            '      <span class="lib-fusion-track-num">{{tr.tracknum || ""}}</span>' +
            '      <span class="lib-fusion-track-title ellipsis">{{tr.title}}</span>' +
            '      <span class="lib-fusion-track-time subtext">{{tr.durationStr}}</span>' +
            '      <div class="grid-btn list-btn hover-btn menu-btn lib-fusion-item-menu" role="button"' +
            '           @click.stop="openCtx(tr, \'track\', $event)" :aria-label="tMenu" :title="tMenu"></div>' +
            '     </div>' +
            '    </div>' +
            '   </div>' +
            '  </div>' +
            '  </div>' +
            ' </div>' +
            /* Songs tab */
            ' <div v-else class="lib-fusion-body lib-fusion-songs-tab">' +
            '  <div class="lib-fusion-col-scroll">' +
            /* Genre hierarchy: list of genres */
            '   <template v-if="songsGenreBrowse">' +
            '    <div class="lib-fusion-col-head lib-fusion-tab-head">{{tGenre}}' +
            '     <span class="lib-fusion-count" v-if="genreGroups.length">{{genreGroups.length}}</span>' +
            '    </div>' +
            '    <div v-if="loadingSongs" class="lib-fusion-loading">{{tLoading}}' +
            '     <span v-if="loadStatus" class="lib-fusion-status">{{loadStatus}}</span></div>' +
            '    <div v-else-if="!genreGroups.length" class="lib-fusion-empty">{{filter ? tNoMatch : tNoSongs}}</div>' +
            '    <RecycleScroller v-else class="lib-fusion-scroller" :items="genreGroups" :item-size="artistRowH" key-field="key" :buffer="80">' +
            '     <div slot-scope="{item}" class="lib-fusion-genre-row"' +
            '          :class="{\'lib-fusion-kb\':kbKey===item.key}"' +
            '          @click="openGenre(item)">' +
            '      <span class="lib-fusion-genre-name ellipsis">{{item.title}}</span>' +
            '      <span class="lib-fusion-genre-count">{{item.count}}</span>' +
            '      <span class="lib-fusion-chevron">›</span>' +
            '     </div>' +
            '    </RecycleScroller>' +
            '   </template>' +
            /* Songs list (normal or inside a genre) */
            '   <template v-else>' +
            '   <div class="lib-fusion-col-head lib-fusion-tab-head">' +
            '    <button v-if="activeGenre" type="button" class="lib-fusion-back-btn" @click.stop="closeGenre" :title="tBack">‹</button>' +
            '    <span class="ellipsis">{{activeGenre ? activeGenre : tSongs}}</span>' +
            '    <span class="lib-fusion-count" v-if="filteredSongs.length">{{filteredSongs.length}}</span>' +
            '    <span class="lib-fusion-count" v-if="!activeGenre && filter && songs.length && filteredSongs.length!==songs.length">/ {{songs.length}}</span>' +
            '   </div>' +
            '   <div v-if="filteredSongs.length && !loadingSongs" class="lib-fusion-song-header"' +
            '        :class="songRowClass">' +
            '    <span class="lib-fusion-check lib-fusion-check-ph" v-if="selectedCount>0"></span>' +
            '    <span class="lib-fusion-song-num-h lib-fusion-col-sort" v-if="songCols.tracknum"' +
            '          :class="{\'lib-fusion-col-sort-on\':sortSongs===\'title\'}" @click.stop="headerSort(\'title\')">#</span>' +
            '    <span class="lib-fusion-track-title lib-fusion-col-sort" v-if="songCols.title"' +
            '          :class="{\'lib-fusion-col-sort-on\':sortSongs===\'title\'}" @click.stop="headerSort(\'title\')">' +
            '     {{tTitle}}<span class="lib-fusion-col-sort-dir" v-if="sortSongs===\'title\'">{{sortSongsRev ? "▲" : "▼"}}</span></span>' +
            '    <span class="lib-fusion-song-artist lib-fusion-col-sort" v-if="songCols.artist"' +
            '          :class="{\'lib-fusion-col-sort-on\':sortSongs===\'artist\'}" @click.stop="headerSort(\'artist\')">' +
            '     {{tArtists}}<span class="lib-fusion-col-sort-dir" v-if="sortSongs===\'artist\'">{{sortSongsRev ? "▲" : "▼"}}</span></span>' +
            '    <span class="lib-fusion-song-album lib-fusion-col-sort" v-if="songCols.album"' +
            '          :class="{\'lib-fusion-col-sort-on\':sortSongs===\'album\'}" @click.stop="headerSort(\'album\')">' +
            '     {{tAlbums}}<span class="lib-fusion-col-sort-dir" v-if="sortSongs===\'album\'">{{sortSongsRev ? "▲" : "▼"}}</span></span>' +
            '    <span class="lib-fusion-song-genre lib-fusion-col-sort" v-if="songCols.genre"' +
            '          :class="{\'lib-fusion-col-sort-on\':sortSongs===\'genre\'}" @click.stop="headerSort(\'genre\')">' +
            '     {{tGenre}}<span class="lib-fusion-col-sort-dir" v-if="sortSongs===\'genre\'">{{sortSongsRev ? "▲" : "▼"}}</span></span>' +
            '    <span class="lib-fusion-song-year lib-fusion-col-sort" v-if="songCols.year"' +
            '          :class="{\'lib-fusion-col-sort-on\':sortSongs===\'year\'}" @click.stop="headerSort(\'year\')">' +
            '     {{tYear}}<span class="lib-fusion-col-sort-dir" v-if="sortSongs===\'year\'">{{sortSongsRev ? "▲" : "▼"}}</span></span>' +
            '    <span class="lib-fusion-song-added lib-fusion-col-sort" v-if="songCols.added"' +
            '          :class="{\'lib-fusion-col-sort-on\':sortSongs===\'added\'}" @click.stop="headerSort(\'added\')">' +
            '     {{tAdded}}<span class="lib-fusion-col-sort-dir" v-if="sortSongs===\'added\'">{{sortSongsRev ? "▲" : "▼"}}</span></span>' +
            '    <span class="lib-fusion-track-time lib-fusion-col-sort" v-if="songCols.duration"' +
            '          :class="{\'lib-fusion-col-sort-on\':sortSongs===\'duration\'}" @click.stop="headerSort(\'duration\')">' +
            '     {{tTime}}<span class="lib-fusion-col-sort-dir" v-if="sortSongs===\'duration\'">{{sortSongsRev ? "▲" : "▼"}}</span></span>' +
            '   </div>' +
            '   <div v-if="loadingSongs" class="lib-fusion-loading">{{tLoading}}' +
            '    <span v-if="loadStatus" class="lib-fusion-status">{{loadStatus}}</span></div>' +
            '   <div v-else-if="!filteredSongs.length" class="lib-fusion-empty">{{filter ? tNoMatch : tNoSongs}}</div>' +
            '   <RecycleScroller ref="songScroller" v-else class="lib-fusion-scroller" :items="filteredSongs" :item-size="songRowH" key-field="key" :buffer="200">' +
            '    <div slot-scope="{item}" class="lib-fusion-song-row"' +
            '         :class="[songRowClass, swipeRowClass(item), {\'lib-fusion-kb\':kbKey===item.key,\'lib-fusion-picked\':isSelected(item.key)}]"' +
            '         :style="swipeRowStyle(item)"' +
            '         @touchstart="itemSwipeStart(item, \'track\', $event)" @touchmove="itemSwipeMove($event)" @touchend="itemSwipeEnd($event)" @touchcancel="itemSwipeEnd($event)"' +
            '         @mouseenter="hoverKey=item.key" @mouseleave="hoverKey=\'\'"' +
            '         @click="onSongClick(item, $event)" @contextmenu.prevent="openCtx(item, \'track\', $event)">' +
            '     <div class="lib-fusion-swipe-bg lib-fusion-swipe-add" aria-hidden="true"><v-icon>playlist_add</v-icon></div>' +
            '     <div class="lib-fusion-swipe-bg lib-fusion-swipe-next" aria-hidden="true"><v-icon>playlist_play</v-icon></div>' +
            '     <span class="lib-fusion-check" v-if="selectedCount>0 || isSelected(item.key)"' +
            '           :class="{\'lib-fusion-check-on\':isSelected(item.key)}" @click.stop="toggleSelect(item, $event)"></span>' +
            '     <span class="lib-fusion-song-num subtext" v-if="songCols.tracknum">{{item.tracknum || ""}}</span>' +
            '     <span class="lib-fusion-song-main">' +
            '      <span class="lib-fusion-track-title ellipsis" v-if="songCols.title" :title="item.title">{{item.title}}</span>' +
            '      <span class="lib-fusion-song-artist ellipsis subtext" v-if="songCols.artist"' +
            '            :class="{\'link-item\': !!item.artistId || !!item.artist}"' +
            '            @click.stop="goArtist(item)" :title="item.artist">{{item.artist}}</span>' +
            '     </span>' +
            '     <span class="lib-fusion-song-album ellipsis subtext" v-if="songCols.album"' +
            '           :class="{\'link-item\': !!item.albumId}"' +
            '           @click.stop="goAlbum(item)" :title="item.album">{{item.album}}</span>' +
            '     <span class="lib-fusion-song-genre ellipsis subtext" v-if="songCols.genre" :title="item.genre">{{item.genre}}</span>' +
            '     <span class="lib-fusion-song-year subtext" v-if="songCols.year">{{item.year || ""}}</span>' +
            '     <span class="lib-fusion-song-added subtext" v-if="songCols.added" :title="item.addedStr">{{item.addedStr}}</span>' +
            '     <span class="lib-fusion-track-time subtext" v-if="songCols.duration">{{item.durationStr}}</span>' +
            '     <div class="lib-fusion-row-btns" v-if="selectedCount<1 && !isTouch && hoverKey===item.key" @click.stop>' +
            '      <img class="lib-fusion-ibtn" role="button" @click.stop="addTrack(item)" :title="tAdd" :src="iconAdd">' +
            '      <img class="lib-fusion-ibtn" role="button" @click.stop="insertTrack(item)" :title="tPlayNext" :src="iconPlayNext">' +
            '      <img class="lib-fusion-ibtn lib-fusion-mat-main" role="button" @click.stop="playTrack(item)" :title="tPlay" :src="iconPlay">' +
            '     </div>' +
            '     <div class="grid-btn list-btn hover-btn menu-btn lib-fusion-item-menu" role="button"' +
            '          @click.stop="openCtx(item, \'track\', $event)" :aria-label="tMenu" :title="tMenu"></div>' +
            '    </div>' +
            '   </RecycleScroller>' +
            '   </template>' +
            '  </div>' +
            ' </div>' +
            ' </div>' + /* end slide-root */
            ' </transition>' +
            ' </div>' + /* end slide-host */
            /* A–Z lexicon on the border */
            ' <div class="lib-fusion-jumplist noselect" v-if="jumplist.length>1"' +
            '      :class="jlSideClass"' +
            '      @touchstart.prevent="jlTouchStart" @touchmove.prevent="jlTouchMove" @touchend="jlTouchEnd" @touchcancel="jlTouchEnd">' +
            '  <div class="lib-fusion-jl-inner">' +
            '   <div v-for="(j, ji) in jumplist" :key="\'jl-\'+j.key+ji" class="lib-fusion-jl-key"' +
            '        :class="{\'lib-fusion-jl-active\':jlActive===ji}"' +
            '        @click.stop="jumpToLetter(j.key)">{{j.key}}</div>' +
            '  </div>' +
            ' </div>' +
            '</div>',
        props: {
            playerId: { type: String, default: '' }
        },
        data: function() {
            var tab = 'artists';
            try {
                if (typeof getLocalStorageVal === 'function') {
                    tab = getLocalStorageVal('libFusionTab', 'artists') || 'artists';
                }
            } catch (e) {}
            // Defaults from Ma musique / Material album & track sort prefs
            var mmAlb = mapMyMusicAlbumSort();
            var sortA = 'name';
            var sortL = mmAlb.primary || 'album';
            var sortS = 'title';
            var sortA2 = 'none';
            var sortL2 = mmAlb.secondary || 'none';
            var sortS2 = 'none';
            var sortARev = false;
            var sortLRev = !!mmAlb.reverse;
            var sortSRev = false;
            var songCols = Object.assign({}, DEFAULT_SONG_COLS);
            try {
                if (typeof getLocalStorageVal === 'function') {
                    // Only override with fusion-local keys when the user has set them
                    var hasFusionL = getLocalStorageVal('libFusionSortL', '') !== '';
                    var hasFusionS = getLocalStorageVal('libFusionSortS', '') !== '';
                    var rawA = getLocalStorageVal('libFusionSortA', 'name') || 'name';
                    var rawL = hasFusionL
                        ? (getLocalStorageVal('libFusionSortL', 'album') || 'album')
                        : (mmAlb.primary || 'album');
                    var rawS = hasFusionS
                        ? (getLocalStorageVal('libFusionSortS', 'title') || 'title')
                        : 'title';
                    sortA = migrateSortPrimary(rawA);
                    sortL = migrateSortPrimary(rawL);
                    sortS = migrateSortPrimary(rawS);
                    if (hasFusionL) {
                        sortL2 = getLocalStorageVal('libFusionSortL2', migrateSortSecondary(rawL)) || 'none';
                        sortLRev = getLocalStorageVal('libFusionSortLRev', migrateSortReverse(rawL) ? '1' : '0') === '1';
                    } else {
                        sortL2 = mmAlb.secondary || 'none';
                        sortLRev = !!mmAlb.reverse;
                    }
                    sortA2 = getLocalStorageVal('libFusionSortA2', migrateSortSecondary(rawA)) || 'none';
                    sortS2 = hasFusionS
                        ? (getLocalStorageVal('libFusionSortS2', migrateSortSecondary(rawS)) || 'none')
                        : 'none';
                    sortARev = getLocalStorageVal('libFusionSortARev', migrateSortReverse(rawA) ? '1' : '0') === '1';
                    sortSRev = hasFusionS
                        ? (getLocalStorageVal('libFusionSortSRev', migrateSortReverse(rawS) ? '1' : '0') === '1')
                        : false;
                    var rawCols = getLocalStorageVal('libFusionSongCols', '');
                    if (rawCols) {
                        try {
                            var parsed = JSON.parse(rawCols);
                            if (parsed && typeof parsed === 'object') {
                                songCols = Object.assign({}, DEFAULT_SONG_COLS, parsed);
                                songCols.title = true;
                            }
                        } catch (e2) {}
                    }
                }
            } catch (e) {}
            return {
                tab: tab,
                filter: '',
                artists: [],
                albums: [],
                allAlbums: [],
                songs: [],
                activeGenre: null, /* when Sort by Genre: drilled into this genre name */
                selectedArtist: null,
                artistBio: '',
                loadingArtists: false,
                loadingAlbums: false,
                loadingAllAlbums: false,
                loadingSongs: false,
                loadStatus: '',
                err: '',
                // Vue 2 does NOT proxy data keys starting with _ or $
                artistReqId: 0,
                hoverKey: '',
                kbKey: '',
                kbIndex: -1,
                selectedMap: {},
                showSort: false,
                showDisp: false,
                songCols: songCols,
                songColDefs: SONG_COLS,
                sortArtists: sortA,
                sortAlbums: sortL,
                sortSongs: sortS,
                sortArtists2: sortA2,
                sortAlbums2: sortL2,
                sortSongs2: sortS2,
                sortArtistsRev: sortARev,
                sortAlbumsRev: sortLRev,
                sortSongsRev: sortSRev,
                tSortPrimary: 'Sort by',
                tSortThen: 'Then by',
                tSortReverse: 'Reverse',
                ctx: { show: false, x: 0, y: 0, title: '', kind: '', item: null, actions: [] },
                filterOpen: false,
                drillLevel: 0, /* 0=artists, 1=albums, 2=tracks (narrow) */
                albumDrill: false, /* albums tab track slide */
                drillAlbum: null,
                isNarrow: false,
                isTouch: false,
                itemSwipe: null, /* reactive: swipe-to-add state */
                tabDir: 'fwd', /* push animation direction */
                chromeCollapsed: false, /* scroll-down hides tabs + section heads */
                songRowH: SONG_ROW_H,
                artistRowH: ARTIST_ROW_H,
                darkUi: true,
                iconPlay: '',
                iconAdd: '',
                iconPlayNext: '',
                iconShuffle: '',
                iconSearch: '',
                tArtists: 'Artists',
                tAlbums: 'Albums',
                tSongs: 'Songs',
                tClose: 'Close',
                tPlay: 'Play',
                tAdd: 'Add',
                tPlayNext: 'Play next',
                tShuffle: 'Shuffle',
                tLoading: 'Loading…',
                tFilter: 'Filter…',
                tSort: 'Sort',
                tDisplay: 'Display',
                tDisplayCols: 'Columns',
                tTitle: 'Title',
                tGenre: 'Genre',
                tYear: 'Year',
                tAdded: 'Added',
                tTime: 'Time',
                tInvert: 'Invert',
                tClear: 'Clear',
                tBack: 'Back',
                tMenu: 'Menu',
                tNoMatch: 'No matches',
                tNoArtists: 'No artists',
                tNoAlbums: 'No albums',
                tNoTracks: 'No tracks',
                tNoSongs: 'No songs',
                tSelectArtist: 'Select an artist',
                jlActive: -1
            };
        },
        computed: {
            jumplistKind: function() {
                if (this.tab === 'albums') { return 'album'; }
                if (this.tab === 'songs') {
                    // Genre browse list uses genre titles
                    if (this.songsGenreBrowse) { return 'genreGroup'; }
                    return 'song';
                }
                return 'artist';
            },
            jumplistPrimary: function() {
                if (this.tab === 'albums') { return this.sortAlbums || 'album'; }
                if (this.tab === 'songs') {
                    if (this.songsGenreBrowse) { return 'name'; }
                    // Inside a genre, list is ordered by secondary / title
                    if (this.songsGenreMode && this.activeGenre) {
                        var s2 = this.sortSongs2 && this.sortSongs2 !== 'none' && this.sortSongs2 !== 'genre'
                            ? this.sortSongs2 : 'title';
                        return s2;
                    }
                    return this.sortSongs || 'title';
                }
                return this.sortArtists || 'name';
            },
            jumplist: function() {
                var list = this.activeList || [];
                var keys = [];
                var seen = {};
                var kind = this.jumplistKind;
                var primary = this.jumplistPrimary;
                for (var i = 0; i < list.length; i++) {
                    var ch;
                    if (kind === 'genreGroup') {
                        ch = sortLetter(list[i].title);
                    } else {
                        ch = jlLetter(list[i], primary, kind);
                    }
                    if (!seen[ch]) {
                        seen[ch] = true;
                        keys.push({ key: ch, index: i });
                    }
                }
                return keys;
            },
            tabIndex: function() {
                return this.tab === 'albums' ? 1 : this.tab === 'songs' ? 2 : 0;
            },
            segPillStyle: function() {
                return { '--pill-i': String(this.tabIndex) };
            },
            pushName: function() {
                return this.tabDir === 'back' ? 'fusion-push-back' : 'fusion-push';
            },
            jlSideClass: function() {
                try {
                    if (this.$store && this.$store.state && this.$store.state.jumplistSide === 'right') {
                        return 'lib-fusion-jl-right';
                    }
                } catch (e) {}
                return 'lib-fusion-jl-left';
            },
            filterQ: function() {
                return String(this.filter || '').trim().toLowerCase();
            },
            songsGenreMode: function() {
                return this.tab === 'songs' && this.sortSongs === 'genre';
            },
            /** Genre list (not drilled into a genre yet) */
            songsGenreBrowse: function() {
                return this.songsGenreMode && !this.activeGenre;
            },
            songRowClass: function() {
                var c = this.songCols || {};
                var parts = ['lib-fusion-song-row'];
                if (c.tracknum) {
                    parts.push('has-num');
                }
                if (c.artist) {
                    parts.push('has-artist');
                }
                if (c.album) {
                    parts.push('has-album');
                }
                if (c.genre) {
                    parts.push('has-genre');
                }
                if (c.year) {
                    parts.push('has-year');
                }
                if (c.added) {
                    parts.push('has-added');
                }
                if (c.duration) {
                    parts.push('has-time');
                }
                return parts.join(' ');
            },
            selectedCount: function() {
                var n = 0;
                var m = this.selectedMap;
                for (var k in m) {
                    if (m[k]) {
                        n++;
                    }
                }
                return n;
            },
            currentSortOptions: function() {
                if (this.tab === 'albums') {
                    return ALBUM_SORTS;
                }
                if (this.tab === 'songs') {
                    return SONG_SORTS;
                }
                return ARTIST_SORTS;
            },
            currentSortId: function() {
                if (this.tab === 'albums') {
                    return this.sortAlbums;
                }
                if (this.tab === 'songs') {
                    return this.sortSongs;
                }
                return this.sortArtists;
            },
            currentSortLabel: function() {
                var id = this.currentSortId;
                var opts = this.currentSortOptions;
                for (var i = 0; i < opts.length; i++) {
                    if (opts[i].id === id) {
                        return opts[i].label;
                    }
                }
                return 'Sort';
            },
            currentSecondaryOptions: function() {
                var primary = this.currentSortId;
                var opts = [SORT_NONE].concat(this.currentSortOptions.filter(function(o) {
                    return o.id !== primary;
                }));
                return opts;
            },
            currentSort2Id: function() {
                if (this.tab === 'albums') { return this.sortAlbums2 || 'none'; }
                if (this.tab === 'songs') { return this.sortSongs2 || 'none'; }
                return this.sortArtists2 || 'none';
            },
            currentSortRev: function() {
                if (this.tab === 'albums') { return !!this.sortAlbumsRev; }
                if (this.tab === 'songs') { return !!this.sortSongsRev; }
                return !!this.sortArtistsRev;
            },
            filteredArtists: function() {
                var q = this.filterQ;
                var list = this.artists;
                if (q) {
                    list = list.filter(function(a) {
                        return matchFilter(a.title, q);
                    });
                }
                return this.sortList(list, this.sortArtists, this.sortArtists2, this.sortArtistsRev, 'artist');
            },
            filteredAlbums: function() {
                var q = this.filterQ;
                var list = this.allAlbums;
                if (q) {
                    list = list.filter(function(a) {
                        return matchFilter(a.title, q) || matchFilter(a.artist, q) || matchFilter(a.genre, q);
                    });
                }
                return this.sortList(list, this.sortAlbums, this.sortAlbums2, this.sortAlbumsRev, 'album');
            },
            /** Songs matching text filter (before genre drill / column sort) */
            textFilteredSongs: function() {
                var q = this.filterQ;
                var list = this.songs;
                if (q) {
                    list = list.filter(function(s) {
                        return s._q ? s._q.indexOf(q) !== -1
                            : matchFilter(s.title, q) || matchFilter(s.artist, q) || matchFilter(s.album, q) || matchFilter(s.genre, q);
                    });
                }
                return list;
            },
            genreGroups: function() {
                var list = this.textFilteredSongs;
                var map = {};
                var groups = [];
                for (var i = 0; i < list.length; i++) {
                    var g = (list[i].genre && String(list[i].genre).trim()) || '';
                    if (!g) { g = '—'; }
                    if (!map[g]) {
                        map[g] = { key: 'genre-' + g, title: g, count: 0 };
                        groups.push(map[g]);
                    }
                    map[g].count++;
                }
                var rev = !!this.sortSongsRev;
                groups.sort(function(a, b) {
                    return cmpSortKey(a.title, b.title);
                });
                if (rev) {
                    groups.reverse();
                }
                return groups;
            },
            filteredSongs: function() {
                var list = this.textFilteredSongs;
                // Sort-by-Genre drill: only songs in the open genre
                if (this.songsGenreMode && this.activeGenre) {
                    var gName = this.activeGenre;
                    list = list.filter(function(s) {
                        var g = (s.genre && String(s.genre).trim()) || '—';
                        return g === gName;
                    });
                    // Inside a genre, sort by title (or secondary) — not by genre again
                    return this.sortList(list, this.sortSongs2 && this.sortSongs2 !== 'none' && this.sortSongs2 !== 'genre'
                        ? this.sortSongs2 : 'title', 'none', this.sortSongsRev, 'song');
                }
                // Genre browse mode: song scroller hidden; return empty for counts in other UIs
                if (this.songsGenreMode && !this.activeGenre) {
                    return [];
                }
                return this.sortList(list, this.sortSongs, this.sortSongs2, this.sortSongsRev, 'song');
            },
            activeList: function() {
                if (this.tab === 'albums') {
                    return this.filteredAlbums;
                }
                if (this.tab === 'songs') {
                    if (this.songsGenreBrowse) {
                        return this.genreGroups;
                    }
                    return this.filteredSongs;
                }
                return this.filteredArtists;
            },
            ctxStyle: function() {
                return {
                    left: (this.ctx.x || 0) + 'px',
                    top: (this.ctx.y || 0) + 'px'
                };
            },
            filterExpanded: function() {
                return !!(this.filterOpen || this.filter);
            }
        },
        watch: {
            filter: function() {
                this.resetKbNav(true);
                this.$nextTick(function() {
                    this.syncSelectionToFilter();
                }.bind(this));
            },
            filteredArtists: function(list) {
                if (this.tab === 'artists') {
                    this.ensureArtistInList(list);
                }
            }
        },
        mounted: function() {
            try {
                this.isTouch = !!(typeof IS_MOBILE !== 'undefined' && IS_MOBILE) ||
                    (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
            } catch (e) {}
            this.syncTheme();
            this.localize();
            this.bootstrap();
            this._onDocClick = function(ev) {
                if (!ev || !ev.target) { return; }
                // Ignore the same click that opened a menu
                if (this._ignoreDocClick) { return; }
                // Let header / menus handle their own clicks first
                if (ev.target.closest && ev.target.closest('.lib-fusion-tabs, .lib-fusion-sort-menu, .lib-fusion-disp-menu, .lib-fusion-ctx, .lib-fusion-filter-wrap, .lib-fusion-sort-wrap, .lib-fusion-disp-wrap')) {
                    return;
                }
                if (this.showSort) {
                    this.showSort = false;
                }
                if (this.showDisp) {
                    this.showDisp = false;
                }
            }.bind(this);
            this._onResize = function() {
                this.updateNarrow();
            }.bind(this);
            this._lastChromeScrollTop = 0;
            this._onChromeScroll = function(ev) {
                this.handleChromeScroll(ev);
            }.bind(this);
            document.addEventListener('click', this._onDocClick, false);
            window.addEventListener('resize', this._onResize);
            // Capture scroll from nested RecycleScroller / col-scroll panels
            if (this.$el && this.$el.addEventListener) {
                this.$el.addEventListener('scroll', this._onChromeScroll, true);
            }
            this.updateNarrow();
            /* Sync pinch-zoom token for album grid */
            try {
                if (typeof browseZoomSetCss === 'function' && typeof browseZoomReadStored === 'function') {
                    browseZoomSetCss(browseZoomReadStored());
                }
            } catch (e) {}
            this._onFusionEsc = function(ack) {
                // Browse asks whether fusion consumed ESC (filter, menus, selection)
                var handled = this.consumeEsc();
                if (typeof ack === 'function') {
                    ack(handled);
                }
            }.bind(this);
            this._onFusionBack = function(ack) {
                // ⌘/Alt+← : one drill level back inside unity when possible
                var handled = false;
                if (this.showSort) {
                    this.showSort = false;
                    handled = true;
                } else if (this.showDisp) {
                    this.showDisp = false;
                    handled = true;
                } else if (this.ctx && this.ctx.show) {
                    this.closeCtx();
                    handled = true;
                } else if (this.activeGenre) {
                    this.closeGenre();
                    handled = true;
                } else if (this.isNarrow && this.tab === 'artists' && this.drillLevel > 0) {
                    this.drillBack();
                    handled = true;
                } else if (this.isNarrow && this.tab === 'albums' && this.albumDrill) {
                    this.closeAlbumDrill();
                    handled = true;
                }
                if (typeof ack === 'function') {
                    ack(handled);
                }
            }.bind(this);
            if (typeof bus !== 'undefined') {
                bus.$on('fusionHandleEsc', this._onFusionEsc);
                bus.$on('fusionHandleBack', this._onFusionBack);
            }
            this.$nextTick(function() {
                try {
                    if (this.$el && this._onChromeScroll && !this._scrollBound) {
                        this.$el.addEventListener('scroll', this._onChromeScroll, true);
                        this._scrollBound = true;
                    }
                    if (this.$refs.root) {
                        this.$refs.root.focus({ preventScroll: true });
                    }
                } catch (e) {}
            }.bind(this));
        },
        beforeDestroy: function() {
            if (this._filterTimer) {
                clearTimeout(this._filterTimer);
                this._filterTimer = null;
            }
            if (this._onDocClick) {
                document.removeEventListener('click', this._onDocClick, false);
            }
            if (this._onResize) {
                window.removeEventListener('resize', this._onResize);
            }
            if (this.$el && this._onChromeScroll) {
                try { this.$el.removeEventListener('scroll', this._onChromeScroll, true); } catch (e) {}
            }
            if (typeof bus !== 'undefined' && this._onFusionEsc) {
                bus.$off('fusionHandleEsc', this._onFusionEsc);
            }
            if (typeof bus !== 'undefined' && this._onFusionBack) {
                bus.$off('fusionHandleBack', this._onFusionBack);
            }
            this.setChromeCollapsed(false);
        },
        methods: {
            handleChromeScroll: function(ev) {
                var t = ev && ev.target;
                if (!t || t === document || t === window || t === this.$el) {
                    return;
                }
                var isScrollHost = t.classList && (
                    t.classList.contains('lib-fusion-scroller') ||
                    t.classList.contains('lib-fusion-col-scroll') ||
                    t.classList.contains('vue-recycle-scroller') ||
                    (t.classList.contains('lib-fusion-album-grid') && t.scrollHeight > t.clientHeight)
                );
                if (!isScrollHost && !(t.scrollHeight > t.clientHeight + 4)) {
                    return;
                }
                if (t.scrollHeight < t.clientHeight + 40) {
                    return;
                }
                var st = t.scrollTop || 0;
                var last = this._lastChromeScrollTop;
                if (this._lastChromeScrollEl !== t) {
                    this._lastChromeScrollEl = t;
                    last = st;
                }
                this._lastChromeScrollTop = st;
                this._lastChromeScrollEl = t;
                // Gentler thresholds so small scrolls don't thrash headers
                if (st <= 24) {
                    this.setChromeCollapsed(false);
                } else if (st > last + 12) {
                    this.setChromeCollapsed(true);
                } else if (st < last - 12) {
                    this.setChromeCollapsed(false);
                }
            },
            setChromeCollapsed: function(collapsed) {
                collapsed = !!collapsed;
                if (this.chromeCollapsed === collapsed) {
                    return;
                }
                // Only section heads hide — My Music subheader + tab strip stay put
                this.chromeCollapsed = collapsed;
            },
            updateNarrow: function() {
                var w = typeof window !== 'undefined' ? window.innerWidth : 1200;
                this.isNarrow = w <= 799;
                this.songRowH = this.isNarrow ? SONG_ROW_H_NARROW : SONG_ROW_H;
                if (!this.isNarrow) {
                    this.drillLevel = 0;
                    this.albumDrill = false;
                }
            },
            openFilter: function() {
                this.chromeTouchBlock();
                this.filterOpen = true;
                this.$nextTick(function() {
                    try {
                        if (this.$refs.filterInput) {
                            this.$refs.filterInput.focus();
                        }
                    } catch (e) {}
                }.bind(this));
            },
            onFilterBlur: function() {
                var self = this;
                // Delay so clear button still works
                setTimeout(function() {
                    if (!self.filter) {
                        self.filterOpen = false;
                    }
                }, 150);
            },
            onFilterKey: function(e) {
                if (!e) {
                    return;
                }
                if (e.key === 'Escape') {
                    // Filter mode: always just reset filter (never leave unity)
                    this.resetFilter();
                    e.preventDefault();
                    e.stopPropagation();
                    if (e.stopImmediatePropagation) {
                        try { e.stopImmediatePropagation(); } catch (err) {}
                    }
                    return;
                }
                // Arrow / Enter from filter field: leave the field and drive list kb nav
                // so every filtered match is reachable without a mouse click first.
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    try { e.target && e.target.blur(); } catch (err) {}
                    try { this.$refs.root && this.$refs.root.focus({ preventScroll: true }); } catch (err2) {}
                    if (e.key === 'Enter') {
                        if (this.kbIndex < 0 || this.kbIndex >= this.activeList.length) {
                            this.moveKb(1);
                        }
                        this.activateKb();
                    } else {
                        this.moveKb(e.key === 'ArrowDown' ? 1 : -1);
                    }
                }
            },
            /**
             * Reset arrow-key cursor (and optionally scroll list to top).
             * Call whenever the visible list changes via filter / clear so the
             * cursor is not stuck past the new list length.
             */
            resetKbNav: function(scrollTop) {
                this.kbIndex = -1;
                this.kbKey = '';
                if (!scrollTop) {
                    return;
                }
                this.$nextTick(function() {
                    try {
                        var scroller = null;
                        if (this.tab === 'artists' && this.drillLevel === 0) {
                            scroller = this.$refs.artistScroller;
                        } else if (this.tab === 'songs') {
                            scroller = this.$refs.songScroller;
                        }
                        if (scroller) {
                            if (typeof scroller.scrollToItem === 'function') {
                                scroller.scrollToItem(0);
                            } else if (scroller.$el) {
                                scroller.$el.scrollTop = 0;
                            }
                        }
                        var col = this.$el && this.$el.querySelector('.lib-fusion-col-scroll');
                        if (col) {
                            col.scrollTop = 0;
                        }
                        var grid = this.$el && this.$el.querySelector('.lib-fusion-album-grid');
                        if (grid && grid.parentElement) {
                            /* albums grid often scrolls via column */
                            var pane = grid.closest('.lib-fusion-col-scroll') || grid.parentElement;
                            if (pane && pane.scrollTop != null) {
                                pane.scrollTop = 0;
                            }
                        }
                    } catch (e) {}
                }.bind(this));
            },
            /** Keep RecycleScroller / grid viewport on the current kb cursor. */
            scrollKbIntoView: function() {
                var idx = this.kbIndex;
                if (idx < 0) {
                    return;
                }
                this.$nextTick(function() {
                    try {
                        var scroller = null;
                        if (this.tab === 'artists' && this.drillLevel === 0) {
                            scroller = this.$refs.artistScroller;
                        } else if (this.tab === 'songs') {
                            scroller = this.$refs.songScroller;
                        }
                        if (scroller && typeof scroller.scrollToItem === 'function') {
                            scroller.scrollToItem(idx);
                            return;
                        }
                        var col = this.$el && this.$el.querySelector('.lib-fusion-col-scroll');
                        if (!col) {
                            return;
                        }
                        if (this.tab === 'albums') {
                            var items = col.querySelectorAll('.lib-fusion-grid-item');
                            if (items[idx] && typeof items[idx].scrollIntoView === 'function') {
                                items[idx].scrollIntoView({ block: 'nearest', behavior: 'auto' });
                            }
                        } else {
                            var rowH = this.tab === 'artists' ? this.artistRowH : this.songRowH;
                            var top = idx * rowH;
                            var viewH = col.clientHeight || 0;
                            if (top < col.scrollTop) {
                                col.scrollTop = Math.max(0, top - 8);
                            } else if (top + rowH > col.scrollTop + viewH) {
                                col.scrollTop = Math.max(0, top + rowH - viewH + 8);
                            }
                        }
                    } catch (e) {}
                }.bind(this));
            },
            onFilterInput: function(ev) {
                var self = this;
                var v = ev && ev.target ? ev.target.value : '';
                this.filterOpen = true;
                if (this._filterTimer) {
                    clearTimeout(this._filterTimer);
                }
                // Debounce so typing 1950 songs doesn't refilter every keystroke
                this._filterTimer = setTimeout(function() {
                    self.filter = v;
                    self.resetKbNav(true);
                    self._filterTimer = null;
                    self.$nextTick(function() {
                        self.syncSelectionToFilter();
                    });
                }, 120);
            },
            clearFilter: function() {
                // Clear button: empty the field but stay in filter mode
                this.filter = '';
                this.resetKbNav(true);
                this.filterOpen = true;
                this.$nextTick(function() {
                    this.syncSelectionToFilter();
                    try {
                        if (this.$refs.filterInput) {
                            this.$refs.filterInput.value = '';
                            this.$refs.filterInput.focus();
                        }
                    } catch (e) {}
                }.bind(this));
            },
            /** ESC: exit filter mode completely (clear term + collapse field) */
            resetFilter: function() {
                if (this._filterTimer) {
                    clearTimeout(this._filterTimer);
                    this._filterTimer = null;
                }
                this.filter = '';
                this.filterOpen = false;
                this.resetKbNav(true);
                try {
                    if (this.$refs.filterInput) {
                        this.$refs.filterInput.value = '';
                        this.$refs.filterInput.blur();
                    }
                } catch (e) {}
                this.$nextTick(function() {
                    this.syncSelectionToFilter();
                    try {
                        if (this.$refs.root) {
                            this.$refs.root.focus({ preventScroll: true });
                        }
                    } catch (e2) {}
                }.bind(this));
            },
            /**
             * Handle ESC while fusion is active.
             * Returns true if consumed (caller must not leave unity).
             */
            consumeEsc: function() {
                if (this.showSort) {
                    this.showSort = false;
                    return true;
                }
                if (this.showDisp) {
                    this.showDisp = false;
                    return true;
                }
                if (this.ctx && this.ctx.show) {
                    this.closeCtx();
                    return true;
                }
                if (this.activeGenre) {
                    this.closeGenre();
                    return true;
                }
                if (this.selectedCount > 0) {
                    this.clearSelection();
                    return true;
                }
                // Filter mode open or has a term → only reset filter
                if (this.filterOpen || this.filterExpanded || (this.filter && String(this.filter).length)) {
                    this.resetFilter();
                    return true;
                }
                return false;
            },
            drillBack: function() {
                if (this.drillLevel >= 2) {
                    this.drillLevel = 1;
                    this.drillAlbum = null;
                    return;
                }
                this.drillLevel = 0;
            },
            /* ---- Pinch-zoom, swipe-back, swipe-to-add ---- */
            fusionPinchDist: function(touches) {
                if (!touches || touches.length < 2) {
                    return 0;
                }
                var dx = touches[0].clientX - touches[1].clientX;
                var dy = touches[0].clientY - touches[1].clientY;
                return Math.hypot(dx, dy);
            },
            fusionGestureStart: function(ev) {
                var base = 1;
                try {
                    if (typeof browseZoomReadStored === 'function') {
                        base = browseZoomReadStored();
                    } else if (this.$el) {
                        base = parseFloat(this.$el.style.getPropertyValue('--browse-zoom')) || 1;
                    }
                } catch (e) {}
                this._fusionGesture = { base: base };
            },
            fusionGestureChange: function(ev) {
                if (!this._fusionGesture) { return; }
                var scale = (ev && ev.scale) || 1;
                this.fusionApplyZoom(this._fusionGesture.base * scale, false);
            },
            fusionGestureEnd: function() {
                if (!this._fusionGesture) { return; }
                this._fusionGesture = null;
                try {
                    if (typeof browseZoomApplyLevel === 'function' && typeof _browseZoomLevel !== 'undefined') {
                        browseZoomApplyLevel(_browseZoomLevel, true);
                    }
                } catch (e) {}
            },
            fusionTouchStart: function(ev) {
                if (!ev || !ev.touches) {
                    this._navSwipe = null;
                    this._fusionPinch = null;
                    return;
                }
                /* Pinch-zoom (albums grid primarily) */
                if (ev.touches.length >= 2) {
                    this._navSwipe = null;
                    this.itemSwipe = null;
                    var base = 1;
                    try {
                        if (this.$el) {
                            var cur = parseFloat(this.$el.style.getPropertyValue('--browse-zoom'));
                            if (!isNaN(cur) && cur > 0) { base = cur; }
                        }
                        if (base === 1 && typeof browseZoomReadStored === 'function') {
                            base = browseZoomReadStored();
                        }
                    } catch (e) {}
                    this._fusionPinch = {
                        dist: this.fusionPinchDist(ev.touches),
                        zoom: base
                    };
                    try { ev.preventDefault(); } catch (e2) {}
                    return;
                }
                if (ev.touches.length !== 1) {
                    this._navSwipe = null;
                    return;
                }
                /* Chrome controls / row buttons: never start swipe (iOS ghost-click → toolbar) */
                if (ev.target && ev.target.closest &&
                    ev.target.closest('.lib-fusion-tabs, .lib-fusion-filter-wrap, .lib-fusion-sort-wrap, .lib-fusion-disp-wrap, .lib-fusion-sort-menu, .lib-fusion-grid-btns, .lib-fusion-row-btns, .lib-fusion-icon-btn, .lib-fusion-gbtn, .lib-fusion-mat-btn, button, .lib-fusion-check, input, textarea')) {
                    this._navSwipe = null;
                    this.chromeTouchBlock();
                    return;
                }
                var t = ev.touches[0];
                this._navSwipe = { x: t.clientX, y: t.clientY, t: Date.now() };
            },
            /**
             * Mark Unity chrome interaction so toolbar player/nav drawer ignores
             * the delayed iOS synthetic click that can land on the player title.
             */
            chromeTouchBlock: function(ev) {
                try {
                    if (typeof window !== 'undefined') {
                        window._mskFusionChromeTouch = Date.now();
                    }
                } catch (e) {}
                this._navSwipe = null;
            },
            fusionTouchMove: function(ev) {
                if (this._fusionPinch && ev.touches && ev.touches.length >= 2) {
                    var dist = this.fusionPinchDist(ev.touches);
                    if (dist >= 8 && this._fusionPinch.dist >= 8) {
                        try { ev.preventDefault(); } catch (e) {}
                        var ratio = dist / this._fusionPinch.dist;
                        this.fusionApplyZoom(this._fusionPinch.zoom * Math.pow(ratio, 0.85), false);
                    }
                    return;
                }
                if (this.itemSwipe && this.itemSwipe.active) {
                    this._navSwipe = null;
                    return;
                }
                if (!this._navSwipe || !ev.touches || !ev.touches.length) {
                    return;
                }
                var t = ev.touches[0];
                var dx = t.clientX - this._navSwipe.x;
                var dy = Math.abs(t.clientY - this._navSwipe.y);
                if (dy > Math.abs(dx) && dy > 18) {
                    this._navSwipe = null;
                }
            },
            fusionTouchEnd: function(ev) {
                if (this._fusionPinch) {
                    try {
                        if (typeof browseZoomApplyLevel === 'function' && typeof _browseZoomLevel !== 'undefined') {
                            browseZoomApplyLevel(_browseZoomLevel, true);
                        } else if (typeof setLocalStorageVal === 'function' && this.$el) {
                            var z = parseFloat(this.$el.style.getPropertyValue('--browse-zoom')) || 1;
                            setLocalStorageVal('browseZoom', z);
                        }
                    } catch (e) {}
                    this._fusionPinch = null;
                    this._navSwipe = null;
                    if (typeof browseZoomBlockNav === 'function') {
                        browseZoomBlockNav(800);
                    }
                    return;
                }
                if (this.itemSwipe && this.itemSwipe.active) {
                    this._navSwipe = null;
                    return;
                }
                var s = this._navSwipe;
                this._navSwipe = null;
                if (!s || !ev.changedTouches || !ev.changedTouches.length) {
                    return;
                }
                var t = ev.changedTouches[0];
                var dx = t.clientX - s.x;
                var dy = Math.abs(t.clientY - s.y);
                if (dx < 48 || dx <= dy * 1.1) {
                    return;
                }
                /* Right swipe → go back in drill hierarchy */
                if (this.isNarrow) {
                    if (this.tab === 'artists' && this.drillLevel > 0) {
                        this.drillBack();
                        return;
                    }
                    if (this.tab === 'albums' && this.albumDrill) {
                        this.closeAlbumDrill();
                    }
                }
            },
            itemSwipeStart: function(item, kind, ev) {
                if (!item || !ev || !ev.touches || ev.touches.length !== 1) {
                    return;
                }
                if (ev.target && ev.target.closest &&
                    ev.target.closest('.lib-fusion-grid-btns, .lib-fusion-row-btns, .lib-fusion-gbtn, .lib-fusion-mat-btn, button, .lib-fusion-check, .link-item')) {
                    return;
                }
                var t = ev.touches[0];
                this.itemSwipe = {
                    key: item.key,
                    item: item,
                    kind: kind,
                    x: t.clientX,
                    y: t.clientY,
                    dx: 0,
                    active: false
                };
            },
            itemSwipeMove: function(ev) {
                var s = this.itemSwipe;
                if (!s || !ev.touches || !ev.touches.length) {
                    return;
                }
                var t = ev.touches[0];
                var dx = t.clientX - s.x;
                var dy = t.clientY - s.y;
                if (!s.active) {
                    if (Math.abs(dx) < 12 && Math.abs(dy) < 12) {
                        return;
                    }
                    if (Math.abs(dy) > Math.abs(dx) * 1.1) {
                        this.itemSwipe = null;
                        return;
                    }
                    s.active = true;
                    this._navSwipe = null;
                }
                s.dx = Math.max(-92, Math.min(92, dx));
                this.itemSwipe = Object.assign({}, s);
                try { if (s.active) { ev.preventDefault(); } } catch (e) {}
            },
            itemSwipeEnd: function(ev) {
                var s = this.itemSwipe;
                this.itemSwipe = null;
                if (!s || !s.active) {
                    return;
                }
                var dx = s.dx || 0;
                if (ev && ev.changedTouches && ev.changedTouches[0]) {
                    dx = Math.max(-92, Math.min(92, ev.changedTouches[0].clientX - s.x));
                }
                if (dx >= 56) {
                    /* right → add */
                    if (s.kind === 'album') {
                        this.addAlbum(s.item);
                    } else if (s.kind === 'track') {
                        this.addTrack(s.item);
                    } else if (s.kind === 'artist') {
                        this.playlistCmd('add', 'artist_id', s.item.id);
                    }
                } else if (dx <= -56) {
                    /* left → play next */
                    if (s.kind === 'album') {
                        this.insertAlbum(s.item);
                    } else if (s.kind === 'track') {
                        this.insertTrack(s.item);
                    } else if (s.kind === 'artist') {
                        this.playlistCmd('insert', 'artist_id', s.item.id);
                    }
                }
            },
            swipeRowClass: function(item) {
                var s = this.itemSwipe;
                if (!item || !s || s.key !== item.key || !s.dx) {
                    return {};
                }
                return {
                    'lib-fusion-swiping': true,
                    'lib-fusion-swipe-right': s.dx > 0,
                    'lib-fusion-swipe-left': s.dx < 0,
                    'lib-fusion-swipe-armed': Math.abs(s.dx) >= 56
                };
            },
            swipeRowStyle: function(item) {
                var s = this.itemSwipe;
                if (!item || !s || s.key !== item.key || !s.dx) {
                    return {};
                }
                return {
                    transform: 'translate3d(' + s.dx + 'px,0,0)',
                    transition: s.active ? 'none' : 'transform 0.2s ease'
                };
            },
            closeAlbumDrill: function() {
                this.albumDrill = false;
                this.drillAlbum = null;
            },
            openAlbumDrill: function(alb) {
                if (!alb) {
                    return;
                }
                this.drillAlbum = alb;
                if (alb.tracks == null) {
                    this.loadTracks(alb);
                }
                if (this.tab === 'albums') {
                    this.albumDrill = true;
                } else {
                    this.drillLevel = 2;
                }
            },
            onArtistAlbumClick: function(alb, ev) {
                if (this.isNarrow) {
                    this.openAlbumDrill(alb);
                    return;
                }
                /* Debounce expand so a double-click can open classic album view
                 * without expand/collapse flicker from the two click events. */
                var self = this;
                if (this._albClickTimer) {
                    clearTimeout(this._albClickTimer);
                    this._albClickTimer = null;
                }
                this._albClickTimer = setTimeout(function() {
                    self._albClickTimer = null;
                    self.toggleAlbum(alb);
                }, 280);
            },
            onArtistAlbumDblClick: function(alb) {
                if (this._albClickTimer) {
                    clearTimeout(this._albClickTimer);
                    this._albClickTimer = null;
                }
                this.openAlbum(alb);
            },
            /**
             * After filter / tab changes: keep detail panel on a visible artist.
             * Fixes stale bio (e.g. ABBA still shown after searching Charlotte Cardin).
             */
            ensureArtistInList: function(list) {
                list = list || this.filteredArtists;
                if (!list || !list.length) {
                    this.selectedArtist = null;
                    this.artistBio = '';
                    this.albums = [];
                    /* Keep arrow nav reset — list empty */
                    return;
                }
                if (this.selectedArtist) {
                    for (var i = 0; i < list.length; i++) {
                        if (String(list[i].id) === String(this.selectedArtist.id)) {
                            /* Artist still visible: do not re-jump kb cursor here —
                             * filter handlers already called resetKbNav. */
                            return;
                        }
                    }
                }
                /* Selected artist not in filtered list — pick first for detail pane only.
                 * Leave kbIndex at -1 so next ↑/↓ starts at the top of the new list. */
                this.selectArtist(list[0]);
            },
            syncSelectionToFilter: function() {
                if (this.tab === 'artists') {
                    this.ensureArtistInList(this.filteredArtists);
                    return;
                }
                // On albums/songs with a filter, prep artist list so switching back lands on first match
                if (this.filterQ && this.filteredArtists.length) {
                    var first = this.filteredArtists[0];
                    if (!this.selectedArtist || String(this.selectedArtist.id) !== String(first.id)) {
                        // Don't load albums/bio until user opens Artists — just remember target
                        this._pendingArtist = first;
                    }
                } else {
                    this._pendingArtist = null;
                }
            },
            sortList: function(list, sortId, sort2Id, reverse, kind) {
                if (!list || !list.length) {
                    return list || [];
                }
                var arr = list.slice();
                var cmpTitle = cmpSortKey;
                var cmpPlain = function(a, b) {
                    return String(a || '').localeCompare(String(b || ''), undefined, { sensitivity: 'base', numeric: true });
                };
                var keyCmp = function(a, b, id) {
                    if (!id || id === 'none') {
                        return 0;
                    }
                    if (kind === 'artist') {
                        if (id === 'name') {
                            return cmpTitle(a.title, b.title);
                        }
                        return 0;
                    }
                    if (kind === 'album') {
                        if (id === 'artist') {
                            return cmpTitle(a.artist, b.artist);
                        }
                        if (id === 'year') {
                            return (a.yearNum || 0) - (b.yearNum || 0);
                        }
                        if (id === 'genre') {
                            return cmpPlain(a.genre, b.genre);
                        }
                        if (id === 'added') {
                            return (a.addedNum || 0) - (b.addedNum || 0);
                        }
                        // album / default title
                        return cmpTitle(a.title, b.title);
                    }
                    // song
                    if (id === 'artist') {
                        return cmpTitle(a.artist, b.artist);
                    }
                    if (id === 'album') {
                        return cmpTitle(a.album, b.album);
                    }
                    if (id === 'genre') {
                        return cmpPlain(a.genre, b.genre);
                    }
                    if (id === 'duration') {
                        return (a.durationNum || 0) - (b.durationNum || 0);
                    }
                    if (id === 'year') {
                        return (a.yearNum || 0) - (b.yearNum || 0);
                    }
                    if (id === 'added') {
                        return (a.addedNum || 0) - (b.addedNum || 0);
                    }
                    return cmpTitle(a.title, b.title);
                };
                var primary = sortId || (kind === 'album' ? 'album' : kind === 'song' ? 'title' : 'name');
                var secondary = sort2Id && sort2Id !== primary ? sort2Id : 'none';
                arr.sort(function(a, b) {
                    return keyCmp(a, b, primary) || keyCmp(a, b, secondary) || cmpTitle(a.title, b.title);
                });
                if (reverse) {
                    arr.reverse();
                }
                // Genre enrichment when sorting albums by genre
                if (kind === 'album' && (primary === 'genre' || secondary === 'genre') && arr.length) {
                    try { this.enrichAlbumGenres(arr); } catch (e) {}
                }
                return arr;
            },
            toggleSortMenu: function() {
                this.chromeTouchBlock();
                var open = !this.showSort;
                this._ignoreDocClick = true;
                this.showSort = open;
                if (open) {
                    this.showDisp = false;
                }
                var self = this;
                setTimeout(function() { self._ignoreDocClick = false; }, 50);
            },
            toggleDispMenu: function() {
                this.chromeTouchBlock();
                var open = !this.showDisp;
                this._ignoreDocClick = true;
                this.showDisp = open;
                if (open) {
                    this.showSort = false;
                }
                var self = this;
                setTimeout(function() { self._ignoreDocClick = false; }, 50);
            },
            toggleSongCol: function(col) {
                if (!col || col.locked || col.id === 'title') {
                    return;
                }
                var on = !this.songCols[col.id];
                this.$set(this.songCols, col.id, on);
                // genre/year/added/tracknum may need richer tags — reload once if enabling
                if (on && (col.id === 'genre' || col.id === 'year' || col.id === 'added' || col.id === 'tracknum') && this.songs.length) {
                    var needReload = false;
                    var s0 = this.songs[0];
                    if (col.id === 'genre' && s0 && s0.genre === undefined) {
                        needReload = true;
                    }
                    if (col.id === 'year' && s0 && s0.year === undefined) {
                        needReload = true;
                    }
                    if (col.id === 'added' && s0 && s0.addedNum === undefined) {
                        needReload = true;
                    }
                    if (col.id === 'tracknum' && s0 && s0.tracknum === undefined) {
                        needReload = true;
                    }
                    if (needReload) {
                        this.songs = [];
                        this.loadSongs();
                    }
                }
                try {
                    setLocalStorageVal('libFusionSongCols', JSON.stringify(this.songCols));
                } catch (e) {}
            },
            /** Column header click: sort by col; second click reverses */
            headerSort: function(id) {
                if (!id || this.tab !== 'songs') {
                    return;
                }
                // Inside a genre drill, header sort is secondary (title/artist/…)
                if (this.songsGenreMode && this.activeGenre) {
                    if (id === 'genre') {
                        return;
                    }
                    if (this.sortSongs2 === id || (this.sortSongs2 === 'none' && id === 'title')) {
                        this.toggleSortRev();
                    } else {
                        this.setSort2(id);
                        this.sortSongsRev = false;
                        try { setLocalStorageVal('libFusionSortSRev', '0'); } catch (e) {}
                    }
                    this.kbIndex = -1;
                    this.kbKey = '';
                    return;
                }
                if (this.sortSongs === id) {
                    this.toggleSortRev();
                } else {
                    this.setSort(id);
                    this.sortSongsRev = false;
                    try { setLocalStorageVal('libFusionSortSRev', '0'); } catch (e2) {}
                }
            },
            openGenre: function(g) {
                if (!g) { return; }
                this.activeGenre = g.title || g;
                this.kbIndex = -1;
                this.kbKey = '';
                this.resetKbNav(true);
            },
            closeGenre: function() {
                this.activeGenre = null;
                this.kbIndex = -1;
                this.kbKey = '';
                this.resetKbNav(true);
            },
            setSort: function(id) {
                if (!id) {
                    return;
                }
                if (this.tab === 'albums') {
                    this.sortAlbums = id;
                    if (this.sortAlbums2 === id) {
                        this.sortAlbums2 = 'none';
                        try { setLocalStorageVal('libFusionSortL2', 'none'); } catch (e) {}
                    }
                    try { setLocalStorageVal('libFusionSortL', id); } catch (e) {}
                    if (id === 'genre' && this.allAlbums && this.allAlbums.length) {
                        this.enrichAlbumGenres(this.allAlbums);
                    }
                } else if (this.tab === 'songs') {
                    var prev = this.sortSongs;
                    this.sortSongs = id;
                    if (this.sortSongs2 === id) {
                        this.sortSongs2 = 'none';
                        try { setLocalStorageVal('libFusionSortS2', 'none'); } catch (e) {}
                    }
                    try { setLocalStorageVal('libFusionSortS', id); } catch (e) {}
                    // Leaving genre hierarchy → clear drill
                    if (id !== 'genre') {
                        this.activeGenre = null;
                    } else if (prev !== 'genre') {
                        this.activeGenre = null;
                    }
                    // Ensure genre tags present when entering genre hierarchy
                    if (id === 'genre' && this.songs.length) {
                        var s0 = this.songs[0];
                        if (s0 && s0.genre === undefined) {
                            this.songs = [];
                            this.loadSongs();
                        }
                    }
                } else {
                    this.sortArtists = id;
                    if (this.sortArtists2 === id) {
                        this.sortArtists2 = 'none';
                        try { setLocalStorageVal('libFusionSortA2', 'none'); } catch (e) {}
                    }
                    try { setLocalStorageVal('libFusionSortA', id); } catch (e) {}
                }
                // Keep menu open so secondary / reverse can be set without reopening
                this.kbIndex = -1;
                this.kbKey = '';
            },
            setSort2: function(id) {
                if (!id) {
                    id = 'none';
                }
                if (this.tab === 'albums') {
                    this.sortAlbums2 = id;
                    try { setLocalStorageVal('libFusionSortL2', id); } catch (e) {}
                    if (id === 'genre' && this.allAlbums && this.allAlbums.length) {
                        this.enrichAlbumGenres(this.allAlbums);
                    }
                } else if (this.tab === 'songs') {
                    this.sortSongs2 = id;
                    try { setLocalStorageVal('libFusionSortS2', id); } catch (e) {}
                } else {
                    this.sortArtists2 = id;
                    try { setLocalStorageVal('libFusionSortA2', id); } catch (e) {}
                }
                this.kbIndex = -1;
                this.kbKey = '';
            },
            toggleSortRev: function() {
                if (this.tab === 'albums') {
                    this.sortAlbumsRev = !this.sortAlbumsRev;
                    try { setLocalStorageVal('libFusionSortLRev', this.sortAlbumsRev ? '1' : '0'); } catch (e) {}
                } else if (this.tab === 'songs') {
                    this.sortSongsRev = !this.sortSongsRev;
                    try { setLocalStorageVal('libFusionSortSRev', this.sortSongsRev ? '1' : '0'); } catch (e) {}
                } else {
                    this.sortArtistsRev = !this.sortArtistsRev;
                    try { setLocalStorageVal('libFusionSortARev', this.sortArtistsRev ? '1' : '0'); } catch (e) {}
                }
                this.kbIndex = -1;
                this.kbKey = '';
            },
            isSelected: function(key) {
                return !!(key && this.selectedMap[key]);
            },
            toggleSelect: function(item, ev) {
                if (!item || !item.key) {
                    return;
                }
                if (ev && ev.shiftKey && this._lastSelectKey) {
                    this.rangeSelect(this._lastSelectKey, item.key);
                    this._lastSelectKey = item.key;
                    return;
                }
                if (this.selectedMap[item.key]) {
                    this.$delete(this.selectedMap, item.key);
                } else {
                    this.$set(this.selectedMap, item.key, true);
                }
                this._lastSelectKey = item.key;
            },
            rangeSelect: function(fromKey, toKey) {
                var list = this.activeList;
                var i0 = -1;
                var i1 = -1;
                for (var i = 0; i < list.length; i++) {
                    if (list[i].key === fromKey) {
                        i0 = i;
                    }
                    if (list[i].key === toKey) {
                        i1 = i;
                    }
                }
                if (i0 < 0 || i1 < 0) {
                    return;
                }
                if (i0 > i1) {
                    var t = i0;
                    i0 = i1;
                    i1 = t;
                }
                for (var j = i0; j <= i1; j++) {
                    this.$set(this.selectedMap, list[j].key, true);
                }
            },
            clearSelection: function() {
                this.selectedMap = {};
                this._lastSelectKey = null;
            },
            invertSelection: function() {
                var list = this.activeList;
                var next = {};
                for (var i = 0; i < list.length; i++) {
                    if (!this.selectedMap[list[i].key]) {
                        next[list[i].key] = true;
                    }
                }
                this.selectedMap = next;
            },
            selectAllVisible: function() {
                var list = this.activeList;
                var next = Object.assign({}, this.selectedMap);
                for (var i = 0; i < list.length; i++) {
                    next[list[i].key] = true;
                }
                this.selectedMap = next;
            },
            selectedItems: function() {
                var list = this.activeList;
                var out = [];
                for (var i = 0; i < list.length; i++) {
                    if (this.selectedMap[list[i].key]) {
                        out.push(list[i]);
                    }
                }
                return out;
            },
            playSelection: function() {
                var items = this.selectedItems();
                if (!items.length) {
                    return;
                }
                // Load first, add rest
                var first = items[0];
                if (this.tab === 'artists') {
                    this.playlistCmd('load', 'artist_id', first.id);
                    for (var i = 1; i < items.length; i++) {
                        this.playlistCmd('add', 'artist_id', items[i].id);
                    }
                } else if (this.tab === 'albums') {
                    this.playlistCmd('load', 'album_id', first.id);
                    for (var j = 1; j < items.length; j++) {
                        this.playlistCmd('add', 'album_id', items[j].id);
                    }
                } else {
                    this.playlistCmd('load', 'track_id', first.id);
                    for (var k = 1; k < items.length; k++) {
                        this.playlistCmd('add', 'track_id', items[k].id);
                    }
                }
            },
            addSelection: function() {
                var items = this.selectedItems();
                for (var i = 0; i < items.length; i++) {
                    var it = items[i];
                    if (this.tab === 'artists') {
                        this.playlistCmd('add', 'artist_id', it.id);
                    } else if (this.tab === 'albums') {
                        this.playlistCmd('add', 'album_id', it.id);
                    } else {
                        this.playlistCmd('add', 'track_id', it.id);
                    }
                }
            },
            onArtistClick: function(item, ev) {
                if (ev && (ev.metaKey || ev.ctrlKey || ev.shiftKey || this.selectedCount > 0)) {
                    this.toggleSelect(item, ev);
                    return;
                }
                this.selectArtist(item);
                this.kbKey = item.key;
                this.kbIndex = this.activeList.indexOf(item);
                if (this.isNarrow) {
                    this.drillLevel = 1;
                    this.drillAlbum = null;
                }
            },
            onAlbumGridClick: function(alb, ev) {
                if (ev && (ev.metaKey || ev.ctrlKey || ev.shiftKey || this.selectedCount > 0)) {
                    this.toggleSelect(alb, ev);
                    return;
                }
                if (this.isNarrow) {
                    this.openAlbumDrill(alb);
                    return;
                }
                this.openAlbum(alb);
            },
            onSongClick: function(item, ev) {
                if (ev && (ev.metaKey || ev.ctrlKey || ev.shiftKey || this.selectedCount > 0)) {
                    this.toggleSelect(item, ev);
                    return;
                }
                this.playTrack(item);
                this.kbKey = item.key;
            },
            moveKb: function(delta) {
                var list = this.activeList;
                if (!list.length) {
                    return;
                }
                var idx = this.kbIndex;
                // Out of range (e.g. after filter shortened the list without a
                // clean reset) → re-anchor so every filtered item is reachable.
                if (idx < 0 || idx >= list.length) {
                    idx = delta > 0 ? 0 : list.length - 1;
                } else {
                    idx = Math.max(0, Math.min(list.length - 1, idx + delta));
                }
                this.kbIndex = idx;
                this.kbKey = list[idx].key;
                this.scrollKbIntoView();
            },
            activateKb: function() {
                var list = this.activeList;
                if (this.kbIndex < 0 || this.kbIndex >= list.length) {
                    return;
                }
                var item = list[this.kbIndex];
                if (this.tab === 'artists') {
                    if (this.isNarrow && this.drillLevel === 1) {
                        // focus albums under artist — Enter on album list uses albums array
                        return;
                    }
                    this.selectArtist(item);
                    if (this.isNarrow) {
                        this.drillLevel = 1;
                        this.drillAlbum = null;
                    }
                } else if (this.tab === 'albums') {
                    if (this.isNarrow) {
                        this.openAlbumDrill(item);
                    } else {
                        this.openAlbum(item);
                    }
                } else if (this.songsGenreBrowse) {
                    this.openGenre(item);
                } else {
                    this.playTrack(item);
                }
            },
            onKeyDown: function(e) {
                if (!e) {
                    return;
                }
                var tag = e.target && e.target.tagName;
                var inField = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable);
                if (inField) {
                    if (e.key === 'Escape') {
                        e.target.blur();
                        try { this.$refs.root && this.$refs.root.focus({ preventScroll: true }); } catch (err) {}
                        e.preventDefault();
                    }
                    return;
                }
                var mod = e.metaKey || e.ctrlKey;
                // Tabs
                if (e.key === '1') { this.setTab('artists'); e.preventDefault(); return; }
                if (e.key === '2') { this.setTab('albums'); e.preventDefault(); return; }
                if (e.key === '3') { this.setTab('songs'); e.preventDefault(); return; }
                if (e.key === '/' || (e.key === 'f' && mod)) {
                    e.preventDefault();
                    this.openFilter();
                    return;
                }
                if (mod && (e.key === 'a' || e.key === 'A')) {
                    e.preventDefault();
                    this.selectAllVisible();
                    return;
                }
                if (e.key === 'Escape') {
                    if (this.consumeEsc()) {
                        e.preventDefault();
                        e.stopPropagation();
                        return;
                    }
                    // Nothing to reset → leave unified My Music to home
                    this.$emit('leave-main');
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }
                if (e.key === 'ArrowDown' || e.key === 'j') {
                    this.moveKb(1);
                    e.preventDefault();
                    return;
                }
                if (e.key === 'ArrowUp' || e.key === 'k') {
                    this.moveKb(-1);
                    e.preventDefault();
                    return;
                }
                if (e.key === 'ArrowLeft') {
                    if (this.isNarrow && this.tab === 'artists' && this.drillLevel > 0) {
                        this.drillBack();
                        e.preventDefault();
                        return;
                    }
                    if (this.isNarrow && this.tab === 'albums' && this.albumDrill) {
                        this.closeAlbumDrill();
                        e.preventDefault();
                        return;
                    }
                    this.setTab(this.tab === 'songs' ? 'albums' : this.tab === 'albums' ? 'artists' : 'artists');
                    e.preventDefault();
                    return;
                }
                if (e.key === 'ArrowRight') {
                    if (this.tab === 'artists' && this.isNarrow && this.drillLevel === 0 && this.selectedArtist) {
                        this.drillLevel = 1;
                        e.preventDefault();
                        return;
                    }
                    this.setTab(this.tab === 'artists' ? 'albums' : this.tab === 'albums' ? 'songs' : 'songs');
                    e.preventDefault();
                    return;
                }
                if (e.key === 'Enter') {
                    this.activateKb();
                    e.preventDefault();
                    return;
                }
                if (e.key === ' ' || e.key === 'Spacebar') {
                    var list = this.activeList;
                    if (this.kbIndex >= 0 && this.kbIndex < list.length) {
                        this.toggleSelect(list[this.kbIndex], e);
                    }
                    e.preventDefault();
                    return;
                }
                if (e.key === 'p' || e.key === 'P') {
                    if (this.selectedCount > 0) {
                        this.playSelection();
                    } else {
                        this.activateKb();
                    }
                    e.preventDefault();
                    return;
                }
                if (e.key === 'a' || e.key === 'A') {
                    if (this.selectedCount > 0) {
                        this.addSelection();
                    } else {
                        var lst = this.activeList;
                        if (this.kbIndex >= 0 && this.kbIndex < lst.length) {
                            var it = lst[this.kbIndex];
                            if (this.tab === 'artists') {
                                this.playlistCmd('add', 'artist_id', it.id);
                            } else if (this.tab === 'albums') {
                                this.addAlbum(it);
                            } else {
                                this.addTrack(it);
                            }
                        }
                    }
                    e.preventDefault();
                    return;
                }
                // Letter jump (artists/albums/songs title)
                if (e.key && e.key.length === 1 && !mod && /[a-z0-9]/i.test(e.key)) {
                    this.letterJump(e.key.toLowerCase());
                    e.preventDefault();
                }
            },
            letterJump: function(ch) {
                var list = this.activeList;
                if (!list.length) {
                    return;
                }
                // Start after current cursor only when it is still in the filtered list
                var start = (this.kbIndex >= 0 && this.kbIndex < list.length) ? this.kbIndex + 1 : 0;
                var i;
                for (i = start; i < list.length; i++) {
                    if (String(list[i].title || '').toLowerCase().charAt(0) === ch) {
                        this.kbIndex = i;
                        this.kbKey = list[i].key;
                        this.scrollKbIntoView();
                        return;
                    }
                }
                for (i = 0; i < start && i < list.length; i++) {
                    if (String(list[i].title || '').toLowerCase().charAt(0) === ch) {
                        this.kbIndex = i;
                        this.kbKey = list[i].key;
                        this.scrollKbIntoView();
                        return;
                    }
                }
            },
            syncTheme: function() {
                try {
                    if (this.$store && this.$store.state && this.$store.state.darkUi != null) {
                        this.darkUi = !!this.$store.state.darkUi;
                    }
                } catch (e) {}
                // Grid overlay: light-on-dark (hoverInGrid). List inline: theme-colored.
                var r = (typeof LMS_MATERIAL_REVISION !== 'undefined') ? LMS_MATERIAL_REVISION : '1';
                var base = '/material/svg/';
                var dark = (typeof LMS_DARK_SVG !== 'undefined') ? LMS_DARK_SVG : 'fff';
                var light = (typeof LMS_LIGHT_SVG !== 'undefined') ? LMS_LIGHT_SVG : '333';
                // Prefer dark glyphs for cover overlay; theme-matched for inline rows
                var gridC = dark;
                var listC = this.darkUi ? dark : light;
                var qGrid = '?c=' + gridC + '&c2=333&r=' + r;
                var qList = '?c=' + listC + '&r=' + r;
                // Reuse grid icons; they work on both surfaces
                this.iconPlay = base + 'hover-play' + qGrid;
                this.iconAdd = base + 'hover-add' + qGrid;
                this.iconPlayNext = base + 'hover-playnext' + qGrid;
                this.iconShuffle = base + 'hover-shuffle' + qGrid;
                // Filter uses standard search-library glyph (no circular bg)
                this.iconSearch = base + 'search-library?c=' + listC + '&r=' + r;
                // Keep refs if we later split list vs grid palettes
                this._iconQList = qList;
            },
            fusionApplyZoom: function(level, persist) {
                var z = Math.max(0.8, Math.min(1.3, Number(level) || 1));
                if (this.$el) {
                    this.$el.style.setProperty('--browse-zoom', String(z));
                    this.$el.style.setProperty('--browse-text-zoom', String(Math.min(1, z)));
                }
                if (typeof browseZoomApplyLevel === 'function') {
                    try { browseZoomApplyLevel(z, persist !== false); } catch (e) {}
                } else if (persist !== false && typeof setLocalStorageVal === 'function') {
                    try { setLocalStorageVal('browseZoom', z); } catch (e2) {}
                }
            },
            localize: function() {
                if (typeof i18n !== 'function') {
                    return;
                }
                try {
                    this.tArtists = i18n('Artists');
                    this.tAlbums = i18n('Albums');
                    this.tSongs = i18n('Songs');
                    this.tClose = i18n('Close');
                    this.tPlay = i18n('Play');
                    this.tAdd = i18n('Add');
                    this.tPlayNext = i18n('Play next');
                    this.tShuffle = i18n('Shuffle');
                    this.tLoading = i18n('Loading…');
                    this.tFilter = i18n('Filter');
                    this.tSort = i18n('Sort');
                    this.tSortPrimary = i18n('Sort by');
                    this.tSortThen = i18n('Then by');
                    this.tSortReverse = i18n('Reverse');
                    SORT_NONE.label = i18n('None');
                    var labelMap = {
                        name: i18n('Name'),
                        album: i18n('Album'),
                        artist: i18n('Artist'),
                        year: i18n('Year'),
                        genre: i18n('Genre'),
                        added: i18n('Date added'),
                        title: i18n('Title'),
                        duration: i18n('Duration')
                    };
                    [ARTIST_SORTS, ALBUM_SORTS, SONG_SORTS].forEach(function(list) {
                        list.forEach(function(o) {
                            if (labelMap[o.id]) {
                                o.label = labelMap[o.id];
                            }
                        });
                    });
                    SONG_COLS.forEach(function(c) {
                        if (labelMap[c.id]) {
                            c.label = labelMap[c.id];
                        } else if (c.id === 'tracknum') {
                            c.label = i18n('Track #');
                        }
                    });
                    this.tDisplay = i18n('Display');
                    this.tDisplayCols = i18n('Columns');
                    this.tTitle = i18n('Title');
                    this.tGenre = i18n('Genre');
                    this.tYear = i18n('Year');
                    this.tAdded = i18n('Added');
                    this.tTime = i18n('Time');
                    this.tInvert = i18n('Invert');
                    this.tClear = i18n('Clear');
                    this.tBack = i18n('Back');
                    this.tMenu = i18n('Menu');
                    this.tNoMatch = i18n('No matches');
                    this.tNoArtists = i18n('No artists');
                    this.tNoAlbums = i18n('No albums');
                    this.tNoTracks = i18n('No tracks');
                    this.tNoSongs = i18n('No songs');
                    this.tSelectArtist = i18n('Select an artist');
                } catch (e) {}
            },
            jumpToLetter: function(key) {
                var list = this.activeList || [];
                var target = -1;
                var kind = this.jumplistKind;
                var primary = this.jumplistPrimary;
                for (var i = 0; i < list.length; i++) {
                    var ch;
                    if (kind === 'genreGroup') {
                        ch = sortLetter(list[i].title);
                    } else {
                        ch = jlLetter(list[i], primary, kind);
                    }
                    if (ch === key) {
                        target = i;
                        break;
                    }
                }
                if (target < 0) { return; }
                this.kbIndex = target;
                this.kbKey = list[target].key;
                this.$nextTick(function() {
                    try {
                        var scroller = null;
                        if (this.tab === 'artists' && this.drillLevel === 0) {
                            scroller = this.$refs.artistScroller;
                        } else if (this.tab === 'songs') {
                            scroller = this.$refs.songScroller;
                        }
                        if (scroller && typeof scroller.scrollToItem === 'function') {
                            scroller.scrollToItem(target);
                            return;
                        }
                    } catch (e) {}
                    // Albums grid / fallback: scroll container to item offset
                    try {
                        var col = this.$el && this.$el.querySelector('.lib-fusion-col-scroll');
                        if (!col) { return; }
                        if (this.tab === 'albums') {
                            var items = col.querySelectorAll('.lib-fusion-grid-item');
                            if (items[target]) {
                                items[target].scrollIntoView({ block: 'start', behavior: 'smooth' });
                            }
                        } else {
                            var rowH = this.tab === 'artists' ? this.artistRowH : this.songRowH;
                            col.scrollTop = Math.max(0, target * rowH - 8);
                        }
                    } catch (e2) {}
                }.bind(this));
            },
            jlTouchStart: function(ev) {
                this._jlTouch = true;
                this.jlPickAt(ev);
            },
            jlTouchMove: function(ev) {
                if (!this._jlTouch) { return; }
                this.jlPickAt(ev);
            },
            jlTouchEnd: function() {
                this._jlTouch = false;
                this.jlActive = -1;
            },
            jlPickAt: function(ev) {
                var t = (ev.touches && ev.touches[0]) || (ev.changedTouches && ev.changedTouches[0]) || ev;
                if (!t || t.clientY == null) { return; }
                var el = this.$el && this.$el.querySelector('.lib-fusion-jumplist');
                if (!el) { return; }
                var rect = el.getBoundingClientRect();
                var y = t.clientY - rect.top;
                var n = this.jumplist.length;
                if (n < 1 || rect.height < 1) { return; }
                var idx = Math.max(0, Math.min(n - 1, Math.floor((y / rect.height) * n)));
                this.jlActive = idx;
                if (this.jumplist[idx]) {
                    this.jumpToLetter(this.jumplist[idx].key);
                }
            },
            setTab: function(t) {
                if (!t || this.tab === t) {
                    return;
                }
                var order = { artists: 0, albums: 1, songs: 2 };
                var from = order[this.tab] != null ? order[this.tab] : 0;
                var to = order[t] != null ? order[t] : 0;
                this.tabDir = to < from ? 'back' : 'fwd';
                this.tab = t;
                this.setChromeCollapsed(false);
                this._lastChromeScrollTop = 0;
                this._lastChromeScrollEl = null;
                this.showSort = false;
                this.showDisp = false;
                this.drillLevel = 0;
                this.albumDrill = false;
                this.drillAlbum = null;
                this.activeGenre = null;
                this.closeCtx();
                this.kbIndex = -1;
                this.kbKey = '';
                this.clearSelection();
                try { setLocalStorageVal('libFusionTab', t); } catch (e) {}
                if (t === 'artists') {
                    if (!this.artists.length) {
                        this.loadArtists();
                    } else {
                        // Filtered navigation: always land on first matching artist
                        this.$nextTick(function() {
                            if (this.filterQ) {
                                var list = this.filteredArtists;
                                if (list.length) {
                                    this.selectArtist(list[0]);
                                    this.kbKey = list[0].key;
                                    this.kbIndex = 0;
                                } else {
                                    this.ensureArtistInList(list);
                                }
                            } else if (this._pendingArtist) {
                                this.selectArtist(this._pendingArtist);
                                this._pendingArtist = null;
                            } else {
                                this.ensureArtistInList();
                            }
                        }.bind(this));
                    }
                } else if (t === 'albums' && !this.allAlbums.length) {
                    this.loadAllAlbums();
                } else if (t === 'songs' && !this.songs.length) {
                    this.loadSongs();
                }
            },
            closeCtx: function() {
                this.ctx = { show: false, x: 0, y: 0, title: '', kind: '', item: null, actions: [] };
            },
            /** Map fusion row → browse-compatible item for the global context menu */
            toBrowseItem: function(item, kind) {
                if (!item) {
                    return null;
                }
                if (kind === 'artist') {
                    return {
                        id: 'artist_id:' + item.id,
                        title: item.title || '',
                        image: item.image,
                        stdItem: (typeof STD_ITEM_ARTIST !== 'undefined') ? STD_ITEM_ARTIST : 1
                    };
                }
                if (kind === 'album' || kind === 'artistAlbum') {
                    var alb = {
                        id: 'album_id:' + item.id,
                        title: item.title || '',
                        image: item.image,
                        subtitle: item.artist || item.subtitle || '',
                        stdItem: (typeof STD_ITEM_ALBUM !== 'undefined') ? STD_ITEM_ALBUM : 2
                    };
                    if (item.artistId) {
                        alb.artist_id = item.artistId;
                    }
                    if (item.year) {
                        alb.year = item.year;
                    }
                    return alb;
                }
                // track
                var tr = {
                    id: item.id != null && String(item.id).indexOf('track_id:') === 0
                        ? item.id
                        : ('track_id:' + item.id),
                    title: item.title || '',
                    stdItem: (typeof STD_ITEM_TRACK !== 'undefined') ? STD_ITEM_TRACK : 6
                };
                if (item.artist) {
                    tr.artist = item.artist;
                    tr.subtitle = item.artist;
                }
                if (item.artistId) {
                    tr.artist_id = item.artistId;
                }
                if (item.album) {
                    tr.album = item.album;
                }
                if (item.albumId) {
                    tr.album_id = item.albumId;
                }
                if (item.durationStr) {
                    tr.durationStr = item.durationStr;
                }
                if (item.durationNum != null) {
                    tr.duration = item.durationNum;
                }
                return tr;
            },
            openCtx: function(item, kind, ev) {
                if (!item) {
                    return;
                }
                if (ev && ev.preventDefault) {
                    try { ev.preventDefault(); } catch (e) {}
                }
                if (ev && ev.stopPropagation) {
                    try { ev.stopPropagation(); } catch (e) {}
                }
                this.kbKey = item.key || '';
                var browseItem = this.toBrowseItem(item, kind);
                if (!browseItem) {
                    return;
                }
                // Global browse contextual menu (full STD_ITEMS actions)
                if (typeof bus !== 'undefined' && bus.$emit) {
                    bus.$emit('browseShowItemMenu', browseItem, ev);
                }
            },
            runCtx: function() {
                /* Global browse menu handles actions; short fusion menu removed */
                this.closeCtx();
            },
            bootstrap: function() {
                var self = this;
                // Load Ma musique ignoredarticles first so first paint / jumplist match LMS
                loadIgnoredArticlesPref(function() {
                    // Force recomputed filters/jumplist after articles regex is ready
                    try { self.$forceUpdate(); } catch (e) {}
                });
                if (this.tab === 'albums') {
                    this.loadAllAlbums();
                } else if (this.tab === 'songs') {
                    this.loadSongs();
                } else {
                    this.loadArtists();
                }
            },
            pid: function() {
                if (this.playerId) {
                    return this.playerId;
                }
                try {
                    return this.$store && this.$store.state.player ? this.$store.state.player.id : '';
                } catch (e) {
                    return '';
                }
            },
            catalogPid: function() {
                var p = this.pid();
                return p || '';
            },
            imgSize: function() {
                return (typeof LMS_LIST_IMAGE_SIZE !== 'undefined') ? LMS_LIST_IMAGE_SIZE : '_150x150_f';
            },
            defCover: function() {
                return (typeof DEFAULT_COVER !== 'undefined') ? DEFAULT_COVER : '/material/html/images/cover.png';
            },
            imgErr: function(ev) {
                if (ev && ev.target) {
                    ev.target.onerror = null;
                    ev.target.src = this.defCover();
                }
            },
            coverUrl: function(i) {
                try {
                    if (i.artwork_url) {
                        if (typeof resolveImageUrl === 'function') {
                            return resolveImageUrl(i.artwork_url, this.imgSize());
                        }
                        return i.artwork_url;
                    }
                    var id = i.artwork_track_id || i.artwork || i.coverid;
                    if (id != null && id !== '' && id !== 0 && id !== '0') {
                        return '/music/' + id + '/cover' + this.imgSize();
                    }
                    if (i.id != null && i.id !== '') {
                        return '/music/' + i.id + '/cover' + this.imgSize();
                    }
                } catch (e) {}
                return this.defCover();
            },
            /** Match browse-resp artist portrait rules */
            artistImage: function(a) {
                if (!a) {
                    return this.defCover();
                }
                if (a.image) {
                    return a.image;
                }
                var id = a.id;
                if (id == null || id === '') {
                    return this.defCover();
                }
                // strip artist_id: prefix if present
                var raw = String(id).replace(/^artist_id:/, '');
                if (a.portraitid) {
                    return '/contributor/' + a.portraitid + '/image' + this.imgSize();
                }
                // MAI / LMS imageproxy (301 → contributor hash on this server)
                return '/imageproxy/mai/artist/' + raw + '/image' + this.imgSize();
            },
            fmtTime: function(secs) {
                if (secs == null || secs < 0 || isNaN(secs)) {
                    return '';
                }
                var s = Math.floor(secs);
                var m = Math.floor(s / 60);
                s = s % 60;
                return m + ':' + (s < 10 ? '0' : '') + s;
            },
            /**
             * Artists query — respect Ma musique / LMS artist-list prefs:
             * - separateArtistsList / useUnifiedArtistsList → Album Artists vs all
             * - otherwise Album Artists (role_id:ALBUMARTIST) matches classic Material default
             */
            artistCmd: function() {
                var cmd = ['artists', 0, FUSION_BATCH, 'tags:s'];
                var separate = true;
                try {
                    if (typeof lmsOptions !== 'undefined' && lmsOptions.separateArtistsList === false) {
                        separate = false; // unified list: all contributors
                    }
                } catch (e) {}
                if (separate) {
                    cmd.push('role_id:ALBUMARTIST');
                }
                return cmd;
            },
            /** True when Ma musique “no role filter” is on — don't pin role_id on album queries */
            useRoleFilter: function() {
                try {
                    if (typeof lmsOptions !== 'undefined' && lmsOptions.noRoleFilter) {
                        return false;
                    }
                } catch (e) {}
                return true;
            },
            albumParams: function(extra, light) {
                // Tags: respect showAllArtists (multi-artist albums) like classic browse
                var tags;
                if (light) {
                    tags = FUSION_ALBUM_TAGS_LIGHT;
                    try {
                        if (typeof lmsOptions !== 'undefined' && lmsOptions.showAllArtists) {
                            // include multi-artist tag letter if available
                            if (tags.indexOf('a') >= 0 && tags.indexOf('aa') < 0) {
                                tags = tags.replace('tags:a', 'tags:aa');
                            }
                        }
                    } catch (e) {}
                } else if (typeof lmsOptions !== 'undefined' && lmsOptions.showAllArtists &&
                           typeof ALBUM_TAGS_ALL_ARTISTS !== 'undefined') {
                    tags = ALBUM_TAGS_ALL_ARTISTS;
                } else if (typeof ALBUM_TAGS !== 'undefined') {
                    tags = ALBUM_TAGS;
                } else {
                    tags = 'tags:ajlqswyKS24';
                }
                // Server-side initial order from Ma musique album sort (client re-sorts)
                var serverSort = 'album';
                try {
                    if (typeof getAlbumSort === 'function') {
                        var gs = getAlbumSort({ command: ['albums'], params: (extra || []).slice() }, null, null);
                        if (gs && gs.by && (gs.by === 'album' || gs.by === 'new' || gs.by === 'artflow' ||
                                gs.by === 'artistalbum' || gs.by === 'yearalbum' || gs.by === 'yearartistalbum')) {
                            serverSort = gs.by;
                        }
                    }
                } catch (e2) {}
                var params = [tags, 'sort:' + serverSort];
                if (extra && extra.length) {
                    // Drop role_id when Ma musique says not to filter by role
                    var useRole = this.useRoleFilter();
                    for (var i = 0; i < extra.length; i++) {
                        var p = extra[i];
                        if (!useRole && typeof p === 'string' && p.toLowerCase().indexOf('role_id:') === 0) {
                            continue;
                        }
                        params.push(p);
                    }
                }
                return addLibParam(params, this);
            },
            albumSubtitle: function(alb) {
                var genre = alb.genre ? String(alb.genre).toUpperCase() : '';
                var year = '';
                try {
                    // Ma musique / Material: year in subtitle (yearInSub)
                    if (typeof lmsOptions === 'undefined' || lmsOptions.yearInSub !== false) {
                        year = alb.year || '';
                    }
                } catch (e) {
                    year = alb.year || '';
                }
                var dur = alb.durationStr || '';
                return [genre, year, dur].filter(Boolean).join(' · ') || alb.artist || '';
            },
            mapAlbum: function(i, keyPrefix) {
                var year = i.year && parseInt(i.year, 10) > 0 ? String(i.year) : '';
                var genre = i.genre || '';
                var dur = i.duration != null ? i.duration : i.secs;
                var durationStr = this.fmtTime(dur);
                var addedRaw = i.addedTime != null ? i.addedTime
                    : (i.added_time != null ? i.added_time
                        : (i.timestamp != null ? i.timestamp : 0));
                var addedNum = parseAddedNum(addedRaw);
                var alb = {
                    key: (keyPrefix || 'alb-') + i.id,
                    id: i.id,
                    title: i.album || i.title || '',
                    genre: genre,
                    year: year,
                    yearNum: year ? parseInt(year, 10) : 0,
                    addedNum: addedNum,
                    durationStr: durationStr,
                    artist: i.artist || '',
                    artistId: i.artist_id,
                    image: this.coverUrl(i),
                    expanded: false,
                    loadingTracks: false,
                    tracks: null
                };
                alb.subtitle = this.albumSubtitle(alb);
                return alb;
            },
            /**
             * LMS album queries rarely return genre; fill via genres album_id:X.
             * Slow + sparse so it never blocks UI / hover.
             */
            enrichAlbumGenres: function(list) {
                var self = this;
                if (!list || !list.length || typeof lmsCommand !== 'function') {
                    return;
                }
                var queue = list.filter(function(a) { return a && a.id != null && !a.genre; });
                var idx = 0;
                var run = function() {
                    if (idx >= queue.length) {
                        return;
                    }
                    var alb = queue[idx++];
                    lmsCommand('', ['genres', 0, 4, 'album_id:' + alb.id, 'tags:s'], undefined, 6000).then(function(r) {
                        var result = r && r.data && (r.data.result || r.data);
                        var loop = (result && result.genres_loop) ? result.genres_loop : [];
                        if (loop.length) {
                            var names = loop.map(function(g) { return g.genre; }).filter(Boolean);
                            alb.genre = names.length <= 2 ? names.join(' / ') : names[0];
                            alb.subtitle = self.albumSubtitle(alb);
                        }
                    }).catch(function() {}).then(function() {
                        // Space requests so hover stays smooth
                        setTimeout(run, 40);
                    });
                };
                // Start after paint
                setTimeout(run, 200);
            },
            loadArtists: function() {
                var self = this;
                var req = ++this.artistReqId;
                this.loadingArtists = true;
                this.err = '';
                this.loadStatus = 'requesting…';
                var done = false;
                var finish = function() {
                    if (done || req !== self.artistReqId) {
                        return;
                    }
                    done = true;
                    self.loadingArtists = false;
                    self.loadStatus = '';
                };
                var apply = function(payload) {
                    if (req !== self.artistReqId) {
                        return;
                    }
                    finish();
                    var data = payload;
                    if (data && data.data && (data.data.result || data.data.artists_loop)) {
                        data = data.data;
                    }
                    if (typeof data === 'string') {
                        try { data = JSON.parse(data); } catch (e) { data = null; }
                    }
                    var result = data && data.result ? data.result : data;
                    var loop = (result && result.artists_loop) ? result.artists_loop : [];
                    // Map artists first without blocking on image URLs
                    self.artists = loop.map(function(i) {
                        return {
                            key: 'a-' + i.id,
                            id: i.id,
                            title: i.artist || i.title || ('#' + i.id),
                            portraitid: i.portraitid,
                            image: ''
                        };
                    });
                    if (!self.artists.length) {
                        self.err = 'No album artists (count=' + (result && result.count != null ? result.count : '?') + ')';
                    } else {
                        self.err = '';
                        // Defer portrait URLs so list paints immediately
                        self.$nextTick(function() {
                            var list = self.artists;
                            for (var ai = 0; ai < list.length; ai++) {
                                if (!list[ai].image) {
                                    list[ai].image = self.artistImage(list[ai]);
                                }
                            }
                        });
                        // Auto-select first only when wide dual-pane needs a selection.
                        // On narrow, skip auto album/bio load (user drills in) — major speed win.
                        if (!self.selectedArtist) {
                            if (self.isNarrow) {
                                self.selectedArtist = self.artists[0];
                            } else {
                                self.selectArtist(self.artists[0]);
                            }
                        }
                    }
                };
                var fail = function(msg) {
                    if (req !== self.artistReqId) {
                        return;
                    }
                    finish();
                    self.err = msg || 'Failed to load artists';
                    self.artists = [];
                };
                setTimeout(function() {
                    if (!done && req === self.artistReqId) {
                        fail('Timed out loading artists');
                    }
                }, 20000);

                var cmd = this.artistCmd();
                // strip start/count for lmsCommand array form: full command includes them
                if (typeof lmsCommand === 'function') {
                    lmsCommand('', cmd, undefined, 18000).then(function(r) {
                        apply(r && r.data);
                    }).catch(function(e) {
                        fail((e && e.message) ? e.message : 'Failed to load artists');
                    });
                    return;
                }
                fail('No HTTP client');
            },
            selectArtist: function(item, opts) {
                if (!item) {
                    return;
                }
                opts = opts || {};
                if (!item.image) {
                    item.image = this.artistImage(item);
                }
                this.selectedArtist = item;
                this.artistBio = '';
                this.albums = [];
                // Skip network work when only highlighting (narrow / filter landing)
                if (opts.light) {
                    return;
                }
                this.loadAlbumsForArtist(item);
                // Bio is secondary — load after albums request is fired
                var self = this;
                setTimeout(function() {
                    if (self.selectedArtist && self.selectedArtist.id === item.id) {
                        self.loadArtistBio(item);
                    }
                }, 120);
            },
            loadAlbumsForArtist: function(artist) {
                var self = this;
                this.loadingAlbums = true;
                // Ma musique: when role filter is on, prefer Album Artist role; else all roles
                var extra = ['artist_id:' + artist.id];
                if (this.useRoleFilter()) {
                    extra.push('role_id:ALBUMARTIST');
                }
                var params = this.albumParams(extra, true);
                // Artist-album sort from Ma musique (yearalbum default in Material)
                try {
                    var aSort = mapMyMusicArtistAlbumSort();
                    // Apply client-side via sorting albums array after load if needed —
                    // also nudge server sort when it maps cleanly
                    if (aSort.primary === 'year') {
                        params = params.map(function(p) {
                            return (typeof p === 'string' && p.indexOf('sort:') === 0) ? 'sort:yearalbum' : p;
                        });
                    } else if (aSort.primary === 'album') {
                        params = params.map(function(p) {
                            return (typeof p === 'string' && p.indexOf('sort:') === 0) ? 'sort:album' : p;
                        });
                    } else if (aSort.primary === 'added') {
                        params = params.map(function(p) {
                            return (typeof p === 'string' && p.indexOf('sort:') === 0) ? 'sort:new' : p;
                        });
                    }
                } catch (e) {}
                lmsList(this.catalogPid(), ['albums'], params, 0, FUSION_BATCH).then(function(res) {
                    if (self.selectedArtist && self.selectedArtist.id !== artist.id) {
                        return;
                    }
                    var result = res.data && (res.data.result || res.data);
                    var loop = (result && result.albums_loop) ? result.albums_loop : [];
                    // Fallback without role filter if empty (role filter may have been too strict)
                    if (!loop.length && self.useRoleFilter()) {
                        return lmsList(self.catalogPid(), ['albums'], self.albumParams(['artist_id:' + artist.id], true), 0, FUSION_BATCH);
                    }
                    return res;
                }).then(function(res) {
                    if (!res) {
                        return;
                    }
                    if (self.selectedArtist && self.selectedArtist.id !== artist.id) {
                        return;
                    }
                    self.loadingAlbums = false;
                    var result = res.data && (res.data.result || res.data);
                    var loop = (result && result.albums_loop) ? result.albums_loop : [];
                    var mapped = loop.map(function(i) {
                        return self.mapAlbum(i, 'alb-');
                    });
                    // Client-side order from Ma musique artist-album sort
                    try {
                        var aSort2 = mapMyMusicArtistAlbumSort();
                        self.albums = self.sortList(mapped, aSort2.primary, aSort2.secondary, aSort2.reverse, 'album');
                    } catch (e2) {
                        self.albums = mapped;
                    }
                }).catch(function() {
                    self.loadingAlbums = false;
                    self.albums = [];
                });
            },
            loadArtistBio: function(artist) {
                var self = this;
                if (typeof LMS_P_MAI === 'undefined' || !LMS_P_MAI || typeof lmsCommand !== 'function') {
                    return;
                }
                lmsCommand('', ['musicartistinfo', 'biography', 'artist_id:' + artist.id, 'html:1']).then(function(res) {
                    if (!self.selectedArtist || self.selectedArtist.id !== artist.id) {
                        return;
                    }
                    var bio = res.data && res.data.result && (res.data.result.biography || res.data.result.text);
                    if (bio) {
                        var plain = String(bio).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                        if (plain.length > 420) {
                            plain = plain.substring(0, 417) + '…';
                        }
                        self.artistBio = plain;
                    }
                }).catch(function() {});
            },
            toggleAlbum: function(alb) {
                alb.expanded = !alb.expanded;
                if (alb.expanded && alb.tracks == null) {
                    this.loadTracks(alb);
                }
            },
            loadTracks: function(alb) {
                var self = this;
                this.$set(alb, 'loadingTracks', true);
                // d=duration, t=title, tracknum comes with t on LMS
                var params = addLibParam(['album_id:' + alb.id, 'tags:dt', 'sort:tracknum'], this);
                lmsList(this.catalogPid(), ['tracks'], params, 0, 1000).then(function(res) {
                    self.$set(alb, 'loadingTracks', false);
                    var result = res.data && (res.data.result || res.data);
                    var loop = (result && result.titles_loop) ? result.titles_loop : [];
                    self.$set(alb, 'tracks', loop.map(function(i) {
                        return {
                            key: 't-' + (i.id || i.url || i.title),
                            id: i.id,
                            title: i.title || '',
                            tracknum: i.tracknum,
                            durationStr: self.fmtTime(i.duration != null ? i.duration : i.secs)
                        };
                    }));
                }).catch(function() {
                    self.$set(alb, 'loadingTracks', false);
                    self.$set(alb, 'tracks', []);
                });
            },
            loadAllAlbums: function() {
                var self = this;
                this.loadingAllAlbums = true;
                lmsList(this.catalogPid(), ['albums'], this.albumParams(null, true), 0, FUSION_BATCH).then(function(res) {
                    self.loadingAllAlbums = false;
                    var result = res.data && (res.data.result || res.data);
                    var loop = (result && result.albums_loop) ? result.albums_loop : [];
                    self.allAlbums = loop.map(function(i) {
                        return self.mapAlbum(i, 'gallb-');
                    });
                    // Genre fill only if user uses genre sort (see setSort) — skip on first paint
                }).catch(function() {
                    self.loadingAllAlbums = false;
                    self.allAlbums = [];
                });
            },
            loadSongs: function() {
                var self = this;
                this.loadingSongs = true;
                this.loadStatus = 'loading songs…';
                // a=artist e=? l=album t=title d=duration g=genre D=addedTime; y=year on demand
                var tags = 'tags:aeltdgD';
                var needYear = (this.songCols && this.songCols.year) || this.sortSongs === 'year' || this.sortSongs2 === 'year';
                if (needYear) {
                    tags += 'y';
                }
                var params = addLibParam([tags, 'sort:title'], this);
                var t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
                lmsList(this.catalogPid(), ['tracks'], params, 0, FUSION_BATCH).then(function(res) {
                    var result = res.data && (res.data.result || res.data);
                    var loop = (result && result.titles_loop) ? result.titles_loop : [];
                    // Map off the hot path in chunks so UI can paint "loaded" sooner
                    var out = new Array(loop.length);
                    var i = 0;
                    var chunk = 250;
                    var mapChunk = function() {
                        var end = Math.min(i + chunk, loop.length);
                        for (; i < end; i++) {
                            var tr = loop[i];
                            var dnum = tr.duration != null ? tr.duration : tr.secs;
                            var year = tr.year && parseInt(tr.year, 10) > 0 ? String(tr.year) : '';
                            var genre = tr.genre || '';
                            var addedRaw = tr.addedTime != null ? tr.addedTime
                                : (tr.added_time != null ? tr.added_time
                                    : (tr.timestamp != null ? tr.timestamp : 0));
                            var addedNum = parseAddedNum(addedRaw);
                            out[i] = {
                                key: 's-' + (tr.id || tr.url || i),
                                id: tr.id,
                                title: tr.title || '',
                                artist: tr.artist || '',
                                album: tr.album || '',
                                genre: genre,
                                year: year,
                                yearNum: year ? parseInt(year, 10) : 0,
                                addedNum: addedNum,
                                addedStr: fmtAddedDate(addedNum),
                                tracknum: tr.tracknum != null ? tr.tracknum : '',
                                artistId: tr.artist_id,
                                albumId: tr.album_id,
                                durationNum: dnum != null ? Number(dnum) : 0,
                                durationStr: self.fmtTime(dnum),
                                // pre-lower for filter
                                _q: ((tr.title || '') + ' ' + (tr.artist || '') + ' ' + (tr.album || '') + ' ' + genre + ' ' + year).toLowerCase()
                            };
                        }
                        if (i < loop.length) {
                            self.loadStatus = 'mapping ' + i + '/' + loop.length + '…';
                            setTimeout(mapChunk, 0);
                            return;
                        }
                        self.songs = out;
                        self.loadingSongs = false;
                        self.loadStatus = '';
                        var ms = ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - t0;
                        if (ms > 2000 && typeof console !== 'undefined' && console.debug) {
                            console.debug('[fusion] songs loaded', out.length, Math.round(ms) + 'ms');
                        }
                    };
                    mapChunk();
                }).catch(function() {
                    self.loadingSongs = false;
                    self.loadStatus = '';
                    self.songs = [];
                });
            },
            playlistCmd: function(cmd, idKey, id) {
                if (id == null) {
                    return;
                }
                bus.$emit('playerCommand', ['playlistcontrol', 'cmd:' + cmd, idKey + ':' + id]);
            },
            playArtist: function() {
                if (this.selectedArtist) {
                    this.playlistCmd('load', 'artist_id', this.selectedArtist.id);
                }
            },
            shuffleArtist: function() {
                if (!this.selectedArtist) {
                    return;
                }
                var pid = this.pid();
                var id = this.selectedArtist.id;
                lmsCommand(pid, ['playlistcontrol', 'cmd:load', 'artist_id:' + id]).then(function() {
                    bus.$emit('playerCommand', ['playlist', 'shuffle', 1]);
                    bus.$emit('refreshStatus');
                }).catch(function() {
                    bus.$emit('refreshStatus');
                });
            },
            playAlbum: function(alb) {
                if (alb) {
                    this.playlistCmd('load', 'album_id', alb.id);
                }
            },
            /** Open classic Material album (track list) browse */
            openAlbum: function(alb) {
                if (!alb || alb.id == null) {
                    return;
                }
                var tags = (typeof TRACK_TAGS !== 'undefined') ? TRACK_TAGS : 'tags:dist';
                var sort = ((typeof SORT_KEY !== 'undefined') ? SORT_KEY : 'sort:') + 'tracknum';
                var title = alb.title || '';
                // Navigate to standard album view; fusion unmounts when leaving My Music root
                bus.$emit('browse', ['tracks'], ['album_id:' + alb.id, tags, sort], title, undefined, false);
            },
            addAlbum: function(alb) {
                if (alb) {
                    this.playlistCmd('add', 'album_id', alb.id);
                }
            },
            insertAlbum: function(alb) {
                if (alb) {
                    this.playlistCmd('insert', 'album_id', alb.id);
                }
            },
            shuffleAlbum: function(alb) {
                if (!alb) {
                    return;
                }
                var pid = this.pid();
                lmsCommand(pid, ['playlistcontrol', 'cmd:load', 'album_id:' + alb.id]).then(function() {
                    bus.$emit('playerCommand', ['playlist', 'shuffle', 1]);
                    bus.$emit('refreshStatus');
                }).catch(function() {
                    bus.$emit('refreshStatus');
                });
            },
            playTrack: function(tr) {
                if (tr && tr.id != null) {
                    this.playlistCmd('load', 'track_id', tr.id);
                }
            },
            addTrack: function(tr) {
                if (tr && tr.id != null) {
                    this.playlistCmd('add', 'track_id', tr.id);
                }
            },
            insertTrack: function(tr) {
                if (tr && tr.id != null) {
                    this.playlistCmd('insert', 'track_id', tr.id);
                }
            },
            goArtist: function(item) {
                if (!item) {
                    return;
                }
                // Jump to Artists tab and select matching / first filtered artist
                var self = this;
                var after = function() {
                    var list = self.filteredArtists;
                    var found = null;
                    if (item.artistId) {
                        for (var i = 0; i < list.length; i++) {
                            if (String(list[i].id) === String(item.artistId)) {
                                found = list[i];
                                break;
                            }
                        }
                        if (!found) {
                            for (var j = 0; j < self.artists.length; j++) {
                                if (String(self.artists[j].id) === String(item.artistId)) {
                                    found = self.artists[j];
                                    break;
                                }
                            }
                        }
                    }
                    if (!found && item.artist) {
                        for (var k = 0; k < list.length; k++) {
                            if (list[k].title === item.artist) {
                                found = list[k];
                                break;
                            }
                        }
                    }
                    // With an active filter, prefer first filtered match if no exact hit
                    if (!found && self.filterQ && list.length) {
                        found = list[0];
                    }
                    if (found) {
                        self.selectArtist(found);
                        self.kbKey = found.key;
                        self.kbIndex = list.indexOf(found);
                        if (self.isNarrow) {
                            self.drillLevel = 1;
                            self.drillAlbum = null;
                        }
                    } else if (item.artistId) {
                        self.selectArtist({
                            key: 'a-' + item.artistId,
                            id: item.artistId,
                            title: item.artist || ('#' + item.artistId)
                        });
                        if (self.isNarrow) {
                            self.drillLevel = 1;
                            self.drillAlbum = null;
                        }
                    }
                };
                if (this.tab !== 'artists') {
                    this.tab = 'artists';
                    try { setLocalStorageVal('libFusionTab', 'artists'); } catch (e) {}
                    this.showSort = false;
                    this.closeCtx();
                    this.clearSelection();
                }
                if (!this.artists.length) {
                    this.loadArtists();
                    var tries = 0;
                    var t = setInterval(function() {
                        tries++;
                        if (!self.loadingArtists || tries > 50) {
                            clearInterval(t);
                            after();
                        }
                    }, 80);
                } else {
                    this.$nextTick(after);
                }
            },
            goAlbum: function(item) {
                if (!item) {
                    return;
                }
                if (item.albumId) {
                    this.openAlbum({ id: item.albumId, title: item.album || '' });
                    return;
                }
                if (item.album) {
                    this.setTab('albums');
                    if (!this.allAlbums.length) {
                        this.loadAllAlbums();
                    }
                    this.filter = item.album;
                }
            }
        }
    });
})();
