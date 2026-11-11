"""Ensure a delayed Keep rich-link redraw cannot cause second body insertion.
Live Opera GX Google Keep still requires verification. Uses real Chromium DOM.
"""
from pathlib import Path
import os
from playwright.sync_api import sync_playwright

path = Path(os.environ.get('KEEP_INJECT_PATH') or Path(__file__).resolve().parents[1] / 'extension/keep-inject.js')
source = path.read_text().replace('export async function insertIntoKeep', 'async function insertIntoKeep')
source = source.replace("if (location.protocol !== 'https:' || location.hostname !== 'keep.google.com')", 'if (false)')

html = '''<!doctype html><html><head><style>
*{box-sizing:border-box}body{margin:0;font:14px Arial}header{height:74px}
#frame{position:absolute;top:96px;left:295px;width:598px}
#collapsed{height:42px;border:1px solid #aaa;padding:12px;cursor:text}
#edit{height:230px;position:relative;border:1px solid #ccc;background:white}
.slot{position:absolute;left:16px;width:560px;min-height:30px;cursor:text}
#title-slot{top:14px}#body-slot{top:55px;min-height:70px}
#close{position:absolute;right:20px;bottom:14px;cursor:pointer;padding:5px}
#old{position:absolute;left:347px;top:410px;width:238px;height:100px;border:1px solid #aaa}
</style></head><body><header><div role="combobox" aria-label="Search" style="position:absolute;top:5px;left:185px;width:360px;height:44px">Search</div></header>
<div id="frame"><div id="collapsed" role="combobox"></div></div>
<div id="old" role="gridcell"><div contenteditable="true">Existing note must survive</div></div>
<script>
document.execCommand=(command,unused,text)=>{
  if(command!=='insertText' || !document.activeElement?.isContentEditable)return false;
  document.activeElement.textContent=text;
  document.activeElement.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:text}));
  return false; // Mutation happened even though execCommand returned false.
};
window.state={title:'',body:'',replacementWrites:0,closeClicks:0,bodyInputEvents:0};
const frame=document.getElementById('frame');
document.getElementById('collapsed').onclick=()=>{
 frame.innerHTML='<div id="edit"><div class="slot" id="title-slot">Title</div><div class="slot" id="body-slot">Take a note...</div><div id="close" role="button">Close</div></div>';
 function setup(id,type){
   const slot=document.getElementById(id);
   slot.onclick=()=>{
     if(slot.querySelector('[contenteditable]')){slot.querySelector('[contenteditable]').focus();return;}
     const editor=document.createElement('div');editor.id=type;editor.contentEditable='true';
     editor.style.cssText='min-width:100px;min-height:28px';slot.replaceChildren(editor);editor.focus();
     editor.addEventListener('input',()=>{
       if(type==='body') {state.body=editor.innerText;state.bodyInputEvents++;}
       else {
         state.title=editor.innerText;
         const old=document.getElementById('body-slot');
         const replacement=document.createElement('div');replacement.id='body-slot';replacement.className='slot';replacement.style.top='55px';
         const blank=document.createElement('div');blank.id='replacement-body';blank.contentEditable='true';blank.style.cssText='min-height:28px;min-width:120px';
         blank.addEventListener('input',()=>{state.replacementWrites++;});
         replacement.append(blank);old.replaceWith(replacement);
         window.setTimeout(()=>{
           if(!replacement.isConnected)return;
           const p=document.createElement('p');p.textContent=state.body;
           replacement.replaceChildren(p);
         },750);
       }
     });
   };
 }
 setup('title-slot','title');setup('body-slot','body');
 document.getElementById('close').onclick=()=>{state.closeClicks++;document.getElementById('close').style.display='none';};
};
</script></body></html>'''

with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':920,'height':639})
    page.set_content(html)
    body='Grandfather period ended in 2012.\n\nSource: https://en.wikipedia.org/wiki/.sx\n\nReference date (not a reminder): 2026-11-18'
    result=page.evaluate('''async ({src, body})=>{eval(src);return await insertIntoKeep({title:'.sx - Wikipedia',body});}''', {'src':source,'body':body})
    state=page.evaluate('state')
    assert state['bodyInputEvents']==1, 'Fallback wrote the same body twice: '+str(state)
    assert state['replacementWrites']==0, 'Body was reinserted after Keep redrew it: '+str(state)
    assert state['closeClicks']==1, 'Keep Close not executed: '+str(state)
    assert result['ok'] and result['uiClosed'],result
    assert page.locator('#body-slot').inner_text().count('Source:')==1
    assert page.locator('#body-slot').inner_text().count('Reference date')==1
    assert page.locator('#old').inner_text()=='Existing note must survive'
    print('PASS delayed-rich-repaint-once',result['code'],state,flush=True)
    browser.close()
