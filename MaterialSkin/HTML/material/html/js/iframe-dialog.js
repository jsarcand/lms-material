/**
 * LMS-Material
 *
 * Copyright (c) 2018-2026 Craig Drummond <craig.p.drummond@gmail.com>
 * MIT license.
 */
'use strict';

const SLOW_PAGES = new Set(['SETUP_PLUGINS']);
const LMS_PAGES =  new Set(['server', 'player', 'extras', 'lms']);
const LMS_STD_SETTINGS_PAGES =  new Set(['server', 'player']);

let useDefaultSkinForServerSettings = true;

function remapClassicSkinIcons(doc, col) {
    const ICONS = ["play", "add", "edit", "favorite", "favorite_remove", "delete", "delete_white", "first", "last", "up", "down", "mix", "mmix", "next", "prev", "queue"];
    const OTHER_EXT = [".png", ".gif"];
    var imgList = doc.getElementsByTagName('img');
    if (imgList) {
        for (var i = 0, len=imgList.length; i < len; i++) {
            var replaced = false;
            for (var m = 0, mlen = ICONS.length; m<mlen && !replaced; ++m) {
                if (imgList[i].src.endsWith("/html/images/b_" + ICONS[m] + ".gif")) {
                    imgList[i].src="/material/svg/cs-"+ICONS[m]+"?c="+col;
                    if (IS_MOBILE) {
                        imgList[i].classList.add("msk-cs-touch-img");
                    }
                    replaced = true;
                }
            }
            if (!replaced) {
                /* Try to handle plugin images from 'Extras' pages - e.g. DynamicPlaylistCreator
                 * src should be (e.g.):
                 *     http://localhost:9000/material/html/images/dplc_export.gif?svg=DynamicPlaylistCreator
                 * in plugin's HTML its just 'dplc_export.gif?svg=DynamicPlaylistCreator'
                 */
                for (var e = 0, elen = OTHER_EXT.length; e<elen && !replaced; ++e) {
                    try {
                        if (imgList[i].src.indexOf(OTHER_EXT[e]+"?svg=")>0) {
                            let url = undefined;
                            let path = imgList[i].src;
                            let pluginPath = "";
                            if (imgList[i].src.startsWith("http:")) {
                                url = new URL(path);
                                path = url.pathname;
                                pluginPath = "plugins/"+url.search.split("=")[1]+(path.startsWith("/html/images/") ? "/" : "/html/images/");
                            }
                            path="/material/svg/"+pluginPath+path.replace(OTHER_EXT[e], ".svg").replace(/^\/+/, '')
                            if (url!=undefined) {
                                url.pathname = path;
                                path=url.href;
                            }
                            imgList[i].src = path+"&c="+col;
                            if (IS_MOBILE) {
                                imgList[i].classList.add("msk-cs-touch-img");
                            }
                            replaced = true;
                        }
                    } catch(e) {
                        logError(e);
                    }
                }
            }
            if (!replaced && imgList[i].src.endsWith(".svg") && imgList[i].src.indexOf("/material/html/")>=0) {
                imgList[i].src=imgList[i].src.replace("/material/html/", "/material/svg/html/")+"?c="+col;
                imgList[i].removeAttribute("srcset");
            }
            /*if (!replaced) {
                if (imgList[i].src.endsWith("/star_noborder.gif") || imgList[i].src.endsWith("/star.gif")) {
                    imgList[i].src="/material/svg/cs-star?c="+col;
                    replaced = true;
                } else if (imgList[i].src.endsWith("/plugins/TrackStat/html/images/empty.gif")) {
                    imgList[i].src="/material/svg/cs-star_outline?c="+col;
                    replaced = true;
                }
            }*/
            if (replaced) {
                imgList[i].width="24";
                imgList[i].height="24";
            }
        }
    }
}

function fixClassicSkinRefs(doc) {
    var refList = doc.getElementsByTagName('a');
    if (refList) {
        for (var i = 0, len=refList.length; i < len; i++) {
            if (refList[i].target=='browser' && refList[i].href && refList[i].href.startsWith(window.location)) {
                refList[i].removeAttribute('target');
            }
        }
    }
}

function iframeBrowseArtist(id, name, role) {
    bus.$emit("browse", ["albums"], ["artist_id:"+id, ARTIST_ALBUM_TAGS, SORT_KEY+ARTIST_ALBUM_SORT_PLACEHOLDER, "role_id:"+(undefined==role ? "ALBUMARTIST" : role)], name, undefined, false);
    bus.$emit('iframe-close');
}

function iframeBrowseAlbum(id, name) {
    bus.$emit("browse", ["tracks"], ["album_id:"+id, TRACK_TAGS, SORT_KEY+"tracknum"], name, undefined, false);
    bus.$emit('iframe-close');
}

function iframeBrowseGenre(id, name) {
    bus.$emit("browse", "genre", id, name, undefined, false);
    bus.$emit('iframe-close');
}

function iframeBrowseYear(name) {
    bus.$emit("browse", "year", name, name, undefined, false);
    bus.$emit('iframe-close');
}

function iframeBrowseWork(id, name) {
    bus.$emit("browse", ["albums"], ["work_id:"+id, ARTIST_ALBUM_TAGS, SORT_KEY+ARTIST_ALBUM_SORT_PLACEHOLDER], name, undefined, false);
    bus.$emit('iframe-close');
}

function iframeTrackInfo(id, name) {
    bus.$emit('trackInfo', {id:"track_id:"+id, title:name});
    bus.$emit('iframe-close');
}

function addHooks(doc) {
    doc.lmsMaterialSkin = {
        browseArtist:iframeBrowseArtist,
        browseAlbum:iframeBrowseAlbum,
        browseGenre:iframeBrowseGenre,
        browseYear:iframeBrowseYear,
        browseWork:iframeBrowseWork,
        trackInfo:iframeTrackInfo
    }
}

function otherClickHandler(e) {
    var target = e.target || e.srcElement;
    var href = undefined;
    var clearHistoryOf = undefined;
    if (target.tagName === 'A') {
        href = target.getAttribute('href');
    } else if (target.tagName === 'SPAN' || target.tagName === 'IMG') {
        href = target.parentElement.getAttribute('href');
    }
    // If href is "/status_header.html" then redirect to current URL
    if (href && href.startsWith("/status_header.html?")) {
        let hpos = href.indexOf('?');
        let opos = iframeInfo.src.indexOf('?');
        if (opos>0) {
            href = iframeInfo.src.substring(0, opos+1) + href.substring(hpos+1);
            // Prevent click from propagating further - as causes a new page to open?
            e.preventDefault();
            // Reset any history related to current URL - as we've reset from status to current page
            clearHistoryOf = iframeInfo.src.substring(0, opos);
        }
    }
    if (href && !href.startsWith('#')) {
        bus.$emit('iframe-href', href, undefined, clearHistoryOf);
    }
}

function lmsClickHandler(e) {
    var target = e.target || e.srcElement;
    var href = target.tagName === 'A' ? target.getAttribute('href') : undefined;
    if (href!=null && (href.startsWith("/material/scanner.log") || href.startsWith("/material/server.log"))) {
        e.preventDefault();
        e.stopPropagation();
        bus.$emit('iframe-href', href, true, undefined, "/material/settings/server/debugging.html");
        return;
    }
    if (href!=null && detectBridgeAuxiliaryKey(href)) {
        e.preventDefault();
        e.stopPropagation();
        if (0!==href.indexOf('/')) {
            href = '/' + href;
        }
        bus.$emit('iframe-href', href, true);
    }
}

function clickDirSelect(elem) {
    var id = elem.srcElement.id.split('.')[1];
    bus.$emit('dlg.open', 'file', elem.srcElement.ownerDocument.getElementById(id), true);
}

function clickFileSelect(elem) {
    var id = elem.srcElement.id.split('.')[1];
    var entry = elem.srcElement.ownerDocument.getElementById(id);
    var types = [];
    for (var i=0, loop=entry.classList, len=loop.length; i<len; ++i) {
        if (loop[i].startsWith("selectFile_")) {
            types.push(loop[i].substring(11));
        }
    }
    bus.$emit('dlg.open', 'file', entry, false, types);
}

function addFsSelectButton(doc, elem, isDir) {
    if (elem && undefined==doc.getElementById("mskdirbtn."+elem.id)) {
        var btn = doc.createElement("div");
        btn.id="mskdirbtn."+elem.id;
        btn.classList.add("msk-dir-btn");
        btn.addEventListener("click", isDir ? clickDirSelect : clickFileSelect);
        // Append our icon after path field
        elem.parentNode.insertBefore(btn, elem.nextSibling);
    }
}

function addFsSelectButtons(doc) {
    var types=["selectFolder", "selectFile", "selectFile_.+"];
    for (var t=0; t<types.length; ++t) {
        var elems = types[t].endsWith("_.+") ? getElementsByClassName(doc, "input", types[t]) : doc.getElementsByClassName(types[t]);
        if (elems!=undefined) {
            for(var i=0, len=elems.length; i<len; ++i) {
                addFsSelectButton(doc, elems[i], 0==t);
            }
        }
    }
}

function addSliders(doc) {
    var inputs = getElementsByClassName(doc, "input", "sliderInput_.+");
    var added = false;
    if (inputs!=null) {
        for (var i=0, len=inputs.length; i<len; i++) {
            var classes = inputs[i].className.split(' ');
            if (classes.includes('msk-modified')) {
                continue;
            }
            for (var c=0, clen=classes.length; c<clen; ++c) {
                if (classes[c].startsWith('sliderInput_')) {
                    var parts = classes[c].substring('sliderInput_'.length).split('_');
                    if (parts.length>1) {
                        var min = parseInt(parts[0]);
                        var max = parseInt(parts[1]);
                        var inc = parts.length>2 ? parseInt(parts[2]) : 1;
                        var slider = doc.createElement("input");
                        slider.type="range";
                        slider.min=min;
                        slider.max=max;
                        slider.step=inc;
                        slider.value = inputs[i].value;
                        slider.classList.add("msk-slider");
                        slider.id="mskslider."+inputs[i].id;
                        inputs[i].parentNode.insertBefore(slider, inputs[i]);
                        if (max<=9999) {
                            inputs[i].classList.add("msk-slider-input");
                        }

                        slider.oninput = function() {
                            var inputId = this.id.substring("mskslider.".length);
                            var input = doc.getElementById(inputId);
                            input.value = this.value;
                            if (iframeMarkModified(input)) {
                                iframeScheduleAutoSave(doc);
                            }
                        }
                        slider.onchange = function() {
                            var inputId = this.id.substring("mskslider.".length);
                            var input = doc.getElementById(inputId);
                            input.value = this.value;
                            if (iframeMarkModified(input)) {
                                iframeAutoSaveSettings(doc, true);
                            }
                        }
                        inputs[i].classList.add('msk-modified');
                        inputs[i].min=min;
                        inputs[i].max=max;
                        inputs[i].onchange = function() {
                            var val = parseInt(this.value);
                            var minVal = parseInt(this.min);
                            var maxVal = parseInt(this.max);
                            if (val>maxVal) {
                                this.value = maxVal;
                            } else if (val<minVal) {
                                this.value = minVal;
                            }
                            doc.getElementById("mskslider."+this.id).value = this.value;
                        }
                    }
                    added = true;
                    break;
                }
            }
        }
    }
    return added;
}

function hideSection(elem) {
    let p = elem.parentElement;
    while (undefined!=p) {
        let classes = p.className.split(' ');
        if (classes.includes('settingSection')) {
            p.parentNode.removeChild(p);
            return true;
        }
        p=p.parentElement;
    }
    return false;
}

function hideSections(doc) {
    if (LMS_SETTINGS_HIDE.length<1) {
        return true;
    }
    let sections = LMS_SETTINGS_HIDE.split(',');
    let hidden = false;

    for (let s=0, len=sections.length; s<len; ++s) {
        let elem = doc.getElementById(sections[s].trim());
        if (undefined!=elem && hideSection(elem)) {
            hidden = true;
        }
    }
    return hidden;
}

function toggleClass(elem, clz) {
    let classes = elem.className.split(' ');
    if (classes.includes(clz)) {
        elem.classList.remove(clz);
        return false;
    } else {
        elem.classList.add(clz);
        return true;
    }
}

function toggleSection(doc, elem) {
    let panel = doc.getElementById(elem.id.replace(/_Header/, ''));
    if (!panel) {
        return;
    }
    let hasClass = toggleClass(panel, 'msk-hidden-section');
    toggleClass(elem.parentElement, 'msk-collapsed');
    if (hasClass) {
        setLocalStorageVal("iframe.section."+elem.id, true);
    } else {
        removeLocalStorage("iframe.section."+elem.id);
    }
}

function addExpanders(doc) {
    let collapsables = getElementsByClassName(doc, "div", "collapsableSection");
    let added = false;
    if (collapsables!=null) {
        for (let i=0, len=collapsables.length; i<len; i++) {
            let classes = collapsables[i].className.split(' ');
            if (classes.includes('msk-modified')) {
                continue;
            }
            added = true;
            collapsables[i].classList.add('msk-modified');
            let btn = doc.createElement("div");
            btn.id="mskexpanderbtn."+collapsables[i].id;
            btn.classList.add("msk-expander-btn");
            collapsables[i].parentNode.insertBefore(btn, collapsables[i]);

            let collapse = getLocalStorageBool("iframe.section."+collapsables[i].id, false);
            if (collapse) {
                toggleSection(doc, collapsables[i]);
            }
            collapsables[i].onclick=function(ev) {
                let target = ev.target;
                if (isEmpty(target.id)) {
                    target = target.parentElement;
                }
                toggleSection(doc, target);
            };
        }
    }
    return added;
}

function addHelp(doc) {
    let descDivs = getElementsByClassName(doc, "div", "hiddenDesc");
    let added = false;
    if (null!=descDivs) {
        for (let i=0, len=descDivs.length; i<len; i++) {
            let classes = descDivs[i].className.split(' ');
            if (classes.includes('msk-modified')) {
                continue;
            }
            let desc = descDivs[i].innerHTML;
            if (isEmpty(desc)) {
                continue;
            }
            let parent = descDivs[i].parentElement;
            if (null==parent) {
                continue;
            }
            classes = parent.className.split(' ');
            if (!classes.includes('settingGroup') && !classes.includes('settingSection')) {
                continue;
            }
            let titles = getElementsByClassName(parent, "div", "prefHead");
            if (null==titles || titles.length!=1) {
                continue;
            }
            let title=titles[0];
            descDivs[i].classList.add('msk-modified');
            added = true;
            let btn = doc.createElement("div");
            btn.classList.add("msk-help-btn");
            title.style.float="left";
            descDivs[i].parentNode.insertBefore(btn, descDivs[i]);
            descDivs[i].innerHTML="";
            btn.onclick=function(ev) {
                bus.$emit('dlg.open', 'iteminfo', {list:[title.innerHTML, desc]});
            };
        }
    }
    return added;
}

var iframeInfo = { };
const IFRAME_AUTOSAVE_DEBOUNCE_MS = 500;
const MSK_SERVER_SETTINGS_NAV_KEY = 'msk.serverSettingsNav';

function iframeInitInfo() {
    iframeInfo = {
        content:undefined,
        action:undefined,
        actionCheckInterval: undefined,
        actionChecks: 0,
        pbarHeight: 0,
        settingsSelector: undefined,
        settingsPage: undefined,
        settingModified: false,
        initialLoad: true,
        autoSaveTimer: undefined,
        autoSaveInProgress: false,
        pendingAfterSave: undefined,
        pendingSettingsSection: undefined,
        quietSavePending: false,
        /** Scroll Y to restore after auto-save form POST reloads the iframe */
        restoreScrollY: undefined,
        restoreScrollPage: undefined,
        /** While true, layout fixes must not force scrollTop=0 */
        preserveScroll: false
      };
}

/** Capture iframe document scroll so auto-save reload can restore position. */
function iframeCaptureScroll(doc) {
    try {
        if (!doc) { return; }
        var win = doc.defaultView || doc.parentWindow;
        var y = 0;
        if (win && typeof win.pageYOffset === 'number') {
            y = win.pageYOffset;
        } else if (doc.documentElement && doc.documentElement.scrollTop) {
            y = doc.documentElement.scrollTop;
        } else if (doc.body && doc.body.scrollTop) {
            y = doc.body.scrollTop;
        }
        // Also check common LMS scroll hosts
        var hosts = [
            doc.scrollingElement,
            doc.getElementById('maincontent'),
            doc.getElementById('content'),
            doc.getElementById('settingsRegion'),
            doc.getElementById('innerSettingsBlock'),
            doc.querySelector('.maincontent')
        ];
        for (var i = 0; i < hosts.length; i++) {
            var el = hosts[i];
            if (el && el.scrollTop > y) {
                y = el.scrollTop;
            }
        }
        iframeInfo.restoreScrollY = y > 0 ? y : 0;
        iframeInfo.restoreScrollPage = iframeInfo.settingsPage ||
            (iframeInfo.settingsSelector ? iframeInfo.settingsSelector.value : undefined);
        iframeInfo.preserveScroll = true;
    } catch (e) {
        iframeInfo.restoreScrollY = undefined;
    }
}

/** Restore scroll after auto-save; no-op if no pending position or section changed. */
function iframeRestoreScroll(doc) {
    var y = iframeInfo.restoreScrollY;
    if (y == null || y < 0) {
        return;
    }
    // Only restore when still on the same settings section
    var page = iframeInfo.settingsPage ||
        (iframeInfo.settingsSelector ? iframeInfo.settingsSelector.value : undefined);
    if (iframeInfo.restoreScrollPage != null && page != null &&
            String(iframeInfo.restoreScrollPage) !== String(page)) {
        iframeInfo.restoreScrollY = undefined;
        iframeInfo.restoreScrollPage = undefined;
        return;
    }
    var apply = function() {
        try {
            if (!doc) { return; }
            var win = doc.defaultView || doc.parentWindow;
            if (win && typeof win.scrollTo === 'function') {
                win.scrollTo(0, y);
            }
            if (doc.documentElement) {
                doc.documentElement.scrollTop = y;
            }
            if (doc.body) {
                doc.body.scrollTop = y;
            }
            var hosts = [
                doc.scrollingElement,
                doc.getElementById('maincontent'),
                doc.getElementById('content'),
                doc.getElementById('settingsRegion'),
                doc.getElementById('innerSettingsBlock'),
                doc.querySelector('.maincontent')
            ];
            for (var i = 0; i < hosts.length; i++) {
                if (hosts[i] && typeof hosts[i].scrollTop === 'number') {
                    hosts[i].scrollTop = y;
                }
            }
        } catch (e) {}
    };
    apply();
    // Layout/CSS inject can reflow; re-apply a few times without jumping to top
    [50, 150, 400, 900].forEach(function(delay) {
        setTimeout(apply, delay);
    });
    // Clear after restore window so later section changes don't re-jump
    setTimeout(function() {
        iframeInfo.restoreScrollY = undefined;
        iframeInfo.restoreScrollPage = undefined;
        iframeInfo.preserveScroll = false;
    }, 1200);
}

/** Routine LMS “prefs saved” status lines → titlebar checkmark, not snackbar/modal. */
function iframeIsQuietSaveMessage(msg) {
    if (!msg) {
        return false;
    }
    var m = String(msg).replace(/\s+/g, ' ').trim().toLowerCase();
    if (m.length < 4 || m.length > 160) {
        return false;
    }
    // English + common LMS phrasing; keep narrow so real errors still toast
    if (/preferences?\s+(have been |were |has been )?saved/.test(m)) {
        return true;
    }
    if (/settings?\s+(have been |were |has been )?saved/.test(m)) {
        return true;
    }
    if (/changes?\s+(have been |were |has been )?saved/.test(m)) {
        return true;
    }
    if (/^(preferences?|settings?)\s+saved\.?$/.test(m)) {
        return true;
    }
    if (/saved\s+(your )?(preferences?|settings?)/.test(m)) {
        return true;
    }
    // French LMS / Material strings
    if (/pr[ée]f[ée]rences?\s+(ont [ée]t[ée] |sauvegard)/.test(m) || /enregistr[ée]e?s?/.test(m) && /pr[ée]f|param|r[ée]glage/.test(m)) {
        return true;
    }
    return false;
}

function iframeFlashSaveOk() {
    bus.$emit('settingsSaved');
}

function iframeCancelAutoSaveTimer() {
    if (iframeInfo.autoSaveTimer) {
        clearTimeout(iframeInfo.autoSaveTimer);
        iframeInfo.autoSaveTimer = undefined;
    }
}

function iframeIsPluginManagePage(doc) {
    if (!doc) {
        return false;
    }
    if (iframeInfo.settingsSelector && 'SETUP_PLUGINS'==iframeInfo.settingsSelector.value) {
        return true;
    }
    var form = doc.getElementById('settingsForm');
    if (form && form.action && form.action.indexOf('plugins/Extensions/settings') >= 0) {
        return true;
    }
    return !!doc.getElementById('pluginListPanel');
}

function iframeIsFieldAutoSaveable(elem) {
    if (!elem || !elem.name || elem.disabled || elem.readOnly) {
        return false;
    }
    if ('choose_setting'==elem.id || 'choose_setting'==elem.name) {
        return false;
    }
    if ('submit'==elem.type || 'button'==elem.type || 'file'==elem.type) {
        return false;
    }
    // Plugin manager page: never auto-save enable/update toggles (native Vue flow).
    // Other settings pages (e.g. AirPlay Bridge / ShairTunes2W) use enabled.<playerId>
    // for per-player AirPlay publish — those MUST auto-save.
    if (iframeInfo.content && iframeIsPluginManagePage(iframeInfo.content)) {
        return false;
    }
    if (elem.name.indexOf('update:') === 0) {
        return false;
    }
    if ('hidden'==elem.type) {
        var skipHidden = ['genconfig', 'deldevice', 'panel'];
        if (skipHidden.indexOf(elem.name) >= 0) {
            return false;
        }
    }
    return true;
}

function iframeIsTextualField(elem) {
    if (!elem || !elem.tagName) {
        return false;
    }
    let tag = elem.tagName.toUpperCase();
    if ('TEXTAREA'==tag) {
        return true;
    }
    if ('INPUT'!=tag) {
        return false;
    }
    let type = (elem.type || 'text').toLowerCase();
    return 'text'==type || 'number'==type || 'password'==type || 'url'==type ||
           'email'==type || 'search'==type || 'tel'==type || ''==type;
}

