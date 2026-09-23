/**
 * LMS-Material
 *
 * Copyright (c) 2018-2026 Craig Drummond <craig.p.drummond@gmail.com>
 * MIT license.
 */
'use strict';

function searchListFlatten(item) {
    if (Array.isArray(item)) {
        let vals = [];
        for (let i=0, len=item.length; i<len; ++i) {
            vals.push(stripTags(""+item[i]).toLowerCase());
        }
        return vals.join(" ");
    }
    return stripTags(""+item).toLowerCase();
}

function browseListItemMatchesFilter(item, term) {
    if (!term) {
        return true;
    }
    if (!item || item.header || item.spacer) {
        return false;
    }
    return searchListHasStr(item, term);
}

function searchListHasStr(a, b) {
    if (undefined==a) {
        return false;
    }
    if (undefined==a.string_search_cache) {
        let strings = [];
        if (undefined!=a.title) {
            strings.push(searchListFlatten(a.title));
        }
        if (undefined!=a.subtitle) {
            strings.push(searchListFlatten(a.subtitle));
        }
        if (undefined!=a.artistAlbum) {
            strings.push(searchListFlatten(a.artistAlbum));
        }
        a.string_search_cache = strings.join(" ");
    }
    return a.string_search_cache.indexOf(b)>=0;
}

