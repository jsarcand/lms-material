/**
 * LMS-Material
 *
 * Copyright (c) 2018-2026 Craig Drummond <craig.p.drummond@gmail.com>
 * MIT license.
 */
'use strict';

Vue.component('lms-vol-icon', {
    template: `
<v-icon v-if="muted || !useSvg" class="vol-level-icon" v-bind:style="iconStyle">{{fallbackIcon}}</v-icon>
<img v-else class="svg-img vol-level-icon" v-bind:style="iconStyle" :src="svgName | svgIcon(darkUi)" @error="svgError"/>
    `,
    props: {
        volume: {
            type: Number,
            default: 0
        },
        muted: {
            type: Boolean,
            default: false
        },
        size: {
            type: Number,
            default: 22
        }
    },
    data() {
        return {
            useSvg: true
        };
    },
    computed: {
        svgName() {
            return volumeLevelSvg(this.volume);
        },
        fallbackIcon() {
            return volumeLevelIcon(this.volume, this.muted);
        },
        darkUi() {
            return this.$store.state.darkUi;
        },
        iconStyle() {
            var px = this.size+'px';
            return {'--vol-icon-size':px, width:px, height:px, fontSize:px, minWidth:px};
        }
    },
    watch: {
        svgName() {
            this.useSvg = true;
        },
        muted() {
            this.useSvg = true;
        }
    },
    methods: {
        svgError() {
            this.useSvg = false;
        }
    }
});