function iframeIsPathPickerField(elem) {
    if (!elem || !elem.className) {
        return false;
    }
    try {
        var cl = elem.className;
        if (elem.classList) {
            if (elem.classList.contains('selectFolder') || elem.classList.contains('selectFile')) {
                return true;
            }
        }
        return /(^|\s)selectFolder(\s|$)/.test(cl) || /(^|\s)selectFile(_|\s|$)/.test(cl);
    } catch (e) {
        return false;
    }
}

/** Folder/file picker wrote a complete path — save now (no blur/leave-field). */
function iframeCommitPathField(elem) {
    if (!elem || !iframeIsFieldAutoSaveable(elem)) {
        return;
    }
    if (!iframeFieldIsModified(elem)) {
        return;
    }
    iframeInfo.settingModified = true;
    var doc = elem.ownerDocument;
    if (doc) {
        iframeAutoSaveSettings(doc, true);
    }
}

function iframeFieldBaseline(elem) {
    if (undefined!==elem.mskBaselineValue) {
        return elem.mskBaselineValue;
    }
    if ('checkbox'==elem.type || 'radio'==elem.type) {
        return elem.defaultChecked;
    }
    return elem.defaultValue;
}

function iframeFieldIsModified(elem) {
    if ('checkbox'==elem.type || 'radio'==elem.type) {
        let base = iframeFieldBaseline(elem);
        return elem.checked !== base;
    }
    return elem.value !== iframeFieldBaseline(elem);
}

function iframeMarkModified(elem) {
    if (iframeIsFieldAutoSaveable(elem) && iframeFieldIsModified(elem)) {
        iframeInfo.settingModified = true;
        return true;
    }
    return false;
}

function iframeCaptureBaseline(elem) {
    if (!elem || !iframeIsFieldAutoSaveable(elem)) {
        return;
    }
    if (undefined===elem.mskBaselineValue) {
        if ('checkbox'==elem.type || 'radio'==elem.type) {
            elem.mskBaselineValue = elem.checked;
        } else {
            elem.mskBaselineValue = elem.value;
        }
    }
}

/** After a successful AJAX save, freeze current field values as the new baseline. */
function iframeApplyBaselinesFromForm(form) {
    if (!form) {
        return;
    }
    var els = form.querySelectorAll('input, select, textarea');
    for (var i = 0, len = els.length; i < len; ++i) {
        var el = els[i];
        if (!iframeIsFieldAutoSaveable(el)) {
            continue;
        }
        if ('checkbox'==el.type || 'radio'==el.type) {
            el.mskBaselineValue = el.checked;
        } else {
            el.mskBaselineValue = el.value;
        }
    }
}

/**
 * Build application/x-www-form-urlencoded body for LMS settings save.
 *
 * LMS classic forms POST as urlencoded. fetch(FormData) sends multipart/form-data,
 * which Slim/CGI often does not populate into $params the same way — so AJAX
 * returns 200 HTML while saveSettings / pref_* / enabled.* are never applied
 * (seen with AirPlay Bridge / ShairTunes2W and other plugin settings).
 *
 * Unchecked checkboxes stay omitted (same as classic form POST).
 */
function iframeBuildSettingsUrlEncoded(form) {
    var params = new URLSearchParams();
    var els = form.elements;
    if (!els) {
        return params;
    }
    for (var i = 0, len = els.length; i < len; ++i) {
        var el = els[i];
        if (!el || !el.name || el.disabled) {
            continue;
        }
        var tag = (el.tagName || '').toUpperCase();
        var type = (el.type || '').toLowerCase();
        if (type==='file' || type==='button' || type==='image' || type==='reset') {
            continue;
        }
        // Skip submit buttons except we inject saveSettings below
        if (type==='submit') {
            continue;
        }
        if ((type==='checkbox' || type==='radio') && !el.checked) {
            continue;
        }
        if (tag==='SELECT' && el.multiple) {
            for (var o = 0, olen = el.options.length; o < olen; ++o) {
                if (el.options[o].selected) {
                    params.append(el.name, el.options[o].value);
                }
            }
            continue;
        }
        // Prefer live value; for checkbox/radio checked above, value may be "on"
        params.append(el.name, el.value==null ? '' : el.value);
    }
    if (!params.has('saveSettings')) {
        params.append('saveSettings', '1');
    }
    return params;
}

/** @deprecated use iframeBuildSettingsUrlEncoded — kept name for any external callers */
function iframeBuildSettingsFormData(form) {
    return iframeBuildSettingsUrlEncoded(form);
}

/**
 * Quiet AJAX prefs save — no iframe document reload (no scroll jump / re-layout).
 * Falls back to classic form.submit() if fetch is unavailable or fails hard.
 */
function iframeAutoSaveSettings(doc, immediate) {
    if (!doc) {
        doc = iframeInfo.content;
    }
    if (!doc) {
        return false;
    }
    var form = doc.getElementById('settingsForm');
    if (!form) {
        return false;
    }
    if (iframeInfo.autoSaveInProgress) {
        return false;
    }
    if (!immediate && !iframeInfo.settingModified) {
        return false;
    }
    iframeCancelAutoSaveTimer();
    iframeInfo.autoSaveInProgress = true;
    iframeInfo.settingModified = false;
    iframeInfo.quietSavePending = true;

    var finishOk = function() {
        iframeInfo.autoSaveInProgress = false;
        iframeInfo.quietSavePending = false;
        iframeApplyBaselinesFromForm(form);
        iframeFlashSaveOk();
        iframeRunPendingAfterSave();
    };
    var finishFail = function(err, fallbackSubmit) {
        if (fallbackSubmit) {
            // Classic POST reloads the iframe — capture scroll for restore path
            try {
                iframeCaptureScroll(doc);
                submitSettingsForm(form);
                return;
            } catch (e2) {
                err = e2;
            }
        }
        iframeInfo.autoSaveInProgress = false;
        iframeInfo.quietSavePending = false;
        iframeInfo.restoreScrollY = undefined;
        iframeInfo.restoreScrollPage = undefined;
        if (err) {
            logError(err);
        }
        iframeRunPendingAfterSave();
    };

    // Prefer fetch so the embedded document stays put
    if (typeof fetch === 'function') {
        try {
            var action = form.getAttribute('action') || form.action || '';
            if (!action) {
                finishFail(undefined, true);
                return true;
            }
            var method = (form.getAttribute('method') || form.method || 'POST').toUpperCase();
            // Include fields inside [hidden] spans (e.g. codec options) as hidden inputs
            var hid = form.querySelectorAll('[hidden]');
            for (var hi = 0, hlen = hid.length; hi < hlen; ++hi) {
                var he = hid[hi];
                if (he.name && 'INPUT'==he.tagName && he.type!=='hidden' && he.type!=='file') {
                    try {
                        he.setAttribute('data-msk-was-hidden', '1');
                        he.type = 'hidden';
                        he.removeAttribute('hidden');
                    } catch (eH) {}
                }
            }
            var body = iframeBuildSettingsUrlEncoded(form);
            fetch(action, {
                method: method,
                body: body.toString(),
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                }
            }).then(function(resp) {
                if (!resp || !resp.ok) {
                    finishFail(new Error('settings save HTTP ' + (resp ? resp.status : '?')), true);
                    return null;
                }
                return resp.text();
            }).then(function(html) {
                if (null===html) {
                    return;
                }
                // Soft-detect server-side validation / error banners in the response body
                var bad = false;
                try {
                    if (html && /class=["'][^"']*\b(error|warning|statusError)\b/i.test(html) &&
                        /class=["'][^"']*\b(error|warning)\b/i.test(html) &&
                        !iframeIsQuietSaveMessage(html.replace(/<[^>]+>/g, ' ').slice(0, 400))) {
                        // Only treat as failure if an error box is present without a saved message
                        if (/settingSection.*error|div\.error|class="error"/i.test(html) &&
                            !/preferences?\s+(have been |were |has been )?saved/i.test(html)) {
                            bad = true;
                        }
                    }
                } catch (e) {}
                if (bad) {
                    finishFail(undefined, true);
                    return;
                }
                finishOk();
            }).catch(function(err) {
                finishFail(err, true);
            });
            return true;
        } catch (e) {
            finishFail(e, true);
            return true;
        }
    }

    // Legacy fallback: full form submit (reloads iframe)
    try {
        iframeCaptureScroll(doc);
        submitSettingsForm(form);
    } catch(e) {
        finishFail(e, false);
        return false;
    }
    return true;
}

function iframeScheduleAutoSave(doc, delayMs) {
    iframeCancelAutoSaveTimer();
    let delay = undefined!=delayMs ? delayMs : IFRAME_AUTOSAVE_DEBOUNCE_MS;
    iframeInfo.autoSaveTimer = setTimeout(function() {
        iframeInfo.autoSaveTimer = undefined;
        iframeAutoSaveSettings(doc, true);
    }, delay);
}

function iframeAutoSaveEventHandler(ev) {
    var elem = ev.target;
    if (!elem || !elem.tagName) {
        return;
    }
    // focus: snapshot baseline so "modified" is reliable for text fields
    if ('focusin'==ev.type || 'focus'==ev.type) {
        iframeCaptureBaseline(elem);
        return;
    }
    if (!iframeIsFieldAutoSaveable(elem)) {
        return;
    }
    var tag = elem.tagName.toUpperCase();
    var type = (elem.type || '').toLowerCase();
    var isTextual = iframeIsTextualField(elem);
    // focusout bubbles (blur does not) — leave-field for text
    var isLeaveField = 'blur'==ev.type || 'focusout'==ev.type;

    /*
     * Text / textarea / email / IP-like inputs:
     * Never auto-save mid-edit. Partial values break folder-path "Enter" flows,
     * IP/email validation, and any field that expects a complete token.
     * Save only on leave-field; page/section leave still uses settingModified.
     */
    if (isTextual) {
        iframeCaptureBaseline(elem);
        if (iframeFieldIsModified(elem)) {
            iframeInfo.settingModified = true;
        }
        // Folder/file picker writes a complete path via change — save immediately.
        if (iframeIsPathPickerField(elem) && 'change'==ev.type && iframeFieldIsModified(elem)) {
            iframeAutoSaveSettings(elem.ownerDocument, true);
            return;
        }
        // Do not save on input/keyup/paste/change-while-focused
        if (isLeaveField && iframeFieldIsModified(elem)) {
            iframeAutoSaveSettings(elem.ownerDocument, true);
        }
        return;
    }

    if (!iframeMarkModified(elem)) {
        return;
    }
    // Selects / checkboxes / radios: save on change
    var immediate = 'change'==ev.type && ('SELECT'==tag || 'checkbox'==type || 'radio'==type);
    if (immediate) {
        iframeAutoSaveSettings(elem.ownerDocument, true);
    } else if ('change'==ev.type) {
        iframeScheduleAutoSave(elem.ownerDocument);
    }
}

function iframeRunPendingAfterSave() {
    iframeInfo.autoSaveInProgress = false;
    if (iframeInfo.pendingAfterSave) {
        var fn = iframeInfo.pendingAfterSave;
        iframeInfo.pendingAfterSave = undefined;
        setTimeout(fn, 0);
    }
}

function hideSettingsSaveButtons(doc) {
    if (!doc) {
        return;
    }
    if (!iframeIsPluginManagePage(doc)) {
        var prefsSubmit = doc.getElementById('prefsSubmit');
        if (prefsSubmit) {
            prefsSubmit.style.display = 'none';
            prefsSubmit.style.height = '0';
            prefsSubmit.style.overflow = 'hidden';
            prefsSubmit.style.margin = '0';
            prefsSubmit.style.padding = '0';
            prefsSubmit.setAttribute('aria-hidden', 'true');
        }
    }
    var elems = doc.querySelectorAll('#saveSettings, input[type="submit"][name="saveSettings"], button[name="saveSettings"]');
    for (var i=0, len=elems.length; i<len; ++i) {
        if ('hidden'!=elems[i].type) {
            elems[i].style.display = 'none';
        }
    }
    // Auto-save: reclaim the classic LMS bottom save-bar space so the iframe is full height.
    if (!doc.getElementById('msk-autosave-fullheight')) {
        var style = doc.createElement('style');
        style.id = 'msk-autosave-fullheight';
        style.textContent = [
            '#prefsSubmit{display:none!important;height:0!important;min-height:0!important;margin:0!important;padding:0!important;border:0!important;overflow:hidden!important;visibility:hidden!important;}',
            '#saveSettings,input[name="saveSettings"],button[name="saveSettings"]{display:none!important;}',
            'body{padding-bottom:0!important;margin-bottom:0!important;}',
            'form#settingsForm{padding-bottom:12px!important;margin-bottom:0!important;}',
            '#maincontent,.maincontent,#content{padding-bottom:12px!important;margin-bottom:0!important;}',
            /* Common sticky footer / status strip leftover space */
            '#statusarea{margin-bottom:0!important;padding-bottom:4px!important;}',
            'html,body{height:100%!important;min-height:calc(100 * var(--vh, 1vh))!important;}'
        ].join('');
        (doc.head || doc.documentElement).appendChild(style);
    }
}

function initAutoSaveListeners(doc) {
    var form = doc.getElementById('settingsForm');
    if (!form) {
        return;
    }
    // Only reset dirty/timer when (re)installing on a new form document — never
    // cancel an in-flight debounce while the user is still typing.
    if (!form.mskAutoSaveInstalled) {
        form.mskAutoSaveInstalled = true;
        iframeCancelAutoSaveTimer();
        iframeInfo.settingModified = false;
        form.addEventListener('change', iframeAutoSaveEventHandler, true);
        form.addEventListener('input', iframeAutoSaveEventHandler, true);
        form.addEventListener('blur', iframeAutoSaveEventHandler, true);
        form.addEventListener('focusout', iframeAutoSaveEventHandler, true);
        form.addEventListener('focusin', iframeAutoSaveEventHandler, true);
        // Enter on path/folder fields must reach LMS — never intercept with mid-type save
        form.addEventListener('keydown', function(ev) {
            if (!ev || (ev.key!='Enter' && ev.keyCode!=13)) {
                return;
            }
            if (!iframeIsTextualField(ev.target)) {
                return;
            }
            // Mark dirty so section leave still saves if LMS handler doesn't submit
            iframeCaptureBaseline(ev.target);
            if (iframeIsFieldAutoSaveable(ev.target) && iframeFieldIsModified(ev.target)) {
                iframeInfo.settingModified = true;
            }
            // Cancel any pending non-text debounce; let LMS handle Enter
            iframeCancelAutoSaveTimer();
        }, true);
    }
    hideSettingsSaveButtons(doc);
}

/* Check for file-entry fields, and sliders, each time form's action is changed */
function iframeActionCheck() {
    iframeInfo.actionChecks++;
    var iframe = document.getElementById("embeddedIframe");
    if (iframe) {
        var content = iframe.contentDocument;
        if (content) {
            var settingsForm = content.getElementById("settingsForm");
            if (settingsForm) {
                if (settingsForm.action!=iframeInfo.action) {
                    iframeInfo.action = settingsForm.action;
                    addFsSelectButtons(content);
                    iframeInfo.addedSliders = addSliders(content);
                    iframeInfo.sectionsHidden = hideSections(content);
                    iframeInfo.addedExpanders = addExpanders(content);
                    if (!IS_MOBILE) {
                        iframeInfo.addedHelp = addHelp(content);
                    }
                } else if (iframeInfo.actionChecks<20) {
                    if (!iframeInfo.addedSliders) {
                        iframeInfo.addedSliders = addSliders(content);
                    }
                    if (!iframeInfo.sectionsHidden) {
                        iframeInfo.sectionsHidden = hideSections(content);
                    }
                    if (!iframeInfo.addedExpanders) {
                        iframeInfo.addedExpanders = addExpanders(content);
                    }
                    // Skip help buttons on mobile and on heavy conversion matrices
                    if (!IS_MOBILE && !iframeInfo.addedHelp && !iframeIsHeavySettingsPage(content)) {
                        iframeInfo.addedHelp = addHelp(content);
                    }
                    return;
                }
            }
        }
    }
    clearInterval(iframeInfo.actionCheckInterval);
    iframeInfo.actionCheckInterval = undefined;
    iframeInfo.actionChecks = 0;
}

function settingsSectionChanged() {
    bus.$emit('iframe-loaded', false, undefined==iframeInfo.settingsSelector ? undefined : iframeInfo.settingsSelector.value);
    if (undefined!=iframeInfo.actionCheckInterval) {
        clearInterval(iframeInfo.actionCheckInterval);
    }
    iframeInfo.addedSliders = false;
    iframeInfo.sectionsHidden = false;
    iframeInfo.addedExpanders = false;
    iframeInfo.addedHelp = false;
    iframeInfo.actionChecks = 0;
    // Heavy pages (File Types): fewer polls, skip help inject
    try {
        if (iframeInfo.content && iframeIsHeavySettingsPage(iframeInfo.content)) {
            iframeInfo.addedHelp = true;
            iframeMaybeSimplifyHeavySettings(iframeInfo.content);
        }
    } catch (e) {}
    // 100ms × 50 was thrashing large forms; 250ms × 20 is enough for action URL settle
    iframeInfo.actionCheckInterval = setInterval(function () {
        iframeActionCheck();
    }, 250);
    iframeActionCheck();
    // Keep Material sidebar/select in sync after classic section reloads
    iframeSyncMaterialSettingsNav();
}

/**
 * Parse classic LMS #choose_setting into Material nav groups.
 * Returns [{label, items:[{value,text}]}]
 */
function iframeParseSettingsSections(sel) {
    let groups = [];
    if (!sel || !sel.options) {
        return groups;
    }
    let current = { label: '', items: [] };
    let opts = sel.options;
    for (let i=0, len=opts.length; i<len; ++i) {
        let opt = opts[i];
        if (!opt) {
            continue;
        }
        // optgroup as parent of option
        let parent = opt.parentNode;
        let groupLabel = '';
        if (parent && parent.tagName && 'OPTGROUP'==parent.tagName.toUpperCase()) {
            groupLabel = parent.label || '';
        }
        if (groupLabel != current.label && (current.items.length>0 || current.label)) {
            groups.push(current);
            current = { label: groupLabel, items: [] };
        } else if (0==current.items.length) {
            current.label = groupLabel;
        }
        if (opt.disabled && !opt.value) {
            continue;
        }
        let val = opt.value;
        if (undefined==val || null==val || (''+val).length<1) {
            continue;
        }
        current.items.push({ value: val, text: (opt.text || val).trim() });
    }
    if (current.items.length>0) {
        groups.push(current);
    }
    return groups;
}

/** Flat list of all sections (no category headers). */
function iframeFlattenSettingsGroups(groups) {
    let items = [];
    if (!groups) {
        return [{ label: '', items: items }];
    }
    for (let g=0, glen=groups.length; g<glen; ++g) {
        let list = groups[g].items || [];
        for (let i=0, len=list.length; i<len; ++i) {
            items.push(list[i]);
        }
    }
    return [{ label: '', items: items }];
}

function iframePersistServerSettingsNav(groups) {
    if (!groups || groups.length<1) {
        return;
    }
    try {
        setLocalStorageVal(MSK_SERVER_SETTINGS_NAV_KEY, JSON.stringify({ groups: groups, ts: Date.now() }));
    } catch (e) {}
}

function iframeLoadCachedServerSettingsNav() {
    try {
        let raw = getLocalStorageVal(MSK_SERVER_SETTINGS_NAV_KEY, '');
        if (!raw) {
            return [];
        }
        let data = JSON.parse(raw);
        return data && data.groups ? data.groups : [];
    } catch (e) {
        return [];
    }
}

/** Cold-start: scrape #choose_setting from server basic.html so Material rail paints before iframe parse. */
function iframeBootstrapServerSettingsNav(done) {
    if (iframeInfo._navBootstrapping) {
        return;
    }
    iframeInfo._navBootstrapping = true;
    axios.get('/material/settings/server/basic.html', { timeout: 12000 }).then(function(resp) {
        iframeInfo._navBootstrapping = false;
        let html = resp && resp.data ? String(resp.data) : '';
        if (!html || html.length > 2500000) {
            if (typeof done === 'function') { done([]); }
            return;
        }
        let groups = [];
        try {
            let doc = new DOMParser().parseFromString(html, 'text/html');
            let sel = doc.getElementById('choose_setting') || doc.querySelector('select[name="choose_setting"]');
            groups = iframeParseSettingsSections(sel);
        } catch (e) {
            groups = [];
        }
        if (groups.length>0) {
            iframePersistServerSettingsNav(groups);
        }
        if (typeof done === 'function') {
            done(groups);
        }
    }).catch(function() {
        iframeInfo._navBootstrapping = false;
        if (typeof done === 'function') { done([]); }
    });
}

/** Resolve Material theme background for painting the classic settings iframe. */
function iframeResolveThemeBackground() {
    try {
        let root = document.documentElement;
        let cs = getComputedStyle(root);
        let bg = (cs.getPropertyValue('--background-color') || '').trim();
        if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') {
            return bg;
        }
        // Fallback: sample shell if vars missing
        let shell = document.getElementById('iframe-page');
        if (shell) {
            let scs = getComputedStyle(shell);
            let sbg = (scs.getPropertyValue('--background-color') || scs.backgroundColor || '').trim();
            if (sbg && sbg !== 'transparent' && sbg !== 'rgba(0, 0, 0, 0)') {
                return sbg;
            }
        }
        if (document.body) {
            let bbg = getComputedStyle(document.body).backgroundColor;
            if (bbg && bbg !== 'transparent' && bbg !== 'rgba(0, 0, 0, 0)') {
                return bbg;
            }
        }
    } catch (e) {}
    return '';
}

/** Paint theme background on iframe document so it never flashes browser-default white. */
function iframeApplyThemeBackground(content) {
    if (!content || !content.documentElement) {
        return;
    }
    let bg = iframeResolveThemeBackground();
    if (!bg) {
        return;
    }
    try {
        content.documentElement.style.setProperty('--background-color', bg);
        content.documentElement.style.setProperty('background-color', bg, 'important');
        content.documentElement.style.setProperty('background', bg, 'important');
        if (content.body) {
            content.body.style.setProperty('--background-color', bg);
            content.body.style.setProperty('background-color', bg, 'important');
            content.body.style.setProperty('background', bg, 'important');
        }
        let ids = ['homeMenu', 'settingsRegion', 'innerSettingsBlock', 'settingsForm'];
        for (let i=0; i<ids.length; ++i) {
            let el = content.getElementById(ids[i]);
            if (el) {
                el.style.setProperty('background-color', bg, 'important');
                el.style.setProperty('background', bg, 'important');
            }
        }
    } catch (e) {}
}