Vue.component('lms-search-list', {
    template: `
<v-layout class="lms-search-list-row" style="min-width:0;max-width:100%;overflow:hidden;align-items:center">
 <form class="lms-search-list-form" @submit.prevent="submitSearch">
  <v-text-field type="search" :label="compact ? undefined : (notFoundTimer ? i18n('Not found') : fieldLabel)" :placeholder="compact ? (notFoundTimer ? i18n('Not found') : fieldLabel) : undefined" :hint="compact ? undefined : filterHint" :persistent-hint="!compact" :hide-details="compact" single-line :error="notFoundTimer" clearable autocorrect="off" v-model="term" class="lms-search lib-search" @input="textChanged($event)" @input.native="onNativeInput($event)" @keydown.native="onNativeKey($event)" @keyup.native.enter="submitSearch($event)" @focus.native="onFocus" @blur="stopDebounce" @click:clear="cleared" ref="entry" style="min-width:0;flex:1 1 0;max-width:100%"></v-text-field>
 </form>
 <v-btn flat v-if="!empty" icon :title="filterPrevTitle" :disabled="notFoundTimer" style="margin-right:-6px!important;flex:0 0 auto" class="toolbar-button" @click="filterPrev()"><v-icon>arrow_upward</v-icon></v-btn>
 <v-btn flat v-if="!empty" icon :title="filterNextTitle" :disabled="notFoundTimer" style="margin-right:-6px!important;flex:0 0 auto" class="toolbar-button" @click="filterNext()"><v-icon>arrow_downward</v-icon></v-btn>
 <v-btn flat v-if="msearch" icon :title="ACTIONS[SEARCH_LIB_ACTION].title" :disabled="notFoundTimer" class="toolbar-button" style="flex:0 0 auto" @click="searchMusic"><img class="svg-img" :src="ACTIONS[SEARCH_LIB_ACTION].svg | svgIcon(darkUi)"></img></v-btn>
</v-layout>
`,
    props: {
        view: {
            type: Object,
            required: true
        },
        msearch: {
            type: Boolean,
            required: false
        },
        title: {
            type: String
        },
        compact: {
            type: Boolean,
            required: false
        },
        placeholder: {
            type: String,
            required: false
        },
        autofocus: {
            type: Boolean,
            default: true
        }
    },
    data() {
        return {
            term: "",
            notFoundTimer: undefined
        }
    },
    computed: {
        darkUi() {
            return this.$store.state.darkUi
        },
        empty() {
            return null==this.term || undefined==this.term || isEmpty(this.term.trim())
        },
        filterPrevTitle() {
            return this.view.browseListNavActive()
                     ? i18n('Previous item') + ' (↑)'
                     : i18n('Previous match');
        },
        filterNextTitle() {
            return this.view.browseListNavActive()
                     ? i18n('Next item') + ' (↓)'
                     : i18n('Next match');
        },
        filterHint() {
            return 2==this.view.searchActive
                     ? i18n('↑↓ navigate') + ' · ' + i18n('Enter to open') + ' · ' + i18n('%1 to play', shortcutStr('Enter'))
                     : undefined;
        },
        fieldLabel() {
            if (this.placeholder) {
                return this.placeholder;
            }
            return ACTIONS[SEARCH_LIST_ACTION].title+(undefined==this.title ? '' : SEPARATOR+this.title);
        }
    },
    mounted() {
        this.term = "";
        this.lastSearch = undefined;
        this.commands = [];
        this.searching = false;
        this.currentIndex = -1;

        this.indexes = [];
        if (this.view.items.length>0 && undefined!=this.view.items[0].searchcat) {
            for (let i=0, loop=this.view.items, len=loop.length; i<len; ++i) {
                if (undefined!=loop[i].items) {
                    for (let j=0, jlen=loop[i].items.length; j<jlen; ++j) {
                        this.indexes.push([i, j]);
                    }
                } else {
                    this.indexes.push([i, -1]);
                }
            }
        }

        // Overflow pull-menu: never auto-focus (iOS scrolls the list and
        // immediately dismisses the tools row). Queue / dialogs still focus.
        if (this.autofocus!==false) {
            if (IS_MOBILE) {
                setTimeout(function() { focusEntry(this) }.bind(this), 150);
            } else {
                focusEntry(this);
            }
        }
        bus.$on('search-list-seed', function(ch) {
            if (undefined==ch || !ch.length) {
                return;
            }
            this.term = ch;
            bus.$emit('browse-list-filter', ch);
            this.$nextTick(function() {
                focusEntry(this);
            }.bind(this));
        }.bind(this));
    },
    methods: {
        cancel() {
            this.stopDebounce();
            this.stopNotFound();
        },
        stopDebounce() {
            if (undefined!=this.debounceTimer) {
                clearTimeout(this.debounceTimer);
                this.debounceTimer = undefined;
            }
        },
        stopNotFound() {
            if (undefined!=this.notFoundTimer) {
                clearTimeout(this.notFoundTimer);
                this.notFoundTimer = undefined;
            }
        },
        termValueFromEvent(event) {
            if (undefined==event || event===null) {
                return this.term;
            }
            if (typeof event==='string' || typeof event==='number') {
                return ''+event;
            }
            if (event.target && undefined!=event.target.value) {
                return ''+event.target.value;
            }
            return this.term;
        },
        emitFilter() {
            if (this.view && this.view.searchActive!=1) {
                this.view.searchActive = 2;
            }
            let raw = undefined==this.term ? '' : (''+this.term);
            bus.$emit('browse-list-filter', raw);
            this.currentIndex = -1;
            this.lastSearch = undefined;
            this.$emit('scrollTo', -1, -1);
        },
        onFocus() {
            if (this.view && typeof this.view.holdBrowseOverflow==='function') {
                this.view.holdBrowseOverflow();
            }
            takeOverSearchKeyboard(this);
        },
        textChanged(event) {
            this.stopDebounce();
            this.term = this.termValueFromEvent(event);
            this.emitFilter();
        },
        onNativeInput(event) {
            this.stopDebounce();
            this.term = this.termValueFromEvent(event);
            this.emitFilter();
        },
        onNativeKey(e) {
            if (!e) {
                return;
            }
            if (e.key==='Enter' || e.keyCode===13 || e.which===13) {
                try { e.preventDefault(); } catch (ex) {}
                this.submitSearch(e);
                return;
            }
            this.filterKeyDown(e);
        },
        submitSearch(e) {
            if (e) {
                try { e.preventDefault(); } catch (ex) {}
            }
            this.emitFilter();
            let str = undefined==this.term ? '' : (''+this.term).trim();
            if (!str) {
                return;
            }
            // Loupe field: Enter = library search. Otherwise jump to next in-list match.
            if (this.msearch) {
                this.searchMusic();
                return;
            }
            if (this.view && typeof this.view.listFilterActivateSelected==='function' &&
                this.view.listFilterSelPos>=0) {
                this.view.listFilterActivateSelected(false);
                return;
            }
            this.searchNow(false);
        },
        filterKeyDown(e) {
            if (!e) {
                return;
            }
            if (e.key==='Enter' || e.keyCode===13 || e.which===13) {
                return;
            }
            if (this.view.browseListNavFromKey(e)) {
                return;
            }
        },
        filterPrev() {
            if (this.view.browseListNavActive()) {
                this.view.listFilterMoveSelection(-1);
            } else {
                this.searchNow(true);
            }
        },
        filterNext() {
            if (this.view.browseListNavActive()) {
                this.view.listFilterMoveSelection(1);
            } else {
                this.searchNow(false);
            }
        },
        getItem(idx) {
            let item = this.view.items[idx[0]];
            if (undefined==item.items || idx[1]<0) {
                return item;
            }
            return item.items[idx[1]];
        },
        searchFor(str, start, backwards) {
            if (this.indexes.length>0) {
                for (let idx = start, loop=this.indexes, len=loop.length; backwards ? idx>=0 : idx<len; idx+=(backwards ? -1 : 1)) {
                    if (!this.view.items[this.indexes[idx][0]].header && searchListHasStr(this.getItem(this.indexes[idx]), str)) {
                        this.currentIndex = idx;
                        this.$emit('scrollTo', this.indexes[idx][0], this.indexes[idx][1]);
                        this.lastSearch = str;
                        return true;
                    }
                }
            } else {
                for (let idx = start, loop=this.view.items, len=loop.length; backwards ? idx>=0 : idx<len; idx+=(backwards ? -1 : 1)) {
                    if (!this.view.items[idx].header && searchListHasStr(this.view.items[idx], str)) {
                        this.currentIndex = idx;
                        this.$emit('scrollTo', this.currentIndex, -1);
                        this.lastSearch = str;
                        return true;
                    }
                }
            }
            return false;
        },
        cleared() {
            this.lastSearch = undefined;
            this.currentIndex = -1;
            this.term = '';
            this.view.listFilterSelPos = -1;
            bus.$emit('browse-list-filter', '');
            this.$emit('scrollTo', -1, -1);
        },
        searchNow(backwards) {
            this.cancel();
            if (undefined==this.term) {
                return;
            }
            let str = this.term.trim().replace(/\s+/g, " ");
            if (!isEmpty(str)) {
                str = str.toLowerCase();
                let loop = this.indexes.length>0 ? this.indexes : this.view.items;
                let len = loop.length;
                let start = -1==this.currentIndex || this.currentIndex>=len ? backwards ? len-1 : 0 : (backwards ? (this.currentIndex-1) : (this.currentIndex+1));
                if (this.searchFor(str, start, backwards)) {
                    return;
                }
                if (str!=this.lastSearch) {
                    this.lastSearch = str;
                    if (this.searchFor(str, 0, false)) {
                        return;
                    }
                }
                this.notFoundTimer = setTimeout(function () {
                    this.notFoundTimer = undefined;
                }.bind(this), 1000);
            }
        },
        searchMusic() {
            bus.$emit('browse-search', undefined==this.term ? "" : this.term.trim().replace(/\s+/g, " "));
            setTimeout(function() {bus.$emit('search-initial')}, 5);
        },
        i18n(str) {
            return i18n(str);
        }
    },
    watch: {
        term: function() {
            this.emitFilter();
        }
    },
    beforeDestroy() {
        bus.$off('search-list-seed');
        bus.$emit('browse-list-filter', '');
        this.cancel();
        for (let idx = 0, loop=this.view.items, len=loop.length; idx<len; idx++) {
            if (undefined!=loop[idx].string_search_cache) {
                delete loop[idx].string_search_cache;
            }
            if (undefined!=loop[idx].items) {
                for (let j = 0, jloop=loop[idx].items, jlen=jloop.length; j<jlen; j++) {
                    if (undefined!=jloop[j].string_search_cache) {
                        delete jloop[j].string_search_cache;
                    }
                }
            }
        }
    }
})

