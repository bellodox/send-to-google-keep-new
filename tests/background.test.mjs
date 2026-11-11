import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.__KEEP_TEST_SETTLE_MS__=5;

const callbacks={};const session={};const local={};let granted=false;
const tabs=[],windows=[],scripts=[],toasts=[];
let nextTabId=1,nextWindowId=30,scenario={ok:true,code:'submitted-to-keep',message:'Inserted',closeClicked:true,uiClosed:true};
let popupFails=false,slowLoad=false,reloadCount=0,scriptDelayMs=0;
function event(name){return {addListener(fn){callbacks[name]=fn;}};}
function storage(data){return {
  async get(arg){if(typeof arg==='string')return {[arg]:data[arg]};if(Array.isArray(arg))return Object.fromEntries(arg.map(k=>[k,data[k]]));if(arg===null||arg===undefined)return {...data};return Object.fromEntries(Object.entries(arg).map(([k,v])=>[k,data[k]??v]));},
  async set(obj){Object.assign(data,obj);},async remove(keys){for(const k of [keys].flat()) delete data[k];}
};}
globalThis.chrome={
  runtime:{id:'test-keep',getURL:path=>`chrome-extension://test-keep/${path}`,onInstalled:event('installed'),onStartup:event('startup'),onMessage:event('message')},
  action:{onClicked:event('clicked'),setTitle:async()=>{}},
  contextMenus:{onClicked:event('context'),removeAll(cb){cb();},create(){}},
  windows:{onRemoved:event('windowRemoved'),async get(id){if(id===1)return {id,left:0,top:0,width:1366,height:768,type:'normal'};const win=windows.find(w=>w.id===id);if(!win)throw new Error('Window missing');return win;},
    async create(opts){if(popupFails&&opts.url==='https://keep.google.com/')throw new Error('popup unsupported');const id=nextWindowId++;
      const win={...opts,id,tabs:[]};windows.push(win);
      if(opts.url==='https://keep.google.com/') {const tab={id:nextTabId++,windowId:id,status:slowLoad?'loading':'complete',url:opts.url};tabs.push(tab);win.tabs.push(tab);}
      return win;},async remove(id){const idx=windows.findIndex(w=>w.id===id);if(idx<0)throw new Error('Window missing');windows.splice(idx,1);for(const tab of [...tabs].filter(t=>t.windowId===id)){const ti=tabs.indexOf(tab);if(ti>=0)tabs.splice(ti,1);callbacks.tabRemoved(tab.id);}callbacks.windowRemoved?.(id);},async update(){}},
  tabs:{onUpdated:event('tabUpdated'),onRemoved:event('tabRemoved'),async create(opts){const t={...opts,id:nextTabId++,status:'complete',windowId:15};tabs.push(t);return t;},
    async query(filter){return tabs.filter(t=>t.windowId===filter.windowId);},async get(id){const tab=tabs.find(t=>t.id===id);if(!tab)throw new Error('tab missing');return tab;},async update(id,opts){Object.assign(tabs.find(t=>t.id===id),opts);},async reload(id){const tab=tabs.find(t=>t.id===id);if(!tab)throw new Error('tab missing');reloadCount++;tab.status='loading';setTimeout(()=>{if(!tabs.includes(tab))return;tab.status='complete';callbacks.tabUpdated(id,{status:'complete'});},8);}},
  permissions:{async contains(){return granted;},async request(){granted=true;return true;}},
  storage:{session:storage(session),local:storage(local),onChanged:event('storageChange')},
  scripting:{async executeScript(args){scripts.push(args);if(scriptDelayMs)await new Promise(r=>setTimeout(r,scriptDelayMs));return [{result:scenario}];}},
  notifications:{async create(x){toasts.push(x);}},
  alarms:{onAlarm:event('alarm'),async create(){},async clear(){return true;}},
};
const {TEST_ONLY}=await import('../extension/background.js');
const sleep=(ms=25)=>new Promise(resolve=>setTimeout(resolve,ms));
async function reset(){
  for(const k of Object.keys(session))delete session[k];for(const k of Object.keys(local))delete local[k];
  granted=false;tabs.length=0;windows.length=0;scripts.length=0;toasts.length=0;
  nextTabId=1;nextWindowId=30;popupFails=false;slowLoad=false;reloadCount=0;scriptDelayMs=0;
  scenario={ok:true,code:'submitted-to-keep',message:'Inserted',closeClicked:true,uiClosed:true};await sleep();
}
async function msg(type, extra={},page='options.html') {return await new Promise(resolve=>{
  const on=callbacks.message({type,...extra},{id:chrome.runtime.id,url:chrome.runtime.getURL(page)},resolve);
  if(!on)resolve({ok:false,blocked:true});
});}
async function noteList(){return (await msg('listNotes')).records;}
function click(url,title='Example'){callbacks.clicked({id:999,url,title,windowId:1});}

