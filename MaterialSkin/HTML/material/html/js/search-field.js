/**
 * LMS-Material
 *
 * Copyright (c) 2018-2026 Craig Drummond <craig.p.drummond@gmail.com>
 * MIT license.
 */
'use strict';

const SEARCH_OTHER = {
    "band's campout":{svg:"bandcamp"},
    "bbc sounds":{svg:"bbc-sounds"},
    "deezer":{svg:"deezer"},
    "qobuz":{svg:"qobuz"},
    "spotty":{svg:"spotify"},
    "tidal":{svg:"tidal"},
    "youtube":{svg:"youtube"},
    "wefunk radio":{svg:"radio-station"},
    "tunein":{svg:"tunein"},
    "tunein radio":{svg:"tunein"},
    "podcasts":{svg:"podcast"},
    "podcast":{svg:"podcast"},
    "radio":{svg:"radio-station"},
    "radios":{svg:"radio-station"}
}

function searchOtherIconForTitle(title) {
    if (!title) {
        return undefined;
    }
    let lc = (''+title).toLowerCase();
    if (SEARCH_OTHER[lc]) {
        return SEARCH_OTHER[lc];
    }
    if (lc.indexOf('tunein')>=0 || lc.indexOf('radio')>=0) {
        return {svg:'tunein'};
    }
    if (lc.indexOf('podcast')>=0) {
        return {svg:'podcast'};
    }
    return undefined;
}

function buildSearchResp(view) {
    let results = view.results;
    let items=[];
    let total=0;
    let forceList = !isSetToUseGrid(GRID_TOP);
    let gridClamp = numScrollItems(view, document.getElementById("browse-view"));
    for (let i=0, len=results.length; i<len; ++i) {
        let all = [];
        let cat = results[i].command.cat;
        let useList = forceList ||
                      SEARCH_TRACKS_CAT==cat ||
                      (SEARCH_ARTISTS_CAT==cat && (!isSetToUseGrid({command:['artists']}) || !LMS_P_MAI || !lmsOptions.showArtistImages)) ||
                      (SEARCH_ALBUMS_CAT==cat && !isSetToUseGrid({command:['albums']})) ||
                      (SEARCH_PLAYLISTS_CAT==cat && (!lmsOptions.playlistImages || !isSetToUseGrid({command:['playlists']})))
        let maxItems = useList ? LMS_INITIAL_SEARCH_RESULTS : gridClamp;
        let numItems = results[i].resp.items.length;
        let clamped = SEARCH_OTHER_CAT!=cat && numItems>maxItems
        let limit = clamped ? maxItems : numItems;
        let titleParam = clamped ? limit+" / "+numItems : numItems;
        let filter = undefined;

        total+=numItems;
        if (SEARCH_ARTISTS_CAT==cat) {
            //useList = !getLocalStorageBool('artists-grid', true);
            filter = FILTER_PREFIX+"artist";
            items.push({title: i18n("Artists") + " ("+titleParam+")", id:filter, header:true, hidesub:true, svg:"artist",
                        allItems: clamped ? all : undefined, subtitle: i18np("1 Artist", "%1 Artists", numItems), searchcat:cat, useList:useList});
        } else if (SEARCH_ALBUMS_CAT==cat) {
            //useList = !getLocalStorageBool('albums-grid', true);
            filter = FILTER_PREFIX+"album";
            items.push({title: (lmsOptions.supportReleaseTypes ? i18n("Releases") : i18n("Albums")) + " ("+titleParam+")",
                        id:filter, header:true, hidesub:true, svg: lmsOptions.supportReleaseTypes ? "release" : undefined,
                        icon: lmsOptions.supportReleaseTypes ? undefined : "album",
                        allItems: clamped ? all : undefined, subtitle:lmsOptions.supportReleaseTypes ? i18np("1 Release", "%1 Releases", numItems) : i18np("1 Album", "%1 Albums", numItems),
                        searchcat:cat, useList:useList});
        } else if (SEARCH_WORKS_CAT==cat) {
            if (numItems>0) {
                //useList = !getLocalStorageBool('works-grid', true);
                filter = FILTER_PREFIX+"work";
                items.push({title: i18n("Works") + " ("+titleParam+")",
                            id:filter, header:true, hidesub:true, svg: "classical-work",
                            allItems: clamped ? all : undefined, subtitle:i18np("1 Work", "%1 Works", numItems),
                            searchcat:cat, useList:useList});
            }
        } else if (SEARCH_TRACKS_CAT==cat) {
            filter = FILTER_PREFIX+"track";
            items.push({title: i18n("Tracks", titleParam) + " ("+titleParam+")", id:filter, header:true, hidesub:true,
                        allItems: clamped ? all : undefined, subtitle: i18np("1 Track", "%1 Tracks", numItems),
                        icon: "music_note", searchcat:cat, useList:useList});
        } else if (SEARCH_PLAYLISTS_CAT==cat) {
            //useList = !lmsOptions.playlistImages || !getLocalStorageBool('playlists-grid', true);
            filter = FILTER_PREFIX+"playlist";
            items.push({title: i18n("Playlists") + " ("+titleParam+")", id:filter, header:true, hidesub:true, icon:"list",
                        allItems: clamped ? all : undefined, subtitle: i18np("1 Playlist", "%1 Playlists", numItems),
                        searchcat:cat, useList:useList});
        } else if (SEARCH_RADIOS_CAT==cat) {
            filter = FILTER_PREFIX+"radio";
            items.push({title: i18n("Radio") + " ("+titleParam+")", id:filter, header:true, hidesub:true, svg:"radio-station",
                        allItems: clamped ? all : undefined, subtitle: i18np("1 Station", "%1 Stations", numItems),
                        searchcat:cat, useList:useList});
        } else if (SEARCH_PODCASTS_CAT==cat) {
            filter = FILTER_PREFIX+"podcast";
            items.push({title: i18n("Podcasts") + " ("+titleParam+")", id:filter, header:true, hidesub:true, svg:"podcast",
                        allItems: clamped ? all : undefined, subtitle: i18np("1 Podcast", "%1 Podcasts", numItems),
                        searchcat:cat, useList:useList});
        } else if (SEARCH_OTHER_CAT==cat) {
            items.push({title: i18n("Search on..."), id:"search.other", header:true, icon:"search", searchcat:cat, useList:useList});
        }
        let list = useList ? items : [];
        for (let idx=0, loop=results[i].resp.items; idx<numItems; ++idx) {
            let itm = loop[idx];
            itm.filter=filter;
            if (idx<limit) {
                list.push(itm);
            }
            if (clamped) {
                all.push(itm);
            }
        }
        if (!useList) {
            items.push({items: list, searchcat:cat});
        }
    }
    return items;
}

