/**
 * LMS-Material
 *
 * Copyright (c) 2018-2026 Craig Drummond <craig.p.drummond@gmail.com>
 * MIT license.
 */
'use strict';

const LS_PREFIX="lms-material::";
const LMS_LIST_CACHE_PREFIX = "cache:list:";

const RATINGS_START = "<i class=\"rstar\">";
const RATINGS=["",         // 0
               "\ue839", // 0.5
               "\ue838",  // 1
               "\ue838\ue839", // 1.5
               "\ue838\ue838", // 2
               "\ue838\ue838\ue839", // 2.5
               "\ue838\ue838\ue838", // 3
               "\ue838\ue838\ue838\ue839", // 3.5
               "\ue838\ue838\ue838\ue838", // 4
               "\ue838\ue838\ue838\ue838\ue839", // 4.5
               "\ue838\ue838\ue838\ue838\ue838"]; // 5

const PASSIVE_SUPPORTED = browserSupportsPassiveScroll();
function browserSupportsPassiveScroll() {
  let passiveSupported = false;
  try {
    const options = { get passive() { passiveSupported = true; return false;} };
    window.addEventListener("test", null, options);
    window.removeEventListener("test", null, options);
  } catch (err) {
    passiveSupported = false;
  }
  return passiveSupported;
}

var bus = new Vue();
var queryParams = parseQueryParams();
var canUseCache = true;

function parseQueryParams() {
    const NATIVE_QPARMS = new Set(["nativeStatus", "nativeColors", "nativePlayer", "nativeUiChanges", "nativeTheme", "nativeCover", "nativePlayerPower", "nativeAccent",
                                    "nativeTitlebar", "nativeTextColor", "nativeConnectionStatus", "nativeNpShareS", "nativeNpShareC", "nativeNpShareD"]);
    const BOOL_QPARAMS = new Set(["single", "addpad", "party", "altBtnLayout", "dontTrapBack", "npAutoClose", "setTitle"]);
    const INT_QPARAMS = new Set(["topPad", "botPad", "dlgPad"]);
    const STR_QPARAMS = new Set(["layout", "appSettings", "appQuit", "appLaunchPlayer", "download", "tbarBtns", "tbarBtnsPos", "tbarBtnsStyle", "hidePlayers", "ipAddresses", "previewPlayer", "previewPlayerName"]);

    var queryString = window.location.href.substring(window.location.href.indexOf('?')+1);
    var hash = queryString.indexOf('#');
    if (hash>0) {
        queryString=queryString.substring(0, hash);
    }
    var query = queryString.split('&');
    var resp = { actions:[], debug:new Set(), hide:new Set(), dontEmbed:new Set(), layout:undefined, player:undefined, single:false,
        css:undefined, download:'browser', addpad:false, party:false, setTitle:false, expand:[], npRatio:1.33333333, topPad:0, botPad:0, dlgPad:0, tbarBtns:undefined, tbarBtnsPos:'r', tbarBtnsStyle:'gnome',
        nativeStatus:0, nativeColors:0, nativePlayer:0, nativeUiChanges:0, nativeTheme:0, nativeCover:0, nativePlayerPower:0, nativeAccent:0,
        nativeTitlebar:0, nativeTextColor:0, nativeConnectionStatus:0, appSettings:undefined, appQuit:undefined, appLaunchPlayer:undefined, altBtnLayout:IS_WINDOWS, dontTrapBack:false, npAutoClose:true};

    for (var i = query.length - 1; i >= 0; i--) {
        var kv = query[i].split('=');
        if ("player"==kv[0]) {
            var player = decodeURIComponent(kv[1]);
            setLocalStorageVal("player", player);
            removeLocalStorage("defaultPlayer");
            resp.player = player;
        } else if ("page"==kv[0]) {
            if (kv[1]=="browse" || kv[1]=="now-playing" || kv[1]=="queue") {
                setLocalStorageVal("page", kv[1]);
            }
        } else if ("debug"==kv[0]) {
            var parts = kv[1].split(",");
            for (var j=0, len=parts.length; j<len; ++j) {
                resp.debug.add(parts[j]);
            }
        } else if ("clearcache"==kv[0]) {
            clearListCache(true);
        } else if ("action"==kv[0]) {
            resp.actions.push(kv[1]);
        } else if("css"==kv[0]) {
            resp.css = kv[1];
            changeLink("/material/customcss/"+kv[1]+"?r=" + LMS_MATERIAL_REVISION, "customcss");
        } else if("js"==kv[0]) {
            var element = document.createElement("script");
            element.src = "/material/customjs/"+kv[1]+"?r=" + LMS_MATERIAL_REVISION;
            document.body.appendChild(element);
        } else if (NATIVE_QPARMS.has(kv[0])) {
            resp[kv[0]]=kv.length<2 ? 1 : (kv[1]=="w" ? 3 : kv[1]=="c" ? 2 : 1);
        } else if ("hide"==kv[0]) {
            var parts = kv[1].split(",");
            for (var j=0, len=parts.length; j<len; ++j) {
                resp.hide.add(parts[j]);
            }
        } else if (STR_QPARAMS.has(kv[0]))  {
            resp[kv[0]]=kv[1];
        } else if ("theme"==kv[0]) {
            var parts = kv[1].split(",");
            setLocalStorageVal('theme', parts[0]);
            if (parts.length>1) {
                setLocalStorageVal('color', parts[1]);
            }
        } else if (BOOL_QPARAMS.has(kv[0])) {
            resp[kv[0]]=kv.length<2 || "true"==kv[1] || "1"==kv[1];
        } else if ("dontEmbed"==kv[0]) {
            var parts = kv[1].split(",");
            for (var j=0, len=parts.length; j<len; ++j) {
                resp.dontEmbed.add(parts[j]);
            }
        } else if ("expand"==kv[0] && kv.length>1) {
            resp.expand=decodeURIComponent(kv[1]).split("/");
        } else if ("npRatio"==kv[0]) {
            resp.npRatio=parseFloat(kv[1]);
        } else if (INT_QPARAMS.has(kv[0])) {
            resp[kv[0]]=parseInt(kv[1]);
        } else if ("dragleft"==kv[0] || "dragright"==kv[0]) {
            let val = parseInt(kv[1]);
            if (val>0) {
                resp[kv[0]]=val;
                document.documentElement.style.setProperty('--window-area-'+kv[0].substr(4), val+'px');
            }
        }
    }
    if (resp.single && !resp.player) {
        resp.single = false;
    }
    return resp;
}

function logJsonMessage(type, msg) {
    if (queryParams.debug.has("json")) {
        console.log("[" + new Date().toLocaleTimeString()+"] JSON "+type+(msg ? (": "+JSON.stringify(msg)) : ""));
    }
}

function logCometdMessage(type, msg) {
    if (queryParams.debug.has("cometd")) {
        console.log("[" + new Date().toLocaleTimeString()+"] COMETD "+type+(msg ? (": "+JSON.stringify(msg)) : ""));
    }
}

function logCometdDebug(msg) {
    if (queryParams.debug.has("cometd")) {
        console.log("[" + new Date().toLocaleTimeString()+"] COMETD "+msg);
    }
}

function commandToLog(command, params, start, count) {
    var cmd = [];
    if (undefined!=command) {
        command.forEach(i => { cmd.push(i); });
    }
    if (undefined!=params) {
        if (undefined!=start) {
            cmd.push(start);
            cmd.push(undefined==count ? LMS_BATCH_SIZE : count);
        }
        params.forEach(i => { cmd.push(i); });
    }
    return cmd
}

function logError(err, command, params, start, count) {
    console.error("[" + new Date().toUTCString()+"] ERROR:" + err, commandToLog(command, params, start, count));
    console.trace();
}

function logAndShowError(err, message, command, params, start, count) {
    logError(err, command, params, start, count);
    bus.$emit('showError', err, message);
}

function emitNative(msg, dest) {
    if (2==dest) {
        console.log(msg);
    } else if (3==dest) {
	    try {
            window.webkit.messageHandlers.mskNative.postMessage(msg);
        } catch (e) {
        }
    }
}

function replaceNewLines(str) {
    try { return str ? str.replace(/\n/g, "<br/>").replace(/\\n/g, "<br/>") : str; }
    catch (e) { return str; }
}

function formatTechInfo(item, source, isCurrent) {
    let technical = [];
    // Bit rate should be Xkbps, but sometimes LMS returns 0 (as num or string?)
    // ...so only valid i fmore than 1 char
    if (undefined!=item.bitrate && (""+item.bitrate).length>1) {
        technical.push(item.bitrate);
    }
    if (item.samplesize && parseInt(item.samplesize)>0) {
        technical.push(i18n("%1bit", item.samplesize));
    }
    if (item.samplerate && parseInt(item.samplerate)>100) {
        technical.push((item.samplerate/1000)+"kHz");
    }
    if (undefined!=item.replay_gain) {
        let val = parseFloat(item.replay_gain);
        if (undefined==isCurrent || !isCurrent || (val>0.000001 || val<-0.000001)) {
            technical.push(i18n("%1dB", val.toFixed(2)));
        }
    }
    if (item.type) {
        let bracket = item.type.indexOf(" (");
        let type = bracket>0 ? item.type.substring(0, bracket) : item.type;
        // BBC Sounds has aac@48000Hz, want just aac
        if (type.length>4 && item.samplerate && type.indexOf("@")>2 && type.indexOf("Hz")>4) {
            type = type.split("@")[0];
        }
        type = type.length<=4 ? type.toUpperCase() : type;
        if (technical.indexOf(type)<0 && (undefined==source || (type!=source.text && type!=source.text.replace(/ /g,'')))) {
            technical.push(type);
        }
    }
    return technical.length>0 ? technical.join(', ') : undefined;
}

function volumeLevelIcon(volume, muted) {
    if (muted) {
        return 'volume_off';
    }
    var vol = isNaN(volume) ? 0 : volume;
    if (vol <= 0) {
        return 'volume_mute';
    }
    // Material fallback: low for first third, high for the rest
    if (vol < 100/3) {
        return 'volume_down';
    }
    return 'volume_up';
}

/** Wave count (0–3 arcs) at every 1/3 of max volume; muted uses material volume_off instead. */
function volumeLevelSvg(volume) {
    var vol = isNaN(volume) ? 0 : volume;
    if (vol <= 0) {
        return 'volume-w0'; // speaker only
    }
    if (vol < 100/3) {
        return 'volume-w1'; // 0–1/3: short arc at membrane
    }
    if (vol < 200/3) {
        return 'volume-w2'; // 1/3–2/3: two arcs
    }
    return 'volume-w3';     // 2/3–max: three arcs
}

function formatSeconds(secs, showDays) {
    if (undefined==secs || isNaN(secs)) {
        secs = 0;
    }
    var numSeconds = parseInt(secs, 10)
    var days       = showDays ? Math.floor(numSeconds / (3600*24)) : 0;
    var hours      = showDays ? Math.floor(numSeconds / 3600) % 24 : Math.floor(numSeconds / 3600);
    var minutes    = Math.floor(numSeconds / 60) % 60
    var seconds    = numSeconds % 60

    if (numSeconds<600) {
        return (minutes<1 ? "0" : minutes)+":"+(seconds<10 ? "0" : "")+seconds;
    }
    return (days>0 ? i18np("1 day", "%1 days", days)+" " : "")+
           ((hours>0 || (showDays && days>0)) ? hours+":" : "")+
           (minutes<1 ? "00:" : "") +
           [minutes,seconds]
             .map(v => v < 10 ? "0" + v : v)
             .filter((v,i) => v !== "00" || i > 0)
             .join(":");
}