/**
 * Force-hide classic section chooser inside the settings iframe.
 * CSS class alone is not enough: custom-select rebuilds panels after load with
 * overflow:visible rules that paint as a "paragraph of links".
 */
function iframeHideClassicSettingsChooser(content) {
    if (!content || !content.documentElement) {
        return;
    }
    try {
        content.documentElement.classList.add('msk-material-settings-nav');
    } catch (e) {}
    try {
        if (!content.getElementById('msk-hide-classic-settings-nav')) {
            let style = content.createElement('style');
            style.id = 'msk-hide-classic-settings-nav';
            style.type = 'text/css';
            style.appendChild(content.createTextNode(
                '#setup_chooser, #choose_setting, #topGraphicBox, #topGraphicMenu1, #topGraphicMenu2, #topGraphicMenu3, #viewSelect, #sdi_logo,' +
                '#setup_chooser .custom-select-container, #setup_chooser .custom-select-panel, #setup_chooser .custom-select-opener,' +
                '#setup_chooser .custom-select-option, #setup_chooser .custom-select-optgroup,' +
                '#topGraphicMenu3 .custom-select-container, #topGraphicMenu3 .custom-select-panel, #topGraphicMenu3 .custom-select-opener,' +
                '#topGraphicMenu3 .custom-select-option {' +
                'display:none!important;visibility:hidden!important;height:0!important;max-height:0!important;' +
                'min-height:0!important;overflow:hidden!important;margin:0!important;padding:0!important;' +
                'border:0!important;width:0!important;position:absolute!important;left:-9999px!important;' +
                'pointer-events:none!important;}' +
                /* Fluid layout + theme bg inside Material shell */
                'html.msk-material-settings-nav,html.msk-material-settings-nav body{' +
                'height:100%!important;width:100%!important;max-width:100%!important;margin:0!important;padding:0!important;' +
                'overflow-x:hidden!important;overflow-y:auto!important;box-sizing:border-box!important;' +
                'background:var(--background-color)!important;background-color:var(--background-color)!important;}' +
                'html.msk-material-settings-nav #homeMenu,html.msk-material-settings-nav #settingsRegion,' +
                'html.msk-material-settings-nav #settingsForm,html.msk-material-settings-nav #innerSettingsBlock{' +
                'width:100%!important;max-width:100%!important;min-width:0!important;margin:0!important;' +
                'height:auto!important;max-height:none!important;min-height:0!important;box-sizing:border-box!important;' +
                'background:var(--background-color)!important;background-color:var(--background-color)!important;}' +
                'html.msk-material-settings-nav #innerSettingsBlock{' +
                'padding:16px 20px 56px 20px!important;overflow-x:hidden!important;}' +
                'html.msk-material-settings-nav table.topside,html.msk-material-settings-nav table,' +
                'html.msk-material-settings-nav .settingSection{max-width:100%!important;width:auto!important;box-sizing:border-box!important;}' +
                /* Do NOT set .settingSection div { transparent } — that kills custom-select panels */
                'html.msk-material-settings-nav .prefHead:not(.collapsableSection),' +
                'html.msk-material-settings-nav .groupHead,html.msk-material-settings-nav .prefDesc{' +
                'background-color:transparent!important;}' +
                /* Opaque prefs dropdowns (classic custom-select) */
                'html.msk-material-settings-nav .custom-select-panel,' +
                'html.msk-material-settings-nav .custom-select-container.is-open .custom-select-panel{' +
                'background:var(--popup-background-color,var(--std-popup-background-color,#303030))!important;' +
                'background-color:var(--popup-background-color,var(--std-popup-background-color,#303030))!important;' +
                'opacity:1!important;z-index:200!important;' +
                'border:1px solid var(--border-color,#5a5a5a)!important;' +
                'box-shadow:var(--menu-dlg-shadow,0 6px 20px rgba(0,0,0,0.45))!important;}' +
                'html.msk-material-settings-nav .custom-select-option,' +
                'html.msk-material-settings-nav .custom-select-optgroup::before{' +
                'background-color:var(--popup-background-color,var(--std-popup-background-color,#303030))!important;' +
                'color:var(--text-color,#edece7)!important;opacity:1!important;}' +
                'html.msk-material-settings-nav .custom-select-option.has-focus{' +
                'background-color:var(--list-hover-color,rgba(255,255,255,0.08))!important;}'
            ));
            (content.head || content.documentElement).appendChild(style);
        }
    } catch (e) {}
    iframeApplyThemeBackground(content);
    // Destroy custom-select widgets so panels cannot reappear
    try {
        let win = content.defaultView || content.parentWindow;
        if (win && win.customSelects && win.customSelects.length) {
            for (let i=win.customSelects.length-1; i>=0; --i) {
                try {
                    let cs = win.customSelects[i];
                    if (!cs) { continue; }
                    let form = content.getElementById('setup_chooser');
                    let isChooser = cs.select && (cs.select.id==='choose_setting' || (form && form.contains(cs.select)));
                    if (isChooser) {
                        if (typeof cs.destroy === 'function') {
                            cs.destroy();
                        } else if (cs.container && cs.container.parentNode) {
                            cs.container.parentNode.removeChild(cs.container);
                        }
                    }
                } catch (e2) {}
            }
        }
        // Prevent styleSelects() from rebuilding the section chooser;
        // also skip custom-select on heavy pages (File Types has dozens of <select>s).
        if (win && typeof win.styleSelects === 'function' && !win._mskStyleSelectsWrapped) {
            win._mskStyleSelectsWrapped = true;
            let orig = win.styleSelects;
            win.styleSelects = function() {
                try {
                    if (iframeIsHeavySettingsPage(content)) {
                        // Keep native selects — custom-select freezes File Types / conversion grids
                        iframeForceNativeSelects(content);
                    } else {
                        orig.apply(this, arguments);
                    }
                } catch (e3) {}
                try { iframeHideClassicSettingsChooser(content); } catch (e4) {}
            };
        }
        try { iframeMaybeSimplifyHeavySettings(content); } catch (eHeavy) {}
        // Classic JS sets a fixed height based on full-page chrome — disable it
        if (win && typeof win.resizeSettingsSection === 'function' && !win._mskResizeSettingsWrapped) {
            win._mskResizeSettingsWrapped = true;
            win.resizeSettingsSection = function() { /* Material shell owns sizing */ };
        }
    } catch (e) {}
    // Remove top chrome from the layout entirely (hide alone is not enough when
    // custom-select uses overflow:visible and paints a "paragraph of links").
    try {
        let killIds = ['topGraphicBox', 'topGraphicMenu3', 'viewSelect', 'setup_chooser'];
        for (let i=0; i<killIds.length; ++i) {
            let el = content.getElementById(killIds[i]);
            if (el && el.parentNode) {
                // Keep #choose_setting alive (off-DOM) for navigation API
                if (killIds[i]==='setup_chooser') {
                    let sel = content.getElementById('choose_setting');
                    if (sel) {
                        sel.style.setProperty('display', 'none', 'important');
                        // Detach form but keep select referenced via iframeInfo
                        try {
                            if (sel.parentNode) {
                                // leave select in place but collapse form
                            }
                        } catch (e5) {}
                    }
                }
                el.style.setProperty('display', 'none', 'important');
                el.style.setProperty('visibility', 'hidden', 'important');
                el.style.setProperty('height', '0', 'important');
                el.style.setProperty('max-height', '0', 'important');
                el.style.setProperty('overflow', 'hidden', 'important');
                el.setAttribute('aria-hidden', 'true');
            }
        }
        // Also hide any orphan custom-select panels that floated outside the form
        let panels = content.querySelectorAll('.custom-select-panel, .custom-select-opener');
        for (let p=0; p<panels.length; ++p) {
            let panel = panels[p];
            let nearChooser = false;
            try {
                let node = panel;
                while (node) {
                    if (node.id==='setup_chooser' || node.id==='topGraphicBox' || node.id==='topGraphicMenu3') {
                        nearChooser = true;
                        break;
                    }
                    node = node.parentNode;
                }
            } catch (e6) {}
            if (nearChooser) {
                panel.style.setProperty('display', 'none', 'important');
                panel.style.setProperty('visibility', 'hidden', 'important');
                panel.style.setProperty('max-height', '0', 'important');
                panel.style.setProperty('overflow', 'hidden', 'important');
            }
        }
    } catch (e) {}
}

function iframeScheduleHideClassicChooser(content) {
    iframeHideClassicSettingsChooser(content);
    // custom-select styleSelects() runs on window load and can rebuild after us
    [50, 150, 400, 1000].forEach(function(ms) {
        setTimeout(function() {
            if (iframeInfo.content === content) {
                iframeHideClassicSettingsChooser(content);
                try { iframeMaybeSimplifyHeavySettings(content); } catch (e) {}
            }
        }, ms);
    });
}

/** File Types / conversion matrix: many <select>s → classic custom-select freezes painting. */
function iframeIsHeavySettingsPage(content) {
    if (!content) {
        return false;
    }
    try {
        let page = iframeInfo.settingsPage ||
            (iframeInfo.settingsSelector && iframeInfo.settingsSelector.value) || '';
        if (/FORMAT|CONVERT|FILE.?TYPE|CODECS?/i.test(page)) {
            return true;
        }
        let form = content.getElementById('settingsForm') || content.getElementById('innerSettingsBlock');
        if (!form) {
            return false;
        }
        let selects = form.getElementsByTagName('select');
        // Conversion matrix easily has 40+ selects
        return !!(selects && selects.length >= 24);
    } catch (e) {
        return false;
    }
}

function iframeForceNativeSelects(content) {
    if (!content || !content.documentElement) {
        return;
    }
    try {
        content.documentElement.classList.add('msk-native-selects');
    } catch (e) {}
    try {
        let win = content.defaultView || content.parentWindow;
        if (win && win.customSelects && win.customSelects.length) {
            for (let i = win.customSelects.length - 1; i >= 0; --i) {
                try {
                    let cs = win.customSelects[i];
                    if (!cs || !cs.select) { continue; }
                    // Keep section chooser handling separate
                    if (cs.select.id === 'choose_setting') { continue; }
                    if (typeof cs.destroy === 'function') {
                        cs.destroy();
                    } else if (cs.container && cs.container.parentNode) {
                        cs.container.parentNode.removeChild(cs.container);
                    }
                    try {
                        cs.select.style.display = '';
                        cs.select.style.visibility = '';
                        cs.select.removeAttribute('hidden');
                    } catch (e2) {}
                } catch (e3) {}
            }
        }
        // Reveal native selects that custom-select hid
        let form = content.getElementById('settingsForm') || content.getElementById('innerSettingsBlock');
        if (form) {
            let sels = form.getElementsByTagName('select');
            for (let s = 0, len = sels.length; s < len; ++s) {
                if (sels[s].id === 'choose_setting') { continue; }
                try {
                    sels[s].style.setProperty('display', '', 'important');
                    sels[s].style.setProperty('visibility', 'visible', 'important');
                    sels[s].style.setProperty('opacity', '1', 'important');
                    sels[s].style.setProperty('position', 'static', 'important');
                    sels[s].style.setProperty('width', 'auto', 'important');
                    sels[s].style.setProperty('height', 'auto', 'important');
                    sels[s].style.setProperty('clip', 'auto', 'important');
                } catch (e4) {}
            }
            // Remove leftover custom-select chrome inside the form
            let junk = form.querySelectorAll('.custom-select-container, .custom-select-panel, .custom-select-opener');
            for (let j = 0; j < junk.length; ++j) {
                try {
                    if (junk[j].parentNode) {
                        junk[j].parentNode.removeChild(junk[j]);
                    }
                } catch (e5) {}
            }
        }
    } catch (e) {}
}

function iframeMaybeSimplifyHeavySettings(content) {
    if (iframeIsHeavySettingsPage(content)) {
        iframeForceNativeSelects(content);
        // Skip help-button DOM walk on huge tables (main cost after custom-select)
        iframeInfo.addedHelp = true;
    }
}

function iframeSyncMaterialSettingsNav() {
    let sel = iframeInfo.settingsSelector;
    if (!sel) {
        // Do not wipe Material rail; still force-hide classic chrome when possible
        if (iframeInfo.content) {
            iframeHideClassicSettingsChooser(iframeInfo.content);
        }
        return;
    }
    let groups = iframeParseSettingsSections(sel);
    let active = sel.value || '';
    if (iframeInfo.content && iframeInfo.content.documentElement) {
        // Always hide classic chooser on server settings — Material owns nav
        iframeHideClassicSettingsChooser(iframeInfo.content);
        // Track active section class for classic CSS hooks
        try {
            let classes = iframeInfo.content.documentElement.className.split(/\s+/);
            for (let c=0; c<classes.length; ++c) {
                if (classes[c].indexOf('lms-settings-section-')==0) {
                    iframeInfo.content.documentElement.classList.remove(classes[c]);
                }
            }
            if (active) {
                iframeInfo.content.documentElement.classList.add(
                    'lms-settings-section-'+active+(LMS_VERSION<90000 || active!='SETUP_PLUGINS' ? '' : '_9')
                );
            }
        } catch (e) {}
    }
    // Cache for native plugin manager (and other Material settings shells)
    if (groups.length>0) {
        iframePersistServerSettingsNav(groups);
        bus.$emit('iframe-settings-nav', { groups: groups, active: active });
    } else if (active) {
        bus.$emit('iframe-settings-active', active);
    }

    // Jump to a requested section after first paint (e.g. from plugin manager picker)
    if (iframeInfo.pendingSettingsSection) {
        let pending = iframeInfo.pendingSettingsSection;
        iframeInfo.pendingSettingsSection = undefined;
        if (pending && pending !== active) {
            setTimeout(function() {
                requestSettingsSection(pending);
            }, 50);
        }
    }
}

function iframeInvokeClassicChooseSettings(reqPage) {
    if (!iframeInfo.settingsSelector || undefined==reqPage || null==reqPage) {
        return false;
    }
    try {
        iframeInfo.settingsSelector.value = reqPage;
    } catch (e) {}
    // Prefer the classic page map (sets location.href). Call with correct select context —
    // bare onchange handlers need `this`/selectedIndex from the <select>.
    try {
        let win = iframeInfo.content && (iframeInfo.content.defaultView || iframeInfo.content.parentWindow);
        if (win && typeof win.chooseSettings === 'function') {
            let idx = iframeInfo.settingsSelector.selectedIndex;
            win.chooseSettings(idx, reqPage);
            return true;
        }
    } catch (e) {}
    if (typeof iframeInfo.settingsDoChange === 'function') {
        try {
            iframeInfo.settingsDoChange.call(iframeInfo.settingsSelector);
            return true;
        } catch (e) {}
    }
    return false;
}

function requestSettingsSection(reqPage) {
    if (undefined==reqPage || null==reqPage) {
        return;
    }
    // Hybrid: native plugin manager is a CONTENT PANEL inside the settings shell
    // (same section sidebar as the rest of server settings — not a second fullscreen dialog).
    if ('SETUP_PLUGINS'==reqPage && lmsOptions.nativeManagePlugins) {
        bus.$emit('iframe-settings-active', 'SETUP_PLUGINS');
        bus.$emit('iframe-native-plugins', true);
        return;
    }
    if (!iframeInfo.settingsSelector) {
        // No live selector (iframe closed / not loaded) — reopen server settings deep-linked
        if (typeof openServerSettings === 'function') {
            openServerSettings(undefined, 0, undefined, reqPage);
        }
        return;
    }
    // Same section: only skip when we already know the active page
    if (undefined!=iframeInfo.settingsPage && reqPage==iframeInfo.settingsPage) {
        bus.$emit('iframe-settings-active', iframeInfo.settingsPage);
        return;
    }

    function navigate() {
        iframeInfo.settingModified = false;
        iframeInfo.settingsPage = reqPage;
        bus.$emit('iframe-settings-active', reqPage);
        iframeInvokeClassicChooseSettings(reqPage);
        // Same post-change polish as classic select's change listener (sliders, expanders, nav sync)
        try {
            settingsSectionChanged();
        } catch (e) {}
        // Section pages rebuild chrome — hide chooser again after navigation
        if (iframeInfo.content) {
            iframeScheduleHideClassicChooser(iframeInfo.content);
        }
    }

    if (iframeInfo.autoSaveTimer || iframeInfo.settingModified || iframeInfo.autoSaveInProgress) {
        iframeCancelAutoSaveTimer();
        iframeInfo.pendingAfterSave = navigate;
        // If a save cannot start (no form / already saving), do not leave navigation stuck.
        if (iframeInfo.autoSaveInProgress) {
            // Wait for the in-flight save; pendingAfterSave runs on complete.
            return;
        }
        if (!iframeAutoSaveSettings(iframeInfo.content, true)) {
            iframeInfo.pendingAfterSave = undefined;
            iframeInfo.settingModified = false;
            navigate();
        }
    } else {
        navigate();
    }
}

function settingsSectionChangedReq() {
    if (!iframeInfo.settingsSelector) {
        return;
    }
    requestSettingsSection(iframeInfo.settingsSelector.value);
}

function copyVar(iframe, name) {
    let v = getComputedStyle(document.getElementById("iframe-page")).getPropertyValue(name);
    if (undefined!=v && v.trim().length>0) {
        iframe.contentWindow.document.documentElement.style.setProperty(name, v.trim());
    }
}

function initPluginManageListeners(doc) {
    iframeCancelAutoSaveTimer();
    iframeInfo.settingModified = false;
    var form = doc.getElementById('settingsForm');
    if (!form) {
        return;
    }
    if (!form.mskPluginManageInstalled) {
        form.mskPluginManageInstalled = true;
        form.addEventListener('change', function(ev) {
            var elem = ev.target;
            if (!elem || !elem.name || elem.disabled || elem.readOnly) {
                return;
            }
            if ('choose_setting'==elem.id || 'choose_setting'==elem.name) {
                return;
            }
            if ('submit'==elem.type || 'button'==elem.type || 'file'==elem.type) {
                return;
            }
            if (iframeFieldIsModified(elem)) {
                iframeInfo.settingModified = true;
            }
        }, true);
    }
}

function initChangeListeners(docOrHtml) {
    var doc = docOrHtml && docOrHtml.documentElement ? docOrHtml : docOrHtml ? docOrHtml.ownerDocument : undefined;
    if (!doc) {
        return;
    }
    if (iframeIsPluginManagePage(doc)) {
        doc.documentElement.classList.add('msk-plugin-manage');
        initPluginManageListeners(doc);
        return;
    }
    initAutoSaveListeners(doc);
}

function copyVars(iframe) {
    if (undefined==iframe) {
        return false;
    }
    copyVar(iframe, '--std-font-size');
    copyVar(iframe, '--background-color');
    copyVar(iframe, '--primary-color');
    copyVar(iframe, '--accent-color');
    copyVar(iframe, '--pq-current-color');
    copyVar(iframe, '--inverted-text-color');
    copyVar(iframe, '--popup-background-color');
    copyVar(iframe, '--list-hover-color');
    copyVar(iframe, '--text-color');
    copyVar(iframe, '--icon-color');
    copyVar(iframe, '--dark-text-color');
    copyVar(iframe, '--light-text-color');
    copyVar(iframe, '--menu-dlg-shadow');
    copyVar(iframe, '--top-pad');
    copyVar(iframe, '--bottom-pad');
    copyVar(iframe, '--all-pad');
    copyVar(iframe, '--scrollbar-thumb-color');
    copyVar(iframe, '--std-scrollbar-thumb-color');
    copyVar(iframe, '--scrollbar-thumb-hover-color');
    copyVar(iframe, '--std-scrollbar-thumb-hover-color');
    copyVar(iframe, '--list-item-border-color');
    copyVar(iframe, '--std-popup-background-color');
    copyVar(iframe, '--border-color');
    // Fallbacks so classic height calc(var(--all-pad) + Npx) never goes invalid
    try {
        let root = iframe.contentWindow && iframe.contentWindow.document
            ? iframe.contentWindow.document.documentElement : undefined;
        if (root) {
            let cs = getComputedStyle(root);
            if (!(cs.getPropertyValue('--top-pad') || '').trim()) {
                root.style.setProperty('--top-pad', '0px');
            }
            if (!(cs.getPropertyValue('--bottom-pad') || '').trim()) {
                root.style.setProperty('--bottom-pad', '0px');
            }
            if (!(cs.getPropertyValue('--all-pad') || '').trim()) {
                root.style.setProperty('--all-pad', '0px');
            }
            // Ensure dropdown panels never paint transparent if vars are missing
            let popup = (cs.getPropertyValue('--popup-background-color') || '').trim();
            let stdPopup = (cs.getPropertyValue('--std-popup-background-color') || '').trim();
            if (!popup || popup === 'transparent' || popup === 'rgba(0, 0, 0, 0)') {
                let parentPopup = getComputedStyle(document.documentElement).getPropertyValue('--popup-background-color').trim()
                    || getComputedStyle(document.documentElement).getPropertyValue('--std-popup-background-color').trim()
                    || '#303030';
                root.style.setProperty('--popup-background-color', parentPopup);
                root.style.setProperty('--std-popup-background-color', parentPopup);
            } else if (!stdPopup) {
                root.style.setProperty('--std-popup-background-color', popup);
            }
        }
        if (iframe.contentDocument) {
            iframeApplyThemeBackground(iframe.contentDocument);
        }
    } catch (e) {}
    return true;
}

function addDefaultSkinCss(doc, iframe) {
    let css = doc.createElement("link");
    css.href = "/material/html/css/default-skin/mods.css?r=MATERIAL_VERSION";
    css.rel = "stylesheet";
    css.type = "text/css";
    iframe.contentDocument.head.appendChild(css);
}

const BRIDGE_PLUGINS = {
    RaopBridge: {
        css: 'plugin-squeezebridge.css',
        linkPrefix: 'raopbridge',
        fieldDefaults: {
            codecs: 'aac,ogg,ops,ogf,flc,alc,wav,aif,pcm,mp3',
            player_volume: '-1',
            volume_mapping: '-30:1, -15:50, 0:100',
            server: '?',
            remove_timeout: '-1',
            read_ahead: '1000',
            resolution: 'auto',
            ports: '0:0',
            interface: '?',
            idle_timeout: '0'
        }
    },
    UPnPBridge: {
        css: 'plugin-squeezebridge.css',
        linkPrefix: 'upnpbridge',
        fieldDefaults: {
            codecs: 'aac,ogg,ops,ogf,flc,alc,wav,aif,pcm,mp3',
            max_volume: '-1',
            remove_timeout: '-1',
            binding: '?',
            custom_discovery: '',
            cache: '-1',
            sample_rate: '0'
        }
    }
};

