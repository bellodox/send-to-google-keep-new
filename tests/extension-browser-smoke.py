"""End-to-end extension browser smoke (no Google account / no network).
Starts unpacked MV3 extension in headless Chromium and tests Options -> New note -> editor.
This does not test live Google Keep; Keep HTML is simulated separately in Chromium fixtures.
"""
from pathlib import Path
from tempfile import TemporaryDirectory
from playwright.sync_api import sync_playwright

extension=str(Path(__file__).resolve().parents[1] / 'extension')
with TemporaryDirectory() as profile, sync_playwright() as p:
    ctx=p.chromium.launch_persistent_context(profile,executable_path='/usr/bin/chromium',headless=False,
      args=['--no-sandbox','--disable-extensions-except='+extension,'--load-extension='+extension])
    worker=ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event('serviceworker',timeout=15000)
    eid=worker.url.split('/')[2]
    print('extension_id',eid)
    options=ctx.new_page()
    options.goto(f'chrome-extension://{eid}/options.html')
    options.wait_for_selector('#new-note')
    assert options.locator('#reviewBeforeOpen').count()==1
    print('options-loaded',options.title())
    options.locator('#new-note').click()
    editor=ctx.wait_for_event('page',timeout=10000)
    editor.wait_for_load_state('domcontentloaded')
    assert '/editor.html?id=' in editor.url, editor.url
    editor.wait_for_selector('#note-title')
    assert editor.locator('#note-title').input_value()=='New note'
    print('editor-launched',editor.url.split('?')[0])
    editor.locator('#note-title').fill('An independent new note')
    editor.locator('#note-details').fill('Local draft')
    editor.locator('#copy').click()
    assert 'Copied' in editor.locator('#feedback').inner_text() or 'Clipboard unavailable' in editor.locator('#feedback').inner_text()
    print('editor-fields-and-manual-copy-working')
    ctx.close()