await test('no-review + permission starts popup and inserts without Options',async()=>{
  await reset();granted=true;click('https://example.org/abc','First');await sleep(90);
  assert.equal(windows.filter(w=>w.url==='https://keep.google.com/').length,1);
  assert.equal(tabs.length,1);assert.equal(scripts.length,1);
  const rows=await noteList();assert.equal(rows[0].stage,'inserted');assert.equal(rows[0].note.title,'First');
});
await test('missing permission opens review to request it, never dead Keep tab',async()=>{
  await reset();click('https://example.org/a','A');await sleep(80);
  assert.equal(tabs.length,0);assert.equal(windows.length,1);assert.match(windows[0].url,/editor\.html\?id=/);
  assert.equal((await noteList())[0].stage,'review');
});
await test('sequential captures create independent records after previous insertion',async()=>{
  await reset();granted=true;click('https://example.org/a3','A');await sleep(70);
  click('https://example.org/b3','B');await sleep(70);
  const rows=await noteList();assert.equal(rows.length,2);
  assert.deepEqual(rows.map(r=>r.note.title),['B','A']);
  assert.deepEqual(rows.map(r=>r.stage),['inserted','inserted']);
  assert.equal(scripts.length,2);
  assert.equal(windows.filter(w=>w.url==='https://keep.google.com/').length,1, 'reuse the same window');
  assert.equal(reloadCount,1);
  assert.equal(rows[0].keepTabId,rows[1].keepTabId);
});
await test('first failure does NOT block second capture or accumulate a queue',async()=>{
  await reset();granted=true;scenario={ok:false,code:'composer-not-found',assisted:true,message:'Selector mismatch'};
  click('https://example.org/a','Failed');await sleep(70);
  assert.equal((await noteList())[0].stage,'needs-attention');
  scenario={ok:true,code:'closed-in-keep-ui',uiClosed:true};
  click('https://example.org/b','Next');await sleep(70);
  assert.deepEqual((await noteList()).map(r=>r.stage),['inserted','needs-attention']);
  assert.equal(scripts.length,2);
});
await test('review mode always opens its own editor and waits',async()=>{
  await reset();granted=true;local.reviewBeforeOpen=true;
  click('https://example.org/a','Review me');await sleep(50);
  assert.equal(windows.length,1);assert.match(windows[0].url,/editor\.html/);
  assert.equal(scripts.length,0);
});
await test('editor submits reviewed note to a separate Keep popup',async()=>{
  await reset();granted=true;local.reviewBeforeOpen=true;
  click('https://example.org/a','Before');await sleep(40);
  const r=(await noteList())[0];
  const answer=await msg('submitNote',{id:r.id,note:{title:'After',details:'Detailed',referenceDate:'2026-11-12'}},`editor.html?id=${r.id}`);
  assert.equal(answer.ok,true);await sleep(65);
  assert.equal(scripts.length,1);
  assert.equal(scripts[0].args[0].title,'After');
  assert.match(scripts[0].args[0].body,/2026-11-12/);
  assert.equal((await noteList())[0].stage,'inserted');
});
await test('a failed note remains recoverable and cannot be retried blindly',async()=>{
  await reset();granted=true;scenario={ok:false,partial:true,code:'needs-close',message:'Close not clicked'};
  click('https://example.org/a','Needs attention');await sleep(90);
  const r=(await noteList())[0];assert.equal(r.stage,'needs-attention');
  callbacks.tabUpdated(r.keepTabId,{status:'complete'});await sleep(70);
  assert.equal(scripts.length,1);
});
await test('fallback regular tab still attempts automatic insertion',async()=>{
  await reset();granted=true;popupFails=true;
  click('https://example.org/a','Fallback');await sleep(100);
  assert.equal(tabs.length,1);assert.equal(scripts.length,1);
  assert.equal((await noteList())[0].stage,'inserted');
});
await test('loading page triggers insertion when it completes (race fix)',async()=>{
  await reset();granted=true;slowLoad=true;
  click('https://example.org/a','Loading');await sleep(60);
  assert.equal(scripts.length,0);const t=tabs[0];t.url='https://keep.google.com/u/0/';t.status='complete';
  callbacks.tabUpdated(t.id,{status:'complete'});await sleep(70);
  assert.equal(scripts.length,1);assert.equal((await noteList())[0].stage,'inserted');
});
await test('fresh captures are never globally blocked by a previously editing note',async()=>{
  await reset();granted=false;
  click('https://example.org/a','A');await sleep(40);
  click('https://example.org/b','B');await sleep(40);
  assert.deepEqual((await noteList()).map(x=>x.stage),['review','review']);
  assert.equal(windows.length,2);
});
await test('stale rescue callback cannot complete different note',async()=>{
  await reset();granted=true;
  scenario={ok:false,assisted:true,code:'composer-not-found'};
  click('https://example.org/a11','A');await sleep(65);
  const r=(await noteList())[0];
  const result=await new Promise(resolve=>callbacks.message({type:'keepInsertionOutcome',draftId:'wrong',outcome:{ok:true}},
    {id:chrome.runtime.id,url:'https://keep.google.com/u/0/',tab:{id:r.keepTabId}},resolve));
  assert.equal(result.ok,false);assert.equal((await noteList())[0].stage,'needs-attention');
});
await test('no broad browsing permission nor Google OAuth required',async()=>{
  const manifest=JSON.parse((await import('node:fs/promises')).readFile?await(await import('node:fs/promises')).readFile(new URL('../extension/manifest.json',import.meta.url),'utf8'):'{}');
  assert.equal(manifest.oauth2,undefined);assert.equal(manifest.host_permissions,undefined);
  assert.deepEqual(manifest.optional_host_permissions,['https://keep.google.com/*']);
});
await test('three immediate different captures launch separately rather than increasing a blocking badge',async()=>{
  await reset();granted=true;
  click('https://x.example/one','First immediate');
  click('https://x.example/two','Second immediate');
  click('https://x.example/three','Third immediate');
  await sleep(110);
  const rows=await noteList();
  assert.equal(rows.length,3);
  assert.equal(rows.filter(r=>r.stage==='inserted').length,3);
  assert.equal(scripts.length,3);
  assert.equal(windows.filter(w=>w.url==='https://keep.google.com/').length,1);
  assert.equal(reloadCount,2);
});
await test('a timeout affects only its own record and not another capture',async()=>{
  await reset();granted=true;slowLoad=true;
  click('https://x.example/stuck','Stuck');await sleep(60);
  const r=(await noteList())[0];
  callbacks.alarm({name:'keep-capture-timeout:'+r.id});await sleep(50);
  assert.equal((await noteList())[0].stage,'needs-attention');
  slowLoad=false;
  click('https://x.example/next','Next works');await sleep(90);
  assert.deepEqual((await noteList()).map(x=>x.stage),['inserted','needs-attention']);
});
await test('uncertain notes cannot be automatically submitted a second time',async()=>{
  await reset();granted=true;
  scenario={ok:false,partial:true,code:'needs-close',message:'Partial note'};
  click('https://x.example/uncertain','Not verified');await sleep(70);
  const r=(await noteList())[0];
  const response=await msg('submitNote',{id:r.id,note:r.note},`editor.html?id=${r.id}`);
  assert.equal(response.ok,false);
  assert.match(response.error,/resubmission is disabled/i);
  assert.equal(scripts.length,1);
});