let seachReqId = 0;
Vue.component('lms-search-field', {
    template: `
<v-layout class="lms-search-field">
 <form class="lms-search-list-form" @submit.prevent="submitSearch">
  <input type="search" class="lms-search-native lms-search lib-search" ref="entry" id="browse-search-input"
   :placeholder="searchLabel" enterkeyhint="search" autocorrect="off" autocomplete="off" autocapitalize="off" spellcheck="false"
   @input="textChanged($event)" @keydown="searchNavKeyDown($event)" @focus="onFocus" @blur="onBlur">
 </form>
 <v-btn v-if="term && term.length>0" flat icon class="toolbar-button" :title="i18n('Clear')" @mousedown.prevent="clearTerm()"><v-icon>cancel</v-icon></v-btn>
 <v-icon v-if="searching" class="toolbar-button pulse">search</v-icon>
 <v-btn v-if="!searching && !queryParams.party && history.length>0 && (history.length>1 || history[0]!=term)" flat icon class="toolbar-button" @click="showHistory()"><v-icon>history</v-icon></v-btn>
 <v-btn v-if="!searching && !queryParams.party" :title="ACTIONS[ADV_SEARCH_ACTION].title" flat icon class="toolbar-button" @click="advanced()"><img :src="ACTIONS[ADV_SEARCH_ACTION].svg | svgIcon(darkUi)"></img></v-btn>
</v-layout>
`,
    props: {
        view: {
            type: Object,
            required: false
        }
    },
    data() {
        return {
            term: "",
            searching: false,
            history: []
        }
    },
    computed: {
        darkUi() {
            return this.$store.state.darkUi
        },
        searchLabel() {
            return ACTIONS[SEARCH_LIB_ACTION].title;
        },
        searchHint() {
            if (IS_MOBILE) {
                return undefined;
            }
            return this.view && this.view.browseListNavActive()
                     ? i18n('↑↓ navigate') + ' · ' + i18n('Enter to open') + ' · ' + i18n('%1 to play', shortcutStr('Enter'))
                     : undefined;
        }
    },
    mounted() {
        this.term = getLocalStorageVal('search', '');
        this.history = JSON.parse(getLocalStorageVal('searchHistory', '[]'));
        this.commands=[];
        this.results=[];
        this.searching=false;
        this.str = "";
        this.prevPage = undefined;
        this.writeTermToInput();
        if (this.view && this.view.searchActive==1) {
            this.$nextTick(function() { focusBrowseSearchInput(); }.bind(this));
        }
        this._onSearchFor = function(text, prevPage) {
            this.setTerm(text);
            this.prevPage = prevPage;
            this.searchNow();
        }.bind(this);
        this._onSearchInitial = function() {
            let item = {cancache:false, title:i18n("Search"), id:SEARCH_ID, type:"search", libsearch:true};
            this.$emit('results', item, {command:[], params:[]}, { items:[], baseActions:[], canUseGrid: false, jumplist:[]}, this.prevPage);
        }.bind(this);
        this._onSearchFocus = function() {
            focusBrowseSearchInput();
        }.bind(this);
        bus.$on('search-for', this._onSearchFor);
        bus.$on('search-initial', this._onSearchInitial);
        bus.$on('search-focus', this._onSearchFocus);
    },
    methods: {
        cancel() {
            this.stopDebounce();
            if (this.searching) {
                this.commands=[];
                this.results=[];
                this.searching=false;
                seachReqId++;
            }
            if (this.view) {
                this.view.browseSearching = false;
            }
        },
        stopDebounce() {
            if (undefined!=this.debounceTimer) {
                clearTimeout(this.debounceTimer);
                this.debounceTimer = undefined;
            }
        },
        getInputEl() {
            if (this.$refs.entry && this.$refs.entry.tagName==='INPUT') {
                return this.$refs.entry;
            }
            return document.getElementById('browse-search-input');
        },
        writeTermToInput() {
            let el = this.getInputEl();
            if (el && el.value!==(this.term||'')) {
                el.value = this.term||'';
            }
        },
        setTerm(val) {
            this.term = val==null ? '' : ''+val;
            this.writeTermToInput();
        },
        clearTerm() {
            this.setTerm('');
            this.str = '';
            this.stopDebounce();
            focusBrowseSearchInput();
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
        scheduleSearch() {
            this.stopDebounce();
            this.debounceTimer = setTimeout(function () {
                this.searchNow();
            }.bind(this), 400);
        },
        advanced() {
            bus.$emit('closeLibSearch');
            bus.$emit('dlg.open', 'advancedsearch', true, this.$store.state.library ? this.$store.state.library : LMS_DEFAULT_LIBRARY);
        },
        textChanged(event) {
            this.term = this.termValueFromEvent(event);
            this.scheduleSearch();
        },
        onFocus() {
            let host = document.querySelector('.browse-lib-search-host');
            if (host) {
                host.classList.add('active');
            }
            if (this.view && this.view.searchActive!=1) {
                this.view.searchActive = 1;
                bus.$emit('search-initial');
            }
        },
        onBlur() {
            this.stopDebounce();
            if (IS_MOBILE) {
                return;
            }
            this.searchNow();
        },
        submitSearch() {
            this.searchNow(true);
        },
        searchNavKeyDown(e) {
            if (!e) {
                return;
            }
            if (e.key==='Enter' || e.keyCode===13 || e.which===13) {
                try { e.preventDefault(); } catch (ex) {}
                try { e.stopPropagation(); } catch (ex2) {}
                this.searchNow(true);
                return;
            }
            if (this.view && this.view.browseListNavFromKey(e)) {
                return;
            }
        },
        searchNow(force) {
            try {
                let el = this.getInputEl();
                if (el && undefined!=el.value) {
                    this.term = el.value;
                }
            } catch (e) {}
            if (undefined==this.term) {
                return;
            }
            let str = this.term.trim().replace(/\s+/g, " ");
            if (str.length<2) {
                return;
            }
            if (!force && str==this.str) {
                return;
            }
            this.cancel();
            this.str = str;
            setLocalStorageVal('search', this.str);
            this.addToHistory(str);
            this.commands=[];
            if (!queryParams.party) {
                this.commands.push({cat:SEARCH_ARTISTS_CAT, command:["artists"], params:["tags:s", "search:"+this.str]});
                this.commands.push({cat:SEARCH_ALBUMS_CAT, command:["albums"], params:[(lmsOptions.showAllArtists ? ALBUM_TAGS_ALL_ARTISTS : ALBUM_TAGS).replace("W", "")+(lmsOptions.serviceEmblems ? "E" : ""), "search:"+this.str]});
                this.commands.push({cat:SEARCH_WORKS_CAT, command:["works"], params:["search:"+this.str]});
            }
            this.commands.push({cat:SEARCH_TRACKS_CAT, command:["tracks"], params:[SEARCH_TRACK_TAGS+"elcy"+
                                                                   (this.$store.state.showRating ? "R" : "")+
                                                                   (lmsOptions.serviceEmblems ? "E" : "")+
                                                                   (lmsOptions.techInfo ? TECH_INFO_TAGS : ""), "search:"+this.str]});
            if (!queryParams.party) {
                this.commands.push({cat:SEARCH_PLAYLISTS_CAT, command:["playlists"], params:["tags:su", "search:"+this.str]});
                this.commands.push({cat:SEARCH_RADIOS_CAT, command:["radios"], params:["menu:radio", "search:"+this.str]});
                this.commands.push({cat:SEARCH_PODCASTS_CAT, command:["podcasts", "items"], params:["menu:podcasts", "search:"+this.str]});
                this.commands.push({cat:SEARCH_OTHER_CAT, command:["globalsearch", "items"], params:["menu:1", "search:"+this.str]});
            }
            let libId = this.$store.state.library ? this.$store.state.library : LMS_DEFAULT_LIBRARY;
            if (libId) {
                for (let i=0, len=this.commands.length; i<len; ++i) {
                    let cat = this.commands[i].cat;
                    if (cat==SEARCH_RADIOS_CAT || cat==SEARCH_PODCASTS_CAT || cat==SEARCH_OTHER_CAT) {
                        continue;
                    }
                    this.commands[i].params.push("library_id:"+libId);
                }
            }
            this.searching = true;
            seachReqId++;
            if (this.view) {
                this.view.browseSearching = true;
                this.view.fetchingItem = SEARCH_ID;
                this.view.items = [];
                this.view.jumplist = [];
                this.view.filteredJumplist = [];
            }
            this.doSearch();
        },
        addToHistory(str) {
            for (let i=0, len=this.history.length; i<len; ++i) {
                if (str==this.history[i]) {
                    this.history.splice(i, 1);
                    break;
                }
            }
            this.history.unshift(str);
            if (this.history.length>20) {
                this.history = this.history.slice(0, 20);
            }
            setLocalStorageVal('searchHistory', JSON.stringify(this.history));
        },
        doSearch() {
            if (!this.searching) {
                return;
            }
            if (0==this.commands.length) {
                let item = {cancache:false, title:i18n("Search") + SEPARATOR + this.str, id:SEARCH_ID, type:"search", libsearch:true};
                if (0==this.results.length) {
                    bus.$emit('showMessage', i18n('No results found'));
                } else {
                    this.results.sort(function(a, b) { return a.command.cat<b.command.cat ? -1 : 1; });
                    this.$emit('results', item, {command:[], params:[]}, { items:buildSearchResp(this), baseActions:[], canUseGrid: false, jumplist:[], allowHoverBtns:true}, this.prevPage);
                }
                this.commands=[];
                this.results=[];
                this.searching=false;
                if (this.view) {
                    this.view.browseSearching = false;
                    if (this.view.fetchingItem==SEARCH_ID) {
                        this.view.fetchingItem = undefined;
                    }
                }
            } else {
                let command = this.commands.shift();
                let usePlayer = (SEARCH_OTHER_CAT==command.cat || SEARCH_RADIOS_CAT==command.cat) && this.$store.state.player
                    ? this.$store.state.player.id : "";
                lmsList(usePlayer, command.command, command.params, SEARCH_PLAYLISTS_CAT==command.cat ? 1 : 0, LMS_SEARCH_LIMIT, false, seachReqId).then(({data}) => {
                    if (data.id == seachReqId && this.searching) {
                        let resp = parseBrowseResp(data, undefined, {isSearch:true});
                        if (SEARCH_OTHER_CAT==command.cat) {
                            let items = resp.items;
                            resp.items = [];
                            for (let i=0, len=items.length; i<len; ++i) {
                                let icon = searchOtherIconForTitle(items[i].title);
                                if (undefined!=icon) {
                                    items[i].icon = icon.icon;
                                    items[i].svg = icon.svg;
                                    resp.items.push(items[i]);
                                }
                            }
                        }
                        if (resp.items.length>0) {
                            this.results.push({command:command, params:command.params, resp:resp});
                        }
                        this.doSearch();
                    }
                }).catch(err => {
                    this.doSearch();
                });
            }
        },
        i18n(str) {
            return i18n(str);
        },
        showHistory() {
            let items = [];
            for (let i=0, len=this.history.length; i<len; ++i) {
                items.push({id:i, title:this.history[i], canremove:1});
            }
            let numItems = items.length;
            choose("Select previous search term", items).then(resp => {
                if (undefined!=resp) {
                    if (numItems!=resp.items.length) {
                        let history = [];
                        for (let i=0, len=resp.items.length; i<len; ++i) {
                            history.push(resp.items[i].title);
                        }
                        this.history = history;
                        setLocalStorageVal('searchHistory', JSON.stringify(this.history));
                    }
                    if (undefined!=resp.item) {
                        this.setTerm(resp.item.title);
                        this.searchNow();
                    }
                }
            });
        }
    },
    beforeDestroy() {
        this.cancel();
        if (this._onSearchFor) { bus.$off('search-for', this._onSearchFor); }
        if (this._onSearchInitial) { bus.$off('search-initial', this._onSearchInitial); }
        if (this._onSearchFocus) { bus.$off('search-focus', this._onSearchFocus); }
    }
})