const PLUGIN_SETTINGS_CSS = {};
for (var bridgePluginKey in BRIDGE_PLUGINS) {
    PLUGIN_SETTINGS_CSS[bridgePluginKey] = BRIDGE_PLUGINS[bridgePluginKey].css;
}

function isBridgePlugin(pluginKey) {
    return undefined!=pluginKey && undefined!=BRIDGE_PLUGINS[pluginKey];
}

function detectBridgeAuxiliaryKey(path) {
    if (!path) {
        return undefined;
    }
    path = path.split('?')[0];
    for (var pluginKey in BRIDGE_PLUGINS) {
        var prefix = BRIDGE_PLUGINS[pluginKey].linkPrefix;
        if (path.indexOf('/' + prefix + '-') >= 0 || path.indexOf(prefix + '-') >= 0) {
            return pluginKey;
        }
    }
    return undefined;
}

function isBridgeAuxiliaryHref(href, linkPrefix) {
    if (!href || !linkPrefix) {
        return false;
    }
    href = href.split('?')[0];
    var markers = ['-config.xml', '-log', '-guide'];
    for (var m = 0, mlen = markers.length; m < mlen; ++m) {
        if (href.indexOf(linkPrefix + markers[m]) >= 0) {
            return true;
        }
    }
    return false;
}

function getBridgePluginSettingsUrl(pluginKey) {
    return '/plugins/' + pluginKey + '/settings/basic.html';
}

function injectBridgeAuxBackBar(doc, pluginKey) {
    if (doc.getElementById('msk-bridge-aux-back')) {
        return;
    }
    var settingsUrl = getBridgePluginSettingsUrl(pluginKey);
    var bar = doc.createElement('div');
    bar.id = 'msk-bridge-aux-back';
    bar.className = 'msk-bridge-aux-back';
    var btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'msk-bridge-aux-back-btn';
    btn.textContent = bridgeMsg('Back to settings');
    btn.addEventListener('click', function(ev) {
        ev.preventDefault();
        bus.$emit('iframe-href', settingsUrl, false);
    });
    bar.appendChild(btn);
    var host = doc.body || doc.documentElement;
    if (host.firstChild) {
        host.insertBefore(bar, host.firstChild);
    } else {
        host.appendChild(bar);
    }
}

function bridgeAuxNeedsHtmlWrap(doc) {
    if (!doc.documentElement) {
        return false;
    }
    return 'html' !== doc.documentElement.nodeName.toLowerCase();
}

function bridgeAuxSerializeContent(doc) {
    var text = '';
    try {
        if (doc.body) {
            var pre = doc.body.querySelector('pre');
            if (pre) {
                return pre.textContent || pre.innerText || '';
            }
            if (1===doc.body.childNodes.length && 'PRE'===doc.body.firstChild.nodeName) {
                return doc.body.textContent || '';
            }
            if (doc.body.textContent) {
                return doc.body.textContent;
            }
        }
        var serializer = new XMLSerializer();
        text = serializer.serializeToString(doc.documentElement);
    } catch(e) {
        text = doc.documentElement ? (doc.documentElement.textContent || '') : '';
    }
    return text;
}

function wrapBridgeAuxAsHtml(doc, pluginKey, darkUi, iframe) {
    var text = bridgeAuxSerializeContent(doc);
    var darkClass = darkUi ? ' theme--dark' : '';
    doc.open();
    doc.write('<!DOCTYPE html><html class="msk-squeezebridge msk-bridge-aux"><head><meta charset="utf-8"></head>' +
              '<body class="msk-squeezebridge' + darkClass + '"></body></html>');
    doc.close();
    doc.mskBridgePluginKey = pluginKey;
    addPluginSettingsCss(doc, pluginKey);
    if (iframe) {
        copyVars(iframe);
    }
    rbApplyThemeBackground(doc);
    injectBridgeAuxBackBar(doc, pluginKey);
    var pre = doc.createElement('pre');
    pre.className = 'msk-bridge-aux-content';
    pre.textContent = text;
    doc.body.appendChild(pre);
}

function initBridgeAuxiliaryPage(doc, pluginKey, darkUi, iframe) {
    if (bridgeAuxNeedsHtmlWrap(doc)) {
        wrapBridgeAuxAsHtml(doc, pluginKey, darkUi, iframe);
        return;
    }
    doc.mskBridgePluginKey = pluginKey;
    doc.documentElement.classList.add('msk-squeezebridge', 'msk-bridge-aux');
    if (doc.body) {
        doc.body.classList.add('msk-squeezebridge');
        if (darkUi) {
            doc.body.classList.add('theme--dark');
        }
    }
    addPluginSettingsCss(doc, pluginKey);
    if (iframe) {
        copyVars(iframe);
    }
    rbApplyThemeBackground(doc);
    injectBridgeAuxBackBar(doc, pluginKey);
}

function getBridgeFieldDefaults(doc) {
    return doc.mskBridgePluginKey && BRIDGE_PLUGINS[doc.mskBridgePluginKey]
             ? BRIDGE_PLUGINS[doc.mskBridgePluginKey].fieldDefaults
             : {};
}

function addPluginSettingsCss(doc, pluginKey) {
    var cssFile = PLUGIN_SETTINGS_CSS[pluginKey];
    if (!cssFile) {
        return;
    }
    var id = 'msk-plugin-css-' + pluginKey;
    if (doc.getElementById(id)) {
        return;
    }
    var link = doc.createElement('link');
    link.id = id;
    link.href = '/material/html/css/classic-skin/' + cssFile + '?r=MATERIAL_VERSION';
    link.rel = 'stylesheet';
    link.type = 'text/css';
    doc.head.appendChild(link);
}

function rbIsDefaultValue(val) {
    if (undefined==val || null==val) {
        return true;
    }
    val = (''+val).trim();
    return ''==val || '-1'==val || '?'==val || '0:0'==val || 'default'==val.toLowerCase();
}

function bridgeMsg(fallback) {
    var t = i18n(fallback);
    return (t && t!==fallback) ? t : fallback;
}

function isWindowsBridgeBinary(binary) {
    if (!binary) {
        return false;
    }
    binary = (''+binary).toLowerCase();
    return binary.indexOf('windows') >= 0 || binary.indexOf('-win') >= 0 ||
           binary.indexOf('win32') >= 0 || binary.indexOf('win64') >= 0 ||
           binary.indexOf('win-x') >= 0 || binary.indexOf('.exe') >= 0;
}

function getSelectedBridgeBinary(doc) {
    var sel = doc.getElementById('bin');
    if (sel && sel.options && sel.options.length>0) {
        var val = sel.value;
        if (val) {
            return val;
        }
        if (sel.selectedIndex>=0) {
            return sel.options[sel.selectedIndex].value;
        }
    }
    var autorun = doc.querySelector('input[name="autorun"]');
    if (autorun && autorun.parentElement) {
        var match = autorun.parentElement.textContent.match(/\(([^)]+)\)/);
        if (match && match[1]) {
            return match[1].replace(/\s+/g, ' ').trim();
        }
    }
    return '';
}

var BRIDGE_GEN_PENDING_MAX_MS = 130000;

function findNoConfigBanner(doc) {
    if (doc.getElementById('xmlparams')) {
        return undefined;
    }
    var fonts = doc.getElementsByTagName('font');
    for (var i = 0, len = fonts.length; i < len; ++i) {
        var color = (fonts[i].getAttribute('color') || '').toLowerCase();
        if ('red'!=color) {
            continue;
        }
        var t = (fonts[i].textContent || '').toLowerCase();
        if (t.indexOf('config') >= 0 || t.indexOf('configuration') >= 0 || t.indexOf('xml') >= 0) {
            return fonts[i];
        }
    }
    return undefined;
}

function hideOriginalNoConfigSection(doc) {
    var el = findNoConfigBanner(doc);
    if (!el) {
        return;
    }
    el.classList.add('msk-rb-hidden-info');
    var section = rbFindSettingSection(el);
    if (section) {
        section.classList.add('msk-rb-hidden-info');
    }
}

function ensureBridgeStatusAnchor(doc) {
    var anchor = doc.getElementById('msk-bridge-status-anchor');
    if (anchor) {
        return anchor;
    }
    anchor = doc.createElement('div');
    anchor.id = 'msk-bridge-status-anchor';
    anchor.className = 'msk-bridge-status-anchor';
    var autorun = doc.querySelector('input[name="autorun"]');
    var insertAfter = undefined;
    if (autorun) {
        var group = autorun.parentElement;
        while (group && (!group.classList || !group.classList.contains('settingGroup'))) {
            group = group.parentElement;
        }
        insertAfter = group;
    }
    if (insertAfter && insertAfter.parentNode) {
        if (insertAfter.nextSibling) {
            insertAfter.parentNode.insertBefore(anchor, insertAfter.nextSibling);
        } else {
            insertAfter.parentNode.appendChild(anchor);
        }
        return anchor;
    }
    var block = doc.getElementById('innerSettingsBlock');
    if (block) {
        if (block.firstChild) {
            block.insertBefore(anchor, block.firstChild);
        } else {
            block.appendChild(anchor);
        }
    }
    return anchor;
}

function showBridgeStatusMessage(doc, mode) {
    if (doc.getElementById('xmlparams')) {
        var banner = doc.getElementById('msk-bridge-status-banner');
        if (banner && banner.parentNode) {
            banner.parentNode.removeChild(banner);
        }
        return;
    }
    hideOriginalNoConfigSection(doc);
    var anchor = ensureBridgeStatusAnchor(doc);
    if (!anchor) {
        return;
    }
    var banner = doc.getElementById('msk-bridge-status-banner');
    if (!banner) {
        banner = doc.createElement('div');
        banner.id = 'msk-bridge-status-banner';
        banner.className = 'msk-rb-noconfig-msg';
        anchor.appendChild(banner);
    }
    banner.classList.remove('msk-rb-generating-config', 'msk-rb-status-failed', 'msk-rb-status-nobinary');
    if ('generating'==mode) {
        banner.classList.add('msk-rb-generating-config');
        banner.innerHTML = '<span class="msk-rb-generating-spinner" aria-hidden="true"></span>' +
            '<span class="msk-rb-gen-text">' + bridgeMsg('Generating configuration file… This may take up to a minute.') + '</span>';
    } else if ('failed'==mode) {
        banner.classList.add('msk-rb-status-failed');
        banner.textContent = bridgeMsg('Configuration generation failed. Use Generate configuration in the Config section below, or check the plugin log.');
    } else if ('nobinary'==mode) {
        banner.classList.add('msk-rb-status-nobinary');
        banner.textContent = bridgeMsg('No configuration file yet. Select a binary, then generate the configuration.');
    } else {
        banner.textContent = '';
        banner.style.display = 'none';
    }
    if ('generating'!=mode && 'failed'!=mode && 'nobinary'!=mode) {
        return;
    }
    banner.style.display = '';
}

function transformNoConfigBanner(doc, mode) {
    showBridgeStatusMessage(doc, mode);
}

function getBridgeGenPendingAge(state) {
    if (!state) {
        return -1;
    }
    if (0===state.indexOf('pending:')) {
        var ts = parseInt(state.substring(8), 10);
        return isNaN(ts) ? BRIDGE_GEN_PENDING_MAX_MS + 1 : (Date.now() - ts);
    }
    if ('pending'==state) {
        return BRIDGE_GEN_PENDING_MAX_MS + 1;
    }
    return -1;
}

function setBridgeGenPendingStamp(doc, submitted) {
    var storageKey = getBridgeGenConfigStorageKey(doc);
    var val = 'pending:' + Date.now();
    if (submitted) {
        val += ':submitted';
    }
    try {
        if (doc.defaultView && doc.defaultView.sessionStorage) {
            doc.defaultView.sessionStorage.setItem(storageKey, val);
        }
    } catch(e) {}
}

function bridgeGenWasPending(state) {
    return state && (0===state.indexOf('pending:') || 'pending'==state);
}

function bridgeGenAlreadySubmitted(state) {
    return state && state.indexOf(':submitted') >= 0;
}

function hideBridgeGeneratingOverlay(doc) {
    var overlay = doc.getElementById('msk-bridge-gen-overlay');
    if (overlay && overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
    }
}

function getBridgeGenConfigStorageKey(doc) {
    return 'msk-bridge-gen-' + (doc.mskBridgePluginKey || 'bridge');
}

function clearBridgeGenConfigState(doc) {
    try {
        if (doc.defaultView && doc.defaultView.sessionStorage) {
            doc.defaultView.sessionStorage.removeItem(getBridgeGenConfigStorageKey(doc));
        }
    } catch(e) {}
    doc.mskBridgeGenConfigPending = false;
    doc.mskBridgeGenReloading = false;
    stopBridgeGenConfigPoll(doc);
    hideBridgeGeneratingOverlay(doc);
    var banner = doc.getElementById('msk-bridge-status-banner');
    if (banner && banner.parentNode) {
        banner.parentNode.removeChild(banner);
    }
}

function finishBridgeConfigIfReady(doc) {
    if (!doc.getElementById('xmlparams')) {
        return false;
    }
    var storageKey = getBridgeGenConfigStorageKey(doc);
    var wasPending = !!doc.mskBridgeGenConfigPending;
    try {
        if (doc.defaultView && doc.defaultView.sessionStorage) {
            var state = doc.defaultView.sessionStorage.getItem(storageKey) || '';
            wasPending = wasPending || bridgeGenWasPending(state);
            if (wasPending) {
                doc.defaultView.sessionStorage.removeItem(storageKey);
            }
        }
    } catch(e) {}
    doc.mskBridgeGenConfigPending = false;
    doc.mskBridgeGenReloading = false;
    stopBridgeGenConfigPoll(doc);
    hideBridgeGeneratingOverlay(doc);
    var banner = doc.getElementById('msk-bridge-status-banner');
    if (banner && banner.parentNode) {
        banner.parentNode.removeChild(banner);
    }
    updateBridgeConfigDependentVisibility(doc);
    if (wasPending) {
        bus.$emit('showMessage', bridgeMsg('Configuration file is ready.'));
    }
    return true;
}

function autoSubmitGenConfig(doc) {
    var form = doc.getElementById('settingsForm');
    if (!form) {
        return false;
    }
    var genBtn = doc.querySelector('input[name="genconfig"]');
    if (!genBtn) {
        return false;
    }
    if (!form.querySelector('input[name="genconfig"]')) {
        var hidden = doc.createElement('input');
        hidden.type = 'hidden';
        hidden.name = 'genconfig';
        hidden.value = genBtn.value || '1';
        form.appendChild(hidden);
    }
    restoreRbPlaceholderValues(doc);
    doc.mskBridgeGenConfigPending = true;
    submitSettingsForm(form);
    return true;
}

function stopBridgeGenConfigPoll(doc) {
    if (doc.mskBridgeGenPollTimer) {
        clearInterval(doc.mskBridgeGenPollTimer);
        doc.mskBridgeGenPollTimer = undefined;
    }
    doc.mskBridgeGenPollScheduled = false;
}

function reloadBridgePluginSettingsForConfig(doc) {
    var pluginKey = doc.mskBridgePluginKey;
    if (!pluginKey || doc.mskBridgeGenReloading) {
        return;
    }
    doc.mskBridgeGenReloading = true;
    stopBridgeGenConfigPoll(doc);
    bus.$emit('iframe-href', getBridgePluginSettingsUrl(pluginKey), false);
}

function pollBridgeGenConfigReady(doc) {
    if (doc.getElementById('xmlparams')) {
        stopBridgeGenConfigPoll(doc);
        finishBridgeConfigIfReady(doc);
        return;
    }
    var storageKey = getBridgeGenConfigStorageKey(doc);
    var state = '';
    try {
        if (doc.defaultView && doc.defaultView.sessionStorage) {
            state = doc.defaultView.sessionStorage.getItem(storageKey) || '';
        }
    } catch(e) {}
    var pendingAge = getBridgeGenPendingAge(state);
    if (pendingAge < 0 || pendingAge > BRIDGE_GEN_PENDING_MAX_MS) {
        stopBridgeGenConfigPoll(doc);
        if (pendingAge > BRIDGE_GEN_PENDING_MAX_MS) {
            try {
                if (doc.defaultView && doc.defaultView.sessionStorage) {
                    doc.defaultView.sessionStorage.setItem(storageKey, 'failed');
                }
            } catch(e) {}
            showBridgeStatusMessage(doc, 'failed');
            updateBridgeConfigDependentVisibility(doc);
            bus.$emit('showError', bridgeMsg('Configuration generation failed. Try Generate configuration manually.'));
        }
        return;
    }
    var pluginKey = doc.mskBridgePluginKey;
    if (!pluginKey) {
        return;
    }
    var url = getBridgePluginSettingsUrl(pluginKey);
    fetch(url, { cache: 'no-store', credentials: 'same-origin' })
        .then(function(resp) {
            if (!resp.ok) {
                return '';
            }
            return resp.text();
        })
        .then(function(html) {
            if (!html) {
                return;
            }
            if (html.indexOf('id="xmlparams"') >= 0 || html.indexOf("id='xmlparams'") >= 0) {
                reloadBridgePluginSettingsForConfig(doc);
            }
        })
        .catch(function() {});
}

function scheduleBridgeGenConfigPoll(doc) {
    if (doc.mskBridgeGenPollScheduled || doc.getElementById('xmlparams')) {
        return;
    }
    doc.mskBridgeGenPollScheduled = true;
    stopBridgeGenConfigPoll(doc);
    doc.mskBridgeGenPollTimer = setInterval(function() {
        pollBridgeGenConfigReady(doc);
    }, 8000);
    setTimeout(function() {
        pollBridgeGenConfigReady(doc);
    }, 3000);
}

function markBridgeConfigDependentSections(doc) {
    if (doc.mskRbConfigSectionsMarked) {
        return;
    }
    doc.mskRbConfigSectionsMarked = true;
    var sectionIds = ['ports'];
    for (var s = 0, slen = sectionIds.length; s < slen; ++s) {
        var anchor = doc.getElementById(sectionIds[s]);
        var section = anchor ? rbFindSettingSection(anchor) : null;
        if (section) {
            section.classList.add('msk-rb-needs-config');
        }
    }
    var fieldSelectors = ['#log_limit', 'input[name="eraselog"]', 'input[name="cleanlog"]', 'input[name="delconfig"]'];
    for (var f = 0, flen = fieldSelectors.length; f < flen; ++f) {
        var field = doc.querySelector(fieldSelectors[f]);
        if (field) {
            field.classList.add('msk-rb-needs-config');
        }
    }
}

function updateBridgeConfigDependentVisibility(doc) {
    markBridgeConfigDependentSections(doc);
    var hasConfig = !!doc.getElementById('xmlparams');
    if (doc.documentElement) {
        doc.documentElement.classList.toggle('msk-rb-has-config', hasConfig);
        doc.documentElement.classList.toggle('msk-rb-no-config', !hasConfig);
    }
    if (doc.body) {
        doc.body.classList.toggle('msk-rb-has-config', hasConfig);
        doc.body.classList.toggle('msk-rb-no-config', !hasConfig);
    }
}

function tryAutoGenerateConfig(doc) {
    updateBridgeConfigDependentVisibility(doc);
    if (doc.getElementById('xmlparams')) {
        stopBridgeGenConfigPoll(doc);
        finishBridgeConfigIfReady(doc);
        updateBridgeConfigDependentVisibility(doc);
        return false;
    }
    var genBtn = doc.querySelector('input[name="genconfig"]');
    var binary = getSelectedBridgeBinary(doc);
    var storageKey = getBridgeGenConfigStorageKey(doc);
    var state = '';
    try {
        if (doc.defaultView && doc.defaultView.sessionStorage) {
            state = doc.defaultView.sessionStorage.getItem(storageKey) || '';
        }
    } catch(e) {}

    var pendingAge = getBridgeGenPendingAge(state);
    if (pendingAge >= 0 && pendingAge < BRIDGE_GEN_PENDING_MAX_MS) {
        showBridgeStatusMessage(doc, 'generating');
        doc.mskBridgeGenConfigPending = true;
        updateBridgeConfigDependentVisibility(doc);
        if (!bridgeGenAlreadySubmitted(state)) {
            setBridgeGenPendingStamp(doc, true);
            setTimeout(function() {
                try {
                    autoSubmitGenConfig(doc);
                } catch(e) {
                    rbSafeLog(e);
                    doc.mskBridgeGenConfigPending = false;
                }
            }, 400);
        } else {
            scheduleBridgeGenConfigPoll(doc);
        }
        return false;
    }
    if (pendingAge >= BRIDGE_GEN_PENDING_MAX_MS || 'failed'==state) {
        stopBridgeGenConfigPoll(doc);
        showBridgeStatusMessage(doc, 'failed');
        hideBridgeGeneratingOverlay(doc);
        updateBridgeConfigDependentVisibility(doc);
        if ('failed'!=state) {
            try {
                if (doc.defaultView && doc.defaultView.sessionStorage) {
                    doc.defaultView.sessionStorage.setItem(storageKey, 'failed');
                }
            } catch(e) {}
            bus.$emit('showError', bridgeMsg('Configuration generation failed. Try Generate configuration manually.'));
        }
        return false;
    }
    if (!genBtn || !binary) {
        showBridgeStatusMessage(doc, 'nobinary');
        return false;
    }

    showBridgeStatusMessage(doc, 'generating');
    bus.$emit('showMessage', bridgeMsg('Generating configuration file… This may take up to a minute.'));
    doc.mskBridgeGenConfigPending = true;
    setBridgeGenPendingStamp(doc, true);
    updateBridgeConfigDependentVisibility(doc);
    setTimeout(function() {
        try {
            autoSubmitGenConfig(doc);
        } catch(e) {
            rbSafeLog(e);
            doc.mskBridgeGenConfigPending = false;
        }
    }, 400);
    return true;
}

function updateBridgeVcredistVisibility(doc) {
    var notice = doc.querySelector('.msk-rb-vcredist-notice');
    if (!notice) {
        return;
    }
    var show = isWindowsBridgeBinary(getSelectedBridgeBinary(doc));
    notice.classList.toggle('msk-rb-visible', show);
    notice.setAttribute('aria-hidden', show ? 'false' : 'true');
}