function formatTime(secs, twentyFour) {
    var numSeconds = parseInt(secs, 10)
    var hours      = Math.floor(numSeconds / 3600) % 24
    var minutes    = Math.floor(numSeconds / 60) % 60
    if (twentyFour) {
        return [hours,minutes]
                 .map(v => v < 10 ? "0" + v : v)
                 .join(":");
    } else {
        return (hours%12 || 12)+":"+(minutes<10 ? "0" : "")+minutes+" "+(hours<12 ? "AM" : "PM");
    }
}

function formatDate(timestamp) {
    var date = new Date(timestamp * 1000);
    return date.toLocaleDateString() + " " + date.toLocaleTimeString();
}

function resolveImageUrl(image, size) {
    image=""+image; // Ensure its a string!
    if ((image.startsWith("http://") || image.startsWith("https://")) && !(image.startsWith('/imageproxy') || image.startsWith('imageproxy'))) {
        try {
            var url = new URL(image);
            if (url.hostname.startsWith("192.168.") || url.hostname.startsWith("127.") || url.hostname.endsWith(".local")) {
                return image;
            }
            return '/imageproxy/' + encodeURIComponent(image) + '/image' + (size ? size : LMS_IMAGE_SIZE);
        } catch(e) {
            logError(e);
            return image;
        }
    }

    if (image=="html/images/cover.png") {
        return DEFAULT_COVER;
    }
    if (image=="html/images/radio.png") {
        return DEFAULT_RADIO_COVER;
    }
    if (image=="html/images/works.png") {
        return DEFAULT_WORKS_COVER;
    }
    if (image=="plugins/RandomPlay/html/images/icon.png") {
        return RANDOMPLAY_COVER;
    }
    var idx = image.lastIndexOf(".png");
    if (idx < 0) {
        idx = image.lastIndexOf(".jpg");
    }
    if (idx<0 && /^[0-9a-fA-F]+$/.test(image)) {
        image="music/"+image+"/cover"+(size ? size : LMS_IMAGE_SIZE);
    } else if (idx>0) {
        if ((image.startsWith("plugins/") || image.startsWith("/plugins/")) && image.indexOf("/html/images/")>0) {
            return image;
        }
        image = image.substring(0, idx)+(size ? size : LMS_IMAGE_SIZE)+image.substring(idx);
    }
    return image.startsWith("/") ? image : ("/"+image);
}

function resolveImage(icon, image, size) {
    if (!icon && !image) {
        return null;
    }
    if (image) {
        return resolveImageUrl(image, size);
    }
    return resolveImageUrl(icon , size);
}

function changeImageSizing(path, newSize) {
    if (undefined!=path) {
        var specs = [LMS_IMAGE_SIZE, LMS_CURRENT_IMAGE_SIZE, LMS_LIST_IMAGE_SIZE, "_50x50_o"];
        for (var s=0, len=specs.length; s<len; ++s) {
            if (path.endsWith(specs[s]+".png")) {
                return path.replace(specs[s]+".png", (newSize ? newSize : "")+".png");
            }
            if (path.endsWith(specs[s]+".jpg")) {
                return path.replace(specs[s]+".jpg", (newSize ? newSize : "")+".jpg");
            }
            if (path.endsWith(specs[s])) {
                return path.substring(0, path.length - specs[s].length)+(newSize ? newSize : "");
            }
        }
    }
    return path;
}

function toggleBrowseImageSize(path, toGrid) {
    if (undefined!=path) {
        let from = toGrid ? LMS_LIST_IMAGE_SIZE : LMS_IMAGE_SIZE;
        let to = toGrid ? LMS_IMAGE_SIZE : LMS_LIST_IMAGE_SIZE;
        if (path.endsWith(from+".png")) {
            return path.replace(from+".png", to+".png");
        }
        if (path.endsWith(from)) {
            return path.replace(from, to);
        }
    }
    return path;
}

function fixTitle(str) {
    var prefixes = ["the", "el", "la", "los", "las", "le", "les"];
    for (var p=0, len=prefixes.length; p<len; ++p) {
        if (str.startsWith(prefixes[p]+" ")) {
            return str.substring(prefixes[p].length+1)+", "+prefixes[p];
        }
    }
    return str;
}

/**
 * Spotty / favorites often prefix playlist titles with "Spotify : " or "Spotify:".
 * That groups every title under "S" in A–Z sort/jumplist. Strip the prefix for
 * display + sort, and mark the item so the UI can show a soft "on Spotify" note.
 * No Spotify logo/emblem — second line is enough and keeps the list clean.
 */
function stripSpotifyTitlePrefix(title) {
    if (undefined==title || null==title || 'string'!=typeof title) {
        return { title: title, isSpotify: false };
    }
    let m = title.match(/^\s*Spotify\s*[:\-–—]\s*(.*)$/i);
    if (m) {
        let t = (m[1] || '').replace(/^\s+|\s+$/g, '');
        return { title: t.length ? t : title, isSpotify: true };
    }
    return { title: title, isSpotify: false };
}

/** Mutate a browse item: clean Spotify-prefixed title + soft source note only. */
function applySpotifyTitleDisplay(item) {
    if (!item || undefined==item.title) {
        return item;
    }
    let fromUrl = false;
    if (item.presetParams && item.presetParams.favorites_url &&
        item.presetParams.favorites_url.toLowerCase().indexOf('spotify:')===0) {
        fromUrl = true;
    }
    if (item.extid && (''+item.extid).toLowerCase().indexOf('spotify')===0) {
        fromUrl = true;
    }
    let cleaned = stripSpotifyTitlePrefix(item.title);
    if (cleaned.isSpotify) {
        item.title = cleaned.title;
        item.isSpotify = true;
    } else if (fromUrl) {
        item.isSpotify = true;
    }
    if (item.isSpotify) {
        // Never force a Spotify corner logo — it clutters every row
        if (item.emblem && item.emblem.name=='spotify') {
            item.emblem = undefined;
        }
        // Soft source note — prefer subtitle; avoid duplicating if already present
        let sub = item.subtitle || '';
        if (!sub || (typeof sub==='string' && !/spotify/i.test(sub))) {
            let badge = '<span class="browse-source-soft">on Spotify</span>';
            item.subtitle = sub && sub.length ? (sub + ' · ' + badge) : badge;
        }
        // First letter of cleaned title for A–Z (overrides server "S" from "Spotify:…")
        if (item.title && item.title.length>0) {
            let ch = item.title.charAt(0).toUpperCase();
            if (typeof removeDiactrics==='function') {
                ch = removeDiactrics(ch);
            }
            item.textkey = ch;
        }
    }
    return item;
}

function nameSort(a, b) {
    var nameA = a.name.toLowerCase();
    var nameB = b.name.toLowerCase();
    if (nameA < nameB) {
        return -1;
    }
    if (nameA > nameB) {
        return 1;
    }
    return 0;
}

function fixedSort(a, b) {
    var titleA = undefined==a ? undefined : fixTitle(a.toLowerCase());
    var titleB = undefined==b ? undefined : fixTitle(b.toLowerCase());
    if (titleA < titleB) {
        return -1;
    }
    if (titleA > titleB) {
        return 1;
    }
    return 0;
}

function titleSort(a, b) {
    return fixedSort(a.title, b.title);
}

function weightSort(a, b) {
    return a.weight!=b.weight ? a.weight<b.weight ? -1 : 1 : titleSort(a, b);
}

function categorySort(a, b) {
    return a.category!=b.category ? a.category<b.category ? -1 : 1 : titleSort(a, b);
}

function itemSort(a, b) {
    var at = "group"==a.type ? 0 : "track"==a.type ? ("music_note"==a.icon ? 1 : 2) : 3;
    var bt = "group"==b.type ? 0 : "track"==b.type ? ("music_note"==b.icon ? 1 : 2) : 3;
    if (at!=bt) {
        return at<bt ? -1 : 1;
    }
    return titleSort(a, b);
}

function favSort(a, b) {
    var at = a.isFavFolder ? 0 : 1;
    var bt = b.isFavFolder ? 0 : 1;
    if (at!=bt) {
        return at<bt ? -1 : 1;
    }
    return titleSort(a, b);
}

function playerSort(a, b) {
    if (a.isgroup!=b.isgroup) {
        return a.isgroup ? 1 : -1;
    }

    if (!lmsOptions.playersAlphaSort) {
        var weightA = undefined==a.weight ? -1 : a.weight;
        var weightB = undefined==b.weight ? -1 : b.weight;
        if (weightA!=weightB) {
            return weightA<weightB ? -1 : 1;
        }
    }

    var nameA = a.name.toLowerCase();
    var nameB = b.name.toLowerCase();
    if (nameA < nameB) {
        return -1;
    }
    if (nameA > nameB) {
        return 1;
    }
    return 0;
}

function otherPlayerSort(a, b) {
    var serverA = a.server.toLowerCase();
    var serverB = b.server.toLowerCase();
    if (serverA < serverB) {
        return -1;
    }
    if (serverA > serverB) {
        return 1;
    }
    var nameA = a.name.toLowerCase();
    var nameB = b.name.toLowerCase();
    if (nameA < nameB) {
        return -1;
    }
    if (nameA > nameB) {
        return 1;
    }
    return 0;
}

function setElemScrollTop(elem, val) {
    // When using RecycleScroller we need to wait for the next animation frame to scroll, so
    // just do this for all scrolls.
    window.requestAnimationFrame(function () {
        // https://popmotion.io/blog/20170704-manually-set-scroll-while-ios-momentum-scroll-bounces/
        if (elem) {
            elem.style['-webkit-overflow-scrolling'] = 'auto';
            // Use -1 to mean scroll to bottom
            elem.scrollTop=-1==val ? elem.scrollHeight : val;
            elem.style['-webkit-overflow-scrolling'] = 'touch';
        }
    });
}

function uniqueId(id, val) {
    return id+"@idx"+val;
}

function originalId(id) {
    return (""+id).split("@idx")[0];
}

function setScrollTop(view, val) {
    setElemScrollTop(view.scrollElement, val);
}

function getLocalStorageBool(key, def) {
    let val = undefined
    try {
        val = undefined==window.localStorage ? (window.materialSkinStorage ? window.materialSkinStorage[key] : undefined) : window.localStorage.getItem(LS_PREFIX+key);
    } catch (e) {
    }
    return undefined!=val ? "true" == val : def;
}

function getLocalStorageVal(key, def, checkForBool) {
    let val = undefined;
    try {
        val = undefined==window.localStorage ? (window.materialSkinStorage ? window.materialSkinStorage[key] : undefined) : window.localStorage.getItem(LS_PREFIX+key);
    } catch (e) {
    }
    return undefined!=val ? (checkForBool ? ("true"==val ? 1 : "false"==val ? 0 : val) : val) : def;
}

function setLocalStorageVal(key, val) {
    try {
        if (undefined!=window.localStorage) {
            window.localStorage.setItem(LS_PREFIX+key, val);
            return;
        }
    } catch (e) {
    }
    if (undefined==window.materialSkinStorage) {
        window.materialSkinStorage = {};
    }
    window.materialSkinStorage[key]=val;
}

function removeLocalStorage(key) {
    try {
        if (undefined!=window.localStorage) {
            window.localStorage.removeItem(LS_PREFIX+key);
        }
    } catch (e) {
    }
    if (undefined!=window.materialSkinStorage) {
        delete window.materialSkinStorage[key];
    }
}

function createLink(href, id, oldLink) {
    var newlink = document.createElement("link");
    newlink.setAttribute("rel", "stylesheet");
    newlink.setAttribute("type", "text/css");
    newlink.setAttribute("href", href);
    newlink.setAttribute("id", id);
    if (undefined!=oldLink) {
        var onErr = oldLink.getAttribute("onerror");
        if (onErr!=undefined) {
            newlink.setAttribute("onerror", onErr);
        }
    }
    return newlink;
}

