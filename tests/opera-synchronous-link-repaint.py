"""Reproduce real Opera GX: Keep accepts a body write and immediately replaces
its contenteditable during URL-richification, before execCommand returns.
Browser fixture, not a signed-in Google Keep integration test.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import ast
import os

base = Path(__file__).resolve().parent
module=ast.parse((base/'opera-rich-link-autosave-regression.py').read_text())
html=next(ast.literal_eval(node.value) for node in module.body if isinstance(node,ast.Assign)
    for target in node.targets if isinstance(target,ast.Name) and target.id=='html')
needle="if(type==='body')keepState.bodyWrites++;"
assert needle in html
html=html.replace(needle,"""if(type==='body') {
      keepState.bodyWrites++;
      // The inserted text is committed into Keep's state, while the old
      // contenteditable is synchronously detached during the input event.
      const original=document.getElementById('body-slot');
      if(original){const replacement=document.createElement('div');
        replacement.id='body-slot';replacement.className='slot';replacement.style.top='55px';
        replacement.textContent=keepState.body;original.replaceWith(replacement);}
    }""")
source=Path(os.environ.get('KEEP_INJECT_PATH', str(base.parent/'extension/keep-inject.js'))).read_text()
source=source.replace('export async function insertIntoKeep','async function insertIntoKeep')
source=source.replace("if (location.protocol !== 'https:' || location.hostname !== 'keep.google.com')", 'if (false)')

with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':920,'height':639})
    page.set_content(html)
    page.evaluate('''() => {
      keepState.execCalls=0;
      const original=document.execCommand.bind(document);
      document.execCommand=(cmd,...args)=>{if(cmd==='insertText')keepState.execCalls++;return original(cmd,...args);};
    }''')
    body='The sx top-level domain is run on the CIRA Fury Registry Platform.\n\nSource: https://en.wikipedia.org/wiki/.sx'
    result=page.evaluate('''async ({source,body})=> {eval(source);return await insertIntoKeep({title:'.sx - Wikipedia',body});}''',{'source':source,'body':body})
    state=page.evaluate('keepState')
    print('RESPONSE',result,'STATE',state,flush=True)
    assert result['ok'] is True,result
    assert result['uiClosed'] is True,result
    assert state['title']=='.sx - Wikipedia',state
    assert state['body'].count('Source:')==1,state
    assert state['execCalls']==2,state # exactly one body write + one title write
    assert state['closeClicks']==1,state
    assert page.locator('#old').inner_text()=='Existing Important Note'
    browser.close()