function setupBridgeVcredistNotice(doc) {
    var link = doc.querySelector('a[target="vcredist"], a[href*="vc-redist"]');
    if (!link || link.mskRbVcredistWired) {
        updateBridgeVcredistVisibility(doc);
        return;
    }
    link.mskRbVcredistWired = true;
    var holder = link.parentElement;
    while (holder && 'B'!=holder.tagName && 'BODY'!=holder.tagName) {
        holder = holder.parentElement;
    }
    if (!holder || 'B'!=holder.tagName) {
        holder = link.parentElement;
    }
    if (holder) {
        holder.classList.add('msk-rb-vcredist-notice');
        var section = rbFindSettingSection(holder);
        if (section) {
            section.classList.add('msk-rb-binaries-section');
        }
    }
    var binSel = doc.getElementById('bin');
    if (binSel && !binSel.mskRbBinWired) {
        binSel.mskRbBinWired = true;
        binSel.addEventListener('change', function() {
            updateBridgeVcredistVisibility(doc);
        });
    }
    updateBridgeVcredistVisibility(doc);
}

function hideRbInfoBanners(doc) {
    var fonts = doc.getElementsByTagName('font');
    for (var i = 0, len = fonts.length; i < len; ++i) {
        var color = (fonts[i].getAttribute('color') || '').toLowerCase();
        if ('red'!=color) {
            continue;
        }
        var t = (fonts[i].textContent || '').toLowerCase();
        if (t.indexOf('highly recommended') >= 0) {
            continue;
        }
        if (findNoConfigBanner(doc)===fonts[i]) {
            continue;
        }
        if (t.indexOf('empty') >= 0 || t.indexOf('default parameter') >= 0 ||
            t.indexOf('defaults for all players') >= 0 || t.indexOf('parameter value means') >= 0) {
            fonts[i].classList.add('msk-rb-hidden-info');
        }
    }
}

function applyRbDefaultPlaceholders(doc) {
    var sel = doc.getElementById('seldevice');
    var isCommon = !sel || '.common.'==sel.value;
    var fieldDefaults = getBridgeFieldDefaults(doc);
    for (var id in fieldDefaults) {
        var el = doc.getElementById(id);
        if (!el || el.disabled || 'text'!=el.type && 'password'!=el.type) {
            continue;
        }
        var def = fieldDefaults[id];
        var val = el.value;
        var usePlaceholder = isCommon ? rbIsDefaultValue(val) : (''===(val || '').trim());
        if (!usePlaceholder) {
            continue;
        }
        el.dataset.rbDefault = val;
        el.value = '';
        el.placeholder = def;
        el.classList.add('msk-rb-using-placeholder');
    }
}

function restoreRbPlaceholderValues(doc) {
    var fields = doc.querySelectorAll('.msk-rb-using-placeholder');
    for (var i = 0, len = fields.length; i < len; ++i) {
        var f = fields[i];
        if (''==f.value && undefined!=f.dataset.rbDefault) {
            f.value = f.dataset.rbDefault;
        }
    }
}

function shortRbUdn(udn) {
    var at = udn.indexOf('@');
    return at > 0 ? udn.substring(0, at) : udn.substring(0, 12);
}

function rbReadPlayerRowInfo(row, cb) {
    var udn = cb.name.substring('enabled.'.length);
    if (row.dataset.rbName || row.dataset.rbMac || row.dataset.rbFriendly) {
        return {
            name: row.dataset.rbName || '',
            mac: row.dataset.rbMac || '',
            friendly: row.dataset.rbFriendly || '',
            enabled: cb.checked
        };
    }
    var ths = row.getElementsByTagName('th');
    return {
        name: ths.length > 0 ? ths[0].textContent.replace(/\s+/g, ' ').trim() : '',
        mac: ths.length > 1 ? ths[1].textContent.replace(/\s+/g, ' ').trim() : '',
        friendly: ths.length > 3 ? ths[3].textContent.replace(/\s+/g, ' ').trim() : '',
        enabled: cb.checked
    };
}

function getRbDeviceMapFromTable(doc) {
    var map = {};
    var rows = doc.querySelectorAll('table tr');
    for (var i = 0, len = rows.length; i < len; ++i) {
        var cb = rows[i].querySelector('input[type=checkbox][name^="enabled."]');
        if (!cb) {
            continue;
        }
        var udn = cb.name.substring('enabled.'.length);
        map[udn] = rbReadPlayerRowInfo(rows[i], cb);
    }
    return map;
}

function rbFormatPlayerNetworkLine(info) {
    var parts = [];
    if (info.mac) {
        parts.push(info.mac);
    }
    if (info.friendly && info.friendly !== info.name) {
        parts.push(info.friendly);
    }
    return parts.join(' \u00b7 ');
}

function formatRbDeviceLabel(info, udn) {
    var label = info.name || info.friendly || '';
    if (!label) {
        label = info.mac || shortRbUdn(udn);
    }
    var suffix = rbFormatPlayerNetworkLine({
        name: label,
        mac: info.mac,
        friendly: info.friendly
    });
    if (suffix && suffix !== label) {
        label += ' (' + suffix + ')';
    }
    if (info.enabled) {
        label = '\u25cf ' + label;
    }
    return label;
}

function rbMarkScrollToConfig(doc) {
    try {
        if (doc.defaultView && doc.defaultView.sessionStorage) {
            doc.defaultView.sessionStorage.setItem('msk-rb-scroll-config', '1');
        }
    } catch(e) {}
}

function rbScrollToConfigIfNeeded(doc) {
    try {
        if (!doc.defaultView || !doc.defaultView.sessionStorage) {
            return;
        }
        if ('1'!=doc.defaultView.sessionStorage.getItem('msk-rb-scroll-config')) {
            return;
        }
        doc.defaultView.sessionStorage.removeItem('msk-rb-scroll-config');
        var anchor = doc.getElementById('msk-rb-config-anchor');
        if (anchor && anchor.scrollIntoView) {
            anchor.scrollIntoView({block: 'start', behavior: 'smooth'});
        }
    } catch(e) {}
}

function configureRbPlayer(doc, udn) {
    var form = doc.getElementById('settingsForm');
    var sel = doc.getElementById('seldevice');
    if (!form || !sel) {
        return;
    }
    rbMarkScrollToConfig(doc);
    sel.mskRbSuppressChange = true;
    sel.value = udn;
    sel.mskRbLastValue = udn;
    restoreRbPlaceholderValues(doc);
    bus.$emit('iframe-loaded', false);
    submitSettingsForm(form);
}

function wrapRbEnableCheckbox(doc, cb) {
    if (cb.mskRbWrapped || !cb.parentNode) {
        return;
    }
    cb.mskRbWrapped = true;
    cb.classList.add('msk-rb-enable-input');
    cb.style.cssText = 'position:absolute!important;left:-9999px!important;width:1px!important;height:1px!important;opacity:0!important;';

    var wrap = doc.createElement('span');
    wrap.className = 'msk-rb-enable-wrap';
    wrap.setAttribute('role', 'checkbox');
    wrap.setAttribute('aria-checked', cb.checked ? 'true' : 'false');
    wrap.setAttribute('tabindex', '0');
    wrap.style.cssText = 'display:inline-block;width:28px;height:28px;border:2px solid #1976d2;border-radius:4px;box-sizing:border-box;cursor:pointer;vertical-align:middle;position:relative;background:transparent;';

    var tick = doc.createElement('span');
    tick.className = 'msk-rb-enable-tick';
    tick.style.cssText = 'display:none;position:absolute;left:8px;top:3px;width:8px;height:14px;border:solid #ffffff;border-width:0 3px 3px 0;transform:rotate(45deg);box-sizing:border-box;';

    wrap.appendChild(tick);
    cb.parentNode.insertBefore(wrap, cb);

    function sync() {
        wrap.setAttribute('aria-checked', cb.checked ? 'true' : 'false');
        wrap.style.backgroundColor = cb.checked ? '#1976d2' : 'transparent';
        tick.style.display = cb.checked ? 'block' : 'none';
        wrap.classList.toggle('msk-rb-checked', cb.checked);
    }

    function toggle(ev) {
        if (ev) {
            ev.preventDefault();
            ev.stopPropagation();
        }
        cb.checked = !cb.checked;
        sync();
        try {
            cb.dispatchEvent(new Event('change', {bubbles: true}));
        } catch(e) {
            var evt = doc.createEvent('HTMLEvents');
            evt.initEvent('change', true, false);
            cb.dispatchEvent(evt);
        }
    }

    wrap.addEventListener('click', toggle);
    wrap.addEventListener('keydown', function(ev) {
        var code = ev.keyCode || ev.which;
        if (13==code || 32==code) {
            toggle(ev);
        }
    });
    cb.addEventListener('change', sync);
    sync();
}

function rbFindSettingSection(el) {
    while (el) {
        if (el.classList && el.classList.contains('settingSection')) {
            return el;
        }
        el = el.parentElement;
    }
    return null;
}

function rbGuardRaopBridgeForm(doc) {
    var form = doc.getElementById('settingsForm');
    if (!form || form.mskRbGuardInstalled) {
        return;
    }
    form.mskRbGuardInstalled = true;
    form.mskRbSubmitAllowed = false;
    form.submit = function() {
        if (form.mskRbSubmitAllowed) {
            HTMLFormElement.prototype.submit.call(form);
        }
    };
}

function rbReleaseRaopBridgeForm(doc) {
    var form = doc.getElementById('settingsForm');
    if (form) {
        form.mskRbSubmitAllowed = true;
    }
    doc.documentElement.classList.add('msk-raopbridge-ready');
}

function rbFindDeviceCustomSelect(win, sel) {
    if (!win || !sel || !win.customSelects) {
        return undefined;
    }
    for (var s = 0, slen = win.customSelects.length; s < slen; ++s) {
        try {
            if (win.customSelects[s].select===sel) {
                return win.customSelects[s];
            }
        } catch(e) {}
    }
    return undefined;
}

function rbSyncDeviceSelectLabels(doc, sel) {
    if (!sel) {
        return;
    }
    var win = doc.defaultView;
    var cst = rbFindDeviceCustomSelect(win, sel);
    if (!cst) {
        return;
    }
    try {
        cst.container.classList.add('msk-rb-device-select');
        for (var i = 0, olen = sel.options.length; i < olen; ++i) {
            var opt = sel.options[i];
            if (opt.customSelectCstOption) {
                opt.customSelectCstOption.textContent = opt.text;
            }
        }
        if (cst.opener && sel.selectedIndex>=0 && sel.options[sel.selectedIndex]) {
            cst.opener.textContent = sel.options[sel.selectedIndex].text;
        }
        if (win && typeof win.setSelectStyle === 'function') {
            win.setSelectStyle(cst, true);
        }
    } catch(e) {
        rbSafeLog(e);
    }
}

function rbUpdateDeviceOptionLabels(sel, deviceMap) {
    var commonLabel = i18n('Common parameters');
    if ('Common parameters'==commonLabel) {
        commonLabel = 'Paramètres communs';
    }
    var changed = false;
    for (var i = 0, olen = sel.options.length; i < olen; ++i) {
        var opt = sel.options[i];
        var newText;
        if ('.common.'==opt.value) {
            newText = commonLabel;
        } else {
            var info = deviceMap[opt.value];
            if (info) {
                newText = formatRbDeviceLabel(info, opt.value);
            } else {
                newText = opt.text.trim() || shortRbUdn(opt.value);
            }
        }
        if (opt.text!==newText) {
            opt.text = newText;
            changed = true;
        }
    }
    return changed;
}

function rbEnsureConfigAnchor(doc, section) {
    if (!section || doc.getElementById('msk-rb-config-anchor')) {
        return;
    }
    var anchor = doc.createElement('div');
    anchor.id = 'msk-rb-config-anchor';
    anchor.className = 'msk-rb-config-anchor';
    if (section.nextSibling) {
        section.parentNode.insertBefore(anchor, section.nextSibling);
    } else {
        section.parentNode.appendChild(anchor);
    }
}

function enhanceRbDeviceSelector(doc, deviceMap) {
    var sel = doc.getElementById('seldevice');
    if (!sel) {
        return;
    }
    if (!deviceMap) {
        deviceMap = doc.mskRbDeviceMap || getRbDeviceMapFromTable(doc);
    }
    rbUpdateDeviceOptionLabels(sel, deviceMap);
    var section = rbFindSettingSection(sel);
    if (section) {
        section.classList.add('msk-rb-device-picker');
        rbEnsureConfigAnchor(doc, section);
    }
    rbSyncDeviceSelectLabels(doc, sel);
}

function rbSetDeleteDeviceFlag(doc, form) {
    var dels = form.querySelectorAll('input[name="deldevice"]');
    var del = undefined;
    for (var i = 0, len = dels.length; i < len; ++i) {
        if ('checkbox'==dels[i].type) {
            del = dels[i];
            break;
        }
    }
    if (!del && dels.length>0) {
        del = dels[0];
    }
    if (del) {
        if ('checkbox'==del.type) {
            del.checked = true;
        } else {
            del.value = '1';
        }
        return;
    }
    del = doc.createElement('input');
    del.type = 'hidden';
    del.name = 'deldevice';
    del.value = '1';
    form.appendChild(del);
}

function deleteRbPlayer(doc, udn) {
    var form = doc.getElementById('settingsForm');
    if (!form) {
        return;
    }
    confirm(i18n('Delete') + '?', i18n('Delete')).then(function(res) {
        if (!res) {
            return;
        }
        var sel = doc.getElementById('seldevice');
        if (sel) {
            sel.mskRbSuppressChange = true;
            sel.value = udn;
            sel.mskRbLastValue = udn;
            rbSyncDeviceSelectLabels(doc, sel);
        }
        rbSetDeleteDeviceFlag(doc, form);
        restoreRbPlaceholderValues(doc);
        bus.$emit('iframe-loaded', false);
        submitSettingsForm(form);
    });
}

function hideRbDeletePlayerUi(doc) {
    var deldevice = doc.querySelector('input[name="deldevice"]');
    if (!deldevice) {
        return;
    }
    var td = deldevice.parentElement;
    if (td) {
        td.classList.add('msk-rb-hide-delete-ui');
    }
    if (td && td.nextElementSibling && 'TH'==td.nextElementSibling.tagName) {
        td.nextElementSibling.classList.add('msk-rb-hide-delete-ui');
    }
}

function rbSafeLog(e) {
    if (typeof logError === 'function') {
        logError(e);
    }
}

function wireRbPlayerTable(doc) {
    hideRbDeletePlayerUi(doc);
    var sel = doc.getElementById('seldevice');
    var currentUdn = sel ? sel.value : '';
    var tables = doc.getElementsByTagName('table');
    for (var t = 0, tlen = tables.length; t < tlen; ++t) {
        var table = tables[t];
        var rows = table.getElementsByTagName('tr');
        var isPlayerList = false;
        for (var r = 0, rlen = rows.length; r < rlen; ++r) {
            if (rows[r].querySelector('input[type=checkbox][name^="enabled."]')) {
                isPlayerList = true;
                break;
            }
        }
        if (!isPlayerList) {
            continue;
        }
        table.classList.add('msk-rb-player-list');
        var rowList = [];
        for (var ri = 0, rlen2 = rows.length; ri < rlen2; ++ri) {
            rowList.push(rows[ri]);
        }
        for (var i = 0, len = rowList.length; i < len; ++i) {
            var row = rowList[i];
            if (row.classList.contains('msk-rb-player-row')) {
                continue;
            }
            var cb = row.querySelector('input[type=checkbox][name^="enabled."]');
            if (!cb) {
                continue;
            }
            var udn = cb.name.substring('enabled.'.length);
            var rowInfo = rbReadPlayerRowInfo(row, cb);
            var name = rowInfo.name;
            var mac = rowInfo.mac;
            var friendly = rowInfo.friendly;
            row.dataset.rbName = name;
            row.dataset.rbMac = mac;
            row.dataset.rbFriendly = friendly;
            row.classList.add('msk-rb-player-row');
            var ths = row.getElementsByTagName('th');
            if (udn===currentUdn) {
                row.classList.add('msk-rb-row-active');
            }
            var enableTd = cb.parentElement;
            if (enableTd && 'TD'==enableTd.tagName) {
                enableTd.classList.add('msk-rb-col-enable');
            }
            cb.setAttribute('aria-label', i18n('Enabled'));
            for (var h = ths.length - 1; h >= 0; --h) {
                ths[h].classList.add('msk-rb-legacy-th');
                if (ths[h].parentNode===row) {
                    row.removeChild(ths[h]);
                }
            }
            wrapRbEnableCheckbox(doc, cb);
            var infoTd = doc.createElement('td');
            infoTd.className = 'msk-rb-col-info';
            var infoWrap = doc.createElement('div');
            infoWrap.className = 'msk-rb-player-info';
            var nameDiv = doc.createElement('div');
            nameDiv.className = 'msk-rb-player-name';
            nameDiv.textContent = name;
            var networkDiv = doc.createElement('div');
            networkDiv.className = 'msk-rb-player-network';
            var networkLine = rbFormatPlayerNetworkLine(rowInfo);
            if (networkLine) {
                networkDiv.textContent = networkLine;
            } else {
                networkDiv.classList.add('msk-rb-no-network');
            }
            infoWrap.appendChild(nameDiv);
            infoWrap.appendChild(networkDiv);
            infoTd.appendChild(infoWrap);
            if (ths.length>0 && ths[0].parentNode===row) {
                row.insertBefore(infoTd, ths[0]);
            } else {
                row.appendChild(infoTd);
            }
            var actionsTd = doc.createElement('td');
            actionsTd.className = 'msk-rb-col-actions';
            var cfgBtn = doc.createElement('button');
            cfgBtn.type = 'button';
            cfgBtn.className = 'msk-rb-config';
            cfgBtn.title = i18n('Configuration');
            cfgBtn.textContent = i18n('Config');
            cfgBtn.addEventListener('click', function(id) {
                return function(ev) {
                    ev.preventDefault();
                    ev.stopPropagation();
                    configureRbPlayer(doc, id);
                };
            }(udn));
            var delBtn = doc.createElement('button');
            delBtn.type = 'button';
            delBtn.className = 'msk-rb-delete';
            delBtn.title = i18n('Delete');
            delBtn.textContent = i18n('Remove');
            delBtn.addEventListener('click', function(id) {
                return function(ev) {
                    ev.preventDefault();
                    ev.stopPropagation();
                    deleteRbPlayer(doc, id);
                };
            }(udn));
            actionsTd.appendChild(cfgBtn);
            actionsTd.appendChild(delBtn);
            row.appendChild(actionsTd);
            row.classList.add('msk-rb-player-row-clickable');
            row.addEventListener('click', function(id, rowEl) {
                return function(ev) {
                    var t = ev.target;
                    while (t && t!==rowEl) {
                        if ('INPUT'==t.tagName || 'BUTTON'==t.tagName || 'LABEL'==t.tagName) {
                            return;
                        }
                        if (t.classList && (t.classList.contains('msk-rb-col-enable') ||
                            t.classList.contains('msk-rb-col-actions') ||
                            t.classList.contains('msk-rb-enable-wrap') ||
                            t.classList.contains('msk-rb-enable-tick'))) {
                            return;
                        }
                        t = t.parentElement;
                    }
                    configureRbPlayer(doc, id);
                };
            }(udn, row));
        }
    }
}

function rbPrepareDeviceSelector(doc) {
    var sel = doc.getElementById('seldevice');
    if (sel) {
        sel.removeAttribute('onchange');
    }
}

function wireRbDeviceChangeHandler(doc) {
    var sel = doc.getElementById('seldevice');
    if (!sel || sel.mskRbWired) {
        return;
    }
    sel.mskRbWired = true;
    sel.mskRbLastValue = sel.value;
    sel.addEventListener('change', function(ev) {
        if (sel.mskRbSuppressChange) {
            return;
        }
        if (ev && !ev.isTrusted) {
            return;
        }
        if (sel.value===sel.mskRbLastValue) {
            return;
        }
        sel.mskRbLastValue = sel.value;
        var rbForm = doc.getElementById('settingsForm');
        if (rbForm) {
            restoreRbPlaceholderValues(doc);
            bus.$emit('iframe-loaded', false);
            submitSettingsForm(rbForm);
        }
    });
}

function wireBridgePluginForm(doc) {
    var form = doc.getElementById('settingsForm');
    if (form && !form.mskRbSubmitWired) {
        form.mskRbSubmitWired = true;
        form.addEventListener('submit', function() {
            restoreRbPlaceholderValues(doc);
        });
    }

    var linkPrefix = doc.mskBridgePluginKey && BRIDGE_PLUGINS[doc.mskBridgePluginKey]
                       ? BRIDGE_PLUGINS[doc.mskBridgePluginKey].linkPrefix
                       : '';
    var links = doc.getElementsByTagName('a');
    for (var i = 0, len = links.length; i < len; ++i) {
        var href = links[i].getAttribute('href');
        if (!href || 0===href.indexOf('http')) {
            continue;
        }
        if (linkPrefix && (href.indexOf(linkPrefix + '-') >= 0 || 0===href.indexOf(linkPrefix))) {
            if (0!==href.indexOf('/')) {
                links[i].href = '/' + href;
            }
            links[i].removeAttribute('target');
            if (isBridgeAuxiliaryHref(href, linkPrefix) && !links[i].mskBridgeAuxWired) {
                links[i].mskBridgeAuxWired = true;
                var auxHref = links[i].href;
                links[i].addEventListener('click', function(ev) {
                    ev.preventDefault();
                    bus.$emit('iframe-href', auxHref, true);
                });
            }
        }
    }

    var genconfig = doc.querySelector('input[name="genconfig"]');
    if (genconfig) {
        genconfig.removeAttribute('onclick');
        if (!genconfig.mskRbWired) {
            genconfig.mskRbWired = true;
            genconfig.addEventListener('click', function(ev) {
                try {
                    if (doc.defaultView && doc.defaultView.sessionStorage) {
                        doc.defaultView.sessionStorage.removeItem(getBridgeGenConfigStorageKey(doc));
                    }
                } catch(e) {}
                setBridgeGenPendingStamp(doc, true);
                doc.mskBridgeGenConfigPending = true;
                showBridgeStatusMessage(doc, 'generating');
                updateBridgeConfigDependentVisibility(doc);
                bus.$emit('showMessage', bridgeMsg('Generating configuration file… This may take up to a minute.'));
            });
        }
    }

    var delconfig = doc.querySelector('input[name="delconfig"]');
    if (delconfig && !delconfig.mskRbWired) {
        delconfig.mskRbWired = true;
        delconfig.addEventListener('click', function(ev) {
            ev.preventDefault();
            ev.stopPropagation();
            confirm(i18n('Erase') + '?', i18n('Erase')).then(function(res) {
                if (!res) {
                    return;
                }
                var rbForm = doc.getElementById('settingsForm');
                if (rbForm) {
                    restoreRbPlaceholderValues(doc);
                    bus.$emit('iframe-loaded', false);
                    submitSettingsForm(rbForm);
                }
            });
        });
    }
}

