import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanUrl,captureToNote,MAX_DETAILS} from '../extension/note.js';
test('privacy-sanitized YouTube URLs retain the actual video ID',()=>{
 const url=cleanUrl('https://www.youtube.com/watch?v=ABCD1234&utm_source=mail&si=secret&t=88',true);
 assert.ok(url.includes('v=ABCD1234'));assert.ok(url.includes('t=88'));
 assert.ok(!url.includes('utm_source'));assert.ok(!url.includes('si='));
});
test('Google search query remains functional without tracking identifiers',()=>{
 const url=cleanUrl('https://www.google.com/search?q=Google+Keep&ved=123&utm_campaign=x',true);
 assert.ok(url.includes('q=Google+Keep'));assert.ok(!url.includes('ved='));
});
test('long selected text reserves space for source URL',()=>{
 const source='https://www.example.org/article';
 const note=captureToNote({kind:'page',title:'Long',url:source,selection:'A'.repeat(8000)},{stripQuery:true,includeUrl:true});
 assert.ok(note.details.length<=MAX_DETAILS);
 assert.ok(note.details.endsWith('Source: '+source));
 assert.ok(note.details.startsWith('A'));
});
test('URL-embedded credentials are always removed',()=>{
 const url=cleanUrl('https://admin:token@example.org/path',false);
 assert.ok(!url.includes('admin'));assert.ok(!url.includes('token'));
});
test('existing identical Source line is not appended twice',()=>{
 const url='https://en.wikipedia.org/wiki/.sx';
 const note=captureToNote({kind:'selection',title:'Article',url,selection:`Fact text.\n\nSource: ${url}`},
    {stripQuery:true,includeUrl:true});
 assert.equal(note.details.split(`Source: ${url}`).length-1,1);
});

test('inline source after a sentence is normalized to one separate URL',()=>{
 const url='https://en.wikipedia.org/wiki/.sx';
 const note=captureToNote({kind:'selection',title:'.sx - Wikipedia',url,
   selection:`Sunrise period to protect trademark holders in 2012.Source: ${url}`},
   {stripQuery:true,includeUrl:true});
 assert.equal((note.details.match(/https:\/\/en\.wikipedia\.org\/wiki\/\.sx/g)||[]).length,1);
 assert.equal(note.details,'Sunrise period to protect trademark holders in 2012.\n\nSource: '+url);
});
test('source with tracking query is normalized rather than repeated',()=>{
 const url='https://www.youtube.com/watch?v=Abc1&utm_source=newsletter';
 const note=captureToNote({kind:'selection',title:'Video',url,
   selection:'Watch this. Source:https://www.youtube.com/watch?v=Abc1&utm_source=newsletter'},
   {stripQuery:true,includeUrl:true});
 assert.equal((note.details.match(/https:\/\//g)||[]).length,1);
 assert.equal(note.details,'Watch this.\n\nSource: https://www.youtube.com/watch?v=Abc1');
});
test('source URL already embedded without Source label is not duplicated',()=>{
 const url='https://en.wikipedia.org/wiki/.sx';
 const note=captureToNote({kind:'selection',title:'Wiki',url,selection:`This page: ${url}`},
    {includeUrl:true});
 assert.equal((note.details.match(/https:\/\//g)||[]).length,1);
});
test('repeated Source labels are folded to one canonical attribution',()=>{
 const url='https://en.wikipedia.org/wiki/.sx';
 const note=captureToNote({kind:'page',title:'Wiki',url,
   selection:`Text.Source: ${url}\nSource: ${url}`},{includeUrl:true});
 assert.equal((note.details.match(/https:\/\//g)||[]).length,1);
 assert.ok(note.details.endsWith('Source: '+url));
});
test('disabling URL attribution never removes source text already selected by the user',()=>{
 const url='https://en.wikipedia.org/wiki/.sx';
 const note=captureToNote({kind:'selection',title:'Source',url,
     selection:`Text. Source: ${url}`},{includeUrl:false});
 assert.equal(note.details,`Text. Source: ${url}`);
});
