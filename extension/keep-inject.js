// This function is serialized by chrome.scripting.executeScript into Google Keep.
// It deliberately uses no OAuth, private Google API, or full-page blanket access.
// A visible rescue control is installed if Google's UI does not match expectations.
export async function insertIntoKeep(note) {
    if (location.protocol !== 'https:' || location.hostname !== 'keep.google.com') {
        return { ok: false, code: 'wrong-origin', message: 'This page is not Google Keep.' };
    }
    if (!note || typeof note.title !== 'string' || typeof note.body !== 'string' || !note.title.trim()) {
        return { ok: false, code: 'invalid-note', message: 'The pending note is invalid.' };
    }
    const SLEEP = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const query = (selector) => [...document.querySelectorAll(selector)];
    const PROMPT = /(?:^|\b)(?:take a note|create a note|add a note|notiz erstellen|notiz schreiben|нова бележка|въведете бележка)(?:\.{1,3}|…)?\s*$/i;
    const TITLE = /^(?:title|titel|заглавие|título|titre|titolo)$/i;
    const BODY = /^(?:note|note body|notiz|бележка|notas|corps de la note|text|take a note(?:\.{1,3}|…)?)$/i;
    const cardSelector = '[role="gridcell"],[role="listitem"],[data-id],.IZ65Hb';
    const isVisible = (el) => {
        if (!el || el.isConnected === false) return false;
        if (typeof el.getClientRects === 'function' && !el.getClientRects().length) return false;
        if (typeof getComputedStyle === 'function') {
            const st = getComputedStyle(el);
            if (st.display === 'none' || st.visibility === 'hidden' || st.visibility === 'collapse') return false;
        }
        return true;
    };
    const value = (el) => String((('value' in el) ? el.value : el.textContent) ?? '');
    const isEmpty = (el) => !value(el).trim();
    // HTML contenteditable is an enumerated attribute. Keep can use an empty
    // attribute or `plaintext-only` rather than the literal string `true`.
    // Do NOT treat a generic ARIA combobox as writable: it may be a wrapper.
    const field = (el) => Boolean(el && (el.isContentEditable === true ||
        ['', 'true', 'plaintext-only'].includes(el.getAttribute?.('contenteditable')) ||
        (['INPUT','TEXTAREA'].includes(el.tagName) && !el.disabled && !el.readOnly)));
    const label = (el) => [el.getAttribute?.('aria-label'), el.getAttribute?.('aria-placeholder'),
        el.getAttribute?.('data-placeholder'), el.getAttribute?.('placeholder'), el.getAttribute?.('title')]
        .filter(Boolean).join(' ').trim();
    const box = (el) => typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect() : null;
    const scorePosition = (el) => {
        const r = box(el);
        if (!r) return 0;
        if (r.width < 100 || r.height < 1 || r.top < 80 || r.top > Math.min(550, window.innerHeight * .85)) return -100;
        if (r.left < Math.min(150, window.innerWidth * .16)) return -100;
        return Math.max(0, 120 - r.top / 5);
    };
    const inOldCard = (el, cards) => cards.some((card) => card.contains(el));
    const editableFields = () => query('[contenteditable],[role="textbox"],[role="combobox"],textarea,input')
        .filter((el) => field(el) && isVisible(el));
    // A generic [data-id] may wrap an entire Keep region. Exclude only genuine
    // pre-existing note cards; never discard the composer because its ancestor
    // happens to carry an unrelated data-id attribute.
    const oldCards = query(cardSelector).filter(isVisible).filter((el) => {
        if (['gridcell','listitem'].includes(el.getAttribute?.('role'))) return true;
        const rect = box(el);
        if (rect && (rect.width > 800 || rect.height > 650)) return false;
        const editables = [...(el.querySelectorAll?.('[contenteditable],[role="textbox"]') ?? [])]
            .filter((e) => field(e) && isVisible(e));
        return editables.some((e) => !isEmpty(e) || TITLE.test(label(e)));
    });
    const before = new Set(editableFields());

    function composerCandidates() {
        const scores = new Map();
        const add = (el, score) => {
            if (!el || !isVisible(el) || el.closest?.('[role="dialog"]') || inOldCard(el, oldCards)) return;
            const pos = scorePosition(el);
            if (pos < 0) return;
            scores.set(el, Math.max(scores.get(el) ?? -1000, score + pos));
        };
        for (const el of query('[role="combobox"],[role="textbox"],[contenteditable],[aria-label],[aria-placeholder],[data-placeholder],[placeholder],.h1U9Be-YPqjbf')) {
            const name = label(el);
            if (/search/i.test(name)) continue;
            if (PROMPT.test(name)) add(el, 160);
            else if (el.getAttribute?.('role') === 'combobox' && (isEmpty(el) || PROMPT.test(el.textContent?.trim() ?? '')) && box(el)?.width >= 200) add(el, 115);
            else if (el.classList?.contains('h1U9Be-YPqjbf') && field(el) && isEmpty(el)) add(el, 100);
        }
        // Keep sometimes draws the prompt as an unlabelled text node / sibling.
        // Inspect visible leaf text, rather than requiring aria-label on the element.
        if (typeof document.createTreeWalker === 'function' && typeof NodeFilter !== 'undefined') {
            const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
            let node, count = 0;
            while ((node = walk.nextNode()) && count++ < 18000) {
                if (!PROMPT.test(node.textContent?.trim() ?? '')) continue;
                let el = node.parentElement;
                for (let depth = 0; depth < 4 && el && el !== document.body; depth++, el = el.parentElement) {
                    if (!isVisible(el) || inOldCard(el, oldCards)) break;
                    const candidate = field(el) || el.getAttribute?.('role') === 'combobox' ||
                        el.getAttribute?.('tabindex') != null || el === node.parentElement ||
                        (depth <= 2 && (box(el)?.width ?? 0) >= 180 && (box(el)?.height ?? 0) < 240);
                    if (candidate) add(el, 125 - depth * 12);
                }
            }
        }
        // Last resort: the unique, empty, wide contenteditable at the top of
        // the Notes screen. The search box and old note cards are excluded.
        for (const el of before) {
            if (!isEmpty(el) || /search/i.test(label(el)) || inOldCard(el, oldCards)) continue;
            if (el.tagName === 'INPUT' && el.getAttribute?.('type') === 'search') continue;
            add(el, 30);
        }
        // Opera GX / current Keep: the collapsed note composer is a large,
        // unlabelled DIV[role=combobox]. Its placeholder is often CSS-rendered,
        // so neither innerText nor an editable child is guaranteed. The observed
        // 920x639 page puts it at x=295,y=97,w=598,h=42. Identify it ONLY by
        // a unique top-of-notes geometry, never by generic role alone. The
        // search combobox lives in the header above y=80; saved cards below.
        const topComposers = query('[role="combobox"]').filter((el) => {
            if (!isVisible(el) || inOldCard(el, oldCards)) return false;
            const r = box(el);
            return !!r && r.top >= 80 && r.top <= 230 &&
                r.left >= Math.max(170, window.innerWidth * .19) &&
                r.width >= Math.min(350, window.innerWidth * .37) &&
                r.width <= window.innerWidth * .88 &&
                r.height >= 24 && r.height <= 85 &&
                r.right <= window.innerWidth + 2 &&
                !/search/i.test(label(el));
        });
        if (topComposers.length === 1) {
            return { element: topComposers[0], ambiguous: false, source: 'unique-top-combobox' };
        }
        if (topComposers.length > 1) return { element: null, ambiguous: true };
        const sorted = [...scores.entries()].sort((a,b) => b[1] - a[1]);
        if (!sorted.length) return { element: null, ambiguous: false };
        const [top, strength] = sorted[0];
        const second = sorted.find(([el]) => el !== top && !el.contains(top) && !top.contains(el));
        if (second && strength - second[1] < 12) return { element: null, ambiguous: true };
        return { element: top, ambiguous: false };
    }

    const listFields = () => editableFields().filter((el) => !inOldCard(el, oldCards));

    // Keep's expanded editor may display Title / Take a note as ordinary text
    // and create the actual contenteditable only when those placeholders are
    // focused. Restrict this fallback to a SMALL region containing a *unique*
    // native Close control. Never select arbitrary Title/Note fields globally.
    function visualEditorPair() {
        const closeButtons = query('button,[role="button"],[tabindex]')
            .filter(isVisible).filter((el) => !inOldCard(el, oldCards))
            .filter((el) => /^(?:close|done|schlie(?:ss|ß)en|zatvori|затвори)$/i.test(
                label(el) || el.textContent?.trim() || ''));
        const found = [];
        for (const close of closeButtons) {
            for (let root = close.parentElement, depth=0; root && root!==document.body && depth<9; root=root.parentElement,depth++) {
                const r = box(root);
                if (!r || r.width < 240 || r.width > Math.max(900,window.innerWidth*.91) ||
                    r.height < 80 || r.height > 550 || r.top < 50 || r.top > Math.min(520,window.innerHeight*.85)) continue;
                const descendants = [root,...(root.querySelectorAll?.('*') ?? [])];
                function findAnchors(pattern) {
                    const matches = descendants.filter((el) => isVisible(el) && !inOldCard(el,oldCards) &&
                        el!==close && !el.contains(close) && (() => {
                            const named = label(el);
                            if (named && pattern.test(named)) return true;
                            const own = el.textContent?.trim() || '';
                            return pattern.test(own) && ![...(el.children??[])].some((c)=>pattern.test(c.textContent?.trim()||''));
                        })());
                    // A labeled editable may wrap a matching placeholder span.
                    // Prefer the editable parent over its purely visual child.
                    const distinct = matches.filter((el) => !matches.some((other) => other!==el &&
                        field(other) && other.contains(el)));
                    return distinct;
                }
                const title = findAnchors(TITLE);
                const body = findAnchors(PROMPT);
                if (title.length===1 && body.length===1 && title[0]!==body[0] &&
                    !title[0].contains(body[0]) && !body[0].contains(title[0])) {
                    found.push({title:title[0],body:body[0],root,visual:true});
                    break; // smallest ancestor satisfying both placeholders and Close
                }
            }
        }
        return found.length === 1 ? found[0] : null;
    }

    // Keep/Opera sometimes draws Title and Take a note using CSS pseudo-elements:
    // no labels, roles or writable fields exist until each placeholder is focused.
    // Only use positional hit-testing within a UNIQUE, visible *new composer*
    // with a native Close control at the top of the notes screen.
    function hitTestEditorPair() {
        if (typeof document.elementFromPoint !== 'function') return null;
        const nativeButtons = query('button,[role="button"],[tabindex]');
        // A Close label may be on a simple DIV rather than a button.
        const leaves = query('*').filter((el) => {
            const text = el.textContent?.trim() || '';
            return text.length <= 12 && /^(?:close|done|schlie(?:ss|ß)en|zatvori|затвори)$/i.test(text) &&
                ![...(el.children ?? [])].some(c=>/^(?:close|done|schlie(?:ss|ß)en|zatvori|затвори)$/i.test(c.textContent?.trim()||''));
        });
        const closes = [...new Set([...nativeButtons,...leaves])].filter((el) => isVisible(el) &&
            !inOldCard(el, oldCards) &&
            /^(?:close|done|schlie(?:ss|ß)en|zatvori|затвори)$/i.test(label(el) || el.textContent?.trim() || ''));
        const hits=[];
        for (const close of closes) {
            for (let root = close.parentElement, depth=0; root && root !== document.body && depth < 10;
                root=root.parentElement,depth++) {
                const r=box(root);
                if (!r || r.width < 320 || r.width > Math.min(1000,window.innerWidth*.96) ||
                    r.height < 108 || r.height > 440 || r.top < 90 || r.top > 360 ||
                    r.left < 120 || r.bottom > window.innerHeight-30) continue;
                if (!root.contains(close) || inOldCard(root,oldCards)) continue;
                // Require Close near the lower-right of the candidate composer.
                const c=box(close);
                if (!c || c.left < r.left + r.width*.55 || c.top < r.top + r.height*.48) continue;
                const x=Math.min(r.right-80,r.left+Math.max(26,Math.min(65,r.width*.075)));
                function at(y) {
                    const el=document.elementFromPoint(x,y);
                    return el && root.contains(el) && el !== root && !el.contains(close) &&
                        !inOldCard(el,oldCards) ? el : null;
                }
                const title=at(r.top+Math.min(33,r.height*.23));
                let body=null;
                for (const offset of [r.height*.48,r.height*.59,r.height*.40]) {
                    const candidate=at(r.top+offset);
                    if(candidate && candidate!==title && !candidate.contains(title) &&
                        !title?.contains(candidate)) {body=candidate;break;}
                }
                if (title && body) hits.push({title,body,root,visual:true,positional:true});
                break; // nearest compositor-sized ancestor of Close
            }
        }
        // Avoid guessing when another editor-like region is present.
        return hits.length===1 ? hits[0] : null;
    }

    async function activateVisualField(anchor, root, otherField) {
        const allowed = (el) => el && root.contains(el) && field(el) && isVisible(el) &&
            el!==otherField && !inOldCard(el,oldCards);
        if (allowed(anchor)) return anchor;
        const parent = anchor.closest?.('[contenteditable],input,textarea');
        if (allowed(parent)) return parent;
        const descend = [...(anchor.querySelectorAll?.('[contenteditable],input,textarea')??[])].filter(allowed);
        if (descend.length===1) return descend[0];
        // Click only inside the confirmed new composer. Modern Keep may turn a
        // visual text placeholder into the actual editor on focus.
        try { anchor.click(); } catch { return null; }
        await SLEEP(100);
        if (allowed(document.activeElement)) return document.activeElement;
        if (allowed(anchor)) return anchor;
        const nearby = [...(root.querySelectorAll?.('[contenteditable],input,textarea,[role="textbox"]')??[])]
            .filter(allowed).filter((el)=>{
                const a=box(anchor),b=box(el);
                return !!a && !!b && Math.abs(a.top-b.top)<70;
            });
        return nearby.length===1 ? nearby[0] : null;
    }
    // A Keep title input can re-render the body editor. Do not activate the
    // body before writing the title: any reference acquired then can become
    // stale immediately. Instead retain its on-screen position and reacquire
    // the current body field only after Keep processes the title input.
    async function bodyAfterTitle(pair, titleField, titleRect, bodyRect) {
        // Named, still-connected fields need no positional recovery. Keep this
        // path for straightforward editor layouts and for DOM-only tests.
        if (pair.body?.isConnected && pair.root?.isConnected && pair.root.contains(pair.body) &&
            pair.body !== titleField && field(pair.body) && isVisible(pair.body) &&
            !inOldCard(pair.body,oldCards) && (BODY.test(label(pair.body)) ||
                pair.body.classList?.contains('h1U9Be-YPqjbf'))) {
            return {body:pair.body,root:pair.root};
        }
        const expectedY = bodyRect?.top ?? ((titleRect?.bottom ?? 150) + 10);
        const minY = (titleRect?.top ?? 90) + 12;
        const maxY = expectedY + 90;
        const closeRx = /^(?:close|done|schlie(?:ss|ß)en|zatvori|затвори|закрыть)$/i;
        function safeNode(el, root) {
            if (!el || !root?.isConnected || !el.isConnected || !root.contains(el) ||
                el === root || inOldCard(el, oldCards) || !isVisible(el)) return false;
            if (el === titleField || el.contains(titleField)) return false;
            if (closeRx.test(label(el) || el.textContent?.trim() || '')) return false;
            const r = box(el);
            return !!r && r.width >= 8 && r.height >= 2 &&
                r.top >= minY && r.top <= maxY &&
                r.left >= (box(root)?.left ?? 0) - 2;
        }
        function currentRoot() {
            if (pair.root?.isConnected && isVisible(pair.root)) return pair.root;
            const renewed = editorPair({allowAlreadyOpen:true}) ||
                visualEditorPair() || hitTestEditorPair();
            if (renewed?.root?.isConnected) return renewed.root;
            // Keep may replace its entire editor. Identify the *same* new
            // editor through a unique visible title matching this draft and
            // the original editor position. Exclude saved note cards.
            const matches = query('[contenteditable],[role="textbox"],div,span')
                .filter(el => isVisible(el) && !inOldCard(el,oldCards) &&
                    value(el).trim() === note.title &&
                    Math.abs((box(el)?.top ?? -1000) - (titleRect?.top ?? -1000)) < 65);
            for (const el of matches) {
                for (let root=el.parentElement,depth=0;root&&root!==document.body&&depth<7;
                    root=root.parentElement,depth++) {
                    const r=box(root);
                    if (!r || r.width<250 || r.width>window.innerWidth*.94 ||
                        r.top<80 || r.height>550) continue;
                    const closes=[...(root.querySelectorAll?.('button,[role="button"],[tabindex],div,span')??[])]
                        .filter(node=>isVisible(node)&&closeRx.test(label(node)||node.textContent?.trim()||''));
                    if (closes.length) return root;
                }
            }
            return null;
        }
        for (let pass=0;pass<16;pass++) {
            const root = currentRoot();
            if (root) {
                // First try a live editable at the old body position; this
                // also handles a body that survived the title input.
                const fields=[...(root.querySelectorAll?.('[contenteditable],[role="textbox"],input,textarea')??[])]
                    .filter(el=>safeNode(el,root) && field(el));
                const sorted=fields.sort((a,b)=>{
                    const ar=box(a),br=box(b);
                    const metric=r=>Math.abs(r.top-expectedY)*2+Math.abs(r.left-(bodyRect?.left??r.left))*.2;
                    return metric(ar)-metric(br);
                });
                if (sorted.length===1 && Math.abs(box(sorted[0]).top-expectedY)<55) return {body:sorted[0],root};
                if (sorted.length>1 && Math.abs(box(sorted[0]).top-expectedY)<20 &&
                    Math.abs(box(sorted[1]).top-expectedY)>35) return {body:sorted[0],root};
                // The body can be CSS-rendered (not contenteditable) until
                // clicked. Hit-test precisely where the *validated* body was
                // before the title input; never inspect saved note cards.
                const r=box(root);
                const x=Math.max(r.left+18,Math.min(r.right-35,(bodyRect?.left??r.left+30)+18));
                const ys=[expectedY+Math.min(12,Math.max(4,(bodyRect?.height??25)*.4)),
                    expectedY+3,Math.max(minY+8,(titleRect?.bottom??r.top+30)+12)];
                const anchors=[];
                for (const y of ys) {
                    let node=document.elementFromPoint?.(x,y);
                    for (let depth=0;node&&node!==root&&depth<3;node=node.parentElement,depth++) {
                        if (safeNode(node,root)) {anchors.push(node);break;}
                    }
                }
                // Prefer the node at the old body coordinates. On click Keep
                // may create a brand-new editable; activateVisualField waits
                // for that transition and returns only a live field.
                for (const anchor of [...new Set(anchors)]) {
                    const activated=await activateVisualField(anchor,root,titleField);
                    if (activated && field(activated) && safeNode(activated,root) &&
                        Math.abs((box(activated)?.top??-1000)-expectedY)<75)
                        return {body:activated,root};
                }
            }
            await SLEEP(110);
        }
        return null;
    }

    function editorPair({ allowAlreadyOpen = false } = {}) {
        const fields = listFields();
        const added = fields.filter((el) => !before.has(el));
        const candidates = added.length ? added : allowAlreadyOpen ? fields : [];
        const titles = candidates.filter((el) => TITLE.test(label(el)) || el.classList?.contains('r4nke-YPqjbf'));
        let bodies = candidates.filter((el) => BODY.test(label(el)) || el.classList?.contains('h1U9Be-YPqjbf'));
        // The body may reuse the original collapsed composer, while the title is new.
        if (!bodies.length) bodies = fields.filter((el) => BODY.test(label(el)) || el.classList?.contains('h1U9Be-YPqjbf'));
        const pairs = [];
        function sharedRoot(a,b) {
            for (let root = a.parentElement, depth = 0; root && root !== document.body && depth < 9; root = root.parentElement, depth++) {
                if (root.contains(b)) return root;
            }
            return null;
        }
        for (const t of titles) for (const b of bodies) {
            if (t === b) continue;
            const root = sharedRoot(t,b);
            if (root) pairs.push({ title:t, body:b, root });
        }
        if (pairs.length === 1) return pairs[0];
        if (pairs.length > 1) return null;
        // Accessibility names occasionally disappear. If clicking the composer
        // revealed exactly two new editable fields, use their vertical order.
        const unlabeled = added.filter(isEmpty).sort((a,b) => (box(a)?.top ?? 0)-(box(b)?.top ?? 0));
        if (unlabeled.length === 2) {
            const root = sharedRoot(unlabeled[0], unlabeled[1]);
            if (root) return { title:unlabeled[0], body:unlabeled[1], root };
        }
        return null;
    }

    // Keep uses divs for its Close action in some versions, not only buttons.
    // Match the visible *leaf* label inside the new editor. Click this leaf:
    // browser DOM click events bubble to Keep's actual Close listener.
    function findNativeClose(root) {
        if (!root || !root.isConnected) return null;
        const closeRx = /^(?:close|done|schlie(?:ss|ß)en|zatvori|затвори|закрыть)$/i;
        // Title and body can share a small content container which excludes
        // the footer. Expand only to the nearest few editor ancestors, stopping
        // before the full page, rather than searching all Keep notes globally.
        let container=root;
        for (let i=0; i<5 && container?.parentElement && container.parentElement!==document.body; i++) {
            const old=box(container), parent=box(container.parentElement);
            if (!parent || parent.width > Math.max(1000,window.innerWidth*.98) ||
                parent.height > 560 || parent.top < 70 ||
                (old && parent.left < old.left-120)) break;
            container=container.parentElement;
        }
        const elements = [...new Set([container, ...(container.querySelectorAll?.('*') ?? []),
            ...(container.querySelectorAll?.('button,[role="button"],[tabindex]') ?? [])])];
        const matches = elements.filter(el => {
            if (!isVisible(el) || inOldCard(el, oldCards)) return false;
            const ownLabel = label(el);
            const text = el.textContent?.trim() || '';
            if (!closeRx.test(ownLabel) && !closeRx.test(text)) return false;
            if (!ownLabel && [...(el.children ?? [])].some(child=>closeRx.test(child.textContent?.trim() || ''))) return false;
            const r=box(el), parent=box(container);
            return !!r && !!parent && r.left >= parent.left+parent.width*.47 &&
                r.top >= parent.top+parent.height*.42 && r.top < parent.bottom;
        });
        const leaves = matches.filter(el => !matches.some(other => other!==el && el.contains(other)));
        if (leaves.length === 1) return leaves[0];
        // Accessible native button within this *already identified* editor
        // is unambiguous even when layout geometry is unavailable (e.g. tests).
        const native = elements.filter(el=>isVisible(el) && !inOldCard(el,oldCards) &&
            (el.tagName==='BUTTON' || el.getAttribute?.('role')==='button') &&
            closeRx.test(label(el) || el.textContent?.trim() || ''));
        return native.length===1 ? native[0] : null;
    }
    // Keep converts plain text to links and previews, and can re-parent the
    // editor's content. A byte-for-byte comparison against one textContent
    // string is not reliable evidence that a user-visible note is missing.
    // Verify ordered fragments of *this note* within the already-proven new
    // editor, never by searching other notes or the full Keep page.
    function evidenceText(text) {
        return String(text ?? '').normalize('NFKC')
            .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
            .replace(/\s+/g, '');
    }
    function expectedBodyVisible(actualText) {
        if (!note.body.trim()) return true;
        const rendered = evidenceText(actualText);
        const entire = evidenceText(note.body);
        if (!rendered || !entire) return false;
        if (rendered.includes(entire)) return true;
        // Keep can insert a link preview or split a paragraph between nodes.
        // Require every original text fragment in its original order. Avoid
        // accepting just a title, one URL, or the first paragraph.
        const paragraphs = note.body.split(/[\r\n]+/).map(evidenceText).filter(Boolean);
        let cursor = 0;
        for (const paragraph of paragraphs) {
            for (let start = 0; start < paragraph.length; start += 72) {
                const fragment = paragraph.slice(start, start + 72);
                const found = rendered.indexOf(fragment, cursor);
                if (found < 0) return false;
                cursor = found + fragment.length;
            }
        }
        return true;
    }
    function evidenceInsideCurrentEditor(editorRoot, bodyField) {
        if (bodyField?.isConnected && expectedBodyVisible(value(bodyField))) return true;
        let node = editorRoot;
        for (let depth = 0; node && node !== document.body && depth < 7;
            node = node.parentElement, depth++) {
            if (!node.isConnected || inOldCard(node, oldCards)) break;
            const r = box(node);
            if (!r || r.width < 200 || r.width > Math.max(1020, window.innerWidth * .97) ||
                r.height > 620 || r.top < 45 || r.top > 370) continue;
            // Never expand the evidence region over previously existing notes.
            if (oldCards.some(card => node.contains(card))) break;
            if (expectedBodyVisible(node.innerText) || expectedBodyVisible(node.textContent)) return true;
        }
        return false;
    }

    async function attempt({ allowAlreadyOpen = false } = {}) {
        if (query('[role="dialog"]').some((el) => isVisible(el) && editableFields().some((f) => el.contains(f)))) {
            return { ok:false, code:'editor-open', message:'Close any existing note dialog first.' };
        }
        let pair = allowAlreadyOpen ? (editorPair({ allowAlreadyOpen:true }) || visualEditorPair() || hitTestEditorPair()) : null;
        let activatedComposerRect = null;
        if (!pair) {
            const candidate = composerCandidates();
            if (!candidate.element) return { ok:false, code:candidate.ambiguous?'ambiguous-composer':'composer-not-found',
                message:'The Google Keep composer was not identified.' };
            try {
                // Click the visual input portion, not an outer wrapper whose
                // handler might not be registered. Do not double-click: a
                // second click could affect an editor opened by the first.
                const r = box(candidate.element);
                activatedComposerRect=r;
                const inside = r && document.elementFromPoint?.(
                    r.left + Math.min(28, r.width * .12), r.top + r.height * .5);
                const target = inside && candidate.element.contains(inside) ? inside : candidate.element;
                target.click();
            } catch { return {ok:false,code:'composer-click-failed',message:'Could not open a new note.'}; }
            for (let step = 0; step < 40; step++) {
                pair = editorPair() || visualEditorPair() || (step % 4 === 0 ? hitTestEditorPair() : null);
                if (pair) break;
                await SLEEP(150);
            }
        }
        if (!pair) return { ok:false, code:'fields-not-found', message:'The Keep editor opened but title/details fields could not be identified.' };
        // Positive provenance: the new editor must occupy the region opened by
        // the specific composer we activated. This avoids accidentally writing
        // into another note card when Keep changes its accessibility markup.
        const openedRoot=box(pair.root);
        if (activatedComposerRect && openedRoot &&
            activatedComposerRect.width >= 220 && openedRoot.width >= 220) {
            const xOverlap=Math.max(0,Math.min(openedRoot.right,activatedComposerRect.right)-
                Math.max(openedRoot.left,activatedComposerRect.left));
            if (xOverlap < Math.min(openedRoot.width,activatedComposerRect.width)*0.48 ||
                Math.abs(openedRoot.top-activatedComposerRect.top) > 115) {
                return {ok:false,code:'editor-provenance-unknown',
                    message:'Keep opened an editor outside the selected new-note composer. No existing note was modified.'};
            }
        }
        // Keep's editor is not stable after title entry. User captures confirm
        // that activating the title first can replace the entire body node.
        // Insert the body FIRST, then title. This avoids depending on a stale
        // body reference and retains an idempotent, one-note-only recovery path.
        const oldTitleRect=box(pair.title);
        const oldBodyRect=box(pair.body);
        function write(el, text) {
            if (!text) return true;
            if (!el?.isConnected) return false;
            el.focus();
            if (field(el) && el.isContentEditable) {
                let used=false;
                try { used=document.execCommand('insertText',false,text) && value(el).includes(text); } catch { /* fallback */ }
                if (!used) {
                    el.textContent=text;
                    el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:text}));
                }
                return value(el).includes(text);
            }
            if ('value' in el) {
                const prototype=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
                const setter=Object.getOwnPropertyDescriptor(prototype,'value')?.set;
                if(setter) setter.call(el,text); else el.value=text;
                el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:text}));
                return el.value===text;
            }
            return false;
        }
        // Body first: activate it before any title-induced Keep re-render.
        const bodyField=pair.visual ? await activateVisualField(pair.body,pair.root,null) : pair.body;
        if (!bodyField || !field(bodyField)) return {ok:false,code:'body-not-editable',
            message:'The new note details field did not become editable. Nothing was written.'};
        if (!isEmpty(bodyField) || (!pair.visual && !isEmpty(pair.title)))
            return {ok:false,code:'nonempty-note',message:'The new editor was not empty; nothing was overwritten.'};
        if (!write(bodyField,note.body)) return {ok:false,partial:true,code:'body-insert-failed',
            message:'Keep did not confirm the details text. Inspect this open note before retrying.'};
        await SLEEP(170);
        // Reacquire the title after the body write, in case Keep has repainted
        // the new-note editor. Never search globally through saved note cards.
        let titleAnchor=pair.title;
        let currentRoot=pair.root;
        if (!titleAnchor?.isConnected || !currentRoot?.isConnected ||
            !currentRoot.contains(titleAnchor)) {
            const renewed=editorPair({allowAlreadyOpen:true}) || visualEditorPair() || hitTestEditorPair();
            if (renewed?.root?.isConnected) {
                titleAnchor=renewed.title;
                currentRoot=renewed.root;
            }
        }
        const titleField=pair.visual ? await activateVisualField(titleAnchor,currentRoot,bodyField) : titleAnchor;
        if (!titleField || !field(titleField)) return {ok:false,partial:true,code:'title-not-editable',
            message:'Details were inserted but Keep did not expose the title editor. Inspect this note.'};
        if (!isEmpty(titleField)) return {ok:false,partial:true,code:'title-not-empty',
            message:'Details were inserted, but the title editor contains unexpected text. Nothing was overwritten.'};
        if (!write(titleField,note.title)) return {ok:false,partial:true,code:'title-insert-failed',
            message:'Details were inserted but the title did not verify. Inspect the open note.'};
        await SLEEP(160);
        // Verify body *after* title entry. A replacement node is permissible
        // only when the same new editor can be reacquired. If Keep discarded
        // the body, reinsert it once into the validated EMPTY replacement.
        const normalized=evidenceText;
        const renderContainsBody=(editorRoot)=>evidenceInsideCurrentEditor(editorRoot,bodyField);
        let root=currentRoot;
        // Keep may preserve body text in its state and redraw it as plain
        // visible text (not as contenteditable). In that case DO NOT write
        // it a second time: doing so could duplicate the note contents.
        if (!renderContainsBody(root)) {
            const resolvedBody=await bodyAfterTitle({...pair,root:currentRoot,body:bodyField},
                titleField,oldTitleRect,oldBodyRect);
            if (resolvedBody) {
                root=resolvedBody.root;
                const body=resolvedBody.body;
                if (!expectedBodyVisible(value(body)) && !evidenceInsideCurrentEditor(root, body)) {
                    if (!isEmpty(body)) return {ok:false,partial:true,code:'body-changed',
                        message:'Keep changed the details after title entry. Inspect the same open note.'};
                    if (!write(body,note.body)) return {ok:false,partial:true,code:'body-insert-failed',
                        message:'Keep replaced the details field and text could not be verified.'};
                }
            } else if (!evidenceInsideCurrentEditor(root,bodyField)) {
                return {ok:false,partial:true,code:'body-not-verified',
                    message:'Title is set, but Keep did not expose the saved details. Inspect the same open note.'};
            }
        }
        await SLEEP(140);
        if (!evidenceInsideCurrentEditor(root,bodyField)) {
            return {ok:false,partial:true,code:'body-not-verified',
                message:'Title was entered but note details could not be verified in the active Keep editor. Inspect the open note; do not reinsert.'};
        }
        // Do not reuse the old root if Keep has re-rendered the editor.
        const stillOpen = root?.isConnected ? root : (editorPair({allowAlreadyOpen:true}) || visualEditorPair() || hitTestEditorPair())?.root;
        // Keep sometimes puts the actionable Close handler on the button's
        // ancestor, and re-renders it after input blur. Do not rely on one
        // synthetic click to finish the operation. Every alternative action
        // is followed by an *observed* editor-close transition.
        let close=findNativeClose(stillOpen);
        if (!close && !stillOpen?.isConnected) {
            return {ok:false,partial:true,code:'close-state-unknown',
                message:'Keep changed the editor after insertion. Check the note before retrying.'};
        }
        if (!close) {
            const renewed=visualEditorPair() || hitTestEditorPair();
            close=findNativeClose(renewed?.root);
        }
        if (!close) return {ok:false,partial:true,code:'needs-close',
            message:'Title and details were inserted, but the native Close control was not found.'};
        const originalClose=close;
        const originalRoot=stillOpen?.isConnected ? stillOpen : null;
        const closed=()=>!originalClose.isConnected || !isVisible(originalClose) ||
            (originalRoot && (!originalRoot.isConnected || !isVisible(originalRoot)));
        async function observeClose(ms=900) {
            const loops=Math.max(1,Math.ceil(ms/90));
            for(let i=0;i<loops;i++) {
                if (closed()) return true;
                await SLEEP(90);
            }
            return closed();
        }
        let visiblyClosed=false;
        // Blur the active title field first: Keep often commits a controlled
        // input's pending change only after focus moves away from it.
        try {document.activeElement?.blur?.();} catch { /* not essential */ }
        await SLEEP(120);
        if (closed()) visiblyClosed=true;
        let closeClicked=false;
        if (!visiblyClosed) {
            try {close.click();closeClicked=true;} catch { /* try a real control */ }
            visiblyClosed=await observeClose(1150);
        }
        // The visible Close text can be a child of an interactive wrapper.
        // It was clickable manually in Opera, but leaf.click() did nothing.
        if (!visiblyClosed) {
            const wrapper=close.closest?.('button,[role="button"],[tabindex]');
            if (wrapper && wrapper!==close && wrapper.isConnected && isVisible(wrapper) &&
                !inOldCard(wrapper,oldCards) && (box(wrapper)?.width ?? 999) < 260) {
                try {wrapper.focus?.();wrapper.click();closeClicked=true;} catch { /* continue */ }
                visiblyClosed=await observeClose(1100);
            }
        }
        // Some Keep UIs finalize an editor on pointerdown/mouseup rather than
        // click. Dispatch the sequence only after both click paths fail.
        if (!visiblyClosed && close.isConnected && isVisible(close) &&
            typeof MouseEvent==='function') {
            const target=close.closest?.('button,[role="button"],[tabindex]') || close;
            try {
                const common={bubbles:true,cancelable:true,composed:true,button:0,buttons:1};
                if(typeof PointerEvent==='function') target.dispatchEvent(new PointerEvent('pointerdown',{...common,pointerType:'mouse'}));
                if(!closed()) target.dispatchEvent(new MouseEvent('mousedown',common));
                if(!closed() && typeof PointerEvent==='function') target.dispatchEvent(new PointerEvent('pointerup',{...common,pointerType:'mouse',buttons:0}));
                if(!closed()) target.dispatchEvent(new MouseEvent('mouseup',{...common,buttons:0}));
                if(!closed()) target.click();
                closeClicked=true;
            } catch { /* continue */ }
            visiblyClosed=await observeClose(900);
        }
        // Keep also closes a new note when the user clicks a blank area
        // outside the editor. Use this last resort only if hit-testing finds
        // an inert page surface, never a saved note or a navigation control.
        if (!visiblyClosed && typeof document.elementFromPoint==='function') {
            const cr=box(close),rr=box(originalRoot);
            if(cr && rr) {
                const x=Math.min(window.innerWidth-14,Math.max(cr.right+10,rr.right+12));
                const y=Math.min(window.innerHeight-65,Math.max(160,cr.top));
                const blank=document.elementFromPoint(x,y);
                const interactive=blank?.closest?.('button,a,[role="button"],[role="gridcell"],[role="listitem"],[data-id],.IZ65Hb,[contenteditable]');
                if(blank && blank!==document.documentElement && !originalRoot.contains(blank) &&
                    !interactive && !inOldCard(blank,oldCards)) {
                    try {blank.click();} catch { /* leave note for recovery */ }
                    visiblyClosed=await observeClose(1350);
                }
            }
        }
        if(!visiblyClosed) return {ok:false,partial:true,code:'close-unverified',closeClicked,
            message:'Title and details were entered, but Keep did not visibly close the note. Click Close manually; do not repeat insertion.'};
        // This is a UI-only acknowledgement, not confirmation from Google.
        await SLEEP(550);
        return {ok:true,uiClosed:true,cloudVerified:false,partial:false,
            code:'closed-in-keep-ui',closeClicked,
            message:'Title/details entered and editor visibly closed. Google cloud sync is not independently verified.'};
    }

    function rescue(reason, failureCode = "", partial = false) {
        const KEY='send-to-keep-rescue';
        if (typeof document.createElement !== 'function' || typeof document.body?.appendChild !== 'function') return false;
        // Replace a stale helper from an earlier draft instead of retaining its callbacks.
        document.getElementById(KEY)?.remove();
        const host = document.createElement('div');
        host.id=KEY;
        host.style.cssText='position:fixed;left:16px;bottom:16px;z-index:2147483647;width:min(274px,calc(100vw - 32px));max-height:calc(100vh - 140px);overflow:auto';
        const root = host.attachShadow({mode:'open'});
        root.innerHTML=`<style>*{box-sizing:border-box}section{font:14px/1.45 Arial,sans-serif;background:#fffdf5;color:#352b11;border:1px solid #c9ad57;border-radius:12px;padding:16px;box-shadow:0 8px 30px #0003}h2{margin:0 0 8px;font-size:16px}p{margin:0 0 12px}.row{display:flex;gap:8px;flex-wrap:wrap}button{cursor:pointer;border:1px solid #bda567;border-radius:8px;background:#fff;padding:9px 12px;font-weight:600}button.primary{background:#f8ce59}small{display:block;margin-top:9px;color:#665a42}</style><section role="region" aria-label="Send to Google Keep assistant"><h2>Insert pending note</h2><p id="msg"></p><div class="row"><button class="primary" id="retry">Insert into open new note</button><button id="copy">Copy content</button><button id="diagnostics">Copy diagnostics</button><button id="dismiss">Dismiss</button></div><small>Click “Take a note…” in Keep first if no editor is open. Existing notes are not modified.</small></section>`;
        root.getElementById('msg').textContent=reason;
        if (partial && /^(?:close-unverified|close-click-failed|needs-close|close-state-unknown)$/.test(failureCode)) {
            root.querySelector('h2').textContent='Finish this note';
        }
        const retryButton=root.getElementById('retry');
        const help=root.querySelector('small');
        // Retrying the entire insertion after a partial write is unsafe:
        // Keep may already have saved the title or the full note.
        if (partial) {
            if (['body-field-replaced','body-insert-failed','body-not-empty','body-not-verified','body-changed','title-not-editable','title-not-empty','title-insert-failed'].includes(failureCode)) {
                retryButton.textContent=['title-not-editable','title-not-empty','title-insert-failed'].includes(failureCode) ? 'Copy missing title' : 'Copy remaining details';
                help.textContent='Some content may already be in Keep. Inspect the SAME open note before pasting missing details or clicking Close. Never create a duplicate.';
            } else {
                retryButton.hidden=true;
                help.textContent='The note may be partially or fully inserted. Inspect it and click Keep Close manually if needed. Do not reinsert the note.';
            }
        }
        root.getElementById('dismiss').onclick=()=>host.remove();
        root.getElementById('copy').onclick=async()=>{
            try { await navigator.clipboard.writeText(note.title+'\n\n'+note.body);root.getElementById('msg').textContent='Title and details copied.'; }
            catch {root.getElementById('msg').textContent='Clipboard blocked. Copy title and details from extension Options.';}
        };
        root.getElementById('diagnostics').onclick=async()=>{
            // Deliberately excludes note text, titles, URLs, email and DOM HTML.
            const fields=editableFields().map((el)=>({rect:box(el),hasLabel:!!label(el),role:el.getAttribute?.('role')||'',
                contenteditable:field(el)})).filter((x)=>x.rect?.top>=70 && x.rect?.top<=600).slice(0,12)
                .map((x)=>({y:Math.round(x.rect.top),x:Math.round(x.rect.left),w:Math.round(x.rect.width),
                    labelPresent:x.hasLabel,role:x.role,editable:x.contenteditable}));
            // Show control shapes (never labels, values, note text, or URLs) so
            // reports distinguish collapsed/expanded/partially edited states.
            const visibleControls=query('[role="combobox"],[contenteditable],button,[role="button"],[tabindex]')
                .filter(isVisible).map(el=>({rect:box(el),tag:el.tagName,role:el.getAttribute?.('role')||'',
                    isEditable:field(el)}))
                .filter(x=>x.rect && x.rect.top>=70 && x.rect.top<450 &&
                    x.rect.left>=Math.min(150,window.innerWidth*.16) && x.rect.width>60)
                .slice(0,16).map(x=>({tag:x.tag,role:x.role,editable:x.isEditable,
                    x:Math.round(x.rect.left),y:Math.round(x.rect.top),w:Math.round(x.rect.width),h:Math.round(x.rect.height)}));
            const data={origin:'https://keep.google.com',viewport:[window.innerWidth,window.innerHeight],
                editableCount:editableFields().length,comboboxCount:query('[role="combobox"]').length,
                knownComposerClassCount:query('.h1U9Be-YPqjbf').length,
                contenteditablePresent:query('[contenteditable]').length,
                contenteditableBlank:query('[contenteditable=""]').length,
                contenteditablePlaintext:query('[contenteditable="plaintext-only"]').length,
                visualEditorDetected:!!(visualEditorPair() || hitTestEditorPair()),
                nativeCloseCount:query('button,[role="button"],[tabindex],div,span').filter(isVisible)
                    .filter(el=>/^(?:close|done)$/i.test(label(el)||el.textContent?.trim()||'')).length,
                cardCount:oldCards.length,topFields:fields,visibleControls};
            try {await navigator.clipboard.writeText(JSON.stringify(data,null,2));
                root.getElementById('msg').textContent='Privacy-safe layout diagnostics copied.';}
            catch {root.getElementById('msg').textContent='Clipboard permission denied. Use the extension Options page.';}
        };
        root.getElementById('retry').onclick=async()=>{
            if (partial) {
                try {
                    await navigator.clipboard.writeText(['title-not-editable','title-not-empty','title-insert-failed'].includes(failureCode) ? note.title : note.body);
                    root.getElementById('msg').textContent='Missing text copied. Paste only what is absent into the current note.';
                } catch { root.getElementById('msg').textContent='Clipboard unavailable. Copy details from extension Options.'; }
                return;
            }
            const button=root.getElementById('retry');button.disabled=true;root.getElementById('msg').textContent='Checking the new note…';
            try {
                const result=await attempt({allowAlreadyOpen:true});
                root.getElementById('msg').textContent=result.message;
                if (result.ok || result.partial) {
                    try { await chrome.runtime.sendMessage({type:'keepInsertionOutcome',draftId:note.draftId,outcome:{ok:result.ok,partial:!!result.partial,code:result.code}}); }
                    catch { /* UI remains authoritative locally */ }
                    if(result.ok) setTimeout(()=>host.remove(),8000);
                }
            } catch(error){root.getElementById('msg').textContent=String(error.message||error);}
            finally{button.disabled=false;}
        };
        document.body.appendChild(host);
        return true;
    }
    // Initial pass: after page hydration, try opening the top composer. If not
    // found, leave an in-page assistant rather than another opaque OS toast.
    let result;
    for(let i=0;i<12;i++){
        result=await attempt();
        if (result.ok || result.partial || !['composer-not-found','ambiguous-composer'].includes(result.code)) break;
        await SLEEP(240);
    }
    if (!result.ok && (result.partial ||
        ['composer-not-found','ambiguous-composer','fields-not-found','fields-not-editable','title-not-editable','body-not-editable'].includes(result.code))) {
        rescue(result.message, result.code, Boolean(result.partial));
        return {...result, assisted:true, message:`${result.message} A diagnostic and recovery assistant is available in the Keep window.`};
    }
    return result;
}
