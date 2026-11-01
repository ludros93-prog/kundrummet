import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createMeetingPdf,pdfFilename} from './public/meeting-pdf.mjs';
import {PDFDocument} from './public/vendor/pdf-lib.mjs';
import {initialMeeting,syncSharedProfile,meetingResult,CONTRACTS} from './public/meeting-model.mjs';
import {annualProfile} from './public/model.mjs';
const fetcher=async path=>new Response(await readFile(new URL('./public'+path,import.meta.url)));
const fixture=()=>{const s=initialMeeting();Object.assign(s,{customer:'Åkeriet i Bjärred',business:'transport',period:'both',contract:'individual'});s.profiles['2025']=annualProfile(200000,'even');syncSharedProfile(s,'2025');return s;};
const format=n=>new Intl.NumberFormat('sv-SE',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n).replace(/\u00a0/g,' ');
for(const id of Object.keys(CONTRACTS)){
 const s=fixture();s.contract=id;s.stablePrice=500;s.fixedPrice=0;s.directPrice=80;const before=JSON.stringify(s),expected=meetingResult(s),out=await createMeetingPdf(s,{fetcher});
 assert.equal(JSON.stringify(s),before);assert(out.audit.some(x=>x.page===3&&x.text.includes('Det här kan fortfarande ändras')));assert(out.audit.some(x=>x.page===3&&x.text.includes('Offerten och avtalsvillkoren')));assert.equal(out.corePages,8);assert.equal(out.pageCount,10);assert.deepEqual(out.storyTitles,['FREJA','Repligen Sweden AB']);assert.equal(out.replacedCharacters.length,0);
 const pdf=await PDFDocument.load(out.bytes);assert.equal(pdf.getPageCount(),10);assert(pdf.getPages().every(p=>p.getWidth()===960&&p.getHeight()===540));
 const first=out.audit.filter(x=>x.page===4).map(x=>x.text).join('\n');assert(first.includes(format(expected.selected)+' kr'));assert(first.includes(format(expected.variable)+' kr'));assert(first.includes(format(Math.abs(expected.difference))+' kr'));assert(first.includes('21 av 24 månader'));
 assert(out.audit.some(x=>x.page===1&&x.text==='Det ni vill uppnå'));assert(out.audit.some(x=>x.page===2&&x.text==='Vad betyder avtalet för er?'));
 if(id==='stable')assert(first.includes('Beräknad merkostnad')&&first.includes('Ett prisscenario'));
 if(id==='quarter')assert(first.includes('Samma beräknade kostnad'));
 assert.equal(out.audit.filter(x=>x.text==='Saknar underlag').length,3);assert(out.audit.some(x=>x.text.includes('extrapoleras inte')));
}
const s=fixture();s.customer='W'.repeat(120);s.seller='W'.repeat(100);s.notes=('Långa mötesanteckningar med åäö och radbrytningar.\n').repeat(190);s.next='Ett nästa steg som följer med hela vägen. '.repeat(20);s.period='2025';s.goal='Budget och tydligt ansvar';s.recommendation='Välj en genomtänkt inköpsplan. '.repeat(60);s.checks='Kontrollera volym och villkor. '.repeat(60);s.owner='Karin';s.followUp='2026-11-12';
const long=await createMeetingPdf(s,{fetcher});assert(long.corePages>7);assert(long.audit.some(x=>x.text==='Nästa steg'));assert(long.audit.some(x=>x.text.includes('fortsättning')));assert(long.audit.every(x=>x.top+x.height<=530));
const bad=fixture();bad.customer='Bjärred ☀';const chars=await createMeetingPdf(bad,{fetcher});assert(chars.replacedCharacters.includes('☀'));
assert.equal(pdfFilename(fixture()),'Kundunderlag-Akeriet-i-Bjarred-both.pdf');
await assert.rejects(()=>createMeetingPdf(fixture(),{fetcher:async()=>new Response('',{status:404})}),/kunde inte hämtas/);
const requested=[];await createMeetingPdf(fixture(),{fetcher:async path=>{requested.push(path);return fetcher(path);}});assert(!requested.some(path=>path.includes('/presentations/')),'No draft presentation may be appended');
// Added after v28: the agreement explanation stays on its own page, above the footer, with the required clarifications.
for(const id of Object.keys(CONTRACTS)){
 const s=fixture();s.contract=id;s.stablePrice=500;s.fixedPrice=0;s.directPrice=80;
 const out=await createMeetingPdf(s,{fetcher}),page3=out.audit.filter(x=>x.page===3&&x.top>=170&&x.top<505),text=page3.map(x=>x.text).join(' ');
 assert.equal(out.corePages,8,id);
 assert(page3.every(x=>x.top+x.height<=496),id+': explanation runs into the footer');
 if(['individual','safe','offensive'].includes(id))assert(text.includes('finansiellt prisutfall')&&text.includes('inte tre separata'),id);
 if(['direct','stable'].includes(id))assert(text.includes('finansiellt prisavtal')&&text.includes('scenario'),id);
 if(id==='fixed')assert(text.includes('scenario'),id);
}
console.log('PDF: all agreements, exact costs, missing months, embedded stories, long notes, unsupported characters and failed assets passed.');