await test('unresolved partial insertion preserves its popup and opens separate recovery-safe window',async()=>{
  await reset();granted=true;scenario={ok:false,partial:true,code:'needs-close',message:'Partial'};
  click('https://example.org/a','Partial');await sleep(80);
  scenario={ok:true,code:'closed-in-keep-ui',uiClosed:true};
  click('https://example.org/b','After partial');await sleep(110);
  const rows=await noteList();assert.deepEqual(rows.map(r=>r.stage),['inserted','needs-attention']);
  assert.equal(windows.filter(w=>w.url==='https://keep.google.com/').length,2);
  assert.notEqual(rows[0].keepTabId,rows[1].keepTabId);
  assert.equal(reloadCount,0);
});
await test('reviewed and direct captures reuse the same popup without mixing content',async()=>{
  await reset();granted=true;
  click('https://example.org/first','First direct');await sleep(65);
  local.reviewBeforeOpen=true;
  click('https://example.org/second','Second reviewed');await sleep(45);
  const pending=(await noteList())[0];
  assert.equal(pending.stage,'review');
  await msg('submitNote',{id:pending.id,note:{title:'Second edited',details:'Two',referenceDate:''}},`editor.html?id=${pending.id}`);
  await sleep(110);
  assert.equal(windows.filter(w=>w.url==='https://keep.google.com/').length,1);
  assert.equal(scripts.length,2);
  assert.equal(scripts[0].args[0].title,'First direct');
  assert.equal(scripts[1].args[0].title,'Second edited');
});

