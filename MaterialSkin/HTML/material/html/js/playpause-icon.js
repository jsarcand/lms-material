/**
 * LMS-Material
 *
 * Copyright (c) 2018-2026 Craig Drummond <craig.p.drummond@gmail.com>
 * MIT license.
 */
'use strict';

Vue.component('lms-playpause-icon', {
    template: `
<svg class="np-pp-icon media-icon" :class="iconClass" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
 <circle class="np-pp-buffer-ring" cx="12" cy="12" r="10.6" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/>
 <circle class="np-pp-circle" cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.5"/>
 <g class="np-pp-layer np-pp-play-layer">
  <path fill="currentColor" d="M10.5 8.2v7.6l5.8-3.8z"/>
 </g>
 <g class="np-pp-layer np-pp-pause-layer">
  <g class="np-pp-pause-filled">
   <rect x="9.25" y="8.25" width="2.25" height="7.5" rx="0.35" fill="currentColor"/>
   <rect x="12.5" y="8.25" width="2.25" height="7.5" rx="0.35" fill="currentColor"/>
  </g>
  <g class="np-pp-pause-waiting">
   <rect x="9.25" y="8.25" width="2.25" height="7.5" rx="0.35" fill="currentColor"/>
   <rect x="12.5" y="8.25" width="2.25" height="7.5" rx="0.35" fill="currentColor"/>
  </g>
 </g>
</svg>
`,
    props: {
        playing: {
            type: Boolean,
            default: false
        },
        waiting: {
            type: Boolean,
            default: false
        },
        large: {
            type: Boolean,
            default: false
        }
    },
    computed: {
        iconClass() {
            let cls = [];
            if (this.large) {
                cls.push('np-pp-large');
            }
            if (this.waiting) {
                cls.push('np-pp-waiting');
                cls.push('np-pp-state-pause');
            } else if (this.playing) {
                cls.push('np-pp-state-pause');
            } else {
                cls.push('np-pp-state-play');
            }
            return cls;
        }
    }
});