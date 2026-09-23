/**
 * LMS-Material — thin Sortable.js wrapper for list reordering.
 */
'use strict';

function mskSortableGetIndex(el) {
    if (!el) {
        return -1;
    }
    var idx = el.getAttribute('data-msk-index');
    if (null!=idx && ''!==idx) {
        return parseInt(idx, 10);
    }
    if (el.querySelector) {
        var inner = el.querySelector('[data-msk-index]');
        if (inner) {
            return parseInt(inner.getAttribute('data-msk-index'), 10);
        }
    }
    return -1;
}

function mskSortableRowElements(container) {
    var rows = [];
    if (!container || !container.children) {
        return rows;
    }
    var kids = container.children;
    for (var i = 0, len = kids.length; i < len; ++i) {
        var kid = kids[i];
        var idx = mskSortableGetIndex(kid);
        if (!isNaN(idx) && idx >= 0) {
            rows.push(kid);
        }
    }
    return rows;
}

function mskSortableFindRowElement(el, rows) {
    if (!el || !rows) {
        return null;
    }
    for (var i = 0, len = rows.length; i < len; ++i) {
        if (rows[i]===el || rows[i].contains(el)) {
            return rows[i];
        }
    }
    return null;
}

/**
 * Resolve from/to array indices from a Sortable onEnd event.
 * Rows carry data-msk-index on themselves or a descendant.
 */
function mskSortableReorderIndices(evt, itemCount) {
    if (!evt || !evt.item || !evt.to || itemCount < 2) {
        return null;
    }
    var rows = mskSortableRowElements(evt.to);
    var row = mskSortableFindRowElement(evt.item, rows);
    if (!row) {
        return null;
    }
    var from = mskSortableGetIndex(row);
    if (isNaN(from) || from < 0) {
        return null;
    }
    var pos = rows.indexOf(row);
    if (pos < 0) {
        return null;
    }
    var to;
    if (pos >= rows.length - 1) {
        to = itemCount - 1;
    } else {
        to = mskSortableGetIndex(rows[pos + 1]);
    }
    if (isNaN(to) || to < 0 || to >= itemCount) {
        return null;
    }
    if (from === to) {
        return null;
    }
    return { from: from, to: to };
}

function mskSortableFindQueueWrapper(list) {
    if (!list) {
        return null;
    }
    return list.querySelector('.vue-recycle-scroller__item-wrapper')
        || list.querySelector('.vue-recycle-scroller');
}

function mskSortableCleanupDom() {
    var selectors = '.msk-sortable-ghost,.msk-sortable-drag,.msk-sortable-chosen,.sortable-ghost,.sortable-drag,.sortable-chosen,.sortable-fallback';
    var nodes = document.querySelectorAll(selectors);
    for (var i = 0, len = nodes.length; i < len; ++i) {
        var n = nodes[i];
        if (!n) { continue; }
        // In-list rows must not be removed — Vue owns them. Only drop clones
        // Sortable appended to body (fallback drag helper).
        var inHost = false;
        try {
            inHost = !!(n.closest && n.closest('.msk-sortable-host'));
        } catch (ex) {}
        if (inHost) {
            try {
                n.classList.remove('msk-sortable-ghost', 'msk-sortable-drag', 'msk-sortable-chosen',
                    'sortable-ghost', 'sortable-drag', 'sortable-chosen', 'sortable-fallback');
            } catch (ex) {}
            continue;
        }
        try {
            if (n.parentNode) {
                n.parentNode.removeChild(n);
            }
        } catch (ex) {}
    }
    try {
        document.body.classList.remove('msk-sortable-active');
    } catch (ex) {}
}

function mskSortableCreate(el, opts) {
    if (!el || typeof Sortable === 'undefined') {
        return null;
    }
    var defaults = {
        animation: 200,
        easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
        ghostClass: 'msk-sortable-ghost',
        chosenClass: 'msk-sortable-chosen',
        dragClass: 'msk-sortable-drag',
        // Prefer native HTML5 drag on desktop; force fallback only when caller asks
        // (mobile list reordering is disabled — long-press is for context menus).
        forceFallback: false,
        fallbackOnBody: true,
        fallbackTolerance: 5,
        delay: 0,
        delayOnTouchOnly: true,
        touchStartThreshold: 5,
        scroll: true,
        bubbleScroll: true,
        scrollSensitivity: 80,
        scrollSpeed: 12,
        emitDragActive: true
    };
    var options = Object.assign({}, defaults, opts || {});
    var emitDragActive = options.emitDragActive;
    delete options.emitDragActive;
    var userStart = options.onStart;
    var userEnd = options.onEnd;
    options.onStart = function(evt) {
        try { document.body.classList.add('msk-sortable-active'); } catch (ex) {}
        if (emitDragActive) {
            bus.$emit('dragActive', true);
        }
        if (userStart) {
            userStart(evt);
        }
    };
    options.onEnd = function(evt) {
        try {
            if (userEnd) {
                userEnd(evt);
            }
        } finally {
            mskSortableCleanupDom();
            if (emitDragActive) {
                setTimeout(function() { bus.$emit('dragActive', false); }, 250);
            }
        }
    };
    return Sortable.create(el, options);
}

function mskSortableDestroy(inst) {
    if (inst && inst.destroy) {
        try {
            inst.destroy();
        } catch (ex) {}
    }
    mskSortableCleanupDom();
}