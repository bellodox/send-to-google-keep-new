"""Browser DOM fixture: two sequential captures through a reused Keep tab.
The first title input replaces its body element. After Close, Keep re-renders the
collapsed composer and moves the completed note into saved cards. Neither new
insertion may overwrite an existing card or append to the previous note.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

src=Path(__file__).resolve().parents[1].joinpath('extension/keep-inject.js').read_text()
src=src.replace('export async function insertIntoKeep','async function insertIntoKeep')
src=src.replace("if (location.protocol !== 'https:' || location.hostname !== 'keep.google.com')",'if (false)')
html='''<!DOCTYPE html><html><head><style>
*{box-sizing:border-box}body{margin:0;font-family:Arial}
#header{height:76px;background:#eee}#frame{position:absolute;left:295px;top:96px;width:598px}
#collapsed{height:43px;border:1px solid #ccc;cursor:text;padding:12px}
#edit{width:598px;height:210px;position:relative;padding:10px 16px;border:1px solid #ddd}
.slot{position:absolute;left:15px;width:560px;height:35px;cursor:text}
#title-slot{top:12px}#body-slot{top:51px}
#body-slot.css-only:before{content:'Take a note...';color:#999}
#close{position:absolute;bottom:12px;right:20px;cursor:pointer;padding:3px 10px}
#saved{position:absolute;left:347px;top:355px;display:flex;gap:12px}
.card{width:220px;min-height:130px;border:1px solid #aaa;padding:10px}
</style></head><body><div id="header"><div role="combobox" aria-label="Search" style="position:absolute;top:10px;left:190px;width:350px;height:45px">Search</div></div>
<div id="frame"></div><div id="saved"><article role="gridcell" class="card"><p>Existing saved note</p></article></div>
<script>
let opened=0, closed=0, completed=[];
function reset(){const frame=document.querySelector('#frame');frame.innerHTML='<div id="collapsed" role="combobox">Take a note...</div>';frame.querySelector('#collapsed').onclick=open;}
function setup(slot,id,handler){const parent=document.getElementById(slot);parent.onclick=()=>{
 if(document.getElementById(id)){document.getElementById(id).focus();return;}
 parent.textContent='';const el=document.createElement('div');el.id=id;el.contentEditable='true';el.style.cssText='width:95%;height:29px';
 if(handler)el.addEventListener('input',handler);parent.appendChild(el);el.focus();};}
function open(){opened++;document.querySelector('#frame').innerHTML='<div id="edit"><div class="slot" id="title-slot"><span>Title</span></div><div class="slot" id="body-slot"><span>Take a note...</span></div><div id="close" role="button">Close</div></div>';
 setup('title-slot','title-input',()=>{let old=document.getElementById('body-slot'),fresh=document.createElement('div');fresh.id='body-slot';fresh.className='slot css-only';old.replaceWith(fresh);setup('body-slot','body-input');});
 setup('body-slot','body-input');
 document.querySelector('#close').onclick=()=>{
  const title=document.querySelector('#title-input')?.innerText,body=document.querySelector('#body-input')?.innerText;
  completed.push({title,body});closed++;
  const node=document.createElement('article');node.className='card';node.setAttribute('role','gridcell');node.innerHTML='<p></p><p></p>';
  node.children[0].textContent=title;node.children[1].textContent=body;
  document.querySelector('#saved').appendChild(node);reset();
 };
}
reset();
</script></body></html>'''
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':920,'height':639});page.set_content(html)
 result=page.evaluate(f"async()=>{{{src};const a=await insertIntoKeep({{title:'First page',body:'First body'}});const b=await insertIntoKeep({{title:'Second page',body:'Second body'}});return [a,b];}}")
 print('Two captures, one Keep page:',result,flush=True)
 assert all(x.get('ok') for x in result),result
 assert page.evaluate('opened')==2
 assert page.evaluate('closed')==2
 assert page.evaluate('completed')==[{'title':'First page','body':'First body'},{'title':'Second page','body':'Second body'}]
 assert 'Existing saved note' in page.locator('#saved').inner_text()
 assert page.locator('#saved article').count()==3
 browser.close()
