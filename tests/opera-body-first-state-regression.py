"""Browser-level regression based on the reported Opera layout.
The Keep-like editor re-creates the body element on title input, but saves its
previous contents in application state. Body-first writing must survive.
This does NOT exercise a real authenticated Google Keep account.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

source = Path(__file__).resolve().parents[1].joinpath('extension/keep-inject.js').read_text()
source = source.replace('export async function insertIntoKeep', 'async function insertIntoKeep')
source = source.replace("if (location.protocol !== 'https:' || location.hostname !== 'keep.google.com')", 'if (false)')
html = '''<!doctype html><html><head><style>
*{box-sizing:border-box}body{margin:0;font:14px Arial}header{height:74px}
#frame{position:absolute;top:96px;left:295px;width:598px}
#collapsed{height:42px;border:1px solid #aaa;padding:12px;cursor:text}
#edit{height:210px;position:relative;border:1px solid #ccc}
.slot{position:absolute;left:16px;width:560px;height:31px;cursor:text}
#title-slot{top:14px}#body-slot{top:55px}
#close{position:absolute;right:20px;bottom:14px;cursor:pointer;padding:5px}
#old{position:absolute;left:347px;top:363px;width:238px;height:125px;border:1px solid #aaa}
</style></head><body><header><div role="combobox" aria-label="Search" style="position:absolute;top:5px;left:185px;width:360px;height:44px">Search</div></header>
<div id="frame"><div id="collapsed" role="combobox"></div></div>
<div id="old" role="gridcell"><div contenteditable="true">NEVER REPLACE</div><div>OLD BODY</div></div>
<script>
let keepState={title:'',body:''},bodyWrites=0,titleWrites=0,closeClicks=0;
const frame=document.querySelector('#frame');
document.querySelector('#collapsed').onclick=()=>{
 frame.innerHTML='<div id="edit"><div class="slot" id="title-slot">Title</div><div class="slot" id="body-slot">Take a note...</div><div id="close" role="button">Close</div></div>';
 function setup(id,type){
  const slot=document.getElementById(id);
  slot.onclick=()=>{
   if(slot.querySelector('[contenteditable]')){slot.querySelector('[contenteditable]').focus();return;}
   const input=document.createElement('div');input.id=type;input.contentEditable='true';input.style.cssText='min-width:100px;height:28px';
   slot.replaceChildren(input);input.focus();
   input.addEventListener('input',()=>{
    keepState[type]=input.innerText;
    if(type==='body')bodyWrites++;
    else {
     titleWrites++;
     const old=document.getElementById('body-slot');
     const replacement=document.createElement('div');replacement.id='body-slot';replacement.className='slot';replacement.style.top='55px';
     replacement.textContent=keepState.body;old.replaceWith(replacement);
     setup('body-slot','body');
     // Keep stores body text in application state across renderer replacement.
    }
   });
  };
 }
 setup('title-slot','title');setup('body-slot','body');
 document.getElementById('close').onclick=()=>{closeClicks++;document.getElementById('edit').dataset.closed='yes';document.getElementById('close').style.display='none';};
};
</script></body></html>'''

with sync_playwright() as pw:
 browser=pw.chromium.launch(headless=True, executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':920,'height':639})
 page.set_content(html)
 result=page.evaluate(f'''async()=>{{{source};return await insertIntoKeep({{title:'Report test title',body:'Reference details and source URL'}});}}''')
 print('body-first state-retained repaint:', result,flush=True)
 assert result['ok'], result
 assert page.evaluate('keepState')=={'title':'Report test title','body':'Reference details and source URL'}
 print('counts',page.evaluate('({bodyWrites,titleWrites,closeClicks,keepState})'),flush=True)
 assert page.evaluate('bodyWrites')==1
 assert page.evaluate('titleWrites')==1
 assert page.evaluate('closeClicks')==1
 assert 'NEVER REPLACE' in page.locator('#old').inner_text()
 browser.close()
