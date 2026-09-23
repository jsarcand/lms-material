/**
 * LMS-Material — Context Stats home cards
 *
 * Copyright (c) 2018-2026 Craig Drummond <craig.p.drummond@gmail.com>
 * MIT license.
 */
'use strict';

var contextStatsHomeFac = undefined;
// Fetch a larger pool so dismiss can fade in items not yet on-screen.
const CONTEXT_STATS_HOME_COUNT = 28;
// Layout breakpoints (page = cols × 2 rows):
//  phone / mobile portrait → always 2×2 (4)
//  tablet <1100            → 3×2 (6)
//  desktop wide            → 4×2 (8)
const CONTEXT_STATS_BP_TABLET = 700;
const CONTEXT_STATS_BP_DESKTOP_WIDE = 1100;

function contextStatsHomeEnabled() {
    // Server-wide Material Skin plugin pref (not per-device UI settings)
    return !!(typeof lmsOptions !== 'undefined' && lmsOptions.contextStatsHome);
}

function contextStatsSessionEnhanceEnabled() {
    try {
        if (typeof store !== 'undefined' && store.state && store.state.contextStatsSessionEnhance) {
            return true;
        }
    } catch (e) {}
    return !!(typeof lmsOptions !== 'undefined' && lmsOptions.contextStatsSessionEnhance);
}

/**
 * Controller context hint for server session log (playlist / radio / podcast / random).
 * No-op when Local session history is off. Server is source of truth for enhance flag.
 */
function materialSessionContextHint(playerId, type, opts) {
    if (!contextStatsSessionEnhanceEnabled() || !type) {
        return;
    }
    opts = opts || {};
    playerId = playerId || '';
    var cmd = ['material-skin', 'sessions-context', 'type:' + type];
    if (playerId) {
        cmd.push('player:' + playerId);
    }
    if (opts.id) {
        cmd.push('id:' + String(opts.id));
    }
    if (opts.title) {
        cmd.push('title:' + String(opts.title));
    }
    if (opts.url) {
        cmd.push('url:' + String(opts.url));
    }
    if (opts.image) {
        cmd.push('image:' + String(opts.image));
    }
    try {
        lmsCommand('', cmd).catch(function() {});
    } catch (e) {}
}

