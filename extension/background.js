// v0.2.7: durable independent capture records, serialized popup transaction,
// generation-aware completion and no blind retry of uncertain Keep writes.
import { captureToNote, validateNote, contentForKeep, keepHost } from './note.js';
import { insertIntoKeep } from './keep-inject.js';
import { readSettings } from './settings.js';

const RECORDS_KEY = 'keepCaptureRecords';
const KEEP_URL = 'https://keep.google.com/';
const KEEP_PERMISSION = { origins: ['https://keep.google.com/*'] };
const DEADLINE_PREFIX = 'keep-capture-timeout:';
const KEEP_WINDOW_KEY = 'keepReusableWindow';
const INSERT_SETTLE_MS = Number.isFinite(globalThis.__KEEP_TEST_SETTLE_MS__) ? globalThis.__KEEP_TEST_SETTLE_MS__ : 1200;
const HISTORY_RETAIN_MS = 30 * 24 * 60 * 60_000;
const MAX_OPEN_RECORDS = 200;
const MAX_HISTORY = 80;
const FRESH_DEBOUNCE_MS = 650;
let mutations = Promise.resolve();
let pumpPending = null;
let pumpRequested = false;
const running = new Set();
const recentlyCaptured = new Map();

function transaction(fn) {
  const current = mutations.then(fn);
  mutations = current.catch((error) => console.warn('Keep record operation:', error));
  return current;
}
async function readRecords() {
  // Durable across extension updates, reloads, browser restarts, and MV3 worker suspension.
  let {[RECORDS_KEY]: raw} = await chrome.storage.local.get(RECORDS_KEY);
  // Opportunistic migration for installations where the legacy session data
  // is still available. Browser restarts may already have cleared it.
  if(!Array.isArray(raw)) {
    const {[RECORDS_KEY]: legacy}=await chrome.storage.session.get(RECORDS_KEY);
    if(Array.isArray(legacy) && legacy.length) {
      raw=legacy;
      await chrome.storage.local.set({[RECORDS_KEY]:legacy});
    }
  }
  return Array.isArray(raw) ? raw.filter(r => r && r.id && r.note && Number.isFinite(r.createdAt)) : [];
}
function pruneCompleted(rows) {
  // NEVER remove drafts, in-flight transactions or uncertain outcomes implicitly.
  let kept = 0;
  const now = Date.now();
  return rows.filter(r => {
    if (!['inserted', 'confirmed', 'discarded'].includes(r.stage)) return true;
    if (kept >= MAX_HISTORY || now-(r.updatedAt || r.createdAt)>HISTORY_RETAIN_MS) return false;
    kept++;
    return true;
  });
}
async function writeRecords(rows) {
  await chrome.storage.local.set({[RECORDS_KEY]:pruneCompleted(rows)});
}
async function listRecords() { return readRecords(); }
async function getRecord(id) { return (await readRecords()).find(r => r.id === id) ?? null; }
async function changeRecord(id, patch, allowedStages) {
  return transaction(async () => {
    const rows = await readRecords();
    const i = rows.findIndex(r => r.id === id);
    if (i < 0) throw new Error('This note is no longer available.');
    if (allowedStages && !allowedStages.includes(rows[i].stage)) throw new Error('The note is no longer in the expected state.');
    rows[i] = {...rows[i], ...patch, updatedAt: Date.now()};
    await writeRecords(rows);
    return rows[i];
  });
}
async function insertRecord(record) {
  await transaction(async () => {
    const rows = await readRecords();
    const open = rows.filter(r=>!['inserted','confirmed','discarded'].includes(r.stage));
    if (open.length >= MAX_OPEN_RECORDS)
      throw new Error(`Local recovery is full (${MAX_OPEN_RECORDS} unfinished notes). Review or remove a draft in Options; no note was discarded.`);
    rows.unshift(record);
    await writeRecords(rows);
  });
}
async function forgetRecord(id) {
  await transaction(async () => {
    const rows = await readRecords();
    const r = rows.find(row=>row.id===id);
    if (r && ['opening','inserting'].includes(r.stage))
      throw new Error('This note is currently being sent. Do not remove it until the outcome is known.');
    await writeRecords(rows.filter(r=>r.id!==id));
  });
}
async function clearCompletedHistory() {
  return transaction(async()=>{
    const rows=await readRecords();
    const pending=rows.filter(r=>!['inserted','confirmed','discarded'].includes(r.stage));
    await writeRecords(pending);
    return {deleted:rows.length-pending.length};
  });
}
async function notify(title,message) {
  try { await chrome.notifications.create({type:'basic',title,message,iconUrl:'images/icon128.png',silent:true}); }
  catch (err) {console.warn('Keep notification unavailable:',err);}
}
function report(err) {console.error('Send to Keep:',err);void notify('Send to Google Keep',err?.message??String(err));}
function contextMenus() {
  chrome.contextMenus.removeAll(()=>{
    chrome.contextMenus.create({id:'capture-page',title:'Send page or selection to Google Keep',contexts:['page','selection']});
    chrome.contextMenus.create({id:'capture-link',title:'Send link to Google Keep',contexts:['link']});
  });
}
chrome.runtime.onInstalled.addListener(()=>{contextMenus();void markInterrupted().then(schedulePump).catch(report);});
chrome.runtime.onStartup.addListener(()=>void markInterrupted().then(schedulePump).catch(report));
chrome.alarms.onAlarm.addListener(alarm=>{
  if(!alarm.name.startsWith(DEADLINE_PREFIX))return;
  const id=alarm.name.slice(DEADLINE_PREFIX.length);
  void (async()=>{
    const wasTimedOut=await transaction(async()=>{
      const rows=await readRecords();const i=rows.findIndex(r=>r.id===id);
      if(i<0 || !['opening','inserting'].includes(rows[i].stage)) return false;
      rows[i]={...rows[i],stage:'needs-attention',partial:true,timedOut:true,
        error:'Insertion timed out; the outcome is unknown. Check the open Keep note before recovery.',updatedAt:Date.now()};
      await writeRecords(rows);return true;
    });
    if(wasTimedOut){await notify('Keep note needs attention','The insertion timed out; the draft remains available.');
      void schedulePump().catch(report);}
  })().catch(report);
});
async function markInterrupted() {
  await transaction(async()=>{
    const rows=await readRecords();let changed=false;
    for(const r of rows){
      if(['opening','inserting'].includes(r.stage)) {
        r.stage='needs-attention';r.partial=true;r.interrupted=true;
        r.error='Browser restarted or extension reloaded during insertion. Check the Keep note before retrying.';
        r.updatedAt=Date.now();changed=true;
      }
    }
    if(changed) await writeRecords(rows);
  });
}
chrome.action.onClicked.addListener(tab=>{
  const source = keepHost(tab?.url)
    ? {kind:'page',url:'',title:'New note',windowId:tab?.windowId}
    : {kind:'page',url:tab?.url??'',title:tab?.title??'',windowId:tab?.windowId};
  void capture(source,{forceReview:keepHost(tab?.url)}).catch(report);
});
chrome.contextMenus.onClicked.addListener((info,tab)=>{
  const source = info.menuItemId==='capture-link'
    ? {kind:'link',url:info.linkUrl??'',title:'',windowId:tab?.windowId}
    : {kind:'page',url:info.pageUrl??tab?.url??'',title:tab?.title??'',selection:info.selectionText??'',windowId:tab?.windowId};
  void capture(source).catch(report);
});
async function capture(source,{forceReview=false,skipDebounce=false}={}) {
  const now=Date.now();const key=JSON.stringify(source);
  if(!skipDebounce && now-(recentlyCaptured.get(key)??0)<FRESH_DEBOUNCE_MS) return {skipped:'rapid-duplicate'};
  recentlyCaptured.set(key,now);
  for(const [k,v] of recentlyCaptured) if(now-v>FRESH_DEBOUNCE_MS) recentlyCaptured.delete(k);
  const settings=await readSettings();
  const hasAccess=await chrome.permissions.contains(KEEP_PERMISSION);
  const review=Boolean(forceReview||settings.reviewBeforeOpen||!hasAccess);
  const record={id:crypto.randomUUID(),note:captureToNote(source,settings),stage:review?'review':'ready',
    createdAt:now,updatedAt:now,sourceWindowId:Number.isInteger(source.windowId)?source.windowId:null,
    permissionRequired:!hasAccess,keepTabId:null,keepWindowId:null,error:''};
  await insertRecord(record);
  if(review) await openReview(record);
  else void schedulePump().catch(report);
  return {id:record.id,stage:record.stage};
}
async function openReview(record) {
  try {
    const win=await chrome.windows.create({url:chrome.runtime.getURL(`editor.html?id=${encodeURIComponent(record.id)}`),
      type:'popup',focused:true,width:570,height:735});
    await changeRecord(record.id,{reviewWindowId:win?.id??null},['review','needs-attention']);
  } catch(err) {
    // A blocked popup must not strand the note in Options.
    try {
      await chrome.tabs.create({url:chrome.runtime.getURL(`editor.html?id=${encodeURIComponent(record.id)}`),active:true});
    } catch(fallbackError) {
      await changeRecord(record.id,{stage:'needs-attention',error:'Could not open the review editor. Open Options to recover this note.'});
      await notify('Note needs attention','Open extension Options to review and recover your note.');
    }
  }
}
// Only one capture is attached to the reusable popup at a time. The records
// themselves remain independent; an error on A never turns B into A.
function schedulePump() {
  if (pumpPending) { pumpRequested=true; return pumpPending; }
  const run = (async () => {
    const records = await readRecords();
    if (records.some(r=>['opening','inserting'].includes(r.stage))) return {busy:true};
    const next = [...records].reverse().find(r=>r.stage==='ready');
    if (!next) return {idle:true};
    return launchKeep(next.id);
  })();
  pumpPending=run;
  function done() {
    if(pumpPending===run) pumpPending=null;
    // A callback may have finished while the first pump was still starting.
    // Never lose the wakeup; otherwise new captures remain in ready forever.
    if(pumpRequested) {
      pumpRequested=false;
      void schedulePump().catch(report);
    }
  }
  run.then(done,done);
  return run;
}
async function storedWindow() {
  const {[KEEP_WINDOW_KEY]: saved} = await chrome.storage.local.get(KEEP_WINDOW_KEY);
  if (!saved || !Number.isInteger(saved.tabId) || !Number.isInteger(saved.windowId)) return null;
  try {
    const tab=await chrome.tabs.get(saved.tabId);
    const win=await chrome.windows.get(saved.windowId);
    if (!keepHost(tab.url) || tab.windowId!==win.id || win.type!=='popup') throw new Error('Not a managed Keep popup');
    const accountMatch=String(tab.url||'').match(/^https:\/\/keep\.google\.com(\/u\/\d+)(?:\/|$)/);
    if(saved.accountPath && accountMatch && saved.accountPath!==accountMatch[1])
      return {tabId:tab.id,windowId:win.id,accountChanged:true,accountPath:saved.accountPath};
    return {tabId:tab.id,windowId:win.id,accountPath:saved.accountPath || null};
  } catch {
    await chrome.storage.local.remove(KEEP_WINDOW_KEY);
    return null;
  }
}
async function createKeepWindow(record) {
  const settings=await readSettings();
  if(settings.openKeepPopup) {
    const existing=await storedWindow();
    if(existing) {
      if(existing.accountChanged) throw new Error('The Keep popup switched account paths. Close that popup and verify the intended Google account before resending.');
      // Do not navigate away from a possibly partial note. Preserve it for
      // human recovery; only in this exceptional case open another popup.
      const records=await readRecords();
      const unresolved=records.some(r=>r.keepTabId===existing.tabId &&
        r.stage==='needs-attention' && r.partial === true);
      if (!unresolved) {
        await chrome.windows.update(existing.windowId,{focused:true});
        await chrome.tabs.update(existing.tabId,{active:true});
        // Reload to create a guaranteed fresh Keep composer and preserve
        // the selected /u/N account. Never inject into the previous editor.
        // The preceding script has observed editor closure, but not cloud sync.
        // Let the UI settle before navigating; never reload a partial note.
        await new Promise(resolve=>setTimeout(resolve,INSERT_SETTLE_MS));
        await chrome.tabs.reload(existing.tabId);
        return {...existing,reused:true,awaitLoad:true};
      }
    }
    const opts={url:KEEP_URL,type:'popup',focused:true,width:920,height:680};
    if(Number.isInteger(record.sourceWindowId)) {
      try {const src=await chrome.windows.get(record.sourceWindowId);
        if(Number.isFinite(src.left)&&Number.isFinite(src.top)&&Number.isFinite(src.width)&&Number.isFinite(src.height)) {
          opts.width=Math.min(920,Math.max(660,src.width-64));opts.height=Math.min(680,Math.max(500,src.height-72));
          opts.left=Math.max(0,src.left+Math.round((src.width-opts.width)/2));
          opts.top=Math.max(0,src.top+Math.round((src.height-opts.height)/2));
        }
      } catch { /* platform chooses position */ }
    }
    try {
      const win=await chrome.windows.create(opts);
      let tab=win?.tabs?.find(t=>Number.isInteger(t.id));
      if(!tab && Number.isInteger(win?.id)) tab=(await chrome.tabs.query({windowId:win.id})).find(t=>Number.isInteger(t.id));
      if(tab) {
        await chrome.storage.local.set({[KEEP_WINDOW_KEY]:{tabId:tab.id,windowId:win.id}});
        return {tabId:tab.id,windowId:win.id,reused:false};
      }
      if(Number.isInteger(win?.id)) await chrome.windows.remove(win.id);
    } catch(error){console.warn('Opera popup unavailable:',error);}
  }
  // Popup unsupported: fallback tab still attempts insertion automatically.
  const tab=await chrome.tabs.create({url:KEEP_URL,active:true});
  if(!Number.isInteger(tab?.id)) throw new Error('Opera did not return a Keep tab.');
  return {tabId:tab.id,windowId:tab.windowId??null,reused:false};
}
async function launchKeep(id) {
  const record=await getRecord(id);
  if (!record || record.stage!=='ready') throw new Error('This capture is not ready for automatic insertion.');
  if(!(await chrome.permissions.contains(KEEP_PERMISSION))) {
    await changeRecord(id,{stage:'review',error:'Grant Keep-only site access to send automatically.'},['ready']);
    await openReview({...record,stage:'review'});
    return {needsPermission:true};
  }
  await changeRecord(id,{stage:'opening',error:'',attemptId:crypto.randomUUID(),partial:false,timedOut:false},['ready']);
  let destination;
  try {destination=await createKeepWindow(record);} catch(error) {
    await changeRecord(id,{stage:'needs-attention',error:`Cannot open Keep: ${error.message}`},['opening']);
    void schedulePump().catch(report);
    throw error;
  }
  await changeRecord(id,{stage:'opening',keepTabId:destination.tabId,keepWindowId:destination.windowId},['opening']);
  try {await chrome.alarms.create(DEADLINE_PREFIX+id,{when:Date.now()+65_000});}
  catch(error){console.warn('Keep timeout monitor unavailable:',error);}
  // Reused popup is reloading; onUpdated(status=complete) will trigger the
  // only insertion attempt after the fresh Keep editor is available.
  void tryInsert(destination.tabId).catch(report);
  return {automatic:true,...destination};
}
chrome.tabs.onUpdated.addListener((id,change)=>{
  if(change.status==='complete') void tryInsert(id).catch(report);
});
chrome.tabs.onRemoved.addListener(id=>{
  void (async()=>{
    const {[KEEP_WINDOW_KEY]: win}=await chrome.storage.local.get(KEEP_WINDOW_KEY);
    if(win?.tabId===id) await chrome.storage.local.remove(KEEP_WINDOW_KEY);
    const record=(await readRecords()).find(r=>r.keepTabId===id && ['opening','inserting'].includes(r.stage));
    if(record) {
      await changeRecord(record.id,{stage:'needs-attention',partial:true,error:'Keep window closed before insertion confirmation. Outcome unknown.'});
      void schedulePump().catch(report);
    }
  })().catch(report);
});
async function tryInsert(tabId) {
  const records=await readRecords();
  const record=records.find(r=>r.keepTabId===tabId && r.stage==='opening');
  if(!record || running.has(record.id)) return;
  // Acquire the in-worker lock BEFORE any awaited browser call. Overlapping
  // tabs.onUpdated events are normal, and must never generate an error toast.
  running.add(record.id);
  try {
    let tab;
    try {tab=await chrome.tabs.get(tabId);} catch {return;}
    if(tab.status!=='complete'||!keepHost(tab.url)) return;
    let claimed;
    try {claimed=await changeRecord(record.id,{stage:'inserting',writeStartedAt:Date.now()},['opening']);}
    catch {return;} // Already claimed by another event/worker: idempotent no-op.
    const attemptId=claimed.attemptId;
    const {title,body}=contentForKeep(claimed.note);
    let outcome;
    try {
      const responses=await chrome.scripting.executeScript({target:{tabId},func:insertIntoKeep,
        args:[{title,body,draftId:claimed.id}]});
      outcome=responses?.[0]?.result;
      if(!outcome) throw new Error('Keep returned no insertion result.');
    } catch(error) {outcome={ok:false,partial:true,code:'injection-error',message:`Keep insertion result is unknown: ${error.message}`};}
    try {await chrome.alarms.clear(DEADLINE_PREFIX+claimed.id);}catch{/* continue */}
    // Reconcile late success AFTER a timeout, but only from the same attempt.
    // An uncertain failure never overwrites a successful UI-close result.
    const result=await transaction(async()=>{
      const rows=await readRecords();const i=rows.findIndex(r=>r.id===claimed.id);
      if(i<0 || rows[i].attemptId!==attemptId) return null;
      const prior=rows[i];
      if(!['inserting','needs-attention'].includes(prior.stage)) return null;
      if(prior.stage==='needs-attention' && !prior.timedOut && !prior.interrupted) return null;
      const uiClosed=Boolean(outcome?.ok && outcome?.uiClosed === true);
      // Never mark an insertion successful solely because close.click() ran.
      const row={...prior,stage:uiClosed?'inserted':'needs-attention',
        error:uiClosed?'':(outcome?.message || outcome?.code || 'Keep outcome unknown.'),
        insertedAt:uiClosed?Date.now():null,
        insertionCode:outcome?.code || '',
        partial:!uiClosed && (Boolean(outcome?.partial)||Boolean(prior.partial)),
        timedOut:false, uiClosed,cloudVerified:false,updatedAt:Date.now()};
      rows[i]=row;await writeRecords(rows);return row;
    });
    if(result?.stage==='inserted') {
      try {
        const live=await chrome.tabs.get(tabId);
        const path=String(live.url||'').match(/^https:\/\/keep\.google\.com(\/u\/\d+)(?:\/|$)/)?.[1];
        const {[KEEP_WINDOW_KEY]: saved}=await chrome.storage.local.get(KEEP_WINDOW_KEY);
        if(path && saved?.tabId===tabId && !saved.accountPath)
          await chrome.storage.local.set({[KEEP_WINDOW_KEY]:{...saved,accountPath:path}});
      } catch {/* destination check cannot independently prove account identity */}
    }
    if(result?.stage==='needs-attention' && !outcome?.assisted)
      await notify('Keep note needs attention','Automatic insertion did not finish. Review the preserved draft in Keep or Options.');
  } finally {
    running.delete(record.id);
    // Do not reuse Keep until the injection returns and the state reconciles.
    void schedulePump().catch(report);
  }
}
function senderIs(sender,file) {
  try {return sender.id===chrome.runtime.id && new URL(sender.url).pathname===new URL(chrome.runtime.getURL(file)).pathname;}
  catch {return false;}
}
async function focusKeep(id) {
  const record=await getRecord(id);if(!record) throw new Error('Note not found.');
  if(!Number.isInteger(record.keepTabId)) throw new Error('There is no Keep tab for this note.');
  const tab=await chrome.tabs.get(record.keepTabId);
  if(!keepHost(tab.url)) throw new Error('The tab no longer displays Google Keep.');
  await chrome.tabs.update(tab.id,{active:true});
  if(Number.isInteger(tab.windowId)) await chrome.windows.update(tab.windowId,{focused:true});
  return {focused:true};
}
async function manualOpen(id) {
  const record=await getRecord(id);if(!record)throw new Error('Note missing.');
  await chrome.tabs.create({url:KEEP_URL,active:true});
  await changeRecord(id,{stage:'needs-attention',error:'Keep opened for manual copying. The extension has not inserted this note.'});
  return {manual:true};
}
chrome.runtime.onMessage.addListener((msg,sender,respond)=>{
  let handler=null;
  if(senderIs(sender,'editor.html')) {
    if(msg?.type==='getNote') handler=async()=>({record:await getRecord(msg.id)});
    if(msg?.type==='submitNote') handler=async()=>{
      const rec=await getRecord(msg.id);
      if(!rec||rec.stage!=='review')throw new Error('Automatic resubmission is disabled for uncertain notes. Check Keep and use manual recovery to avoid duplicates.');
      const note=validateNote(msg.note);
      await changeRecord(msg.id,{note,stage:'ready',error:''},['review','needs-attention']);
      void schedulePump().catch(report);
      return {automatic:true,accepted:true};
    };
    if(msg?.type==='manualOpen') handler=()=>manualOpen(msg.id);
  }
  if(senderIs(sender,'options.html')) {
    if(msg?.type==='listNotes') handler=async()=>({records:await listRecords()});
    if(msg?.type==='removeNote') handler=async()=>{await forgetRecord(msg.id);return {};};
    if(msg?.type==='clearCompletedHistory') handler=()=>clearCompletedHistory();
    if(msg?.type==='confirmSavedNote') handler=async()=>{
      const prior=await getRecord(msg.id);
      if(!prior || prior.stage!=='needs-attention') throw new Error('Only uncertain notes can be confirmed manually.');
      await changeRecord(msg.id,{stage:'confirmed',error:'',partial:false,cloudVerified:false,
        userConfirmedAt:Date.now()},['needs-attention']);
      return {confirmed:true};
    };
    if(msg?.type==='reviewNote') handler=async()=>{
      const r=await getRecord(msg.id);if(!r)throw new Error('Note not found.');
      if(!['needs-attention','review'].includes(r.stage))throw new Error('Already launched.');
      await openReview(r);return {};
    };
    if(msg?.type==='focusKeep') handler=()=>focusKeep(msg.id);
    if(msg?.type==='newNote') handler=()=>capture({kind:'page',url:'',title:'New note',windowId:null},
      {forceReview:true,skipDebounce:true});
  }
  if(msg?.type==='keepInsertionOutcome' && sender.id===chrome.runtime.id && sender.tab && keepHost(sender.url)) {
    handler=async()=>{
      const r=await getRecord(msg.draftId);
      if(!r||r.keepTabId!==sender.tab.id ||r.stage!=='needs-attention')
        throw new Error('This Keep window does not match the pending note.');
      const records=await readRecords();
      if(records.some(other=>other.id!==r.id && other.keepTabId===r.keepTabId &&
          other.updatedAt>r.updatedAt))
        throw new Error('This popup has already been reused for a newer capture. Recover the older note from Options.');
      if(!msg.outcome?.ok || msg.outcome?.uiClosed!==true) throw new Error('The note did not visibly close in Keep.');
      try {await chrome.alarms.clear(DEADLINE_PREFIX+r.id);}catch{/* continue */}
      await changeRecord(r.id,{stage:'inserted',error:'',partial:false,uiClosed:true,cloudVerified:false,insertedAt:Date.now(),insertionCode:'manual-recovery'});
      return {};
    };
  }
  if(!handler)return false;
  void handler().then(value=>respond({ok:true,...value}),error=>respond({ok:false,error:error?.message??String(error)}));
  return true;
});

export const TEST_ONLY={capture,getRecord,listRecords,tryInsert,launchKeep,schedulePump,storedWindow};
