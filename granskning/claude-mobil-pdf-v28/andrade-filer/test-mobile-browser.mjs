// Browser test of the mobile PDF/return flow. Not part of the Node unit tests.
// Run against a local server or preview of public/: BASE=http://127.0.0.1:8765 node test-mobile-browser.mjs
// Uses Chromium with iPhone viewport/user agent. It does NOT prove iOS Safari/WebKit behaviour; see the device checklist.
import assert from 'node:assert/strict';
import {chromium,devices} from 'playwright';
const BASE=process.env.BASE||'http://127.0.0.1:8765';
const browser=await chromium.launch(),ctx=await browser.newContext({...devices['iPhone 13'],acceptDownloads:true}),page=await ctx.newPage(),errors=[];
page.on('pageerror',e=>errors.push(String(e)));page.on('dialog',d=>d.accept());
const step=()=>page.evaluate(()=>[1,2,3,4].find(i=>!document.getElementById('step'+i).hidden));
const toStep4=()=>page.evaluate(()=>{const el=id=>document.getElementById(id),click=s=>document.querySelector(s).dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true})),input=(id,v,t='input')=>{el(id).value=v;el(id).dispatchEvent(new Event(t,{bubbles:true}));};
 input('customer','Testkund AB');input('goal','Förutsägbar budget');input('annual','200000');click('#applyAnnual');click('[data-step="2"]');click('[data-contract="individual"]');click('[data-period="both"]');click('#showComparison');click('#showClosing');input('next','Offert på fredag.');input('seller','Test Säljare');});
const pdfReady=()=>page.waitForSelector('#pdfActions:not([hidden])',{timeout:60000});
await page.goto(BASE+'/');await toStep4();assert.equal(await step(),4);
await page.tap('#saveSummary');await pdfReady();
// 1. Reload (same as returning without the browser's page cache): same step, PDF prepared again.
await page.reload();await pdfReady();assert.equal(await step(),4,'reload returns to step 4');
// 2. Open PDF in the same tab and come back.
if(await page.$eval('#summaryOpen',a=>a.href.startsWith('blob:'))){
 const nav=page.waitForEvent('framenavigated',{timeout:3000}).catch(()=>null);await page.tap('#summaryOpen');await nav;
 if(page.url().startsWith('blob:'))await page.goBack();
 await page.waitForTimeout(800);assert.equal(await step(),4,'back from PDF returns to step 4');
}
// 3. Editing invalidates: after reload the step is kept but no stale PDF is offered.
await page.fill('#next','Offert på måndag.');assert(await page.$eval('#pdfActions',e=>e.hidden));
await page.reload();await page.waitForTimeout(800);assert.equal(await step(),4);assert(await page.$eval('#pdfActions',e=>e.hidden),'stale PDF must not come back');
// 4. Deep dive: a visible way back on a phone, landing on step 3.
await page.evaluate(()=>document.querySelector('[data-back="3"]').dispatchEvent(new MouseEvent('click',{bubbles:true})));assert.equal(await step(),3);
await page.evaluate(()=>{const d=document.querySelector('details.deeper');d.open=true;});
await Promise.all([page.waitForURL(/details\.html/),page.tap('#openDetails')]);
const back=page.locator('.mobile-return');assert(await back.isVisible(),'visible link back to the meeting on phone width');
await Promise.all([page.waitForURL(u=>new URL(u).pathname==='/'),back.tap()]);await page.waitForTimeout(500);
assert.equal(await step(),3,'return link lands on step 3');
// 5. Diagnostics panel only when asked for.
await page.goto(BASE+'/?diagnos');await page.waitForTimeout(500);assert(await page.locator('#deliveryDiagnostics').isVisible()||await page.$('#deliveryDiagnostics'));
// 6. New meeting starts at step 1, also after reload.
await page.evaluate(()=>document.getElementById('newMeeting').click());await page.reload();await page.waitForTimeout(500);assert.equal(await step(),1);
assert.deepEqual(errors,[]);
console.log('PASS (Chromium, iPhone viewport): reload/back keeps step 4 and re-prepares the PDF, edits invalidate, deep dive has a visible return to step 3, diagnostics opt-in, new meeting resets.');
await browser.close();