function rbDisableSettingsResize(doc) {
    var win = doc.defaultView;
    if (win && typeof win.resizeSettingsSection === 'function') {
        win.resizeSettingsSection = function() {};
    }
}

function rbSetStyleImportant(el, prop, val) {
    if (el) {
        el.style.setProperty(prop, val, 'important');
    }
}

function rbResolveThemeBackground() {
    var bg = '#212121';
    try {
        var page = document.getElementById('iframe-page');
        if (page) {
            var cs = getComputedStyle(page);
            var pb = cs.getPropertyValue('--background-color').trim();
            if (pb) {
                bg = pb;
            } else if (cs.backgroundColor && 'rgba(0, 0, 0, 0)'!=cs.backgroundColor && 'transparent'!=cs.backgroundColor) {
                bg = cs.backgroundColor;
            }
        }
    } catch(e) {}
    return bg;
}

function rbApplyThemeBackground(doc) {
    var bg = rbResolveThemeBackground();
    var targets = [doc.documentElement, doc.body,
                   doc.getElementById('homeMenu'),
                   doc.getElementById('settingsRegion'),
                   doc.getElementById('settingsForm'),
                   doc.getElementById('innerSettingsBlock')];
    for (var i = 0, len = targets.length; i < len; ++i) {
        if (targets[i]) {
            rbSetStyleImportant(targets[i], 'background-color', bg);
            rbSetStyleImportant(targets[i], 'background', bg);
        }
    }
}

function rbFixSettingsLayout(doc) {
    var block = doc.getElementById('innerSettingsBlock');
    if (block) {
        rbSetStyleImportant(block, 'height', 'auto');
        rbSetStyleImportant(block, 'min-height', '0');
        rbSetStyleImportant(block, 'max-height', 'none');
        rbSetStyleImportant(block, 'overflow', 'visible');
        rbSetStyleImportant(block, 'overflow-y', 'visible');
        rbSetStyleImportant(block, 'margin-top', '0');
    }
    var settingsRegion = doc.getElementById('settingsRegion');
    if (settingsRegion) {
        rbSetStyleImportant(settingsRegion, 'height', 'auto');
        rbSetStyleImportant(settingsRegion, 'margin-top', '0');
        rbSetStyleImportant(settingsRegion, 'overflow', 'visible');
        rbSetStyleImportant(settingsRegion, 'overflow-y', 'visible');
    }
    var homeMenu = doc.getElementById('homeMenu');
    if (homeMenu) {
        rbSetStyleImportant(homeMenu, 'height', 'auto');
        rbSetStyleImportant(homeMenu, 'overflow', 'visible');
        rbSetStyleImportant(homeMenu, 'overflow-y', 'visible');
    }
    if (doc.body) {
        rbSetStyleImportant(doc.body, 'height', 'auto');
        rbSetStyleImportant(doc.body, 'min-height', '100%');
        rbSetStyleImportant(doc.body, 'overflow-x', 'hidden');
        rbSetStyleImportant(doc.body, 'overflow-y', 'auto');
    }
    if (doc.documentElement) {
        rbSetStyleImportant(doc.documentElement, 'height', 'auto');
        rbSetStyleImportant(doc.documentElement, 'min-height', '100%');
        rbSetStyleImportant(doc.documentElement, 'overflow-x', 'hidden');
        rbSetStyleImportant(doc.documentElement, 'overflow-y', 'auto');
    }
    rbApplyThemeBackground(doc);
    // Never force scroll-to-top when restoring after auto-save
    if (iframeInfo.preserveScroll || (iframeInfo.restoreScrollY != null && iframeInfo.restoreScrollY > 0)) {
        return;
    }
    try {
        var win = doc.defaultView;
        if (win) {
            win.scrollTo(0, 0);
        }
        if (doc.documentElement) {
            doc.documentElement.scrollTop = 0;
        }
        if (doc.body) {
            doc.body.scrollTop = 0;
        }
    } catch(e) {}
}

function rbScheduleLayoutFixes(doc) {
    rbFixSettingsLayout(doc);
    [100, 300, 800].forEach(function(delay) {
        setTimeout(function() {
            try {
                rbFixSettingsLayout(doc);
            } catch(e) {}
        }, delay);
    });
}

function rbCloseCustomSelects(doc) {
    var win = doc.defaultView;
    if (!win || !win.customSelects) {
        return;
    }
    for (var i = 0, len = win.customSelects.length; i < len; ++i) {
        try {
            win.customSelects[i].container.classList.remove('is-open');
            if (undefined!=win.customSelects[i].open) {
                win.customSelects[i].open = false;
            }
        } catch(e) {}
    }
}

function initBridgePluginPage(doc, pluginKey) {
    doc.mskBridgePluginKey = pluginKey;
    doc.documentElement.classList.add('msk-squeezebridge');
    if (doc.body) {
        doc.body.classList.add('msk-squeezebridge');
    }
    rbDisableSettingsResize(doc);
    rbApplyThemeBackground(doc);
    rbScheduleLayoutFixes(doc);
    rbCloseCustomSelects(doc);
    rbPrepareDeviceSelector(doc);
    hideRbInfoBanners(doc);
    wireBridgePluginForm(doc);
    setupBridgeVcredistNotice(doc);
    tryAutoGenerateConfig(doc);
}

function enhanceBridgePluginPage(doc) {
    var sel = doc.getElementById('seldevice');
    if (sel) {
        sel.mskRbSuppressChange = true;
    }
    try {
        applyRbDefaultPlaceholders(doc);
    } catch(e) {
        rbSafeLog(e);
    }
    var deviceMap = {};
    try {
        deviceMap = getRbDeviceMapFromTable(doc);
        doc.mskRbDeviceMap = deviceMap;
    } catch(e) {
        rbSafeLog(e);
    }
    try {
        wireRbPlayerTable(doc);
    } catch(e) {
        rbSafeLog(e);
    }
    try {
        enhanceRbDeviceSelector(doc, deviceMap);
    } catch(e) {
        rbSafeLog(e);
    }
    try {
        if (sel) {
            rbSyncDeviceSelectLabels(doc, sel);
            sel.mskRbLastValue = sel.value;
        }
        wireRbDeviceChangeHandler(doc);
        rbScrollToConfigIfNeeded(doc);
    } catch(e) {
        rbSafeLog(e);
    } finally {
        rbFixSettingsLayout(doc);
        rbCloseCustomSelects(doc);
        if (sel) {
            setTimeout(function() {
                sel.mskRbSuppressChange = false;
            }, 500);
        }
        updateBridgeVcredistVisibility(doc);
        finishBridgeConfigIfReady(doc);
        updateBridgeConfigDependentVisibility(doc);
        doc.mskBridgeGenReloading = false;
        iframeRunPendingAfterSave();
        if (iframeInfo.preserveScroll || iframeInfo.restoreScrollY != null) {
            iframeRestoreScroll(doc);
        }
        bus.$emit('iframe-loaded', true);
    }
}

var bridgeEnhanceTimers = {};

function scheduleBridgePluginEnhance(doc, pluginKey) {
    var win = doc.defaultView;
    var key = win ? ('bridge-' + pluginKey + '-' + win.location.pathname + win.location.search) : ('bridge-' + pluginKey);
    if (bridgeEnhanceTimers[key]) {
        clearTimeout(bridgeEnhanceTimers[key]);
    }
    bridgeEnhanceTimers[key] = setTimeout(function() {
        delete bridgeEnhanceTimers[key];
        try {
            enhanceBridgePluginPage(doc);
        } catch(e) {
            rbSafeLog(e);
            bus.$emit('iframe-loaded', true);
        }
    }, 50);
}

function getIframeDocPath(doc, src) {
    try {
        if (doc.defaultView && doc.defaultView.location && doc.defaultView.location.pathname) {
            return doc.defaultView.location.pathname + doc.defaultView.location.search;
        }
    } catch(e) {}
    return src || '';
}

function detectPluginSettingsKey(doc, pagePath) {
    var form = doc.getElementById('settingsForm');
    var formAction = form && form.action ? form.action : '';
    for (var pluginKey in PLUGIN_SETTINGS_CSS) {
        var marker = 'plugins/' + pluginKey + '/';
        if ((pagePath && pagePath.indexOf(marker) >= 0) ||
            (formAction && formAction.indexOf(marker) >= 0)) {
            return pluginKey;
        }
    }
    return undefined;
}

function applyPluginSettingsPatches(doc, src) {
    var pluginKey = detectPluginSettingsKey(doc, getIframeDocPath(doc, src));
    if (pluginKey) {
        addPluginSettingsCss(doc, pluginKey);
        if (isBridgePlugin(pluginKey)) {
            initBridgePluginPage(doc, pluginKey);
            scheduleBridgePluginEnhance(doc, pluginKey);
        }
    }
    // LMS built-in Presets Editor (player settings → Éditeur de présélections)
    try {
        enhancePresetsEditorPage(doc, src);
    } catch (ePe) {
        logError(ePe);
    }
}

/** LMS Slim::Plugin::PresetsEditor — settings/presets.html */
function isPresetsEditorPage(doc, src) {
    var path = getIframeDocPath(doc, src || '');
    if (path && /settings\/presets\.html/i.test(path)) {
        return true;
    }
    // Fallback: form fields unique to this page
    return !!(doc && doc.querySelector && (
        doc.querySelector('select.preset-picker') ||
        doc.querySelector('input[name^="preset_text_"]') ||
        doc.querySelector('input[id^="preset_text_"]')
    ));
}

function presetsEditorIsWiimPlayer() {
    try {
        if (typeof PlayerPrefsMenu !== 'undefined' && PlayerPrefsMenu.isWiimHeuristic && bus && bus.$store) {
            var meta = PlayerPrefsMenu.playerMeta(bus.$store);
            if (PlayerPrefsMenu.isWiimHeuristic(meta)) {
                return true;
            }
        }
    } catch (e) {}
    try {
        var p = bus && bus.$store && bus.$store.state && bus.$store.state.player;
        if (p) {
            var m = ((p.modelname || p.model || '') + ' ' + (p.name || ''));
            if (/wiim/i.test(m)) {
                return true;
            }
        }
    } catch (e2) {}
    return false;
}

function presetsEditorWiimUrl(num) {
    var base = '';
    try {
        if (typeof window !== 'undefined' && window.location && window.location.origin) {
            base = String(window.location.origin).replace(/\/$/, '');
        }
    } catch (e) {}
    var n = parseInt(num, 10) || 1;
    return base ? (base + '/preset/' + n) : ('/preset/' + n);
}

function presetsEditorCopyText(text, okMsg) {
    var done = function() {
        if (typeof bus !== 'undefined') {
            bus.$emit('showMessage', okMsg || (typeof i18n === 'function' ? i18n('Link copied') : 'Link copied'));
        }
    };
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done).catch(function() {
                presetsEditorCopyFallback(text, done);
            });
            return;
        }
    } catch (e) {}
    presetsEditorCopyFallback(text, done);
}

function presetsEditorCopyFallback(text, done) {
    try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;left:-9999px;top:0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        if (done) { done(); }
    } catch (e) {
        if (typeof bus !== 'undefined') {
            bus.$emit('showMessage', text);
        }
    }
}

/**
 * Classic LMS Presets Editor iframe → open native Material dialog instead.
 * (Styling the classic page is fragile; Material owns the full editor UI.)
 */
function enhancePresetsEditorPage(doc, src) {
    if (!doc || !isPresetsEditorPage(doc, src)) {
        return;
    }
    if (window._mskOpeningNativePresetsEditor) {
        return;
    }
    window._mskOpeningNativePresetsEditor = true;
    var playerId = '';
    var playerName = '';
    try {
        // iframe component stores playerId when opened from player settings
        var iframeComp = document.getElementById('iframe-page');
        // Prefer store player for extras; fall back to query on src
        if (bus && bus.$store && bus.$store.state && bus.$store.state.player) {
            playerId = bus.$store.state.player.id || '';
            playerName = bus.$store.state.player.name || '';
        }
        if (!playerId && src) {
            var m = String(src).match(/[?&]player=([^&]+)/i);
            if (m) {
                playerId = decodeURIComponent(m[1]);
            }
        }
        if (!playerId && iframeInfo && iframeInfo.content && iframeInfo.content.URL) {
            var m2 = String(iframeInfo.content.URL).match(/[?&]player=([^&]+)/i);
            if (m2) {
                playerId = decodeURIComponent(m2[1]);
            }
        }
    } catch (e) {}
    // Close classic iframe settings shell and open native editor
    setTimeout(function() {
        try {
            bus.$emit('closeDialog', 'iframe');
        } catch (e2) {}
        setTimeout(function() {
            bus.$emit('dlg.open', 'presetseditor', playerId, playerName);
            window._mskOpeningNativePresetsEditor = false;
        }, 80);
    }, 30);
}

function enhancePresetsEditorRow(doc, row, index, isWiim) {
    if (!row || row.classList.contains('msk-preset-row')) {
        return;
    }
    row.classList.add('msk-preset-row');

    // Index span → round pill
    var idxEl = row.querySelector('.table-index') || row.querySelector('span.table-cell');
    if (idxEl && /^\s*\d+\.?\s*$/.test(idxEl.textContent || '')) {
        var num = parseInt(String(idxEl.textContent).replace(/\D/g, ''), 10) || index;
        idxEl.classList.add('msk-preset-pill');
        idxEl.textContent = String(num);
        idxEl.setAttribute('aria-hidden', 'true');
    } else {
        // Insert pill at start
        var pill = doc.createElement('span');
        pill.className = 'msk-preset-pill table-cell';
        pill.textContent = String(index);
        row.insertBefore(pill, row.firstChild);
    }

    // Label inputs
    var textIn = row.querySelector('input[name^="preset_text_"], input[id^="preset_text_"]');
    var urlIn = row.querySelector('input[name^="preset_url_"], input[id^="preset_url_"]');
    if (textIn) {
        textIn.classList.add('msk-preset-text');
        textIn.setAttribute('placeholder', (typeof i18n === 'function') ? i18n('Name') : 'Name');
    }
    if (urlIn) {
        urlIn.classList.add('msk-preset-url');
        urlIn.setAttribute('placeholder', 'URL');
    }

    // Picker select
    var pick = row.querySelector('select.preset-picker, select[id^="preset_pick_"]');
    if (pick) {
        pick.classList.add('msk-preset-picker');
        // Wrap for custom arrow
        if (!pick.parentElement || !pick.parentElement.classList.contains('msk-preset-picker-wrap')) {
            var wrap = doc.createElement('div');
            wrap.className = 'msk-preset-picker-wrap table-cell';
            pick.parentNode.insertBefore(wrap, pick);
            wrap.appendChild(pick);
            var chev = doc.createElement('span');
            chev.className = 'msk-preset-picker-chevron';
            chev.setAttribute('aria-hidden', 'true');
            chev.textContent = '▾';
            wrap.appendChild(chev);
        }
    }

    // WiiM: copy LMS bridge URL for this preset number
    if (isWiim) {
        var copyBtn = doc.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'msk-preset-wiim-copy';
        copyBtn.title = (typeof i18n === 'function') ? i18n('Copy direct link') : 'Copy direct link';
        copyBtn.setAttribute('aria-label', copyBtn.title);
        copyBtn.innerHTML = '<span class="msk-preset-wiim-copy-ico">⧉</span>';
        copyBtn.addEventListener('click', function(ev) {
            try { ev.preventDefault(); } catch (e) {}
            try { ev.stopPropagation(); } catch (e2) {}
            presetsEditorCopyText(presetsEditorWiimUrl(index));
        });
        row.appendChild(copyBtn);
    }
}

function wirePresetsEditorPickers(doc) {
    if (doc._mskPresetsPickerWired) {
        return;
    }
    doc._mskPresetsPickerWired = true;
    var isMobile = !!(typeof IS_MOBILE !== 'undefined' && IS_MOBILE) ||
        (doc.documentElement && doc.documentElement.classList.contains('msk-is-touch'));

    // Mobile: open category drawer instead of native <select>
    if (!isMobile) {
        return;
    }
    var picks = doc.querySelectorAll('select.preset-picker, select.msk-preset-picker, select[id^="preset_pick_"]');
    for (var i = 0; i < picks.length; i++) {
        (function(sel) {
            sel.addEventListener('mousedown', function(ev) {
                try { ev.preventDefault(); } catch (e) {}
                openPresetsEditorDrawer(doc, sel);
            }, true);
            sel.addEventListener('touchstart', function(ev) {
                // Let click open drawer; prevent native picker flash on some browsers
                try { ev.preventDefault(); } catch (e) {}
                openPresetsEditorDrawer(doc, sel);
            }, { passive: false, capture: true });
        })(picks[i]);
    }
}

function openPresetsEditorDrawer(doc, selectEl) {
    if (!doc || !selectEl) {
        return;
    }
    closePresetsEditorDrawer(doc);
    var scrim = doc.createElement('div');
    scrim.className = 'msk-preset-drawer-scrim';
    var panel = doc.createElement('div');
    panel.className = 'msk-preset-drawer';
    panel.setAttribute('role', 'dialog');

    var head = doc.createElement('div');
    head.className = 'msk-preset-drawer-head';
    head.innerHTML = '<div class="msk-preset-drawer-handle"></div>' +
        '<div class="msk-preset-drawer-title">' +
        ((typeof i18n === 'function') ? i18n('Choose item') : 'Choose item') +
        '</div>';
    panel.appendChild(head);

    var list = doc.createElement('div');
    list.className = 'msk-preset-drawer-list';

    // Build from optgroups = clear categories
    var children = selectEl.children;
    for (var c = 0; c < children.length; c++) {
        var node = children[c];
        if (node.tagName === 'OPTGROUP') {
            var cat = doc.createElement('div');
            cat.className = 'msk-preset-drawer-cat';
            cat.textContent = node.label || '';
            list.appendChild(cat);
            var opts = node.getElementsByTagName('option');
            for (var o = 0; o < opts.length; o++) {
                list.appendChild(makePresetsDrawerItem(doc, selectEl, opts[o]));
            }
        } else if (node.tagName === 'OPTION') {
            if (!node.value) { continue; } // skip placeholder
            list.appendChild(makePresetsDrawerItem(doc, selectEl, node));
        }
    }
    panel.appendChild(list);

    var close = function() { closePresetsEditorDrawer(doc); };
    scrim.addEventListener('click', close);

    doc.body.appendChild(scrim);
    doc.body.appendChild(panel);
    doc._mskPresetDrawerScrim = scrim;
    doc._mskPresetDrawerPanel = panel;
    // animate
    requestAnimationFrame(function() {
        scrim.classList.add('open');
        panel.classList.add('open');
    });
}

function makePresetsDrawerItem(doc, selectEl, opt) {
    var btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'msk-preset-drawer-item';
    btn.textContent = opt.textContent || opt.label || opt.value;
    btn.addEventListener('click', function() {
        selectEl.value = opt.value;
        // Fire change so original pickPreset() runs
        try {
            var ev = doc.createEvent('HTMLEvents');
            ev.initEvent('change', true, false);
            selectEl.dispatchEvent(ev);
        } catch (e) {
            if (typeof selectEl.onchange === 'function') {
                selectEl.onchange();
            }
        }
        // Also call global pickPreset if present
        try {
            var win = doc.defaultView;
            var id = selectEl.id || '';
            var m = id.match(/preset_pick_(\d+)/);
            if (win && typeof win.pickPreset === 'function' && m) {
                win.pickPreset(parseInt(m[1], 10), selectEl);
            }
        } catch (e2) {}
        closePresetsEditorDrawer(doc);
    });
    return btn;
}

function closePresetsEditorDrawer(doc) {
    if (!doc) { return; }
    var scrim = doc._mskPresetDrawerScrim;
    var panel = doc._mskPresetDrawerPanel;
    doc._mskPresetDrawerScrim = null;
    doc._mskPresetDrawerPanel = null;
    if (panel) {
        panel.classList.remove('open');
    }
    if (scrim) {
        scrim.classList.remove('open');
    }
    setTimeout(function() {
        try {
            if (panel && panel.parentNode) { panel.parentNode.removeChild(panel); }
            if (scrim && scrim.parentNode) { scrim.parentNode.removeChild(scrim); }
        } catch (e) {}
    }, 220);
}

/* Some plugin settings pages (e.g. C3PO) use show() and Settings.Page.submit() to
 * switch tabs. The Default skin provides Settings, but Material does not. Also,
 * some plugins declare show() in a <head> outside the main <html> document, so
 * that function is never defined when loaded in Material's iframe. */
function submitSettingsForm(form) {
    var elems = form.querySelectorAll('[hidden]');
    for (var i = 0, len = elems.length; i < len; ++i) {
        var elem = elems[i];
        if (elem.name && 'INPUT'==elem.tagName) {
            elem.type = 'hidden';
            elem.removeAttribute('hidden');
        }
    }
    HTMLFormElement.prototype.submit.call(form);
}

