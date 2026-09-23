/**
 * LMS-Material
 *
 * Copyright (c) 2018-2026 Craig Drummond <craig.p.drummond@gmail.com>
 * MIT license.
 */

'use strict';

/**
 * Progress bar: compositor-friendly scaleX fill + scrub knob.
 *
 * Fill uses the Web Animations API when available (reliable linear run to
 * 100% over remaining duration). Falls back to a CSS transition, then to
 * low-rate scaleX updates from the playhead estimate.
 *
 * The scrub knob tracks the same estimate whenever we are gliding (playing).
 * CSS only toggles knob opacity on hover of the track *or* the whole miniplayer
 * bar — so position must keep updating even when the pointer leaves the thin
 * track but stays over the bar (otherwise the knob freezes while still visible).
 */
Vue.component('lms-progressbar', {
    template: `
<div class="pbar" ref="root"
     v-bind:class="{'pbar-smooth':smooth, 'pbar-thumb':thumb, 'pbar-playing':canGlide}"
     v-on="$listeners"
     @mouseenter="onPointerEnter"
     @mouseleave="onPointerLeave">
 <div class="pbar-track">
  <div class="buffer" ref="buffer"></div>
  <div class="value" ref="value"></div>
 </div>
 <div class="pbar-lever" ref="lever" v-if="thumb"></div>
</div>
`,
    props: {
        value: { type: Number, required: true },
        buffer: { type: Number, required: true },
        smooth: { type: Boolean, default: true },
        thumb: { type: Boolean, default: false },
        playing: { type: Boolean, default: false },
        duration: { type: Number, default: 0 },
        /* Bump from parent on status/seek to re-anchor */
        anchor: { type: Number, default: 0 }
    },
    computed: {
        reduceMotion() {
            try {
                return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            } catch (e) {
                return false;
            }
        },
        canGlide() {
            return !!this.playing && this.duration > 0.5 && !this.reduceMotion && this.smooth;
        }
    },
    watch: {
        value(nv, ov) {
            if (this.canGlide && this._gliding) {
                if (Math.abs((nv||0) - (ov||0)) < 1.5) {
                    // Soft status tick — keep glide; lever rAF already follows estimate
                    return;
                }
                this.scheduleApply(true);
                return;
            }
            this.scheduleApply(false);
        },
        buffer() { this.scheduleApply(false); },
        playing() { this.scheduleApply(true); },
        duration() { this.scheduleApply(true); },
        anchor() { this.scheduleApply(true); },
        thumb(v) {
            if (v) {
                this.$nextTick(function() {
                    this.placeLever(this.currentVisualV());
                    this.ensureLeverFollow();
                }.bind(this));
            } else {
                this.stopLeverFollow();
            }
        }
    },
    mounted() {
        this._applyTimer = undefined;
        this._runToken = 0;
        this._gliding = false;
        this._glideFrom = 0;
        this._glideStartMs = 0;
        this._glideRem = 0;
        this._lastB = -1;
        this._pointerInside = false;
        this._leverRaf = 0;
        this._fallbackTimer = undefined;
        this._fillAnim = undefined;
        this._ro = undefined;

        this.$nextTick(function() {
            this.applyVisual(true);
            this.bindResize();
            requestAnimationFrame(function() {
                // Layout may have been 0×0 on first paint — re-apply fill + knob
                this.applyVisual(true);
            }.bind(this));
        }.bind(this));
    },
    beforeDestroy() {
        if (undefined!==this._applyTimer) {
            clearTimeout(this._applyTimer);
            this._applyTimer = undefined;
        }
        this.stopLeverFollow();
        this.stopFallbackTick();
        this.cancelFillAnim();
        this.unbindResize();
        this._runToken++;
        this._gliding = false;
    },
    methods: {
        bindResize() {
            let root = this.$refs.root || this.$el;
            if (!root || typeof ResizeObserver==='undefined') {
                this._onWinResize = function() {
                    this.placeLever(this.currentVisualV());
                    // If bar just gained width, ensure fill is painted
                    if (this.canGlide && this._gliding) {
                        this.paintFill(this.currentVisualV(), false);
                    }
                }.bind(this);
                window.addEventListener('resize', this._onWinResize);
                return;
            }
            this._lastRoW = 0;
            this._ro = new ResizeObserver(function(entries) {
                let w = 0;
                try {
                    w = entries && entries[0] && entries[0].contentRect
                        ? entries[0].contentRect.width
                        : (root.offsetWidth || 0);
                } catch (e) {
                    w = root.offsetWidth || 0;
                }
                this.placeLever(this.currentVisualV());
                // Width 0 → real: restart fill so scaleX has a real box
                let wasEmpty = this._lastRoW < 2;
                this._lastRoW = w;
                if (wasEmpty && w > 2 && this.canGlide) {
                    this.applyVisual(true);
                }
            }.bind(this));
            this._ro.observe(root);
        },
        unbindResize() {
            if (this._ro) {
                try { this._ro.disconnect(); } catch (e) {}
                this._ro = undefined;
            }
            if (this._onWinResize) {
                window.removeEventListener('resize', this._onWinResize);
                this._onWinResize = undefined;
            }
        },
        onPointerEnter() {
            this._pointerInside = true;
            // Re-sync fill to estimate (fixes desynced / invisible compositor layer)
            let v = this.currentVisualV();
            if (this.canGlide && v < 0.999) {
                let remaining = Math.max(0.05, this.duration * (1 - v));
                this.startGlide(v, remaining);
            } else {
                this.paintFill(v, true);
                this.placeLever(v);
                this.ensureLeverFollow();
            }
        },
        onPointerLeave() {
            this._pointerInside = false;
            // Keep tracking while playing — miniplayer :hover still shows the knob
            if (!this.canGlide || !this._gliding) {
                this.stopLeverFollow();
            }
        },
        /**
         * Keep the scrub knob on the playhead while gliding. Must run whenever
         * canGlide (not only while the pointer is on the thin track), because
         * desktop CSS reveals the knob for the whole #np-bar:hover.
         */
        ensureLeverFollow() {
            if (!this.thumb) {
                return;
            }
            if (this._leverRaf) {
                return;
            }
            let tick = function() {
                this._leverRaf = 0;
                if (!this.thumb) {
                    return;
                }
                let keep = this.canGlide || this._pointerInside;
                if (!keep) {
                    return;
                }
                this.placeLever(this.currentVisualV());
                this._leverRaf = requestAnimationFrame(tick);
            }.bind(this);
            this._leverRaf = requestAnimationFrame(tick);
        },
        stopLeverFollow() {
            if (this._leverRaf) {
                cancelAnimationFrame(this._leverRaf);
                this._leverRaf = 0;
            }
        },
        /** Low-rate fill paint while gliding if WAAPI/CSS transition unavailable */
        startFallbackTick() {
            this.stopFallbackTick();
            this._fallbackTimer = setInterval(function() {
                if (!this._gliding || !this.canGlide) {
                    this.stopFallbackTick();
                    return;
                }
                let v = this.currentVisualV();
                this.paintFill(v, false);
                if (v >= 0.999) {
                    this._gliding = false;
                    this.stopFallbackTick();
                }
            }.bind(this), 100);
        },
        stopFallbackTick() {
            if (undefined!==this._fallbackTimer) {
                clearInterval(this._fallbackTimer);
                this._fallbackTimer = undefined;
            }
        },
        currentVisualV() {
            if (this._gliding && this.canGlide && this._glideRem > 0 && this._glideStartMs > 0) {
                let elapsed = (performance.now() - this._glideStartMs) / 1000.0;
                if (elapsed < 0) { elapsed = 0; }
                let t = elapsed / this._glideRem;
                if (t < 0) { t = 0; }
                if (t > 1) { t = 1; }
                return this._glideFrom + (1 - this._glideFrom) * t;
            }
            return this.clamp01(this.value);
        },
        scheduleApply(immediate) {
            if (immediate) {
                if (undefined!==this._applyTimer) {
                    clearTimeout(this._applyTimer);
                    this._applyTimer = undefined;
                }
                this.applyVisual(true);
                return;
            }
            if (undefined!==this._applyTimer) {
                return;
            }
            this._applyTimer = setTimeout(function() {
                this._applyTimer = undefined;
                this.applyVisual(false);
            }.bind(this), 16);
        },
        clamp01(pc) {
            let v = (undefined==pc || isNaN(pc)) ? 0 : pc / 100;
            if (v < 0) { return 0; }
            if (v > 1) { return 1; }
            return v;
        },
        placeLever(v) {
            let lever = this.$refs.lever;
            let root = this.$refs.root || this.$el;
            if (!lever || !root || !this.thumb) {
                return;
            }
            let pc = Math.max(0, Math.min(100, (v || 0) * 100));
            root.style.setProperty('--pbar-pc', pc + '%');
            lever.style.transition = '';
            lever.style.left = pc + '%';
        },
        cancelFillAnim() {
            if (this._fillAnim) {
                try { this._fillAnim.cancel(); } catch (e) {}
                this._fillAnim = undefined;
            }
            let valEl = this.$refs.value;
            if (valEl) {
                // Clear leftover CSS transition so the next paint is authoritative
                valEl.style.transition = 'none';
            }
        },
        /**
         * Instantly set fill scaleX (no animation).
         * @param {number} v 0..1
         * @param {boolean} hard force style flush
         */
        paintFill(v, hard) {
            let valEl = this.$refs.value;
            let root = this.$refs.root || this.$el;
            if (!valEl || !root) {
                return;
            }
            let pc = Math.max(0, Math.min(100, v * 100));
            root.style.setProperty('--pbar-pc', pc + '%');
            valEl.style.willChange = 'transform';
            valEl.style.transformOrigin = 'left center';
            valEl.style.transition = 'none';
            valEl.style.transform = 'scaleX(' + v + ') translateZ(0)';
            if (hard) {
                void valEl.offsetWidth;
            }
        },
        /**
         * Animate fill from v → 1 over remaining seconds.
         */
        startGlide(v, remaining) {
            let valEl = this.$refs.value;
            let root = this.$refs.root || this.$el;
            if (!valEl || !root) {
                return;
            }
            this.cancelFillAnim();
            this.stopFallbackTick();

            this._gliding = true;
            this._glideFrom = v;
            this._glideRem = remaining;
            this._glideStartMs = performance.now();
            let token = ++this._runToken;

            this.paintFill(v, true);
            this.placeLever(v);
            this.ensureLeverFollow();

            // Prefer Web Animations API — more reliable than multi-minute CSS transitions
            if (typeof valEl.animate === 'function') {
                try {
                    let anim = valEl.animate(
                        [
                            { transform: 'scaleX(' + v + ') translateZ(0)' },
                            { transform: 'scaleX(1) translateZ(0)' }
                        ],
                        {
                            duration: Math.max(50, remaining * 1000),
                            easing: 'linear',
                            fill: 'forwards'
                        }
                    );
                    this._fillAnim = anim;
                    anim.onfinish = function() {
                        if (token !== this._runToken) { return; }
                        this._gliding = false;
                        this.paintFill(1, false);
                        this.placeLever(1);
                        if (!this._pointerInside) {
                            this.stopLeverFollow();
                        }
                    }.bind(this);
                    anim.oncancel = function() { /* re-anchor replaces */ };
                    return;
                } catch (e) {
                    this._fillAnim = undefined;
                }
            }

            // CSS transition + low-rate paint fallback (estimate drives both fill & knob)
            requestAnimationFrame(function() {
                if (token !== this._runToken || !this.$refs.value) { return; }
                requestAnimationFrame(function() {
                    if (token !== this._runToken || !this.$refs.value) { return; }
                    this._glideStartMs = performance.now();
                    let el = this.$refs.value;
                    el.style.transition = 'transform ' + remaining.toFixed(3) + 's linear';
                    el.style.transform = 'scaleX(1) translateZ(0)';
                    this.startFallbackTick();
                    this.ensureLeverFollow();
                }.bind(this));
            }.bind(this));
        },
        setFill(v, remaining, hard) {
            let root = this.$refs.root || this.$el;
            if (!root) {
                return;
            }
            root.style.setProperty('--pbar-pc', (v * 100) + '%');

            if (remaining > 0 && this.canGlide && v < 0.999) {
                this.startGlide(v, remaining);
            } else {
                this.cancelFillAnim();
                this.stopFallbackTick();
                this._gliding = false;
                this._glideStartMs = 0;
                this._glideRem = 0;
                this._runToken++;
                this.paintFill(v, hard);
                this.placeLever(v);
                if (!this._pointerInside) {
                    this.stopLeverFollow();
                }
            }
        },
        applyVisual(hard) {
            let valEl = this.$refs.value;
            let bufEl = this.$refs.buffer;
            let root = this.$refs.root || this.$el;
            if (!valEl || !root) {
                return;
            }
            let v = this.clamp01(this.value);
            let b = this.clamp01(this.buffer);

            if (bufEl && (hard || Math.abs(b - this._lastB) > 0.0005)) {
                this._lastB = b;
                bufEl.style.willChange = 'transform';
                bufEl.style.transformOrigin = 'left center';
                bufEl.style.transition = (!hard && this.smooth && !this.reduceMotion)
                    ? 'transform 0.2s linear'
                    : 'none';
                bufEl.style.transform = 'scaleX(' + b + ') translateZ(0)';
            }

            if (!hard && this._gliding && this.canGlide) {
                // Soft tick while already gliding — lever rAF keeps the knob moving
                this.ensureLeverFollow();
                return;
            }

            if (this.canGlide && v < 0.999) {
                let remaining = Math.max(0.05, this.duration * (1 - v));
                this.setFill(v, remaining, hard);
            } else {
                this.setFill(v, 0, hard);
            }
        }
    }
})
