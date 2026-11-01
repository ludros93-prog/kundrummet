import assert from 'node:assert/strict';
import {bindPdfDelivery,opensNewTab} from './public/meeting-delivery.mjs';
function element(){return {hidden:true,disabled:false,textContent:'',handlers:{},classList:{toggle(){}},addEventListener(k,fn){this.handlers[k]=fn;},focus(){},scrollIntoView(){},click(){throw Error('Synthetic clicks must not start file delivery');}};}
let state={customer:'Test'},calls=0,shareError=null,resolveGeneration;
const ui=Object.fromEntries(['button','status','actions','download','open','share'].map(k=>[k,element()]));
const result={bytes:new Uint8Array([37,80,68,70]),filename:'Kundunderlag-Test.pdf',pageCount:16,replacedCharacters:[]};
const nav={canShare:({files})=>files[0].type==='application/pdf',share:({files})=>{calls++;assert.equal(files[0].name,result.filename);return shareError?Promise.reject(shareError):Promise.resolve();}};
const controller=bindPdfDelivery({...ui,getMeeting:()=>state,generate:()=>new Promise(r=>resolveGeneration=r),platform:{File,URL,navigator:nav}});
let pending=ui.button.handlers.click();assert(ui.button.disabled);assert(ui.actions.hidden);resolveGeneration(result);await pending;
assert(!ui.actions.hidden);assert(!ui.share.hidden);assert.equal(ui.download.download,result.filename);assert.equal(ui.download.href,ui.open.href);assert(ui.download.href.startsWith('blob:'));assert.equal(calls,0);
const sharing=ui.share.handlers.click();assert.equal(calls,1,'share called synchronously within click');await sharing;assert(!ui.share.disabled);
shareError=Object.assign(Error('cancelled'),{name:'AbortError'});await ui.share.handlers.click();assert.match(ui.status.textContent,/avbröts/);assert(!ui.actions.hidden);
shareError=Object.assign(Error('blocked'),{name:'NotAllowedError'});await ui.share.handlers.click();assert.match(ui.status.textContent,/Safari/);assert(!ui.actions.hidden);
controller.invalidate();assert(ui.actions.hidden);const prior=calls;await ui.share.handlers.click();assert.equal(calls,prior);
pending=ui.button.handlers.click();state={customer:'Changed'};resolveGeneration(result);await pending;assert(ui.actions.hidden);assert.match(ui.status.textContent,/ändrades/);
nav.canShare=()=>false;pending=ui.button.handlers.click();resolveGeneration(result);await pending;assert(ui.share.hidden);assert(!ui.actions.hidden);ui.download.handlers.click();assert.match(ui.status.textContent,/begärts/);assert(!/sparad|sparats/.test(ui.status.textContent));
const failedUI=Object.fromEntries(Object.keys(ui).map(k=>[k,element()]));
bindPdfDelivery({...failedUI,getMeeting:()=>state,generate:()=>Promise.reject(Error('Unavailable')),platform:{File,URL,navigator:nav}});
await failedUI.button.handlers.click();assert(failedUI.actions.hidden);assert(!failedUI.button.disabled);assert.match(failedUI.status.textContent,/kunde inte skapas/);
console.log('PASS: explicit file links, synchronous native sharing, cancellation, blocked sharing, unavailable sharing, stale snapshots and invalidation.');
// Added after v28: prepare without a click (restore), blob URLs are released, platform-aware copy, error name shown.
{
 const revoked=[],ready=[],cleared=[];
 const urlApi={createObjectURL:f=>URL.createObjectURL(f),revokeObjectURL:u=>{revoked.push(u);URL.revokeObjectURL(u);}};
 const iosUA='Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
 const iosNav={userAgent:iosUA,canShare:()=>true,share:()=>Promise.reject(Object.assign(Error('blocked'),{name:'NotAllowedError'}))};
 const ui2=Object.fromEntries(['button','status','actions','download','open','share'].map(k=>[k,element()]));
 const c2=bindPdfDelivery({...ui2,getMeeting:()=>state,generate:async()=>result,platform:{File,URL:urlApi,navigator:iosNav},onReady:x=>ready.push(x),onInvalidate:()=>cleared.push(true)});
 await c2.prepare();
 assert(!ui2.actions.hidden,'prepare() works without a click');
 assert.equal(ready.length,1);assert.deepEqual(ready[0],state);
 assert.match(ui2.status.textContent,/Spara i Filer/);
 const first=ui2.download.href;assert(first.startsWith('blob:'));
 await ui2.share.handlers.click();
 assert.match(ui2.status.textContent,/NotAllowedError/);assert.match(ui2.status.textContent,/Safari/);
 c2.invalidate();
 assert.deepEqual(revoked,[first],'invalidate releases the blob URL');
 assert.equal(ui2.download.href,'');assert.equal(ui2.open.href,'');assert.equal(cleared.length,1);
 const ui3=Object.fromEntries(['button','status','actions','download','open','share'].map(k=>[k,element()]));
 bindPdfDelivery({...ui3,getMeeting:()=>state,generate:async()=>result,platform:{File,URL,navigator:{userAgent:'Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile',canShare:()=>true,share:async()=>{}}}});
 await ui3.button.handlers.click();
 assert(!ui3.actions.hidden);assert(!/iPhone/.test(ui3.status.textContent),'no iPhone instruction on Android');
 console.log('PASS: prepare without click, released blob URLs, ready/invalidate callbacks, iOS and Android copy, share error name.');
}
// Added for computers: the PDF opens in a new tab only on a computer browser, never on phones, tablets or home-screen apps.
{
 const media=on=>({matchMedia:q=>({matches:on.includes(q)})});
 const desktop=['(pointer: fine)','(hover: hover)'];
 const mac={userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',platform:'MacIntel',maxTouchPoints:0};
 assert.equal(opensNewTab({...media(desktop),navigator:mac}),true,'Mac Safari');
 assert.equal(opensNewTab({...media(desktop),navigator:{userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130 Safari/537.36 Edg/130'}}),true,'Windows Edge');
 assert.equal(opensNewTab({...media([...desktop,'(display-mode: standalone)']),navigator:mac}),false,'installed app window');
 assert.equal(opensNewTab({...media(desktop),navigator:{...mac,maxTouchPoints:5}}),false,'iPad with trackpad');
 assert.equal(opensNewTab({...media(desktop),navigator:{userAgent:'Mozilla/5.0 (Linux; Android 14) Chrome/130'}}),false,'Android');
 assert.equal(opensNewTab({...media(['(pointer: coarse)']),navigator:{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)'}}),false,'iPhone');
 assert.equal(opensNewTab({navigator:mac}),false,'no matchMedia');
 const ui4=Object.fromEntries(['button','status','actions','download','open','share'].map(k=>[k,element()]));
 bindPdfDelivery({...ui4,getMeeting:()=>state,generate:async()=>result,platform:{File,URL,navigator:mac,...media(desktop)}});
 await ui4.button.handlers.click();
 assert.equal(ui4.open.target,'_blank');assert.equal(ui4.open.rel,'noopener');assert.equal(ui4.open.textContent,'Öppna PDF ↗');assert.match(ui4.status.textContent,/ny flik/);
 const ui5=Object.fromEntries(['button','status','actions','download','open','share'].map(k=>[k,element()]));
 bindPdfDelivery({...ui5,getMeeting:()=>state,generate:async()=>result,platform:{File,URL,navigator:{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)'},...media(['(pointer: coarse)'])}});
 await ui5.button.handlers.click();
 assert.equal(ui5.open.target,'_self');assert.equal(ui5.open.textContent,'Öppna PDF');
 console.log('PASS: new tab on computers only (Mac, Windows), same window on iPhone, iPad, Android and installed app.');
}
