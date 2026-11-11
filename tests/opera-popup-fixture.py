"""Offline Chromium regression for Opera GX expanded Google Keep editor.
This models the user's visible controls and low editable-count diagnostic.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

src=Path(__file__).resolve().parents[1].joinpath('extension/keep-inject.js').read_text()
src=src.replace('export async function insertIntoKeep','async function insertIntoKeep').replace("if (location.protocol !== 'https:' || location.hostname !== 'keep.google.com')","if (false)")
html='''<!doctype html><html><head><style>
body{margin:0;font-family:sans-serif}header{height:75px;background:#eee}
#compose{margin:80px 0 0 32%;width:590px;height:200px}
#composer{height:44px;border:1px solid #ddd;cursor:pointer;padding:8px}
#new-note{width:585px;height:145px;border:1px solid #ccc;padding:10px}
.proxy{height:38px;cursor:text}#cards{display:flex;gap:20px;margin:30px 0 0 30%}
article{border:1px solid #ddd;padding:10px}
</style></head><body><header><input aria-label="Search" type="search"></header>
<div id="compose"><div id="composer"><span>Take a note...</span></div></div>
<div id="cards"><article><h3>My Weekly Schedule</h3><p>Existing text one</p></article>
<article><h3>Weekly Dump</h3><p>Existing text two</p></article></div>
<script>
document.querySelector('#composer').addEventListener('click',()=>{
  document.querySelector('#compose').innerHTML=`<div id="new-note">
    <div class="proxy" id="title-proxy" tabindex="0"><span>Title</span></div>
    <div class="proxy" id="body-proxy" role="combobox" tabindex="0"><span>Take a note...</span></div>
    <button id="close" type="button">Close</button></div>`;
  document.querySelector('#close').onclick=()=>{document.querySelector('#new-note').dataset.closed='1';document.querySelector('#close').style.display='none';};
});
document.body.addEventListener('click',ev=>{
  const proxy=ev.target.closest('.proxy'); if (!proxy || proxy.querySelector('[contenteditable]')) return;
  const isTitle=proxy.id==='title-proxy';
  proxy.innerHTML=isTitle
    ? '<div id="new-title" contenteditable="" role="textbox"></div>'
    : '<div id="new-body" contenteditable="plaintext-only" role="combobox"></div>';
  proxy.querySelector('[contenteditable]').focus();
});
</script></body></html>'''
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':920,'height':639})
    page.set_content(html)
    result=page.evaluate(f'''async () => {{ {src}; return await insertIntoKeep({{title:'Opera GX title',body:'Opera GX details'}}); }}''')
    print('opera-popup:',result,flush=True)
    assert result.get('ok'), result
    assert page.locator('#new-title').inner_text()=='Opera GX title'
    assert page.locator('#new-body').inner_text()=='Opera GX details'
    assert page.locator('#new-note').get_attribute('data-closed')=='1'
    assert 'Existing text one' in page.locator('#cards').inner_text()
    assert 'Existing text two' in page.locator('#cards').inner_text()
    page.close()

    # Never force-editability or modify an existing note when Keep does not
    # expose editable fields even after the user-visible placeholders are clicked.
    readonly=html.replace('proxy.innerHTML=isTitle', 'if (true) return; proxy.innerHTML=isTitle')
    page=browser.new_page(viewport={'width':920,'height':639})
    page.set_content(readonly)
    result=page.evaluate(f'''async () => {{ {src}; return await insertIntoKeep({{title:'Do not insert',body:'Do not insert'}}); }}''')
    print('opera-popup-readonly:', result, flush=True)
    assert not result.get('ok') and result.get('assisted'), result
    assert result.get('code')=='body-not-editable', result
    assert page.locator('#new-title').count()==0
    assert page.locator('#send-to-keep-rescue').count()==1
    assert 'Existing text one' in page.locator('#cards').inner_text()
    page.close()
    browser.close()