function changeLink(href, id, addIfNotFound) {
    var links = document.getElementsByTagName("link");
    if (undefined==links) {
        return;
    }
    for (var i=0, len=links.length; i<len; ++i) {
        if (links[i].getAttribute("id")==id) {
            if (isEmpty(href)) {
                document.getElementsByTagName("head").item(0).removeChild(links[i]);
            } else {
                if (links[i].getAttribute("href")==href) {
                    return;
                }
                document.getElementsByTagName("head").item(0).replaceChild(createLink(href, id, links[i]), links[i]);
            }
            return;
        }
    }
    if (addIfNotFound) {
        document.getElementsByTagName("head").item(0).appendChild(createLink(href, id));
    }
}

function setRoundCovers(round) {
    changeLink("html/css/covers/" + (round ? "round" : "square") + ".css?r=" + LMS_MATERIAL_REVISION, "covercss");
}


function getElementsByClassName(elem, tagName, clazz){
	var elems = (tagName == "*" && elem.all) ? elem.all : elem.getElementsByTagName(tagName);
	var found = new Array();
	var re = new RegExp("(^|\\s)" + clazz.replace(/\-/g, "\\-") + "(\\s|$)");
	for (var i=0, len=elems.length; i<len; i++) {
		if (re.test(elems[i].className)) {
			found.push(elems[i]);
		}
	}
	return found;
}

window.lastMskTextColors = {top:undefined};
function emitTextColor() {
    if (queryParams.nativeTextColor<1) {
        return;
    }
    if (undefined==window.mskToolbarElem) {
        window.mskToolbarElem=document.getElementById("main-toolbar");
        if (undefined==window.mskToolbarElem) {
            window.setTimeout(function() { emitTextColor(); }, 500);
            return;
        }
    }
    bus.$nextTick(function () {
        let top = undefined;
        if (undefined!=store.state.activeDialog && !store.state.darkUi && store.state.coloredToolbars) {
            let elems = getElementsByClassName(document.documentElement, "nav", "dialog-toolbar");
            top=getComputedStyle(elems.length>0 ? elems[0] : document.documentElement).getPropertyValue("--dialog-toolbar-text-color");
        } else {
            top = getComputedStyle(window.mskToolbarElem).getPropertyValue("--top-toolbar-text-color");
        }
        if (window.lastMskTextColors.top==top) {
            return;
        }
        window.lastMskTextColors.top=top;
        if (1==queryParams.nativeTextColor) {
            try {
                NativeReceiver.updateTextColor(top);
            } catch (e) {
            }
        } else if (queryParams.nativeTextColor>0) {
            emitNative("MATERIAL-TEXTCOLOR\nTOP " + top, queryParams.nativeTextColor);
        }
    });
}

function setTheme(theme, color, clearColorVars) {
    if (theme!=undefined) {
        theme=theme.replace("darker", "dark");
        let t = theme.split('-');
        let variant = t.length>1 && ('colored'==t[t.length-1] || 'standard'==t[t.length-1]) ? t.pop() : 'standard';
        let themeName = t.join('-');

        if (themeName.startsWith("user:")) {
            changeLink("/material/usertheme/" + themeName.substring(5) + "?r=" + LMS_MATERIAL_REVISION, "themecss");
        } else {
            changeLink("html/css/themes/" + themeName + ".css?r=" + LMS_MATERIAL_REVISION, "themecss");
        }
        changeLink("html/css/variant/" + variant + ".css?r=" + LMS_MATERIAL_REVISION, "variantcss");
        /* Fusion My Music tabs: iOS segmented only on Mojave; Material underline elsewhere */
        try {
            let isMojave = /Mojave/i.test(themeName) || /Mojave/i.test(theme);
            document.documentElement.classList.toggle('theme-mojave', isMojave);
            if (document.body) {
                document.body.classList.toggle('theme-mojave', isMojave);
            }
        } catch (e) {}
        emitTextColor();
        if (1==queryParams.nativeTheme) {
            bus.$nextTick(function () {
                try {
                    NativeReceiver.updateTheme(theme);
                } catch (e) {
                }
            });
        } else if (queryParams.nativeTheme>0) {
            emitNative("MATERIAL-THEME\nNAME " + theme, queryParams.nativeTheme);
        }
    }
    if (color!=undefined) {
        if (clearColorVars) {
            document.documentElement.style.removeProperty('--primary-color');
            document.documentElement.style.removeProperty('--pq-current-color');
            document.documentElement.style.removeProperty('--pq-current-album-color');
            document.documentElement.style.removeProperty('--drop-target-color');
            document.documentElement.style.removeProperty('--accent-color');
            document.documentElement.style.removeProperty('--highlight-rgb');
        }
        if (color.startsWith("user:")) {
            changeLink("/material/usercolor/" + color.substring(5) + "?r=" + LMS_MATERIAL_REVISION, "colorcss");
        } else {
            changeLink("html/css/colors/" + color + ".css?r=" + LMS_MATERIAL_REVISION, "colorcss");
        }
    }
}

function setLayout(useDesktop) {
    changeLink("html/css/" + (useDesktop ? "desktop" : "mobile") + ".css?r=" + LMS_MATERIAL_REVISION, "layoutcss");
    if (undefined==queryParams.css) {
        changeLink("/material/customcss/" + (useDesktop ? "desktop" : "mobile"), "customcss");
    }
}

function fixId(id, prefix) {
    var parts = id.split(".");
    if (parts.length>1) {
        parts.shift();
        return prefix + "."+parts.join(".");
    }
    return id;
}

function isVisible(elem) {
    var rect = elem.getBoundingClientRect();
    var viewHeight = Math.max(document.documentElement.clientHeight, window.innerHeight);
    return !(rect.bottom < 0 || rect.top - viewHeight >= 0);
}

function ensureVisible(elem, parent, adjust, attempt) {
    elem.scrollIntoView();
    if (isVisible(elem)) {
        if (undefined!=parent && undefined!=adjust) {
            // Only apply adjust if required - this is for MAI scroll, which has a
            // 'frosted' header
            let parentTop = parent.getBoundingClientRect().top;
            let elemTop = elem.getBoundingClientRect().top;
            if (elemTop+adjust<parentTop) {
                setElemScrollTop(parent, parent.scrollTop+adjust);
            }
        }
    } else if (undefined==attempt || attempt<15) {
        window.setTimeout(function() {
            ensureVisible(elem, parent, adjust, undefined==attempt ? 1 : attempt+1);
        }, 100);
    }
}

function cacheKey(command, params, start, batchSize) {
    return LMS_LIST_CACHE_PREFIX+LMS_CACHE_VERSION+":"+lmsLastScan+":"+
           (command ? command.join("-") : "") + ":" + (params ? params.join("-") : "") + 
           (command && (command[0]=="artists" || command[0]=="albums") ? (lmsOptions.noGenreFilter ? ":1" : ":0") : "") +
           (command && command[0]=="albums" ? ((!IS_MOBILE || lmsOptions.touchLinks) ? ":1" : ":0") + (lmsOptions.noRoleFilter ? ":1" : ":0") + (lmsOptions.useGrouping ? ":1" : ":0") : "") +
           (command && command[0]=="artists" ? (LMS_P_MAI && lmsOptions.showArtistImages ? ":1" : ":0") : "") +
           ":"+start+":"+batchSize;
}

function clearListCache(force, command) {
    // Delete old local-storage cache
    for (var key in window.localStorage) {
        if (key.startsWith(LS_PREFIX+LMS_LIST_CACHE_PREFIX) &&
            (force ||
             !key.startsWith(LS_PREFIX+LMS_LIST_CACHE_PREFIX+LMS_CACHE_VERSION+":"+lmsLastScan+":") ||
             (undefined!=command && key.indexOf(":"+command+":")>0))) {
            window.localStorage.removeItem(key);
        }
    }
    // Delete IndexedDB cache
    idbKeyval.keys().then(keys => {
        for (var i=0, len=keys.length; i<len; ++i) {
            if (keys[i].startsWith(LMS_LIST_CACHE_PREFIX) &&
                (force ||
                 !keys[i].startsWith(LMS_LIST_CACHE_PREFIX+LMS_CACHE_VERSION+":"+lmsLastScan+":") ||
                 (undefined!=command && key.indexOf(":"+command+":")>0))) {
                idbKeyval.del(keys[i]);
            }
        }
    }).catch(err => {
        canUseCache = false;
    });
}

function ratingString(current, val) {
    let str = "";
    let clzStr = RATINGS_START;
    if (current) {
        let prev=current.indexOf(clzStr);
        if (prev>-1) {
            str = current.substring(0, prev);
        } else {
            str += current;
        }
    }
    let index=Math.ceil(val/10.0);
    return index<=0 ? str : ((isEmpty(str) ? "" : (str+SEPARATOR))+clzStr+RATINGS[index<0 ? 0 : (index>=RATINGS.length ? RATINGS.length-1 : index)]+"</i>");
}

function isEmpty(str) {
    return undefined==str || null==str || str.length<1;
}

function isNull(v) {
    return undefined==v || null==v;
}

function msgIsEmpty(msg) {
    return msg=='Empty' || msg==i18n('Empty') || msg=='Empty.' || msg==(i18n('Empty')+'.');
}

function checkRemoteTitle(item) {
    return item && item.remote_title && !item.remote_title.startsWith("http:/") && !item.remote_title.startsWith("https:/")
        ? item.remote_title : undefined;
}

function hasPlayableId(item) {
    return item.item_id || item.track || item.track_id || item.album_id || item.artist_id || item.album || item.playlistid /* dynamic playlists*/ ||
           item.album || item.artist || item.variousartist || item.year || item.genre || item.playlist; // CustomBrowse
}

const ADD_LIBRARY_ID = new Set(['artists', 'albums', 'tracks', 'genres', 'years', 'browselibrary', 'custombrowse', 'works']);

function shouldAddLibraryId(command) {
    if (command.command && command.command.length>0) {
        if (ADD_LIBRARY_ID.has(command.command[0])) {
            return true;
        }
        if (command.command[0]=="playlistcontrol") {
            var lists =["command", "params"];
            for (var l=0, llen=lists.length; l<llen; ++l) {
                var list=command[lists[l]];
                for (var i=0, len=list.length; i<len; ++i) {
                    if (list[i].startsWith("artist_id:") || list[i].startsWith("album_id:") || list[i].startsWith("track_id:") ||
                        list[i].startsWith("genre_id:") || list[i].startsWith("year:") || list[i].startsWith("playlist_id:") ||
                        list[i].startsWith("work_id:")) {
                        return true;
                    }
                }
            }
        }
    }
    return false;
}

function addPart(str, part) {
    return str ? (part ? str+SEPARATOR+part : str) : part;
}

function commandGridKey(command, item) {
    if (undefined==command || undefined==command.command || command.command.length<1) {
        return undefined;
    }
    return command.command[command.command[0]=="material-skin" && command.command.length>1 ? 1 : 0]+
           (undefined==item || undefined==item.type || undefined!=item.stdItem || item.id.startsWith(MUSIC_ID_PREFIX) || item.id.startsWith(TOP_ID_PREFIX) ? "" : ("-"+item.type))+
           "-grid";
}

const USE_LIST_VIEW_BY_DEFAULT=new Set(["podcasts-grid", "youtube-grid", "playhistory-grid", "rndmix-grid"]);

function isSetToUseGrid(command, item) {
    var key = commandGridKey(command, item);
    if (undefined==key) {
        return true;
    }
    return getLocalStorageBool(key, !USE_LIST_VIEW_BY_DEFAULT.has(key))
}

