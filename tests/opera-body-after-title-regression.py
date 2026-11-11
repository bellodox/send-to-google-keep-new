"""Repro: Keep removes and replaces the body placeholder after title input.
The replacement has no title or body DOM labels and relies on CSS pseudo-text.
Successful code must re-target the body using the validated new composer, not
repeat title insertion or touch existing notes. Browser fixture, not live Keep.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

src = Path(__file__).resolve().parents[1].joinpath('extension/keep-inject.js').read_text()
src = src.replace('export async function insertIntoKeep', 'async function insertIntoKeep')
src = src.replace("if (location.protocol !== 'https:' || location.hostname !== 'keep.google.com')", 'if (false)')
html = '''<!DOCTYPE html><html><head><style>
*{box-sizing:border-box}body{margin:0;font:14px Arial;background:white}
header{height:76px;background:#fafafa}
#composer-wrap{position:absolute;left:295px;top:96px;width:598px}
#collapsed{height:43px;border:1px solid #ddd;border-radius:8px;padding:12px;cursor:text}
#edit{position:relative;width:598px;height:230px;border:1px solid #ddd;border-radius:8px;padding:12px 16px}
.slot{position:absolute;left:16px;width:560px;height:32px;cursor:text}
#title-slot{top:14px}#body-slot{top:52px}
#body-slot.css-placeholder:before{content:'Take a note...';color:#999}
#title-input,#body-input{width:92%;height:30px;outline:none}
#close{position:absolute;bottom:11px;right:20px;cursor:pointer;padding:4px 12px}
#existing{position:absolute;left:347px;top:365px;width:238px;height:120px;border:1px solid #ddd}
</style></head><body><header><div role="combobox" aria-label="Search" style="position:absolute;top:10px;left:190px;width:350px;height:45px">Search</div></header>
<div id="composer-wrap"><div id="collapsed" role="combobox">Take a note...</div></div>
<div id="existing" role="gridcell"><div contenteditable="true" aria-label="Title">DO NOT EDIT</div><div contenteditable="true" aria-label="Note">OLD CONTENT</div></div>
<script>
let titleWrites=0,bodyWrites=0,closeClicks=0;
document.querySelector('#collapsed').onclick=()=>{
 const holder=document.querySelector('#composer-wrap');
 holder.innerHTML='<div id="edit"><div class="slot" id="title-slot"><span>Title</span></div><div class="slot" id="body-slot"><span>Take a note...</span></div><div id="close" role="button">Close</div></div>';
 const add=(slotId,inputId,change)=>{
  const el=document.getElementById(slotId);
  el.onclick=()=>{
   if(document.getElementById(inputId)){document.getElementById(inputId).focus();return;}
   el.innerHTML='';
   const input=document.createElement('div'); input.id=inputId; input.contentEditable='true';
   if(change)input.addEventListener('input',change);
   el.append(input); input.focus();
  };
 };
 add('title-slot','title-input',()=>{
   titleWrites++;
   const prev=document.querySelector('#body-slot');
   const next=document.createElement('div');next.id='body-slot';next.className='slot css-placeholder';
   prev.replaceWith(next);
   add('body-slot','body-input',()=>{bodyWrites++;});
 });
 add('body-slot','body-input',()=>{bodyWrites++;});
 document.querySelector('#close').onclick=()=>{closeClicks++;document.querySelector('#edit').dataset.closed='yes';document.querySelector('#close').style.display='none';};
};
</script></body></html>'''

with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  page=browser.new_page(viewport={'width':920,'height':639})
  page.set_content(html)
  result=page.evaluate(f"async()=>{{ {src};return await insertIntoKeep({{title:'Keep body test',body:'Body survives re-render'}}); }}")
  print('Dynamic body replacement:',result,flush=True)
  assert result.get('ok'), result
  assert page.locator('#title-input').inner_text()=='Keep body test'
  assert page.locator('#body-input').inner_text()=='Body survives re-render'
  assert page.locator('#edit').get_attribute('data-closed')=='yes'
  assert page.evaluate('titleWrites')==1
  assert page.evaluate('closeClicks')==1
  assert page.locator('#existing').inner_text().find('DO NOT EDIT')>=0
  browser.close()
