import {readSettings,saveSettings,DEFAULT_SETTINGS} from './settings.js';
import {contentForKeep} from './note.js';
const permission={origins:['https://keep.google.com/*']};
const permissionStatus=document.querySelector('#permission-status');
const settingsStatus=document.querySelector('#settings-message');
const list=document.querySelector('#records');
const grantBtn=document.querySelector('#authorize');
async function send(message){const r=await chrome.runtime.sendMessage(message);if(!r?.ok)throw new Error(r?.error||'Operation failed.');return r;}
for(const [key,v] of Object.entries(await readSettings())) {
  const checkbox=document.getElementById(key);if(!checkbox)continue;checkbox.checked=v;
  checkbox.addEventListener('change',async()=>{
    try{await saveSettings({[key]:checkbox.checked});settingsStatus.textContent='Saved.';}
    catch(error){settingsStatus.textContent=error.message;}
  });
}
async function updatePermission(){const allowed=await chrome.permissions.contains(permission);
  permissionStatus.textContent=allowed?'Keep-only access granted. Captures can insert automatically.':'Keep access not yet granted. The first capture opens the editor to request it.';
  grantBtn.textContent=allowed?'Access enabled':'Allow Google Keep access';grantBtn.disabled=allowed;}
grantBtn.onclick=async()=>{const request=chrome.permissions.request(permission);try{await request;await updatePermission();}catch(error){permissionStatus.textContent=error.message;}};
document.getElementById('clear-completed').onclick=async()=>{
  if(!confirm('Remove completed note history from this device? Unfinished drafts will be retained.'))return;
  try{const result=await send({type:'clearCompletedHistory'});settingsStatus.textContent=`Removed ${result.deleted||0} completed records.`;await render();}
  catch(error){settingsStatus.textContent=error.message;}
};
document.getElementById('new-note').onclick=async()=>{try{await send({type:'newNote'});await render();}catch(error){settingsStatus.textContent=error.message;}};
function button(label,fn,variant='secondary'){const b=document.createElement('button');b.className=`button ${variant}`;b.type='button';b.textContent=label;b.onclick=async()=>{b.disabled=true;try{await fn();await render();}catch(error){settingsStatus.textContent=error.message;}finally{b.disabled=false;}};return b;}
async function copy(text){await navigator.clipboard.writeText(text);settingsStatus.textContent='Copied.';}
async function render(){const {records=[]}=await send({type:'listNotes'});list.replaceChildren();
  if(!records.length){const p=document.createElement('p');p.className='muted';p.textContent='No captures stored on this device.';list.append(p);return;}
  for(const r of records){const box=document.createElement('div');box.className='history-note';box.setAttribute('role','listitem');
    const strong=document.createElement('strong');strong.textContent=r.note.title;box.append(strong);
    const state=document.createElement('small');state.className='muted';state.textContent=`${r.stage==='inserted'?'Editor closed — Google sync unverified':r.stage==='confirmed'?'Verified by you':r.stage} · ${new Date(r.createdAt).toLocaleString()}`+(r.error?` · ${r.error}`:'');box.append(state);
    const actions=document.createElement('div');actions.className='actions wrap-actions';
    if(['review','needs-attention'].includes(r.stage))actions.append(button('Edit / recover',()=>send({type:'reviewNote',id:r.id})));
    if(r.stage==='needs-attention')actions.append(button('I verified it in Keep',async()=>{
      if(!confirm('Confirm only if you checked that this note exists in Google Keep. This does not independently verify cloud synchronization.'))return;
      await send({type:'confirmSavedNote',id:r.id});
    }));
    if(Number.isInteger(r.keepTabId))actions.append(button('Open Keep window',()=>send({type:'focusKeep',id:r.id})));
    actions.append(button('Copy note',()=>{const n=contentForKeep(r.note);return copy([n.title,n.body].filter(Boolean).join('\n\n'));}));
    actions.append(button('Remove',()=>send({type:'removeNote',id:r.id})));
    box.append(actions);list.append(box);
  }
}
await updatePermission();await render();
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local' && changes.keepCaptureRecords)void render();});
