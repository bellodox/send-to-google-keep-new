import test from 'node:test';
import assert from 'node:assert/strict';
import { insertIntoKeep } from '../extension/keep-inject.js';

// A compact Keep-like DOM fixture, including editable content inside existing
// note cards. It reproduces the false positive reported from Opera screenshots.
function allDescendants(el) { return el.children.flatMap(c=>[c,...allDescendants(c)]); }
function matchesSelector(el, css) {
    return css.split(',').some(part=>{
        if (part.trim()==='button' && el.tagName==='BUTTON') return true;
        if (part.includes('[role=\"gridcell\"]') && el.getAttribute('role')==='gridcell')return true;
        if (part.includes('[role=\"listitem\"]') && el.getAttribute('role')==='listitem')return true;
        if (part.includes('[data-id]') && el.getAttribute('data-id')!==null)return true;
        if (part.includes('.IZ65Hb'))return false;
        if (part.includes('[role=\"dialog\"]') && el.getAttribute('role')==='dialog')return true;
        if (part.includes('[role=\"textbox\"]') && el.getAttribute('role')==='textbox')return true;
        if (part.includes('[role=\"combobox\"]') && el.getAttribute('role')==='combobox')return true;
        if (part.includes('[aria-label]') && el.getAttribute('aria-label'))return true;
        if (part.includes('[contenteditable=\"true\"]') && el.getAttribute('contenteditable')==='true')return true;
        if (part === '[contenteditable]' && el.getAttribute('contenteditable') !== null) return true;
        if (part === '[contenteditable=""]' && el.getAttribute('contenteditable') === '') return true;
        if (part === '[contenteditable="plaintext-only"]' && el.getAttribute('contenteditable') === 'plaintext-only') return true;
        return false;
    });
}
function element(name, { label = '', text = '', role = '', editable = false, hidden = false, dataId = false, onClick } = {}) {
    const attrs = { ...(label ? { 'aria-label': label } : {}), ...(role ? { role } : {}),
        ...(editable ? { contenteditable: 'true' } : {}), ...(dataId ? { 'data-id': 'old-note' } : {}) };
    const el = {
        tagName: name, isConnected: true, isContentEditable: editable, parentElement: null, children: [],
        textContent: text, hidden,
        getAttribute(k) { return attrs[k] ?? null; },
        getClientRects() { return this.hidden ? [] : [{ width: 200, height: 30 }]; },
        getBoundingClientRect() { return {width: 200,height:30,top:200,left:350}; },
        get classList() { return { contains() { return false; } }; },
        querySelectorAll(selector) { return [...allDescendants(this)].filter(e => matchesSelector(e, selector)); },
        append(child) { this.children.push(child); child.parentElement = this; return child; },
        contains(other) { for (let cur = other; cur; cur = cur.parentElement) if (cur === this) return true; return false; },
        closest(selector) {
            for (let cur = this; cur; cur = cur.parentElement) {
                if (selector.includes('[role="gridcell"]') && cur.getAttribute('role') === 'gridcell') return cur;
                if (selector.includes('[role="listitem"]') && cur.getAttribute('role') === 'listitem') return cur;
                if (selector.includes('[data-id]') && cur.getAttribute('data-id') !== null) return cur;
                if (selector.includes('[role="dialog"]') && cur.getAttribute('role') === 'dialog') return cur;
            }
            return null;
        },
        click() { onClick?.(); }, focus() {}, dispatchEvent() {},
    };
    return el;
}
function scene({ host = 'keep.google.com', composer = true, existingCards = 3, dialog = false,
    existingEditor = false, titleText = '', bodyText = '', duplicate = false, noOpClose = false,
    nonEditableComposer = false } = {}) {
    globalThis.location = { protocol: 'https:', hostname: host };
    globalThis.window = {innerWidth:1366,innerHeight:768};
    globalThis.InputEvent = class InputEvent { constructor() {} };
    const root = element('HTML'); const body = root.append(element('BODY'));
    const composeArea = body.append(element('DIV'));
    const all = [root, body, composeArea];
    let title, details, clicked = false;
    let prompt;
    if (composer) {
        prompt = composeArea.append(element('DIV', {
            label: 'Take a note...', editable: !nonEditableComposer, onClick: () => {
                clicked = true;
                const opened = composeArea.append(element('DIV'));
                title = opened.append(element('DIV', { label: 'Title', editable: true, text: titleText }));
                details = opened.append(element('DIV', { label: 'Note', editable: true, text: bodyText }));
                const closer = opened.append(element('BUTTON', { text:'Close', onClick:()=>{if(!noOpClose) closer.hidden=true;} }));
                all.push(opened, title, details, closer);
                if (duplicate) {
                    const extra = opened.append(element('DIV', { label: 'Title', editable: true })); all.push(extra);
                }
            },
        }));
        all.push(prompt);
    }
    for (let i = 0; i < existingCards; i++) {
        const card = body.append(element('DIV', { role: 'gridcell', dataId: true }));
        const existingTitle = card.append(element('DIV', { label: 'Title', editable: true, text: `Existing title ${i}` }));
        const existingBody = card.append(element('DIV', { label: 'Note', editable: true, text: `Existing details ${i}` }));
        all.push(card, existingTitle, existingBody);
    }
    if (existingEditor) {
        const open = body.append(element('DIV'));
        const oldTitle = open.append(element('DIV', { label: 'Title', editable: true, text: 'Existing open note' }));
        const oldBody = open.append(element('DIV', { label: 'Note', editable: true, text: 'Already entered' }));
        all.push(open, oldTitle, oldBody);
    }
    if (dialog) {
        const openDialog = body.append(element('DIV', { role: 'dialog' }));
        const field = openDialog.append(element('DIV', { label: 'Note', editable: true }));
        all.push(openDialog, field);
    }
    globalThis.document = {
        body, documentElement: root,
        querySelectorAll(selector) { return all.filter(el => matchesSelector(el,selector)); },
        execCommand() { return false; },
    };
    return { get title() { return title; }, get details() { return details; }, get clicked() { return clicked; }, prompt };
}

