"""Chromium fixture for the three user-observed Opera Keep stages.
This validates UI event sequencing, not authenticated Google Keep.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

source = Path(__file__).resolve().parents[1].joinpath('extension/keep-inject.js').read_text()
source = source.replace('export async function insertIntoKeep', 'async function insertIntoKeep')
source = source.replace("if (location.protocol !== 'https:' || location.hostname !== 'keep.google.com')", "if (false)")

html = '''<!DOCTYPE html><html><head><style>
body{margin:0;font:15px Arial;background:white}header{height:76px;background:#f9fafb}
#source{position:absolute;left:294px;top:96px;width:600px}
#collapsed{height:45px;box-sizing:border-box;padding:14px 18px;border:1px solid #ddd;border-radius:9px;cursor:text}
#edit{height:186px;border:1px solid #ddd;box-sizing:border-box;border-radius:9px;position:relative;padding:12px 16px}
.line{height:35px;cursor:text}#title-slot:before{content:'Title';color:#888}#body-slot:before{content:'Take a note...';color:#888}
.line:has([contenteditable]):before{content:none}.type{width:90%;height:27px;outline:none}
#close-parent{position:absolute;right:13px;bottom:5px;cursor:pointer;padding:8px 15px}
#cards{position:absolute;top:330px;left:350px;display:flex;gap:14px}
.card{width:205px;height:175px;border:1px solid #ccc}
</style></head><body><header><div role="combobox" style="position:absolute;top:12px;left:190px;width:300px;height:45px" aria-label="Search">Search</div><div role="combobox" style="display:none">Other</div></header>
<div id="source"><div id="collapsed" role="combobox">Take a note...</div></div>
<div id="cards"><article class="card" role="gridcell"><div contenteditable="true" aria-label="Title">Old note</div><div contenteditable="true" aria-label="Note">DO NOT CHANGE</div></article></div>
<script>
let closed=0; let composerCount=0;
document.querySelector('#collapsed').addEventListener('click',()=>{
 composerCount++;
 const wrap=document.querySelector('#source');
 wrap.innerHTML=`<div id="edit"><div id="text-fields"><div id="title-slot" class="line"></div><div id="body-slot" class="line"></div></div><div id="close-parent"><div id="close-leaf">Close</div></div></div>`;
 const prepare=(slot,id,onInput)=>{
   document.querySelector(slot).onclick=()=>{
     if(document.getElementById(id)){document.getElementById(id).focus();return;}
     const field=document.createElement('div');field.contentEditable='true';field.className='type';field.id=id;
     if(onInput) field.addEventListener('input',onInput);
     document.querySelector(slot).append(field); field.focus();
   };
 };
 prepare('#title-slot','title-input',()=>{
   // The real Keep page can replace the body DOM after title changes.
   const old=document.querySelector('#body-slot');
   const newBody=document.createElement('div');newBody.id='body-slot';newBody.className='line';
   old.replaceWith(newBody);
   prepare('#body-slot','body-input',()=>{});
 });
 prepare('#body-slot','body-input',()=>{});
 document.querySelector('#close-parent').onclick=()=>{
   closed++;
   document.querySelector('#edit').dataset.closed='yes'; document.querySelector('#close-leaf').style.display='none';
 };
});
</script></body></html>'''

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':920,'height':639})
    page.set_content(html)
    result=page.evaluate(f"async () => {{ {source}; return await insertIntoKeep({{title:'.sx - Wikipedia',body:'Reference text: https://en.wikipedia.org/wiki/.sx'}}); }}")
    print('three-stage regression:',result,flush=True)
    assert result.get('ok'), result
    assert page.locator('#title-input').inner_text() == '.sx - Wikipedia'
    assert page.locator('#body-input').inner_text() == 'Reference text: https://en.wikipedia.org/wiki/.sx'
    assert page.locator('#edit').get_attribute('data-closed') == 'yes'
    assert page.locator('#cards').inner_text().find('DO NOT CHANGE')>=0
    assert page.evaluate('composerCount') == 1
    assert page.evaluate('closed') == 1
    browser.close()