/** Pull playlist identity from a browse item (Spotty favorites_url, LMS id, …). */
function materialSessionPlaylistMeta(item, command) {
    item = item || {};
    var pp = item.presetParams || {};
    var url = pp.favorites_url || item.url || item.favUrl || '';
    var title = item.title || item.name || pp.favorites_title || '';
    var image = item.image || pp.icon || pp.image || '';
    var id = '';
    if (command && command.length) {
        for (var i = 0; i < command.length; ++i) {
            var p = String(command[i]);
            if (p.indexOf('playlist_id:') === 0) {
                id = p.substring('playlist_id:'.length);
            } else if (p.indexOf('uri:') === 0 || p.indexOf('url:') === 0) {
                url = p.substring(p.indexOf(':') + 1) || url;
            }
        }
    }
    if (!id && item.id && String(item.id).indexOf('playlist_id:') === 0) {
        id = String(item.id).substring('playlist_id:'.length);
    }
    if (!id && url && /spotify:playlist:/i.test(url)) {
        id = url.replace(/^spotify:\/\//i, 'spotify:');
    }
    if (url) {
        url = String(url).replace(/^spotify:\/\//i, 'spotify:');
    }
    return { id: id || url || '', title: title, url: url, image: image };
}

/**
 * Infer and send context from a play/load command about to run.
 * Covers:
 *  - LMS library playlists: playlistcontrol cmd:load playlist_id:N
 *  - Spotty (and similar apps): spotty playlist play|load  (Play *and* Shuffle both end here)
 *  - Direct playlist play URL (spotify:playlist:…, podcast://, radio streams)
 */
function materialSessionHintFromCommand(playerId, command, item) {
    if (!contextStatsSessionEnhanceEnabled() || !command || !command.length) {
        return;
    }
    var c0 = command[0];
    var c1 = command[1] || '';
    var c2 = command[2] || '';

    // playlistcontrol cmd:load|play playlist_id:N  (library playlists; shuffle uses same load after shuffle mode)
    if (c0 === 'playlistcontrol') {
        var pid = '';
        var isPlayish = false;
        for (var i = 1; i < command.length; ++i) {
            var p = String(command[i]);
            if (p === 'cmd:load' || p.indexOf('cmd:load') === 0 ||
                p === 'cmd:play' || p.indexOf('cmd:play') === 0) {
                isPlayish = true;
            }
            if (p.indexOf('playlist_id:') === 0) {
                pid = p.substring('playlist_id:'.length);
            }
        }
        if (isPlayish && pid) {
            var metaLib = materialSessionPlaylistMeta(item, command);
            materialSessionContextHint(playerId, 'playlist', {
                id: pid,
                title: metaLib.title,
                url: metaLib.url,
                image: metaLib.image
            });
        }
        return;
    }

    // Spotty / Qobuz / Tidal-style: <app> playlist play|load|insert
    // Direct Play and Shuffle both call this with "play" (shuffle is set as a prior mode).
    if (c1 === 'playlist' && (c2 === 'play' || c2 === 'load')) {
        var metaApp = materialSessionPlaylistMeta(item, command);
        var looksPlaylist = !!(metaApp.url && /playlist/i.test(metaApp.url)) ||
            !!(item && (item.type === 'playlist' ||
                (item.presetParams && item.presetParams.favorites_type === 'playlist') ||
                item.stdItem === STD_ITEM_PLAYLIST ||
                item.stdItem === STD_ITEM_REMOTE_PLAYLIST));
        // Spotty menu playlists almost always carry favorites_url even if type missing after pin
        if (!looksPlaylist && c0 === 'spotty' && (metaApp.url || metaApp.title || metaApp.id)) {
            looksPlaylist = true;
        }
        if (looksPlaylist && (metaApp.id || metaApp.url || metaApp.title)) {
            materialSessionContextHint(playerId, 'playlist', metaApp);
        }
        return;
    }

    // playlist play|load URL title
    if (c0 === 'playlist' && (c1 === 'play' || c1 === 'load' || c1 === 'insert')) {
        var url = command[2] || (item && (item.url || (item.presetParams && item.presetParams.favorites_url) || item.id)) || '';
        var title = command[3] || (item && item.title) || '';
        url = String(url).replace(/^spotify:\/\//i, 'spotify:');
        if (!url) {
            return;
        }
        if (url.indexOf('podcast://') === 0 || url.indexOf('podcast:') === 0) {
            materialSessionContextHint(playerId, 'podcast', { url: url, title: title, image: item && item.image });
        } else if (url.indexOf('randomplay:') === 0) {
            materialSessionContextHint(playerId, 'random', { id: url.replace(/^randomplay:\/\//i, ''), url: url, title: title });
        } else if (/^spotify:playlist:/i.test(url)) {
            materialSessionContextHint(playerId, 'playlist', {
                id: url,
                url: url,
                title: title || (item && item.presetParams && item.presetParams.favorites_title) || '',
                image: item && (item.image || (item.presetParams && item.presetParams.icon)) || ''
            });
        } else if (url.indexOf('http') === 0 || url.indexOf('radioparadise') >= 0 || url.indexOf('mms:') === 0 || url.indexOf('rtsp:') === 0) {
            let radioTitle = (typeof contextStatsNiceRadioTitle==='function')
                ? contextStatsNiceRadioTitle(url, title)
                : title;
            materialSessionContextHint(playerId, 'radio', { url: url, title: radioTitle, image: item && item.image });
        }
        return;
    }
    if (c0 === 'randomplay') {
        materialSessionContextHint(playerId, 'random', {
            id: c1 || '',
            title: (item && item.title) || c1 || 'Random',
            url: 'randomplay://' + (c1 || '')
        });
    }
}

function contextStatsHomeTitle() {
    return (typeof LMS_P_CSTATS !== 'undefined' && LMS_P_CSTATS)
        ? i18n('Context Stats')
        : i18n('Continue listening');
}

/** True when server used Alternative Play Count for card ranking/stats */
function contextStatsHomeUsingApc(data) {
    return !!(data && data.result && (data.result.stats_source==='apc' || data.result.apc_enabled));
}

function contextStatsHomeCardBg(card, img) {
    if (!contextStatsHomeFac) {
        contextStatsHomeFac = new FastAverageColor();
    }
    if (!img || !img.complete) {
        return;
    }
    contextStatsHomeFac.getColorAsync(img, {mode:'speed', algorithm:'dominant'}).then(function(color) {
        Vue.set(card, 'bgColor', color.hex);
        Vue.set(card, 'bgIsDark', color.isDark);
    }).catch(function() {});
}

/** Raw stream segment names (e.g. Radio Paradise "4-1.flac") are not station titles. */
function contextStatsIsAudioFilenameTitle(title) {
    if (!title) {
        return false;
    }
    let t = (''+title).replace(/^\s+|\s+$/g, '');
    return /\.(flac|mp3|m4a|aac|ogg|opus|wav|aiff?)(\?.*)?$/i.test(t) ||
        /^\d+[-_.]\d+\.(flac|mp3|m4a)$/i.test(t);
}

/**
 * Radio Paradise channel slug → display name.
 * URLs: stream.radioparadise.com/mellow-flac, radioparadise://mellow, …
 */
function contextStatsRadioParadiseChannel(url, title) {
    let blob = ((url || '') + ' ' + (title || '')).toLowerCase();
    if (blob.indexOf('radioparadise') < 0 && blob.indexOf('radio.paradise') < 0) {
        return null;
    }
    // Path / query segment (mellow-flac, mellow_aac, channel=mellow, …)
    let slug = '';
    let um = (url || '').match(/radioparadise\.com\/([a-z0-9_-]+)/i);
    if (um) {
        slug = um[1];
    }
    if (!slug) {
        um = (url || '').match(/radioparadise:\/?\/?([a-z0-9_-]+)/i);
        if (um) { slug = um[1]; }
    }
    if (!slug) {
        um = (url || '').match(/[?&#](?:channel|mix|stream)=([a-z0-9_-]+)/i);
        if (um) { slug = um[1]; }
    }
    slug = (slug || '').toLowerCase().replace(/[-_]?(flac|aac|mp3|ogg|opus|320|128|64|32|4k|hd)$/g, '');
    slug = slug.replace(/^(rp|radio[-_]?paradise)[-_]?/, '');
    let map = {
        mellow: 'Mellow Mix',
        rock: 'Rock Mix',
        global: 'Global Mix',
        world: 'Global Mix',
        eclectic: 'Eclectic Mix',
        main: 'Main Mix',
        flac: 'Main Mix',
        aac: 'Main Mix',
        '': 'Main Mix'
    };
    let channel = map[slug];
    if (!channel && slug) {
        // e.g. "mellowmix" without separator
        if (slug.indexOf('mellow') === 0) { channel = 'Mellow Mix'; }
        else if (slug.indexOf('rock') === 0) { channel = 'Rock Mix'; }
        else if (slug.indexOf('global') === 0 || slug.indexOf('world') === 0) { channel = 'Global Mix'; }
        else if (slug.indexOf('eclectic') === 0) { channel = 'Eclectic Mix'; }
        else {
            channel = slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, function(ch) { return ch.toUpperCase(); });
            if (channel && channel.toLowerCase().indexOf('mix') < 0) {
                channel = channel + ' Mix';
            }
        }
    }
    if (!channel) {
        channel = 'Main Mix';
    }
    // If a human title already names the mix, prefer it over URL slug
    if (title && !contextStatsIsAudioFilenameTitle(title) &&
        /mellow|rock|global|eclectic|main\s*mix|mix/i.test(title) &&
        !/^radio\s*paradise$/i.test(title.trim())) {
        channel = title.replace(/^\s*radio\s*paradise\s*[:\-–—]?\s*/i, '').trim() || channel;
    }
    return {
        title: channel,
        subtitle: 'Radio Paradise',
        image: '/material/html/images/radioparadise.svg'
    };
}

/**
 * Normalize radio card display: { title, subtitle, image }.
 * RP → channel as title, "Radio Paradise" as descriptor, RP icon.
 */
function contextStatsRadioMeta(url, title, image, subtitle) {
    url = url || '';
    title = title ? (''+title).replace(/^\s+|\s+$/g, '') : '';
    let rp = contextStatsRadioParadiseChannel(url, title);
    if (rp) {
        return {
            title: rp.title,
            subtitle: rp.subtitle,
            image: rp.image || image
        };
    }
    let nice = title;
    if (!nice || contextStatsIsAudioFilenameTitle(nice) || /^https?:\/\//i.test(nice)) {
        let blob = (url + ' ' + title).toLowerCase();
        if (blob.indexOf('somafm') >= 0) {
            nice = 'SomaFM';
        } else {
            let m = url.match(/^([a-z0-9+.-]+):/i);
            if (m) {
                let proto = m[1].toLowerCase();
                if (proto!=='http' && proto!=='https' && proto!=='mms' && proto!=='rtsp' && proto!=='rtmp') {
                    nice = proto.replace(/[-_]+/g, ' ').replace(/\b\w/g, function(ch) { return ch.toUpperCase(); });
                }
            }
            if (!nice || contextStatsIsAudioFilenameTitle(nice)) {
                m = url.match(/^https?:\/\/([^/:]+)/i);
                nice = (m && m[1]) ? m[1].replace(/^www\./i, '') : (title || i18n('Radio'));
            }
        }
    }
    return {
        title: nice || i18n('Radio'),
        subtitle: subtitle || i18n('Radio'),
        image: image
    };
}

function contextStatsNiceRadioTitle(url, title) {
    return contextStatsRadioMeta(url, title).title;
}

/**
 * Sanitize subtitle encoding and split into resting meta vs drawer-only stats.
 * Fixes mojibake like "Â·" / "Â•" from UTF-8 middle-dot/bullet mis-decoded as Latin-1.
 * Returns { meta, stats, subtitle } where subtitle is full text for drawer.
 */
function contextStatsSplitSubtitle(type, raw) {
    let s = (raw == null) ? '' : ('' + raw);
    // Repair common mojibake from middle-dot / bullet separators
    s = s.replace(/\u00c2[\u00b7\u00b0]/g, ' - ')   // Â· / Â°
         .replace(/\u00c3\u00a2\u20ac\u00a2/g, ' - ') // â€¢
         .replace(/[\u00b7\u2022\u2219\u30fb]/g, ' - ') // · • ∙ ・
         .replace(/\s*-\s*/g, ' - ')
         .replace(/\s+/g, ' ')
         .trim();
    // Collapse accidental " - - "
    while (s.indexOf(' - - ') >= 0) {
        s = s.replace(/ - - /g, ' - ');
    }
    if (!s) {
        return { meta: '', stats: '', subtitle: '' };
    }

    let typeLabel = '';
    if (type === 'playlist') { typeLabel = 'Playlist'; }
    else if (type === 'podcast') { typeLabel = 'Podcast'; }
    else if (type === 'radio') { typeLabel = 'Radio'; }
    else if (type === 'album') { typeLabel = ''; }

    // Stats-looking tokens (plays, progress, duration, percent, "recent")
    let looksStats = function(part) {
        if (!part) { return false; }
        let p = part.trim();
        return /^(?:\d+\s+plays?|\d+\s*\/\s*\d+|\d+%\b|recent|\d+h(?:\s+\d+m)?|\d+m\b)/i.test(p)
            || /\b\d+\s+plays?\b/i.test(p)
            || /\b\d+\s+recent\b/i.test(p)
            || /\b\d+h\b|\b\d+m\b/.test(p);
    };

    let parts = s.split(' - ').map(function(p) { return p.trim(); }).filter(Boolean);
    let meta = '';
    let stats = '';

    if (parts.length >= 2) {
        // Prefer: "Artist - 5 plays" / "Spotify - 3 recent" / "12% - Podcast" / "Podcast - 1h 2m"
        let last = parts[parts.length - 1];
        let first = parts[0];
        if (looksStats(last) && !looksStats(first)) {
            meta = parts.slice(0, -1).join(' - ');
            stats = last;
        } else if (looksStats(first) && !looksStats(last)) {
            // "12% - Podcast"
            stats = first;
            meta = last;
        } else if (looksStats(last)) {
            meta = parts.slice(0, -1).join(' - ');
            stats = last;
        } else {
            meta = s;
            stats = '';
        }
    } else if (looksStats(s)) {
        // Whole line is stats (e.g. "3 recent", "5 plays")
        meta = typeLabel;
        stats = s;
    } else {
        meta = s;
        stats = '';
    }

    // Full line for contextual drawer (ASCII separator, no bullet)
    let full = '';
    if (meta && stats) {
        full = meta + ' - ' + stats;
    } else {
        full = meta || stats || '';
    }
    return { meta: meta, stats: stats, subtitle: full };
}

/** Spotify playlist id from any card field (URL / play params). */
function contextStatsSpotifyPlaylistId(c, playParams) {
    let blob = [
        c && c.id,
        c && c.title,
        c && c.image,
        playParams && playParams.join(' ')
    ].join(' ');
    let m = blob.match(/spotify:playlist:([A-Za-z0-9]+)/i)
        || blob.match(/spotify:\/\/playlist[:/]([A-Za-z0-9]+)/i)
        || blob.match(/open\.spotify\.com\/playlist\/([A-Za-z0-9]+)/i);
    return m ? m[1].toLowerCase() : '';
}

/** Normalised playlist title for client-side dedupe. */
function contextStatsPlaylistTitleKey(title) {
    return String(title || '')
        .toLowerCase()
        .replace(/^\s*spotify\s*:\s*/i, '')
        .replace(/[^a-z0-9]+/g, '');
}

function contextStatsHomeParseResp(data, dismissed) {
    let items = [];
    if (!data || !data.result || !data.result.cards_loop) {
        return items;
    }
    dismissed = dismissed || {};
    let loop = data.result.cards_loop;
    let seenId = {};
    let seenSpotify = {};
    let seenPlTitle = {};
    for (let i=0, len=loop.length; i<len; ++i) {
        let c = loop[i];
        if (!c || !c.id || dismissed[c.id] || seenId[c.id]) {
            continue;
        }
        seenId[c.id] = true;
        let image = c.image;
        if (image && !image.startsWith('http') && !image.startsWith('/')) {
            image = '/' + image;
        }
        let playParams = [c.play_param1, c.play_param2, c.play_param3].filter(function(p) { return undefined!=p && ''!==p; });
        let title = c.title || '';
        let subtitle = c.subtitle || '';
        // Fix radio cards: channel name as title, brand as descriptor, brand icon
        if ('radio'==c.type || contextStatsIsAudioFilenameTitle(title) ||
            (title && /radioparadise/i.test(title+image+(playParams.join(' '))))) {
            let streamUrl = '';
            for (let p=0; p<playParams.length; ++p) {
                let s = ''+playParams[p];
                if (s.indexOf('http')===0 || s.indexOf('radioparadise')>=0 || s.indexOf('://')>0) {
                    streamUrl = s;
                    break;
                }
            }
            if ('radio'==c.type || streamUrl || /radioparadise/i.test(title+streamUrl)) {
                let meta = contextStatsRadioMeta(streamUrl || playParams[1] || '', title, image, subtitle);
                title = meta.title;
                if (meta.subtitle) {
                    subtitle = meta.subtitle;
                }
                if (meta.image) {
                    image = meta.image;
                }
                if (playParams.length>=3) {
                    playParams[2] = title;
                }
            }
        }
        // Collapse Spotty duplicates: "X (Spotify)" session + "X (Playlist)" library import
        if (c.type === 'playlist') {
            let sp = contextStatsSpotifyPlaylistId(c, playParams);
            if (sp && seenSpotify[sp]) {
                continue;
            }
            if (sp) {
                seenSpotify[sp] = true;
            }
            let tKey = contextStatsPlaylistTitleKey(title);
            if (tKey && tKey.length >= 8 && seenPlTitle[tKey]) {
                continue;
            }
            if (tKey && tKey.length >= 8) {
                seenPlTitle[tKey] = true;
            }
        }
        let split = contextStatsSplitSubtitle(c.type, subtitle);
        items.push({
            id: c.id,
            type: c.type,
            title: title,
            // Full (ASCII-safe) for drawer / tooltips
            subtitle: split.subtitle || subtitle,
            // Resting label (artist / type) — no stats
            meta: split.meta,
            // Stats for drawer only (not shown on card face)
            stats: split.stats,
            image: image || DEFAULT_COVER,
            progress: parseFloat(c.progress) || 0,
            playCmd: c.play_cmd,
            playParams: playParams,
            bgColor: undefined,
            bgIsDark: true,
            leaving: false,
            entering: false
        });
    }
    return items;
}

function contextStatsHomePlay(view, card) {
    if (!card.playCmd || card.playParams.length<1) {
        return;
    }
    let cmd = [card.playCmd].concat(card.playParams);
    try {
        materialSessionHintFromCommand(view.playerId(), cmd, card);
    } catch (e) {}
    lmsCommand(view.playerId(), cmd).then(function() {
        bus.$emit('showPlayer');
    }).catch(function(err) {
        logError(err, cmd);
    });
}

/** Play next (insert after current track) for a context-stats card. */
function contextStatsHomePlayNext(view, card) {
    if (!card || !card.playCmd || !card.playParams || card.playParams.length<1) {
        return;
    }
    let cmd;
    if (card.playCmd === 'playlistcontrol') {
        let params = card.playParams.map(function(p) {
            let s = String(p);
            if (s === 'cmd:load' || s.indexOf('cmd:load') === 0 ||
                s === 'cmd:play' || s.indexOf('cmd:play') === 0) {
                return 'cmd:insert';
            }
            return p;
        });
        cmd = ['playlistcontrol'].concat(params);
    } else if (card.playCmd === 'playlist') {
        // playlist play|load URL [title] → playlist insert URL [title]
        let rest = card.playParams.slice();
        if (rest[0] === 'play' || rest[0] === 'load') {
            rest[0] = 'insert';
        } else {
            rest = ['insert'].concat(rest);
        }
        cmd = ['playlist'].concat(rest);
    } else {
        // App-style: keep command, prefer insert verb if present
        let rest = card.playParams.slice();
        if (rest[0] === 'play' || rest[0] === 'load') {
            rest[0] = 'insert';
        }
        cmd = [card.playCmd].concat(rest);
    }
    try {
        materialSessionHintFromCommand(view.playerId(), cmd, card);
    } catch (e) {}
    lmsCommand(view.playerId(), cmd).then(function() {
        bus.$emit('refreshStatus');
    }).catch(function(err) {
        logError(err, cmd);
    });
}

/** Shuffle on, then play/load (same pattern as browse PLAY_SHUFFLE_ACTION). */
function contextStatsHomePlayShuffle(view, card) {
    if (!card || !card.playCmd) {
        return;
    }
    let pid = view.playerId();
    lmsCommand(pid, ['playlist', 'shuffle', 1]).then(function() {
        contextStatsHomePlay(view, card);
    }).catch(function() {
        // Still try to play if shuffle command fails
        contextStatsHomePlay(view, card);
    });
}

function contextStatsHomeClick(view, card) {
    // Streams play immediately (no browse hierarchy)
    if ('podcast'==card.type || 'radio'==card.type) {
        contextStatsHomePlay(view, card);
        return;
    }
    if ('playlist'==card.type) {
        let id = card.id.replace('cstats.playlist.', '');
        // LMS library playlists have numeric ids → browse. Spotty session cards use
        // spotify:playlist:… or md5 keys → play (no library folder to open).
        if (/^\d+$/.test(id)) {
            browseDoClick(view, {
                id: 'playlist_id:' + id,
                title: card.title,
                type: 'group',
                section: SECTION_PLAYLISTS,
                stdItem: STD_ITEM_PLAYLIST,
                image: card.image
            }, -1);
        } else if (card.playCmd) {
            contextStatsHomePlay(view, card);
        }
    } else if ('album'==card.type) {
        let id = card.id.replace('cstats.album.', '');
        browseDoClick(view, {
            id: 'album_id:' + id,
            title: card.title,
            subtitle: card.subtitle,
            type: 'group',
            stdItem: STD_ITEM_ALBUM,
            image: card.image
        }, -1);
    }
}

/**
 * Handle menu actions for a context-stats card (standard itemMenu constants).
 * Returns true if the action was handled.
 */
function contextStatsHomeHandleAction(view, act, card) {
    if (!view || !card) {
        return false;
    }
    if (act==PLAY_ACTION) {
        contextStatsHomePlay(view, card);
        return true;
    }
    if (act==INSERT_ACTION) {
        contextStatsHomePlayNext(view, card);
        return true;
    }
    if (act==PLAY_SHUFFLE_ACTION || act==PLAY_SHUFFLE_ALL_ACTION) {
        contextStatsHomePlayShuffle(view, card);
        return true;
    }
    if (act==REMOVE_ACTION) {
        contextStatsHomeDismiss(view, card);
        return true;
    }
    return false;
}

/**
 * Long-press / right-click on a home card.
 * Uses the same browse contextual sheet/drawer as other items (itemMenu + showMenu).
 * Menu: Play · Play next · Play shuffled | Remove
 * (Open is a normal click — not listed in the menu.)
 */
function contextStatsHomeMenu(view, card, event) {
    if (!view || !card) {
        return;
    }
    if (view.contextStatsHome && view.contextStatsHome.modHeld) {
        return;
    }
    if (event) {
        try { event.preventDefault(); } catch (e) {}
        try { event.stopPropagation(); } catch (e) {}
    }
    if (typeof storeClickOrTouchPos==='function' && view.menu) {
        storeClickOrTouchPos(event, view.menu);
    }

    // Same action constants as a normal album/playlist sheet — mobile drawer reuses itemMenu UI
    let menu = [];
    if (card.playCmd) {
        menu.push(PLAY_ACTION);
        menu.push(INSERT_ACTION);
        let canShuffle = ('album'==card.type || 'playlist'==card.type) &&
            !(typeof queryParams!=='undefined' && queryParams.party);
        if (canShuffle && (typeof lmsOptions==='undefined' || lmsOptions.playShuffle!==false)) {
            menu.push(PLAY_SHUFFLE_ACTION);
        }
    }
    menu.push(DIVIDER);
    menu.push(REMOVE_ACTION);

    let stdItem = undefined;
    if ('album'==card.type) {
        stdItem = STD_ITEM_ALBUM;
    } else if ('playlist'==card.type) {
        stdItem = STD_ITEM_PLAYLIST;
    }

    // Drawer: show full subtitle including stats (ASCII-safe)
    let drawerSub = card.subtitle || '';
    if (card.meta && card.stats) {
        drawerSub = card.meta + ' - ' + card.stats;
    } else if (card.stats && !drawerSub) {
        drawerSub = card.stats;
    } else if (card.meta && !drawerSub) {
        drawerSub = card.meta;
    }
    let pseudo = {
        id: card.id,
        title: card.title || contextStatsHomeTitle(),
        subtitle: drawerSub,
        image: card.image,
        artist: card.meta || drawerSub || '',
        stdItem: stdItem,
        cstatsCard: card,
        menu: menu
    };

    let pos = typeof browseMenuCoords==='function'
        ? browseMenuCoords(event)
        : (typeof getTouchOrClickPos==='function' ? getTouchOrClickPos(event) : {x:0, y:0});

    // Always open via the shared browse menu (msk-context-sheet on phone) — never choice dialog
    if (typeof showMenu==='function' && view.menu) {
        showMenu(view, {
            show: true,
            item: pseudo,
            itemMenu: menu,
            x: pos.x || 0,
            y: pos.y || 0,
            index: -1
        });
        return;
    }
    // Fallback: assign menu directly so the sheet can still open
    view.menu = {
        show: true,
        item: pseudo,
        itemMenu: menu,
        x: pos.x || 0,
        y: pos.y || (window.innerHeight || 0),
        index: -1
    };
    if (typeof view.ctxSheetPrepareOpen==='function' && !view.desktopLayout) {
        view.ctxSheetPrepareOpen();
    }
}

function contextStatsHomeCols(width, view) {
    width = width || 0;
    // Mobile layout (any width) and true portrait phones: max 2 columns
    let mobileLayout = false;
    try {
        if (view && view.$store && view.$store.state && undefined!=view.$store.state.desktopLayout) {
            mobileLayout = !view.$store.state.desktopLayout;
        } else if (typeof window !== 'undefined' && window.innerHeight > window.innerWidth && width < 900) {
            mobileLayout = true;
        }
    } catch (e) {}
    if (mobileLayout || width < CONTEXT_STATS_BP_TABLET) {
        return 2;
    }
    if (width >= CONTEXT_STATS_BP_DESKTOP_WIDE) {
        return 4;
    }
    return 3;
}

function contextStatsHomePageSize(width, view) {
    // Always two rows: 2×2 / 3×2 / 4×2
    return contextStatsHomeCols(width, view) * 2;
}

function contextStatsHomeBuildPages(items, pageSize) {
    let pages = [];
    if (!items || !items.length || pageSize < 1) {
        return pages;
    }
    for (let i = 0; i < items.length; i += pageSize) {
        pages.push(items.slice(i, i + pageSize));
    }
    return pages;
}

function contextStatsHomeApplyLayout(view) {
    if (!view || !view.contextStatsHome) {
        return;
    }
    let w = view.pageElement ? view.pageElement.clientWidth : window.innerWidth;
    let cols = contextStatsHomeCols(w, view);
    let pageSize = cols * 2;
    let prevSize = view.contextStatsHome.pageSize;
    view.contextStatsHome.cols = cols;
    view.contextStatsHome.pageSize = pageSize;
    view.contextStatsHome.pages = contextStatsHomeBuildPages(view.contextStatsHome.items, pageSize);
    // Force swiper remount when page geometry changes so pagination rebuilds.
    if (prevSize !== pageSize) {
        view.contextStatsHome.swiperKey = (view.contextStatsHome.swiperKey || 0) + 1;
    }
}

// ⌘/Ctrl + hover: dismiss card; fade in the next item that was not on this page.
function contextStatsHomeDismiss(view, card) {
    if (!view || !view.contextStatsHome || !card || card.leaving) {
        return;
    }
    let csh = view.contextStatsHome;
    let items = csh.items || [];
    let idx = -1;
    for (let i = 0, len = items.length; i < len; ++i) {
        if (items[i].id === card.id) {
            idx = i;
            break;
        }
    }
    if (idx < 0) {
        return;
    }

    let pageSize = csh.pageSize || 4;
    let pageIdx = Math.floor(idx / pageSize);
    // First card after the current page (= not yet displayed on this page).
    let reserveAt = (pageIdx + 1) * pageSize;
    let replacement = (reserveAt < items.length) ? items[reserveAt] : null;

    Vue.set(card, 'leaving', true);

    setTimeout(function() {
        if (!csh.dismissed) {
            csh.dismissed = {};
        }
        csh.dismissed[card.id] = true;

        // Remove dismissed card
        items.splice(idx, 1);

        if (replacement) {
            // After splice of idx (< reserveAt), replacement is at reserveAt - 1
            let rIdx = -1;
            for (let i = 0, len = items.length; i < len; ++i) {
                if (items[i].id === replacement.id) {
                    rIdx = i;
                    break;
                }
            }
            if (rIdx >= 0) {
                let moved = items.splice(rIdx, 1)[0];
                Vue.set(moved, 'entering', true);
                Vue.set(moved, 'leaving', false);
                items.splice(idx, 0, moved);
                contextStatsHomeApplyLayout(view);
                if (view.$nextTick) {
                    view.$nextTick(function() {
                        // Force a paint at opacity 0, then clear entering for fade-in
                        requestAnimationFrame(function() {
                            requestAnimationFrame(function() {
                                Vue.set(moved, 'entering', false);
                            });
                        });
                    });
                } else {
                    setTimeout(function() { Vue.set(moved, 'entering', false); }, 30);
                }
                return;
            }
        }

        // No reserve item — just reflow remaining cards
        contextStatsHomeApplyLayout(view);
    }, 200);
}

/**
 * Debounced soft refresh (e.g. after track change). Keeps current cards until new data arrives.
 */
function contextStatsHomeScheduleRefresh(view) {
    if (!view || !contextStatsHomeEnabled()) {
        return;
    }
    if (view._cstatsRefreshTimer) {
        clearTimeout(view._cstatsRefreshTimer);
    }
    view._cstatsRefreshTimer = setTimeout(function() {
        view._cstatsRefreshTimer = undefined;
        contextStatsHomeLoad(view, { soft: true });
    }, 2200);
}

/**
 * Apply a new card list with optional morph (device switch / soft refresh).
 * Morph: fade-out current cards → swap → fade-in (keeps layout stable, no hard flash).
 */
function contextStatsHomeApplyItems(view, newItems, opts) {
    opts = opts || {};
    let csh = view.contextStatsHome;
    let morph = !!opts.morph && csh.items && csh.items.length > 0;
    let finish = function(items, enter) {
        for (let i = 0, len = items.length; i < len; ++i) {
            Vue.set(items[i], 'leaving', false);
            Vue.set(items[i], 'entering', !!enter);
        }
        csh.items = items;
        csh.morphing = false;
        contextStatsHomeApplyLayout(view);
        // Bump swiper so pages rebuild cleanly after a device switch
        if (opts.morph) {
            csh.swiperKey = (csh.swiperKey || 0) + 1;
        }
        if (enter && view.$nextTick) {
            view.$nextTick(function() {
                requestAnimationFrame(function() {
                    requestAnimationFrame(function() {
                        for (let i = 0, len = csh.items.length; i < len; ++i) {
                            Vue.set(csh.items[i], 'entering', false);
                        }
                    });
                });
            });
        }
    };

    if (!morph) {
        finish(newItems, false);
        return;
    }

    csh.morphing = true;
    // Leave animation on current cards
    for (let i = 0, len = csh.items.length; i < len; ++i) {
        Vue.set(csh.items[i], 'leaving', true);
        Vue.set(csh.items[i], 'entering', false);
    }
    if (csh._morphTimer) {
        clearTimeout(csh._morphTimer);
    }
    csh._morphTimer = setTimeout(function() {
        csh._morphTimer = undefined;
        finish(newItems, true);
    }, 240);
}

/**
 * Load Context Stats home cards.
 * opts.soft  — no full loading spinner when cards already shown
 * opts.morph — cross-fade cards (player / device switch)
 */
function contextStatsHomeLoad(view, opts) {
    opts = opts || {};
    if (typeof opts === 'boolean') {
        // Back-compat: contextStatsHomeLoad(view, soft)
        opts = { soft: opts };
    }
    if (!contextStatsHomeEnabled() || !view.isTop) {
        view.contextStatsHome.items = [];
        view.contextStatsHome.pages = [];
        view.contextStatsHome.loading = false;
        view.contextStatsHome.morphing = false;
        if (typeof view.markBrowseBootPart === 'function') {
            view.markBrowseBootPart('cstats');
        }
        return;
    }
    let csh = view.contextStatsHome;
    let hasCards = csh.items && csh.items.length > 0;
    let morph = !!opts.morph && hasCards;
    let soft = !!opts.soft || morph;
    // Avoid blanking the strip while refreshing for another player
    if (!soft || !hasCards) {
        csh.loading = true;
    }
    if (!csh.dismissed) {
        csh.dismissed = {};
    }
    let reqId = (csh._loadReqId = (csh._loadReqId || 0) + 1);
    let req = ['material-skin', 'context-stats-home', 'count:' + CONTEXT_STATS_HOME_COUNT];
    let pid = '';
    try {
        pid = view.playerId && view.playerId();
        if (pid) {
            req.push('player:' + pid);
        }
    } catch (e) {}
    csh.lastPlayerId = pid || '';
    lmsCommand('', req).then(function(resp) {
        // Stale response (switched player again before this finished)
        if (reqId !== csh._loadReqId) {
            return;
        }
        csh.loading = false;
        let newItems = contextStatsHomeParseResp(resp.data, csh.dismissed);
        csh.isPlugin = resp.data && resp.data.result && resp.data.result.context_stats;
        csh.usingApc = contextStatsHomeUsingApc(resp.data);
        if (resp.data && resp.data.result && undefined != resp.data.result.session_enhance) {
            let se = !!(parseInt(resp.data.result.session_enhance));
            lmsOptions.contextStatsSessionEnhance = se;
        }
        contextStatsHomeApplyItems(view, newItems, { morph: morph });
        if (typeof view.markBrowseBootPart === 'function') {
            view.markBrowseBootPart('cstats');
        }
    }).catch(function(err) {
        if (reqId !== csh._loadReqId) {
            return;
        }
        csh.loading = false;
        csh.morphing = false;
        if (!hasCards) {
            csh.items = [];
            csh.pages = [];
        }
        csh.usingApc = false;
        if (typeof view.markBrowseBootPart === 'function') {
            view.markBrowseBootPart('cstats');
        }
        logError(err, ['material-skin', 'context-stats-home']);
    });
}
