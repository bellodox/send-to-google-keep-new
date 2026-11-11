"""Regression for Opera GX 920x639 with pointerdown/mousedown Close wrapper: Keep saves a rich-text body and generates
an inline link/preview after the title is added. Previous literal body-text
verification falsely reported missing details despite the visible saved note.
This is a controlled browser fixture, not an authenticated Keep integration test.
"""
from pathlib import Path
import os
from playwright.sync_api import sync_playwright

source = Path(os.environ.get('KEEP_INJECT_PATH') or Path(__file__).resolve().parents[1].joinpath('extension/keep-inject.js')).read_text()
source = source.replace('export async function insertIntoKeep', 'async function insertIntoKeep')
source = source.replace("if (location.protocol !== 'https:' || location.hostname !== 'keep.google.com')", 'if (false)')
html = '''<!doctype html><html><head><style>
*{box-sizing:border-box}body{margin:0;font:14px Arial}header{height:74px}
#frame{position:absolute;top:96px;left:295px;width:598px}
#collapsed{height:42px;border:1px solid #aaa;padding:12px;cursor:text}
#edit{height:290px;position:relative;border:1px solid #ccc;background:white}
.slot{position:absolute;left:16px;width:560px;min-height:31px;cursor:text}
#title-slot{top:14px}#body-slot{top:55px;max-height:190px}
#close-wrap{position:absolute;right:20px;bottom:14px;cursor:pointer;padding:5px}
#old{position:absolute;left:347px;top:410px;width:238px;height:100px;border:1px solid #aaa}
</style></head><body><header><div role="combobox" aria-label="Search" style="position:absolute;top:5px;left:185px;width:360px;height:44px">Search</div></header>
<div id="frame"><div id="collapsed" role="combobox"></div></div>
<div id="old" role="gridcell"><div contenteditable="true">Existing Important Note</div></div>
<script>
window.keepState={title:'',body:'',bodyWrites:0,titleWrites:0,closeClicks:0};
window.renderMode='rich';
const frame=document.querySelector('#frame');
document.querySelector('#collapsed').onclick=()=>{
 frame.innerHTML='<div id="edit"><div class="slot" id="title-slot">Title</div><div class="slot" id="body-slot">Take a note...</div><div id="close-wrap" role="button"><span id="close">Close</span></div></div>';
 function setup(id,type){
  const slot=document.getElementById(id);
  slot.onclick=()=>{
   if(slot.querySelector('[contenteditable]')){slot.querySelector('[contenteditable]').focus();return;}
   const input=document.createElement('div');input.id=type;input.contentEditable='true';input.style.cssText='min-width:100px;min-height:28px';
   slot.replaceChildren(input);input.focus();
   input.addEventListener('input',()=>{
    keepState[type]=input.innerText;
    if(type==='body')keepState.bodyWrites++;
    else {
     keepState.titleWrites++;
     const old=document.getElementById('body-slot');
     const replacement=document.createElement('div');replacement.id='body-slot';replacement.className='slot';replacement.style.top='55px';
     if(renderMode==='rich') {
       // Keep has retained the original user-entered string but redrawn it
       // with an inline link and a link-preview card. Visual output contains
       // the same semantic text without the newline separator.
       const match=keepState.body.match(/^(.*?)(?:\\s*Source:\\s*)(https?:\\/\\/\\S+)$/s);
       if(match){
         const p=document.createElement('p');p.textContent=match[1].trimEnd()+'Source: ';
         const a=document.createElement('a');a.href=match[2];a.textContent=match[2];p.append(a);
         const preview=document.createElement('div');preview.className='preview';preview.textContent=' .sx - Wikipedia | en.wikipedia.org';
         replacement.append(p,preview);
       } else replacement.textContent=keepState.body;
     } else replacement.textContent='';
     old.replaceWith(replacement);
     if(renderMode==='rich') setup('body-slot','body');
    }
   });
  };
 }
 setup('title-slot','title');setup('body-slot','body');
 document.getElementById('close-wrap').addEventListener('mousedown',()=>{keepState.closeClicks++;document.getElementById('close-wrap').style.display='none';});
};
</script></body></html>'''

def run(mode):
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
        page=browser.new_page(viewport={'width':920,'height':639})
        page.set_content(html)
        page.evaluate('(m)=>window.renderMode=m',mode)
        body='Sunrise period to protect trademark holders was conducted from 3 May to 4 July 2012.\n\nSource: https://en.wikipedia.org/wiki/.sx'
        result=page.evaluate('''async ({source,body}) => { eval(source); return await insertIntoKeep({title:'.sx - Wikipedia',body}); }''', {'source':source,'body':body})
        state=page.evaluate('keepState')
        assert 1 <= state['bodyWrites'] <= 6, 'The body was inserted twice after Keep changed its DOM: '+repr(state)
        assert state['body'].count('Source:')==1, state
        assert state['titleWrites']==1, state
        assert page.locator('#old').inner_text()=='Existing Important Note'
        if mode=='rich':
            assert result['ok'] is True, result
            assert result['uiClosed'] is True
            assert state['closeClicks']==1, state
            assert 'Source:' in page.locator('#body-slot').inner_text()
        else:
            assert result['ok'] is False, result
            assert result['code']=='body-not-verified', result
            assert state['closeClicks']==0
        print(mode, result, state, flush=True)
        browser.close()

run('rich')
run('missing')