function setUseGrid(command, use, item) {
    let key = commandGridKey(command, item);
    if (undefined!=key) {
        setLocalStorageVal(key, use);
    }
}

function gridCommand(view) {
    return view.isTop ? GRID_TOP : undefined==view.command || (view.current && view.current.id!=TOP_FAVORITES_ID && view.current.id!=GENRES_ID && view.current.id.startsWith(TOP_ID_PREFIX)) ? GRID_OTHER : view.command;
}

function forceItemUpdate(vm, item) {
    var prev = item.title;
    item.title = "XX"+item.title;
    vm.$nextTick(function () {
        item.title = prev;
    });
}

function mapArtistIcon(item) {
    item.icon=undefined;
    item.svg="artist";
    let field = getField(item, "role_id:");
    if (field>=0) {
        let roleStr = item.params[field].split(':')[1];
        let roleInt = parseInt(roleStr);
        if (isNaN(roleInt)) {
            item.svg = "role-"+roleStr.toLowerCase();
        } else {
            let pos = ARTIST_TYPE_IDS.indexOf(roleInt==TRACK_ARTIST_ROLE ? ARTIST_ROLE : roleInt);
            if (pos>=0) {
                item.svg = "role-"+ARTIST_TYPES[pos];
            }
        }
    }
}

function splitString(str) {
    var arr = [];
    var s = str.split(",");
    for (var i=0, len=s.length; i<len; ++i) {
        var e = s[i].trim();
        if (e.length>0) {
            arr.push(e);
        }
    }
    return arr;
}

const COMMA_REPLACEMENT = "__COMMA__";
function splitConfigString(str) {
    return str.split("\r").join("").split("\n").join(",").replace("\\,", COMMA_REPLACEMENT).split(",").map(function(itm) { return itm.trim().replace(COMMA_REPLACEMENT, ",") });
}

/**
 * FLIP list reordering: capture first positions, mutate DOM/data, then play
 * translateY animation so rows slide into place (Mac Finder-like).
 * No external library required.
 *
 * Usage:
 *   let play = flipListPrepare(container, '.row-selector');
 *   // mutate list order (Vue reactive)
 *   this.$nextTick(function() { play(); });
 */
function flipListPrepare(container, selector, durationMs) {
    if (!container || !selector) {
        return function() {};
    }
    let duration = undefined==durationMs ? 220 : durationMs;
    let els = Array.prototype.slice.call(container.querySelectorAll(selector));
    let first = new Map();
    for (let i=0, len=els.length; i<len; ++i) {
        first.set(els[i], els[i].getBoundingClientRect());
    }
    return function flipListPlay() {
        for (let i=0, len=els.length; i<len; ++i) {
            let el = els[i];
            if (!el.isConnected) {
                continue;
            }
            let f = first.get(el);
            if (!f) {
                continue;
            }
            let last = el.getBoundingClientRect();
            let dy = f.top - last.top;
            if (Math.abs(dy) < 0.5) {
                continue;
            }
            el.style.transition = 'none';
            el.style.transform = 'translateY(' + dy + 'px)';
            el.style.zIndex = '2';
            // force reflow
            void el.offsetHeight;
            el.style.transition = 'transform ' + duration + 'ms cubic-bezier(0.2, 0.8, 0.2, 1)';
            el.style.transform = '';
            (function(node) {
                let done = function() {
                    node.style.transition = '';
                    node.style.transform = '';
                    node.style.zIndex = '';
                    node.removeEventListener('transitionend', done);
                };
                node.addEventListener('transitionend', done);
                setTimeout(done, duration + 40);
            })(el);
        }
    };
}

function arrayMove(arr, from, to) {
    if (to >= arr.length) {
        var k = to - arr.length + 1;
        while (k--) {
            arr.push(undefined);
        }
    }
    arr.splice(to, 0, arr.splice(from, 1)[0]);
    return arr;
}

function getIndex(list, field) {
    if (undefined==list || list.length<1) {
        return -1;
    }
    for (var i=0, len=list.length; i<len; ++i) {
        if ((""+list[i]).startsWith(field)) {
            return i
        }
    }
    return -1;
}

function getField(item, field) {
    return getIndex(item.params, field);
}

function getParamVal(item, field, defVal) {
    let idx = getIndex(item.params, field);
    return -1==idx ? defVal : item.params[idx].split(':')[1]
}

function setFontSize(sz) {
    let std = 15;
    let small = 13;
    switch(sz) {
    case 'l':
        std = 17;
        small = 15;
        break;
    case 'r':
        break;
    case 's':
        std = 13;
        small = 11;
        break;
    }

    document.documentElement.style.setProperty('--std-font-size', std+'px');
    document.documentElement.style.setProperty('--small-font-size', small+'px');
}

var lastShortcut={key:undefined, modifier:undefined, time:undefined};
function handleShortcut(e) {
    if (store.state.keyboardControl) {
        e.preventDefault();
        let s = decodeShortcutEvent(e);
        if (s.key!=lastShortcut.key || s.modifier!=lastShortcut.modifier || undefined==lastShortcut.time || s.time-lastShortcut.time>100) {
            bus.$emit('keyboard', s.key, s.modifier);
        }
        lastShortcut=s;
    }
}

function handleRepeatingShortcut(e) {
    if (store.state.keyboardControl) {
        e.preventDefault();
        let s = decodeShortcutEvent(e);
        if (s.key!=lastShortcut.key || s.modifier!=lastShortcut.modifier || undefined==lastShortcut.time || s.time-lastShortcut.time>=300) {
            bus.$emit('keyboard', s.key, s.modifier);
            lastShortcut=s;
        }
    }
}

function bindKey(key, modifier, canRepeat) {
    Mousetrap.bind((undefined==modifier ? "" : (modifier+"+")) + key.toLowerCase(), canRepeat ? handleRepeatingShortcut : handleShortcut);
}

function unbindKey(key, modifier) {
    Mousetrap.unbind((undefined==modifier ? "" : (modifier+"+")) + key.toLowerCase());
}

function shortcutStr(key, shift, alt) {
    if (key.length>1) {
        if (key=="left") {
            key = "◁";
        } else if (key=="right") {
            key = "▷";
        } else if (key=="up") {
            key = "△";
        } else if (key=="down") {
            key = "▽";
        } else if (key=="space") {
            return i18n("Spacebar");
        } else if (key=="esc") {
            return i18n("Esc");
        } else if (key=="home") {
            return i18n("Home");
        } else if (key=="del") {
            return i18n("Delete");
        }
    }
    if (alt) {
        return IS_APPLE ? ("⌥+"+key) : i18n("Alt+%1", key);
    }
    if (shift) {
        return IS_APPLE ? i18n("⌘+Shift+%1", key) : i18n("Ctrl+Shift+%1", key);
    }
    return IS_APPLE ? i18n("⌘+%1", key) : i18n("Ctrl+%1", key);
}

function ttShortcutStr(str, key, shift, alt) {
    return undefined==key || IS_MOBILE ? str : (str+SEPARATOR+shortcutStr(key, shift, alt));
}

const PLAYLIST_EXTENSIONS = new Set(["m3u", "m3u8", "pls", "xspf", "asx", "cue"]);
function isPlaylist(filename) {
    if (undefined==filename) {
        return false;
    }
    var parts = filename.split('.');
    if (parts.length<2) {
        return false;
    }
    return PLAYLIST_EXTENSIONS.has(parts[parts.length-1].toLowerCase());
}

function focusEntryInputEl(ui) {
    if (!ui || !ui.$refs || !ui.$refs.entry) {
        return null;
    }
    let entry = ui.$refs.entry;
    try {
        if (entry.$el && entry.$el.querySelector) {
            return entry.$el.querySelector('input, textarea');
        }
        if (entry.tagName==='INPUT' || entry.tagName==='TEXTAREA') {
            return entry;
        }
        if (entry.querySelector) {
            return entry.querySelector('input, textarea');
        }
    } catch (e) {}
    return null;
}

function focusEntryNow(ui) {
    let entry = ui && ui.$refs ? ui.$refs.entry : null;
    if (!entry) {
        return false;
    }
    let input = focusEntryInputEl(ui);
    if (input) {
        try { input.focus({ preventScroll: true }); } catch (e) {
            try { input.focus(); } catch (e2) {}
        }
        if (document.activeElement===input) {
            return true;
        }
    }
    if (typeof entry.focus==='function' && entry!==input) {
        try { entry.focus(); } catch (e) {}
    }
    return !!(input && document.activeElement===input);
}

function focusEntry(ui) {
    if (focusEntryNow(ui)) {
        takeOverSearchKeyboard(ui);
        return;
    }
    if (!ui || typeof ui.$nextTick!=='function') {
        return;
    }
    ui.$nextTick(function() {
        if (focusEntryNow(ui)) {
            takeOverSearchKeyboard(ui);
            return;
        }
        ui.$nextTick(function() {
            focusEntryNow(ui);
            takeOverSearchKeyboard(ui);
        });
    });
}

let _searchKbGhost = null;
let _searchKbArmed = false;

function releaseSearchKeyboard() {
    _searchKbArmed = false;
    if (!_searchKbGhost) {
        return;
    }
    try { _searchKbGhost.blur(); } catch (e) {}
    try {
        if (_searchKbGhost.parentNode) {
            _searchKbGhost.parentNode.removeChild(_searchKbGhost);
        }
    } catch (e2) {}
    _searchKbGhost = null;
}

function armSearchKeyboard() {
    // iOS only: hold the keyboard open across the search-field mount.
    // Never on desktop — a leftover overlay steals clicks from the real field.
    if (typeof IS_MOBILE==='undefined' || !IS_MOBILE) {
        releaseSearchKeyboard();
        return;
    }
    _searchKbArmed = true;
    try {
        if (!_searchKbGhost) {
            let g = document.createElement('input');
            g.id = 'lms-search-kb-ghost';
            g.type = 'search';
            g.autocomplete = 'off';
            g.autocorrect = 'off';
            g.autocapitalize = 'off';
            g.spellcheck = false;
            g.setAttribute('aria-hidden', 'true');
            g.tabIndex = -1;
            g.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;border:0;padding:0;margin:0;pointer-events:none;font-size:16px;';
            document.body.appendChild(g);
            _searchKbGhost = g;
        }
        _searchKbGhost.value = '';
        _searchKbGhost.focus();
    } catch (e) {}
}

function isSearchKeyboardArmed() {
    return !!_searchKbArmed;
}

function takeOverSearchKeyboard(ui) {
    if (!_searchKbArmed) {
        return;
    }
    focusEntryNow(ui);
    let input = focusEntryInputEl(ui);
    if (input && document.activeElement===input) {
        releaseSearchKeyboard();
    }
}