await test('slow first insertion serializes three captures into one popup without losing a wakeup',async()=>{
  await reset();granted=true;scriptDelayMs=75;
  click('https://slow.example/one','One');
  click('https://slow.example/two','Two');
  click('https://slow.example/three','Three');
  await sleep(400);
  const rows=await noteList();
  assert.deepEqual(rows.map(r=>r.stage),['inserted','inserted','inserted']);
  assert.equal(windows.filter(w=>w.url==='https://keep.google.com/').length,1);
  assert.equal(scripts.length,3);
  assert.equal(reloadCount,2);
  assert.deepEqual(scripts.map(x=>x.args[0].title),['One','Two','Three']);
});
await test('same popup preserves Google account path on reuse',async()=>{
  await reset();granted=true;
  click('https://account.example/one','Account one');await sleep(75);
  const first=(await noteList())[0];
  const tab=tabs.find(t=>t.id===first.keepTabId);
  tab.url='https://keep.google.com/u/2/';
  click('https://account.example/two','Account two');await sleep(110);
  assert.equal(windows.filter(w=>w.url==='https://keep.google.com/').length,1);
  assert.equal(tab.url,'https://keep.google.com/u/2/');
  assert.equal((await noteList())[0].keepTabId,first.keepTabId);
});

await test('closing the reusable Keep popup creates a new one on the next capture',async()=>{
  await reset();granted=true;
  click('https://close.example/first','First');await sleep(80);
  const first=(await noteList())[0];
  await chrome.windows.remove(first.keepWindowId);await sleep(50);
  click('https://close.example/second','Second');await sleep(90);
  const second=(await noteList())[0];
  assert.equal(second.stage,'inserted');
  assert.notEqual(second.keepTabId,first.keepTabId);
  assert.notEqual(second.keepWindowId,first.keepWindowId);
  assert.equal(scripts.length,2);
});

