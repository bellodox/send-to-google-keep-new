"""Browser-level Google Keep DOM integration tests, without logging into Google.
The fixtures deliberately model different composer shapes (including the user-reported
unlabelled placeholder), old note cards, native close, and the rescue control.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

source = Path(__file__).resolve().parents[1].joinpath('extension/keep-inject.js').read_text()
source = source.replace('export async function insertIntoKeep', 'async function insertIntoKeep')
source = source.replace("if (location.protocol !== 'https:' || location.hostname !== 'keep.google.com')", "if (false)")

# The fixture is explicitly not the live Google Keep DOM. It tests selector and
# event behavior under Chromium with simulated Keep markup.
variants = {
    'text-sibling': '''<section id="compose"><div id="composer" style="width:600px;height:46px;border:1px solid #ddd;display:flex;align-items:center" tabindex="0"><span id="placeholder">Take a note...</span></div></section>''',
    'combo-box': '''<section id="compose"><div id="composer" role="combobox" contenteditable="true" aria-placeholder="Take a note..." style="width:600px;height:46px"></div></section>''',
    'css-placeholder': '''<section id="compose"><div id="composer" class="h1U9Be-YPqjbf" contenteditable="true" style="width:600px;height:46px"></div></section>''',
    'unlabelled-editable': '''<section id="compose"><div id="composer" contenteditable="true" style="width:600px;height:46px"></div></section>''',
}

def doc(composer):
    return f'''<!DOCTYPE html><html><head><style>
        body{{margin:0;font-family:sans-serif}} #header{{height:110px;background:#f6f7f8}}
        #compose{{margin:90px 0 50px 40%;width:600px;height:60px}}
        #cards{{display:flex;margin:50px 0 0 33%;gap:20px}}
        article{{width:190px;min-height:130px;border:1px solid #ddd;padding:10px}}
        .new-note{{width:600px;border:1px solid #aaa;padding:12px}}
        .new-note>[contenteditable]{{min-height:32px;margin:8px 0}}
      </style></head><body><div id="header"><input aria-label="Search" style="width:400px;margin:20px"/></div>
      {composer}
      <div id="cards">
        <article role="gridcell" data-id="old-1"><div contenteditable="true" aria-label="Title">Weekly notes</div><div contenteditable="true" aria-label="Note">DO NOT OVERWRITE ONE</div></article>
        <article role="gridcell" data-id="old-2"><div contenteditable="true" aria-label="Title">Current goals</div><div contenteditable="true" aria-label="Note">DO NOT OVERWRITE TWO</div></article>
      </div>
      <script>
        document.querySelector('#composer').addEventListener('click', ()=>{{
          const container = document.querySelector('#compose');
          container.innerHTML = `<div class="new-note" id="new-note">
            <div id="new-title" role="textbox" contenteditable="true" aria-label="Title"></div>
            <div id="new-body" role="textbox" contenteditable="true" aria-label="Note"></div>
            <button id="close" type="button">Close</button></div>`;
          document.querySelector('#close').onclick=()=>{{
            document.querySelector('#new-note').setAttribute('data-closed','1'); document.querySelector('#close').style.display='none';
          }};
        }});
      </script></body></html>'''

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    for name, composer in variants.items():
        page = browser.new_page(viewport={'width':1366,'height':768})
        page.set_content(doc(composer))
        result = page.evaluate(f'''async () => {{ {source}; return await insertIntoKeep({{title:'A test title',body:'A plain note <b>must not inject HTML</b>'}}); }}''')
        print(name, result, flush=True)
        assert result.get('ok'), f'{name}: {result}'
        assert page.locator('#new-title').inner_text() == 'A test title'
        assert page.locator('#new-body').inner_text() == 'A plain note <b>must not inject HTML</b>'
        assert 'DO NOT OVERWRITE ONE' in page.locator('#cards').inner_text()
        assert 'DO NOT OVERWRITE TWO' in page.locator('#cards').inner_text()
        assert page.locator('#new-note').get_attribute('data-closed') == '1', name
        page.close()

    # Rescue UX on a page with a changed composer; user manually creates the
    # blank note, then retries via the in-page button.
    page = browser.new_page(viewport={'width':1366,'height':768})
    page.set_content(doc('<section id="compose"><button id="manual-create">New note</button></section>') + '''<script>
      document.querySelector('#manual-create').onclick=()=>{
        document.querySelector('#compose').innerHTML=`<div id="new-note" class="new-note"><div id="new-title" contenteditable="true" aria-label="Title"></div><div id="new-body" contenteditable="true" aria-label="Note"></div><button id="close">Close</button></div>`;
      };
      </script>''')
    result=page.evaluate(f'''async () => {{ {source}; return await insertIntoKeep({{title:'Fallback title',body:'Fallback details'}}); }}''')
    print('rescue',result,flush=True)
    assert result.get('assisted') is True
    page.locator('#manual-create').click()
    assert page.locator('#send-to-keep-rescue').count() == 1
    page.locator('#send-to-keep-rescue #retry').click()
    page.wait_for_function("document.querySelector('#new-title')?.textContent === 'Fallback title' && document.querySelector('#new-body')?.textContent === 'Fallback details'")
    assert page.locator('#new-title').inner_text() == 'Fallback title'
    assert page.locator('#new-body').inner_text() == 'Fallback details'
    assert 'DO NOT OVERWRITE ONE' in page.locator('#cards').inner_text()
    page.close()
    browser.close()
