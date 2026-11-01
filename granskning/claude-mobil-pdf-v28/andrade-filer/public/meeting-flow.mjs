import {agreementExplanationHtml} from './agreement-explanation.mjs';
import {bindCustomerAgreement} from './customer-agreement-ui.mjs';
import {customerBasis,customerReferenceLabel} from './customer-agreement.mjs';
import {bindPdfDelivery} from './meeting-delivery.mjs';
import {deliveryFacts,diagnosticsHtml} from './delivery-diagnostics.mjs';
import {closingOverviewHtml} from './meeting-summary.mjs';
import {storyPickerHtml,selectedStories} from './meeting-stories.mjs';
import {chartsHtml,monthFocusHtml,benefitsHtml} from './meeting-insights.mjs';
import {MONTHS,annualProfile,parseProfile,defaults,validateState} from './model.mjs';
import {CONTRACTS,YEARS,initialMeeting,validMeeting,meetingResult,manualPriceKey,yearsFor,normalizeMeeting,sameProfiles,copyProfile,syncSharedProfile} from './meeting-model.mjs';
const $=id=>document.getElementById(id),fmt=(n,d=0)=>n===null?'—':new Intl.NumberFormat('sv-SE',{maximumFractionDigits:d,minimumFractionDigits:d}).format(n);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const branches={company:'Företag',brf:'BRF',hotel:'Hotell',industry:'Industri',farm:'Lantbruk',shop:'Butik',transport:'Transport och logistik',property:'Fastigheter',other:'Annan verksamhet'};
let pdfDelivery,lastSavedSignature;
// Remember where the seller was, so leaving the page (PDF viewer, deep dive, reload, app relaunch) returns to the same step.
const STEP_KEY='kundrum-meeting-step',PDF_KEY='kundrum-meeting-pdf',RESUME_MS=12*60*60*1000;
function rememberStep(n){try{localStorage.setItem(STEP_KEY,JSON.stringify({step:n,at:Date.now()}));}catch{}}
function rememberedStep(){try{const v=JSON.parse(localStorage.getItem(STEP_KEY));return v&&Number.isInteger(v.step)&&v.step>=1&&v.step<=4&&Date.now()-v.at<RESUME_MS?v.step:1;}catch{return 1;}}
let s=initialMeeting(),profileYear='2025',step=1,annualDirty=false,chartUnit='ore',focusMonth=0;
try{const saved=JSON.parse(localStorage.getItem('kundrum-meeting-v1'));if(validMeeting(saved))s=normalizeMeeting(saved);}catch{}
function save(){const signature=JSON.stringify(s);if(pdfDelivery&&signature!==lastSavedSignature)pdfDelivery.invalidate();lastSavedSignature=signature;try{localStorage.setItem('kundrum-meeting-v1',JSON.stringify(s));$('saveNote').textContent='Mötesutkastet sparas i den här webbläsaren. Prisbanken delas med teamet.';}catch{$('saveNote').textContent='Kunde inte spara lokalt. Spara mötesunderlaget innan du stänger.';}}
const customerUI=bindCustomerAgreement({root:$('customerAgreement'),getState:()=>s,onChange:save,onLoadCustomer:name=>{
 if(name){const seller=s.seller;s=initialMeeting();s.customer=name;s.seller=seller;profileYear='2025';annualDirty=false;$('customer').value=name;$('business').value=s.business;$('goal').value='';$('annual').value='';$('csvInput').value='';$('sharedChoice').hidden=true;showStep(1);}
 drawProfile();
}});
function error(id,msg){$(id).textContent=msg;$(id).hidden=!msg;}
function total(year){return s.profiles[year].reduce((a,v)=>a+(v??0),0);}
function profileStatus(){const p=s.profiles[profileYear],source={estimated:'Uppskattad månadsprofil',own:'Inlagda månadsvärden',file:'Förbrukning från tidigare Excelunderlag'}[s.sources[profileYear]];$('profileStatus').textContent=`${s.consumptionMode==='shared'?'2025 och 2026, per år':profileYear}: ${fmt(total(profileYear),2)} kWh · ${p.filter(v=>v!==null).length} av 12 månader. ${source}.`;}
function drawProfile(){
 const shared=s.consumptionMode==='shared';
 $('differentYears').checked=!shared;$('profileYears').hidden=shared;$('copyYear').hidden=shared;
 $('profileModeHint').textContent=shared?'Samma årsvolym och månadsfördelning används för 2025 och 2026. Ändringar gäller båda åren.':'Varje år har en egen profil. Välj år och ange förbrukningen för det året.';
 $('importCsv').textContent=shared?'Läs in för båda åren':'Läs in för valt år';
 if(!annualDirty)$('annual').value=s.profiles[profileYear].every(v=>v!==null)?String(Number((total(profileYear)/($('unit').value==='mwh'?1000:1)).toFixed(5))):'';
 if(s.estimates?.[profileYear])$('shape').value=s.estimates[profileYear].shape;
 $('monthInputs').innerHTML=MONTHS.map((m,i)=>`<label>${m}<input data-month="${i}" type="number" inputmode="decimal" min="0" max="100000000" step="any" placeholder="Saknas" value="${s.profiles[profileYear][i]??''}" aria-label="${m} ${profileYear}, kWh"></label>`).join('');
 document.querySelectorAll('[data-profile-year]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.profileYear===profileYear)));
 $('copyYear').textContent='Använd samma förbrukning för '+(profileYear==='2025'?'2026':'2025');profileStatus();
}
function applyAnnual(){try{const raw=$('annual').value.trim().replace(/\s/g,'').replace(',','.');if(!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw))throw Error('Ange en giltig årsförbrukning.');const n=Number(raw)*($('unit').value==='mwh'?1000:1);s.profiles[profileYear]=annualProfile(n,$('shape').value);s.sources[profileYear]='estimated';s.estimates??={};s.estimates[profileYear]={annualKwh:n,shape:$('shape').value,adjusted:false};syncSharedProfile(s,profileYear);annualDirty=false;drawProfile();save();error('profileError','');return true;}catch(e){error('profileError',e.message);return false;}}
function inputProfilesValid(){return [...$('monthInputs').querySelectorAll('input')].every(i=>i.reportValidity());}
function checkProfile(){if(!$('profileForm').reportValidity())return false;if(annualDirty&&!applyAnnual())return false;if(!inputProfilesValid())return false;if(!YEARS.some(y=>total(y)>0)){error('profileError','Ange förbrukning för minst ett år.');return false;}return true;}
function showStep(next){
 if(next>1&&!checkProfile()){next=1;}
 if(next>=3){if(!readAgreement()){const message=$('agreementError').textContent;showStep(2);error('agreementError',message);if(s.comparisonMode==='customer')customerUI.revealRequired();return;}try{const r=meetingResult(s);if(!r.volume)throw Error('Det saknas förbrukning med prisunderlag för vald period. Gå tillbaka och fyll i förbrukningen.');if(next===3)renderResult(r);else renderClosing(r);}catch(e){showStep(2);error('agreementError',e.message);return;}}
 if(next===2)drawAgreement();step=next;rememberStep(next);
 for(let i=1;i<=4;i++)$('step'+i).hidden=i!==next;
 document.querySelectorAll('[data-step]').forEach(b=>{if(Number(b.dataset.step)===next)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');b.classList.toggle('step-past',Number(b.dataset.step)<next);});
 window.scrollTo({top:0,behavior:'instant'});const heading=$('step'+next).querySelector('h1');heading.tabIndex=-1;heading.focus({preventScroll:true});
}
function drawAgreement(){
 $('customerContext').textContent=`${s.customer} · ${branches[s.business]}`;
 document.querySelectorAll('[data-period]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.period===s.period)));
 const years=yearsFor(s.period);$('coverageNote').textContent=years.map(y=>`${y}: ${fmt(total(y),2)} kWh inlagt, prisunderlag för ${y==='2025'?'12':'9'} månader`).join('. ')+'.'+(years.includes('2026')?' Referensunderlaget saknar oktober–december 2026. Med kundens priser och ett manuellt offertpris kan även dessa månader jämföras.':'');
 $('contractCards').innerHTML=Object.entries(CONTRACTS).map(([key,c])=>`<button class="contract${s.contract===key?' selected':''}" data-contract="${key}" aria-pressed="${s.contract===key}"><span class="check" aria-hidden="true">${s.contract===key?'✓':'○'}</span><strong>${c.label}</strong><small>${c.hint}</small></button>`).join('');
 $('agreementGoal').textContent=s.goal?'Viktigt för er: '+s.goal:'Vi väljer upplägg utifrån hur ni vill hantera pris, planering och risk.';
 $('recommendation').value=s.recommendation??'';
 const c=CONTRACTS[s.contract];$('contractDescription').hidden=!c;$('contractDescription').innerHTML=c?agreementExplanationHtml(s):'';
 $('manualScenario').textContent=s.contract==='direct'?'Direkt har olika säkringspriser per månad. Här jämför vi ett förenklat snitt för hela elhandeln enligt offerten; vi räknar inte fram avtalets månadspriser.':s.contract==='stable'?'Använd offertens jämförpris för hela elhandeln. Ett gemensamt säkringspris är inte samma sak som ett helt fast slutpris.':'Jämför det totala elhandelspriset i offerten för vald period.';
 const kind=c?.kind;$('manualFields').hidden=kind!=='manual';$('portfolioFields').hidden=kind!=='portfolio';
 $('manualLabel').textContent=`${CONTRACTS[s.contract]?.label??'Avtal'} · jämförpris från offerten, öre/kWh`;
 $('manualPrice').value=s[manualPriceKey(s.contract)]??'';
 $('hedge').value=s.hedge;$('hedgeOutput').textContent=s.hedge+' %';$('portfolioFee').value=s.portfolioFee;$('variableFee').value=s.variableFee;
 customerUI.render();error('agreementError','');
}
function readAgreement(){
 if(!s.contract){error('agreementError','Välj ett avtal för att fortsätta.');return false;}
 const kind=CONTRACTS[s.contract].kind;
 for(const id of ['variableFee',...(kind==='portfolio'?['portfolioFee']:[]),...(kind==='manual'?['manualPrice']:[])]){
  const el=$(id);if(el.value.trim()===''||!el.reportValidity()){error('agreementError','Ange ett giltigt pris eller påslag i öre/kWh.');el.focus();return false;}
 }
 if(!yearsFor(s.period).every(y=>total(y)>0)){error('agreementError','Fyll i förbrukning för varje valt år. Du kan kopiera samma förbrukning till det andra året i steg 1.');return false;}
 const issues=customerUI.validate();if(issues.length){error('agreementError',issues.join(' '));return false;}save();return true;
}
function recommendationHtml(){return `<section class="recommendation-summary"><p class="eyebrow">UTGÅNGSPUNKTEN FÖR VÅRT FÖRSLAG</p><h2>${esc(s.goal||'Ett elavtal som passar er verksamhet')}</h2><p>${esc(s.recommendation||'Vi går igenom hur upplägget möter era behov och vilken prisvariation ni kan acceptera.')}</p></section>`;}
function resultHtml(r,interactive=true){const c=CONTRACTS[s.contract],same=Math.abs(r.difference)<.005,cheaper=r.difference>0;
 const ref=esc(r.referenceLabel||'Kvartspris');const scope=`${r.count} av ${r.totalMonths} månader · ${fmt(r.volume,2)} kWh i jämförelsen`;
 const typeNote=c.kind==='manual'?`Manuellt angivet elhandelspris, applicerat på samma förbrukning och månader som jämförelsealternativet. Det är ett prisscenario, inte ett historiskt utfall för ${c.label}.`:c.kind==='portfolio'?`Gemensamt historiskt portföljunderlag för individuell portfölj och båda poolerna. ${s.hedge} % säkrad volym. Volymandel är inte samma sak som andel fast faktura.`:'Kvartspris visas med underlagets rörliga månadspriser. Kundens faktiska dygnsprofil och kvartsmätvärden är inte beräknade.';
 return `${recommendationHtml()}${benefitsHtml(s)}${r.customerComparison?`<section class="customer-basis"><h3>Kundens avtal som jämförelsegrund</h3><p>${esc(customerBasis(s))}</p><p><strong>Beräknad skillnad – ingen garanti eller verifierad besparing.</strong> Förslagets fasta avgift: ${fmt(s.selectedMonthlyFee,2)} kr/månad. Prisdiagrammets snitt inkluderar fasta avgifter när förbrukningen är större än noll.</p></section>`:''}<h2 class="comparison-heading">Vad visar jämförelsen?</h2><p class="context">${scope}</p><div class="comparison"><article class="selected-cost"><p>VALT AVTAL</p><h2>${c.label}</h2><strong>${fmt(r.selected,2)} <small>kr</small></strong><span>${fmt(r.selectedRate,2)} öre/kWh · vägt snitt</span></article><article><p>JÄMFÖRELSE</p><h2>${ref}</h2><strong>${fmt(r.variable,2)} <small>kr</small></strong><span>${fmt(r.variableRate,2)} öre/kWh · vägt snitt</span></article></div>
 <div class="difference ${same?'neutral':cheaper?'lower':'higher'}"><span>${same?'Samma beräknade kostnad':cheaper?'Beräknad besparing':'Beräknad merkostnad'}</span><strong>${fmt(Math.abs(r.difference),2)} kr</strong><p>${same?'Ingen skillnad i den här jämförelsen.':`${fmt(Math.abs(r.differenceRate),2)} öre/kWh ${cheaper?'lägre':'högre'} än ${ref} för samma förbrukning.`}</p></div>
 <p class="basis-short">Elhandel exklusive moms, elnät och energiskatt. Ingen garanti för framtida besparing.</p><details class="basis"><summary>Så har vi räknat</summary><p>${s.consumptionMode==='shared'?'Samma årsvolym och månadsfördelning används för båda åren.':'Separata förbrukningsprofiler används för respektive år.'} ${typeNote} ${r.customerComparison?esc(customerBasis(s)):""} Belopp exklusive moms, elnät och energiskatt. Ingen garanti för framtida besparing.</p></details>
 ${r.count<r.totalMonths?`<p class="notice">${r.totalMonths-r.count} månader saknar komplett pris- eller förbrukningsunderlag och ingår inte: ${r.rows.filter(x=>!x.available).map(x=>x.label+(x.missingReason?' ('+esc(x.missingReason)+')':'')).join(', ')}.</p>`:''}
 <div id="comparisonCharts">${chartsHtml(r,s,chartUnit,focusMonth,interactive,true)}</div>
 <details class="sheet calculation-details"><summary>Årsresultat och beräkningsunderlag</summary><h2>Åren var för sig</h2><div class="year-summary">${r.years.map(y=>{const rows=r.available.filter(x=>x.year===y),v=rows.reduce((a,x)=>a+x.volume,0),cost=rows.reduce((a,x)=>a+x.selected,0),reference=rows.reduce((a,x)=>a+x.variable,0),diff=reference-cost;return `<div><strong>${y}</strong><span>${fmt(cost,2)} kr</span><small>${ref}: ${fmt(reference,2)} kr</small><p class="year-saving">${Math.abs(diff)<.005?'Samma kostnad':`${fmt(Math.abs(diff),2)} kr ${diff>0?'lägre':'högre'}`}</p><small>${v?fmt(Math.abs(diff)/v*100,2)+' öre/kWh i skillnad · ':''}${fmt(v,2)} kWh · ${rows.length} av 12 månader</small></div>`;}).join('')}</div><details><summary>Månader och beräkningsunderlag</summary><p class="muted">${YEARS.filter(y=>r.years.includes(y)).map(y=>`${y}: ${s.sources[y]==='estimated'?'uppskattad förbrukningsprofil':s.sources[y]==='file'?'förbrukning från tidigare underlag':'inlagda månadsvärden'}`).join('. ')}. Kostnad = kWh × öre/kWh ÷ 100, plus eventuell fast månadsavgift. Snittpris = total kostnad ÷ total förbrukning × 100. ${c.kind==='portfolio'?`Portfölj: ${s.hedge} % säkrat månadspris + ${100-s.hedge} % rörligt månadspris + underlagets kostnadstillägg + ${fmt(s.portfolioFee,2)} öre/kWh påslag.`:''} ${r.customerComparison?esc(customerBasis(s))+` Förslagets fasta månadsavgift ${fmt(s.selectedMonthlyFee,2)} kr ingår. Kostnadsskillnaden inkluderar fasta avgifter.`:`Kvartspris: underlagets rörliga månadspris + kostnadstillägg + ${fmt(s.variableFee,2)} öre/kWh påslag.`}</p><div class="table-scroll"><table><caption>Valt avtal jämfört med ${ref}</caption><thead><tr><th>Månad</th><th>kWh</th><th>Valt avtal, öre/kWh</th><th>${ref}, öre/kWh</th><th>Valt avtal, kr</th><th>${ref}, kr</th><th>Besparing (+) / merkostnad (−), kr</th></tr></thead><tbody>${r.rows.map(x=>`<tr><th>${x.label}</th><td>${fmt(x.volume,2)}</td>${x.available?`<td>${fmt(x.selectedRate,2)}</td><td>${fmt(x.variableRate,2)}</td><td>${fmt(x.selected,2)}</td><td>${fmt(x.variable,2)}</td><td>${fmt(x.variable-x.selected,2)}</td>`:'<td colspan="5">Underlag saknas · ingår inte</td>'}</tr>`).join('')}</tbody></table></div></details></details>`;
}
function renderResult(r){$('openDetails').closest('.deeper').hidden=CONTRACTS[s.contract].kind!=='portfolio';focusMonth=r.rows.findIndex(x=>x.available);if(focusMonth<0)focusMonth=0;$('resultTitle').textContent=CONTRACTS[s.contract].label;$('resultContext').textContent=`${s.customer} · ${branches[s.business]} · ${r.periodLabel}`;$('result').innerHTML=resultHtml(r);}
function renderClosing(r){$('closingOverview').innerHTML=closingOverviewHtml(s,r,branches[s.business]);refreshStories();for(const key of ['seller','notes','next','checks','owner','followUp'])$(key).value=s[key]??'';}
$('customer').value=s.customer;$('business').value=s.business;$('goal').value=s.goal??'';drawProfile();drawAgreement();
$('customer').addEventListener('input',e=>{const before=s.customer;s.customer=e.target.value.trim();if(s.customerAgreement&&!s.customerAgreementRecord&&s.customerAgreement.customer===before)s.customerAgreement.customer=s.customer;save();});$('business').addEventListener('change',e=>{s.business=e.target.value;delete s.storyChoice;save();});
$('annual').addEventListener('input',()=>annualDirty=true);for(const id of ['shape','unit'])$(id).addEventListener('change',()=>{if($('annual').value.trim())annualDirty=true;});
$('applyAnnual').addEventListener('click',applyAnnual);
$('monthInputs').addEventListener('input',e=>{if(!e.target.matches('[data-month]'))return;if(!e.target.validity.valid)return;s.profiles[profileYear][Number(e.target.dataset.month)]=e.target.value===''?null:Number(e.target.value);if(s.estimates?.[profileYear]){s.estimates[profileYear].adjusted=true;}else{s.sources[profileYear]='own';}syncSharedProfile(s,profileYear);annualDirty=false;$('annual').value='';profileStatus();save();});
for(const b of document.querySelectorAll('[data-profile-year]'))b.addEventListener('click',()=>{if(!inputProfilesValid()||annualDirty&&!applyAnnual())return;profileYear=b.dataset.profileYear;$('annual').value='';drawProfile();error('profileError','');});
$('copyYear').addEventListener('click',()=>{if(!inputProfilesValid()||annualDirty&&!applyAnnual())return;const other=profileYear==='2025'?'2026':'2025';copyProfile(s,profileYear,other);save();$('profileStatus').textContent+=` Samma profil har kopierats till ${other}.`;});
function shareYears(from){s.consumptionMode='shared';syncSharedProfile(s,from);profileYear=from;$('sharedChoice').hidden=true;drawProfile();save();}
$('differentYears').addEventListener('change',e=>{
 const wantsSeparate=e.target.checked;
 if(!inputProfilesValid()||annualDirty&&!applyAnnual()){e.target.checked=s.consumptionMode==='separate';return;}
 if(wantsSeparate){s.consumptionMode='separate';$('sharedChoice').hidden=true;drawProfile();save();}
 else if(sameProfiles(s))shareYears(profileYear);
 else{e.target.checked=true;$('sharedChoice').hidden=false;}
});
for(const b of document.querySelectorAll('[data-share-year]'))b.addEventListener('click',()=>shareYears(b.dataset.shareYear));
$('keepSeparate').addEventListener('click',()=>{$('sharedChoice').hidden=true;});
$('profileForm').addEventListener('submit',e=>{e.preventDefault();showStep(2);});
$('importCsv').addEventListener('click',()=>{try{s.profiles[profileYear]=parseProfile($('csvInput').value);s.sources[profileYear]='own';if(s.estimates)delete s.estimates[profileYear];syncSharedProfile(s,profileYear);annualDirty=false;$('annual').value='';drawProfile();drawAgreement();save();error('profileError','');$('monthlyDetails').open=true;}catch(e){error('profileError',e.message);}});
$('loadPrevious').addEventListener('click',()=>{try{const old=JSON.parse(localStorage.getItem('kundrum-v2'));if(!validateState(old))throw Error('Det finns inget sparat tidigare kundrum att hämta i den här webbläsaren.');s.customer=old.customer;s.profiles=structuredClone(old.profiles);s.sources=structuredClone(old.sources);s.estimates=structuredClone(old.estimates??{});s.business=old.business?.type??'company';s.hedge=old.hedge;s.portfolioFee=old.portfolioFee;s.variableFee=old.variableFee;s.fixedPrice=old.fixed;s.seller=old.sellerName||s.seller;s.notes=old.notes;s.next=old.next;s.period=old.period;delete s.consumptionMode;s=normalizeMeeting(s);$('sharedChoice').hidden=true;$('customer').value=s.customer;$('business').value=s.business;annualDirty=false;$('annual').value='';drawProfile();drawAgreement();save();error('profileError','');}catch(e){error('profileError',e.message);}});
for(const b of document.querySelectorAll('[data-step]'))b.addEventListener('click',()=>showStep(Number(b.dataset.step)));
for(const b of document.querySelectorAll('[data-back]'))b.addEventListener('click',()=>showStep(Number(b.dataset.back)));
for(const b of document.querySelectorAll('[data-period]'))b.addEventListener('click',()=>{s.period=b.dataset.period;save();drawAgreement();});
$('contractCards').addEventListener('click',e=>{const b=e.target.closest('[data-contract]');if(!b)return;s.contract=b.dataset.contract;save();drawAgreement();});
$('manualPrice').addEventListener('input',e=>{s[manualPriceKey(s.contract)]=e.target.value===''?null:e.target.validity.valid?Number(e.target.value):null;save();});
for(const id of ['hedge','portfolioFee','variableFee'])$(id).addEventListener('input',e=>{if(e.target.value!==''&&e.target.validity.valid){s[id]=Number(e.target.value);save();}if(id==='hedge')$('hedgeOutput').textContent=s.hedge+' %';});
$('showComparison').addEventListener('click',()=>showStep(3));
$('showClosing').addEventListener('click',()=>showStep(4));
function updateMonth(index){const r=meetingResult(s);if(!Number.isInteger(index)||index<0||index>=r.rows.length)return;focusMonth=index;if($('monthDetails'))$('monthDetails').open=true;$('focusMonth').value=String(index);$('monthFocus').innerHTML=monthFocusHtml(r,index,CONTRACTS[s.contract].label);}
$('result').addEventListener('click',e=>{const unit=e.target.closest('[data-chart-unit]'),month=e.target.closest('[data-chart-row]');if(unit){chartUnit=unit.dataset.chartUnit;$('comparisonCharts').innerHTML=chartsHtml(meetingResult(s),s,chartUnit,focusMonth,true,true);$('comparisonCharts').querySelector(`[data-chart-unit="${chartUnit}"]`).focus({preventScroll:true});}else if(month)updateMonth(Number(month.dataset.chartRow));});
$('result').addEventListener('change',e=>{if(e.target.id==='focusMonth')updateMonth(Number(e.target.value));});
$('meetingStories').addEventListener('change',e=>{
 if(!e.target.matches('[data-story-slot]'))return;
 const slot=Number(e.target.dataset.storySlot),ids=selectedStories(s.business,s.storyChoice).map(x=>x.id);ids[slot]=e.target.value;
 s.storyChoice={business:s.business,ids};save();refreshStories(true,slot);
});
function refreshStories(open=false,slot=0){$('meetingStories').innerHTML=storyPickerHtml(s.business,s.storyChoice,{compact:true});$('storyChoices').open=open;if(open)$('storyChoice'+slot).focus({preventScroll:true});}
$('meetingStories').addEventListener('click',e=>{if(e.target.closest('[data-story-auto]')){delete s.storyChoice;save();refreshStories(true);}});

for(const id of ['seller','notes','next','goal','recommendation','checks','owner','followUp'])$(id).addEventListener('input',e=>{s[id]=e.target.value;save();});
pdfDelivery=bindPdfDelivery({
 button:$('saveSummary'),status:$('summaryStatus'),actions:$('pdfActions'),download:$('summaryDownload'),open:$('summaryOpen'),share:$('summaryShare'),getMeeting:()=>s,
 onReady:snapshot=>{try{localStorage.setItem(PDF_KEY,JSON.stringify(snapshot));}catch{}},
 onInvalidate:()=>{try{localStorage.removeItem(PDF_KEY);}catch{}},
 generate:async snapshot=>{const {createMeetingPdf}=await import('./meeting-pdf.mjs');return createMeetingPdf(snapshot);}
});
$('openDetails').addEventListener('click',()=>{const d=defaults(),period=s.period==='both'?'2025':s.period;Object.assign(d,{customer:s.customer,period,profiles:structuredClone(s.profiles),sources:structuredClone(s.sources),estimates:structuredClone(s.estimates??{}),business:{type:Object.hasOwn(branches,s.business)&&['company','brf','hotel','industry','farm','shop'].includes(s.business)?s.business:'company',apartments:null},hedge:s.hedge,portfolioFee:s.portfolioFee,variableFee:s.variableFee,fixed:s.fixedPrice??d.fixed,notes:s.notes,next:s.next,sellerName:s.seller||'Ludwig Rosenberg'});for(const y of YEARS)if(d.sources[y]==='estimated'&&!d.estimates[y])d.sources[y]='own';try{localStorage.setItem('kundrum-v2',JSON.stringify(d));}catch{}});
lastSavedSignature=JSON.stringify(s);
$('newMeeting').addEventListener('click',()=>{if(!confirm('Börja ett nytt kundmöte? Spara mötesunderlaget först om du vill behålla det.'))return;s=initialMeeting();$('goal').value='';$('recommendation').value='';profileYear='2025';annualDirty=false;$('customer').value='';$('business').value='company';$('annual').value='';$('csvInput').value='';$('sharedChoice').hidden=true;drawProfile();customerUI.render();save();showStep(1);});
// Return to the step the seller left. A PDF that matched this exact meeting is prepared again (no file is opened).
{const resume=rememberedStep();if(resume>1){showStep(resume);let same=false;try{same=step===4&&localStorage.getItem(PDF_KEY)===JSON.stringify(s);}catch{}if(same)pdfDelivery.prepare();}}
if(new URLSearchParams(location.search).has('diagnos')){const events=[];const draw=()=>{let box=$('deliveryDiagnostics');if(!box){box=document.createElement('div');box.id='deliveryDiagnostics';$('summaryStatus').before(box);}box.innerHTML=diagnosticsHtml(deliveryFacts(),events);};window.addEventListener('pageshow',e=>{events.push(`Sidan visades ${new Date().toLocaleTimeString('sv-SE')}${e.persisted?' från webbläsarens minne':' efter ny laddning'}. Steg ${step}.`);draw();});draw();}