test('rejects non-Google-Keep origins', async () => {
    scene({host:'keep.google.com.attacker.test'});
    assert.equal((await insertIntoKeep({title:'x',body:'y'})).code,'wrong-origin');
});
test('fills a fresh Keep editor while existing note cards contain editable Title/Note fields', async () => {
    const s = scene({existingCards:4});
    const result = await insertIntoKeep({title:'New research',body:'Plain <b>text</b>'});
    assert.equal(result.code, 'closed-in-keep-ui');
    assert.equal(result.uiClosed,true);
    assert.equal(result.closeClicked, true);
    assert.equal(s.title.textContent, 'New research');
    assert.equal(s.details.textContent, 'Plain <b>text</b>');
});
test('supports an initially noneditable composer that opens an editable new note',async()=>{
    const s=scene({nonEditableComposer:true});
    const result=await insertIntoKeep({title:'Noneditable prompt',body:'Note'});
    assert.equal(result.ok,true);
    assert.equal(s.title.textContent,'Noneditable prompt');
});
test('does not overwrite an existing editor when a new composer is also visible',async()=>{
    const s=scene({existingEditor:true});
    const result=await insertIntoKeep({title:'Fresh',body:'Details'});
    assert.equal(result.ok,true);
    assert.equal(s.title.textContent,'Fresh');
});
test('fails safely if no new-note composer can be identified',async()=>{
    scene({composer:false});
    const result=await insertIntoKeep({title:'No composer',body:'Test'});
    assert.equal(result.code,'composer-not-found');
});
test('rejects visible open editing dialogs',async()=>{
    const s=scene({dialog:true});
    const result=await insertIntoKeep({title:'No edits',body:'Test'});
    assert.equal(result.code,'editor-open');
    assert.equal(s.clicked,false);
});
test('blocks nonempty new title and details fields',async()=>{
    const s=scene({titleText:'Other data'});
    const result=await insertIntoKeep({title:'New text',body:'Test'});
    assert.equal(result.code,'nonempty-note');
    assert.equal(s.title.textContent,'Other data');
});
test('rejects an ambiguous new-note editor with two title fields',async()=>{
    const s=scene({duplicate:true});
    const result=await insertIntoKeep({title:'x',body:'y'});
    assert.equal(result.code,'fields-not-found');
    assert.equal(s.details.textContent,'');
});

test('no-op Close cannot produce a success acknowledgement or free the popup',async()=>{
    const s=scene({noOpClose:true});
    const result=await insertIntoKeep({title:'Verification test',body:'Text remains in editor'});
    assert.equal(result.ok,false);
    assert.equal(result.code,'close-unverified');
    assert.equal(result.partial,true);
    assert.equal(s.title.textContent,'Verification test');
    assert.equal(s.details.textContent,'Text remains in editor');
});
