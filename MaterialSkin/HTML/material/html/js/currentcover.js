/**
 * LMS-Material
 *
 * Copyright (c) 2018-2026 Craig Drummond <craig.p.drummond@gmail.com>
 * MIT license.
 */
'use strict';

function rgb2Hsv(rgb) {
    let r = rgb[0],
        g = rgb[1],
        b = rgb[2],
        max = Math.max(r, g, b),
        min = Math.min(r, g, b),
        d = max - min,
        h,
        s = (max === 0 ? 0 : d / max),
        v = max / 255;

    switch (max) {
        case min: h = 0; break;
        case r: h = (g - b) + d * (g < b ? 6: 0); h /= 6 * d; break;
        case g: h = (b - r) + d * 2; h /= 6 * d; break;
        case b: h = (r - g) + d * 4; h /= 6 * d; break;
    }

    return [h, s, v];
}

function hsv2Rgb(hsv) {
    let h = hsv[0],
        s = hsv[1],
        v = hsv[2],
        r,
        g,
        b,
        i = Math.floor(h * 6),
        f = h * 6 - i,
        p = v * (1 - s),
        q = v * (1 - f * s),
        t = v * (1 - (1 - f) * s);
    switch (i % 6) {
        case 0: r = v, g = t, b = p; break;
        case 1: r = q, g = v, b = p; break;
        case 2: r = p, g = v, b = t; break;
        case 3: r = p, g = q, b = v; break;
        case 4: r = t, g = p, b = v; break;
        case 5: r = v, g = p, b = q; break;
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function isGrey(rgb) {
    return Math.abs(rgb[0]-rgb[1])<2 && Math.abs(rgb[0]-rgb[2])<2 && Math.abs(rgb[1]-rgb[2])<2;
}

function swatchRgb(swatches, name) {
    if (undefined!=swatches && swatches[name] && swatches[name].getPopulation()>0) {
        return swatches[name].getRgb();
    }
    return undefined;
}

function defaultPalette(darkUi) {
    if (darkUi) {
        return [[38, 48, 54], [24, 32, 36], [52, 64, 72]];
    }
    return [[144, 164, 174], [176, 190, 197], [207, 216, 220]];
}

function normalizePaletteColor(rgb, role, darkUi) {
    if (undefined==rgb || isGrey(rgb)) {
        return defaultPalette(darkUi)[role=='primary' ? 0 : (role=='secondary' ? 1 : 2)];
    }
    let hsv = rgb2Hsv(rgb);
    if ('primary'==role) {
        hsv[2] = darkUi ? 0.46 : 0.72;
        hsv[1] = Math.min(hsv[1], darkUi ? 0.7 : 0.85);
    } else if ('secondary'==role) {
        hsv[2] = darkUi ? 0.3 : 0.58;
        hsv[1] = Math.min(hsv[1], darkUi ? 0.5 : 0.65);
    } else {
        hsv[2] = darkUi ? 0.52 : 0.82;
        hsv[1] = Math.min(hsv[1], darkUi ? 0.4 : 0.45);
    }
    return hsv2Rgb(hsv);
}

function extractPalette(swatches, darkUi, avRgb) {
    if (undefined==avRgb || isGrey(avRgb)) {
        return defaultPalette(darkUi);
    }

    let primary = undefined;
    let secondary = undefined;
    let tertiary = undefined;

    if (darkUi) {
        primary = swatchRgb(swatches, 'DarkVibrant') || swatchRgb(swatches, 'Vibrant') || avRgb;
        secondary = swatchRgb(swatches, 'DarkMuted') || swatchRgb(swatches, 'Muted') || primary;
        tertiary = swatchRgb(swatches, 'Muted') || swatchRgb(swatches, 'DarkVibrant') || secondary;
    } else {
        primary = swatchRgb(swatches, 'Vibrant') || swatchRgb(swatches, 'LightVibrant') || avRgb;
        secondary = swatchRgb(swatches, 'Muted') || swatchRgb(swatches, 'LightMuted') || primary;
        tertiary = swatchRgb(swatches, 'DarkVibrant') || swatchRgb(swatches, 'DarkMuted') || secondary;
    }

    return [
        normalizePaletteColor(primary, 'primary', darkUi),
        normalizePaletteColor(secondary, 'secondary', darkUi),
        normalizePaletteColor(tertiary, 'tertiary', darkUi)
    ];
}

/* WCAG relative luminance (sRGB) — used to keep chrome/primary legible on UI surfaces. */
function relativeLuminance(rgb) {
    function channel(c) {
        c = Math.max(0, Math.min(255, c)) / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }
    return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

function contrastRatio(rgbA, rgbB) {
    let L1 = relativeLuminance(rgbA);
    let L2 = relativeLuminance(rgbB);
    let lighter = Math.max(L1, L2);
    let darker = Math.min(L1, L2);
    return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Nudge extracted theme color until it contrasts with the main UI surface.
 * Keeps hue; adjusts value (and a little saturation if washed out).
 * Target ~3:1 for large chrome (icons/buttons), not body text.
 */
function ensureThemeContrast(rgb, darkUi, minRatio) {
    if (undefined==rgb) {
        return darkUi ? [25, 118, 210] : [25, 118, 210];
    }
    minRatio = undefined==minRatio ? 3.2 : minRatio;
    // Approximate list/chrome surfaces (not pure black/white — matches typical Material skins)
    let bg = darkUi ? [28, 30, 32] : [250, 250, 250];
    if (contrastRatio(rgb, bg) >= minRatio) {
        return [Math.round(rgb[0]), Math.round(rgb[1]), Math.round(rgb[2])];
    }
    let hsv = rgb2Hsv(rgb);
    // Washed pastels fail on light UI; boost chroma a bit before darkening
    if (!darkUi && hsv[1] < 0.28) {
        hsv[1] = Math.min(0.55, hsv[1] + 0.22);
    }
    if (darkUi && hsv[1] < 0.2) {
        hsv[1] = Math.min(0.5, hsv[1] + 0.18);
    }
    let step = darkUi ? 0.035 : -0.035;
    let best = hsv2Rgb(hsv);
    let bestRatio = contrastRatio(best, bg);
    for (let i = 0; i < 28; ++i) {
        hsv[2] = Math.max(0.12, Math.min(0.96, hsv[2] + step));
        let cand = hsv2Rgb(hsv);
        let r = contrastRatio(cand, bg);
        if (r > bestRatio) {
            best = cand;
            bestRatio = r;
        }
        if (r >= minRatio) {
            return cand;
        }
    }
    // Guaranteed-legible fallback: keep hue, force readable V
    hsv[2] = darkUi ? 0.78 : 0.42;
    hsv[1] = Math.max(hsv[1], darkUi ? 0.4 : 0.5);
    return hsv2Rgb(hsv);
}

function themeRgbFromVibrant(vRgb, avRgb, darkUi) {
    if (isGrey(avRgb) || undefined==vRgb || isGrey(vRgb)) {
        return [25, 118, 210];
    }
    let rgb = vRgb ? vRgb : avRgb;
    let hsv = rgb2Hsv(rgb);
    // Seed brightness by theme: dark UI needs light ink; light UI needs deeper ink
    hsv[2] = darkUi ? 0.78 : 0.55;
    hsv[1] = Math.min(hsv[1], darkUi ? 0.8 : 0.75);
    return ensureThemeContrast(hsv2Rgb(hsv), !!darkUi);
}

/* Tint mixes into page backgrounds — keep it bright enough on light themes so
   switching to a player with a dark cover does not black-out browse/queue. */
function tintRgbFromCover(avRgb, themeRgb, darkUi) {
    let base = undefined!=avRgb ? avRgb : (undefined!=themeRgb ? themeRgb : [25, 118, 210]);
    if (darkUi) {
        return base;
    }
    let hsv = rgb2Hsv(base);
    // Force a soft, light wash for light UI
    hsv[2] = Math.max(0.82, Math.min(0.96, hsv[2] < 0.5 ? 0.88 : hsv[2]));
    hsv[1] = Math.min(hsv[1], 0.35);
    return hsv2Rgb(hsv);
}

var currentCover = undefined;
var lmsCurrentCover = Vue.component('lms-currentcover', {
    template: `<div><img crossOrigin="anonymous" id="current-cover" :src="accessUrl" style="display:none"/></div>`,
    data() {
        return {
            accessUrl: undefined
        };
    },
    mounted: function() {
        this.coverUrl = DEFAULT_COVER;
        this.fac = new FastAverageColor();
        bus.$on('playerStatus', function(playerStatus) {
            // Has cover changed?
            var coverUrl = this.coverUrl;
            var artist = undefined;
            var album = undefined;

            if (playerStatus.playlist.count == 0) {
                this.queueIndex = undefined;
                if (undefined===this.coverFromInfo || this.coverFromInfo || undefined==this.cover) {
                    coverUrl=DEFAULT_COVER; //resolveImageUrl(DEFAULT_COVER, LMS_CURRENT_IMAGE_SIZE);
                    this.coverFromInfo = false;
                }
            } else {
                artist = playerStatus.current.albumartist ? playerStatus.current.albumartist : playerStatus.current.trackartist ? playerStatus.current.trackartist : playerStatus.current.artist;
                album = playerStatus.current.album;
                this.queueIndex = playerStatus.current["playlist index"];
                coverUrl = undefined;
                if (playerStatus.current.artwork_url) {
                    coverUrl=resolveImageUrl(playerStatus.current.artwork_url, LMS_CURRENT_IMAGE_SIZE);
                }
                if (undefined==coverUrl && undefined!=playerStatus.current.coverid) { // && !(""+playerStatus.current.coverid).startsWith("-")) {
                    coverUrl="/music/"+playerStatus.current.coverid+"/cover"+LMS_CURRENT_IMAGE_SIZE;
                } else if (undefined==coverUrl && undefined!=playerStatus.current.portraitid) {
                    coverUrl = "/contributor/" + playerStatus.current.portraitid + "/image" + LMS_CURRENT_IMAGE_SIZE
                } else if (undefined==coverUrl && LMS_P_MAI) {
                    if (playerStatus.current.artist_ids) {
                        coverUrl="/imageproxy/mai/artist/" + playerStatus.current.artist_ids[0] + "/image" + LMS_CURRENT_IMAGE_SIZE;
                    } else if (playerStatus.current.artist_id) {
                        coverUrl="/imageproxy/mai/artist/" + playerStatus.current.artist_id + "/image" + LMS_CURRENT_IMAGE_SIZE;
                    }
                }
                if (undefined==coverUrl) {
                    // Use players current cover as cover image. Need to add extra (coverid, etc) params so that
                    // the URL is different between tracks...
                    coverUrl="/music/current/cover.jpg?player=" + this.$store.state.player.id;
                    if (playerStatus.current.album_id) {
                        coverUrl+="&album_id="+playerStatus.current.album_id;
                    } else {
                        if (playerStatus.current.album) {
                            coverUrl+="&album="+encodeURIComponent(playerStatus.current.album);
                        }
                        if (playerStatus.current.albumartist) {
                            coverUrl+="&artist="+encodeURIComponent(playerStatus.current.albumartist);
                        }
                        if (playerStatus.current.year && playerStatus.current.year>0) {
                            coverUrl+="&year="+playerStatus.current.year;
                        }
                    }
                    coverUrl=resolveImageUrl(coverUrl, LMS_CURRENT_IMAGE_SIZE);
                }
                this.coverFromInfo = true;
            }

            if (coverUrl!=this.coverUrl) {
                this.coverUrl = coverUrl;
                // Reset palette immediately so previous player's dark tint does not linger
                // on browse/queue while the new cover loads (or fails).
                if (this.$store.state.colorUsage==COLOR_USE_FROM_COVER) {
                    let darkUi = this.$store.state.darkUi;
                    this.applyMorph(defaultPalette(darkUi), [25, 118, 210], [25, 118, 210], DEFAULT_COVER==coverUrl || undefined==coverUrl);
                }
                bus.$emit('currentCover', this.coverUrl, this.queueIndex, artist, album);
                if (1==queryParams.nativeCover) {
                    try {
                        NativeReceiver.coverUrl(this.coverUrl);
                    } catch (e) {
                    }
                } else if (queryParams.nativeCover>0) {
                    emitNative("MATERIAL-COVER\nURL " + this.coverUrl, queryParams.nativeCover);
                }

                let loadUrl = undefined==coverUrl || (!coverUrl.startsWith("http:") && !coverUrl.startsWith("https:"))
                    ? coverUrl
                    : "https://images1-focus-opensocial.googleusercontent.com/gadgets/proxy?container=focus&refresh=2592000&url="+encodeURIComponent(coverUrl);
                if (this.accessUrl!=loadUrl) {
                    this.accessUrl = loadUrl;
                }
            }
        }.bind(this));

        bus.$on('getCurrentCover', function() {
            bus.$emit('currentCover', this.coverUrl, this.queueIndex);
        }.bind(this));

        currentCover = this;
        document.getElementById('current-cover').addEventListener('load', function() {
            currentCover.processCover();
        });
        bus.$on('themeChanged', function() {
            if (this.$store.state.colorUsage==COLOR_USE_FROM_COVER && this.accessUrl!=this.coverUrl) {
                this.accessUrl = this.coverUrl;
            } else if (undefined!=this.accessUrl && DEFAULT_COVER!=this.coverUrl) {
                this.processCover();
            }
        }.bind(this));
        bus.$on('playerChanged', function() {
            // New player: drop previous cover-tint immediately; status/cover handlers will re-apply
            if (this.$store.state.colorUsage==COLOR_USE_FROM_COVER) {
                let darkUi = this.$store.state.darkUi;
                this.applyMorph(defaultPalette(darkUi), [25, 118, 210], [25, 118, 210], true);
            }
        }.bind(this));
    },
    methods: {
        processCover() {
            let isDefCover = DEFAULT_COVER==this.coverUrl || undefined==this.coverUrl;
            let darkUi = this.$store.state.darkUi;

            if (isDefCover) {
                this.applyMorph(defaultPalette(darkUi), undefined, undefined, true);
                return;
            }

            let img = document.getElementById('current-cover');
            if (undefined==img || !img.complete) {
                return;
            }

            var swatches = undefined;
            var vRgb = undefined;
            try {
                var vibrant = new Vibrant(img);
                swatches = vibrant.swatches();
                var desired = darkUi
                    ? ["Vibrant", "LightVibrant", "Muted", "LightMuted", "DarkVibrant", "DarkMuted"]
                    : ["Vibrant", "DarkVibrant", "Muted", "DarkMuted", "LightVibrant", "LightMuted"];
                for (let d=0, len=desired.length; d<len && undefined==vRgb; ++d) {
                    vRgb = swatchRgb(swatches, desired[d]);
                }
            } catch(e) {
            }

            this.fac.getColorAsync(img, {mode:'precision'}).then(color => {
                let rgbs = color.rgb.replace('rgb(', '').replace(')', '').split(',');
                let avRgb = [parseInt(rgbs[0]), parseInt(rgbs[1]), parseInt(rgbs[2])];
                let palette = extractPalette(swatches, darkUi, avRgb);
                this.applyMorph(palette, vRgb, avRgb, false);
            }).catch(e => {
                this.applyMorph(defaultPalette(darkUi), undefined, undefined, true);
            });
        },
        applyMorph(palette, vRgb, avRgb, isDefCover) {
            let targets = {
                palette1: palette[0],
                palette2: palette[1],
                palette3: palette[2]
            };
            let themeRgb = undefined;
            let hexColor = undefined;

            let darkUi = this.$store.state.darkUi;
            if (!isDefCover && this.$store.state.colorUsage==COLOR_USE_FROM_COVER) {
                if (isGrey(avRgb) || undefined==vRgb || isGrey(vRgb)) {
                    themeRgb = [25, 118, 210];
                } else {
                    themeRgb = themeRgbFromVibrant(vRgb, avRgb, darkUi);
                }
                // Final pass: muted pale / near-bg covers still fail after vibrant pick
                themeRgb = ensureThemeContrast(themeRgb, darkUi);
                hexColor = morphRgb2Hex(themeRgb);
                targets.primary = themeRgb;
                targets.accent = themeRgb;
                targets.highlight = themeRgb;
                targets.tint = tintRgbFromCover(avRgb, themeRgb, darkUi);
            } else if (isDefCover && this.$store.state.colorUsage==COLOR_USE_FROM_COVER) {
                themeRgb = [25, 118, 210];
                hexColor = morphRgb2Hex(themeRgb);
                targets.primary = themeRgb;
                targets.accent = themeRgb;
                targets.highlight = themeRgb;
                targets.tint = themeRgb;
            }

            let hexForNative = hexColor;
            colorMorph.setTargets(targets, function() {
                if (currentCover.$store.state.colorUsage==COLOR_USE_FROM_COVER) {
                    emitToolbarColorsFromState(currentCover.$store.state);
                    if (undefined!=hexForNative) {
                        if (1==queryParams.nativeAccent) {
                            bus.$nextTick(function () {
                                try {
                                    NativeReceiver.updateAccentColor(hexForNative);
                                } catch (e) {
                                }
                            });
                        } else if (queryParams.nativeAccent>0) {
                            emitNative("MATERIAL-ACCENT\nVAL " + hexForNative, queryParams.nativeAccent);
                        }
                    }
                    if (undefined!=themeRgb) {
                        bus.$emit("colorChanged", themeRgb[0]+themeRgb[1]+themeRgb[2]);
                    }
                }
            }.bind(this));
        }
    }
});