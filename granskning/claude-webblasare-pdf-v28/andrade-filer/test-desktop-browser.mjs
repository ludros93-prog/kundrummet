// Browser test of the PDF flow on a computer. Not part of the Node unit tests.
// Run against a local server or preview of public/: BASE=http://127.0.0.1:8766 node test-desktop-browser.mjs
// Uses full Chromium (channel 'chromium') at 1440x900 with mouse. Safari and Firefox on a computer are NOT covered; see the checklist in the report.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const BASE=process.env.BASE||'http://127.0.0.1:8766';
// Full Chromium is needed: the headless shell has no PDF viewer and downloads the PDF instead of showing it.
const browser=await chromium.launch({channel:process.env.CHANNEL||'chromium'});
const ctx=await browser.newContext({viewport:{width:1440,height:900},acceptDownloads:true}),page=await ctx.newPage(),errors=[];
page.on('pageerror',e=>errors.push(String(e)));page.on('dialog',d=>d.accept());
const step=()=>page.evaluate(()=>[1,2,3,4].find(i=>!document.getElementById('step'+i).hidden));
await page.goto(BASE+'/');
await page.evaluate(()=>{const el=id=>document.getElementById(id),click=s=>document.querySelector(s).dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true})),input=(id,v,t='input')=>{el(id).value=v;el(id).dispatchEvent(new Event(t,{bubbles:true}));};
 input('customer','Testkund AB');input('annual','200000');click('#applyAnnual');click('[data-step="2"]');click('[data-contract="individual"]');click('[data-period="both"]');click('#showComparison');click('#showClosing');input('next','Offert på fredag.');});
await page.click('#saveSummary');await page.waitForSelector('#pdfActions:not([hidden])',{timeout:60000});
// 1. Hämta PDF gives the real file name.
const [dl]=await Promise.all([page.waitForEvent('download'),page.click('#summaryDownload')]);
assert.match(dl.suggestedFilename(),/^Kundunderlag-Testkund-AB-both\.pdf$/);
// 2. Öppna PDF opens a new tab with the PDF; the meeting stays on step 4 with the PDF ready.
assert.equal(await page.$eval('#summaryOpen',a=>a.target),'_blank');
const [tab]=await Promise.all([ctx.waitForEvent('page'),page.click('#summaryOpen')]);
await tab.waitForLoadState().catch(()=>{});
assert(tab.url().startsWith('blob:'),'new tab shows the blob PDF: '+tab.url());
await tab.close();
assert.equal(await step(),4);assert(!(await page.$eval('#pdfActions',e=>e.hidden)));
// 3. Reload keeps step 4 and prepares the PDF again.
await page.reload();await page.waitForSelector('#pdfActions:not([hidden])',{timeout:60000});assert.equal(await step(),4);
// 4. Deep dive and back with the browser's Back button lands on step 3.
await page.evaluate(()=>document.querySelector('[data-back="3"]').dispatchEvent(new MouseEvent('click',{bubbles:true})));
await page.evaluate(()=>{document.querySelector('details.deeper').open=true;});
await Promise.all([page.waitForURL(/details\.html/),page.click('#openDetails')]);
await page.goBack();await page.waitForTimeout(800);assert.equal(await step(),3);
assert.deepEqual(errors,[]);
console.log('PASS (Chromium, computer): correct download name, PDF in new tab with meeting kept, reload keeps step 4, back from deep dive lands on step 3.');
await browser.close();