function initPluginSettingsPage(doc) {
    var win = doc.defaultView;
    if (!win) {
        return;
    }
    var form = doc.getElementById('settingsForm');
    if (!form) {
        return;
    }

    function doSubmit(cb) {
        bus.$emit('iframe-loaded', false);
        submitSettingsForm(form);
        if (cb) {
            cb();
        }
    }

    if (!win.Settings) {
        win.Settings = {
            Page: {
                isModified: function() {
                    return iframeInfo.settingModified;
                },
                submit: doSubmit,
                resetModified: function() {
                    iframeInfo.settingModified = false;
                }
            },
            _confirmPageChange: function(cb) {
                if (!iframeInfo.settingModified && !iframeInfo.autoSaveTimer) {
                    if (cb) {
                        cb('no');
                    }
                    return;
                }
                iframeCancelAutoSaveTimer();
                iframeInfo.pendingAfterSave = function() {
                    if (cb) {
                        cb('yes');
                    }
                };
                if (iframeInfo.settingModified) {
                    iframeAutoSaveSettings(doc, true);
                } else {
                    iframeRunPendingAfterSave();
                }
            },
            _resetModified: function() {
                iframeInfo.settingModified = false;
            }
        };
    }

    function show1(what) {
        var panel = doc.getElementById('panel');
        if (!panel) {
            return false;
        }
        panel.value = what;
        var id = what+'Button';
        var list = doc.getElementsByClassName('stdclick');
        for (var i = 0, len = list.length; i < len; ++i) {
            list[i].style.background = '';
            list[i].style.color = '';
        }
        var btn = doc.getElementById(id);
        if (btn) {
            btn.style.background = 'darkgrey';
            btn.style.color = 'black';
        }
        try {
            win.Settings.Page.submit();
        } catch(e) {
            return false;
        }
        return true;
    }

    function show(what) {
        var modified = false;
        try {
            modified = win.Settings.Page.isModified();
        } catch(e) {}
        if (!modified) {
            return show1(what);
        }
        return win.Settings._confirmPageChange(function(btn) {
            if (btn == 'no' || btn == 'yes') {
                if (btn == 'yes') {
                    return show1(what);
                }
                win.Settings._resetModified();
                if (btn == 'no') {
                    return show1(what);
                }
            }
        });
    }

    win.show = show;
    win.show1 = show1;

    var buttons = doc.querySelectorAll('.buttons input[type="button"], input[type="button"][onclick*="show("]');
    for (var b = 0, blen = buttons.length; b < blen; ++b) {
        var button = buttons[b];
        var onclick = button.getAttribute('onclick');
        if (!onclick || onclick.indexOf('show(')<0) {
            continue;
        }
        var match = onclick.match(/show\(\s*['"]([^'"]+)['"]\s*\)/);
        if (!match) {
            continue;
        }
        var panelId = match[1];
        button.removeAttribute('onclick');
        if (button.mskPanelWired) {
            continue;
        }
        button.mskPanelWired = true;
        button.addEventListener('click', function(pid) {
            return function(ev) {
                ev.preventDefault();
                ev.stopPropagation();
                show(pid);
            };
        }(panelId));
    }
}

function applyModifications(page, svgCol, darkUi, src) {
    if (!page) {
        bus.$emit('iframe-loaded', true);
        return;
    }
    var iframe = document.getElementById("embeddedIframe");
    var copiedVars = false;
    try {
    if (iframe && iframe.contentDocument) {
        iframe.contentDocument.bus = bus;
        var content = iframe.contentDocument;
        iframeInfo.content = content;
        if (undefined==content) {
            bus.$emit('iframe-loaded', true);
            return;
        }
        iframeInfo.src = getIframeDocPath(content, src);

        // Hide classic section chooser FIRST — before any code that can throw
        if ('server'==page || 'player'==page) {
            iframeScheduleHideClassicChooser(content);
        }

        if (LMS_PAGES.has(page)) {
            copiedVars = copyVars(iframe);
            let bodyEl = content.body || (content.documentElement && content.documentElement.getElementsByTagName("body")[0]);
            if (bodyEl) {
                bodyEl.classList.add(IS_MOBILE ? "msk-is-touch" : "msk-is-non-touch");
                if (darkUi) {
                    bodyEl.classList.add("theme--dark");
                }
            }
            // Real paint color after CSS vars are copied (prevents white iframe flash)
            iframeApplyThemeBackground(content);
            fixClassicSkinRefs(content);
            remapClassicSkinIcons(content, svgCol);
            addHooks(content);
        }
        iframeInfo.settingModified = false;
        iframeInfo.settingsPage = undefined;
        iframeInfo.settingsSelector = undefined;
        initPluginSettingsPage(content);
        applyPluginSettingsPatches(content, src);
        // Mobile 100vh fix for extras/other plugin pages as well as LMS docs
        if ('lms'==page || 'extras'==page || 'other'==page) {
            var vh = window.innerHeight * 0.01;
            content.documentElement.style.setProperty('--vh', `${vh}px`);
        }
        if ('server'==page || 'player'==page || 'lms'==page) {
            iframeInfo.settingsSelector = content.getElementById("choose_setting");
            if (undefined!=iframeInfo.settingsSelector) {
                iframeInfo.settingsPage = iframeInfo.settingsSelector.value;
                iframeInfo.settingsDoChange = iframeInfo.settingsSelector.onchange;
                iframeInfo.settingsSelector.onchange = settingsSectionChangedReq;
                if ('server'==page || 'player'==page) {
                    iframeInfo.settingsSelector.addEventListener("change", settingsSectionChanged);
                }
                var sectionVal = iframeInfo.settingsSelector.value;
                if ('server'==page || 'player'==page) {
                    settingsSectionChanged(sectionVal);
                }
                content.documentElement.classList.add("lms-settings-section-"+sectionVal+(LMS_VERSION<90000 || sectionVal!="SETUP_PLUGINS" ? "" : "_9"));
                if (LMS_VERSION>=90100) {
                    content.documentElement.classList.add("lms-91p");
                }
                if (isBridgePlugin(detectPluginSettingsKey(content, getIframeDocPath(content, src)))) {
                    rbFixSettingsLayout(content);
                }
                // Material section nav (sidebar / mobile picker) — hybrid shell
                if ('server'==page || 'player'==page) {
                    iframeScheduleHideClassicChooser(content);
                    iframeSyncMaterialSettingsNav();
                }
            } else if ('server'==page || 'player'==page) {
                // Keep last known section list when a sub-page (e.g. a plugin settings
                // URL) has no #choose_setting — otherwise the Material sidebar vanishes.
                iframeScheduleHideClassicChooser(content);
                let cached = iframeLoadCachedServerSettingsNav();
                if (cached && cached.length>0) {
                    bus.$emit('iframe-settings-nav', {
                        groups: cached,
                        active: iframeInfo.settingsPage || ''
                    });
                }
                // Do NOT clear groups to [] here.
            }
            if ('server'==page || 'player'==page) {
                if (content.addEventListener) {
                    content.addEventListener('click', lmsClickHandler);
                } else if (content.attachEvent) {
                    content.attachEvent('onclick', lmsClickHandler);
                }
            }
        }

        if (content && ('other'==page || 'extras'==page || 'lms'==page)) {
            if (content.addEventListener) {
                content.addEventListener('click', otherClickHandler);
            } else if (content.attachEvent) {
                content.attachEvent('onclick', otherClickHandler);
            }
            if (content.getElementById('settingsForm')) {
                initChangeListeners(content.documentElement);
                if (!detectPluginSettingsKey(content, getIframeDocPath(content, src))) {
                    settingsSectionChanged();
                }
            }
        }

        if ('dserver'==page || 'dlserver'==page) {
            let cancelBtn = content.getElementById('dlserver'==page ? "ext-gen50" : "cancel");
            if (cancelBtn!=undefined) {
                cancelBtn.onclick = function() {
                    bus.$emit('iframe-close');
                };
            }

            addDefaultSkinCss(document, iframe);
            let elems = content.documentElement.getElementsByTagName("iframe");
            if (undefined!=elems && elems.length>0) {
                for (let e=0, len=elems.length; e<len ; ++e) {
                    addDefaultSkinCss(elems[e].contentDocument, elems[e]);
                    elems[e].onload = function() {
                        addDefaultSkinCss(elems[e].contentDocument, elems[e]);
                    };
                }
            }
        } else if ('player'==page || 'server'==page) {
            initChangeListeners(content.documentElement);
            // Set --vh as this is used to fix size of main settings frame, so that we can
            // correctly set its position, etc, to be consistent between mobile and desktop.
            // Previously desktop had a big padding above view selector.

            // Work-around 100vh behaviour in mobile chrome
            // See https://css-tricks.com/the-trick-to-viewport-units-on-mobile/
            let vh = window.innerHeight * 0.01;
            content.documentElement.style.setProperty('--vh', `${vh}px`);
            if (iframeInfo.settingsSelector && iframeInfo.settingsSelector.value=='INTERFACE_SETTINGS') {
                let elems = getElementsByClassName(content, "div", "settingSection");
                if (undefined!=elems && elems.length>0) {
                    let element = content.createElement("div");
                    element.innerHTML="<div style=\"padding-top:16px\"><i>"+i18n("NOTE: Only some of these settings apply to 'Material Skin'. However these settings will affect other skins and hardware players.")+"</i></div><hr class=\"main-sep\"/>";
                    elems[0].parentNode.insertBefore(element, elems[0]);
                }
            }
            content.documentElement.classList.add("lms-settings-"+page);
            // Look for any status message that needs to be shown in a toast or dialog (if there is an action)
            var statusarea = content.getElementById('statusarea');
            if (undefined!=statusarea) {
                var rescanWarning = content.getElementById('rescanWarning');
                var restartWarning = content.getElementById('restartWarning');
                var elem = undefined!=rescanWarning
                             ? rescanWarning
                             : undefined!=restartWarning
                                 ? restartWarning
                                 : undefined!=content.querySelector('[name="checkForUpdateNow"]') // Handle new LMS version...
                                   ? statusarea
                                   : undefined;
                if (undefined!=elem) {
                    var parts = elem.innerHTML.split("<a");
                    if (parts.length>1) {
                        var href = undefined!=elem.firstElementChild ? elem.firstElementChild.href : undefined;
                        if (undefined!=href) {
                            var msg = parts[0];
                            var doBtn = undefined;
                            if (undefined==msg || msg.trim().length<2) {
                                msg = undefined!=elem.firstElementChild ? elem.firstElementChild.innerHTML : undefined;
                            }
                            if (undefined!=msg) {
                                var dotPos = msg.lastIndexOf('. ');
                                if (dotPos>10) {
                                    msg = msg.substring(0, dotPos+1);
                                }
                                doBtn = undefined!=rescanWarning ? i18n("Rescan") : undefined!=restartWarning ? i18n("Restart") : i18n("Download");
                                if (undefined!=doBtn) {
                                    confirm(msg, doBtn).then(res => {
                                        if (res) {
                                            if (restartWarning) {
                                                lmsCommand("", ["restartserver"]).then(({}) => {
                                                    bus.$emit('showMessage', i18n('Server is being restarted.'));
                                                }).catch(err => {
                                                    bus.$emit('showMessage', i18n('Server is being restarted.'));
                                                });
                                            } else if (href.startsWith("https://") || (href.startsWith("http://") && !href.startsWith('http://'+window.location.hostname+':'+window.location.port+'/'))) {
                                                openWindow(href);
                                            } else {
                                                bus.$emit('iframe-href', href, false);
                                            }
                                        }
                                    });
                                    bus.$emit('iframe-loaded', true);
                                    return;
                                }
                            }
                        }
                    }
                }

                // Show statusarea messages in a toast, if different to any popupWarning (which will have been shown in an alert)
                var msg = statusarea.innerText;
                if (msg!=undefined) {
                    msg = msg.trim();

                    var popupWarning = iframeInfo.content.getElementById('popupWarning');
                    var popupMsg = undefined;
                    if (undefined!=popupWarning) {
                        popupMsg = popupWarning.innerHTML.replace(/<br\/?>/ig, ' \n').trim();
                    }

                    if (msg.length>0 && popupMsg!=msg) {
                        if (iframeIsQuietSaveMessage(msg)) {
                            iframeInfo.quietSavePending = false;
                            iframeFlashSaveOk();
                        } else {
                            // Real status (rescan, error, etc.) — still toast; clear pending save flag
                            if (iframeInfo.quietSavePending) {
                                iframeInfo.quietSavePending = false;
                                iframeFlashSaveOk();
                            }
                            bus.$emit('showMessage', msg);
                        }
                    } else if (iframeInfo.quietSavePending) {
                        iframeInfo.quietSavePending = false;
                        iframeFlashSaveOk();
                    }
                } else if (iframeInfo.quietSavePending) {
                    iframeInfo.quietSavePending = false;
                    iframeFlashSaveOk();
                }
            } else if (iframeInfo.quietSavePending) {
                iframeInfo.quietSavePending = false;
                iframeFlashSaveOk();
            }
        }
    }
    } catch(e) {
        logError(e);
    }
    var auxPluginKey = iframeInfo.content
                         ? detectBridgeAuxiliaryKey(getIframeDocPath(iframeInfo.content, iframeInfo.src))
                         : undefined;
    if (auxPluginKey) {
        initBridgeAuxiliaryPage(iframeInfo.content, auxPluginKey, darkUi, iframe);
        bus.$emit('iframe-loaded', true);
        return;
    }
    iframeRunPendingAfterSave();
    // After auto-save reload, put the user back where they were scrolling
    if (iframeInfo.content && (iframeInfo.quietSavePending || iframeInfo.restoreScrollY != null)) {
        iframeRestoreScroll(iframeInfo.content);
    }
    var deferIframeLoaded = iframeInfo.content && isBridgePlugin(detectPluginSettingsKey(iframeInfo.content, iframeInfo.src));
    if (!deferIframeLoaded) {
        if (copiedVars && iframeInfo.initialLoad) {
            setTimeout(function() { bus.$emit('iframe-loaded', true); }, 250);
        } else {
            bus.$emit('iframe-loaded', true);
        }
    }
}