function focusBrowseSearchInput() {
    let host = document.querySelector('.browse-lib-search-host');
    if (host) {
        host.classList.add('active');
        try {
            host.style.pointerEvents = 'auto';
            host.style.opacity = '1';
        } catch (eHost) {}
    }
    let el = document.getElementById('browse-search-input');
    if (!el) {
        return false;
    }
    try {
        el.removeAttribute('readonly');
        el.style.pointerEvents = 'auto';
        el.style.opacity = '1';
        el.style.webkitUserSelect = 'text';
        el.style.userSelect = 'text';
    } catch (eStyle) {}
    try { el.focus({ preventScroll: true }); } catch (e) {
        try { el.focus(); } catch (e2) {}
    }
    try {
        let len = (el.value || '').length;
        if (typeof el.setSelectionRange==='function') {
            el.setSelectionRange(len, len);
        }
    } catch (e3) {}
    if (typeof releaseSearchKeyboard==='function') {
        try { releaseSearchKeyboard(); } catch (e4) {}
    }
    return document.activeElement===el;
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function addNote(str) {
    return "<br/><br/><div class='note'>"+str+"</div>";
}

function rgb2Hex(rgb) {
    let hex="#";
    for (let i=0; i<3; ++i) {
        let hv = Math.round(rgb[i]).toString(16);
        hex += (hv.length==1 ? "0" : "") + hv;
    }
    return hex;
}

function hex2Rgb(hx) {
    let step = hx.length>4 ? 2 : 1;
    let rgb=[]
    for (let p=0; p<3; ++p) {
        rgb.push(parseInt("0x"+hx.substr(1+(p*step), step, 16)));
    }
    return rgb;
}

let lastToolbarColors = {top: undefined, bot:undefined};
function emitToolbarColors(top, bot, tries) {
    if (undefined==window.mskToolbarElem && store.state.tinted && store.state.cMixSupported) {
        window.mskToolbarElem=document.getElementById("main-toolbar");
        if (undefined==window.mskToolbarElem) {
            window.setTimeout(function() { emitToolbarColors(top, bot, tries); }, 500);
            return;
        }
    }
    // screen saver passes undefined for both top and bot whn its on => use black as colour.
    let t = undefined==top ? '#000000' : getComputedStyle(window.mskToolbarElem ? window.mskToolbarElem : document.documentElement).getPropertyValue(top);
    let b = undefined==bot ? '#000000' : getComputedStyle(document.documentElement).getPropertyValue(bot);
    if (t.startsWith('color-mix(')) {
        let parts = t.split(" ");
        let ca = hex2Rgb(parts[2].replace(",", ""));
        let cb = hex2Rgb(parts[3]);
        let pc = parseFloat(parts[4].replace("%", ""))/100.0;
        let mixed = [];
        for (let i=0; i<3; ++i) {
            mixed.push( Math.ceil((ca[i]*(1.0-pc))+(cb[i]*pc)) );
        }
        t = rgb2Hex(mixed);
    }
    if (t!=lastToolbarColors.top || b!=lastToolbarColors.bot) {
        if (undefined==t || 0==t.length || undefined==b || 0==b.length) {
            if (undefined==tries || tries<20) {
                setTimeout(function() { emitToolbarColors(top, bot, undefined==tries ? 1 : (tries+1)); }, 100);
            }
            return;
        }
        let tc = document.querySelector('meta[name="theme-color"]');
        if (tc!=null) {
            tc.setAttribute('content',  t);
        }
        lastToolbarColors={top:t, bot:b};
        if (1==queryParams.nativeColors) {
            bus.$nextTick(function () {
                try {
                    NativeReceiver.updateToolbarColors(lastToolbarColors.top, lastToolbarColors.bot);
                } catch (e) {
                }
            });
        } else if (queryParams.nativeColors>0) {
            emitNative("MATERIAL-COLORS\nTOP " + lastToolbarColors.top + "\nBOTTOM " + lastToolbarColors.bot, queryParams.nativeColors);
        }
    }
}

const FULLSCREEN_DIALOGS = new Set(["uisettings", "playersettings", "info", "iframe", "manage"]);
function emitToolbarColorsFromState(state, force) {
    if (0!=queryParams.nativeColors || COLOR_USE_FROM_COVER==state.colorUsage || state.coloredToolbars || (state.tinted && state.cMixSupported) || force) {
        let topColorVar = "--top-toolbar-color";
        let botColorVar = "--bottom-toolbar-color";
        for (var i=state.openDialogs.length; i>=0; --i) {
            if (FULLSCREEN_DIALOGS.has(state.openDialogs[i])) {
                topColorVar = "--dialog-toolbar-color";
                botColorVar = "--background-color";
                break;
            }
        }
        emitToolbarColors(topColorVar, botColorVar);
    }
}

function formatTrackNum(item) {
    let t = parseInt(item.tracknum);
    let d = item.disccount && item.disc && parseInt(item.disccount)>1 ? parseInt(item.disc) : undefined;
    return (undefined==d ? "" : (d+".")) + (t>9 ? t : ("0" + t));
}

function getTouchPos(ev) {
    if (undefined==ev) {
        return undefined;
    }
    if (undefined==ev.touches || ev.touches.length<1) {
        if (undefined!=ev.changedTouches && ev.changedTouches.length>0) {
            return {x:ev.changedTouches[0].clientX, y:ev.changedTouches[0].clientY};
        }
        return undefined;
    }
    return {x:ev.touches[0].clientX, y:ev.touches[0].clientY};
}

/** Horizontal wheel delta for NP bar track change — matches touch swipe on Mac trackpad. */
function npBarWheelDeltaX(ev) {
    if (undefined==ev) {
        return 0;
    }
    let dx = ev.deltaX;
    if (ev.shiftKey && Math.abs(ev.deltaY)>Math.abs(dx)) {
        dx = ev.deltaY;
    }
    /* Natural-scroll trackpads report inverted deltaX vs finger-drag dx */
    if (IS_APPLE) {
        dx = -dx;
    }
    return dx;
}

function getClickPos(ev) {
    if (undefined==ev) {
        return undefined;
    }
    let clickX = ev['pageX'] || ev.clientX;
    if (clickX==undefined && ev.touches) {
        clickX = ev.touches[0].pageX;
    }
    let clickY = ev['pageY'] || ev.clientY;
    if (clickY==undefined && ev.touches) {
        clickY = ev.touches[0].pageY;
    }
    return {x:clickX, y:clickY};
}

function useArtistTagType(item, tagGenres) {
    return (item.remote && undefined==item.genre && (undefined==item.genres || (Array.isArray(item.genres) && item.genres.length<1))) ||
           (LMS_VERSION<90001 &&
              ((1==tagGenres.size && tagGenres.has('*')) ||
               (item.genres && Array.isArray(item.genres) && item.genres.some(g => tagGenres.has(g)) ||
               (!item.genres && item.genre && tagGenres.has(item.genre)))));
}

// WiiM hardware live inputs (Bluetooth / Optical / RCA / Line-In / HDMI).
// Music Artist Info is not useful for these continuous sources.
function isWiimLiveInput(item) {
    if (!item) {
        return false;
    }
    let url = (item.url || '').toString().toLowerCase();
    if (url.indexOf('wiim://live/')===0) {
        return true;
    }
    if (/^wiim:\/\/(bluetooth|optical|rca|linein|line-in|hdmi)(\/|$)/.test(url)) {
        return true;
    }
    if (item.extid==='wiim' && (1==item.live || true===item.live || 1==item.repeating_stream || true===item.repeating_stream)) {
        return true;
    }
    return false;
}

function useComposer(item) {
    return item.isClassical || 2==lmsOptions.showComposer || useArtistTagType(item, lmsOptions.composerGenres);
}

function useConductor(item) {
    return item.isClassical || useArtistTagType(item, lmsOptions.conductorGenres);
}

function useBand(item) {
    return item.isClassical || useArtistTagType(item, lmsOptions.bandGenres);
}

function splitIntArray(val) {
    return undefined==val ? val : Array.isArray(val) ? val.map(Number) : (""+val).split(",").map(function(itm) { return itm.trim() }).map(Number);
}

function splitStringArray(val, plainSep) {
    return undefined==val || Array.isArray(val) ? val : (""+val).split(plainSep ? "," : MULTI_SPLIT_REGEX).map(function(itm) { return itm.trim() });
}

function splitMultiple(item, typeKey, idsKey, isGenre) {
    let ids = splitIntArray(item[idsKey]);
    let strings = undefined;
    if (undefined!=ids) {
        if (1==ids.length && undefined!=item[typeKey]) {
            return [ids, [item[typeKey]]]
        }
        let vals = splitStringArray(item[typeKey], isGenre);
        if (undefined!=vals && ids.length>0 && ids.length==vals.length) {
            strings = vals;
        }
    }
    return [ids, strings];
}

function splitMultiples(item, withGenre) {
    let types=withGenre ? ["genre"].concat(ARTIST_TYPES) : ARTIST_TYPES;
    for (var i=0, len=types.length; i<len; ++i) {
        let isGenre = types[i]=="genre";
        let typeKey = undefined!=item[types[i]+"s"] ? types[i]+"s" : types[i];
        let idsKey = types[i]+"_ids";
        let vals = splitMultiple(item, typeKey, idsKey, isGenre);
        let ids = vals[0];
        let strings = vals[1];
        if (undefined!=ids) {
            item[idsKey] = ids;
            if (undefined!=strings) {
                item[types[i]+"_id"]=ids[0];
                item[types[i]] = strings[0];
                item[types[i]+"s"] = strings;
            }
        }
    }
}

function itemDuration(item) {
    if (undefined==item.duration) {
        return 0;
    }
    let val = parseFloat(item.duration);
    return val>0 ? val : 0;
}

function stripLinkTags(s) {
    return (!IS_MOBILE || lmsOptions.touchLinks) && (""+s).indexOf("<obj")>=0 ? s.replace(/(<([^>]+)>)/gi, "") : s;
}

function replaceBr(str, rep) {
    return isEmpty(str) ? str : str.replace(/\s?(<br\s?\/?>)\s?/g, rep);
}

function stripTags(str) {
    return isEmpty(str) ? str : str.replace('<br/>', '\n').replace(/<\/?[^>]+(>|$)/g, "");
}

function replaceHtmlBrackets(str){
    return isEmpty(str) ? str : str.replace(/</g, '\ufe64').replace(/>/g, '\ufe65');
}

function revertHtmlBrackets(str){
    return isEmpty(str) ? str : str.replace(/\ufe64/g, '<').replace(/\ufe65/g, '>');
}

function makeHtmlSafe(i) {
    if (undefined!=i) {
        for (let v=0, len=STRING_ITEM_PROPS.length; v<len; ++v) {
            let p = STRING_ITEM_PROPS[v];
            if (undefined!=i[p]) {
                i[p] = replaceHtmlBrackets(i[p]);
            }
        }
    }
    return i;
}

function trackTags(withCover) {
    return TRACK_TAGS+(lmsOptions.techInfo ? TECH_INFO_TAGS : "")+(withCover ? 'c' : "");
}

function trackTitle(i) {
    return undefined==i.work || i.title.toLowerCase().replace(/\W/g, '').includes(i.work.toLowerCase().replace(/\W/g, '')) ? i.title : i.work+SEPARATOR+i.title;
}

if (!String.prototype.replaceAll) {
    String.prototype.replaceAll = function(str, newStr) {
        let idx = 0;
        let len = str.length;
        let updated = this;
        for (;;) {
            idx = updated.indexOf(str, idx);
            if (idx<0) {
                break;
            }
            updated = updated.substring(0, idx) + newStr + updated.substring(idx + len);
        }
        return updated;
    };
}

function intersect(a, b) {
    let res = new Set();
    for (const itm of a) {
        if (b.has(itm)) {
            res.add(itm);
        }
    }
    return res;
}

let lastTbMouseDown=undefined;
function toolbarMouseDown(ev) {
    if (0==queryParams.nativeTitlebar || lmsNumVisibleMenus>0 || undefined==ev || undefined==ev.target || ev.button!=0 ||
        undefined==ev.target.parentElement || undefined==ev.target.parentElement.id || ev.target.parentElement.id.indexOf("-toolbar")<=0) {
        return;
    }
    let now = new Date().getTime();
    let toggleMax=undefined!=lastTbMouseDown && now-lastTbMouseDown<=LMS_DOUBLE_CLICK_TIMEOUT;
    lastTbMouseDown = now;
    if (1==queryParams.nativeTitlebar) {
        try { NativeReceiver.titlebarPressed(toggleMax); } catch (e) { }
    } else if (queryParams.nativeTitlebar>0) {
        emitNative("MATERIAL-TITLEBAR\nNAME " + (toggleMax ? "max" : "move"), queryParams.nativeTitlebar);
    }
}

function timeStr(date, lang) {
    return date.toLocaleTimeString(lang, { hour: 'numeric', minute: 'numeric', hour12:lmsOptions.time12hr });
}

function dateStr(date, lang) {
    return date.toLocaleDateString(lang, { weekday: 'short', month: 'short', day: 'numeric', year: undefined }).replace(", ", "  ");
}

function canClickItem(item) {
    return (item.style && item.style.startsWith('item') && item.style!='itemNoAction') ||
            undefined!=item.weblink ||
            // Some items have style=itemNoAction, but we have an action??? DynamicPlaylists...
            (/*!item.style &&*/ ( (item.actions && (item.actions.go || item.actions.do)) || item.nextWindow || item.params /*CustomBrowse*/));
}

function roleIntValue(val) {
    let lower = (""+val).toLowerCase();
    let idx = ARTIST_TYPES.indexOf(lower);
    return idx>=0 && idx<ARTIST_TYPES.length
        ? ARTIST_TYPE_IDS[idx]
        : isNaN(lower) ? 0 : parseInt(lower);
}

function addBrowserHistoryItem() {
    if (!queryParams.dontTrapBack && window.mskHistoryLen<200) {
        window.history.pushState({ }, '' );
        window.mskHistoryLen++;
    }
}

function updateBgndImage(view, url) {
    if (url!=view.currentBgndUrl) {
        view.currentBgndUrl = url;
        if (IS_IOS) {
            view.showBgnd = false;
            setTimeout(function() { view.showBgnd = true; }, 50);
        }
    }
}

function albumGroupingType(discCount, groupCount, contiguousGroups, parentIsWork) {
    let multiDisc = lmsOptions.groupdiscs && undefined!=discCount && parseInt(discCount)>1;
    let multiGroup = parentIsWork || (undefined!=groupCount && parseInt(groupCount)>1 && (undefined==contiguousGroups || 1==parseInt(contiguousGroups)));
    return multiGroup && (lmsOptions.useGrouping || !multiDisc)
        ? MULTI_GROUP_ALBUM
        : multiDisc
            ? MULTI_DISC_ALBUM
            : 0;
}

function arraysEqual(a, b) {
    if (a === b) {
        return true;
    }
    if (a == null || b == null || a.length !== b.length) {
        return false;
    }

    for (let i = 0, len=a.length; i < len; ++i) {
        if (a[i] !== b[i]) {
            return false;
        }
    }
    return true;
}

function isAudioTrack(item) {
    return (undefined!=item.stdItem && (STD_ITEM_TRACK==item.stdItem || STD_ITEM_ALBUM_TRACK==item.stdItem || STD_ITEM_PLAYLIST_TRACK==item.stdItem || STD_ITEM_REMOTE_PLAYLIST_TRACK==item.stdItem || STD_ITEM_RANDOM_MIX==item.stdItem)) ||
           "audio"==item.type || "track"==item.type ||
                ( ("itemplay"==item.style || "item_play"==item.style) && item.menu && item.menu.length>0) || // itemplay for dynamic playlists
                (item.goAction && (item.goAction == "playControl" || item.goAction == "play"));
}

let mskSbarSize = undefined;
function getScrollBarSize() {
    if (mskSbarSize!=undefined) {
        return mskSbarSize;
    }
    let el = document.createElement("div");
    el.style.cssText = "overflow:scroll; visibility:hidden; position:absolute;";
    document.body.appendChild(el);
    let width = el.offsetWidth - el.clientWidth;
    el.remove();
    if (!IS_MOBILE && IS_APPLE) {
        mskSbarSize = Math.max(MACOS_SCROLLBAR_SIZE, width);
    } else {
        mskSbarSize = Math.max(10, width);
    }
    return mskSbarSize;
}

function addSubtitle(title, item) {
    if (lmsOptions.showSubtitle && item.subtitle) {
        if (item.subtitle[0]=='[' || item.subtitle[0]=='(') {
            return title + " " + item.subtitle;
        } else {
            return title + SEPARATOR + item.subtitle;
        }
    }
    return title;
}

function numScrollItems(view, elem) {
    let listWidth = view.$store.state.desktopLayout ? elem.scrollWidth : window.innerWidth;
    let numItems = Math.ceil((Math.floor(listWidth/145))/5) * 5;
    if (numItems<10) {
        numItems = 10;
    } else if (numItems>MAX_HOME_EXTRA_ROW) {
        numItems = MAX_HOME_EXTRA_ROW;
    }
    return numItems;
}

/**
 * Mobile bottom-sheet: open at half height; height follows the finger while
 * expanding/shrinking; snap to half/full on release; drag down to dismiss.
 * Merged into browse + queue methods (early-loaded utils.js).
 */
var contextSheetMethods = {
    ctxSheetFindEl() {
        // Prefer active sheet; include presets-editor drawer (same expand/dismiss model)
        return document.querySelector('.v-menu__content.msk-context-sheet.menuable__content__active')
            || document.querySelector('.v-menu__content.msk-context-sheet.presets-editor-menu-sheet.menuable__content__active')
            || document.querySelector('.v-menu__content.msk-context-sheet');
    },
    ctxSheetHeights() {
        let vh = window.innerHeight || document.documentElement.clientHeight || 600;
        return {
            half: Math.round(vh * 0.48),
            full: Math.min(Math.round(vh * 0.88), 720)
        };
    },
    /** Apply pixel height; animate=false while finger tracks. Clamped half…full. */
    ctxSheetSetHeight(px, animate) {
        let el = this.ctxSheetFindEl();
        if (!el) {
            return;
        }
        let h = this.ctxSheetHeights();
        // Never below first step (half) — full dismiss is outside-click only
        px = Math.max(h.half, Math.min(h.full, px));
        this._ctxSheetHeight = px;
        el.classList.add('msk-context-sheet-sized');
        if (animate) {
            el.classList.remove('msk-context-sheet-dragging');
            el.style.transition = 'height 0.32s cubic-bezier(0.2, 0.8, 0.2, 1), max-height 0.32s cubic-bezier(0.2, 0.8, 0.2, 1)';
        } else {
            el.classList.add('msk-context-sheet-dragging');
            el.style.transition = 'none';
        }
        // !important so fusion/desktop menu CSS cannot pin height at half
        try {
            el.style.setProperty('height', px + 'px', 'important');
            el.style.setProperty('max-height', px + 'px', 'important');
        } catch (e) {
            el.style.height = px + 'px';
            el.style.maxHeight = px + 'px';
        }
        if (px >= h.full - 2) {
            el.classList.add('msk-context-sheet-expanded');
            this._ctxSheetExpanded = true;
        } else {
            el.classList.remove('msk-context-sheet-expanded');
            this._ctxSheetExpanded = false;
        }
        if (animate) {
            // Clear transition after settle so later gestures stay snappy
            clearTimeout(this._ctxHeightAnimTimer);
            this._ctxHeightAnimTimer = setTimeout(function() {
                let e2 = this.ctxSheetFindEl();
                if (e2 && !this._ctxDrag && !this._ctxBodyResize) {
                    e2.style.removeProperty('transition');
                    e2.classList.remove('msk-context-sheet-dragging');
                }
            }.bind(this), 340);
        }
    },
    ctxSheetSnap(toFull) {
        let h = this.ctxSheetHeights();
        this.ctxSheetSetHeight(toFull ? h.full : h.half, true);
    },
    /**
     * Open at half height with a single slide-up. Height is locked for the
     * duration of the enter animation so JS sizing cannot fight the keyframes.
     */
    ctxSheetPrepareOpen() {
        if (this._ctxSheetPreparing) {
            return;
        }
        this._ctxSheetPreparing = true;
        this._ctxSheetExpanded = false;
        this._ctxBodyResize = null;
        this._ctxDrag = null;
        // Long-press is still down when the sheet appears; ignore the matching
        // touchend/click on the scrim or Vuetify would dismiss immediately.
        this._ctxIgnoreCloseUntil = Date.now() + 800;
        if (this.menu) {
            // Vue 2: keep nested fields reactive for info panel
            if (!this.menu.info) {
                this.$set(this.menu, 'info', { open: false, loading: false, title: '', html: '', error: false });
            } else {
                this.menu.info.open = false;
                this.menu.info.loading = false;
                this.menu.info.html = '';
                this.menu.info.error = false;
            }
        }
        let tries = 0;
        let apply = function() {
            let el = this.ctxSheetFindEl();
            if (!el) {
                if (tries++ < 16) {
                    requestAnimationFrame(apply);
                    return;
                }
                this._ctxSheetPreparing = false;
                return;
            }
            this.ctxSheetShiftPage(true);
            let h = this.ctxSheetHeights();
            this._ctxSheetHeight = h.half;
            el.classList.remove('msk-context-sheet-expanded', 'msk-context-sheet-closing', 'msk-context-sheet-dragging');
            // Size first (no transition), then play enter animation once
            el.classList.add('msk-context-sheet-sized', 'msk-context-sheet-enter');
            el.style.transition = 'none';
            try {
                el.style.setProperty('height', h.half + 'px', 'important');
                el.style.setProperty('max-height', h.half + 'px', 'important');
            } catch (e) {
                el.style.height = h.half + 'px';
                el.style.maxHeight = h.half + 'px';
            }
            el.style.transform = 'translateY(100%)';
            // next frame: slide up
            requestAnimationFrame(function() {
                requestAnimationFrame(function() {
                    el.style.transition = 'transform 0.28s cubic-bezier(0.2, 0.8, 0.2, 1)';
                    el.style.transform = 'translateY(0)';
                    setTimeout(function() {
                        if (el) {
                            el.classList.remove('msk-context-sheet-enter');
                            el.style.removeProperty('transition');
                            // keep transform clean for dismiss gestures
                            el.style.removeProperty('transform');
                        }
                        this._ctxSheetPreparing = false;
                    }.bind(this), 300);
                }.bind(this));
            }.bind(this));
        }.bind(this);
        if (this.$nextTick) {
            this.$nextTick(apply);
        } else {
            setTimeout(apply, 16);
        }
    },
    /** Strip album_id:/artist_id: and @idxN uniqueness suffixes. */
    ctxSheetIdValue(id, prefix) {
        if (undefined==id || null==id) {
            return undefined;
        }
        let s = typeof originalId==='function' ? originalId(''+id) : (''+id).split('@idx')[0];
        if (prefix && s.startsWith(prefix)) {
            s = s.substring(prefix.length);
        }
        // Reject empty / non-numeric noise
        if (!s || s==='undefined' || s==='null') {
            return undefined;
        }
        return s;
    },
    /** Slide to info panel and fetch MAI biography / album review. */
    ctxSheetLoadInfo(item, isArtist) {
        if (!item || !LMS_P_MAI) {
            bus.$emit('showMessage', i18n('Music Artist Info plugin not available'));
            return;
        }
        let artistId = item.artist_id || item.albumartist_id ||
            (item.commonParams && (item.commonParams.artist_id || item.commonParams.albumartist_id));
        let albumId = item.album_id || (item.commonParams && item.commonParams.album_id);
        // Clean raw ids (may be "album_id:12@idx3" on browse rows)
        artistId = this.ctxSheetIdValue(artistId) ||
            this.ctxSheetIdValue(item.id, 'artist_id:');
        albumId = this.ctxSheetIdValue(albumId) ||
            this.ctxSheetIdValue(item.id, 'album_id:');
        // Parent album/artist list context (tracks often omit album_id / album)
        let cur = this.current;
        if (!albumId && cur && cur.id) {
            albumId = this.ctxSheetIdValue(cur.id, 'album_id:') ||
                this.ctxSheetIdValue(cur.album_id);
        }
        if (!artistId && cur) {
            artistId = this.ctxSheetIdValue(cur.artist_id) ||
                this.ctxSheetIdValue(cur.albumartist_id) ||
                (cur.id ? this.ctxSheetIdValue(cur.id, 'artist_id:') : undefined);
        }
        if (!artistId && this.command && this.command.params) {
            artistId = this.ctxSheetIdValue(getParamVal(this.command, 'artist_id', artistId));
        }
        if (!albumId && this.command && this.command.params) {
            albumId = this.ctxSheetIdValue(getParamVal(this.command, 'album_id', albumId));
        }
        // Names for fallback queries (strip HTML / brackets)
        let cleanName = function(s) {
            if (!s) { return undefined; }
            let t = typeof stripTags==='function' ? stripTags(''+s) : (''+s);
            if (typeof revertHtmlBrackets==='function') {
                t = revertHtmlBrackets(t);
            }
            t = t.replace(/\s+/g, ' ').trim();
            return t || undefined;
        };
        // Album rows use origTitle for the pure album name; title may include artist
        let artistName = cleanName(item.artist || item.albumartist || item.trackartist) ||
            (item.artists && item.artists.length ? cleanName(item.artists[0]) : undefined) ||
            (item.id && (''+item.id).startsWith('artist_id:') ? cleanName(item.title) : undefined) ||
            (item.id && (''+item.id).startsWith('album_id:') ? cleanName(item.subtitle) : undefined) ||
            (cur && cur.id && (''+cur.id).startsWith('artist_id:') ? cleanName(cur.title) : undefined) ||
            (cur ? cleanName(cur.artist || cur.albumartist || cur.subtitle) : undefined);
        let albumName = cleanName(item.album || item.origTitle) ||
            (item.id && (''+item.id).startsWith('album_id:') ? cleanName(item.origTitle || item.title) : undefined) ||
            (cur && cur.id && (''+cur.id).startsWith('album_id:')
                ? cleanName(cur.origTitle || cur.album || cur.title)
                : (cur ? cleanName(cur.album || cur.origTitle) : undefined));
        let title;
        // Build MAI command the same way as Now Playing (id alone when present;
        // mixing album_id + album + artist often returns empty from MAI).
        let buildCmd = function(preferId) {
            if (isArtist) {
                let c = ['musicartistinfo', 'biography', 'html:1'];
                if (preferId && undefined!=artistId) {
                    c.push('artist_id:'+artistId);
                } else if (artistName) {
                    c.push('artist:'+artistName);
                } else if (undefined!=artistId) {
                    c.push('artist_id:'+artistId);
                }
                return c;
            }
            let c = ['musicartistinfo', 'albumreview', 'html:1'];
            if (preferId && undefined!=albumId) {
                c.push('album_id:'+albumId);
            } else {
                if (albumName) {
                    c.push('album:'+albumName);
                }
                if (undefined!=artistId) {
                    c.push('artist_id:'+artistId);
                } else if (artistName) {
                    c.push('artist:'+artistName);
                }
                // Last resort if we only had id
                if (c.length===3 && undefined!=albumId) {
                    c.push('album_id:'+albumId);
                }
            }
            return c;
        };
        if (isArtist) {
            if (undefined==artistId && !artistName) {
                bus.$emit('showMessage', i18n('No artist information available'));
                return;
            }
            title = ACTIONS[ARTIST_INFO_ACTION].title + (artistName ? SEPARATOR+artistName : '');
        } else {
            if (undefined==albumId && !albumName) {
                bus.$emit('showMessage', i18n('No album information available'));
                return;
            }
            title = ACTIONS[ALBUM_INFO_ACTION].title + (albumName ? SEPARATOR+albumName : '');
        }
        if (!this.menu.info) {
            this.$set(this.menu, 'info', { open: false, loading: false, title: '', html: '', error: false });
        }
        this.menu.info.open = true;
        this.menu.info.loading = true;
        this.menu.info.error = false;
        this.menu.info.title = title;
        this.menu.info.html = '';
        // Expand sheet so there is room to read
        this.ctxSheetSnap(true);
        let reqId = (this._ctxInfoReq = (this._ctxInfoReq || 0) + 1);
        let pid = (typeof this.playerId==='function' ? this.playerId() : undefined) ||
            (this.$store && this.$store.state && this.$store.state.player && this.$store.state.player.id);
        let extractHtml = function(data) {
            if (!data || !data.result) {
                return '';
            }
            let r = data.result;
            let bio = r.biography || r.artistbiography || r.bio;
            let review = r.albumreview || r.album_review || r.review || r.albumReview;
            if (isArtist && bio) {
                return typeof replaceNewLines==='function' ? replaceNewLines(bio) : bio;
            }
            if (!isArtist && review) {
                return typeof replaceNewLines==='function' ? replaceNewLines(review) : review;
            }
            if (r.error) {
                return stripTags(''+r.error);
            }
            if (r.warning) {
                return stripTags(''+r.warning);
            }
            return '';
        }.bind(this);
        let finish = function(html) {
            if (reqId !== this._ctxInfoReq) {
                return;
            }
            this.menu.info.loading = false;
            if (html) {
                this.menu.info.html = html;
                this.menu.info.error = false;
            } else {
                this.menu.info.html = i18n('No information found');
                this.menu.info.error = true;
            }
        }.bind(this);
        let preferId = isArtist ? (undefined!=artistId) : (undefined!=albumId);
        let primary = buildCmd(preferId);
        // Guard: need at least one query term beyond html:1
        if (primary.length < 4) {
            finish('');
            return;
        }
        lmsCommand(pid, primary).then(function(res) {
            if (reqId !== this._ctxInfoReq) {
                return;
            }
            let html = extractHtml(res && res.data);
            // Id-only miss → try name-based once (common when library ids drift)
            if (!html && preferId && ((isArtist && artistName) || (!isArtist && albumName))) {
                let fallback = buildCmd(false);
                if (fallback.length >= 4 && fallback.join(' ') !== primary.join(' ')) {
                    return lmsCommand(pid, fallback).then(function(res2) {
                        finish(extractHtml(res2 && res2.data));
                    }.bind(this)).catch(function() {
                        finish('');
                    }.bind(this));
                }
            }
            finish(html);
        }.bind(this)).catch(function() {
            // Network / plugin error — still try name fallback once
            if (preferId && ((isArtist && artistName) || (!isArtist && albumName))) {
                let fallback = buildCmd(false);
                if (fallback.length >= 4) {
                    return lmsCommand(pid, fallback).then(function(res2) {
                        finish(extractHtml(res2 && res2.data));
                    }.bind(this)).catch(function() {
                        finish('');
                    }.bind(this));
                }
            }
            finish('');
        }.bind(this));
    },
    ctxSheetInfoBack() {
        if (this.menu && this.menu.info) {
            this.menu.info.open = false;
            this.menu.info.loading = false;
        }
        this._ctxInfoReq = (this._ctxInfoReq || 0) + 1;
    },
    /**
     * Scroll + swipe expansion (half → full):
     * While not full, scrolling the action list grows the sheet first; content
     * only scrolls after the sheet is fully expanded.
     */
    ctxSheetOnBodyScroll(ev) {
        if (this.desktopLayout || !this.menu || !this.menu.show) {
            return;
        }
        let body = (ev && (ev.currentTarget || ev.target)) || null;
        if (!body || typeof body.scrollTop !== 'number') {
            return;
        }
        let h = this.ctxSheetHeights();
        let cur = this._ctxSheetHeight || h.half;
        // Fully expanded: allow normal list scrolling
        if (cur >= h.full - 2) {
            return;
        }
        let st = body.scrollTop || 0;
        if (st <= 0) {
            return;
        }
        // Convert scroll distance into height growth (simultaneous swipe+expand)
        let next = Math.min(h.full, cur + st);
        try { body.scrollTop = 0; } catch (e) {}
        this.ctxSheetSetHeight(next, false);
        // Snap once we cross the mid point so it settles on "second position"
        if (next >= (h.half + h.full) / 2) {
            if (!this._ctxScrollSnapTimer) {
                this._ctxScrollSnapTimer = setTimeout(function() {
                    this._ctxScrollSnapTimer = null;
                    let hh = this.ctxSheetHeights();
                    let c = this._ctxSheetHeight || hh.half;
                    this.ctxSheetSnap(c >= (hh.half + hh.full) / 2);
                }.bind(this), 90);
            }
        }
    },
    ctxSheetBodyTouchStart(ev) {
        if (this.desktopLayout || !this.menu || !this.menu.show || !ev.touches || !ev.touches[0]) {
            return;
        }
        let body = ev.currentTarget;
        let h = this.ctxSheetHeights();
        let cur = this._ctxSheetHeight || h.half;
        // Prefer live measured height if JS state was cleared
        if (cur <= h.half + 1) {
            let el = this.ctxSheetFindEl();
            if (el && el.getBoundingClientRect) {
                let rh = el.getBoundingClientRect().height;
                if (rh > h.half + 4 && rh <= h.full + 4) {
                    cur = rh;
                    this._ctxSheetHeight = rh;
                }
            }
        }
        this._ctxBodyResize = {
            y0: ev.touches[0].clientY,
            h0: cur,
            active: false,
            canGrow: cur < h.full - 2,
            atTop: !body || body.scrollTop <= 2
        };
    },
    ctxSheetBodyTouchMove(ev) {
        if (!this._ctxBodyResize || this.desktopLayout) {
            return;
        }
        let t = ev.touches && ev.touches[0];
        if (!t) {
            return;
        }
        let dyUp = this._ctxBodyResize.y0 - t.clientY; // finger up → positive
        let body = ev.currentTarget;
        let atTop = !body || body.scrollTop <= 2;
        let h = this.ctxSheetHeights();
        let cur = this._ctxSheetHeight || h.half;
        // Grow sheet while not full: swipe up near top (or already resizing)
        // Also allow slight scrollTop so expand happens "at the same time as swipe"
        let nearTop = atTop || (body && body.scrollTop < 28);
        if ((this._ctxBodyResize.canGrow || cur < h.full - 2) &&
            (dyUp > 4 || this._ctxBodyResize.active) &&
            (nearTop || this._ctxBodyResize.active)) {
            this._ctxBodyResize.active = true;
            if (body && body.scrollTop > 0) {
                try { body.scrollTop = 0; } catch (e) {}
            }
            this.ctxSheetSetHeight(this._ctxBodyResize.h0 + Math.max(0, dyUp), false);
            if (ev.cancelable) {
                ev.preventDefault();
            }
            return;
        }
        // Shrink from full when at top and pulling down
        if (atTop && dyUp < -6 && cur > h.half + 2) {
            this._ctxBodyResize.active = true;
            this.ctxSheetSetHeight(this._ctxBodyResize.h0 + dyUp, false);
            if (ev.cancelable) {
                ev.preventDefault();
            }
        }
    },
    ctxSheetBodyTouchEnd() {
        if (!this._ctxBodyResize) {
            return;
        }
        if (this._ctxBodyResize.active) {
            let h = this.ctxSheetHeights();
            let cur = this._ctxSheetHeight || h.half;
            let mid = (h.half + h.full) / 2;
            // Always settle on a step — never dismiss from body drag
            this.ctxSheetSnap(cur >= mid);
        }
        this._ctxBodyResize = null;
    },
    /**
     * Full dismiss with slide-down animation (outside click / scrim).
     * Drag-down only contracts to half — it does not call this.
     */
    ctxSheetShiftPage(on) {
        try {
            if (on) {
                document.documentElement.classList.add('msk-ctx-sheet-open');
            } else {
                document.documentElement.classList.remove('msk-ctx-sheet-open');
            }
        } catch (e) {}
    },
    ctxSheetClose() {
        if (this._ctxIgnoreCloseUntil && Date.now() < this._ctxIgnoreCloseUntil) {
            return;
        }
        this.ctxSheetCloseAnimated();
    },
    ctxSheetScrimTouchEnd(ev) {
        if (this._ctxIgnoreCloseUntil && Date.now() < this._ctxIgnoreCloseUntil) {
            try { ev.preventDefault(); } catch (e) {}
            try { ev.stopPropagation(); } catch (e2) {}
        }
    },
    ctxSheetCloseAnimated() {
        if (this._ctxSheetClosing) {
            return;
        }
        if (this.desktopLayout || !this.menu || !this.menu.show) {
            if (this.menu) {
                this.menu.show = false;
            }
            this.ctxSheetResetStyles();
            return;
        }
        let el = this.ctxSheetFindEl() || this._ctxSheetEl;
        let scrim = this._ctxScrimEl
            || document.querySelector('.msk-context-scrim.presets-editor-ctx-scrim')
            || document.querySelector('.msk-context-scrim');
        this._ctxSheetClosing = true;
        this._ctxDrag = null;
        this._ctxBodyResize = null;
        this.ctxSheetShiftPage(false);
        if (typeof browsePreviewHoldStop==='function' && (this._previewSticky || this._previewHoldActive)) {
            try { browsePreviewHoldStop(this, true); } catch (ePrevStop) {}
        }
        if (!el) {
            if (this.menu) {
                this.menu.show = false;
            }
            this.ctxSheetResetStyles();
            this._ctxSheetClosing = false;
            return;
        }
        el.classList.remove('msk-context-sheet-dragging');
        el.classList.add('msk-context-sheet-closing');
        // Ensure we animate from current place (no residual half-height snap fight)
        el.style.transition = 'transform 0.28s cubic-bezier(0.4, 0, 1, 1), opacity 0.22s ease';
        // Force reflow so transition runs
        try { void el.offsetHeight; } catch (e) {}
        el.style.transform = 'translateY(110%)';
        el.style.opacity = '0';
        if (scrim) {
            scrim.style.transition = 'opacity 0.26s ease';
            try { void scrim.offsetHeight; } catch (e2) {}
            scrim.style.opacity = '0';
        }
        setTimeout(function() {
            if (this.menu) {
                this.menu.show = false;
            }
            this.ctxSheetResetStyles();
            this._ctxSheetClosing = false;
        }.bind(this), 290);
    },
    /** Client Y from touch or pointer/mouse event. */
    ctxSheetEventClientY(ev) {
        if (!ev) {
            return undefined;
        }
        if (ev.touches && ev.touches[0] && undefined!=ev.touches[0].clientY) {
            return ev.touches[0].clientY;
        }
        if (ev.changedTouches && ev.changedTouches[0] && undefined!=ev.changedTouches[0].clientY) {
            return ev.changedTouches[0].clientY;
        }
        if (undefined!=ev.clientY) {
            return ev.clientY;
        }
        return undefined;
    },
    ctxSheetUnbindDocDrag() {
        if (this._ctxDocMove) {
            document.removeEventListener('touchmove', this._ctxDocMove, true);
            document.removeEventListener('pointermove', this._ctxDocMove, true);
            document.removeEventListener('mousemove', this._ctxDocMove, true);
            this._ctxDocMove = undefined;
        }
        if (this._ctxDocEnd) {
            document.removeEventListener('touchend', this._ctxDocEnd, true);
            document.removeEventListener('touchcancel', this._ctxDocEnd, true);
            document.removeEventListener('pointerup', this._ctxDocEnd, true);
            document.removeEventListener('pointercancel', this._ctxDocEnd, true);
            document.removeEventListener('mouseup', this._ctxDocEnd, true);
            this._ctxDocEnd = undefined;
        }
    },
    ctxSheetBindDocDrag() {
        this.ctxSheetUnbindDocDrag();
        this._ctxDocMove = function(ev) {
            this.ctxSheetTouchMove(ev);
        }.bind(this);
        this._ctxDocEnd = function(ev) {
            this.ctxSheetTouchEnd(ev);
        }.bind(this);
        // Capture + non-passive so preventDefault works while finger leaves the handle
        document.addEventListener('touchmove', this._ctxDocMove, {capture: true, passive: false});
        document.addEventListener('touchend', this._ctxDocEnd, true);
        document.addEventListener('touchcancel', this._ctxDocEnd, true);
        document.addEventListener('pointermove', this._ctxDocMove, true);
        document.addEventListener('pointerup', this._ctxDocEnd, true);
        document.addEventListener('pointercancel', this._ctxDocEnd, true);
        document.addEventListener('mousemove', this._ctxDocMove, true);
        document.addEventListener('mouseup', this._ctxDocEnd, true);
    },
    ctxSheetTouchStart(ev) {
        if (this.desktopLayout || !this.menu || !this.menu.show || this._ctxSheetClosing) {
            return;
        }
        // Already tracking (touchstart + pointerdown both fire on many devices)
        if (this._ctxDrag && this._ctxDrag.active) {
            return;
        }
        // Prefer pointer events: skip legacy mouse when PointerEvent exists
        if (ev && ev.type==='mousedown' && typeof window.PointerEvent!=='undefined') {
            return;
        }
        // Ignore non-primary mouse/pen
        if (ev && ev.type && (ev.type==='mousedown' || ev.type==='pointerdown') &&
            undefined!=ev.button && ev.button!==0) {
            return;
        }
        let y = this.ctxSheetEventClientY(ev);
        if (undefined==y) {
            return;
        }
        let h = this.ctxSheetHeights();
        let cur = this._ctxSheetHeight || h.half;
        // Prefer live measured height if JS state lagged after open animation
        this._ctxSheetEl = this.ctxSheetFindEl();
        if (this._ctxSheetEl) {
            try {
                let rh = Math.round(this._ctxSheetEl.getBoundingClientRect().height);
                if (rh > 40) {
                    cur = Math.max(h.half, Math.min(h.full, rh));
                    this._ctxSheetHeight = cur;
                }
            } catch (e) {}
        }
        this._ctxDrag = {
            y0: y,
            t0: Date.now(),
            dy: 0,
            h0: cur,
            mode: null, // resize only — dismiss is outside click
            active: true,
            pointerId: (ev && undefined!=ev.pointerId) ? ev.pointerId : undefined
        };
        this._ctxScrimEl = document.querySelector('.msk-context-scrim.presets-editor-ctx-scrim')
            || document.querySelector('.msk-context-scrim');
        if (this._ctxSheetEl) {
            this._ctxSheetEl.classList.add('msk-context-sheet-dragging');
            this._ctxSheetEl.classList.remove('msk-context-sheet-closing');
            this._ctxSheetEl.style.removeProperty('opacity');
            this._ctxSheetEl.style.removeProperty('transform');
        }
        this.ctxSheetBindDocDrag();
        // Capture pointer so drag continues outside the handle chrome
        try {
            if (ev && ev.currentTarget && ev.pointerId!=null && ev.currentTarget.setPointerCapture) {
                ev.currentTarget.setPointerCapture(ev.pointerId);
            }
        } catch (e2) {}
        if (ev && ev.cancelable && ev.type && ev.type.indexOf('touch')===0) {
            // do not preventDefault on start — allow click on header actions
        }
    },
    ctxSheetTouchMove(ev) {
        if (!this._ctxDrag || !this._ctxDrag.active) {
            return;
        }
        if (this._ctxDrag.pointerId!=null && ev && undefined!=ev.pointerId &&
            ev.pointerId!==this._ctxDrag.pointerId && !(ev.touches && ev.touches.length)) {
            return;
        }
        let y = this.ctxSheetEventClientY(ev);
        if (undefined==y) {
            return;
        }
        let rawDy = y - this._ctxDrag.y0; // down positive
        // Drag only resizes between half and full (1st ↔ 2nd step)
        if (!this._ctxDrag.mode && Math.abs(rawDy) > 6) {
            this._ctxDrag.mode = 'resize';
        }
        if (this._ctxDrag.mode !== 'resize') {
            return;
        }
        // Finger up (rawDy < 0) grows; finger down shrinks — clamped at half
        let newH = this._ctxDrag.h0 - rawDy;
        this.ctxSheetSetHeight(newH, false);
        this._ctxDrag.dy = rawDy;
        if (ev && ev.cancelable) {
            ev.preventDefault();
        }
    },
    ctxSheetTouchEnd() {
        if (!this._ctxDrag || !this._ctxDrag.active) {
            this.ctxSheetUnbindDocDrag();
            return;
        }
        let el = this._ctxSheetEl;
        let h = this.ctxSheetHeights();
        let rawDy = this._ctxDrag.dy || 0;
        this._ctxDrag.active = false;
        this._ctxDrag = null;
        this.ctxSheetUnbindDocDrag();

        // Settle on a step only — drag never fully dismisses
        let cur = this._ctxSheetHeight || h.half;
        let mid = (h.half + h.full) / 2;
        if (rawDy > 18) {
            // Drag down → first step (half)
            this.ctxSheetSnap(false);
        } else if (rawDy < -18) {
            // Drag up → second step (full)
            this.ctxSheetSnap(true);
        } else {
            this.ctxSheetSnap(cur >= mid);
        }
        if (el) {
            el.classList.remove('msk-context-sheet-dragging');
        }
    },
    ctxSheetResetStyles() {
        // Clear sheet sizing on any browse/queue menu content — class may already
        // be gone on desktop, but leftover height/max-height still force a tall box.
        let nodes = [];
        if (this._ctxSheetEl) {
            nodes.push(this._ctxSheetEl);
        }
        try {
            document.querySelectorAll('.v-menu__content.msk-context-sheet, .v-menu__content.menuable__content__active').forEach(function(n) {
                if (nodes.indexOf(n) < 0) { nodes.push(n); }
            });
        } catch (e) {}
        let scrim = this._ctxScrimEl || document.querySelector('.msk-context-scrim');
        for (let i = 0; i < nodes.length; i++) {
            let el = nodes[i];
            if (!el || !el.classList) { continue; }
            el.classList.remove('msk-context-sheet-dragging', 'msk-context-sheet-closing',
                'msk-context-sheet-expanded', 'msk-context-sheet-sized', 'msk-context-sheet-enter');
            el.style.removeProperty('transform');
            el.style.removeProperty('transition');
            el.style.removeProperty('height');
            el.style.removeProperty('max-height');
            el.style.removeProperty('opacity');
        }
        if (scrim) {
            scrim.style.removeProperty('opacity');
            scrim.style.removeProperty('transition');
        }
        this.ctxSheetShiftPage(false);
        this.ctxSheetUnbindDocDrag();
        this._ctxSheetEl = null;
        this._ctxScrimEl = null;
        this._ctxDrag = null;
        this._ctxBodyResize = null;
        this._ctxSheetExpanded = false;
        this._ctxSheetHeight = undefined;
        this._ctxSheetPreparing = false;
        this._ctxSheetClosing = false;
        if (this._ctxHeightAnimTimer) {
            clearTimeout(this._ctxHeightAnimTimer);
            this._ctxHeightAnimTimer = null;
        }
        if (this._ctxScrollSnapTimer) {
            clearTimeout(this._ctxScrollSnapTimer);
            this._ctxScrollSnapTimer = null;
        }
        this._ctxInfoReq = (this._ctxInfoReq || 0) + 1;
        if (this.menu && this.menu.info) {
            this.menu.info.open = false;
            this.menu.info.loading = false;
            this.menu.info.html = '';
        }
    }
};
