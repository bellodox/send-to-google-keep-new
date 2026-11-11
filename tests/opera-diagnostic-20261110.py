"""Reproduce Opera GX diagnostics: an unlabelled top combobox at x295 y97
with a CSS-only Take a note... placeholder, three comboboxes total,
existing notes, and fields created on click. No Google connection.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
src = Path(__file__).resolve().parents[1].joinpath('extension/keep-inject.js').read_text()
src = src.replace('export async function insertIntoKeep', 'async function insertIntoKeep').replace(
    "if (location.protocol !== 'https:' || location.hostname !== 'keep.google.com')", "if (false)")
html = '''<!DOCTYPE html><html><head><style>
*{box-sizing:border-box}body{margin:0;font-family:Arial}
header{height:80px;background:#fafafa}
#search{position:absolute;left:190px;top:10px;width:390px;height:46px}
#composer{position:absolute;left:295px;top:97px;width:598px;height:42px;border:1px solid #ddd;cursor:text}
#composer:before{content:'Take a note...';position:absolute;left:17px;top:12px;color:gray}
#edit{position:absolute;left:295px;top:97px;width:598px;height:185px;border:1px solid #ddd}
#title-slot,#body-slot{position:absolute;left:15px;width:560px;height:36px;cursor:text}
#title-slot{top:12px}#body-slot{top:60px}#title-slot:before{content:'Title';color:gray}
#body-slot:before{content:'Take a note...';color:gray}
#title-slot:has([contenteditable]):before,#body-slot:has([contenteditable]):before{content:none}
.type{height:26px;width:95%;outline:none}
#close{position:absolute;right:18px;bottom:10px;cursor:pointer;padding:4px}
#old{position:absolute;left:346px;top:315px;width:240px;height:175px}
#old [contenteditable]{width:210px;height:30px}
</style></head><body><header><div id="search" role="combobox" aria-label="Search">Search</div><div role="combobox" style="display:none"></div></header>
<div id="slot"><div id="composer" role="combobox"></div></div>
<div id="old" role="gridcell"><div contenteditable="true" aria-label="Title">PREVIOUS NOTE</div>
<div contenteditable="false">Protected</div><div contenteditable="false">Protected</div>
<div contenteditable="false">Protected</div><div contenteditable="false">Protected</div>
<div contenteditable="false">Protected</div><div contenteditable="false">Protected</div>
<div contenteditable="false">Protected</div><div contenteditable="false">Protected</div></div>
<script>
let opened=0,closed=0;
function prepare(which,id,onInput){
 const slot=document.getElementById(which);
 slot.addEventListener('click', ()=>{
   if(document.getElementById(id)){document.getElementById(id).focus();return;}
   const el=document.createElement('div');el.id=id;el.className='type';el.contentEditable='true';
   if(onInput)el.addEventListener('input',onInput);
   slot.append(el);el.focus();
 });
}
document.getElementById('composer').onclick=()=>{
 opened++;
 document.getElementById('slot').innerHTML='<div id="edit"><div id="title-slot"></div><div id="body-slot"></div><div id="close">Close</div></div>';
 prepare('title-slot','title-input',()=>{
  const old=document.getElementById('body-slot');const fresh=document.createElement('div');fresh.id='body-slot';old.replaceWith(fresh);
  prepare('body-slot','body-input');
 });
 prepare('body-slot','body-input');
 document.getElementById('close').onclick=()=>{closed++;document.getElementById('edit').dataset.closed='yes';document.getElementById('close').style.display='none'};
};
</script></body></html>'''
with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  page=browser.new_page(viewport={'width':920,'height':639})
  page.set_content(html)
  result=page.evaluate(f"async () => {{ {src}; return await insertIntoKeep({{title:'Wikipedia .sx',body:'The contents of selected text and source URL'}}); }}")
  print('Opera diagnostic geometry regression:',result,flush=True)
  assert result['ok'],result
  assert page.locator('#title-input').inner_text()=='Wikipedia .sx'
  assert page.locator('#body-input').inner_text()=='The contents of selected text and source URL'
  assert page.evaluate('opened')==1
  assert page.evaluate('closed')==1
  assert page.locator('#old').inner_text().startswith('PREVIOUS NOTE')
  browser.close()