Vue.component('lms-iframe-dialog', {
    template: `
<div id="iframe-page">
 <v-dialog v-model="show" v-if="show" persistent no-click-animation fullscreen>
  <v-card class="iframe-settings-card" v-bind:class="{'def-server':'dserver'==page && !needActionsMenu, 'dark-logic':'dlserver'==page && !needActionsMenu}">
   <v-card-title class="settings-title iframe-settings-title" v-bind:class="{'iframe-settings-title-with-sec': showSettingsSecHeader}">
    <v-toolbar app-data class="dialog-toolbar" @mousedown="mouseDown" id="iframe-toolbar">
     <lms-windowcontrols v-if="queryParams.nativeTitlebar && queryParams.tbarBtnsPos=='l'"></lms-windowcontrols>
     <div class="drag-area-left"></div>
     <v-btn v-if="IS_IOS" flat icon @click="goBack(false)" :title="ttShortcutStr(i18n('Go back'), 'esc')"><v-icon>{{BACK_ICON}}</v-icon></v-btn>
     <v-btn v-else flat icon v-longpress:stop="goBack" :title="ttShortcutStr(i18n('Go back'), 'esc')"><v-icon>{{BACK_ICON}}</v-icon></v-btn>
     <v-btn v-if="showHome && homeButton" flat icon @click="goHome" :title="ttShortcutStr(i18n('Go home'), 'home')"><v-icon>home</v-icon></v-btn>
     <v-toolbar-title v-if="playerId && numPlayers>1 && (page=='player' || page=='extras')" @click="openChoiceMenu" class="pointer">{{title}} <v-icon>arrow_drop_down</v-icon></v-toolbar-title>
     <v-toolbar-title v-else>{{title}}</v-toolbar-title>
     <v-icon v-if="saveOk" class="settings-save-ok" :title="i18n('Saved')">check</v-icon>
     <v-spacer class="drag-area"></v-spacer>
     <!-- Always show ⋮ for settings with a section rail (group toggle); also when extra actions exist -->
     <v-menu bottom left v-model="showMenu" v-if="needActionsMenu || (showSettingsNav && nativePlugins)" content-class="manage-plugins-menu-content">
      <v-btn icon slot="activator" :title="i18n('Menu')"><v-icon>more_vert</v-icon></v-btn>
      <v-list>
       <!-- Plugins only: category headers vs alphabetical list (not the whole settings rail) -->
       <v-list-tile role="menuitem" v-if="nativePlugins" @click="setPluginListSort('category')">
        <v-list-tile-avatar><v-icon>{{pluginSortMode==='category' ? 'radio_button_checked' : 'radio_button_unchecked'}}</v-icon></v-list-tile-avatar>
        <v-list-tile-content>
         <v-list-tile-title>{{i18n('Group by category')}}</v-list-tile-title>
         <v-list-tile-sub-title>{{i18n('Plugins organized by plugin category')}}</v-list-tile-sub-title>
        </v-list-tile-content>
       </v-list-tile>
       <v-list-tile role="menuitem" v-if="nativePlugins" @click="setPluginListSort('name')">
        <v-list-tile-avatar><v-icon>{{pluginSortMode==='name' ? 'radio_button_checked' : 'radio_button_unchecked'}}</v-icon></v-list-tile-avatar>
        <v-list-tile-content>
         <v-list-tile-title>{{i18n('Alphabetical')}}</v-list-tile-title>
         <v-list-tile-sub-title>{{i18n('Plugins sorted A–Z')}}</v-list-tile-sub-title>
        </v-list-tile-content>
       </v-list-tile>
       <v-divider v-if="nativePlugins && (haveCustomActions || (actions && actions.length))"></v-divider>
       <template v-for="(item, index) in actions">
        <v-divider v-if="item===DIVIDER"></v-divider>
        <v-list-tile role="menuitem" v-else @click="doAction(item, $event)">
         <v-list-tile-avatar><v-icon v-if="item.icon">{{item.icon}}</v-icon></v-list-tile-avatar>
         <v-list-tile-content><v-list-tile-title>{{item.title}}</v-list-tile-title></v-list-tile-content>
        </v-list-tile>
       </template>
       <v-divider v-if="haveCustomActions"></v-divider>
       <template v-for="(action, index) in customActions" v-if="haveCustomActions">
        <v-list-tile role="menuitem" @click="doCustomAction(action, player)">
         <v-list-tile-avatar><v-icon v-if="action.icon">{{action.icon}}</v-icon><img v-else-if="action.svg" class="svg-img" :src="action.svg | svgIcon(darkUi)"></img></v-list-tile-avatar>
         <v-list-tile-content><v-list-tile-title>{{action.title}}</v-list-tile-title></v-list-tile-content>
        </v-list-tile>
       </template>
      </v-list>
     </v-menu>
     <template v-else v-for="(item, index) in actions">
      <v-btn icon v-if="item!=DIVIDER" @click="doAction(item, $event)" :title="item.title"><v-icon v-if="item.icon">{{item.icon}}</v-icon><img v-else-if="item.svg" class="svg-img" :src="item.svg | svgIcon(darkUi)"></img></v-btn>
     </template>
     <div class="drag-area-right"></div>
     <lms-windowcontrols v-if="queryParams.nativeTitlebar && queryParams.tbarBtnsPos=='r'"></lms-windowcontrols>
    </v-toolbar>
    <!-- Mobile / narrow: section picker trigger only (list is portaled outside the dialog) -->
    <div v-if="showSettingsSecHeader" class="settings-section-subheader noselect">
     <button type="button" class="settings-section-subheader-btn" :class="{'settings-section-subheader-btn-open': settingsNavMenu}"
      @click.stop="toggleSettingsNavMenu" :title="i18n('Section')" :aria-expanded="settingsNavMenu ? 'true' : 'false'">
      <span class="settings-section-subheader-label ellipsis">{{settingsActiveLabel}}</span>
      <v-icon class="settings-section-subheader-chevron">{{settingsNavMenu ? 'expand_less' : 'expand_more'}}</v-icon>
     </button>
    </div>
   </v-card-title>
   <!-- Body is a card sibling (like manage-plugins), NOT v-card-text — Vuetify
        scrollable card-text collapses the rail into a "blob of links" and starves the iframe. -->
   <div class="iframe-settings-body embedded-page" v-bind:class="{'iframe-settings-body-with-nav': showSettingsNav && settingsNavWide, 'embedded-page-with-nav': showSettingsNav && settingsNavWide, 'iframe-settings-body-with-sec': showSettingsSecHeader}">
    <!-- Match manage-plugins sidebar structure + classes for consistent rail formatting -->
    <aside v-if="showSettingsNav && settingsNavWide" class="manage-plugins-sidebar settings-section-nav noselect" aria-label="Settings sections">
     <!-- No static “Server/Serveur” header — LMS optgroups (Paramètres / Plugins) are the section titles -->
     <div class="manage-plugins-sidebar-section settings-section-nav-body">
      <template v-for="(group, gidx) in settingsSectionGroupsView">
       <div v-if="group.label" class="manage-plugins-sidebar-group settings-section-group-title" :key="'sg-'+gidx">{{group.label}}</div>
       <button type="button" class="manage-plugins-sidebar-item"
        v-for="(item, iidx) in group.items" :key="'s-'+item.value"
        v-bind:class="{'active': item.value==settingsActive}"
        @click="selectSettingsSection(item.value)">{{item.text}}</button>
      </template>
     </div>
    </aside>
    <div class="embedded-iframe-wrap" v-show="!nativePlugins" v-bind:class="{'embedded-iframe-wrap-nav': showSettingsNav && settingsNavWide}">
     <div v-if="showLoading && !nativePlugins" class="iframe-loading">{{i18n('Loading...')}}</div>
     <iframe id="embeddedIframe" v-on:load="onIframeLoad" :src="src" frameborder="0" width="100%" height="100%"
      style="position:absolute;top:0;left:0;width:100%;height:100%;min-width:100%;min-height:100%;border:0;margin:0;padding:0;display:block;background:var(--background-color)"
      v-bind:class="{'iframe-text':'other'==page,'transparent':showLoading && !nativePlugins}"></iframe>
    </div>
    <!-- Native plugin manager uses the SAME settings section sidebar as content pages -->
    <div v-if="nativePlugins" class="embedded-native-plugins-wrap" v-bind:class="{'embedded-native-plugins-wrap-nav': showSettingsNav && settingsNavWide}">
     <lms-manage-plugins :embedded="true"></lms-manage-plugins>
    </div>
   </div>
  </v-card>
 </v-dialog>
 <v-menu v-model="choiceMenu.show" :position-x="choiceMenu.x" :position-y="10" style="z-index:1000">
  <v-list>
   <template v-for="(player, index) in players">
    <v-list-tile role="menuitem" @click="setPlayer(player)" :disabled="player.id==playerId" v-bind:class="{'active-player':player.id==playerId}">
     <v-list-tile-avatar>
      <v-icon v-if="player.icon.icon">{{player.icon.icon}}</v-icon><img v-else class="svg-img" :src="player.icon.svg | svgIcon(darkUi)"></img>
     </v-list-tile-avatar>
     <v-list-tile-content><v-list-tile-title>{{player.name}}</v-list-tile-title></v-list-tile-content>
    </v-list-tile>
   </template>
  </v-list>
 </v-menu>
 <!--
  Section list is OUTSIDE the fullscreen dialog/card so it is not:
  - clipped by .iframe-settings-card { overflow:hidden }
  - painted under the settings iframe
  - affected by Vuetify dialog transform (breaks position:fixed)
 -->
 <div v-if="show && showSettingsSecHeader && settingsNavMenu" class="msk-settings-section-sheet" @keydown.esc.stop.prevent="settingsNavMenu=false">
  <div class="msk-settings-section-sheet-scrim" @click.stop="settingsNavMenu=false"></div>
  <div class="msk-settings-section-sheet-panel" role="menu" :aria-label="i18n('Section')">
   <div class="msk-settings-section-sheet-head">
    <span class="msk-settings-section-sheet-title">{{i18n('Section')}}</span>
    <button type="button" class="msk-settings-section-sheet-close" @click.stop="settingsNavMenu=false" :aria-label="i18n('Close')">
     <v-icon small>close</v-icon>
    </button>
   </div>
   <div class="msk-settings-section-sheet-list">
    <template v-for="(group, gidx) in settingsSectionGroupsView">
     <div v-if="group.label" class="msk-settings-section-sheet-group settings-section-group-title" :key="'sgh-'+gidx">{{group.label}}</div>
     <button type="button" class="msk-settings-section-sheet-item" role="menuitem"
      v-for="(item, iidx) in group.items" :key="'si-'+item.value"
      v-bind:class="{'active': item.value==settingsActive}"
      @click.stop="selectSettingsSection(item.value)">
      <span class="ellipsis">{{item.text}}</span>
      <v-icon v-if="item.value==settingsActive" small class="msk-settings-section-sheet-check">check</v-icon>
     </button>
    </template>
   </div>
  </div>
 </div>
</div>
`,
    data() {
        return {
            show: false,
            showMenu: false,
            choiceMenu: {show:false, x:0},
            title: undefined,
            src: undefined,
            page: undefined,
            loaded:false,
            prompting:false,
            actions: [],
            customActions: [],
            history: [],
            showHome:0,
            svgCol: undefined,
            playerId: undefined,
            settingsSectionGroups: [],
            settingsActive: '',
            settingsNavMenu: false,
            /** Plugins list only: 'category' (headers) or 'name' (A–Z flat) */
            pluginSortMode: (function() {
                let m = getLocalStorageVal('pluginSortMode', 'category') || 'category';
                return (m === 'name') ? 'name' : 'category';
            })(),
            windowWidth: window.innerWidth || 0,
            saveOk: false,
            nativePlugins: false
        }
    },
    created() {
        // Register open listener early (before mounted) so first dlg.open on mobile
        // does not race and leave an empty shell with no src.
        this._onIframeOpen = function(page, title, actions, showHome, playerId, isLmsPage, initialSection) {
            this.openIframe(page, title, actions, showHome, playerId, isLmsPage, initialSection);
        }.bind(this);
        bus.$on('iframe.open', this._onIframeOpen);
        // Drain any pending open stashed by dlg.open before this component mounted
        try {
            let p = window.mskIframePendingOpen;
            if (p && p.page) {
                this.$nextTick(function() {
                    if (window.mskIframePendingOpen && window.mskIframePendingOpen.page) {
                        let q = window.mskIframePendingOpen;
                        this.openIframe(q.page, q.title, q.actions, q.showHome, q.playerId, q.isLmsPage, q.initialSection);
                    }
                }.bind(this));
            }
        } catch (e) {}
    },
    mounted() {
        // Second chance: if created nextTick lost the race, consume pending now
        try {
            if (window.mskIframePendingOpen && window.mskIframePendingOpen.page && !this.show) {
                let q = window.mskIframePendingOpen;
                this.openIframe(q.page, q.title, q.actions, q.showHome, q.playerId, q.isLmsPage, q.initialSection);
            }
        } catch (e) {}
        bus.$on('settingsSaved', function() {
            this.flashSaveOk();
        }.bind(this));
        bus.$on('iframe-native-plugins', function(on, serverName) {
            if (!this.show && on) {
                // Shell not mounted yet — openServerSettings is expected to follow/precede
                return;
            }
            this.nativePlugins = !!on;
            if (on) {
                // Sync radio state with manage-plugins sort preference
                let m = getLocalStorageVal('pluginSortMode', 'category') || 'category';
                this.pluginSortMode = (m === 'name') ? 'name' : 'category';
                this.settingsActive = 'SETUP_PLUGINS';
                this.settingsNavMenu = false;
                this.loaded = true;
                bus.$emit('manageplugins.open', serverName);
            } else {
                bus.$emit('closeDialog', 'manageplugins');
            }
        }.bind(this));
        bus.$on('iframe-loaded', function(val, settingsPage) {
            this.loaded = val;
            iframeInfo.initialLoad = false;
            if (val) {
                this.stopLoadTimer();
            } else {
                this.startLoadTimer(settingsPage);
            }
        }.bind(this));
        bus.$on('iframe-prompting', function(val) {
            this.prompting = val;
        }.bind(this));
        bus.$on('iframe-href', function(ref, addToHistory, clearHistoryOf, urlToAdd) {
            if (ref.startsWith("javascript:")) {
                return;
            }
            if (ref.startsWith("https://") || (ref.startsWith("http://") && !ref.startsWith('http://'+window.location.hostname+':'+window.location.port+'/'))) {
                return;
            }
            if (undefined!=clearHistoryOf) {
                for (let idx=this.history.length-1; idx>=0; --idx) {
                    if (!this.history[idx].startsWith(clearHistoryOf) && !("/"+this.history[idx]).startsWith(clearHistoryOf)) {
                        break;
                    }
                    this.history.pop();
                }
            } else if (undefined==addToHistory || addToHistory) {
                this.history.push(undefined==urlToAdd ? this.src : urlToAdd);
            }
            this.src = ref;
        }.bind(this));
        bus.$on('iframe-close', function(forceClose) {
            this.close(!!forceClose);
        }.bind(this));
        // PM closed → ensure settings shell is visible and section highlighted
        bus.$on('iframe-bring-to-front', function(section) {
            if (!this.show) {
                this.show = true;
            }
            if (section) {
                this.settingsActive = section;
            }
            // Refresh width so rail vs toolbar picker is correct
            this.windowWidth = window.innerWidth || 0;
        }.bind(this));
        bus.$on('noPlayers', function() {
            this.close();
        }.bind(this));
        bus.$on('closeDialog', function(dlg) {
            if (dlg == 'iframe') {
                this.close();
            }
        }.bind(this));
        bus.$on('windowHeightChanged', function() {
            if (this.show && undefined!=iframeInfo.content) {
                let vh = window.innerHeight * 0.01;
                iframeInfo.content.documentElement.style.setProperty('--vh', `${vh}px`);
            }
        }.bind(this));
        bus.$on('colorChanged', function() {
            if (this.show && LMS_PAGES.has(this.page)) {
                copyVars(document.getElementById("embeddedIframe"));
            }
        }.bind(this));
        bus.$on('iframe-settings-nav', function(payload) {
            // Refresh width when sections arrive so sidebar/dropdown mode is correct
            this.windowWidth = window.innerWidth || 0;
            if (!payload) {
                return;
            }
            // Never wipe a good rail with an empty parse (transient sub-pages).
            if (payload.groups && payload.groups.length>0) {
                this.settingsSectionGroups = payload.groups;
            }
            if (payload.active) {
                this.settingsActive = payload.active;
            }
        }.bind(this));
        bus.$on('iframe-settings-active', function(active) {
            if (undefined!=active) {
                this.settingsActive = active;
            }
        }.bind(this));
        bus.$on('windowWidthChanged', function() {
            this.windowWidth = window.innerWidth || 0;
        }.bind(this));
    },
    methods: {
        openIframe(page, title, actions, showHome, playerId, isLmsPage, initialSection) {
            try { window.mskIframePendingOpen = null; } catch (e) {}
            if (!page) {
                return;
            }
            // Preserve pending section across init when re-entering from plugin manager
            let pendingSection = initialSection || iframeInfo.pendingSettingsSection;
            let wantNativePlugins = !!(iframeInfo.pendingNativePlugins || (pendingSection=='SETUP_PLUGINS' && lmsOptions.nativeManagePlugins));
            iframeInitInfo();
            if (pendingSection) {
                iframeInfo.pendingSettingsSection = pendingSection;
            }
            iframeInfo.pendingNativePlugins = false;
            this.nativePlugins = false;
            // Prefill section rail from cache / last in-memory groups so sidebar paints
            // on first open (before the iframe finishes loading / parsing #choose_setting).
            let cachedNav = iframeLoadCachedServerSettingsNav();
            if (cachedNav && cachedNav.length) {
                this.settingsSectionGroups = cachedNav;
            } else if (!this.settingsSectionGroups || !this.settingsSectionGroups.length) {
                this.settingsSectionGroups = [];
            }
            this.settingsActive = pendingSection || (this.settingsSectionGroups.length ? 'BASIC_SERVER_SETTINGS' : '');
            this.settingsNavMenu = false;
            this.windowWidth = window.innerWidth || 0;
            this.title = title;
            // Delay setting URL for 50ms - otherwise get two requests, first is cancelled...
            // ...no idea why!
            if (lmsOptions.useDefaultForSettings==1 && window.innerWidth>=MIN_DEF_SETTINGS_WIDTH && page.indexOf("server/basic.html")>0) {
                page = page.replace("material/settings/server/basic.html", (LMS_DARK_LOGIC==1 && this.$store.state.darkUi ? "DarkLogic" : "Default")+"/settings/index.html");
                if (this.$store.state.player) {
                    page+="?player="+this.$store.state.player.id;
                }
            }
            // Extras: LMS plugins pages with player= (absolute /plugins/… or relative plugins/…)
            // Also treat bare root plugin HTML (e.g. switchserver.html?player=) as extras/other
            let isExtrasPage = (page.indexOf("plugins/")>=0 || page.indexOf("/plugins/")>=0) &&
                (page.indexOf("?player=")>0 || page.indexOf("&player=")>0 || page.indexOf("?player=")==0) &&
                page.indexOf("plugins/Extensions/settings/basic.html")<0;
            // player= can be first query param at index of "?player=" which is never 0 for full paths
            isExtrasPage = isExtrasPage || (
                (page.indexOf("plugins/")>=0 || page.indexOf("/plugins/")>=0) &&
                page.indexOf("player=")>=0 &&
                page.indexOf("plugins/Extensions/settings/basic.html")<0
            );
            this.page = page.indexOf("player/basic.html")>0
                            ? "player"
                            : page.indexOf("server/basic.html")>0 || page.indexOf("plugins/Extensions/settings/basic.html")>0
                                ? "server"
                                : page.indexOf("Default/settings/index.html")>0
                                    ? "dserver"
                                    : page.indexOf("DarkLogic/settings/index.html")>0
                                        ? "dlserver"
                                        : isExtrasPage
                                            ? "extras"
                                            : page == '/material/html/docs/index.html' || page.startsWith('/material/') || isLmsPage
                                                ? "lms" // tech info, or 'extra' entry
                                                : "other";
            // Bootstrap Material section rail ASAP when cache is cold
            if (('server'==this.page || 'player'==this.page) && this.settingsSectionGroups.length<1) {
                iframeBootstrapServerSettingsNav(function(groups) {
                    if (!this.show || !groups || groups.length<1) {
                        return;
                    }
                    if (!this.settingsSectionGroups || this.settingsSectionGroups.length<1) {
                        this.settingsSectionGroups = groups;
                    }
                }.bind(this));
            }
            this.show = true;
            this.showMenu = false;
            this.choiceMenu = {show:false, x:0};
            this.loaded = false;
            this.startLoadTimer(page.indexOf("plugins/Extensions/settings/basic.html")>=0 ? "SETUP_PLUGINS" : undefined);
            this.actions = undefined==actions ? [] : actions;
            this.customActions = getCustomActions(( "dserver"==this.page || "dlserver"==this.page ? "server" : this.page)+"-dialog", this.$store.state.unlockAll);
            this.history = [];
            this.showHome = showHome;
            this.svgCol = this.darkUi ? LMS_DARK_SVG : LMS_LIGHT_SVG;
            this.playerId = playerId;
            if (undefined==this.playerId && ('extras'==this.page || 'other'==this.page)) {
                let m = String(page).match(/[?&]player=([^&]+)/i);
                if (m && m[1]) {
                    try { this.playerId = decodeURIComponent(m[1]); } catch (e) { this.playerId = m[1]; }
                }
            }
            // Native plugins panel inside this shell
            if (wantNativePlugins && 'server'==this.page) {
                this.nativePlugins = true;
                this.settingsActive = 'SETUP_PLUGINS';
                this.loaded = true;
                this.$nextTick(function() {
                    bus.$emit('manageplugins.open', undefined);
                });
            }
            // Always force a real iframe reload. Extras/plugins: set src immediately
            // (50ms delay was cancelling first paint on mobile when dialog remounted).
            this.src = undefined;
            let setSrc = function() {
                this.src = page;
            }.bind(this);
            if (this.page=='extras' || this.page=='other') {
                this.$nextTick(setSrc);
            } else {
                setTimeout(setSrc, 50);
            }
        },
        flashSaveOk() {
            this.saveOk = true;
            if (this._saveOkTimer) {
                clearTimeout(this._saveOkTimer);
            }
            this._saveOkTimer = setTimeout(function() {
                this.saveOk = false;
                this._saveOkTimer = undefined;
            }.bind(this), 1600);
        },
        onIframeLoad() {
            // Always via component method so the handler cannot fail as a free global
            try {
                applyModifications(this.page, this.svgCol, this.darkUi, this.src);
            } catch (e) {
                logError(e);
                bus.$emit('iframe-loaded', true);
            }
            // Re-assert Material rail after load (cache / parse)
            if (('server'==this.page || 'player'==this.page) && (!this.settingsSectionGroups || this.settingsSectionGroups.length<1)) {
                let cached = iframeLoadCachedServerSettingsNav();
                if (cached && cached.length) {
                    this.settingsSectionGroups = cached;
                }
            }
        },
        toggleSettingsNavMenu() {
            this.settingsNavMenu = !this.settingsNavMenu;
        },
        /** Plugins page only: category headers vs alphabetical flat list. */
        setPluginListSort(mode) {
            let next = (mode === 'name') ? 'name' : 'category';
            this.pluginSortMode = next;
            setLocalStorageVal('pluginSortMode', next);
            bus.$emit('manageplugins.setSortMode', next);
            this.showMenu = false;
        },
        selectSettingsSection(value) {
            this.settingsNavMenu = false;
            if (!value) {
                return;
            }
            // Native Material Presets Editor (player settings)
            if (this.page=='player' && /PRESET/i.test(String(value))) {
                let pid = this.playerId || (this.$store.state.player && this.$store.state.player.id) || '';
                let pname = this.$store.state.player && this.$store.state.player.id==pid
                    ? this.$store.state.player.name
                    : (this.title || '');
                bus.$emit('closeDialog', 'iframe');
                this.$nextTick(function() {
                    bus.$emit('dlg.open', 'presetseditor', pid, pname);
                });
                return;
            }
            // Leaving native plugins for any other section
            if (value!='SETUP_PLUGINS' && this.nativePlugins) {
                this.nativePlugins = false;
                bus.$emit('closeDialog', 'manageplugins');
            }
            if (value==this.settingsActive) {
                // Re-entry into native plugins when already highlighted
                if (value=='SETUP_PLUGINS' && lmsOptions.nativeManagePlugins) {
                    this.nativePlugins = true;
                    bus.$emit('manageplugins.open');
                }
                return;
            }
            // Optimistic highlight
            this.settingsActive = value;
            if (value=='SETUP_PLUGINS' && lmsOptions.nativeManagePlugins) {
                this.nativePlugins = true;
                bus.$emit('manageplugins.open');
                return;
            }
            requestSettingsSection(value);
        },
        startLoadTimer(settingsPage) {
            let timeout = undefined!=settingsPage && SLOW_PAGES.has(settingsPage) ? 4000 : 500;
            this.stopLoadTimer();
            this.loadTimer = setTimeout(function() {
                this.loadTimer = undefined;
                this.loaded = true;
            }.bind(this), timeout);
        },
        stopLoadTimer() {
            if (this.loadTimer) {
                clearTimeout(this.loadTimer);
                this.loadTimer = undefined;
            }
        },
        goBack(longpress) {
            if (!this.show) {
                return;
            }
            if (longpress && this.showHome) {
                this.goHome();
                return;
            }
            if (this.history.length<1) {
                this.close();
            } else {
                this.loaded = false;
                this.startLoadTimer();
                this.src = this.history.pop();
            }
        },
        goHome(forceClose) {
            if (!forceClose && !this.canClose()) {
                return;
            }
            this.close(true);
            if (IFRAME_HOME_CLOSES_DIALOGS==this.showHome) {
                this.$store.commit('closeAllDialogs', true);
            } else {
                bus.$emit('browse-home');
            }
        },
        canClose(isGoHome) {
            if (LMS_STD_SETTINGS_PAGES.has(this.page) && undefined!=iframeInfo.content) {
                let elem = iframeInfo.content.activeElement;
                if (undefined!=elem && 'TEXTAREA'==elem.nodeName) {
                    iframeMarkModified(elem);
                }
            }
            if (iframeInfo.autoSaveTimer || iframeInfo.settingModified) {
                iframeCancelAutoSaveTimer();
                iframeInfo.pendingAfterSave = function() {
                    if (isGoHome) {
                        this.goHome(true);
                    } else {
                        this.close(true);
                    }
                }.bind(this);
                iframeAutoSaveSettings(iframeInfo.content, true);
                return false;
            }
            return true;
        },
        close(forceClose) {
            if (!forceClose && !this.canClose()) {
                return;
            }

            // Drop stale save callbacks so they cannot close a freshly reopened dialog
            iframeCancelAutoSaveTimer();
            iframeInfo.pendingAfterSave = undefined;
            iframeInfo.settingModified = false;
            iframeInfo.autoSaveInProgress = false;

            this.show = false;
            this.showMenu = false;
            this.choiceMenu.show = false;
            this.settingsNavMenu = false;
            this.nativePlugins = false;
            // Keep last nav groups in memory for next open (cache also in localStorage);
            // clearing here caused a first-paint empty rail after PM → settings handoff.
            this.settingsActive = '';
            this.history = [];
            this.src = undefined;
            iframeInfo.content=undefined;
            iframeInfo.settingsSelector=undefined;
            iframeInfo.settingsPage=undefined;
            try { bus.$emit('closeDialog', 'manageplugins'); } catch (e) {}
            bus.$emit('iframeClosed', this.page=='player');
            if (this.page=='server' || this.page=='dserver' || this.page=='dlserver') {
                if (LMS_VERSION>=80400) {
                    bus.$emit('refreshServerStatus');
                } else {
                    bus.$emit('checkForUpdates');
                }
            }
        },
        i18n(str, arg) {
            if (this.show) {
                return i18n(str, arg);
            } else {
                return str;
            }
        },
        doAction(act, event) {
            storeClickOrTouchPos(event);
            if (act.link) {
                if (act.follow) {
                    this.history.push(this.src);
                    this.src = act.link;
                } else {
                    bus.$emit('dlg.open', 'iframe', act.link, act.text, undefined, IFRAME_HOME_CLOSES_DIALOGS);
                }
            } else {
                confirm(act.text, act.confirm).then(res => {
                    if (res) {
                        lmsCommand("server"==this.page || "dserver"==this.page || "dlserver"==this.page ? "" : this.$store.state.player.id, act.cmd);
                        this.close();
                    }
                });
            }
        },
        doCustomAction(action, player) {
            performCustomAction(action, player);
        },
        openChoiceMenu(event) {
            this.choiceMenu={show:true, x:event.clientX};
        },
        setPlayer(player) {
            if (player.id==this.playerId) {
                return;
            }
            let parts = this.title.split(SEPARATOR);
            parts[1]=player.name;
            this.title=parts.join(SEPARATOR);
            if (undefined!=iframeInfo && undefined!=iframeInfo.content && undefined!=iframeInfo.content.URL) {
                this.src = iframeInfo.content.URL.replaceAll("%3A", ":").replaceAll(this.playerId, player.id);
            } else {
                this.src = this.src.replaceAll(this.playerId, player.id);
            }

            this.show = true;
            this.choiceMenu = {show:false, x:this.choiceMenu.x};
            this.loaded = false;
            this.startLoadTimer();
            this.history = [];
            this.playerId = player.id;
            if (this.page=='extras') {
                this.$store.commit('setPlayer', this.playerId);
            }
        },
        mouseDown(ev) {
            toolbarMouseDown(ev);
        }
    },
    computed: {
        player() {
            return this.$store.state.player
        },
        darkUi () {
            return this.$store.state.darkUi
        },
        coloredToolbars() {
            return this.$store.state.coloredToolbars
        },
        homeButton() {
            return true // this.$store.state.homeButton==1 || (this.$store.state.homeButton==2 && this.$store.state.autoShowHomeButton)
        },
        players() {
            return this.$store.state.players
        },
        numPlayers() {
            return this.$store.state.players ? this.$store.state.players.length : 0
        },
        showLoading() {
            return LMS_VERSION>=90000 && !this.loaded && !this.prompting
        },
        needActionsMenu() {
            return this.haveCustomActions || (undefined!=this.actions && this.actions.length>2);
        },
        haveCustomActions() {
            return undefined!=this.customActions && this.customActions.length>0
        },
        showSettingsNav() {
            return ('server'==this.page || 'player'==this.page) && this.settingsSectionGroups && this.settingsSectionGroups.length>0;
        },
        /** Settings side menu groups (LMS optgroups as provided — not flattened). */
        settingsSectionGroupsView() {
            return this.settingsSectionGroups || [];
        },
        settingsNavWide() {
            // Fullscreen settings dialog: use viewport width only (not desktopLayout).
            // Mobile-layout preference on a wide browser still gets the sidebar.
            let w = this.windowWidth || window.innerWidth || 0;
            return w >= 800;
        },
        /* Narrow: secondary header section picker (full width). Wide: left sidebar. */
        showSettingsSecHeader() {
            return this.showSettingsNav && !this.settingsNavWide;
        },
        settingsActiveLabel() {
            if (!this.settingsActive) {
                return i18n('Section');
            }
            for (let g=0, groups=this.settingsSectionGroupsView, glen=groups.length; g<glen; ++g) {
                let items = groups[g].items || [];
                for (let i=0, len=items.length; i<len; ++i) {
                    if (items[i].value==this.settingsActive) {
                        return items[i].text;
                    }
                }
            }
            return this.settingsActive;
        }
    },
    beforeDestroy() {
        if (this._onIframeOpen) {
            bus.$off('iframe.open', this._onIframeOpen);
            this._onIframeOpen = undefined;
        }
    },
    watch: {
        'show': function(val) {
            this.$store.commit('dialogOpen', {name:'iframe', shown:val});
        },
        'choiceMenu.show': function(val) {
            this.$store.commit('menuVisible', {name:'iframe-choice', shown:val});
        },
        'showMenu': function(val) {
            this.$store.commit('menuVisible', {name:'iframe-main', shown:val});
        },
        'settingsNavMenu': function(val) {
            this.$store.commit('menuVisible', {name:'iframe-settings-nav', shown:val});
        }
    }
})
