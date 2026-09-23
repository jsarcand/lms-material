/**
 * LMS-Material
 *
 * Copyright (c) 2018-2026 Craig Drummond <craig.p.drummond@gmail.com>
 * MIT license.
 */
'use strict';

var B_ALBUM_SORTS=[ ];
var B_TRACK_SORTS=[ ];
const ALLOW_ADD_ALL = new Set(['trackinfo', 'youtube', 'spotty', 'spoton', 'qobuz', 'tidal', 'wimp' /*is Tidal*/, 'deezer', 'tracks', 'musicip', 'musicsimilarity', 'blissmixer', 'bandcamp']); // Allow add-all/play-all from 'trackinfo', as Spotty's 'Top Titles' access via 'More' needs this
const ALLOW_FAKE_ALL_TRACKS_ITEM = new Set(['youtube', 'qobuz']); // Allow using 'fake' add all item
const MIN_WIDTH_FOR_DETAILED_SUB = 350;
const MIN_WIDTH_FOR_HBTNS = 500;
const MIN_WIDTH_INDENT_LEFT = 550;
const MIN_WIDTH_FOR_COVER = 650;
const MIN_WIDTH_FOR_MIX_BTN = 800;
const MIN_WIDTH_FOR_COVER_INDENT = 1000;
const MIN_WIDTH_FOR_BOTH_INDENT = 1300;
const MIN_HEIGHT_FOR_DETAILED_SUB = 400;
const JUMP_LIST_WIDTH = 32;

const WIDE_BOTH = 7;
const WIDE_SUB_TEXT = 7;
const WIDE_COVER_IDENT = 6;
const WIDE_MIX_BTN = 5;
const WIDE_COVER = 4;
const WIDE_INDENT_L = 3;
const WIDE_HBTNS = 2;
const WIDE_DETAILED_SUB = 1;
const WIDE_NONE = 0;

const MIN_WIDTH_FOR_TRACK_FOUR = 500;
const MIN_WIDTH_FOR_TRACK_THREE = 410;
const MIN_WIDTH_FOR_TRACK_TWO = 320;

const TRACK_WIDE_FOUR = 3
const TRACK_WIDE_THREE = 2
const TRACK_WIDE_TWO = 1
const TRACK_WIDE_ONE = 0
/**
 * Mobile: collapse the tall album/artist subtoolbar (buttons + multi-line details)
 * into a clean single-line title while scrolling. Pull-down at the top of the list
 * (or scroll back up) expands buttons + details again.
 */
const BROWSE_SUBHEADER_COLLAPSE = true;
const HOME_PANE_HOME_ID = '__home_pane_home__';
const SCROLL_BLOCK_GAP = 12;
/* Home-split sidebar: show rail at/above MIN; labels only when wide enough, else icons-only */
const HOME_SPLIT_MIN_WIDTH = 800;
const HOME_SPLIT_LABELS_MIN_WIDTH = 1100;

var lmsBrowse = Vue.component("lms-browse", {
    template: `
<div id="browse-view" v-bind:class="{'detailed-sub':showDetailedSubtoolbar && !browseSubheaderCompact && !browseCatalogHero, 'indent-both':showDetailedSubtoolbar && !browseSubheaderCompact && !browseCatalogHero && isTrackList && wide>WIDE_COVER_IDENT && (!desktopLayout || !pinQueue), 'indent-right':showDetailedSubtoolbar && !browseSubheaderCompact && !browseCatalogHero && isTrackList && wide==WIDE_COVER_IDENT && (!desktopLayout || !pinQueue), 'indent-left':showDetailedSubtoolbar && !browseSubheaderCompact && !browseCatalogHero && wide>=WIDE_INDENT_L && (!desktopLayout || !pinQueue), 'detailed-img-track-list':showDetailedSubtoolbar && !browseSubheaderCompact && !browseCatalogHero && isImageTrackList, 'browse-subheader-compact':browseSubheaderCompact, 'browse-catalog':browseCatalogHero && !browseSubheaderCompact, 'browse-overflow-open':browseShowOverflowPanel, 'browse-lib-search':searchActive==1, 'browse-at-home':isTop, 'browse-cstats-home':browseCstatsHomeChrome, 'browse-home-split':useHomeSplit}">
 <!-- Always-mounted search field (mobile/iOS): must exist before the tap so WKWebView can focus it. -->
 <div v-if="!desktopLayout" class="browse-lib-search-host" :class="{'active': searchActive==1}">
  <v-btn flat icon @click="closeSearch" class="toolbar-button back-button" id="close-search-button-m" :title="trans.close" v-show="searchActive==1"><v-icon>{{BACK_ICON}}</v-icon></v-btn>
  <lms-search-field @results="handleListResponse" :view="this"></lms-search-field>
 </div>
 <!-- Fixed home listing (tablet landscape / wide desktop) -->
 <div v-if="useHomeSplit" class="browse-home-pane noselect" id="browse-home-pane">
  <div class="browse-home-pane-search" role="button" :title="SEARCH_LIB_ACTION | tooltip(keyboardControl)" @click.stop="homePaneSearch($event)"
       v-bind:class="{'browse-home-pane-kb': browseKbNavActive && browseFocusZone=='sidebar' && homePaneKbEntryIs('search')}">
   <v-icon class="browse-home-pane-search-icon">search</v-icon>
   <span class="browse-home-pane-search-label ellipsis">{{i18n('Search')}}</span>
  </div>
  <div class="browse-home-pane-list lms-list msk-sortable-host">
   <!-- Home entry -->
   <v-list-tile avatar @click="homePaneGoHome($event)" class="lms-avatar lms-list-item browse-home-pane-home"
    v-bind:class="{'list-active': homePaneActiveId==HOME_PANE_HOME_ID, 'browse-home-pane-kb': browseKbNavActive && browseFocusZone=='sidebar' && homePaneKbEntryIs('home')}">
    <v-list-tile-avatar :tile="true" class="lms-avatar">
     <v-icon>home</v-icon>
    </v-list-tile-avatar>
    <v-list-tile-content>
     <v-list-tile-title>{{trans.home || i18n('Home')}}</v-list-tile-title>
    </v-list-tile-content>
   </v-list-tile>
   <template v-for="(item, index) in top">
    <div v-if="homePaneItemVisible(item)" :key="'home-pane-'+item.id" class="browse-home-pane-row" :data-msk-index="index"
     @touchstart.passive="homePaneTouchStart(index, item, $event)"
     @touchmove="homePaneTouchMove($event)"
     @touchend.passive="homePaneTouchEnd($event)"
     @touchcancel.passive="homePaneTouchEnd($event)"
     @pointerdown="homePaneTouchStart(index, item, $event)"
     @pointermove="homePaneTouchMove($event)"
     @pointerup="homePaneTouchEnd($event)"
     @pointercancel="homePaneTouchEnd($event)">
    <v-list-tile avatar
     :id="'hpitem'+index"
     class="lms-avatar lms-list-item browse-home-pane-item"
     :style="homePaneSwipeStyle(index)"
     v-bind:class="{'list-active': homePaneActiveId==item.id, 'browse-home-pane-kb': browseKbNavActive && browseFocusZone=='sidebar' && homePaneKbEntryIs('item', item.id), 'browse-home-pane-pinned': homePaneIsAdded(item), 'browse-home-pane-swipe-open': homePaneSwipeOpenId==item.id, 'browse-home-pane-swiping': homePaneSwipe && homePaneSwipe.index===index && homePaneSwipe.mode==='h'}"
     @click="homePaneClick(item, index, $event)"
     @dblclick.stop="homePaneDblClick(item, index, $event)"
     @contextmenu.prevent="homePaneContextMenu(item, index, $event)">
     <!-- Prefer mono icon/svg over brand image so Spotify pins match muted chrome -->
     <v-list-tile-avatar v-if="item.icon" :tile="true" class="lms-avatar">
      <v-icon>{{item.icon}}</v-icon>
     </v-list-tile-avatar>
     <v-list-tile-avatar v-else-if="item.svg" :tile="true" class="lms-avatar">
      <!-- Muted = same strength as Material icons; full ink only when selected -->
      <img class="svg-list-img" :src="item.svg | svgIcon(darkUi, 'chrome', homePaneActiveId==item.id ? sidebarSvgCol : sidebarSvgColMuted)"></img>
     </v-list-tile-avatar>
     <v-list-tile-avatar v-else-if="item.image" :tile="true" class="lms-avatar">
      <img :key="item.image" v-lazy="item.image" onerror="this.src=DEFAULT_COVER"></img>
     </v-list-tile-avatar>
     <v-list-tile-avatar v-else :tile="true" class="lms-avatar">
      <v-icon>folder</v-icon>
     </v-list-tile-avatar>
     <v-list-tile-content>
      <v-list-tile-title>{{item.title}}<b class="vlib-name" v-if="item.libname">{{SEPARATOR+item.libname}}</b></v-list-tile-title>
      <v-list-tile-sub-title v-if="item.subtitle" v-html="item.subtitle"></v-list-tile-sub-title>
     </v-list-tile-content>
     <v-list-tile-action v-if="homePaneIsAdded(item)" class="browse-home-pane-remove" :title="i18n('Un-pin')" @click.stop="homePaneUnpin(item, index, $event)">
      <v-icon>close</v-icon>
     </v-list-tile-action>
    </v-list-tile>
    </div>
   </template>
  </div>
  <div class="browse-home-pane-resizer" role="separator" aria-orientation="vertical" :title="i18n('Resize')"
   @mousedown="homePaneResizeStart($event)" @touchstart.prevent="homePaneResizeStart($event)"></div>
 </div>
 <div class="browse-main-pane" v-bind:class="{'browse-main-pane-split':useHomeSplit, 'lib-fusion-main':fusionMode && current && current.id==TOP_MYMUSIC_ID}">
 <div class="noselect browse-subheader-wrap" v-bind:class="{'subtoolbar-cover':showDetailedSubtoolbar&&!browseSubheaderCompact&&!browseCatalogHero&&drawBgndImage,'subtoolbar-tracklist':showTrackListCommands&&!browseSubheaderCompact&&!browseCatalogHero}">
 <div class="subtoolbar browse-subheader browse-subheader-glass" v-bind:class="{'browse-subheader-catalog':browseCatalogHero && !browseSubheaderCompact}">
  <img v-if="!browseCatalogHero && currentImage && isTrackList && showDetailedSubtoolbar && !browseSubheaderCompact && wide<WIDE_COVER" :src="currentImage" class="sub-cover-fade sub-cover-track pointer"></img>
  <img v-else-if="!browseCatalogHero && currentImage && showDetailedSubtoolbar && !browseSubheaderCompact && wide<WIDE_COVER" :src="currentImage" class="sub-cover-fade sub-cover-right pointer"></img>
  <v-layout v-if="selection.size>0">
   <div class="toolbar-nobtn-pad"></div>
   <v-layout row wrap>
    <v-flex xs12 class="ellipsis subtoolbar-title subtoolbar-pad">{{trans.selectMultiple}}</v-flex>
    <v-flex xs12 class="ellipsis subtoolbar-subtitle subtext">{{selection.size | displaySelectionCount}}<obj class="mat-icon">check_box</obj>{{selectionDuration | displayTime}}</v-flex>
   </v-layout>
   <v-spacer></v-spacer>
   <v-btn v-if="current && current.section==SECTION_PLAYLISTS && current.id.startsWith('playlist_id:')" :title="trans.removeall" flat icon class="toolbar-button" @click="deleteSelectedItems(REMOVE_ACTION, $event)"><v-icon>{{ACTIONS[REMOVE_ACTION].icon}}</v-icon></v-btn>
   <v-btn v-else-if="current && current.section==SECTION_PLAYLISTS" :title="trans.deletesel" flat icon class="toolbar-button" @click="deleteSelectedItems(DELETE_ACTION, $event)"><v-icon>delete</v-icon></v-btn>
   <v-btn v-else-if="current && current.section==SECTION_FAVORITES" :title="trans.removeall" flat icon class="toolbar-button" @click="deleteSelectedItems(REMOVE_FROM_FAV_ACTION, $event)"><v-icon>delete_outline</v-icon></v-btn>
   <v-btn v-if="items[0].stdItem==STD_ITEM_TRACK || items[0].stdItem==STD_ITEM_ALBUM_TRACK || items[0].saveableTrack || (items[0].header && items.length>1 && items[1].stdItem==STD_ITEM_ALBUM_TRACK)" :title="ACTIONS[ADD_TO_PLAYLIST_ACTION].title" flat icon class="toolbar-button" @click="actionSelectedItems(ADD_TO_PLAYLIST_ACTION, $event)"><v-icon>{{ACTIONS[ADD_TO_PLAYLIST_ACTION].icon}}</v-icon></v-btn>
   <v-btn :title="trans.addsel" flat icon class="toolbar-button" @click="actionSelectedItems(ADD_ACTION, $event)"><v-icon>add_circle_outline</v-icon></v-btn>
   <v-btn :title="trans.shufflesel" v-if="allowShuffle(items[items.length>1 && items[0].header ? 1 : 0])" flat icon class="toolbar-button" @click="actionSelectedItems(PLAY_SHUFFLE_ACTION, $event)"><img class="svg-img" :src="ACTIONS[PLAY_SHUFFLE_ACTION].svg | svgIcon(darkUi, 'chrome', chromeSvgCol)"></img></v-btn>
   <v-btn :title="trans.playsel" flat icon class="toolbar-button" @click="actionSelectedItems(PLAY_ACTION, $event)"><v-icon>play_circle_outline</v-icon></v-btn>
   <v-divider vertical></v-divider>
   <v-btn :title="trans.invertSelect" flat icon class="toolbar-button" @click="invertSelection()"><img :src="'invert-select' | svgIcon(darkUi, 'chrome', chromeSvgCol)"></img></v-btn>
   <v-btn :title="trans.cancel" flat icon class="toolbar-button" @click="clearSelection()"><v-icon>cancel</v-icon></v-btn>
  </v-layout>
  <v-layout v-else-if="desktopLayout && searchActive==1">
   <v-btn flat icon @click="closeSearch" class="toolbar-button back-button" id="close-search-button" :title="trans.close"><v-icon>{{BACK_ICON}}</v-icon></v-btn>
   <lms-search-field @results="handleListResponse" :view="this"></lms-search-field>
  </v-layout>
  <v-layout v-else-if="desktopLayout && searchActive==2 && !browseShowOverflowPanel">
   <v-btn flat icon @click="closeSearch" class="toolbar-button back-button" id="close-search-list-button" :title="trans.close"><v-icon>{{BACK_ICON}}</v-icon></v-btn>
   <lms-search-list @scrollTo="highlightItem" :view="this" :msearch="false" :title="toolbarTitle"></lms-search-list>
  </v-layout>
  <v-layout v-else-if="searchActive!=1 && history.length>0" class="browse-subheader-row">
   <v-btn flat icon v-longpress:stop="backBtnPressed" class="toolbar-button" v-bind:class="{'back-button':!homeButton || history.length<2}" id="back-button" :title="goBackTitle"><v-icon>{{BACK_ICON}}</v-icon></v-btn>
   <v-btn v-if="history.length>1 && homeButton" flat icon @click="homeBtnPressed()" class="toolbar-button" id="home-button" v-bind:class="{'dst-home':showDetailedSubtoolbar && !browseSubheaderCompact}" :title="trans.goHome | tooltipStr('home', keyboardControl)"><v-icon>home</v-icon></v-btn>
   <div v-if="!browseCatalogHero && !browseSubheaderCompact && wide>=WIDE_COVER && currentImages" @click="showHistory($event)" class="sub-cover pointer">
    <div class="mi" :class="'mi'+currentImages.length">
     <img v-for="(mic, midx) in currentImages" :class="'mi-'+midx" :key="mic" :src="mic" loading="lazy"></img>
    </div>
   </div>
   <img v-else-if="!browseCatalogHero && !browseSubheaderCompact && wide>=WIDE_COVER && currentImage" :src="current && currentImage" @click="showHistory($event)" class="sub-cover pointer"></img>
   <div v-if="browseCatalogHero && !browseSubheaderCompact" class="browse-catalog-hero">
    <div class="browse-catalog-art" @click="showHistory($event)">
     <img v-if="catalogArtUrl" :src="catalogArtUrl" alt="" loading="lazy"></img>
     <v-icon v-else class="browse-catalog-art-fallback">{{catalogArtFallback}}</v-icon>
    </div>
    <div class="browse-catalog-meta">
     <div class="browse-catalog-kicker ellipsis" v-if="catalogKicker" v-html="catalogKicker"></div>
     <div class="browse-catalog-title ellipsis" v-longpress:nomove="titlePressed" :title="hierarchyTitle">{{toolbarTitle || (current && current.title) || ''}}</div>
     <div class="browse-catalog-desc" v-if="catalogDescription" v-html="catalogDescription"></div>
     <div class="browse-catalog-actions">
      <v-btn flat class="browse-catalog-play" @click.stop="headerAction(catalogPlayAct, $event)" :title="PLAY_ACTION | tooltip(keyboardControl)"><v-icon>play_arrow</v-icon>{{ACTIONS[PLAY_ACTION].short || i18n('Play')}}</v-btn>
      <v-btn flat class="browse-catalog-shuffle" v-if="allowShuffle(current)" @click.stop="headerAction(catalogShuffleAct, $event)" :title="PLAY_SHUFFLE_ACTION | tooltip(keyboardControl)"><img class="svg-img" :src="ACTIONS[PLAY_SHUFFLE_ACTION].svg | svgIcon(darkUi, 'chrome', chromeSvgCol)"></img>{{ACTIONS[PLAY_SHUFFLE_ACTION].short || i18n('Shuffle')}}</v-btn>
      <v-spacer></v-spacer>
      <v-btn v-if="desktopLayout && showMixButton" flat icon class="toolbar-button" @click="doContext(STD_ITEM_MIX)" :title="i18n('Start artist mix')"><img class="svg-img" :src="'music-mix' | svgIcon(darkUi, 'chrome', chromeSvgCol)"></img></v-btn>
      <v-btn v-if="desktopLayout && showMaiButton" flat icon class="toolbar-button" @click="doContext(STD_ITEM_MAI)" :title="i18n('Information')"><v-icon v-if="current.stdItem==STD_ITEM_ALBUM">album</v-icon><img v-else class="svg-img" :src="(current.stdItem==STD_ITEM_WORK ? 'classical-work' : 'artist') | svgIcon(darkUi, 'chrome', chromeSvgCol)"></img></v-btn>
      <v-btn v-if="desktopLayout && currentActions.length>0" flat icon class="toolbar-button" @click.stop="currentActionsMenu($event)" :title="trans.actions"><v-icon>more_vert</v-icon></v-btn>
     </div>
    </div>
   </div>
   <!-- Expanded: multi-line details + action chrome -->
   <v-layout row wrap v-if="!browseCatalogHero && showDetailedSubtoolbar && !browseSubheaderCompact">
    <v-layout v-longpress:nomove="titlePressed" class="row wrap browse-title" v-bind:class="{'link-item pointer':!fusionMode}" :title="hierarchyTitle">
     <v-flex xs12 class="ellipsis subtoolbar-title subtoolbar-pad">{{toolbarTitle}}</v-flex>
     <v-flex xs12 class="ellipsis subtoolbar-subtitle subtext" v-html="detailedSubTop"></v-flex>
    </v-layout>
    <v-flex xs12 v-if="detailedSubExtra" class="ellipsis subtoolbar-subtitle subtext" v-html="detailedSubExtra[0]"></v-flex>
    <v-flex xs12 v-else class="ellipsis subtoolbar-subtitle subtext">&nbsp;</v-flex>
    <v-flex xs12 class="ellipsis subtoolbar-subtitle subtext" v-html="detailedSubBot"></v-flex>
   </v-layout>
   <!-- Compact / simple: clean single-line section title only -->
   <v-layout row wrap v-else-if="!browseCatalogHero || browseSubheaderCompact" v-longpress:nomove="titlePressed" class="browse-title" v-bind:class="{'pointer link-item': history.length>0 && !fusionMode, 'browse-title-compact':browseSubheaderCompact, 'browse-title-has-play':catalogShowIconPlayBtns}" :title="hierarchyTitle">
    <v-flex xs12 class="ellipsis subtoolbar-title subtoolbar-pad" v-bind:class="{'subtoolbar-title-single':browseMobilePullChrome || (undefined==toolbarSubTitle && !fetchingItem)}">{{toolbarTitle}}</v-flex>
    <v-flex xs12 class="ellipsis subtoolbar-subtitle subtext" v-if="!browseMobilePullChrome && !browseSubheaderCompact && undefined!=toolbarSubTitle" v-html="toolbarSubTitle"></v-flex>
   </v-layout>
   <v-spacer v-if="!catalogShowIconPlayBtns && !(browseCatalogHero && !browseSubheaderCompact)" style="flex-grow: 10!important"></v-spacer>
   <div v-if="catalogShowIconPlayBtns" class="browse-title-play-swipe" :class="{'is-open':browsePlayExtrasVisible, 'is-pulling':browsePlaySwiping}" @touchstart.passive="browsePlaySwipeStart" @touchmove.prevent="browsePlaySwipeMove" @touchend="browsePlaySwipeEnd" @touchcancel="browsePlaySwipeEnd">
    <v-btn flat icon class="toolbar-button browse-play-extra" @click.stop="headerAction(browseOverflowAddAct, $event)" :title="ADD_ACTION | tooltip(keyboardControl)"><v-icon>{{ACTIONS[ADD_ACTION].icon}}</v-icon></v-btn>
    <v-btn flat icon class="toolbar-button browse-play-extra" @click.stop="headerAction(browseOverflowInsertAct, $event)" :title="INSERT_ACTION | tooltip(keyboardControl)"><img class="svg-img" :src="ACTIONS[INSERT_ACTION].svg | svgIcon(darkUi, 'chrome', chromeSvgCol)"></img></v-btn>
    <v-btn flat icon class="toolbar-button" @click.stop="headerAction(catalogPlayAct, $event)" :title="PLAY_ACTION | tooltip(keyboardControl)"><v-icon>play_circle_outline</v-icon></v-btn>
    <v-btn v-if="allowShuffle(current)" flat icon class="toolbar-button" @click.stop="headerAction(catalogShuffleAct, $event)" :title="PLAY_SHUFFLE_ACTION | tooltip(keyboardControl)"><img class="svg-img" :src="ACTIONS[PLAY_SHUFFLE_ACTION].svg | svgIcon(darkUi, 'chrome', chromeSvgCol)"></img></v-btn>
   </div>
   <table class="browse-commands" v-if="!browseCatalogHero && !browseSubheaderCompact && desktopLayout && (!showDetailedSubtoolbar || !isTrackList || wide>=WIDE_MIX_BTN)">
    <tr align="right">
     <v-btn @click.stop="currentActionsMenu($event)" flat icon class="toolbar-button" :title="trans.actions" id="tbar-actions" v-if="currentActions.length>0 && numCurrentActionsInToolbar<currentActions.length && (!showDetailedSubtoolbar || wide>=WIDE_HBTNS)"><v-icon>more_vert</v-icon></v-btn>
     <template v-for="(action, index) in currentActions" v-if="numCurrentActionsInToolbar>0">
      <v-btn @click.stop="currentAction(action, index, $event)" flat icon class="toolbar-button" :title="undefined==action.action ? action.title : (action.title || ACTIONS[action.action].title)" :id="'tbar-actions'+action.action" v-if="index<numCurrentActionsInToolbar && (action.action!=VLIB_ACTION || libraryName)">
       <img v-if="undefined!=action.action && ACTIONS[action.action].svg" class="svg-img" :src="ACTIONS[action.action].svg | svgIcon(darkUi, 'chrome', chromeSvgCol)"></img>
       <v-icon v-else-if="undefined!=action.action">{{ACTIONS[action.action].icon}}</v-icon>
       <img v-else-if="action.svg" class="svg-img" :src="action.svg | svgIcon(darkUi, 'chrome', chromeSvgCol)"></img>
       <v-icon v-else>{{action.icon}}</v-icon>
      </v-btn>
     </template>
     <template v-for="(action, index) in tbarActions">
      <v-btn flat :icon="wide<WIDE_MIX_BTN" v-if="showDetailedSubtoolbar && wide>=WIDE_MIX_BTN && (action==PLAY_ACTION || action==PLAY_ALL_ACTION) && !allowShuffle(current)" @click.stop="headerAction(action==PLAY_ACTION ? INSERT_ACTION : INSERT_ALL_ACTION, $event)" v-bind:class="{'context-button':wide>=WIDE_MIX_BTN, 'toolbar-button':wide<WIDE_MIX_BTN}" :title="INSERT_ACTION | tooltip(keyboardControl)" :id="'tbar-actions'+action">
       <img class="svg-img" :src="ACTIONS[INSERT_ACTION].svg | svgIcon(darkUi, 'chrome', chromeSvgCol)"></img><obj v-if="wide>=WIDE_MIX_BTN">&nbsp;{{ACTIONS[INSERT_ACTION].short}}</obj>
      </v-btn>
      <v-btn flat :icon="wide<WIDE_MIX_BTN" v-if="showDetailedSubtoolbar && wide>=WIDE_MIX_BTN && (action==PLAY_ACTION || action==PLAY_ALL_ACTION) && allowShuffle(current)" @click.stop="headerAction(action==PLAY_ACTION ? PLAY_SHUFFLE_ACTION : PLAY_SHUFFLE_ALL_ACTION, $event)" v-bind:class="{'context-button':wide>=WIDE_MIX_BTN, 'toolbar-button':wide<WIDE_MIX_BTN}" :title="PLAY_SHUFFLE_ACTION | tooltip(keyboardControl)" :id="'tbar-actions'+action">
       <img class="svg-img" :src="ACTIONS[PLAY_SHUFFLE_ACTION].svg | svgIcon(darkUi, 'chrome', chromeSvgCol)"></img><obj v-if="wide>=WIDE_MIX_BTN">&nbsp;{{ACTIONS[PLAY_SHUFFLE_ACTION].short}}</obj>
      </v-btn>

      <!-- for non-text buttons, if 'play shuffled' enabled then show its button instead of append -->
      <v-btn flat v-if="(wide<WIDE_MIX_BTN || !showDetailedSubtoolbar) && (action==ADD_ACTION || action==ADD_ALL_ACTION) && allowShuffle(current) && (!queryParams.party || !HIDE_FOR_PARTY.has(PLAY_SHUFFLE_ACTION)) && (!LMS_KIOSK_MODE || !HIDE_FOR_KIOSK.has(PLAY_SHUFFLE_ACTION))" flat icon @click.stop="headerAction(action==ADD_ACTION ? PLAY_SHUFFLE_ACTION : PLAY_SHUFFLE_ALL_ACTION, $event)" class="toolbar-button" :title="(action==ADD_ACTION ? PLAY_SHUFFLE_ACTION : PLAY_SHUFFLE_ALL_ACTION) | tooltip(keyboardControl)" :id="'tbar-actions'+PLAY_SHUFFLE_ACTION">
       <img class="svg-img" :src="ACTIONS[PLAY_SHUFFLE_ACTION].svg | svgIcon(darkUi, 'chrome', chromeSvgCol)"></img>
      </v-btn>

      <v-btn flat :icon="wide<WIDE_MIX_BTN || !ACTIONS[action].short || !showDetailedSubtoolbar" @click.stop="headerAction(action, $event)" v-bind:class="{'context-button':wide>=WIDE_MIX_BTN && undefined!=ACTIONS[action].short && showDetailedSubtoolbar, 'toolbar-button':wide<WIDE_MIX_BTN || !ACTIONS[action].short || !showDetailedSubtoolbar}" :title="action | tooltip(keyboardControl)" :id="'tbar-actions'+action" v-else-if="(!queryParams.party || !HIDE_FOR_PARTY.has(action)) && (!LMS_KIOSK_MODE || !HIDE_FOR_KIOSK.has(action))">
       <img v-if="ACTIONS[action].svg" class="svg-img" :src="ACTIONS[action].svg | svgIcon(darkUi, 'chrome', chromeSvgCol)"></img>
       <v-icon v-else>{{ACTIONS[action].icon}}</v-icon>
       <obj v-if="wide>=WIDE_MIX_BTN && ACTIONS[action].short && showDetailedSubtoolbar">&nbsp;{{ACTIONS[action].short}}</obj>
      </v-btn>
     </template>
     <v-btn v-if="browseSearchSubheaderMode" flat icon class="toolbar-button" :title="SEARCH_LIB_ACTION | tooltip(keyboardControl)" @click.stop="itemAction(SEARCH_LIB_ACTION, undefined, undefined, $event)"><img class="svg-img" :src="ACTIONS[SEARCH_LIB_ACTION].svg | svgIcon(darkUi, 'chrome', chromeSvgCol)"></img></v-btn>
    </tr>
    <tr v-if="!fusionMode && (showMixButton || showMaiButton || (showDetailedSubtoolbar && wide<WIDE_HBTNS))" align="right">
     <v-btn @click.stop="currentActionsMenu($event)" flat icon class="toolbar-button" :title="trans.actions" id="tbar-actions" v-if="wide<WIDE_HBTNS && currentActions.length>0 && numCurrentActionsInToolbar<currentActions.length"><v-icon>more_vert</v-icon></v-btn>
     <v-btn flat v-if="showMixButton" class="context-button" @click="doContext(STD_ITEM_MIX)"><img class="svg-img" :src="'music-mix' | svgIcon(darkUi, 'chrome', chromeSvgCol)"></img>&nbsp;{{i18n('Start artist mix')}}</v-btn>
     <v-btn flat v-if="showMaiButton" class="context-button" @click="doContext(STD_ITEM_MAI)"><v-icon v-if="current.stdItem==STD_ITEM_ALBUM">album</v-icon><img v-else class="svg-img" :src="(current.stdItem==STD_ITEM_WORK ? 'classical-work' : 'artist') | svgIcon(darkUi, 'chrome', chromeSvgCol)"></img>&nbsp;{{i18n('Information')}}</v-btn>
    </tr>
    <!-- Empty spacer row inflated height; skip in Fusion (mobile/small already tight) -->
    <tr v-else-if="!fusionMode"><obj>&nbsp;</obj></tr>
   </table>
  </v-layout>
  <v-layout v-else-if="searchActive!=1" class="pointer link-item">
   <div class="toolbar-nobtn-pad"></div>

   <v-layout @click="sourcesClicked" class="link-item row wrap browse-title">
    <v-flex xs12 class="ellipsis subtoolbar-title subtoolbar-pad" v-bind:class="{'subtoolbar-title-single':!allowVLibOnHome || !showLibName}">{{trans.home}}</v-flex>
    <v-flex xs12 class="ellipsis subtoolbar-subtitle subtext" v-html="libraryName" v-if="allowVLibOnHome && showLibName"></v-flex>
   </v-layout>

   <v-spacer @click="desktopLayout && itemAction(SEARCH_LIB_ACTION, undefined, undefined, $event)" class="pointer"></v-spacer>

   <template v-if="desktopLayout" v-for="(item, index) in currentActions">
    <v-btn @click.stop="currentAction(item, index, $event)" flat icon class="toolbar-button" :title="undefined==item.action ? item.title : ACTIONS[item.action].title" id="tbar-actions"
           v-if="undefined==item.action || (VLIB_ACTION==item.action ? allowVLibOnHome : true)">
     <img v-if="undefined!=item.action && ACTIONS[item.action].svg" class="svg-img" :src="ACTIONS[item.action].svg | svgIcon(darkUi, 'chrome', chromeSvgCol)"></img>
     <v-icon v-else-if="undefined!=item.action">{{ACTIONS[item.action].icon}}</v-icon>
    </v-btn>
   </template>

   <v-btn v-if="browseSearchInSubheader && desktopLayout" :title="SEARCH_LIB_ACTION | tooltip(keyboardControl)" flat icon class="toolbar-button" @click.stop="itemAction(SEARCH_LIB_ACTION, undefined, undefined, $event)"><img class="svg-img" :src="ACTIONS[SEARCH_LIB_ACTION].svg | svgIcon(darkUi, 'chrome', chromeSvgCol)"></img></v-btn>
  </v-layout>
  <v-layout class="browse-tracklist-commands" v-if="!browseCatalogHero && !browseSubheaderCompact && isTrackList && showDetailedSubtoolbar && wide<WIDE_MIX_BTN && searchActive!=1">
   <v-btn flat @click.stop="headerAction(PLAY_ALL_ACTION, $event)" class="context-button" :title="PLAY_ACTION | tooltip(keyboardControl)" :id="'tbar-actions'+PLAY_ACTION"><v-icon>{{ACTIONS[PLAY_ACTION].icon}}</v-icon>&nbsp;{{ACTIONS[PLAY_ACTION].short}}</v-btn>
   <v-btn flat @click.stop="headerAction(PLAY_SHUFFLE_ALL_ACTION, $event)" v-if="allowShuffle(current) && trackWide>=TRACK_WIDE_TWO" class="context-button" :title="PLAY_SHUFFLE_ACTION | tooltip(keyboardControl)" :id="'tbar-actions'+PLAY_SHUFFLE_ACTION"><img class="svg-img" :src="ACTIONS[PLAY_SHUFFLE_ACTION].svg | svgIcon(darkUi, 'chrome', chromeSvgCol)"></img>&nbsp;{{ACTIONS[PLAY_SHUFFLE_ACTION].short}}</v-btn>
   <v-btn flat @click.stop="headerAction(ADD_ALL_ACTION, $event)" v-if="trackWide>=(allowShuffle(current) ? TRACK_WIDE_THREE : TRACK_WIDE_TWO)" class="context-button" :title="ADD_ACTION | tooltip(keyboardControl)" :id="'tbar-actions'+ADD_ACTION"><v-icon>{{ACTIONS[ADD_ACTION].icon}}</v-icon>&nbsp;{{ACTIONS[ADD_ACTION].short}}</v-btn>
   <v-spacer></v-spacer>
   <v-btn @click.stop="currentActionsMenu($event)" flat icon class="toolbar-button" :title="trans.actions" id="tbar-actions"><v-icon>more_vert</v-icon></v-btn>
   <v-btn flat v-if="showMaiButton && current.stdItem==STD_ITEM_ALBUM" class="context-button" @click="doContext(STD_ITEM_MAI)"><v-icon>album</v-icon>&nbsp;{{i18n('Information')}}</v-btn>
  </v-layout>
 </div>
 </div>
 <div class="lms-list bgnd-cover" v-bind:style="{'background-image':'url('+currentBgndUrl+')'}" v-bind:class="{'browse-backdrop-cover':drawBackdrop&&1!=searchActive, 'tint-bgnd-cover':tint&&!drawBgndImage, 'browse-track-list':showTrackListCommands, 'unpinned-queue-visible':unpinnedQueueVisible, 'pinned-queue':pinnedQueue, 'browse-content-loading':browseInitialLoading && !(fusionMode && current && current.id==TOP_MYMUSIC_ID), 'lib-fusion-host':fusionMode && current && current.id==TOP_MYMUSIC_ID}">
  <div class="browse-progress" v-if="showBrowseLoading" aria-hidden="true">
   <span class="browse-progress-dot"></span>
   <span class="browse-progress-dot"></span>
   <span class="browse-progress-dot"></span>
  </div>
  <div class="noselect lms-jumplist" v-bind:class="{'bgnd-blur':drawBgndImage,'backdrop-blur':drawBackdrop, 'lms-jumplist-h':filteredJumplist[0].header, 'lms-jumplist-bullets':!!filteredJumplist[0].bullet, 'lms-jumplist-touch':jumplistTouchActive}" v-if="filteredJumplist.length>1 && !(fusionMode && current && current.id==TOP_MYMUSIC_ID)"
       @touchstart.prevent="jumplistTouchStart" @touchmove.prevent="jumplistTouchMove" @touchend="jumplistTouchEnd" @touchcancel="jumplistTouchEnd"
       @mousedown="jumplistTouchStart" @mousemove="jumplistTouchMove" @mouseup="jumplistTouchEnd" @mouseleave="jumplistTouchEnd">
   <div class="jl-inner" :style="jumplistInnerStyle()">
    <template v-for="(item, index) in filteredJumplist">
     <div v-if="item.icon" @click="jumpTo(item.index)" v-bind:class="{'jl-divider':true, 'jl-active':jumplistTouchActive && jumplistActiveSlot===index}" :title="items[item.index].title">
      <img v-if="item.icon.svg" :src="item.icon.svg | svgIcon(darkUi)" loading="lazy"></img>
      <v-icon v-else class="jl-icon">{{item.icon.icon}}</v-icon>
     </div>
     <div v-else-if="item.key==SECTION_JUMP" @click="jumpTo(item.index)" v-bind:class="{'jl-divider':true, 'jl-active':jumplistTouchActive && jumplistActiveSlot===index}" :title="items[item.index].title">{{item.key}}</div>
     <div v-else @click="jumpTo(item.index)" v-bind:class="{'jl-divider':item.key==SECTION_JUMP, 'jl-active':jumplistTouchActive && jumplistActiveSlot===index, 'jl-bullet':!!item.bullet}">{{item.key==' ' || item.key=='' ? '?' : item.key}}</div>
    </template>
   </div>
  </div>
  <!-- Library Fusion: only on My Music root (does not cover Home / Radio / Queue) -->
  <lms-library-fusion v-if="fusionMode && current && current.id==TOP_MYMUSIC_ID" :player-id="playerId" @close="setFusionMode(false)" @leave-main="leaveFusionToMain"></lms-library-fusion>
  <!-- Always keep #browse-list mounted/visible: hiding it when home-split+isTop left desktop with an empty main pane when the side list failed to size. Home pane remains a quick nav when split is on. -->
  <div class="lms-list" id="browse-list" style="overflow:auto;" v-show="!(fusionMode && current && current.id==TOP_MYMUSIC_ID)" v-bind:class="{'lms-image-grid':grid.allowed&&grid.use,'lms-grouped-image-grid':grid.allowed&&grid.use && variableGridHeight,'lms-image-grid-jump':grid.allowed&&grid.use && browseJumplistGutter,'lms-list-jump':!(grid.allowed&&grid.use) && browseJumplistGutter,'bgnd-blur':drawBgndImage,'backdrop-blur':drawBackdrop, 'browse-track-list':showTrackListCommands, 'msk-sortable-host':isTop && !grid.use, 'cstats-home-active':isTop && contextStatsHomeEnabled, 'home-extra-arriving':homeExtraArriving}">

   <div v-if="browseMobilePullChrome && searchActive!=1 && selection.size<1" class="browse-scroll-tools"
        v-bind:class="{'is-open':browseOverflowOpen, 'is-pulling':browseOverflowPulling, 'browse-scroll-tools-home':browseCstatsHomeChrome}"
        :style="browseScrollToolsStyle">
    <div class="browse-overflow-panel" v-bind:class="{'browse-overflow-home-tools':browseCstatsHomeChrome}">
     <div class="browse-overflow-row">
      <lms-search-list v-if="browseOverflowCanFilter" @scrollTo="highlightItem" :view="this" :msearch="false" :compact="true" :autofocus="false" :placeholder="i18n('Filter')"></lms-search-list>
      <v-spacer v-else></v-spacer>
      <div class="browse-overflow-icons">
       <v-btn v-if="browseCanAlphaSort" flat icon class="toolbar-button" :title="browseAlphaSort ? i18n('Proposed order') : i18n('Alphabetical order')" @click.stop="toggleBrowseAlphaSort($event)">
        <v-icon>{{browseAlphaSort ? 'low_priority' : 'sort_by_alpha'}}</v-icon>
       </v-btn>
       <v-btn v-if="undefined!=browseOverflowViewAct && !isTop" flat icon class="toolbar-button" :title="ACTIONS[browseOverflowViewAct].title" @click.stop="headerAction(browseOverflowViewAct, $event)">
        <img v-if="ACTIONS[browseOverflowViewAct].svg" class="svg-img" :src="ACTIONS[browseOverflowViewAct].svg | svgIcon(darkUi, 'chrome', chromeSvgCol)"></img>
        <v-icon v-else>{{ACTIONS[browseOverflowViewAct].icon}}</v-icon>
       </v-btn>
      </div>
     </div>
     <div v-if="browseCstatsHomeChrome" class="browse-overflow-home-actions">
      <button type="button" class="browse-home-act" @click.stop="openHomeAlarms($event)">
       <v-icon>alarm</v-icon>
       <span>{{i18n('Alarms')}}</span>
      </button>
      <button type="button" class="browse-home-act" @click.stop="openHomeTimer($event)">
       <v-icon>timer</v-icon>
       <span>{{i18n('Timer')}}</span>
      </button>
      <button type="button" class="browse-home-act" v-if="homePrefsInput" @click.stop="openHomePlayerPrefs('input', $event)">
       <v-icon>input</v-icon>
       <span>{{i18n('Input')}}</span>
      </button>
      <button type="button" class="browse-home-act" v-if="homePrefsPresets" @click.stop="openHomePlayerPrefs('presets', $event)">
       <v-icon>bookmark</v-icon>
       <span>{{i18n('Presets')}}</span>
      </button>
      <button type="button" class="browse-home-act" v-if="homePrefsDsp" @click.stop="openHomePlayerPrefs('dsp', $event)">
       <v-icon>equalizer</v-icon>
       <span>{{i18n('DSP')}}</span>
      </button>
     </div>
    </div>
   </div>

   <div v-if="browseScrollMeta && searchActive!=1" class="browse-scroll-meta noselect">
    <div class="browse-scroll-meta-count" v-if="toolbarSubTitle" v-html="toolbarSubTitle"></div>
    <div class="browse-scroll-meta-desc" v-if="browseScrollDescription" v-html="browseScrollDescription"></div>
   </div>
   <div v-if="browseCstatsHomeChrome && searchActive!=1" class="cstats-home-hello noselect">
    <div class="cstats-home-hello-greet">{{homeGreeting}}</div>
    <button type="button" class="cstats-home-hello-player" @click.stop="openHomePlayerMenu($event)">
     <span class="cstats-home-hello-on" v-html="homePlayingOnHtml"></span>
     <v-icon small class="cstats-home-hello-chevron">expand_more</v-icon>
    </button>
   </div>
   <div v-if="isTop && contextStatsHomeEnabled" class="cstats-home-section noselect" v-bind:class="{'cstats-home-mod': contextStatsHome.modHeld, 'cstats-home-morphing': contextStatsHome.morphing, 'cstats-home-ready': contextStatsHome.items.length>0, 'cstats-home-empty': !contextStatsHome.loading && !contextStatsHome.morphing && contextStatsHome.items.length<1}" @wheel="cstatsHomeOnWheel">
    <swiper v-if="contextStatsHome.pages.length>0" :key="'cstats-sw-'+contextStatsHome.swiperKey+'-'+contextStatsHome.pageSize" ref="cstatsHomeSwiper" :options="cstatsHomeSwiperOptions" class="cstats-home-swiper">
     <swiper-slide v-for="(page, pidx) in contextStatsHome.pages" :key="'cstats-page-'+pidx">
      <div class="cstats-home-grid" v-bind:style="{'--cstats-cols': contextStatsHome.cols}">
       <div v-for="(card, cidx) in page" :key="card.id" class="cstats-home-card" role="button" :title="card | itemTooltip"
            @click="contextStatsHomeClick(card)"
            v-longpress:nomove="contextStatsHomeLongPress"
            :data-cstats-id="card.id"
            @contextmenu.prevent="contextStatsHomeMenu(card, $event)"
            v-bind:class="{'cstats-home-card-dark': card.bgIsDark, 'cstats-home-card-light': undefined!=card.bgColor && !card.bgIsDark, 'cstats-home-card-leaving': card.leaving, 'cstats-home-card-entering': card.entering}">
        <div class="cstats-home-card-bg" v-bind:style="card.bgColor ? {backgroundColor: card.bgColor} : null"></div>
        <div class="cstats-home-card-progress" v-if="card.progress>0" v-bind:style="{width: Math.round(card.progress*100)+'%'}"></div>
        <div class="cstats-home-card-inner">
         <img class="cstats-home-card-art" :src="card.image" v-lazy="card.image" onerror="this.src=DEFAULT_COVER" @load="contextStatsHomeCardBg(card, $event.target)" @click="contextStatsHomeArtClick(card, $event)"></img>
         <div class="cstats-home-card-text" v-bind:class="{'cstats-home-card-has-stats': !!card.stats}">
          <div class="cstats-home-card-title-stack">
           <div class="cstats-home-card-title">{{card.title}}</div>
           <!-- Stats: not shown on card (hover removed); drawer uses card.subtitle -->
          </div>
          <div class="cstats-home-card-sub ellipsis subtext" v-if="card.meta">{{card.meta}}</div>
          <div class="cstats-home-card-sub ellipsis subtext" v-else-if="!card.stats && 'playlist'==card.type">{{i18n('Playlist')}}</div>
          <div class="cstats-home-card-sub ellipsis subtext" v-else-if="!card.stats && 'podcast'==card.type">{{i18n('Podcast')}}</div>
         </div>
         <div v-if="contextStatsHome.modHeld" class="cstats-home-card-play cstats-home-card-dismiss hover-btn" role="button" :aria-label="i18n('Hide')" :title="i18n('Hide')" @click.stop="contextStatsHomeDismiss(card)">
          <v-icon class="cstats-home-card-icon">close</v-icon>
         </div>
         <div v-else-if="desktopLayout" class="cstats-home-card-play hover-btn" role="button" :aria-label="i18n('Play')" :title="PLAY_ACTION | tooltip(keyboardControl)" @click.stop="contextStatsHomePlay(card)">
          <v-icon class="cstats-home-card-icon">play_arrow</v-icon>
         </div>
        </div>
       </div>
      </div>
     </swiper-slide>
     <div class="cstats-home-dots swiper-pagination" slot="pagination"></div>
    </swiper>
   </div>

   <!-- List-mode horizontal ihe strip (e.g. Radio stations) — grid peels these via layoutGrid -->
   <v-list-tile v-if="!(grid.allowed&&grid.use) && browseListIheStrip.length>0" class="grid-scroll list-grid browse-list-ihe-strip" v-bind:class="{'grid-scroll-s':!browseListIheHasSubtitle}" id="browse-list-ihe-strip">
    <div align="center" style="vertical-align: top" v-for="(citem, col) in browseListIheStrip" :key="citem.id || ('ihe-'+col)" @contextmenu.prevent="contextMenu(citem, undefined!=citem.gidx ? citem.gidx : col, $event)"
     @touchstart="citem && listSwipeStart(citem, undefined!=citem.gidx ? citem.gidx : col, 'browse', $event)"
     @touchmove="listSwipeMove($event)" @touchend="listSwipeEnd($event)" @touchcancel="listSwipeEnd($event)">
     <div class="image-grid-item" @click="click(citem, undefined!=citem.gidx ? citem.gidx : col, $event)" :title="citem | itemTooltip" v-bind:class="{'browse-kb-select': browseKbSelected(citem), 'search-highlight':browseKbSelected(citem) || highlightIndex==(undefined!=citem.gidx ? citem.gidx : col), 'list-active': (menu.show && (undefined!=citem.gidx ? citem.gidx : col)==menu.index) || (fetchingItem==citem.id)}">
      <div v-if="selection.size>0 && browseCanSelect(citem)" class="check-btn grid-btn image-grid-select-btn" @click.stop="select(citem, undefined!=citem.gidx ? citem.gidx : col, $event)" :title="ACTIONS[citem.selected ? UNSELECT_ACTION : SELECT_ACTION].title" v-bind:class="{'check-btn-checked':citem.selected}"></div>
      <img v-else-if="citem.multi" class="multi-disc" :src="(1==citem.multi ? 'group-multi' : 'album-multi') | svgIcon(true)" loading="lazy"></img>
      <img v-else-if="citem.overlay" class="multi-disc" :src="citem.overlay | svgIcon(true)" loading="lazy"></img>
      <div v-if="citem.images" :tile="true" class="image-grid-item-img">
       <div class="mi" :class="'mi'+citem.images.length">
        <img v-for="(mic, midx) in citem.images" :class="'mi-'+midx" :key="mic" :src="mic|gridImageSize" loading="lazy"></img>
       </div>
      </div>
      <div class="image-grid-item-icon" v-else-if="isTop && citem.icon">
       <v-icon class="image-grid-item-img image-grid-item-icon">{{citem.icon}}</v-icon>
      </div>
      <div class="image-grid-item-icon" v-else-if="isTop && citem.svg">
       <!-- Home uses theme mono (not sidebar chrome tint) -->
       <img class="image-grid-item-svg" :src="citem.svg | svgIcon(darkUi)" loading="lazy"></img>
      </div>
      <img v-else-if="citem.image" :key="citem.image" :src="citem.image|gridImageSize" onerror="this.src=DEFAULT_COVER" v-bind:class="{'radio-img': SECTION_RADIO==citem.section || SECTION_APPS==citem.section || citem.isRadio, 'circular':citem.stdItem==STD_ITEM_ARTIST || citem.stdItem==STD_ITEM_ONLINE_ARTIST || citem.stdItem==STD_ITEM_WORK_COMPOSER}" class="image-grid-item-img" loading="lazy"></img>
      <div class="image-grid-item-icon" v-else>
       <v-icon v-if="citem.icon" class="image-grid-item-img image-grid-item-icon">{{citem.icon}}</v-icon>
       <img v-else-if="citem.svg" class="image-grid-item-svg" :src="citem.svg | svgIcon(darkUi)" loading="lazy"></img>
       <img v-else class="image-grid-item-svg" :src="'image' | svgIcon(darkUi)" loading="lazy"></img>
      </div>
      <div v-if="citem.image && !(isTop && (citem.icon || citem.svg))" class="image-grid-text" @click.stop="gridTitleClick(citem, undefined!=citem.gidx ? citem.gidx : col, $event)">{{citem.title}}</div>
      <div v-else class="image-grid-text">{{citem.title}}</div>
      <div class="image-grid-text subtext" v-if="citem.libname">{{citem.libname}}</div>
      <div class="image-grid-text subtext" v-else-if="citem.subtitle" v-html="citem.subtitle" v-bind:class="{'link-item':subtitlesClickable}" @click.stop="clickSubtitle(citem, undefined!=citem.gidx ? citem.gidx : col, $event)"></div>
      <div class="grid-btn image-grid-btn hover-btn menu-btn" v-if="(undefined!=citem.stdItem && citem.stdItem<=STD_ITEM_MAX) || (citem.menu && citem.menu.length>0)" role="button" @click.stop="itemMenu(citem, undefined!=citem.gidx ? citem.gidx : col, $event)" :aria-label="i18n('%1 (Menu)', stripLinkTags(citem.title))"></div>
      <div class="emblem" v-if="citem.emblem" :style="{background: citem.emblem.bgnd}">
       <img :src="citem.emblem | emblem()" loading="lazy"></img>
      </div>
      <div v-if="hoverBtns && selection.size==0 && ((undefined!=citem.stdItem && citem.stdItem<=STD_ITEM_MAX) || (citem.menu && citem.menu.length>0 && (citem.menu[0]==PLAY_ACTION || citem.menu[0]==PLAY_ALL_ACTION)))" class="grid-btns">
       <img v-if="(!LMS_KIOSK_MODE || !HIDE_FOR_KIOSK.has(ADD_ACTION)) && allowAdd(citem)" class="other-btn grid-btn" @click.stop="itemAction(ADD_ACTION, citem, undefined!=citem.gidx ? citem.gidx : col, $event)" :title="ACTIONS[ADD_ACTION].title" :src="'hover-add' | svgIcon(darkUi, true)"></img>
       <img v-if="!queryParams.party && (!LMS_KIOSK_MODE || !HIDE_FOR_KIOSK.has(INSERT_ACTION)) && allowInsert(citem)" class="other-btn grid-btn" @click.stop="itemAction(INSERT_ACTION, citem, undefined!=citem.gidx ? citem.gidx : col, $event)" :title="ACTIONS[INSERT_ACTION].title" :src="'hover-playnext' | svgIcon(darkUi, true)"></img>
       <img v-if="allowShuffle(citem)" class="other-btn grid-btn" @click.stop="itemAction(PLAY_SHUFFLE_ACTION, citem, undefined!=citem.gidx ? citem.gidx : col, $event)" :title="ACTIONS[PLAY_SHUFFLE_ACTION].title" :src="'hover-shuffle' | svgIcon(darkUi, true)"></img>
       <img v-if="!queryParams.party && (!LMS_KIOSK_MODE || !HIDE_FOR_KIOSK.has(PLAY_ACTION))" class="main-btn grid-btn" @click.stop="itemAction(PLAY_ACTION, citem, undefined!=citem.gidx ? citem.gidx : col, $event)" :title="ACTIONS[PLAY_ACTION].title" :src="'hover-play' | svgIcon(darkUi, true)"></img>
      </div>
      <div v-if="hoverBtns && selection.size==0 && citem.image" class="grid-btns grid-btn-left"><img class="other-btn grid-btn" @click.stop="itemAction(SHOW_IMAGE_ACTION, citem, undefined!=citem.gidx ? citem.gidx : col, $event)" :title="ACTIONS[SHOW_IMAGE_ACTION].title" :src="'hover-expand' | svgIcon(darkUi, true)"></img>
      </div>
     </div>
    </div>
   </v-list-tile>

   <RecycleScroller ref="browseGridScroller" v-if="grid.allowed&&grid.use" :items="grid.rows" :item-size="variableGridHeight ? null : GRID_TEXT_ONLY==grid.type ? grid.ih : (grid.ih - (grid.haveSubtitle || isTop || current.id.startsWith(TOP_ID_PREFIX) ? 0 : GRID_SINGLE_LINE_DIFF))" page-mode key-field="id" :buffer="LMS_SCROLLER_GRID_BUFFER">
    <div slot-scope="{item}" :class="[grid.few?'image-grid-few':'image-grid-full-width', GRID_TEXT_ONLY==grid.type && items.length>0 && items[0].stdItem==STD_ITEM_GENRE ? 'genre-grid' : '', GRID_TEXT_ONLY!=grid.type && (variableGridHeight ? item.hasSub : grid.haveSubtitle)?'image-grid-with-sub':'',grid.type==GRID_ICON_ONLY_ONLY?'icon-only':'',item.ihe&&!item.header&&!item.spacer&&!item.placeholder?'grid-scroll':'']">

     <div v-if="item.placeholder" class="browse-home-extra-ph" :style="{height: (item.size||0)+'px'}" aria-hidden="true"></div>
     <div v-else-if="item.spacer" class="browse-scroll-block-gap" :style="item.size ? {height:item.size+'px'} : null"></div>

     <v-list-tile v-if="GRID_TEXT_ONLY==grid.type && item.header && item.item" class="grid-header no-hover">
      <v-list-tile-avatar v-if="item.item.icon" :tile="true" class="lms-avatar">
       <v-icon>{{item.item.icon}}</v-icon>
      </v-list-tile-avatar>
      <v-list-tile-avatar v-else-if="item.item.svg" :tile="true" class="lms-avatar">
       <img :class="['hdr-'+hRgb, 'svg-list-img']" :src="item.item.svg | svgIcon(darkUi, undefined, true)" loading="lazy" @dragstart.prevent="" @dragenter.prevent=""></img>
      </v-list-tile-avatar>
      <v-list-tile-content>
       <v-list-tile-title>{{item.item.title}}</v-list-tile-title>
      </v-list-tile-content>
      <v-list-tile-action class="browse-action" v-if="undefined!=item.item.menu && item.item.menu.length>0">
       <div class="grid-btn list-btn hover-btn menu-btn" role="button" @click.stop="itemMenu(item.item, item.rs, $event)" :aria-label="i18n('%1 (Menu)', stripLinkTags(item.item.title))"></div>
      </v-list-tile-action>
     </v-list-tile>
     <div v-else-if="GRID_TEXT_ONLY==grid.type" align="center" style="vertical-align: top" v-for="(citem, col) in item.items" @contextmenu.prevent="contextMenu(citem, isTop ? citem.gidx : (item.rs+col), $event)">
      <div v-if="undefined==citem" class="text-grid-item defcursor"></div>
      <div v-else class="text-grid-item" @click="click(citem, isTop ? citem.gidx : (item.rs+col), $event)" :title="citem | itemTooltip">
       <div v-if="selection.size>0 && browseCanSelect(citem)" class="check-btn grid-btn image-grid-select-btn" @click.stop="select(citem, isTop ? citem.gidx : (item.rs+col), $event)" :title="ACTIONS[citem.selected ? UNSELECT_ACTION : SELECT_ACTION].title" v-bind:class="{'check-btn-checked':citem.selected}"></div>
       <div v-bind:class="{'browse-kb-select': browseKbSelected(citem), 'search-highlight':browseKbSelected(citem) || highlightIndex==(isTop ? citem.gidx : (item.rs+col)), 'list-active': (menu.show && (isTop ? citem.gidx : (item.rs+col))==menu.index) || (fetchingItem==item.id)}">
         <div class="stripe" :style="{background: citem.color}"></div>
         <div>{{citem.title}}</div></div>
        <div class="grid-btn image-grid-btn hover-btn menu-btn" v-if="(undefined!=citem.stdItem && citem.stdItem<=STD_ITEM_MAX) || (citem.menu && citem.menu.length>0)" role="button" @click.stop="itemMenu(citem, isTop ? citem.gidx : (item.rs+col), $event)" :aria-label="i18n('%1 (Menu)', stripLinkTags(citem.title))"></div>
      </div>
     </div>

     <v-list-tile v-else-if="item.header && item.item" class="grid-header" @click.stop="click(item.item, undefined, $event)" v-bind:class="{'search-highlight':highlightIndex==(item.rs)}">
      <v-list-tile-avatar v-if="item.item.icon" :tile="true" class="lms-avatar">
       <v-icon>{{item.item.icon}}</v-icon>
      </v-list-tile-avatar>
      <v-list-tile-avatar v-else-if="item.item.svg" :tile="true" class="lms-avatar">
       <img :class="['hdr-'+hRgb, 'svg-list-img']" :src="item.item.svg | svgIcon(darkUi, undefined, true)" loading="lazy" @dragstart.prevent="" @dragenter.prevent=""></img>
      </v-list-tile-avatar>
      <v-list-tile-content>
       <v-list-tile-title>{{item.item.title}}</v-list-tile-title>
      </v-list-tile-content>
      <v-list-tile-action class="browse-action explore-view-toggle" v-if="isTop && isExploreHeaderItem(item.item) && undefined!=exploreViewAct">
       <v-btn flat icon class="toolbar-button" @click.stop="toggleHomeExploreView($event)" :title="ACTIONS[exploreViewAct].title">
        <img v-if="ACTIONS[exploreViewAct].svg" class="svg-img" :src="ACTIONS[exploreViewAct].svg | svgIcon(darkUi, 'chrome', chromeSvgCol)"></img>
        <v-icon v-else>{{ACTIONS[exploreViewAct].icon}}</v-icon>
       </v-btn>
      </v-list-tile-action>
      <v-list-tile-action class="browse-action browse-more" v-if="undefined!=item.item.morecmd || undefined!=item.item.allItems || (item.item.slimbrowse && item.item.header && item.item.actions)">
       <div class="link-item" role="button" :aria-label="i18n('%1 (More)', stripLinkTags(item.item.title))" @click.stop="showMore(item.item)">{{i18n('More')}}</div>
      </v-list-tile-action>
      <v-list-tile-action class="browse-action" v-else-if="undefined!=item.item.menu && item.item.menu.length>0">
       <div class="grid-btn list-btn hover-btn menu-btn" @click.stop="itemMenu(item.item, undefined, $event)" role="button" :aria-label="i18n('%1 (Menu)', stripLinkTags(item.item.title))"></div>
      </v-list-tile-action>
      <div v-if="hoverBtns && 0==selection.size && (item.item.menu && (item.item.menu[0]==PLAY_ACTION || item.item.menu[0]==PLAY_ALL_ACTION))" class="list-btns" v-bind:class="{'hover-more':undefined!=item.item.morecmd||undefined!=item.item.allItems||(item.item.slimbrowse && item.item.header && item.item.actions)}">
       <img v-if="!LMS_KIOSK_MODE || !HIDE_FOR_KIOSK.has(ADD_ACTION)" class="other-btn grid-btn" @click.stop="itemAction(ADD_ALL_ACTION, item.item, undefined, $event)" :title="ACTIONS[ADD_ACTION].title" :src="'hover-add' | svgIcon(darkUi, false)"></img>
       <img v-if="!queryParams.party && (!LMS_KIOSK_MODE || !HIDE_FOR_KIOSK.has(INSERT_ACTION))" class="other-btn grid-btn" @click.stop="itemAction(INSERT_ALL_ACTION, item.item, undefined, $event)" :title="ACTIONS[INSERT_ACTION].title" :src="'hover-playnext' | svgIcon(darkUi, false)"></img>
       <img v-if="allowShuffle(item.item)" class="other-btn grid-btn" @click.stop="itemAction(PLAY_SHUFFLE_ALL_ACTION, item.item, undefined, $event)" :title="ACTIONS[PLAY_SHUFFLE_ACTION].title" :src="'hover-shuffle' | svgIcon(darkUi, false)"></img>
       <img v-if="!queryParams.party && (!LMS_KIOSK_MODE || !HIDE_FOR_KIOSK.has(PLAY_ACTION))" class="main-btn grid-btn" @click.stop="itemAction(PLAY_ALL_ACTION, item.item, undefined, $event)" :title="ACTIONS[PLAY_ACTION].title" :src="'hover-play' | svgIcon(darkUi, false)"></img>
      </div>
     </v-list-tile>

     <v-list-tile v-else-if="item.exploreList && item.item" avatar class="lms-avatar lms-list-item explore-list-row"
      @click="click(item.item, isTop && undefined!=item.item.gidx ? item.item.gidx : item.rs, $event)"
      @contextmenu.prevent="contextMenu(item.item, isTop && undefined!=item.item.gidx ? item.item.gidx : item.rs, $event)"
      :id="'item'+(isTop && undefined!=item.item.gidx ? item.item.gidx : item.rs)"
      v-bind:class="{'browse-kb-select': browseKbSelected(item.item), 'search-highlight':browseKbSelected(item.item) || highlightIndex==(isTop && undefined!=item.item.gidx ? item.item.gidx : item.rs), 'list-active': (menu.show && (isTop && undefined!=item.item.gidx ? item.item.gidx : item.rs)==menu.index) || (fetchingItem==item.item.id)}">
      <v-list-tile-avatar v-if="item.item.icon" :tile="true" class="lms-avatar">
       <v-icon>{{item.item.icon}}</v-icon>
      </v-list-tile-avatar>
      <v-list-tile-avatar v-else-if="item.item.svg" :tile="true" class="lms-avatar">
       <img class="svg-list-img" :src="item.item.svg | svgIcon(darkUi)" loading="lazy" @dragstart.prevent="" @dragenter.prevent=""></img>
      </v-list-tile-avatar>
      <v-list-tile-avatar v-else-if="item.item.image" :tile="true" class="lms-avatar">
       <img :key="item.item.image" v-lazy="item.item.image" onerror="this.src=DEFAULT_COVER"></img>
      </v-list-tile-avatar>
      <v-list-tile-avatar v-else :tile="true" class="lms-avatar">
       <v-icon>folder</v-icon>
      </v-list-tile-avatar>
      <v-list-tile-content>
       <v-list-tile-title>{{item.item.title}}<b class="vlib-name" v-if="item.item.libname">{{SEPARATOR+item.item.libname}}</b></v-list-tile-title>
       <v-list-tile-sub-title v-if="item.item.subtitle" v-html="item.item.subtitle"></v-list-tile-sub-title>
      </v-list-tile-content>
      <v-list-tile-action class="browse-action" v-if="(undefined!=item.item.stdItem && item.item.stdItem<=STD_ITEM_MAX) || (item.item.menu && item.item.menu.length>0)">
       <div class="grid-btn list-btn hover-btn menu-btn" @click.stop="itemMenu(item.item, isTop && undefined!=item.item.gidx ? item.item.gidx : item.rs, $event)" role="button" :aria-label="i18n('%1 (Menu)', stripLinkTags(item.item.title))"></div>
      </v-list-tile-action>
     </v-list-tile>

     <div v-else align="center" style="vertical-align: top" v-for="(citem, col) in item.items" @contextmenu.prevent="contextMenu(citem, isTop ? citem.gidx : (item.rs+col), $event)"
      v-bind:class="(!isTop && citem && !item.ihe) ? listSwipeRowClass(citem, isTop ? citem.gidx : (item.rs+col), 'browse') : null"
      :data-msk-index="citem ? (isTop ? citem.gidx : (item.rs+col)) : null"
      :id="citem ? ('item'+(isTop ? citem.gidx : (item.rs+col))) : null"
      @touchstart="citem && listSwipeStart(citem, isTop ? citem.gidx : (item.rs+col), 'browse', $event)"
      @touchmove="citem && !item.ihe && listSwipeMove($event)"
      @touchend="citem && listSwipeEnd($event)"
      @touchcancel="citem && listSwipeEnd($event)"
      @pointerdown="citem && listSwipeStart(citem, isTop ? citem.gidx : (item.rs+col), 'browse', $event)"
      @pointermove="citem && !item.ihe && listSwipeMove($event)"
      @pointerup="citem && listSwipeEnd($event)"
      @pointercancel="citem && listSwipeEnd($event)"
      @wheel.passive="!isTop && citem && !item.ihe && listSwipeWheel(citem, isTop ? citem.gidx : (item.rs+col), 'browse', $event)">
      <div v-if="undefined==citem" class="image-grid-item defcursor"></div>
      <template v-else>
       <div v-if="!isTop && !item.ihe" class="list-swipe-bg list-swipe-bg-add" aria-hidden="true">
        <v-icon>playlist_add</v-icon>
        <span class="list-swipe-label">{{ACTIONS[ADD_ACTION].short || ACTIONS[ADD_ACTION].title}}</span>
       </div>
       <div v-if="!isTop && !item.ihe" class="list-swipe-bg list-swipe-bg-next" aria-hidden="true">
        <v-icon>playlist_play</v-icon>
        <span class="list-swipe-label">{{ACTIONS[INSERT_ACTION].short || ACTIONS[INSERT_ACTION].title}}</span>
       </div>
       <div class="image-grid-item" :style="(!isTop && !item.ihe) ? listSwipeStyle(citem, isTop ? citem.gidx : (item.rs+col), 'browse') : null" @click="click(citem, isTop ? citem.gidx : (item.rs+col), $event)" :title="citem | itemTooltip" :draggable="desktopLayout && (citem.draggable || isTop)" @dragstart="dragStart(isTop ? citem.gidx : (item.rs+col), $event)" @dragenter.prevent="" @dragend="dragEnd()" @dragover="dragOver(isTop ? citem.gidx : (item.rs+col), $event)" @drop="drop(isTop ? citem.gidx : (item.rs+col), $event)" v-bind:class="{'browse-kb-select': browseKbSelected(citem), 'search-highlight':browseKbSelected(citem) || highlightIndex==(isTop ? citem.gidx : (item.rs+col)), 'list-active': (menu.show && (isTop ? citem.gidx : (item.rs+col))==menu.index) || (fetchingItem==item.id), 'drop-target':dragActive && (isTop ? citem.gidx : (item.rs+col))==dropIndex}">
        <div v-if="selection.size>0 && browseCanSelect(citem)" class="check-btn grid-btn image-grid-select-btn" @click.stop="select(citem, isTop ? citem.gidx : (item.rs+col), $event)" :title="ACTIONS[citem.selected ? UNSELECT_ACTION : SELECT_ACTION].title" v-bind:class="{'check-btn-checked':citem.selected}"></div>
        <img v-else-if="citem.multi" class="multi-disc" :src="(1==citem.multi ? 'group-multi' : 'album-multi') | svgIcon(true)" loading="lazy"></img>
        <img v-else-if="citem.overlay" class="multi-disc" :src="citem.overlay | svgIcon(true)" loading="lazy"></img>
        <div v-if="citem.images" :tile="true" class="image-grid-item-img">
         <div class="mi" :class="'mi'+citem.images.length">
          <img v-for="(mic, midx) in citem.images" :class="'mi-'+midx" :key="mic" :src="mic|gridImageSize" loading="lazy"></img>
         </div>
        </div>
        <div class="image-grid-item-icon" v-else-if="isTop && citem.icon">
         <v-icon class="image-grid-item-img image-grid-item-icon">{{citem.icon}}</v-icon>
        </div>
        <div class="image-grid-item-icon" v-else-if="isTop && citem.svg">
         <img class="image-grid-item-svg" :src="citem.svg | svgIcon(darkUi)" loading="lazy"></img>
        </div>
        <img v-else-if="citem.image" :key="citem.image" :src="citem.image|gridImageSize" onerror="this.src=DEFAULT_COVER" v-bind:class="{'radio-img': SECTION_RADIO==citem.section || SECTION_APPS==citem.section || citem.isRadio, 'circular':citem.stdItem==STD_ITEM_ARTIST || citem.stdItem==STD_ITEM_ONLINE_ARTIST || citem.stdItem==STD_ITEM_WORK_COMPOSER}" class="image-grid-item-img" loading="lazy"></img>
        <div class="image-grid-item-icon" v-else>
         <v-icon v-if="citem.icon" class="image-grid-item-img image-grid-item-icon">{{citem.icon}}</v-icon>
         <img v-else-if="citem.svg" class="image-grid-item-svg" :src="citem.svg | svgIcon(darkUi)" loading="lazy"></img>
         <img v-else class="image-grid-item-svg" :src="'image' | svgIcon(darkUi)" loading="lazy"></img>
        </div>
        <div v-if="citem.image && !(isTop && (citem.icon || citem.svg))" class="image-grid-text" @click.stop="gridTitleClick(citem, isTop ? citem.gidx : (item.rs+col), $event)">{{citem.title}}</div>
        <div v-else class="image-grid-text">{{citem.title}}</div>
        <div class="image-grid-text subtext" v-if="citem.libname">{{citem.libname}}</div>
        <div class="image-grid-text subtext" v-else v-html="citem.subtitle" v-bind:class="{'link-item':subtitlesClickable}" @click.stop="clickSubtitle(citem, isTop ? citem.gidx : (item.rs+col), $event)"></div>
        <div v-if="itemPreviewLive(citem)" class="grid-preview-live" role="button"
             :class="{'msk-ctx-preview-active': previewUi.active, 'msk-ctx-preview-loading': previewUi.loading, 'preview-live-fading': previewUi.fading}"
             @click.stop="itemAction(PREVIEW_ACTION, citem, isTop ? citem.gidx : (item.rs+col), $event)"
             :title="i18n('Stop preview')" :aria-label="i18n('Stop preview')">
         <svg class="msk-preview-live-svg" viewBox="0 0 36 36" aria-hidden="true">
          <circle class="msk-ctx-preview-ring-bg" cx="18" cy="18" r="15"></circle>
          <circle class="msk-ctx-preview-ring" cx="18" cy="18" r="15" :style="previewRingStyle"></circle>
          <g class="msk-ctx-preview-pause">
           <rect x="12.4" y="11" width="3.6" height="14" rx="1"></rect>
           <rect x="20" y="11" width="3.6" height="14" rx="1"></rect>
          </g>
         </svg>
        </div>
        <div class="grid-btn image-grid-btn hover-btn menu-btn" v-if="(undefined!=citem.stdItem && citem.stdItem<=STD_ITEM_MAX) || (citem.menu && citem.menu.length>0 && (!citem.isPinned || (!queryParams.party && (!LMS_KIOSK_MODE || !HIDE_FOR_KIOSK.has(PIN_ACTION)))))" role="button" @click.stop="itemMenu(citem, isTop ? citem.gidx : (item.rs+col), $event)" :aria-label="i18n('%1 (Menu)', stripLinkTags(citem.title))"></div>
        <div class="emblem" v-if="citem.emblem" :style="{background: citem.emblem.bgnd}">
         <img :src="citem.emblem | emblem()" loading="lazy"></img>
        </div>
        <div v-if="hoverBtns && selection.size==0 && ((undefined!=citem.stdItem && citem.stdItem<=STD_ITEM_MAX) || (citem.menu && citem.menu.length>0 && (citem.menu[0]==PLAY_ACTION || citem.menu[0]==PLAY_ALL_ACTION)))" class="grid-btns">
         <img v-if="(!LMS_KIOSK_MODE || !HIDE_FOR_KIOSK.has(ADD_ACTION)) && allowAdd(citem)" class="other-btn grid-btn" @click.stop="itemAction(ADD_ACTION, citem, isTop ? citem.gidx : (item.rs+col), $event)" :title="ACTIONS[ADD_ACTION].title" :src="'hover-add' | svgIcon(darkUi, true)"></img>
         <img v-if="!queryParams.party && (!LMS_KIOSK_MODE || !HIDE_FOR_KIOSK.has(INSERT_ACTION)) && allowInsert(citem)" class="other-btn grid-btn" @click.stop="itemAction(INSERT_ACTION, citem, isTop ? citem.gidx : (item.rs+col), $event)" :title="ACTIONS[INSERT_ACTION].title" :src="'hover-playnext' | svgIcon(darkUi, true)"></img>
         <img v-if="allowShuffle(citem)" class="other-btn grid-btn" @click.stop="itemAction(PLAY_SHUFFLE_ACTION, citem, isTop ? citem.gidx : (item.rs+col), $event)" :title="ACTIONS[PLAY_SHUFFLE_ACTION].title" :src="'hover-shuffle' | svgIcon(darkUi, true)"></img>
         <img v-if="!queryParams.party && (!LMS_KIOSK_MODE || !HIDE_FOR_KIOSK.has(PLAY_ACTION))" class="main-btn grid-btn" @click.stop="itemAction(PLAY_ACTION, citem, isTop ? citem.gidx : (item.rs+col), $event)" :title="ACTIONS[PLAY_ACTION].title" :src="'hover-play' | svgIcon(darkUi, true)"></img>
        </div>
        <div v-if="hoverBtns && selection.size==0 && citem.image" class="grid-btns grid-btn-left"><img class="other-btn grid-btn" @click.stop="itemAction(SHOW_IMAGE_ACTION, citem, item.rs+col, $event)" :title="ACTIONS[SHOW_IMAGE_ACTION].title" :src="'hover-expand' | svgIcon(darkUi, true)"></img>
        </div>
       </div>
      </template>
     </div>
    </div>
   </RecycleScroller>

   <RecycleScroller v-else-if="useRecyclerForLists" :items="browseListBodyItems" :item-size="browseListItemSize" page-mode key-field="id" :buffer="LMS_SCROLLER_LIST_BUFFER" :emit-update="true" :class="{'list-filter-active': listFilterTerm && 2==searchActive}">
    <div slot-scope="{item, index}" v-bind:class="[listSwipeRowClass(item, undefined!=item.gidx ? item.gidx : index, 'browse'), {'browse-kb-select': browseKbSelected(item)}]"
     :data-msk-index="undefined!=item.gidx ? item.gidx : index"
     @touchstart="listSwipeStart(item, undefined!=item.gidx ? item.gidx : index, 'browse', $event)"
     @touchmove="listSwipeMove($event)"
     @touchend="listSwipeEnd($event)"
     @touchcancel="listSwipeEnd($event)"
     @pointerdown="listSwipeStart(item, undefined!=item.gidx ? item.gidx : index, 'browse', $event)"
     @pointermove="listSwipeMove($event)"
     @pointerup="listSwipeEnd($event)"
     @pointercancel="listSwipeEnd($event)"
     @wheel.passive="listSwipeWheel(item, undefined!=item.gidx ? item.gidx : index, 'browse', $event)">
     <div class="list-swipe-bg list-swipe-bg-add" aria-hidden="true">
      <v-icon>playlist_add</v-icon>
      <span class="list-swipe-label">{{ACTIONS[ADD_ACTION].short || ACTIONS[ADD_ACTION].title}}</span>
     </div>
     <div class="list-swipe-bg list-swipe-bg-next" aria-hidden="true">
      <v-icon>playlist_play</v-icon>
      <span class="list-swipe-label">{{ACTIONS[INSERT_ACTION].short || ACTIONS[INSERT_ACTION].title}}</span>
     </div>
     <v-list-tile avatar class="list-swipe-tile" :style="listSwipeStyle(item, undefined!=item.gidx ? item.gidx : index, 'browse')" @click="click(item, undefined!=item.gidx ? item.gidx : index, $event)" :id="'item'+(undefined!=item.gidx ? item.gidx : index)" @dragstart="dragStart(undefined!=item.gidx ? item.gidx : index, $event)" @dragenter.prevent="" @dragend="dragEnd()" @dragover="dragOver(undefined!=item.gidx ? item.gidx : index, $event)" @drop="drop(undefined!=item.gidx ? item.gidx : index, $event)" :draggable="desktopLayout && item.draggable && (current.section!=SECTION_FAVORITES || 0==selection.size)" v-bind:class="{'browse-header':item.header, 'browse-kb-select': browseKbSelected(item), 'search-highlight':browseKbSelected(item), 'highlight':item.highlight && !item.kbSelect, 'list-active': (menu.show && (undefined!=item.gidx ? item.gidx : index)==menu.index) || (fetchingItem==item.id), 'drop-target':dragActive && (undefined!=item.gidx ? item.gidx : index)==dropIndex}" @contextmenu.prevent="contextMenu(item, undefined!=item.gidx ? item.gidx : index, $event)">
      <v-list-tile-avatar v-if="item.selected" :tile="true" class="lms-avatar">
       <v-icon>check_box</v-icon>
      </v-list-tile-avatar>
      <v-list-tile-avatar v-else-if="item.images" :tile="true" class="mi lms-avatar" :class="'mi'+item.images.length">
       <img v-for="(mic, midx) in item.images" :class="'mi-'+midx" :key="mic" :src="mic" loading="lazy"></img>
      </v-list-tile-avatar>
      <v-list-tile-avatar v-else-if="item.image" :tile="true" v-bind:class="{'radio-image': SECTION_RADIO==item.section || SECTION_APPS==item.section || item.isRadio}" class="lms-avatar">
       <img :key="item.image" :src="item.image" onerror="this.src=DEFAULT_COVER" class="allow-drag" v-bind:class="{'circular':item.stdItem==STD_ITEM_ARTIST || item.stdItem==STD_ITEM_ONLINE_ARTIST || item.stdItem==STD_ITEM_WORK_COMPOSER}" loading="lazy"></img>
      </v-list-tile-avatar>
      <v-list-tile-avatar v-else-if="item.icon" :tile="true" class="lms-avatar">
       <v-icon>{{item.icon}}</v-icon>
      </v-list-tile-avatar>
      <v-list-tile-avatar v-else-if="item.svg" :tile="true" class="lms-avatar">
       <img :class="['hdr-'+hRgb, 'svg-list-img']" :src="item.svg | svgIcon(darkUi, undefined, item.header)" loading="lazy" @dragstart.prevent="" @dragenter.prevent=""></img>
      </v-list-tile-avatar>

      <v-list-tile-avatar v-else-if="undefined!=item.tracknum" class="tnum">{{item.tracknum}}</v-list-tile-avatar>

      <div v-if="itemPreviewLive(item)" class="list-preview-live" role="button"
           :class="{'msk-ctx-preview-active': previewUi.active, 'msk-ctx-preview-loading': previewUi.loading, 'preview-live-fading': previewUi.fading}"
           @click.stop="itemAction(PREVIEW_ACTION, item, undefined!=item.gidx ? item.gidx : index, $event)"
           :title="i18n('Stop preview')" :aria-label="i18n('Stop preview')">
       <svg class="msk-preview-live-svg" viewBox="0 0 36 36" aria-hidden="true">
        <circle class="msk-ctx-preview-ring-bg" cx="18" cy="18" r="15"></circle>
        <circle class="msk-ctx-preview-ring" cx="18" cy="18" r="15" :style="previewRingStyle"></circle>
        <g class="msk-ctx-preview-pause">
         <rect x="12.4" y="11" width="3.6" height="14" rx="1"></rect>
         <rect x="20" y="11" width="3.6" height="14" rx="1"></rect>
        </g>
       </svg>
      </div>

      <img v-if="!item.selected && undefined!=item.tracknum && item.id==currentTrack" class="browse-current-indicator" :src="'pq-current' | indIcon"></img>
      <img v-else-if="!item.selected && undefined!=item.playlist_track_id && item.playlist_track_id==currentTrack" class="browse-current-indicator-playlist" :src="'pq-current' | indIcon"></img>

      <!-- TODO: Do we have search fields with large lists?? -->
      <v-list-tile-content v-if="item.header" @click.stop="click(item, index, $event)">
       <v-list-tile-title v-if="item.titleLinks" v-html="item.titleLinks"></v-list-tile-title>
       <v-list-tile-title v-else>{{item.title}}</v-list-tile-title>
       <v-list-tile-sub-title v-if="item.subtitle && !item.hidesub">{{item.subtitle}}</v-list-tile-sub-title>
      </v-list-tile-content>
      <v-list-tile-action class="browse-action explore-view-toggle" v-if="item.header && isTop && isExploreHeaderItem(item) && undefined!=exploreViewAct">
       <v-btn flat icon class="toolbar-button" @click.stop="toggleHomeExploreView($event)" :title="ACTIONS[exploreViewAct].title">
        <img v-if="ACTIONS[exploreViewAct].svg" class="svg-img" :src="ACTIONS[exploreViewAct].svg | svgIcon(darkUi, 'chrome', chromeSvgCol)"></img>
        <v-icon v-else>{{ACTIONS[exploreViewAct].icon}}</v-icon>
       </v-btn>
      </v-list-tile-action>
      <v-list-tile-content v-else-if="item.type=='html' || item.type=='text'" class="browse-text-inrecycler">
       <v-list-tile-title v-html="item.title" @touchend="textSelectEnd" @mouseup="textSelectEnd" @contextmenu="event.preventDefault()"></v-list-tile-title>
      </v-list-tile-content>
      <v-list-tile-content v-else>
       <v-list-tile-title v-html="item.title" v-bind:class="{'browse-no-sub':!item.subtitle}"></v-list-tile-title>
       <v-list-tile-sub-title v-if="wide>WIDE_NONE && item.subtitleContext" v-html="item.subtitleContext"></v-list-tile-sub-title>
       <v-list-tile-sub-title v-else v-html="item.subtitleLinks ? item.subtitleLinks : item.subtitle"></v-list-tile-sub-title>
      </v-list-tile-content>

      <v-list-tile-action v-if="undefined!=item.durationStr" class="browse-time">{{item.durationStr}}</v-list-tile-action>
      <v-list-tile-action class="browse-action browse-more" v-if="undefined!=item.morecmd || undefined!=item.allItems || (item.slimbrowse && item.header && item.actions)">
       <div class="link-item" role="button" :aria-label="i18n('%1 (More)', stripLinkTags(item.title))" @click.stop="showMore(item)">{{i18n('More')}}</div>
      </v-list-tile-action>
      <v-list-tile-action class="browse-action" v-else-if="((undefined!=item.stdItem && item.stdItem<=STD_ITEM_MAX) && item.stdItem<=STD_ITEM_MAX) || (item.menu && item.menu.length>0)">
       <div class="grid-btn list-btn hover-btn menu-btn" @click.stop="itemMenu(item, undefined!=item.gidx ? item.gidx : index, $event)" role="button" :aria-label="i18n('%1 (Menu)', stripLinkTags(item.title))"></div>
      </v-list-tile-action>
      <div v-if="hoverBtns && 0==selection.size && ((undefined!=item.stdItem && item.stdItem<=STD_ITEM_MAX) || (item.menu && (item.menu[0]==PLAY_ACTION || item.menu[0]==PLAY_ALL_ACTION)))" class="list-btns" v-bind:class="{'list-btns-track':item.durationStr,'list-btns-preview':itemPreviewLive(item),'hover-more':undefined!=item.morecmd||undefined!=item.allItems||(item.slimbrowse && item.header && item.actions)}">
       <img v-if="(!LMS_KIOSK_MODE || !HIDE_FOR_KIOSK.has(ADD_ACTION)) && allowAdd(item)" class="other-btn grid-btn" @click.stop="itemAction(item.header ? ADD_ALL_ACTION : ADD_ACTION, item, undefined!=item.gidx ? item.gidx : index, $event)" :title="ACTIONS[ADD_ACTION].title" :src="'hover-add' | svgIcon(darkUi, true)"></img>
       <img v-if="!queryParams.party && (!LMS_KIOSK_MODE || !HIDE_FOR_KIOSK.has(INSERT_ACTION)) && allowInsert(item)" class="other-btn grid-btn" @click.stop="itemAction( item.header ? INSERT_ALL_ACTION : INSERT_ACTION, item, undefined!=item.gidx ? item.gidx : index, $event)" :title="ACTIONS[INSERT_ACTION].title" :src="'hover-playnext' | svgIcon(darkUi, true)"></img>
       <img v-if="allowShuffle(item)" class="other-btn grid-btn" @click.stop="itemAction(item.header ? PLAY_SHUFFLE_ALL_ACTION : PLAY_SHUFFLE_ACTION, item, undefined!=item.gidx ? item.gidx : index, $event)" :title="ACTIONS[PLAY_SHUFFLE_ACTION].title" :src="'hover-shuffle' | svgIcon(darkUi, true)"></img>
       <img v-if="!queryParams.party && (!LMS_KIOSK_MODE || !HIDE_FOR_KIOSK.has(PLAY_ACTION))" class="main-btn grid-btn" @click.stop="itemAction(item.header ? PLAY_ALL_ACTION : PLAY_ACTION, item, undefined!=item.gidx ? item.gidx : index, $event)" :title="ACTIONS[PLAY_ACTION].title" :src="'hover-play' | svgIcon(darkUi, true)"></img>
      </div>
      <div class="emblem" v-if="item.emblem" :style="{background: item.emblem.bgnd}">
       <img :src="item.emblem | emblem()" loading="lazy"></img>
      </div>
     </v-list-tile>
    </div>
   </RecycleScroller>

   <div v-else-if="browseListBodyItems.length==1 && browseListBodyItems[0].type=='html'" class="lms-list-item browse-html" v-html="browseListBodyItems[0].title" @touchend="textSelectEnd" @mouseup="textSelectEnd" @contextmenu="event.preventDefault()"></div>
   <template v-else v-for="(item, index) in browseListBodyItems">
    <v-list-tile v-if="item.type=='text' && canClickText(item)" avatar @click="click(item, index, $event)" v-bind:class="{'error-text': item.id==='error'}" class="lms-avatar lms-list-item" @contextmenu.prevent="contextMenu(item, index, $event)">
     <v-list-tile-content>
      <v-list-tile-title>{{item.title}}</v-list-tile-title>
      <v-list-tile-sub-title v-html="item.subtitle"></v-list-tile-sub-title>
     </v-list-tile-content>
    </v-list-tile>
    <v-list-tile v-else-if="item.type=='html' || item.type=='text'" class="lms-list-item browse-text">
     <v-list-tile-content>
      <v-list-tile-title v-html="item.title" @touchend="textSelectEnd" @mouseup="textSelectEnd" @contextmenu="event.preventDefault()"></v-list-tile-title>
     </v-list-tile-content>
    </v-list-tile>
    <v-list-tile v-else-if="undefined!=item.searchcat && undefined!=item.items" class="grid-scroll list-grid icon-only" v-bind:class="{'grid-scroll-s':undefined==item.items[0].subtitle}" :id="'gridscroll-'+index">

     <div align="center" style="vertical-align: top" v-for="(citem, col) in item.items" @contextmenu.prevent="contextMenu(citem, undefined, $event)"  :id="'gridscroll-'+index+'.'+col">
      <div v-if="undefined==citem" class="image-grid-item defcursor"></div>
      <div v-else class="image-grid-item" @click="click(citem, undefined, $event)" :title="citem | itemTooltip" v-bind:class="{'browse-kb-select': browseKbSelected(citem, col), 'search-highlight':browseKbSelected(citem, col), 'list-active': menu.show && index==menu.index}">
       <img v-if="citem.multi" class="multi-disc" :src="(1==citem.multi ? 'group-multi' : 'album-multi') | svgIcon(true)" loading="lazy"></img>
       <img v-else-if="citem.overlay" class="multi-disc" :src="citem.overlay | svgIcon(true)" loading="lazy"></img>
       <div v-if="citem.images" :tile="true" class="image-grid-item-img">
        <div class="mi" :class="'mi'+citem.images.length">
         <img v-for="(mic, midx) in citem.images" :class="'mi-'+midx" :key="mic" :src="mic|gridImageSize" loading="lazy"></img>
        </div>
       </div>
       <div class="image-grid-item-icon" v-else-if="isTop && citem.icon">
        <v-icon class="image-grid-item-img image-grid-item-icon">{{citem.icon}}</v-icon>
       </div>
       <div class="image-grid-item-icon" v-else-if="isTop && citem.svg">
        <img class="image-grid-item-svg" :src="citem.svg | svgIcon(darkUi)" loading="lazy"></img>
       </div>
       <img v-else-if="citem.image" :key="citem.image" :src="citem.image|gridImageSize" onerror="this.src=DEFAULT_COVER" v-bind:class="{'circular':citem.stdItem==STD_ITEM_ARTIST || citem.stdItem==STD_ITEM_ONLINE_ARTIST || citem.stdItem==STD_ITEM_WORK_COMPOSER}" class="image-grid-item-img" loading="lazy"></img>
       <div class="image-grid-item-icon" v-else>
        <v-icon v-if="citem.icon" class="image-grid-item-img image-grid-item-icon">{{citem.icon}}</v-icon>
        <img v-else-if="citem.svg" class="image-grid-item-svg" :src="citem.svg | svgIcon(darkUi)" loading="lazy"></img>
        <img v-else class="image-grid-item-svg" :src="'image' | svgIcon(darkUi)" loading="lazy"></img>
       </div>
       <div v-if="citem.image && !(isTop && (citem.icon || citem.svg))" class="image-grid-text" @click.stop="gridTitleClick(citem, undefined, $event)">{{citem.title}}</div>
       <div v-else class="image-grid-text">{{citem.title}}</div>
       <div class="image-grid-text subtext" v-html="citem.subtitle" v-bind:class="{'link-item':subtitlesClickable}" @click.stop="clickSubtitle(citem, undefined, $event)"></div>
       <div class="grid-btn image-grid-btn hover-btn menu-btn" v-if="(undefined!=citem.stdItem && citem.stdItem<=STD_ITEM_MAX) || (citem.menu && citem.menu.length>0)" role="button" @click.stop="itemMenu(citem, undefined, $event)" :aria-label="i18n('%1 (Menu)', stripLinkTags(citem.title))"></div>
       <div class="emblem" v-if="citem.emblem" :style="{background: citem.emblem.bgnd}">
        <img :src="citem.emblem | emblem()" loading="lazy"></img>
       </div>
       <div v-if="(undefined!=citem.stdItem && citem.stdItem<=STD_ITEM_MAX) || (citem.menu && citem.menu.length>0 && (citem.menu[0]==PLAY_ACTION || citem.menu[0]==PLAY_ALL_ACTION))" class="grid-btns">
        <img v-if="(!LMS_KIOSK_MODE || !HIDE_FOR_KIOSK.has(ADD_ACTION)) && allowAdd(citem)" class="other-btn grid-btn" @click.stop="itemAction(ADD_ACTION, citem, undefined, $event)" :title="ACTIONS[ADD_ACTION].title" :src="'hover-add' | svgIcon(darkUi, true)"></img>
        <img v-if="!queryParams.party && (!LMS_KIOSK_MODE || !HIDE_FOR_KIOSK.has(INSERT_ACTION)) && allowInsert(citem)" class="other-btn grid-btn" @click.stop="itemAction(INSERT_ACTION, citem, undefined, $event)" :title="ACTIONS[INSERT_ACTION].title" :src="'hover-playnext' | svgIcon(darkUi, true)"></img>
        <img v-if="allowShuffle(citem)" class="other-btn grid-btn" @click.stop="itemAction(PLAY_SHUFFLE_ACTION, citem, undefined, $event)" :title="ACTIONS[PLAY_SHUFFLE_ACTION].title" :src="'hover-shuffle' | svgIcon(darkUi, true)"></img>
        <img v-if="!queryParams.party && (!LMS_KIOSK_MODE || !HIDE_FOR_KIOSK.has(PLAY_ACTION))" class="main-btn grid-btn" @click.stop="itemAction(PLAY_ACTION, citem, undefined, $event)" :title="ACTIONS[PLAY_ACTION].title" :src="'hover-play' | svgIcon(darkUi, true)"></img>
       </div>
       <div v-if="citem.image" class="grid-btns grid-btn-left"><img class="other-btn grid-btn" @click.stop="itemAction(SHOW_IMAGE_ACTION, citem, undefined, $event)" :title="ACTIONS[SHOW_IMAGE_ACTION].title" :src="'hover-expand' | svgIcon(darkUi, true)"></img>
       </div>
      </div>
     </div>

    </v-list-tile>
    <v-list-tile v-else-if="item.header" class="lms-list-item" v-bind:class="{'browse-header':item.header,'browse-kb-select': browseKbSelected(item), 'search-highlight':browseKbSelected(item)}" @click="click(item, undefined!=item.gidx ? item.gidx : index, $event)" @contextmenu.prevent="contextMenu(item, undefined!=item.gidx ? item.gidx : index, $event)">
     <v-list-tile-avatar v-if="item.icon" :tile="true" class="lms-avatar">
      <v-icon>{{item.icon}}</v-icon>
     </v-list-tile-avatar>
     <v-list-tile-avatar v-else-if="item.svg" :tile="true" class="lms-avatar">
      <img :class="['hdr-'+hRgb, 'svg-list-img']" :src="item.svg | svgIcon(darkUi, undefined, true)" loading="lazy" @dragstart.prevent="" @dragenter.prevent=""></img>
     </v-list-tile-avatar>
     <v-list-tile-content>
      <v-list-tile-title v-if="item.titleLinks" v-html="item.titleLinks"></v-list-tile-title>
      <v-list-tile-title v-else>{{item.title}}</v-list-tile-title>
      <v-list-tile-sub-title v-if="item.subtitle && !item.hidesub">{{item.subtitle}}</v-list-tile-sub-title>
     </v-list-tile-content>
     <v-list-tile-action class="browse-action explore-view-toggle" v-if="isTop && isExploreHeaderItem(item) && undefined!=exploreViewAct">
      <v-btn flat icon class="toolbar-button" @click.stop="toggleHomeExploreView($event)" :title="ACTIONS[exploreViewAct].title">
       <img v-if="ACTIONS[exploreViewAct].svg" class="svg-img" :src="ACTIONS[exploreViewAct].svg | svgIcon(darkUi, 'chrome', chromeSvgCol)"></img>
       <v-icon v-else>{{ACTIONS[exploreViewAct].icon}}</v-icon>
      </v-btn>
     </v-list-tile-action>
     <v-list-tile-action v-if="undefined!=item.durationStr" class="browse-time">{{item.durationStr}}</v-list-tile-action>
     <v-list-tile-action class="browse-action browse-more" v-if="undefined!=item.morecmd || undefined!=item.allItems || (item.slimbrowse && item.header && item.actions)">
      <div class="link-item" role="button" :aria-label="i18n('%1 (More)', stripLinkTags(item.title))" @click.stop="showMore(item)">{{i18n('More')}}</div>
     </v-list-tile-action>
     <v-list-tile-action class="browse-action" v-else-if="(undefined!=item.stdItem && item.stdItem<=STD_ITEM_MAX) || (item.menu && item.menu.length>0)">
      <div class="grid-btn list-btn hover-btn menu-btn" @click.stop="itemMenu(item, undefined!=item.gidx ? item.gidx : index, $event)" role="button" :aria-label="i18n('%1 (Menu)', stripLinkTags(item.title))"></div>
     </v-list-tile-action>
     <div v-if="hoverBtns && 0==selection.size && ((undefined!=item.stdItem && item.stdItem<=STD_ITEM_MAX) || (item.menu && (item.menu[0]==PLAY_ACTION || item.menu[0]==PLAY_ALL_ACTION)))" class="list-btns" v-bind:class="{'list-btns-track':item.durationStr,'hover-more':undefined!=item.morecmd||undefined!=item.allItems||(item.slimbrowse && item.header && item.actions)}">
      <img v-if="(!LMS_KIOSK_MODE || !HIDE_FOR_KIOSK.has(ADD_ACTION)) && allowAdd(item)" class="other-btn grid-btn" @click.stop="itemAction(ADD_ALL_ACTION, item, undefined!=item.gidx ? item.gidx : index, $event)" :title="ACTIONS[ADD_ACTION].title" :src="'hover-add' | svgIcon(darkUi, false)"></img>
      <img v-if="!queryParams.party && (!LMS_KIOSK_MODE || !HIDE_FOR_KIOSK.has(INSERT_ACTION)) && allowInsert(item)" class="other-btn grid-btn" @click.stop="itemAction(INSERT_ALL_ACTION, item, undefined!=item.gidx ? item.gidx : index, $event)" :title="ACTIONS[INSERT_ACTION].title" :src="'hover-playnext' | svgIcon(darkUi, false)"></img>
      <img v-if="allowShuffle(item)" class="other-btn grid-btn" @click.stop="itemAction(PLAY_SHUFFLE_ALL_ACTION, item, undefined!=item.gidx ? item.gidx : index, $event)" :title="ACTIONS[PLAY_SHUFFLE_ACTION].title" :src="'hover-shuffle' | svgIcon(darkUi, false)"></img>
      <img v-if="!queryParams.party && (!LMS_KIOSK_MODE || !HIDE_FOR_KIOSK.has(PLAY_ACTION))" class="main-btn grid-btn" @click.stop="itemAction(PLAY_ALL_ACTION, item, undefined!=item.gidx ? item.gidx : index, $event)" :title="ACTIONS[PLAY_ACTION].title" :src="'hover-play' | svgIcon(darkUi, false)"></img>
     </div>
    </v-list-tile>
    <v-list-tile v-else-if="item.type=='search' || item.type=='entry' || undefined!=item.input" avatar :key="item.id" class="lms-avatar lms-list-item browse-inline-search" :id="'item'+(undefined!=item.gidx ? item.gidx : index)" v-bind:class="{'list-active': (menu.show && (undefined!=item.gidx ? item.gidx : index)==menu.index) || (fetchingItem==item.id)}">
     <v-list-tile-content>
      <!-- Prefer list/grid keyboard selection when other entries exist (e.g. Radio); Tab focuses search -->
      <text-field :focus="!IS_MOBILE && index==0 && !browsePreferListNavOverSearch()" :title="item.title" :type="item.type" @value="entry(item, $event)"></text-field>
     </v-list-tile-content>
    </v-list-tile>
    <div v-else-if="!(isTop && (disabled.has(item.id) || hidden.has(item.id) || (item.id==TOP_RADIO_ID && lmsOptions.combineAppsAndRadio)) || (queryParams.party && HIDE_TOP_FOR_PARTY.has(item.id)))" :key="item.id"
     v-bind:class="[listSwipeRowClass(item, undefined!=item.gidx ? item.gidx : index, 'browse'), {'browse-kb-select': browseKbSelected(item), 'browse-home-list-row': isTop && !grid.use}]"
     :data-msk-index="undefined!=item.gidx ? item.gidx : index"
     @touchstart="listSwipeStart(item, undefined!=item.gidx ? item.gidx : index, 'browse', $event)"
     @touchmove="listSwipeMove($event)"
     @touchend="listSwipeEnd($event)"
     @touchcancel="listSwipeEnd($event)"
     @pointerdown="listSwipeStart(item, undefined!=item.gidx ? item.gidx : index, 'browse', $event)"
     @pointermove="listSwipeMove($event)"
     @pointerup="listSwipeEnd($event)"
     @pointercancel="listSwipeEnd($event)"
     @wheel.passive="listSwipeWheel(item, undefined!=item.gidx ? item.gidx : index, 'browse', $event)">
     <div class="list-swipe-bg list-swipe-bg-add" aria-hidden="true">
      <v-icon>playlist_add</v-icon>
      <span class="list-swipe-label">{{ACTIONS[ADD_ACTION].short || ACTIONS[ADD_ACTION].title}}</span>
     </div>
     <div class="list-swipe-bg list-swipe-bg-next" aria-hidden="true">
      <v-icon>playlist_play</v-icon>
      <span class="list-swipe-label">{{ACTIONS[INSERT_ACTION].short || ACTIONS[INSERT_ACTION].title}}</span>
     </div>
     <v-list-tile avatar @click="click(item, undefined!=item.gidx ? item.gidx : index, $event)" class="lms-avatar lms-list-item list-swipe-tile" :style="listSwipeStyle(item, undefined!=item.gidx ? item.gidx : index, 'browse')" :id="'item'+(undefined!=item.gidx ? item.gidx : index)" @dragstart="dragStart(undefined!=item.gidx ? item.gidx : index, $event)" @dragenter.prevent="" @dragend="dragEnd()" @dragover="dragOver(undefined!=item.gidx ? item.gidx : index, $event)" @drop="drop(undefined!=item.gidx ? item.gidx : index, $event)" :draggable="desktopLayout && ((isTop && grid.use) || (!isTop && item.draggable && (current.section!=SECTION_FAVORITES || 0==selection.size)))" @contextmenu.prevent="contextMenu(item, undefined!=item.gidx ? item.gidx : index, $event)" v-bind:class="{'drop-target': dragActive && (undefined!=item.gidx ? item.gidx : index)==dropIndex, 'browse-kb-select': browseKbSelected(item), 'search-highlight':browseKbSelected(item), 'highlight':item.highlight && !item.kbSelect, 'list-active': (menu.show && (undefined!=item.gidx ? item.gidx : index)==menu.index) || (fetchingItem==item.id)}">
      <v-list-tile-avatar v-if="item.selected" :tile="true" class="lms-avatar">
       <v-icon>check_box</v-icon>
      </v-list-tile-avatar>
      <v-list-tile-avatar v-else-if="item.images" :tile="true" class="mi lms-avatar" :class="'mi'+item.images.length">
       <img v-for="(mic, midx) in item.images" :class="'mi-'+midx" :key="mic" :src="mic" loading="lazy"></img>
      </v-list-tile-avatar>
      <!-- Home: prefer mono icon/svg over brand image (Spotify pins) — theme mono, not sidebar chrome -->
      <v-list-tile-avatar v-else-if="isTop && item.icon" :tile="true" class="lms-avatar">
       <v-icon>{{item.icon}}</v-icon>
      </v-list-tile-avatar>
      <v-list-tile-avatar v-else-if="isTop && item.svg" :tile="true" class="lms-avatar">
       <img class="svg-list-img" :src="item.svg | svgIcon(darkUi)" @dragstart.prevent="" @dragenter.prevent=""></img>
      </v-list-tile-avatar>
      <v-list-tile-avatar v-else-if="item.image" :tile="true" class="lms-avatar" v-bind:class="{'radio-image': SECTION_RADIO==item.section || SECTION_APPS==item.section || item.isRadio}">
       <img :key="item.image" v-lazy="item.image" class="allow-drag" v-bind:class="{'circular':item.stdItem==STD_ITEM_ARTIST || item.stdItem==STD_ITEM_ONLINE_ARTIST || item.stdItem==STD_ITEM_WORK_COMPOSER}" onerror="this.src=DEFAULT_COVER"></img>
      </v-list-tile-avatar>
      <v-list-tile-avatar v-else-if="item.icon" :tile="true" class="lms-avatar">
       <v-icon>{{item.icon}}</v-icon>
      </v-list-tile-avatar>
      <v-list-tile-avatar v-else-if="item.svg" :tile="true" class="lms-avatar">
       <img class="svg-list-img" :src="item.svg | svgIcon(darkUi)" @dragstart.prevent="" @dragenter.prevent=""></img>
      </v-list-tile-avatar>
      <v-list-tile-avatar v-else-if="selection.size>0 && browseCanSelect(item)" :tile="true" class="lms-avatar">
       <v-icon>check_box_outline_blank</v-icon>
      </v-list-tile-avatar>

      <v-list-tile-avatar v-else-if="undefined!=item.tracknum" class="tnum">{{item.tracknum}}</v-list-tile-avatar>

      <div v-if="itemPreviewLive(item)" class="list-preview-live" role="button"
           :class="{'msk-ctx-preview-active': previewUi.active, 'msk-ctx-preview-loading': previewUi.loading, 'preview-live-fading': previewUi.fading}"
           @click.stop="itemAction(PREVIEW_ACTION, item, undefined!=item.gidx ? item.gidx : index, $event)"
           :title="i18n('Stop preview')" :aria-label="i18n('Stop preview')">
       <svg class="msk-preview-live-svg" viewBox="0 0 36 36" aria-hidden="true">
        <circle class="msk-ctx-preview-ring-bg" cx="18" cy="18" r="15"></circle>
        <circle class="msk-ctx-preview-ring" cx="18" cy="18" r="15" :style="previewRingStyle"></circle>
        <g class="msk-ctx-preview-pause">
         <rect x="12.4" y="11" width="3.6" height="14" rx="1"></rect>
         <rect x="20" y="11" width="3.6" height="14" rx="1"></rect>
        </g>
       </svg>
      </div>

      <img v-if="!item.selected && undefined!=item.tracknum && item.id==currentTrack" class="browse-current-indicator" :src="'pq-current' | indIcon"></img>
      <img v-else-if="!item.selected && undefined!=item.playlist_track_id && item.playlist_track_id==currentTrack" class="browse-current-indicator-playlist" :src="'pq-current' | indIcon"></img>

      <v-list-tile-content>
       <v-list-tile-title v-html="item.title" v-if="undefined!=item.stdItem && (item.stdItem==STD_ITEM_TRACK || item.stdItem==STD_ITEM_ALBUM_TRACK || item.stdItem==STD_ITEM_PLAYLIST_TRACK || item.stdItem==STD_ITEM_REMOTE_PLAYLIST_TRACK)" v-bind:class="{'browse-no-sub':!item.subtitle}"></v-list-tile-title>
       <v-list-tile-title v-else>{{item.title}}<b class="vlib-name" v-if="isTop && item.libname" v-bind:class="{'browse-no-sub':!item.subtitle}">{{SEPARATOR+item.libname}}</b></v-list-tile-title>
       <v-list-tile-sub-title v-if="wide>WIDE_NONE && item.subtitleContext" v-html="item.subtitleContext"></v-list-tile-sub-title>
       <v-list-tile-sub-title v-else v-html="item.subtitleLinks ? item.subtitleLinks : item.subtitle"></v-list-tile-sub-title>
      </v-list-tile-content>

      <v-list-tile-action v-if="undefined!=item.durationStr" class="browse-time">{{item.durationStr}}</v-list-tile-action>
      <v-list-tile-action class="browse-action" v-if="(undefined!=item.stdItem && item.stdItem<=STD_ITEM_MAX) || (item.menu && item.menu.length>0 && (!item.isPinned || (!queryParams.party && (!LMS_KIOSK_MODE || !HIDE_FOR_KIOSK.has(PIN_ACTION)))))">
       <div class="grid-btn list-btn hover-btn menu-btn" @click.stop="itemMenu(item, undefined!=item.gidx ? item.gidx : index, $event)" role="button" :aria-label="i18n('%1 (Menu)', stripLinkTags(item.title))"></div>
      </v-list-tile-action>
      <div v-if="hoverBtns && 0==selection.size && ((undefined!=item.stdItem && item.stdItem<=STD_ITEM_MAX) || (item.menu && (item.menu[0]==PLAY_ACTION || item.menu[0]==PLAY_ALL_ACTION)))" class="list-btns" v-bind:class="{'list-btns-track':item.durationStr,'list-btns-preview':itemPreviewLive(item),'hover-more':undefined!=item.morecmd||undefined!=item.allItems||(item.slimbrowse && item.header && item.actions)}">
       <img v-if="(!LMS_KIOSK_MODE || !HIDE_FOR_KIOSK.has(ADD_ACTION)) && allowAdd(item)" class="other-btn grid-btn" @click.stop="itemAction(ADD_ACTION, item, undefined!=item.gidx ? item.gidx : index, $event)" :title="ACTIONS[ADD_ACTION].title" :src="'hover-add' | svgIcon(darkUi, false)"></img>
       <img v-if="!queryParams.party && (!LMS_KIOSK_MODE || !HIDE_FOR_KIOSK.has(INSERT_ACTION)) && allowInsert(item)" class="other-btn grid-btn" @click.stop="itemAction(INSERT_ACTION, item, undefined!=item.gidx ? item.gidx : index, $event)" :title="ACTIONS[INSERT_ACTION].title" :src="'hover-playnext' | svgIcon(darkUi, false)"></img>
       <img v-if="allowShuffle(item)" class="other-btn grid-btn" @click.stop="itemAction(PLAY_SHUFFLE_ACTION, item, undefined!=item.gidx ? item.gidx : index, $event)" :title="ACTIONS[PLAY_SHUFFLE_ACTION].title" :src="'hover-shuffle' | svgIcon(darkUi, false)"></img>
       <img v-if="!queryParams.party" class="main-btn grid-btn" @click.stop="itemAction(PLAY_ACTION, item, undefined!=item.gidx ? item.gidx : index, $event)" :title="ACTIONS[PLAY_ACTION].title" :src="'hover-play' | svgIcon(darkUi, false)"></img>
      </div>
      <div class="emblem" v-if="item.emblem" :style="{background: item.emblem.bgnd}">
       <img :src="item.emblem | emblem()" loading="lazy"></img>
      </div>
     </v-list-tile>
    </div>
   </template>
   <div class="scroll-block-bottom-pad" v-if="!desktopLayout"></div>
   <div class="browse-list-scroll-pad" v-if="!desktopLayout"></div>
   <div style="height:68px; background:transparent" v-else-if="browseSearchFloating"></div>
   <div style="height:20px; background:transparent" v-else></div>
  </div>
  <div class="browse-search-btn" id="browse-search-btn" v-if="browseSearchFloating && searchActive==0 && desktopLayout" role="button" :title="SEARCH_LIB_ACTION | tooltip(keyboardControl)" @click="itemAction(SEARCH_LIB_ACTION, undefined, undefined, $event)"><img class="svg-img" :src="ACTIONS[SEARCH_LIB_ACTION].svg | svgIcon(!darkSearchIcon)"></img></div>
 </div>
 </div><!-- browse-main-pane -->

 <div v-if="menu.show && !desktopLayout" class="msk-context-scrim" @click="ctxSheetClose()" @touchend="ctxSheetScrimTouchEnd($event)" @touchmove.prevent=""></div>
 <v-menu v-model="menu.show" :position-x="menu.x" :position-y="menu.y" :content-class="!desktopLayout ? 'msk-context-sheet' : undefined" absolute :close-on-content-click="desktopLayout" :close-on-click="desktopLayout">
  <!-- Mobile sheet chrome: drag handle + sticky item header (does not scroll with actions) -->
  <div class="msk-ctx-chrome" v-if="!desktopLayout"
       @touchstart.passive="ctxSheetTouchStart"
       @pointerdown="ctxSheetTouchStart"
       @mousedown="ctxSheetTouchStart">
   <div class="msk-ctx-handle" aria-hidden="true"></div>
   <div class="msk-ctx-header" v-if="menu.item && !(menu.info && menu.info.open)">
    <div class="msk-ctx-art">
     <img v-if="menuItemMeta.image" class="msk-ctx-cover" :src="menuItemMeta.image" onerror="this.src='/material/html/images/nocover.png'"></img>
     <img v-else-if="menuItemMeta.svg" class="svg-img" :src="menuItemMeta.svg | svgIcon(darkUi)"></img>
     <v-icon v-else-if="menuItemMeta.icon">{{menuItemMeta.icon}}</v-icon>
     <v-icon v-else>music_note</v-icon>
    </div>
    <div class="msk-ctx-meta">
     <div class="msk-ctx-title">{{menuItemMeta.title}}</div>
     <div class="msk-ctx-sub" v-for="(line, li) in menuItemMeta.lines" :key="'ctxl'+li">{{line}}</div>
    </div>
    <button v-if="ctxPreviewAvailable" type="button" class="msk-ctx-preview"
            :class="{'msk-ctx-preview-active': previewUi.active, 'msk-ctx-preview-loading': previewUi.loading, 'preview-live-fading': previewUi.fading}"
            @click.stop.prevent="ctxPreviewToggle($event)"
            @touchstart.stop.prevent="ctxPreviewToggle($event)"
            @pointerdown.stop
            @mousedown.stop
            :aria-label="previewUi.active ? i18n('Stop preview') : (ACTIONS[PREVIEW_ACTION].title || i18n('Preview'))"
            :title="previewUi.active ? i18n('Stop preview') : (ACTIONS[PREVIEW_ACTION].title || i18n('Preview'))">
     <v-icon v-if="!previewUi.active && !previewUi.loading" class="msk-ctx-preview-idle">{{ACTIONS[PREVIEW_ACTION].icon || 'hearing'}}</v-icon>
     <svg v-else class="msk-ctx-preview-svg" viewBox="0 0 36 36" aria-hidden="true">
      <circle class="msk-ctx-preview-ring-bg" cx="18" cy="18" r="15"></circle>
      <circle class="msk-ctx-preview-ring" cx="18" cy="18" r="15" :style="previewRingStyle"></circle>
      <g class="msk-ctx-preview-pause">
       <rect x="13" y="12" width="3.2" height="12" rx="1"></rect>
       <rect x="19.8" y="12" width="3.2" height="12" rx="1"></rect>
      </g>
     </svg>
    </button>
   </div>
  </div>
  <div v-bind:class="{'msk-ctx-panels': !desktopLayout, 'msk-ctx-panels-info': !desktopLayout && menu.info && menu.info.open}">
  <div v-bind:class="{'msk-ctx-panel': !desktopLayout, 'msk-ctx-body': !desktopLayout}"
       @scroll.passive="ctxSheetOnBodyScroll"
       @touchstart.passive="ctxSheetBodyTouchStart"
       @touchmove="ctxSheetBodyTouchMove"
       @touchend="ctxSheetBodyTouchEnd"
       @touchcancel="ctxSheetBodyTouchEnd">
  <v-list v-if="menu.item && menu.item.moremenu">
   <template v-for="(entry, index) in menu.item.moremenu">
    <v-list-tile role="menuitem" @click="itemMoreAction(menu.item, index)">
     <v-list-tile-title>{{entry.title}}</v-list-tile-title>
    </v-list-tile>
   </template>
  </v-list>
  <v-list v-else-if="menu.item && menu.cstatsActions">
   <template v-for="(entry, index) in menu.cstatsActions">
    <v-divider v-if="entry.divider" :key="'cstats-div-'+index"></v-divider>
    <v-list-tile v-else role="menuitem" :key="'cstats-act-'+index" @click="cstatsMenuAction(entry)">
     <v-list-tile-avatar>
      <v-icon v-if="undefined==entry.svg">{{entry.icon}}</v-icon>
      <img v-else class="svg-img" :src="entry.svg | svgIcon(darkUi)"></img>
     </v-list-tile-avatar>
     <v-list-tile-title>{{entry.title}}</v-list-tile-title>
    </v-list-tile>
   </template>
  </v-list>
  <v-list v-else-if="menu.item && menu.homePlayerMenu">
   <template v-for="(entry, index) in menu.homePlayerMenu">
    <v-divider v-if="entry.divider" :key="'hpm-div-'+index"></v-divider>
    <v-list-tile v-else role="menuitem" :key="'hpm-'+index" @click="homePlayerMenuAction(entry, $event)">
     <v-list-tile-avatar>
      <v-icon v-if="undefined==entry.svg" v-bind:class="{'dimmed': entry.dimmed}">{{entry.icon}}</v-icon>
      <img v-else class="svg-img" :src="entry.svg | svgIcon(darkUi)"></img>
     </v-list-tile-avatar>
     <v-list-tile-content><v-list-tile-title>{{entry.title}}</v-list-tile-title></v-list-tile-content>
     <v-list-tile-action v-if="entry.check"><v-icon class="menu-checked">check</v-icon></v-list-tile-action>
    </v-list-tile>
   </template>
  </v-list>
  <v-list v-else-if="menu.item">
   <template v-for="(action, index) in menu.itemMenu">
    <div style="height:0px!important" v-if="(queryParams.party && HIDE_FOR_PARTY.has(action)) || (isTop && action==SELECT_ACTION) || (LMS_KIOSK_MODE && HIDE_FOR_KIOSK.has(action)) || ((PLAY_SHUFFLE_ACTION==action || PLAY_SHUFFLE_ALL_ACTION==action) && !allowShuffle(menu.item)) || (SELECT_ACTION==action && searchActive) || (action==PREVIEW_ACTION && !desktopLayout)"></div>
    <v-divider v-else-if="DIVIDER==action"></v-divider>
    <template v-for="(cact, cindex) in itemCustomActions" v-else-if="CUSTOM_ACTIONS==action">
     <v-list-tile role="menuitem" @click="itemCustomAction(cact, menu.item, menu.index)">
      <v-list-tile-avatar>
       <v-icon v-if="undefined==cact.svg">{{cact.icon}}</v-icon>
       <img v-else class="svg-img" :src="cact.svg | svgIcon(darkUi)"></img>
      </v-list-tile-avatar>
      <v-list-tile-title>{{cact.title}}</v-list-tile-title>
     </v-list-tile>
    </template>
    <v-list-tile role="menuitem" v-else-if="action==ADD_TO_FAV_ACTION && isInFavorites(menu.item)" @click="menuItemAction(REMOVE_FROM_FAV_ACTION, menu.item, menu.index, $event)">
     <v-list-tile-avatar>
      <v-icon v-if="undefined==ACTIONS[REMOVE_FROM_FAV_ACTION].svg">{{ACTIONS[REMOVE_FROM_FAV_ACTION].icon}}</v-icon>
      <img v-else class="svg-img" :src="ACTIONS[REMOVE_FROM_FAV_ACTION].svg | svgIcon(darkUi)"></img>
     </v-list-tile-avatar>
     <v-list-tile-title>{{ACTIONS[REMOVE_FROM_FAV_ACTION].title}}</v-list-tile-title>
    </v-list-tile>
    <v-list-tile role="menuitem" v-else-if="action==SELECT_ACTION && menu.item.selected" @click="menuItemAction(UNSELECT_ACTION, menu.item, menu.index, $event)">
     <v-list-tile-avatar>
      <v-icon>{{ACTIONS[UNSELECT_ACTION].icon}}</v-icon>
     </v-list-tile-avatar>
     <v-list-tile-title>{{ACTIONS[UNSELECT_ACTION].title}}</v-list-tile-title>
    </v-list-tile>
    <v-list-tile role="menuitem" v-else-if="action==ARTIST_INFO_ACTION ? (LMS_P_MAI && menu.item && (menu.item.artist_id || menu.item.artist || menu.item.albumartist || (menu.item.id && (''+menu.item.id).startsWith('artist_id:')) || (current && current.id && (''+current.id).startsWith('artist_id:')))) : action==ALBUM_INFO_ACTION ? (LMS_P_MAI && menu.item && (menu.item.album_id || menu.item.album || menu.item.origTitle || (menu.item.id && (''+menu.item.id).startsWith('album_id:')) || (current && current.id && (''+current.id).startsWith('album_id:')))) : action==BR_COPY_ACTION ? queueSelection : action==MOVE_HERE_ACTION ? (selection.size>0 && !menu.item.selected) : action==DOWNLOAD_ACTION ? lmsOptions.allowDownload && undefined==menu.item.emblem : action==PLAY_DISC_ACTION ? undefined!=menu.item.disc : (action!=RATING_ACTION || showRating)" @click="menuItemAction(action, menu.item, menu.index, $event)">
     <v-list-tile-avatar>
      <v-icon v-if="undefined==ACTIONS[action].svg">{{ACTIONS[action].icon}}</v-icon>
      <img v-else class="svg-img" :src="ACTIONS[action].svg | svgIcon(darkUi)"></img>
     </v-list-tile-avatar>
     <v-list-tile-title>{{ACTIONS[action].title}}</v-list-tile-title>
     <v-list-tile-action v-if="action==ARTIST_INFO_ACTION || action==ALBUM_INFO_ACTION" class="menu-subind"><v-icon>chevron_right</v-icon></v-list-tile-action>
    </v-list-tile>
    <v-list-tile role="menuitem" v-if="action==COPY_DETAILS_ACTION && undefined!=menu.item.image && (index==menu.itemMenu.length-1 || menu.itemMenu[index+1]!=SHOW_IMAGE_ACTION)" @click="menuItemAction(SHOW_IMAGE_ACTION, menu.item, menu.index, $event)">
     <v-list-tile-avatar>
      <img class="svg-img" :src="ACTIONS[SHOW_IMAGE_ACTION].svg | svgIcon(darkUi)"></img>
     </v-list-tile-avatar>
     <v-list-tile-title>{{ACTIONS[SHOW_IMAGE_ACTION].title}}</v-list-tile-title>
    </v-list-tile>
   </template>
  </v-list>
  <v-list v-else-if="menu.history">
   <template v-for="(item, index) in menu.history">
    <v-list-tile role="menuitem" @click="goTo(index)">
     <v-list-tile-avatar>
      <v-icon v-if="undefined!=item.icon">{{item.icon}}</v-icon>
      <img v-else-if="undefined!=item.svg" class="svg-img" :src="item.svg | svgIcon(darkUi)"></img>
      <img v-else-if="undefined!=item.image" class="svg-img menu-image" :src="item.image"></img>
     </v-list-tile-avatar>
     <v-list-tile-content><v-list-tile-title>{{item.title}}</v-list-tile-title></v-list-tile-content>
    </v-list-tile>
   </template>
  </v-list>
  <v-list v-else-if="menu.items">
   <template v-for="(item, index) in menu.items">
    <v-list-tile role="menuitem" @click="menuItemAction(item, undefined, undefined, $event)" v-if="undefined==item.title">
     <v-list-tile-avatar :tile="true" class="lms-avatar"><v-icon v-if="ACTIONS[item].icon">{{ACTIONS[item].icon}}</v-icon><img v-else-if="ACTIONS[item].svg" class="svg-img" :src="ACTIONS[item].svg | svgIcon(darkUi)"></img></v-list-tile-avatar>
     <v-list-tile-title>{{ACTIONS[item].title}}</v-list-tile-title>
    </v-list-tile>
   </template>
  </v-list>
  <v-list v-else-if="menu.currentActions">
   <template v-for="(item, index) in menu.currentActions">
    <v-divider v-if="DIVIDER==item.action"></v-divider>
    <v-subheader v-else-if="HEADER==item.action">{{item.title}}</v-subheader>
    <div v-else-if="GROUP==item.action">
     <v-list-group v-model="item.expanded" @click.stop="">
      <template v-slot:activator><v-list-tile><v-list-tile-content><v-list-tile-title>{{item.title}}</v-list-tile-title></v-list-tile-content><v-list-tile></template>
      <v-list-tile role="menuitem" v-for="(subItem, subIndex) in item.actions" @click="currentAction(subItem, index+subIndex, $event)">
       <v-list-tile-avatar>
        <v-icon v-if="undefined==subItem.svg">{{subItem.icon}}</v-icon>
        <img v-else class="svg-img" :src="subItem.svg | svgIcon(darkUi)"></img>
       </v-list-tile-avatar>
       <v-list-tile-content><v-list-tile-title>{{subItem.title}}</v-list-tile-title></v-list-tile-content>
      </v-list-tile>
     </v-list-group>
     <v-divider></v-divider>
    </div>
    <div v-else-if="GOTO_ARTIST_ACTION==item.action && history.length>1 && history[history.length-1].current.stdItem==STD_ITEM_ARTIST"></div>
    <v-list-tile role="menuitem" v-else-if="!item.isListItemInMenu && item.action==ADD_TO_FAV_ACTION && isInFavorites(current)" @click="menuItemAction(REMOVE_FROM_FAV_ACTION, current, undefined, $event)">
     <v-list-tile-avatar>
      <v-icon v-if="undefined==ACTIONS[REMOVE_FROM_FAV_ACTION].svg">{{ACTIONS[REMOVE_FROM_FAV_ACTION].icon}}</v-icon>
      <img v-else class="svg-img" :src="ACTIONS[REMOVE_FROM_FAV_ACTION].svg | svgIcon(darkUi)"></img>
     </v-list-tile-avatar>
     <v-list-tile-title>{{ACTIONS[REMOVE_FROM_FAV_ACTION].title}}</v-list-tile-title>
    </v-list-tile>
    <v-list-tile role="menuitem" v-else-if="!item.isListItemInMenu && undefined!=item.action" @click="menuItemAction(item.action, current, undefined, $event)">
     <v-list-tile-avatar>
      <v-icon v-if="undefined==ACTIONS[item.action].svg">{{ACTIONS[item.action].icon}}</v-icon>
      <img v-else class="svg-img" :src="ACTIONS[item.action].svg | svgIcon(darkUi)"></img>
     </v-list-tile-avatar>
     <v-list-tile-content><v-list-tile-title>{{item.title || ACTIONS[item.action].title}}</v-list-tile-title></v-list-tile-content>
    </v-list-tile>
    <v-list-tile role="menuitem" v-else-if="item.isListItemInMenu && 'itemNoAction'==item.style" class="nonclick-menu-item">
     <v-list-tile-avatar>
      <v-icon v-if="undefined==item.svg">{{item.icon}}</v-icon>
      <img v-else class="svg-img" :src="item.svg | svgIcon(darkUi)"></img>
     </v-list-tile-avatar>
     <v-list-tile-content><v-list-tile-title>{{item.title}}</v-list-tile-title></v-list-tile-content>
    </v-list-tile>
    <v-list-tile role="menuitem" v-else @click="currentAction(item, index, $event)">
     <v-list-tile-avatar>
      <v-icon v-if="undefined==item.svg">{{item.icon}}</v-icon>
      <img v-else class="svg-img" :src="item.svg | svgIcon(darkUi)"></img>
     </v-list-tile-avatar>
     <v-list-tile-content><v-list-tile-title>{{item.title}}</v-list-tile-title></v-list-tile-content>
    </v-list-tile>
   </template>
  </v-list>
  <v-list v-else-if="menu.linkItems">
   <template v-for="(item, index) in menu.linkItems">
    <v-list-tile role="menuitem" @click="linkAction(item)">
     <v-list-tile-avatar>
      <v-icon v-if="undefined==item.svg">{{item.icon}}</v-icon>
      <img v-else class="svg-img" :src="item.svg | svgIcon(darkUi)"></img>
     </v-list-tile-avatar>
     <v-list-tile-content><v-list-tile-title>{{item.title}}</v-list-tile-title></v-list-tile-content>
    </v-list-tile>
   </template>
  </v-list>
  </div><!-- msk-ctx-panel actions -->
  <!-- Info panel (artist / album) — slides in from the right -->
  <div v-if="!desktopLayout" class="msk-ctx-panel msk-ctx-panel-info">
   <div class="msk-ctx-info-bar">
    <v-btn icon flat small @click.stop="ctxSheetInfoBack" :title="i18n('Back')"><v-icon>{{BACK_ICON}}</v-icon></v-btn>
    <div class="msk-ctx-info-title">{{menu.info && menu.info.title ? menu.info.title : ''}}</div>
   </div>
   <div v-if="menu.info && menu.info.loading" class="msk-ctx-info-loading"><v-progress-circular indeterminate size="36" width="3"></v-progress-circular></div>
   <div v-else class="msk-ctx-info-body" v-bind:class="{'msk-ctx-info-error': menu.info && menu.info.error}" v-html="menu.info && menu.info.html ? menu.info.html : ''"></div>
  </div>
  </div><!-- msk-ctx-panels -->
 </v-menu>
</div>
      `,
    data() {
        return {
            current: {image: undefined},
            currentActions: [],
            currentItemImage: undefined, // image set in broweResp - currently only for album track lists
            currentBgndUrl: "",
            showBgnd: true,
            headerTitle: undefined,
            headerSubTitle: undefined,
            detailedSubInfo: undefined,
            detailedSubExtra: undefined,
            items: [],
            topExtra: [],
            topExtraCfg: {items: [], needsPlayer:false},
            contextStatsHome: {items: [], pages: [], loading: !!(typeof lmsOptions!=='undefined' && lmsOptions.contextStatsHome), morphing: false, cols: 2, pageSize: 4, swiperKey: 0, isPlugin: false, dismissed: {}, modHeld: false, lastPlayerId: ''},
            homeGreetingHour: (new Date()).getHours(),
            homeI18nTick: 0,
            homePrefsInput: false,
            homePrefsPresets: false,
            homePrefsDsp: false,
            homeExtraArriving: false,
            grid: {allowed:true, use:getLocalStorageBool('grid', true), numItems:0, numColumns:0, ih:GRID_MIN_HEIGHT, rows:[], few:false, haveSubtitle:true, multiSize:false, type:GRID_STANDARD},
            /* Opt-in Fusion browser for My Music (Artists | Albums | Songs) */
            fusionMode: getLocalStorageBool('browseFusion', false),
            exploreUseGrid: getLocalStorageBool('homeExploreGrid', false),
            fetchingItem:undefined,
            browseInitialLoading:true,
            // Desktop only: hover play/shuffle overlays on artwork. Mobile uses context menu.
            hoverBtns: !IS_MOBILE,
            trans: { ok:undefined, cancel: undefined, close: undefined, selectMultiple:undefined, addsel:undefined, playsel:undefined,shufflesel:undefined,
                     deletesel:undefined, removeall:undefined, invertSelect:undefined, choosepos:undefined, goHome:undefined, goBack:undefined,
                     select:undefined, unselect:undefined, sources: undefined, desc: undefined, actions:undefined },
            menu: { show:false, item: undefined, x:0, y:0, index:-1},
            isTop: true,
            HOME_PANE_HOME_ID: HOME_PANE_HOME_ID,
            homePaneSelectedId: undefined,
            /* Desktop split: keyboard focus zone + sidebar highlight index */
            browseFocusZone: 'main', // 'sidebar' | 'main'
            homePaneKbPos: -1,
            /* Keyboard navigation mode (arrow/tab selection highlight) */
            browseKbNavActive: false,
            _browseKbNavTimer: undefined,
            homePaneSortable: undefined,
            homePaneSortBusy: false,
            homeListSortable: undefined,
            homeListSortBusy: false,
            homePaneSwipeOpenId: undefined,
            homePaneSwipe: undefined,
            homePaneSwipeSuppress: false,
            homePaneResizing: false,
            /* Reactive width so useHomeSplit / icon-only rail update on window resize */
            windowWidth: window.innerWidth || 0,
            /* True while viewport forced the rail into icons-only (not a user preference) */
            homePaneAutoIcons: false,
            libraryName: undefined, // Name of currently chosen library
            pinnedItemLibName: undefined, // Name of library from pinned item - if saved with pinned item
            selection: new Set(),
            selectionDuration: 0,
            section: undefined,
            letter: undefined,
            filteredJumplist: [],
            reserveJumplistGutter: false,
            tbarActions: [],
            itemCustomActions: [],
            subtitleClickable: false,
            disabled: new Set(),
            wide: WIDE_NONE,
            trackWide: TRACK_WIDE_ONE,
            searchActive: 0,
            browseSearching: false,
            dragActive: false,
            dropIndex: -1,
            highlightIndex: -1,
            highlightSubIndex: -1,
            hRgb: "000",
            tall: window.innerHeight>=MIN_HEIGHT_FOR_DETAILED_SUB ? 1 : 0,
            browseSubheaderHidden: false,
            browseSubheaderOffset: 0,
            browseOverflowOpen: false,
            browseOverflowPulling: false,
            browseOverflowPullPx: 0,
            browseAlphaSort: getLocalStorageBool('browseAlphaSort', false),
            browsePlaySwipeOpen: false,
            browsePlaySwiping: false,
            browsePlaySwipePx: 0,
            catalogPaletteActive: false,
            browsePullStart: undefined,
            lastBrowseScroll: 0,
            lastBrowseScroll: 0,
            currentTrack: undefined,
            nowPlayingExpanded: false,
            maiShown: false,
            listSwipe: null,
            listSwipeSuppress: false,
            listSwipeRemoving: null,
            listSwipeFlashKey: null,
            listSwipeFlashKind: null,
            browseZoom: 1,
            listFilterTerm: '',
            listFilterSelPos: -1,
            _gridFilterTerm: undefined,
            _listFilterTerm: undefined,
            jumplistTouchActive: false,
            jumplistActiveSlot: -1,
            /* Hex (no #) for chrome SVGs — reactive so icons recolor after cover morph / onload.
             * Full ink ≈ selected; muted ≈ normal sidebar Material icons (not “selected” loud). */
            chromeSvgCol: '',
            chromeSvgColMuted: '',
            /* Sidebar (home split + pins): secondary extracted palette, not primary accent */
            sidebarSvgCol: '',
            sidebarSvgColMuted: '',
            previewUi: { active: false, loading: false, progress: 0, itemId: undefined },
        }
    },
    computed: {
        showBrowseLoading() {
            return this.browseInitialLoading || this.browseSearching || (this.fetchingItem!=undefined && (!this.items || this.items.length<1) && !this._browseItemsPending);
        },
        numCurrentActionsInToolbar() {
            if (this.tbarActions.length<3 && this.currentActions.length>0) {
                let slots = 3 - this.tbarActions.length;
                if (this.currentActions.length>slots) {
                    return slots - 1;
                }
                return this.currentActions.length;
            }
            return 0;
        },
        darkUi() {
            return this.$store.state.darkUi
        },
        darkSearchIcon() {
            return this.$store.state.colorUsage==COLOR_USE_STANDARD && 'lyrion'==this.$store.state.color && this.darkUi
        },
        hidden() {
            return this.$store.state.hidden
        },
        hierarchyTitle() {
            if (this.fusionMode || this.history.length<1) {
                return undefined;
            }
            return i18n('Hold for browse hierarchy');
        },
        goBackTitle() {
            let base = this.trans && this.trans.goBack ? this.trans.goBack : i18n('Go back');
            let home = this.trans && this.trans.goHome ? this.trans.goHome : i18n('Home');
            base = base + SEPARATOR + i18n('Hold for %1', home);
            if (!this.keyboardControl || IS_MOBILE) {
                return base;
            }
            // Esc still works; ⌘+← (macOS) or Alt+← is the dedicated one-level back
            try {
                let modLeft = IS_APPLE
                    ? i18n('⌘+%1', '◁')
                    : i18n('Alt+%1', '◁');
                return base + SEPARATOR + modLeft;
            } catch (e) {
                return base;
            }
        },
        keyboardControl() {
            return this.$store.state.keyboardControl && !IS_MOBILE
        },
        desktopLayout() {
            return this.$store.state.desktopLayout
        },
        /* Mobile context-sheet header meta for the open item menu */
        menuItemMeta() {
            return typeof contextMenuItemMeta==='function'
                ? contextMenuItemMeta(this.menu && this.menu.item)
                : { title: '', lines: [], image: undefined, icon: undefined, svg: undefined };
        },
        ctxPreviewAvailable() {
            if (this.desktopLayout || !this.menu || !this.menu.item || (this.menu.info && this.menu.info.open)) {
                return false;
            }
            if (typeof queryParams!=='undefined' && queryParams.party) {
                return false;
            }
            return typeof browseItemCanPreviewHold==='function' && browseItemCanPreviewHold(this.menu.item, this);
        },
        previewRingStyle() {
            if (this.previewUi && this.previewUi.loading) {
                return {};
            }
            let p = this.previewUi && typeof this.previewUi.progress==='number' ? this.previewUi.progress : 0;
            if (p<0) { p = 0; }
            if (p>1) { p = 1; }
            let r = (typeof BROWSE_PREVIEW_RING_R==='number') ? BROWSE_PREVIEW_RING_R : 15;
            let c = (typeof BROWSE_PREVIEW_RING_C==='number') ? BROWSE_PREVIEW_RING_C : (2 * Math.PI * r);
            return {
                strokeDasharray: String(c),
                strokeDashoffset: String(c * (1 - p))
            };
        },
        browseHomeSplit() {
            return this.$store.state.browseHomeSplit
        },
        /* Desktop-only fixed home column (never flash on iOS phone layout) */
        useHomeSplit() {
            if (!this.browseHomeSplit || !this.desktopLayout) {
                return false;
            }
            // Must use reactive windowWidth — bare window.innerWidth is not tracked by Vue
            return (this.windowWidth || 0) >= HOME_SPLIT_MIN_WIDTH;
        },
        /* Mid-width desktop: keep rail but icons only (labels need more room) */
        homePaneIconsOnlyAuto() {
            return this.useHomeSplit && (this.windowWidth || 0) < HOME_SPLIT_LABELS_MIN_WIDTH;
        },
        homePaneActiveId() {
            // Derive from navigation so main-list clicks stay in sync with the side pane
            if (this.isTop || this.history.length<1) {
                return HOME_PANE_HOME_ID;
            }
            // First level from home: current is the top entry
            if (1==this.history.length && this.current && this.current.id) {
                return this.current.id;
            }
            // Deeper: history[1].current is the root category under home
            if (this.history.length>1 && this.history[1].current && this.history[1].current.id) {
                return this.history[1].current.id;
            }
            if (this.current && this.current.id) {
                return this.current.id;
            }
            return HOME_PANE_HOME_ID;
        },
        /* Root space id for shortcut bar highlight (Home or pinned top item) */
        shortcutActiveId() {
            if (this.isTop || this.history.length<1) {
                return HOME_SHORTCUT;
            }
            if (1==this.history.length && this.current && this.current.id) {
                return this.current.id;
            }
            if (this.history.length>1 && this.history[1].current && this.history[1].current.id) {
                return this.history[1].current.id;
            }
            if (this.current && this.current.id) {
                return this.current.id;
            }
            return HOME_SHORTCUT;
        },
        unlockAll() {
            return this.$store.state.unlockAll
        },
        contextStatsHomeEnabled() {
            return lmsOptions.contextStatsHome;
        },
        browseCstatsHomeChrome() {
            return !this.desktopLayout && this.isTop && !!this.contextStatsHomeEnabled;
        },
        homeGreeting() {
            this.homeI18nTick;
            let h = this.homeGreetingHour;
            if (h==null || isNaN(h)) {
                h = (new Date()).getHours();
            }
            if (h>=5 && h<9) {
                return i18n('Good morning');
            }
            if (h>=9 && h<12) {
                return i18n('Good late morning');
            }
            if (h>=12 && h<14) {
                return i18n('Good midday');
            }
            if (h>=14 && h<18) {
                return i18n('Good afternoon');
            }
            if (h>=18 && h<22) {
                return i18n('Good evening');
            }
            return i18n('Good night');
        },
        homePlayingOnHtml() {
            this.homeI18nTick;
            let name = this.playerName() || i18n('No Player');
            let safe = String(name).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            return i18n('Playing on %1', '<span class="cstats-home-hello-name">'+safe+'</span>');
        },
        contextStatsHomeTitle() {
            return contextStatsHomeTitle();
        },
        cstatsHomeSwiperOptions() {
            let pages = (this.contextStatsHome && this.contextStatsHome.pages)
                ? this.contextStatsHome.pages.length : 0;
            return {
                direction: 'horizontal',
                slidesPerView: 1,
                spaceBetween: 0,
                // Loop when there is more than one page so swiping past the end returns to the first
                loop: pages > 1,
                loopAdditionalSlides: pages > 1 ? 1 : 0,
                resistanceRatio: pages > 1 ? 0 : 0.85,
                observer: true,
                observeParents: true,
                watchOverflow: true,
                // More sensitive than previous (threshold 28 / long 0.55 felt sticky)
                threshold: 10,
                touchAngle: 45,
                touchRatio: 1,
                longSwipesRatio: 0.35,
                longSwipesMs: 280,
                shortSwipes: true,
                preventInteractionOnTransition: true,
                speed: 280,
                autoHeight: true,
                // Trackpad swipe handled via cstatsHomeOnWheel (deltaX / shift+wheel)
                pagination: {
                    el: '.cstats-home-dots',
                    clickable: true
                }
            };
        },
        homeButton() {
            return this.$store.state.homeButton==1 || (this.$store.state.homeButton==2 && this.$store.state.autoShowHomeButton)
        },
        useRecyclerForLists() {
            // Virtualize medium+ lists (not only huge ones). isTop stays plain v-for
            // so home drag/sort pin UI stays reliable.
            if (this.isTop || !this.items || !this.items.length) {
                return false;
            }
            if (this.items[0] && this.items[0].searchcat) {
                return false;
            }
            // Playlist folders / playlist lists: virtualize earlier so they feel as snappy as My Music
            let thresh = LMS_MAX_NON_SCROLLER_ITEMS;
            if (this.current && (this.current.section==SECTION_PLAYLISTS ||
                    this.current.stdItem==STD_ITEM_PLAYLIST_FOLDER ||
                    this.current.stdItem==STD_ITEM_PLAYLIST ||
                    this.current.stdItem==STD_ITEM_REMOTE_PLAYLIST ||
                    (this.current.id && (''+this.current.id).indexOf('playlist')>=0))) {
                thresh = 12;
            }
            return this.items.length > thresh;
        },
        currentImage() {
            if (this.current) {
                if (this.current.image) {
                    return this.current.image;
                }
                if (this.currentItemImage) {
                    return this.currentItemImage;
                }
                let stdItem = this.current.stdItem ? this.current.stdItem : this.current.altStdItem;
                if ((stdItem==STD_ITEM_ONLINE_ARTIST_CATEGORY || stdItem==STD_ITEM_WORK) && this.history.length>0) {
                    let prev = this.history[this.history.length-1];
                    if (prev.current.image) {
                        return prev.current.image;
                    }
                    if (prev.currentItemImage) {
                        return prev.currentItemImage;
                    }
                }
            }
            return undefined
        },
        currentImages() {
            if (this.current) {
                if (this.current.images) {
                    return this.current.images;
                }
                let stdItem = this.current.stdItem ? this.current.stdItem : this.current.altStdItem;
                if ((stdItem==STD_ITEM_ONLINE_ARTIST_CATEGORY || stdItem==STD_ITEM_WORK) && this.history.length>0) {
                    let prev = this.history[this.history.length-1];
                    if (prev.current.images) {
                        return prev.current.images;
                    }
                }
            }
            return undefined
        },
        currentImageUrl() {
            let url = this.currentImage;
            if (undefined==url && this.history.length>0) {
                let prev = this.history[this.history.length-1]
                if (i18n("Select category")==prev.headerSubTitle) {
                    url = prev.current && prev.current.image ? prev.current.image : prev.currentItemImage;
                }
            }
            return url;
        },
        bgndUrl() {
            return this.$store.state.browseBackdrop ? this.currentImageUrl : undefined
        },
        drawBgndImage() {
            return undefined!=this.bgndUrl && this.showBgnd
        },
        drawBackdrop() {
            return !this.drawBgndImage && this.$store.state.browseBackdrop && this.$store.state.useDefaultBackdrops && this.showBgnd
        },
        toolbarTitle() {
            let stdItem = this.current ? this.current.stdItem ? this.current.stdItem : this.current.altStdItem : undefined;
            return this.headerTitle + (this.current && stdItem==STD_ITEM_ALBUM && this.current.subIsYear ? " (" + this.current.subtitle + ")" : "");
        },
        toolbarSubTitle() {
            if (undefined!=this.current && this.current.id==TOP_MYMUSIC_ID) {
                // Keep layout toggle icon in sync for the 3-way cycle
                return this.showLibName ? this.libraryName : undefined;
            }
            let stdItem = this.current ? this.current.stdItem ? this.current.stdItem : this.current.altStdItem : undefined;
            if (undefined!=this.current && (stdItem==STD_ITEM_ALBUM || stdItem==STD_ITEM_ALL_TRACKS || stdItem==STD_ITEM_COMPOSITION_TRACKS || stdItem==STD_ITEM_WORK || stdItem==STD_ITEM_CLASSICAL_WORKS)) {
                let albumArtst = this.current.subIsYear ? undefined : this.current.subtitle;
                if (lmsOptions.noArtistFilter && this.current.compilation && this.items.length>0 && undefined!=this.items[0].compilationAlbumArtist) {
                    albumArtst = this.items[0].compilationAlbumArtist;
                }
                if (undefined!=albumArtst) {
                    return albumArtst + ' (' + this.headerSubTitle + ')';
                }
                for (let loop=this.history, i=loop.length-1; i>=0 && undefined!=loop[i].current; --i) {
                    if (STD_ITEM_ALBUM==loop[i].current.stdItem && undefined!=loop[i].current.subtitle) {
                        return loop[i].current.subtitle + ' (' + this.headerSubTitle + ')';
                    } else if (STD_ITEM_ARTIST==loop[i].current.stdItem || STD_ITEM_WORK_COMPOSER==loop[i].current.stdItem) {
                        return (loop[i].current.noReleaseGrouping ? loop[i].current.title.split(SEPARATOR)[0] : loop[i].current.title) + ' (' + this.headerSubTitle + ')';
                    }
                }
            }
            return this.headerSubTitle ? this.headerSubTitle : undefined;
        },
        showDetailedSubtoolbar() {
            if (this.tall>0) { //} && (undefined!=this.detailedSubExtra || this.detailedSubBot || this.wide>=WIDE_COVER)) {
                let stdItem = this.current ? this.current.stdItem ? this.current.stdItem : this.current.altStdItem : undefined;
                return this.wide>WIDE_NONE && this.current && undefined!=stdItem &&
                       (this.currentImage || stdItem==STD_ITEM_ONLINE_ARTIST_CATEGORY) &&
                       ( stdItem==STD_ITEM_ARTIST || stdItem==STD_ITEM_WORK_COMPOSER || stdItem==STD_ITEM_ALBUM ||
                         stdItem==STD_ITEM_WORK || stdItem==STD_ITEM_CLASSICAL_WORKS || stdItem>=STD_ITEM_MAI ||
                         ((stdItem==STD_ITEM_PLAYLIST || stdItem==STD_ITEM_REMOTE_PLAYLIST) && lmsOptions.playlistImages) ||
                         (this.wide>=WIDE_COVER && (stdItem==STD_ITEM_ONLINE_ARTIST || stdItem==STD_ITEM_ONLINE_ALBUM ||
                            stdItem==STD_ITEM_ONLINE_ARTIST_CATEGORY)));
            }
            return false;
        },
        /** Pull-to-reveal tools: mobile layout (phone, or desktop forced to mobile). */
        browseMobilePullChrome() {
            return !this.$store.state.desktopLayout;
        },
        /** Mobile compact chrome: clean title only; buttons + details are expanded. */
        browseSubheaderCompact() {
            return !!(BROWSE_SUBHEADER_COLLAPSE && this.browseMobilePullChrome &&
                this.browseSubheaderHidden && (this.showDetailedSubtoolbar || this.browseCatalogHero));
        },
        detailedSubTop() {
            let stdItem = this.current.stdItem ? this.current.stdItem : this.current.altStdItem;
            if (stdItem==STD_ITEM_ARTIST || stdItem==STD_ITEM_WORK_COMPOSER) {
                return this.detailedSubInfo;
            }
            if (stdItem==STD_ITEM_PLAYLIST) {
                return i18n("Local Playlist");
            }
            if (stdItem==STD_ITEM_REMOTE_PLAYLIST) {
                return i18n("Remote Playlist");
            }
            if (stdItem==STD_ITEM_WORK) {
                return undefined!=this.current.composer ? this.current.composer : this.current.subtitle;
            }
            if (stdItem==STD_ITEM_ALBUM || (stdItem==STD_ITEM_ONLINE_ALBUM && this.current.sbMeta) ||
                stdItem==STD_ITEM_ALL_TRACKS || stdItem==STD_ITEM_COMPOSITION_TRACKS || stdItem==STD_ITEM_MIX ||
                stdItem==STD_ITEM_CLASSICAL_WORKS) {
                let albumArtst = this.current.subIsYear ? undefined : this.current.subtitle;
                if (lmsOptions.noArtistFilter && this.current.compilation && this.items.length>0 && undefined!=this.items[0].compilationAlbumArtist) {
                    albumArtst = this.items[0].compilationAlbumArtist;
                }
                if (undefined!=albumArtst) {
                    return albumArtst;
                }
                for (let loop=this.history, i=loop.length-1; i>=0 && undefined!=loop[i].current; --i) {
                    if (STD_ITEM_ALBUM==loop[i].current.stdItem && undefined!=loop[i].current.subtitle) {
                        return loop[i].current.subtitle;
                    } else if (STD_ITEM_ARTIST==loop[i].current.stdItem || STD_ITEM_WORK_COMPOSER==loop[i].current.stdItem) {
                        return loop[i].current.title;
                    }
                }
                return "&nbsp;";
            }
            return this.headerSubTitle
        },
        detailedSubBot() {
            if (!this.current) {
                return false;
            }
            let stdItem = this.current.stdItem ? this.current.stdItem : this.current.altStdItem;
            if (stdItem==STD_ITEM_ARTIST || stdItem==STD_ITEM_WORK_COMPOSER || stdItem==STD_ITEM_WORK || stdItem==STD_ITEM_CLASSICAL_WORKS || stdItem==STD_ITEM_PLAYLIST || stdItem==STD_ITEM_REMOTE_PLAYLIST) {
                return this.headerSubTitle;
            }
            if (stdItem==STD_ITEM_ALBUM || (stdItem==STD_ITEM_ONLINE_ALBUM && this.current.sbMeta) || stdItem==STD_ITEM_MIX || stdItem==STD_ITEM_ALL_TRACKS || stdItem==STD_ITEM_COMPOSITION_TRACKS) {
                return this.detailedSubInfo;
            }
        },
        showMaiButton() {
            if (this.isTrackList ? this.trackWide<(this.allowShuffle(this.current) ? TRACK_WIDE_FOUR : TRACK_WIDE_THREE) : this.wide<WIDE_HBTNS) {
                return false;
            }
            let stdItem = this.current.stdItem ? this.current.stdItem : this.current.altStdItem;
            if (LMS_P_MAI && this.showDetailedSubtoolbar && (stdItem==STD_ITEM_ARTIST || stdItem==STD_ITEM_WORK_COMPOSER || stdItem==STD_ITEM_WORK || stdItem==STD_ITEM_ALBUM)) {
                if (stdItem==STD_ITEM_ARTIST || stdItem==STD_ITEM_WORK_COMPOSER) {
                    // 'Various Artists' will not have biography entry in its menu. So, if
                    // this item is not found then we don't show toolbar button...
                    for (let i=0, loop=this.currentActions, len=loop.length; i<len; ++i) {
                        if (loop[i].stdItem==STD_ITEM_MAI) {
                            return true;
                        }
                    }
                    return false;
                }
                return true;
            }
            return false;
        },
        showMixButton() {
            if ((LMS_P_BMIX || LMS_P_LMIX) && this.wide>=WIDE_MIX_BTN && this.showDetailedSubtoolbar && (this.current.stdItem==STD_ITEM_ARTIST || this.current.stdItem==STD_ITEM_WORK_COMPOSER)) {
                for (let i=0, loop=this.currentActions, len=loop.length; i<len; ++i) {
                    if (loop[i].stdItem==STD_ITEM_MIX) {
                        return true;
                    }
                }
            }
            return false;
        },
        pinQueue() {
            return this.$store.state.pinQueue
        },
        showRating() {
            return undefined!=LMS_P_RP && LMS_STATS_ENABLED && this.$store.state.showRating
        },
        tint() {
            return this.$store.state.tinted && this.$store.state.cMixSupported
        },
        variableGridHeight() {
            return (this.isTop && this.$store.state.detailedHomeItems.length>0) || this.grid.multiSize
        },
        allowVLibOnHome() {
            return undefined!=this.libraryName
        },
        showLibName() {
            return undefined!=this.libraryName && undefined!=this.$store.state.library && !LMS_DEFAULT_LIBRARIES.has(this.$store.state.library)
        },
        subtitlesClickable() {
            return this.subtitleClickable || (this.isTop && this.$store.state.detailedHomeItems.length>0 && undefined!=this.topExtra && this.topExtra.length>0)
        },
        isTrackList() {
            return undefined!=this.current && (STD_ITEM_ALBUM==this.current.stdItem || STD_ITEM_PLAYLIST==this.current.stdItem || STD_ITEM_REMOTE_PLAYLIST==this.current.stdItem || this.current.stdItem==STD_ITEM_ALL_TRACKS || STD_ITEM_ONLINE_ALBUM==this.current.stdItem || STD_ITEM_REMOTE_PLAYLIST==this.current.stdItem)
        },
        isImageTrackList() {
            return undefined!=this.current && (STD_ITEM_PLAYLIST==this.current.stdItem || STD_ITEM_REMOTE_PLAYLIST==this.current.stdItem || this.current.stdItem==STD_ITEM_ALL_TRACKS || this.current.stdItem==STD_ITEM_REMOTE_PLAYLIST)
        },
        showTrackListCommands() {
            return this.wide<WIDE_MIX_BTN && this.isTrackList && this.showDetailedSubtoolbar
        },
        unpinnedQueueVisible() {
            return this.$store.state.desktopLayout && !this.$store.state.pinQueue && !this.nowPlayingExpanded && (this.$store.state.showQueue || this.$store.state.queueOverlayClosing)
        },
        pinnedQueue() {
            return this.$store.state.desktopLayout && this.$store.state.pinQueue
        },
        browseSearchSubheaderMode() {
            return this.$store.state.browseSearch && this.$store.state.desktopLayout &&
                   (this.unpinnedQueueVisible || this.nowPlayingExpanded || this.maiShown);
        },
        browseSearchFloating() {
            if (!this.$store.state.browseSearch) {
                return false;
            }
            if (this.$store.state.desktopLayout) {
                return !this.nowPlayingExpanded && !this.maiShown && !this.unpinnedQueueVisible;
            }
            return 'browse'==this.$store.state.page;
        },
        browseSearchInSubheader() {
            return !this.$store.state.browseSearch || this.browseSearchSubheaderMode;
        },
        catalogArtUrl() {
            if (this.currentImage) {
                return this.currentImage;
            }
            if (this.currentImages && this.currentImages.length>0) {
                return this.currentImages[0];
            }
            for (let i=0, loop=this.items||[], len=loop.length; i<len; ++i) {
                if (loop[i] && loop[i].image && !loop[i].header && !loop[i].spacer) {
                    return loop[i].image;
                }
            }
            return undefined;
        },
        catalogArtFallback() {
            let stdItem = this.current ? (this.current.stdItem ? this.current.stdItem : this.current.altStdItem) : undefined;
            if (stdItem==STD_ITEM_PLAYLIST || stdItem==STD_ITEM_REMOTE_PLAYLIST) {
                return 'list';
            }
            if (stdItem==STD_ITEM_ARTIST || stdItem==STD_ITEM_WORK_COMPOSER || stdItem==STD_ITEM_ONLINE_ARTIST) {
                return 'person';
            }
            return 'album';
        },
        browseCatalogHero() {
            if (!this.$store.state.browseCatalogHeader || !this.current) {
                return false;
            }
            let stdItem = this.current.stdItem ? this.current.stdItem : this.current.altStdItem;
            let id = this.current.id ? (''+this.current.id) : '';
            if (stdItem==STD_ITEM_PLAYLIST || stdItem==STD_ITEM_REMOTE_PLAYLIST ||
                (this.current.section==SECTION_PLAYLISTS && id.indexOf('playlist_id:')==0)) {
                return true;
            }
            // Don't wait for cover art: fallback icon is already in the hero, and gating
            // on catalogArtUrl swapped the title from subtoolbar (larger) to catalog after load.
            return stdItem==STD_ITEM_ARTIST || stdItem==STD_ITEM_WORK_COMPOSER ||
                   stdItem==STD_ITEM_ALBUM || stdItem==STD_ITEM_WORK ||
                   stdItem==STD_ITEM_ONLINE_ALBUM || stdItem==STD_ITEM_ONLINE_ARTIST ||
                   stdItem==STD_ITEM_CLASSICAL_WORKS;
        },
        browseJumplistGutter() {
            if (this.fusionMode && this.current && this.current.id==TOP_MYMUSIC_ID) {
                return false;
            }
            if (this.filteredJumplist && this.filteredJumplist.length>1) {
                return true;
            }
            return !!this.reserveJumplistGutter;
        },
        catalogKicker() {
            if (!this.current) {
                return '';
            }
            let stdItem = this.current.stdItem ? this.current.stdItem : this.current.altStdItem;
            if (stdItem==STD_ITEM_ALBUM || stdItem==STD_ITEM_ONLINE_ALBUM) {
                return i18n('Album');
            }
            if (stdItem==STD_ITEM_ARTIST || stdItem==STD_ITEM_WORK_COMPOSER || stdItem==STD_ITEM_ONLINE_ARTIST) {
                return i18n('Artist');
            }
            if (stdItem==STD_ITEM_PLAYLIST || stdItem==STD_ITEM_REMOTE_PLAYLIST) {
                return this.detailedSubTop || i18n('Playlist');
            }
            if (stdItem==STD_ITEM_WORK || stdItem==STD_ITEM_CLASSICAL_WORKS) {
                return i18n('Work');
            }
            return '';
        },
        catalogDescription() {
            let parts = [];
            if (this.detailedSubTop && this.detailedSubTop!=='&nbsp;' && this.detailedSubTop!==this.catalogKicker) {
                parts.push(this.detailedSubTop);
            }
            if (this.detailedSubBot) {
                parts.push(this.detailedSubBot);
            } else if (this.toolbarSubTitle && this.toolbarSubTitle!==this.detailedSubTop) {
                parts.push(this.toolbarSubTitle);
            }
            return parts.join(SEPARATOR);
        },
        catalogCanPlay() {
            if (!this.current || this.selection.size>0 || this.searchActive==1) {
                return false;
            }
            if (this.tbarActions && (this.tbarActions.indexOf(PLAY_ACTION)>=0 || this.tbarActions.indexOf(PLAY_ALL_ACTION)>=0)) {
                return true;
            }
            let stdItem = this.current.stdItem ? this.current.stdItem : this.current.altStdItem;
            let id = this.current.id ? (''+this.current.id) : '';
            return stdItem==STD_ITEM_PLAYLIST || stdItem==STD_ITEM_REMOTE_PLAYLIST ||
                   stdItem==STD_ITEM_ALBUM || stdItem==STD_ITEM_ARTIST ||
                   stdItem==STD_ITEM_WORK || stdItem==STD_ITEM_ONLINE_ALBUM ||
                   (this.current.section==SECTION_PLAYLISTS && id.indexOf('playlist_id:')==0);
        },
        /** Dedicated play/shuffle icons — only when .browse-commands is not already showing them. */
        catalogShowIconPlayBtns() {
            if (!this.catalogCanPlay) {
                return false;
            }
            if (this.browseCatalogHero && !this.browseSubheaderCompact) {
                return false;
            }
            if (!this.browseCatalogHero && !this.browseSubheaderCompact && this.desktopLayout &&
                    (!this.showDetailedSubtoolbar || !this.isTrackList || this.wide>=WIDE_MIX_BTN)) {
                return false;
            }
            return true;
        },
        catalogPlayAct() {
            if (this.tbarActions && this.tbarActions.indexOf(PLAY_ALL_ACTION)>=0) {
                return PLAY_ALL_ACTION;
            }
            return PLAY_ACTION;
        },
        catalogShuffleAct() {
            if (this.tbarActions && this.tbarActions.indexOf(PLAY_SHUFFLE_ALL_ACTION)>=0) {
                return PLAY_SHUFFLE_ALL_ACTION;
            }
            return PLAY_SHUFFLE_ACTION;
        },
        browseShowOverflowPanel() {
            return this.browseOverflowOpen && this.searchActive!=1 && this.selection.size<1;
        },
        browseOverflowFullHeight() {
            return this.browseCstatsHomeChrome ? 112 : 56;
        },
        browseScrollToolsStyle() {
            let full = this.browseOverflowFullHeight;
            if (this.browseOverflowPulling) {
                let h = Math.max(0, this.browseOverflowPullPx);
                return {
                    height: h + 'px',
                    opacity: String(Math.max(0.18, Math.min(1, h / Math.max(24, full * 0.55)))),
                    transition: 'none'
                };
            }
            let open = this.browseOverflowOpen && this.searchActive!=1 && this.selection.size<1;
            return {
                height: (open ? full : 0) + 'px',
                opacity: open ? '1' : '0'
            };
        },
        browseOverflowCanFilter() {
            return this.history.length>0 && this.current && this.current.id!=TOP_MYMUSIC_ID;
        },
        browseCanAlphaSort() {
            if (this.isTop || this.searchActive==1 || this.isTrackList) {
                return false;
            }
            let c = this.current;
            if (!c) {
                return false;
            }
            if (c.section==SECTION_PLAYLISTS || c.section==SECTION_FAVORITES) {
                return true;
            }
            let std = c.stdItem ? c.stdItem : c.altStdItem;
            return std==STD_ITEM_PLAYLIST_FOLDER;
        },
        browseScrollMeta() {
            return !!(this.browseMobilePullChrome && !this.isTop && this.searchActive!=1 && (this.toolbarSubTitle || this.browseScrollDescription));
        },
        browseScrollDescription() {
            let c = this.current;
            if (!c) {
                return '';
            }
            let desc = c.comment || c.desc || c.description || c.text || '';
            if (!desc || desc===this.toolbarSubTitle || desc===this.headerSubTitle) {
                return '';
            }
            return desc;
        },
        browsePlayExtrasVisible() {
            return this.browsePlaySwipeOpen || this.browsePlaySwipePx>18;
        },
        browseOverflowViewAct() {
            if (!this.grid || !this.grid.allowed) {
                return undefined;
            }
            if (this.grid.use) {
                return USE_LIST_ACTION;
            }
            return this.$store.state.detailedHomeItems.length ? USE_ALT_GRID_ACTION : USE_GRID_ACTION;
        },
        exploreViewAct() {
            if (!this.isTop) {
                return undefined;
            }
            return this.exploreUseGrid ? USE_LIST_ACTION : USE_GRID_ACTION;
        },
        browseOverflowShowQueueBtns() {
            if (this.isTop || this.searchActive==1 || this.selection.size>0) {
                return false;
            }
            if (queryParams.party) {
                return false;
            }
            return !!(this.catalogCanPlay || (this.tbarActions && (this.tbarActions.indexOf(ADD_ACTION)>=0 || this.tbarActions.indexOf(ADD_ALL_ACTION)>=0 || this.tbarActions.indexOf(PLAY_ACTION)>=0 || this.tbarActions.indexOf(PLAY_ALL_ACTION)>=0)));
        },
        browseOverflowInsertAct() {
            if (this.tbarActions && (this.tbarActions.indexOf(ADD_ALL_ACTION)>=0 || this.tbarActions.indexOf(PLAY_ALL_ACTION)>=0)) {
                return INSERT_ALL_ACTION;
            }
            return INSERT_ACTION;
        },
        browseOverflowAddAct() {
            if (this.tbarActions && this.tbarActions.indexOf(ADD_ALL_ACTION)>=0) {
                return ADD_ALL_ACTION;
            }
            return ADD_ACTION;
        },
        browseListItemSize() {
            if (this.grid && this.grid.allowed && this.grid.use && typeof browseZoomListItemSize === 'function') {
                return browseZoomListItemSize(LMS_LIST_ELEMENT_SIZE);
            }
            return LMS_LIST_ELEMENT_SIZE;
        },
        // Horizontal ihe strips (e.g. Radio stations) shown above list body when not in grid
        browseListIheStrip() {
            if (this.grid && this.grid.allowed && this.grid.use) {
                return [];
            }
            let strip = [];
            for (let i=0, loop=this.items||[], len=loop.length; i<len; ++i) {
                let it = loop[i];
                if (it && it.ihe && !it.header) {
                    it.gidx = i;
                    strip.push(it);
                }
            }
            return strip;
        },
        browseListIheHasSubtitle() {
            let strip = this.browseListIheStrip;
            for (let i=0, len=strip.length; i<len; ++i) {
                if (strip[i] && strip[i].subtitle) {
                    return true;
                }
            }
            return false;
        },
        // List/RecycleScroller body without ihe strip items (avoids duplicate rows).
        // Live keyboard filter also prunes non-matches here so virtual lists reflow
        // (display:none leaves empty slots with absolute-positioned RecycleScroller).
        browseListBodyItems() {
            if (this.grid && this.grid.allowed && this.grid.use) {
                return this.items;
            }
            let loop = this.items || [];
            let term = this.listFilterTerm;
            let filtering = !!(term && 2==this.searchActive);
            // Fast path: no filter, no home-extra strip — same array (no alloc / re-render churn)
            let hasIhe = false;
            for (let i=0, len=loop.length; i<len; ++i) {
                if (loop[i] && loop[i].ihe && !loop[i].header) {
                    hasIhe = true;
                    break;
                }
            }
            if (!filtering && !hasIhe) {
                return this.items;
            }
            let cacheTerm = filtering ? term : '';
            // Cache while items identity/length and filter term are stable
            if (this._blbiSrc===loop && this._blbiLen===loop.length && this._blbiTerm===cacheTerm && this._blbiOut) {
                return this._blbiOut;
            }
            let out = [];
            for (let i=0, len=loop.length; i<len; ++i) {
                let it = loop[i];
                if (it && it.ihe && !it.header) {
                    continue;
                }
                if (filtering) {
                    // Same visibility as listItemFilterHidden / browseListItemMatchesFilter
                    if (!it || it.header || it.spacer) {
                        continue;
                    }
                    if (!(typeof browseListItemMatchesFilter==='function'
                            ? browseListItemMatchesFilter(it, term)
                            : searchListHasStr(it, term))) {
                        continue;
                    }
                }
                // Preserve original index for click/menu/drag (scroller index != items index)
                if (it && it.gidx!==i) {
                    it.gidx = i;
                }
                out.push(it);
            }
            this._blbiSrc = loop;
            this._blbiLen = loop.length;
            this._blbiTerm = cacheTerm;
            this._blbiOut = out;
            return out;
        }
    },
    created() {
        if (!IS_MOBILE) {
            let browse = this;
            document.onkeyup = function(event) {
                try { browseHandleKey(browse, event); } catch(e) { }
            };
        }
        this.needToRefresh3rdParty = false;
        this.reqId = 0;
        this.myMusic=[];
        this.history=[];
        this.fetchingItem = undefined;
        this.current = null;
        this.currentLibId = null;
        this.headerTitle = null;
        this.headerSubTitle=null;
        this.tbarActions=[];
        this.options={pinned: new Set(),
                      sortFavorites: this.$store.state.sortFavorites};
        this.previousScrollPos=0;
        this.grid = {allowed:true, use:this.$store.state.gridPerView ? isSetToUseGrid(GRID_TOP) : getLocalStorageBool('grid', true), numItems:0, numColumns:0, ih:GRID_MIN_HEIGHT, rows:[], few:false, haveSubtitle:true, multiSize:false, type:GRID_STANDARD};
        this.currentActions=[{action:VLIB_ACTION}, {action:(this.grid.use ? USE_LIST_ACTION : this.$store.state.detailedHomeItems.length ? USE_ALT_GRID_ACTION : USE_GRID_ACTION)}];
        this.canDrop = true;

        if (!IS_MOBILE) {
            bindKey('home');
            bindKey(LMS_SEARCH_KEYBOARD, 'mod');
            bindKey(LMS_SEARCH_KEYBOARD, 'alt');
            bindKey(LMS_PLAY_KEYBOARD, 'mod+shift');
            bindKey(LMS_APPEND_KEYBOARD, 'mod+shift');
            bindKey(LMS_ADD_ITEM_ACTION_KEYBOARD, 'mod+shift');
            bindKey(LMS_CREATE_FAV_FOLDER_KEYBOARD, 'mod+shift');
            bindKey('pageup', undefined, true);
            bindKey('pagedown', undefined, true);
            bus.$on('keyboard', function(key, modifier) {
                if (this.$store.state.openDialogs.length>0 || this.$store.state.visibleMenus.size>0 || (!this.$store.state.desktopLayout && this.$store.state.page!="browse")) {
                    return;
                }
                if ('mod'==modifier) {
                    if (LMS_SEARCH_KEYBOARD==key) {
                        if (this.selection.size<=0) {
                            if (this.isTop || (this.current && (this.current.id==TOP_MYMUSIC_ID || this.current.id.startsWith(SEARCH_ID)))) {
                                this.itemAction(SEARCH_LIB_ACTION);
                            } else if (browseHasSearchListAction(this)) {
                                this.itemAction(SEARCH_LIST_ACTION);
                            }
                        }
                    } else {
                        for (var i=0, len=this.tbarActions.length; i<len; ++i) {
                            if (ACTIONS[this.tbarActions[i]].key==key) {
                                this.headerAction(this.tbarActions[i], undefined);
                                break;
                            }
                        }
                    }
                } else if ('mod+shift'==modifier) {
                    for (var i=0, len=this.tbarActions.length; i<len; ++i) {
                        if (ACTIONS[this.tbarActions[i]].skey==key) {
                            if (LMS_PLAY_KEYBOARD==key && this.selection.size>0) {
                                this.actionSelectedItems(PLAY_ACTION);
                            } else if (LMS_APPEND_KEYBOARD==key && this.selection.size>0) {
                                this.actionSelectedItems(ADD_ACTION);
                            } else {
                                this.headerAction(this.tbarActions[i], undefined);
                            }
                            break;
                        }
                    }
                } else if ('alt'==modifier) {
                    if (LMS_SEARCH_KEYBOARD==key && this.selection.size<=0) {
                        bus.$emit('dlg.open', 'advancedsearch', true, this.$store.state.library ? this.$store.state.library : LMS_DEFAULT_LIBRARY);
                    }
                } else if (!modifier) {
                    if ('home'==key) {
                        this.goHome();
                    } else if ('pageup'==key) {
                        this.scrollElement.scrollBy(0, -1*this.scrollElement.clientHeight);
                    } else if ('pagedown'==key) {
                        this.scrollElement.scrollBy(0, this.scrollElement.clientHeight);
                    }
                }
            }.bind(this));
        }
        bus.$on('advSearchResults', function(item, command, resp) {
            browseHandleListResponse(this, item, command, resp);
            this.tbarActions.unshift(ADV_SEARCH_ACTION);
            if (this.items.length>0) {
                this.tbarActions.unshift(SAVE_VLIB_ACTION);
            }
        }.bind(this));
        bus.$on('releaseSupportChanged', function() {
            this.updateSortStrings();
        }.bind(this));
        this.queueEmpty = true;
        bus.$on('queueStatus', function(size) {
            this.queueEmpty = size<1;
        }.bind(this));
        bus.$on('customActions', function() {
            this.loadCustomPinned(this);
        }.bind(this));
        bus.$on('groupMyMusicCategoriesChanged', function() {
            this.myMusic=browseSortCategories(this.myMusicAll, this.myMusicArtist, this.myMusicRelease, this.myMusicOther);
        }.bind(this));
    },
    methods: Object.assign({
        updateSortStrings() {
            B_ALBUM_SORTS=[
                { key:"album",           label:lmsOptions.supportReleaseTypes ? i18n("Release") : i18n("Album")},
                { key:"artistalbum",     label:lmsOptions.supportReleaseTypes ? i18n("Artist, Release") : i18n("Artist, Album")},
                { key:"artflow",         label:lmsOptions.supportReleaseTypes ? i18n("Artist, Year, Release") : i18n("Artist, Year, Album")},
                { key:"yearalbum",       label:lmsOptions.supportReleaseTypes ? i18n("Year, Release") : i18n("Year, Album")},
                { key:"yearartistalbum", label:lmsOptions.supportReleaseTypes ? i18n("Year, Artist, Release") : i18n("Year, Artist, Album")},
                { key:"new",             label:i18n("Newest")} ];
            B_TRACK_SORTS=[
                { key:"title",           label:i18n("Title")},
                { key:"tracknum",        label:i18n("Track Number")},
                { key:"albumtrack",      label:lmsOptions.supportReleaseTypes ? i18n("Release, Track Number") : i18n("Album, Track Number")},
                { key:"yearalbumtrack",  label:lmsOptions.supportReleaseTypes ? i18n("Year, Release, Track Number") : i18n("Year, Album, Track Number")},
                { key:"artisttitle",     label:i18n("Artist, Title")},
                { key:"yeartitle",       label:i18n("Year, Title")} ];
        },
        initItems() {
            updateActionStrings();
            this.updateSortStrings();

            this.trans= { ok:i18n('OK'), cancel: i18n('Cancel'), close: i18n('Close'), selectMultiple:i18n("Select multiple items"),
                          addsel:i18n("Add selection to queue"),  playsel:i18n("Play selection"), shufflesel:i18n("Play selection shuffled"),
                          deletesel:i18n("Delete all selected items"), invertSelect:i18n("Invert selection"),
                          removeall:i18n("Remove all selected items"), choosepos:i18n("Choose position"), goHome:i18n("Go home"),
                          goBack:i18n("Go back"),  home:i18n("Home"), desc:i18n("Descending"), actions:i18n("Actions")
            };

            if (undefined==this.top || this.top.length==0) {
                this.top = [{ command: [],
                              params: [],
                              icon: "library_music",
                              type: "group",
                              weight: 0,
                              id: TOP_MYMUSIC_ID },
                            { command: ["radios"],
                              params: ["menu:radio"],
                              svg: "radio-tower",
                              type: "group",
                              weight: 1,
                              id: TOP_RADIO_ID,
                              section: SECTION_RADIO },
                            { command: ["favorites", "items"],
                              params: ["menu:favorites"],
                              icon: "favorite",
                              type: "favorites",
                              app: "favorites",
                              weight: 2,
                              id: TOP_FAVORITES_ID,
                              section: SECTION_FAVORITES,
                              isFavFolder: true },
                            { command: ["myapps", "items"],
                              params: ["menu:1"],
                              icon: "apps",
                              type: "group",
                              weight: 4,
                              id: TOP_APPS_ID,
                              section: SECTION_APPS },
                            { command: ["material-skin", "extras"],
                              params: [],
                              icon: "extension",
                              type: "group",
                              weight: 5,
                              id: TOP_EXTRAS_ID }];
            }
            for (var i=0, len=this.top.length; i<len; ++i) {
                if ((''+this.top[i].id).startsWith(TOP_ID_PREFIX)) {
                    this.top[i].menu = undefined;
                }
                this.top[i].title= this.top[i].id==TOP_MYMUSIC_ID
                        ? i18n("My Music")
                        : this.top[i].id==TOP_RADIO_ID
                            ? i18n("Radio")
                            : this.top[i].id==TOP_FAVORITES_ID
                                ? i18n("Favorites")
                                : this.top[i].id==TOP_APPS_ID
                                    ? i18n("Apps")
                                    : this.top[i].id==TOP_EXTRAS_ID
                                        ? i18n("Extras")
                                        : this.top[i].title;
            }

            bus.$emit('homeScreenItems', this);
            if (this.history.length<1) {
                this.items = this.top;
                this.layoutGrid(true);
            }
            this.getHomeExtra();
            if (typeof contextStatsHomeLoad === 'function') {
                contextStatsHomeLoad(this);
            }
        },
        contextStatsHomeLoad(soft) {
            if (typeof contextStatsHomeLoad === 'function') {
                contextStatsHomeLoad(this, soft);
            }
        },
        tickHomeGreeting() {
            this.homeGreetingHour = (new Date()).getHours();
        },
        probeHomeSourceSelect() {
            let self = this;
            this.homePrefsInput = false;
            this.homePrefsPresets = false;
            this.homePrefsDsp = false;
            let p = this.$store.state.player;
            if (!p || p.isgroup || typeof PlayerPrefsMenu==='undefined' || !PlayerPrefsMenu.loadMenu) {
                return;
            }
            PlayerPrefsMenu.loadMenu(this.$store).then(function(res) {
                let secs = (res && res.sections) || [];
                let has = function(ids) {
                    return secs.some(function(s) {
                        return s && ids.indexOf(s.id)>=0 && s.items && s.items.length>0;
                    });
                };
                self.homePrefsInput = has(['input', 'source', 'output']);
                self.homePrefsPresets = has(['presets']);
                self.homePrefsDsp = has(['dsp']);
            }).catch(function() {
                self.homePrefsInput = false;
                self.homePrefsPresets = false;
                self.homePrefsDsp = false;
            });
        },
        isExploreHeaderItem(it) {
            if (!it || !it.id) {
                return false;
            }
            return it.id==DETAILED_HOME_EXPLORE || it.id==DETAILED_HOME_EXPLORE+"_std";
        },
        toggleHomeExploreView(event) {
            if (event) {
                storeClickOrTouchPos(event);
            }
            this.exploreUseGrid = !this.exploreUseGrid;
            setLocalStorageVal('homeExploreGrid', this.exploreUseGrid);
            if (this.isTop && !this.grid.use) {
                this.changeLayout(true);
                return;
            }
            this.layoutGrid(true);
        },
        appendHomeExploreRows(items, sz, sbarSize, row, rs, haveSubtitle) {
            if (!items || !items.length) {
                return {row: row, rs: rs, haveSubtitle: haveSubtitle};
            }
            let nc = (sz && sz.nc) ? sz.nc : 2;
            let rowH = (sz && sz.h) ? sz.h : 160;
            if (this.exploreUseGrid) {
                for (let i=0, len=items.length; i<len; ++row) {
                    let rowHasSubtitle = !!this.isTop;
                    let rowItems = [];
                    let used = 0;
                    for (let j=0; j<nc; ++j) {
                        let idx = i+j;
                        if (idx>=len) {
                            rowItems.push(undefined);
                            continue;
                        }
                        if (items[idx] && items[idx].header) {
                            rowItems.push(undefined);
                            if (used<1) {
                                i += 1;
                            }
                            break;
                        }
                        rowItems.push(items[idx]);
                        if (items[idx] && items[idx].subtitle) {
                            haveSubtitle = true;
                            rowHasSubtitle = true;
                        }
                        used++;
                    }
                    if (used<1) {
                        i += 1;
                        continue;
                    }
                    this.grid.rows.push({
                        id: "row.explore.g."+row+"."+nc,
                        items: rowItems,
                        r: row,
                        rs: rs,
                        size: rowHasSubtitle ? rowH : (rowH - GRID_SINGLE_LINE_DIFF),
                        numStd: used,
                        hasSub: rowHasSubtitle
                    });
                    i += used;
                    rs += used;
                }
                this.pushScrollBlockGap('explore.grid');
            } else {
                let listH = (typeof LMS_LIST_ELEMENT_SIZE==='number') ? LMS_LIST_ELEMENT_SIZE : 48;
                for (let k=0, klen=items.length; k<klen; ++k) {
                    if (!items[k] || items[k].header) {
                        continue;
                    }
                    row++;
                    this.grid.rows.push({
                        id: "row.explore.list."+k+"."+(items[k].id||k),
                        item: items[k],
                        exploreList: true,
                        r: row,
                        rs: (this.topExtra ? this.topExtra.length : 0)+k,
                        size: (items[k].libname || items[k].subtitle) ? listH+10 : listH,
                        numStd: 1,
                        hasSub: !!(items[k].libname || items[k].subtitle)
                    });
                }
                this.pushScrollBlockGap('explore.list');
            }
            return {row: row, rs: rs, haveSubtitle: haveSubtitle};
        },
        toggleBrowseAlphaSort(event) {
            if (event) {
                storeClickOrTouchPos(event);
            }
            this.browseAlphaSort = !this.browseAlphaSort;
            setLocalStorageVal('browseAlphaSort', this.browseAlphaSort);
            this.applyBrowseAlphaSort();
        },
        applyBrowseAlphaSort() {
            if (!this.browseCanAlphaSort) {
                return;
            }
            let src = this._browseItemsUnsorted;
            if (!src || !src.length) {
                src = (this.items || []).slice();
                this._browseItemsUnsorted = src;
            }
            if (this._browseJumplistUnsorted==undefined) {
                this._browseJumplistUnsorted = (this.jumplist || []).slice();
            }
            this._browseAlphaApplying = true;
            if (this.browseAlphaSort) {
                this.items = src.slice().sort(function(a, b) {
                    if (a && a.header && !(b && b.header)) { return -1; }
                    if (b && b.header && !(a && a.header)) { return 1; }
                    if (a && a.isFavFolder && !(b && b.isFavFolder)) { return -1; }
                    if (b && b.isFavFolder && !(a && a.isFavFolder)) { return 1; }
                    return (a && a.title ? ''+a.title : '').localeCompare(b && b.title ? ''+b.title : '', undefined, {numeric:true, sensitivity:'base'});
                });
                if (typeof browseRebuildTitleJumplist==='function') {
                    this.jumplist = browseRebuildTitleJumplist(this.items);
                }
            } else {
                this.items = src.slice();
                this.jumplist = (this._browseJumplistUnsorted || []).slice();
            }
            this.$nextTick(function() {
                this._browseAlphaApplying = false;
                this.filterJumplist();
                if (this.grid && this.grid.use) {
                    this.layoutGrid(true);
                }
            }.bind(this));
        },
        browsePlaySwipeStart(ev) {
            if (!ev || !ev.touches || !ev.touches[0]) {
                return;
            }
            this.clearBrowsePlaySwipeTimer();
            this._browsePlaySwipe = { x: ev.touches[0].clientX, y: ev.touches[0].clientY, from: this.browsePlaySwipeOpen ? 1 : 0, moved: false };
        },
        browsePlaySwipeMove(ev) {
            let p = this._browsePlaySwipe;
            if (!p || !ev.touches || !ev.touches[0]) {
                return;
            }
            let dx = p.x - ev.touches[0].clientX;
            let dy = Math.abs(ev.touches[0].clientY - p.y);
            if (!p.moved && Math.abs(dx)<10 && dy<10) {
                return;
            }
            if (!p.moved && dy>Math.abs(dx)) {
                this._browsePlaySwipe = undefined;
                return;
            }
            p.moved = true;
            try { ev.preventDefault(); } catch (e) {}
            let max = 96;
            let base = p.from ? max : 0;
            this.browsePlaySwiping = true;
            this.browsePlaySwipePx = Math.max(0, Math.min(max, base + dx));
        },
        browsePlaySwipeEnd() {
            this._browsePlaySwipe = undefined;
            if (!this.browsePlaySwiping) {
                this.scheduleBrowsePlaySwipeClose();
                return;
            }
            let px = this.browsePlaySwipePx;
            this.browsePlaySwiping = false;
            this.browsePlaySwipePx = 0;
            this.browsePlaySwipeOpen = px > 36;
            this.scheduleBrowsePlaySwipeClose();
        },
        clearBrowsePlaySwipeTimer() {
            if (this._browsePlaySwipeTimer) {
                clearTimeout(this._browsePlaySwipeTimer);
                this._browsePlaySwipeTimer = undefined;
            }
        },
        scheduleBrowsePlaySwipeClose() {
            this.clearBrowsePlaySwipeTimer();
            if (!this.browsePlaySwipeOpen) {
                return;
            }
            this._browsePlaySwipeTimer = setTimeout(function() {
                this._browsePlaySwipeTimer = undefined;
                this.browsePlaySwipeOpen = false;
                this.browsePlaySwipePx = 0;
            }.bind(this), 2800);
        },
        closeHomeOverflowThen(fn) {
            this.browseOverflowPulling = false;
            this.browseOverflowPullPx = 0;
            this.browseOverflowOpen = false;
            this.$nextTick(function() {
                if (typeof fn==='function') {
                    fn();
                }
            });
        },
        openHomeAlarms(event) {
            if (event) {
                storeClickOrTouchPos(event);
            }
            this.closeHomeOverflowThen(function() {
                bus.$emit('dlg.open', 'playersettings', undefined, 'alarms');
            });
        },
        openHomeTimer(event) {
            if (event) {
                storeClickOrTouchPos(event);
            }
            let player = this.$store.state.player;
            this.closeHomeOverflowThen(function() {
                bus.$emit('dlg.open', 'sleep', player);
            });
        },
        openHomePlayerPrefs(section, event) {
            if (event) {
                storeClickOrTouchPos(event);
            }
            this.closeHomeOverflowThen(function() {
                bus.$emit('openNpPlayerPrefs', event, section);
            });
        },
        openHomePlayerMenu(event) {
            let p = this.$store.state.player;
            if (!p) {
                return;
            }
            if (event) {
                storeClickOrTouchPos(event);
            }
            let actions = [];
            let players = this.$store.state.players || [];
            if (players.length>1) {
                for (let i=0, len=players.length; i<len; ++i) {
                    let pl = players[i];
                    if (!pl) {
                        continue;
                    }
                    actions.push({
                        kind: 'player',
                        id: pl.id,
                        title: pl.name,
                        icon: (pl.icon && pl.icon.icon) ? pl.icon.icon : 'speaker',
                        svg: (pl.icon && pl.icon.svg) ? pl.icon.svg : undefined,
                        check: p.id===pl.id
                    });
                }
                actions.push({ divider: true });
            }
            actions.push({ kind: 'cmd', cmd: 'settings', title: PMGR_SETTINGS_ACTION.title, svg: PMGR_SETTINGS_ACTION.svg });
            if (p.ison) {
                actions.push({ kind: 'cmd', cmd: 'off', title: PMGR_POWER_OFF_ACTION.title, icon: PMGR_POWER_OFF_ACTION.icon, dimmed: true });
            } else {
                actions.push({ kind: 'cmd', cmd: 'on', title: PMGR_POWER_ON_ACTION.title, icon: PMGR_POWER_ON_ACTION.icon });
            }
            actions.push({ kind: 'cmd', cmd: 'sleep', title: PMGR_SLEEP_ACTION.title, icon: PMGR_SLEEP_ACTION.icon });
            if (players.length>1) {
                actions.push({ kind: 'cmd', cmd: 'sync', title: PMGR_SYNC_ACTION.title, icon: PMGR_SYNC_ACTION.icon });
            }
            showMenu(this, {
                show: true,
                x: event && event.clientX,
                y: event && event.clientY,
                item: {
                    title: p.name,
                    icon: (p.icon && p.icon.icon) ? p.icon.icon : 'speaker',
                    svg: (p.icon && p.icon.svg) ? p.icon.svg : undefined
                },
                homePlayerMenu: actions
            });
        },
        homePlayerMenuAction(entry, event) {
            if (!entry || entry.divider) {
                return;
            }
            if (event) {
                storeClickOrTouchPos(event, this.menu);
            }
            if (!this.desktopLayout && this.menu) {
                this.menu.show = false;
            }
            if (entry.kind==='player' && entry.id) {
                if (!this.$store.state.player || this.$store.state.player.id!==entry.id) {
                    this.$store.commit('setPlayer', entry.id);
                } else {
                    bus.$emit('refreshStatus');
                }
                return;
            }
            let player = this.$store.state.player;
            if (!player) {
                return;
            }
            if (entry.cmd==='settings') {
                bus.$emit('dlg.open', 'playersettings', player);
            } else if (entry.cmd==='on' || entry.cmd==='off') {
                lmsCommand(player.id, ["power", player.ison ? "0" : "1"]).then(function() {
                    bus.$emit('refreshStatus', player.id);
                });
            } else if (entry.cmd==='sleep') {
                bus.$emit('dlg.open', 'sleep', player);
            } else if (entry.cmd==='sync') {
                bus.$emit('dlg.open', 'sync', player);
            }
        },
        contextStatsHomePlay(card) {
            contextStatsHomePlay(this, card);
        },
        contextStatsHomeArtClick(card, event) {
            if (event) {
                try { event.stopPropagation(); } catch (e) {}
            }
            if (this.contextStatsHome && this.contextStatsHome.modHeld) {
                return;
            }
            if (this._cstatsLongPressFired) {
                this._cstatsLongPressFired = false;
                return;
            }
            if (this.desktopLayout) {
                contextStatsHomeClick(this, card);
            } else {
                contextStatsHomePlay(this, card);
            }
        },
        contextStatsHomeClick(card) {
            // Don't open item when mod-dismiss mode is active
            if (this.contextStatsHome && this.contextStatsHome.modHeld) {
                return;
            }
            // Suppress click after long-press menu
            if (this._cstatsLongPressFired) {
                this._cstatsLongPressFired = false;
                return;
            }
            contextStatsHomeClick(this, card);
        },
        contextStatsHomeMenu(card, event) {
            if (typeof contextStatsHomeMenu==='function') {
                contextStatsHomeMenu(this, card, event);
            }
        },
        /** Custom sheet actions (e.g. home Open-only menus via cstatsActions) */
        cstatsMenuAction(entry) {
            if (!this.desktopLayout && this.menu) {
                this.menu.show = false;
            }
            if (entry && typeof entry.selected==='function') {
                entry.selected();
            }
        },
        /** v-longpress:nomove(true/false) — long press opens contextual drawer */
        contextStatsHomeLongPress(longpress, el, event) {
            if (!longpress) {
                return;
            }
            this._cstatsLongPressFired = true;
            let id = el && el.getAttribute && el.getAttribute('data-cstats-id');
            let card = null;
            let items = this.contextStatsHome && this.contextStatsHome.items;
            if (id && items) {
                for (let i=0; i<items.length; ++i) {
                    if (items[i].id===id) { card = items[i]; break; }
                }
            }
            if (card && typeof contextStatsHomeMenu==='function') {
                try {
                    if (navigator.vibrate) { navigator.vibrate(14); }
                } catch (eVib) {}
                // Prefer touch start coords when the longpress event is a stale touchstart
                let ev = event;
                if (el && el.longpress && el.longpress.startPos) {
                    let sp = el.longpress.startPos;
                    ev = { clientX: sp.x, clientY: sp.y, pageX: sp.x, pageY: sp.y, touches: [{clientX: sp.x, clientY: sp.y}] };
                }
                contextStatsHomeMenu(this, card, ev);
            }
            setTimeout(function() { this._cstatsLongPressFired = false; }.bind(this), 400);
        },
        contextStatsHomeDismiss(card) {
            if (typeof contextStatsHomeDismiss === 'function') {
                contextStatsHomeDismiss(this, card);
            }
        },
        contextStatsHomeCardBg(card, img) {
            contextStatsHomeCardBg(card, img);
        },
        _cstatsHomeSetMod(held) {
            if (this.contextStatsHome) {
                this.contextStatsHome.modHeld = !!held;
            }
        },
        updateContextStatsHomeCols() {
            if (typeof contextStatsHomeApplyLayout === 'function') {
                contextStatsHomeApplyLayout(this);
            } else {
                this.contextStatsHome.cols = contextStatsHomeCols(this.pageElement ? this.pageElement.clientWidth : window.innerWidth, this);
            }
        },
        // Mac trackpad: horizontal two-finger swipe arrives as wheel deltaX (also shift+wheel).
        // One physical swipe must advance exactly one page — trackpads fire a burst of events
        // plus momentum, so we lock until the gesture settles.
        cstatsHomeOnWheel(ev) {
            if (!ev || !this.contextStatsHome || !this.contextStatsHome.pages || this.contextStatsHome.pages.length < 2) {
                return;
            }
            var dx = ev.deltaX || 0;
            var dy = ev.deltaY || 0;
            if (ev.shiftKey && Math.abs(dy) >= Math.abs(dx)) {
                dx = dy;
            }
            // Leave pure vertical scroll to the browse list
            if (!ev.shiftKey && Math.abs(dy) > Math.abs(dx) * 1.15) {
                return;
            }
            // Ignore tiny trackpad noise
            if (Math.abs(dx) < 10) {
                return;
            }
            try { ev.preventDefault(); } catch (e) {}

            var now = Date.now();
            // Still animating / cooldown after a page change
            if (this._cstatsHomeSliding) {
                return;
            }
            // Longer cooldown so trackpad momentum does not multi-page
            if (this._cstatsHomeWheelAt && (now - this._cstatsHomeWheelAt) < 600) {
                return;
            }

            // Need a deliberate horizontal gesture (higher than touch — trackpads are loud)
            this._cstatsHomeWheelDx = (this._cstatsHomeWheelDx || 0) + dx;
            if (Math.abs(this._cstatsHomeWheelDx) < 48) {
                return;
            }

            var sw = this.$refs.cstatsHomeSwiper && (this.$refs.cstatsHomeSwiper.$swiper || this.$refs.cstatsHomeSwiper.swiper);
            if (!sw || typeof sw.slideNext !== 'function') {
                this._cstatsHomeWheelDx = 0;
                return;
            }
            var goNext = this._cstatsHomeWheelDx > 0;
            this._cstatsHomeWheelDx = 0;
            this._cstatsHomeWheelAt = now;
            this._cstatsHomeSliding = true;
            // loop mode: slideNext/Prev wrap; without loop fall back to index wrap
            if (goNext) {
                if (typeof sw.isEnd === 'boolean' && sw.isEnd && !sw.params.loop) {
                    sw.slideTo(0);
                } else {
                    sw.slideNext();
                }
            } else {
                if (typeof sw.isBeginning === 'boolean' && sw.isBeginning && !sw.params.loop) {
                    let last = (sw.slides && sw.slides.length) ? sw.slides.length - 1 : 0;
                    sw.slideTo(last);
                } else {
                    sw.slidePrev();
                }
            }
            // Hold lock for transition + trackpad momentum tail
            var self = this;
            if (this._cstatsHomeSlideTimer) {
                clearTimeout(this._cstatsHomeSlideTimer);
            }
            this._cstatsHomeSlideTimer = setTimeout(function() {
                self._cstatsHomeSliding = false;
                self._cstatsHomeSlideTimer = undefined;
            }, 520);
        },
        autoExpand() {
            if (queryParams.expand.length>0) {
                let idx = -1;
                for (let i=0, loop=this.top, len=loop.length; i<len; ++i) {
                    if (loop[i].title==queryParams.expand[0]) {
                        queryParams.expand.shift();
                        idx = i;
                        break;
                    }
                }
                if (idx<0) {
                    queryParams.expand = [];
                } else {
                    this.autoClick(idx, 0);
                }
            }
        },
        autoClick(idx, attempt) {
            if (attempt>=20) {
                queryParams.expand = [];
                return;
            }
            try {
                browseClick(this, this.items[idx], idx);
            } catch(e) {
                setTimeout(function () { this.autoClick(idx, attempt+1); }.bind(this), 100);
            }
        },
        playerId() {
            return this.$store.state.player ? this.$store.state.player.id : "";
        },
        playerName() {
            return this.$store.state.player ? this.$store.state.player.name : "";
        },
        nextReqId() {
            this.reqId++;
            if (this.reqId>65535) {
                this.reqId=1;
            }
            return this.reqId;
        },
        isCurrentReq(data) {
            return data.id==this.reqId;
        },
        fetchItems(command, item, prevPage, startIndex, force) {
            if (this.fetchingItem!=undefined) {
                let sameShell = this.fetchingItem==item.id && (undefined==startIndex || startIndex==0);
                if (!sameShell && !force) {
                    return;
                }
                if (!sameShell) {
                    this.nextReqId();
                    this.fetchingItem = undefined;
                }
            }

            this.fetchingItem = item.id;
            var start = undefined==startIndex ? 0 : startIndex;
            var full = item.limit ? item.limit : LMS_BATCH_SIZE;
            var count = item.stdItem==STD_ITEM_PLAYLIST ? lmsOptions.pagedBatchSize : full;
            // First paint: small page so the list appears before LMS returns everything
            if (start==0 && this._browseShellNav && (!item.stdItem || item.stdItem!=STD_ITEM_PLAYLIST)) {
                count = Math.min(count, 80);
            }
            let fetchId = item.id;
            lmsList(this.playerId(), command.command, command.params, start, count, item.cancache, this.nextReqId()).then(({data}) => {
                if (this.isCurrentReq(data)) {
                    var resp = parseBrowseResp(data, item, this.options, item.cancache && browseCanUseCache(this) ? cacheKey(command.command, command.params, 0, count) : undefined);
                    this.fetchingItem = undefined;
                    browseHandleListResponse(this, item, command, resp, prevPage, startIndex>0);
                } else if (this.fetchingItem==fetchId) {
                    this.fetchingItem = undefined;
                }
            }).catch(err => {
                this.fetchingItem = undefined;
                if (this._browseShellNav) {
                    this._browseShellNav = false;
                    this._skipNextAddHistory = false;
                    browseGoBack(this);
                } else {
                    browseHandleListResponse(this, item, command, {items: []});
                }
                logError(err, command.command, command.params, 0, count);
                logNoPlayerError(this);
            });
        },
        needsHomeExtraLoad() {
            return this.isTop && this.grid.use && this.$store.state.detailedHomeItems.length>0;
        },
        finishBrowseInitialLoad() {
            if (!this.browseInitialLoading) {
                return;
            }
            this.browseInitialLoading = false;
            if (this.fetchingItem && this.fetchingItem.id=='__home_extra__') {
                this.fetchingItem = undefined;
            }
            if (this._browseBootTimer) {
                clearTimeout(this._browseBootTimer);
                this._browseBootTimer = null;
            }
            try { bus.$emit('mskBrowseReady'); } catch (e) {}
        },
        markBrowseBootPart(part) {
            if (!this._browseBoot) {
                this._browseBoot = { extra: false, cstats: false, top: false };
            }
            if (part) {
                this._browseBoot[part] = true;
            }
            this.tryFinishBrowseBoot();
        },
        tryFinishBrowseBoot() {
            if (!this.browseInitialLoading || !this._browseBoot) {
                return;
            }
            // Extra strips + context-stats cards have reserved slots; they may fade in later.
            if (!this._browseBoot.top) {
                return;
            }
            this.$nextTick(function() {
                var self = this;
                try {
                    this.layoutGrid(true);
                } catch (e) {
                    console.log('layoutGrid during browse boot', e);
                }
                requestAnimationFrame(function() {
                    requestAnimationFrame(function() {
                        self.finishBrowseInitialLoad();
                    });
                });
            }.bind(this));
        },
        scheduleFinishBrowseInitialLoad() {
            if (!this.browseInitialLoading) {
                return;
            }
            // Never block the 3-dot overlay on home-extra: that LMS call stalls
            // for seconds on a busy server and RecycleScroller parks the home
            // tiles under empty placeholder strips.
            this.markBrowseBootPart('extra');
        },
        getHomeExtra() {
            this.topExtraCfg.items=JSON.parse(JSON.stringify(this.$store.state.detailedHomeItems));
            if (this.$store.state.detailedHomeItems.length>0) {
                let cmd = ["material-skin", "home-extra"];
                this.topExtraCfg.needsPlayer = false;
                for (let i=0, loop=this.$store.state.detailedHomeItems, len=loop.length; i<len; ++i) {
                    if (DETAILED_HOME_EXPLORE!=loop[i] && (DETAILED_HOME_STD_PREFIX+"favorites"!=loop[i] || !this.$store.state.sortFavorites)) {
                        cmd.push(loop[i].split('_').slice(1).join('_')+":1");
                        if (!this.topExtraCfg.needsPlayer && !loop[i].startsWith(DETAILED_HOME_STD_PREFIX) && lmsOptions.homeExtraNeedsPlayer.has(loop[i])) {
                            this.topExtraCfg.needsPlayer = true;
                        }
                    }
                }
                if (this.topExtraCfg.needsPlayer) {
                    cmd[0]="material-skin-client";
                }
                if (this.$store.state.library!=undefined && this.$store.state.library!=null) {
                    cmd.push("library_id:"+this.$store.state.library);
                }

                cmd.push("count:"+numScrollItems(this, this.pageElement));
                if (!this.topExtraCfg.needsPlayer || this.playerId().length>1) {
                    lmsCommand(this.playerId(), cmd, this.nextReqId()).then(({data}) => {
                        if (this.isCurrentReq(data)) {
                            this.handleHomeExtra(data);
                        } else if (this.fetchingItem && this.fetchingItem.id=='__home_extra__') {
                            this.fetchingItem = undefined;
                        }
                        this.markBrowseBootPart('extra');
                    }).catch(err => {
                        if (this.fetchingItem && this.fetchingItem.id=='__home_extra__') {
                            this.fetchingItem = undefined;
                        }
                        this.markBrowseBootPart('extra');
                        logError(err);
                    });
                } else {
                    this.scheduleFinishBrowseInitialLoad();
                }
            } else {
                this.scheduleFinishBrowseInitialLoad();
            }
        },
        handleHomeExtra(data) {
            try {
                let resp = parseBrowseResp(data, undefined, {order:this.$store.state.detailedHomeItems, pinned:this.options.pinned, sortFavorites:this.options.sortFavorites});
                this.fetchingItem = undefined;
                if (undefined!=resp && undefined!=resp.items) {
                    // NOTE: No point checking for changes, as the layoutGrid code adds 'gidx' to items
                    // so will always be different!
                    this.topExtra = resp.items;
                    if (this.isTop && this.$store.state.detailedHomeItems.length>0 && this.grid.use) {
                        let scrollTop = this.scrollElement.scrollTop;
                        this.items = this.topExtra.concat(this.top);
                        this.layoutGrid(true);
                        if (undefined!=scrollTop && scrollTop>0) {
                            setScrollTop(this, scrollTop);
                        }
                        if (!this._homeExtraFaded) {
                            this._homeExtraFaded = true;
                            this.homeExtraArriving = true;
                            var self = this;
                            setTimeout(function() { self.homeExtraArriving = false; }, 650);
                        }
                    }
                }
                this.markBrowseBootPart('extra');
            } catch (e) {
                setTimeout(function () { this.handleHomeExtra(data); }.bind(this), 50);
            }
        },
        handleListResponse(item, command, resp, prevPage, appendItems) {
            browseHandleListResponse(this, item, command, resp, prevPage, appendItems);
            if (1==this.searchActive && this.items.length>0) {
                this.listFilterSelPos = -1;
                this.highlightIndex = -1;
                this.highlightSubIndex = -1;
                this.clearBrowseKbSelect();
                this.$nextTick(function() {
                    this.listFilterMoveSelection(0);
                }.bind(this));
            } else if (item && item.id==TOP_RADIO_ID) {
                // Radio: select entries for arrow nav (not the search field)
                this.$nextTick(function() {
                    this.browseSelectFirstNavEntry();
                }.bind(this));
            } else if (this.grid && this.grid.allowed && this.grid.use && this.items && this.items.length>0 && !appendItems) {
                // Grid open: highlight top-left cell for keyboard nav
                this.$nextTick(function() {
                    this.$nextTick(function() {
                        this.browseSelectFirstNavEntry();
                    }.bind(this));
                }.bind(this));
            }
        },
        handleTextClickResponse(item, command, data, isMoreMenu) {
            browseHandleTextClickResponse(this, item, command, data, isMoreMenu);
        },
        canClickText(item) {
            return canClickItem(item);
        },
        doTextClick(item, isMoreMenu) {
            var command = this.buildCommand(item);
            if ((command.command.length==2 && ("items"==command.command[1] || "browsejive"==command.command[1] || "jiveplaylistparameters"==command.command[1])) ||
                (command.command.length==1 && "albums"==command.command[0])) {
                this.fetchingItem = item.id;
                lmsList(this.playerId(), command.command, command.params, 0, LMS_BATCH_SIZE, undefined, this.nextReqId()).then(({data}) => {
                    if (this.isCurrentReq(data)) {
                        this.fetchingItem = undefined;
                        this.handleTextClickResponse(item, command, data, isMoreMenu);
                    }
                }).catch(err => {
                    this.fetchingItem = undefined;
                    logError(err, command.command, command.params);
                    logNoPlayerError(this);
                });
            } else if (command.command.length>0) {
                if (command.params) {
                    command.params.forEach(p => {
                        command.command.push(p);
                    });
                }
                lmsCommand(this.playerId(), command.command).then(({data}) => {
                    bus.$emit('refreshStatus');
                    logJsonMessage("RESP", data);
                    this.handleTextClickResponse(item, command, data, isMoreMenu);
                }).catch(err => {
                    logError(err, command.command);
                    logNoPlayerError(this);
                });
            }
        },
        click(item, index, event) {
            if (this.listSwipeClickGuard && this.listSwipeClickGuard()) { return; }
            // Swallow click after long-press menu or horizontal song swipe
            if (this._listLongPressOpened || (undefined!=this.suppressBrowseClickUntil && Date.now()<this.suppressBrowseClickUntil)) {
                if (event) {
                    try { event.preventDefault(); } catch (e) {}
                    try { event.stopPropagation(); } catch (e) {}
                }
                this._listLongPressOpened = false;
                this.suppressBrowseClickUntil = undefined;
                return;
            }
            if (item.header && item.slimbrowse && item.actions) {
                return; // Handled in showMore
            }
            storeClickOrTouchPos(event, this.menu);
            // Home grid: allow navigation even if a prior fetch is still marked in-flight
            browseClick(this, item, index, event, false, this.isTop);
        },
        /** Grid title: desktop opens menu; mobile navigates (long-press → menu). */
        gridTitleClick(item, index, event) {
            if (this.listSwipeClickGuard && this.listSwipeClickGuard()) { return; }
            if (this._listLongPressOpened) {
                this._listLongPressOpened = false;
                return;
            }
            if (this.desktopLayout) {
                this.itemMenu(item, index, event);
            } else {
                this.click(item, index, event);
            }
        },
        homePaneItemVisible(item) {
            if (!item) {
                return false;
            }
            if (this.disabled.has(item.id) || this.hidden.has(item.id)) {
                return false;
            }
            if (item.id==TOP_RADIO_ID && lmsOptions.combineAppsAndRadio) {
                return false;
            }
            if (queryParams.party && HIDE_TOP_FOR_PARTY.has(item.id)) {
                return false;
            }
            return true;
        },
        homePaneIsBuiltIn(item) {
            return !!(item && item.id && (''+item.id).startsWith(TOP_ID_PREFIX));
        },
        homePaneIsAdded(item) {
            // User-pinned / custom home entries (not built-in top:/ items)
            if (!item || !item.id) {
                return false;
            }
            if (item.isPinned || item.custom) {
                return true;
            }
            return !this.homePaneIsBuiltIn(item);
        },
        homePaneGoHome(event) {
            this.homePaneSelectedId = HOME_PANE_HOME_ID;
            this.homePaneSwipeOpenId = undefined;
            this.browseFocusZone = 'main';
            if (!this.isTop) {
                this.goHome();
            }
        },
        homePaneSearch(event) {
            this.homePaneSwipeOpenId = undefined;
            this.browseFocusZone = 'main';
            this.openLibrarySearch(event);
        },
        openLibrarySearch(event) {
            if (event) {
                try { event.preventDefault(); } catch (e) {}
                try { event.stopPropagation(); } catch (e2) {}
            }
            if (!this.$store.state.desktopLayout) {
                this.$store.commit('setPage', 'browse');
            }
            if (typeof this.browseExpandSubheader === 'function') {
                this.browseExpandSubheader();
            }
            if (1==this.searchActive) {
                focusBrowseSearchInput();
                return;
            }
            this.itemAction(SEARCH_LIB_ACTION, {id:SEARCH_SHORTCUT}, undefined, event);
            focusBrowseSearchInput();
        },
        homePaneMainIndex(item) {
            if (!item || !item.id) {
                return -1;
            }
            for (let i=0, len=this.items.length; i<len; ++i) {
                if (this.items[i].id==item.id) {
                    return i;
                }
            }
            return -1;
        },
        homePaneClick(item, index, event) {
            // Ghost click after a horizontal swipe must not navigate or clear swipe-open
            if (this.homePaneSwipeSuppress) {
                this.homePaneSwipeSuppress = false;
                try { if (event) { event.preventDefault(); event.stopPropagation(); } } catch (e) {}
                return;
            }
            this.browseFocusZone = 'main';
            browseHomePaneNavigate(this, item, index, event);
            this.$nextTick(function() {
                this.browseSelectFirstNavEntry();
            }.bind(this));
        },
        homePaneNavEntries() {
            let out = [];
            out.push({type:'search'});
            out.push({type:'home', id: HOME_PANE_HOME_ID});
            for (let i=0, loop=this.top||[], len=loop.length; i<len; ++i) {
                if (this.homePaneItemVisible(loop[i])) {
                    out.push({type:'item', item: loop[i], index: i, id: loop[i].id});
                }
            }
            return out;
        },
        homePaneKbEntryIs(type, id) {
            let entries = this.homePaneNavEntries();
            let pos = this.homePaneKbPos;
            if (pos<0 || pos>=entries.length) {
                return false;
            }
            let e = entries[pos];
            if (!e || e.type!=type) {
                return false;
            }
            if (type=='item') {
                return e.id==id;
            }
            return true;
        },
        homePaneScrollKbIntoView() {
            try {
                let entries = this.homePaneNavEntries();
                let pos = this.homePaneKbPos;
                if (pos<0 || pos>=entries.length) {
                    return;
                }
                let e = entries[pos];
                let el = null;
                if (e.type=='search') {
                    el = document.querySelector('#browse-home-pane .browse-home-pane-search');
                } else if (e.type=='home') {
                    el = document.querySelector('#browse-home-pane .browse-home-pane-home');
                } else if (e.type=='item') {
                    el = document.getElementById('hpitem'+e.index);
                }
                if (el && el.scrollIntoView) {
                    el.scrollIntoView({block:'nearest', inline:'nearest'});
                }
            } catch (ex) { /* ignore */ }
        },
        browseFocusSidebar(preferActive) {
            if (!this.useHomeSplit) {
                return;
            }
            this.browseKbNavTouch();
            this.browseBlurInlineSearch();
            this.listFilterSelPos = -1;
            this.highlightIndex = -1;
            this.highlightSubIndex = -1;
            if (typeof this.clearBrowseKbSelect==='function') {
                this.clearBrowseKbSelect();
            }
            this.browseFocusZone = 'sidebar';
            let entries = this.homePaneNavEntries();
            if (!entries.length) {
                this.homePaneKbPos = -1;
                return;
            }
            let pos = 0;
            if (preferActive!==false) {
                let active = this.homePaneActiveId;
                for (let i=0, len=entries.length; i<len; ++i) {
                    if (entries[i].type=='home' && active==HOME_PANE_HOME_ID) {
                        pos = i;
                        break;
                    }
                    if (entries[i].type=='item' && entries[i].id==active) {
                        pos = i;
                        break;
                    }
                }
            }
            if (this.homePaneKbPos>=0 && this.homePaneKbPos<entries.length) {
                pos = this.homePaneKbPos;
            }
            this.homePaneKbPos = pos;
            this.homePaneScrollKbIntoView();
        },
        browseFocusMainFromSidebar() {
            this.browseFocusZone = 'main';
            this.browseSelectFirstNavEntry();
        },
        homePaneMoveSelection(delta) {
            let entries = this.homePaneNavEntries();
            if (!entries.length) {
                return;
            }
            let pos = this.homePaneKbPos;
            if (pos<0 || pos>=entries.length) {
                pos = delta>=0 ? 0 : entries.length-1;
            } else {
                pos += delta;
                if (pos<0) {
                    pos = 0;
                } else if (pos>=entries.length) {
                    pos = entries.length-1;
                }
            }
            this.homePaneKbPos = pos;
            this.homePaneScrollKbIntoView();
        },
        homePaneActivateSelected() {
            let entries = this.homePaneNavEntries();
            let pos = this.homePaneKbPos;
            if (pos<0 || pos>=entries.length) {
                pos = 0;
                this.homePaneKbPos = 0;
            }
            let e = entries[pos];
            if (!e) {
                return;
            }
            if (e.type=='search') {
                this.homePaneSearch();
                return;
            }
            if (e.type=='home') {
                this.homePaneGoHome();
                this.browseFocusZone = 'main';
                this.$nextTick(function() {
                    this.browseSelectFirstNavEntry();
                }.bind(this));
                return;
            }
            if (e.type=='item' && e.item) {
                this.browseFocusZone = 'main';
                browseHomePaneNavigate(this, e.item, e.index, undefined);
                this.$nextTick(function() {
                    this.browseSelectFirstNavEntry();
                }.bind(this));
            }
        },
        homePaneCanRename(item) {
            if (!item) { return false; }
            if (this.homePaneIsBuiltIn(item)) { return false; }
            if (item.isPinned || this.homePaneIsAdded(item)) { return true; }
            return item.menu && item.menu.indexOf(RENAME_ACTION)>=0;
        },
        homePaneRename(item, index, event) {
            if (!this.homePaneCanRename(item)) {
                return;
            }
            // Ensure rename action is available
            if (!item.menu || item.menu.indexOf(RENAME_ACTION)<0) {
                item.menu = item.menu ? item.menu.slice() : [];
                if (item.menu.indexOf(RENAME_ACTION)<0) {
                    item.menu.push(RENAME_ACTION);
                }
            }
            let idx = this.homePaneMainIndex(item);
            this.itemAction(RENAME_ACTION, item, idx>=0 ? idx : index, event);
        },
        homePaneDblClick(item, index, event) {
            try { if (event) { event.preventDefault(); event.stopPropagation(); } } catch (e) {}
            this.homePaneRename(item, index, event);
        },
        homePaneContextMenu(item, index, event) {
            try { if (event) { event.preventDefault(); event.stopPropagation(); } } catch (e) {}
            // Built-in home categories are already on the home screen — no pin/unpin menu
            if (this.homePaneIsBuiltIn(item)) {
                return;
            }
            // Right-click: show item menu (rename / unpin for user-added items)
            let menu;
            if (!item.menu || item.menu.length<1) {
                if (this.homePaneIsAdded(item) || item.isPinned) {
                    menu = [RENAME_ACTION, UNPIN_ACTION];
                } else {
                    menu = [this.options.pinned.has(item.id) ? UNPIN_ACTION : PIN_ACTION];
                }
            } else {
                menu = item.menu.slice();
                if (this.homePaneCanRename(item) && menu.indexOf(RENAME_ACTION)<0) {
                    menu.unshift(RENAME_ACTION);
                }
            }
            let idx = this.homePaneMainIndex(item);
            storeClickOrTouchPos(event, this.menu);
            showMenu(this, {show:true, item:item, itemMenu:menu, x:this.menu.x, y:this.menu.y, index:idx>=0 ? idx : index});
        },
        homePaneUnpin(item, index, event) {
            this.homePaneSwipeOpenId = undefined;
            if (!this.homePaneIsAdded(item)) {
                return;
            }
            // Direct unpin (browsePin shows confirm)
            this.pin(item, false);
        },
        initHomePaneSortable() {
            mskSortableDestroy(this.homePaneSortable);
            this.homePaneSortable = undefined;
            // Reorder by drag is desktop-only — on mobile long-press opens the context menu
            if (!this.useHomeSplit || queryParams.party || !this.$store.state.desktopLayout) {
                return;
            }
            let list = document.querySelector('.browse-home-pane-list');
            if (!list || this.top.length < 2) {
                return;
            }
            this.homePaneSortable = mskSortableCreate(list, {
                draggable: '> .browse-home-pane-row',
                forceFallback: true,
                fallbackOnBody: false,
                emitDragActive: false,
                delay: 500,
                delayOnTouchOnly: true,
                touchStartThreshold: 8,
                scroll: list,
                onStart: function() {
                    this.homePaneSortBusy = true;
                    this.homePaneSwipe = undefined;
                    this.homePaneSwipeOpenId = undefined;
                    this.homePaneSwipeSuppress = false;
                }.bind(this),
                onEnd: function(evt) {
                    this.homePaneSortBusy = false;
                    let indices = mskSortableReorderIndices(evt, this.top.length);
                    if (!indices) {
                        this.$nextTick(function() { this.initHomePaneSortable(); }.bind(this));
                        return;
                    }
                    let play = typeof flipListPrepare==='function' ? flipListPrepare(list, '.browse-home-pane-row', 200) : function(){};
                    this.top = arrayMove(this.top.slice(), indices.from, indices.to);
                    if (this.isTop) {
                        this.items = this.grid.use && this.$store.state.detailedHomeItems.length>0 ? this.topExtra.concat(this.top) : this.top;
                    }
                    this.$nextTick(function() {
                        play();
                        if (this.isTop) {
                            this.layoutGrid(true);
                        }
                        this.saveTopList();
                        this.initHomePaneSortable();
                    }.bind(this));
                }.bind(this)
            });
        },
        homePaneSortableActive() {
            return this.homePaneSortBusy || document.body.classList.contains('msk-sortable-active');
        },
        initHomeListSortable() {
            mskSortableDestroy(this.homeListSortable);
            this.homeListSortable = undefined;
            // Desktop only — mobile long-press is reserved for the contextual menu
            if (!this.isTop || this.grid.use || queryParams.party || this.top.length < 2 ||
                !this.$store.state.desktopLayout) {
                return;
            }
            let list = document.getElementById('browse-list');
            if (!list) {
                return;
            }
            this.homeListSortable = mskSortableCreate(list, {
                draggable: '> .browse-home-list-row',
                forceFallback: true,
                fallbackOnBody: false,
                emitDragActive: false,
                delay: 500,
                delayOnTouchOnly: true,
                scroll: list,
                onStart: function() {
                    this.homeListSortBusy = true;
                    this.listSwipe = null;
                }.bind(this),
                onEnd: function(evt) {
                    this.homeListSortBusy = false;
                    let indices = mskSortableReorderIndices(evt, this.top.length);
                    if (!indices) {
                        this.$nextTick(function() { this.initHomeListSortable(); }.bind(this));
                        return;
                    }
                    let play = typeof flipListPrepare==='function' ? flipListPrepare(list, '.browse-home-list-row', 200) : function(){};
                    this.top = arrayMove(this.top.slice(), indices.from, indices.to);
                    this.items = this.top;
                    this.$nextTick(function() {
                        play();
                        this.saveTopList();
                        this.initHomeListSortable();
                    }.bind(this));
                }.bind(this)
            });
        },
        homeListSortableActive() {
            return this.homeListSortBusy || document.body.classList.contains('msk-sortable-active');
        },
        homePaneTouchPoint(ev) {
            if (!ev) { return null; }
            if (ev.touches && ev.touches[0]) {
                return { x: ev.touches[0].clientX, y: ev.touches[0].clientY };
            }
            if (ev.changedTouches && ev.changedTouches[0]) {
                return { x: ev.changedTouches[0].clientX, y: ev.changedTouches[0].clientY };
            }
            if (undefined!=ev.clientX) {
                return { x: ev.clientX, y: ev.clientY };
            }
            return null;
        },
        homePaneSwipeStyle(index) {
            let sw = this.homePaneSwipe;
            if (sw && sw.index===index && 'h'==sw.mode && sw.dx) {
                return {
                    transform: 'translate3d(' + sw.dx + 'px,0,0)',
                    transition: 'none',
                    willChange: 'transform'
                };
            }
            return { transition: 'transform 0.18s ease' };
        },
        homePaneTouchStart(index, item, ev) {
            // Avoid double-handling: touch already covered by touch* handlers
            if (ev && ev.type && ev.type.indexOf('pointer')===0 && ev.pointerType==='touch') {
                return;
            }
            if (this.homePaneSortableActive() || !this.homePaneIsAdded(item)) {
                this.homePaneSwipe = undefined;
                return;
            }
            // Ignore non-primary mouse buttons / multi-touch
            if (ev && ev.button!==undefined && ev.button!==0) {
                return;
            }
            if (ev && ev.touches && ev.touches.length>1) {
                this.homePaneSwipe = undefined;
                return;
            }
            let pt = this.homePaneTouchPoint(ev);
            if (!pt) {
                this.homePaneSwipe = undefined;
                return;
            }
            this.homePaneSwipe = {
                index: index,
                item: item,
                x: pt.x,
                y: pt.y,
                t: Date.now(),
                mode: undefined,
                dx: 0,
                pointerId: ev && ev.pointerId!==undefined ? ev.pointerId : undefined,
                captureEl: undefined
            };
        },
        homePaneTouchMove(ev) {
            if (ev && ev.type && ev.type.indexOf('pointer')===0 && ev.pointerType==='touch') {
                return;
            }
            if (this.homePaneSortableActive()) {
                this.homePaneSwipe = undefined;
                return;
            }
            let sw = this.homePaneSwipe;
            if (!sw) {
                return;
            }
            if (ev && ev.touches && ev.touches.length>1) {
                this.homePaneSwipe = undefined;
                return;
            }
            let pt = this.homePaneTouchPoint(ev);
            if (!pt) {
                return;
            }
            let dx = pt.x - sw.x;
            let dy = pt.y - sw.y;
            if (undefined==sw.mode) {
                if (Math.abs(dx)<12 && Math.abs(dy)<12) {
                    return;
                }
                if (Date.now() - sw.t > 450) {
                    this.homePaneSwipe = undefined;
                    return;
                }
                // Vertical scroll wins
                if (Math.abs(dy) >= Math.abs(dx)) {
                    this.homePaneSwipe = undefined;
                    return;
                }
                if (Math.abs(dx)>Math.abs(dy)*1.1 && Math.abs(dx)>=12) {
                    sw.mode = 'h';
                    bus.$emit('browseItemSwipeActive', true);
                    // Capture pointer only after horizontal intent is clear
                    if (sw.pointerId!==undefined && ev && ev.currentTarget && ev.currentTarget.setPointerCapture) {
                        try {
                            ev.currentTarget.setPointerCapture(sw.pointerId);
                            sw.captureEl = ev.currentTarget;
                        } catch (e) {}
                    }
                } else {
                    this.homePaneSwipe = undefined;
                    return;
                }
            }
            if ('h'!=sw.mode) {
                return;
            }
            if (ev && ev.cancelable) {
                try { ev.preventDefault(); } catch (e) {}
            }
            // Only care about left swipe to reveal remove
            sw.dx = Math.max(-80, Math.min(20, dx));
            // Force Vue reactivity for :style binding
            this.homePaneSwipe = Object.assign({}, sw);
        },
        homePaneTouchEnd(ev) {
            if (ev && ev.type && ev.type.indexOf('pointer')===0 && ev.pointerType==='touch') {
                return;
            }
            if (!this.homePaneSwipe) {
                return;
            }
            let sw = this.homePaneSwipe;
            // Release pointer capture if held
            if (sw.pointerId!==undefined && sw.captureEl && sw.captureEl.releasePointerCapture) {
                try { sw.captureEl.releasePointerCapture(sw.pointerId); } catch (e) {}
            }
            this.homePaneSwipe = undefined;
            bus.$emit('browseItemSwipeActive', false);
            if ('h'!=sw.mode) {
                return;
            }
            // Always swallow the ghost click that follows a horizontal swipe
            this.homePaneSwipeSuppress = true;
            let self = this;
            setTimeout(function() { self.homePaneSwipeSuppress = false; }, 400);
            bus.$emit('browseItemSwipeHandled');
            if (sw.dx<-40 && sw.item) {
                // Reveal sticky X for this pinned item
                this.homePaneSwipeOpenId = sw.item.id;
            } else if (sw.dx>-20) {
                this.homePaneSwipeOpenId = undefined;
            }
        },
        homePaneWidthBounds() {
            let max = Math.min(360, Math.floor(window.innerWidth * 0.36));
            // Icon-only rail vs comfortable text width
            let min = 56;
            let iconMax = 72;   // snap to icons below this
            let wideMin = 168;  // snap to wide when expanding past icons
            let def = 180;      // default comfortable width (narrower than before)
            if (max < wideMin + 40) {
                max = wideMin + 40;
            }
            return { min: min, max: max, iconMax: iconMax, wideMin: wideMin, def: def };
        },
        applyHomePaneWidth(px, persist) {
            let b = this.homePaneWidthBounds();
            let w = Math.max(b.min, Math.min(b.max, Math.round(px)));
            // Set on #browse-view so it overrides the rule-local CSS custom property
            // (setting only on documentElement is shadowed by #browse-view.browse-home-split).
            let view = document.getElementById('browse-view');
            if (view) {
                view.style.setProperty('--browse-home-pane-w', w + 'px');
                view.classList.toggle('browse-home-pane-icons-only', w < 100);
            }
            document.documentElement.style.setProperty('--browse-home-pane-w', w + 'px');
            if (persist) {
                setLocalStorageVal('browseHomePaneW', w);
            }
            return w;
        },
        snapHomePaneWidth(px) {
            let b = this.homePaneWidthBounds();
            let w = Math.round(px);
            // Collapsing toward icons → snap to rail
            if (w < b.wideMin) {
                return b.min;
            }
            // Expanding from icons → snap to comfortable wide
            if (w >= b.wideMin && w < b.wideMin + 24) {
                return b.wideMin;
            }
            // Near default → settle on default
            if (Math.abs(w - b.def) < 18) {
                return b.def;
            }
            return Math.max(b.min, Math.min(b.max, w));
        },
        initHomePaneWidth() {
            if (!this.useHomeSplit) {
                this.homePaneAutoIcons = false;
                let view = document.getElementById('browse-view');
                if (view) {
                    view.classList.remove('browse-home-pane-icons-only');
                }
                return;
            }
            let b = this.homePaneWidthBounds();
            // Viewport contracted into mid band → icon-only rail (do not persist over user prefs)
            if (this.homePaneIconsOnlyAuto) {
                this.homePaneAutoIcons = true;
                this.applyHomePaneWidth(b.min, false);
                return;
            }
            // Expanding out of auto-icon band: restore last saved width (labels or icons)
            this.homePaneAutoIcons = false;
            let saved = parseInt(getLocalStorageVal('browseHomePaneW', b.def), 10);
            if (isNaN(saved) || saved < b.min) {
                saved = b.def;
            }
            // Migrate previous wide default (220+) down a bit for first load after update
            if (saved >= 210 && saved <= 230) {
                saved = b.def;
            }
            this.applyHomePaneWidth(saved, false);
        },
        /* Keep windowWidth reactive and re-apply home-pane mode on resize */
        syncHomePaneForWindow() {
            let w = window.innerWidth || 0;
            if (this.windowWidth !== w) {
                this.windowWidth = w;
            }
            // After reactive update, useHomeSplit may have flipped — layout in next tick
            this.$nextTick(function() {
                if (this.homePaneResizing) {
                    return;
                }
                this.initHomePaneWidth();
                if (this.useHomeSplit) {
                    this.$nextTick(function() {
                        this.initHomePaneSortable();
                        this.setWide();
                        this.layoutGrid();
                    }.bind(this));
                } else {
                    mskSortableDestroy(this.homePaneSortable);
                    this.homePaneSortable = undefined;
                    this.setWide();
                    this.layoutGrid();
                }
            }.bind(this));
        },
        homePaneResizeStart(ev) {
            if (this.homePaneResizing) {
                return;
            }
            // Bound handlers so removeEventListener matches addEventListener
            if (!this._homePaneResizeMoveBound) {
                this._homePaneResizeMoveBound = this.homePaneResizeMove.bind(this);
                this._homePaneResizeEndBound = this.homePaneResizeEnd.bind(this);
            }
            this.homePaneResizing = true;
            let pageX = ev.pageX || ev.clientX;
            if (undefined==pageX && ev.touches && ev.touches[0]) {
                pageX = ev.touches[0].pageX || ev.touches[0].clientX;
            }
            let view = document.getElementById('browse-view');
            let cur = view
                ? parseInt(getComputedStyle(view).getPropertyValue('--browse-home-pane-w'), 10)
                : parseInt(getComputedStyle(document.documentElement).getPropertyValue('--browse-home-pane-w'), 10);
            let b = this.homePaneWidthBounds();
            if (isNaN(cur) || cur < b.min) {
                cur = b.def;
            }
            this.homePaneResize = { startX: pageX, startW: cur, updated: cur };
            document.documentElement.classList.add('browse-home-pane-resizing');
            // Non-passive so touch resize works reliably
            window.addEventListener('mousemove', this._homePaneResizeMoveBound, false);
            window.addEventListener('touchmove', this._homePaneResizeMoveBound, { passive: false });
            window.addEventListener('mouseup', this._homePaneResizeEndBound, false);
            window.addEventListener('touchend', this._homePaneResizeEndBound, false);
            window.addEventListener('touchcancel', this._homePaneResizeEndBound, false);
            try { if (ev.cancelable) { ev.preventDefault(); } } catch (e) {}
        },
        homePaneResizeMove(ev) {
            if (!this.homePaneResizing || !this.homePaneResize) {
                return;
            }
            let pageX = ev.pageX || ev.clientX;
            if (undefined==pageX && ev.touches && ev.touches[0]) {
                pageX = ev.touches[0].pageX || ev.touches[0].clientX;
            }
            if (undefined==pageX) {
                return;
            }
            try { if (ev.cancelable) { ev.preventDefault(); } } catch (e) {}
            // Left pane: drag right → wider
            let next = this.homePaneResize.startW + (pageX - this.homePaneResize.startX);
            this.homePaneResize.updated = this.applyHomePaneWidth(next, false);
            if (!this.homePaneResizeRaf) {
                this.homePaneResizeRaf = requestAnimationFrame(function() {
                    this.homePaneResizeRaf = undefined;
                    this.setWide();
                    this.layoutGrid();
                }.bind(this));
            }
        },
        homePaneResizeEnd() {
            if (!this.homePaneResizing) {
                return;
            }
            if (this._homePaneResizeMoveBound) {
                window.removeEventListener('mousemove', this._homePaneResizeMoveBound);
                window.removeEventListener('touchmove', this._homePaneResizeMoveBound);
                window.removeEventListener('mouseup', this._homePaneResizeEndBound);
                window.removeEventListener('touchend', this._homePaneResizeEndBound);
                window.removeEventListener('touchcancel', this._homePaneResizeEndBound);
            }
            document.documentElement.classList.remove('browse-home-pane-resizing');
            if (this.homePaneResize && undefined!=this.homePaneResize.updated) {
                // Snap to icon rail or comfortable wide when releasing the handle
                let snapped = this.snapHomePaneWidth(this.homePaneResize.updated);
                // If drag started from icons and user pulled wider, force wide snap
                let b = this.homePaneWidthBounds();
                if (this.homePaneResize.startW <= b.iconMax && this.homePaneResize.updated > b.iconMax) {
                    snapped = Math.max(b.wideMin, this.homePaneResize.updated);
                    if (snapped < b.wideMin + 12) {
                        snapped = b.wideMin;
                    }
                }
                // If drag started wide and user pushed narrow, force icon snap
                if (this.homePaneResize.startW >= b.wideMin && this.homePaneResize.updated < b.wideMin) {
                    snapped = b.min;
                }
                // Manual drag overrides temporary auto-icon state
                this.homePaneAutoIcons = false;
                this.applyHomePaneWidth(snapped, true);
            }
            this.homePaneResizing = false;
            this.homePaneResize = undefined;
            this.setWide();
            this.layoutGrid();
        },
        entry(item, text) {
            if (this.fetchingItem!=undefined) {
                return;
            }
            this.enteredTerm = text;
            if (undefined==this.enteredTerm) {
                return
            }
            this.enteredTerm=this.enteredTerm.trim();
            if (isEmpty(this.enteredTerm)) {
                return;
            }
            if (item.type=='search') {
                this.fetchItems(this.buildCommand(item), item);
            } else {
                this.doTextClick(item);
            }
        },
        itemMoreMenu(item, queueIndex, page) {
            if (undefined!=queueIndex) {
                this.fetchItems({command: ["trackinfo", "items"], params: ["playlist_index:"+queueIndex, "menu:1", "html:1"], ismore:true}, item, page);
            } else if (item.id) {
                var params=[originalId(item.id), "menu:1", "html:1"];
                if (item.id.startsWith("artist_id:")) {
                    this.fetchItems({command: ["artistinfo", "items"], params: params, ismore:true}, {id:originalId(item.id), title:item.title}, page);
                } else if (item.id.startsWith("album_id:")) {
                    this.fetchItems({command: ["albuminfo", "items"], params: params, ismore:true}, {id:originalId(item.id), title:item.title}, page);
                } else if (item.id.startsWith("track_id:")) {
                    this.fetchItems({command: ["trackinfo", "items"], params: params, ismore:true}, item, page);
                } else if (item.id.startsWith("genre_id:")) {
                    this.fetchItems({command: ["genreinfo", "items"], params: params, ismore:true}, item, page);
                } else if (item.id.startsWith("year:")) {
                    this.fetchItems({command: ["yearinfo", "items"], params: params, ismore:true}, item, page);
                } else if (item.id.startsWith("playlist_id:")) {
                    this.fetchItems({command: ["playlistinfo", "items"], params: params, ismore:true}, item, page);
                }
            }
        },
        sourcesClicked() {
            // This timeout is a hacky fix for touch devices. When search is opened from home page (where 'Music sources' reacts
            // to clicks) and the back button is clicked to close - then the click 'seems' to fall through to 'Music sources' and
            // the search widget re-shown! Therefore, ingore click events on 'Music sources' for the first 750ms it is shown.
            if (undefined==this.backBtnPressTime || (new Date().getTime()-this.backBtnPressTime)>750) {
                browseItemAction(this, SEARCH_LIB_ACTION);
            }
        },
        itemAction(act, item, index, event) {
            storeClickOrTouchPos(event, this.menu);
            if (act==ALBUM_SORTS_ACTION || act==TRACK_SORTS_ACTION || act==USE_GRID_ACTION || act==USE_ALT_GRID_ACTION || act==USE_LIST_ACTION) {
                browseHeaderAction(this, act, event, true);
            } else {
                // If this is from 'Radios' scrolled list, try to convert from URL to favourite ID
                if (undefined!=item && item.ihe && item.id.startsWith("radio.")) {
                    lmsCommand("", ["favorites", "exists", item.url]).then(({data}) => {
                        if (data && data.result && 1==parseInt(data.result.exists)) {
                            let copy = JSON.parse(JSON.stringify(item));
                            copy.params = {item_id: "aabbccdd."+data.result.index};
                            browseItemAction(this, act, copy, index, event, RADIOS_BASE_ACTIONS);
                        } else {
                            browseItemAction(this, act, item, index, event);
                        }
                    }).catch(err => {
                        browseItemAction(this, act, item, index, event);
                    });
                } else {
                    browseItemAction(this, act, item, index, event);
                }
            }
        },
        menuItemAction(act, item, index, event) {
            if (act==SELECT_ACTION && this.searchActive) {
                this.searchActive = 0;
                this.highlightIndex = -1;
                this.highlightSubIndex = -1;
                this.clearBrowseKbSelect();
            }
            storeClickOrTouchPos(event, this.menu);
            let itm = undefined!=this.current && item.id==this.current.id && item.stdItem==STD_ITEM_MAI ? this.history[this.history.length-1].current : item;
            // Context-stats home cards: same sheet UI, custom play/remove handlers
            if (itm && itm.cstatsCard && typeof contextStatsHomeHandleAction==='function') {
                if (!this.desktopLayout && this.menu) {
                    this.menu.show = false;
                }
                if (contextStatsHomeHandleAction(this, act, itm.cstatsCard)) {
                    return;
                }
            }
            // Mobile sheet: artist/album info loads inside the drawer (slide panel)
            if (!this.desktopLayout && this.menu && this.menu.show &&
                (act==ARTIST_INFO_ACTION || act==ALBUM_INFO_ACTION) &&
                typeof this.ctxSheetLoadInfo==='function') {
                this.ctxSheetLoadInfo(itm, act==ARTIST_INFO_ACTION);
                return;
            }
            if (!this.desktopLayout && this.menu) {
                this.menu.show = false;
            }
            this.itemAction(act, itm, index, this.menu ? {clientX:this.menu.x, clientY:this.menu.y} : event);
        },
        itemMoreAction(item, index) {
            this.doTextClick(item.moremenu[index], true);
        },
        itemMenu(item, index, event) {
            if (typeof browseZoomNavBlocked==='function' && browseZoomNavBlocked()) {
                return;
            }
            browseItemMenu(this, item, index, event);
        },
        itemCanPreview(item) {
            return !!(this.desktopLayout && this.hoverBtns && item &&
                typeof browseItemCanPreviewHold==='function' && browseItemCanPreviewHold(item, this));
        },
        itemPreviewLive(item) {
            if (!this.desktopLayout || !item || !this.previewUi) {
                return false;
            }
            if (!this.previewUi.active && !this.previewUi.loading && !this.previewUi.fading) {
                return false;
            }
            return this.previewUi.itemId===item.id;
        },
        ctxPreviewToggle(event) {
            if (event) {
                try { event.preventDefault(); } catch (eP) {}
                try { event.stopPropagation(); } catch (eS) {}
            }
            let now = Date.now();
            if (this._ctxPreviewTapAt && (now - this._ctxPreviewTapAt) < 380) {
                return;
            }
            this._ctxPreviewTapAt = now;
            if (typeof browsePreviewToggle==='function' && this.menu && this.menu.item) {
                browsePreviewToggle(this, this.menu.item);
            }
        },
        contextMenu(item, index, event) {
            if (typeof browseZoomNavBlocked==='function' && browseZoomNavBlocked()) {
                return;
            }
            // Desktop right-click; mobile long-press is handled in list-swipe
            this.itemMenu(item, index, event);
        },
        showMore(item) {
            if (item.morecmd) {
                if (item.all) { // Random Releases
                    let resp = {items:item.all.items, title:item.title, subtitle:item.all.subtitle, canUseGrid: true, gridType: GRID_STANDARD};
                    browseHandleListResponse(this, item, item.all.command, resp, undefined, false);
                } else {
                    let command = JSON.parse(JSON.stringify(item.morecmd));
                    browseReplaceCommandTerms(this, command, item);
                    command.params.push("features:hi");
                    this.fetchItems(command, {cancache:false, slimbrowse:item.slimbrowse, id:item.id, title: item.title, limit:item.limit, section:item.section, isFavFolder:item.isFavFolder});
                }
            } else if (item.allItems) {
                browseAddHistory(this);
                this.items = item.allItems;
                this.headerSubTitle = item.subtitle;
                this.current = item;
                this.searchActive = 0;
                if (undefined!=item.searchcat && item.searchcat!=SEARCH_TRACKS_CAT && (item.searchcat!=SEARCH_PLAYLISTS_CAT || lmsOptions.playlistImages)) {
                    this.grid = {allowed:true, use:!item.useList, type:GRID_STANDARD};
                    this.layoutGrid(true);
                    this.currentActions=[{action:SEARCH_LIST_ACTION}, {action:item.useList ? USE_GRID_ACTION : USE_LIST_ACTION}];
                }
                if (item.menu && item.menu.length>0 && item.menu[0]==PLAY_ALL_ACTION) {
                    this.tbarActions=[ADD_ALL_ACTION, PLAY_ALL_ACTION];
                }
                browseSetScroll(this);
            } else if (item.slimbrowse) {
                browseClick(this, item);
            }
        },
        currentActionsMenu(event) {
            if (this.$store.state.visibleMenus.size>0 && undefined!=this.menu && undefined!=this.menu.currentActions) {
                return;
            }
            let actions = [];
            for (let i=0, loop=this.currentActions, len=loop.length; i<len; ++i) {
                if ( (queryParams.party && HIDE_FOR_PARTY.has(loop[i].action)) ||
                     (LMS_KIOSK_MODE && HIDE_FOR_KIOSK.has(loop[i].action)) ||
                     (PLAY_SHUFFLE_ACTION==loop[i].action && (!lmsOptions.playShuffle || (this.wide>=WIDE_MIX_BTN && this.showDetailedSubtoolbar))) ||
                     (INSERT_ACTION==loop[i].action && this.wide>=WIDE_MIX_BTN && this.showDetailedSubtoolbar && !lmsOptions.playShuffle) ||
                     (this.tbarActions.length<2 && (i<(this.tbarActions.length<2 ? 2 : 1))) ||
                     ((ALBUM_SORTS_ACTION==loop[i].action || TRACK_SORTS_ACTION==loop[i].action) && this.items.length<2) ||
                     ((ALBUM_SORTS_ACTION==loop[i].action || ADD_RANDOM_ALBUM_ACTION==loop[i].action) && this.current && this.current.stdItem==STD_ITEM_WORK) ||
                     (SCROLL_TO_ACTION==loop[i].action &&
                        (!this.items[0].id.startsWith(FILTER_PREFIX) ||
                         (this.items.length < (this.grid.allowed && this.grid.use ? (this.grid.numColumns*10) : 50) ) ) ) ||
                     (((loop[i].stdItem==STD_ITEM_MAI && this.showMaiButton) || (loop[i].stdItem==STD_ITEM_MIX && this.wide>=WIDE_MIX_BTN)) && this.showDetailedSubtoolbar) ||
                     (loop[i].action==DIVIDER && (0==actions.length || actions[actions.length-1].action==DIVIDER)) ||
                     ((loop[i].albumRating || loop[i].stdItem==STD_ITEM_MAI) && this.current && this.current.stdItem==STD_ITEM_MAI)) {
                    continue;
                }
                if (loop[i].action>-0 && undefined!=document.getElementById("tbar-actions"+loop[i].action)) {
                    // With detailed sub-toolbar sometime we show 'Play', and have 'Play Shuffled' instead of 'Append to queue'.
                    // This is not in currentActions, so its now missing. Therefore, if we have a 'Play Shuffled' toolbutton
                    // visible but not a 'Append to queue' button - add 'Append to queue' where 'Play shuffled' would have ben
                    // in menu.
                    if (loop[i].action==PLAY_SHUFFLE_ACTION && undefined==document.getElementById("tbar-actions"+ADD_ACTION)) {
                        actions.push({action:ADD_ACTION});
                    }
                    continue;
                }
                actions.push(loop[i]);
            }
            showMenu(this, {show:true, currentActions:actions, x:event.clientX, y:event.clientY});
        },
        doContext(type) {
            for (let i=0, loop=this.currentActions, len=loop.length; i<len; ++i) {
                if (loop[i].stdItem==type) {
                    this.currentAction(loop[i]);
                    return;
                }
            }
        },
        currentAction(act, index, event) {
            storeClickOrTouchPos(event, this.menu);
            let stdItem = this.current ? (this.current.stdItem ? this.current.stdItem : this.current.altStdItem) : undefined;
            let item = undefined!=this.current && stdItem==STD_ITEM_MAI ? this.history[this.history.length-1].current : this.current;
            if (undefined!=act.action) {
                browseHeaderAction(this, act.action, event)
            } else if (undefined!=act.command) {
                lmsCommand(this.playerId(), act.command);
            } else if (act.isListItemInMenu) {
                this.click(act);
            } else if (act.albumRating) {
                this.setAlbumRating();
            } else if (act.custom) {
                let browseCmd = performCustomAction(act, this.$store.state.player, item);
                if (undefined!=browseCmd) {
                    this.fetchItems(browseCmd, {cancache:false, id:"currentaction:"+index, title:act.title+SEPARATOR+item.title});
                }
            } else if (undefined!=act.do) {
                let title = item.origTitle ? item.origTitle : item.title;
                let origTitle = (act.stdItem==STD_ITEM_ALL_TRACKS || act.stdItem==STD_ITEM_COMPOSITION_TRACKS || act.stdItem==STD_ITEM_CLASSICAL_WORKS ? undefined : (item.noReleaseGrouping ? title.split(SEPARATOR)[0] : title));
                let command = act.stdItem==STD_ITEM_ALL_TRACKS || act.stdItem==STD_ITEM_COMPOSITION_TRACKS || act.stdItem==STD_ITEM_CLASSICAL_WORKS || act.stdItem==STD_ITEM_ARTIST ? browseReplaceCommandTerms(this, act.do, item) : act.do;

                // If navigating via a user-defined role can go artist->guitarist->vocals->guitarist->vocals, etc, and don't want a massive history!
                if (undefined!=act.udr && this.history.length>0) {
                    for (let loop=this.history, i=loop.length-1; i>=0; --i) {
                        if (undefined!=loop[i].command && undefined!=loop[i].command.command && undefined!=loop[i].command.params && arraysEqual(loop[i].command.command, command.command) && arraysEqual(loop[i].command.params, command.params)) {
                            this.goTo(i);
                            break;
                        }
                    }
                }

                this.fetchItems(command,
                                {cancache:false, id:"currentaction:"+index, title:act.udr && origTitle ? origTitle : act.title+(origTitle ? SEPARATOR+origTitle : ""), subtitle:act.subtitle, origTitle:origTitle,
                                 image:act.stdItem ? this.currentImage : undefined, stdItem:act.stdItem});
                if (STD_ITEM_MAI==act.stdItem) {
                    browseFetchExtra(this, act.do.command[1]=="biography");
                }
            } else {
                var cmd = {command:["browseonlineartist", "items"], params:["service_id:"+act.id, "artist_id:"+act.artist_id, "menu:1"]};
                this.fetchItems(cmd, {cancache:false, id:act.id, title:act.title+SEPARATOR+item.title, command:cmd.command, params:cmd.params});
            }
        },
        itemCustomAction(act, item, index) {
            let browseCmd = performCustomAction(act, this.$store.state.player, item);
            if (undefined!=browseCmd) {
                this.fetchItems(browseCmd, {cancache:false, id:"itemCustomAction:"+item.id+"-"+index, title:act.title+SEPARATOR+item.title});
            }
        },
        linkAction(item) {
            if (FOLLOW_LINK_ACTION==item.act) {
                openWindow(item.link);
            } else if (SEARCH_TEXT_ACTION==item.act) {
                bus.$emit('browse-search', item.text);
            }
        },
        clickSubtitle(item, index, event) {
            storeClickOrTouchPos(event, this.menu);
            if (this.selection.size>0) {
                this.select(item, index, event);
                return;
            }
            if ((IS_MOBILE && !lmsOptions.touchLinks) && this.grid.allowed && this.grid.use) {
                this.itemMenu(item, index, event);
            } else if ((!IS_MOBILE || lmsOptions.touchLinks) && this.subtitlesClickable && item.id && item.artist_id && item.id.startsWith("album_id:")) {
                if (item.subIsYear) {
                    bus.$emit("browse", "year", item.subtitle, item.subtitle, "browse");
                    return;
                }
                browseItemAction(this, GOTO_ARTIST_ACTION, item, null, event);
            } else {
                this.click(item, index, event);
            }
        },
        showHistory(event) {
            if (this.fusionMode || this.history.length<1) {
                return;
            }
            let history=[];
            for (let i=0, loop=this.history, len=loop.length; i<len; ++i) {
                let hi = {title:0==i ? i18n("Home") : (loop[i].headerTitle + (loop[i].current && loop[i].current.stdItem==STD_ITEM_ALBUM && loop[i].current.subIsYear ? " (" + loop[i].current.subtitle + ")" : "") )};
                if (undefined!=loop[i].historyExtra) {
                    hi.title += SEPARATOR + loop[i].historyExtra;
                }
                if (0==i) {
                    hi.icon = 'home';
                } else if (undefined!=loop[i].current) {
                    hi.svg = loop[i].current.svg;
                    hi.icon = undefined==loop[i].current.icon && 'search'==loop[i].current.type ? 'search' : loop[i].current.icon;
                    hi.image = loop[i].current.image;
                }
                history.push(hi);
            }
            let pos = typeof getTouchOrClickPos==='function' ? getTouchOrClickPos(event) : {x:(event && event.clientX) || 0, y:(event && event.clientY) || 0};
            if (typeof storeClickOrTouchPos==='function') {
                storeClickOrTouchPos(event, this.menu);
            }
            showMenu(this, {show:true, x:pos.x || 0, y:pos.y || 0, history:history});
        },
        titlePressed(longPress, el, event) {
            if (this.fusionMode || this.history.length<1) {
                return;
            }
            if (longPress) {
                this._titleDidLongPress = Date.now();
                this.showHistory(event);
                return;
            }
            if (this._titleDidLongPress && (Date.now() - this._titleDidLongPress)<450) {
                return;
            }
            this.showHistory(event);
        },
        headerAction(act, event) {
            storeClickOrTouchPos(event, this.menu);
            browseHeaderAction(this, act, event);
        },
        changeLayout(useGrid) {
            if (!this.grid.allowed) {
                useGrid = false;
            }
            // Leaving fusion when switching classic layouts
            if (this.fusionMode) {
                this.fusionMode = false;
                setLocalStorageVal('browseFusion', false);
            }
            if (this.grid.use!=useGrid) {
                this.grid.use=useGrid;
                this.$nextTick(function () {
                    this.setBgndCover();
                    if (this.isTop) {
                        this.items = this.grid.use && this.$store.state.detailedHomeItems.length>0 ? this.topExtra.concat(this.top) : this.top;
                    }
                    this.layoutGrid(true);
                    if (this.$store.state.gridPerView) {
                        setUseGrid(gridCommand(this), this.grid.use, this.current);
                    } else {
                        setLocalStorageVal('grid', useGrid);
                    }
                    this.setLayoutAction();
                    if (typeof this.browseZoomSyncLayout === 'function') {
                        this.browseZoomSyncLayout();
                    }
                    this.$forceUpdate();
                    // Scroll to top. Without this, on iPad with iOS12 at least, grid->list scroll becomes slugish.
                    // But if user clicks on jumplist (which would call setScrollTop) then scrolling improves???
                    setScrollTop(this, 0);
                });
            } else {
                this.setLayoutAction();
            }
        },
        /**
         * My Music third view: list → grid → fusion panel → list.
         * Uses the same toolbar "Toggle view" control as classic layout.
         */
        cycleMyMusicView() {
            if (!this.current || this.current.id!=TOP_MYMUSIC_ID) {
                return;
            }
            if (this.fusionMode) {
                // fusion → list
                this.fusionMode = false;
                setLocalStorageVal('browseFusion', false);
                this.changeLayout(false);
                return;
            }
            if (this.grid.use) {
                // grid → fusion panel
                this.setFusionMode(true);
                this.setLayoutAction();
                return;
            }
            // list → grid
            this.changeLayout(true);
        },
        setFusionMode(on) {
            this.fusionMode = !!on;
            setLocalStorageVal('browseFusion', this.fusionMode);
            // Fusion only lives on My Music root
            if (this.fusionMode && (!this.current || this.current.id!=TOP_MYMUSIC_ID)) {
                let mm = undefined;
                for (let i=0, len=this.top.length; i<len; ++i) {
                    if (this.top[i].id==TOP_MYMUSIC_ID) {
                        mm = this.top[i];
                        break;
                    }
                }
                if (mm) {
                    browseClick(this, mm, undefined, undefined, true, true);
                }
            }
            this.setLayoutAction();
            // Sync pinch-zoom token for fusion album grid
            if (this.fusionMode && typeof browseZoomSetCss==='function' && typeof browseZoomReadStored==='function') {
                try { browseZoomSetCss(browseZoomReadStored()); } catch (e) {}
            }
        },
        /** ESC from fusion: leave My Music unified view and return to home (not grid icons). */
        leaveFusionToMain() {
            this.fusionMode = false;
            setLocalStorageVal('browseFusion', false);
            this.setLayoutAction();
            // Restore subheader if fusion scroll had toggled it
            try {
                this.setBrowseSubheaderOffset(0);
                this.browseSubheaderHidden = false;
            } catch (e) {}
            if (typeof this.goHome === 'function') {
                this.goHome();
            } else if (this.history && this.history.length>0) {
                this.goBack();
            }
        },
        setLayoutAction() {
            // My Music: button icon = *next* view (list → grid → panel → list)
            if (this.current && this.current.id==TOP_MYMUSIC_ID) {
                var nextAct = this.fusionMode
                    ? USE_LIST_ACTION
                    : (this.grid.use ? USE_ALT_GRID_ACTION /* stands in for panel/fusion icon */ : USE_GRID_ACTION);
                // Prefer grid-plus (USE_ALT) as "panel" cue when next is fusion
                if (!this.fusionMode && this.grid.use) {
                    nextAct = USE_ALT_GRID_ACTION;
                }
                for (var i=0, loop=this.currentActions, len=loop.length; i<len; ++i) {
                    if (loop[i].action==USE_GRID_ACTION || loop[i].action==USE_LIST_ACTION || loop[i].action==USE_ALT_GRID_ACTION) {
                        loop[i].action = nextAct;
                        break;
                    }
                }
                return;
            }
            var af = this.grid.use ? USE_GRID_ACTION : USE_LIST_ACTION;
            var af2 = this.grid.use ? USE_ALT_GRID_ACTION : USE_LIST_ACTION;
            var at = this.grid.use ? USE_LIST_ACTION : this.isTop && this.$store.state.detailedHomeItems.length>0 ? USE_ALT_GRID_ACTION : USE_GRID_ACTION;
            for (var i=0, loop=this.currentActions, len=loop.length; i<len; ++i) {
                if (loop[i].action == af || loop[i].action == af2) {
                    loop[i].action = at;
                    break;
                }
            }
            if (this.isTop) {
                var af = this.$store.state.detailedHomeItems.length ? USE_GRID_ACTION : USE_ALT_GRID_ACTION;
                var at = this.$store.state.detailedHomeItems.length ? USE_ALT_GRID_ACTION : USE_GRID_ACTION;
                for (var i=0, loop=this.currentActions, len=loop.length; i<len; ++i) {
                    if (loop[i].action == af) {
                        loop[i].action = at;
                        break;
                    }
                }
            }
        },
        refreshList(restorePosition) {
            if (this.isTop) {
                if (this.$store.state.detailedHomeItems.length>0) {
                    this.getHomeExtra();
                }
                return;
            }
            this.clearSelection();
            // Only need to reload   list if we had one already...
            var refreshWorks = this.items.length>0 && this.items[0].isWorksCat;
            var pos = undefined==restorePosition || restorePosition ? this.scrollElement.scrollTop : 0;
            var stdItem = this.current ? (this.current.stdItem ? this.current.stdItem : this.current.altStdItem) : undefined;
            var count = stdItem==STD_ITEM_PLAYLIST ? this.items.length : LMS_BATCH_SIZE;
            this.fetchingItem = this.current.id;
            // Slow to load large playlists, so limit refresh length for these...
            if (stdItem==STD_ITEM_PLAYLIST && count>LMS_MAX_PLAYLIST_EDIT_SIZE) {
                return;
            }
            lmsList(this.playerId(), this.command.command, this.command.params, 0, count, this.current.cancache).then(({data}) => {
                var resp = parseBrowseResp(data, this.current, this.options, this.current.cancache && browseCanUseCache(this) ? cacheKey(this.command.command, this.command.params, 0, LMS_BATCH_SIZE) : undefined);
                this.items=resp.items;
                this.listSize=resp.listSize;
                this.jumplist=resp.jumplist;
                this.filterJumplist();
                this.layoutGrid(true);
                if (resp.subtitle) {
                    this.headerSubTitle = resp.subtitle;
                    this.detailedSubInfo = resp.plainsubtitle ? resp.plainsubtitle : resp.years ? resp.years : "&nbsp;";
                } else {
                    this.headerSubTitle=0==this.items.length ? i18n("Empty") : i18np("1 Item", "%1 Items", this.items.length);
                }
                this.$nextTick(function () {
                    setScrollTop(this, pos>0 ? pos : 0);
                    this.filterJumplist();
                });
                this.fetchingItem = undefined;
                if (refreshWorks) {
                    browseAddWorks(this, this.current);
                }
            }).catch(err => {
                logAndShowError(err, undefined, this.command.command, this.command.params);
                this.fetchingItem = undefined;
            });
        },
        homeBtnPressed() {
            if (this.$store.state.visibleMenus.size<1) {
                this.goHome();
            }
        },
        goHome() {
            this.homePaneSelectedId = HOME_PANE_HOME_ID;
            this.homePaneSwipeOpenId = undefined;
            try { browseGoHome(this); } catch (e) {} // goHome can be called (due to initUiSettings) before deferred JS is loaded...
        },
        goTo(index) {
            if (index>=this.history.length) {
                return;
            }
            if (0==index) {
                this.goHome();
            } else {
                while (index<this.history.length-1) {
                    this.history.pop();
                }
                this.goBack();
            }
        },
        closeSearch() {
            this.goBack();
        },
        backBtnPressed(longPress) {
            if (this.$store.state.visibleMenus.size>0 && !longPress) {
                return;
            }
            this.backBtnPressTime = new Date().getTime();
            if (longPress) {
                this.goHome();
            } else {
                this.goBack();
            }
            this.lastBackBtnPress = this.backBtnPressTime;
        },
        goBack(refresh) {
            browseGoBack(this, refresh);
        },
        buildCommand(item, commandName, doReplacements) {
            return browseBuildCommand(this, item, commandName, doReplacements);
        },
        replaceCommandTerms(cmd, item) {
            return browseReplaceCommandTerms(this, cmd, item);
        },
        setLibrary() {
            this.libraryName = undefined;
            lmsList("", ["libraries"]).then(({data}) => {
                if (data && data.result && data.result.folder_loop && data.result.folder_loop.length>0) {
                    for (var i=0, loop=data.result.folder_loop, len=loop.length; i<len; ++i) {
                        if (loop[i].id == this.$store.state.library) {
                            this.libraryName=LMS_DEFAULT_LIBRARIES.has(""+loop[i]) ? i18n("All tracks") : loop[i].name.replace(SIMPLE_LIB_VIEWS, "");
                            break;
                        }
                    }
                    if (undefined==this.libraryName) {
                        this.libraryName=i18n("All tracks");
                    }
                }
            });
        },
        myMusicMenu() {
            browseMyMusicMenu(this);
        },
        processMyMusicMenu() {
            this.myMusic=browseSortCategories(this.myMusicAll, this.myMusicArtist, this.myMusicRelease, this.myMusicOther);
            for (var i=0, len=this.myMusic.length; i<len; ++i) {
                if (!this.myMusic[i].header) {
                    this.myMusic[i].menu=[this.options.pinned.has(this.myMusic[i].id) ? UNPIN_ACTION : PIN_ACTION];
                }
            }
            if (this.current && TOP_MYMUSIC_ID==this.current.id) {
                this.items = this.myMusic;
                this.grid = {allowed:true, use:this.$store.state.gridPerView ? isSetToUseGrid(GRID_OTHER) : getLocalStorageBool('grid', true), numItems:0, numColumns:0, ih:GRID_MIN_HEIGHT, rows:[], few:false, haveSubtitle:true, multiSize:false, type:GRID_STANDARD};
                this.tbarActions=[];
                this.currentActions=[{action:VLIB_ACTION}, {action:(this.grid.use ? USE_LIST_ACTION : USE_GRID_ACTION)}];
                if (!this.$store.state.browseSearch) {
                    this.currentActions.push({action:SEARCH_LIB_ACTION});
                }
                this.layoutGrid(true);
            } else if (this.history.length>1 && this.history[1].current && this.history[1].current.id==TOP_MYMUSIC_ID) {
                this.history[1].items = this.myMusic;
            }
        },
        updateTopList(items) {
            let updated = false;
            let extras = undefined;
            for (let i=0, len=this.top.length; i<len && undefined==extras; ++i) {
                if (this.top[i].id==TOP_EXTRAS_ID) {
                    extras = this.top[i];
                }
            }
            this.top=[];
            lmsOptions.randomMixDialogPinned = false;
            let seenIds = new Set();
            for (let i=0, len=items.length; i<len; ++i) {
                if (items[i].id==TOP_CDPLAYER_ID || items[i].id==TOP_REMOTE_ID) {
                    updated = true; // No longer show CD Player, or Remote Libraries, so want list saved to remove this
                } else if (seenIds.has(items[i].id)) {
                    updated = true;
                } else {
                    seenIds.add(items[i].id);
                    this.top.push(items[i]);
                    if (items[i].id==START_RANDOM_MIX_ID) {
                        lmsOptions.randomMixDialogPinned = true;
                    }
                }
            }
            this.initItems();
            let hasExtras = false;
            for (var i=0, len=this.top.length; i<len; ++i) {
                if (this.top[i].id.startsWith(TOP_ID_PREFIX)) {
                    this.top[i].menu = undefined;
                    if (this.top[i].id==TOP_EXTRAS_ID) {
                        hasExtras = true;
                    } else if (this.top[i].id==TOP_RADIO_ID) {
                        this.top[i].icon=undefined; this.top[i].svg="radio-tower";
                    }
                } else if (!this.top[i].id.startsWith(TOP_ID_PREFIX)) {
                    // Check for previously pinned item with library name, and try to separate
                    if (!this.top[i].libname && this.top[i].params && this.top[i].params.length>0 && this.top[i].params[this.top[i].params.length-1].startsWith('library_id:')) {
                        var parts = this.top[i].title.split(SEPARATOR);
                        if (2==parts.length) {
                            this.top[i].title = parts[0];
                            this.top[i].libname = parts[1];
                            updated = true;
                        }
                    }
                    this.options.pinned.add(this.top[i].id);
                }
            }
            if (!hasExtras && undefined!=extras) {
                this.top.push(extras);
            }
            for (var i=0, len=this.top.length; i<len; ++i) {
                if (this.top[i].id==TOP_ID_PREFIX+"ps") {
                    this.top.splice(i, 1);
                    break;
                }
            }
            if (updated) {
                this.saveTopList();
            }
        },
        saveTopList() {
            setLocalStorageVal("topItems", JSON.stringify(this.top));
            removeLocalStorage("pinned");
            bus.$emit('homeScreenItems', this);
        },
        addPinned(pinned) {
            browseAddPinned(this, pinned);
        },
        pin(item, add, mapped) {
            browsePin(this, item, add, mapped);
        },
        invertSelection() {
            if (this.selection.size==this.items.length) {
                this.clearSelection();
                return;
            }
            this.selection = new Set();
            this.selectionDuration = 0;
            for (var i=0, len=this.items.length; i<len; ++i) {
                let item = this.items[i];
                if (!item.header && browseCanSelect(item)) {
                    if (item.selected) {
                        item.selected = false;
                    } else {
                        this.selection.add(i);
                        item.selected = true;
                        this.selectionDuration += itemDuration(item);
                    }
                }
            }
        },
        clearSelection() {
            var selection = Array.from(this.selection);
            var numSelected = selection.length;
            for (var i=0, len=numSelected; i<len; ++i) {
                var index = selection[i];
                if (index>-1 && index<this.items.length) {
                    if (this.items[index].menu) {
                        var idx = this.items[index].menu.indexOf(UNSELECT_ACTION);
                        if (idx>-1) {
                            this.items[index].menu[idx]=SELECT_ACTION;
                        }
                    }
                    this.items[index].selected = false;
                }
            }
            this.selection = new Set();
            this.selectionDuration = 0;
            this.lastSelect = undefined;
            bus.$emit('browseSelection', false);
            if (numSelected>0) {
                refreshViewItems(this);
            }
        },
        select(item, index, event) {
            if (this.selection.size>0) {
                if (item.header) {
                    var haveSel = false;
                    var haveUnsel = false;

                    for (var i=index+1, len=this.items.length; i<len && this.items[i].filter==item.id && (!haveSel || !haveUnsel); ++i) {
                        if (this.selection.has(i)) {
                            haveSel = true;
                        } else {
                            haveUnsel = true;
                        }
                    }
                    for (var i=index+1, len=this.items.length; i<len && this.items[i].filter==item.id; ++i) {
                        if (haveUnsel && !this.selection.has(i)) {
                            this.itemAction(SELECT_ACTION, this.items[i], i, event);
                        } else if (!haveUnsel && haveSel && this.selection.has(i)) {
                            this.itemAction(UNSELECT_ACTION, this.items[i], i, event);
                        }
                    }
                } else {
                    this.itemAction(this.selection.has(index) ? UNSELECT_ACTION : SELECT_ACTION, item, index, event);
                }
                this.$forceUpdate();
            }
        },
        deleteSelectedItems(act, event) {
            storeClickOrTouchPos(event, this.menu);
            var selection = Array.from(this.selection);
            if (1==selection.size) {
                this.itemAction(act, this.items[selection[0]], selection[0]);
            } else {
                confirm(REMOVE_ACTION==act || REMOVE_FROM_FAV_ACTION==act ? i18n("Remove the selected items?") : i18n("Delete the selected items?"),
                        REMOVE_ACTION==act || REMOVE_FROM_FAV_ACTION==act ? i18n("Remove") : i18n("Delete")).then(res => {
                    if (res) {
                        var ids=[];
                        selection.sort((a, b) => (undefined!=this.items[b].realIndex ? this.items[b].realIndex : b) - (undefined!=this.items[b].realIndex ? this.items[a].realIndex : a));
                        if (REMOVE_ACTION==act) {
                            selection.forEach(idx => {ids.push("index:"+idx)});
                            bus.$emit('doAllList', ids, ["playlists", "edit", "cmd:delete", this.current.id], this.current.section);
                        } else {
                            selection.forEach(idx => {ids.push(this.items[idx].id)});
                            bus.$emit('doAllList', ids, this.current.section==SECTION_PLAYLISTS ? ["playlists", "delete"] : ["favorites", "delete"],
                                      this.current.section);
                        }
                        this.clearSelection();
                    }
                });
            }
        },
        actionSelectedItems(act, event) {
            storeClickOrTouchPos(event, this.menu);
            var selection = Array.from(this.selection);
            var itemList = [];
            selection.sort(function(a, b) { return a<b ? -1 : 1; });
            for (var i=0, len=selection.length; i<len; ++i) {
                itemList.push(this.items[selection[i]]);
            }
            if (ADD_TO_PLAYLIST_ACTION==act) {
                bus.$emit('dlg.open', 'addtoplaylist', itemList);
            } else {
                this.doList(itemList, act);
            }
            this.clearSelection();
        },
        doList(list, act, index) {
            browseDoList(this, list, act, index);
        },
        pushScrollBlockGap(suffix) {
            this.grid.rows.push({spacer:true, size:SCROLL_BLOCK_GAP, id:"row.scroll.gap."+suffix, ihe:true, rs:0});
        },
        browseSubheaderHeight() {
            let subH = 48;
            try {
                subH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sub-toolbar-height')) || 48;
            } catch (e) { /* ignore */ }
            let extra = (this.browseShowOverflowPanel ? 56 : 0);
            if (this.browseCatalogHero && !this.browseSubheaderCompact) {
                let cat = 108;
                try {
                    cat = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--browse-catalog-height')) || 108;
                } catch (e2) { /* ignore */ }
                return cat + extra;
            }
            if (this.showDetailedSubtoolbar) {
                if (this.showTrackListCommands && this.isTrackList) {
                    return (subH * 3) + extra;
                }
                return (subH * 2) + extra;
            }
            return subH + extra;
        },
        setBrowseSubheaderOffset(offset) {
            offset = Math.max(0, offset);
            if (this.browseSubheaderOffset!=offset) {
                this.browseSubheaderOffset = offset;
                document.documentElement.style.setProperty('--browse-subheader-offset', offset+'px');
            }
        },
        /** Compact = clean single-line title (no translate hide). */
        browseCollapseSubheader() {
            if (this.searchActive==1 || this.browseSearchInputFocused()) {
                return;
            }
            if (!BROWSE_SUBHEADER_COLLAPSE || !this.browseMobilePullChrome || !(this.showDetailedSubtoolbar || this.browseCatalogHero)) {
                return;
            }
            if (this.browseOverflowOpen && Date.now()<(this._browseOverflowLockUntil||0)) {
                return;
            }
            this.setBrowseSubheaderOffset(0);
            this.browseSubheaderHidden = true;
            this.browseOverflowOpen = false;
        },
        /** Expanded = title + details + action buttons. */
        browseExpandSubheader() {
            this.setBrowseSubheaderOffset(0);
            this.browseSubheaderHidden = false;
        },
        browseOverflowShowAction(item) {
            if (!item) {
                return false;
            }
            if (undefined==item.action) {
                return true;
            }
            let a = item.action;
            if (a==SEARCH_LIST_ACTION) {
                return false;
            }
            if (a==VLIB_ACTION) {
                return this.allowVLibOnHome;
            }
            return true;
        },
        openBrowseOverflow() {
            if (this.searchActive==1 || this.selection.size>0) {
                return;
            }
            this.browseOverflowPulling = false;
            this.browseOverflowPullPx = 0;
            this.browseOverflowOpen = true;
            this._browseOverflowLockUntil = Date.now() + 420;
            if (!this.browseCstatsHomeChrome) {
                this.browseExpandSubheader();
            }
            this.lastBrowseScroll = 0;
            try {
                if (this.scrollElement && (this.scrollElement.scrollTop || 0) > 8) {
                    this.scrollElement.scrollTop = 0;
                }
            } catch (e) {}
            this.$nextTick(function() {
                this.setBrowseSubheaderOffset(0);
            }.bind(this));
        },
        openBrowseOverflowFilter(event) {
            if (event) {
                storeClickOrTouchPos(event);
            }
            this.openBrowseOverflow();
        },
        closeBrowseOverflowFilter(event) {
            if (event) {
                storeClickOrTouchPos(event);
            }
            if (this.searchActive==2 && !this.listFilterTerm) {
                this.searchActive = 0;
            }
        },
        browseSearchInputFocused() {
            try {
                let ae = document.activeElement;
                if (!ae || (ae.tagName!=='INPUT' && ae.tagName!=='TEXTAREA')) {
                    return false;
                }
                return !!(ae.closest && ae.closest('.lms-search, .lms-search-field, .lms-search-list-row, .browse-overflow-panel, #browse-search-field, #lms-search-kb-ghost'));
            } catch (e) {
                return false;
            }
        },
        holdBrowseOverflow() {
            this.browseOverflowOpen = true;
            this._browseOverflowLockUntil = Date.now() + 120000;
            this.browseExpandSubheader();
        },
        closeBrowseOverflow() {
            if (this.browseSearchInputFocused()) {
                this._browseOverflowLockUntil = Date.now() + 120000;
                return;
            }
            this.browseOverflowPulling = false;
            this.browseOverflowPullPx = 0;
            if (!this.browseOverflowOpen) {
                return;
            }
            this.browseOverflowOpen = false;
            if (this.searchActive==2 && !this.listFilterTerm) {
                this.searchActive = 0;
            }
            this.$nextTick(function() {
                this.setBrowseSubheaderOffset(0);
            }.bind(this));
        },
        toggleBrowseOverflow(event) {
            if (event) {
                storeClickOrTouchPos(event);
            }
            if (this.browseOverflowOpen) {
                this.closeBrowseOverflow();
            } else {
                this.openBrowseOverflow();
            }
        },
        applyBrowseCatalogPalette(palette) {
            let root = document.documentElement;
            if (!palette || !palette[0]) {
                this.clearBrowseCatalogPalette();
                return;
            }
            try {
                root.style.setProperty('--browse-catalog-p1', morphRgb2Hex(palette[0]));
                root.style.setProperty('--browse-catalog-p2', morphRgb2Hex(palette[1] || palette[0]));
                root.style.setProperty('--browse-catalog-p3', morphRgb2Hex(palette[2] || palette[1] || palette[0]));
            } catch (e) {}
            this.catalogPaletteActive = true;
            this.syncBrowseCatalogChrome();
        },
        clearBrowseCatalogPalette() {
            let root = document.documentElement;
            try {
                root.style.removeProperty('--browse-catalog-p1');
                root.style.removeProperty('--browse-catalog-p2');
                root.style.removeProperty('--browse-catalog-p3');
            } catch (e) {}
            this.catalogPaletteActive = false;
            this.syncBrowseCatalogChrome();
        },
        syncBrowseCatalogChrome() {
            let hero = this.browseCatalogHero && !this.browseSubheaderCompact;
            let tint = hero && this.$store.state.browseCatalogTintToolbar && this.catalogPaletteActive;
            try {
                document.documentElement.classList.toggle('browse-catalog-active', !!hero);
                document.documentElement.classList.toggle('browse-catalog-tint', !!tint);
            } catch (e) {}
        },
        extractBrowseCatalogPalette(url) {
            this._catalogPaletteUrl = url;
            if (!url || typeof Vibrant==='undefined' || typeof extractPalette!=='function') {
                this.clearBrowseCatalogPalette();
                return;
            }
            let img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = function() {
                if (this._catalogPaletteUrl!=url) {
                    return;
                }
                try {
                    let vibrant = new Vibrant(img);
                    let swatches = vibrant.swatches();
                    let darkUi = this.$store.state.darkUi;
                    let avRgb = (typeof swatchRgb==='function' && (swatchRgb(swatches, 'Vibrant') || swatchRgb(swatches, 'Muted'))) || [72, 72, 78];
                    this.applyBrowseCatalogPalette(extractPalette(swatches, darkUi, avRgb));
                } catch (e) {
                    this.clearBrowseCatalogPalette();
                }
            }.bind(this);
            img.onerror = function() {
                if (this._catalogPaletteUrl==url) {
                    this.clearBrowseCatalogPalette();
                }
            }.bind(this);
            img.src = url;
        },
        /* Hex mix for chrome SVGs (CSS color-mix is not usable in ?c= URLs). */
        _mixHex(a, b, ta) {
            function parse(h) {
                h = (h || '').replace('#', '').trim();
                if (h.length === 3) {
                    h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
                }
                if (h.length < 6) {
                    return null;
                }
                return [parseInt(h.slice(0,2), 16), parseInt(h.slice(2,4), 16), parseInt(h.slice(4,6), 16)];
            }
            var A = parse(a), B = parse(b);
            if (!A || !B) {
                return (a || '').replace('#', '');
            }
            ta = Math.max(0, Math.min(1, ta));
            var r = Math.round(A[0]*ta + B[0]*(1-ta));
            var g = Math.round(A[1]*ta + B[1]*(1-ta));
            var bl = Math.round(A[2]*ta + B[2]*(1-ta));
            return ((1<<24) + (r<<16) + (g<<8) + bl).toString(16).slice(1);
        },
        /* Normalize a CSS hex/rgb color string to 6-digit hex without '#'. */
        _cssColorToHex(raw) {
            if (!raw) {
                return '';
            }
            var c = String(raw).replace("#", "").trim();
            if (c.indexOf('(')>=0) {
                try {
                    var m = c.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
                    if (m) {
                        c = ((1<<24) + (parseInt(m[1])<<16) + (parseInt(m[2])<<8) + parseInt(m[3])).toString(16).slice(1);
                    } else {
                        return '';
                    }
                } catch (e) {
                    return '';
                }
            }
            if (c.length === 3) {
                c = c[0]+c[0]+c[1]+c[1]+c[2]+c[2];
            }
            return c.length >= 6 ? c.slice(0, 6) : '';
        },
        /* Contrast-safe full + muted ink from a base hex (no #). */
        _inkPairFromBase(baseHex, textCol) {
            if (!baseHex || baseHex.length < 6) {
                return null;
            }
            if (!textCol || textCol.length < 3) {
                textCol = this.darkUi ? 'eeeeee' : '333333';
            }
            var base = baseHex;
            if (typeof ensureThemeContrast==='function') {
                try {
                    var pr = parseInt(base.slice(0,2), 16);
                    var pg = parseInt(base.slice(2,4), 16);
                    var pb = parseInt(base.slice(4,6), 16);
                    if (!isNaN(pr) && !isNaN(pg) && !isNaN(pb)) {
                        var fixed = ensureThemeContrast([pr, pg, pb], !!this.darkUi);
                        base = ((1<<24) + (fixed[0]<<16) + (fixed[1]<<8) + fixed[2]).toString(16).slice(1);
                    }
                } catch (e4) {}
            }
            // Match CSS: ink ~90–92% base, muted ~55–62% base + text
            var full = this._mixHex(base, textCol, this.darkUi ? 0.92 : 0.90);
            var muted = this._mixHex(base, textCol, this.darkUi ? 0.62 : 0.55);
            if (typeof ensureThemeContrast==='function' && typeof contrastRatio==='function') {
                try {
                    var mr = parseInt(muted.slice(0,2), 16), mg = parseInt(muted.slice(2,4), 16), mb = parseInt(muted.slice(4,6), 16);
                    var bg = this.darkUi ? [28, 30, 32] : [250, 250, 250];
                    if (!isNaN(mr) && contrastRatio([mr, mg, mb], bg) < 2.8) {
                        muted = this._mixHex(muted, textCol, 0.45);
                        mr = parseInt(muted.slice(0,2), 16); mg = parseInt(muted.slice(2,4), 16); mb = parseInt(muted.slice(4,6), 16);
                        if (!isNaN(mr) && contrastRatio([mr, mg, mb], bg) < 2.8) {
                            var mfix = ensureThemeContrast([mr, mg, mb], !!this.darkUi, 2.9);
                            muted = ((1<<24) + (mfix[0]<<16) + (mfix[1]<<8) + mfix[2]).toString(16).slice(1);
                        }
                    }
                } catch (e5) {}
            }
            return { full: full, muted: muted };
        },
        /*
         * Header chrome: primary accent.
         * Sidebar (home split + pins): secondary extracted palette (--np-bar-palette-2).
         * Home mono icons outside the sidebar stay theme LMS_DARK/LIGHT_SVG.
         */
        syncChromeSvgCol() {
            var primary = '';
            var secondary = '';
            var textCol = '';
            try {
                var el = document.getElementById("browse-view") || document.documentElement;
                var cs = getComputedStyle(el);
                primary = this._cssColorToHex(cs.getPropertyValue("--primary-color"));
                secondary = this._cssColorToHex(cs.getPropertyValue("--np-bar-palette-2"));
                textCol = this._cssColorToHex(cs.getPropertyValue("--sub-toolbar-text-color") || cs.getPropertyValue("--text-color"));
            } catch (e) {}
            if ((!primary || primary.length<3) && typeof colorMorph!=='undefined' && colorMorph.current && colorMorph.current.primary) {
                try {
                    primary = morphRgb2Hex(colorMorph.current.primary).replace("#", "");
                } catch (e2) {}
            }
            if ((!secondary || secondary.length<3) && typeof colorMorph!=='undefined' && colorMorph.current && colorMorph.current.palette2) {
                try {
                    secondary = morphRgb2Hex(colorMorph.current.palette2).replace("#", "");
                } catch (e2b) {}
            }
            if (!secondary || secondary.length<3) {
                secondary = primary;
            }
            if (!primary || primary.length<3) {
                return;
            }
            if (!textCol || textCol.length<3) {
                textCol = this.darkUi ? 'eeeeee' : '333333';
            }
            var headerInk = this._inkPairFromBase(primary, textCol);
            if (headerInk) {
                if (headerInk.full !== this.chromeSvgCol) {
                    this.chromeSvgCol = headerInk.full;
                }
                if (headerInk.muted !== this.chromeSvgColMuted) {
                    this.chromeSvgColMuted = headerInk.muted;
                }
            }
            var sideInk = this._inkPairFromBase(secondary, textCol);
            if (sideInk) {
                if (sideInk.full !== this.sidebarSvgCol) {
                    this.sidebarSvgCol = sideInk.full;
                }
                if (sideInk.muted !== this.sidebarSvgColMuted) {
                    this.sidebarSvgColMuted = sideInk.muted;
                }
                // Live CSS for Material icons / v-icon in the home sidebar
                try {
                    var root = document.documentElement;
                    root.style.setProperty('--browse-sidebar-ink', '#' + sideInk.full);
                    root.style.setProperty('--browse-sidebar-ink-muted', '#' + sideInk.muted);
                } catch (eCss) {}
            }
        },
        browseAtListTop() {
            let el = this.scrollElement;
            if (!el) {
                return true;
            }
            if ((el.scrollTop || 0) > 24) {
                return false;
            }
            let p = el.parentElement;
            if (p && (p.scrollTop || 0) > 24) {
                return false;
            }
            return true;
        },
        browsePullPointer(ev) {
            if (!ev) {
                return null;
            }
            if (ev.touches && ev.touches[0]) {
                return { x: ev.touches[0].clientX, y: ev.touches[0].clientY };
            }
            if (ev.changedTouches && ev.changedTouches[0]) {
                return { x: ev.changedTouches[0].clientX, y: ev.changedTouches[0].clientY };
            }
            if (undefined!=ev.clientY) {
                return { x: ev.clientX, y: ev.clientY };
            }
            return null;
        },
        browsePullChromeStart(ev) {
            if (this.searchActive==1 || this.selection.size>0) {
                return;
            }
            if (this.$store && this.$store.state.npSheetOpen) {
                return;
            }
            if (ev && ev.touches && ev.touches.length>1) {
                return;
            }
            if (typeof browseZoomNavBlocked==='function' && browseZoomNavBlocked()) {
                return;
            }
            let pt = this.browsePullPointer(ev);
            if (!pt) {
                return;
            }
            this._browsePull = {
                x: pt.x,
                y: pt.y,
                armed: this.browseAtListTop(),
                fromOpen: !!this.browseOverflowOpen,
                max: this.browseOverflowFullHeight,
                moved: false
            };
        },
        browsePullChromeMove(ev) {
            let p = this._browsePull;
            if (!p || !p.armed) {
                return;
            }
            if (this.listSwipe && this.listSwipe.mode==='h') {
                this.browsePullChromeCancel();
                return;
            }
            if (ev && ev.touches && ev.touches.length>1) {
                this.browsePullChromeCancel();
                return;
            }
            if (typeof browseZoomNavBlocked==='function' && browseZoomNavBlocked()) {
                this.browsePullChromeCancel();
                return;
            }
            let pt = this.browsePullPointer(ev);
            if (!pt) {
                return;
            }
            let dy = pt.y - p.y;
            let dx = Math.abs(pt.x - p.x);
            if (!p.moved && dx>18 && dx>Math.abs(dy)*1.15) {
                p.armed = false;
                this.browseOverflowPulling = false;
                return;
            }
            if (!this.browseAtListTop() && !this.browseOverflowPulling) {
                p.armed = false;
                return;
            }
            let full = p.max || this.browseOverflowFullHeight;
            if (!p.fromOpen) {
                if (dy<=6) {
                    return;
                }
                try { ev.preventDefault(); } catch (e) {}
                p.moved = true;
                this.browseOverflowPulling = true;
                let h = dy;
                if (h>full) {
                    h = full + (h-full)*0.22;
                }
                this.browseOverflowPullPx = Math.max(0, h);
            } else {
                if (this.browseSearchInputFocused()) {
                    return;
                }
                if (dy>=0) {
                    try { ev.preventDefault(); } catch (e) {}
                    p.moved = true;
                    this.browseOverflowPulling = true;
                    this.browseOverflowPullPx = full + dy*0.22;
                } else if (Date.now()>(this._browseOverflowLockUntil||0)) {
                    try { ev.preventDefault(); } catch (e) {}
                    p.moved = true;
                    this.browseOverflowPulling = true;
                    this.browseOverflowPullPx = Math.max(0, full + dy);
                }
            }
        },
        browsePullChromeEnd() {
            let p = this._browsePull;
            this._browsePull = undefined;
            if (!this.browseOverflowPulling) {
                return;
            }
            let full = this.browseOverflowFullHeight;
            let h = this.browseOverflowPullPx;
            this.browseOverflowPulling = false;
            this.browseOverflowPullPx = 0;
            if (h >= full*0.42) {
                this.openBrowseOverflow();
            } else {
                this.closeBrowseOverflow();
            }
        },
        browsePullChromeCancel() {
            this._browsePull = undefined;
            if (this.browseOverflowPulling) {
                this.browseOverflowPulling = false;
                this.browseOverflowPullPx = 0;
            }
        },
        browseWheelPull(ev) {
            if (!this.browseMobilePullChrome || this.searchActive==1 || this.selection.size>0 || this.$store.state.npSheetOpen) {
                return;
            }
            if (!this.browseAtListTop()) {
                return;
            }
            // Trackpad / mouse wheel: swipe down (content pulled down) → negative deltaY
            if (ev.deltaY< -10) {
                this.openBrowseOverflow();
            } else if (ev.deltaY>10 && this.browseOverflowOpen && Date.now()>(this._browseOverflowLockUntil||0) && !this.browseSearchInputFocused()) {
                this.closeBrowseOverflow();
            }
        },
        browseCanTempDockLift() {
            // One-line miniplayer only; docked chrome at bottom of browse
            if (this.$store.state.desktopLayout || this.$store.state.npSheetOpen) {
                return false;
            }
            if (typeof MBAR_THIN==='undefined' || this.$store.state.mobileBar!=MBAR_THIN) {
                return false;
            }
            let app = document.querySelector('.lms-app');
            return !!(app && app.classList.contains('np-bar-docked'));
        },
        browseTouchStart(ev) {
            if (this.$store.state.npSheetOpen || undefined==this.scrollElement) {
                return;
            }
            if (typeof this.browseZoomTouchStart === 'function' && this.browseZoomTouchStart(ev)) {
                return;
            }
            let pt = this.browsePointerFromEvent(ev);
            if (!pt) {
                return;
            }
            this.browseDockLiftStart = undefined;
            // Thin + docked: pull up from the bottom of the list to temporarily raise chrome
            if (this.browseCanTempDockLift() && ev.touches && 1==ev.touches.length) {
                let rect = this.scrollElement.getBoundingClientRect();
                let fromBottom = rect.bottom - pt.y;
                if (fromBottom>=0 && fromBottom<=80) {
                    this.browseDockLiftStart = { x:pt.x, y:pt.y };
                }
            }
            // Page swipe-back candidate (full page). Item swipe takes priority when it locks.
            this.browseNavSwipe = undefined;
            this.browseNavSwipeBlocked = false;
            if (this.history && this.history.length>0) {
                this.browseNavSwipe = { x:pt.x, y:pt.y, t:Date.now() };
            }
            // Song/album row swipe: left=play next, right=append (list-swipe / itemSwipe)
            this.itemSwipeBegin(pt, ev);
            if (ev.touches && ev.touches.length>1) {
                return;
            }
            // Pull-down at top: reveal tools row (filter + extra actions) — mobile only
            if (this.browseMobilePullChrome && this.browseAtListTop()) {
                this.browsePullStart = { y:pt.y, wasCompact:!!this.browseSubheaderHidden, overflowWasOpen:!!this.browseOverflowOpen };
            }
        },
        browseTouchMove(ev) {
            if (typeof this.browseZoomTouchMove === 'function' && this.browseZoomTouchMove(ev)) {
                return;
            }
            let pt = this.browsePointerFromEvent(ev);
            // Temp dock lift (thin): finger up from bottom zone → raise miniplayer/shortcuts
            if (this.browseDockLiftStart && pt) {
                let dyUp = this.browseDockLiftStart.y - pt.y;
                let dx = Math.abs(pt.x - this.browseDockLiftStart.x);
                if (dyUp>30 && dyUp>dx*1.15) {
                    this.browseDockLiftStart = undefined;
                    this.browseNavSwipe = undefined;
                    try { bus.$emit('npBarTempLift'); } catch (e) {}
                } else if (dx>24 && dx>dyUp) {
                    this.browseDockLiftStart = undefined;
                }
            }
            // Item swipe owns the gesture once it locks horizontal — cancel page-back
            if (pt && this.itemSwipeMove(pt, ev)) {
                this.browseNavSwipe = undefined;
                this.browseNavSwipeBlocked = true;
                this.browseDockLiftStart = undefined;
                return;
            }
            if (this.listSwipe && this.listSwipe.mode==='h') {
                this.browseNavSwipe = undefined;
                this.browseNavSwipeBlocked = true;
                this.browseDockLiftStart = undefined;
                return;
            }
            // Page-back: clear if gesture turns vertical (scroll)
            if (this.browseNavSwipe && pt) {
                let dx = pt.x - this.browseNavSwipe.x;
                let dy = Math.abs(pt.y - this.browseNavSwipe.y);
                if (dy>dx && dy>18) {
                    this.browseNavSwipe = undefined;
                }
            }
            if (this.$store.state.npSheetOpen || undefined==this.browsePullStart || undefined==this.scrollElement) {
                return;
            }
            if (!this.browseAtListTop()) {
                return;
            }
            let y = (ev.touches && ev.touches[0]) ? ev.touches[0].clientY
                : (pt ? pt.y : undefined);
            if (undefined==y) {
                return;
            }
            let dy = y - this.browsePullStart.y;
            if (dy>16) {
                this.browseExpandSubheader();
            }
        },
        browseTouchEnd(ev) {
            let pinchEnded = typeof this.browseZoomTouchEnd === 'function' && this.browseZoomTouchEnd(ev);
            if (pinchEnded || (typeof browseZoomNavBlocked==='function' && browseZoomNavBlocked())) {
                this.browseNavSwipe = undefined;
                this.browsePullStart = undefined;
            }
            // Page swipe-back: horizontal right motion, not claimed by item/list swipe
            let itemJustHandled = !!this._browseItemSwipeJustHandled;
            this._browseItemSwipeJustHandled = false;
            let didNavBack = false;
            if (!itemJustHandled && this.browseNavSwipe && !this.browseNavSwipeBlocked &&
                this.history && this.history.length>0) {
                let pt = this.browsePointerFromEvent(ev);
                if (pt) {
                    let dx = pt.x - this.browseNavSwipe.x;
                    let dy = Math.abs(pt.y - this.browseNavSwipe.y);
                    // Finger moves right → go back (iPod). Ignore if mostly vertical.
                    // Slightly easier threshold on mobile so swipe-back is reliable in grids.
                    if (dx>=(IS_MOBILE ? 48 : 64) && dx>dy*1.1) {
                        didNavBack = true;
                    }
                }
            }
            this.browseNavSwipe = undefined;
            this.browseNavSwipeBlocked = false;
            if (didNavBack) {
                this.itemSwipeCancel();
                if (this.listSwipe) {
                    this.listSwipe = null;
                    bus.$emit('browseItemSwipeActive', false);
                }
                this.browsePullStart = undefined;
                this.goBack();
                return;
            }
            this.itemSwipeEnd(ev);
            this.browsePullStart = undefined;
            this.browseDockLiftStart = undefined;
        },
        browsePointerFromEvent(ev) {
            if (ev.touches && ev.touches.length>0) {
                return { x:ev.touches[0].clientX, y:ev.touches[0].clientY, touch:true };
            }
            if (ev.changedTouches && ev.changedTouches.length>0) {
                return { x:ev.changedTouches[0].clientX, y:ev.changedTouches[0].clientY, touch:true };
            }
            if (undefined!=ev.clientX) {
                return { x:ev.clientX, y:ev.clientY, touch:false };
            }
            return undefined;
        },
        browseFindSwipeRow(target) {
            if (!target || !target.closest) {
                return undefined;
            }
            // Prefer the element that carries id="itemN" (v-list-tile root or inner tile)
            let row = target.closest('[id^="item"]');
            if (row && row.id && /^item\d+$/.test(row.id)) {
                return row;
            }
            row = target.closest('.lms-list-item, .v-list__tile');
            if (row) {
                // Walk up a level if the tile itself has no item id
                let withId = row.closest('[id^="item"]') || row;
                if (withId && withId.id && /^item\d+$/.test(withId.id)) {
                    return withId;
                }
            }
            return undefined;
        },
        browseSwipeableSong(item) {
            if (!item || item.header || item.type=='text' || item.type=='html' || item.type=='search' || item.type=='entry' || undefined!=item.input) {
                return false;
            }
            if (queryParams.party) {
                return false;
            }
            let si = item.stdItem;
            // Tracks (and online/playlist track rows)
            if (si==STD_ITEM_TRACK || si==STD_ITEM_ALBUM_TRACK || si==STD_ITEM_PLAYLIST_TRACK ||
                si==STD_ITEM_REMOTE_PLAYLIST_TRACK) {
                return true;
            }
            // Fallback: track_id items
            if (item.id && (''+item.id).indexOf('track_id:')>=0) {
                return true;
            }
            return false;
        },
        itemSwipeBegin(pt, ev) {
            // Prefer shared list-swipe library when wired
            if (typeof listSwipeMethods!=='undefined') {
                return;
            }
            this.itemSwipe = undefined;
            let row = this.browseFindSwipeRow(ev && ev.target);
            if (!row || !row.id || !/^item\d+$/.test(row.id)) {
                return;
            }
            let index = parseInt(row.id.replace(/^item/, ''), 10);
            if (isNaN(index) || index<0 || index>=this.items.length) {
                return;
            }
            let item = this.items[index];
            if (!this.browseSwipeableSong(item)) {
                return;
            }
            if (!this.allowAdd(item) && !this.allowInsert(item)) {
                return;
            }
            // Prefer animating the visible tile face
            let el = row.classList && row.classList.contains('v-list__tile')
                ? row
                : (row.querySelector && row.querySelector('.v-list__tile')) || row;
            this.itemSwipe = {
                x: pt.x,
                y: pt.y,
                index: index,
                item: item,
                el: el,
                row: row,
                mode: undefined,
                dx: 0,
                // Block native HTML5 drag on desktop while we may swipe
                wasDraggable: !!(row.draggable)
            };
            try { row.draggable = false; } catch (ex) {}
            // Stop dragstart from stealing the gesture (desktop)
            this._itemSwipeBlockDrag = function(e) {
                try { e.preventDefault(); } catch (ex) {}
                try { e.stopPropagation(); } catch (ex) {}
            };
            row.addEventListener('dragstart', this._itemSwipeBlockDrag, true);
        },
        itemSwipeRestoreDraggable(sw) {
            let row = sw && (sw.row || sw.el);
            if (row && this._itemSwipeBlockDrag) {
                row.removeEventListener('dragstart', this._itemSwipeBlockDrag, true);
            }
            this._itemSwipeBlockDrag = undefined;
            if (row) {
                try { row.draggable = !!sw.wasDraggable; } catch (ex) {}
            }
        },
        itemSwipeMove(pt, ev) {
            if (!this.itemSwipe) {
                return false;
            }
            let dx = pt.x - this.itemSwipe.x;
            let dy = pt.y - this.itemSwipe.y;
            if (undefined==this.itemSwipe.mode) {
                if (Math.abs(dx)<12 && Math.abs(dy)<12) {
                    return false;
                }
                // Slightly favor horizontal so row swipe wins over list scroll jitter
                if (Math.abs(dx)>Math.abs(dy)*1.05 && Math.abs(dx)>=12) {
                    this.itemSwipe.mode = 'h';
                    // Tell app-level page/queue swipe to ignore this gesture
                    bus.$emit('browseItemSwipeActive', true);
                } else if (Math.abs(dy)>=12) {
                    // Vertical scroll — abort row swipe cleanly
                    this.itemSwipeRestoreDraggable(this.itemSwipe);
                    this.itemSwipe = undefined;
                    return false;
                } else {
                    return false;
                }
            }
            if ('h'!=this.itemSwipe.mode) {
                return false;
            }
            // Lock the gesture so list scroll / app swipe don't steal it
            if (ev && ev.cancelable) {
                try { ev.preventDefault(); } catch (ex) {}
            }
            this.itemSwipe.dx = Math.max(-96, Math.min(96, dx));
            if (this.itemSwipe.el) {
                this.itemSwipe.el.style.transition = 'none';
                this.itemSwipe.el.style.transform = 'translateX(' + this.itemSwipe.dx + 'px)';
                this.itemSwipe.el.classList.add('browse-item-swiping');
                this.itemSwipe.el.classList.toggle('browse-item-swipe-left', this.itemSwipe.dx<-20);
                this.itemSwipe.el.classList.toggle('browse-item-swipe-right', this.itemSwipe.dx>20);
            }
            return true;
        },
        itemSwipeCancel() {
            if (!this.itemSwipe) {
                return;
            }
            let sw = this.itemSwipe;
            this.itemSwipe = undefined;
            this.itemSwipeRestoreDraggable(sw);
            if (sw.el) {
                sw.el.style.transition = '';
                sw.el.style.transform = '';
                sw.el.classList.remove('browse-item-swiping', 'browse-item-swipe-left', 'browse-item-swipe-right');
            }
            bus.$emit('browseItemSwipeActive', false);
        },
        itemSwipeEnd(ev) {
            if (!this.itemSwipe) {
                return;
            }
            let sw = this.itemSwipe;
            this.itemSwipe = undefined;
            let el = sw.el;
            // Final dx from end position when available
            let pt = this.browsePointerFromEvent(ev);
            let dx = sw.dx || 0;
            if (pt && 'h'==sw.mode) {
                dx = Math.max(-96, Math.min(96, pt.x - sw.x));
            }
            this.itemSwipeRestoreDraggable(sw);
            if (el) {
                el.style.transition = 'transform 0.2s ease';
                el.style.transform = '';
                el.classList.remove('browse-item-swiping', 'browse-item-swipe-left', 'browse-item-swipe-right');
                setTimeout(function() {
                    if (el) { el.style.transition = ''; }
                }, 220);
            }
            bus.$emit('browseItemSwipeActive', false);
            if ('h'!=sw.mode || Math.abs(dx)<48) {
                return;
            }
            // Suppress the click that often follows a finger/mouse swipe
            this.suppressBrowseClickUntil = Date.now() + 450;
            bus.$emit('browseItemSwipeHandled');
            // Left → play next (insert); right → append to queue
            // (Not remove — that only applies on the queue page, not yet implemented.)
            if (dx<-48 && this.allowInsert(sw.item)) {
                this.itemAction(INSERT_ACTION, sw.item, sw.index, ev);
                bus.$emit('showMessage', ACTIONS[INSERT_ACTION].title || i18n('Play next'));
            } else if (dx>48 && this.allowAdd(sw.item)) {
                this.itemAction(ADD_ACTION, sw.item, sw.index, ev);
                bus.$emit('showMessage', ACTIONS[ADD_ACTION].title || i18n('Append to queue'));
            }
        },
        browsePointerDown(ev) {
            if (this.$store.state.npSheetOpen || (ev.button!==undefined && ev.button!==0)) {
                return;
            }
            // Skip when starting on interactive controls
            if (ev.target && ev.target.closest && ev.target.closest('button, .v-btn, a, input, .menu-btn, .grid-btn, .list-btn')) {
                return;
            }
            let pt = this.browsePointerFromEvent(ev);
            if (pt) {
                this.itemSwipeBegin(pt, ev);
                if (this.itemSwipe) {
                    window.addEventListener("mousemove", this.browsePointerMove, false);
                    window.addEventListener("mouseup", this.browsePointerUp, false);
                }
            }
        },
        browsePointerMove(ev) {
            if (!this.itemSwipe) {
                return;
            }
            let pt = this.browsePointerFromEvent(ev);
            if (pt) {
                this.itemSwipeMove(pt, ev);
            }
        },
        browsePointerUp(ev) {
            window.removeEventListener("mousemove", this.browsePointerMove, false);
            window.removeEventListener("mouseup", this.browsePointerUp, false);
            this.itemSwipeEnd(ev);
        },
        handleScroll() {
            this.menu.show = false;
            // While temp-lifted (thin dock peek), keep resetting auto-contract during scroll
            try {
                let app = document.querySelector('.lms-app');
                if (app && app.classList.contains('np-bar-temp-lift')) {
                    bus.$emit('npBarTempLiftPing');
                }
            } catch (e) {}
            if (!this.$store.state.desktopLayout && this.scrollElement) {
                bus.$emit('mobileContentScroll', this.scrollElement.scrollTop || 0);
            }
            if (BROWSE_SUBHEADER_COLLAPSE && this.browseMobilePullChrome && undefined!=this.scrollElement && !this.$store.state.npSheetOpen) {
                let scrollTop = this.scrollElement.scrollTop || 0;
                let last = this.lastBrowseScroll || 0;
                // Only collapse the tall detailed / catalog chrome (album/artist). Simple titles stay put.
                if (this.browseOverflowOpen) {
                    if (this.browseSearchInputFocused()) {
                        this.lastBrowseScroll = scrollTop;
                        return;
                    }
                    if (Date.now()<(this._browseOverflowLockUntil||0)) {
                        this.lastBrowseScroll = scrollTop;
                        return;
                    }
                    let hideAt = Math.max(28, Math.round((this.browseOverflowFullHeight||56) * 0.35));
                    if (scrollTop>hideAt && scrollTop>=last) {
                        this.closeBrowseOverflow();
                    }
                    this.lastBrowseScroll = scrollTop;
                    return;
                }
                if (this.showDetailedSubtoolbar || this.browseCatalogHero) {
                    if (scrollTop>24 && scrollTop>last+2) {
                        // Scrolling down → clean title only
                        this.browseCollapseSubheader();
                    } else if (scrollTop<last-6 && scrollTop<48) {
                        // Near top and scrolling up → expand details again
                        this.browseExpandSubheader();
                    }
                } else {
                    this.browseExpandSubheader();
                }
                this.lastBrowseScroll = scrollTop;
            }
            if (undefined==this.scrollAnim) {
                this.scrollAnim = requestAnimationFrame(() => {
                    this.scrollAnim = undefined;
                    if (undefined!=this.current && (this.current.slimbrowse || STD_ITEM_PLAYLIST==(this.current.stdItem ? this.current.stdItem : this.current.altStdItem))) {
                        // Fetch more items?
                        if (undefined!=this.fetchingItem || this.listSize<=this.items.length) {
                            return;
                        }
                        const scrollY = this.scrollElement.scrollTop;
                        const visible = this.scrollElement.clientHeight;
                        const pageHeight = this.scrollElement.scrollHeight;
                        const pad = (visible*2.5);
                        const bottomOfPage = (visible + scrollY) >= (pageHeight-(pageHeight>pad ? pad : 300));

                        if (bottomOfPage || pageHeight < visible) {
                            this.fetchItems(this.command, this.current, undefined, this.items.length);
                        }
                    }
                });
            }
            msHandleScrollEvent(this);
        },
        calcSizes(quantity, listWidth, maxItemWidth, adjust, skipZoom) {
            var width = (this.grid.type == GRID_ICON_ONLY_ONLY ? GRID_MIN_WIDTH_NARROW_ICON_ONLY : window.innerWidth<=NARROW_WIDTH ? GRID_MIN_WIDTH_NARROW : GRID_MIN_WIDTH)-adjust;
            var height = (this.grid.type == GRID_ICON_ONLY_ONLY ? GRID_MIN_HEIGHT_NARROW_ICON_ONLY : window.innerWidth<=NARROW_WIDTH ? GRID_MIN_HEIGHT_NARROW : GRID_MIN_HEIGHT)-adjust;
            var steps = 0;
            if (0!=quantity) {
                while (listWidth>=((width+GRID_STEP)*quantity) && (width+GRID_STEP)<=maxItemWidth) {
                    width += GRID_STEP;
                    height += GRID_STEP;
                    steps++;
                }
            }
            // How many columns?
            var maxColumns = Math.floor(listWidth / width);
            var numColumns = Math.max(Math.min(maxColumns, 20), 1);
            var sz = {w: width, h: height, s: steps, mc: maxColumns, nc: numColumns};
            if (!skipZoom && typeof browseZoomApplySize === 'function') {
                sz = browseZoomApplySize(sz, listWidth, this.browseZoomLevel());
            }
            return sz;
        },
        /**
         * Available width for grid columns. Prefer measuring the real list
         * clientWidth (not scrollWidth — overflow from a bad prior layout
         * inflates scrollWidth and causes even more columns / overlapping cells).
         */
        layoutGridListWidth() {
            const LEFT_PADDING = 4;
            const RIGHT_PADDING = 4;
            var sbarSize = IS_MOBILE ? 0 : getScrollBarSize();
            var list = this.scrollElement || document.getElementById('browse-list');
            var measured = 0;
            var jumpAlreadyApplied = false;
            if (list && list.clientWidth > 80) {
                measured = list.clientWidth;
                // #browse-list already narrows itself when jumplist is shown
                jumpAlreadyApplied = list.classList.contains('lms-image-grid-jump') ||
                    list.classList.contains('lms-list-jump');
            } else {
                var main = document.querySelector('#browse-view .browse-main-pane');
                if (main && main.clientWidth > 80 &&
                    (main.classList.contains('browse-main-pane-split') || this.useHomeSplit)) {
                    measured = main.clientWidth;
                } else {
                    var view = this.pageElement || document.getElementById('browse-view');
                    // clientWidth, never scrollWidth (overflow must not inflate layout)
                    measured = view && view.clientWidth > 80
                        ? view.clientWidth
                        : (window.innerWidth || 0);
                    if (this.useHomeSplit) {
                        var homePane = document.getElementById('browse-home-pane');
                        if (homePane && homePane.offsetWidth > 0) {
                            measured = Math.max(200, measured - homePane.offsetWidth);
                        } else {
                            measured = Math.max(200, measured - Math.min(320, measured * 0.34));
                        }
                    }
                }
            }
            var jump = jumpAlreadyApplied ? 0 : JUMP_LIST_WIDTH;
            return Math.max(160, measured - (sbarSize + jump + LEFT_PADDING + RIGHT_PADDING));
        },
        layoutGrid(force) {
            if (!this.grid.allowed || !this.grid.use) {
                if (typeof this.browseZoomSyncLayout === 'function') {
                    this.browseZoomSyncLayout();
                }
                return;
            }
            // Keep CSS --browse-zoom in sync with layout math (list mode resets it to 1)
            if (typeof browseZoomSetCss === 'function') {
                browseZoomSetCss(typeof this.browseZoomLevel === 'function' ? this.browseZoomLevel() : undefined);
            }
            var changed = false;
            var haveSubtitle = false;
            var listWidth = this.layoutGridListWidth();
            // Used for home-extra / topExtra row heights (horizontal scroller rows need scrollbar allowance)
            var sbarSize = IS_MOBILE ? 0 : getScrollBarSize();
            var sz = undefined;
            let type = this.grid.type;
            if (GRID_TEXT_ONLY == this.grid.type) {
                var width = this.items.length>0 && this.items[0].stdItem==STD_ITEM_GENRE ? 150 : 100;
                var height = 64;
                var maxColumns = Math.floor(listWidth / width);
                var numColumns = Math.max(Math.min(maxColumns, 20), 1);
                var extra = Math.floor(((listWidth - (width*numColumns))/numColumns)/5);
                sz = {w: width+(extra*5), h: height, s:extra, mc:maxColumns, nc:numColumns};
                if (typeof browseZoomApplySize === 'function') {
                    sz = browseZoomApplySize(sz, listWidth, this.browseZoomLevel());
                }
            } else {
                let iconOnly = this.isTop || this.items.length<=200;
                if (iconOnly && !this.isTop) {
                    for (let i=0, len=this.items.length; i<len && iconOnly; ++i) {
                        // ihe == is home extra item (e.g recentply layed list, etc...)
                        if (undefined==this.items[i].ihe && undefined==this.items[i].icon && undefined==this.items[i].svg) {
                            iconOnly = false;
                        }
                    }
                }
                let smallIconOnly = iconOnly && window.innerWidth<=NARROW_WIDTH_ICON_ONLY;
                var GRID_MAX_WIDTH = smallIconOnly
                                          ? (window.innerWidth>340 ? 140 : 100) :
                                       window.innerWidth>3500
                                          ? (iconOnly ? 230 : 268) :
                                       window.innerWidth>2500
                                          ? (iconOnly ? 185 : 218) :
                                       window.innerWidth>1750
                                          ? (iconOnly ? 165 : 188) :
                                            (iconOnly ? 140 : 163) ;
                // Mobile/new-music art: never drop below 2 columns
                var preferredColumns = smallIconOnly ? 3 : 4;
                var minColumns = (IS_MOBILE || listWidth < 600) ? 2 : 1;
                this.grid.type = smallIconOnly ? GRID_ICON_ONLY_ONLY : GRID_STANDARD;
                for (var i=preferredColumns; i>=minColumns; --i) {
                    sz = this.calcSizes(i, listWidth, GRID_MAX_WIDTH, 0);
                    if (sz.mc>=i) {
                        break;
                    }
                }
                if (sz.nc < minColumns) {
                    var altsz = this.calcSizes(minColumns, listWidth, GRID_MAX_WIDTH, 2*GRID_STEP);
                    if (altsz.nc >= minColumns) {
                        sz = altsz;
                    } else if (sz.nc==1) {
                        altsz = this.calcSizes(2, listWidth, GRID_MAX_WIDTH, 2*GRID_STEP);
                        if (altsz.nc>sz.nc) {
                            sz=altsz;
                        }
                    }
                }
            }
            if (force || sz.nc != this.grid.numColumns || (this.isTop && sz.h != this.grid.szh) || type!=this.grid.type) { // Need to re-layout...
                changed = true;
                this.grid.rows = [];
                this.grid.multiSize = this.numHeaders>0;
                let items = [];
                let topExtraItems = [];
                let haveExploreInScrolledList = false;
                if (this.isTop) {
                    for (let i=0, len=this.items.length; i<len; ++i) {
                        if (undefined!=this.items[i].ihe) {
                            topExtraItems.push(this.items[i]);
                        } else if (!this.disabled.has(this.items[i].id) && !(this.hidden.has(this.items[i].id)  || (this.items[i].id==TOP_RADIO_ID && lmsOptions.combineAppsAndRadio)) && (!queryParams.party || !HIDE_TOP_FOR_PARTY.has(this.items[i].id))) {
                            items.push(this.items[i]);
                        }
                        this.items[i].gidx = i;
                    }
                } else {
                    // Non-home pages can also host horizontal ihe strips (e.g. Radio stations)
                    for (let i=0, len=this.items.length; i<len; ++i) {
                        if (undefined!=this.items[i].ihe) {
                            topExtraItems.push(this.items[i]);
                        } else {
                            items.push(this.items[i]);
                        }
                        this.items[i].gidx = i;
                    }
                }
                if (this._gridFilterTerm && 2==this.searchActive) {
                    let ft = this._gridFilterTerm;
                    topExtraItems = topExtraItems.filter(function(it) {
                        return it.header || (typeof browseListItemMatchesFilter==='function'
                                               ? browseListItemMatchesFilter(it, ft)
                                               : searchListHasStr(it, ft));
                    });
                    items = items.filter(function(it) {
                        return !it.header && (typeof browseListItemMatchesFilter==='function'
                                                ? browseListItemMatchesFilter(it, ft)
                                                : searchListHasStr(it, ft));
                    });
                }
                this.grid.numItems=items.length+topExtraItems.length;
                let rs = 0;
                let row = 0;
                // Do not insert viewport-height empty extra strips while home-extra
                // is in flight. On a slow LMS they stay forever and the real home
                // tiles render below the fold under the 3-dot loader.
                for (let i=0, len=topExtraItems.length; i<len; ++row) {
                    let rowHasSubtitle = false;
                    let rowItems=[];
                    if (i<topExtraItems.length && topExtraItems[i].header) {
                        let isExplore = topExtraItems[i].id==DETAILED_HOME_EXPLORE;
                        if (isExplore) {
                            haveExploreInScrolledList = true;
                        }
                        this.grid.multiSize=true;
                        this.grid.rows.push({item: topExtraItems[i], header:true, size:48, r:row, id:"row.extra.header."+i, rs:rs, ihe:true});
                        i+=1;
                        rs+=1;
                        if (isExplore) {
                            this.grid.multiSize = true;
                            try {
                                let packed = this.appendHomeExploreRows(items, sz, sbarSize, row, rs, haveSubtitle);
                                row = packed.row;
                                rs = packed.rs;
                                haveSubtitle = packed.haveSubtitle;
                            } catch (eExplore) {
                                console.error('appendHomeExploreRows', eExplore);
                            }
                        }
                    } else {
                        let used = 0;
                        // Home: cap strip length. Non-home (e.g. Radio stations): one continuous horizontal strip.
                        let stripAll = !this.isTop ||
                            (topExtraItems[i] && topExtraItems[i].id && (''+topExtraItems[i].id).startsWith('radio.strip.'));
                        let maxInRow = stripAll ? (topExtraItems.length - i) : MAX_HOME_EXTRA_ROW;
                        for (let j=0; j<maxInRow; ++j) {
                            let idx = i+j;
                            if (idx>=topExtraItems.length || topExtraItems[idx].header) {
                                break;
                            } else {
                                rowItems.push(topExtraItems[idx]);
                                if (topExtraItems[idx].subtitle) {
                                    haveSubtitle = true;
                                    rowHasSubtitle = true;
                                }
                                used++;
                            }
                        }
                        if (used<1 || !rowItems.length) {
                            i+=1;
                            continue;
                        }
                        // One-row height for ihe strip; avoid stacking multi-row strip + huge gaps under Radio
                        let stripH = rowHasSubtitle
                            ? (sz.h - (rowItems[0] && rowItems[0].ihe ? 4 : 0))
                            : (sz.h - GRID_SINGLE_LINE_DIFF);
                        /* Horizontal strip: only a thin pad for the scrollbar (not full sbar+8),
                         * which inflated space above the sources grid vs list mode. */
                        let stripPad = Math.min(10, Math.max(4, Math.round((sbarSize || 0) * 0.35) + 4));
                        this.grid.rows.push({id:"row."+row+"."+sz.nc, items:rowItems, r:row, rs:rs, size:stripH+stripPad, numStd:used, hasSub:rowHasSubtitle, ihe:true});
                        // Tight gap after strip (list mode is denser; avoid double spacer before next header)
                        this.grid.rows.push({spacer:true, size:6, id:"row.scroll.gap.extra."+row, ihe:true, rs:0, afterIhe:true});
                        i+=used;
                        rs+=used;
                    }
                }
                if (!this.top || !haveExploreInScrolledList) {
                    if (this.isTop && this.$store.state.detailedHomeItems && this.$store.state.detailedHomeItems.length>0) {
                        this.grid.multiSize = true;
                        try {
                            let packed = this.appendHomeExploreRows(items, sz, sbarSize, row, rs, haveSubtitle);
                            row = packed.row;
                            haveSubtitle = packed.haveSubtitle;
                        } catch (eExploreTail) {
                            console.error('appendHomeExploreRows tail', eExploreTail);
                        }
                    } else
                    for (var i=0, len=items.length; i<len; ++row) {
                        var rowHasSubtitle = this.isTop; // Always allow for subtitle with home items to make space for virtual library name
                        var rowItems=[];
                        if (i<items.length && items[i].header) {
                            this.grid.multiSize=true;
                            let prevRow = this.grid.rows.length>0 ? this.grid.rows[this.grid.rows.length-1] : null;
                            /* Don't stack another gap if the previous row was already an after-ihe spacer */
                            if (this.grid.type!=GRID_TEXT_ONLY && prevRow && prevRow.ihe && !prevRow.header && !prevRow.spacer && !prevRow.afterIhe) {
                                this.pushScrollBlockGap('before.header.'+i);
                            } else if (this.grid.type!=GRID_TEXT_ONLY && this.grid.rows.length>0 && !this.grid.rows[this.grid.rows.length-1].hasSub && !this.grid.rows[this.grid.rows.length-1].ihe && !this.grid.rows[this.grid.rows.length-1].afterIhe && !this.grid.rows[this.grid.rows.length-1].spacer) {
                                this.grid.rows.push({spacer:true, size:24, id:"row.extra.spacer."+i, ihe:true, rs:rs});
                            }
                            this.grid.rows.push({item: items[i], header:true, size:48, r:row, id:"row.header."+i, rs:rs});
                            i+=1;
                            rs+=1;
                        } else {
                            let used = 0;
                            for (var j=0; j<sz.nc; ++j) {
                                var idx = i+j;
                                if (idx<items.length && items[idx].header) {
                                    for (; j<sz.nc; ++j) {
                                        rowItems.push(undefined);
                                    }
                                    break;
                                } else {
                                    rowItems.push(idx<items.length ? items[idx] : undefined);
                                    if (GRID_TEXT_ONLY != this.grid.type) {
                                        let haveSub = idx<items.length && items[idx].subtitle;
                                        if (haveSub) {
                                            haveSubtitle = true;
                                            rowHasSubtitle = true;
                                        }
                                    }
                                    used++;
                                }
                            }
                            if (GRID_TEXT_ONLY == this.grid.type) {
                                this.grid.rows.push({id:"row."+row+"."+sz.nc, items:rowItems, r:row, rs:rs, size:this.grid.multiSize ? sz.h : undefined, numStd:used, hasSub:undefined});
                            } else {
                                this.grid.rows.push({id:"row."+row+"."+sz.nc, items:rowItems, r:row, rs:rs, size:this.grid.multiSize ? (rowHasSubtitle ? sz.h : (sz.h - GRID_SINGLE_LINE_DIFF)) : undefined, numStd:used, hasSub:this.grid.multiSize ? rowHasSubtitle : undefined});
                            }
                            i+=used;
                            rs+=used;
                        }
                    }
                }
                this.grid.numColumns = sz.nc;
                this.grid.szh = sz.h;
            } else { // Need to check if have subtitles...
                for (var i=0; i<this.items.length && !haveSubtitle; ++i) {
                    if (this.items[i].subtitle) {
                        haveSubtitle = true;
                    }
                }
                if (this.grid.multiSize && this.grid.ih != sz.h) {
                    for (let list = this.grid.rows, i=0, len=list.length; i<len; ++i) {
                        if (!list[i].header) {
                            list[i].size = list[i].hasSub ? sz.h : (sz.h - GRID_SINGLE_LINE_DIFF);
                        }
                    }
                }
            }

            if (this.grid.haveSubtitle != haveSubtitle) {
                this.grid.haveSubtitle = haveSubtitle;
                changed = true;
            }
            if (this.grid.ih != sz.h) {
                this.grid.ih = sz.h;
                changed = true;
                document.documentElement.style.setProperty('--image-grid-factor', sz.s);
            } else if (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--image-grid-factor'))!=sz.s) {
                changed = true;
                document.documentElement.style.setProperty('--image-grid-factor', sz.s);
            }
            if (this.grid.rows.length<1) {
                this.grid.rows.push({spacer:true, size:48, id:"row.filter.empty", ihe:true, rs:0});
                changed = true;
            }
            var count = 0==this.grid.numItems ? this.items.length : this.grid.numItems;
            var few = 1==this.grid.rows.length && (1==count || ((count*sz.w)*1.3333)<listWidth);
            // For multi, we need to check the count of each section.
            if (!few && this.grid.multiSize && this.grid.rows.length>0 && (sz.nc*sz.w)<(listWidth*0.6)) {
                few = true;
                let startOfItems = 0;
                if (this.grid.rows[0].header && this.grid.rows[0].ihe) {
                    for (let loop=this.grid.rows, len=loop.length; startOfItems<len; ++startOfItems) {
                        if (!loop[startOfItems].ihe) {
                            break;
                        }
                    }
                }
                for (let r=startOfItems, loop=this.grid.rows, len=loop.length; r<len; ++r) {
                    if (!loop[r].header && ((loop[r].items.length*sz.w)*1.3333)>=listWidth) {
                        few = false;
                        break;
                    }
                }
            }
            // Hacky work-around. Noticed sometimes if we only have 1 grid row then *only* that row's background is blurred???
            if (1==this.grid.rows.length) {
                let prev = this.grid.rows[0];
                this.grid.rows.push({id:"row.dummy."+(this.current ? this.current.id : "x"), items:[], r:prev.r+1, rs:prev.rs, size:prev.size, numStd:0, hasSub:false});
            }
            if (this.grid.few != few) {
                this.grid.few = few;
                changed = true;
            }
            if (changed) {
                this.$forceUpdate();
            }
            // After navigation the list often isn't fully sized yet (home-split /
            // jumplist / subheader). One rAF pass matches what pinch-zoom does
            // and prevents overlapping cells on first paint.
            if (force && !this._layoutGridRafPending) {
                this._layoutGridRafPending = true;
                var self = this;
                requestAnimationFrame(function() {
                    self._layoutGridRafPending = false;
                    if (self.grid && self.grid.allowed && self.grid.use) {
                        self.layoutGrid(false);
                    }
                });
            }
        },
        setBgndCover() {
            var url = this.bgndUrl;
            if (url) {
                url=changeImageSizing(url, LMS_IMAGE_SIZE);
                document.documentElement.style.setProperty('--subtoolbar-image-url', 'url(' + changeImageSizing(url, LMS_TBAR_BGND_IMAGE_SIZE) + ')');
            } else {
                var img = this.currentImageUrl;
                if (img) {
                    document.documentElement.style.setProperty('--subtoolbar-image-url', 'url(' + changeImageSizing(img, LMS_TBAR_BGND_IMAGE_SIZE) + ')');
                } else {
                    document.documentElement.style.setProperty('--subtoolbar-image-url', 'url()');
                }
                if (this.drawBackdrop) {
                    url=this.searchActive==1 ? 'material/backdrops/search.jpg' : 'material/backdrops/browse.jpg';
                }
            }
            if (undefined==url || url.endsWith(DEFAULT_COVER) || url.endsWith("/music/undefined/cover")) {
                url = "";
            }
            updateBgndImage(this, url);
        },
        setAlbumRating() {
            var ids = [];
            var rating = 0;
            var count = 0;
            this.items.forEach(i => {
                if (!i.header) {
                    ids.push(i.id);
                    if (i.rating && i.rating>0) {
                        rating+=i.rating;
                        count++;
                    }
                }
            });
            bus.$emit('dlg.open', 'rating', ids, Math.ceil(rating/count));
        },
        listItemFilterHidden(item) {
            let term = this.listFilterTerm;
            if (!term || 2!=this.searchActive) {
                return false;
            }
            if (!item || item.header || item.spacer) {
                return true;
            }
            return !(typeof browseListItemMatchesFilter==='function'
                        ? browseListItemMatchesFilter(item, term)
                        : searchListHasStr(item, term));
        },
        jumplistInnerStyle() {
            let n = this.filteredJumplist.length;
            if (n<1) {
                return {};
            }
            return {
                height: '100%',
                gridTemplateRows: 'repeat(' + n + ', 1fr)'
            };
        },
        jumplistRowHeight(innerEl) {
            if (!innerEl) {
                return 16;
            }
            let first = innerEl.querySelector('div');
            if (first) {
                let h = first.getBoundingClientRect().height;
                if (h>0) {
                    return h;
                }
            }
            let fs = parseFloat(getComputedStyle(innerEl).fontSize);
            return isNaN(fs) || fs<1 ? 16 : fs;
        },
        jumplistSlotAtY(clientY, innerEl) {
            if (!innerEl || !this.filteredJumplist.length) {
                return -1;
            }
            let rect = innerEl.getBoundingClientRect();
            let len = this.filteredJumplist.length;
            if (rect.height<1) {
                return 0;
            }
            let rowH = this.jumplistRowHeight(innerEl);
            let slot = Math.floor((clientY-rect.top)/rowH);
            if (slot<0) {
                slot = 0;
            } else if (slot>=len) {
                slot = len-1;
            }
            return slot;
        },
        jumplistIndexAtY(clientY, innerEl) {
            let slot = this.jumplistSlotAtY(clientY, innerEl);
            if (slot<0) {
                return -1;
            }
            return this.filteredJumplist[slot].index;
        },
        jumplistTouchStart(event) {
            if (1!=event.which && 'mousedown'==event.type) {
                return;
            }
            try { event.stopPropagation(); } catch (e) {}
            this.jumplistTouchActive = true;
            bus.$emit('jumplistTouch', true);
            this.jumplistTouchMove(event);
        },
        jumplistTouchMove(event) {
            if (!this.jumplistTouchActive) {
                return;
            }
            try { event.stopPropagation(); } catch (e) {}
            if ('mousemove'==event.type && 1!=(event.buttons&1)) {
                return;
            }
            let pt = event.touches && event.touches.length ? event.touches[0] : (event.changedTouches && event.changedTouches.length ? event.changedTouches[0] : event);
            let inner = event.currentTarget ? event.currentTarget.querySelector('.jl-inner') : undefined;
            let slot = this.jumplistSlotAtY(pt.clientY, inner);
            if (slot>=0) {
                this.jumplistActiveSlot = slot;
                let index = this.filteredJumplist[slot].index;
                if (index>=0 && index!=this.jumplistActive) {
                    this.jumplistActive = index;
                    this.jumpTo(index);
                }
            }
        },
        jumplistTouchEnd(event) {
            try { event.stopPropagation(); } catch (e) {}
            this.jumplistTouchActive = false;
            this.jumplistActiveSlot = -1;
            if (this._jumplistTouchTimer) {
                clearTimeout(this._jumplistTouchTimer);
            }
            this._jumplistTouchTimer = setTimeout(function() {
                this._jumplistTouchTimer = undefined;
                bus.$emit('jumplistTouch', false);
            }.bind(this), 80);
        },
        jumpTo(index) {
            let pos = 0;
            if (this.grid.allowed && this.grid.use && this.items.length>0 && this.grid.multiSize) {
                for (let r=0, loop=this.grid.rows, len=loop.length-1; r<len && loop[r+1].rs<=index; ++r) {
                    pos += loop[r].size;
                }
            } else if (this.grid.allowed && this.grid.use && this.grid.numColumns>0) {
                pos = Math.floor(index/this.grid.numColumns)*(this.grid.ih-(this.grid.haveSubtitle || GRID_TEXT_ONLY==this.grid.type ? 0 : GRID_SINGLE_LINE_DIFF));
            } else {
                let elems = getElementsByClassName(this.scrollElement, "div", "lms-list-item");
                let itemSize = this.browseListItemSize;
                if (undefined!=elems && elems.length>0) {
                    itemSize = elems[0].getBoundingClientRect().height;
                }
                pos = index*itemSize;
            }
            setScrollTop(this, pos>0 ? pos : 0);
        },
        listFilterIndexOfItem(item) {
            for (let i=0, len=this.items.length; i<len; ++i) {
                if (this.items[i]===item) {
                    return i;
                }
            }
            if (undefined!=item.gidx && item.gidx>=0 && item.gidx<this.items.length) {
                return item.gidx;
            }
            return -1;
        },
        clearBrowseKbSelectOnItem(it) {
            if (!it) {
                return;
            }
            if (it.kbSelect) {
                this.$delete(it, 'kbSelect');
            }
            if (undefined!=it.kbSelectSub) {
                this.$delete(it, 'kbSelectSub');
            }
            if (it.items) {
                for (let j=0, jlen=it.items.length; j<jlen; ++j) {
                    this.clearBrowseKbSelectOnItem(it.items[j]);
                }
            }
        },
        clearBrowseKbSelect() {
            for (let i=0, len=this.items.length; i<len; ++i) {
                this.clearBrowseKbSelectOnItem(this.items[i]);
            }
        },
        setBrowseKbSelect(entry) {
            this.clearBrowseKbSelect();
            if (!entry || !entry.item) {
                return;
            }
            this.$set(entry.item, 'kbSelect', true);
            if (entry.subIndex>=0) {
                this.$set(entry.item, 'kbSelectSub', entry.subIndex);
            }
        },
        browseKbSelected(item, subIndex) {
            // Highlights only while keyboard-navigation mode is active
            if (!this.browseKbNavActive || !item || !item.kbSelect) {
                return false;
            }
            if (undefined!=subIndex && subIndex>=0) {
                return item.kbSelectSub==subIndex;
            }
            return undefined==item.kbSelectSub || item.kbSelectSub<0;
        },
        /** Idle timeout before leaving keyboard-navigation mode (ms) */
        browseKbNavIdleMs() {
            return 5000;
        },
        browseKbNavClearTimer() {
            if (undefined!=this._browseKbNavTimer) {
                clearTimeout(this._browseKbNavTimer);
                this._browseKbNavTimer = undefined;
            }
        },
        /** Enter/refresh keyboard-navigation mode and restart idle timer */
        browseKbNavTouch() {
            this.browseKbNavActive = true;
            this.browseKbNavClearTimer();
            let ms = this.browseKbNavIdleMs();
            this._browseKbNavTimer = setTimeout(function() {
                this._browseKbNavTimer = undefined;
                this.browseKbNavExit();
            }.bind(this), ms);
        },
        /**
         * Leave keyboard-navigation mode: deselect highlight, clear positions.
         * @returns {boolean} true if mode was active (caller can treat as handled)
         */
        browseKbNavExit() {
            let was = !!this.browseKbNavActive;
            this.browseKbNavClearTimer();
            this.browseKbNavActive = false;
            this._browseKbSoftCursor = false;
            this.listFilterSelPos = -1;
            this.highlightIndex = -1;
            this.highlightSubIndex = -1;
            this.homePaneKbPos = -1;
            if (typeof this.clearBrowseKbSelect==='function') {
                this.clearBrowseKbSelect();
            }
            this.browseBlurInlineSearch();
            return was;
        },
        browseKbNavExitIfActive() {
            if (!this.browseKbNavActive) {
                return false;
            }
            this.browseKbNavExit();
            return true;
        },
        browseListItemNavigable(item) {
            if (!item || item.header || item.spacer) {
                return false;
            }
            // Search/entry fields are a separate Tab section, not arrow targets
            if (item.type=='search' || item.type=='entry' || undefined!=item.input) {
                return false;
            }
            if (item.type=='html') {
                return false;
            }
            if (item.type=='text' && !this.canClickText(item)) {
                return false;
            }
            return true;
        },
        browsePreferListNavOverSearch() {
            // When list/grid has real entries (Radio, apps, …), don't autofocus search
            for (let i=0, loop=this.items||[], len=loop.length; i<len; ++i) {
                let it = loop[i];
                if (!it || it.type=='search' || it.type=='entry' || undefined!=it.input) {
                    continue;
                }
                if (this.browseListItemNavigable(it)) {
                    return true;
                }
            }
            return false;
        },
        browseBlurInlineSearch() {
            try {
                let root = this.scrollElement || document.getElementById('browse-list');
                if (!root) {
                    return;
                }
                let inputs = root.querySelectorAll('.browse-inline-search input, .lms-search input');
                for (let i=0; i<inputs.length; ++i) {
                    if (document.activeElement===inputs[i]) {
                        inputs[i].blur();
                    }
                }
            } catch (e) { /* ignore */ }
        },
        browseFocusInlineSearch() {
            try {
                let root = this.scrollElement || document.getElementById('browse-list');
                if (!root) {
                    return false;
                }
                let input = root.querySelector('.browse-inline-search input, .lms-list-item .lms-search input, .lms-search input');
                if (input) {
                    this.listFilterSelPos = -1;
                    this.highlightIndex = -1;
                    this.highlightSubIndex = -1;
                    if (typeof this.clearBrowseKbSelect==='function') {
                        this.clearBrowseKbSelect();
                    }
                    input.focus();
                    if (typeof input.select==='function') {
                        try { input.select(); } catch (e) {}
                    }
                    return true;
                }
            } catch (e) { /* ignore */ }
            return false;
        },
        browseSelectFirstNavEntry() {
            this.browseFocusZone = 'main';
            this.browseBlurInlineSearch();
            let entries = this.getListFilterVisibleEntries();
            if (!entries.length) {
                return;
            }
            let pos = 0;
            // Grid: top-left of main grid (skip horizontal ihe strip / headers)
            if (this.grid && this.grid.allowed && this.grid.use) {
                let best = -1;
                for (let i=0, len=entries.length; i<len; ++i) {
                    let e = entries[i];
                    if (!e || !e.item || e.item.ihe || e.item.header || e.item.spacer) {
                        continue;
                    }
                    if (undefined==e.row || undefined==e.col) {
                        if (best<0) {
                            best = i;
                        }
                        continue;
                    }
                    if (best<0) {
                        best = i;
                        continue;
                    }
                    let b = entries[best];
                    if (e.row<b.row || (e.row==b.row && e.col<b.col)) {
                        best = i;
                    }
                }
                if (best>=0) {
                    pos = best;
                }
            }
            // Soft cursor only — no visible highlight until an arrow/Tab enters kb-nav mode
            this.listFilterSelPos = pos;
            this._browseKbSoftCursor = !this.browseKbNavActive;
            this._browseNavSectionIdx = this.browseNavSectionIndexForEntryPos(pos);
            if (this.browseKbNavActive) {
                this.highlightBrowsableEntry(entries[pos]);
                if (typeof this.scrollBrowsableIntoView==='function') {
                    this.scrollBrowsableIntoView(entries[pos].index, entries[pos].subIndex>=0 ? entries[pos].subIndex : -1);
                }
            } else {
                this.highlightIndex = -1;
                this.highlightSubIndex = -1;
                if (typeof this.clearBrowseKbSelect==='function') {
                    this.clearBrowseKbSelect();
                }
            }
        },
        /** Tab sections: inline search | station strip (ihe) | main list/grid */
        browseNavSections() {
            let sections = [];
            let hasSearch = false;
            for (let i=0, loop=this.items||[], len=loop.length; i<len; ++i) {
                let it = loop[i];
                if (it && (it.type=='search' || it.type=='entry' || undefined!=it.input)) {
                    hasSearch = true;
                    break;
                }
            }
            if (hasSearch) {
                sections.push({type:'search'});
            }
            let entries = this.getListFilterVisibleEntries();
            if (!entries.length) {
                return sections;
            }
            let strip = [];
            let body = [];
            for (let i=0, len=entries.length; i<len; ++i) {
                let e = entries[i];
                if (e.item && e.item.ihe) {
                    strip.push({entry: e, pos: i});
                } else {
                    body.push({entry: e, pos: i});
                }
            }
            if (strip.length>0) {
                sections.push({type:'entries', items: strip, key:'strip'});
            }
            if (body.length>0) {
                sections.push({type:'entries', items: body, key:'body'});
            } else if (strip.length<1 && entries.length>0) {
                let all = [];
                for (let i=0, len=entries.length; i<len; ++i) {
                    all.push({entry: entries[i], pos: i});
                }
                sections.push({type:'entries', items: all, key:'all'});
            }
            return sections;
        },
        browseNavSectionIndexForEntryPos(pos) {
            let sections = this.browseNavSections();
            for (let s=0, slen=sections.length; s<slen; ++s) {
                if (sections[s].type!='entries' || !sections[s].items) {
                    continue;
                }
                for (let j=0, jlen=sections[s].items.length; j<jlen; ++j) {
                    if (sections[s].items[j].pos==pos) {
                        return s;
                    }
                }
            }
            return sections.length>0 ? 0 : -1;
        },
        browseDetectNavSectionIdx() {
            let sections = this.browseNavSections();
            if (sections.length<1) {
                return -1;
            }
            let ae = document.activeElement;
            if (ae && ae.closest && ae.closest('.lms-search, .browse-inline-search')) {
                for (let s=0; s<sections.length; ++s) {
                    if (sections[s].type=='search') {
                        return s;
                    }
                }
            }
            if (this.listFilterSelPos>=0) {
                let idx = this.browseNavSectionIndexForEntryPos(this.listFilterSelPos);
                if (idx>=0) {
                    return idx;
                }
            }
            return 0;
        },
        browseApplyNavSection(section) {
            if (!section) {
                return;
            }
            if (section.type=='search') {
                this.browseFocusInlineSearch();
                return;
            }
            if (section.type=='entries' && section.items && section.items.length>0) {
                this.browseBlurInlineSearch();
                let first = section.items[0];
                this.listFilterSelPos = first.pos;
                this.highlightBrowsableEntry(first.entry);
                if (typeof this.scrollBrowsableIntoView==='function') {
                    this.scrollBrowsableIntoView(first.entry.index, first.entry.subIndex>=0 ? first.entry.subIndex : -1);
                }
            }
        },
        browseTabCycleSections(reverse) {
            let sections = this.browseNavSections();
            if (sections.length<2) {
                return false;
            }
            let idx = this.browseDetectNavSectionIdx();
            if (idx<0) {
                idx = 0;
            }
            let next = reverse ? idx-1 : idx+1;
            if (next<0) {
                next = sections.length-1;
            } else if (next>=sections.length) {
                next = 0;
            }
            this._browseNavSectionIdx = next;
            this.browseApplyNavSection(sections[next]);
            return true;
        },
        browseGridItemIndex(item, row, col) {
            if (this.isTop && undefined!=item.gidx) {
                return item.gidx;
            }
            if (undefined!=row.rs) {
                return row.rs+col;
            }
            return this.listFilterIndexOfItem(item);
        },
        browseListNavActive() {
            if (this.selection.size>0) {
                return false;
            }
            if (2==this.searchActive) {
                return this.items.length>0;
            }
            // Mobile: allow physical/bluetooth keyboard arrows for menu nav even if
            // the desktop "keyboard shortcuts" setting UI is N/A
            if (!IS_MOBILE && !this.$store.state.keyboardControl) {
                return false;
            }
            if (1==this.searchActive) {
                return this.items.length>0;
            }
            if (this.$store.state.page=='browse') {
                return true;
            }
            if (this.$store.state.desktopLayout) {
                let ae = document.activeElement;
                if (ae && ae.closest && (ae.closest('#queue-list') || ae.closest('#np-page'))) {
                    return false;
                }
                return true;
            }
            return false;
        },
        browseListNavFromKey(e) {
            if (!e || !this.browseListNavActive()) {
                return false;
            }
            if (this.$store.state.openDialogs.length>0 || this.$store.state.visibleMenus.size>0) {
                return false;
            }
            let split = !!this.useHomeSplit;
            // ⌘/Alt+Tab → desktop sidebar (focus home pane)
            if (split && 'Tab'==e.key && (e.metaKey || e.altKey) && !e.ctrlKey) {
                try { e.preventDefault(); } catch (ex) {}
                this.browseKbNavTouch();
                this.browseFocusSidebar(true);
                return true;
            }
            // ⌘/Ctrl+← = force hierarchy back (list-mode style) from anywhere in grid/list
            if ((e.metaKey || e.ctrlKey) && !e.altKey && 'ArrowLeft'==e.key) {
                try { e.preventDefault(); } catch (ex) {}
                this.browseKbNavTouch();
                this.browseFocusZone = 'main';
                this.browseNavHierarchyBack();
                return true;
            }
            // Tab: sidebar → main subsections; main cycles search/strip/list
            if ('Tab'==e.key && !e.metaKey && !e.ctrlKey && !e.altKey) {
                this.browseKbNavTouch();
                if (split && this.browseFocusZone==='sidebar') {
                    try { e.preventDefault(); } catch (ex) {}
                    if (e.shiftKey) {
                        this.homePaneMoveSelection(-1);
                    } else {
                        this.browseFocusMainFromSidebar();
                    }
                    return true;
                }
                // Shift+Tab at first main section → sidebar (desktop split)
                if (split && e.shiftKey) {
                    let sections = this.browseNavSections();
                    let idx = this.browseDetectNavSectionIdx();
                    if (sections.length<2 || idx<=0) {
                        try { e.preventDefault(); } catch (ex) {}
                        this.browseFocusSidebar(true);
                        return true;
                    }
                }
                if (this.browseTabCycleSections(!!e.shiftKey)) {
                    try { e.preventDefault(); } catch (ex) {}
                    this.browseFocusZone = 'main';
                    return true;
                }
                return false;
            }
            // Leave other modified arrows to global shortcuts (⌘/Ctrl/Alt+↑/↓ = volume, Alt+←/→ = skip)
            if (e.metaKey || e.ctrlKey || e.altKey) {
                return false;
            }
            let t = e.target;
            let inSearch = t && t.closest && t.closest('.lms-search, .browse-inline-search');
            if (t && (t.tagName=='INPUT' || t.tagName=='TEXTAREA' || t.tagName=='SELECT' || t.isContentEditable)) {
                if (inSearch) {
                    this.browseFocusZone = 'main';
                    // From search field: ↓ moves into list selection; other arrows stay for list nav
                    if ('ArrowDown'==e.key) {
                        try { e.preventDefault(); } catch (ex) {}
                        this.browseBlurInlineSearch();
                        this.listFilterMoveSelection(0);
                        return true;
                    }
                    if ('ArrowUp'!=e.key && 'ArrowLeft'!=e.key && 'ArrowRight'!=e.key && 'Enter'!=e.key) {
                        return false;
                    }
                    // Enter submits search (don't intercept)
                    if ('Enter'==e.key) {
                        return false;
                    }
                } else {
                    return false;
                }
            }
            // Desktop home sidebar navigation
            if (split && this.browseFocusZone==='sidebar') {
                if ('ArrowDown'==e.key) {
                    try { e.preventDefault(); } catch (ex) {}
                    this.browseKbNavTouch();
                    this.homePaneMoveSelection(1);
                    return true;
                }
                if ('ArrowUp'==e.key) {
                    try { e.preventDefault(); } catch (ex) {}
                    this.browseKbNavTouch();
                    this.homePaneMoveSelection(-1);
                    return true;
                }
                if ('ArrowRight'==e.key || 'Enter'==e.key) {
                    try { e.preventDefault(); } catch (ex) {}
                    this.browseKbNavTouch();
                    this.homePaneActivateSelected();
                    return true;
                }
                if ('ArrowLeft'==e.key) {
                    try { e.preventDefault(); } catch (ex) {}
                    this.browseKbNavTouch();
                    // Left in sidebar: no-op (stay); hierarchy is main-pane only
                    return true;
                }
                return false;
            }
            // First arrow in main with split: ensure zone is main
            if (split && this.browseFocusZone!=='main' && ('ArrowDown'==e.key || 'ArrowUp'==e.key || 'ArrowLeft'==e.key || 'ArrowRight'==e.key || 'Enter'==e.key)) {
                this.browseFocusZone = 'main';
            }
            if ('ArrowDown'==e.key) {
                try { e.preventDefault(); } catch (ex) {}
                this.browseKbNavTouch();
                this.listFilterMoveSelection(1);
                return true;
            } else if ('ArrowUp'==e.key) {
                try { e.preventDefault(); } catch (ex) {}
                this.browseKbNavTouch();
                // At top of list: focus search section if present
                let entries = this.getListFilterVisibleEntries();
                let pos = this.listFilterSelPos;
                if ((pos<=0 || entries.length<1) && this.browseNavSections().some(function(s) { return s.type=='search'; })) {
                    if (this.browseFocusInlineSearch()) {
                        return true;
                    }
                }
                this.listFilterMoveSelection(-1);
                return true;
            } else if ('ArrowLeft'==e.key) {
                try { e.preventDefault(); } catch (ex) {}
                this.browseKbNavTouch();
                this.listFilterMoveSelectionHorizontal(-1);
                return true;
            } else if ('ArrowRight'==e.key) {
                try { e.preventDefault(); } catch (ex) {}
                this.browseKbNavTouch();
                this.listFilterMoveSelectionHorizontal(1);
                return true;
            } else if ('Enter'==e.key) {
                try { e.preventDefault(); } catch (ex) {}
                this.browseKbNavTouch();
                this.listFilterActivateSelected(e.metaKey || e.ctrlKey);
                return true;
            }
            return false;
        },
        /** Clear kb selection and go up one browse menu level */
        browseNavHierarchyBack() {
            if (!this.history || this.history.length<1) {
                return;
            }
            this.listFilterSelPos = -1;
            this.highlightIndex = -1;
            this.highlightSubIndex = -1;
            if (typeof this.clearBrowseKbSelect==='function') {
                this.clearBrowseKbSelect();
            }
            this.goBack();
        },
        collectGridNavEntries(entries) {
            if (!this.grid.use || !this.grid.rows) {
                return;
            }
            let term = this.listFilterTerm;
            let filtering = term && 2==this.searchActive;
            let seen = new Set();
            for (let r=0, rlen=this.grid.rows.length; r<rlen; ++r) {
                let row = this.grid.rows[r];
                if (!row.items) {
                    continue;
                }
                for (let c=0, clen=row.items.length; c<clen; ++c) {
                    let it = row.items[c];
                    if (!this.browseListItemNavigable(it)) {
                        continue;
                    }
                    if (filtering && !(typeof browseListItemMatchesFilter==='function'
                                        ? browseListItemMatchesFilter(it, term)
                                        : searchListHasStr(it, term))) {
                        continue;
                    }
                    let key = (it.id || it.title || '')+'@'+(undefined!=row.rs ? row.rs+c : r+'-'+c);
                    if (seen.has(key)) {
                        continue;
                    }
                    seen.add(key);
                    entries.push({item: it, index: this.browseGridItemIndex(it, row, c), subIndex: -1, row: r, col: c});
                }
            }
        },
        getListFilterVisibleEntries() {
            let term = this.listFilterTerm;
            let filtering = term && 2==this.searchActive;
            let entries = [];
            if (this.grid.use) {
                this.collectGridNavEntries(entries);
                return entries;
            }
            for (let i=0, len=this.items.length; i<len; ++i) {
                let it = this.items[i];
                if (undefined!=it.searchcat && undefined!=it.items) {
                    for (let c=0, clen=it.items.length; c<clen; ++c) {
                        let cit = it.items[c];
                        if (!this.browseListItemNavigable(cit)) {
                            continue;
                        }
                        if (filtering && !(typeof browseListItemMatchesFilter==='function'
                                           ? browseListItemMatchesFilter(cit, term)
                                           : searchListHasStr(cit, term))) {
                            continue;
                        }
                        entries.push({item: cit, index: i, subIndex: c, row: i, col: c});
                    }
                    continue;
                }
                if (!this.browseListItemNavigable(it)) {
                    continue;
                }
                if (filtering && !(typeof browseListItemMatchesFilter==='function'
                                    ? browseListItemMatchesFilter(it, term)
                                    : searchListHasStr(it, term))) {
                    continue;
                }
                entries.push({item: it, index: i, subIndex: -1});
            }
            return entries;
        },
        highlightBrowsableEntry(entry) {
            if (!entry) {
                return;
            }
            this.highlightItem(entry.index, entry.subIndex>=0 ? entry.subIndex : -1);
        },
        findBrowsableEntryAtCell(entries, row, col) {
            let best = -1;
            let bestDist = Infinity;
            for (let i=0, len=entries.length; i<len; ++i) {
                if (entries[i].row!=row) {
                    continue;
                }
                let dist = Math.abs(entries[i].col-col);
                if (dist<bestDist) {
                    bestDist = dist;
                    best = i;
                }
            }
            return best;
        },
        listFilterMoveSelectionVertical(delta, entries, pos) {
            let cur = entries[pos];
            let step = delta>0 ? 1 : -1;
            let minRow = entries[0].row;
            let maxRow = entries[0].row;
            for (let i=1, len=entries.length; i<len; ++i) {
                if (entries[i].row<minRow) {
                    minRow = entries[i].row;
                }
                if (entries[i].row>maxRow) {
                    maxRow = entries[i].row;
                }
            }
            let targetRow = cur.row;
            for (let guard=0; guard<64; ++guard) {
                targetRow += step;
                if (targetRow<minRow || targetRow>maxRow) {
                    return;
                }
                let found = this.findBrowsableEntryAtCell(entries, targetRow, cur.col);
                if (found>=0) {
                    this.listFilterSelPos = found;
                    this.highlightBrowsableEntry(entries[found]);
                    return;
                }
            }
        },
        /**
         * Clear / re-anchor list-filter keyboard selection.
         * @param {boolean} selectFirst when true and matches exist, land on first entry
         */
        resetListFilterKeyboardNav(selectFirst) {
            this._browseKbSoftCursor = false;
            this.listFilterSelPos = -1;
            this.highlightIndex = -1;
            this.highlightSubIndex = -1;
            if (typeof this.clearBrowseKbSelect==='function') {
                this.clearBrowseKbSelect();
            }
            if (!selectFirst) {
                return;
            }
            let entries = this.getListFilterVisibleEntries();
            if (!entries.length) {
                return;
            }
            // Filter mode: treat as active kb-nav so outline paints on the first match
            if (2==this.searchActive) {
                this.browseKbNavActive = true;
                if (typeof this.browseKbNavTouch==='function') {
                    this.browseKbNavTouch();
                }
            }
            this.listFilterSelPos = 0;
            this.highlightBrowsableEntry(entries[0]);
        },
        listFilterMoveSelection(delta) {
            let entries = this.getListFilterVisibleEntries();
            if (!entries.length) {
                this.listFilterSelPos = -1;
                this.highlightIndex = -1;
                this.highlightSubIndex = -1;
                this.clearBrowseKbSelect();
                return;
            }
            let pos = this.listFilterSelPos;
            // First key after soft open: paint remembered cell without skipping past it
            if (this._browseKbSoftCursor && pos>=0 && pos<entries.length) {
                this._browseKbSoftCursor = false;
                this.listFilterSelPos = pos;
                this.highlightBrowsableEntry(entries[pos]);
                return;
            }
            this._browseKbSoftCursor = false;
            // Re-anchor when cursor is outside the current (possibly filtered) set
            if (pos<0 || pos>=entries.length) {
                pos = delta>=0 ? 0 : entries.length-1;
            } else if (0==delta) {
                pos = pos<entries.length ? pos : 0;
            } else {
                let cur = entries[pos];
                if (undefined!=cur.row && undefined!=cur.col) {
                    this.listFilterMoveSelectionVertical(delta, entries, pos);
                    return;
                }
                pos += delta;
                if (pos<0) {
                    pos = 0;
                } else if (pos>=entries.length) {
                    pos = entries.length-1;
                }
            }
            this.listFilterSelPos = pos;
            this.highlightBrowsableEntry(entries[pos]);
        },
        listFilterMoveSelectionHorizontal(delta) {
            let entries = this.getListFilterVisibleEntries();
            let pos = this.listFilterSelPos;
            // First horizontal key after soft open: paint top-left without leaving it
            if (this._browseKbSoftCursor && entries.length>0) {
                this._browseKbSoftCursor = false;
                if (pos<0 || pos>=entries.length) {
                    pos = 0;
                }
                this.listFilterSelPos = pos;
                this.highlightBrowsableEntry(entries[pos]);
                return;
            }
            this._browseKbSoftCursor = false;
            let inGrid = this.grid && this.grid.allowed && this.grid.use;

            // Grid (or list searchcat strip with col): move between columns when possible
            if (entries.length>0) {
                if (pos<0 || pos>=entries.length) {
                    pos = 0;
                }
                let cur = entries[pos];
                if (undefined!=cur && undefined!=cur.col) {
                    let targetCol = cur.col+delta;
                    let found = this.findBrowsableEntryAtCell(entries, cur.row, targetCol);
                    if (found>=0 && entries[found].col==targetCol) {
                        this.listFilterSelPos = found;
                        this.highlightBrowsableEntry(entries[found]);
                        return;
                    }
                    // Grid far-left edge: walk previous items in the list; only top-most goes back
                    if (inGrid && delta<0) {
                        if (pos>0) {
                            this.listFilterSelPos = pos-1;
                            this.highlightBrowsableEntry(entries[pos-1]);
                            return;
                        }
                        // Top-most (first navigable) at far left → parent menu
                        this.browseNavHierarchyBack();
                        return;
                    }
                    // Grid far-right edge: stay put
                    if (inGrid && delta>0) {
                        return;
                    }
                } else if (inGrid && delta>0) {
                    return;
                } else if (inGrid && delta<0) {
                    // No col geometry: walk list; top-most → back
                    if (pos>0) {
                        this.listFilterSelPos = pos-1;
                        this.highlightBrowsableEntry(entries[pos-1]);
                        return;
                    }
                    this.browseNavHierarchyBack();
                    return;
                }
            } else if (inGrid) {
                if (delta<0) {
                    this.browseNavHierarchyBack();
                }
                return;
            }

            // List mode: left = parent menu, right = open selected
            if (delta < 0) {
                this.browseNavHierarchyBack();
                return;
            }
            // Right (list mode): drill into highlighted item (select first if none)
            if (!entries.length) {
                return;
            }
            if (this.listFilterSelPos<0 || this.listFilterSelPos>=entries.length) {
                this.listFilterSelPos = 0;
                this.highlightBrowsableEntry(entries[0]);
            }
            this.listFilterActivateSelected(false);
        },
        listFilterPlayAction(item) {
            if (!item) {
                return PLAY_ACTION;
            }
            if (item.header) {
                return PLAY_ALL_ACTION;
            }
            if (item.menu && item.menu.length>0) {
                if (item.menu[0]==PLAY_ALL_ACTION) {
                    return PLAY_ALL_ACTION;
                }
                if (item.menu[0]==PLAY_ACTION || item.menu.indexOf(PLAY_ACTION)>=0) {
                    return PLAY_ACTION;
                }
            }
            return PLAY_ACTION;
        },
        listFilterActivateSelected(play) {
            let entries = this.getListFilterVisibleEntries();
            if (!entries.length) {
                return;
            }
            let pos = this.listFilterSelPos>=0 ? this.listFilterSelPos : 0;
            if (pos>=entries.length) {
                pos = 0;
            }
            let entry = entries[pos];
            let clickIndex = entry.subIndex>=0 ? undefined : entry.index;
            if (play) {
                this.itemAction(this.listFilterPlayAction(entry.item), entry.item, clickIndex);
            } else {
                this.click(entry.item, clickIndex);
            }
        },
        scrollBrowsableIntoView(index, subIndex) {
            if (index<0 || index>=this.items.length || !this.scrollElement) {
                return;
            }
            let opts = {block: 'nearest', inline: 'nearest'};
            if (subIndex>=0 && undefined!=this.items[index].items && subIndex<this.items[index].items.length) {
                let sub = document.getElementById("gridscroll-"+index+"."+subIndex);
                if (sub) {
                    sub.scrollIntoView(opts);
                    return;
                }
            }
            let kbEl = this.scrollElement.querySelector('.list-swipe-row.browse-kb-select, .browse-kb-select.image-grid-item, .browse-kb-select.text-grid-item, .browse-kb-select.list-swipe-tile, .browse-kb-select.lms-list-item');
            if (kbEl) {
                let row = kbEl.closest ? kbEl.closest('.list-swipe-row') : undefined;
                (row || kbEl).scrollIntoView(opts);
                return;
            }
            if (this.grid.allowed && this.grid.use) {
                let gridEl = this.scrollElement.querySelector('.search-highlight');
                if (gridEl) {
                    gridEl.scrollIntoView(opts);
                } else {
                    this.jumpTo(index);
                }
                return;
            }
            let elem = document.getElementById('item'+index);
            if (elem && elem.closest) {
                let row = elem.closest('.list-swipe-row');
                (row || elem).scrollIntoView(opts);
            } else if (elem) {
                elem.scrollIntoView(opts);
            } else {
                this.jumpTo(index);
            }
        },
        highlightItem(index, subIndex) {
            this.highlightIndex = index;
            this.highlightSubIndex = undefined==subIndex || subIndex<0 ? -1 : subIndex;
            if (index>=0 && index<this.items.length) {
                let entry = {item: this.items[index], index: index, subIndex: this.highlightSubIndex};
                if (this.highlightSubIndex>=0 && this.items[index].items && this.items[index].items[this.highlightSubIndex]) {
                    entry.item = this.items[index].items[this.highlightSubIndex];
                }
                // Only paint kb outline while keyboard-navigation mode is active
                // (list-filter / searchActive==2 still uses search-highlight via highlightIndex)
                if (this.browseKbNavActive || 2==this.searchActive) {
                    this.setBrowseKbSelect(entry);
                } else {
                    this.clearBrowseKbSelect();
                }
                this.$nextTick(function() {
                    this.scrollBrowsableIntoView(index, this.highlightSubIndex);
                }.bind(this));
            } else {
                this.clearBrowseKbSelect();
            }
        },
        filterJumplist() {
            let prev = getComputedStyle(document.body).getPropertyValue('--jump-list-adjust');
            let next = [];
            let complete = this.items.length==this.listSize && this.fetchingItem==undefined;
            let minForJl = this.browseAlphaSort ? 8 : 25;
            if (this.items.length>minForJl && undefined!=this.jumplist && this.jumplist.length>1) {
                if (this.jumplist.headerOnly && this.items.length>(this.jumplist.length*5)) {
                    next = this.jumplist;
                } else if (!this.jumplist.headerOnly && this.jumplist.length>=4) {
                    // Bullet scrubbers: keep spacing proportional; letter rails can shrink
                    let isBullets = !!(this.jumplist[0] && this.jumplist[0].bullet);
                    let listH = this.scrollElement ? this.scrollElement.clientHeight : 0;
                    if (listH<50) {
                        // Pre-measure: keep the full rail so the gutter class is applied with items
                        next = this.jumplist;
                    } else {
                        let maxItems = Math.floor((listH-16)/(isBullets ? 14 : 20));
                        if (isBullets) {
                            maxItems = Math.max(8, maxItems);
                        }
                        next = shrinkJumplist(this.jumplist, maxItems, this.items.length);
                    }
                }
            }
            // Always replace so a previous list's A–Z strip cannot linger (e.g. inside a playlist)
            this.filteredJumplist = next || [];
            if (complete || (this.filteredJumplist && this.filteredJumplist.length>1)) {
                this.reserveJumplistGutter = this.filteredJumplist && this.filteredJumplist.length>1;
            }
            let now = (this.browseJumplistGutter ? JUMP_LIST_WIDTH : 0)+'px';
            if (prev!=now) {
                document.documentElement.style.setProperty('--jump-list-adjust', now);
            }
        },
        dragStart(which, ev) {
            // Item drag reorder / drag-to-queue is desktop only (mobile long-press → menu)
            if (!this.$store.state.desktopLayout || undefined==which || queryParams.party || (LMS_KIOSK_MODE && HIDE_FOR_KIOSK.has(ADD_TO_FAV_ACTION)) ||
                (this.items[0] && this.items[0].stdItem==STD_ITEM_PLAYLIST_TRACK && this.listSize>LMS_MAX_PLAYLIST_EDIT_SIZE) ||
                ((!this.$store.state.pinQueue && !this.$store.state.showQueue) && !this.canDrop) ||
                // For some reason drag is accessible in 'My Music'??? The following stops this...
                (this.grid.allowed && this.grid.use && !this.isTop && !this.items[which].draggable)) {
                ev.preventDefault();
                ev.stopPropagation();
                return;
            }
            bus.$emit('dragActive', true);
            ev.dataTransfer.dropEffect = 'move';
            ev.dataTransfer.setData('text/plain', this.items[which].title);
            window.mskBrowseDrag=which;
            if (this.grid.allowed && this.grid.use) {
                this.dragElem = ev.target.nodeName=='IMG' ? ev.srcElement.parentNode.parentNode : ev.srcElement;
                setListElemClass(this.dragElem, 'dragging', true);
                ev.dataTransfer.setDragImage(this.dragElem, 0, 0);
            } else {
                this.dragElem = ev.target.nodeName=='IMG' ? ev.srcElement.parentNode.parentNode.parentNode : ev.srcElement;
                setListElemClass(this.dragElem, 'dragging', true);
                ev.dataTransfer.setDragImage(this.dragElem, 0, 0);
            }
            this.dragIndex = which;
            this.stopScrolling = false;
            if (this.selection.size>0 && (!this.selection.has(which) || this.current.isFavFolder)) {
                this.clearSelection();
            }
        },
        dragEnd() {
            setListElemClass(this.dragElem, 'dragging', false);
            this.dragElem = undefined;
            this.stopScrolling = true;
            this.dragIndex = undefined;
            this.dropIndex = -1;
            window.mskBrowseDrag = undefined;
            // Delay setting drag inactive so that we ignore a potential 'Esc' that cancelled drag
            setTimeout(function () { bus.$emit('dragActive', false); }.bind(this), 250);
        },
        dragOver(index, ev) {
            if (index!=this.dropIndex && undefined!=index) {
                if (this.items[0].stdItem==STD_ITEM_PLAYLIST_TRACK && this.listSize>LMS_MAX_PLAYLIST_EDIT_SIZE) {
                    return;
                }
                if ( ((this.canDrop && undefined!=window.mskBrowseDrag) || (undefined!=window.mskQueueDrag && this.current.section==SECTION_PLAYLISTS)) &&
                (!this.current || !this.current.isFavFolder || !this.options.sortFavorites || this.items[index].isFavFolder)) {
                    this.dropIndex = index;
                    // Drag over item at top/bottom of list to start scrolling
                    this.stopScrolling = true;
                    if (ev.clientY < (queryParams.topPad + 110)) {
                        this.stopScrolling = false;
                        this.scrollList(-5)
                    }

                    let distance = 28 + queryParams.botPad + this.queueEmpty ? 0 :
                        (this.$store.state.desktopLayout
                            ? 72
                            : (52 +
                                (this.$store.state.mobileBar==MBAR_NONE
                                    ? 0
                                    : this.$store.state.mobileBar==MBAR_THIN
                                        ? 22
                                        : this.$store.state.mobileBar==MBAR_THICK
                                        ? 48
                                            : 0)));
                    if (ev.clientY > (window.innerHeight - distance)) {
                        this.stopScrolling = false;
                        this.scrollList(5)
                    }
                } else {
                    this.dropIndex = undefined;
                }
            }
            ev.preventDefault(); // Otherwise drop is never called!
        },
        scrollList(step) {
            var pos = this.scrollElement.scrollTop + step;
            setScrollTop(this, pos);
            if (pos<=0 || pos>=this.scrollElement.scrollTopMax) {
                this.stopScrolling = true;
            }
            if (!this.stopScrolling) {
                setTimeout(function () {
                    this.scrollList(step);
                }.bind(this), 100);
            }
        },
        drop(to, ev) {
            browseHandleDrop(this, to, ev);
        },
        setWide() {
            let viewWidth = this.$store.state.desktopLayout ? this.pageElement.scrollWidth : window.innerWidth;
            this.wide = viewWidth>=MIN_WIDTH_FOR_BOTH_INDENT
                            ? WIDE_BOTH
                            : viewWidth>=MIN_WIDTH_FOR_COVER_INDENT
                                ? WIDE_COVER_IDENT
                                : viewWidth>=MIN_WIDTH_FOR_MIX_BTN
                                    ? WIDE_MIX_BTN
                                    : viewWidth>=MIN_WIDTH_FOR_COVER
                                        ? WIDE_COVER
                                        : viewWidth>=MIN_WIDTH_INDENT_LEFT
                                            ? WIDE_INDENT_L
                                            : viewWidth>=MIN_WIDTH_FOR_HBTNS
                                                ? WIDE_HBTNS
                                                : viewWidth>=MIN_WIDTH_FOR_DETAILED_SUB
                                                    ? WIDE_DETAILED_SUB
                                                    : WIDE_NONE;
            this.trackWide = viewWidth>=MIN_WIDTH_FOR_TRACK_FOUR
                                ? TRACK_WIDE_FOUR
                                : viewWidth>=MIN_WIDTH_FOR_TRACK_THREE
                                    ? TRACK_WIDE_THREE
                                    : viewWidth>=MIN_WIDTH_FOR_TRACK_TWO
                                        ? TRACK_WIDE_TWO
                                        : TRACK_WIDE_ONE
        },
        textSelectEnd(event) {
            if (!this.current.slimbrowse) { // DynamicPlaylists have a blank line that when double-clicked shows a menu!
                viewHandleSelectedText(this, event);
            }
        },
        allowShuffle(item) {
            if (lmsOptions.playShuffle) {
                if (item.header && undefined!=item.menu && item.menu.length>2 && item.menu[2]==PLAY_SHUFFLE_ALL_ACTION) {
                    return true;
                }
                let itm = item.header ? this.current : item;
                if (undefined==itm || undefined==itm.stdItem) {
                    return undefined!=itm.menu && itm.menu.length>=3 && itm.menu[2]==PLAY_SHUFFLE_ACTION;
                }
                return undefined!=itm && undefined!=itm.stdItem &&
                        (itm.stdItem==STD_ITEM_ARTIST || itm.stdItem==STD_ITEM_ALBUM ||
                         itm.stdItem==STD_ITEM_PLAYLIST || itm.stdItem==STD_ITEM_WORK || itm.stdItem==STD_ITEM_REMOTE_PLAYLIST ||
                         itm.stdItem==STD_ITEM_GENRE || itm.stdItem==STD_ITEM_YEAR ||
                         itm.stdItem==STD_ITEM_ONLINE_ARTIST || itm.stdItem==STD_ITEM_ONLINE_ALBUM || item.stdItem==STD_ITEM_ALL_TRACKS);
            }
            return false;
        },
        allowAdd(item) {
            return undefined==item.stdItem || STD_ITEM_RANDOM_MIX!=item.stdItem;
        },
        allowInsert(item) {
            return undefined==item.stdItem || STD_ITEM_RANDOM_MIX!=item.stdItem;
        },
        loadCustomPinned() {
            let actions = getCustomActions("pinned");
            if (undefined!=actions) {
                let customPinned = new Set();
                let lastPinnedIndex = -1;
                for (let i=0, len=this.top.length; i<len; ++i) {
                    if (this.top[i].custom) {
                        customPinned.add(this.top[i].id);
                    }
                    if (!this.top[i].id.startsWith(TOP_ID_PREFIX)) {
                        lastPinnedIndex = i;
                    }
                }
                for (let i=0, len=actions.length; i<len; ++i) {
                    if (actions[i].iframe!=undefined || actions[i].weblink!=undefined) {
                        let id = undefined==actions[i].iframe ? actions[i].weblink : actions[i].iframe;
                        if (!customPinned.has(id)) {
                            this.top.splice(lastPinnedIndex+1, 0,
                                    {id: id, title: actions[i].title, icon: actions[i].icon, svg: actions[i].svg, isPinned: true,
                                     weblink: actions[i].weblink, iframe: actions[i].iframe, menu: [RENAME_ACTION, UNPIN_ACTION], custom: true});
                            lastPinnedIndex++;
                        }
                    }
                }
                if (lastPinnedIndex>=0) {
                    this.layoutGrid(true);
                    this.saveTopList();
                }
            }
        },
        applyListFilterClasses() {
            let term = this.listFilterTerm;
            let filtering = term && 2==this.searchActive;
            let root = this.scrollElement || document.getElementById('browse-list');

            if (this.grid.use) {
                let prevTerm = this._gridFilterTerm;
                if (filtering) {
                    if (prevTerm!=term) {
                        this._gridFilterTerm = term;
                        let play = root && typeof flipListPrepare==='function'
                                     ? flipListPrepare(root, '.image-grid-item, .text-grid-item', 240)
                                     : function() {};
                        this.layoutGrid(true);
                        this.$nextTick(function() { play(); });
                    }
                } else if (undefined!=prevTerm) {
                    this._gridFilterTerm = undefined;
                    let play = root && typeof flipListPrepare==='function'
                                 ? flipListPrepare(root, '.image-grid-item, .text-grid-item', 240)
                                 : function() {};
                    this.layoutGrid(true);
                    this.$nextTick(function() { play(); });
                }
                return;
            }

            // List mode: browseListBodyItems already prunes non-matches so
            // RecycleScroller / v-for reflow. Only FLIP remaining rows; drop
            // display:none class toggles (they leave virtual-list gaps).
            let prevListTerm = this._listFilterTerm;
            let nextListTerm = filtering ? term : undefined;
            if (prevListTerm===nextListTerm) {
                return;
            }
            this._listFilterTerm = nextListTerm;
            if (!root) {
                return;
            }
            let selector = '.lms-list-item, .list-swipe-row, .list-swipe-tile';
            let play = typeof flipListPrepare==='function'
                         ? flipListPrepare(root, selector, 240)
                         : function() {};
            // Clear any leftover hide classes from older builds / mixed paths
            let stale = root.querySelectorAll('.list-filter-out');
            for (let i=0, len=stale.length; i<len; ++i) {
                stale[i].classList.remove('list-filter-out');
            }
            this.$nextTick(function() { play(); });
        }
    }, typeof listSwipeMethods!=='undefined' ? listSwipeMethods : {},
       typeof browseZoomMethods!=='undefined' ? browseZoomMethods : {},
       typeof contextSheetMethods!=='undefined' ? contextSheetMethods : {}),
    mounted() {
        if (typeof this.browseZoomInit === 'function') {
            this.browseZoomInit();
        }
        this.pageElement = document.getElementById("browse-view");
        this.setBrowseSubheaderOffset(0);
        this.initHomePaneWidth();
        this.tickHomeGreeting();
        this.probeHomeSourceSelect();
        if (this._homeGreetingTimer) {
            clearInterval(this._homeGreetingTimer);
        }
        this._homeGreetingTimer = setInterval(this.tickHomeGreeting, 60000);
        /* Keep chrome SVG ink in sync with --primary-color (onload + cover morph).
         * SVGs bake color into the URL — Vue only re-renders when chromeSvgCol changes. */
        this.syncChromeSvgCol();
        this._chromeSvgOnColor = function() {
            this.syncChromeSvgCol();
        }.bind(this);
        bus.$on('colorChanged', this._chromeSvgOnColor);
        bus.$on('currentCover', this._chromeSvgOnColor);
        /* Throttled observe: morph updates CSS vars without Vue; avoid per-frame SVG reloads */
        this._chromeSvgMoTimer = undefined;
        try {
            this._chromeSvgMo = new MutationObserver(function() {
                if (this._chromeSvgMoTimer) {
                    return;
                }
                this._chromeSvgMoTimer = setTimeout(function() {
                    this._chromeSvgMoTimer = undefined;
                    this.syncChromeSvgCol();
                }.bind(this), 180);
            }.bind(this));
            this._chromeSvgMo.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class'] });
        } catch (e) {}
        /* Cover FAC is async on first paint — retry after load */
        this._chromeSvgBoot = [50, 200, 500, 1000, 2000, 4000].map(function(ms) {
            return setTimeout(function() { this.syncChromeSvgCol(); }.bind(this), ms);
        }.bind(this));
        /* Mobile: relayout after viewport chrome + zoom settle on reload */
        if (!this.$store.state.desktopLayout) {
            this.$nextTick(function() {
                this.setWide();
                this.layoutGrid(true);
                requestAnimationFrame(function() {
                    this.layoutGrid(true);
                }.bind(this));
            }.bind(this));
        }
        this.$nextTick(function() {
            this.initHomePaneSortable();
            this.initHomeListSortable();
        }.bind(this));
        this._homePaneWinResize = function() {
            this.syncHomePaneForWindow();
        }.bind(this);
        window.addEventListener('resize', this._homePaneWinResize, PASSIVE_SUPPORTED ? { passive: true } : false);
        this._cstatsHomeResize = function() {
            this.updateContextStatsHomeCols();
        }.bind(this);
        window.addEventListener('resize', this._cstatsHomeResize, PASSIVE_SUPPORTED ? { passive: true } : false);
        // ⌘/Ctrl held → show dismiss (X) on context-stats cards instead of play
        this._cstatsHomeKeyDown = function(e) {
            if (e.key === 'Meta' || e.key === 'Control' || e.metaKey || e.ctrlKey) {
                this._cstatsHomeSetMod(true);
            }
        }.bind(this);
        this._cstatsHomeKeyUp = function(e) {
            if (e.key === 'Meta' || e.key === 'Control' || (!e.metaKey && !e.ctrlKey)) {
                this._cstatsHomeSetMod(false);
            }
        }.bind(this);
        this._cstatsHomeWinBlur = function() {
            this._cstatsHomeSetMod(false);
        }.bind(this);
        window.addEventListener('keydown', this._cstatsHomeKeyDown, false);
        window.addEventListener('keyup', this._cstatsHomeKeyUp, false);
        window.addEventListener('blur', this._cstatsHomeWinBlur, false);
        this.updateContextStatsHomeCols();
        // Keep shortcut bar highlight in sync with browse root space
        this.$watch('shortcutActiveId', function(id) {
            bus.$emit('browseShortcutActive', id);
        }, { immediate: true });

        // Typing printable chars opens live list-filter (or library search in My Music)
        this._browseTypeFilterKey = function(e) {
            if (this.$store.state.page!='browse' && !this.$store.state.desktopLayout) {
                return;
            }
            if (this.$store.state.openDialogs.length>0 || this.$store.state.visibleMenus.size>0) {
                return;
            }
            if (this.browseListNavFromKey(e)) {
                return;
            }
            if (this.searchActive!=0 || this.selection.size>0) {
                return;
            }
            let t = e.target;
            if (t && (t.tagName=='INPUT' || t.tagName=='TEXTAREA' || t.tagName=='SELECT' || t.isContentEditable)) {
                return;
            }
            if (e.metaKey || e.ctrlKey || e.altKey) {
                return;
            }
            if (e.key && 1==e.key.length && /\S/.test(e.key)) {
                try { e.preventDefault(); } catch (ex) {}
                // My Music root → full library search; elsewhere → live list filter
                let myMusicRoot = this.current && this.current.id==TOP_MYMUSIC_ID;
                if (myMusicRoot) {
                    this.searchActive = 1;
                    this.$nextTick(function() {
                        bus.$emit('search-for', e.key);
                    });
                } else {
                    this.searchActive = 2;
                    this.listFilterTerm = e.key.toLowerCase();
                    if (!this.$store.state.desktopLayout) {
                        this.openBrowseOverflow();
                    }
                    this.$nextTick(function() {
                        bus.$emit('search-list-seed', e.key);
                    });
                }
            }
        }.bind(this);
        window.addEventListener('keydown', this._browseTypeFilterKey, false);
        bus.$on('browse-list-filter', function(term) {
            this.listFilterTerm = undefined==term ? '' : (''+term).trim().toLowerCase();
            // Full kb reset on every filter change so a prior cursor past the new
            // visible set cannot trap ↑/↓ on only the tail of the matches.
            this.resetListFilterKeyboardNav(!!this.listFilterTerm);
            this.applyListFilterClasses();
            if (this.scrollElement) {
                this.lastBrowseScroll = this.scrollElement.scrollTop || 0;
            }
            if (this.listFilterTerm && 2==this.searchActive) {
                // Grid layout may rebuild rows on rAF — re-anchor after paint.
                this.$nextTick(function() {
                    this.$nextTick(function() {
                        this.resetListFilterKeyboardNav(true);
                    }.bind(this));
                }.bind(this));
            }
        }.bind(this));

        // Clicking on 'browse' nav button whilst in browse page goes back.
        bus.$on('nav', function(page, longPress) {
            if ('browse'==page && this.history.length>0) {
                if (longPress) {
                    this.goHome();
                } else {
                    this.goBack();
                }
            }
        }.bind(this));

        bus.$on('langChanged', function() {
            this.initItems();
            this.homeI18nTick = (this.homeI18nTick || 0) + 1;
        }.bind(this));
        this.initItems();
        bus.$on('playerChanged', function() {
            try { browsePlayerChanged(this); } catch (e) {}
        }.bind(this));
        bus.$on('playerStatus', function(playerStatus) {
            this.currentTrack = playerStatus && playerStatus.current ? "track_id:"+playerStatus.current.id : undefined;
            /* Keep Context Stats home cards in sync after listening (playlists / Spotify) */
            let tid = playerStatus && playerStatus.current ? (playerStatus.current.id || playerStatus.current.url || playerStatus.current.title) : undefined;
            if (tid && tid !== this._cstatsLastTrackId) {
                this._cstatsLastTrackId = tid;
                if (typeof contextStatsHomeScheduleRefresh === 'function') {
                    contextStatsHomeScheduleRefresh(this);
                }
            }
        }.bind(this));
        var savedItems = JSON.parse(getLocalStorageVal("topItems", "[]"));
        if (savedItems.length==0) {
            savedItems = JSON.parse(getLocalStorageVal("pinned", "[]"));
            if (savedItems.length==0) {
                lmsCommand("", ["pref", LMS_MATERIAL_DEFAULT_ITEMS_PREF, "?"]).then(({data}) => {
                    if (data && data.result && data.result._p2) {
                        this.updateTopList(JSON.parse(data.result._p2));
                        this.saveTopList();
                        this.autoExpand();
                        this.markBrowseBootPart('top');
                        this.scheduleFinishBrowseInitialLoad();
                    } else {
                        lmsCommand("", ["pref", LMS_MATERIAL_DEFAULT_PINNED_PREF, "?"]).then(({data}) => {
                            if (data && data.result && data.result._p2) {
                                this.addPinned(JSON.parse(data.result._p2));
                            }
                            this.autoExpand();
                            this.markBrowseBootPart('top');
                            this.scheduleFinishBrowseInitialLoad();
                        }).catch(err => {
                            this.autoExpand();
                            this.markBrowseBootPart('top');
                            this.scheduleFinishBrowseInitialLoad();
                        });
                    }
                }).catch(err => {
                    this.autoExpand();
                    this.markBrowseBootPart('top');
                    this.scheduleFinishBrowseInitialLoad();
                });
            } else {
                this.addPinned(savedItems);
                this.autoExpand();
                this.markBrowseBootPart('top');
                this.scheduleFinishBrowseInitialLoad();
            }
        } else {
            this.updateTopList(savedItems);
            this.autoExpand();
            this.markBrowseBootPart('top');
            this.scheduleFinishBrowseInitialLoad();
        }
        this._browseBootTimer = setTimeout(function() {
            if (this.browseInitialLoading) {
                this._browseBoot = { extra: true, cstats: true, top: true };
                this.tryFinishBrowseBoot();
            }
        }.bind(this), 900);

        this.nowPlayingExpanded = false; // Keep track so that we know when to ignore 'esc'=>goback
        bus.$on('nowPlayingExpanded', function(val) {
            this.nowPlayingExpanded = val;
        }.bind(this));
        this.maiShown = false;
        this.maiExpanded = false;
        bus.$on('infoDialog', function(val) {
            this.maiShown = val;
            if (!val) {
                this.maiExpanded = false;
            }
        }.bind(this));
        bus.$on('infoExpanded', function(val) {
            this.maiExpanded = val;
        }.bind(this));
        bus.$on('closeMenu', function() {
            this.menu.show = false;
        }.bind(this));

        bus.$on('escPressed', function() {
            if (this.dragActive) {
                return;
            }
            // ESC first leaves keyboard-navigation mode (deselect) before goBack
            if (this.browseKbNavExitIfActive()) {
                return;
            }
            if (this.$store.state.desktopLayout ? !this.nowPlayingExpanded && !this.maiShown : this.$store.state.page=='browse') {
                if (this.selection.size>0) {
                    this.clearSelection();
                } else if (this.searchActive!=0) {
                    // ESC clears list filter / library search completely
                    this.searchActive = 0;
                    this.listFilterTerm = '';
                    this.listFilterSelPos = -1;
                    this.applyListFilterClasses();
                } else if (this.fusionMode && this.current && this.current.id==TOP_MYMUSIC_ID) {
                    // Let fusion consume ESC for filter / menus / selection first
                    let fusionHandled = false;
                    try {
                        bus.$emit('fusionHandleEsc', function(handled) {
                            if (handled) {
                                fusionHandled = true;
                            }
                        });
                    } catch (e) {}
                    if (fusionHandled) {
                        return;
                    }
                    // Nothing left in fusion → leave to home (not grid/list cycle)
                    this.leaveFusionToMain();
                } else if (this.history.length>0) {
                    this.goBack();
                } else {
                    this.$store.commit('setPage', this.$store.state.prevPage);
                }
            }
        }.bind(this));

        bus.$on('browseEdgeSwipeBack', function() {
            // Left-edge swipe-right: go back in browse stack, else open nav drawer
            if (this.history && this.history.length>0) {
                this.goBack();
            } else {
                bus.$emit('navDrawer');
            }
        }.bind(this));
        // ⌘/Ctrl+← (macOS) or Alt+← (others) — one browse level back when possible
        bus.$on('browseHierarchyBack', function(cb) {
            let handled = false;
            try {
                if (this.$store.state.openDialogs.length>0 || this.$store.state.visibleMenus.size>0) {
                    if (typeof cb==='function') { cb(false); }
                    return;
                }
                if (!this.$store.state.desktopLayout && this.$store.state.page!='browse') {
                    if (typeof cb==='function') { cb(false); }
                    return;
                }
                // Unity/fusion drill (artists→albums→tracks) first
                if (this.fusionMode && this.current && this.current.id==TOP_MYMUSIC_ID) {
                    let fusionHandled = false;
                    try {
                        bus.$emit('fusionHandleBack', function(ok) {
                            if (ok) { fusionHandled = true; }
                        });
                    } catch (e) {}
                    if (fusionHandled) {
                        handled = true;
                        if (typeof cb==='function') { cb(true); }
                        return;
                    }
                }
                if (this.history && this.history.length>0) {
                    this.goBack();
                    handled = true;
                }
            } catch (e) {}
            if (typeof cb==='function') { cb(handled); }
        }.bind(this));
        // Fusion list scroll hides/shows My Music glass subheader
        bus.$on('fusionChromeCollapsed', function(collapsed) {
            if (!this.browseMobilePullChrome) {
                return;
            }
            if (collapsed) {
                this.browseCollapseSubheader();
            } else {
                this.browseExpandSubheader();
            }
        }.bind(this));
        // Fusion (and other hosts) open the global browse context menu for a synthetic item
        bus.$on('browseShowItemMenu', function(item, event) {
            if (!item) {
                return;
            }
            try {
                if (typeof storeClickOrTouchPos === 'function') {
                    storeClickOrTouchPos(event, this.menu);
                } else if (event) {
                    this.menu.x = event.clientX || (event.touches && event.touches[0] && event.touches[0].clientX) || this.menu.x || 0;
                    this.menu.y = event.clientY || (event.touches && event.touches[0] && event.touches[0].clientY) || this.menu.y || 0;
                }
            } catch (e) {}
            let ev = event || { clientX: this.menu.x, clientY: this.menu.y };
            if (undefined==ev.clientX && this.menu) {
                ev = { clientX: this.menu.x, clientY: this.menu.y };
            }
            if (typeof browseItemMenu === 'function') {
                browseItemMenu(this, item, -1, ev);
            } else {
                this.itemMenu(item, -1, ev);
            }
        }.bind(this));
        // Item list-swipe claimed the gesture — do not also navigate back
        bus.$on('browseItemSwipeActive', function(active) {
            if (active) {
                this.browseNavSwipeBlocked = true;
                this.browseNavSwipe = undefined;
            }
        }.bind(this));
        bus.$on('browseItemSwipeHandled', function() {
            this.browseNavSwipeBlocked = true;
            this.browseNavSwipe = undefined;
            this._browseItemSwipeJustHandled = true;
        }.bind(this));
        bus.$on('browse-home', function() {
            this.goHome();
        }.bind(this));
        bus.$on('browse-set-layout', function(useGrid) {
            if (this.$store.state.desktopLayout) {
                bus.$emit('npclose');
            } else {
                this.$store.commit('setPage', 'browse');
            }
            if (typeof this.changeLayout === 'function') {
                this.changeLayout(!!useGrid);
            }
        }.bind(this));
        bus.$on('refresh-home', function() {
            if (this.isTop) {
                this.getHomeExtra();
            }
        }.bind(this));
        bus.$on('browse-action', function(act, idx) {
            if (idx>=0 && idx<this.items.length) {
                this.itemAction(act, this.items[idx], idx, undefined);
            }
        }.bind(this));
        bus.$on('browse-shortcut', function(id, hint) {
            if (id==SEARCH_SHORTCUT) {
                this.openLibrarySearch();
                return;
            }
            if (this.$store.state.desktopLayout) {
                bus.$emit('npclose');
            } else {
                this.$store.commit('setPage', 'browse');
            }
            if (id==HOME_SHORTCUT) {
                if (!this.isTop) {
                    this._browseNavSkipAnim = true;
                    this.goHome();
                }
                this.homePaneSelectedId = HOME_PANE_HOME_ID;
                bus.$emit('browseShortcutActive', HOME_SHORTCUT);
                return;
            }
            // Only short-circuit if already on this exact page (same id AND title when given)
            if (this.current && id==this.current.id &&
                (!hint || !hint.title || hint.title==this.current.title)) {
                bus.$emit('browseShortcutActive', id);
                return;
            }
            // Shortcut bar: no iPod push/pop animation for top-level jumps
            this._browseNavSkipAnim = true;
            // Top-level space: go directly (same as home-pane) — never goHome() first
            // Prefer pinned entries that carry command/params (Spotty folders share
            // fragile item_id values with the live app tree).
            let item = null;
            let idx = -1;
            let matches = [];
            for (let i=0, loop=this.top||[], len=loop.length; i<len; ++i) {
                if (loop[i].id==id) {
                    matches.push({item:loop[i], idx:i});
                }
            }
            // If id match failed / ambiguous, also match by title among pinned Spotty-like entries
            if ((matches.length==0 || matches.length>1) && hint && hint.title) {
                for (let i=0, loop=this.top||[], len=loop.length; i<len; ++i) {
                    if (loop[i].title==hint.title && (loop[i].isPinned || (loop[i].command && loop[i].command.length))) {
                        let already = matches.some(function(m){ return m.idx==i; });
                        if (!already) {
                            matches.push({item:loop[i], idx:i});
                        }
                    }
                }
            }
            if (matches.length>0) {
                let best = null;
                if (hint && hint.title) {
                    best = matches.find(function(m) {
                        return m.item.title==hint.title && m.item.isPinned && m.item.command && m.item.command.length;
                    }) || matches.find(function(m) {
                        return m.item.title==hint.title && m.item.command && m.item.command.length;
                    }) || matches.find(function(m) {
                        return m.item.title==hint.title;
                    });
                }
                if (!best && hint && hint.isPinned) {
                    best = matches.find(function(m) {
                        return m.item.isPinned && m.item.command && m.item.command.length;
                    }) || matches.find(function(m) {
                        return m.item.isPinned;
                    });
                }
                if (!best) {
                    best = matches.find(function(m) {
                        return m.item.isPinned && m.item.command && m.item.command.length;
                    }) || matches.find(function(m) {
                        return m.item.command && m.item.command.length;
                    }) || matches.find(function(m) {
                        return m.item.isPinned;
                    }) || matches[0];
                }
                item = best.item;
                idx = best.idx;
            }
            if (!item) {
                this._browseNavSkipAnim = false;
                return;
            }
            this.homePaneSelectedId = item.id;
            bus.$emit('browseShortcutActive', item.id);
            if (typeof browseHomePaneNavigate==='function') {
                browseHomePaneNavigate(this, item, idx, undefined);
            } else {
                if (!this.isTop && typeof browsePrepareHomePaneNav==='function') {
                    browsePrepareHomePaneNav(this);
                }
                browseClick(this, item, idx, undefined, true, true);
            }
        }.bind(this));
        bus.$on('prefset', function(pref, value) {
            if (this.myMusic.length>0 && ('plugin.material-skin:enabledBrowseModes'==pref || 'server:useUnifiedArtistsList'==pref)) {
                this.myMusic[0].needsUpdating=true;
            }
        }.bind(this));

        bus.$on('trackInfo', function(item, index, page) {
            if (!this.$store.state.desktopLayout) {
                this.$store.commit('setPage', 'browse');
            }
            if (this.history.length>=50) {
                this.goHome();
            }
            this.itemMoreMenu(item, index, page);
        }.bind(this));
        bus.$on('browse-search', function(text, page) {
            if (!this.$store.state.desktopLayout) {
                this.$store.commit('setPage', 'browse');
            }
            if (this.history.length>=50) {
                this.goHome();
            }
            this.searchActive = 1;
            this.$nextTick(function () {
                bus.$emit('search-for', text, page);
                bus.$emit('search-focus');
            });
        }.bind(this));
        bus.$on('browse-pin', function(item, add) {
            browsePin(this, item, add);
        }.bind(this));
        bus.$on('browse', function(cmd, params, title, page, clearHistory, subtitle) {
            browseGoToItem(this, cmd, params, title, page, clearHistory, subtitle);
        }.bind(this));
        /* Music Artist Info from queue (or elsewhere) context menu */
        bus.$on('browseMai', function(opts) {
            if (!opts || !opts.command) {
                return;
            }
            if (!this.$store.state.desktopLayout) {
                this.$store.commit('setPage', 'browse');
            }
            this.fetchItems({command: opts.command, params: []}, {
                cancache: false,
                id: opts.id || ('mai:'+opts.command.join(':')),
                title: opts.title || ACTIONS[ARTIST_INFO_ACTION].title,
                image: opts.image,
                stdItem: STD_ITEM_MAI
            }, opts.page || 'queue');
            if (opts.isArtist && typeof browseFetchExtra==='function') {
                browseFetchExtra(this, true);
            }
        }.bind(this));

        bus.$on('refreshList', function(section) {
            if (undefined==section || section==SECTION_PODCASTS || (this.current && this.current.section==section) ||
                (section==SECTION_FAVORITES && this.isTop && this.$store.state.detailedHomeItems.length>0)) {
                this.refreshList();
            }
        }.bind(this));
        bus.$on('refreshPlaylist', function(name) {
            if (this.current && this.current.section==SECTION_PLAYLISTS) {
                if (this.current.id.startsWith(MUSIC_ID_PREFIX) || undefined==name || this.current.title==name) {
                    this.refreshList();
                }
                if (!this.current.id.startsWith(MUSIC_ID_PREFIX) && this.history.length>0) {
                    this.history[this.history.length-1].needsRefresh = true;
                }
            }
        }.bind(this));
        bus.$on('ratingsSet', function(ids, value) {
            this.refreshList();
        }.bind(this));
        bus.$on('ratingChanged', function(track, album) {
            if (this.current && this.current.id==("album_id:"+album)) {
                this.refreshList();
            }
        }.bind(this));
        bus.$on('closeLibSearch', function() {
            this.goBack();
        }.bind(this));
        bus.$on('showLinkMenu.browse', function(x, y, menu) {
            showMenu(this, {linkItems: menu, x:x, y:y, show:true});
        }.bind(this));
        bus.$on('windowHeightChanged', function() {
            this.filterJumplist();
            this.tall = window.innerHeight>=MIN_HEIGHT_FOR_DETAILED_SUB ? 1 : 0;
            if (!this.$store.state.desktopLayout) {
                this.$nextTick(function() {
                    this.layoutGrid(true);
                }.bind(this));
            }
        }.bind(this));
        bus.$on('npBarDocked', function() {
            if (!this.$store.state.desktopLayout) {
                this.$nextTick(function() {
                    this.layoutGrid(true);
                }.bind(this));
            }
        }.bind(this));
        bus.$on('showQueue', function(val) {
            if (this.$store.state.pinQueue) {
                this.$nextTick(function () { this.layoutGrid(); });
            }
        }.bind(this));

        this.onlineServices=[];
        lmsCommand("", ["browseonlineartist", "services"]).then(({data}) => {
            logJsonMessage("RESP", data);
            if (data && data.result && data.result.services) {
                this.onlineServices=data.result.services;
            }
        });

        bus.$on('browseDisplayChanged', function() {
            if (this.myMusic.length>0) {
                this.myMusic[0].needsUpdating=true;
            }
            this.options.sortFavorites=this.$store.state.sortFavorites;
            this.goHome();
            if (this.isTop) {
                this.setLayoutAction();
            }
            if (this.$store.state.detailedHomeItems.length>0 && !arraysEqual(this.topExtraCfg.items, this.$store.state.detailedHomeItems)) {
                this.getHomeExtra();
            } else {
                this.items = this.isTop && this.grid.use && this.$store.state.detailedHomeItems.length>0 ? this.topExtra.concat(this.top) : this.top;
                this.layoutGrid(true);
            }
        }.bind(this));
        bus.$on('setBgndCover', function() {
           this.setBgndCover();
        }.bind(this));
        bus.$on('libraryChanged', function() {
            this.setLibrary();
        }.bind(this));
        this.setLibrary();

        bus.$on('scrollCurrentToTop', function() {
            if (!this.$store.state.desktopLayout && this.$store.state.page!='browse') {
                return;
            }
            if (this.$store.state.npSheetOpen) {
                return;
            }
            let el = this.scrollElement || document.getElementById('browse-list');
            if (el) {
                try {
                    el.style['-webkit-overflow-scrolling'] = 'auto';
                    if (typeof el.scrollTo==='function') {
                        el.scrollTo({ top: 0, behavior: 'smooth' });
                    } else {
                        el.scrollTop = 0;
                    }
                    setTimeout(function() {
                        try { el.style['-webkit-overflow-scrolling'] = 'touch'; } catch (e2) {}
                    }, 450);
                } catch (e) {
                    el.scrollTop = 0;
                }
            }
        }.bind(this));
        this.scrollElement = document.getElementById("browse-list");
        if (typeof this.browseZoomBind === 'function') {
            this.$nextTick(function() {
                this.browseZoomBind(this.$el);
            }.bind(this));
        }
        this._browseHandleScroll = this.handleScroll.bind(this);
        this._browseTouchStart = this.browseTouchStart.bind(this);
        this._browseTouchMove = this.browseTouchMove.bind(this);
        this._browseTouchEnd = this.browseTouchEnd.bind(this);
        this._browseWheelPull = this.browseWheelPull.bind(this);
        this._browsePullStart = this.browsePullChromeStart.bind(this);
        this._browsePullMove = this.browsePullChromeMove.bind(this);
        this._browsePullEnd = this.browsePullChromeEnd.bind(this);
        this.scrollElement.addEventListener("scroll", this._browseHandleScroll, PASSIVE_SUPPORTED ? { passive: true } : false);
        this.scrollElement.addEventListener("touchstart", this._browseTouchStart, PASSIVE_SUPPORTED ? { passive: true } : false);
        this.scrollElement.addEventListener("touchmove", this._browseTouchMove, PASSIVE_SUPPORTED ? { passive: false } : false);
        this.scrollElement.addEventListener("touchend", this._browseTouchEnd, PASSIVE_SUPPORTED ? { passive: true } : false);
        this.scrollElement.addEventListener("touchcancel", this._browseTouchEnd, PASSIVE_SUPPORTED ? { passive: true } : false);
        this.scrollElement.addEventListener("wheel", this._browseWheelPull, PASSIVE_SUPPORTED ? { passive: true } : false);
        this._browseViewEl = this.$el;
        if (this._browseViewEl) {
            this._browseViewEl.addEventListener("touchstart", this._browsePullStart, { capture: true, passive: true });
            this._browseViewEl.addEventListener("touchmove", this._browsePullMove, { capture: true, passive: false });
            this._browseViewEl.addEventListener("touchend", this._browsePullEnd, { capture: true, passive: true });
            this._browseViewEl.addEventListener("touchcancel", this._browsePullEnd, { capture: true, passive: true });
            this._browseViewEl.addEventListener("wheel", this._browseWheelPull, { capture: true, passive: true });
        }
        // Desktop pointer swipes on song rows (only attach mousemove while active)
        this.scrollElement.addEventListener("mousedown", this.browsePointerDown, false);
        msRegister(this, this.scrollElement);
        bus.$on('splitterChanged', function() {
            this.setWide();
            this.layoutGrid();
        }.bind(this));
        bus.$on('relayoutGrid', function() {
            this.layoutGrid();
        }.bind(this));
        bus.$on('layoutChanged', function() {
            this.$nextTick(function () {
                this.layoutGrid(true);
                // Mobile bottomnav is recreated on desktop→mobile; it requests items on
                // mount. Also re-emit here so any already-mounted consumers refresh.
                if (this.top && this.top.length>0) {
                    bus.$emit('homeScreenItems', this);
                }
            }.bind(this));
        }.bind(this));
        // Late consumers (e.g. bottomnav after resize layout switch) ask for current top
        bus.$on('getHomeScreenItems', function() {
            if (this.top && this.top.length>0) {
                bus.$emit('homeScreenItems', this);
            }
        }.bind(this));
        this.setWide();
        setTimeout(function () {
            this.setWide();
            this.tall = window.innerHeight>=MIN_HEIGHT_FOR_DETAILED_SUB ? 1 : 0
        }.bind(this), 1000);
        bus.$on('windowWidthChanged', function() {
            this.syncHomePaneForWindow();
            this.setWide();
            // Debounce grid relayout — sidebar open/close fires this and was a jank source
            if (this._wwLayoutTimer) {
                clearTimeout(this._wwLayoutTimer);
            }
            this._wwLayoutTimer = setTimeout(function() {
                this._wwLayoutTimer = null;
                this.layoutGrid();
            }.bind(this), 90);
        }.bind(this));

        bus.$on('themeChanged', function() {
            this.setBgndCover();
        }.bind(this));
        bus.$on('colorChanged', function(col) {
            this.hRgb = col;
        }.bind(this));
        this.setBgndCover();
        bus.$on('browseQueueDrop', function(browseIndex, queueIndex, queueSize) {
            if ((browseIndex>=0 && browseIndex<this.items.length) || (-1==browseIndex && this.selection.size>0)) {
                browseInsertQueue(this, browseIndex, queueIndex, queueSize);
            }
        }.bind(this));
        bus.$on('dragActive', function(act) {
            this.dragActive = act;
            if (!act) {
                this.dropIndex = -1;
            }
        }.bind(this));
        this.queueSelection=false;
        bus.$on('queueSelection', function(sel) {
            this.queueSelection=sel;
        }.bind(this));
        bus.$on('queueSelectedUrls', function(urls, index, id) {
            if (this.current.section==SECTION_PLAYLISTS) {
                if (id.startsWith("playlist_id")) {
                    browseAddToPlaylist(this, urls, id);
                } else {
                    browseAddToPlaylist(this, urls, this.current.id, index, this.items.length);
                }
            }
        }.bind(this));
        bus.$on('pin', function(item, add) {
            this.pin(item, add);
        }.bind(this));
    },
    filters: {
        itemTooltip: function (item) {
            if (undefined==item ) {
                return '';
            }
            if (item.title && item.subtitle) {
                return stripTags(item.title)+"\n"+stripTags(item.subtitle);
            }
            return stripTags(item.title);
        },
        displaySelectionCount: function (value) {
            return value ? value : 0;
        },
        svgIcon: function (name, dark, hoverInGrid, header) {
            /* Chrome tint: primary/dominant for subheader + sidebar SVGs.
             * Pass chromeSvgCol as 3rd/4th arg so Vue re-evaluates when cover color lands. */
            if (hoverInGrid==='chrome' || header===true || header==='chrome') {
                var col = '';
                /* Prefer reactive token from template (header often holds chromeSvgCol) */
                if (undefined!=header && header!==true && header!=='chrome' && (''+header).length>=3) {
                    col = (''+header).replace("#", "").trim();
                } else if (this && this.chromeSvgCol && this.chromeSvgCol.length>=3) {
                    col = this.chromeSvgCol;
                }
                if (!col || col.length<3) {
                    try {
                        var el = document.getElementById("browse-view") || document.documentElement;
                        col = getComputedStyle(el).getPropertyValue("--primary-color").replace("#", "").trim();
                    } catch (e) {}
                }
                if (col && col.length>=3) {
                    return "/material/svg/"+name+"?c="+col+"&r="+LMS_MATERIAL_REVISION;
                }
                return "/material/svg/"+name+"?c="+(dark ? LMS_DARK_SVG : LMS_LIGHT_SVG)+"&r="+LMS_MATERIAL_REVISION;
            }
            if (undefined!=hoverInGrid) {
                return "/material/svg/"+name+"?c="+(dark||hoverInGrid ? LMS_DARK_SVG : LMS_LIGHT_SVG)+"&c2="+(dark||hoverInGrid ? "333" : "eee")+"&r="+LMS_MATERIAL_REVISION;
            }
            if (undefined!=header) {
                return "/material/svg/"+name+"?c="+getComputedStyle(document.getElementById("browse-view")).getPropertyValue("--active-color").replace("#", "")+"&r="+LMS_MATERIAL_REVISION;
            }
            return "/material/svg/"+name+"?c="+(dark ? LMS_DARK_SVG : LMS_LIGHT_SVG)+"&r="+LMS_MATERIAL_REVISION;
        },
        indIcon: function (name) {
            return "/material/svg/"+name+"?c="+getComputedStyle(document.documentElement).getPropertyValue("--primary-color").replace("#", "")+"&c2="+LMS_DARK_SVG+"&r="+LMS_MATERIAL_REVISION;
        },
        emblem: function (e) {
            return "/material/svg/"+e.name+"?c="+e.color.substr(1)+"&r="+LMS_MATERIAL_REVISION;
        },
        tooltip: function (act, showShortcut) {
            return showShortcut && ACTIONS[act].key
                        ? ttShortcutStr(ACTIONS[act].title, ACTIONS[act].key)
                            : showShortcut && ACTIONS[act].skey
                                ? ttShortcutStr(ACTIONS[act].title, ACTIONS[act].skey, true)
                                : ACTIONS[act].title;
        },
        tooltipStr(str, val, showShortcut) {
            return showShortcut ? ttShortcutStr(str, val) : str;
        },
        gridImageSize(str) {
            return toggleBrowseImageSize(str, true);
        }
    },
    watch: {
        'menu.show': function(newVal) {
            this.$store.commit('menuVisible', {name:'browse-'+this.menu.name, shown:newVal});
            if (newVal) {
                if (typeof this.ctxSheetPrepareOpen==='function' && !this.desktopLayout) {
                    this.ctxSheetPrepareOpen();
                } else if (this.desktopLayout) {
                    // Desktop: always size to content — never keep mobile sheet height
                    this.$nextTick(function() {
                        try {
                            document.querySelectorAll('.v-menu__content.menuable__content__active:not(.msk-context-sheet)').forEach(function(el) {
                                el.style.removeProperty('height');
                                el.style.removeProperty('max-height');
                                el.style.removeProperty('transform');
                                el.classList.remove('msk-context-sheet-sized', 'msk-context-sheet-enter',
                                    'msk-context-sheet-expanded', 'msk-context-sheet-dragging');
                            });
                        } catch (e) {}
                    });
                }
            } else {
                if (!this.desktopLayout && typeof browsePreviewHoldStop==='function' &&
                    (this._previewSticky || this._previewHoldActive)) {
                    try { browsePreviewHoldStop(this, true); } catch (ePrev) {}
                }
                if (typeof this.ctxSheetResetStyles==='function') {
                    this.ctxSheetResetStyles();
                }
                this.menu.selection = undefined;
                clearTextSelection();
                this.menu.closed = new Date().getTime();
                if (undefined!=this.menu.currentActions) {
                    for (let i=0, loop=this.menu.currentActions, len=loop.length; i<len; ++i) {
                        if (undefined!=loop[i].expanded && undefined!=loop[i].key) {
                            setLocalStorageVal(loop[i].key+'-expanded', loop[i].expanded);
                        }
                    }
                }
            }
        },
        '$store.state.pinQueue': function() {
            this.setWide();
            this.layoutGrid();
        },
        'searchActive': function(newVal) {
            let host = document.querySelector('.browse-lib-search-host');
            if (1==newVal) {
                if (host) {
                    host.classList.add('active');
                }
            } else {
                this.browseSearching = false;
                if (host) {
                    host.classList.remove('active');
                    try {
                        host.style.removeProperty('pointer-events');
                        host.style.removeProperty('opacity');
                    } catch (e) {}
                }
            }
            if (2!=newVal) {
                this.highlightIndex = -1;
                this.highlightSubIndex = -1;
                this.clearBrowseKbSelect();
                this.listFilterTerm = '';
                this.listFilterSelPos = -1;
                this._gridFilterTerm = undefined;
                this._listFilterTerm = undefined;
                this._blbiOut = undefined;
                this.applyListFilterClasses();
                if (this.grid.use) {
                    this.layoutGrid(true);
                }
            }
        },
        catalogArtUrl: function(url) {
            if (this.browseCatalogHero && url) {
                this.extractBrowseCatalogPalette(url);
            } else if (!url) {
                this.clearBrowseCatalogPalette();
            }
        },
        browseCatalogHero: function(on) {
            if (on) {
                this.extractBrowseCatalogPalette(this.catalogArtUrl);
            } else {
                this.clearBrowseCatalogPalette();
                this.syncBrowseCatalogChrome();
            }
        },
        browseJumplistGutter: function(on) {
            document.documentElement.style.setProperty('--jump-list-adjust', (on ? JUMP_LIST_WIDTH : 0)+'px');
        },
        browseSubheaderCompact: function() {
            this.syncBrowseCatalogChrome();
        },
        current: function() {
            this.browseOverflowPulling = false;
            this.browseOverflowPullPx = 0;
            this.browseOverflowOpen = false;
            this.browsePlaySwipeOpen = false;
            this.browsePlaySwiping = false;
            this.browsePlaySwipePx = 0;
            this._browseItemsUnsorted = undefined;
            this._browseJumplistUnsorted = undefined;
            this.clearBrowsePlaySwipeTimer();
            if (this.searchActive==2) {
                this.searchActive = 0;
            }
        },
        items: function(val) {
            if (this._browseAlphaApplying) {
                return;
            }
            this._browseItemsUnsorted = (val || []).slice();
            if (this.browseAlphaSort && this.browseCanAlphaSort) {
                this.applyBrowseAlphaSort();
            }
        },
        '$store.state.browseCatalogTintToolbar': function() {
            this.syncBrowseCatalogChrome();
        },
        '$store.state.darkUi': function() {
            if (this.browseCatalogHero) {
                this.extractBrowseCatalogPalette(this.catalogArtUrl);
            }
        },
        '$store.state.player': function() {
            if (this.topExtraCfg.needsPlayer && this.isTop) {
                this.getHomeExtra();
            }
            this.probeHomeSourceSelect();
        },
        '$store.state.browseSearch': function() {
            bus.$emit('homeScreenItems', this);
        },
        '$store.state.browseHomeSplit': function() {
            this.$nextTick(function() {
                this.syncHomePaneForWindow();
            }.bind(this));
        },
        'useHomeSplit': function() {
            this.$nextTick(function() {
                this.initHomePaneWidth();
                this.initHomePaneSortable();
                this.setWide();
                this.layoutGrid();
            }.bind(this));
        },
        'desktopLayout': function() {
            this.windowWidth = window.innerWidth || 0;
            this.$nextTick(function() {
                this.syncHomePaneForWindow();
            }.bind(this));
        },
        'top': function() {
            if (this.dragActive || this.homePaneSortBusy || this.homeListSortBusy || document.body.classList.contains('msk-sortable-active')) {
                return;
            }
            this.$nextTick(function() {
                this.initHomePaneSortable();
                this.initHomeListSortable();
            }.bind(this));
        },
        'isTop': function() {
            if (typeof browseZoomSyncContext === 'function') {
                browseZoomSyncContext(this);
            }
            this.$nextTick(function() { this.initHomeListSortable(); }.bind(this));
        },
        'grid.use': function() {
            this.$nextTick(function() { this.initHomeListSortable(); }.bind(this));
        },
    },
    beforeDestroy() {
        this.clearBrowseCatalogPalette();
        this.browseKbNavClearTimer();
        this.clearBrowsePlaySwipeTimer();
        if (this._jumplistTouchTimer) {
            clearTimeout(this._jumplistTouchTimer);
        }
        bus.$emit('jumplistTouch', false);
        this.jumplistActiveSlot = -1;
        if (this._browseTypeFilterKey) {
            window.removeEventListener('keydown', this._browseTypeFilterKey);
        }
        if (this._cstatsHomeKeyDown) {
            window.removeEventListener('keydown', this._cstatsHomeKeyDown, false);
        }
        if (this._cstatsHomeKeyUp) {
            window.removeEventListener('keyup', this._cstatsHomeKeyUp, false);
        }
        if (this._cstatsHomeWinBlur) {
            window.removeEventListener('blur', this._cstatsHomeWinBlur, false);
        }
        if (this._cstatsHomeResize) {
            window.removeEventListener('resize', this._cstatsHomeResize);
        }
        if (undefined!==this.updateTimer) {
            clearTimeout(this.updateTimer);
            this.updateTimer = undefined;
        }
        if (this._homeGreetingTimer) {
            clearInterval(this._homeGreetingTimer);
            this._homeGreetingTimer = undefined;
        }
        if (this._homePaneWinResize) {
            window.removeEventListener('resize', this._homePaneWinResize);
        }
        this.homePaneResizeEnd();
        mskSortableDestroy(this.homePaneSortable);
        this.homePaneSortable = undefined;
        mskSortableDestroy(this.homeListSortable);
        this.homeListSortable = undefined;
        if (typeof this.browseZoomUnbind === 'function') {
            this.browseZoomUnbind();
        }
        if (undefined!=this.scrollElement) {
            this.scrollElement.removeEventListener("scroll", this._browseHandleScroll);
            this.scrollElement.removeEventListener("touchstart", this._browseTouchStart);
            this.scrollElement.removeEventListener("touchmove", this._browseTouchMove);
            this.scrollElement.removeEventListener("touchend", this._browseTouchEnd);
            this.scrollElement.removeEventListener("touchcancel", this._browseTouchEnd);
            this.scrollElement.removeEventListener("mousedown", this.browsePointerDown);
            this.scrollElement.removeEventListener("wheel", this._browseWheelPull);
        }
        if (this._browseViewEl) {
            this._browseViewEl.removeEventListener("touchstart", this._browsePullStart, true);
            this._browseViewEl.removeEventListener("touchmove", this._browsePullMove, true);
            this._browseViewEl.removeEventListener("touchend", this._browsePullEnd, true);
            this._browseViewEl.removeEventListener("touchcancel", this._browsePullEnd, true);
            this._browseViewEl.removeEventListener("wheel", this._browseWheelPull, true);
            this._browseViewEl = undefined;
        }
        try {
            window.removeEventListener("mousemove", this.browsePointerMove, false);
            window.removeEventListener("mouseup", this.browsePointerUp, false);
        } catch (e) {}
        document.documentElement.style.removeProperty('--browse-subheader-offset');
        if (this._chromeSvgOnColor) {
            bus.$off('colorChanged', this._chromeSvgOnColor);
            bus.$off('currentCover', this._chromeSvgOnColor);
            this._chromeSvgOnColor = undefined;
        }
        if (this._chromeSvgMo) {
            try { this._chromeSvgMo.disconnect(); } catch (e) {}
            this._chromeSvgMo = undefined;
        }
        if (this._chromeSvgMoTimer) {
            clearTimeout(this._chromeSvgMoTimer);
            this._chromeSvgMoTimer = undefined;
        }
        if (this._chromeSvgBoot) {
            this._chromeSvgBoot.forEach(function(t) { clearTimeout(t); });
            this._chromeSvgBoot = undefined;
        }
    }
});

