/**
 * LMS-Material
 *
 * Copyright (c) 2018-2026 Craig Drummond <craig.p.drummond@gmail.com>
 * MIT license.
 */
'use strict';

const ARTIST_TAB = 0;
const ALBUM_TAB = 1;
const TRACK_TAB = 2;

const NP_PIC_ACT = 1;
const NP_INFO_ACT = 2;
const NP_BROWSE_CMD = 3;
const NP_SHARE_CMD = 4;
const NP_COPY_DETAILS_CMD = 5;
const NP_SHOW_IN_TABS_ACT = 6;
const NP_SYNC_ACT = 7;
const NP_LYRICS_SCROLL_ACT = 8;
const NP_LYRICS_HIGHLIGHT_ACT = 9;
const NP_ZOOM_ACT = 10;
const NP_INFO_EXPAND_ACT = 11;
const NP_CUSTOM = 100;
const NP_ITEM_ACT = 200;
const NP_MIN_WIDTH_FOR_FULL = 780;

const MAX_LYRICS_DURATION = 60 * 60; // 1hr?

/* Mobile integrated MAI: horizontal cards = queue | now playing | lyrics | artist | album */
const NP_LYRICS_SLIDE_ENABLED = true;
const NP_CARD_SLIDE_QUEUE = 0;
const NP_CARD_SLIDE_NP = 1;
const NP_CARD_SLIDE_LYRICS = NP_LYRICS_SLIDE_ENABLED ? 2 : -1;
const NP_CARD_SLIDE_ARTIST = NP_LYRICS_SLIDE_ENABLED ? 3 : 2;
const NP_CARD_SLIDE_ALBUM = NP_LYRICS_SLIDE_ENABLED ? 4 : 3;
const NP_CARD_SLIDE_COUNT = NP_LYRICS_SLIDE_ENABLED ? 5 : 4;
const NP_CARD_SLIDE_TABS = NP_LYRICS_SLIDE_ENABLED
    ? [null, null, TRACK_TAB, ARTIST_TAB, ALBUM_TAB]
    : [null, null, ARTIST_TAB, ALBUM_TAB];

var currentPlayingTrackPosition = 0;

var lmsNowPlaying = Vue.component("lms-now-playing", {
    template: `
<div v-bind:class="{'np-mob-nonav':!desktopLayout && MBAR_REP_NAV==mobileBar}">
 <div class="np-orient-veil" v-show="npOrientSettling" aria-hidden="true"></div>
 <div class="np-volume-overlay-host" v-show="overlayVolume>-1 && VOL_STD==playerStatus.dvc"><div id="volumeOverlay">{{overlayVolume}}%</div></div>
 <div v-show="showNpSheetScrim" class="np-sheet-scrim" v-bind:class="{'np-sheet-scrim-enter':npSheetAnim=='expand', 'np-sheet-scrim-exit':npSheetAnim=='collapse', 'np-sheet-scrim-drag':npSheetDragY>0}"></div>
 <div v-if="desktopLayout && info.show && !info.expanded && !infoDrawerOut" class="np-info-dismiss" @mousedown="retractInfo" @touchstart="retractInfo"></div>
 <div v-show="showNpBgnd" class="np-bgnd" v-bind:class="[{'np-bgnd-sheet-palette':npSheetPaletteActive && npBarArtUrl && !info.show && !maiArtistBgndActive, 'np-bgnd-sheet-dark':npSheetPaletteActive && npBarArtUrl && !info.show && !maiArtistBgndActive && darkUi, 'np-bgnd-sheet-light':npSheetPaletteActive && npBarArtUrl && !info.show && !maiArtistBgndActive && !darkUi, 'np-bgnd-mai-palette':maiArtistBgndActive, 'np-bgnd-mai-dark':maiArtistBgndActive && darkUi, 'np-bgnd-mai-light':maiArtistBgndActive && !darkUi, 'np-info-drawer-in':infoDrawerIn && desktopLayout && info.show, 'np-info-drawer-out':infoDrawerOut && desktopLayout && info.show, 'np-info-expand-anim':(infoExpandAnim=='in' || infoExpandAnim=='out') && desktopLayout && info.show, 'np-info-expand-anim-in':infoExpandAnim=='in' && desktopLayout && info.show, 'np-info-expand-anim-out':infoExpandAnim=='out' && desktopLayout && info.show}, npBgndSlideClasses]">
  <template v-if="maiArtistBgndActive">
   <div class="np-bgnd-mai-edge" v-bind:style="maiArtistBgndEdgeStyle"></div>
   <div class="np-bgnd-mai-palette-bg"></div>
   <div class="np-bgnd-mai-palette-scrim"></div>
  </template>
  <template v-else-if="npSheetPaletteActive && npBarArtUrl && !info.show">
   <div class="np-bgnd-palette-bg"></div>
   <div class="np-bgnd-palette-scrim"></div>
  </template>
  <div v-else v-bind:style="{'background-image':'url('+currentBgndUrl+')'}" v-bind:class="[(info.show ? drawInfoBgndImage||drawInfoBackdrop : drawBgndImage||drawBackdrop) ? 'np-bgnd-cover':'np-bgnd-cover-none', (info.show ? drawInfoBackdrop : drawBackdrop) ? 'np-backdrop-blur':'']"></div>
 </div>
 <v-tooltip top :position-x="timeTooltip.x" :position-y="timeTooltip.y" v-model="timeTooltip.show">{{timeTooltip.text}}</v-tooltip>
 <v-menu v-model="menu.show" :position-x="menu.x" :position-y="menu.y" absolute offset-y>
  <v-list>
   <template v-for="(item, index) in menu.items">
    <v-divider v-if="item.divider"></v-divider>
    <v-subheader v-else-if="item.header" style="padding-top:16px">{{item.title}}</v-subheader>
    <v-list-tile role="menuitem" v-else-if="undefined==item.title" @click="menuStdAction(item)" >
     <v-list-tile-avatar :tile="true" class="lms-avatar"><v-icon v-if="ACTIONS[item].icon">{{ACTIONS[item].icon}}</v-icon><img v-else-if="ACTIONS[item].svg" class="svg-img" :src="ACTIONS[item].svg | svgIcon(darkUi)"></img></v-list-tile-avatar>
     <v-list-tile-title>{{ACTIONS[item].title}}</v-list-tile-title>
    </v-list-tile>
    <v-list-tile role="menuitem" v-else @click="menuAction(item)">
     <v-list-tile-avatar v-if="undefined!=item.check"><v-icon>{{item.check ? 'check_box' : 'check_box_outline_blank'}}</v-icon></v-list-tile-avatar>
     <v-list-tile-avatar v-if="undefined!=item.radio"><v-icon>{{item.radio ? 'radio_button_checked' : 'radio_button_unchecked'}}</v-icon></v-list-tile-avatar>
     <v-list-tile-avatar v-else-if="menu.icons" :tile="true" class="lms-avatar"><v-icon v-if="item.icon">{{item.icon}}</v-icon><img v-else-if="item.svg" class="svg-img" :src="item.svg | svgIcon(darkUi)"></img></v-list-tile-avatar>
     <v-list-tile-title>{{item.title}}</v-list-tile-title>
    </v-list-tile>
   </template>
  </v-list>
 </v-menu>
 <!-- Player prefs: desktop popover / mobile bottom drawer. Device sections open a submenu. -->
 <div v-if="npPlayerPrefs.open && !desktopLayout" class="np-player-prefs-scrim" @click="closeNpPlayerPrefs" @touchmove.prevent=""></div>
 <div v-if="npPlayerPrefs.open" class="np-player-prefs-host" v-clickoutside="closeNpPlayerPrefs" @click.stop>
  <div ref="npPlayerPrefsMenu"
       class="np-player-prefs-menu noselect"
       :class="{'np-player-prefs-drawer': !desktopLayout, 'np-player-prefs-popover': desktopLayout}"
       :style="desktopLayout ? npPlayerPrefs.menuStyle : null">
   <div class="np-player-prefs-inner">
    <div v-if="!desktopLayout" class="np-player-prefs-chrome">
     <div class="np-player-prefs-drawer-handle" aria-hidden="true"></div>
     <div class="np-player-prefs-drawer-title-row">
      <button v-if="npPlayerPrefsShowItemsInBody && npPlayerPrefs.subId && !npPlayerPrefsInline" type="button" class="np-player-prefs-back" @click.stop="closeNpPlayerPrefsSub" :title="i18n('Back')">
       <v-icon small>arrow_back</v-icon>
      </button>
      <div class="np-player-prefs-drawer-title">{{npPlayerPrefsShowItemsInBody && npPlayerPrefsSubTitle ? npPlayerPrefsSubTitle : npPlayerPrefsTitle}}</div>
      <div v-if="npPlayerPrefsShowItemsInBody && npPlayerPrefsIsPresets" class="browse-more np-player-prefs-modify" role="button" @click.stop="openPresetsEditorFromPrefs($event)">
       <div class="link-item">{{i18n('Edit')}}</div>
      </div>
     </div>
    </div>
    <div class="np-player-prefs-body">
     <div v-if="npPlayerPrefs.loading && !npPlayerPrefs.sections.length" class="np-player-prefs-loading">{{i18n('Loading…')}}</div>
     <template v-if="npPlayerPrefsShowItemsInBody">
      <template v-for="item in npPlayerPrefsActiveItems">
       <div v-if="item.divider" :key="'pi-'+item.id" class="np-player-prefs-divider" role="separator"></div>
       <button v-else type="button" :key="'pi-'+item.id"
               class="np-player-prefs-item" :class="{'np-player-prefs-on':item.selected}"
               @click.stop="applyNpPlayerPref(item)">
        <span class="np-player-prefs-text">
         <span class="np-player-prefs-label ellipsis">{{item.label}}</span>
         <span v-if="item.detail" class="np-player-prefs-detail ellipsis">{{item.detail}}</span>
        </span>
        <v-icon v-if="item.selected" small class="np-player-prefs-check">check</v-icon>
       </button>
      </template>
      <div v-if="!npPlayerPrefsActiveItems.length" class="np-player-prefs-empty">{{i18n('No options')}}</div>
     </template>
     <template v-else>
      <button type="button" v-for="sec in npPlayerPrefs.sections" :key="'ps-'+sec.id"
              class="np-player-prefs-section-head" :class="{'np-player-prefs-section-open': npPlayerPrefs.subId===sec.id}"
              :data-sec="sec.id" @click.stop="openNpPlayerPrefsSub(sec)" @mouseenter="openNpPlayerPrefsSub(sec, true)">
       <span class="np-player-prefs-section-title ellipsis">{{sec.title}}</span>
       <span class="np-player-prefs-section-current ellipsis" v-if="sec.currentLabel">
        <span class="np-player-prefs-section-current-text">{{sec.currentLabel}}</span>
       </span>
       <v-icon small class="np-player-prefs-section-chevron">chevron_right</v-icon>
      </button>
      <div v-if="npPlayerPrefsShowActions && npPlayerPrefs.sections.length" class="np-player-prefs-divider"></div>
      <template v-if="npPlayerPrefsShowActions">
       <button type="button" class="np-player-prefs-item np-player-prefs-action" @click.stop="npPlayerPrefsCommand('alarms')">
        <v-icon small class="np-player-prefs-action-icn">alarm</v-icon>
        <span class="np-player-prefs-label ellipsis">{{i18n('Alarms')}}</span>
       </button>
       <button type="button" class="np-player-prefs-item np-player-prefs-action" @click.stop="npPlayerPrefsCommand('sleep')">
        <v-icon small class="np-player-prefs-action-icn">hotel</v-icon>
        <span class="np-player-prefs-label ellipsis">{{i18n('Sleep')}}</span>
       </button>
       <button type="button" class="np-player-prefs-item np-player-prefs-action" @click.stop="npPlayerPrefsCommand('sync')">
        <v-icon small class="np-player-prefs-action-icn">link</v-icon>
        <span class="np-player-prefs-label ellipsis">{{i18n('Synchronize')}}</span>
       </button>
       <button v-if="npPlayerPrefsCanTransfer" type="button" class="np-player-prefs-item np-player-prefs-action" @click.stop="npPlayerPrefsTransfer">
        <v-icon small class="np-player-prefs-action-icn">swap_horiz</v-icon>
        <span class="np-player-prefs-label ellipsis">{{i18n('Transfer queue')}}</span>
       </button>
      </template>
      <div v-if="!npPlayerPrefs.loading && !npPlayerPrefs.sections.length && !npPlayerPrefsShowActions" class="np-player-prefs-empty">{{i18n('No options')}}</div>
     </template>
    </div>
   </div>
  </div>
  <div v-if="desktopLayout && npPlayerPrefs.subId && !npPlayerPrefsInline" ref="npPlayerPrefsSub"
       class="np-player-prefs-submenu noselect" :style="npPlayerPrefs.subStyle" @click.stop>
   <div class="np-player-prefs-sub-title" :class="{'np-player-prefs-sub-head': npPlayerPrefsIsPresets}">
    <span class="ellipsis">{{npPlayerPrefsSubTitle}}</span>
    <div v-if="npPlayerPrefsIsPresets" class="browse-more np-player-prefs-modify" role="button" @click.stop="openPresetsEditorFromPrefs($event)">
     <div class="link-item">{{i18n('Edit')}}</div>
    </div>
   </div>
   <template v-for="item in npPlayerPrefsActiveItems">
    <div v-if="item.divider" :key="'psub-'+item.id" class="np-player-prefs-divider" role="separator"></div>
    <button v-else type="button" :key="'psub-'+item.id"
            class="np-player-prefs-item" :class="{'np-player-prefs-on':item.selected}"
            @click.stop="applyNpPlayerPref(item)">
     <span class="np-player-prefs-text">
      <span class="np-player-prefs-label ellipsis">{{item.label}}</span>
      <span v-if="item.detail" class="np-player-prefs-detail ellipsis">{{item.detail}}</span>
     </span>
     <v-icon v-if="item.selected" small class="np-player-prefs-check">check</v-icon>
    </button>
   </template>
   <div v-if="!npPlayerPrefs.loading && !npPlayerPrefsActiveItems.length" class="np-player-prefs-empty">{{i18n('No options')}}</div>
  </div>
 </div>

 <div v-if="info.show" class="np-info" id="np-info" v-bind:class="{'np-info-contracted':desktopLayout && !info.expanded, 'np-info-expanded':desktopLayout && info.expanded, 'np-info-drawer-in':infoDrawerIn, 'np-info-drawer-out':infoDrawerOut, 'np-info-expand-anim':infoExpandAnim=='in' || infoExpandAnim=='out', 'np-info-expand-anim-in':infoExpandAnim=='in', 'np-info-expand-anim-out':infoExpandAnim=='out'}">
  <div v-if="desktopLayout && !info.expanded" class="np-info-resizer" role="separator" aria-orientation="vertical" :title="i18n('Resize')" @mousedown="infoPanelResizeStart" @touchstart.prevent="infoPanelResizeStart"></div>
  <v-btn fab small flat top left absolute class="np-expand-fab" v-if="desktopLayout" :title="info.expanded ? trans.collapse : trans.expand" @click.stop="toggleInfoExpanded"><v-icon class="np-menu-icn">{{info.expanded ? 'fullscreen_exit' : 'fullscreen'}}</v-icon></v-btn>
  <v-btn fab small flat top right absolute class="np-menu-fab" @click.stop="showConfigMenu"><v-icon class="np-menu-icn">more_vert</v-icon></v-btn>
  <v-tabs centered v-model="info.tab" v-if="infoUseTabs" style="np-info-tab-cover" @change="tabChanged">
   <template v-for="(tab, index) in info.tabs">
    <v-tab :key="index">{{tab.ctitle && playerStatus.current.maiComposer ? tab.ctitle: tab.title}}</v-tab>
    <v-tab-item :key="index" :transition="false" :reverse-transition="false">
     <v-card flat class="np-info-card-cover selectable" @touchend="tabTextEnd" @mouseup="tabTextEnd" @contextmenu="event.preventDefault()">
      <v-card-text :class="['np-info-text', TRACK_TAB==index || tab.isMsg ? 'np-info-lyrics' : '', ALBUM_TAB==index ? 'np-info-review' : '', ARTIST_TAB==index ? 'np-info-text-artist' : '']" :id="'np-tab'+index">
       <div v-if="maiShowSectHeaders && tab.texttitle && ARTIST_TAB!=index && !(TRACK_TAB==index && tab.lines && infoExpandedLayout)" v-html="tab.texttitle" class="np-info-title frosted" :id="'mai-header-'+index" role="button" @click="headerClicked($event, index)"></div>
       <template v-if="ARTIST_TAB==index">
        <div :class="infoExpandedLayout ? 'np-mai-artist-block' : 'np-mai-artist-compact'">
         <div v-if="maiShowSectHeaders && tab.texttitle" v-html="tab.texttitle" class="np-info-title" v-bind:class="{'frosted': !infoExpandedLayout && !maiArtistPalette.active, 'np-mai-artist-header': !infoExpandedLayout && maiArtistPalette.active, 'np-mai-block-header': infoExpandedLayout}" :id="'mai-header-'+index" role="button" @click="headerClicked($event, index)"></div>
         <div class="np-mai-artist-media" v-if="tab.image">
          <img :key="tab.image" :src="tab.image" loading="lazy" class="np-mai-artist-img" @load="maiArtistImageLoaded($event)" @dragstart.prevent="" @dragenter.prevent=""></img>
         </div>
         <div v-if="tab.text" class="text" v-html="tab.text"></div>
         <template v-for="(sect, sindex) in tab.sections">
          <div class="np-sect-title" v-if="maiShowSectHeaders && ((undefined!=sect.items && sect.items.length>=sect.min) || undefined!=sect.html)" :id="'mai-sect-'+sindex+'-'+index">{{sect.title}}<v-btn flat icon class="np-sect-toggle" v-if="undefined!=sect.grid" @click="toggleGrid(index, sindex)">
          <img class="svg-img" :src="ACTIONS[sect.grid ? USE_LIST_ACTION : USE_GRID_ACTION].svg | svgIcon(darkUi)" loading="lazy" @dragstart.prevent="" @dragenter.prevent=""></img></v-btn></div>
         <v-list v-if="undefined!=sect.items && !sect.grid && sect.items.length>=sect.min" class="lms-list np-info-list">
          <template v-for="(item, iindex) in sect.items">
           <v-list-tile class="lms-list-item" v-bind:class="{'pq-current': item.id==('album_id:'+infoTrack.album_id), 'list-active':menu.show && index==menu.tab && sindex==menu.section && iindex==menu.index, 'browse-header' : item.header}" @click.stop="itemClicked(index, sindex, iindex, $event)">
            <v-list-tile-avatar v-if="item.image" :tile="true" class="lms-avatar">
             <img :key="item.image" v-lazy="item.image" @dragstart.prevent="" @dragenter.prevent=""></img>
            </v-list-tile-avatar>
            <v-list-tile-avatar v-else-if="item.icon" :tile="true" class="lms-avatar">
             <v-icon>{{item.icon}}</v-icon>
            </v-list-tile-avatar>
            <v-list-tile-avatar v-else-if="item.svg" :tile="true" class="lms-avatar">
             <img class="svg-list-img" :src="item.svg | svgIcon(darkUi, item.header)" loading="lazy" @dragstart.prevent="" @dragenter.prevent=""></img>
            </v-list-tile-avatar>
            <v-list-tile-content>
             <v-list-tile-title>{{item.title}}</v-list-tile-title>
             <v-list-tile-sub-title v-if="item.subtitleContext && windowWidth>=600" v-html="item.subtitleContext"></v-list-tile-sub-title>
             <v-list-tile-sub-title v-else v-html="item.subtitle"></v-list-tile-sub-title>
            </v-list-tile-content>
            <div class="emblem" v-if="item.emblem" :style="{background: item.emblem.bgnd}">
             <img :src="item.emblem | emblem()" loading="lazy" @dragstart.prevent="" @dragenter.prevent=""></img>
            </div>
           </v-list-tile>
          </template>
          <v-list-tile v-if="undefined!=sect.more" role="button" @click="moreClicked(index, sindex)"><v-list-tile-content><v-list-tile-title>{{sect.more}}</v-list-tile-title></v-list-tile-content></v-list-tile>
         </v-list>
         <div class="np-grid-sect" v-else-if="undefined!=sect.items && sect.grid && sect.items.length>=sect.min">
          <template v-for="(item, iindex) in sect.items">
           <div v-if="!item.header" class="np-grid-item" v-bind:class="{'pq-current': item.id==('album_id:'+infoTrack.album_id), 'list-active':menu.show && index==menu.tab && sindex==menu.section && iindex==menu.index, 'np-grid-item-nosub':!sect.haveSub}" @click.stop="itemClicked(index, sindex, iindex, $event)">
            <img :key="item.image" v-lazy="item.image" @dragstart.prevent="" @dragenter.prevent=""></img>
            <v-list-tile-title>{{item.title}}</v-list-tile-title>
            <v-list-tile-sub-title v-html="item.subtitle"></v-list-tile-sub-title>
            <div class="emblem" v-if="item.emblem" :style="{background: item.emblem.bgnd}">
             <img :src="item.emblem | emblem()" loading="lazy" @dragstart.prevent="" @dragenter.prevent=""></img>
            </div>
           </div>
          </template>
          <div v-if="undefined!=sect.more && undefined!=sect.items && sect.grid && sect.items.length>=sect.min" class="np-grid-more link-item" role="button" @click="moreClicked(index, sindex)">{{sect.more}}</div>
         </div>
         <div v-else-if="undefined!=sect.html" v-html="sect.html"></div>
         </template>
        </div>
       </template>
       <div v-else-if="tab.image"><img :key="tab.image" :src="tab.image" loading="lazy" class="np-mai-img" @dragstart.prevent="" @dragenter.prevent=""></img></div>
       <div v-if="TRACK_TAB==index && tab.lines" class="np-lyrics-wrap" v-bind:class="{'np-mai-lyrics-block': infoExpandedLayout}">
        <div v-if="maiShowSectHeaders && tab.texttitle && infoExpandedLayout" v-html="tab.texttitle" class="np-info-title np-mai-block-header" :id="'mai-header-'+index" role="button" @click="headerClicked($event, index)"></div>
        <div v-if="tab.highlight && lyricsTimesValid" class="lyrics-highlight-box" v-bind:class="{'lyrics-highlight-fallback': !lyricsHighlightColorAvailable}" :style="lyricsHighlightStyle"></div>
        <template v-for="(line, lindex) in tab.lines">
         <obj :id="'np-lyrics-'+lindex" v-bind:class="{'lyrics-current-line':tab.highlight && lyricsTimesValid && playerStatus.current.time>=line.time && playerStatus.current.time<((lindex+1)<tab.lines.length ? tab.lines[lindex+1].time : MAX_LYRICS_DURATION)}">{{line.text.length<1 ? '&nbsp;' : line.text}}</obj></br/>
        </template>
       </div>
       <div v-else-if="ARTIST_TAB!=index && tab.text" v-bind:class="{'text':TRACK_TAB!=index}" v-html="tab.text"></div>
       <template v-if="ARTIST_TAB!=index" v-for="(sect, sindex) in tab.sections">
        <div class="np-sect-title" v-if="maiShowSectHeaders && ((undefined!=sect.items && sect.items.length>=sect.min) || undefined!=sect.html)" :id="'mai-sect-'+sindex+'-'+index">{{sect.title}}<v-btn flat icon class="np-sect-toggle" v-if="undefined!=sect.grid" @click="toggleGrid(index, sindex)">
         <img class="svg-img" :src="ACTIONS[sect.grid ? USE_LIST_ACTION : USE_GRID_ACTION].svg | svgIcon(darkUi)" loading="lazy" @dragstart.prevent="" @dragenter.prevent=""></img></v-btn></div>
        <v-list v-if="undefined!=sect.items && !sect.grid && sect.items.length>=sect.min" class="lms-list np-info-list">
         <template v-for="(item, iindex) in sect.items">
          <v-list-tile class="lms-list-item" v-bind:class="{'pq-current': (ALBUM_TAB==index && item.id==('track_id:'+infoTrack.track_id)) || (ARTIST_TAB==index && item.id==('album_id:'+infoTrack.album_id)), 'list-active':menu.show && index==menu.tab && sindex==menu.section && iindex==menu.index, 'browse-header' : item.header}" @click.stop="itemClicked(index, sindex, iindex, $event)">
           <v-list-tile-avatar v-if="item.image" :tile="true" class="lms-avatar">
            <img :key="item.image" v-lazy="item.image" @dragstart.prevent="" @dragenter.prevent=""></img>
           </v-list-tile-avatar>
           <v-list-tile-avatar v-else-if="item.icon" :tile="true" class="lms-avatar">
            <v-icon>{{item.icon}}</v-icon>
           </v-list-tile-avatar>
           <v-list-tile-avatar v-else-if="item.svg" :tile="true" class="lms-avatar">
            <img class="svg-list-img" :src="item.svg | svgIcon(darkUi, item.header)" loading="lazy" @dragstart.prevent="" @dragenter.prevent=""></img>
           </v-list-tile-avatar>
           <v-list-tile-content>
            <v-list-tile-title v-if="ALBUM_TAB==index" v-html="item.title"></v-list-tile-title>
            <v-list-tile-title v-else>{{item.title}}</v-list-tile-title>
            <v-list-tile-sub-title v-if="item.subtitleContext && windowWidth>=600" v-html="item.subtitleContext"></v-list-tile-sub-title>
            <v-list-tile-sub-title v-else v-html="item.subtitle"></v-list-tile-sub-title>
           </v-list-tile-content>
           <v-list-tile-action v-if="ALBUM_TAB==index && undefined!=item.durationStr" class="np-list-time">{{item.durationStr}}</v-list-tile-action>
           <div class="emblem" v-if="item.emblem" :style="{background: item.emblem.bgnd}">
            <img :src="item.emblem | emblem()" loading="lazy" @dragstart.prevent="" @dragenter.prevent=""></img>
           </div>
          </v-list-tile>
         </template>
         <v-list-tile v-if="undefined!=sect.more" role="button" @click="moreClicked(index, sindex)"><v-list-tile-content><v-list-tile-title>{{sect.more}}</v-list-tile-title></v-list-tile-content></v-list-tile>
        </v-list>
        <div class="np-grid-sect" v-else-if="undefined!=sect.items && sect.grid && sect.items.length>=sect.min">
         <template v-for="(item, iindex) in sect.items">
          <div v-if="!item.header" class="np-grid-item" v-bind:class="{'pq-current': (ALBUM_TAB==index && item.id==('track_id:'+infoTrack.track_id)) || (ARTIST_TAB==index && item.id==('album_id:'+infoTrack.album_id)), 'list-active':menu.show && index==menu.tab && sindex==menu.section && iindex==menu.index, 'np-grid-item-nosub':ARTIST_TAB==index && !sect.haveSub}" @click.stop="itemClicked(index, sindex, iindex, $event)">
           <img :key="item.image" v-lazy="item.image" @dragstart.prevent="" @dragenter.prevent=""></img>
           <v-list-tile-title>{{item.title}}</v-list-tile-title>
           <v-list-tile-sub-title v-html="item.subtitle"></v-list-tile-sub-title>
           <div class="emblem" v-if="item.emblem" :style="{background: item.emblem.bgnd}">
            <img :src="item.emblem | emblem()" loading="lazy" @dragstart.prevent="" @dragenter.prevent=""></img>
           </div>
          </div>
         </template>
         <div v-if="undefined!=sect.more && undefined!=sect.items && sect.grid && sect.items.length>=sect.min" class="np-grid-more link-item" role="button" @click="moreClicked(index, sindex)">{{sect.more}}</div>
        </div>
        <div v-else-if="undefined!=sect.html" v-html="sect.html"></div>
       </template>
       <div class="np-spacer"></div>
      </v-card-text>
     </v-card>
    </v-tab-item>
   </template>
  </v-tabs>
  <div v-else>
   <v-layout row class="np-info-triptych">
    <template v-for="(tab, index) in info.tabs">
     <v-flex xs4>
      <v-card flat class="np-info-card-cover selectable" @touchend="tabTextEnd" @mouseup="tabTextEnd" @contextmenu="event.preventDefault()">
       <v-card-text :class="['np-info-text-full', TRACK_TAB==index || tab.isMsg ? 'np-info-lyrics' : '', ALBUM_TAB==index ? 'np-info-review' : '', ARTIST_TAB==index ? 'np-info-text-artist' : '']" :id="'np-tab'+index">
        <div v-if="maiShowSectHeaders && tab.texttitle && ARTIST_TAB!=index && !(TRACK_TAB==index && tab.lines && infoExpandedLayout)" v-html="tab.texttitle" class="np-info-title frosted" :id="'mai-header-'+index" role="button" @click="headerClicked($event, index)"></div>
        <template v-if="ARTIST_TAB==index">
         <div :class="infoExpandedLayout ? 'np-mai-artist-block' : 'np-mai-artist-compact'">
          <div v-if="maiShowSectHeaders && tab.texttitle" v-html="tab.texttitle" class="np-info-title" v-bind:class="{'frosted': !infoExpandedLayout && !maiArtistPalette.active, 'np-mai-artist-header': !infoExpandedLayout && maiArtistPalette.active, 'np-mai-block-header': infoExpandedLayout}" :id="'mai-header-'+index" role="button" @click="headerClicked($event, index)"></div>
          <div class="np-mai-artist-media" v-if="tab.image">
           <img :key="tab.image" :src="tab.image" loading="lazy" class="np-mai-artist-img" @load="maiArtistImageLoaded($event)" @dragstart.prevent="" @dragenter.prevent=""></img>
          </div>
          <div v-if="tab.text" class="text" v-html="tab.text"></div>
          <template v-for="(sect, sindex) in tab.sections">
           <div class="np-sect-title" v-if="maiShowSectHeaders && ((undefined!=sect.items && sect.items.length>=sect.min) || undefined!=sect.html)" :id="'mai-sect-'+sindex+'-'+index">{{sect.title}}<v-btn flat icon class="np-sect-toggle" v-if="undefined!=sect.grid" role="button" @click="toggleGrid(index, sindex)">
           <img class="svg-img" :src="ACTIONS[sect.grid ? USE_LIST_ACTION : USE_GRID_ACTION].svg | svgIcon(darkUi)" loading="lazy" @dragstart.prevent="" @dragenter.prevent=""></img></v-btn></div>
          <v-list v-if="undefined!=sect.items && !sect.grid && sect.items.length>=sect.min" class="lms-list np-info-list">
           <template v-for="(item, iindex) in sect.items">
            <v-list-tile class="lms-list-item" v-bind:class="{'pq-current': item.id==('album_id:'+infoTrack.album_id), 'list-active':menu.show && index==menu.tab && sindex==menu.section && iindex==menu.index, 'browse-header' : item.header}" @click.stop="itemClicked(index, sindex, iindex, $event)">
             <v-list-tile-avatar v-if="item.image" :tile="true" class="lms-avatar">
              <img :key="item.image" v-lazy="item.image" @dragstart.prevent="" @dragenter.prevent=""></img>
             </v-list-tile-avatar>
             <v-list-tile-avatar v-else-if="item.icon" :tile="true" class="lms-avatar">
              <v-icon>{{item.icon}}</v-icon>
             </v-list-tile-avatar>
             <v-list-tile-avatar v-else-if="item.svg" :tile="true" class="lms-avatar">
              <img class="svg-list-img" :src="item.svg | svgIcon(darkUi, item.header)" loading="lazy" @dragstart.prevent="" @dragenter.prevent=""></img>
             </v-list-tile-avatar>
             <v-list-tile-content>
              <v-list-tile-title>{{item.title}}</v-list-tile-title>
              <v-list-tile-sub-title v-if="item.subtitleContext && windowWidth>=1500" v-html="item.subtitleContext"></v-list-tile-sub-title>
              <v-list-tile-sub-title v-else v-html="item.subtitle"></v-list-tile-sub-title>
             </v-list-tile-content>
             <div class="emblem" v-if="item.emblem" :style="{background: item.emblem.bgnd}">
              <img :src="item.emblem | emblem()" loading="lazy" @dragstart.prevent="" @dragenter.prevent=""></img>
             </div>
            </v-list-tile>
           </template>
           <v-list-tile v-if="undefined!=sect.more" role="button" @click="moreClicked(index, sindex)"><v-list-tile-content><v-list-tile-title>{{sect.more}}</v-list-tile-title></v-list-tile-content></v-list-tile>
          </v-list>
          <div class="np-grid-sect" v-else-if="undefined!=sect.items && sect.grid && sect.items.length>=sect.min">
           <template v-for="(item, iindex) in sect.items">
            <div v-if="!item.header" class="np-grid-item" v-bind:class="{'pq-current': item.id==('album_id:'+infoTrack.album_id), 'list-active':menu.show && index==menu.tab && sindex==menu.section && iindex==menu.index, 'np-grid-item-nosub':!sect.haveSub}" @click.stop="itemClicked(index, sindex, iindex, $event)">
             <img :key="item.image" v-lazy="item.image" @dragstart.prevent="" @dragenter.prevent=""></img>
             <v-list-tile-title>{{item.title}}</v-list-tile-title>
             <v-list-tile-sub-title v-html="item.subtitle"></v-list-tile-sub-title>
             <div class="emblem" v-if="item.emblem" :style="{background: item.emblem.bgnd}">
              <img :src="item.emblem | emblem()" loading="lazy" @dragstart.prevent="" @dragenter.prevent=""></img>
             </div>
            </div>
           </template>
           <div v-if="undefined!=sect.more && undefined!=sect.items && sect.grid && sect.items.length>=sect.min" class="np-grid-more link-item" role="button" @click="moreClicked(index, sindex)">{{sect.more}}</div>
          </div>
           <div v-else-if="undefined!=sect.html" v-html="sect.html"></div>
          </template>
         </div>
        </template>
        <div v-else-if="tab.image"><img :key="tab.image" :src="tab.image" loading="lazy" class="np-mai-img" @dragstart.prevent="" @dragenter.prevent=""></img></div>
        <div v-if="TRACK_TAB==index && tab.lines" class="np-lyrics-wrap" v-bind:class="{'np-mai-lyrics-block': infoExpandedLayout}">
         <div v-if="maiShowSectHeaders && tab.texttitle && infoExpandedLayout" v-html="tab.texttitle" class="np-info-title np-mai-block-header" :id="'mai-header-'+index" role="button" @click="headerClicked($event, index)"></div>
         <div v-if="tab.highlight && lyricsTimesValid" class="lyrics-highlight-box" v-bind:class="{'lyrics-highlight-fallback': !lyricsHighlightColorAvailable}" :style="lyricsHighlightStyle"></div>
         <template v-for="(line, lindex) in tab.lines">
          <obj :id="'np-lyrics-'+lindex" v-bind:class="{'lyrics-current-line':tab.highlight && lyricsTimesValid && playerStatus.current.time>=line.time && playerStatus.current.time<((lindex+1)<tab.lines.length ? tab.lines[lindex+1].time : MAX_LYRICS_DURATION)}">{{line.text.length<1 ? '&nbsp;' : line.text}}</obj></br/>
         </template>
        </div>
        <div v-else-if="ARTIST_TAB!=index && tab.text" v-bind:class="{'text':TRACK_TAB!=index}" v-html="tab.text"></div>
        <template v-if="ARTIST_TAB!=index" v-for="(sect, sindex) in tab.sections">
         <div class="np-sect-title" v-if="maiShowSectHeaders && ((undefined!=sect.items && sect.items.length>=sect.min) || undefined!=sect.html)" :id="'mai-sect-'+sindex+'-'+index">{{sect.title}}<v-btn flat icon class="np-sect-toggle" v-if="undefined!=sect.grid" role="button" @click="toggleGrid(index, sindex)">
          <img class="svg-img" :src="ACTIONS[sect.grid ? USE_LIST_ACTION : USE_GRID_ACTION].svg | svgIcon(darkUi)" loading="lazy" @dragstart.prevent="" @dragenter.prevent=""></img></v-btn></div>
         <v-list v-if="undefined!=sect.items && !sect.grid && sect.items.length>=sect.min" class="lms-list np-info-list">
          <template v-for="(item, iindex) in sect.items">
           <v-list-tile class="lms-list-item" v-bind:class="{'pq-current': (ALBUM_TAB==index && item.id==('track_id:'+infoTrack.track_id)) || (ARTIST_TAB==index && item.id==('album_id:'+infoTrack.album_id)), 'list-active':menu.show && index==menu.tab && sindex==menu.section && iindex==menu.index, 'browse-header' : item.header}" @click.stop="itemClicked(index, sindex, iindex, $event)">
            <v-list-tile-avatar v-if="item.image" :tile="true" class="lms-avatar">
             <img :key="item.image" v-lazy="item.image" @dragstart.prevent="" @dragenter.prevent=""></img>
            </v-list-tile-avatar>
            <v-list-tile-avatar v-else-if="item.icon" :tile="true" class="lms-avatar">
             <v-icon>{{item.icon}}</v-icon>
            </v-list-tile-avatar>
            <v-list-tile-avatar v-else-if="item.svg" :tile="true" class="lms-avatar">
             <img class="svg-list-img" :src="item.svg | svgIcon(darkUi, item.header)" loading="lazy" @dragstart.prevent="" @dragenter.prevent=""></img>
            </v-list-tile-avatar>
            <v-list-tile-content>
             <v-list-tile-title v-if="ALBUM_TAB==index" v-html="item.title"></v-list-tile-title>
             <v-list-tile-title v-else>{{item.title}}</v-list-tile-title>
             <v-list-tile-sub-title v-if="item.subtitleContext && windowWidth>=1500" v-html="item.subtitleContext"></v-list-tile-sub-title>
             <v-list-tile-sub-title v-else v-html="item.subtitle"></v-list-tile-sub-title>
            </v-list-tile-content>
            <v-list-tile-action v-if="ALBUM_TAB==index && undefined!=item.durationStr" class="np-list-time">{{item.durationStr}}</v-list-tile-action>
            <div class="emblem" v-if="item.emblem" :style="{background: item.emblem.bgnd}">
             <img :src="item.emblem | emblem()" loading="lazy" @dragstart.prevent="" @dragenter.prevent=""></img>
            </div>
           </v-list-tile>
          </template>
          <v-list-tile v-if="undefined!=sect.more" role="button" @click="moreClicked(index, sindex)"><v-list-tile-content><v-list-tile-title>{{sect.more}}</v-list-tile-title></v-list-tile-content></v-list-tile>
         </v-list>
         <div class="np-grid-sect" v-else-if="undefined!=sect.items && sect.grid && sect.items.length>=sect.min">
          <template v-for="(item, iindex) in sect.items">
           <div v-if="!item.header" class="np-grid-item" v-bind:class="{'pq-current': (ALBUM_TAB==index && item.id==('track_id:'+infoTrack.track_id)) || (ARTIST_TAB==index && item.id==('album_id:'+infoTrack.album_id)), 'list-active':menu.show && index==menu.tab && sindex==menu.section && iindex==menu.index, 'browse-header' : item.header, 'np-grid-item-nosub':ARTIST_TAB==index && !sect.haveSub}" @click.stop="itemClicked(index, sindex, iindex, $event)">
            <img :key="item.image" v-lazy="item.image" @dragstart.prevent="" @dragenter.prevent=""></img>
            <v-list-tile-title>{{item.title}}</v-list-tile-title>
            <v-list-tile-sub-title v-html="item.subtitle"></v-list-tile-sub-title>
            <div class="emblem" v-if="item.emblem" :style="{background: item.emblem.bgnd}">
             <img :src="item.emblem | emblem()" loading="lazy" @dragstart.prevent="" @dragenter.prevent=""></img>
            </div>
           </div>
          </template>
          <div v-if="undefined!=sect.more && undefined!=sect.items && sect.grid && sect.items.length>=sect.min" class="np-grid-more link-item" role="button" @click="moreClicked(index, sindex)">{{sect.more}}</div>
         </div>
         <div v-else-if="undefined!=sect.html" v-html="sect.html"></div>
        </template>
        <div class="np-spacer"></div>
       </v-card-text>
      </v-card>
     </v-flex>
    </template>
   </v-layout>
  </div>
 </div>

 <div v-if="desktopLayout || (info.show ? MBAR_NONE!=mobileBar : MBAR_NONE!=mobileBar)">
 <div v-if="npBarInDom" class="np-bar" id="np-bar" v-bind:class="{'mobile':!desktopLayout, 'np-bar-mob-thick':!desktopLayout && MBAR_THIN!=mobileBar, 'np-bar-mob-nav':!desktopLayout && MBAR_REP_NAV==mobileBar, 'np-bar-art':npBarArtUrl, 'np-bar-dark':npBarArtUrl && darkUi, 'np-bar-light':npBarArtUrl && !darkUi, 'np-bar-sheet-exit':!desktopLayout && npSheetAnim=='expand', 'np-bar-sheet-enter':!desktopLayout && npBarSheetAnim=='enter', 'np-bar-sheet-dormant':!desktopLayout && !npBarShown, 'np-bar-dockable':npBarDockable, 'np-bar-docked':npBarDockable && npBarDocked, 'np-bar-dock-dragging':npBarDockDragging, 'np-bar-pressed':npBarPressed, 'np-bar-restarting':serverRestarting}" :style="npBarDockStyle" @touchstart.capture.passive="npBarTouchStart" @touchmove="npBarTouchMove" @touchend.capture.passive="npBarTouchEnd" @touchcancel.passive="npBarTouchEnd" @wheel.capture="npBarWheel" @click="npBarClicked">
  <div class="np-bar-bg" v-if="npBarArtUrl"></div>
  <div class="np-bar-scrim" v-if="npBarArtUrl"></div>

  <v-layout row class="np-bar-controls" v-if="desktopLayout || MBAR_NONE!=mobileBar">
   <v-flex xs4>
    <v-btn flat icon id="np-bar-prev" v-bind:class="{'disabled':npBarPrevDisabled, 'np-bar-alt-skip':desktopLayout && npBarAltSkip}" v-longpress:repeat="prevButton" class="np-std-button" :title="npBarPrevTitle"><img v-if="desktopLayout && npBarAltSkip" class="svg-img np-bar-skip-icon" :src="'rewind-'+skipBSeconds | svgIcon(darkUi||coloredToolbars)" oncontextmenu="return false;"></img><v-icon v-else large class="media-icon">skip_previous</v-icon></v-btn>
   </v-flex>
   <v-flex xs4>
    <v-btn flat icon v-if="playerStatus.playlist.count>0 && (desktopLayout || MBAR_THIN!=mobileBar)" :ripple="false" v-longpress="playPauseButton" @click.middle="showSleep" id="playPauseB" class="np-playpause" :title="(playerStatus.isplaying ? trans.pause : trans.play) | tooltip('space', keyboardControl)" v-bind:class="{'disabled':disableBtns, 'np-playpause-waiting':playerStatus.iswaiting}"><lms-playpause-icon class="media-icon" :playing="playerStatus.isplaying" :waiting="playerStatus.iswaiting" :large="true"></lms-playpause-icon></v-btn>
    <v-btn flat icon v-if="!desktopLayout && MBAR_REP_NAV==mobileBar && playerStatus.playlist.count>0" @click.stop="changePage" class="np-changepage" id="cpage" :title="nextPage=='browse' ? trans.queue : trans.browse">
     <img class="svg-img" :src="(nextPage=='queue' ? 'queue_music_outline' : 'library-music-outline') | svgIcon(darkUi)" oncontextmenu="return false;"></img>
    </v-btn>
   </v-flex>
   <v-flex xs4>
    <v-btn flat icon id="np-bar-next" v-bind:class="{'disabled':npBarNextDisabled, 'np-bar-alt-skip':desktopLayout && npBarAltSkip}" v-longpress:repeat="nextButton" class="np-std-button" :title="npBarNextTitle"><img v-if="desktopLayout && npBarAltSkip" class="svg-img np-bar-skip-icon" :src="'fast-forward-'+skipFSeconds | svgIcon(darkUi||coloredToolbars)" oncontextmenu="return false;"></img><v-icon v-else large class="media-icon">skip_next</v-icon></v-btn>
   </v-flex>
  </v-layout>
  <div v-show="desktopLayout || MBAR_NONE!=mobileBar" class="np-bar-image">
   <div v-if="serverRestarting" class="np-bar-restart-logo"><img :src="'lyrion-logo' | svgIcon(darkUi)" alt="" @dragstart.prevent=""></img></div>
   <div v-else class="np-cover-stack np-bar-cover-stack" v-bind:class="{'np-cover-fading':coverFading, 'np-cover-fade-fwd':coverFading && coverFadeDir>0, 'np-cover-fade-rev':coverFading && coverFadeDir<0}">
    <img v-if="prevCoverUrl && coverFading" :src="prevCoverUrl" loading="lazy" @dragstart.prevent="" @dragenter.prevent="" class="np-cover np-cover-layer np-cover-prev"></img>
    <img ref="npBarCoverCur" :src="coverUrl || DEFAULT_COVER" loading="lazy" onerror="this.src=DEFAULT_COVER" @dragstart.prevent="" @dragenter.prevent="" @contextmenu="showMenu" @click="clickImage(event)" class="np-cover np-cover-layer np-cover-current" v-bind:class="{'np-cover-fade-in':coverFading, 'np-trans':transCvr}"></img>
    <img v-if="npBarSlideCoverSrc" ref="npBarCoverNxt" :src="npBarSlideCoverSrc" @dragstart.prevent="" class="np-cover np-cover-layer np-cover-drag" alt=""></img>
   </div>
  </div>
  <div v-if="!desktopLayout && MBAR_THIN==mobileBar" class="np-bar-details-mobile np-bar-text-morph-host" :class="{'np-bar-has-diffuse':!!npDiffuse}" v-show="serverRestarting || !!mobileBarText || npBarMorph.active || disableBtns || !!npDiffuse">
   <div class="np-bar-rest-stack" v-show="serverRestarting || !npBarMorph.active">
    <div class="np-bar-marquee" ref="npBarMobileMarquee">
     <div class="np-bar-marquee-track">{{serverRestarting ? trans.restarting : (mobileBarText || (disableBtns ? (trans.noMusic || i18n('Nothing playing')) : ''))}}</div>
    </div>
   </div>
   <button v-if="npDiffuse && !npBarMorph.active && !serverRestarting" type="button" class="np-diffuse" @click.stop="resetNpDiffuse" :title="npDiffuse.title"><span class="np-diffuse-text ellipsis">{{npDiffuse.label}}</span><span class="np-diffuse-reset">{{i18n('Stop diffusion')}}</span></button>
   <div class="np-bar-morph-stack" v-show="npBarMorph.active && !serverRestarting">
    <div class="np-bar-text-line np-bar-text-out" v-bind:class="npBarMorphDirClass">{{npBarMorph.outMobile}}</div>
    <div class="np-bar-text-line np-bar-text-in" v-bind:class="npBarMorphDirClass">{{npBarMorph.inMobile}}</div>
   </div>
  </div>
  <div class="np-bar-details noselect np-bar-restart-details" v-else-if="serverRestarting && (desktopLayout || (MBAR_NONE!=mobileBar && MBAR_THIN!=mobileBar))">
   <div class="v-list__tile__title np-bar-restart-label">{{trans.restarting}}</div>
  </div>
  <v-list two-line subheader class="np-bar-details noselect" v-else-if="!desktopLayout && disableBtns && MBAR_NONE!=mobileBar && MBAR_THIN!=mobileBar">
   <v-list-tile>
    <v-list-tile-content>
     <v-list-tile-title>{{trans.noMusic || i18n('Nothing playing')}}</v-list-tile-title>
     <v-list-tile-sub-title class="subtext">{{i18n('Tap for browse')}}</v-list-tile-sub-title>
    </v-list-tile-content>
   </v-list-tile>
  </v-list>
  <v-list two-line subheader class="np-bar-details noselect" v-else-if="playerStatus.playlist.count>0 && (desktopLayout || MBAR_NONE!=mobileBar)">
   <v-list-tile style>
    <v-list-tile-content class="np-bar-text-morph-host" :class="{'np-bar-has-diffuse':!desktopLayout && !!npDiffuse}">
     <!-- Rest stays mounted (v-show) so artist/album never remount-flash after morph -->
     <div class="np-bar-rest-stack" ref="npBarRest" v-show="!npBarMorph.active">
      <div class="np-bar-marquee" ref="npBarTitleMarquee">
       <div class="np-bar-marquee-track">
        <v-list-tile-title v-if="playerStatus.current.title" class="np-bar-marquee-text">{{title}}</v-list-tile-title>
       </div>
      </div>
      <div class="np-bar-marquee" ref="npBarSubMarquee">
       <div class="np-bar-marquee-track">
        <v-list-tile-sub-title v-if="npBarSubtitleDisplay" class="np-bar-marquee-text" v-html="npBarSubtitleDisplay"></v-list-tile-sub-title>
       </div>
      </div>
     </div>
     <div class="np-bar-morph-stack" v-show="npBarMorph.active">
      <div class="np-bar-text-layer np-bar-text-out" v-bind:class="npBarMorphDirClass">
       <div class="np-bar-marquee">
        <div class="np-bar-marquee-track">
         <v-list-tile-title v-if="npBarMorph.outTitle" class="np-bar-marquee-text">{{npBarMorph.outTitle}}</v-list-tile-title>
        </div>
       </div>
       <div class="np-bar-marquee">
        <div class="np-bar-marquee-track">
         <v-list-tile-sub-title v-if="npBarMorph.outSubtitle" class="np-bar-marquee-text" v-html="npBarMorph.outSubtitle"></v-list-tile-sub-title>
        </div>
       </div>
      </div>
      <div class="np-bar-text-layer np-bar-text-in" v-bind:class="npBarMorphDirClass">
       <div class="np-bar-marquee">
        <div class="np-bar-marquee-track">
         <v-list-tile-title v-if="npBarMorph.inTitle" class="np-bar-marquee-text">{{npBarMorph.inTitle}}</v-list-tile-title>
        </div>
       </div>
       <div class="np-bar-marquee">
        <div class="np-bar-marquee-track">
         <v-list-tile-sub-title v-if="npBarMorph.inSubtitle" class="np-bar-marquee-text" v-html="npBarMorph.inSubtitle"></v-list-tile-sub-title>
        </div>
       </div>
      </div>
     </div>
     <div class="np-bar-slide-in" ref="npBarSlideIn" v-show="npBarSlideLive">
      <div class="np-bar-marquee">
       <div class="np-bar-marquee-track">
        <v-list-tile-title v-if="npBarSlideNxtTitle" class="np-bar-marquee-text">{{npBarSlideNxtTitle}}</v-list-tile-title>
       </div>
      </div>
      <div class="np-bar-marquee" v-show="!!npBarSlideNxtSub">
       <div class="np-bar-marquee-track">
        <v-list-tile-sub-title class="np-bar-marquee-text">{{npBarSlideNxtSub}}</v-list-tile-sub-title>
       </div>
      </div>
     </div>
     <button v-if="!desktopLayout && npDiffuse && !npBarMorph.active" type="button" class="np-diffuse" @click.stop="resetNpDiffuse" :title="npDiffuse.title"><span class="np-diffuse-text ellipsis">{{npDiffuse.label}}</span><span class="np-diffuse-reset">{{i18n('Stop diffusion')}}</span></button>
    </v-list-tile-content>
    <!-- Desktop: meta + repeat/shuffle. Queue stays on the title bar. -->
    <v-list-tile-action v-if="desktopLayout" @click.stop class="np-bar-action-cluster">
     <button v-if="npDiffuse" type="button" class="np-diffuse" @click.stop="resetNpDiffuse" :title="npDiffuse.title"><span class="np-diffuse-text ellipsis">{{npDiffuse.label}}</span><span class="np-diffuse-reset">{{i18n('Stop diffusion')}}</span></button>
     <div class="np-bar-meta-group">
      <div class="np-bar-meta-lines">
      <div class="np-bar-time-row">
       <div v-if="playerStatus.playlist.count>1 && (npBarRatings || techInfo)" class="np-bar-time " v-bind:class="{'np-bar-time-r': techInfo || npBarRatings}"><obj v-bind:class="{'link-item-ct':coloredToolbars,'link-item':!coloredToolbars}" @click.stop="toggleTime()">{{formattedTime}}</obj>{{SEPARATOR}}<obj v-bind:class="{'link-item':totalTogglesQueue && !coloredToolbars, 'link-item-ct':totalTogglesQueue && coloredToolbars}" @click.stop="trackCountClicked">{{playerStatus.playlist.current | trackCount(playerStatus.playlist.count)}}</obj></div>
       <div v-else class="np-bar-time" v-bind:class="{'link-item-ct':coloredToolbars,'link-item':!coloredToolbars,'np-bar-time-r': techInfo || npBarRatings}" @click.stop="toggleTime()">{{formattedTime}}</div>
      </div>
      <div v-if="techInfo && !npBarQuality" class="np-bar-tech ellipsis">{{technicalInfo}}</div>
      <v-rating v-else-if="showRatings" class="np-bar-rating" v-model="rating.value" :halfIncrements="maxRating>5" hover clearable @click.native="setRating(true)" :readonly="undefined==LMS_P_RP"></v-rating>
      <div v-else-if="playerStatus.playlist.count>1" class="np-bar-tech" v-bind:class="{'link-item':totalTogglesQueue && !coloredToolbars, 'link-item-ct':totalTogglesQueue && coloredToolbars}" @click.stop="trackCountClicked">{{playerStatus.playlist.current | trackCount(playerStatus.playlist.count)}}</div>
      <div v-else class="np-bar-tech">&nbsp;</div>
      </div>
      <span v-if="npBarQuality" class="np-bar-quality" :title="technicalInfo">
       <span class="np-bar-quality-kind">{{npBarQuality.kind}}</span>
       <span v-if="npBarQuality.rate" class="np-bar-quality-rate">{{npBarQuality.rate}}</span>
      </span>
     </div>
     <div class="np-bar-modes" @click.stop>
      <v-btn v-if="repAltBtn.show" :title="repAltBtn.tooltip" flat icon v-longpress="repeatClicked" class="np-bar-mode" v-bind:class="{'disabled':noPlayer}"><v-icon v-if="repAltBtn.icon">{{repAltBtn.icon}}</v-icon><img v-else class="svg-img" :src="repAltBtn.image"></img></v-btn>
      <v-btn :title="trans.randomMix" flat icon v-else-if="playerStatus.playlist.randomplay===1" v-longpress="repeatClicked" class="np-bar-mode" v-bind:class="{'disabled':noPlayer}"><img class="svg-img" :src="'dice-multiple' | svgIcon(darkUi||coloredToolbars)"></img></v-btn>
      <v-btn :title="trans.repeatOne" flat icon v-else-if="playerStatus.playlist.repeat===1" v-longpress="repeatClicked" class="np-bar-mode"><v-icon>repeat_one</v-icon></v-btn>
      <v-btn :title="trans.repeatAll" flat icon v-else-if="playerStatus.playlist.repeat===2" v-longpress="repeatClicked" class="np-bar-mode"><v-icon>repeat</v-icon></v-btn>
      <v-btn :title="trans.dstm" flat icon v-else-if="dstm" v-longpress="repeatClicked" class="np-bar-mode"><v-icon>all_inclusive</v-icon></v-btn>
      <v-btn :title="trans.repeatOff" flat icon v-else v-longpress="repeatClicked" class="np-bar-mode dimmed" v-bind:class="{'disabled':noPlayer}"><img class="svg-img" :src="'repeat-off' | svgIcon(darkUi||coloredToolbars)"></img></v-btn>
      <v-btn v-if="shuffAltBtn.show" :title="shuffAltBtn.tooltip" flat icon @click.stop="shuffleClicked" class="np-bar-mode"><v-icon v-if="shuffAltBtn.icon">{{shuffAltBtn.icon}}</v-icon><img v-else class="svg-img" :src="shuffAltBtn.image"></img></v-btn>
      <v-btn :title="trans.shuffleAlbums" flat icon v-else-if="playerStatus.playlist.shuffle===2" @click.stop="shuffleClicked" class="np-bar-mode" v-bind:class="{'disabled':noPlayer}"><img class="svg-img" :src="'shuffle-albums' | svgIcon(darkUi||coloredToolbars)"></img></v-btn>
      <v-btn :title="trans.shuffleAll" flat icon v-else-if="playerStatus.playlist.shuffle===1" @click.stop="shuffleClicked" class="np-bar-mode" v-bind:class="{'disabled':noPlayer}"><v-icon>shuffle</v-icon></v-btn>
      <v-btn :title="trans.shuffleOff" flat icon v-else @click.stop="shuffleClicked" class="np-bar-mode dimmed" v-bind:class="{'disabled':noPlayer}"><img class="svg-img" :src="'shuffle-off' | svgIcon(darkUi||coloredToolbars)"></img></v-btn>
     </div>
    </v-list-tile-action>
   </v-list-tile>
  </v-list>
  <button v-if="npDiffuseFallback" type="button" class="np-diffuse np-diffuse-fallback" @click.stop="resetNpDiffuse" :title="npDiffuse.title"><span class="np-diffuse-text ellipsis">{{npDiffuse.label}}</span><span class="np-diffuse-reset">{{i18n('Stop diffusion')}}</span></button>
  <lms-progressbar id="pos-slider" v-if="IS_MOBILE && npBarProgressOn" :height="desktopLayout ? 5 : 3" class="np-slider np-bar-slider" :value="npBarSliderValue" :buffer="npBarSliderBuffer" :playing="npBarSliderPlaying" :duration="npBarSliderDuration" :anchor="progressAnchor" v-bind:class="{'np-bar-colored':coloredToolbars}"></lms-progressbar>
  <lms-progressbar id="pos-slider" v-else-if="npBarProgressOn" :height="desktopLayout ? 5 : 3" :thumb="desktopLayout && !serverRestarting" class="np-slider np-bar-slider" :value="npBarSliderValue" :buffer="npBarSliderBuffer" :playing="npBarSliderPlaying" :duration="npBarSliderDuration" :anchor="progressAnchor" v-bind:class="{'np-bar-colored':coloredToolbars}" v-on:click.stop="sliderChanged($event, false)" @mousedown.prevent="sliderMouseDown" @mouseover="npBarSliderMouseOver" @mouseout="npBarSliderMouseOut" @mousemove="npBarSliderMouseMove" @touchstart.passive.stop="touchSliderStart" @touchend.passive.stop="touchSliderEnd" @touchmove.passive.stop="moveTimeTooltipTouch"></lms-progressbar>
 </div>
 </div>

 <div class="np-page" v-if="showNpSheetPage" id="np-page" v-bind:class="[{'np-page-mobile-sheet':!desktopLayout, 'np-page-desktop-sheet':desktopLayout, 'np-orient-settling':npOrientSettling, 'np-slide-queue':showMobileInfoCard && npMainSlide===NP_CARD_SLIDE_QUEUE, 'np-slide-np':showMobileInfoCard && npMainSlide===NP_CARD_SLIDE_NP, 'np-slide-lyrics':showMobileInfoCard && NP_LYRICS_SLIDE_ENABLED && npMainSlide===NP_CARD_SLIDE_LYRICS, 'np-slide-artist':showMobileInfoCard && npMainSlide===NP_CARD_SLIDE_ARTIST, 'np-slide-album':showMobileInfoCard && npMainSlide===NP_CARD_SLIDE_ALBUM, 'np-swipe-track':swipeChangeTrackEnabled, 'np-is-radio':npIsRadio, 'np-details-scroll':npDetailsScroll, 'np-sheet-dragging':npSheetDragY>0}, npSheetSlideClasses]" :style="npPageSheetStyle" @touchstart.passive="npPageTouchStart" @touchmove="npPageTouchMove" @touchend.passive="npPageTouchEnd" @touchcancel.passive="npPageTouchEnd" @wheel.capture="npPageWheel">
  <div class="np-page-body">
   <div v-if="!desktopLayout" class="np-sheet-handle" role="button" :title="trans.collapseNp" :aria-label="trans.collapseNp" @click.stop="npSheetHandleClick" @touchstart.passive="npHandleTouchStart" @touchmove.prevent="npHandleTouchMove" @touchend="npHandleTouchEnd" @touchcancel="npHandleTouchEnd">
    <div class="np-sheet-handle-bar"></div>
   </div>
   <!-- Integrated MAI: horizontal swiper — queue | now playing | lyrics | artist | album (loop) -->
   <swiper v-if="showMobileInfoCard" :key="npDetailsScroll ? 'np-scroll' : 'np-cards'" ref="npMainSwiper" :options="npMainSwiperOptions" class="np-main-swiper np-main-swiper-push" @slideChange="onNpMainSlideChange" @slideChangeTransitionEnd="onNpMainSlideTransitionEnd" @ready="onNpMainSwiperReady">
    <swiper-slide class="np-main-slide np-main-slide-queue">
     <div class="np-card-panel np-card-panel-queue">
      <div class="np-card-panel-scroll" @scroll.passive="onNpCardPanelScroll($event)">
       <div class="np-queue-controls noselect" @click.stop @touchstart.stop>
        <div class="np-queue-controls-meta" v-longpress="npQueueDurationClicked">
         <div class="np-queue-controls-count ellipsis">{{npQueueCountLabel}}</div>
         <div class="np-queue-controls-sub ellipsis" v-if="npQueueDurationLabel">{{npQueueDurationLabel}}</div>
        </div>
        <v-btn flat icon class="np-queue-ctl" :title="i18n('Actions')" @click.stop="npQueueActions($event)"><v-icon>more_vert</v-icon></v-btn>
        <v-btn v-if="repAltBtn.show" :title="repAltBtn.tooltip" flat icon v-longpress="repeatClicked" class="np-queue-ctl" v-bind:class="{'disabled':noPlayer}"><v-icon v-if="repAltBtn.icon">{{repAltBtn.icon}}</v-icon><img v-else :src="repAltBtn.image" class="btn-img"></img></v-btn>
        <v-btn :title="trans.randomMix" flat icon v-else-if="playerStatus.playlist.randomplay===1" v-longpress="repeatClicked" class="np-queue-ctl" v-bind:class="{'disabled':noPlayer}"><img class="svg-img" :src="'dice-multiple' | svgIcon(darkUi)"></img></v-btn>
        <v-btn :title="trans.repeatOne" flat icon v-else-if="playerStatus.playlist.repeat===1" v-longpress="repeatClicked" class="np-queue-ctl" v-bind:class="{'disabled':noPlayer}"><v-icon>repeat_one</v-icon></v-btn>
        <v-btn :title="trans.repeatAll" flat icon v-else-if="playerStatus.playlist.repeat===2" v-longpress="repeatClicked" class="np-queue-ctl" v-bind:class="{'disabled':noPlayer}"><v-icon>repeat</v-icon></v-btn>
        <v-btn :title="trans.dstm" flat icon v-else-if="dstm" v-longpress="repeatClicked" class="np-queue-ctl"><v-icon>all_inclusive</v-icon></v-btn>
        <v-btn :title="trans.repeatOff" flat icon v-else v-longpress="repeatClicked" class="np-queue-ctl dimmed" v-bind:class="{'disabled':noPlayer}"><img class="svg-img" :src="'repeat-off' | svgIcon(darkUi)"></img></v-btn>
        <v-btn v-if="shuffAltBtn.show" :title="shuffAltBtn.tooltip" flat icon @click.stop="shuffleClicked" class="np-queue-ctl"><v-icon v-if="shuffAltBtn.icon">{{shuffAltBtn.icon}}</v-icon><img v-else :src="shuffAltBtn.image" class="btn-img"></img></v-btn>
        <v-btn :title="trans.shuffleAlbums" flat icon v-else-if="playerStatus.playlist.shuffle===2" @click.stop="shuffleClicked" class="np-queue-ctl" v-bind:class="{'disabled':noPlayer}"><img class="svg-img" :src="'shuffle-albums' | svgIcon(darkUi)"></img></v-btn>
        <v-btn :title="trans.shuffleAll" flat icon v-else-if="playerStatus.playlist.shuffle===1" @click.stop="shuffleClicked" class="np-queue-ctl" v-bind:class="{'disabled':noPlayer}"><v-icon>shuffle</v-icon></v-btn>
        <v-btn :title="trans.shuffleOff" flat icon v-else @click.stop="shuffleClicked" class="np-queue-ctl dimmed" v-bind:class="{'disabled':noPlayer}"><img class="svg-img" :src="'shuffle-off' | svgIcon(darkUi)"></img></v-btn>
        <v-btn v-if="wide>1 && !queryParams.party" :title="i18n('Save queue')" flat icon class="np-queue-ctl" v-bind:class="{'disabled':!(playerStatus.playlist && playerStatus.playlist.count>0)}" @click.stop="npQueueSave"><v-icon>save</v-icon></v-btn>
        <v-btn v-if="!queryParams.party" :title="i18n('Clear queue')" flat icon v-longpress="npQueueClear" class="np-queue-ctl" v-bind:class="{'disabled':!(playerStatus.playlist && playerStatus.playlist.count>0)}"><img class="svg-list-img" :src="'queue-clear' | svgIcon(darkUi)"></img></v-btn>
       </div>
       <v-list v-if="npQueueItems.length" class="lms-list np-info-list np-info-card-list np-queue-slide-list">
        <v-list-tile class="lms-list-item np-queue-row" v-for="item in npQueueItems" :key="'npq-'+item.index" :data-npq="item.index" v-bind:class="{'pq-current': item.index===playerStatus.playlist.current}" @click.stop="npQueuePlay(item.index)">
         <v-list-tile-avatar v-if="item.image" :tile="true" class="lms-avatar"><img :src="item.image" loading="lazy" @dragstart.prevent=""></img></v-list-tile-avatar>
         <v-list-tile-content>
          <v-list-tile-title>{{item.title}}</v-list-tile-title>
          <v-list-tile-sub-title v-if="item.subtitle">{{item.subtitle}}</v-list-tile-sub-title>
         </v-list-tile-content>
         <v-list-tile-action v-if="item.durationStr" class="np-list-time">{{item.durationStr}}</v-list-tile-action>
        </v-list-tile>
       </v-list>
       <div v-else-if="!npQueueFetching" class="np-info-card-empty">{{i18n('Nothing playing')}}</div>
      </div>
      <div class="np-card-edge np-card-edge-top" :style="{opacity: npCardEdgeTopOpacity}" aria-hidden="true"></div>
      <div class="np-card-edge np-card-edge-bottom" aria-hidden="true"></div>
     </div>
    </swiper-slide>
    <swiper-slide class="np-main-slide np-main-slide-np">
   <!--
     Single adaptive layout: cover / meta / controls stay mounted across
     portrait ↔ landscape. Orientation only toggles CSS classes (no v-if tree swap).
     Lyrics live on their own slide so NP can emphasize artwork + transport.
   -->
   <div class="np-main" v-bind:class="{'np-main-land':landscape, 'np-main-port':!landscape, 'np-main-wide':landscape && wide>1}" :style="npSheetCollapseStyle">
    <!-- Track-change swipe is cover-only (swiper-no-swiping). Meta/controls free for card swipes. -->
    <div class="np-sheet-hero">
    <div v-if="!info.show" class="np-cover-block" v-bind:class="{'np-image':!landscape, 'np-image-landscape':landscape, 'np-image-landscape-wide':landscape && wide>1, 'swiper-no-swiping': swipeChangeTrackEnabled}">
     <div class="np-cover-stack" @mouseenter="npCoverMouseEnter" @mouseleave="npCoverMouseLeave" v-bind:class="{'np-cover-stack-wide':landscape && wide>1, 'np-cover-stack-hover':desktopLayout && npCoverHover, 'np-cover-fading':coverFading, 'np-cover-fade-fwd':coverFading && coverFadeDir>0, 'np-cover-fade-rev':coverFading && coverFadeDir<0}">
      <img v-if="prevCoverUrl && coverFading" :src="prevCoverUrl" loading="lazy" @dragstart.prevent="" @dragenter.prevent="" class="np-cover np-cover-layer np-cover-prev" v-bind:class="{'np-cover-dim':!desktopLayout && showOverlay}"></img>
      <img :key="'np-cvr-'+coverRenderKey+'-'+(coverUrl||'')" :src="coverUrl || DEFAULT_COVER" loading="eager" onerror="this.src=DEFAULT_COVER" @dragstart.prevent="" @dragenter.prevent="" @contextmenu="showMenu" @click="clickImage(event)" class="np-cover np-cover-layer np-cover-current" v-touch:start="touchStart" v-touch:end="touchEnd" v-touch:moving="touchMoving" v-bind:class="{'np-cover-fade-in':coverFading, 'np-trans':transCvr, 'np-cover-dim':!desktopLayout && showOverlay}"></img>
      <!-- Emblem/menu/skip live inside the stack so they sit on the art, not under it -->
      <div class="np-emblem" v-if="playerStatus.current.emblem" @click="emblemClicked" :style="{background: playerStatus.current.emblem.bgnd}" v-bind:class="{'np-cover-dim':!desktopLayout && showOverlay}">
       <img :src="playerStatus.current.emblem | emblem()" loading="lazy" @dragstart.prevent="" @dragenter.prevent=""></img>
      </div>
      <table class="np-skip" v-show="desktopLayout || showOverlay" @contextmenu="showMenu" @click="clickImage(event)">
       <tr>
        <td><v-btn icon outline @click.stop="skipBack" id="skip-back" class="np-std-button" v-bind:class="{'disabled':disableBtns}"><img class="svg-img" :src="'rewind-'+skipBSeconds | svgIcon(true)"></img></v-btn></td>
        <td><v-btn icon outline @click.stop="skipForward" id="skip-fwd" class="np-std-button" v-bind:class="{'disabled':disableBtns}"><img class="svg-img" :src="'fast-forward-'+skipFSeconds | svgIcon(true)"></img></v-btn></td>
       </tr>
      </table>
      <div class="np-menu" :title="trans.menu" role="button" @click.stop="showMenu" id="overlay-menu" v-show="(desktopLayout || showOverlay) && playerStatus.playlist.count>0" v-bind:class="{'np-skip-elevate':desktopLayout || showOverlay}"></div>
      <div class="np-close" :title="trans.collapseNp" @click.stop="collapseNpSheetRestore" id="overlay-close" v-show="(desktopLayout || showOverlay) && (desktopLayout || !landscape)" v-bind:class="{'np-skip-elevate':desktopLayout || showOverlay}"></div>
     </div>
    </div>
    <div class="np-meta-block hide-scrollbar fade-both np-card-swipe-zone" v-bind:class="{'np-portrait-track-info':!landscape, 'np-landscape-track-info':landscape, 'np-details-landscape':landscape, 'np-details-landscape-wide':landscape && wide>1}">
     <div id="np-track-info">
      <p class="np-title" v-bind:class="{'np-title-landscape':landscape}" v-if="playerStatus.current.title">{{title}}</p>
      <p class="np-text subtext" v-bind:class="{'np-text-landscape':landscape}" v-if="artistAndComposerLine" v-html="artistAndComposerLine"></p>
      <p class="np-text subtext np-meta-album-line" v-bind:class="{'np-text-landscape':landscape}" v-if="albumLine" v-html="albumLine"></p>
      <v-rating v-if="showRatings" class="np-text subtext np-meta-rating" v-bind:class="{'np-text-landscape':landscape}" v-model="rating.value" :halfIncrements="maxRating>5" hover clearable @click.native="setRating(true)" :readonly="undefined==LMS_P_RP"></v-rating>
     </div>
    </div>
    <v-layout text-xs-center row wrap class="np-controls np-card-swipe-zone" v-bind:class="{'np-controls-wide':landscape && wide>1}">
     <v-flex xs12 class="np-tech ellipsis" v-if="techInfo || playerStatus.playlist.count>1">{{techInfo ? technicalInfo : ""}}{{playerStatus.playlist.current | trackCount(playerStatus.playlist.count, techInfo ? SEPARATOR : undefined)}}</v-flex>
     <v-flex xs12><div class="np-portrait-thin-pad"></div></v-flex>
     <v-flex xs12 v-if="!info.show && undefined!=playerStatus.current.time">
      <v-layout class="np-time-layout">
       <p class="np-pos" v-bind:class="{'np-pos-center': playerStatus.current.duration<=0}">{{playerStatus.current.time | displayTime}}</p>
       <lms-progressbar v-if="playerStatus.current.duration>0" id="np-page-pos-slider" class="np-slider" :thumb="desktopLayout" :value="playerStatus.current.pospc" :buffer="progressBuffer" :playing="playerStatus.isplaying" :duration="playerStatus.current.duration" :anchor="progressAnchor" v-on:click.stop="sliderChanged($event, false)" @mousedown.prevent="sliderMouseDown" @mouseover="npBarSliderMouseOver" @mouseout="npBarSliderMouseOut" @mousemove="npBarSliderMouseMove" @touchstart.passive="touchSliderStart" @touchend.passive="touchSliderEnd" @touchmove.passive="moveTimeTooltipTouch"></lms-progressbar>
       <p class="np-duration link-item" v-if="(showTotal || undefined==playerStatus.current.time) && playerStatus.current.duration>0" @click="toggleTime()">{{playerStatus.current.duration | displayTime}}</p>
       <p class="np-duration link-item" v-else-if="playerStatus.current.duration>0" @click="toggleTime()">-{{playerStatus.current.duration-playerStatus.current.time | displayTime}}</p>
      </v-layout>
     </v-flex>
     <v-flex xs12 v-else-if="!info.show"><div style="height:31px"></div></v-flex>
     <v-flex xs12><div class="np-portrait-thin-pad"></div></v-flex>
     <v-flex xs12>
      <v-layout text-xs-center class="np-playback">
       <v-flex xs4 class="no-control-adjust">
        <v-layout text-xs-center>
         <v-flex xs6>
          <v-btn v-if="repAltBtn.show" :title="repAltBtn.tooltip" flat icon v-longpress="repeatClicked" class="np-std-button" v-bind:class="{'disabled':noPlayer}"><v-icon v-if="repAltBtn.icon" class="media-icon">{{repAltBtn.icon}}</v-icon><img v-else :src="repAltBtn.image" class="btn-img"></img></v-btn>
          <v-btn :title="trans.randomMix" flat icon v-else-if="playerStatus.playlist.randomplay===1" v-longpress="repeatClicked" class="np-std-button" v-bind:class="{'disabled':noPlayer}"><img class="svg-img media-icon" :src="'dice-multiple' | svgIcon(darkUi)"></img></v-btn>
          <v-btn :title="trans.repeatOne" flat icon v-else-if="playerStatus.playlist.repeat===1" v-longpress="repeatClicked" class="np-std-button" v-bind:class="{'disabled':noPlayer}"><v-icon class="media-icon">repeat_one</v-icon></v-btn>
          <v-btn :title="trans.repeatAll" flat icon v-else-if="playerStatus.playlist.repeat===2" v-longpress="repeatClicked" class="np-std-button" v-bind:class="{'disabled':noPlayer}"><v-icon class="media-icon">repeat</v-icon></v-btn>
          <v-btn :title="trans.dstm" flat icon v-else-if="dstm" v-longpress="repeatClicked" class="np-std-button"><v-icon class="media-icon">all_inclusive</v-icon></v-btn>
          <v-btn :title="trans.repeatOff" flat icon v-else v-longpress="repeatClicked" class="dimmed np-std-button" v-bind:class="{'disabled':noPlayer}"><img class="svg-img media-icon" :src="'repeat-off' | svgIcon(darkUi)"></img></v-btn>
         </v-flex>
         <v-flex xs6><v-btn flat icon v-longpress:repeat="prevButton" class="np-std-button" v-bind:class="{ 'disabled':disablePrev}" :title="trans.prev | tooltip('left', keyboardControl)"><v-icon large class="media-icon">skip_previous</v-icon></v-btn></v-flex>
        </v-layout>
       </v-flex>
       <v-flex xs4 class="no-control-adjust">
        <v-btn flat icon large :ripple="false" v-longpress="playPauseButton" @click.middle="showSleep" id="playPauseF" class="np-playpause" :title="(playerStatus.isplaying ? trans.pause : trans.play) | tooltip('space', keyboardControl)" v-bind:class="{'disabled':disableBtns, 'np-playpause-waiting':playerStatus.iswaiting}"><lms-playpause-icon class="media-icon" :playing="playerStatus.isplaying" :waiting="playerStatus.iswaiting" :large="true"></lms-playpause-icon></v-btn>
       </v-flex>
       <v-flex xs4 class="no-control-adjust">
        <v-layout text-xs-center>
         <v-flex xs6><v-btn flat icon v-longpress:repeat="nextButton" class="np-std-button" v-bind:class="{ 'disabled':disableNext}" :title="trans.next | tooltip('right', keyboardControl)"><v-icon large class="media-icon">skip_next</v-icon></v-btn></v-flex>
         <v-flex xs6>
          <v-btn v-if="shuffAltBtn.show" :title="shuffAltBtn.tooltip" flat icon @click.stop="shuffleClicked" class="np-std-button np-shuffle-btn"><v-icon v-if="shuffAltBtn.icon" class="media-icon">{{shuffAltBtn.icon}}</v-icon><img v-else :src="shuffAltBtn.image" class="btn-img"></img></v-btn>
          <v-btn :title="trans.shuffleAlbums" flat icon v-else-if="playerStatus.playlist.shuffle===2" @click.stop="shuffleClicked" class="np-std-button np-shuffle-btn" v-bind:class="{'disabled':noPlayer}"><img class="svg-img media-icon" :src="'shuffle-albums' | svgIcon(darkUi)"></img></v-btn>
          <v-btn :title="trans.shuffleAll" flat icon v-else-if="playerStatus.playlist.shuffle===1" @click.stop="shuffleClicked" class="np-std-button np-shuffle-btn" v-bind:class="{'disabled':noPlayer}"><v-icon class="media-icon">shuffle</v-icon></v-btn>
          <v-btn :title="trans.shuffleOff" flat icon v-else @click.stop="shuffleClicked" class="dimmed np-std-button np-shuffle-btn" v-bind:class="{'disabled':noPlayer}"><img class="svg-img media-icon" :src="'shuffle-off' | svgIcon(darkUi)"></img></v-btn>
         </v-flex>
        </v-layout>
       </v-flex>
      </v-layout>
     </v-flex>
    </v-layout>
    </div>
    <div v-if="npDetailsScroll" class="np-scroll-extra">
     <div class="np-detail-card np-detail-lyrics" @click="openNpDetail('lyrics')">
      <button type="button" class="np-detail-expand" :title="i18n('Lyrics')" :aria-label="i18n('Lyrics')" @click.stop="openNpDetail('lyrics')"><v-icon>fullscreen</v-icon></button>
      <div class="np-detail-kicker">{{i18n('Lyrics')}}</div>
      <div class="np-peek-stage">
       <transition name="np-peek">
        <div class="np-peek-lines" :key="'ly-'+mobileLyricsWindow.key" v-if="mobileLyricsWindow.mode=='lines'">
         <div class="np-peek-line np-peek-line-now">{{mobileLyricsWindow.current}}</div>
         <div class="np-peek-line np-peek-line-next" v-if="mobileLyricsWindow.next">{{mobileLyricsWindow.next}}</div>
        </div>
       </transition>
       <div class="np-peek-lines" v-if="mobileLyricsWindow.mode=='text'">
        <div class="np-peek-line np-peek-line-now">{{mobileLyricsWindow.current}}</div>
        <div class="np-peek-line np-peek-line-next" v-if="mobileLyricsWindow.next">{{mobileLyricsWindow.next}}</div>
       </div>
       <div class="np-peek-lines np-peek-pending" v-if="mobileLyricsWindow.mode!='lines' && mobileLyricsWindow.mode!='text'">
        <div class="np-peek-line np-peek-line-now">{{npLyricsPeekPlaceholder}}</div>
       </div>
      </div>
     </div>
     <div class="np-detail-card np-detail-about" @click="openNpDetail('artist')">
      <button type="button" class="np-detail-expand" :title="i18n('Artist')" :aria-label="i18n('Artist')" @click.stop="openNpDetail('artist')"><v-icon>fullscreen</v-icon></button>
      <div class="np-detail-kicker">{{i18n('Artist')}}</div>
      <div class="np-detail-about-row">
       <img v-if="npArtistThumbVisible" class="np-detail-avatar" :src="npArtistThumb" alt="" @error="npArtistThumbError" @dragstart.prevent="">
       <div class="np-detail-about-copy">
        <div class="np-detail-about-title">{{npCardArtistName}}</div>
        <div class="np-detail-excerpt" v-if="npArtistExcerpt">{{npArtistExcerpt}}</div>
        <div class="np-detail-excerpt np-detail-pending" v-else-if="info.tabs[ARTIST_TAB].text===i18n('Fetching...')">{{i18n('Fetching...')}}</div>
       </div>
      </div>
     </div>
     <div class="np-detail-card np-detail-about" @click="openNpDetail('album')">
      <button type="button" class="np-detail-expand" :title="i18n('Album')" :aria-label="i18n('Album')" @click.stop="openNpDetail('album')"><v-icon>fullscreen</v-icon></button>
      <div class="np-detail-kicker">{{i18n('Album')}}</div>
      <div class="np-detail-about-row">
       <img v-if="coverUrl" class="np-detail-album" :src="coverUrl" alt="" @dragstart.prevent="">
       <div class="np-detail-about-copy">
        <div class="np-detail-about-title">{{npCardAlbumName}}</div>
        <div class="np-detail-excerpt" v-if="npAlbumExcerpt">{{npAlbumExcerpt}}</div>
        <div class="np-detail-excerpt np-detail-pending" v-else-if="info.tabs[ALBUM_TAB].text===i18n('Fetching...')">{{i18n('Fetching...')}}</div>
       </div>
      </div>
     </div>
    </div>
   </div>
    </swiper-slide>

    <!-- Lyrics card: flowing text in expanded-MAI style block (same spirit as desktop expanded track tab) -->
    <swiper-slide v-if="npLyricsSlideEnabled && !npDetailsScroll" class="np-main-slide np-main-slide-lyrics">
     <div class="np-card-panel np-card-panel-lyrics" :id="'np-tab'+TRACK_TAB">
      <div class="np-card-panel-scroll np-lyrics-slide-scroll" id="np-tab-card-lyrics" @scroll.passive="onNpLyricsScroll($event)">
       <div class="np-card-panel-head np-card-panel-head-pull">
        <div class="np-card-panel-kicker">{{i18n('Lyrics')}}</div>
        <div class="np-card-panel-title" v-if="playerStatus.current.title">{{title}}</div>
       </div>
       <div class="np-info-lyrics np-lyrics-slide-body" v-if="npCardHeavyReady || npMainSlide===NP_CARD_SLIDE_LYRICS">
        <div v-if="mobileLyricsWindow.mode=='lines'" class="np-lyrics-wrap np-mai-lyrics-block np-info-card-lyrics-wrap">
         <div v-if="info.tabs[TRACK_TAB].texttitle" v-html="info.tabs[TRACK_TAB].texttitle" class="np-info-title np-mai-block-header"></div>
         <div v-if="info.tabs[TRACK_TAB].highlight && lyricsTimesValid" class="lyrics-highlight-box" v-bind:class="{'lyrics-highlight-fallback': !lyricsHighlightColorAvailable}" :style="lyricsHighlightStyle"></div>
         <template v-for="(line, lindex) in info.tabs[TRACK_TAB].lines">
          <obj :id="'np-lyrics-'+lindex" :data-lyrics-i="lindex" v-bind:class="{'lyrics-current-line':info.tabs[TRACK_TAB].highlight && lyricsTimesValid && playerStatus.current.time>=line.time && playerStatus.current.time<((lindex+1)<info.tabs[TRACK_TAB].lines.length ? info.tabs[TRACK_TAB].lines[lindex+1].time : MAX_LYRICS_DURATION)}">{{line.text.length<1 ? '&nbsp;' : line.text}}</obj><br/>
         </template>
        </div>
        <div v-else-if="mobileLyricsWindow.mode=='text'" class="np-lyrics-wrap np-mai-lyrics-block np-info-card-lyrics-plain" v-html="mobileLyricsWindow.html"></div>
        <div v-else class="np-info-card-empty">{{npLyricsPeekPlaceholder}}</div>
       </div>
      </div>
      <div class="np-card-edge np-card-edge-top" :style="{opacity: npLyricsEdgeTopOpacity}" aria-hidden="true"></div>
      <div class="np-card-edge np-card-edge-bottom" aria-hidden="true"></div>
     </div>
    </swiper-slide>

    <swiper-slide v-if="!npDetailsScroll" class="np-main-slide np-main-slide-artist">
     <div class="np-card-panel np-card-panel-artist" :id="'np-tab'+ARTIST_TAB" v-bind:class="{'np-card-panel-artist-palette':maiArtistPalette.active}">
      <div class="np-card-panel-scroll" @scroll.passive="onNpCardPanelScroll($event)">
       <div class="np-card-panel-head np-card-panel-head-pull" v-bind:class="{'np-card-panel-head-palette':maiArtistPalette.active}">
        <div class="np-card-panel-kicker">{{i18n('Artist')}}</div>
        <div class="np-card-panel-title">{{npCardArtistName}}</div>
       </div>
       <!-- Only show MAI artist artwork when MusicIP/MAI actually has one -->
       <div class="np-card-panel-media np-card-panel-media-artist" v-if="npArtistThumbVisible">
        <img :key="npArtistThumb" :src="npArtistThumb" loading="lazy" class="np-card-panel-artist-img np-mai-artist-img" @load="maiArtistImageLoaded($event)" @error="npArtistThumbError" @dragstart.prevent=""></img>
       </div>
       <div v-if="(npCardHeavyReady || npMainSlide===NP_CARD_SLIDE_ARTIST) && info.tabs[ARTIST_TAB].text" class="np-card-panel-bio" v-html="info.tabs[ARTIST_TAB].text"></div>
       <div class="np-card-panel-sections" v-if="npCardHeavyReady || npMainSlide===NP_CARD_SLIDE_ARTIST">
        <template v-for="(sect, sindex) in info.tabs[ARTIST_TAB].sections">
         <div class="np-sect-title" v-if="maiShowSectHeaders && ((undefined!=sect.items && sect.items.length>=sect.min) || undefined!=sect.html)">{{sect.title}}</div>
         <v-list v-if="undefined!=sect.items && !sect.grid && sect.items.length>=sect.min" class="lms-list np-info-list np-info-card-list">
          <v-list-tile class="lms-list-item" v-for="(item, iindex) in sect.items" :key="'art-'+sindex+'-'+iindex" v-bind:class="{'pq-current': item.id==('album_id:'+infoTrack.album_id)}" @click.stop="itemClicked(ARTIST_TAB, sindex, iindex, $event)">
           <v-list-tile-avatar v-if="item.image" :tile="true" class="lms-avatar"><img :src="item.image" loading="lazy" @dragstart.prevent=""></img></v-list-tile-avatar>
           <v-list-tile-content>
            <v-list-tile-title>{{item.title}}</v-list-tile-title>
            <v-list-tile-sub-title v-if="item.subtitle" v-html="item.subtitle"></v-list-tile-sub-title>
           </v-list-tile-content>
          </v-list-tile>
         </v-list>
         <div class="np-grid-sect" v-else-if="undefined!=sect.items && sect.grid && sect.items.length>=sect.min">
          <div v-for="(item, iindex) in sect.items" :key="'artg-'+sindex+'-'+iindex" v-if="!item.header" class="np-grid-item" @click.stop="itemClicked(ARTIST_TAB, sindex, iindex, $event)">
           <img v-if="item.image" :src="item.image" loading="lazy" @dragstart.prevent=""></img>
           <v-list-tile-title>{{item.title}}</v-list-tile-title>
          </div>
         </div>
         <div v-else-if="undefined!=sect.html" class="np-info-card-plain" v-html="sect.html"></div>
        </template>
       </div>
       <div v-if="!info.tabs[ARTIST_TAB].text && (!info.tabs[ARTIST_TAB].sections || !info.tabs[ARTIST_TAB].sections.length)" class="np-info-card-empty">{{i18n('No artist information')}}</div>
      </div>
      <!-- Top fade opacity follows scroll (0 at rest, ramps in first ~28px). Bottom always soft. -->
      <div class="np-card-edge np-card-edge-top" :style="{opacity: npCardEdgeTopOpacity}" aria-hidden="true"></div>
      <div class="np-card-edge np-card-edge-bottom" aria-hidden="true"></div>
     </div>
    </swiper-slide>

    <swiper-slide v-if="!npDetailsScroll" class="np-main-slide np-main-slide-album">
     <div class="np-card-panel np-card-panel-album" :id="'np-tab'+ALBUM_TAB">
      <div class="np-card-panel-scroll" @scroll.passive="onNpCardPanelScroll($event)">
       <div class="np-card-panel-head np-card-panel-head-pull">
        <div class="np-card-panel-kicker">{{i18n('Album')}}</div>
        <div class="np-card-panel-title">{{npCardAlbumName}}</div>
       </div>
       <div v-if="(npCardHeavyReady || npMainSlide===NP_CARD_SLIDE_ALBUM) && info.tabs[ALBUM_TAB].text" class="np-card-panel-bio" v-html="info.tabs[ALBUM_TAB].text"></div>
       <div class="np-card-panel-sections" v-if="npCardHeavyReady || npMainSlide===NP_CARD_SLIDE_ALBUM">
        <template v-for="(sect, sindex) in info.tabs[ALBUM_TAB].sections">
         <div class="np-sect-title" v-if="maiShowSectHeaders && ((undefined!=sect.items && sect.items.length>=sect.min) || undefined!=sect.html)">{{sect.title}}</div>
         <v-list v-if="undefined!=sect.items && !sect.grid && sect.items.length>=sect.min" class="lms-list np-info-list np-info-card-list">
          <v-list-tile class="lms-list-item" v-for="(item, iindex) in sect.items" :key="'alb-'+sindex+'-'+iindex" v-bind:class="{'pq-current': item.id==('track_id:'+infoTrack.track_id)}" @click.stop="itemClicked(ALBUM_TAB, sindex, iindex, $event)">
           <v-list-tile-content>
            <v-list-tile-title v-html="item.title"></v-list-tile-title>
            <v-list-tile-sub-title v-if="item.subtitle" v-html="item.subtitle"></v-list-tile-sub-title>
           </v-list-tile-content>
           <v-list-tile-action v-if="undefined!=item.durationStr" class="np-list-time">{{item.durationStr}}</v-list-tile-action>
          </v-list-tile>
         </v-list>
         <div v-else-if="undefined!=sect.html" class="np-info-card-plain" v-html="sect.html"></div>
        </template>
       </div>
       <div v-if="!info.tabs[ALBUM_TAB].text && (!info.tabs[ALBUM_TAB].sections || !info.tabs[ALBUM_TAB].sections.some(function(s){return s.items && s.items.length}))" class="np-info-card-empty">{{i18n('No album information')}}</div>
      </div>
      <div class="np-card-edge np-card-edge-top" :style="{opacity: npCardEdgeTopOpacity}" aria-hidden="true"></div>
      <div class="np-card-edge np-card-edge-bottom" aria-hidden="true"></div>
     </div>
    </swiper-slide>
    <div class="np-main-swiper-dots swiper-pagination" slot="pagination"></div>
   </swiper>

   <!-- Thin vertical progress on the right (seek by tap/drag).
        IMPORTANT: keep this as a plain v-if (not the other half of a v-if/v-else with classic body).
        Radio streams have duration=0 → old v-else wrongly rendered classic np-main UNDER the swiper
        (midway layout + double artwork). -->
   <div v-if="!desktopLayout && showMobileInfoCard && playerStatus.current.duration>0 && playerStatus.current.canseek"
    class="np-side-progress swiper-no-swiping" role="slider"
    :aria-valuenow="Math.round(playerStatus.current.pospc||0)" aria-valuemin="0" aria-valuemax="100"
    :title="trans.progress || i18n('Progress')"
    @click.stop="npSideProgressClick($event)"
    @touchstart.stop.passive="npSideProgressTouchStart($event)"
    @touchmove.stop="npSideProgressTouchMove($event)"
    @touchend.stop.passive="npSideProgressTouchEnd($event)"
    @touchcancel.stop.passive="npSideProgressTouchEnd($event)">
    <div class="np-side-progress-track">
     <div class="np-side-progress-fill" :style="npSideProgressFillStyle"></div>
    </div>
   </div>

   <div v-if="npDetailExpand" class="np-detail-fs" @click.stop @touchstart.stop @touchmove.stop>
    <div class="np-detail-fs-bar">
     <div class="np-detail-fs-title">{{npDetailExpand=='lyrics' ? i18n('Lyrics') : (npDetailExpand=='artist' ? npCardArtistName : npCardAlbumName)}}</div>
     <button type="button" class="np-detail-fs-close" :title="i18n('Close')" :aria-label="i18n('Close')" @click.stop="closeNpDetail"><v-icon>close</v-icon></button>
    </div>
    <div class="np-detail-fs-body">
     <template v-if="npDetailExpand=='lyrics'">
      <div v-if="mobileLyricsWindow.mode=='lines'" class="np-info-lyrics np-lyrics-wrap np-mai-lyrics-block np-detail-fs-lyrics">
       <div v-if="info.tabs[TRACK_TAB].highlight && lyricsTimesValid" class="lyrics-highlight-box" v-bind:class="{'lyrics-highlight-fallback': !lyricsHighlightColorAvailable}" :style="lyricsHighlightStyle"></div>
       <template v-for="(line, lindex) in info.tabs[TRACK_TAB].lines">
        <obj :data-lyrics-i="lindex" v-bind:class="{'lyrics-current-line':info.tabs[TRACK_TAB].highlight && lyricsTimesValid && playerStatus.current.time>=line.time && playerStatus.current.time<((lindex+1)<info.tabs[TRACK_TAB].lines.length ? info.tabs[TRACK_TAB].lines[lindex+1].time : MAX_LYRICS_DURATION)}">{{line.text.length<1 ? '\u00a0' : line.text}}</obj><br/>
       </template>
      </div>
      <div v-else-if="mobileLyricsWindow.mode=='text'" class="np-lyrics-wrap np-detail-fs-prose" v-html="mobileLyricsWindow.html"></div>
      <div v-else class="np-info-card-empty">{{npLyricsPeekPlaceholder}}</div>
     </template>
     <template v-else-if="npDetailExpand=='artist'">
      <img v-if="npArtistThumbVisible" class="np-detail-fs-hero" :src="npArtistThumb" alt="" @error="npArtistThumbError" @dragstart.prevent="">
      <div v-if="info.tabs[ARTIST_TAB].text" class="np-card-panel-bio np-detail-fs-prose" v-html="info.tabs[ARTIST_TAB].text"></div>
      <div class="np-card-panel-sections">
       <template v-for="(sect, sindex) in info.tabs[ARTIST_TAB].sections">
        <div class="np-sect-title" v-if="maiShowSectHeaders && ((undefined!=sect.items && sect.items.length>=sect.min) || undefined!=sect.html)">{{sect.title}}</div>
        <v-list v-if="undefined!=sect.items && !sect.grid && sect.items.length>=sect.min" class="lms-list np-info-list np-info-card-list">
         <v-list-tile class="lms-list-item" v-for="(item, iindex) in sect.items" :key="'fsart-'+sindex+'-'+iindex" @click.stop="npDetailItemClicked(ARTIST_TAB, sindex, iindex, $event)">
          <v-list-tile-avatar v-if="item.image" :tile="true" class="lms-avatar"><img :src="item.image" loading="lazy" @dragstart.prevent=""></img></v-list-tile-avatar>
          <v-list-tile-content>
           <v-list-tile-title>{{item.title}}</v-list-tile-title>
           <v-list-tile-sub-title v-if="item.subtitle" v-html="item.subtitle"></v-list-tile-sub-title>
          </v-list-tile-content>
         </v-list-tile>
        </v-list>
        <div class="np-grid-sect" v-else-if="undefined!=sect.items && sect.grid && sect.items.length>=sect.min">
         <div v-for="(item, iindex) in sect.items" :key="'fsartg-'+sindex+'-'+iindex" v-if="!item.header" class="np-grid-item" @click.stop="npDetailItemClicked(ARTIST_TAB, sindex, iindex, $event)">
          <img v-if="item.image" :src="item.image" loading="lazy" @dragstart.prevent=""></img>
          <v-list-tile-title>{{item.title}}</v-list-tile-title>
         </div>
        </div>
        <div v-else-if="undefined!=sect.html" class="np-info-card-plain" v-html="sect.html"></div>
       </template>
      </div>
      <div v-if="!npArtistExcerpt && !npDetailHasSections(info.tabs[ARTIST_TAB])" class="np-info-card-empty">{{i18n('No artist information')}}</div>
     </template>
     <template v-else-if="npDetailExpand=='album'">
      <img v-if="coverUrl" class="np-detail-fs-album" :src="coverUrl" alt="" @dragstart.prevent="">
      <div v-if="info.tabs[ALBUM_TAB].text" class="np-card-panel-bio np-detail-fs-prose" v-html="info.tabs[ALBUM_TAB].text"></div>
      <div class="np-card-panel-sections">
       <template v-for="(sect, sindex) in info.tabs[ALBUM_TAB].sections">
        <div class="np-sect-title" v-if="maiShowSectHeaders && ((undefined!=sect.items && sect.items.length>=sect.min) || undefined!=sect.html)">{{sect.title}}</div>
        <v-list v-if="undefined!=sect.items && !sect.grid && sect.items.length>=sect.min" class="lms-list np-info-list np-info-card-list">
         <v-list-tile class="lms-list-item" v-for="(item, iindex) in sect.items" :key="'fsalb-'+sindex+'-'+iindex" @click.stop="npDetailItemClicked(ALBUM_TAB, sindex, iindex, $event)">
          <v-list-tile-content>
           <v-list-tile-title v-html="item.title"></v-list-tile-title>
           <v-list-tile-sub-title v-if="item.subtitle" v-html="item.subtitle"></v-list-tile-sub-title>
          </v-list-tile-content>
          <v-list-tile-action v-if="undefined!=item.durationStr" class="np-list-time">{{item.durationStr}}</v-list-tile-action>
         </v-list-tile>
        </v-list>
        <div v-else-if="undefined!=sect.html" class="np-info-card-plain" v-html="sect.html"></div>
       </template>
      </div>
      <div v-if="!npAlbumExcerpt && !npDetailHasSections(info.tabs[ALBUM_TAB])" class="np-info-card-empty">{{i18n('No album information')}}</div>
     </template>
    </div>
   </div>

   <!-- Classic (non-integrated / desktop) now-playing body — only when card swiper is off -->
   <div v-if="!showMobileInfoCard" class="np-main" v-bind:class="{'np-main-land':landscape, 'np-main-port':!landscape, 'np-main-wide':landscape && wide>1, 'np-main-scroll-collapse':npSheetScrollCollapseActive, 'np-main-sheet-collapsing':npSheetCollapse>0.02, 'np-main-sheet-collapsed':npSheetCollapse>0.85}" :style="npSheetCollapseStyle" @scroll.passive="onNpMainScroll">
    <div class="np-sheet-hero">
    <div v-if="!info.show" class="np-cover-block" v-bind:class="{'np-image':!landscape, 'np-image-landscape':landscape, 'np-image-landscape-wide':landscape && wide>1}">
     <div class="np-cover-stack" @mouseenter="npCoverMouseEnter" @mouseleave="npCoverMouseLeave" v-bind:class="{'np-cover-stack-wide':landscape && wide>1, 'np-cover-stack-hover':desktopLayout && npCoverHover, 'np-cover-fading':coverFading, 'np-cover-fade-fwd':coverFading && coverFadeDir>0, 'np-cover-fade-rev':coverFading && coverFadeDir<0}">
      <img v-if="prevCoverUrl && coverFading" :src="prevCoverUrl" loading="lazy" @dragstart.prevent="" @dragenter.prevent="" class="np-cover np-cover-layer np-cover-prev" v-bind:class="{'np-cover-dim':!desktopLayout && showOverlay}"></img>
      <img :src="coverUrl" loading="lazy" onerror="this.src=DEFAULT_COVER" @dragstart.prevent="" @dragenter.prevent="" @contextmenu="showMenu" @click="clickImage(event)" class="np-cover np-cover-layer np-cover-current" v-touch:start="touchStart" v-touch:end="touchEnd" v-touch:moving="touchMoving" v-bind:class="{'np-cover-fade-in':coverFading, 'np-trans':transCvr, 'np-cover-dim':!desktopLayout && showOverlay}"></img>
      <div class="np-emblem" v-if="playerStatus.current.emblem" @click="emblemClicked" :style="{background: playerStatus.current.emblem.bgnd}" v-bind:class="{'np-cover-dim':!desktopLayout && showOverlay}">
       <img :src="playerStatus.current.emblem | emblem()" loading="lazy" @dragstart.prevent="" @dragenter.prevent=""></img>
      </div>
      <table class="np-skip" v-show="desktopLayout || showOverlay" @contextmenu="showMenu" @click="clickImage(event)">
       <tr>
        <td><v-btn icon outline @click.stop="skipBack" id="skip-back-classic" class="np-std-button" v-bind:class="{'disabled':disableBtns}"><img class="svg-img" :src="'rewind-'+skipBSeconds | svgIcon(true)"></img></v-btn></td>
        <td><v-btn icon outline @click.stop="skipForward" id="skip-fwd-classic" class="np-std-button" v-bind:class="{'disabled':disableBtns}"><img class="svg-img" :src="'fast-forward-'+skipFSeconds | svgIcon(true)"></img></v-btn></td>
       </tr>
      </table>
      <div class="np-menu" :title="trans.menu" role="button" @click.stop="showMenu" id="overlay-menu-classic" v-show="(desktopLayout || showOverlay) && playerStatus.playlist.count>0" v-bind:class="{'np-skip-elevate':desktopLayout || showOverlay}"></div>
      <div class="np-close" :title="trans.collapseNp" @click.stop="collapseNpSheetRestore" id="overlay-close-classic" v-show="(desktopLayout || showOverlay) && (desktopLayout || !landscape)" v-bind:class="{'np-skip-elevate':desktopLayout || showOverlay}"></div>
     </div>
    </div>
    <div class="np-meta-block hide-scrollbar fade-both" v-bind:class="{'np-portrait-track-info':!landscape, 'np-landscape-track-info':landscape, 'np-details-landscape':landscape, 'np-details-landscape-wide':landscape && wide>1}">
     <div id="np-track-info-classic">
      <p class="np-title" v-bind:class="{'np-title-landscape':landscape}" v-if="playerStatus.current.title">{{title}}</p>
      <p class="np-text subtext" v-bind:class="{'np-text-landscape':landscape}" v-if="artistAndComposerLine" v-html="artistAndComposerLine"></p>
      <p class="np-text subtext np-meta-album-line" v-bind:class="{'np-text-landscape':landscape}" v-if="albumLine" v-html="albumLine"></p>
      <v-rating v-if="showRatings" class="np-text subtext np-meta-rating" v-bind:class="{'np-text-landscape':landscape}" v-model="rating.value" :halfIncrements="maxRating>5" hover clearable @click.native="setRating(true)" :readonly="undefined==LMS_P_RP"></v-rating>
     </div>
    </div>
    <v-layout text-xs-center row wrap class="np-controls" v-bind:class="{'np-controls-wide':landscape && wide>1}">
     <v-flex xs12 class="np-tech ellipsis" v-if="techInfo || playerStatus.playlist.count>1">{{techInfo ? technicalInfo : ""}}{{playerStatus.playlist.current | trackCount(playerStatus.playlist.count, techInfo ? SEPARATOR : undefined)}}</v-flex>
     <v-flex xs12><div class="np-portrait-thin-pad"></div></v-flex>
     <v-flex xs12 v-if="!info.show && undefined!=playerStatus.current.time">
      <v-layout class="np-time-layout">
       <p class="np-pos" v-bind:class="{'np-pos-center': playerStatus.current.duration<=0}">{{playerStatus.current.time | displayTime}}</p>
       <lms-progressbar v-if="playerStatus.current.duration>0" id="np-page-pos-slider-classic" class="np-slider" :thumb="desktopLayout" :value="playerStatus.current.pospc" :buffer="progressBuffer" :playing="playerStatus.isplaying" :duration="playerStatus.current.duration" :anchor="progressAnchor" v-on:click.stop="sliderChanged($event, false)" @mousedown.prevent="sliderMouseDown" @mouseover="npBarSliderMouseOver" @mouseout="npBarSliderMouseOut" @mousemove="npBarSliderMouseMove" @touchstart.passive="touchSliderStart" @touchend.passive="touchSliderEnd" @touchmove.passive="moveTimeTooltipTouch"></lms-progressbar>
       <p class="np-duration link-item" v-if="(showTotal || undefined==playerStatus.current.time) && playerStatus.current.duration>0" @click="toggleTime()">{{playerStatus.current.duration | displayTime}}</p>
       <p class="np-duration link-item" v-else-if="playerStatus.current.duration>0" @click="toggleTime()">-{{playerStatus.current.duration-playerStatus.current.time | displayTime}}</p>
      </v-layout>
     </v-flex>
     <v-flex xs12 v-else-if="!info.show"><div style="height:31px"></div></v-flex>
     <v-flex xs12><div class="np-portrait-thin-pad"></div></v-flex>
     <v-flex xs12>
      <v-layout text-xs-center class="np-playback">
       <v-flex xs4 class="no-control-adjust">
        <v-layout text-xs-center>
         <v-flex xs6>
          <v-btn v-if="repAltBtn.show" :title="repAltBtn.tooltip" flat icon v-longpress="repeatClicked" class="np-std-button" v-bind:class="{'disabled':noPlayer}"><v-icon v-if="repAltBtn.icon" class="media-icon">{{repAltBtn.icon}}</v-icon><img v-else :src="repAltBtn.image" class="btn-img"></img></v-btn>
          <v-btn :title="trans.randomMix" flat icon v-else-if="playerStatus.playlist.randomplay===1" v-longpress="repeatClicked" class="np-std-button" v-bind:class="{'disabled':noPlayer}"><img class="svg-img media-icon" :src="'dice-multiple' | svgIcon(darkUi)"></img></v-btn>
          <v-btn :title="trans.repeatOne" flat icon v-else-if="playerStatus.playlist.repeat===1" v-longpress="repeatClicked" class="np-std-button" v-bind:class="{'disabled':noPlayer}"><v-icon class="media-icon">repeat_one</v-icon></v-btn>
          <v-btn :title="trans.repeatAll" flat icon v-else-if="playerStatus.playlist.repeat===2" v-longpress="repeatClicked" class="np-std-button" v-bind:class="{'disabled':noPlayer}"><v-icon class="media-icon">repeat</v-icon></v-btn>
          <v-btn :title="trans.dstm" flat icon v-else-if="dstm" v-longpress="repeatClicked" class="np-std-button"><v-icon class="media-icon">all_inclusive</v-icon></v-btn>
          <v-btn :title="trans.repeatOff" flat icon v-else v-longpress="repeatClicked" class="dimmed np-std-button" v-bind:class="{'disabled':noPlayer}"><img class="svg-img media-icon" :src="'repeat-off' | svgIcon(darkUi)"></img></v-btn>
         </v-flex>
         <v-flex xs6><v-btn flat icon v-longpress:repeat="prevButton" class="np-std-button" v-bind:class="{ 'disabled':disablePrev}" :title="trans.prev | tooltip('left', keyboardControl)"><v-icon large class="media-icon">skip_previous</v-icon></v-btn></v-flex>
        </v-layout>
       </v-flex>
       <v-flex xs4 class="no-control-adjust">
        <v-btn flat icon large :ripple="false" v-longpress="playPauseButton" @click.middle="showSleep" id="playPauseFClassic" class="np-playpause" :title="(playerStatus.isplaying ? trans.pause : trans.play) | tooltip('space', keyboardControl)" v-bind:class="{'disabled':disableBtns, 'np-playpause-waiting':playerStatus.iswaiting}"><lms-playpause-icon class="media-icon" :playing="playerStatus.isplaying" :waiting="playerStatus.iswaiting" :large="true"></lms-playpause-icon></v-btn>
       </v-flex>
       <v-flex xs4 class="no-control-adjust">
        <v-layout text-xs-center>
         <v-flex xs6><v-btn flat icon v-longpress:repeat="nextButton" class="np-std-button" v-bind:class="{ 'disabled':disableNext}" :title="trans.next | tooltip('right', keyboardControl)"><v-icon large class="media-icon">skip_next</v-icon></v-btn></v-flex>
         <v-flex xs6>
          <v-btn v-if="shuffAltBtn.show" :title="shuffAltBtn.tooltip" flat icon @click.stop="shuffleClicked" class="np-std-button np-shuffle-btn"><v-icon v-if="shuffAltBtn.icon" class="media-icon">{{shuffAltBtn.icon}}</v-icon><img v-else :src="shuffAltBtn.image" class="btn-img"></img></v-btn>
          <v-btn :title="trans.shuffleAlbums" flat icon v-else-if="playerStatus.playlist.shuffle===2" @click.stop="shuffleClicked" class="np-std-button np-shuffle-btn" v-bind:class="{'disabled':noPlayer}"><img class="svg-img media-icon" :src="'shuffle-albums' | svgIcon(darkUi)"></img></v-btn>
          <v-btn :title="trans.shuffleAll" flat icon v-else-if="playerStatus.playlist.shuffle===1" @click.stop="shuffleClicked" class="np-std-button np-shuffle-btn" v-bind:class="{'disabled':noPlayer}"><v-icon class="media-icon">shuffle</v-icon></v-btn>
          <v-btn :title="trans.shuffleOff" flat icon v-else @click.stop="shuffleClicked" class="dimmed np-std-button np-shuffle-btn" v-bind:class="{'disabled':noPlayer}"><img class="svg-img media-icon" :src="'shuffle-off' | svgIcon(darkUi)"></img></v-btn>
         </v-flex>
        </v-layout>
       </v-flex>
      </v-layout>
     </v-flex>
    </v-layout>
    </div>
   </div>
  </div>
 </div>
</div>
`,
    data() {
        return { coverUrl:DEFAULT_COVER,
                 prevCoverUrl: undefined,
                 coverFading: false,
                 coverFadeDir: 1,
                 coverRenderKey: 0,
                 coverFadeTimer: undefined,
                 coverPreload: undefined,
                 playerStatus: {
                    isplaying: false,
                    iswaiting: false,
                    sleepTimer: false,
                    dvc: VOL_STD,
                    current: { canseek:1, duration:0, time:undefined, title:undefined, liveEdge:undefined, artist:undefined, artistAndComposer: undefined, artistAndComposerWithContext:undefined,
                               album:undefined, albumName:undefined, albumLine:undefined, technicalInfo:undefined, qualityLabel:undefined, pospc:0.0, bufpc:100.0, tracknum:undefined,
                               disc:0, year:0, url:undefined, comment:undefined, source: {local:true, text:undefined},
                               emblem: undefined, maiComposer:undefined, discsubtitle:undefined, grouping:undefined },
                    playlist: { shuffle:0, repeat: 0, randomplay:0, current:0, count:0 },
                    wiimDiffuse: undefined,
                 },
                 /* Bumped on status/seek so progress bars re-anchor their CSS glide */
                 progressAnchor: 0,
                 mobileBarText: undefined,
                 npBarPendingDir: undefined,
                 npPlayerPrefs: { open:false, loading:false, sections:[], hasAnything:false, probed:false, showBtn:false, menuStyle:{}, subId:null, subStyle:{}, filter:null },
                 npPlayerPrefsTitle: 'Player options',
                 npBarMorph: { active:false, direction:1, outTitle:'', outSubtitle:'', inTitle:'', inSubtitle:'', outMobile:'', inMobile:'' },
                 serverRestarting: false,
                 serverRestartPct: 0,
                 npBarSlideLive: false,
                 npBarSlideNxtTitle: '',
                 npBarSlideNxtSub: '',
                 npBarSlideCoverSrc: '',
                 npBarMorphTimer: undefined,
                 npBarMarqueeTimer: undefined,
                 npBarNavLayoutTimer: undefined,
                 npSheetOpen: false,
                 npSheetAnim: '',
                 npSheetTimer: undefined,
                 npBarSheetAnim: '',
                 npBarSheetTimer: undefined,
                 npBarTouch: undefined,
                 npBarTouchMoved: false,
                 npBarPressed: false,
                 npBarAltSkip: false,
                 npBarSwipeHandled: false,
                 npBarDocked: false,
                 npBarTempLifted: false,
                 npBarDockDragging: false,
                 npBarDockDragY: 0,
                 npBarDockGesture: undefined,
                 npPageTouch: undefined,
                 npSheetDragY: 0,
                 npSheetDragRaf: undefined,
                 npSheetHandleSkipClick: false,
                 npCollapseTarget: undefined,
                 npSheetReturnPage: undefined,
                 npBarWheelAccum: 0,
                 npBarWheelTimer: undefined,
                 npPageWheelAccum: 0,
                 npPageWheelTimer: undefined,
                 npCardWheelAccum: 0,
                 npCardWheelTimer: undefined,
                 npSheetCollapse: 0,
                 npSheetCollapseRaf: undefined,
                 npLyricsExpanded: false,
                 npLyricsExpand: 0,
                 npMainSlide: NP_CARD_SLIDE_NP,
                 npCardHeavyReady: false,
                 npQueueItems: [],
                 npQueueFetching: false,
                 npQueueSeenStamp: undefined,
                 npQueueSeenCount: -1,
                 npQueueReq: 0,
                 npQueueListSize: 0,
                 npQueueDuration: 0,
                 npQueueName: '',
                 npQueueModified: false,
                 npQueueRemaining: {show:false, size:0, duration:0},
                 npArtistThumbBroken: '',
                 npDetailExpand: null,
                 /* Lyrics as a horizontal card — parked until re-enabled via NP_LYRICS_SLIDE_ENABLED */
                 npLyricsSlideEnabled: NP_LYRICS_SLIDE_ENABLED,
                 /* Top edge fade: 0 when scrollTop is 0, ramps in first ~28px of scroll */
                 npCardEdgeTopOpacity: 0,
                 npLyricsEdgeTopOpacity: 0,
                 npMainSlideSyncing: false,
                 npHandleTouch: undefined,
                 info: { show: false, expanded:getLocalStorageBool("infoExpanded", false), tab:parseInt(getLocalStorageVal("nptab", TRACK_TAB)), showTabs:false, showSectHeaders:true, showSectHeadersExpanded:false, sync: true,
                         tabs: [ { value:ARTIST_TAB, title:undefined, ctitle:undefined, text:undefined, reqId:0, image: undefined,
                                   sections:[ { title:undefined, items:[], min:1, more:undefined, grid:getLocalStorageBool("np-tabs-"+ARTIST_TAB+"-0-grid", false) },
                                              { title:undefined, html:undefined } ] },
                                 { value:ALBUM_TAB, title:undefined, ctitle:undefined, text:undefined, reqId:0, image: undefined,
                                   sections:[ { title:undefined, html:undefined },
                                              { title:undefined, html:undefined },
                                              { title:undefined, items:[], min:2, more:undefined },
                                              { title:undefined, items:[], min:1, more:undefined } ] },
                                 { value: TRACK_TAB, title:undefined, ctitle:undefined, text:undefined, lines:undefined, scroll:false, highlight:false, reqId:0, image: undefined,
                                   sections:[ { title:undefined, html:undefined } ] } ] },
                 infoTrack: {empty:true, album_id:undefined, track_id:undefined, work_id:undefined, path:undefined},
                 trans: { expand:undefined, collapse:undefined, sync:undefined, unsync:undefined, more:undefined, dstm:undefined, randomMix:undefined,
                          repeatAll:undefined, repeatOne:undefined, repeatOff:undefined, shuffleAll:undefined, shuffleAlbums:undefined, shuffleOff:undefined,
                          play:undefined, pause:undefined, prev:undefined, next:undefined, collapseNp:undefined, expandNp:undefined, menu:undefined, browse:undefined,
                          queue:undefined, toggleQueue:undefined },
                 showTotal: true,
                 landscape: false,
                 wide: 0,
                 npOrientSettling: false,
                 npOrientTimer: undefined,
                 npOrientRevealTimer: undefined,
                 windowWidth: 10,
                 barInfoWithContextWidth: 10,
                 largeView: false,
                 menu: { show: false, x:0, y:0, items: [], icons:false, tab:undefined, section:undefined, index:undefined },
                 rating: {value:0, setting:0},
                 timeTooltip: {show: false, x:0, y:0, text:undefined},
                 npBarScrubbing: false,
                 overlayVolume: -1,
                 repAltBtn:{show:false, command:[], icon:undefined, image:undefined, tooltip:undefined},
                 shuffAltBtn:{show:false, command:[], icon:undefined, image:undefined, tooltip:undefined},
                 disableBtns:true,
                 disablePrev:true,
                 disableNext:true,
                 dstm:false,
                 showOverlay:false,
                 showOverlayTimer:undefined,
                 npCoverHover:false,
                 currentBgndUrl:"",
                 showBgnd:true,
                 infoPanelResizing:false,
                 infoDrawerIn:false,
                 infoExpandAnim:false,
                 infoExpandCollapsePending:false,
                 infoDrawerOut:false,
                 maiArtistPalette:{active:false, url:''},
                 maiFac:undefined,
                 lyricsHighlight:{active:false, top:0, height:0},
                 npInfoSlideSyncing:false
                };
    },
    mounted() {
        this.initInfoPanelWidth();
        this.setZoom(parseFloat(getLocalStorageVal("npInfoZoom", 1.0)));
        this.npBarHeightActive = undefined;
        this.desktopBarHeight = getComputedStyle(document.documentElement).getPropertyValue('--desktop-npbar-height');
        this.mobileBarThinHeight = getComputedStyle(document.documentElement).getPropertyValue('--mobile-npbar-height-thin');
        this.mobileBarThickHeight = getComputedStyle(document.documentElement).getPropertyValue('--mobile-npbar-height-thick');
        this.mobileBarRepNavHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--mobile-npbar-height-rnav').replace("px", ""));
        this.bottomPad = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--bottom-pad').replace("px", ""));
        if (isNaN(this.bottomPad)) {
            this.bottomPad = 0;
        }
        this.controlBar();
        this._npBarAltKey = function(e) {
            let on = !!(this.desktopLayout && e && e.altKey);
            if (this.npBarAltSkip !== on) {
                this.npBarAltSkip = on;
            }
        }.bind(this);
        this._npBarAltBlur = function() {
            if (this.npBarAltSkip) {
                this.npBarAltSkip = false;
            }
        }.bind(this);
        window.addEventListener('keydown', this._npBarAltKey, true);
        window.addEventListener('keyup', this._npBarAltKey, true);
        window.addEventListener('blur', this._npBarAltBlur);
        // Miniplayer dock is mobile-only. Never leave a documentElement override of
        // --bottom-toolbar-height (that var is critical for desktop bar + browse heights).
        document.documentElement.style.removeProperty('--bottom-toolbar-height');
        let appInit = document.querySelector('.lms-app');
        if (appInit) {
            appInit.classList.remove('np-bar-docked', 'np-bar-dock-noanim');
        }
        this.npBarDocked = !this.$store.state.desktopLayout && getLocalStorageBool('npBarDocked', false);
        this.$nextTick(function() {
            if (this.$store.state.desktopLayout) {
                this.applyNpBarDocked(false, true);
            } else {
                this.applyNpBarDocked(this.npBarDocked, true);
            }
            this.controlBar(true);
        }.bind(this));
        this.npSheetOpen = !this.$store.state.desktopLayout && MBAR_NONE!=this.mobileBar && this.$store.state.page=='now-playing';
        if (this.npSheetOpen) {
            this.$store.commit('setNpSheetOpen', true);
        }
        this.info.tabs[TRACK_TAB].scroll=getLocalStorageBool("npScrollLyrics", true);
        this.info.tabs[TRACK_TAB].highlight=getLocalStorageBool("npHighlightLyrics", true);
        if (typeof npParallaxInit === 'function') {
            npParallaxInit(this);
        }

        bus.$on('maiDefaults', function(def, isRevert) {
            if (undefined!=def.npInfoZoom && (isRevert || undefined==getLocalStorageVal('npInfoZoom', undefined))) {
                this.setZoom(parseFloat(def.npInfoZoom));
            }
            if (undefined!=def.npScrollLyrics && (isRevert || undefined==getLocalStorageVal('npScrollLyrics', undefined))) {
                this.info.tabs[TRACK_TAB].scroll = def.npScrollLyrics;
            }
            if (undefined!=def.npHighlightLyrics && (isRevert || undefined==getLocalStorageVal('npHighlightLyrics', undefined))) {
                this.info.tabs[TRACK_TAB].highlight = def.npHighlightLyrics;
            }
            if (undefined!=def.showTabs && (isRevert || undefined==getLocalStorageVal('showTabs', undefined))) {
                this.info.showTabs = def.showTabs;
            }
            if (undefined!=def.npShowSectHeaders && (isRevert || undefined==getLocalStorageVal('npShowSectHeaders', undefined))) {
                this.info.showSectHeaders = def.npShowSectHeaders;
            }
            if (undefined!=def.npShowSectHeadersExpanded && (isRevert || undefined==getLocalStorageVal('npShowSectHeadersExpanded', undefined))) {
                this.info.showSectHeadersExpanded = def.npShowSectHeadersExpanded;
            }
        }.bind(this));
        bus.$on('npShowSectHeadersChanged', function(val) {
            this.info.showSectHeaders = val;
        }.bind(this));
        bus.$on('mobileBarChanged', function() {
            this.controlBar(true);
            this.$nextTick(function() {
                this.clearNpBarTempLift(true);
                if (!this.npBarDockable && this.npBarDocked) {
                    this.applyNpBarDocked(false, true);
                } else {
                    this.applyNpBarDocked(this.npBarDocked, true);
                }
                this.scheduleNpBarNavLayout();
            }.bind(this));
        }.bind(this));
        /* Thin miniplayer: browse bottom pull-up temporarily raises docked chrome */
        bus.$on('npBarTempLift', function() {
            this.tempLiftNpBar();
        }.bind(this));
        bus.$on('npBarTempLiftPing', function() {
            if (this.npBarTempLifted) {
                this.scheduleNpBarTempContract();
            }
        }.bind(this));
        bus.$on('customActions', function(val) {
            this.customActions = getCustomActions("track", false);
        }.bind(this));

        try {
            this.npPlayerPrefsTitle = (typeof i18n === 'function') ? i18n('Player options') : 'Player options';
        } catch (e) {}
        this.$nextTick(function() {
            this.refreshNpPlayerPrefsCap();
        }.bind(this));
        // Mobile shortcut bar opens the same drawer (button removed from slim np-bar)
        bus.$on('toggleNpPlayerPrefs', function(ev) {
            this._npPlayerPrefsSectionFilter = null;
            this.toggleNpPlayerPrefs(ev);
        }.bind(this));
        bus.$on('openNpPlayerPrefs', function(ev, sectionId) {
            this._npPlayerPrefsSectionFilter = sectionId || null;
            this.openNpPlayerPrefs(ev);
        }.bind(this));
        bus.$on('requestNpPlayerPrefsAvailable', function() {
            try {
                bus.$emit('npPlayerPrefsAvailable',
                    !!(this.npPlayerPrefs && (this.npPlayerPrefs.showBtn || this.npPlayerPrefs.hasAnything)),
                    this.npPlayerPrefsTitle);
            } catch (e) {}
            if (!this.npPlayerPrefs || !this.npPlayerPrefs.probed) {
                this.refreshNpPlayerPrefsCap();
            }
        }.bind(this));

        bus.$on('scrollCurrentToTop', function() {
            if (this.$store.state.desktopLayout) {
                return;
            }
            if (!this.npSheetOpen && this.$store.state.page!='now-playing') {
                return;
            }
            let el = (this.$el && this.$el.querySelector) ? (this.$el.querySelector('.np-page-body') || this.$el.querySelector('.np-card-panel-bio') || this.$el.querySelector('#np-page')) : document.getElementById('np-page');
            if (el) {
                try {
                    if (typeof el.scrollTo==='function') {
                        el.scrollTo({ top: 0, behavior: 'smooth' });
                    } else {
                        el.scrollTop = 0;
                    }
                } catch (e) {
                    el.scrollTop = 0;
                }
            }
        }.bind(this));
        this.info.showTabs=getLocalStorageBool("showTabs", false);
        this.info.showSectHeaders=getLocalStorageBool("npShowSectHeaders", true);
        this.info.showSectHeadersExpanded=getLocalStorageBool("npShowSectHeadersExpanded", false);
        bus.$on('closeNowPlaying', function() {
            if (this.info.show) {
                bus.$emit('info');
            }
            this.largeView = false;
        }.bind(this));
        bus.$on('expandNowPlaying', function(val) {
            addBrowserHistoryItem();
            if (window.innerHeight>=LMS_MIN_NP_LARGE_INFO_HEIGHT) {
                if (val && this.info.show) {
                    this.info.show = false;
                }
                if (val) {
                    this.expandNpSheet();
                } else {
                    this.collapseNpSheetRestore();
                }
            }
        }.bind(this));

        bus.$on('pageChanged', function(page) {
            if (!this.$store.state.desktopLayout && MBAR_NONE==this.mobileBar) {
                this.npSheetOpen = 'now-playing'==page;
                this.$store.commit('setNpSheetOpen', this.npSheetOpen);
            }
            if (page=='now-playing') {
                if (!this.info.show) {
                    this.$forceUpdate();
                }
            }
            if (typeof npParallaxUpdate === 'function') {
                npParallaxUpdate();
            }
        }.bind(this));

        bus.$on('info-swipe', function(d, ev) {
            if (this.info.show) {
                if ('left'==d) {
                    if (this.info.tab==2) {
                        this.info.tab=0;
                    } else {
                        this.info.tab++;
                    }
                } else if ('right'==d) {
                    if (this.info.tab==0) {
                        this.info.tab=2;
                    } else {
                        this.info.tab--;
                    }
                } else if ('down'==d && this.info.show && undefined!=ev && undefined!=ev.target && ('np-mai-img'==ev.target.className || 'np-mai-artist-img'==ev.target.className)) {
                    bus.$emit('info');
                }
            }
        }.bind(this));
        bus.$on('swipeUp', function() {
            if (this.$store.state.desktopLayout && !this.$store.state.pinQueue && this.$store.state.showQueue) {
                return;
            }
            // Integrated MAI: swipe up on NP opens lyrics when that slide is enabled.
            if (this.showMobileInfoCard && this.npSheetOpen && !this.info.show) {
                if (NP_LYRICS_SLIDE_ENABLED && this.npMainSlide===NP_CARD_SLIDE_NP) {
                    this.goToNpMainSlide(NP_CARD_SLIDE_LYRICS);
                }
                return;
            }
            if ((this.npSheetOpen || !this.$store.state.desktopLayout) && !this.info.show) {
                let elem = document.getElementById("np-track-info") || document.getElementById("np-track-info-classic");
                if (undefined==elem || (elem.scrollHeight-8)<=elem.clientHeight) {
                    bus.$emit('info');
                }
            }
        }.bind(this));
        bus.$on('swipeDown', function() {
            if (this.showMobileInfoCard && this.npSheetOpen && this.npMainSlide===NP_CARD_SLIDE_LYRICS) {
                this.goToNpMainSlide(NP_CARD_SLIDE_NP);
                return;
            }
            if (this.npSheetOpen && this.$store.state.desktopLayout) {
                this.collapseNpSheetRestore();
            } else if (!this.$store.state.desktopLayout && MBAR_NONE!=this.mobileBar && this.npSheetOpen && !this.info.show) {
                this.collapseNpSheetRestore();
            }
        }.bind(this));
        var npView = this;
        this.sizeCheckDelay = 0; // How many resize events have we seen before size checked?
        this._lastAspect = window.innerWidth / Math.max(1, window.innerHeight);
        this._lastOrientLandscape = window.innerWidth >= window.innerHeight;
        this._onOrientMedia = function(e) {
            // iOS 15 / WKWebView (LyrPlay): matchMedia is more reliable than orientationchange.
            npView.beginOrientSettle();
        };
        this._orientMql = undefined;
        try {
            this._orientMql = window.matchMedia('(orientation: landscape)');
            if (this._orientMql) {
                if (this._orientMql.addEventListener) {
                    this._orientMql.addEventListener('change', this._onOrientMedia);
                } else if (this._orientMql.addListener) {
                    this._orientMql.addListener(this._onOrientMedia); // Safari < 14 / some WKWebViews
                }
            }
        } catch (e) { this._orientMql = undefined; }

        window.addEventListener('resize', () => {
            // Aspect flip detection — LyrPlay/iOS often never fires orientationchange.
            let aspect = window.innerWidth / Math.max(1, window.innerHeight);
            let nowLand = window.innerWidth >= window.innerHeight;
            let flipped = (nowLand !== npView._lastOrientLandscape) ||
                          (npView._lastAspect > 0 && ((npView._lastAspect < 1) !== (aspect < 1)));
            npView._lastAspect = aspect;
            npView._lastOrientLandscape = nowLand;

            if (flipped) {
                npView.beginOrientSettle();
                return;
            }
            if (npView.npOrientSettling) {
                // Orientation in progress: only refresh pending metrics; one apply when settled.
                npView.scheduleOrientApply();
                return;
            }
            if (npView.resizeTimeout) {
                clearTimeout(npView.resizeTimeout);
            }
            npView.sizeCheckDelay++;
            let settleMs = npView.sizeCheckDelay>=10 ? 0 : 50;
            if (0==settleMs) {
                npView.checkWindowSize();
                npView.scheduleNpBarMarquee();
                if (npView.npPlayerPrefs && npView.npPlayerPrefs.open) {
                    npView.positionNpPlayerPrefsMenu();
                }
            } else {
                npView.resizeTimeout = setTimeout(function () {
                    npView.resizeTimeout = undefined;
                    npView.checkWindowSize();
                    npView.scheduleNpBarMarquee();
                    if (npView.npPlayerPrefs && npView.npPlayerPrefs.open) {
                        npView.positionNpPlayerPrefsMenu();
                    }
                }, settleMs);
            }
        }, false);
        // Legacy event (still useful on some WebKits).
        window.addEventListener('orientationchange', () => {
            npView.beginOrientSettle();
        }, false);

        // Long-press on 'now playing' nav button whilst in now-playing shows track info
        bus.$on('nav', function(page, longPress) {
            if ('now-playing'==page) {
                if (longPress && undefined!=this.$store.state.player) {
                    bus.$emit('dlg.open', 'sleep', this.$store.state.player);
                } else if (LMS_P_MAI && this.playerStatus && this.playerStatus.current && this.playerStatus.current.artist) {
                    let sheetWasOpen = this.npSheetOpen;
                    this.info.show = !this.info.show;
                    if (!this.info.show && sheetWasOpen && MBAR_NONE!=this.mobileBar) {
                        this.expandNpSheet();
                    }
                } else if (this.info.show) {
                    this.info.show = false;
                }
            }
        }.bind(this));
        bus.$on('escPressed', function() {
            if (this.$store.state.desktopLayout && this.info.show) {
                this.retractInfo();
                return;
            }
            if (this.npSheetOpen) {
                if (this.info.show) {
                    bus.$emit('info');
                } else {
                    this.collapseNpSheetRestore();
                }
            }
        }.bind(this));
        bus.$on('infoRetract', function() {
            this.retractInfo();
        }.bind(this));
        bus.$on('toggleQueue', function() {
            if (this.$store.state.desktopLayout && this.$store.state.pinQueue && this.info.show) {
                this.closeInfoAnimated();
            }
        }.bind(this));
        bus.$on('collapseNpSheet', function() {
            this.collapseNpSheetRestore();
        }.bind(this));
        bus.$on('collapseNpSheetRestore', function() {
            this.collapseNpSheetRestore();
        }.bind(this));
        bus.$on('expandNpSheet', function() {
            this.expandNpSheet();
        }.bind(this));
        bus.$on('npBarSwipe', function(direction) {
            // Ignore while full NP sheet is open — lower card zone owns horizontal swipes
            if (this.npSheetOpen || this.$store.state.npSheetOpen) {
                return;
            }
            // Debounce double delivery (e.g. wheel + residual path) on iOS/desktop
            let now = Date.now();
            if (this._npBarSwipeAt && (now-this._npBarSwipeAt)<400 && this._npBarSwipeDir==direction) {
                return;
            }
            this._npBarSwipeAt = now;
            this._npBarSwipeDir = direction;
            this.npBarSwipeHandled = true;
            if ('left'==direction) {
                this.npBarPendingDir = 1;
                this.nextButton(false);
            } else if ('right'==direction) {
                this.npBarPendingDir = -1;
                this.prevButton(false);
            }
        }.bind(this));

        this.info.sync=getLocalStorageBool("syncInfo", true);
        bus.$on('playerStatus', function(playerStatus) {
            try {
                nowplayingOnPlayerStatus(this, playerStatus); // can be called before deferred JS is loaded...
            } catch (e) { // If error, get status 1 second later...
                setTimeout(function () { bus.$emit('refreshStatus', this.$store.state.player.id); }.bind(this), 1000);
            }
            if (playerStatus && playerStatus.playlist) {
                this.noteNpQueueStatus(playerStatus.playlist);
            }
        }.bind(this));
        bus.$on('queueStatus', function(count, duration) {
            this.npQueueListSize = count || 0;
            this.npQueueDuration = duration || 0;
        }.bind(this));
        this.$nextTick(function() {
            let q = this.npQueueVm();
            if (!q) {
                return;
            }
            if (q.duration && !this.npQueueDuration) {
                this.npQueueListSize = q.listSize || this.npQueueListSize;
                this.npQueueDuration = q.duration;
            }
            if (q.playlist && q.playlist.name && !this.npQueueName) {
                this.npQueueName = q.playlist.name;
                this.npQueueModified = !!q.playlist.modified;
            }
        }.bind(this));

        // Refresh status now, in case we were mounted after initial status call
        bus.$emit('refreshStatus');
        bus.$on('serverRestart', function() {
            this.beginServerRestart(true);
        }.bind(this));
        bus.$on('serverRestartReload', function() {
            this._npRestartReload = true;
        }.bind(this));
        bus.$on('serverStopping', function() {
            this._npRestartSuppress = true;
            this.cancelNpRestartShow();
            this.abortServerRestart();
        }.bind(this));
        bus.$on('networkStatus', function(connected) {
            if (connected) {
                this._npRestartSuppress = false;
                this.cancelNpRestartShow();
                if (this.serverRestarting) {
                    this.finishServerRestart();
                }
            } else if (!this._npRestartSuppress && !this.serverRestarting && !this._npRestartShowTimer) {
                // Comet already waited 2s. Wait a little longer so a wifi blip
                // does not flash the logo. A real restart stays down.
                this._npRestartPendingAt = Date.now();
                this._npRestartShowTimer = setTimeout(function() {
                    this._npRestartShowTimer = undefined;
                    if (lmsIsConnected===false && !this._npRestartSuppress) {
                        this._npRestartSawDown = true;
                        this.beginServerRestart(false, this._npRestartPendingAt);
                    }
                }.bind(this), 3000);
            } else if (!connected) {
                this._npRestartSawDown = true;
                this.cancelNpRestartStillUp();
            }
        }.bind(this));

        this.page = document.getElementById("np-page");
        bus.$on('themeChanged', function() {
            this.setBgndCover();
            this.refreshMaiArtistPalette();
        }.bind(this));
        bus.$on('maiArtistPaletteClear', function() {
            this.clearMaiArtistPalette();
        }.bind(this));
        this.checkLandscape();
        setTimeout(function () {
            this.checkLandscape();
        }.bind(this), 1000);

        bus.$on('currentCover', function(coverUrl) {
            this.setCoverUrl(undefined==coverUrl ? DEFAULT_COVER : coverUrl);
            this.setBgndCover();
        }.bind(this));
        bus.$emit('getCurrentCover');
        bus.$on('setBgndCover', function() {
            this.setBgndCover();
        }.bind(this));
        bus.$on('langChanged', function() {
            this.initItems();
        }.bind(this));
        this.initItems();

        bus.$on('closeMenu', function() {
            if (this.menu.show) {
                this.menu.show = false;
            }
            if (this.npPlayerPrefs && this.npPlayerPrefs.open) {
                this.npPlayerPrefs.open = false;
            }
        }.bind(this));

        bus.$on('closeDialog', function(dlg) {
            if (dlg == 'info-dialog') {
                if (this.$store.state.desktopLayout) {
                    this.retractInfo();
                } else {
                    this.info.show = false;
                }
            }
        }.bind(this));

        bus.$on('info', function() {
            if (!LMS_P_MAI) {
                return;
            }
            // WiiM live inputs (Bluetooth / Optical / RCA / …) have no MAI content.
            if (!this.info.show && isWiimLiveInput(this.playerStatus.current)) {
                return;
            }
            addBrowserHistoryItem();
            if ((window.innerHeight>=LMS_MIN_NP_LARGE_INFO_HEIGHT && this.playerStatus.playlist.count>0) || this.info.show) {
                if (!this.$store.state.desktopLayout && !this.info.show && MBAR_REP_NAV==this.$store.state.mobileBar) {
                    // Store current page so that can revert
                    this.prevPage = this.$store.state.page;
                }
                let sheetWasOpen = this.npSheetOpen;
                this.info.show = !this.info.show;
                if (!this.$store.state.desktopLayout) {
                    if (MBAR_NONE==this.mobileBar) {
                        this.$store.commit('setPage', !this.info.show && 'now-playing'!=this.prevPage ? this.$store.state.prevPage : 'now-playing');
                    } else if (!this.info.show && sheetWasOpen) {
                        this.expandNpSheet();
                    }
                }
            }
        }.bind(this));
        bus.$on('npclose', function() {
            this.close();
        }.bind(this));
        bus.$on('npbrowse', function(cmd, params, title, subtitle) {
            bus.$emit("browse", cmd, params, title, this.currentView(), undefined, subtitle);
            // Always land on browse (not the pre-sheet page) after a meta link
            if (this.npSheetOpen) {
                this.collapseNpSheet('browse');
            } else {
                this.close();
            }
        }.bind(this));
        bus.$on('linkClicked', function() {
            // showAlbum / show_artist → browse already emitted; ensure sheet yields to browse
            if (this.npSheetOpen) {
                this.collapseNpSheet('browse');
            } else if (this.desktopLayout) {
                this.close();
            } else if (this.$store.state.page!='browse') {
                this.$store.commit('setPage', 'browse');
            }
        }.bind(this));

        bus.$on('prefset', function(pref, value, player) {
            if ("plugin.dontstopthemusic:provider"==pref && player==this.$store.state.player.id) {
                this.dstm = (""+value)!="0";
            }
        }.bind(this));

        bus.$on('showLinkMenu.now-playing', function(x, y, menu) {
            showMenu(this, {items: menu, x:x, y:y, show:true, icons:true});
        }.bind(this));

        this.showTotal = getLocalStorageBool('showTotal', true);
        if (!IS_MOBILE) {
            bindKey(LMS_TRACK_INFO_KEYBOARD, 'mod');
            bindKey(LMS_EXPAND_NP_KEYBOARD, 'mod+shift');
            if (undefined!=LMS_P_RP) {
                for (var i=0; i<=6; ++i) {
                    bindKey(''+i, 'mod+shift');
                }
            }
            bus.$on('keyboard', function(key, modifier) {
                if (this.$store.state.visibleMenus.size>0 || this.$store.state.openDialogs.length>1 || (!this.$store.state.desktopLayout && !this.mobileNpActive)) {
                    return;
                }
                // NP sheet open: ←/→ swipe MAI cards, ↓ collapse sheet (no modifier)
                if (undefined==modifier && this.npSheetOpen && !this.info.show) {
                    if (key=='left') {
                        if (this.showMobileInfoCard) {
                            this.npMainSlideStep(-1);
                        }
                        return;
                    }
                    if (key=='right') {
                        if (this.showMobileInfoCard) {
                            this.npMainSlideStep(1);
                        }
                        return;
                    }
                    if (key=='down') {
                        this.collapseNpSheetRestore();
                        return;
                    }
                }
                if ('mod'==modifier && LMS_TRACK_INFO_KEYBOARD==key && LMS_P_MAI && (this.$store.state.openDialogs.length==0 || this.$store.state.openDialogs[0]=='info-dialog') && (window.innerHeight>=LMS_MIN_NP_LARGE_INFO_HEIGHT || this.info.show)) {
                    this.largeView = false;
                    this.info.show = !this.info.show;
                } else if ('mod+shift'==modifier) {
                    if (LMS_EXPAND_NP_KEYBOARD==key && (window.innerHeight>=LMS_MIN_NP_LARGE_INFO_HEIGHT || this.npSheetOpen)) {
                        this.info.show = false;
                        if (this.npSheetOpen) {
                            this.collapseNpSheetRestore();
                        } else {
                            this.expandNpSheet();
                        }
                    } else if (1==key.length && !isNaN(key) && undefined!=LMS_P_RP && LMS_STATS_ENABLED && this.$store.state.showRating) {
                        this.rating.value = parseInt(key);
                        this.setRating();
                    }
                }
            }.bind(this));
        }
        bus.$on('releaseSupportChanged', function() {
            this.initItems();
        }.bind(this));
    },
    methods: {
        initItems() {
            this.trans = { dstm:i18n("Don't Stop The Music"), randomMix:i18n("Random mix"), repeatAll:i18n("Repeat queue"),
                           repeatOne:i18n("Repeat single track"), repeatOff:i18n("No repeat"), shuffleAll:i18n("Shuffle tracks"),
                           shuffleAlbums:lmsOptions.supportReleaseTypes ? i18n("Shuffle releases") : i18n("Shuffle albums"),
                           shuffleOff:i18n("No shuffle"), play:i18n("Play"), pause:i18n("Pause"), prev:i18n("Previous track"),
                           next:i18n("Next track"), collapseNp:i18n("Collapse now playing"), expandNp:i18n("Expand now playing"),
                           menu:i18n("Menu"), browse:i18n('Browse'), queue:i18n('Queue'), toggleQueue:i18n('Toggle queue'),
                           restarting:i18n('Restarting...') };
            this.info.tabs[TRACK_TAB].title=i18n("Track");
            this.info.tabs[ARTIST_TAB].title=i18n("Artist");
            this.info.tabs[ARTIST_TAB].ctitle=i18n("Composer");
            this.info.tabs[ALBUM_TAB].title=lmsOptions.supportReleaseTypes ? i18n('Release') : i18n("Album");
            this.info.tabs[ARTIST_TAB].sections[0].title=lmsOptions.supportReleaseTypes ? i18n("Releases") : i18n("Albums");
            this.info.tabs[ARTIST_TAB].sections[1].title=i18n("Similar artists");
            this.info.tabs[ALBUM_TAB].sections[0].title=i18n("Tracks");
            this.info.tabs[ALBUM_TAB].sections[1].title=i18n("Local files");
            this.info.tabs[TRACK_TAB].sections[0].title=i18n("Details");
        },
        /* Port 9000 stays closed until LMS init finishes, so boot has no
           fraction. Creep toward 90% of the last measured restart, then
           complete when comet reconnects. Do not follow library scan. */
        npRestartExpectedMs() {
            var n = parseInt(getLocalStorageVal('mskRestartMs', '22000'), 10);
            if (isNaN(n) || n<8000) {
                n = 22000;
            }
            if (n>120000) {
                n = 120000;
            }
            return n;
        },
        beginServerRestart(userInitiated, startedAt) {
            if (this._npRestartSuppress || this._npRestartFinishing) {
                return;
            }
            if (userInitiated) {
                this._npRestartUser = true;
            }
            if (!this.serverRestarting) {
                this.serverRestarting = true;
                this.serverRestartPct = 0;
                this._npRestartStart = startedAt || Date.now();
                this._npRestartExpected = this.npRestartExpectedMs();
                if (this.npBarMorph) {
                    this.npBarMorph.active = false;
                }
                this.npBarSlideLive = false;
                this.armNpRestartTick();
            }
            if (userInitiated) {
                this.armNpRestartStillUp();
            }
        },
        armNpRestartTick() {
            this.cancelNpRestartTick();
            this._npRestartTick = setInterval(function() {
                if (!this.serverRestarting || this._npRestartFinishing) {
                    return;
                }
                var elapsed = Date.now() - this._npRestartStart;
                if (elapsed>180000) {
                    this.abortServerRestart();
                    return;
                }
                var expected = this._npRestartExpected || 22000;
                var pct = Math.min(90, (elapsed / expected) * 90);
                pct = Math.round(pct * 10) / 10;
                if (pct!=this.serverRestartPct) {
                    this.serverRestartPct = pct;
                }
            }.bind(this), 200);
        },
        armNpRestartStillUp() {
            this.cancelNpRestartStillUp();
            this._npRestartStillUpTimer = setTimeout(function() {
                this._npRestartStillUpTimer = undefined;
                if (this.serverRestarting && !this._npRestartSawDown && lmsIsConnected!==false) {
                    this.abortServerRestart();
                }
            }.bind(this), 12000);
        },
        finishServerRestart() {
            if (!this.serverRestarting || this._npRestartFinishing) {
                return;
            }
            this._npRestartFinishing = true;
            this.cancelNpRestartTick();
            this.cancelNpRestartStillUp();
            var elapsed = Date.now() - (this._npRestartStart || Date.now());
            if (this._npRestartSawDown && elapsed>=4000 && elapsed<=180000) {
                var expected = this._npRestartExpected || 22000;
                var blended = Math.round(expected * 0.35 + elapsed * 0.65);
                if (blended<8000) {
                    blended = 8000;
                }
                if (blended>120000) {
                    blended = 120000;
                }
                setLocalStorageVal('mskRestartMs', ''+blended);
            }
            this.serverRestartPct = 100;
            var reload = !!this._npRestartReload;
            this._npRestartDoneTimer = setTimeout(function() {
                this._npRestartDoneTimer = undefined;
                this.serverRestarting = false;
                this.serverRestartPct = 0;
                this._npRestartUser = false;
                this._npRestartReload = false;
                this._npRestartSawDown = false;
                this._npRestartFinishing = false;
                if (reload) {
                    location.reload();
                }
            }.bind(this), 500);
        },
        abortServerRestart() {
            this.cancelNpRestartTick();
            this.cancelNpRestartStillUp();
            this.cancelNpRestartShow();
            if (this._npRestartDoneTimer) {
                clearTimeout(this._npRestartDoneTimer);
                this._npRestartDoneTimer = undefined;
            }
            this.serverRestarting = false;
            this.serverRestartPct = 0;
            this._npRestartUser = false;
            this._npRestartReload = false;
            this._npRestartSawDown = false;
            this._npRestartFinishing = false;
        },
        cancelNpRestartTick() {
            if (this._npRestartTick) {
                clearInterval(this._npRestartTick);
                this._npRestartTick = undefined;
            }
        },
        cancelNpRestartShow() {
            if (this._npRestartShowTimer) {
                clearTimeout(this._npRestartShowTimer);
                this._npRestartShowTimer = undefined;
            }
        },
        cancelNpRestartStillUp() {
            if (this._npRestartStillUpTimer) {
                clearTimeout(this._npRestartStillUpTimer);
                this._npRestartStillUpTimer = undefined;
            }
        },
        clearNpRestartTimers() {
            this.cancelNpRestartTick();
            this.cancelNpRestartShow();
            this.cancelNpRestartStillUp();
            if (this._npRestartDoneTimer) {
                clearTimeout(this._npRestartDoneTimer);
                this._npRestartDoneTimer = undefined;
            }
        },
        showMenu(event) {
            nowplayingShowMenu(this, event);
        },
        emblemClicked() {
            if (this.playerStatus.current.source && this.playerStatus.current.source.url) {
                openWindow(this.playerStatus.current.source.url);
            }
        },
        refreshNpPlayerPrefsCap() {
            var self = this;
            // Alarms, sleep, sync, and transfer are always in this menu.
            var publish = function(any) {
                self.npPlayerPrefs.hasAnything = !!any;
                self.npPlayerPrefs.showBtn = !!any;
                self.npPlayerPrefs.probed = true;
                try { bus.$emit('npPlayerPrefsAvailable', !!any, self.npPlayerPrefsTitle); } catch (e) {}
            };
            var meta = (typeof PlayerPrefsMenu !== 'undefined' && PlayerPrefsMenu.playerMeta)
                ? PlayerPrefsMenu.playerMeta(this.$store) : null;
            var id = meta ? meta.id : (this.$store.state.player && this.$store.state.player.id);
            if (!id) {
                this.npPlayerPrefs.sections = [];
                publish(false);
                return;
            }
            publish(true);
        },
        openNpPlayerPrefsSub(sec, fromHover) {
            if (!sec || this.npPlayerPrefsInline) { return; }
            if (fromHover && !this.desktopLayout) { return; }
            var same = this.npPlayerPrefs.subId === sec.id;
            this.npPlayerPrefs.subId = sec.id;
            if (!this.desktopLayout) { return; }
            if (same && this.$refs.npPlayerPrefsSub) {
                this.positionNpPlayerPrefsSubmenu();
                return;
            }
            var self = this;
            this.$nextTick(function() { self.positionNpPlayerPrefsSubmenu(); });
        },
        closeNpPlayerPrefsSub() {
            this.npPlayerPrefs.subId = null;
        },
        toggleNpPlayerPrefs(ev) {
            if (ev) {
                try { ev.stopPropagation(); } catch (e) {}
            }
            /*
             * Button / shortcut is outside the menu, so v-clickoutside can fire
             * on the same gesture. Ignore outside dismiss until the open settles.
             */
            if (this.npPlayerPrefs.open) {
                this._npPlayerPrefsIgnoreOutside = false;
                this.npPlayerPrefs.subId = null;
                this.npPlayerPrefs.open = false;
                return;
            }
            this.npPlayerPrefs.filter = this._npPlayerPrefsSectionFilter || null;
            this.npPlayerPrefs.subId = null;
            // Capture anchor rect before open; position after mount + content load.
            var el = (ev && ev.currentTarget) || document.getElementById('tb-player-prefs') ||
                (this.$refs.npPlayerPrefsBtn && (this.$refs.npPlayerPrefsBtn.$el || this.$refs.npPlayerPrefsBtn));
            // Title-bar button and mobile shortcut: use that control as the anchor.
            if (ev && ev.target && ev.target.closest) {
                var sc = ev.target.closest('#tb-player-prefs, .tb-player-prefs, .nav-shortcut-player-prefs, .nav-shortcut-btn, .np-bar-player-prefs, .np-bar-player-prefs-wrap');
                if (sc && sc.getBoundingClientRect) {
                    el = sc;
                }
            }
            this._npPlayerPrefsAnchor = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
            // Ignore the opening gesture so v-clickoutside does not close immediately.
            // Longer window for touch devices (touchend → synthetic click lag).
            this._npPlayerPrefsIgnoreOutside = true;
            this.npPlayerPrefs.open = true;
            this.loadNpPlayerPrefs();
            this.$nextTick(function() {
                this.positionNpPlayerPrefsMenu();
                var self = this;
                if (this._npPlayerPrefsIgnoreTimer) {
                    clearTimeout(this._npPlayerPrefsIgnoreTimer);
                }
                this._npPlayerPrefsIgnoreTimer = setTimeout(function() {
                    self._npPlayerPrefsIgnoreTimer = undefined;
                    self._npPlayerPrefsIgnoreOutside = false;
                }, 400);
            }.bind(this));
        },
        npPlayerPrefsIsToggleTarget(target) {
            if (!target) {
                return false;
            }
            var refs = [this.$refs.npPlayerPrefsBtn];
            for (var r = 0; r < refs.length; r++) {
                var btn = refs[r] && (refs[r].$el || refs[r]);
                if (btn && (btn === target || (btn.contains && btn.contains(target)))) {
                    return true;
                }
            }
            if (target.closest && target.closest(
                    '#tb-player-prefs, .tb-player-prefs, .np-bar-player-prefs-wrap, .np-bar-player-prefs, .nav-shortcut-player-prefs, .nav-shortcut-btn.nav-shortcut-player-prefs')) {
                return true;
            }
            return false;
        },
        closeNpPlayerPrefs(ev) {
            if (this._npPlayerPrefsIgnoreOutside) {
                return;
            }
            // Click on the activator: toggle owns open/close (do not double-handle)
            if (ev && this.npPlayerPrefsIsToggleTarget(ev.target)) {
                return;
            }
            this.npPlayerPrefs.subId = null;
            this.npPlayerPrefs.open = false;
        },
        openNpPlayerPrefs(ev) {
            if (!this.npPlayerPrefs.open) {
                this.toggleNpPlayerPrefs(ev);
            } else {
                this.loadNpPlayerPrefs();
            }
        },
        positionNpPlayerPrefsMenu() {
            var menu = this.$refs.npPlayerPrefsMenu;
            if (!menu || !this.npPlayerPrefs.open) { return; }
            // Mobile: fixed bottom drawer — no JS positioning
            if (!this.desktopLayout) {
                this.npPlayerPrefs.menuStyle = {};
                return;
            }
            var pad = 8;
            var gap = 6;
            var vw = window.innerWidth || document.documentElement.clientWidth || 800;
            var vh = window.innerHeight || document.documentElement.clientHeight || 600;
            // Title-bar button on desktop; fall back to a bar button if one is still mounted.
            var btn = document.getElementById('tb-player-prefs') ||
                (this.$refs.npPlayerPrefsBtn && (this.$refs.npPlayerPrefsBtn.$el || this.$refs.npPlayerPrefsBtn));
            var anchor = (btn && btn.getBoundingClientRect) ? btn.getBoundingClientRect() : this._npPlayerPrefsAnchor;
            var menuW = menu.offsetWidth || 280;
            var menuH = menu.offsetHeight || 120;
            var maxH = Math.min(Math.floor(vh * 0.58), 520);
            if (menuH > maxH) {
                menuH = maxH;
            }
            var fromTitlebar = !!(btn && (btn.id==='tb-player-prefs' || (btn.classList && btn.classList.contains('tb-player-prefs'))));
            var left;
            var top;
            if (anchor && fromTitlebar) {
                // Drop under the title-bar button, right edge on the button so the queue button stays clear.
                left = Math.round(anchor.right - menuW);
                top = Math.round(anchor.bottom + gap);
            } else if (anchor) {
                // Right-align to button, open upward above the bar.
                left = Math.round(anchor.right - menuW);
                top = Math.round(anchor.top - gap - menuH);
            } else {
                left = Math.round(vw - menuW - pad);
                top = Math.round(vh - menuH - 80);
            }
            // Clamp to viewport edges.
            left = Math.max(pad, Math.min(left, vw - menuW - pad));
            if (top < pad) {
                // Not enough room above — place below button if possible, else pin to top.
                if (anchor && (anchor.bottom + gap + menuH) <= (vh - pad)) {
                    top = Math.round(anchor.bottom + gap);
                } else {
                    top = pad;
                }
            }
            // Final bottom clamp (scroll inside menu if still too tall).
            if (top + menuH > vh - pad) {
                top = Math.max(pad, vh - menuH - pad);
            }
            this.npPlayerPrefs.menuStyle = {
                position: 'fixed',
                top: top + 'px',
                left: left + 'px',
                right: 'auto',
                bottom: 'auto',
                maxHeight: maxH + 'px',
                zIndex: 10050
            };
            var self = this;
            this.$nextTick(function() {
                if (self.npPlayerPrefs.subId && !self.npPlayerPrefsInline) {
                    self.positionNpPlayerPrefsSubmenu();
                }
            });
        },
        positionNpPlayerPrefsSubmenu() {
            if (!this.desktopLayout || !this.npPlayerPrefs.subId || this.npPlayerPrefsInline) { return; }
            var menu = this.$refs.npPlayerPrefsMenu;
            var sub = this.$refs.npPlayerPrefsSub;
            if (!menu || !sub) { return; }
            var pad = 8;
            var gap = 6;
            var vw = window.innerWidth || document.documentElement.clientWidth || 800;
            var vh = window.innerHeight || document.documentElement.clientHeight || 600;
            var mr = menu.getBoundingClientRect();
            var sw = sub.offsetWidth || 240;
            var sh = sub.offsetHeight || 160;
            var row = null;
            var rows = menu.querySelectorAll ? menu.querySelectorAll('[data-sec]') : [];
            for (var i = 0; i < rows.length; i++) {
                if (rows[i].getAttribute('data-sec') === this.npPlayerPrefs.subId) {
                    row = rows[i];
                    break;
                }
            }
            var top = row ? row.getBoundingClientRect().top : mr.top;
            var left = Math.round(mr.left - gap - sw);
            if (left < pad) {
                left = Math.round(mr.right + gap);
            }
            if (left + sw > vw - pad) {
                left = Math.max(pad, vw - sw - pad);
            }
            if (top + sh > vh - pad) {
                top = Math.max(pad, vh - sh - pad);
            }
            if (top < pad) { top = pad; }
            this.npPlayerPrefs.subStyle = {
                position: 'fixed',
                top: Math.round(top) + 'px',
                left: left + 'px',
                maxHeight: Math.min(Math.floor(vh * 0.58), 520) + 'px',
                zIndex: 10051
            };
        },
        loadNpPlayerPrefs() {
            var self = this;
            if (typeof PlayerPrefsMenu === 'undefined' || !PlayerPrefsMenu.loadMenu) {
                this.npPlayerPrefs.sections = [];
                this.$nextTick(function() { self.positionNpPlayerPrefsMenu(); });
                return;
            }
            this.npPlayerPrefs.loading = true;
            PlayerPrefsMenu.loadMenu(this.$store).then(function(res) {
                self.npPlayerPrefs.loading = false;
                var secs = (res && res.sections) ? res.sections : [];
                var filter = self._npPlayerPrefsSectionFilter;
                if (filter) {
                    var groups = {
                        input: ['input', 'source', 'output'],
                        presets: ['presets'],
                        dsp: ['dsp']
                    };
                    var ids = groups[filter] || [filter];
                    secs = secs.filter(function(s) { return s && ids.indexOf(s.id)>=0; });
                    if (secs.length===1) {
                        self.npPlayerPrefsTitle = secs[0].title || self.npPlayerPrefsTitle;
                    } else if (filter==='input') {
                        self.npPlayerPrefsTitle = (typeof i18n==='function') ? i18n('Input') : 'Input';
                    } else if (filter==='presets') {
                        self.npPlayerPrefsTitle = (typeof i18n==='function') ? i18n('Presets') : 'Presets';
                    } else if (filter==='dsp') {
                        self.npPlayerPrefsTitle = (typeof i18n==='function') ? i18n('DSP') : 'DSP';
                    }
                } else {
                    self.npPlayerPrefsTitle = (typeof i18n==='function') ? i18n('Player options') : 'Player options';
                }
                var keep = self.npPlayerPrefs.subId;
                self.npPlayerPrefs.sections = secs;
                if (keep) {
                    var still = false;
                    for (var k = 0; k < secs.length; k++) {
                        if (secs[k] && secs[k].id === keep) { still = true; break; }
                    }
                    if (!still) { self.npPlayerPrefs.subId = null; }
                }
                // Device sections are optional. Alarms, sleep, sync, and transfer
                // keep the button available for every player.
                self.npPlayerPrefs.hasAnything = true;
                self.npPlayerPrefs.showBtn = true;
                self.$nextTick(function() { self.positionNpPlayerPrefsMenu(); });
            }).catch(function(err) {
                self.npPlayerPrefs.loading = false;
                self.npPlayerPrefs.sections = [];
                self.$nextTick(function() { self.positionNpPlayerPrefsMenu(); });
                if (typeof console !== 'undefined' && console.debug) {
                    console.debug('[np-player-prefs] load failed', err);
                }
            });
        },
        applyNpPlayerPref(item) {
            var self = this;
            var pid = this.$store.state.player && this.$store.state.player.id;
            if (!pid || !item || item.divider || typeof PlayerPrefsMenu === 'undefined') { return; }
            // Line-outs stay exclusive with each other. A diffusion row is a
            // separate check: it is on only while that player is really playing.
            var secs = this.npPlayerPrefs.sections || [];
            for (var s = 0; s < secs.length; s++) {
                if (secs[s].id !== item.section) { continue; }
                if (item.exclusive !== false) {
                    for (var i = 0; i < secs[s].items.length; i++) {
                        if (secs[s].items[i].divider || secs[s].items[i].exclusive === false) { continue; }
                        this.$set(secs[s].items[i], 'selected', secs[s].items[i].id === item.id);
                    }
                    this.$set(secs[s], 'currentLabel', item.label || '');
                    this.$set(secs[s], 'currentNum', item.number != null ? item.number : null);
                }
            }
            // WiiM input: update NP-bar immediately (device status is async).
            if (item.section === 'input') {
                this.optimisticWiimInputOnNpBar(item);
            }
            PlayerPrefsMenu.applyItem(pid, item).then(function(ok) {
                if (ok && typeof bus !== 'undefined') {
                    bus.$emit('showMessage', item.label);
                }
                // Status inject on the server lags switchmode (~0.5s+). Poll a few times.
                if (ok && (item.section === 'input' || item.section === 'output' || item.section === 'source' || item.section === 'presets')) {
                    self.refreshNpBarAfterPlayerPref();
                }
                // Refresh menu selection state after apply
                setTimeout(function() { self.loadNpPlayerPrefs(); }, 500);
                if (item.verb === 'diffuse' || item.verb === 'diffusereset') {
                    setTimeout(function() { self.loadNpPlayerPrefs(); }, 1600);
                    setTimeout(function() { self.loadNpPlayerPrefs(); }, 3400);
                }
            });
        },
        openPresetsEditorFromPrefs(event) {
            if (event) {
                try { event.preventDefault(); } catch (e) {}
                try { event.stopPropagation(); } catch (e2) {}
            }
            var player = this.$store.state.player;
            this.npPlayerPrefs.subId = null;
            this.npPlayerPrefs.open = false;
            if (!player || typeof bus === 'undefined') { return; }
            this.$nextTick(function() {
                bus.$emit('dlg.open', 'presetseditor', player.id, player.name);
            });
        },
        npPlayerPrefsCommand(kind) {
            var player = this.$store.state.player;
            this.npPlayerPrefs.subId = null;
            this.npPlayerPrefs.open = false;
            if (!player || typeof bus === 'undefined') { return; }
            this.$nextTick(function() {
                if (kind === 'sleep') {
                    bus.$emit('dlg.open', 'sleep', player);
                } else if (kind === 'alarms') {
                    bus.$emit('dlg.open', 'playersettings', player, 'alarms');
                } else if (kind === 'sync') {
                    bus.$emit('dlg.open', 'sync', player);
                }
            });
        },
        npPlayerPrefsTransfer() {
            var from = this.$store.state.player;
            var players = this.$store.state.players || [];
            this.npPlayerPrefs.subId = null;
            this.npPlayerPrefs.open = false;
            if (!from || players.length < 2 || typeof choose !== 'function') { return; }
            var list = [];
            for (var i = 0; i < players.length; i++) {
                var pl = players[i];
                if (!pl || pl.id === from.id) { continue; }
                list.push({
                    val: pl.id,
                    title: pl.name,
                    icon: pl.icon && pl.icon.icon ? pl.icon.icon : undefined,
                    svg: pl.icon && pl.icon.svg ? pl.icon.svg : undefined
                });
            }
            if (!list.length) { return; }
            var opts = [
                { val: 0, title: i18n("Copy the queue to") },
                { val: 1, title: i18n("Move the queue to") },
                { val: 2, title: i18n("Swap the queue with") }
            ];
            var self = this;
            this.$nextTick(function() {
                choose(i18n("Transfer queue"), list, { options: opts, key: 'movequeue', def: 1 }).then(function(choice) {
                    if (!choice || !choice.item) { return; }
                    var modeVal = choice.option ? choice.option.val : 1;
                    self.npPlayerPrefsDoTransfer(from.id, choice.item.val, modeVal, choice.item.title);
                });
            });
        },
        npPlayerPrefsDoTransfer(fromId, toId, modeVal, toName) {
            var mode = modeVal === 0 ? 'copy' : modeVal === 1 ? 'move' : 'swap';
            var self = this;
            lmsCommand("", ["material-skin", "transferqueue", "from:"+fromId, "to:"+toId, "mode:"+mode]).then(function(resp) {
                var data = resp && resp.data;
                if (data && data.result && data.result.error) {
                    bus.$emit('showError', undefined, data.result.error);
                    return;
                }
                if (modeVal === 0) {
                    bus.$emit('showMessage', i18n("Queue copied to '%1'", toName));
                } else {
                    self.$store.commit('setPlayer', toId);
                }
                bus.$emit('refreshStatus', modeVal === 0 ? fromId : toId);
            }).catch(function(err) {
                bus.$emit('showError', err, i18n("Failed to transfer queue"));
            });
        },
        /**
         * Immediately reflect a WiiM hardware input on the NP-bar title/subtitle.
         * Server-side labels match WiimIntegration::_liveInputLabel.
         */
        optimisticWiimInputOnNpBar(item) {
            if (!item) { return; }
            var mode = String(item.mode || '').toLowerCase();
            // Wi-Fi returns control to LMS/squeezelite — wait for real status.
            if (mode === 'wifi' || mode === 'wi-fi') {
                if (typeof bus !== 'undefined') {
                    bus.$emit('refreshStatus');
                }
                return;
            }
            var raw = String(item.label || mode || 'External');
            var title = raw;
            if (/bluetooth/i.test(raw)) { title = 'Bluetooth Input'; }
            else if (/optical/i.test(raw)) { title = 'Optical Input'; }
            else if (/rca/i.test(raw)) { title = 'RCA Input'; }
            else if (/hdmi/i.test(raw)) { title = 'HDMI Input'; }
            else if (/line/i.test(raw)) { title = 'Line In'; }
            else if (/^tv$/i.test(raw)) { title = 'TV'; }

            var prevTitle = this.playerStatus.current && this.playerStatus.current.title;
            var prevSub = this.npBarSubtitleDisplay || '';
            var prevMobile = this.mobileBarText;

            var cur = this.playerStatus.current || {};
            cur.title = title;
            cur.artist = undefined;
            cur.artists = undefined;
            cur.trackartist = undefined;
            cur.albumartist = undefined;
            cur.album = undefined;
            cur.albumName = undefined;
            cur.albumLine = undefined;
            cur.artistAndComposer = '';
            cur.artistAndComposerWithContext = undefined;
            cur.duration = 0;
            cur.time = 0;
            cur.canseek = 0;
            cur.live = 1;
            cur.repeating_stream = 1;
            cur.extid = 'wiim';
            cur.remote = 1;
            cur.technicalInfo = undefined;
            cur.qualityLabel = undefined;
            // Stable live URL so isWiimLiveInput / source emblem resolve.
            var urlMode = mode || raw.toLowerCase().replace(/\s+/g, '');
            if (urlMode === 'line-in' || urlMode === 'linein') { urlMode = 'linein'; }
            cur.url = 'wiim://' + urlMode;
            this.playerStatus.current = cur;
            if (this.playerStatus.playlist) {
                if (!this.playerStatus.playlist.count || this.playerStatus.playlist.count < 1) {
                    this.playerStatus.playlist.count = 1;
                }
                this.playerStatus.playlist.current = 0;
            }
            this.playerStatus.isplaying = true;
            this.playerStatus.ison = true;
            this.mobileBarText = title;
            if (typeof bus !== 'undefined') {
                bus.$emit('nowPlayingBrief', title);
            }
            // Morph NP-bar text when the title actually changed.
            if (prevTitle !== title && this.startNpBarTextMorph) {
                this.startNpBarTextMorph(1, prevTitle || '', prevSub, prevMobile || '');
            } else if (this.scheduleNpBarMarquee) {
                this.scheduleNpBarMarquee();
            }
        },
        resetNpDiffuse() {
            var d = this.npDiffuse;
            var player = this.$store.state.player;
            var pid = (d && d.sourceId) || (player && player.id);
            if (!pid || typeof lmsCommand !== 'function') {
                return;
            }
            var self = this;
            lmsCommand(pid, ['wiimintegration', 'diffusereset']).then(function() {
                if (typeof bus !== 'undefined') {
                    bus.$emit('showMessage', i18n('Stop diffusion'));
                    bus.$emit('refreshStatus');
                }
                if (self.refreshNpBarAfterPlayerPref) {
                    self.refreshNpBarAfterPlayerPref();
                }
            }).catch(function() {
                if (typeof bus !== 'undefined') {
                    bus.$emit('showError', undefined, i18n('Stop diffusion'));
                }
            });
        },
        refreshNpBarAfterPlayerPref() {
            var delays = [150, 600, 1400, 2800];
            for (var i = 0; i < delays.length; i++) {
                setTimeout(function() {
                    if (typeof bus !== 'undefined') {
                        bus.$emit('refreshStatus');
                    }
                }, delays[i]);
            }
        },
        trackCountClicked() {
            if (this.totalTogglesQueue) {
                this.$store.commit('setShowQueue', !this.$store.state.showQueue);
            }
        },
        menuAction(item) {
            nowplayingMenuAction(this, item);
        },
        menuStdAction(item) {
            nowplayingMenuStdAction(this, item);
        },
        showPic() {
            let artist = this.playerStatus.current.albumartist ? this.playerStatus.current.albumartist : this.playerStatus.current.artist;
            let title = artist ? (this.playerStatus.current.albumName ? this.playerStatus.current.albumName + SEPARATOR + artist : artist) : undefined;
            bus.$emit('dlg.open', 'gallery', [{url:this.coverUrl, title:title}], 0, true);
        },
        doAction(command) {
            // Allow transport from the NP sheet even if a menu id is lingering in the set
            // (shuffle was silently no-op when visibleMenus was non-empty).
            if (this.$store.state.visibleMenus.size>0 && command && command[0]!=='playlist' && command[0]!=='play' && command[0]!=='pause' && command[0]!=='stop' && command[0]!=='button' && command[0]!=='time') {
                return;
            }
            bus.$emit('playerCommand', command);
        },
        setPosition(opts) {
            let force = opts && opts.force;
            let haveTime = this.playerStatus.current && undefined!=this.playerStatus.current.time && undefined!=this.playerStatus.current.duration;
            // Percent for progress UI (0–100). Bars glide via CSS while playing; pospc re-anchors them.
            let pc = 0.0;
            if (haveTime && this.playerStatus.current.duration>0) {
                pc = 100 * this.playerStatus.current.time / this.playerStatus.current.duration;
                if (pc < 0) { pc = 0; }
                if (pc > 100) { pc = 100; }
            }

            let prevPc = this.playerStatus.current.pospc;
            if (force) {
                // Status / seek / play-state: publish true position and re-anchor CSS glides
                if (pc!==prevPc) {
                    this.playerStatus.current.pospc = pc;
                }
                this.progressAnchor = (this.progressAnchor||0) + 1;
            } else if (!this.playerStatus.isplaying) {
                if (pc!==prevPc) {
                    this.playerStatus.current.pospc = pc;
                }
            } else {
                // Playing clock tick: keep pospc roughly in sync for aria/tooltips, but do not
                // thrash bars — they ignore small value deltas while gliding.
                if (Math.abs(pc - (prevPc||0)) >= 0.5) {
                    this.playerStatus.current.pospc = pc;
                }
            }

            let bpc = Math.min(
                    haveTime && undefined!=this.playerStatus.current.liveEdge && this.playerStatus.current.duration>0
                        ? 100 * (this.playerStatus.current.liveEdge+this.playerStatus.current.time) / this.playerStatus.current.duration
                        : 100.0,
                    100.0);
            if (bpc < 0) { bpc = 0; }

            if (bpc!=this.playerStatus.current.bufpc) {
                this.playerStatus.current.bufpc = bpc;
                if (bpc>=99.9999) {
                    this.stopLiveEdgeInterval();
                }
            }
            // Side rail: re-anchor only on force (same CSS glide model as main bar)
            this.syncSideProgressFill(force);
            // Lyrics: only when the second rolls (not every clock tick)
            let sec = haveTime ? Math.floor(this.playerStatus.current.time) : -1;
            if (force || sec!=this._lyricsPosSec) {
                this._lyricsPosSec = sec;
                this.updateLyricsPosition();
            }
        },
        /** GPU scaleY side progress — long linear CSS run while playing; re-anchor on force */
        syncSideProgressFill(force) {
            try {
                let fill = this.$el && this.$el.querySelector
                    ? this.$el.querySelector('.np-side-progress-fill')
                    : null;
                if (!fill) {
                    return;
                }
                let dur = this.playerStatus.current.duration || 0;
                let time = this.playerStatus.current.time || 0;
                let v = (dur > 0) ? Math.max(0, Math.min(1, time / dur)) : 0;
                let playing = this.playerStatus.isplaying && dur > 0.5 && v < 0.999;
                let reduce = false;
                try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
                fill.style.willChange = 'transform';
                fill.style.transformOrigin = 'top center';
                if (!playing || reduce) {
                    this._sideProgressToken = (this._sideProgressToken||0) + 1;
                    this._sideGliding = false;
                    fill.style.transition = 'none';
                    fill.style.transform = 'scaleY(' + v + ') translateZ(0)';
                    return;
                }
                // Soft clock tick while already gliding: leave compositor alone
                if (!force && this._sideGliding) {
                    return;
                }
                let remaining = Math.max(0.05, dur * (1 - v));
                let token = (this._sideProgressToken = (this._sideProgressToken||0) + 1);
                this._sideGliding = true;
                fill.style.transition = 'none';
                fill.style.transform = 'scaleY(' + v + ') translateZ(0)';
                requestAnimationFrame(function() {
                    if (token !== this._sideProgressToken) { return; }
                    requestAnimationFrame(function() {
                        if (token !== this._sideProgressToken) { return; }
                        fill.style.transition = 'transform ' + remaining.toFixed(3) + 's linear';
                        fill.style.transform = 'scaleY(1) translateZ(0)';
                    }.bind(this));
                }.bind(this));
            } catch (e) {}
        },
        lyricsMotionReduced() {
            try {
                return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            } catch (e) {
                return false;
            }
        },
        getLyricsLineIndex(lines, time) {
            let index = 0;
            for (let i=0, len=lines.length; i<len; ++i) {
                if (lines[i].time<=time) {
                    index = i;
                } else {
                    break;
                }
            }
            return index;
        },
        getOffsetWithin(child, ancestor) {
            let top = 0;
            let el = child;
            while (el && el!==ancestor) {
                top += el.offsetTop;
                el = el.offsetParent;
            }
            if (el!==ancestor) {
                top = child.getBoundingClientRect().top - ancestor.getBoundingClientRect().top;
            }
            return top;
        },
        getLyricsLineMetrics(wrap, index) {
            // Prefer scoped query (loop mode can clone slides → duplicate ids).
            let cur = wrap
                ? (wrap.querySelector('#np-lyrics-'+index) || wrap.querySelector('[data-lyrics-i="'+index+'"]'))
                : document.getElementById("np-lyrics-"+index);
            if (!cur) {
                cur = document.getElementById("np-lyrics-"+index);
            }
            if (!cur) {
                return undefined;
            }
            return {top:this.getOffsetWithin(cur, wrap), height:cur.offsetHeight, wrapTop:wrap.offsetTop};
        },
        scrollLyricsToLine(tabEl, metrics) {
            if (!tabEl || !metrics) {
                return;
            }
            let linePos = metrics.wrapTop + metrics.top;
            let target = Math.max(0, linePos - (tabEl.clientHeight/2) + (metrics.height/2));
            if (this.lyricsMotionReduced()) {
                tabEl.scrollTop = target;
                return;
            }
            tabEl.scrollTo({top:target, behavior:'smooth'});
        },
        resetLyricsTracking() {
            this.info.tabs[TRACK_TAB].pos = -1;
            this.lyricsHighlight.active = false;
        },
        scheduleLyricsPositionUpdate(delay) {
            this.$nextTick(function() {
                this.updateLyricsPosition();
                if (undefined!=delay && delay>0) {
                    setTimeout(function() { this.updateLyricsPosition(); }.bind(this), delay);
                }
            }.bind(this));
        },
        updateLyricsPosition() {
            let trackTab = this.info.tabs[TRACK_TAB];
            let lines = trackTab.lines;
            // Mobile: only drive scroll/highlight when the lyrics slide is active
            let fsLyrics = this.npDetailExpand==='lyrics';
            let cardMode = fsLyrics || (this.showMobileInfoCard && !this.info.show && this.npMainSlide===NP_CARD_SLIDE_LYRICS);
            let lyricsVisible = this.info.show || cardMode;
            if (!lyricsVisible || !this.info.sync || !lines || !this.lyricsTimesValid) {
                this.lyricsHighlight.active = false;
                return;
            }
            // Card always scrolls + highlights like expanded MAI; full info respects user prefs.
            let doScroll = cardMode ? true : trackTab.scroll;
            let doHighlight = cardMode ? (false!==trackTab.highlight) : trackTab.highlight;
            if (!doScroll && !doHighlight) {
                this.lyricsHighlight.active = false;
                return;
            }

            /* Contracted/tabbed layout: lyrics DOM is hidden unless track tab is active */
            if (this.info.show && this.infoUseTabs && TRACK_TAB!=this.info.tab) {
                this.lyricsHighlight.active = false;
                return;
            }

            // Loop mode clones slides — scope to the active lyrics slide
            let tabEl = fsLyrics
                ? document.querySelector('#np-page .np-detail-fs-body')
                : (cardMode
                    ? document.querySelector('#np-page .swiper-slide-active .np-lyrics-slide-scroll')
                    : document.getElementById("np-tab"+TRACK_TAB));
            let wrap = tabEl ? tabEl.querySelector('.np-lyrics-wrap, .np-mai-lyrics-block, .np-info-card-lyrics-wrap') : undefined;
            if (!tabEl || !wrap) {
                this.lyricsHighlight.active = false;
                trackTab.pos = -1;
                return;
            }

            /* v-tab-item panels use v-show; hidden panels report zero-size metrics */
            if (tabEl.offsetHeight<1 || wrap.offsetHeight<1) {
                this.lyricsHighlight.active = false;
                trackTab.pos = -1;
                return;
            }

            let lineIndex = this.getLyricsLineIndex(lines, this.playerStatus.current.time);
            let force = undefined===trackTab.pos || trackTab.pos<0;
            if (!force && lineIndex===trackTab.pos && (!doHighlight || this.lyricsHighlight.active)) {
                return;
            }

            let metrics = this.getLyricsLineMetrics(wrap, lineIndex);
            if (!metrics || metrics.height<1) {
                this.lyricsHighlight.active = false;
                trackTab.pos = -1;
                return;
            }

            trackTab.pos = lineIndex;
            if (doHighlight) {
                this.lyricsHighlight.active = true;
                this.lyricsHighlight.top = metrics.top;
                this.lyricsHighlight.height = metrics.height;
            } else {
                this.lyricsHighlight.active = false;
            }

            if (doScroll) {
                this.scrollLyricsToLine(tabEl, metrics);
            }
        },
        sliderMouseDown(e) {
            if (!this.desktopLayout || 0!==e.button) {
                return;
            }
            this.npBarScrubbing = true;
            this.showTimeTooltip();
            this.sliderChanged(e, false);
            this.moveTimeTooltip(e, false);
            this.npBarScrubMove = this.sliderMouseMove.bind(this);
            this.npBarScrubUp = this.sliderMouseUp.bind(this);
            document.addEventListener('mousemove', this.npBarScrubMove);
            document.addEventListener('mouseup', this.npBarScrubUp);
        },
        sliderMouseMove(e) {
            if (!this.npBarScrubbing) {
                return;
            }
            this.sliderChanged(e, false);
            this.moveTimeTooltip(e, false);
        },
        sliderMouseUp(e) {
            if (!this.npBarScrubbing) {
                return;
            }
            this.endNpBarScrub(e);
        },
        endNpBarScrub(e) {
            this.npBarScrubbing = false;
            if (undefined!=this.npBarScrubMove) {
                document.removeEventListener('mousemove', this.npBarScrubMove);
                this.npBarScrubMove = undefined;
            }
            if (undefined!=this.npBarScrubUp) {
                document.removeEventListener('mouseup', this.npBarScrubUp);
                this.npBarScrubUp = undefined;
            }
            if (undefined!=e) {
                this.sliderChanged(e, false);
            }
            this.hideTimeTooltip();
        },
        npBarSliderMouseOver(e) {
            if (!this.desktopLayout) {
                return;
            }
            this.showTimeTooltip();
            this.moveTimeTooltip(e, false);
        },
        npBarSliderMouseMove(e) {
            if (this.npBarScrubbing) {
                this.sliderMouseMove(e);
            } else {
                this.moveTimeTooltip(e, false);
            }
        },
        npBarSliderMouseOut(e) {
            if (!this.npBarScrubbing) {
                this.hideTimeTooltip();
            }
        },
        npBarSliderVisible(el) {
            if (!el || !el.isConnected) {
                return false;
            }
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
        },
        npBarSliderEl(e) {
            if (e && e.currentTarget && e.currentTarget.classList && e.currentTarget.classList.contains('pbar')) {
                return e.currentTarget;
            }
            if (e && e.target && e.target.closest) {
                let fromEvent = e.target.closest('.pbar.np-slider, .pbar.np-bar-slider');
                if (fromEvent) {
                    return fromEvent;
                }
            }
            let pageSlider = document.getElementById('np-page-pos-slider');
            let barSlider;
            let bar = document.getElementById('np-bar');
            if (bar) {
                barSlider = bar.querySelector('.np-bar-slider');
            }
            if (!barSlider) {
                barSlider = document.getElementById('pos-slider');
            }
            const pageVisible = pageSlider && this.npBarSliderVisible(pageSlider);
            const barVisible = barSlider && this.npBarSliderVisible(barSlider);
            if (pageVisible && barVisible && undefined!=e) {
                const x = undefined!==e.clientX ? e.clientX : e.x;
                const y = undefined!==e.clientY ? e.clientY : e.y;
                if (undefined!=x && undefined!=y) {
                    const slop = 10;
                    const pr = pageSlider.getBoundingClientRect();
                    const br = barSlider.getBoundingClientRect();
                    const inPage = x>=pr.left-slop && x<=pr.right+slop && y>=pr.top-slop && y<=pr.bottom+slop;
                    const inBar = x>=br.left-slop && x<=br.right+slop && y>=br.top-slop && y<=br.bottom+slop;
                    if (inPage && !inBar) {
                        return pageSlider;
                    }
                    if (inBar && !inPage) {
                        return barSlider;
                    }
                }
            }
            if (pageVisible && (this.showNpSheetPage || this.npSheetActive)) {
                return pageSlider;
            }
            if (barVisible) {
                return barSlider;
            }
            if (pageVisible) {
                return pageSlider;
            }
            return barSlider || pageSlider;
        },
        sliderChanged(e, isTouch) {
            if (this.serverRestarting) {
                return;
            }
            if (this.playerStatus.current.canseek && this.playerStatus.current.duration>3) {
                let slider = this.npBarSliderEl(e);
                if (!slider) {
                    return;
                }
                const rect = slider.getBoundingClientRect();
                const evPos = isTouch ? getTouchPos(e) : {x:e.clientX, y:e.clientY};
                let pos = evPos.x - rect.x;
                if (isTouch && ( (evPos.x < (rect.x - 8)) || (evPos.x > (rect.x+rect.width + 8)) ||
                                 (evPos.y < (rect.y - 8)) || (evPos.y > (rect.y+rect.height + 8))) ) {
                    return;
                }
                // Try to detect up-swipes on desktop layout on mobile devices, e.g. newer Android where swipe up to
                // show navigation bar.
                if (isTouch && this.$store.state.desktopLayout && !this.npSheetOpen && undefined!=this.touchStartPos &&
                    (window.innerHeight-8)<=this.touchStartPos.y && this.touchStartPos.y>evPos.y && (this.touchStartPos.y-evPos.y)>4) {
                    return;
                }
                pos = Math.min(Math.max(0, pos), rect.width);
                let val = Math.floor(this.playerStatus.current.duration * pos / rect.width);

                // On touch devices we get a sliderChanged event from touchSliderEnd and the one from the slider
                // So, ignore events too close together. See #672
                if (undefined!=this.lastTimeEvent && this.lastTimeEvent.isTouch!=isTouch && this.lastTimeEvent.val==val && ((new Date().getTime())-this.lastTimeEvent.time)<250) {
                    return;
                }
                this.doAction(['time', val]);
                this.lastTimeEvent = {time: new Date().getTime(), val: val, isTouch: isTouch};
            }
        },
        /** Vertical side progress: top = 0%, bottom = 100%. */
        npSideProgressPcFromEvent(ev) {
            let el = (this.$el && this.$el.querySelector)
                ? this.$el.querySelector('.np-side-progress-track')
                : document.querySelector('#np-page .np-side-progress-track');
            if (!el || !this.playerStatus.current.duration) {
                return -1;
            }
            let rect = el.getBoundingClientRect();
            let y = (ev.touches && ev.touches[0]) ? ev.touches[0].clientY
                : (ev.changedTouches && ev.changedTouches[0]) ? ev.changedTouches[0].clientY
                : (undefined!=ev.clientY ? ev.clientY : -1);
            if (y < 0 || rect.height < 1) {
                return -1;
            }
            let pc = ((y - rect.top) / rect.height) * 100;
            return Math.max(0, Math.min(100, pc));
        },
        npSideProgressSeek(ev) {
            if (!this.playerStatus.current.canseek || this.playerStatus.current.duration<=3) {
                return;
            }
            let pc = this.npSideProgressPcFromEvent(ev);
            if (pc < 0) {
                return;
            }
            let val = Math.floor(this.playerStatus.current.duration * pc / 100);
            if (undefined!=this.lastTimeEvent && this.lastTimeEvent.val==val && ((new Date().getTime())-this.lastTimeEvent.time)<200) {
                return;
            }
            this.doAction(['time', val]);
            this.lastTimeEvent = {time: new Date().getTime(), val: val, isTouch: !!(ev.touches || ev.changedTouches)};
        },
        npSideProgressClick(ev) {
            this.npSideProgressSeek(ev);
        },
        npSideProgressTouchStart(ev) {
            this._npSideProgressDragging = true;
            this.npSideProgressSeek(ev);
        },
        npSideProgressTouchMove(ev) {
            if (!this._npSideProgressDragging) {
                return;
            }
            if (ev.cancelable) {
                try { ev.preventDefault(); } catch (e) {}
            }
            this.npSideProgressSeek(ev);
        },
        npSideProgressTouchEnd(ev) {
            if (this._npSideProgressDragging && ev) {
                this.npSideProgressSeek(ev);
            }
            this._npSideProgressDragging = false;
        },
        moveTimeTooltipTouch(e) {
            this.moveTimeTooltip(getTouchPos(e), true);
        },
        moveTimeTooltip(e, isTouch) {
            if (!this.timeTooltip.show) {
                return;
            }
            if (this.playerStatus.current.duration<=1) {
                this.hideTimeTooltip();
                return;
            }
            const slider = this.npBarSliderEl(e);
            if (!slider) {
                return;
            }
            const x = isTouch ? e.x : (undefined!==e.clientX ? e.clientX : e.x);
            // Anchor to the visual track (not the padded hit-box). The bar has
            // ~8px vertical padding for scrubbing; using the full rect made the
            // time label float too high above the strip.
            const track = slider.querySelector ? slider.querySelector('.pbar-track') : null;
            const rect = (track || slider).getBoundingClientRect();
            const full = slider.getBoundingClientRect();
            this.timeTooltip.x = x;
            // v-tooltip top draws above this y — sit just over the track
            this.timeTooltip.y = rect.y - (isTouch ? 14 : 2);
            let pos = x - full.x;
            pos = Math.min(Math.max(0, pos), full.width);
            this.timeTooltip.text=""+formatSeconds(Math.floor(this.playerStatus.current.duration * pos / full.width));
            this.startTooltipTimeout();
        },
        touchSliderStart(e) {
            this.showTimeTooltip();
            this.touchStartPos = getTouchPos(e);
        },
        touchSliderEnd(e) {
            if (this.timeTooltip.show) {
                this.sliderChanged(e, true);
                this.hideTimeTooltip();
            }
            this.touchStartPos = undefined;
        },
        setInfoTrack() {
            this.infoTrack={ title: this.playerStatus.current.title,
                             track_id: this.playerStatus.current.id,
                             artist: this.playerStatus.current.artist,
                             artists: this.playerStatus.current.artists,
                             artist_id: this.playerStatus.current.artist_ids
                                ? this.playerStatus.current.artist_ids[0]
                                : this.playerStatus.current.artist_id,
                             artist_ids: this.playerStatus.current.artist_ids,
                             maiComposer: this.playerStatus.current.maiComposer,
                             composer: this.playerStatus.current.composer,
                             composer_id: this.playerStatus.current.composer_ids
                                ? this.playerStatus.current.composer_ids[0]
                                : this.playerStatus.current.composer_id,
                             composer_ids: this.playerStatus.current.composer_ids,
                             composers: this.playerStatus.current.composers,
                             albumartist: this.playerStatus.current.albumartist,
                             albumartist_id: this.playerStatus.current.albumartist_ids
                                ? this.playerStatus.current.albumartist_ids[0]
                                : this.playerStatus.current.albumartist_id,
                             albumartist_ids: this.playerStatus.current.albumartist_ids,
                             album: this.playerStatus.current.albumName,
                             album_id: this.playerStatus.current.album_id,
                             work_id: this.playerStatus.current.work_id,
                             isClassical: this.playerStatus.current.isClassical,
                             url: this.playerStatus.current.url,
                             path: localPath(this.playerStatus.current.url)};
            this.infoTrack.empty=undefined==this.infoTrack.title &&
                                 undefined==this.infoTrack.track_id &&
                                 undefined==this.infoTrack.artist &&
                                 undefined==this.infoTrack.artist_id &&
                                 undefined==this.infoTrack.artist_ids &&
                                 undefined==this.infoTrack.composer &&
                                 undefined==this.infoTrack.composer_id &&
                                 undefined==this.infoTrack.composer_ids &&
                                 undefined==this.infoTrack.albumartist &&
                                 undefined==this.infoTrack.albumartist_id &&
                                 undefined==this.infoTrack.albumartist_ids &&
                                 undefined==this.infoTrack.album &&
                                 undefined==this.infoTrack.url;
        },
        currentView() {
            return this.$store.state.desktopLayout
                        ? this.info.show
                            ? NP_INFO
                            : this.npSheetOpen
                                ? NP_EXPANDED
                                : undefined
                        : this.info.show
                            ? NP_INFO
                            : 'now-playing'
        },
        trackInfo() {
            if (undefined==this.playerStatus.current.id) {
                bus.$emit('showMessage', i18n('Nothing playing'));
                return;
            }
            let returnView = this.currentView();
            this.close();
            bus.$emit('trackInfo', {id: "track_id:"+this.playerStatus.current.id, title:this.playerStatus.current.title, image: this.coverUrl},
                      this.playerStatus.playlist.current, returnView);
        },
        fetchTrackInfo() {
            nowplayingFetchTrackInfo(this);
        },
        fetchArtistInfo() {
            nowplayingFetchArtistInfo(this);
        },
        fetchAlbumInfo() {
            nowplayingFetchAlbumInfo(this);
        },
        isCurrent(data, tab) {
            return data.id==this.info.tabs[tab].reqId;
        },
        showInfo() {
            // Mobile NP card can load MAI without the full-screen info panel.
            if ((!this.info.show && !this.showMobileInfoCard) || !this.infoTrack) {
                return;
            }
            if (this.showMobileInfoCard && !this.info.show) {
                // Prefetch all MAI slides when the np-card is open so artist/album
                // are warm by the time the user swipes (fetch* no-ops if current).
                // Still gated on showMobileInfoCard — never while the sheet is closed.
                this.fetchTrackInfo();
                this.fetchArtistInfo();
                this.fetchAlbumInfo();
                if (NP_LYRICS_SLIDE_ENABLED && this.npMainSlide===NP_CARD_SLIDE_LYRICS) {
                    this.scheduleLyricsPositionUpdate(50);
                }
                return;
            }
            if (!this.infoUseTabs) {
                this.fetchTrackInfo();
                this.fetchArtistInfo();
                this.fetchAlbumInfo();
                this.scheduleLyricsPositionUpdate();
            } else if (TRACK_TAB==this.info.tab) {
                this.fetchTrackInfo();
                this.scheduleLyricsPositionUpdate();
            } else if (ARTIST_TAB==this.info.tab) {
                this.fetchArtistInfo();
            } else {
                this.fetchAlbumInfo();
            }
        },
        noteNpQueueStatus(pl) {
            if (!pl || !this.showMobileInfoCard) {
                return;
            }
            this.npQueueName = pl.name || '';
            this.npQueueModified = !!pl.modified;
            let stamp = pl.timestamp;
            let count = pl.count || 0;
            let changed = stamp!==this.npQueueSeenStamp || count!==this.npQueueSeenCount;
            this.npQueueSeenStamp = stamp;
            this.npQueueSeenCount = count;
            if (!changed) {
                return;
            }
            if (count<1) {
                this.npQueueItems = [];
                return;
            }
            if (this.npMainSlide===NP_CARD_SLIDE_QUEUE) {
                this.fetchNpQueue(false);
            }
        },
        fetchNpQueue(scrollToCurrent) {
            if (!this.showMobileInfoCard || !this.$store.state.player) {
                return;
            }
            let pl = this.playerStatus && this.playerStatus.playlist ? this.playerStatus.playlist : {};
            let count = pl.count || 0;
            if (count<1) {
                this.npQueueItems = [];
                this.npQueueFetching = false;
                return;
            }
            let current = pl.current>=0 ? pl.current : 0;
            let qty = Math.min(count, Math.max(400, current+40));
            qty = Math.min(qty, 800);
            let start = 0;
            if (current+1>qty) {
                start = Math.max(0, current-20);
                qty = Math.min(count-start, 800);
            }
            let req = (this.npQueueReq || 0) + 1;
            this.npQueueReq = req;
            this.npQueueFetching = true;
            let tags = (typeof PQ_STATUS_TAGS==='string') ? PQ_STATUS_TAGS : "tags:cdegilqtuy";
            lmsList(this.$store.state.player.id, ["status"], [tags], start, qty).then(({data}) => {
                if (req!==this.npQueueReq) {
                    return;
                }
                let loop = data && data.result && data.result.playlist_loop ? data.result.playlist_loop : [];
                let items = [];
                for (let i=0; i<loop.length; ++i) {
                    let row = loop[i];
                    let index = undefined!=row['playlist index'] ? parseInt(row['playlist index'], 10) : (start+i);
                    let title = row.title || row.remote_title || i18n('Unknown');
                    let artist = row.artist || row.trackartist || row.albumartist || '';
                    let album = row.album || '';
                    let subtitle = artist && album ? (artist+' — '+album) : (artist || album);
                    let dur = undefined==row.duration ? 0 : parseFloat(row.duration);
                    let image = '';
                    if (typeof queueItemCover==='function') {
                        image = queueItemCover(row);
                    } else if (undefined!=row.coverid) {
                        image = '/music/'+row.coverid+'/cover'+LMS_LIST_IMAGE_SIZE;
                    }
                    items.push({
                        index: index,
                        title: title,
                        subtitle: subtitle,
                        durationStr: dur>0 && typeof formatSeconds==='function' ? formatSeconds(dur) : '',
                        image: image
                    });
                }
                this.npQueueItems = items;
                this.npQueueFetching = false;
                if (scrollToCurrent) {
                    this.$nextTick(function() {
                        let el = document.querySelector('#np-page .swiper-slide-active .np-queue-row.pq-current');
                        if (el && el.scrollIntoView) {
                            el.scrollIntoView({block:'center'});
                        }
                    });
                }
            }).catch(err => {
                if (req===this.npQueueReq) {
                    this.npQueueFetching = false;
                }
                logError(err);
            });
        },
        npQueuePlay(index) {
            if (queryParams.party || index<0) {
                return;
            }
            bus.$emit('playerCommand', ['playlist', 'index', index]);
        },
        npQueueVm() {
            let el = document.getElementById('queue-view');
            return el && el.__vue__ ? el.__vue__ : null;
        },
        npQueueActions(event) {
            let q = this.npQueueVm();
            if (q && q.actionsMenu) {
                q.actionsMenu(event);
            }
        },
        npQueueSave() {
            let q = this.npQueueVm();
            if (q && q.save) {
                q.save();
            }
        },
        npQueueClear(longPress) {
            let q = this.npQueueVm();
            if (q && q.clear) {
                q.clear(longPress);
            }
        },
        npQueueDurationClicked(longPress) {
            let q = this.npQueueVm();
            if (!q || !q.durationClicked) {
                return;
            }
            q.durationClicked(longPress);
            let rem = q.remaining || {};
            this.npQueueRemaining = { show:!!rem.show, size:rem.size||0, duration:rem.duration||0 };
            if (this._npQueueRemTimer) {
                clearTimeout(this._npQueueRemTimer);
                this._npQueueRemTimer = undefined;
            }
            if (this.npQueueRemaining.show) {
                this._npQueueRemTimer = setTimeout(function() {
                    this.npQueueRemaining = { show:false, size:0, duration:0 };
                    this._npQueueRemTimer = undefined;
                }.bind(this), 2000);
            }
        },
        npArtistThumbError() {
            this.npArtistThumbBroken = this.npArtistThumb || '';
        },
        /**
         * Ensure MAI for a specific card slide (used on swipe as a safety net if
         * prefetch was skipped or track changed mid-flight).
         */
        fetchMobileInfoCardForSlide(slide) {
            if (!this.showMobileInfoCard || !this.infoTrack) {
                return;
            }
            if (slide===NP_CARD_SLIDE_QUEUE) {
                this.fetchNpQueue(true);
                return;
            }
            if (NP_LYRICS_SLIDE_ENABLED && slide===NP_CARD_SLIDE_LYRICS) {
                this.fetchTrackInfo();
                this.scheduleLyricsPositionUpdate(50);
                return;
            }
            if (slide===NP_CARD_SLIDE_ARTIST) {
                this.fetchArtistInfo();
                return;
            }
            if (slide===NP_CARD_SLIDE_ALBUM) {
                this.fetchAlbumInfo();
                return;
            }
        },
        ensureMobileInfoCardData() {
            if (!this.showMobileInfoCard) {
                return;
            }
            // Opening card: park on NP. Don't yank swiper mid-swipe on every metadata tick
            // (Radio Paradise re-sends status often and was leaving the view "midway").
            let opening = this.npMainSlide!==NP_CARD_SLIDE_NP && !this._npCardUserSwiped;
            if (opening || !this._npCardDataReady) {
                this.npMainSlide = NP_CARD_SLIDE_NP;
                this.clearMaiArtistPalette();
            }
            this.setInfoTrack();
            // Prefetch lyrics + artist + album while user is still on the NP slide
            this.showInfo();
            // Radio art changes: never leave a stale previous layer
            if (this.npIsRadio && !this.coverFading) {
                this.prevCoverUrl = undefined;
            }
            this.bumpCoverRender();
            this._npCardDataReady = true;
            this.fetchNpQueue(false);
            this.$nextTick(function() {
                if (opening || this.npMainSlide===NP_CARD_SLIDE_NP) {
                    this.syncNpMainSwiperToSlide();
                    this.repairNpCoverInActiveSlide();
                }
                if (this.npMainSlide===NP_CARD_SLIDE_ARTIST) {
                    this.refreshMaiArtistPalette();
                }
                if (NP_LYRICS_SLIDE_ENABLED && this.npMainSlide===NP_CARD_SLIDE_LYRICS) {
                    this.scheduleLyricsPositionUpdate(120);
                }
            }.bind(this));
        },
        /** Force cover <img> re-bind after Swiper loop clones drop Vue bindings. */
        bumpCoverRender() {
            this.coverRenderKey = (this.coverRenderKey || 0) + 1;
        },
        /** After loop wrap, clones can show empty art — re-stamp src on the active NP slide. */
        repairNpCoverInActiveSlide() {
            if (!this.showMobileInfoCard || this.npMainSlide!==NP_CARD_SLIDE_NP) {
                return;
            }
            let url = this.coverUrl || DEFAULT_COVER;
            try {
                let nodes = document.querySelectorAll('#np-page .np-main-slide-np .np-cover-current, #np-page .swiper-slide-active .np-cover-current');
                for (let i=0; i<nodes.length; ++i) {
                    if (nodes[i] && nodes[i].getAttribute('src')!==url) {
                        nodes[i].setAttribute('src', url);
                    }
                }
            } catch (e) {}
        },
        expandNpLyrics() {
            if (this.npDetailsScroll) {
                this.openNpDetail('lyrics');
                return;
            }
            if (NP_LYRICS_SLIDE_ENABLED) {
                this.goToNpMainSlide(NP_CARD_SLIDE_LYRICS);
            }
        },
        npDetailPlain(html) {
            if (undefined==html || null==html) {
                return '';
            }
            let t = String(html).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{2,}/g, '\n').replace(/[ \t]{2,}/g, ' ').trim();
            if (!t || t===i18n('Fetching...')) {
                return '';
            }
            return t;
        },
        npDetailHasSections(tab) {
            let sections = tab && tab.sections;
            if (!sections || !sections.length) {
                return false;
            }
            for (let i=0, len=sections.length; i<len; ++i) {
                let sect = sections[i];
                if (!sect) {
                    continue;
                }
                if (sect.html) {
                    return true;
                }
                if (sect.items && sect.items.length && sect.items.length>=(sect.min||0)) {
                    return true;
                }
            }
            return false;
        },
        openNpDetail(which) {
            if (!which) {
                return;
            }
            if (which==='lyrics') {
                this.fetchTrackInfo();
            } else if (which==='artist') {
                this.fetchArtistInfo();
            } else if (which==='album') {
                this.fetchAlbumInfo();
            }
            this.npDetailExpand = which;
            if (which==='lyrics') {
                this.resetLyricsTracking();
                this.scheduleLyricsPositionUpdate(80);
            }
            this.$nextTick(function() { this.syncNpDetailSwipeLock(); }.bind(this));
        },
        closeNpDetail() {
            this.npDetailExpand = null;
            this.$nextTick(function() { this.syncNpDetailSwipeLock(); }.bind(this));
        },
        npDetailItemClicked(tab, sindex, iindex, event) {
            this.npDetailExpand = null;
            this.itemClicked(tab, sindex, iindex, event);
        },
        syncNpDetailSwipeLock() {
            let swiper = this.getNpMainSwiper();
            if (!swiper) {
                return;
            }
            if (!this.npDetailsScroll) {
                swiper.allowSlideNext = true;
                swiper.allowSlidePrev = true;
                return;
            }
            if (this.npDetailExpand) {
                swiper.allowSlideNext = false;
                swiper.allowSlidePrev = false;
                return;
            }
            let idx = this.npMainSlide;
            swiper.allowSlidePrev = idx!==NP_CARD_SLIDE_QUEUE;
            swiper.allowSlideNext = idx!==NP_CARD_SLIDE_NP;
        },
        collapseNpLyrics() {
            this.goToNpMainSlide(NP_CARD_SLIDE_NP);
        },
        npHandleTouchStart(ev) {
            if (!ev || !ev.touches || !ev.touches[0]) {
                return;
            }
            this.npHandleTouch = undefined;
            this.npPageTouch = {
                x: ev.touches[0].clientX,
                y: ev.touches[0].clientY,
                zone: 'handle',
                fromHandle: true
            };
        },
        npHandleTouchMove(ev) {
            if (ev.cancelable) {
                try { ev.preventDefault(); } catch (e) {}
            }
            this.npPageTouchMove(ev);
        },
        npHandleTouchEnd(ev) {
            this.npHandleTouch = undefined;
            this.npPageTouchEnd(ev);
        },
        npCardSlideIndexForTab(tab) {
            if (TRACK_TAB==tab) {
                return NP_LYRICS_SLIDE_ENABLED ? NP_CARD_SLIDE_LYRICS : NP_CARD_SLIDE_NP;
            }
            if (ARTIST_TAB==tab) {
                return NP_CARD_SLIDE_ARTIST;
            }
            if (ALBUM_TAB==tab) {
                return NP_CARD_SLIDE_ALBUM;
            }
            return NP_CARD_SLIDE_NP;
        },
        npCardTabForSlideIndex(idx) {
            if (NP_LYRICS_SLIDE_ENABLED && idx===NP_CARD_SLIDE_LYRICS) {
                return TRACK_TAB;
            }
            if (idx===NP_CARD_SLIDE_ARTIST) {
                return ARTIST_TAB;
            }
            if (idx===NP_CARD_SLIDE_ALBUM) {
                return ALBUM_TAB;
            }
            return null;
        },
        getNpMainSwiper() {
            let ref = this.$refs.npMainSwiper;
            if (!ref) {
                return undefined;
            }
            return ref.$swiper || ref.swiperInstance || ref.swiper;
        },
        npMainSlideRealIndex(swiper) {
            if (!swiper) {
                return undefined==this.npMainSlide ? NP_CARD_SLIDE_NP : this.npMainSlide;
            }
            if (typeof swiper.realIndex==='number') {
                return swiper.realIndex;
            }
            return swiper.activeIndex || 0;
        },
        goToNpMainSlide(idx, speed) {
            if (!this.showMobileInfoCard) {
                return;
            }
            if (idx===NP_CARD_SLIDE_LYRICS && !NP_LYRICS_SLIDE_ENABLED) {
                return;
            }
            idx = Math.max(0, Math.min(NP_CARD_SLIDE_COUNT - 1, idx|0));
            this.npMainSlide = idx;
            let swiper = this.getNpMainSwiper();
            if (!swiper || typeof swiper.slideTo!=='function') {
                return;
            }
            let current = (typeof swiper.activeIndex==='number') ? swiper.activeIndex : 0;
            if (current===idx && !swiper.animating) {
                return;
            }
            let ms = undefined==speed ? 300 : speed;
            this._npCardProg = true;
            swiper.slideTo(idx, ms);
            if (!ms) {
                this._npCardProg = false;
            }
            if (NP_LYRICS_SLIDE_ENABLED && idx===NP_CARD_SLIDE_LYRICS) {
                this.scheduleLyricsPositionUpdate(120);
            }
        },
        onNpMainSwiperReady() {
            this.syncNpMainSwiperToSlide();
            this.syncNpDetailSwipeLock();
        },
        onNpMainSlideChange() {
            let swiper = this.getNpMainSwiper();
            if (!swiper) {
                return;
            }
            if (this._npCardProg) {
                this._npCardProg = false;
                this.syncNpDetailSwipeLock();
                return;
            }
            // activeIndex, not realIndex. Loop clones made realIndex land on the wrong card.
            let idx = (typeof swiper.activeIndex==='number') ? swiper.activeIndex : this.npMainSlideRealIndex(swiper);
            this._npCardUserSwiped = true;
            if (idx===NP_CARD_SLIDE_LYRICS || idx===NP_CARD_SLIDE_ARTIST || idx===NP_CARD_SLIDE_ALBUM) {
                this.npCardHeavyReady = true;
            }
            this.npMainSlide = idx;
            if (this.npDetailExpand && idx!==NP_CARD_SLIDE_NP) {
                this.npDetailExpand = null;
            }
            if (this.npDetailsScroll && idx!==NP_CARD_SLIDE_QUEUE && idx!==NP_CARD_SLIDE_NP) {
                this.goToNpMainSlide(NP_CARD_SLIDE_NP, 0);
                return;
            }
            this.syncNpDetailSwipeLock();
            this.npCardEdgeTopOpacity = 0;
            this.npLyricsEdgeTopOpacity = 0;
            let tab = this.npCardTabForSlideIndex(idx);

            // Always bind current track before any MAI call for this slide
            this.setInfoTrack();

            if (idx===NP_CARD_SLIDE_QUEUE) {
                this.clearMaiArtistPalette();
                this.fetchNpQueue(true);
                return;
            }
            if (idx===NP_CARD_SLIDE_NP) {
                this.clearMaiArtistPalette();
                this.$nextTick(function() {
                    this.repairNpCoverInActiveSlide();
                }.bind(this));
                return;
            }

            // Lazy-load the slide the user actually opened (artist/album/lyrics)
            this.fetchMobileInfoCardForSlide(idx);

            if (null==tab || TRACK_TAB==tab) {
                this.clearMaiArtistPalette();
                this.$nextTick(function() {
                    this.repairNpCoverInActiveSlide();
                }.bind(this));
                return;
            }

            if (this.info.tab!==tab) {
                this.npMainSlideSyncing = true;
                this.info.tab = tab;
                this.tabChanged(tab);
                this.$nextTick(function() {
                    this.npMainSlideSyncing = false;
                    if (ARTIST_TAB==tab) {
                        this.refreshMaiArtistPalette();
                    }
                }.bind(this));
            } else if (ARTIST_TAB==tab) {
                this.$nextTick(function() {
                    this.refreshMaiArtistPalette();
                }.bind(this));
            }
        },
        onNpMainSlideTransitionEnd() {
            // Loop jumps can leave empty clones; re-bind cover when we settle on NP
            if (this.npMainSlide===NP_CARD_SLIDE_NP) {
                this.repairNpCoverInActiveSlide();
                this.clearMaiArtistPalette();
            }
        },
        syncNpMainSwiperToSlide() {
            if (this.npMainSlideSyncing || !this.showMobileInfoCard) {
                return;
            }
            let swiper = this.getNpMainSwiper();
            if (!swiper) {
                return;
            }
            if (swiper.animating) {
                return;
            }
            let idx = this.npMainSlide;
            let real = (typeof swiper.activeIndex==='number') ? swiper.activeIndex : this.npMainSlideRealIndex(swiper);
            if (real!==idx && typeof swiper.slideTo==='function') {
                this._npCardProg = true;
                swiper.slideTo(idx, 0);
                this._npCardProg = false;
            }
        },
        // Legacy aliases used by older call sites
        getNpInfoSwiper() {
            return this.getNpMainSwiper();
        },
        syncNpInfoSwiperToTab() {
            this.syncNpMainSwiperToSlide();
        },
        close() {
            if (this.$store.state.desktopLayout) {
                this.info.show=false;
                if (this.npSheetOpen) {
                    this.collapseNpSheetRestore();
                }
            }
        },
        startPositionInterval() {
            this.stopPositionInterval();
            // Advance local playhead for time labels / lyrics. Progress fill glides on the
            // compositor between status re-anchors (progressAnchor) — no 60fps rAF.
            let tickClock = function() {
                if (!this.playerStatus || !this.playerStatus.isplaying) {
                    return;
                }
                if (undefined!=this.playerStatus.current.time && this.playerStatus.current.time>=0 &&
                    this.playerStatus.current.updated) {
                    let diff = (Date.now() - this.playerStatus.current.updated.getTime()) / 1000.0;
                    if (diff < 0) { diff = 0; }
                    this.playerStatus.current.time = this.playerStatus.current.origTime + diff;
                    currentPlayingTrackPosition = this.playerStatus.current.time;
                    this.setPosition({ force: false });
                    if (this.playerStatus.current.duration && this.playerStatus.current.duration>0 &&
                        this.playerStatus.current.time>=(this.playerStatus.current.duration+2)) {
                        bus.$emit('refreshStatus');
                    }
                }
            }.bind(this);
            // Immediate re-anchor so the CSS linear run starts from true position
            this.setPosition({ force: true });
            this.positionInterval = setInterval(tickClock, 250);
        },
        stopPositionInterval() {
            if (undefined!==this.positionInterval) {
                try { clearInterval(this.positionInterval); } catch (e) {}
                try { cancelAnimationFrame(this.positionInterval); } catch (e) {}
                this.positionInterval = undefined;
            }
        },
        startLiveEdgeInterval() {
            this.stopLiveEdgeInterval();
            if (undefined!=this.playerStatus.current.liveEdge && this.playerStatus.current.bufpc<100.0) {
                this.liveEdgeInterval = setInterval(function () {
                    if (undefined!=this.playerStatus.current.liveEdge) {
                        bus.$emit('refreshStatus');
                    } else {
                        this.stopLiveEdgeInterval();
                    }
                }.bind(this), 10000);
            }
        },
        stopLiveEdgeInterval() {
            if (undefined!==this.liveEdgeInterval) {
                clearInterval(this.liveEdgeInterval);
                this.liveEdgeInterval = undefined;
            }
        },
        toggleTime() {
            if (this.$store.state.visibleMenus.size>0) {
                return;
            }
            this.showTotal = !this.showTotal;
            setLocalStorageVal("showTotal", this.showTotal);
        },
        setBgndCover() {
            var url = this.coverUrl;
            if (undefined==url || url.endsWith(DEFAULT_COVER) || url.endsWith("/music/undefined/cover")) {
                url=this.drawBackdrop || this.drawInfoBackdrop ? 'material/backdrops/nowplaying.jpg' : '';
            }
            updateBgndImage(this, url);
        },
        playPauseButton(longPress) {
            if (this.$store.state.visibleMenus.size>0) {
                return;
            }
            if (longPress) {
                this.doAction(['stop']);
                bus.$emit('showMessage', i18n('Stop'), 500);
            } else {
                this.doAction([this.playerStatus.isplaying ? 'pause' : 'play']);
            }
        },
        prevButton(skip) {
            if (this.$store.state.visibleMenus.size>0 || queryParams.party) {
                return;
            }
            let altSkip = !!(this.desktopLayout && this.npBarAltSkip);
            if (altSkip) {
                let t = this.playerStatus.current.time || 0;
                if (this.playerStatus.current.canseek && t>0) {
                    this.doAction(['time', Math.max(0, t - (this.$store.state.skipBSeconds || 10))]);
                }
                return;
            }
            if (!this.disablePrev) {
                if (skip && this.playerStatus.current.time>=this.$store.state.skipBSeconds) {
                    this.doAction(['time', this.playerStatus.current.time-this.$store.state.skipBSeconds]);
                } else if (!this.npBarSlideCommit(-1)) {
                    this.npBarPendingDir = -1;
                    this.doAction(['button', 'jump_rew']);
                }
            }
        },
        nextButton(skip) {
            if (this.$store.state.visibleMenus.size>0 || queryParams.party) {
                return;
            }
            let altSkip = !!(this.desktopLayout && this.npBarAltSkip);
            if (altSkip) {
                let t = this.playerStatus.current.time || 0;
                let dur = this.playerStatus.current.duration || 0;
                let step = this.$store.state.skipFSeconds || 30;
                if (this.playerStatus.current.canseek && dur>0) {
                    let nt = Math.min(Math.max(0, dur - 0.25), t + step);
                    if (nt > t + 0.2) {
                        this.doAction(['time', nt]);
                    }
                }
                return;
            }
            if (!this.disableNext) {
                if (skip && (this.playerStatus.current.time+this.$store.state.skipFSeconds)<this.playerStatus.current.duration) {
                    this.doAction(['time', this.playerStatus.current.time+this.$store.state.skipFSeconds]);
                } else if (!this.npBarSlideCommit(1)) {
                    this.npBarPendingDir = 1;
                    this.doAction(['playlist', 'index', '+1']);
                }
            }
        },
        npBarShownTitle() {
            return this.playerStatus.current.title ? this.title : '';
        },
        npBarShownSubtitle() {
            return this.npBarSubtitleDisplay || '';
        },
        /* Medium and large mobile bars. The thin bar keeps the short fade. */
        npBarMobileTwoLine() {
            return !this.desktopLayout && MBAR_NONE!=this.mobileBar && MBAR_THIN!=this.mobileBar;
        },
        /* Same track film as the two-line mobile bar: both text lines and the cover. */
        npBarTrackSlide() {
            return !!this.desktopLayout || this.npBarMobileTwoLine();
        },
        npBarRef(name) {
            let el = this.$refs[name];
            return Array.isArray(el) ? el[0] : (el || null);
        },
        npBarSetX(el, px) {
            if (!el) {
                return;
            }
            let t = 'translate3d(' + px + 'px,0,0)';
            el.style.transform = t;
            el.style.webkitTransform = t;
        },
        npBarPlainText(s) {
            if (null==s || ''===s) {
                return '';
            }
            let d = document.createElement('div');
            d.innerHTML = String(s);
            return (d.textContent || '').replace(/\s+/g, ' ').trim();
        },
        npBarQueueItem(index) {
            if (index<0) {
                return null;
            }
            let q = this.npQueueVm();
            if (q && q.items && index<q.items.length && q.items[index] && (q.items[index].title || q.items[index].tooltip || q.items[index].image)) {
                return q.items[index];
            }
            if (this.npQueueItems && this.npQueueItems.length) {
                for (let i=0; i<this.npQueueItems.length; ++i) {
                    if (this.npQueueItems[i].index===index) {
                        return this.npQueueItems[i];
                    }
                }
            }
            return null;
        },
        npBarItemLines(item) {
            if (!item) {
                return null;
            }
            if (undefined!=item.index && undefined!=item.subtitle && undefined==item.tooltip) {
                return { title: item.title || '', subtitle: item.subtitle || '', image: item.image || '' };
            }
            let title = this.npBarPlainText(item.tooltip || item.title);
            let artist = this.npBarPlainText(item.artist || '');
            let album = this.npBarPlainText(item.album || '');
            let sub = artist && album ? (artist + SEPARATOR + album) : (artist || album);
            if (!sub && item.artistAlbum) {
                sub = this.npBarPlainText(item.artistAlbum);
            }
            return { title: title, subtitle: sub || '', image: item.image || '' };
        },
        npBarCoverKey(url) {
            if (!url) {
                return '';
            }
            let path = String(url).split('?')[0];
            if (typeof changeImageSizing==='function') {
                path = changeImageSizing(path, '') || path;
            }
            return path;
        },
        npBarCoverSameArt(a, b) {
            if (!a || !b) {
                return false;
            }
            if (a===b) {
                return true;
            }
            let ka = this.npBarCoverKey(a);
            let kb = this.npBarCoverKey(b);
            return !!ka && ka===kb;
        },
        npBarFindDecoded(url) {
            if (!url) {
                return '';
            }
            let key = this.npBarCoverKey(url);
            let nodes = [];
            let cur = document.querySelector('#np-bar .np-cover-current');
            if (cur) {
                nodes.push(cur);
            }
            let hidden = document.getElementById('current-cover');
            if (hidden) {
                nodes.push(hidden);
            }
            let center = this.playerStatus && this.playerStatus.playlist ? (this.playerStatus.playlist.current || 0) : 0;
            let q = this.npQueueVm();
            let count = q && q.items ? q.items.length : 0;
            for (let i=Math.max(0, center-3); i<Math.min(count, center+4); ++i) {
                let row = document.getElementById('pqitem'+i);
                if (!row) {
                    continue;
                }
                let img = row.querySelector('img');
                if (img) {
                    nodes.push(img);
                }
            }
            let same = '';
            for (let n=0; n<nodes.length; ++n) {
                let img = nodes[n];
                if (!img.complete || img.naturalWidth<2) {
                    continue;
                }
                let src = img.currentSrc || img.src || '';
                if (!src) {
                    continue;
                }
                if (src===url) {
                    return src;
                }
                if (key && this.npBarCoverKey(src)===key) {
                    same = src;
                }
            }
            return same;
        },
        npBarReadyImage(url, index) {
            if (index>=0) {
                let row = document.getElementById('pqitem'+index);
                if (row) {
                    let img = row.querySelector('img');
                    if (img && img.complete && img.naturalWidth>1) {
                        let src = img.currentSrc || img.src || '';
                        if (src && this.npBarCoverSameArt(src, url)) {
                            return src;
                        }
                    }
                }
            }
            let decoded = this.npBarFindDecoded(url);
            if (decoded) {
                return decoded;
            }
            return url || '';
        },
        npBarDisplayCoverAt(index) {
            let item = this.npBarQueueItem(index);
            if (!item || !item.image) {
                return '';
            }
            return this.npBarReadyImage(item.image, index) || item.image;
        },
        npBarDisplayCoverForUrl(url) {
            if (!url || !this.playerStatus || !this.playerStatus.playlist) {
                return '';
            }
            let cur = this.playerStatus.playlist.current || 0;
            let indexes = [cur, cur+1, cur-1];
            for (let i=0; i<indexes.length; ++i) {
                let idx = indexes[i];
                if (idx<0) {
                    continue;
                }
                let item = this.npBarQueueItem(idx);
                if (item && item.image && this.npBarCoverSameArt(item.image, url)) {
                    return this.npBarReadyImage(item.image, idx) || item.image;
                }
            }
            return this.npBarFindDecoded(url) || '';
        },
        npBarCanSkip(dir) {
            return dir>0 ? !this.disableNext : !this.disablePrev;
        },
        npBarNeighborIndex(dir) {
            let count = this.playerStatus.playlist.count || 0;
            if (count<1 || !this.npBarCanSkip(dir)) {
                return -1;
            }
            let cur = this.playerStatus.playlist.current || 0;
            let idx = cur + dir;
            if (idx<0) {
                return (2===this.playerStatus.playlist.repeat && count>1) ? (count-1) : -1;
            }
            if (idx>=count) {
                return (2===this.playerStatus.playlist.repeat && count>1) ? 0 : -1;
            }
            return idx;
        },
        npBarSlideMeasure() {
            let rest = this.npBarRef('npBarRest');
            if (rest && rest.offsetWidth>24) {
                return rest.offsetWidth;
            }
            let host = this.npBarRef('npBarTitleMarquee');
            if (host && host.offsetWidth>24) {
                return host.offsetWidth;
            }
            return 160;
        },
        npBarCoverMeasure() {
            let box = document.querySelector('#np-bar .np-bar-image');
            if (box && box.clientWidth>8) {
                return box.clientWidth;
            }
            return 56;
        },
        npBarSlideMark() {
            let bar = document.getElementById('np-bar');
            if (bar) {
                bar.classList.add('np-bar-sliding');
            }
        },
        npBarSlideResetTransforms() {
            let names = ['npBarRest', 'npBarSlideIn', 'npBarCoverCur', 'npBarCoverNxt'];
            for (let i=0; i<names.length; ++i) {
                let el = this.npBarRef(names[i]);
                if (!el) {
                    continue;
                }
                el.style.transform = '';
                el.style.webkitTransform = '';
            }
        },
        npBarSlideClear() {
            if (this._npSlideRaf) {
                cancelAnimationFrame(this._npSlideRaf);
                this._npSlideRaf = 0;
            }
            if (this._npSlideHoldTimer) {
                clearTimeout(this._npSlideHoldTimer);
                this._npSlideHoldTimer = undefined;
            }
            this._npSlideAnim = false;
            this._npSlideActive = false;
            this._npSlideDir = 0;
            this._npSlideDx = 0;
            this._npSlideArmedDir = 0;
            this._npSlideFromTouch = false;
            this._npBarSlideHold = false;
            this._npWheelSlide = 0;
            let bar = document.getElementById('np-bar');
            if (bar) {
                bar.classList.remove('np-bar-sliding');
            }
            this.npBarSlideResetTransforms();
            this.npBarSlideLive = false;
            this.npBarSlideCoverSrc = '';
            this.npBarSlideNxtTitle = '';
            this.npBarSlideNxtSub = '';
        },
        npBarSlideReleaseToRest() {
            if (this._npSlideHoldTimer) {
                clearTimeout(this._npSlideHoldTimer);
                this._npSlideHoldTimer = undefined;
            }
            let shown = this.npBarSlideCoverSrc;
            let pending = (shown && !this.isPlaceholderCover(shown)) ? shown : (this._npBarSlidePendingCover || shown);
            this._npBarSlidePendingCover = undefined;
            if (pending && !this.npBarCoverSameArt(pending, this.coverUrl)) {
                this._npBarAssignUrl = pending;
                this.coverFading = false;
                this.prevCoverUrl = undefined;
                this.coverUrl = pending;
            }
            this.$nextTick(function() {
                this.npBarSlideClear();
                this.scheduleNpBarMarquee();
            }.bind(this));
        },
        npBarArmNeighbor(dir) {
            if (this._npSlideArmedDir===dir && this.npBarSlideLive) {
                return;
            }
            this._npSlideArmedDir = dir;
            let idx = this.npBarNeighborIndex(dir);
            let lines = idx<0 ? null : this.npBarItemLines(this.npBarQueueItem(idx));
            if (!lines || (!lines.title && !lines.subtitle && !lines.image)) {
                this.npBarSlideLive = false;
                this.npBarSlideCoverSrc = '';
                this.npBarSlideNxtTitle = '';
                this.npBarSlideNxtSub = '';
                return;
            }
            this.npBarSlideNxtTitle = lines.title;
            this.npBarSlideNxtSub = lines.subtitle;
            this.npBarSlideCoverSrc = lines.image ? (this.npBarReadyImage(lines.image, idx) || lines.image) : '';
            this.npBarSlideLive = true;
            this.$nextTick(function() {
                if (this._npSlideActive || this._npSlideAnim) {
                    this.paintNpBarSlide(this._npSlideDx || 0);
                }
            }.bind(this));
        },
        paintNpBarSlide(dx) {
            let w = this._npSlideW || this.npBarSlideMeasure();
            this._npSlideW = w;
            let cw = this._npSlideCoverW || this.npBarCoverMeasure();
            this._npSlideCoverW = cw;
            let x = dx;
            if (!this.npBarCanSkip(1) && x<0) {
                x = x * 0.28;
            }
            if (!this.npBarCanSkip(-1) && x>0) {
                x = x * 0.28;
            }
            if (x<-w) {
                x = -w;
            }
            if (x>w) {
                x = w;
            }
            this._npSlideDx = x;
            this.npBarSetX(this.npBarRef('npBarRest'), x);
            if (this.npBarSlideLive) {
                let origin = this._npSlideDir<0 ? -w : w;
                this.npBarSetX(this.npBarRef('npBarSlideIn'), origin + x);
            }
            let p = w>0 ? (x / w) : 0;
            let cx = p * cw;
            this.npBarSetX(this.npBarRef('npBarCoverCur'), cx);
            if (this.npBarSlideCoverSrc) {
                let originC = this._npSlideDir<0 ? -cw : cw;
                this.npBarSetX(this.npBarRef('npBarCoverNxt'), originC + cx);
            }
        },
        npBarSlideAnimate(from, to, done) {
            if (this._npSlideRaf) {
                cancelAnimationFrame(this._npSlideRaf);
                this._npSlideRaf = 0;
            }
            let reduce = false;
            try {
                reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            } catch (e) {}
            if (reduce || Math.abs(to-from)<1) {
                this.paintNpBarSlide(to);
                this._npSlideAnim = false;
                if (done) {
                    done();
                }
                return;
            }
            let start = performance.now();
            let dur = 240;
            let step = function(now) {
                let t = Math.min(1, (now-start)/dur);
                let e = 1 - Math.pow(1-t, 3);
                this.paintNpBarSlide(from + (to-from)*e);
                if (t<1) {
                    this._npSlideRaf = requestAnimationFrame(step);
                } else {
                    this._npSlideRaf = 0;
                    this._npSlideAnim = false;
                    if (done) {
                        done();
                    }
                }
            }.bind(this);
            this._npSlideAnim = true;
            this._npSlideRaf = requestAnimationFrame(step);
        },
        npBarSlideSend(dir) {
            this._npBarSlideHold = true;
            this._npSlideActive = false;
            this.npBarPendingDir = dir;
            this._npBarSwipeAt = Date.now();
            this._npBarSwipeDir = dir>0 ? 'left' : 'right';
            if (dir>0) {
                this.doAction(['playlist', 'index', '+1']);
            } else {
                this.doAction(['button', 'jump_rew']);
            }
            if (this._npSlideHoldTimer) {
                clearTimeout(this._npSlideHoldTimer);
            }
            this._npSlideHoldTimer = setTimeout(function() {
                this._npSlideHoldTimer = undefined;
                if (this._npBarSlideHold) {
                    this.npBarSlideReleaseToRest();
                }
            }.bind(this), 1600);
        },
        npBarSlideCommit(dir) {
            if (!this.npBarTrackSlide()) {
                return false;
            }
            if (this._npBarSlideHold || this._npSlideAnim) {
                return true;
            }
            /* Mobile sheet owns the bar. Desktop keeps the film while the player is open. */
            if (!this.desktopLayout && (this.npSheetOpen || this.$store.state.npSheetOpen)) {
                return false;
            }
            if (!this.npBarCanSkip(dir)) {
                return false;
            }
            let idx = this.npBarNeighborIndex(dir);
            let lines = idx<0 ? null : this.npBarItemLines(this.npBarQueueItem(idx));
            if (!lines || (!lines.title && !lines.subtitle && !lines.image)) {
                return false;
            }
            this.resetNpBarMarqueeForMorph();
            this._npSlideW = this.npBarSlideMeasure();
            this._npSlideCoverW = this.npBarCoverMeasure();
            this._npSlideDir = dir;
            this._npSlideDx = 0;
            this._npSlideActive = true;
            this.npBarSlideMark();
            this.npBarArmNeighbor(dir);
            let target = dir>0 ? -this._npSlideW : this._npSlideW;
            this.$nextTick(function() {
                if (!this._npSlideActive) {
                    return;
                }
                this.npBarSlideAnimate(0, target, function() {
                    this.npBarSlideSend(dir);
                }.bind(this));
            }.bind(this));
            return true;
        },
        npBarLiveSlide(dx) {
            if (this._npBarSlideHold || this._npSlideAnim || !this.npBarTrackSlide()) {
                return;
            }
            if (!this._npSlideActive) {
                this.resetNpBarMarqueeForMorph();
                this._npSlideW = this.npBarSlideMeasure();
                this._npSlideCoverW = this.npBarCoverMeasure();
                this._npSlideActive = true;
                this._npSlideFromTouch = true;
                this.npBarSlideMark();
            }
            if (Math.abs(dx)>10) {
                this.npBarSwipeHandled = true;
            }
            let dir = dx<-6 ? 1 : (dx>6 ? -1 : (this._npSlideDir || 0));
            if (dir && dir!==this._npSlideDir) {
                this._npSlideDir = dir;
                this.npBarArmNeighbor(dir);
            }
            this.paintNpBarSlide(dx);
        },
        npBarSlideEnd(dx, dy, moved) {
            if (!this._npSlideActive) {
                return false;
            }
            let dir = dx<0 ? 1 : -1;
            let commit = !!(moved && Math.abs(dx)>=50 && Math.abs(dx)>Math.abs(dy) && this.npBarCanSkip(dir));
            let hasVisual = !!(commit && this.npBarSlideLive && this._npSlideDir===dir);
            this.npBarSwipeHandled = Math.abs(dx)>10;
            if (commit && hasVisual) {
                let w = this._npSlideW || Math.abs(dx);
                let target = dir>0 ? -w : w;
                this.npBarSlideAnimate(this._npSlideDx || dx, target, function() {
                    this.npBarSlideSend(dir);
                }.bind(this));
                return true;
            }
            if (commit) {
                this.npBarSlideClear();
                this.npBarPendingDir = dir;
                if (dir>0) {
                    this.doAction(['playlist', 'index', '+1']);
                } else {
                    this.doAction(['button', 'jump_rew']);
                }
                return true;
            }
            this.npBarSlideAnimate(this._npSlideDx || dx, 0, function() {
                this.npBarSlideClear();
                this.scheduleNpBarMarquee();
            }.bind(this));
            return true;
        },
        npBarAssignCover(url) {
            if (!url) {
                return;
            }
            if (this._npBarAssignUrl && this.npBarCoverSameArt(this._npBarAssignUrl, url)) {
                return;
            }
            if (this.npBarCoverSameArt(url, this.coverUrl)) {
                return;
            }
            this._npBarAssignUrl = url;
            this.clearCoverFadeTimer();
            this.clearCoverPreload();
            let old = this.coverUrl || DEFAULT_COVER;
            let oldPh = this.isPlaceholderCover(old);
            let newPh = this.isPlaceholderCover(url);
            if (oldPh && newPh) {
                this.prevCoverUrl = undefined;
                this.coverFading = false;
                this.coverUrl = url;
                return;
            }
            this.prevCoverUrl = oldPh ? undefined : old;
            this.coverFading = false;
            this.$nextTick(function() {
                this.coverUrl = url;
                this.$nextTick(function() {
                    this.coverFading = true;
                    this.coverFadeTimer = setTimeout(function() {
                        this.prevCoverUrl = undefined;
                        this.coverFading = false;
                        this.coverFadeTimer = undefined;
                        this.coverFadeDir = 1;
                        this._npBarAssignUrl = undefined;
                    }.bind(this), 340);
                }.bind(this));
            }.bind(this));
        },
        startNpBarTextMorph(direction, outTitle, outSubtitle, outMobile) {
            if (this._npBarSlideHold) {
                this.npBarSlideReleaseToRest();
                return;
            }
            if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                return;
            }
            if (undefined!=this.npBarMorphTimer) {
                clearTimeout(this.npBarMorphTimer);
                this.npBarMorphTimer = undefined;
            }
            let inTitle = this.npBarShownTitle();
            let inSubtitle = this.npBarShownSubtitle();
            let inMobile = this.mobileBarText;
            if (outTitle==inTitle && outSubtitle==inSubtitle && outMobile==inMobile) {
                return;
            }
            // Park marquees at rest so outgoing + incoming lines share a flush left edge
            // before the slide (otherwise mid-scroll text looks misaligned on the way in).
            this.resetNpBarMarqueeForMorph();
            // Remember track direction for cover swipe cross-fade
            this.coverFadeDir = direction>0 ? 1 : -1;
            this.npBarMorph = {
                active: true,
                direction: direction,
                outTitle: outTitle,
                outSubtitle: outSubtitle,
                outMobile: outMobile,
                inTitle: inTitle,
                inSubtitle: inSubtitle,
                inMobile: inMobile
            };
            if (this.npBarTrackSlide()) {
                let mem = this.npBarDisplayCoverAt(this.playerStatus.playlist.current);
                if (mem) {
                    this.npBarAssignCover(mem);
                }
            }
            this.npBarMorphTimer = setTimeout(function() {
                this.npBarMorph.active = false;
                this.npBarMorphTimer = undefined;
                this.scheduleNpBarMarquee();
            }.bind(this), 320);
        },
        npBarMarqueeStop(track) {
            if (!track) {
                return;
            }
            if (track._npMarqueeAnim) {
                try { track._npMarqueeAnim.cancel(); } catch (e) {}
                track._npMarqueeAnim = undefined;
            }
            track._npMarqueeShift = 0;
            track._npMarqueeDur = 0;
        },
        /** Stop marquee animations and snap tracks to translateX(0) / no pad. */
        resetNpBarMarqueeForMorph() {
            let hosts = [
                this.$refs.npBarTitleMarquee,
                this.$refs.npBarSubMarquee,
                this.$refs.npBarMobileMarquee
            ];
            for (let h=0; h<hosts.length; ++h) {
                let host = Array.isArray(hosts[h]) ? hosts[h][0] : hosts[h];
                if (!host) { continue; }
                host.classList.remove('np-bar-marquee-active');
                host.classList.remove('np-bar-marquee-flat');
                host.classList.remove('np-bar-marquee-align-left');
                host._npMarqueeSig = '';
                host._npMarqueeMeasured = undefined;
                host.style.removeProperty('--np-bar-marquee-shift');
                host.style.removeProperty('--np-bar-marquee-duration');
                let track = host.querySelector('.np-bar-marquee-track');
                if (!track) { continue; }
                this.npBarMarqueeStop(track);
                track.style.animation = 'none';
                track.style.transform = 'translate3d(0,0,0)';
                track.style.paddingLeft = '0';
                track.style.paddingRight = '0';
                track.style.removeProperty('--np-bar-marquee-shift');
                track.style.removeProperty('--np-bar-marquee-duration');
            }
        },
        scheduleNpBarMarquee() {
            this.scheduleNpBarNavLayout();
            if (undefined!=this.npBarMarqueeTimer) {
                clearTimeout(this.npBarMarqueeTimer);
            }
            this.npBarMarqueeTimer = setTimeout(function() {
                this.npBarMarqueeTimer = undefined;
                this.updateNpBarMarquee();
            }.bind(this), 60);
        },
        scheduleNpBarNavLayout() {
            if (undefined!=this.npBarNavLayoutTimer) {
                clearTimeout(this.npBarNavLayoutTimer);
            }
            this.npBarNavLayoutTimer = setTimeout(function() {
                this.npBarNavLayoutTimer = undefined;
                this.updateNpBarNavLayout();
            }.bind(this), 16);
        },
        updateNpBarNavLayout() {
            if (this.desktopLayout || MBAR_REP_NAV!=this.mobileBar) {
                return;
            }
            let bar = document.getElementById('np-bar');
            if (!bar) {
                return;
            }
            let btns = [bar.querySelector('.np-playpause'), bar.querySelector('.np-changepage')];
            let barRect = bar.getBoundingClientRect();
            let clusterLeft = barRect.right;
            let anyBtn = false;
            for (let i=0, len=btns.length; i<len; ++i) {
                let btn = btns[i];
                if (!btn) {
                    continue;
                }
                let cs = window.getComputedStyle(btn);
                if ('none'==cs.display || 'hidden'==cs.visibility) {
                    continue;
                }
                let r = btn.getBoundingClientRect();
                if (r.width<4 || r.height<4) {
                    continue;
                }
                anyBtn = true;
                clusterLeft = Math.min(clusterLeft, r.left);
            }
            if (!anyBtn) {
                bar.style.removeProperty('--np-bar-nav-reserve');
                bar.style.removeProperty('--np-bar-nav-right-fade');
                return;
            }
            // Details use right:reserve — keep a small gap so text reaches the controls
            // without sitting under them; fade is only a soft edge, not a second dead zone.
            let reserve = Math.max(48, Math.ceil(barRect.right - clusterLeft) + 4);
            let fade = Math.min(10, Math.max(5, Math.round(reserve * 0.08)));
            let reserveStr = reserve + 'px';
            let fadeStr = fade + 'px';
            if (bar.style.getPropertyValue('--np-bar-nav-reserve')===reserveStr
                && bar.style.getPropertyValue('--np-bar-nav-right-fade')===fadeStr) {
                return;
            }
            bar.style.setProperty('--np-bar-nav-reserve', reserveStr);
            bar.style.setProperty('--np-bar-nav-right-fade', fadeStr);
            // Remeasure marquees after width change so scroll distance matches full span
            this.$nextTick(function() {
                this.updateNpBarMarquee();
            }.bind(this));
        },
        updateNpBarMarquee() {
            if ((this.npBarMorph && this.npBarMorph.active) || this._npSlideActive || this._npSlideAnim || this._npBarSlideHold) {
                return;
            }
            // Must match --np-bar-marquee-fade in style.css (thin edge only)
            let fadePx = 5;
            let reduceMotion = false;
            try {
                reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            } catch (e) {}
            let titleHost = Array.isArray(this.$refs.npBarTitleMarquee) ? this.$refs.npBarTitleMarquee[0] : this.$refs.npBarTitleMarquee;
            let subHost = Array.isArray(this.$refs.npBarSubMarquee) ? this.$refs.npBarSubMarquee[0] : this.$refs.npBarSubMarquee;
            let mobileHost = Array.isArray(this.$refs.npBarMobileMarquee) ? this.$refs.npBarMobileMarquee[0] : this.$refs.npBarMobileMarquee;
            let pair = [];
            let titleM = this.measureNpBarMarquee(titleHost, fadePx);
            let subM = this.measureNpBarMarquee(subHost, fadePx);
            if (titleM) { pair.push(titleM); }
            if (subM) { pair.push(subM); }
            let maxOverflow = 0;
            for (let i=0; i<pair.length; ++i) {
                if (pair[i].overflow > maxOverflow) {
                    maxOverflow = pair[i].overflow;
                }
            }
            // Constant scroll speed. Keyframes spend ~32% of the cycle moving one way,
            // so duration grows with overflow — a hard cap made long titles faster.
            let sharedDuration = 0;
            if (maxOverflow > 2 && !reduceMotion) {
                let pxPerSec = 16;
                let oneWay = maxOverflow / pxPerSec;
                sharedDuration = Math.round((oneWay / 0.32) * 10) / 10;
            }
            for (let i=0; i<pair.length; ++i) {
                this.applyNpBarMarqueeMeasured(pair[i], sharedDuration, reduceMotion, fadePx);
            }
            let mobileM = this.measureNpBarMarquee(mobileHost, fadePx);
            if (mobileM) {
                let mobDur = 0;
                if (mobileM.overflow > 2 && !reduceMotion) {
                    let oneWay = mobileM.overflow / 16;
                    mobDur = Math.round((oneWay / 0.32) * 10) / 10;
                }
                this.applyNpBarMarqueeMeasured(mobileM, mobDur, reduceMotion, fadePx);
            }
        },
        /**
         * Measure natural text width without stopping a running marquee animation
         * (restarts looked like "overflow scroll is off").
         */
        measureNpBarMarquee(host, fadePx) {
            if (!host) {
                return undefined;
            }
            let track = host.querySelector('.np-bar-marquee-track');
            if (!track) {
                return undefined;
            }
            let hostW = host.clientWidth || 0;
            let sig = hostW + '\n' + (track.textContent || '');
            if (hostW>0 && host._npMarqueeSig===sig && host._npMarqueeMeasured) {
                return host._npMarqueeMeasured;
            }
            if (!(hostW>0)) {
                hostW = host.getBoundingClientRect().width || 0;
                sig = hostW + '\n' + (track.textContent || '');
            }
            let contentW = 0;
            // Probe clone: same text metrics, zero impact on live animation / layout
            try {
                let probe = track.cloneNode(true);
                probe.setAttribute('aria-hidden', 'true');
                probe.className = (probe.className || '') + ' np-bar-marquee-probe';
                probe.style.cssText = [
                    'position:absolute',
                    'left:0',
                    'top:0',
                    'visibility:hidden',
                    'pointer-events:none',
                    'display:inline-block',
                    'width:max-content',
                    'max-width:none',
                    'flex:0 0 auto',
                    'white-space:nowrap',
                    'padding:0',
                    'margin:0',
                    'border:0',
                    'animation:none',
                    'transform:none',
                    'will-change:auto'
                ].join(';');
                host.appendChild(probe);
                void probe.offsetWidth;
                try {
                    let range = document.createRange();
                    range.selectNodeContents(probe);
                    let rect = range.getBoundingClientRect();
                    contentW = rect && rect.width ? rect.width : 0;
                } catch (e) {
                    contentW = 0;
                }
                if (!(contentW > 0)) {
                    contentW = Math.max(probe.scrollWidth || 0, probe.offsetWidth || 0, probe.getBoundingClientRect().width || 0);
                }
                host.removeChild(probe);
            } catch (e) {
                contentW = Math.max(track.scrollWidth || 0, track.offsetWidth || 0);
            }
            let overflow = (hostW > 0) ? (contentW - hostW) : 0;
            let measured = { host: host, track: track, overflow: overflow, fadePx: fadePx, hostW: hostW, contentW: contentW };
            if (hostW>0) {
                host._npMarqueeSig = sig;
                host._npMarqueeMeasured = measured;
            }
            return measured;
        },
        /* Pixel translate3d. A CSS variable inside the keyframe transform is not
           composited on iOS, so the line stutters over the frosted bar. */
        applyNpBarMarqueeCompositor(host, track, shift, sharedDuration) {
            let running = track._npMarqueeAnim && 'running'===track._npMarqueeAnim.playState;
            if (running && track._npMarqueeShift===shift && track._npMarqueeDur===sharedDuration
                && host.classList.contains('np-bar-marquee-flat')) {
                return;
            }
            host.classList.remove('np-bar-marquee-align-left');
            host.classList.add('np-bar-marquee-active');
            host.classList.add('np-bar-marquee-flat');
            track.style.paddingLeft = '0';
            track.style.paddingRight = '0';
            track.style.animation = 'none';
            this.npBarMarqueeStop(track);
            track.style.transform = 'translate3d(0,0,0)';
            let neg = 'translate3d(' + (-shift) + 'px,0,0)';
            let rest = 'translate3d(0,0,0)';
            track._npMarqueeAnim = track.animate([
                { transform: rest, offset: 0, easing: 'linear' },
                { transform: rest, offset: 0.10, easing: 'linear' },
                { transform: neg, offset: 0.42, easing: 'linear' },
                { transform: neg, offset: 0.58, easing: 'linear' },
                { transform: rest, offset: 0.90, easing: 'linear' },
                { transform: rest, offset: 1, easing: 'linear' }
            ], {
                duration: Math.round(sharedDuration * 1000),
                iterations: Infinity
            });
            track._npMarqueeShift = shift;
            track._npMarqueeDur = sharedDuration;
        },
        applyNpBarMarqueeMeasured(measured, sharedDuration, reduceMotion, fadePx) {
            let host = measured.host;
            let track = measured.track;
            let overflow = measured.overflow;
            let fade = (undefined!=fadePx ? fadePx : measured.fadePx) || 5;
            host.classList.remove('np-bar-marquee-align-left');
            if (overflow > 2 && sharedDuration > 0 && !reduceMotion) {
                // Travel past the host + thin right fade so the last glyphs clear
                let shift = Math.ceil(overflow + fade);
                if (this.npBarTrackSlide() && track.animate) {
                    try {
                        this.applyNpBarMarqueeCompositor(host, track, shift, sharedDuration);
                        return;
                    } catch (e) {}
                }
                host.classList.remove('np-bar-marquee-flat');
                let shiftStr = (-shift) + 'px';
                let durStr = sharedDuration + 's';
                // Skip restart if already running with the same geometry (keeps scroll alive)
                let curShift = track.style.getPropertyValue('--np-bar-marquee-shift');
                let curDur = track.style.getPropertyValue('--np-bar-marquee-duration');
                let already = host.classList.contains('np-bar-marquee-active')
                    && curShift === shiftStr
                    && curDur === durStr
                    && track.style.animation && track.style.animation.indexOf('npBarMarqueeReveal')>=0;
                if (already) {
                    return;
                }
                track.style.setProperty('--np-bar-marquee-shift', shiftStr);
                track.style.setProperty('--np-bar-marquee-duration', durStr);
                host.style.setProperty('--np-bar-marquee-shift', shiftStr);
                host.style.setProperty('--np-bar-marquee-duration', durStr);
                host.classList.add('np-bar-marquee-active');
                track.style.paddingLeft = '0';
                track.style.paddingRight = '0';
                track.style.animation = 'none';
                track.style.transform = 'translateX(0)';
                void track.offsetWidth;
                track.style.animation = 'npBarMarqueeReveal ' + sharedDuration + 's infinite linear';
            } else {
                this.npBarMarqueeStop(track);
                host.classList.remove('np-bar-marquee-active');
                host.classList.remove('np-bar-marquee-flat');
                track.style.paddingLeft = '0';
                track.style.paddingRight = '0';
                track.style.removeProperty('--np-bar-marquee-shift');
                track.style.removeProperty('--np-bar-marquee-duration');
                host.style.removeProperty('--np-bar-marquee-shift');
                host.style.removeProperty('--np-bar-marquee-duration');
                track.style.animation = '';
                track.style.transform = '';
            }
        },
        skipBack() {
            this.resetShowOverlayTimeout();
            this.prevButton(true);
        },
        skipForward() {
            this.resetShowOverlayTimeout();
            this.nextButton(true);
        },
        shuffleClicked() {
            if (queryParams.party || this.playerStatus.playlist.randomplay==1) {
                return;
            }
            // Do not block on visibleMenus — sheet transport must always work
            if (this.shuffAltBtn && this.shuffAltBtn.show) {
                this.doCommand(this.shuffAltBtn.command, this.shuffAltBtn.tooltip);
                return;
            }
            let mode = this.playerStatus.playlist.shuffle || 0;
            // Cycle: off → tracks → albums → off
            let next = mode===0 ? 1 : (mode===1 ? 2 : 0);
            bus.$emit('playerCommand', ['playlist', 'shuffle', next]);
        },
        repeatClicked(longPress) {
            if (this.$store.state.visibleMenus.size>0 || queryParams.party) {
                return;
            }
            if (this.repAltBtn.show) {
                this.doCommand(this.repAltBtn.command, this.repAltBtn.tooltip);
            } else {
                if (this.playerStatus.playlist.randomplay===1) {
                    /*
                    confirm(i18n("Stop random mix?"), i18n('Stop')).then(res => {
                        if (res) {
                            lmsCommand(this.$store.state.player.id, ["randomplay", "disable"]).then(({data}) => {
                                bus.$emit('refreshStatus');
                            });
                        }
                    });*/
                    bus.$emit('dlg.open', 'rndmix', undefined, true);
                } else if (this.playerStatus.playlist.repeat===0) {
                    if (LMS_P_DSTM) {
                        if (longPress) {
                            bus.$emit('dlg.open', 'dstm');
                        } else if (this.dstm) {
                            lmsCommand(this.$store.state.player.id, ["material-skin-client", "save-dstm"]).then(({data}) => {
                                bus.$emit("dstm", this.$store.state.player.id, 0);
                            });
                        } else {
                            bus.$emit('playerCommand', ['playlist', 'repeat', 2]);
                        }
                    } else {
                        bus.$emit('playerCommand', ['playlist', 'repeat', 2]);
                    }
                } else if (this.playerStatus.playlist.repeat===1) {
                    bus.$emit('playerCommand', ['playlist', 'repeat', 0]);
                } else if (this.playerStatus.playlist.repeat===2) {
                    bus.$emit('playerCommand', ['playlist', 'repeat', 1]);
                    if (LMS_P_DSTM) {
                        lmsCommand(this.$store.state.player.id, ["material-skin-client", "get-dstm"]).then(({data}) => {
                            if (data && data.result && undefined!=data.result.provider) {
                                bus.$emit("dstm", this.$store.state.player.id, data.result.provider);
                            }
                        });
                    }
                }
            }
        },
        showSleep() {
            if (this.$store.state.visibleMenus.size>0 || queryParams.party) {
                return;
            }
            bus.$emit('dlg.open', 'sleep', this.$store.state.player);
        },
        setRating(allowReset) {
            var val = allowReset && this.rating.value==this.rating.setting && this.rating.value<=1 ? 0 : this.rating.value;
            // this.rating.value is updated *before* this setRating click handler is called, so we can use its model value to update LMS
            this.rating.track_id = this.playerStatus.current.id;
            this.rating.album_id = this.playerStatus.current.album_id;
            lmsCommand(this.$store.state.player.id, [LMS_P_RP, "setrating", this.playerStatus.current.id, val]).then(({data}) => {
                if (allowReset && this.rating.track_id==this.playerStatus.current.id) {
                    this.rating.value=val;
                }
                logJsonMessage("RESP", data);
                bus.$emit('refreshStatus');
                bus.$emit('ratingChanged', this.rating.track_id, this.rating.album_id);
            }).catch(err => {
                bus.$emit('showError', undefined, i18n('Failed to set rating!'));
                if (this.rating.track_id==this.playerStatus.current.id) {
                    this.rating.value=this.rating.setting;
                }
                this.rating.track_id = undefined;
                this.rating.album_id = undefined;
                bus.$emit('refreshStatus');
            });
        },
        doCommand(command, msg) {
            lmsCommand(this.$store.state.player.id, command).then(({data}) => {
                if (undefined!=msg) {
                    bus.$emit('showMessage', msg);
                }
            });
        },
        clickImage(event) {
            nowPlayingClickImage(this, event);
        },
        /** True if this event is on artist/album/time/control chrome — not a bare bar tap */
        npBarIsInteractiveTarget(el) {
            if (!el || !el.closest) {
                return false;
            }
            return !!el.closest(
                '.link-item, .link-item-ct, a, button, .v-btn, .v-icon, .v-rating, ' +
                '.np-bar-time, .np-bar-quality, .np-bar-slider, .pbar, .np-bar-tech, .np-bar-rating, ' +
                '.np-bar-queue, .np-bar-modes, .np-bar-mode, .np-bar-player-prefs, .np-playpause, .np-changepage, ' +
                '#np-bar-prev, #np-bar-next, #np-bar-stop, #playPauseA, #playPauseB'
            );
        },
        barClicked(ev) {
            if (!ev || !ev.target) {
                return;
            }
            // Artist/album (and other) links: let their onclick handlers run; never open the sheet
            if (this.npBarIsInteractiveTarget(ev.target)) {
                return;
            }
            if (this.desktopLayout) {
                let bar = document.getElementById('np-bar');
                let slider = bar ? bar.querySelector('.np-bar-slider') : undefined;
                if (slider && undefined!=ev.clientX && undefined!=ev.clientY) {
                    let rect = slider.getBoundingClientRect();
                    if (ev.clientY>=rect.top && ev.clientY<=rect.bottom && ev.clientX>=rect.left && ev.clientX<=rect.right) {
                        this.sliderChanged(ev, false);
                        return;
                    }
                }
                this.expandNpSheet();
                return;
            }
            // All mobile bar styles open the same np-card sheet (library, Spotify, radio, …)
            if (!this.desktopLayout && MBAR_NONE!=this.mobileBar) {
                let touch = getTouchPos(ev);
                let x = undefined==touch ? (undefined!=ev.clientX ? ev.clientX : ev.x) : touch.x;
                let reserve = MBAR_REP_NAV==this.mobileBar ? 124 : (MBAR_THIN==this.mobileBar ? 8 : 60);
                if (undefined==x || x < (window.innerWidth - reserve)) {
                    this.expandNpSheet();
                }
            }
        },
        npBarClicked(ev) {
            // Links must not be suppressed by swipe/dock bookkeeping
            if (ev && this.npBarIsInteractiveTarget(ev.target)) {
                this.npBarSwipeHandled = false;
                this.npBarTouchMoved = false;
                this.npBarTouchIgnore = false;
                return;
            }
            if (this.npBarSwipeHandled || this.npBarTouchMoved) {
                this.npBarSwipeHandled = false;
                this.npBarTouchMoved = false;
                return;
            }
            if (!this.desktopLayout) {
                this.npBarSetPressed();
            }
            this.barClicked(ev);
        },
        npBarClearPressed() {
            if (undefined!=this._npBarPressedTimer) {
                clearTimeout(this._npBarPressedTimer);
                this._npBarPressedTimer = undefined;
            }
            this.npBarPressed = false;
        },
        npBarHoldPressed() {
            if (undefined!=this._npBarPressedTimer) {
                clearTimeout(this._npBarPressedTimer);
                this._npBarPressedTimer = undefined;
            }
            this.npBarPressed = true;
        },
        npBarSetPressed() {
            this.npBarHoldPressed();
            this._npBarPressedTimer = setTimeout(function() {
                if (!this.npBarDockDragging) {
                    this.npBarPressed = false;
                }
                this._npBarPressedTimer = undefined;
            }.bind(this), 100);
        },
        npBarTouchStart(ev) {
            if (!ev.touches || 1!=ev.touches.length) {
                return;
            }
            // Sheet open: miniplayer banner must not steal swipes (track change / dock)
            if (this.npSheetOpen || this.$store.state.npSheetOpen) {
                this.npBarTouch = undefined;
                this.npBarTouchIgnore = false;
                return;
            }
            // Artist/album links (and controls): leave pure tap — no dock/track swipe
            if (this.npBarIsInteractiveTarget(ev.target)) {
                this.npBarTouchIgnore = true;
                this.npBarTouch = undefined;
                this.npBarTouchMoved = false;
                this.npBarSwipeHandled = false;
                this.npBarDockGesture = undefined;
                this.npBarDockDragging = false;
                return;
            }
            this.npBarTouchIgnore = false;
            this.npBarTouch = { x:ev.touches[0].clientX, y:ev.touches[0].clientY };
            this.npBarTouchMoved = false;
            this.npBarSwipeHandled = false;
            this.npBarDockGesture = undefined;
            this.npBarDockDragY = 0;
            this.npBarDockDragging = false;
            this.npBarSetPressed();
        },
        npBarDockRange() {
            // Match CSS --np-bar-dock-lift: pad + shortcut strip height (GPU rest transform).
            let m = this._npBarDockMetrics;
            if (m && m.range > 0) {
                let footer = document.getElementById('nav-bar');
                let h = footer && footer.classList.contains('nav-shortcut-footer') ? (footer.offsetHeight || 0) : 0;
                if (!(h > 0) || Math.abs(h - (m.footerH || 0)) < 2) {
                    return m.range;
                }
            }
            return this.cacheNpBarDockMetrics().range;
        },
        /* Used px of a length custom property (min()/env() do not parseFloat). */
        npBarCssPx(name) {
            let raw = getComputedStyle(document.documentElement).getPropertyValue(name);
            let n = parseFloat(raw);
            if (!isNaN(n)) {
                return n;
            }
            let probe = document.createElement('div');
            probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;width:0;height:var(' + name + ')';
            document.documentElement.appendChild(probe);
            let h = probe.offsetHeight || 0;
            if (probe.parentNode) {
                probe.parentNode.removeChild(probe);
            }
            return h;
        },
        cacheNpBarDockMetrics() {
            let root = getComputedStyle(document.documentElement);
            let navH = parseFloat(root.getPropertyValue('--bottom-nav-content-height'));
            let pad = parseFloat(root.getPropertyValue('--bottom-pad'));
            let npH = parseFloat(root.getPropertyValue('--mobile-npbar-height'));
            let lift = parseFloat(root.getPropertyValue('--np-bar-dock-lift'));
            if (isNaN(navH) || navH <= 0) {
                navH = 52;
            }
            if (isNaN(pad)) { pad = 0; }
            if (isNaN(npH)) { npH = 0; }
            // Prefer CSS --np-bar-dock-lift (same token as footer height + raised bottom)
            let footer = document.getElementById('nav-bar');
            let footerH = 0;
            if (footer && footer.classList.contains('nav-shortcut-footer')) {
                footerH = footer.offsetHeight || 0;
            }
            let range = (lift > 0) ? lift : (footerH > 0 ? footerH : (pad + navH));
            if (range <= 0) { range = Math.max(40, navH || 52); }
            // Docked player rests this far above the screen. 0 when there is no home indicator.
            let homeRest = this.npBarCssPx('--np-home-rest');
            if (!(homeRest > 0) || homeRest >= range) {
                homeRest = 0;
            }
            this._npBarDockMetrics = { range: range, navH: navH, pad: pad, npH: npH, footerH: footerH, homeRest: homeRest };
            return this._npBarDockMetrics;
        },
        npBarTouchMove(ev) {
            if (this.npBarTouchIgnore || undefined==this.npBarTouch || !ev.touches || 1!=ev.touches.length) {
                return;
            }
            let dx = ev.touches[0].clientX - this.npBarTouch.x;
            let dy = ev.touches[0].clientY - this.npBarTouch.y;
            if (Math.abs(dx)>10 || Math.abs(dy)>10) {
                this.npBarTouchMoved = true;
            }
            if (this.desktopLayout) {
                if (this.npSheetOpen || this.$store.state.npSheetOpen) {
                    return;
                }
                if (undefined==this.npBarDockGesture) {
                    if (Math.abs(dy)<12 && Math.abs(dx)<12) {
                        return;
                    }
                    this.npBarDockGesture = Math.abs(dx)>Math.abs(dy)*1.1 ? 'track' : 'ignore';
                }
                if ('track'==this.npBarDockGesture) {
                    try { ev.preventDefault(); } catch (e) {}
                    this.npBarLiveSlide(dx);
                }
                return;
            }
            // Vertical dock gesture (thin/thick miniplayer only)
            if (!this.npBarDockable || this.desktopLayout || this.npSheetOpen) {
                return;
            }
            if (undefined==this.npBarDockGesture) {
                if (Math.abs(dy)<12 && Math.abs(dx)<12) {
                    return;
                }
                // Prefer vertical for dock, horizontal for track change
                this.npBarDockGesture = Math.abs(dy)>Math.abs(dx)*1.1 ? 'dock' : 'track';
            }
            if ('dock'!=this.npBarDockGesture) {
                if ('track'==this.npBarDockGesture && this.npBarMobileTwoLine()) {
                    try { ev.preventDefault(); } catch (e) {}
                    this.npBarLiveSlide(dx);
                }
                return;
            }
            try { ev.preventDefault(); } catch (e) {}
            let starting = !this._dockGestureActive;
            if (starting) {
                // Cache metrics + DOM refs once (no getComputedStyle / getElementById per frame)
                this.cacheNpBarDockMetrics();
                this._dockBarEl = document.getElementById('np-bar');
                this._dockFooterEl = document.getElementById('nav-bar');
                this._dockFadeEl = document.querySelector('.msk-bottom-fade');
                this._dockGestureActive = true;
                // DOM class only — avoid Vue re-render thrash mid-gesture
                if (this._dockBarEl) {
                    this._dockBarEl.classList.add('np-bar-dock-dragging');
                    this._dockBarEl.style.transition = 'none';
                    this._dockBarEl.style.willChange = 'transform';
                }
                if (this._dockFadeEl) {
                    this._dockFadeEl.style.transition = 'none';
                    this._dockFadeEl.style.webkitTransition = 'none';
                }
                // Vue flag once (pressed chrome / gesture state) — not every move
                if (!this.npBarDockDragging) {
                    this.npBarDockDragging = true;
                }
            }
            let range = this.npBarDockRange();
            // Relative finger offset:
            //  raised → docked: 0..+range
            //  docked → raised: -range..0
            let offset;
            if (this.npBarDocked) {
                offset = Math.max(-range, Math.min(0, dy));
            } else {
                offset = Math.max(0, Math.min(range, dy));
            }
            this._npBarDockDragOffset = offset;
            // Compositor-only paint (transforms). No chrome layout during drag.
            this.scheduleDockDragPaint(offset, range);
        },
        /*
         * Absolute Y with bottom:0 always (CSS rest uses the same model):
         *  raised rest = -range, docked rest = -homeRest (0 without a home indicator)
         */
        npBarDockHomeRest(range) {
            let m = this._npBarDockMetrics;
            let rest = m && m.homeRest > 0 ? m.homeRest : 0;
            if (!(range > rest)) {
                return 0;
            }
            return rest;
        },
        npBarDockBarY(offset, range) {
            let rest = this.npBarDockHomeRest(range);
            if (rest <= 0) {
                return this.npBarDocked ? offset : (-range + offset);
            }
            // Finger still travels the full footer. The player stops homeRest above the screen.
            let scale = (range - rest) / range;
            return this.npBarDocked ? (-rest + (offset * scale)) : (-range + (offset * scale));
        },
        npBarDockFooterY(offset, range) {
            // Raised rest 0; docked rest +range; undock: offset(-range..0)+range → 0..range
            return this.npBarDocked ? (offset + range) : offset;
        },
        scheduleDockDragPaint(offset, range) {
            this._dockDragPaint = { offset: offset, range: range };
            if (this._dockDragRaf) {
                return;
            }
            this._dockDragRaf = requestAnimationFrame(function() {
                this._dockDragRaf = 0;
                let p = this._dockDragPaint;
                if (!p) {
                    return;
                }
                this.paintDockDrag(p.offset, p.range);
            }.bind(this));
        },
        paintDockDrag(offset, range) {
            // Pure translate3d — never touch bottom/height/CSS vars here.
            // Fade travels the bar's downward delta (barY + range): 0 raised, range-homeRest docked.
            let barY = this.npBarDockBarY(offset, range);
            let bar = this._dockBarEl || document.getElementById('np-bar');
            if (bar) {
                if (this._dockBarLastY !== barY) {
                    this._dockBarLastY = barY;
                    bar.style.transform = 'translate3d(0,' + barY + 'px,0)';
                }
            }
            this.paintDockFade(barY, range);
            this.syncDockFooterDrag(offset, range);
        },
        paintDockFade(barY, range, transition) {
            if (!(range > 0)) {
                return;
            }
            let fade = this._dockFadeEl || document.querySelector('.msk-bottom-fade');
            if (!fade) {
                return;
            }
            this._dockFadeEl = fade;
            let fadeY = barY + range;
            let fadeTf = 'translate3d(0,' + fadeY + 'px,0)';
            if (transition) {
                fade.style.transition = transition;
                fade.style.webkitTransition = transition;
                fade.style.transform = fadeTf;
                fade.style.webkitTransform = fadeTf;
                this._dockFadeLastY = fadeY;
                return;
            }
            if (this._dockFadeLastY === fadeY) {
                return;
            }
            this._dockFadeLastY = fadeY;
            fade.style.transition = 'none';
            fade.style.webkitTransition = 'none';
            fade.style.transform = fadeTf;
            fade.style.webkitTransform = fadeTf;
        },
        /* Resting pixels. CSS calc() on the fade waits for the next scroll on iOS, so the
           inline translate has to stay after the dock snap and after shortcut collapse. */
        applyRestingFadeTransform(fade) {
            fade = fade || document.querySelector('.msk-bottom-fade');
            if (!fade) {
                return;
            }
            let y = 0;
            let app = document.querySelector('.lms-app');
            if (app && !app.classList.contains('np-sheet-open') &&
                (app.classList.contains('np-bar-docked') || app.classList.contains('nav-shortcuts-auto-collapsed'))) {
                let lift = this.npBarCssPx('--np-bar-dock-lift');
                if (!(lift > 0)) {
                    let footer = document.getElementById('nav-bar');
                    lift = footer && footer.offsetHeight ? footer.offsetHeight : 0;
                }
                let rest = this.npBarCssPx('--np-home-rest');
                if (!(rest > 0) || rest >= lift) {
                    rest = 0;
                }
                y = Math.max(0, Math.round(lift - rest));
            }
            let t = 'translate3d(0,' + y + 'px,0)';
            fade.style.transform = t;
            fade.style.webkitTransform = t;
        },
        syncDockFooterDrag(offset, range) {
            let footer = this._dockFooterEl || document.getElementById('nav-bar');
            if (!footer || !footer.classList.contains('nav-shortcut-footer')) {
                return;
            }
            let footerY = this.npBarDockFooterY(offset, range);
            // One-time layer setup per gesture
            if (!footer.classList.contains('nav-shortcut-drag')) {
                footer.classList.add('nav-shortcut-drag');
                footer.style.transition = 'none';
                footer.style.opacity = '1';
                footer.style.pointerEvents = 'none';
                footer.style.willChange = 'transform';
            }
            if (this._dockFooterLastY !== footerY) {
                this._dockFooterLastY = footerY;
                footer.style.transform = 'translate3d(0,' + footerY + 'px,0)';
            }
        },
        clearDockFooterDrag(opts) {
            opts = opts || {};
            if (this._dockDragRaf) {
                cancelAnimationFrame(this._dockDragRaf);
                this._dockDragRaf = 0;
            }
            if (this._dockSnapTimer) {
                clearTimeout(this._dockSnapTimer);
                this._dockSnapTimer = undefined;
            }
            this._dockDragPaint = undefined;
            this._dockBarLastY = undefined;
            this._dockFooterLastY = undefined;
            this._dockFadeLastY = undefined;
            this._dockChromeLast = undefined;
            this._npBarDockMetrics = undefined;
            this._npBarDockDragOffset = undefined;
            this._dockGestureActive = false;
            let bar = this._dockBarEl || document.getElementById('np-bar');
            this._dockBarEl = undefined;
            let footer = this._dockFooterEl || document.getElementById('nav-bar');
            this._dockFooterEl = undefined;
            let fade = this._dockFadeEl || document.querySelector('.msk-bottom-fade');
            this._dockFadeEl = undefined;
            let app = document.querySelector('.lms-app');
            if (app) {
                app.classList.add('np-bar-dock-noanim');
            }
            let kill = function(el) {
                if (!el) { return; }
                el.style.transition = 'none';
                el.style.webkitTransition = 'none';
            };
            if (bar && !opts.keepInline) {
                kill(bar);
                bar.classList.remove('np-bar-dock-dragging');
                bar.style.transform = '';
                bar.style.webkitTransform = '';
                bar.style.willChange = '';
            }
            if (footer) {
                footer.classList.remove('nav-shortcut-drag');
                if (!opts.keepInline) {
                    kill(footer);
                    footer.style.transform = '';
                    footer.style.webkitTransform = '';
                    footer.style.opacity = '';
                    footer.style.pointerEvents = '';
                    footer.style.willChange = '';
                }
            }
            if (fade && !opts.keepInline) {
                kill(fade);
                this.applyRestingFadeTransform(fade);
            }
            if (app) {
                requestAnimationFrame(function() {
                    requestAnimationFrame(function() {
                        app.classList.remove('np-bar-dock-noanim');
                        // Drop the inline none so the CSS 0.22s linear shortcut slide can run later.
                        // noanim covered the frame where the inline transform was cleared.
                        if (fade && !opts.keepInline && !this._dockGestureActive && !this.npBarDockDragging) {
                            fade.style.transition = '';
                            fade.style.webkitTransition = '';
                        }
                    }.bind(this));
                }.bind(this));
                app.style.removeProperty('--mobile-bottom-chrome-height');
            }
        },
        /*
         * Animate bar+footer with transform only, then commit layout class after snap.
         * Toggling .np-bar-docked mid-animation would reflow --bottom-toolbar-height → lag.
         */
        snapDockVisual(docked, range, onDone) {
            let bar = this._dockBarEl || document.getElementById('np-bar');
            let footer = this._dockFooterEl || document.getElementById('nav-bar');
            let ease = 'transform 0.22s linear';
            // Absolute Y with bottom:0 — raised rest is -range, docked rest is -homeRest
            let rest = this.npBarDockHomeRest(range);
            let barEnd = docked ? -rest : -range;
            let footerEnd = docked ? range : 0;
            if (bar) {
                // Leave drag class so CSS does not re-apply rest transform mid-snap
                bar.classList.add('np-bar-dock-dragging');
                // Re-enable easing (drag set transition:none; class also has none — override inline)
                bar.style.transition = ease;
                bar.style.transform = 'translate3d(0,' + barEnd + 'px,0)';
            }
            if (footer && footer.classList.contains('nav-shortcut-footer')) {
                footer.classList.add('nav-shortcut-drag');
                footer.style.transition = ease + ', opacity 0.18s linear';
                footer.style.pointerEvents = 'none';
                footer.style.willChange = 'transform';
                footer.style.transform = 'translate3d(0,' + footerEnd + 'px,0)';
                footer.style.opacity = docked ? '0' : '1';
            }
            // Same 0.22s linear as the bar. fadeY = barEnd + range.
            this.paintDockFade(barEnd, range, ease);
            if (this._dockSnapTimer) {
                clearTimeout(this._dockSnapTimer);
            }
            this._dockSnapTimer = setTimeout(function() {
                this._dockSnapTimer = undefined;
                // Layout chrome (content inset) only after motion ends
                if (typeof onDone === 'function') {
                    onDone();
                }
                this.clearDockFooterDrag();
            }.bind(this), 300);
        },
        applyNpBarDocked(docked, skipAnim, opts) {
            opts = opts || {};
            let persist = opts.persist !== false;
            let animate = opts.animate !== false && !skipAnim;
            let can = this.npBarDockable;
            if (!can || this.$store.state.desktopLayout) {
                docked = false;
                can = false;
            }
            let range = 0;
            if (animate && can) {
                range = this.npBarDockRange();
                if (!(range > 0)) {
                    range = this.cacheNpBarDockMetrics().range;
                }
            }
            let wasDragging = this.npBarDockDragging || this._dockGestureActive;
            this.npBarDocked = !!docked;
            this.npBarDockDragging = false;
            this.npBarDockDragY = 0;
            // Permanent dock changes cancel a temporary lift
            if (persist) {
                this.npBarTempLifted = false;
                this.clearNpBarTempLiftTimer();
            }
            // Always clear any legacy inline override (breaks desktop bar height / browse layout)
            document.documentElement.style.removeProperty('--bottom-toolbar-height');
            let app = document.querySelector('.lms-app');
            let commitLayout = function() {
                if (!app) {
                    return;
                }
                app.style.removeProperty('--mobile-bottom-chrome-height');
                app.classList.toggle('np-bar-docked', this.npBarDocked && can);
                app.classList.toggle('np-bar-temp-lift', !!(this.npBarTempLifted && !this.npBarDocked));
            }.bind(this);

            if (app) {
                app.classList.remove('np-bar-dock-noanim');
                if (animate && wasDragging && can) {
                    // Transform snap first; layout class after (avoids mid-anim reflow)
                    this.snapDockVisual(this.npBarDocked, range, commitLayout);
                } else {
                    this.clearDockFooterDrag();
                    commitLayout();
                    // only suppress CSS transition for true instant jumps (restore / layout switch)
                    if (skipAnim) {
                        app.classList.add('np-bar-dock-noanim');
                        if (this._npBarDockNoanimTimer) {
                            clearTimeout(this._npBarDockNoanimTimer);
                        }
                        this._npBarDockNoanimTimer = setTimeout(function() {
                            this._npBarDockNoanimTimer = undefined;
                            if (app) {
                                app.classList.remove('np-bar-dock-noanim');
                            }
                        }.bind(this), 0);
                    }
                }
            } else {
                this.clearDockFooterDrag();
            }
            // Chrome height when docked is handled only in mobile.css via .lms-app.np-bar-docked
            if (can && persist) {
                setLocalStorageVal('npBarDocked', this.npBarDocked);
            }
            bus.$emit('npBarDocked', this.npBarDocked);
            this.scheduleNpBarNavLayout();
        },
        clearNpBarTempLiftTimer() {
            if (this._npBarTempLiftTimer) {
                clearTimeout(this._npBarTempLiftTimer);
                this._npBarTempLiftTimer = undefined;
            }
        },
        clearNpBarTempLift(skipAnim) {
            this.clearNpBarTempLiftTimer();
            if (!this.npBarTempLifted) {
                return;
            }
            this.npBarTempLifted = false;
            let app = document.querySelector('.lms-app');
            if (app) {
                app.classList.remove('np-bar-temp-lift');
            }
            // Restore preferred docked state (temp lift only starts from docked)
            if (getLocalStorageBool('npBarDocked', false)) {
                this.applyNpBarDocked(true, !!skipAnim, { persist: false });
            }
        },
        scheduleNpBarTempContract() {
            if (!this.npBarTempLifted) {
                return;
            }
            this.clearNpBarTempLiftTimer();
            // Auto-contract shortly after scroll/gesture idle
            this._npBarTempLiftTimer = setTimeout(function() {
                this._npBarTempLiftTimer = undefined;
                this.clearNpBarTempLift(false);
            }.bind(this), 1500);
        },
        /**
         * Thin (one-line) miniplayer only: temporarily undock so shortcuts are reachable
         * while browsing, without changing the user's docked preference. Auto-contracts.
         */
        tempLiftNpBar() {
            if (this.$store.state.desktopLayout || this.npSheetOpen || this.$store.state.npSheetOpen) {
                return;
            }
            if (MBAR_THIN != this.$store.state.mobileBar || !this.npBarDockable) {
                return;
            }
            // Only meaningful when docked (or already in a temp lift)
            if (!this.npBarDocked && !this.npBarTempLifted) {
                return;
            }
            if (!this.npBarTempLifted) {
                this.npBarTempLifted = true;
                this.applyNpBarDocked(false, false, { persist: false });
                let app = document.querySelector('.lms-app');
                if (app) {
                    app.classList.add('np-bar-temp-lift');
                }
            }
            this.scheduleNpBarTempContract();
        },
        npBarTouchEnd(ev) {
            if (this.npBarTouchIgnore) {
                this.npBarTouchIgnore = false;
                this.npBarTouch = undefined;
                this.npBarTouchMoved = false;
                this.npBarSwipeHandled = false;
                this.npBarDockDragging = false;
                this.npBarDockDragY = 0;
                this.npBarClearPressed();
                // Do not mark as swipe — allow synthetic click → showAlbum / show_artist
                return;
            }
            if (this.npSheetOpen || this.$store.state.npSheetOpen) {
                this.npBarTouch = undefined;
                this.npBarDockDragging = false;
                this.npBarDockDragY = 0;
                this.clearDockFooterDrag();
                this.npBarClearPressed();
                return;
            }
            if (undefined==this.npBarTouch || !ev.changedTouches || 1!=ev.changedTouches.length) {
                this.npBarTouch = undefined;
                this.npBarDockDragging = false;
                this.npBarDockDragY = 0;
                this.clearDockFooterDrag();
                this.npBarClearPressed();
                return;
            }
            let dx = ev.changedTouches[0].clientX - this.npBarTouch.x;
            let dy = ev.changedTouches[0].clientY - this.npBarTouch.y;
            let moved = this.npBarTouchMoved;
            let dockGesture = this.npBarDockGesture;
            this.npBarTouch = undefined;
            this.npBarDockGesture = undefined;

            if (this.npBarDockable && 'dock'==dockGesture && moved) {
                let range = this.npBarDockRange();
                let threshold = Math.max(28, range * 0.28);
                let snapDocked = this.npBarDocked;
                if (this.npBarDocked) {
                    // Pulling up undocks
                    if (dy < -threshold) {
                        snapDocked = false;
                    }
                } else {
                    // Pulling down docks
                    if (dy > threshold) {
                        snapDocked = true;
                    }
                }
                this.npBarSwipeHandled = true;
                // Keep npBarDockDragging true so applyNpBarDocked can snap from finger position
                this.applyNpBarDocked(snapDocked, false);
                this.npBarClearPressed();
                return;
            }

            if (this._npSlideFromTouch && this._npSlideActive) {
                this.npBarDockDragging = false;
                this.npBarDockDragY = 0;
                this.npBarSlideEnd(dx, dy, moved);
                if (!moved) {
                    this.npBarSetPressed();
                } else {
                    this.npBarClearPressed();
                }
                return;
            }
            if (this._npSlideAnim || this._npBarSlideHold) {
                this.npBarSwipeHandled = true;
                this.npBarDockDragging = false;
                this.npBarDockDragY = 0;
                this.npBarClearPressed();
                return;
            }
            this.npBarDockDragging = false;
            this.npBarDockDragY = 0;
            this.clearDockFooterDrag();
            this.npBarSwipeFromDelta(dx, dy, moved);
            if (!moved) {
                this.npBarSetPressed();
            } else {
                this.npBarClearPressed();
            }
        },
        npBarWheel(ev) {
            if (undefined==ev) {
                return;
            }
            // Sheet open: bar must not change tracks from wheel/trackpad
            if (this.npSheetOpen || this.$store.state.npSheetOpen) {
                return;
            }
            this.npBarWheelDelta(ev, true);
        },
        npBarWheelDelta(ev, preventDefault) {
            if (undefined==ev) {
                return;
            }
            // Match touch swipe: dx < 0 → next, dx > 0 → prev (see npBarSwipeFromDelta).
            let dx = npBarWheelDeltaX(ev);
            if (Math.abs(dx)<1 || Math.abs(dx)<=Math.abs(ev.deltaY)*0.5) {
                return;
            }
            if (preventDefault) {
                ev.preventDefault();
                ev.stopPropagation();
            }
            if (this.npBarTrackSlide()) {
                if (this._npSlideAnim || this._npBarSlideHold) {
                    return;
                }
                this._npWheelSlide = (this._npWheelSlide || 0) + dx;
                this.npBarLiveSlide(this._npWheelSlide);
                if (undefined!=this.npBarWheelTimer) {
                    clearTimeout(this.npBarWheelTimer);
                }
                this.npBarWheelTimer = setTimeout(function() {
                    this.npBarWheelTimer = undefined;
                    let accum = this._npWheelSlide || 0;
                    this._npWheelSlide = 0;
                    if (this._npSlideActive) {
                        this.npBarSlideEnd(accum, 0, Math.abs(accum)>=12);
                    }
                }.bind(this), 90);
                return;
            }
            this.npBarWheelAccum += dx;
            if (undefined!=this.npBarWheelTimer) {
                clearTimeout(this.npBarWheelTimer);
            }
            this.npBarWheelTimer = setTimeout(function() {
                this.npBarWheelTimer = undefined;
                let accum = this.npBarWheelAccum;
                this.npBarWheelAccum = 0;
                if (Math.abs(accum)>=20) {
                    this.npBarSwipeHandled = true;
                    if (accum<-20) {
                        this.npBarPendingDir = 1;
                        this.nextButton(false);
                    } else if (accum>20) {
                        this.npBarPendingDir = -1;
                        this.prevButton(false);
                    }
                }
            }.bind(this), 70);
        },
        npBarSwipeFromDelta(dx, dy, moved) {
            if (this.npSheetOpen || this.$store.state.npSheetOpen) {
                return;
            }
            if (!moved || Math.abs(dx)<=Math.abs(dy) || Math.abs(dx)<50) {
                return;
            }
            // Same debounce as bus npBarSwipe — avoid double next/prev from capture+bubble on iOS
            let direction = dx<-50 ? 'left' : (dx>50 ? 'right' : undefined);
            if (!direction) {
                return;
            }
            let now = Date.now();
            if (this._npBarSwipeAt && (now-this._npBarSwipeAt)<400 && this._npBarSwipeDir==direction) {
                this.npBarSwipeHandled = true;
                return;
            }
            this._npBarSwipeAt = now;
            this._npBarSwipeDir = direction;
            this.npBarSwipeHandled = true;
            if ('left'==direction) {
                this.npBarPendingDir = 1;
                this.nextButton(false);
            } else {
                this.npBarPendingDir = -1;
                this.prevButton(false);
            }
        },
        onNpCardPanelScroll(ev) {
            let el = ev && ev.target ? ev.target : null;
            if (!el) {
                return;
            }
            // Match 10px top fade: appear over first 10px of scroll
            let t = Math.max(0, Math.min(1, (el.scrollTop || 0) / 10));
            if (Math.abs(t - this.npCardEdgeTopOpacity) > 0.02) {
                this.npCardEdgeTopOpacity = t;
            }
        },
        onNpLyricsScroll(ev) {
            let el = ev && ev.target ? ev.target : null;
            if (!el) {
                return;
            }
            // Match 10px top fade: appear over first 10px of scroll
            let t = Math.max(0, Math.min(1, (el.scrollTop || 0) / 10));
            if (Math.abs(t - this.npLyricsEdgeTopOpacity) > 0.02) {
                this.npLyricsEdgeTopOpacity = t;
            }
        },
        npMainSlideStep(dir) {
            if (!this.showMobileInfoCard) {
                return;
            }
            let swiper = this.getNpMainSwiper();
            if (!swiper) {
                return;
            }
            if (dir > 0 && typeof swiper.slideNext==='function') {
                swiper.slideNext();
            } else if (dir < 0 && typeof swiper.slidePrev==='function') {
                swiper.slidePrev();
            }
        },
        npPageWheel(ev) {
            if (!this.npSheetOpen || ''!=this.npSheetAnim || undefined==ev) {
                return;
            }
            let t = ev.target;
            // Side progress rail owns its own gestures
            if (t && t.closest && t.closest('.np-side-progress')) {
                return;
            }
            let rawDx = ev.deltaX || 0;
            let rawDy = ev.deltaY || 0;
            if (ev.shiftKey && Math.abs(rawDy)>Math.abs(rawDx)) {
                rawDx = rawDy;
                rawDy = 0;
            }
            let horiz = Math.abs(rawDx)>=1 && Math.abs(rawDx)>Math.abs(rawDy)*0.55;
            // Cover + track-change setting: horizontal trackpad still skips tracks
            if (horiz && this.swipeChangeTrackEnabled &&
                t && t.closest && t.closest('.np-cover, .np-cover-stack, .np-cover-block')) {
                this.npBarWheelDelta(ev, true);
                return;
            }
            // Multi-card sheet: horizontal trackpad swipe changes card (NP | lyrics | artist | album)
            if (this.showMobileInfoCard && horiz) {
                if (Math.abs(rawDx) < 0.5) {
                    return;
                }
                if (ev.cancelable) {
                    ev.preventDefault();
                }
                ev.stopPropagation();
                // Match touch: finger left / content left → next card.
                // Mac natural scroll inverts deltaX vs finger; use npBarWheelDeltaX polarity.
                let dx = npBarWheelDeltaX(ev);
                // npBarWheelDeltaX maps to track-swipe polarity (neg = next). Card step uses same.
                this.npCardWheelAccum = (this.npCardWheelAccum || 0) + dx;
                if (undefined!=this.npCardWheelTimer) {
                    clearTimeout(this.npCardWheelTimer);
                }
                this.npCardWheelTimer = setTimeout(function() {
                    this.npCardWheelTimer = undefined;
                    let accum = this.npCardWheelAccum || 0;
                    this.npCardWheelAccum = 0;
                    // Same threshold feel as miniplayer trackpad skip
                    if (accum <= -24) {
                        this.npMainSlideStep(1);
                    } else if (accum >= 24) {
                        this.npMainSlideStep(-1);
                    }
                }.bind(this), 55);
                return;
            }
            // Vertical trackpad over lyrics / artist / album: scroll the inset text panel
            let scrollEl = t && t.closest
                ? t.closest('.np-card-panel-scroll, .np-lyrics-slide-scroll')
                : null;
            if (!scrollEl && t && t.closest && t.closest('.np-main-slide-queue, .np-main-slide-lyrics, .np-main-slide-artist, .np-main-slide-album')) {
                let slide = t.closest('.swiper-slide-active, .np-main-slide');
                scrollEl = slide ? slide.querySelector('.np-card-panel-scroll') : null;
            }
            if (scrollEl && Math.abs(rawDy)>Math.abs(rawDx)*0.45 && Math.abs(rawDy)>=0.5) {
                // Drive scroll explicitly so trackpads work even if a parent captures wheel
                let maxScroll = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight);
                if (maxScroll > 1) {
                    let next = Math.max(0, Math.min(maxScroll, scrollEl.scrollTop + rawDy));
                    if (next !== scrollEl.scrollTop) {
                        scrollEl.scrollTop = next;
                        if (ev.cancelable) {
                            ev.preventDefault();
                        }
                        ev.stopPropagation();
                        // Keep edge-fade opacity in sync
                        if (scrollEl.classList.contains('np-lyrics-slide-scroll')) {
                            this.onNpLyricsScroll({target: scrollEl});
                        } else {
                            this.onNpCardPanelScroll({target: scrollEl});
                        }
                        return;
                    }
                    // At scroll edge: absorb so sheet does not collapse mid-read
                    if (ev.cancelable) {
                        ev.preventDefault();
                    }
                    ev.stopPropagation();
                    return;
                }
                // Nothing to scroll — fall through
            }
            // Scroll-details NP: a wheel that starts below the top only scrolls the page.
            // Closing the sheet takes a later gesture that begins already at the top.
            if (this.npDetailsScroll && !horiz && this.npMainSlide===NP_CARD_SLIDE_NP && t && t.closest && t.closest('.np-main')) {
                let main = t.closest('.np-main');
                let nowMs = Date.now();
                let fresh = !this._npWheelAt || (nowMs - this._npWheelAt) > 320;
                this._npWheelAt = nowMs;
                if (fresh) {
                    this._npWheelStartedAtTop = main.scrollTop <= 4;
                }
                if (!this._npWheelStartedAtTop) {
                    let maxScroll = Math.max(0, main.scrollHeight - main.clientHeight);
                    if (maxScroll > 1) {
                        main.scrollTop = Math.max(0, Math.min(maxScroll, main.scrollTop + rawDy));
                    }
                    if (ev.cancelable) {
                        ev.preventDefault();
                    }
                    ev.stopPropagation();
                    return;
                }
            }
            // Portrait + info card: vertical wheel scrolls the sheet (hero collapses into medium bar).
            // Sheet dismiss remains handle pull / close only.
            if (this.npSheetScrollCollapseActive) {
                return;
            }
            // Do not lower the sheet from vertical trackpad on info cards (use handle / swipe down)
            if (t && t.closest && t.closest('.np-main-slide-queue, .np-main-slide-lyrics, .np-main-slide-artist, .np-main-slide-album')) {
                return;
            }
            // Mac trackpad natural scroll: finger-down (lower the sheet) reports negative deltaY.
            // Collapse on that direction so the gesture matches "pull the panel down".
            if (ev.deltaY>=0 || Math.abs(ev.deltaY)<=Math.abs(ev.deltaX)) {
                return;
            }
            ev.preventDefault();
            ev.stopPropagation();
            this.npPageWheelAccum += -ev.deltaY;
            if (undefined!=this.npPageWheelTimer) {
                clearTimeout(this.npPageWheelTimer);
            }
            this.npPageWheelTimer = setTimeout(function() {
                this.npPageWheelTimer = undefined;
                let accum = this.npPageWheelAccum;
                this.npPageWheelAccum = 0;
                if (accum>=24) {
                    this.collapseNpSheetRestore();
                }
            }.bind(this), 80);
        },
        onNpMainScroll(ev) {
            // NP card no longer scroll-collapses (lyrics are a separate slide).
        },
        resetNpSheetCollapse() {
            this.npSheetCollapse = 0;
            this.npLyricsExpand = 0;
            this.npLyricsExpanded = false;
            if (undefined!=this.npSheetCollapseRaf) {
                cancelAnimationFrame(this.npSheetCollapseRaf);
                this.npSheetCollapseRaf = undefined;
            }
        },
        npPageTouchZone(clientX) {
            let third = window.innerWidth/3;
            if (clientX<third) {
                return 'left';
            }
            if (clientX>2*third) {
                return 'right';
            }
            return 'center';
        },
        isPlaceholderCover(url) {
            return undefined==url || ''==url || url.includes(DEFAULT_COVER) || url.includes(LMS_BLANK_COVER) || url.includes(DEFAULT_RADIO_COVER);
        },
        clearCoverPreload() {
            if (undefined!=this.coverPreload) {
                this.coverPreload.onload = null;
                this.coverPreload.onerror = null;
                this.coverPreload = undefined;
            }
        },
        beginCoverFade(newUrl) {
            // Keep previous cover only for the duration of the film-style cross-fade
            this.coverFading = false;
            this.$nextTick(function() {
                this.coverUrl = newUrl;
                this.$nextTick(function() {
                    this.coverFading = true;
                    this.coverFadeTimer = setTimeout(function() {
                        this.prevCoverUrl = undefined;
                        this.coverFading = false;
                        this.coverFadeTimer = undefined;
                        // Direction is one-shot per track change
                        this.coverFadeDir = 1;
                    }.bind(this), 620);
                }.bind(this));
            }.bind(this));
        },
        setCoverUrl(newUrl) {
            if (undefined==newUrl || ''==newUrl) {
                newUrl = DEFAULT_COVER;
            }
            if (this.npBarTrackSlide()) {
                let mem = this.npBarDisplayCoverForUrl(newUrl);
                if (this._npBarSlideHold) {
                    this._npBarSlidePendingCover = mem || this.npBarSlideCoverSrc || newUrl;
                    return;
                }
                if (mem) {
                    if (mem==this.coverUrl || this.npBarCoverSameArt(mem, this.coverUrl)) {
                        if (!this.coverFading) {
                            this.prevCoverUrl = undefined;
                        }
                        return;
                    }
                    this.npBarAssignCover(mem);
                    return;
                }
            }
            if (newUrl==this.coverUrl) {
                // Radio (esp. RP) re-polls the same art often — never leave prev stuck under current
                if (!this.coverFading) {
                    this.prevCoverUrl = undefined;
                }
                return;
            }
            this.clearCoverFadeTimer();
            this.clearCoverPreload();
            let oldIsPh = !this.coverUrl || this.isPlaceholderCover(this.coverUrl);
            let newIsPh = this.isPlaceholderCover(newUrl);
            // Snap only when nothing useful to dissolve (placeholder → placeholder)
            // Library art (from queue) and radio art (when fetched) always cross-fade.
            if (oldIsPh && newIsPh) {
                this.prevCoverUrl = undefined;
                this.coverFading = false;
                this.coverUrl = newUrl;
                return;
            }
            // First real art after empty/placeholder: soft fade-in (no prev layer needed)
            if (oldIsPh && !newIsPh) {
                this.prevCoverUrl = undefined;
                this.coverFading = false;
                let preloadFirst = new Image();
                this.coverPreload = preloadFirst;
                preloadFirst.onload = function() {
                    if (this.coverPreload!=preloadFirst) { return; }
                    this.coverPreload = undefined;
                    // Use empty prev so only the new art fades in
                    this.prevCoverUrl = this.coverUrl || DEFAULT_COVER;
                    this.beginCoverFade(newUrl);
                }.bind(this);
                preloadFirst.onerror = function() {
                    if (this.coverPreload!=preloadFirst) { return; }
                    this.coverPreload = undefined;
                    this.coverUrl = newUrl;
                }.bind(this);
                preloadFirst.src = newUrl;
                return;
            }
            let oldUrl = this.coverUrl;
            this.prevCoverUrl = oldUrl;
            this.coverFading = false;
            let preload = new Image();
            this.coverPreload = preload;
            preload.onload = function() {
                if (this.coverPreload!=preload) {
                    return;
                }
                this.coverPreload = undefined;
                this.beginCoverFade(newUrl);
            }.bind(this);
            preload.onerror = function() {
                if (this.coverPreload!=preload) {
                    return;
                }
                this.coverPreload = undefined;
                this.prevCoverUrl = undefined;
                this.coverFading = false;
                this.coverUrl = DEFAULT_COVER;
            }.bind(this);
            // Queue/list art is often already cached — fade as soon as decode finishes
            preload.src = newUrl;
        },
        clearCoverFadeTimer() {
            if (undefined!=this.coverFadeTimer) {
                clearTimeout(this.coverFadeTimer);
                this.coverFadeTimer = undefined;
            }
        },
        npSheetDragElems() {
            let elems = [];
            let page = document.getElementById('np-page');
            if (page) {
                elems.push(page);
            }
            let bgnd = document.querySelector('.np-bgnd.np-bgnd-sheet-palette');
            if (!bgnd && this.npSheetOpen) {
                bgnd = document.querySelector('.np-bgnd');
            }
            if (bgnd) {
                elems.push(bgnd);
            }
            if (this.desktopLayout) {
                let bar = document.getElementById('np-bar');
                if (bar) {
                    elems.push(bar);
                }
            }
            return elems;
        },
        cacheNpSheetDragElems() {
            if (this._npDragPage && this._npDragPage.isConnected) {
                return;
            }
            this._npDragPage = document.getElementById('np-page');
            this._npDragBgnd = document.querySelector('.np-bgnd.np-bgnd-sheet-palette') || document.querySelector('.np-bgnd');
            this._npDragScrim = document.querySelector('.np-sheet-scrim');
            this._npDragApp = document.querySelector('.lms-app');
        },
        npSheetDragLayer(elem) {
            if (!elem) {
                return;
            }
            elem.classList.add('np-sheet-dragging');
            elem.style.willChange = 'transform';
            elem.style.webkitBackfaceVisibility = 'hidden';
            elem.style.backfaceVisibility = 'hidden';
            elem.style.webkitTransformStyle = 'flat';
            elem.style.transformStyle = 'flat';
        },
        applyNpSheetDragTransform(y, transition) {
            this.cacheNpSheetDragElems();
            let x = this._npSheetDragX || 0;
            let t = 'translate3d(' + (x | 0) + 'px,' + ((y || 0) | 0) + 'px,0)';
            let trans = transition ? (typeof transition==='string' ? transition : 'transform 0.28s cubic-bezier(0.32, 0.72, 0, 1), -webkit-transform 0.28s cubic-bezier(0.32, 0.72, 0, 1)') : 'none';
            let apply = function(elem) {
                if (!elem) {
                    return;
                }
                elem.style.webkitTransition = trans;
                elem.style.transition = trans;
                elem.style.webkitTransform = t;
                elem.style.transform = t;
            };
            apply(this._npDragPage);
            apply(this._npDragBgnd);
        },
        flushNpSheetDragFrame() {
            this.npSheetDragRaf = undefined;
            this.applyNpSheetDragTransform(this._npSheetDragY || 0);
        },
        clearNpSheetDragStyles() {
            let clear = function(elem) {
                if (!elem) {
                    return;
                }
                elem.classList.remove('np-sheet-dragging');
                elem.classList.remove('np-sheet-drag-snap');
                elem.style.webkitTransition = '';
                elem.style.transition = '';
                elem.style.webkitTransform = '';
                elem.style.transform = '';
                elem.style.willChange = '';
                elem.style.webkitTransformStyle = '';
                elem.style.transformStyle = '';
            };
            clear(this._npDragPage);
            clear(this._npDragBgnd);
            if (this._npDragScrim) {
                this._npDragScrim.style.opacity = '';
            }
            this._npDragPage = undefined;
            this._npDragBgnd = undefined;
            this._npDragScrim = undefined;
        },
        setNpSheetScrimDragOpacity() {
        },
        setNpSheetDragX(x) {
            this._npSheetDragX = x || 0;
            this._npSheetDragY = 0;
            if (!this.npSheetDragY) {
                this.npSheetDragY = 1;
            }
            this.cacheNpSheetDragElems();
            if (!this._npSheetDragLive) {
                this._npSheetDragLive = true;
                this.npSheetDragLayer(this._npDragPage);
                this.npSheetDragLayer(this._npDragBgnd);
                if (this._npDragApp) {
                    this._npDragApp.classList.add('np-sheet-drag-active');
                }
                if (this._npDragScrim) {
                    this._npDragScrim.classList.add('np-sheet-scrim-drag');
                }
            }
            if (!this._flushNpSheetDragBound) {
                this._flushNpSheetDragBound = this.flushNpSheetDragFrame.bind(this);
            }
            if (!this.npSheetDragRaf) {
                this.npSheetDragRaf = requestAnimationFrame(this._flushNpSheetDragBound);
            }
        },
        setNpSheetDrag(y) {
            this._npSheetDragY = Math.max(0, y);
            this.cacheNpSheetDragElems();
            if (!this._npSheetDragLive) {
                this._npSheetDragLive = true;
                this.npSheetDragLayer(this._npDragPage);
                this.npSheetDragLayer(this._npDragBgnd);
                if (this._npDragApp) {
                    this._npDragApp.classList.add('np-sheet-drag-active');
                }
                if (this._npDragScrim) {
                    this._npDragScrim.classList.add('np-sheet-scrim-drag');
                }
                // One Vue tick so the handle class can latch; later frames stay off the Vue path.
                this.npSheetDragY = 1;
            }
            if (!this._flushNpSheetDragBound) {
                this._flushNpSheetDragBound = this.flushNpSheetDragFrame.bind(this);
            }
            if (!this.npSheetDragRaf) {
                this.npSheetDragRaf = requestAnimationFrame(this._flushNpSheetDragBound);
            }
        },
        resetNpSheetDrag(animate) {
            this._npSheetDragY = 0;
            this._npSheetDragX = 0;
            if (animate) {
                this.applyNpSheetDragTransform(0, 'transform 0.28s cubic-bezier(0.32, 0.72, 0, 1), -webkit-transform 0.28s cubic-bezier(0.32, 0.72, 0, 1)');
                setTimeout(function() {
                    this.clearNpSheetDrag();
                }.bind(this), 280);
            } else {
                this.clearNpSheetDrag();
            }
        },
        clearNpSheetDrag() {
            if (this._npInertiaRaf) {
                cancelAnimationFrame(this._npInertiaRaf);
                this._npInertiaRaf = 0;
            }
            if (undefined!=this.npSheetDragRaf) {
                cancelAnimationFrame(this.npSheetDragRaf);
                this.npSheetDragRaf = undefined;
            }
            this._npSheetDragLive = false;
            this._npSheetDismissing = false;
            this._npSheetDragY = 0;
            this._npSheetDragX = 0;
            this.npSheetDragY = 0;
            if (this._npDragApp) {
                this._npDragApp.classList.remove('np-sheet-drag-active');
            }
            if (this._npDragScrim) {
                this._npDragScrim.classList.remove('np-sheet-scrim-drag');
            }
            this.clearNpSheetDragStyles();
        },
        /** Top band of artist/album card where swipe-down lowers the sheet. */
        npCardTopPullZoneBottom() {
            // Toolbar + handle + head (kicker/title) region
            let th = 48;
            try {
                let v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--main-toolbar-height'));
                if (!isNaN(v) && v > 0) { th = v; }
            } catch (e) {}
            return th + 22 + 120; // handle ~22 + ~120px head
        },
        npPageTouchStart(ev) {
            // Allow when sheet page is visible (npSheetOpen can lag on some mobile bar modes).
            if (this._npSheetDismissing || (!this.npSheetOpen && !this.showNpSheetPage) || ''!=this.npSheetAnim || !ev.touches || 1!=ev.touches.length) {
                return;
            }
            // Device drawer is modal over the sheet. A touch that still lands
            // here must not start a pull-to-dismiss.
            let ndApp = document.querySelector('.lms-app');
            if (ndApp && ndApp.classList.contains('nd-open')) {
                return;
            }
            if (this.npDetailExpand) {
                return;
            }
            if (ev.target && ev.target.closest && ev.target.closest('.np-queue-controls, .np-detail-expand, .np-detail-fs')) {
                return;
            }
            let x = ev.touches[0].clientX;
            let y = ev.touches[0].clientY;
            // Pull-to-dismiss from the drawer handle.
            if (!this.desktopLayout) {
                let handle = document.querySelector('.np-sheet-handle');
                if (handle) {
                    let hr = handle.getBoundingClientRect();
                    if (y >= hr.top - 4 && y <= hr.bottom + 12) {
                        this.npPageTouch = { x:x, y:y, zone:'handle', fromHandle:true };
                        return;
                    }
                }
            }
            // NP slide: a drag that starts below the top scrolls back up.
            // A second drag, begun already at the top, lowers the sheet.
            // Lateral movement stays with the card swiper so slides snap flush.
            // Cover centre keeps track-change swipe.
            if (!this.desktopLayout && this.npMainSlide===NP_CARD_SLIDE_NP) {
                let t = ev.target;
                let edge = x < window.innerWidth * 0.22 || x > window.innerWidth * 0.78;
                if (t && t.closest) {
                    if (t.closest('.np-slider, .np-playback .v-btn, .np-std-button, #playPauseF, #playPauseFClassic')) {
                        return;
                    }
                    if (this.npDetailsScroll) {
                        let scroller = t.closest('.np-main');
                        if (scroller && scroller.scrollTop>4) {
                            return;
                        }
                    }
                    if (edge && !t.closest('.np-slider')) {
                        this.npPageTouch = { x:x, y:y, zone:'card-edge', fromHandle:false, fromCardTop:true, axis:null };
                        return;
                    }
                    if (t.closest('.np-cover-block, .np-cover-stack')) {
                        return;
                    }
                    if (t.closest('.np-card-swipe-zone, .np-meta-block, .np-controls, #np-track-info, .np-scroll-extra')) {
                        this.npPageTouch = { x:x, y:y, zone:'np-meta', fromHandle:false, fromCardTop:true };
                        return;
                    }
                }
            }
            // Lyrics / artist / album cards: swipe down on top part or right/left edge lowers the sheet.
            // Body scroll never starts a pull (avoids "lower while scrolling").
            if (!this.desktopLayout && this.showMobileInfoCard && this.npMainSlide!==NP_CARD_SLIDE_NP) {
                let t = ev.target;
                let third = window.innerWidth / 3;
                let edgePull = x < third || x > 2 * third;
                if (t && t.closest && t.closest('.np-card-panel-bio, .np-card-panel-sections, .np-info-card-list, .np-card-panel-media, .np-grid-sect, .np-lyrics-slide-body, .np-info-card-lyrics-scroll, .np-lyrics-wrap')) {
                    // Still allow pull when scroll is at top and gesture starts on head/kicker
                    if (!t.closest('.np-card-panel-head, .np-card-panel-kicker, .np-card-panel-title')) {
                        let scrollEl = t.closest('.np-card-panel-scroll');
                        if (scrollEl && scrollEl.scrollTop > 4 && !edgePull) {
                            return;
                        }
                        // Lyrics body at top: allow pull-to-lower from anywhere on card when not scrolled
                        if (scrollEl && scrollEl.scrollTop <= 4 && this.npMainSlide===NP_CARD_SLIDE_LYRICS) {
                            this.npPageTouch = { x:x, y:y, zone:'card-top', fromHandle:false, fromCardTop:true };
                            return;
                        }
                        // Right/left edge: always allow pull-to-lower (instant path)
                        if (edgePull) {
                            this.npPageTouch = { x:x, y:y, zone:'card-edge', fromHandle:false, fromCardTop:true };
                            return;
                        }
                        if (t.closest('.np-card-panel-bio, .np-card-panel-sections, .np-info-card-list, .np-card-panel-media, .np-grid-sect')) {
                            return;
                        }
                    }
                }
                let scrollSel = '#np-page .np-main-slide-album .np-card-panel-scroll';
                if (this.npMainSlide===NP_CARD_SLIDE_QUEUE) {
                    scrollSel = '#np-page .np-main-slide-queue .np-card-panel-scroll';
                } else if (this.npMainSlide===NP_CARD_SLIDE_LYRICS) {
                    scrollSel = '#np-page .np-main-slide-lyrics .np-card-panel-scroll';
                } else if (this.npMainSlide===NP_CARD_SLIDE_ARTIST) {
                    scrollSel = '#np-page .np-main-slide-artist .np-card-panel-scroll';
                }
                let scroll = document.querySelector(scrollSel);
                if (scroll && scroll.scrollTop > 4 && !edgePull) {
                    return;
                }
                if (edgePull || y <= this.npCardTopPullZoneBottom()) {
                    this.npPageTouch = { x:x, y:y, zone: edgePull ? 'card-edge' : 'card-top', fromHandle:false, fromCardTop:true };
                }
            }
            // Centre-third volume is handled by bindNpVolumeListeners() native path.
        },
        npPageTouchMove(ev) {
            if (undefined!=this.npPageTouch && ev.touches && 1==ev.touches.length) {
                let cx = ev.touches[0].clientX;
                let cy = ev.touches[0].clientY;
                let dx = cx - this.npPageTouch.x;
                let dy = cy - this.npPageTouch.y;
                if (this.npPageTouch.fromCardTop && !this.npPageTouch.pulling) {
                    if (this.npPageTouch.zone==='card-edge') {
                        if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
                            // Horizontal card change. Releasing avoids translating the
                            // whole sheet, which left the slide halfway off-screen.
                            this.npPageTouch = undefined;
                            return;
                        } else if (dy > 8 && dy > Math.abs(dx) * 0.85) {
                            this.npPageTouch.axis = 'y';
                            this.npPageTouch.pulling = true;
                        } else {
                            return;
                        }
                    } else {
                        if (dy < 14 || Math.abs(dx) > dy * 0.85) {
                            return;
                        }
                        this.npPageTouch.axis = 'y';
                    }
                }
                if (!this.npPageTouch.axis) {
                    this.npPageTouch.axis = 'y';
                }
                if (this.npPageTouch.axis==='y' && (dy>6 || (this.npPageTouch.fromHandle && dy>2))) {
                    this.npPageTouch.pulling = true;
                }
                if (this.npPageTouch.pulling) {
                    if (ev.cancelable) {
                        try { ev.preventDefault(); } catch (e) {}
                    }
                    let now = (typeof performance!=='undefined' && performance.now) ? performance.now() : Date.now();
                    if (this._npVelT && (now - this._npVelT) > 0 && (now - this._npVelT) < 80) {
                        this._npSheetDragV = (cy - this._npVelY) / (now - this._npVelT);
                        this._npSheetDragVX = (cx - (this._npVelX==null ? cx : this._npVelX)) / (now - this._npVelT);
                    }
                    this._npVelY = cy;
                    this._npVelX = cx;
                    this._npVelT = now;
                    if (this.npPageTouch.axis==='x') {
                        this.setNpSheetDragX(dx);
                    } else {
                        this.setNpSheetDrag(dy);
                    }
                }
            }
        },
        npPageTouchEnd(ev) {
            if (undefined!=this.npPageTouch) {
                let dy = this._npSheetDragY || this.npSheetDragY || 0;
                if (ev && ev.changedTouches && 1==ev.changedTouches.length && this.npPageTouch) {
                    dy = Math.max(dy, ev.changedTouches[0].clientY - this.npPageTouch.y);
                }
                // Suppress the synthetic click after a pull gesture on the handle.
                if (this.npPageTouch.fromHandle && (this.npPageTouch.pulling || dy>6)) {
                    this.npSheetHandleSkipClick = true;
                    setTimeout(function() { this.npSheetHandleSkipClick = false; }.bind(this), 350);
                }
                if (this.npPageTouch.pulling) {
                    if (this.npPageTouch.axis==='x') {
                        let w = window.innerWidth || 400;
                        let dx = this._npSheetDragX || 0;
                        let vx = this._npSheetDragVX || 0;
                        if (Math.abs(dx) > w * 0.18 || Math.abs(vx) > 0.55) {
                            this.finishNpSheetDragDismiss();
                        } else {
                            this._npSheetDragX = 0;
                            this.resetNpSheetDrag(true);
                        }
                    } else {
                        let threshold = Math.min(72, Math.round(window.innerHeight * 0.18));
                        if (dy > threshold) {
                            this.finishNpSheetDragDismiss();
                        } else {
                            this.resetNpSheetDrag(true);
                        }
                    }
                } else if (this.npSheetDragY>0 || this._npSheetDragX) {
                    this.resetNpSheetDrag(true);
                }
                this.npPageTouch = undefined;
                this._npVelY = undefined;
                this._npVelT = 0;
            }
        },
        /**
         * Pixels the sheet must travel to leave the screen. innerHeight alone
         * stops short of the visual viewport / home indicator on iOS.
         */
        npSheetDismissTravel() {
            let page = (this._npDragPage && this._npDragPage.isConnected) ? this._npDragPage : document.getElementById('np-page');
            let boxH = page && page.offsetHeight ? page.offsetHeight : 0;
            let boxW = page && page.offsetWidth ? page.offsetWidth : 0;
            let ih = window.innerHeight || 0;
            let iw = window.innerWidth || 0;
            let vh = 0;
            let vw = 0;
            let vv = window.visualViewport;
            if (vv) {
                vh = (vv.height || 0) + (vv.offsetTop || 0);
                vw = (vv.width || 0) + (vv.offsetLeft || 0);
            }
            return {
                y: Math.max(ih, boxH, vh, 1) + 96,
                x: Math.max(iw, boxW, vw, 1) + 96
            };
        },
        /**
         * Finish pull-to-dismiss from the current drag offset (no snap-to-top delay).
         * A decaying coast (v *= 0.992^dt) dies after ~110px and leaves the sheet
         * 60–100px above the bottom. Ease all the way off screen instead.
         */
        finishNpSheetDragDismiss() {
            if (this._npInertiaRaf) {
                cancelAnimationFrame(this._npInertiaRaf);
                this._npInertiaRaf = 0;
            }
            if (undefined!=this.npSheetDragRaf) {
                cancelAnimationFrame(this.npSheetDragRaf);
                this.npSheetDragRaf = undefined;
            }
            let travel = this.npSheetDismissTravel();
            let h = travel.y;
            let w = travel.x;
            let axis = (this.npPageTouch && this.npPageTouch.axis==='x') ? 'x' : 'y';
            let y = Math.max(this._npSheetDragY || 0, 0);
            let x = this._npSheetDragX || 0;
            if (axis==='y' && y < 24) {
                this.clearNpSheetDrag();
                this.collapseNpSheetRestore();
                return;
            }
            if (axis==='x' && Math.abs(x) < 12) {
                this._npSheetDragX = 0;
                this.resetNpSheetDrag(true);
                return;
            }
            let v = axis==='x' ? (this._npSheetDragVX || 0) : (this._npSheetDragV || 0);
            this._npSheetDragV = 0;
            this._npSheetDragVX = 0;
            this._npVelT = 0;
            let targetX = x < 0 ? -w : w;
            let targetY = h;
            let dist = axis==='x' ? Math.abs(targetX - x) : Math.max(0, targetY - y);
            let speed = Math.abs(v);
            if (!(speed > 0.6)) {
                speed = 1.8;
            }
            let dur = dist / speed;
            if (dur < 120) { dur = 120; }
            if (dur > 260) { dur = 260; }
            this._npSheetDismissing = true;
            let self = this;
            let t0 = (typeof performance!=='undefined' && performance.now) ? performance.now() : Date.now();
            let y0 = y;
            let x0 = x;
            let step = function(now) {
                if (!self._npSheetDismissing) {
                    self._npInertiaRaf = 0;
                    return;
                }
                let t = dur > 0 ? Math.min(1, (now - t0) / dur) : 1;
                let e = 1 - (1 - t) * (1 - t);
                if (axis==='x') {
                    x = x0 + (targetX - x0) * e;
                    y = 0;
                } else {
                    y = y0 + (targetY - y0) * e;
                    x = 0;
                }
                self._npSheetDragX = x;
                self._npSheetDragY = y;
                self.applyNpSheetDragTransform(y);
                if (t >= 1) {
                    self._npInertiaRaf = 0;
                    self.collapseNpSheetImmediate();
                    self.$nextTick(function() {
                        if (!self.npSheetActive) {
                            self.clearNpSheetDrag();
                        }
                    });
                    return;
                }
                self._npInertiaRaf = requestAnimationFrame(step);
            };
            this._npInertiaRaf = requestAnimationFrame(step);
        },
        /** Close sheet without waiting for exit CSS (already off-screen from drag). */
        collapseNpSheetImmediate() {
            if (!this.npSheetOpen && 'collapse'!=this.npSheetAnim) {
                return;
            }
            this.clearNpSheetTimer();
            this.resetNpSheetCollapse();
            let page = this.npSheetReturnPage;
            if (undefined==page || ''==page || 'now-playing'==page) {
                page = this.$store.state.npSheetReturnPage;
            }
            if (undefined==page || ''==page || 'now-playing'==page) {
                page = this.$store.state.prevPage;
            }
            if (undefined==page || ''==page || 'now-playing'==page) {
                page = 'browse';
            }
            let useOverlay = this.desktopLayout || MBAR_NONE!=this.mobileBar;
            this.npSheetAnim = '';
            this.npSheetOpen = false;
            this.$store.commit('setNpSheetOpen', false);
            this.updateSheetPaletteClass();
            this.clearDockFooterDrag();
            if (this.desktopLayout) {
                this.largeView = false;
                if (undefined!=page && !this.$store.state.pinQueue) {
                    this.$store.commit('setShowQueue', 'queue'==page);
                }
            } else if (useOverlay && undefined!=page) {
                if (page!=this.$store.state.page) {
                    this.$store.commit('setPage', page);
                } else {
                    bus.$emit('pageChanged', page);
                }
            } else if (undefined!=page && page!=this.$store.state.page) {
                this.$store.commit('setPage', page);
            }
            this.npCollapseTarget = undefined;
            this.npSheetReturnPage = undefined;
            // Miniplayer slides back in quickly
            if (!this.desktopLayout && MBAR_NONE!=this.mobileBar) {
                this.npBarSheetAnim = 'enter';
                this.npBarSheetTimer = setTimeout(function() {
                    this.npBarSheetAnim = '';
                    this.npBarSheetTimer = undefined;
                }.bind(this), 280);
            } else {
                this.npBarSheetAnim = '';
            }
        },
        /** Volume swipe is only on the now-playing slide (not lyrics/artist/album). */
        npVolumeSwipeAllowedAt(x, y) {
            if (!this.canSwipeVolume()) {
                return false;
            }
            // Never on lyrics / artist / album cards
            if (this.showMobileInfoCard && this.npMainSlide!==NP_CARD_SLIDE_NP) {
                return false;
            }
            if ('center'!=this.npPageTouchZone(x)) {
                return false;
            }
            let handle = document.querySelector('.np-sheet-handle');
            if (handle) {
                let hr = handle.getBoundingClientRect();
                if (y >= hr.top - 4 && y <= hr.bottom + 12) {
                    return false;
                }
            }
            // Avoid volume gestures over transport controls near the bottom
            if (this.showMobileInfoCard) {
                let controls = document.querySelector('#np-page .np-main-slide-np .np-controls');
                if (controls) {
                    let cr = controls.getBoundingClientRect();
                    if (y >= cr.top - 4) {
                        return false;
                    }
                }
            } else if (y > window.innerHeight - 150) {
                // Classic sheet: keep bottom transport free
                return false;
            }
            return true;
        },
        bindNpVolumeListeners() {
            let el = document.getElementById('np-page');
            if (!el || el._npVolPageBound) {
                return;
            }
            let self = this;
            this._npVolPageStart = function(ev) {
                if (!ev.touches || 1!=ev.touches.length) {
                    return;
                }
                let y = ev.touches[0].clientY;
                let x = ev.touches[0].clientX;
                if (!self.npVolumeSwipeAllowedAt(x, y)) {
                    return;
                }
                self.touch = {x:x, y:y, moving:false};
                self.lastSentVolume = -1;
            };
            this._npVolPageMove = function(ev) {
                if (!self.touch || !ev.touches || 1!=ev.touches.length) {
                    return;
                }
                if (self.touch.moving && ev.cancelable) {
                    try { ev.preventDefault(); } catch (e) {}
                }
                self.touchMoving(ev);
            };
            this._npVolPageEnd = function(ev) {
                if (self.touch) {
                    self.touchEnd();
                }
            };
            el.addEventListener('touchstart', this._npVolPageStart, {capture:false, passive:true});
            el.addEventListener('touchmove', this._npVolPageMove, {capture:false, passive:false});
            el.addEventListener('touchend', this._npVolPageEnd, {capture:false, passive:true});
            el.addEventListener('touchcancel', this._npVolPageEnd, {capture:false, passive:true});
            el._npVolPageBound = true;
            this.bindNpSheetHandleListeners();
        },
        bindNpSheetHandleListeners() {
            let handle = document.querySelector('#np-page .np-sheet-handle');
            if (!handle || handle._npHandleBound) {
                return;
            }
            let self = this;
            this._npHandleStartN = function(ev) { self.npHandleTouchStart(ev); };
            this._npHandleMoveN = function(ev) { self.npHandleTouchMove(ev); };
            this._npHandleEndN = function(ev) { self.npHandleTouchEnd(ev); };
            handle.addEventListener('touchstart', this._npHandleStartN, {capture:true, passive:true});
            handle.addEventListener('touchmove', this._npHandleMoveN, {capture:true, passive:false});
            handle.addEventListener('touchend', this._npHandleEndN, {capture:true, passive:true});
            handle.addEventListener('touchcancel', this._npHandleEndN, {capture:true, passive:true});
            handle._npHandleBound = true;
        },
        unbindNpVolumeListeners() {
            let el = document.getElementById('np-page');
            if (!el || !el._npVolPageBound) {
                return;
            }
            el.removeEventListener('touchstart', this._npVolPageStart, false);
            try {
                el.removeEventListener('touchmove', this._npVolPageMove, {capture:false});
            } catch (e) {
                el.removeEventListener('touchmove', this._npVolPageMove, false);
            }
            el.removeEventListener('touchend', this._npVolPageEnd, false);
            el.removeEventListener('touchcancel', this._npVolPageEnd, false);
            el._npVolPageBound = false;
            this.unbindNpSheetHandleListeners();
        },
        unbindNpSheetHandleListeners() {
            let handle = document.querySelector('#np-page .np-sheet-handle');
            if (!handle || !handle._npHandleBound) {
                return;
            }
            try {
                handle.removeEventListener('touchstart', this._npHandleStartN, true);
                handle.removeEventListener('touchmove', this._npHandleMoveN, true);
                handle.removeEventListener('touchend', this._npHandleEndN, true);
                handle.removeEventListener('touchcancel', this._npHandleEndN, true);
            } catch (e) {}
            handle._npHandleBound = false;
        },
        npSheetHandleClick() {
            if (this.npSheetHandleSkipClick || ''!=this.npSheetAnim) {
                return;
            }
            this.collapseNpSheetRestore();
        },
        expandNpSheet() {
            this.resetNpSheetCollapse();
            this._npCardUserSwiped = false;
            this._npCardDataReady = false;
            if (this.npSheetOpen || ''!=this.npSheetAnim) {
                return;
            }
            // Lyrics / artist / album bodies mount on first visit, not during the open frame.
            this.npCardHeavyReady = false;
            if (this.desktopLayout && window.innerHeight<LMS_MIN_NP_LARGE_INFO_HEIGHT) {
                return;
            }
            if (this.info.show) {
                this.info.show = false;
            }
            if (!this.desktopLayout && MBAR_NONE==this.mobileBar) {
                this.npSheetOpen = true;
                this.$store.commit('setNpSheetOpen', true);
                this.$store.commit('setPage', 'now-playing');
                if (typeof npParallaxTryEnableFromGesture === 'function') {
                    npParallaxTryEnableFromGesture();
                }
                return;
            }
            if (this.desktopLayout) {
                this.npSheetReturnPage = this.$store.state.pinQueue || !this.$store.state.showQueue ? 'browse' : 'queue';
            } else {
                this.npSheetReturnPage = this.$store.state.page;
            }
            this.$store.commit('setNpSheetReturnPage', this.npSheetReturnPage);
            this.clearNpSheetTimer();
            this.npBarSheetAnim = '';
            this.npSheetAnim = 'expand';
            this.npSheetOpen = true;
            this.$store.commit('setNpSheetOpen', true);
            if (this.desktopLayout) {
                this.largeView = true;
            }
            this.npSheetTimer = setTimeout(function() {
                this.npSheetAnim = '';
                this.npSheetTimer = undefined;
            }.bind(this), 420);
            if (!this.desktopLayout && typeof npParallaxTryEnableFromGesture === 'function') {
                npParallaxTryEnableFromGesture();
            }
        },
        collapseNpSheetRestore() {
            this.resetNpSheetCollapse();
            let page = this.npSheetReturnPage;
            if (undefined==page || ''==page || 'now-playing'==page) {
                page = this.$store.state.npSheetReturnPage;
            }
            if (undefined==page || ''==page || 'now-playing'==page) {
                page = this.$store.state.prevPage;
            }
            if (undefined==page || ''==page || 'now-playing'==page) {
                page = 'browse';
            }
            this.collapseNpSheet(page);
        },
        collapseNpSheet(targetPage) {
            if (!this.npSheetOpen) {
                return;
            }
            if (''!=this.npSheetAnim) {
                this.clearNpSheetTimer();
                this.npSheetAnim = '';
            }
            let useOverlay = this.desktopLayout || MBAR_NONE!=this.mobileBar;
            let page = targetPage;
            if (useOverlay) {
                if (undefined==page || ''==page || 'now-playing'==page) {
                    page = this.npSheetReturnPage;
                }
                if (undefined==page || ''==page || 'now-playing'==page) {
                    page = this.$store.state.npSheetReturnPage;
                }
                if (undefined==page || ''==page || 'now-playing'==page) {
                    page = 'browse';
                }
                this.npCollapseTarget = page;
            } else {
                if (undefined==page || ''==page) {
                    page = this.$store.state.prevPage;
                }
                if (undefined==page || 'now-playing'==page) {
                    page = 'browse';
                }
                this.npCollapseTarget = page;
            }
            this.clearNpSheetDrag();
            this.npBarSheetAnim = '';
            this.npSheetAnim = 'collapse';
            // Match CSS npPageSheetOut (0.32s) — was 360ms and felt laggy after pull gestures
            this.npSheetTimer = setTimeout(function() {
                let restorePage = this.npCollapseTarget;
                this.npSheetAnim = '';
                this.npSheetOpen = false;
                this.$store.commit('setNpSheetOpen', false);
                this.updateSheetPaletteClass();
                // Ensure shortcut footer is not left covering browse after sheet closes
                this.clearDockFooterDrag();
                if (this.desktopLayout) {
                    this.largeView = false;
                    if (undefined!=restorePage && !this.$store.state.pinQueue) {
                        this.$store.commit('setShowQueue', 'queue'==restorePage);
                    }
                } else if (useOverlay && undefined!=restorePage) {
                    if (restorePage!=this.$store.state.page) {
                        this.$store.commit('setPage', restorePage);
                    } else {
                        bus.$emit('pageChanged', restorePage);
                    }
                } else if (undefined!=restorePage && restorePage!=this.$store.state.page) {
                    this.$store.commit('setPage', restorePage);
                }
                this.npSheetAnim = '';
                this.npCollapseTarget = undefined;
                this.npSheetReturnPage = undefined;
                this.npSheetTimer = undefined;
                if (!this.desktopLayout && MBAR_NONE!=this.mobileBar) {
                    this.npBarSheetAnim = 'enter';
                    this.npBarSheetTimer = setTimeout(function() {
                        this.npBarSheetAnim = '';
                        this.npBarSheetTimer = undefined;
                    }.bind(this), 280);
                } else {
                    this.npBarSheetAnim = '';
                }
            }.bind(this), 300);
        },
        collapseNpSheetTo(page) {
            this.collapseNpSheet(page);
        },
        clearNpSheetTimer() {
            if (undefined!=this.npSheetTimer) {
                clearTimeout(this.npSheetTimer);
                this.npSheetTimer = undefined;
            }
            if (undefined!=this.npBarSheetTimer) {
                clearTimeout(this.npBarSheetTimer);
                this.npBarSheetTimer = undefined;
            }
            this.npBarSheetAnim = '';
            if (undefined!=this.npBarWheelTimer) {
                clearTimeout(this.npBarWheelTimer);
                this.npBarWheelTimer = undefined;
                this.npBarWheelAccum = 0;
            }
            if (undefined!=this.npPageWheelTimer) {
                clearTimeout(this.npPageWheelTimer);
                this.npPageWheelTimer = undefined;
                this.npPageWheelAccum = 0;
            }
            if (undefined!=this.npCardWheelTimer) {
                clearTimeout(this.npCardWheelTimer);
                this.npCardWheelTimer = undefined;
                this.npCardWheelAccum = 0;
            }
        },
        clearClickTimeout() {
            if (this.clickTimer) {
                clearTimeout(this.clickTimer);
                this.clickTimer = undefined;
            }
        },
        stopShowOverlayTimeout() {
            clearTimeout(this.showOverlayTimer);
            this.showOverlayTimer=undefined;
        },
        resetShowOverlayTimeout() {
            if (this.desktopLayout) {
                return;
            }
            this.showOverlay = true;
            clearTimeout(this.showOverlayTimer);
            this.showOverlayTimer = setTimeout(function () {
                this.clearShowOverlayTimeout();
            }.bind(this), 3*1000);
        },
        clearShowOverlayTimeout() {
            if (this.showOverlayTimer) {
                clearTimeout(this.showOverlayTimer);
                this.showOverlayTimer = undefined;
            }
            if (!this.desktopLayout) {
                this.showOverlay = false;
                this.touchStopped();
            }
        },
        npCoverMouseEnter() {
            if (!this.desktopLayout) {
                return;
            }
            this.stopShowOverlayTimeout();
            this.npCoverHover = true;
        },
        npCoverMouseLeave() {
            if (!this.desktopLayout) {
                return;
            }
            this.npCoverHover = false;
        },
        currentVolume() {
            // view.volume is set non-reactively in nowplayingOnPlayerStatus
            let v = this.volume;
            if (undefined==v || null==v || isNaN(v)) {
                let p = this.$store.state.player;
                v = p && undefined!=p.volume ? p.volume : 0;
            }
            return Math.abs(v);
        },
        canSwipeVolume() {
            // dvc may be missing on some status payloads — treat as standard if unset
            let dvc = this.playerStatus.dvc;
            if (undefined==dvc || null==dvc) {
                dvc = VOL_STD;
            }
            // Only block when volume is fixed/hidden. Require swipeVolume UI setting.
            return !!this.$store.state.swipeVolume && VOL_STD==dvc && !this.npOrientSettling;
        },
        touchStart(event) {
            if (typeof npParallaxTryEnableFromGesture === 'function') {
                npParallaxTryEnableFromGesture();
            }
            // Cover art volume (baseline Material). Centre-third also via bindNpVolumeListeners.
            // Restricted to NP slide and region above lyrics when swipe-volume is on.
            if (!event.touches || 0==event.touches.length) {
                return;
            }
            let x = event.touches[0].clientX;
            let y = event.touches[0].clientY;
            if (!this.npVolumeSwipeAllowedAt(x, y)) {
                return;
            }
            this.touch={x:x, y:y, moving:false};
            this.lastSentVolume=-1;
        },
        touchEnd() {
            if (this.touch && this.touch.moving && this.overlayVolume>=0 && this.overlayVolume!=this.lastSentVolume) {
                bus.$emit('playerCommand', ["mixer", "volume", this.overlayVolume]);
            }
            this.touchStopped();
        },
        touchStopped() {
            this.touch=undefined;
            this.overlayVolume=-1;
            this.lastSentVolume=-1;
            this.cancelSendVolumeTimer();
            bus.$emit('volumePreview', -1);
        },
        touchMoving(event) {
            if (undefined==this.touch || !event.touches || 0==event.touches.length) {
                return;
            }
            let tx = event.touches[0].clientX;
            let ty = event.touches[0].clientY;
            // Keep gesture mostly vertical
            if (Math.abs(tx-this.touch.x)>72) {
                return;
            }
            if (!this.touch.moving && Math.abs(ty-this.touch.y)>6) {
                this.touch.moving=true;
                this.overlayVolume=this.currentVolume();
                this.lastSentVolume=this.overlayVolume;
                bus.$emit('volumePreview', this.overlayVolume);
            }
            const VOL_STEP_PX = 18;
            if (this.touch.moving && Math.abs(ty-this.touch.y)>=VOL_STEP_PX) {
                var steps = Math.floor(Math.abs(ty-this.touch.y) / VOL_STEP_PX);
                if (steps>0) {
                    var inc = ty<this.touch.y;
                    if (typeof adjustVolume !== 'function') {
                        // Fallback if deferred utils not loaded yet
                        this.overlayVolume = Math.max(0, Math.min(100, this.overlayVolume + (inc ? steps : -steps)));
                    } else {
                        for (var i=0; i<steps; ++i) {
                            this.overlayVolume = adjustVolume(Math.abs(this.overlayVolume), inc);
                            if (this.overlayVolume<0) {
                                this.overlayVolume=0;
                                break;
                            } else if (this.overlayVolume>100) {
                                this.overlayVolume=100;
                                break;
                            }
                        }
                    }
                    this.touch.y += steps*VOL_STEP_PX*(inc ? -1 : 1);
                    bus.$emit('volumePreview', this.overlayVolume);
                    this.resetSendVolumeTimer();
                }
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
                if (this.overlayVolume!=this.lastSentVolume) {
                    bus.$emit('playerCommand', ["mixer", "volume", this.overlayVolume]);
                    this.lastSentVolume=this.overlayVolume;
                }
            }.bind(this), LMS_VOLUME_DEBOUNCE);
        },
        checkWindowSize() {
            if (this.npOrientSettling) {
                this.scheduleOrientApply();
                return;
            }
            this.checkLandscape();
            this.sizeCheckDelay = 0;
            if (window.innerHeight<LMS_MIN_NP_LARGE_INFO_HEIGHT) {
                if (this.npSheetOpen) {
                    this.collapseNpSheetRestore();
                }
                this.info.show = false;
            }
            if (this.$store.state.desktopLayout && this.info.show && !this.info.expanded) {
                let saved = parseInt(getLocalStorageVal('infoPanelW', this.infoPanelWidthBounds().def), 10);
                this.applyInfoPanelWidth(isNaN(saved) ? this.infoPanelWidthBounds().def : saved, false);
            }
        },
        computeLandscapeLayout() {
            // wide=0 => controls under whole width
            // wide=2 => controls under text only
            if (undefined==this.navPad) {
                let val = parseInt(window.getComputedStyle(document.documentElement).getPropertyValue('--sab').replace('px', ''));
                this.navPad = undefined==val || isNaN(val) ? 0 : val;
            }
            let whRatio = window.innerWidth>1000 ? 0.575 : 0.5;
            let maxImgHeight = window.innerHeight - (this.$store.state.desktopLayout ? 50 : (this.navPad + 102));
            let maxImgWidth = (window.innerWidth*whRatio)-32;
            let landscape = window.innerWidth >= (window.innerHeight*queryParams.npRatio) && window.innerWidth>=450;
            let wide = window.innerWidth>=600 &&
                        window.innerWidth>=(window.innerHeight*1.25) &&
                        maxImgWidth>=maxImgHeight
                            ? 2 /*: window.innerHeight>340 ? 1*/ : 0;
            let windowWidth = Math.floor(window.innerWidth / 25) * 25;
            return { landscape:landscape, wide:wide, windowWidth:windowWidth };
        },
        prefersReducedMotion() {
            try {
                return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            } catch (e) {
                return false;
            }
        },
        npSheetVisibleForOrient() {
            return (this.npSheetOpen || this.npSheetActive) && !this.info.show && this.showNpSheetPage;
        },
        applyLandscapeLayout(layout) {
            this.landscape = layout.landscape;
            this.wide = layout.wide;
            this.windowWidth = layout.windowWidth;
            bus.$emit('nowPlayingWide', this.wide);
        },
        clearOrientTimers() {
            if (undefined!=this.npOrientTimer) {
                clearTimeout(this.npOrientTimer);
                this.npOrientTimer = undefined;
            }
            if (undefined!=this.npOrientRevealTimer) {
                clearTimeout(this.npOrientRevealTimer);
                this.npOrientRevealTimer = undefined;
            }
        },
        orientSettleMs() {
            // iOS rotation is multi-step; SE / LyrPlay WKWebView needs a longer hold.
            return IS_IOS ? 520 : 320;
        },
        beginOrientSettle() {
            if (this.prefersReducedMotion()) {
                this.clearOrientTimers();
                this.npOrientSettling = false;
                this.applyLandscapeLayout(this.computeLandscapeLayout());
                this.sizeCheckDelay = 0;
                return;
            }
            if (!this.npSheetVisibleForOrient()) {
                // Sheet not showing: still coalesce landscape recompute once.
                this.clearOrientTimers();
                this.npOrientTimer = setTimeout(function() {
                    this.npOrientTimer = undefined;
                    this.applyLandscapeLayout(this.computeLandscapeLayout());
                    this.sizeCheckDelay = 0;
                }.bind(this), this.orientSettleMs());
                return;
            }
            // Full-viewport solid veil while metrics thrash; one layout apply after settle.
            if (!this.npOrientSettling) {
                this.npOrientSettling = true;
            }
            this.scheduleOrientApply();
        },
        scheduleOrientApply() {
            if (undefined!=this.npOrientTimer) {
                clearTimeout(this.npOrientTimer);
            }
            // Reset timer on each intermediate resize so we apply only after motion stops.
            this.npOrientTimer = setTimeout(function() {
                this.npOrientTimer = undefined;
                this.finishOrientSettle();
            }.bind(this), this.orientSettleMs());
        },
        finishOrientSettle() {
            let layout = this.computeLandscapeLayout();
            this.applyLandscapeLayout(layout);
            this.sizeCheckDelay = 0;
            this._lastAspect = window.innerWidth / Math.max(1, window.innerHeight);
            this._lastOrientLandscape = window.innerWidth >= window.innerHeight;
            // Keep veil until the new tree has painted, then drop once (no second layout pass).
            this.$nextTick(function() {
                requestAnimationFrame(function() {
                    requestAnimationFrame(function() {
                        if (undefined!=this.npOrientRevealTimer) {
                            clearTimeout(this.npOrientRevealTimer);
                        }
                        // Extra beat on iOS so WebKit finishes compositing under the veil.
                        this.npOrientRevealTimer = setTimeout(function() {
                            this.npOrientRevealTimer = undefined;
                            this.npOrientSettling = false;
                        }.bind(this), IS_IOS ? 80 : 0);
                    }.bind(this));
                }.bind(this));
            }.bind(this));
        },
        checkLandscape() {
            if (this.npOrientSettling) {
                this.scheduleOrientApply();
                return;
            }
            let next = this.computeLandscapeLayout();
            let layoutChanged = next.landscape!=this.landscape || next.wide!=this.wide;
            if (!layoutChanged) {
                this.windowWidth = next.windowWidth;
                return;
            }
            // Unexpected layout flip (or missed orient event): veiled settle, never hard-swap.
            if (this.npSheetVisibleForOrient() && !this.prefersReducedMotion()) {
                this.beginOrientSettle();
                return;
            }
            this.applyLandscapeLayout(next);
        },
        itemClicked(tab, section, index, event) {
            nowplayingItemClicked(this, tab, section, index, event);
        },
        moreClicked(tab, section) {
            nowplayingMoreClicked(this, tab, section);
        },
        toggleGrid(tab, section) {
            nowplayingToggleGrid(this, tab, section);
        },
        updateSheetPaletteClass() {
            let root = document.querySelector('.lms-app');
            if (root) {
                let palette = this.npSheetPaletteActive && ''!=this.npBarArtUrl;
                root.classList.toggle('np-sheet-palette', palette);
                root.classList.toggle('np-sheet-open', this.npSheetActive);
                root.classList.toggle('np-sheet-open-mobile', !this.desktopLayout && this.npSheetPaletteActive);
                root.classList.toggle('np-sheet-open-desktop', this.desktopLayout && this.npSheetPaletteActive);
            }
        },
        controlBar(force) {
            let hasTracks = !this.disableBtns;
            if (hasTracks!=this.npBarHeightActive || force) {
                this.npBarHeightActive = hasTracks;
                let mbar = this.$store.state.mobileBar;
                let desktopLayout = this.$store.state.desktopLayout;
                // Desktop: can collapse bar when empty. Mobile: keep banner height so
                // nav / shortcut drawer remain reachable after queue clear.
                document.documentElement.style.setProperty('--desktop-npbar-height',
                    !hasTracks ? '0px' : this.desktopBarHeight);
                let mobileH = '0px';
                if (MBAR_NONE!=mbar) {
                    if (hasTracks || !desktopLayout) {
                        mobileH = MBAR_THIN==mbar
                            ? this.mobileBarThinHeight
                            : MBAR_THICK==mbar
                                ? this.mobileBarThickHeight
                                : (this.mobileBarRepNavHeight + "px");
                    }
                }
                document.documentElement.style.setProperty('--mobile-npbar-height', mobileH);
                /*
                 * Shortcut / bottom-nav strip height tracks miniplayer mode:
                 *  Slim (thin)  → 44px  (compact but still touchable)
                 *  Medium       → 48px  (matches standard toolbars)
                 *  Large/classic→ 52px  (CSS default)
                 */
                if (!desktopLayout && (MBAR_THIN==mbar || MBAR_THICK==mbar)) {
                    document.documentElement.style.setProperty(
                        '--bottom-nav-content-height',
                        MBAR_THIN==mbar ? '44px' : '48px');
                } else {
                    document.documentElement.style.removeProperty('--bottom-nav-content-height');
                }
                // Dock metrics depend on strip height — drop any cached range
                this._npBarDockMetrics = undefined;
                document.documentElement.style.setProperty('--npbar-border-color',
                    (!hasTracks && desktopLayout) ? 'transparent' : 'var(--bottom-toolbar-border-color)');
                if (desktopLayout) {
                    document.documentElement.style.removeProperty('--bottom-toolbar-height');
                    document.documentElement.style.removeProperty('--bottom-nav-content-height');
                }
                this.scheduleNpBarMarquee();
            }
        },
        showTimeTooltip() {
            this.startTooltipTimeout();
            this.timeTooltip.show = true;
        },
        hideTimeTooltip() {
            this.timeTooltip.show = false;
            this.cancelTooltipTimeout();
        },
        startTooltipTimeout() {
            this.cancelTooltipTimeout();
            this.timeTooltip.timeout = setTimeout(function () {
                this.hideTimeTooltip();
            }.bind(this), 2000);
        },
        cancelTooltipTimeout() {
            if (undefined!==this.timeTooltip.timeout) {
                clearTimeout(this.timeTooltip.timeout);
                this.timeTooltip.timeout = undefined;
            }
        },
        tabChanged(tab) {
            setLocalStorageVal("nptab", tab);
            if (TRACK_TAB==tab) {
                this.resetLyricsTracking();
                this.scheduleLyricsPositionUpdate(50);
            }
        },
        showConfigMenu(event) {
            nowPlayingConfigMenu(this, event);
        },
        openFullInfo() {
            if (!this.playerStatus.current || !this.playerStatus.current.id) {
                return;
            }
            if (!this.info.show) {
                this.info.show = true;
            }
        },
        toggleInfoExpanded() {
            if (!this.desktopLayout || !this.info.show) {
                this.info.expanded = !this.info.expanded;
                return;
            }
            if (this.info.expanded) {
                this.collapseInfoExpanded();
            } else {
                this.expandInfoExpanded();
            }
        },
        expandInfoExpanded() {
            if (!this.desktopLayout || !this.info.show || this.info.expanded) {
                return;
            }
            this.info.expanded = true;
            this.startInfoExpandAnim('in', 400);
        },
        collapseInfoExpanded() {
            if (!this.desktopLayout || !this.info.show || !this.info.expanded || this.infoExpandCollapsePending) {
                return;
            }
            this.infoExpandCollapsePending = true;
            if (this.infoExpandCollapseTimer) {
                clearTimeout(this.infoExpandCollapseTimer);
            }
            this.startInfoExpandAnim('out', 0);
            this.infoExpandCollapseTimer = setTimeout(function() {
                this.info.expanded = false;
                this.infoExpandAnim = false;
                this.infoExpandCollapseTimer = undefined;
                this.$nextTick(function() {
                    this.startInfoExpandAnim('in', 400);
                    this.infoExpandCollapsePending = false;
                }.bind(this));
            }.bind(this), 300);
        },
        maiArtistImageLoaded(ev) {
            // Extract palette for desktop MAI *and* mobile artist card (info.show is false on card).
            if (undefined==ev || undefined==ev.target) {
                return;
            }
            let img = ev.target;
            if (!img.complete || !img.naturalWidth) {
                return;
            }
            this.extractMaiArtistPalette(img);
        },
        extractMaiArtistPalette(img) {
            if (undefined==img || !img.naturalWidth) {
                return;
            }
            let darkUi = this.darkUi;
            let swatches = undefined;
            let vRgb = undefined;
            try {
                let vibrant = new Vibrant(img);
                swatches = vibrant.swatches();
                let desired = darkUi
                    ? ["Vibrant", "LightVibrant", "Muted", "LightMuted", "DarkVibrant", "DarkMuted"]
                    : ["Vibrant", "DarkVibrant", "Muted", "DarkMuted", "LightVibrant", "LightMuted"];
                for (let d=0, len=desired.length; d<len && undefined==vRgb; ++d) {
                    vRgb = swatchRgb(swatches, desired[d]);
                }
            } catch (e) {
            }
            if (undefined==this.maiFac) {
                this.maiFac = new FastAverageColor();
            }
            this.maiFac.getColorAsync(img, {mode:'precision'}).then(function(color) {
                let rgbs = color.rgb.replace('rgb(', '').replace(')', '').split(',');
                let avRgb = [parseInt(rgbs[0]), parseInt(rgbs[1]), parseInt(rgbs[2])];
                let palette = extractPalette(swatches, darkUi, avRgb);
                this.maiArtistPalette = {active:true, url:img.currentSrc || img.src};
                this.applyMaiArtistPalette(palette);
            }.bind(this)).catch(function() {
                this.clearMaiArtistPalette();
            }.bind(this));
        },
        applyMaiArtistPalette(palette) {
            if (!palette) {
                return;
            }
            document.documentElement.style.setProperty('--np-mai-palette-1', morphRgb2Hex(palette[0]));
            document.documentElement.style.setProperty('--np-mai-palette-2', morphRgb2Hex(palette[1]));
            document.documentElement.style.setProperty('--np-mai-palette-3', morphRgb2Hex(palette[2]));
        },
        clearMaiArtistPalette() {
            this.maiArtistPalette = {active:false, url:''};
            document.documentElement.style.removeProperty('--np-mai-palette-1');
            document.documentElement.style.removeProperty('--np-mai-palette-2');
            document.documentElement.style.removeProperty('--np-mai-palette-3');
        },
        refreshMaiArtistPalette() {
            if (!this.info.show && !(this.showMobileInfoCard && this.npMainSlide===NP_CARD_SLIDE_ARTIST)) {
                return;
            }
            let imgs = document.querySelectorAll('.np-mai-artist-img, .np-card-panel-artist-img');
            for (let i=0, len=imgs.length; i<len; ++i) {
                if (imgs[i].complete && imgs[i].naturalWidth) {
                    this.extractMaiArtistPalette(imgs[i]);
                    return;
                }
            }
        },
        startInfoExpandAnim(direction, clearMs) {
            if (this.infoExpandAnimTimer) {
                clearTimeout(this.infoExpandAnimTimer);
                this.infoExpandAnimTimer = undefined;
            }
            this.infoExpandAnim = direction;
            if (undefined!==clearMs && clearMs>0) {
                this.infoExpandAnimTimer = setTimeout(function() {
                    this.infoExpandAnim = false;
                    this.infoExpandAnimTimer = undefined;
                }.bind(this), clearMs);
            }
        },
        closeInfoAnimated() {
            if (!this.info.show || this.infoDrawerOut) {
                return;
            }
            this.infoDrawerOut = true;
            if (this.infoDrawerOutTimer) {
                clearTimeout(this.infoDrawerOutTimer);
            }
            this.infoDrawerOutTimer = setTimeout(function() {
                this.info.show = false;
                this.infoDrawerOut = false;
                this.infoDrawerOutTimer = undefined;
            }.bind(this), 280);
        },
        retractInfo() {
            if (!this.info.show || !this.desktopLayout) {
                return;
            }
            if (this.infoDrawerOut) {
                return;
            }
            if (this.menu.show) {
                this.menu.show = false;
                return;
            }
            if (this.info.expanded) {
                this.collapseInfoExpanded();
            } else {
                this.closeInfoAnimated();
            }
        },
        infoPanelWidthBounds() {
            let max = Math.min(1000, Math.floor(window.innerWidth * 0.75));
            let min = 280;
            let def = 420;
            if (max < min + 80) {
                max = min + 80;
            }
            return { min: min, max: max, def: def };
        },
        applyInfoPanelWidth(px, persist) {
            let b = this.infoPanelWidthBounds();
            let w = Math.max(b.min, Math.min(b.max, Math.round(px)));
            document.documentElement.style.setProperty('--np-info-panel-width', w + 'px');
            if (persist) {
                setLocalStorageVal('infoPanelW', w);
            }
            return w;
        },
        initInfoPanelWidth() {
            if (!this.$store.state.desktopLayout) {
                return;
            }
            let b = this.infoPanelWidthBounds();
            let saved = parseInt(getLocalStorageVal('infoPanelW', b.def), 10);
            if (isNaN(saved) || saved < b.min) {
                saved = b.def;
            }
            this.applyInfoPanelWidth(saved, false);
        },
        infoPanelResizeStart(ev) {
            if (this.infoPanelResizing || this.info.expanded || !this.desktopLayout) {
                return;
            }
            if (!this._infoPanelResizeMoveBound) {
                this._infoPanelResizeMoveBound = this.infoPanelResizeMove.bind(this);
                this._infoPanelResizeEndBound = this.infoPanelResizeEnd.bind(this);
            }
            this.infoPanelResizing = true;
            let pageX = ev.pageX || ev.clientX;
            if (undefined==pageX && ev.touches && ev.touches[0]) {
                pageX = ev.touches[0].pageX || ev.touches[0].clientX;
            }
            let cur = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--np-info-panel-width'), 10);
            let b = this.infoPanelWidthBounds();
            if (isNaN(cur) || cur < b.min) {
                cur = b.def;
            }
            this.infoPanelResize = { startX: pageX, startW: cur, updated: cur };
            document.documentElement.classList.add('np-info-panel-resizing');
            window.addEventListener('mousemove', this._infoPanelResizeMoveBound, false);
            window.addEventListener('touchmove', this._infoPanelResizeMoveBound, { passive: false });
            window.addEventListener('mouseup', this._infoPanelResizeEndBound, false);
            window.addEventListener('touchend', this._infoPanelResizeEndBound, false);
            window.addEventListener('touchcancel', this._infoPanelResizeEndBound, false);
            try { if (ev.cancelable) { ev.preventDefault(); } } catch (e) {}
        },
        infoPanelResizeMove(ev) {
            if (!this.infoPanelResizing || !this.infoPanelResize) {
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
            let next = this.infoPanelResize.startW + (this.infoPanelResize.startX - pageX);
            this.infoPanelResize.updated = this.applyInfoPanelWidth(next, false);
        },
        infoPanelResizeEnd() {
            if (!this.infoPanelResizing) {
                return;
            }
            if (this._infoPanelResizeMoveBound) {
                window.removeEventListener('mousemove', this._infoPanelResizeMoveBound);
                window.removeEventListener('touchmove', this._infoPanelResizeMoveBound);
                window.removeEventListener('mouseup', this._infoPanelResizeEndBound);
                window.removeEventListener('touchend', this._infoPanelResizeEndBound);
                window.removeEventListener('touchcancel', this._infoPanelResizeEndBound);
            }
            document.documentElement.classList.remove('np-info-panel-resizing');
            if (this.infoPanelResize && undefined!=this.infoPanelResize.updated) {
                this.applyInfoPanelWidth(this.infoPanelResize.updated, true);
            }
            this.infoPanelResizing = false;
            this.infoPanelResize = undefined;
        },
        tabTextEnd(event) {
            this.clearClickTimeout();
            viewHandleSelectedText(this, event);
        },
        setZoom(zoom) {
            let z = 1.0;
            if (undefined!=zoom && zoom>1.0 && zoom<=2.0) {
                z = zoom;
            }
            if (z==this.zoom) {
                return;
            }
            this.zoom = z;
            setLocalStorageVal("npInfoZoom", this.zoom);
            document.documentElement.style.setProperty('--np-zoom', this.zoom);
            document.documentElement.style.setProperty('--np-zoom-list', Math.min(this.zoom, 1.4));
        },
        headerClicked(ev, tab) {
            if (undefined!=this.menu.selection) {
                return;
            }
            nowplayingMAIMenuClicked(this, ev, tab);
        },
        playerId() {
            return this.$store.state.player ? this.$store.state.player.id : ""
        },
        changePage() {
            this.$store.commit('setPage', this.nextPage);
            this.info.show = false;
        }
    },
    filters: {
        svgIcon: function (name, dark, header) {
            if (undefined!=header) {
                return "/material/svg/"+name+"?c="+getComputedStyle(document.getElementById("browse-view")).getPropertyValue("--active-color").replace("#", "")+"&r="+LMS_MATERIAL_REVISION;
            }
            return "/material/svg/"+name+"?c="+(dark ? LMS_DARK_SVG : LMS_LIGHT_SVG)+"&r="+LMS_MATERIAL_REVISION;
        },
        emblem: function (e) {
            return "/material/svg/"+e.name+"?c="+e.color.substr(1)+"&r="+LMS_MATERIAL_REVISION;
        },
        limitStr: function(str) {
            if (undefined==str || str.length<80) {
                return str;
            }
            return str.substring(0, 80) + "\u2026";
        },
        trackCount(current, total, sep) {
            if (undefined==current || undefined==total || total<2) {
                return "";
            }
            return (undefined==sep ? "" : sep)+i18n("%1 of %2", (current+1), total);
        },
        tooltip: function (str, shortcut, showShortcut, shift, alt) {
            return showShortcut ? ttShortcutStr(str, shortcut, shift, undefined==alt || alt) : str;
        }
    },
    watch: {
        'npMainSlide': function(idx) {
            if (!this.npCardHeavyReady && (idx===NP_CARD_SLIDE_LYRICS || idx===NP_CARD_SLIDE_ARTIST || idx===NP_CARD_SLIDE_ALBUM)) {
                this.npCardHeavyReady = true;
            }
        },
        'npDetailExpand': function() {
            this.$nextTick(function() { this.syncNpDetailSwipeLock(); }.bind(this));
        },
        '$store.state.npMobileDetailStyle': function() {
            this.npDetailExpand = null;
            if (this.npDetailsScroll && this.npMainSlide!==NP_CARD_SLIDE_NP && this.npMainSlide!==NP_CARD_SLIDE_QUEUE) {
                this.goToNpMainSlide(NP_CARD_SLIDE_NP, 0);
            }
            this.$nextTick(function() { this.syncNpDetailSwipeLock(); }.bind(this));
        },
        '$store.state.player': function(p) {
            this.npPlayerPrefs.open = false;
            this.npPlayerPrefs.subId = null;
            this.npPlayerPrefs.filter = null;
            this.npPlayerPrefs.sections = [];
            if (typeof PlayerPrefsMenu !== 'undefined' && PlayerPrefsMenu.invalidateCaps) {
                PlayerPrefsMenu.invalidateCaps();
            }
            this.refreshNpPlayerPrefsCap();
        },
        'npPlayerPrefs.open': function(val) {
            try {
                this.$store.commit('menuVisible', {name:'np-player-prefs', shown:!!val});
            } catch (e) {}
        },
        'info.show': function(val) {
            // Indicate that dialog is/isn't shown, so that swipe is controlled
            bus.$emit('infoDialog', val);
            if (this.desktopLayout) {
                bus.$emit('infoExpanded', val && this.info.expanded);
                if (val) {
                    this.initInfoPanelWidth();
                    this.infoDrawerIn = true;
                    if (this.infoDrawerInTimer) {
                        clearTimeout(this.infoDrawerInTimer);
                    }
                    this.infoDrawerInTimer = setTimeout(function() {
                        this.infoDrawerIn = false;
                        this.infoDrawerInTimer = undefined;
                    }.bind(this), 300);
                    if (this.info.expanded) {
                        this.startInfoExpandAnim('in', 400);
                    }
                } else {
                    this.infoDrawerIn = false;
                    this.infoDrawerOut = false;
                    this.infoExpandAnim = false;
                    if (this.infoExpandAnimTimer) {
                        clearTimeout(this.infoExpandAnimTimer);
                        this.infoExpandAnimTimer = undefined;
                    }
                }
            }
            if (!val) {
                this.clearMaiArtistPalette();
            }
            this.$store.commit('dialogOpen', {name:'info-dialog', shown:val});
            this.setInfoTrack();
            this.showInfo();
            this.updateSheetPaletteClass();
            if (val) {
                this.$nextTick(function() {
                    this.refreshMaiArtistPalette();
                    this.scheduleLyricsPositionUpdate(100);
                }.bind(this));
            }
        },
        'info.expanded': function(val) {
            if (this.desktopLayout && this.info.show) {
                bus.$emit('infoExpanded', val);
            }
            setLocalStorageVal("infoExpanded", val);
            if (this.info.show) {
                this.resetLyricsTracking();
                this.scheduleLyricsPositionUpdate(val ? 450 : 350);
            }
        },
        'info.tab': function(tab) {
            this.resetLyricsTracking();
            this.showInfo();
            this.syncNpInfoSwiperToTab();
            if (this.info.show && TRACK_TAB==tab) {
                this.scheduleLyricsPositionUpdate(100);
            }
            if (ARTIST_TAB==tab || (this.showMobileInfoCard && this.npMainSlide===NP_CARD_SLIDE_ARTIST)) {
                this.$nextTick(function() { this.refreshMaiArtistPalette(); }.bind(this));
            }
        },
        maiArtistImageUrl: function(val) {
            if (!val) {
                this.clearMaiArtistPalette();
            } else {
                this.$nextTick(function() { this.refreshMaiArtistPalette(); }.bind(this));
            }
        },
        darkUi: function() {
            this.refreshMaiArtistPalette();
        },
        'info.showTabs': function() {
            setLocalStorageVal("showTabs", this.info.showTabs);
        },
        'info.showSectHeaders': function() {
            setLocalStorageVal("npShowSectHeaders", this.info.showSectHeaders);
        },
        'info.showSectHeadersExpanded': function() {
            setLocalStorageVal("npShowSectHeadersExpanded", this.info.showSectHeadersExpanded);
        },
        'info.sync': function() {
            setLocalStorageVal("syncInfo", this.info.sync);
            if (this.info.sync) {
                this.setInfoTrack();
                this.updateLyricsPosition();
                this.showInfo();
            }
        },
        'npSheetOpen': function(val) {
            this.updateSheetPaletteClass();
            // Bind plain arrow keys only while sheet is open (avoid stealing browse caret/nav)
            if (!IS_MOBILE) {
                if (val) {
                    bindKey('left');
                    bindKey('right');
                    bindKey('down');
                } else {
                    unbindKey('left');
                    unbindKey('right');
                    unbindKey('down');
                }
            }
            if (val) {
                this.$nextTick(function() {
                    this.bindNpVolumeListeners();
                    this.bindNpSheetHandleListeners();
                    this.ensureMobileInfoCardData();
                }.bind(this));
            } else {
                this.unbindNpVolumeListeners();
            }
        },
        'npSheetAnim': function() {
            this.updateSheetPaletteClass();
        },
        showNpSheetPage: function(val) {
            if (val) {
                this.$nextTick(function() {
                    this.bindNpVolumeListeners();
                    this.bindNpSheetHandleListeners();
                    this.ensureMobileInfoCardData();
                }.bind(this));
            } else {
                this.unbindNpVolumeListeners();
            }
        },
        showMobileInfoCard: function(val) {
            if (val) {
                this.$nextTick(function() { this.ensureMobileInfoCardData(); }.bind(this));
            } else {
                this.resetNpSheetCollapse();
            }
        },
        landscape: function() {
            this.resetNpSheetCollapse();
        },
        'coverUrl': function() {
            this.updateSheetPaletteClass();
            if (this.info.show) {
                nowplayingSyncAlbumTabImage(this);
            }
        },
        title: function() {
            this.scheduleNpBarMarquee();
        },
        mobileBarText: function() {
            this.scheduleNpBarMarquee();
        },
        npBarSubtitleDisplay: function() {
            // Single computed — avoids double fire/flash when artist + album update separately
            this.scheduleNpBarMarquee();
        },
        'npBarMorph.active': function(val) {
            if (!val) {
                // After morph, rest stack is already populated; only remeasure scroll
                this.$nextTick(function() {
                    this.scheduleNpBarMarquee();
                }.bind(this));
            }
        },
        npBarShown: function(val) {
            if (val) {
                this.scheduleNpBarMarquee();
            }
        },
        'largeView': function(val) {
            if (val) {
                // Save current style so can reset when largeview disabled
                if (!this.before) {
                    var elem = document.getElementById("np-bar");
                    if (elem) {
                        this.before = elem.style;
                    }
                }
                this.$nextTick(function () {
                    this.page = document.getElementById("np-page");
                });
            } else {
                if (this.before) {
                    this.$nextTick(function () {
                        var elem = document.getElementById("np-bar");
                        if (elem) {
                            elem.style = this.before;
                        }
                    });
                }
                this.page = undefined;
            }
            bus.$emit('nowPlayingExpanded', val);
        },
        'menu.show': function(newVal) {
            this.$store.commit('menuVisible', {name:'nowplaying', shown:newVal});
            if (newVal) {
                this.stopShowOverlayTimeout();
                if (this.desktopLayout) {
                    this.npCoverHover = true;
                }
            } else {
                this.menu.selection = undefined;
                clearTextSelection();
                if (this.showOverlay) {
                    this.resetShowOverlayTimeout();
                }
            }
        },
        'disableBtns': function(newVal) {
            this.controlBar();
        },
        '$store.state.desktopLayout': function(newVal) {
            // Desktop must never keep mobile dock chrome overrides
            if (newVal) {
                this.applyNpBarDocked(false, true);
            } else {
                if (this.npSheetOpen || this.$store.state.npSheetOpen) {
                    this.clearNpSheetTimer();
                    this.npSheetOpen = false;
                    this.$store.commit('setNpSheetOpen', false);
                    this.npSheetAnim = '';
                    this.largeView = false;
                }
                this.applyNpBarDocked(getLocalStorageBool('npBarDocked', false), true);
                this.npBarSheetAnim = 'enter';
                if (undefined!=this.npBarSheetTimer) {
                    clearTimeout(this.npBarSheetTimer);
                }
                this.npBarSheetTimer = setTimeout(function() {
                    this.npBarSheetAnim = '';
                    this.npBarSheetTimer = undefined;
                }.bind(this), 360);
            }
            this.controlBar(true);
            this.$nextTick(function() {
                this.controlBar(true);
            }.bind(this));
        }
    },
    computed: {
        mobileBar() {
            return this.$store.state.mobileBar
        },
        /* Miniplayer docks over shortcut strip (thin / thick / replace-nav) */
        npBarDockable() {
            if (this.$store.state.desktopLayout) {
                return false;
            }
            let m = this.$store.state.mobileBar;
            return MBAR_THIN==m || MBAR_THICK==m || MBAR_REP_NAV==m;
        },
        /* Dock drag transform is written directly to #np-bar (paintDockDrag) for
         * compositor-only updates; Vue :style must not fight that with translateY. */
        npBarDockStyle() {
            return undefined;
        },
        page() {
            return this.$store.state.page;
        },
        nextPage() {
            return this.info.show ? this.$store.state.prevPage : (this.$store.state.page=='queue' ? 'browse' : 'queue')
        },
        npBarQuality() {
            if (!this.desktopLayout || !this.$store.state.techInfo) {
                return undefined;
            }
            let q = this.playerStatus && this.playerStatus.current && this.playerStatus.current.qualityLabel;
            return q && q.kind ? q : undefined;
        },
        npDiffuse() {
            if (this.serverRestarting) {
                return undefined;
            }
            let d = this.playerStatus && this.playerStatus.wiimDiffuse;
            if (!d || (d.role !== 'source' && d.role !== 'dest')) {
                return undefined;
            }
            let label = d.role === 'source'
                ? (d.dests ? i18n('Diffusion to %1', d.dests) : i18n('WiiM diffusion'))
                : (d.source ? i18n('Diffusion from %1', d.source) : i18n('WiiM diffusion'));
            return {
                label: label,
                title: label + ' — ' + i18n('Stop diffusion'),
                sourceId: d.sourceId || ''
            };
        },
        npDiffuseFallback() {
            if (!this.npDiffuse) {
                return false;
            }
            if (!this.desktopLayout && this.mobileBar == MBAR_THIN) {
                return false;
            }
            let count = this.playerStatus && this.playerStatus.playlist ? this.playerStatus.playlist.count : 0;
            return !(count > 0);
        },
        techInfo() {
            return this.$store.state.techInfo &&
                   ( !this.$store.state.desktopLayout || this.npSheetOpen || !this.showRatings) &&
                   ( (!this.repAltBtn.show && !this.shuffAltBtn.show) || !this.$store.state.desktopLayout || this.npSheetOpen )
        },
        technicalInfo() {
            return undefined==this.playerStatus.current.technicalInfo || this.playerStatus.current.length==0
                ? undefined
                : undefined==this.playerStatus.current.source || this.playerStatus.current.source.other || undefined==this.playerStatus.current.source.text || this.playerStatus.current.source.text.length<1
                    ? this.playerStatus.current.technicalInfo
                    : (this.playerStatus.current.source.text+SEPARATOR+this.playerStatus.current.technicalInfo);
        },
        formattedTime() {
            return this.playerStatus && this.playerStatus.current
                        ? !this.showTotal && undefined!=this.playerStatus.current.time && this.playerStatus.current.duration>0
                            ? formatSeconds(Math.floor(this.playerStatus.current.time))+" / -"+
                              formatSeconds(Math.floor(this.playerStatus.current.duration-this.playerStatus.current.time))
                            : (undefined!=this.playerStatus.current.time ? formatSeconds(Math.floor(this.playerStatus.current.time)) : "") +
                              (undefined!=this.playerStatus.current.time && this.playerStatus.current.duration>0 ? " / " : "") +
                              (this.playerStatus.current.duration>0 ? formatSeconds(Math.floor(this.playerStatus.current.duration)) : "")
                        : undefined;
        },
        darkUi() {
            return this.$store.state.darkUi
        },
        npBarRatings() {
            if (!this.playerStatus || !this.playerStatus.current) {
                return false;
            }
            if (this.repAltBtn.show || this.shuffAltBtn.show) {
                return true; // Use same space for these...
            }
            return this.showRatings;
        },
        showRatings() {
            return LMS_STATS_ENABLED && this.$store.state.showRating && this.playerStatus && this.playerStatus.current &&
                   this.playerStatus.current.duration && this.playerStatus.current.duration>0 && undefined!=this.playerStatus.current.id &&
                   !(""+this.playerStatus.current.id).startsWith("-");
        },
        maxRating() {
            return this.$store.state.maxRating
        },
        title() {
            if (this.$store.state.nowPlayingTrackNum && this.playerStatus.current.tracknum) {
                return formatTrackNum(this.playerStatus.current)+SEPARATOR+trackTitle(this.playerStatus.current);
            }
            return trackTitle(this.playerStatus.current);
        },
        desktopLayout() {
            return this.$store.state.desktopLayout
        },

        totalTogglesQueue() {
            return this.$store.state.desktopLayout && !this.$store.state.pinQueue
        },
        pinQueue() {
            return this.$store.state.pinQueue
        },
        showQueue() {
            return this.$store.state.showQueue
        },
        noPlayer() {
            return !this.$store.state.player
        },
        npPlayerPrefsShow() {
            // Desktop title-bar button + mobile shortcut — any selected player.
            return !this.noPlayer &&
                (this.npPlayerPrefs.showBtn || this.npPlayerPrefs.hasAnything);
        },
        npPlayerPrefsInline() {
            var p = this.npPlayerPrefs;
            return !!(p && p.filter && p.sections && p.sections.length === 1);
        },
        npPlayerPrefsActiveSection() {
            var p = this.npPlayerPrefs;
            if (!p || !p.sections) { return null; }
            if (this.npPlayerPrefsInline) { return p.sections[0]; }
            if (!p.subId) { return null; }
            for (var i = 0; i < p.sections.length; i++) {
                if (p.sections[i] && p.sections[i].id === p.subId) { return p.sections[i]; }
            }
            return null;
        },
        npPlayerPrefsIsPresets() {
            var sec = this.npPlayerPrefsActiveSection;
            return !!(sec && sec.id === 'presets');
        },
        npPlayerPrefsActiveItems() {
            var sec = this.npPlayerPrefsActiveSection;
            return sec && sec.items ? sec.items : [];
        },
        npPlayerPrefsSubTitle() {
            var sec = this.npPlayerPrefsActiveSection;
            return sec && sec.title ? sec.title : '';
        },
        npPlayerPrefsShowItemsInBody() {
            if (this.npPlayerPrefsInline) { return true; }
            return !this.desktopLayout && !!(this.npPlayerPrefs && this.npPlayerPrefs.subId);
        },
        npPlayerPrefsShowActions() {
            return !(this.npPlayerPrefs && this.npPlayerPrefs.filter);
        },
        npPlayerPrefsCanTransfer() {
            var players = this.$store.state.players || [];
            var me = this.$store.state.player;
            if (!me || players.length < 2) { return false; }
            for (var i = 0; i < players.length; i++) {
                if (players[i] && players[i].id !== me.id) { return true; }
            }
            return false;
        },
        drawBgndImage() {
            return this.$store.state.nowPlayingBackdrop && undefined!=this.coverUrl && LMS_BLANK_COVER!=this.coverUrl && DEFAULT_COVER!=this.coverUrl && DEFAULT_RADIO_COVER!=this.coverUrl
        },
        drawBackdrop() {
            return !this.drawBgndImage && this.$store.state.nowPlayingBackdrop && this.$store.state.useDefaultBackdrops
        },
        drawInfoBgndImage() {
            return this.$store.state.infoBackdrop && undefined!=this.coverUrl && LMS_BLANK_COVER!=this.coverUrl && DEFAULT_COVER!=this.coverUrl && DEFAULT_RADIO_COVER!=this.coverUrl && this.showBgnd
        },
        drawInfoBackdrop() {
            return !this.drawInfoBgndImage && this.$store.state.infoBackdrop && this.$store.state.useDefaultBackdrops && this.showBgnd
        },
        maiArtistImageUrl() {
            return this.info.tabs[ARTIST_TAB].image;
        },
        maiArtistBgndActive() {
            if (!this.maiArtistPalette.active) {
                return false;
            }
            if (this.showMobileInfoCard && this.npMainSlide===NP_CARD_SLIDE_ARTIST) {
                return true;
            }
            if (!this.info.show) {
                return false;
            }
            return ARTIST_TAB==this.info.tab || !this.infoUseTabs;
        },
        showMobileInfoCard() {
            // Same multi-card panel for library, Spotify, Radio Paradise, etc.
            // Only WiiM live inputs (Bluetooth/Optical/…) skip MAI cards.
            if (this.desktopLayout || !LMS_P_MAI || this.info.show) {
                return false;
            }
            if (!this.$store.state.maiIntegrated) {
                return false;
            }
            if (!this.showNpSheetPage || !this.mobileNpActive) {
                return false;
            }
            // Prefer playlist count, but still show cards if current track exists
            // (some radio plugins briefly report count 0 while metadata updates).
            let hasTrack = this.playerStatus && (
                (this.playerStatus.playlist && this.playerStatus.playlist.count>0) ||
                (this.playerStatus.current && (this.playerStatus.current.title || this.playerStatus.current.id || this.playerStatus.current.url))
            );
            if (!hasTrack) {
                return false;
            }
            if (isWiimLiveInput(this.playerStatus.current)) {
                return false;
            }
            return true;
        },
        /* Scroll-collapse morph retired: lyrics are a dedicated slide. */
        npSheetScrollCollapseActive() {
            return false;
        },
        npSheetCollapseStyle() {
            return undefined;
        },
        npPageSheetStyle() {
            return undefined;
        },
        npCardInfoTab() {
            if (this.npMainSlide===NP_CARD_SLIDE_ARTIST) {
                return ARTIST_TAB;
            }
            if (this.npMainSlide===NP_CARD_SLIDE_ALBUM) {
                return ALBUM_TAB;
            }
            // NP + lyrics slides share track (lyrics) data
            return TRACK_TAB;
        },
        npDetailsScroll() {
            return !!(this.showMobileInfoCard && !this.desktopLayout && this.$store.state.npMobileDetailStyle!=='cards');
        },
        npArtistExcerpt() {
            return this.npDetailPlain(this.info.tabs[ARTIST_TAB] && this.info.tabs[ARTIST_TAB].text);
        },
        npAlbumExcerpt() {
            return this.npDetailPlain(this.info.tabs[ALBUM_TAB] && this.info.tabs[ALBUM_TAB].text);
        },
        npArtistThumb() {
            let tab = this.info.tabs[ARTIST_TAB];
            if (tab && tab.image) {
                return tab.image;
            }
            let cur = this.playerStatus && this.playerStatus.current;
            if (!cur || typeof nowPlayingArtistPortraitUrl!=='function') {
                return '';
            }
            let id = cur.artist_id;
            if ((undefined==id || id<0) && cur.artist_ids && cur.artist_ids.length) {
                id = cur.artist_ids[0];
            }
            if ((undefined==id || id<0) && undefined!=cur.albumartist_id) {
                id = cur.albumartist_id;
            }
            if ((undefined==id || id<0) && cur.albumartist_ids && cur.albumartist_ids.length) {
                id = cur.albumartist_ids[0];
            }
            return nowPlayingArtistPortraitUrl(id, undefined) || '';
        },
        npArtistThumbVisible() {
            return !!(this.npArtistThumb && this.npArtistThumb!==this.npArtistThumbBroken);
        },
        npLyricsPeekPlaceholder() {
            let tab = this.info.tabs[TRACK_TAB];
            if (tab && tab.lyricsReady && tab.text!==i18n('Fetching...')) {
                return i18n('No lyrics');
            }
            return i18n('Fetching...');
        },
        npQueueCountLabel() {
            let rem = this.npQueueRemaining && this.npQueueRemaining.show;
            let n = rem ? (this.npQueueRemaining.size || 0) : (this.npQueueListSize || (this.playerStatus.playlist && this.playerStatus.playlist.count) || 0);
            if (!n) {
                return i18n('Queue');
            }
            let label = i18np('1 Track', '%1 Tracks', n);
            return rem ? ('-'+label) : label;
        },
        npQueueDurationLabel() {
            let rem = this.npQueueRemaining && this.npQueueRemaining.show;
            let d = rem ? this.npQueueRemaining.duration : this.npQueueDuration;
            let bits = [];
            if (d>0 && typeof formatSeconds==='function') {
                bits.push((rem ? '-' : '')+'('+formatSeconds(Math.floor(d))+')');
            }
            if (!rem && this.npQueueName) {
                bits.push('('+this.npQueueName+(this.npQueueModified ? ' *' : '')+')');
            }
            return bits.join(' ');
        },
        mobileLyricsWindow() {
            let trackTab = this.info.tabs[TRACK_TAB];
            let lines = trackTab && trackTab.lines;
            let lineText = function(i) {
                if (!lines || i<0 || i>=lines.length) {
                    return '';
                }
                let t = lines[i].text;
                return t && String(t).trim().length>0 ? String(t) : '';
            };
            if (lines && lines.length>0) {
                let idx = 0;
                if (this.lyricsTimesValid && undefined!=this.playerStatus.current && undefined!=this.playerStatus.current.time) {
                    idx = this.getLyricsLineIndex(lines, this.playerStatus.current.time);
                }
                let shown = idx;
                while (shown<lines.length && !lineText(shown)) {
                    shown++;
                }
                if (shown>=lines.length) {
                    shown = idx;
                }
                let nxt = shown+1;
                while (nxt<lines.length && !lineText(nxt)) {
                    nxt++;
                }
                let current = lineText(shown);
                let next = lineText(nxt);
                if (!current && !next) {
                    return { mode:'empty', key:0 };
                }
                return {
                    mode: 'lines',
                    key: shown,
                    prev: lineText(shown-1),
                    current: current,
                    next: next
                };
            }
            if (trackTab && trackTab.text) {
                let plain = this.npDetailPlain(trackTab.text);
                if (plain) {
                    let parts = plain.split('\n').filter(function(s) { return s && s.trim().length>0; });
                    return { mode:'text', key:0, html: trackTab.text, current: parts[0] || plain, next: parts[1] || '' };
                }
            }
            return { mode:'empty', key:0 };
        },
        swipeChangeTrackEnabled() {
            return !!this.$store.state.swipeChangeTrack;
        },
        /** Second title line: real artist name (not the "Artist" label). */
        npCardArtistName() {
            if (this.playerStatus.current.maiComposer && this.info.tabs[ARTIST_TAB].ctitle) {
                return this.info.tabs[ARTIST_TAB].ctitle;
            }
            let a = this.playerStatus.current.artist;
            if (a && String(a).replace(/<[^>]*>/g, '').trim()) {
                return String(a).replace(/<[^>]*>/g, '').trim();
            }
            if (this.info.tabs[ARTIST_TAB].texttitle) {
                let t = String(this.info.tabs[ARTIST_TAB].texttitle).replace(/<[^>]*>/g, '').trim();
                if (t) { return t; }
            }
            return this.info.tabs[ARTIST_TAB].title || i18n('Artist');
        },
        /** Second title line: real album name (not the "Album" label). */
        npCardAlbumName() {
            let n = this.playerStatus.current.albumName || this.playerStatus.current.album;
            if (n && String(n).replace(/<[^>]*>/g, '').trim()) {
                return String(n).replace(/<[^>]*>/g, '').trim();
            }
            if (this.info.tabs[ALBUM_TAB].texttitle) {
                let t = String(this.info.tabs[ALBUM_TAB].texttitle).replace(/<[^>]*>/g, '').trim();
                if (t) { return t; }
            }
            return this.info.tabs[ALBUM_TAB].title || i18n('Album');
        },
        npMainSwiperOptions() {
            // No reactive reads: a new options object on every card change re-inits Swiper
            // mid-gesture (random card, lyrics left over the transport).
            // Loop clones duplicated every lyric line and made slideToLoop land on a clone.
            // observeSlideChildren re-measured on each lyrics-line class toggle.
            return {
                direction: 'horizontal',
                initialSlide: NP_CARD_SLIDE_NP,
                slidesPerView: 1,
                spaceBetween: 0,
                loop: false,
                resistanceRatio: 0.55,
                nested: true,
                observer: false,
                observeParents: false,
                observeSlideChildren: false,
                watchOverflow: true,
                threshold: 10,
                touchAngle: 28,
                touchRatio: 1,
                longSwipesRatio: 0.28,
                followFinger: true,
                shortSwipes: true,
                noSwiping: true,
                noSwipingClass: 'swiper-no-swiping',
                touchStartPreventDefault: false,
                touchMoveStopPropagation: false,
                touchReleaseOnEdges: false,
                passiveListeners: true,
                allowTouchMove: true,
                speed: 280,
                pagination: {
                    el: '.np-main-swiper-dots',
                    clickable: true
                }
            };
        },
        npInfoSwiperOptions() {
            return this.npMainSwiperOptions;
        },
        infoExpandedLayout() {
            return this.desktopLayout && this.info.expanded;
        },
        maiShowSectHeaders() {
            return this.infoExpandedLayout ? this.info.showSectHeadersExpanded : this.info.showSectHeaders;
        },
        maiArtistBgndEdgeStyle() {
            if (!this.maiArtistPalette.url) {
                return {};
            }
            return {'background-image':'url('+this.maiArtistPalette.url+')'};
        },
        coloredToolbars() {
            return this.$store.state.desktopLayout && this.$store.state.coloredToolbars
        },
        keyboardControl() {
            return this.$store.state.keyboardControl && !IS_MOBILE
        },
        npBarArtUrl() {
            if (this.disableBtns || undefined==this.coverUrl || this.transCvr) {
                return '';
            }
            return this.coverUrl;
        },
        transCvr() {
            return undefined!=this.coverUrl && (this.coverUrl.includes(DEFAULT_COVER) || this.coverUrl.includes(LMS_BLANK_COVER) || this.coverUrl.includes(DEFAULT_RADIO_COVER))
        },
        /**
         * Webradio / live streams (Radio Paradise, TuneIn, …):
         * compact art layout + no dual-cover morph stacking.
         * Seekable on-demand tracks (library / Spotify albums) stay full-card.
         */
        npIsRadio() {
            let c = this.playerStatus && this.playerStatus.current;
            if (!c) {
                return false;
            }
            let dur = undefined!=c.duration ? parseFloat(c.duration) : 0;
            if (dur>0 && false!==c.canseek && 0!==c.canseek) {
                return false;
            }
            if (c.isRadio || c.live || c.repeating_stream || c.remote_title) {
                return true;
            }
            let url = (c.url || c.favUrl || '').toString().toLowerCase();
            if (url.indexOf('radioparadise')>=0 || url.indexOf('radio.paradise')>=0 ||
                url.indexOf('radio-paradise')>=0 || url.indexOf('tunein')>=0 ||
                url.indexOf('radioparadise.com')>=0) {
                return true;
            }
            // LMS marks many streams as remote with no album_id and no duration
            if (c.remote && dur<=0 && !c.album_id) {
                return true;
            }
            return false;
        },
        artistAndComposerLine() {
            return this.$store.state.nowPlayingContext && undefined!=this.playerStatus.current.artistAndComposerWithContext ? this.playerStatus.current.artistAndComposerWithContext : this.playerStatus.current.artistAndComposer
        },
        //workLine() {
        //    return this.$store.state.nowPlayingContext && undefined!=this.playerStatus.current.workWithContext ? this.playerStatus.current.workWithContext : this.playerStatus.current.work
        //},
        albumLine() {
            return this.$store.state.nowPlayingContext && undefined!=this.playerStatus.current.artistAndComposerWithContext && !isEmpty(this.playerStatus.current.albumLine) ? i18n('<obj>from</obj> %1', this.playerStatus.current.albumLine).replaceAll("<obj>", "<obj class=\"ext-details\">") : this.playerStatus.current.albumLine
        },
        barInfoWithContext() {
            if (this.$store.state.nowPlayingContext &&
                this.windowWidth-(this.desktopLayout ? (this.techInfo && this.technicalInfo ? 570 : 450) : 240)>this.barInfoWithContextWidth &&
                undefined!=this.playerStatus.current.artistAndComposerWithContext && this.albumLine) {
                return replaceBr(this.artistAndComposerLine, " ")+" " + this.albumLine
            }
            return undefined;
        },
        /** Single stable subtitle string — avoids v-if chain flash when artist/album arrive */
        npBarSubtitleDisplay() {
            if (this.barInfoWithContext) {
                return this.barInfoWithContext;
            }
            let a = this.playerStatus.current.artistAndComposer;
            let al = this.playerStatus.current.albumLine;
            if (a && al) {
                return a + SEPARATOR + al;
            }
            if (a) {
                return a;
            }
            if (al) {
                return al;
            }
            if (this.playerStatus.current.title) {
                return '&#x22ef;';
            }
            return '';
        },
        skipBSeconds() {
            return this.$store.state.skipBSeconds
        },
        skipFSeconds() {
            return this.$store.state.skipFSeconds
        },
        npBarPrevDisabled() {
            if (this.desktopLayout && this.npBarAltSkip) {
                let t = this.playerStatus.current.time || 0;
                return this.disableBtns || !this.playerStatus.current.canseek || t<=0;
            }
            return this.disablePrev;
        },
        npBarNextDisabled() {
            if (this.desktopLayout && this.npBarAltSkip) {
                let t = this.playerStatus.current.time || 0;
                let dur = this.playerStatus.current.duration || 0;
                return this.disableBtns || !this.playerStatus.current.canseek || dur<=0 || t>=(dur-0.3);
            }
            return this.disableNext;
        },
        npBarPrevTitle() {
            if (this.desktopLayout && this.npBarAltSkip) {
                return i18n('Skip backward') + ' (' + i18n('%1 seconds', this.skipBSeconds) + ')';
            }
            return this.keyboardControl ? ttShortcutStr(this.trans.prev, 'left') : this.trans.prev;
        },
        npBarNextTitle() {
            if (this.desktopLayout && this.npBarAltSkip) {
                return i18n('Skip forward') + ' (' + i18n('%1 seconds', this.skipFSeconds) + ')';
            }
            return this.keyboardControl ? ttShortcutStr(this.trans.next, 'right') : this.trans.next;
        },
        nowPlayingFull() {
            return this.$store.state.nowPlayingFull && !this.info.show && this.mobileNpActive
        },
        mobileNpActive() {
            if (this.desktopLayout) {
                return this.npSheetOpen;
            }
            return MBAR_NONE==this.mobileBar ? this.$store.state.page=='now-playing' : this.npSheetOpen;
        },
        progressBuffer() {
            return this.playerStatus.current.bufpc<99 ? this.playerStatus.current.bufpc : 0
        },
        npBarProgressOn() {
            return this.serverRestarting || (this.playerStatus.playlist && this.playerStatus.playlist.count>0);
        },
        npBarSliderValue() {
            return this.serverRestarting ? this.serverRestartPct : (this.playerStatus.current.pospc || 0);
        },
        npBarSliderPlaying() {
            return this.serverRestarting ? false : !!this.playerStatus.isplaying;
        },
        npBarSliderDuration() {
            return this.serverRestarting ? 0 : (this.playerStatus.current.duration || 0);
        },
        npBarSliderBuffer() {
            return this.serverRestarting ? 0 : this.progressBuffer;
        },
        lyricsTimesValid() {
            // Lyrics timing positions are only valid if time of first line >= 0
            // ...see comment in nowplayingFetchTrackInfo
            return this.info.sync &&
                   this.info.tabs[TRACK_TAB].lines && this.info.tabs[TRACK_TAB].lines[0].time>=0 &&
                   undefined!=this.playerStatus.current && undefined!=this.playerStatus.current.time && undefined!=this.playerStatus.current.duration &&
                   this.playerStatus.current.duration<=MAX_LYRICS_DURATION
        },
        lyricsHighlightColorAvailable() {
            return !this.transCvr && COLOR_USE_FROM_COVER==this.$store.state.colorUsage;
        },
        lyricsHighlightStyle() {
            if (!this.lyricsHighlight.active) {
                return {opacity:0};
            }
            return {
                transform:'translate3d(0, '+this.lyricsHighlight.top+'px, 0)',
                height:this.lyricsHighlight.height+'px',
                opacity:1
            };
        },
        /** Side rail fill — driven by syncSideProgressFill() (compositor CSS transition) */
        npSideProgressFillStyle() {
            return {};
        },
        npBarMorphDirClass() {
            if (!this.npBarMorph.active) {
                return '';
            }
            return this.npBarMorph.direction>0 ? 'np-bar-text-fwd' : 'np-bar-text-rev';
        },
        npBarInDom() {
            if (!this.desktopLayout) {
                return true;
            }
            if ('expand'==this.npSheetAnim) {
                return true;
            }
            if (this.npSheetDragY>0) {
                return true;
            }
            return !this.npSheetOpen;
        },
        npBarShown() {
            /* Desktop: hide bar only when queue empty */
            if (this.desktopLayout) {
                return !this.disableBtns;
            }
            /* Mobile: always keep banner when sheet closed — even with empty queue
             * (navigation / shortcut drawer entry until a better affordance exists). */
            if (this.info.show) {
                return true;
            }
            if ('expand'==this.npSheetAnim) {
                return true;
            }
            if ('enter'==this.npBarSheetAnim) {
                return true;
            }
            if ('collapse'==this.npSheetAnim) {
                return false;
            }
            return !this.npSheetOpen && !this.$store.state.npSheetOpen;
        },
        npSheetActive() {
            return this.npSheetOpen || 'expand'==this.npSheetAnim || 'collapse'==this.npSheetAnim;
        },
        npSheetPaletteActive() {
            return this.npSheetActive && !this.info.show;
        },
        npSheetSlideClasses() {
            return {'np-page-sheet-enter':'expand'==this.npSheetAnim,
                    'np-page-sheet-exit':'collapse'==this.npSheetAnim};
        },
        npBgndSlideClasses() {
            if (!this.desktopLayout || this.info.show || !this.npSheetActive) {
                return {};
            }
            return this.npSheetSlideClasses;
        },
        showNpSheetPage() {
            return this.npSheetActive && !this.info.show;
        },
        showNpBgnd() {
            if (this.info.show) {
                return true;
            }
            if (this.npSheetPaletteActive && this.npBarArtUrl && !this.desktopLayout) {
                return false;
            }
            return this.npSheetActive;
        },
        showNpSheetScrim() {
            return !this.desktopLayout && MBAR_NONE!=this.mobileBar && !this.info.show &&
                   ('expand'==this.npSheetAnim || 'collapse'==this.npSheetAnim || this.npSheetDragY>0);
        },
        infoUseTabs() {
            return this.info.showTabs || this.windowWidth<NP_MIN_WIDTH_FOR_FULL || (this.desktopLayout && !this.info.expanded);
        }
    },
    beforeDestroy() {
        this.clearNpRestartTimers();
        if (this._npBarAltKey) {
            window.removeEventListener('keydown', this._npBarAltKey, true);
            window.removeEventListener('keyup', this._npBarAltKey, true);
        }
        if (this._npBarAltBlur) {
            window.removeEventListener('blur', this._npBarAltBlur);
        }
        this.endNpBarScrub();
        this.clearNpSheetTimer();
        if (!IS_MOBILE) {
            unbindKey('left');
            unbindKey('right');
            unbindKey('down');
        }
        if (undefined!=this.npBarMorphTimer) {
            clearTimeout(this.npBarMorphTimer);
            this.npBarMorphTimer = undefined;
        }
        if (this._npSlideRaf) {
            cancelAnimationFrame(this._npSlideRaf);
            this._npSlideRaf = 0;
        }
        if (this._npSlideHoldTimer) {
            clearTimeout(this._npSlideHoldTimer);
            this._npSlideHoldTimer = undefined;
        }
        if (undefined!=this.npBarMarqueeTimer) {
            clearTimeout(this.npBarMarqueeTimer);
            this.npBarMarqueeTimer = undefined;
        }
        if (undefined!=this.npBarNavLayoutTimer) {
            clearTimeout(this.npBarNavLayoutTimer);
            this.npBarNavLayoutTimer = undefined;
        }
        this.clearDockFooterDrag();
        this.clearNpBarTempLiftTimer();
        if (this.infoPanelResizing) {
            this.infoPanelResizeEnd();
        }
        if (this.infoDrawerInTimer) {
            clearTimeout(this.infoDrawerInTimer);
            this.infoDrawerInTimer = undefined;
        }
        if (this.infoExpandAnimTimer) {
            clearTimeout(this.infoExpandAnimTimer);
            this.infoExpandAnimTimer = undefined;
        }
        if (this.infoExpandCollapseTimer) {
            clearTimeout(this.infoExpandCollapseTimer);
            this.infoExpandCollapseTimer = undefined;
        }
        if (this.infoDrawerOutTimer) {
            clearTimeout(this.infoDrawerOutTimer);
            this.infoDrawerOutTimer = undefined;
        }
        document.documentElement.style.removeProperty('--bottom-toolbar-height');
        let app = document.querySelector('.lms-app');
        if (app) {
            app.classList.remove('np-bar-docked', 'np-bar-dock-noanim');
        }
        this.npBarDocked = false;
        this.clearOrientTimers();
        this.npOrientSettling = false;
        this.unbindNpVolumeListeners();
        try {
            if (this._orientMql) {
                if (this._orientMql.removeEventListener) {
                    this._orientMql.removeEventListener('change', this._onOrientMedia);
                } else if (this._orientMql.removeListener) {
                    this._orientMql.removeListener(this._onOrientMedia);
                }
            }
        } catch (e) {}
        this.stopPositionInterval();
        this.stopLiveEdgeInterval();
        this.clearClickTimeout();
        this.cancelTooltipTimeout();
        this.clearShowOverlayTimeout();
        this.clearCoverFadeTimer();
        this.clearCoverPreload();
        if (undefined!=this.npSheetDragRaf) {
            cancelAnimationFrame(this.npSheetDragRaf);
            this.npSheetDragRaf = undefined;
        }
        if (undefined!=this.npSheetCollapseRaf) {
            cancelAnimationFrame(this.npSheetCollapseRaf);
            this.npSheetCollapseRaf = undefined;
        }
        this.clearNpSheetDrag();
        if (typeof npParallaxTeardown === 'function') {
            npParallaxTeardown();
        }
    }
});