await test('record recovery survives session clearing and startup',async()=>{
  await reset();granted=false;
  await TEST_ONLY.capture({kind:'page',url:'https://example.org/durable',title:'Durable draft'}, {forceReview:true,skipDebounce:true});
  const prior=await noteList();assert.equal(prior.length,1);assert.equal(prior[0].stage,'review');
  for(const key of Object.keys(session))delete session[key];
  callbacks.startup();await sleep(45);
  const after=await noteList();assert.equal(after.length,1);
  assert.equal(after[0].note.title,'Durable draft');
  assert.ok(Array.isArray(local.keepCaptureRecords));
});
await test('43 unfinished captures never silently evict earlier drafts',async()=>{
  await reset();granted=false;
  for(let n=0;n<43;n++) await TEST_ONLY.capture({kind:'page',url:`https://example.org/records/${n}`,title:`Review ${n}`},{forceReview:true,skipDebounce:true});
  const rows=await noteList();assert.equal(rows.length,43);
  assert.equal(rows.at(-1).note.title,'Review 0');
  assert.equal(rows[0].note.title,'Review 42');
});
await test('timeout cannot override a late successful Close confirmation from same attempt',async()=>{
  await reset();granted=true;scriptDelayMs=105;
  click('https://example.org/late','Late success');
  await sleep(48);
  const started=(await noteList())[0];
  assert.equal(started.stage,'inserting');
  callbacks.alarm({name:'keep-capture-timeout:'+started.id});
  await sleep(37);
  assert.equal((await noteList())[0].stage,'needs-attention');
  await sleep(95);
  const completed=(await noteList())[0];
  assert.equal(completed.stage,'inserted');
  assert.equal(completed.uiClosed,true);
  assert.equal(completed.cloudVerified,false);
});
await test('duplicate completed-tab callbacks never initiate duplicate insertion',async()=>{
  await reset();granted=true;slowLoad=true;
  click('https://example.org/duplicates','Only once');await sleep(60);
  const tab=tabs[0];tab.status='complete';tab.url='https://keep.google.com/u/0/';
  callbacks.tabUpdated(tab.id,{status:'complete'});
  callbacks.tabUpdated(tab.id,{status:'complete'});
  await sleep(120);
  assert.equal(scripts.length,1);
  assert.equal((await noteList())[0].stage,'inserted');
  assert.equal(toasts.filter(t=>/expected state/i.test(t.message)).length,0);
});
await test('no-op Close never yields background success',async()=>{
  await reset();granted=true;scenario={ok:false,partial:true,closeClicked:true,uiClosed:false,code:'close-unverified',message:'Editor remained open'};
  click('https://example.org/close-noop','No close');await sleep(75);
  const r=(await noteList())[0];
  assert.equal(r.stage,'needs-attention');
  assert.equal(r.partial,true);
  assert.equal(r.cloudVerified,false);
});
await test('changing the account path in the managed popup blocks insertion',async()=>{
  await reset();granted=true;slowLoad=true;
  click('https://example.org/account-first','First account');await sleep(45);
  const tab=tabs[0];tab.url='https://keep.google.com/u/0/';tab.status='complete';
  callbacks.tabUpdated(tab.id,{status:'complete'});await sleep(105);
  assert.equal((await noteList())[0].stage,'inserted');
  tab.url='https://keep.google.com/u/1/';
  click('https://example.org/account-second','Second account');await sleep(95);
  const rows=await noteList();
  assert.equal(rows[0].stage,'needs-attention');
  assert.match(rows[0].error,/switched account paths/i);
  assert.equal(scripts.length,1);
});
await test('active insertion cannot be removed from recovery',async()=>{
  await reset();granted=true;scriptDelayMs=105;
  click('https://example.org/busy-delete','Busy');await sleep(40);
  const rec=(await noteList())[0];assert.equal(rec.stage,'inserting');
  const answer=await msg('removeNote',{id:rec.id});
  assert.equal(answer.ok,false);assert.match(answer.error,/currently being sent/i);
  await sleep(130);
});
await test('completed-history purge retains all unresolved notes',async()=>{
  await reset();granted=true;
  click('https://example.org/done','Complete');await sleep(75);
  scenario={ok:false,partial:true,code:'close-unverified',message:'Still open'};
  click('https://example.org/uncertain','Unresolved');await sleep(75);
  const before=await noteList();assert.equal(before.length,2);
  assert.equal(before[0].stage,'needs-attention');
  const response=await msg('clearCompletedHistory');
  assert.equal(response.ok,true);assert.equal(response.deleted,1);
  const after=await noteList();assert.equal(after.length,1);
  assert.equal(after[0].note.title,'Unresolved');
});
await test('a spurious success without observed UI closure never marks inserted',async()=>{
  await reset();granted=true;
  scenario={ok:true,uiClosed:false,code:'close-clicked-unverified',closeClicked:true};
  click('https://example.org/noop','No proof');await sleep(90);
  const row=(await noteList())[0];
  assert.equal(row.stage,'needs-attention');assert.equal(row.uiClosed,false);
});
await test('200 pending drafts are retained and exceeding capacity is explicit',async()=>{
  await reset();granted=false;
  for(let n=0;n<200;n++) {
    await TEST_ONLY.capture({kind:'page',url:`https://example.org/drafts/${n}`,title:`Draft ${n}`},{forceReview:true,skipDebounce:true});
  }
  assert.equal((await noteList()).length,200);
  await assert.rejects(TEST_ONLY.capture({kind:'page',url:'https://example.org/cap',title:'Extra draft'},{forceReview:true,skipDebounce:true}),/full/i);
  assert.equal((await noteList()).length,200);
  assert.equal((await noteList()).at(-1).note.title,'Draft 0');
});
await test('user can confirm a saved note after false partial failure without reinserting',async()=>{
 await reset();granted=true;
 scenario={ok:false,partial:true,code:'body-not-verified',message:'Unknown body state'};
 click('https://example.org/note','Actually saved');await sleep(90);
 const before=(await noteList())[0];
 assert.equal(before.stage,'needs-attention');
 assert.equal(scripts.length,1);
 const reply=await msg('confirmSavedNote',{id:before.id});
 assert.equal(reply.ok,true);
 const after=(await noteList())[0];
 assert.equal(after.stage,'confirmed');
 assert.equal(after.cloudVerified,false);
 assert.equal(scripts.length,1);
});
