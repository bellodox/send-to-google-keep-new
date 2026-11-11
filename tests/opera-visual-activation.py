"""Test a live Chromium renderer with an Opera-size CSS-placeholder Keep editor.
This is not the authenticated Google Keep page.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

source = Path(__file__).resolve().parents[1].joinpath('extension/keep-inject.js').read_text()
source = source.replace('export async function insertIntoKeep', 'async function insertIntoKeep')
source = source.replace("if (location.protocol !== 'https:' || location.hostname !== 'keep.google.com')", "if (false)")
doc = '''<!DOCTYPE html><html><head><style>
 body{margin:0;font-family:sans-serif}
 #nav{height:70px;background:#fafafa}
 #compose{position:absolute;left:294px;top:166px;width:600px}
 #composer{height:47px;border:1px solid #ddd;cursor:text;padding:12px}
 .new-note{box-sizing:border-box;width:600px;height:130px;border:1px solid #ddd;border-radius:9px;position:relative;padding:5px 16px}
 .slot{height:34px;margin:0;display:block;cursor:text}
 #title-slot::before{content:'Title';color:#777}
 #body-slot::before{content:'Take a note...';color:#777}
 .slot:has([contenteditable])::before{content:none !important}
 .entry{outline:none;min-height:27px;width:95%}
 #native-close{position:absolute;right:12px;bottom:7px;border:0;padding:6px 12px;background:none}
 #cards{position:absolute;left:350px;top:370px;display:flex;gap:14px}
 article{width:180px;border:1px solid #ddd}
</style></head><body><div id="nav">Keep</div><div id="compose"><div id="composer">Take a note...</div></div>
<div id="cards"><article role="gridcell" data-id="old-1"><div contenteditable="true" aria-label="Title">Old note</div><div contenteditable="true" aria-label="Note">Do not modify</div></article></div>
<script>
 document.querySelector('#composer').addEventListener('click',()=>{
   document.querySelector('#compose').innerHTML=`<div id="new-note" class="new-note">
     <div id="title-slot" class="slot"></div><div id="body-slot" class="slot"></div>
     <button id="native-close" type="button">Close</button></div>`;
   for(const [slot,id] of [['title-slot','dynamic-title'],['body-slot','dynamic-body']]){
     document.getElementById(slot).addEventListener('click',()=>{
       if(document.getElementById(id)){document.getElementById(id).focus();return;}
       const ed=document.createElement('div');ed.id=id;ed.className='entry';ed.contentEditable='true';
       document.getElementById(slot).append(ed);ed.focus();
     });
   }
   document.getElementById('native-close').onclick=()=>{document.getElementById('new-note').dataset.closed='1';document.getElementById('native-close').style.display='none';};
 });
</script></body></html>'''
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':920,'height':639})
    page.set_content(doc)
    result=page.evaluate(f"async () => {{ {source}; return await insertIntoKeep({{title:'Opera popup title',body:'Opera popup details'}}); }}")
    print('opera-visual-activation',result,flush=True)
    assert result.get('ok'), result
    assert page.locator('#dynamic-title').inner_text() == 'Opera popup title'
    assert page.locator('#dynamic-body').inner_text() == 'Opera popup details'
    assert page.locator('#new-note').get_attribute('data-closed') == '1'
    assert 'Do not modify' in page.locator('#cards').inner_text()
    browser.close()
