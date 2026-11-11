import {validateNote,contentForKeep} from './note.js';
const id=new URLSearchParams(location.search).get('id');
const form=document.querySelector('#review-form');
const title=document.querySelector('#note-title');
const details=document.querySelector('#note-details');
const date=document.querySelector('#note-date');
const feedback=document.querySelector('#feedback');
const submit=document.querySelector('#submit');
const manual=document.querySelector('#manual');
const permission={origins:['https://keep.google.com/*']};
let authorized=await chrome.permissions.contains(permission);
let active=false;
function say(message,error=false){feedback.textContent=message;feedback.classList.toggle('error',error);}
function noteValue(){return validateNote({title:title.value,details:details.value,referenceDate:date.value});}
async function send(message){const response=await chrome.runtime.sendMessage(message);if(!response?.ok)throw new Error(response?.error||'No response from the extension.');return response;}
try {
  const {record}=await send({type:'getNote',id});
  if(!record||!['review','needs-attention'].includes(record.stage))throw new Error('This note is unavailable or already being inserted.');
  title.value=record.note.title;details.value=record.note.details;date.value=record.note.referenceDate||'';
  if(record.stage==='needs-attention'){
    submit.disabled=true;manual.hidden=false;
    say(record.error||'This attempt is uncertain. Check Keep before manually recovering the note.',true);
  }else if(!authorized) say('Allow Google Keep access when sending. Only keep.google.com is requested.');
  else say('Ready to open Google Keep.');
  title.focus();
} catch(error){say(error.message,true);submit.disabled=true;}
async function copy(value){try{await navigator.clipboard.writeText(value);say('Copied.');}catch(error){say(`Clipboard unavailable: ${error.message}`,true);}}
document.querySelector('#copy').onclick=()=>{try{const n=contentForKeep(noteValue());void copy([n.title,n.body].filter(Boolean).join('\n\n'));}catch(error){say(error.message,true);}};
document.querySelector('#copy-title').onclick=()=>void copy(title.value);
document.querySelector('#copy-details').onclick=()=>{try{void copy(contentForKeep(noteValue()).body);}catch(error){say(error.message,true);}};
document.querySelector('#open-manual').onclick=async()=>{try{await send({type:'manualOpen',id});say('Google Keep opened. Paste your note manually.');}catch(error){say(error.message,true);}};
form.addEventListener('submit',async(event)=>{
  event.preventDefault();
  if(active||submit.disabled)return;
  let note;try{note=noteValue();}catch(error){say(error.message,true);return;}
  // Call chrome.permissions.request synchronously from this user gesture.
  const grant=authorized ? Promise.resolve(true) : chrome.permissions.request(permission);
  active=true;submit.disabled=true;manual.hidden=true;
  try{
    if(!(await grant)){say('Keep site access was declined. Copy the note to paste it manually.',true);manual.hidden=false;return;}
    authorized=true;
    const launch=await send({type:'submitNote',id,note});
    if(!launch.accepted && !launch.automatic){say('Keep could not be opened automatically. The note is preserved.',true);manual.hidden=false;return;}
    say('Accepted. The existing Google Keep window will be reused when available.');
    // Observe the independent record, not a global pending slot.
    let final=null;
    for(let i=0;i<45;i++){
      await new Promise(resolve=>setTimeout(resolve,450));
      const {record}=await send({type:'getNote',id});
      if(!record)break;
      if(['inserted','needs-attention'].includes(record.stage)){final=record;break;}
    }
    if(final?.stage==='inserted'){
      say('Note inserted and Keep Close activated. Verify sync in Keep.');
      setTimeout(()=>window.close(),650);
    }else if(!final){
      const {record:latest}=await send({type:'getNote',id});
      if(latest?.stage==='ready' || latest?.stage==='opening' || latest?.stage==='inserting') {
        say('The note is scheduled for insertion. It will continue without keeping this editor open.');
        setTimeout(()=>window.close(),1500);
      }else{
        say(latest?.error || 'Insertion was not confirmed. Recover this note from Options.',true);
        manual.hidden=false;
      }
    }else{
      say(final.error || 'Insertion could not be confirmed. Your note is preserved.',true);
      manual.hidden=false;
    }
  }catch(error){say(`${error.message} Your note remains available in Options.`,true);manual.hidden=false;}
  finally{active=false;submit.disabled=false;}
});