Vue.component('volume-control', {
    template: `
<v-layout row wrap :class="['vol-control-'+layout, {'vol-slider-moving':moving}]">
 <template v-if="layout==3">
  <v-flex xs12 class="vol-compact-row" v-bind:class="{'vol-compact-muted':muted, 'vol-row-scrubbing':rowScrubbing}" @wheel="wheel($event)" @pointerdown="rowPointerDown" @pointermove="rowPointerMove" @pointerup="rowPointerUp" @pointercancel="rowPointerUp" @pointerleave="rowPointerLeave">
   <span class="vol-compact-icon-wrap link-item" @dblclick.stop="toggleMute" :title="muteTooltip"><lms-vol-icon :volume="value" :muted="muted" :size="18" class="vol-compact-icon"></lms-vol-icon></span>
   <span v-if="name" class="vol-compact-name ellipsis" v-bind:class="{'group-vol-grp':groupRow}">{{name}}</span>
   <v-btn flat icon small :disabled="VOL_HIDDEN==dvc" @click.middle="toggleMute" v-longpress:repeat="dec" class="vol-btn vol-compact-btn vol-left" :title="decTooltip | tooltip('down', displayKeyboardShortcut)"><v-icon>remove</v-icon></v-btn>
   <v-slider :disabled="VOL_HIDDEN==dvc || VOL_FIXED==dvc || noPlayer || queryParams.party" step="1" v-model="value" @click.middle="toggleMute" class="vol-slider vol-compact-slider" @start="start" @end="end" @change="changed"></v-slider>
   <v-btn flat icon small :disabled="VOL_HIDDEN==dvc" @click.middle="toggleMute" v-longpress:repeat="inc" class="vol-btn vol-compact-btn vol-right" :title="incTooltip | tooltip('up', displayKeyboardShortcut)"><v-icon>add</v-icon></v-btn>
   <span v-if="VOL_STD==dvc" class="vol-compact-pct" v-bind:class="{'dimmed':muted}">{{value|displayPct}}</span>
  </v-flex>
 </template>
 <template v-else-if="layout==4">
  <v-flex xs12 class="vol-compact-row vol-mini-row" v-bind:class="{'vol-compact-muted':muted, 'vol-row-scrubbing':rowScrubbing}" @wheel="wheel($event)" @pointerdown="rowPointerDown" @pointermove="rowPointerMove" @pointerup="rowPointerUp" @pointercancel="rowPointerUp" @pointerleave="rowPointerLeave">
   <span class="vol-mini-icon-wrap link-item" @dblclick.stop="toggleMute" :title="muteTooltip"><lms-vol-icon :volume="value" :muted="muted" :size="16" class="vol-compact-icon"></lms-vol-icon></span>
   <span v-if="name" class="vol-mini-name ellipsis">{{name}}</span>
   <v-slider :disabled="VOL_HIDDEN==dvc || VOL_FIXED==dvc || noPlayer || queryParams.party" step="1" v-model="value" @click.middle="toggleMute" class="vol-slider vol-mini-slider" @start="start" @end="end" @change="changed"></v-slider>
   <span v-if="VOL_STD==dvc" class="vol-mini-pct" v-bind:class="{'dimmed':muted}">{{value|displayPct}}</span>
  </v-flex>
 </template>
 <template v-else-if="layout==1">
  <v-flex xs12>
   <v-layout class="vol-toolbar-row" v-bind:class="{'vol-compact-muted':muted}">
    <span class="vol-toolbar-icon-wrap" v-bind:class="{'link-item-ct':coloredToolbars,'link-item':!coloredToolbars,'disabled':noPlayer,'dimmed':muted}" @wheel="wheel($event)" @click.middle="toggleMute" v-longpress="toggleMuteLabel" :title="muteTooltip" id="vol-btn"><lms-vol-icon :volume="value" :muted="muted" :size="22"></lms-vol-icon></span>
    <v-slider :disabled="VOL_HIDDEN==dvc || VOL_FIXED==dvc || noPlayer || queryParams.party" step="1" v-model="value" @wheel.native="wheel($event)" @click.middle="toggleMute" class="vol-slider vol-toolbar-slider" @start="start" @end="end" @change="changed"></v-slider>
    <p v-if="VOL_STD==dvc" :disabled="VOL_HIDDEN==dvc" class="vol-full-label" v-bind:class="{'link-item-ct':coloredToolbars,'link-item':!coloredToolbars,'disabled':noPlayer,'dimmed':muted}" @click.middle="toggleMute" v-longpress="toggleMuteLabel" id="vol-label">{{value|displayPct}}</p>
   </v-layout>
  </v-flex>
 </template>
 <template v-else>
  <v-flex xs12 v-if="layout==0 && !hideLabel"><p class="vol-text link-item noselect" @click.middle="toggleMute" v-longpress="toggleMuteLabel">{{value|displayVal(dvc, name)}}</p></v-flex>
  <v-flex xs12>
   <v-layout>
    <v-btn flat icon :disabled="VOL_HIDDEN==dvc" @wheel="wheel($event)" @click.middle="toggleMute" v-longpress:repeat="dec" class="vol-btn vol-left" :title="decTooltip | tooltip('down', displayKeyboardShortcut)"><v-icon>remove</v-icon></v-btn>
    <v-slider :disabled="VOL_HIDDEN==dvc || VOL_FIXED==dvc || noPlayer || queryParams.party" step="1" v-model="value" @wheel.native="wheel($event)" @click.middle="toggleMute" class="vol-slider" @start="start" @end="end" @change="changed"></v-slider>
    <v-btn flat icon :disabled="VOL_HIDDEN==dvc" @wheel="wheel($event)" @click.middle="toggleMute" v-longpress:repeat="inc" class="vol-btn vol-right" :title="incTooltip | tooltip('up', displayKeyboardShortcut)"><v-icon>add</v-icon></v-btn>
    <p v-if="layout==2 && VOL_STD==dvc" class="pmgr-vol link-item noselect" @click.middle="toggleMute" v-longpress="toggleMuteLabel">{{value|displayVal(dvc)}}</p>
   </v-layout>
  </v-flex>
 </template>
</v-layout>
    `,
    props: {
        value: {
            type: Number,
            required: true
        },
        muted: {
            type: Boolean,
            required: true
        },
        playing: {
            type: Boolean,
            required: true
        },
        dvc: {
            type: Number,
            required: true
        },
        layout: {
            type: Number, // 0 = label above, 1=label left (toolbar), 2=label left (manage players)
            required: true
        },
        name: {
            type: String,
            required: false
        },
        id: {
            type: String,
            required: false
        },
        hideLabel: {
            type: Boolean,
            default: false
        },
        groupRow: {
            type: Boolean,
            default: false
        }
    },
    data() {
        return {
            trans:{ decVol:undefined, incVol:undefined, mute:undefined, unmute:undefined },
            rowScrubbing: false,
            moving: false
        }
    },
    mounted() {
        this.lastTime = undefined;
        this.lastEmittedValue = -1;
        this.rowPointerId = undefined;
        bus.$on('langChanged', function() {
            this.initItems();
        }.bind(this));
        this.initItems();
    },
    beforeDestroy() {
        this.cancelTimer();
        this.releaseRowPointer();
    },
    methods: {
        initItems() {
            this.trans = { decVol:i18n("Decrease volume"), incVol:i18n("Increase volume"), mute:i18n("Mute"), unmute:i18n("Unmute") };
        },
        wheel(event) {
            if (VOL_HIDDEN==this.dvc || VOL_FIXED==this.dvc || this.noPlayer || queryParams.party) {
                return;
            }
            if (event.deltaY<0) {
                this.inc();
            } else if (event.deltaY>0) {
                this.dec();
            }
            event.preventDefault();
        },
        canRowScrub() {
            return VOL_STD==this.dvc && !this.noPlayer && !queryParams.party;
        },
        isRowScrubExempt(target) {
            return !!(target && target.closest && target.closest('.vol-btn, .vol-compact-icon-wrap, .vol-mini-icon-wrap, .v-slider__thumb, .v-slider__track-container'));
        },
        rowPointerDown(event) {
            if (!this.canRowScrub() || this.isRowScrubExempt(event.target)) {
                return;
            }
            if (event.button!==undefined && event.button!==0) {
                return;
            }
            this.rowScrubbing = true;
            this.rowPointerId = event.pointerId;
            try {
                event.currentTarget.setPointerCapture(event.pointerId);
            } catch (e) {}
            this.start();
            this.scrubFromClientX(event.clientX, event.currentTarget);
            event.preventDefault();
        },
        rowPointerMove(event) {
            if (!this.rowScrubbing || (undefined!==this.rowPointerId && event.pointerId!==this.rowPointerId)) {
                return;
            }
            this.scrubFromClientX(event.clientX, event.currentTarget);
            event.preventDefault();
        },
        rowPointerUp(event) {
            if (!this.rowScrubbing || (undefined!==this.rowPointerId && event.pointerId!==this.rowPointerId)) {
                return;
            }
            this.scrubFromClientX(event.clientX, event.currentTarget);
            this.releaseRowPointer(event.currentTarget);
            this.end();
            this.changed();
        },
        rowPointerLeave(event) {
            if (!this.rowScrubbing || (undefined!==this.rowPointerId && event.pointerId!==this.rowPointerId)) {
                return;
            }
            // Keep scrubbing while pointer is captured; only end if capture is lost
            if (!event.currentTarget.hasPointerCapture || !event.currentTarget.hasPointerCapture(event.pointerId)) {
                this.releaseRowPointer(event.currentTarget);
                this.end();
                this.changed();
            }
        },
        releaseRowPointer(el) {
            if (undefined!==this.rowPointerId && el && el.releasePointerCapture) {
                try {
                    el.releasePointerCapture(this.rowPointerId);
                } catch (e) {}
            }
            this.rowPointerId = undefined;
            this.rowScrubbing = false;
        },
        scrubFromClientX(clientX, rowEl) {
            if (!rowEl || isNaN(clientX)) {
                return;
            }
            let slider = rowEl.querySelector('.vol-slider');
            if (!slider) {
                return;
            }
            let rect = slider.getBoundingClientRect();
            if (rect.width < 8) {
                rect = rowEl.getBoundingClientRect();
            }
            let pct = Math.round(((clientX - rect.left) / rect.width) * 100);
            if (pct < 0) { pct = 0; }
            if (pct > 100) { pct = 100; }
            if (this.value !== pct) {
                this.value = pct;
            }
        },
        inc() {
            this.$emit('inc', this.id);
        },
        dec() {
            this.$emit('dec', this.id);
        },
        changed() {
            if (this.moving || this.lastEmittedValue == this.value) {
                return;
            }
            this.$emit('changed', this.value, this.id);
            this.lastEmittedValue = this.value;
        },
        start() {
            this.lastEmittedValue = this.value;
            this.moving=true;
            this.$emit('moving', true);
        },
        end() {
            this.moving=false;
            this.$emit('moving', false);
            // Drop focus so Vuetify does not leave its semi-transparent thumb halo
            // (thumb-container:before) floating after a drag/click.
            this.$nextTick(function() {
                this.clearSliderFocus();
            }.bind(this));
        },
        clearSliderFocus() {
            try {
                if (this.$el && document.activeElement && this.$el.contains(document.activeElement)) {
                    document.activeElement.blur();
                }
                let root = this.$el;
                if (!root || !root.querySelectorAll) {
                    return;
                }
                // Clear stuck active/focus classes if Vuetify missed mouseup outside
                root.querySelectorAll('.v-input--is-focused, .v-input--slider--is-active, .v-slider--is-active').forEach(function(el) {
                    el.classList.remove('v-input--is-focused', 'v-input--slider--is-active', 'v-slider--is-active');
                });
                root.querySelectorAll('.v-slider__thumb-container--is-active').forEach(function(el) {
                    el.classList.remove('v-slider__thumb-container--is-active');
                });
            } catch (e) {}
        },
        toggleMute() {
            this.$emit('toggleMute', this.id);
        },
        toggleMuteLabel(longPress) {
            if (longPress || this.muted) {
                this.toggleMute();
            }
        },
        cancelTimer() {
            if (undefined!==this.timer) {
                clearTimeout(this.timer);
                this.timer = undefined;
            }
        },
        resetTimer() {
            this.cancelTimer();
            this.timer = setTimeout(function () {
                if (this.value!=this.lastEmittedValue) {
                    this.$emit('changed', this.value, this.id);
                }
                this.lastEmittedValue = this.value;
            }.bind(this), MIN_TIME_BETWEEN_VOL_UPDATES);
        },
    },
    computed: {
        noPlayer () {
            return !this.$store.state.players || this.$store.state.players.length<1
        },
        coloredToolbars() {
            return this.$store.state.coloredToolbars
        },
        incTooltip() {
            return this.trans.incVol + (undefined==this.name ? '' : (' (' + this.name + ')'))
        },
        decTooltip() {
            return this.trans.decVol + (undefined==this.name ? '' : (' (' + this.name + ')'))
        },
        muteTooltip() {
            let str = this.muted ? this.trans.unmute : this.trans.mute;
            return undefined==this.name ? str : (str + ' (' + this.name + ')');
        },
        displayKeyboardShortcut() {
            return this.$store.state.keyboardControl && !IS_MOBILE && undefined==this.id
        },
    },
    watch: {
        'value': function(newVal) {
            if (newVal>=0 && this.moving) {
                let time = new Date().getTime();
                if (undefined==this.lastTime || time-this.lastTime>=MIN_TIME_BETWEEN_VOL_UPDATES) {
                    this.$emit('changed', newVal, this.id);
                    this.lastTime = time;
                    this.lastEmittedValue = newVal;
                    this.cancelTimer();
                } else {
                    this.resetTimer();
                }
            }
        }
    },
    filters: {
        displayVal: function (value, dvc, name) {
            return VOL_FIXED==dvc ? undefined!=name ? name : '' : ((undefined!=name ? name+': ' : '') + (isNaN(value) ? 0 : value)+'%');
        },
        displayPct: function (value) {
            return (isNaN(value) ? 0 : value)+'%';
        },
        tooltip: function (str, key, showShortcut) {
            return showShortcut && undefined!=key? ttShortcutStr(str, key, false, true) : str;
        }
    }
})
