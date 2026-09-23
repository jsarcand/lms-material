/**
 * LMS-Material
 *
 * Copyright (c) 2018-2026 Craig Drummond <craig.p.drummond@gmail.com>
 * MIT license.
 */
'use strict';

function morphRgb2Hex(rgb) {
    let hex = "#";
    for (let i = 0; i < 3; ++i) {
        let hv = Math.round(rgb[i]).toString(16);
        hex += (hv.length == 1 ? "0" : "") + hv;
    }
    return hex;
}

var colorMorph = {
    rafId: undefined,
    reducedMotion: false,
    lerpFactor: 0.14,
    snapThreshold: 0.4,
    toolbarEmitCounter: 0,
    morphingTheme: false,
    onComplete: undefined,
    target: undefined,
    current: {
        palette1: [25, 118, 210],
        palette2: [92, 107, 192],
        palette3: [57, 73, 171],
        primary: [25, 118, 210],
        accent: [25, 118, 210],
        highlight: [25, 118, 210],
        tint: [25, 118, 210]
    },

    init() {
        this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    },

    cloneRgb(rgb) {
        return [rgb[0], rgb[1], rgb[2]];
    },

    setTargets(targets, onComplete) {
        this.target = targets;
        this.onComplete = onComplete;
        this.morphingTheme = undefined != targets.primary;
        this.toolbarEmitCounter = 0;

        if (this.reducedMotion) {
            for (let key in targets) {
                this.current[key] = this.cloneRgb(targets[key]);
            }
            this.apply();
            this.finish();
            return;
        }

        if (undefined == this.rafId) {
            this.rafId = requestAnimationFrame(this.tick.bind(this));
        }
    },

    lerpRgb(from, to) {
        let out = [];
        let done = true;
        for (let i = 0; i < 3; ++i) {
            let diff = to[i] - from[i];
            if (Math.abs(diff) >= this.snapThreshold) {
                done = false;
                out.push(from[i] + (diff * this.lerpFactor));
            } else {
                out.push(to[i]);
            }
        }
        return { rgb: out, done: done };
    },

    tick() {
        if (undefined == this.target) {
            this.rafId = undefined;
            return;
        }

        let allDone = true;
        for (let key in this.target) {
            let result = this.lerpRgb(this.current[key], this.target[key]);
            this.current[key] = result.rgb;
            if (!result.done) {
                allDone = false;
            }
        }

        this.apply();

        if (allDone) {
            this.finish();
        } else {
            this.rafId = requestAnimationFrame(this.tick.bind(this));
        }
    },

    finish() {
        this.target = undefined;
        this.rafId = undefined;
        this.morphingTheme = false;
        if (undefined != this.onComplete) {
            let cb = this.onComplete;
            this.onComplete = undefined;
            cb();
        }
    },

    apply() {
        let c = this.current;
        document.documentElement.style.setProperty('--np-bar-palette-1', morphRgb2Hex(c.palette1));
        document.documentElement.style.setProperty('--np-bar-palette-2', morphRgb2Hex(c.palette2));
        document.documentElement.style.setProperty('--np-bar-palette-3', morphRgb2Hex(c.palette3));

        if (this.morphingTheme || undefined != this.target && undefined != this.target.primary) {
            document.documentElement.style.setProperty('--primary-color', morphRgb2Hex(c.primary));
            document.documentElement.style.setProperty('--accent-color', morphRgb2Hex(c.accent));
            document.documentElement.style.setProperty('--highlight-rgb', Math.round(c.highlight[0]) + "," + Math.round(c.highlight[1]) + "," + Math.round(c.highlight[2]));
            document.documentElement.style.setProperty('--tint-color', morphRgb2Hex(c.tint));

            if (this.morphingTheme) {
                ++this.toolbarEmitCounter;
                if (0 == (this.toolbarEmitCounter % 4) && undefined != store) {
                    emitToolbarColorsFromState(store.state);
                }
            }
        }
    }
};

colorMorph.init();