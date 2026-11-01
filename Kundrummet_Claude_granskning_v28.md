# Kundrummet – samarbete med Claude

## Uppdrag från Ludwig
Hjälp ChatGPT att förbättra enbart Kundrummet. Granska koden och lämna konkreta ändringsförslag/patchar. Detta är ett granskningsunderlag, inte direktåtkomst eller publiceringsbehörighet. ChatGPT granskar, testar och publicerar godkända ändringar. Rådgivarrummet, Veckokollen och Agentcentralen ingår inte.

## Version och gränser
Snapshot av version 28, commit 052b2d1c7cff8804511334104058710b271c3cf2. Webb: https://kundrum-rosenberg.rosen123.chatgpt.site/ (kräver befintlig behörighet). Inga lösenord, tokens, Git-historik, databasposter eller mötesutkast följer med. Detta dokument ger ingen automatisk åtkomst till webbappen. Koden kan innehålla länkar till andra appar, men de ingår inte i uppdraget.

## Produkt och design
Kraftringens säljare sitter bredvid kunden. Enkel svenska, luftig mobilupplevelse, professionell Kraftringen-stil. Behåll fyra steg: kund/förbrukning, avtalsval, jämförelse, sammanfattning/PDF. Kundens nuvarande avtal kan matas in och sparas i en autentiserad gemensam prisbank. Tomma värden är okända, aldrig noll. Priser ska jämföras på samma period, volym, elområde och kostnadsomfattning. Fiktiva resultat eller kundcitat får inte presenteras som verifierade.

## Prioritet 1 – mobilfelet
Ludwig säger att han fortfarande inte kan öppna saker på mobilen. Den exakta kontrollen är ännu okänd. Gissa inte att felet är löst. Version 28 ändrade PDF och fördjupning från nya flikar till samma flik och ökade tryckytorna. PDF skapas först och levereras därefter med explicit användarklick; native share kallas direkt i klickhanteraren. Undersök iOS/inbyggd webbläsare, blob-länkar, återgång till mötet, details/summary och dialoger. Skilj kodfynd från hypoteser och sådant som kräver verkligt enhetstest.

## Prioritet 2 – avtalsförklaringen
public/agreement-explanation.mjs är gemensam källa för steg två och egen PDF-sida. Finansiell prissäkring är inte fysisk lagrad el eller garanterat fast totalfaktura. Säkrad volym, profil, volymavvikelse och tillägg ska beskrivas korrekt. Produktvillkor får inte uppfinnas. Historiken för individuell portfölj och båda poolerna är samma inmatade underlag; det är inte tre verifierade utfall. Manuellt offertpris är ett scenario.

## Verifierat i version 28
PDF-tester för alla sju avtalsval, mötesflödets DOM-test, kundavtalets DOM-test och leveranstest passerade. Den nya PDF-sidan renderades och granskades visuellt. Produktionsbygge och publicering lyckades. Mobilens rendering och öppning är INTE verifierad: testwebbläsaren fick ERR_CONNECTION_REFUSED mot den hanterade förhandsvisningen trots att den rapporterade körande. Inga produktionskundposter skapades under test.

## Lämna tillbaka till ChatGPT
1. Prioriterade fynd med fil och funktion samt konkret belägg.
2. Avgränsad patch eller kompletta ändrade filer, utgående från snapshotens commit.
3. Tester du faktiskt kört och resultat; markera övrigt som otestat.
4. Kvarstående frågor endast där koden inte kan ge svar.
Ändra inte åtkomst, affärslogik eller produktvillkor utan uttryckligt underlag. Publicera inte själv.

## Kodöversikt
Detta är en läsbar kodexport, inte ett komplett körbart repository. Binära varumärkesfiler, tredjepartsbibliotek, build/deploy-konfiguration och beroenden ingår inte. Prisbankens serverkod och tester ingår. Bibliotek för PDF ligger normalt i public/vendor. Be ChatGPT om specifika saknade filer vid behov.


## Fil: app/api/price-records/route.ts

````text
import { env } from 'cloudflare:workers';
import { handlePriceRecords } from '../../../lib/price-records.mjs';
export const dynamic = 'force-dynamic';
export function GET(request:Request){return handlePriceRecords(request,env.DB);}
export function POST(request:Request){return handlePriceRecords(request,env.DB);}

````

## Fil: db/schema.ts

````text
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const priceRecords = sqliteTable('price_records', {
  id: text('id').primaryKey(),
  provider: text('provider').notNull(),
  customer: text('customer').notNull(),
  area: text('area').notNull(),
  periodFrom: text('period_from').notNull(),
  periodTo: text('period_to').notNull(),
  sourceType: text('source_type').notNull(),
  payload: text('payload').notNull(),
  createdBy: text('created_by').notNull(),
  createdName: text('created_name').notNull(),
  createdAt: text('created_at').notNull(),
  supersedes: text('supersedes'),
}, table => [index('price_records_period').on(table.periodFrom,table.periodTo),index('price_records_created').on(table.createdAt)]);

````

## Fil: lib/price-records.mjs

````text
import {agreementErrors} from '../public/customer-agreement.mjs';
const uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(x);
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff'}});
export async function handlePriceRecords(request,db){
 const user=request.headers.get('oai-authenticated-user-id');
 if(!user)return json({error:'Logga in i Kundrummet för att använda prisbanken.'},401);
 if(!db)return json({error:'Prisbanken är inte tillgänglig just nu. Uppgifterna finns kvar i formuläret.'},503);
 const url=new URL(request.url),id=url.searchParams.get('id');
 try{
  if(request.method==='GET'){
   if(id){if(!uuid(id))return json({error:'Ogiltig post.'},400);const row=await db.prepare('SELECT * FROM price_records WHERE id = ?').bind(id).first();return row?json({record:serialize(row)}):json({error:'Uppgiften kunde inte hittas.'},404);}
   const q=(url.searchParams.get('q')||'').trim().slice(0,120),year=url.searchParams.get('year')||'',rawOffset=url.searchParams.get('offset')||'0';
   if(year&&!/^20\d{2}$/.test(year)||!/^\d{1,5}$/.test(rawOffset))return json({error:'Ogiltigt sökfilter.'},400);
   const offset=Number(rawOffset),clauses=[],args=[];
   if(q){clauses.push("(provider LIKE ? ESCAPE '\\' OR customer LIKE ? ESCAPE '\\')");const like='%'+q.replace(/[\\%_]/g,'\\$&')+'%';args.push(like,like);}
   if(year){clauses.push('period_from <= ? AND period_to >= ?');args.push(year+'-12',year+'-01');}
   const rows=await db.prepare(`SELECT * FROM price_records ${clauses.length?'WHERE '+clauses.join(' AND '):''} ORDER BY created_at DESC, id DESC LIMIT 51 OFFSET ?`).bind(...args,offset).all();
   return json({records:rows.results.slice(0,50).map(serialize),nextOffset:rows.results.length>50?offset+50:null});
  }
  if(request.method!=='POST')return json({error:'Metoden stöds inte.'},405);
  const origin=request.headers.get('origin');
  if(origin&&origin!==url.origin)return json({error:'Begäran måste komma från Kundrummet.'},403);
  if(request.headers.get('x-requested-with')!=='Kundrummet'||!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'Ogiltigt format.'},415);
  if(Number(request.headers.get('content-length'))>24000)return json({error:'Uppgiften är för stor.'},413);
  const raw=await request.text();if(raw.length>24000)return json({error:'Uppgiften är för stor.'},413);
  let body;try{body=JSON.parse(raw);}catch{return json({error:'Ogiltigt format.'},400);}
  if(!body||typeof body!=='object'||Array.isArray(body)||!uuid(body.id)||body.supersedes&&!uuid(body.supersedes))return json({error:'Ogiltig post.'},400);
  const errors=agreementErrors(body.agreement);if(errors.length)return json({error:errors.join(' ')},400);
  // Strip unrecognized fields instead of persisting arbitrary client payloads.
  const a=body.agreement,clean={};for(const key of ['version','provider','customer','product','area','type','from','to','sourceType','sourceRef','sourceDate','mode','composition','rate','margin','other','monthlyFee','scopeConfirmed','notes'])clean[key]=a[key];
  clean.months=Object.fromEntries(Object.entries(a.months).map(([key,v])=>[key,{rate:v.rate,amount:v.amount,kwh:v.kwh}]));
  const payload=JSON.stringify(clean),existing=await db.prepare('SELECT * FROM price_records WHERE id = ?').bind(body.id).first();
  if(existing)return existing.created_by===user&&existing.payload===payload&&existing.supersedes===(body.supersedes||null)?json({record:serialize(existing),alreadySaved:true}):json({error:'Posten finns redan. Läs in prisbanken igen.'},409);
  if(body.supersedes&&!await db.prepare('SELECT id FROM price_records WHERE id = ?').bind(body.supersedes).first())return json({error:'Originaluppgiften saknas.'},400);
  let name=request.headers.get('oai-authenticated-user-full-name')||request.headers.get('oai-authenticated-user-email')||'Inloggad säljare';
  if(request.headers.get('oai-authenticated-user-full-name-encoding')==='percent-encoded-utf-8'){try{name=decodeURIComponent(name);}catch{}}
  const now=new Date().toISOString();
  await db.prepare('INSERT INTO price_records (id,provider,customer,area,period_from,period_to,source_type,payload,created_by,created_name,created_at,supersedes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').bind(body.id,clean.provider.trim(),clean.customer.trim(),clean.area,clean.from,clean.to,clean.sourceType,payload,user,name.slice(0,240),now,body.supersedes||null).run();
  return json({record:serialize({id:body.id,payload,created_name:name,created_at:now,supersedes:body.supersedes||null})},201);
 }catch(error){console.error('Price bank request failed',error?.name);return json({error:'Kunde inte läsa eller spara prisuppgiften. Försök igen; formuläret finns kvar.'},503);}
}
function serialize(row){return {id:row.id,agreement:JSON.parse(row.payload),createdAt:row.created_at,createdName:row.created_name,supersedes:row.supersedes};}

````

## Fil: package.json

````text
{
  "name": "site-creator-vinext-starter",
  "version": "0.1.0",
  "private": true,
  "engines": {
    "node": ">=22.13.0"
  },
  "scripts": {
    "install:ci": "bash scripts/install-pnpm.sh",
    "dev": "node scripts/run-framework.mjs dev",
    "build": "node scripts/run-framework.mjs build",
    "start": "node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js dev --config dist/server/wrangler.json --local --persist-to .wrangler/state --ip 127.0.0.1 --inspector-port 0",
    "lint": "eslint . --ignore-pattern dist --ignore-pattern .next",
    "db:generate": "drizzle-kit generate"
  },
  "dependencies": {
    "@base-ui/react": "^1.7.0",
    "@hookform/resolvers": "^5.7.1",
    "@shadcn/react": "^0.3.0",
    "class-variance-authority": "0.7.1",
    "clsx": "2.1.1",
    "cmdk": "^1.1.1",
    "date-fns": "^4.4.0",
    "drizzle-orm": "0.45.2",
    "embla-carousel-react": "^8.6.0",
    "input-otp": "^1.4.2",
    "lucide-react": "^1.31.0",
    "next": "16.3.4",
    "next-themes": "^0.4.6",
    "radix-ui": "^1.6.7",
    "react": "19.2.6",
    "react-day-picker": "^10.0.1",
    "react-dom": "19.2.6",
    "react-hook-form": "^7.85.0",
    "react-resizable-panels": "^4.12.2",
    "recharts": "^3.8.0",
    "sonner": "^2.0.8",
    "tailwind-merge": "3.6.0",
    "vaul": "^1.1.2",
    "zod": "^3.25.76"
  },
  "devDependencies": {
    "@cloudflare/vite-plugin": "1.37.1",
    "@cloudflare/workers-types": "4.20260515.1",
    "@tailwindcss/postcss": "4.2.1",
    "@types/node": "22.19.19",
    "@types/react": "19.2.14",
    "@types/react-dom": "19.2.3",
    "@vitejs/plugin-react": "6.0.2",
    "@vitejs/plugin-rsc": "0.5.26",
    "drizzle-kit": "0.31.10",
    "eslint": "9.39.4",
    "eslint-config-next": "16.3.4",
    "jsdom": "^30.1.3",
    "json-rpc-2.0": "1.7.1",
    "raw-body": "3.0.2",
    "react-server-dom-webpack": "19.2.6",
    "tailwindcss": "4.2.1",
    "tw-animate-css": "^1.4.0",
    "typescript": "5.9.3",
    "vinext": "1.0.0-beta.5",
    "vite": "8.0.13",
    "wrangler": "4.92.0"
  },
  "type": "module",
  "overrides": {
    "miniflare": {
      "sharp": "0.35.4"
    }
  },
  "packageManager": "pnpm@11.25.0"
}

````

## Fil: public/agreement-explanation.mjs

````text
import {CONTRACTS} from './meeting-model.mjs';
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function agreementExplanation(s){
 const c=CONTRACTS[s.contract];if(!c)return [];
 const how={
 individual:'Vi kommer överens om en egen plan för hur stor del av er förväntade elanvändning som ska prissäkras. Säkringarna byggs upp över tid enligt planen.',
 safe:'Ni delar en inköpsstrategi med andra kunder i poolen. Prissäkringarna görs vid flera tillfällen, så att ni inte är beroende av priset en enda dag.',
 offensive:'Ni ingår i en gemensam portfölj där delar förvaltas aktivt. Besluten kan ge både ett bättre och ett sämre prisutfall. Namnet är inget löfte om lägre pris.',
 stable:'Offerten anger ett gemensamt säkringspris, vägt efter er månadsförbrukning. Säkringspriset hjälper er att planera, men är inte automatiskt priset för hela fakturan.',
 direct:'En överenskommen andel prissäkras vid ett tillfälle. Varje avtalsmånad har sin egen säkringsnivå. Kalkylen här använder ett förenklat jämförpris från offerten.',
 quarter:'Priset följer elmarknaden kvart för kvart. Kostnaden beror på både hur mycket el ni använder och vad elen kostar just när ni använder den.',
 fixed:'Ni avtalar om ett pris för den el och den period som offerten omfattar. Ni betalar fortfarande för den mängd el ni faktiskt använder, enligt avtalets villkor.'
 };
 const rows=[['Så fungerar '+c.label,how[s.contract]],['Det betyder för er',c.fit+' '+c.hint]];
 if(c.kind==='portfolio')rows.push(['Vad betyder prissäkrad?',`Vi säkrar ett finansiellt prisutfall, inte fysisk el som lagras åt er. I den här kalkylen är ${s.hedge} % av volymen prissäkrad och ${100-s.hedge} % rörlig. Det betyder inte att ${s.hedge} % av hela fakturan är fast.`]);
 rows.push(['Det här kan fortfarande ändras',c.variation+(c.kind==='portfolio'?' Även när på dygnet ni använder el, skillnader mellan planerad och faktisk förbrukning samt balans- och avräkningskostnader kan påverka. Vilka tillägg ni betalar bestäms av avtalet.':'' )]);
 rows.push(['Det här visar jämförelsen','Siffrorna bygger på inlagd förbrukning och valt prisunderlag. Moms, elnät och energiskatt ingår inte. En beräknad besparing är inte ett löfte om framtida besparing. Offerten och avtalsvillkoren avgör vad som ingår.']);
 return rows;
}
export function agreementExplanationHtml(s){return `<section class="agreement-explainer" aria-label="Avtalet förklarat"><p class="eyebrow">AVTALET I KLARTEXT · INGÅR I PDF</p>${agreementExplanation(s).map(([title,body],i)=>`<${i?'h3':'h2'}>${esc(title)}</${i?'h3':'h2'}><p>${esc(body)}</p>`).join('')}</section>`;}

````

## Fil: public/annual-profile.css

````text
.profile-entry-mode{display:grid;grid-template-columns:1fr 1fr;gap:5px;padding:5px;margin:22px 0;background:#edf3f6;border-radius:10px}
.profile-entry-mode button{border:0;border-radius:7px;background:transparent;color:var(--ink);min-height:48px;font-size:12px;font-weight:500;padding:10px 12px;line-height:1.5}
.profile-entry-mode button[aria-pressed=true]{background:var(--ink);color:white}
#annualProfileTitle{font-size:16px;margin-bottom:16px}
.annual-entry{display:grid;grid-template-columns:minmax(0,1fr) 110px;gap:12px}
.annual-entry select{width:100%;height:46px;margin-top:9px;padding:10px;border:1px solid var(--border);border-radius:6px;background:white;color:var(--ink);font-size:15px}
dialog .annual-entry input{font-size:17px;padding:10px 12px;height:46px;font-variant-numeric:tabular-nums}
.annual-unit-help{font-size:11px;color:var(--muted);line-height:1.7;margin:9px 0 20px}
.profile-shapes{padding:0;border:0;margin:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}
.profile-shapes legend{font-size:12px;font-weight:600;margin-bottom:10px;padding:0}
dialog .profile-shapes label{display:flex;align-items:flex-start;gap:8px;border:1px solid var(--border);border-radius:9px;padding:14px 10px;cursor:pointer;line-height:1.5}
dialog .profile-shapes input[type=radio]{appearance:auto;accent-color:var(--ink);width:17px;height:17px;min-width:17px;margin:2px 0 0;padding:0;border:0;background:transparent}
.profile-shapes label:has(input:checked){background:#fff3d5;border-color:#d6a23c;box-shadow:inset 0 0 0 1px #d6a23c}
.profile-shapes strong{font-size:12px;display:block;font-weight:600}.profile-shapes small{font-size:10px;color:var(--muted);display:block;margin-top:5px;line-height:1.6}
.annual-assumption{font-size:11px;line-height:1.8;color:var(--muted);margin:16px 0}
.annual-preview{background:#edf5f8;border:1px solid #d6e5ec;border-radius:9px;padding:15px}
#annualPreviewSummary{font-size:13px;font-weight:600;line-height:1.7;margin:0 0 7px}
#annualPeriodNote{font-size:11px;line-height:1.8;margin:0;color:var(--muted)}
.annual-preview details{margin-top:13px;border-top:1px solid #ccdee7;padding-top:12px}
.annual-preview summary{font-size:11px;font-weight:500;cursor:pointer;line-height:1.7}
.annual-preview table{font-size:11px;margin-top:10px;font-variant-numeric:tabular-nums}.annual-preview th,.annual-preview td{padding:7px 4px}
.comparison-heading .estimate-notice{background:#fff5dc;border-left:3px solid var(--lime);padding:10px 12px;margin-bottom:18px;font-size:11px;color:var(--ink);line-height:1.8}
#applyProfile:disabled{opacity:.5;cursor:not-allowed;transform:none}
@media(max-width:560px){.profile-entry-mode{margin:18px 0;gap:4px}.profile-entry-mode button{font-size:10px;padding:10px 7px;min-height:54px}.annual-entry{grid-template-columns:minmax(0,1fr) 90px;gap:9px}.annual-entry select{font-size:16px}.profile-shapes{grid-template-columns:1fr}.profile-shapes label{padding:12px 14px!important;align-items:center!important;gap:10px!important}.profile-shapes label span{flex:1;display:flex;align-items:center;justify-content:space-between;gap:12px}.profile-shapes strong{font-size:12px}.profile-shapes small{font-size:10px;margin:0;text-align:right}.annual-assumption{font-size:11px}.annual-preview{padding:12px}#annualPreviewSummary{font-size:12px}#annualPeriodNote{font-size:10px}.annual-preview table{font-size:10px}.dialog-actions{gap:8px}#applyProfile{padding:11px;font-size:11px}#applyProfile svg{width:16px}.comparison-heading .estimate-notice{font-size:10px}.profile-chart-top{flex-wrap:wrap}}

@media(max-width:360px){.summary-strip{grid-template-columns:1fr 1fr}.summary-strip>div:nth-child(3){grid-column:1/-1;border-left:0;border-top:1px solid var(--border);padding:10px 0 0;display:flex;justify-content:space-between;align-items:center}.summary-strip>div:nth-child(3) strong{margin:0}.summary-strip strong{font-size:13px}}

````

## Fil: public/app.mjs

````text
import {businessImpact,renderBusiness} from './business-impact.mjs';
import {initMobile,renderMobile,syncMobileMonth} from './mobile-app.mjs';
import {MONTHS,DATA,hasMonthlyPrices,PROFILE_SHAPES,annualProfile,profileSourceLabel,defaults,calculate,parseProfile,validateState,migrateLegacy} from './model.mjs';
import {buildCustomerEmail,emailFile,mailtoLink,sellerNotesTitle,validEmail} from './customer-email.mjs';
import {priceChart,differenceChart,monthButtons,monthFocus} from './charts.mjs';
const $=id=>document.getElementById(id),fmt=(n,d=0)=>n===null?'—':new Intl.NumberFormat('sv-SE',{maximumFractionDigits:d,minimumFractionDigits:d}).format(n),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let shareSnapshot=null;
let chartUnit='ore',selectedMonth=null,chartPeriod=null;
let state=defaults(),pendingImport=null,profileImported=false,toastTimer,canSave=true,migrated=false;
let profileMode='monthly';
const cleanState=s=>JSON.parse(JSON.stringify(s));
try{const saved=JSON.parse(localStorage.getItem('kundrum-v2'));if(validateState(saved))state=cleanState(saved);else{const old=JSON.parse(localStorage.getItem('kundrum-v1'));const next=migrateLegacy(old);if(next){state=next;migrated=true;}}}catch{}
function save(){try{localStorage.setItem('kundrum-v2',JSON.stringify(state));canSave=true;$('saveStatus').textContent='Sparat i den här webbläsaren';}catch{canSave=false;$('saveStatus').textContent='Kunde inte spara lokalt – exportera kundrummet';}}
function toast(msg){$('toast').textContent=msg;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),5000);}
function setControls(){for(const k of ['consumption','hedge','fixed','portfolioFee','variableFee','notes','next','date','choice'])$(k).value=state[k];$('sellerName').value=state.sellerName||'Ludwig Rosenberg';}
function signed(n,d=2){return n===null?'—':(Math.abs(n)<1e-8?'':n>0?'+':'−')+fmt(Math.abs(n),d);}
function differenceKind(r){return !r.volume?'empty':Math.abs(r.differenceRate)<1e-8?'equal':r.difference>0?'saving':'extra';}
function savingsTitle(r){return {empty:'Lägg in förbrukning för att jämföra',equal:'Samma kostnad med båda alternativen',saving:'Så mycket sparar ni med portfölj',extra:'Så mycket mer kostar portfölj'}[differenceKind(r)];}
function savingsValue(n){return n===null?'—':Math.abs(n)>1e-8&&Math.abs(n)<.005?'< 0,01':fmt(Math.abs(n),2);}
function renderCharts(r){
 if(chartPeriod!==state.period){selectedMonth=null;chartPeriod=state.period;}
 if(!r.rows[selectedMonth]?.available)selectedMonth=r.rows.filter(row=>row.available).at(-1)?.index??null;
 const focusedMonth=document.activeElement?.dataset.monthIndex;
 $('costChart').innerHTML=priceChart(r,chartUnit,'price',selectedMonth);
 const marker=$('costChart').querySelector(`[data-chart-month="${selectedMonth}"]`);
 if(marker){const b=marker.getBoundingClientRect(),container=$('costChart');container.scrollLeft+=b.x+b.width/2-container.getBoundingClientRect().x-container.clientWidth/2;}
 $('monthButtons').innerHTML=monthButtons(r,chartUnit,selectedMonth);
 $('monthFocus').innerHTML=monthFocus(r,selectedMonth);
 const first=r.rows[selectedMonth];
 $('priceBreakdown').innerHTML=first?`<span class="breakdown-heading">Så blir portföljpriset i ${first.month.toLowerCase()}</span><div><span><strong>${fmt(first.hedgedPart,2)}</strong>Säkrat · ${state.hedge} %</span><b>+</b><span><strong>${fmt(first.floatingPart,2)}</strong>Rörligt · ${100-state.hedge} %</span><b>+</b><span><strong>${fmt(first.cost+state.portfolioFee,2)}</strong>Tillägg & påslag</span><b>=</b><span class="breakdown-total"><strong>${fmt(first.portfolioRate,2)}</strong>öre/kWh</span></div>`:'';
 $('priceChartHeading').textContent=chartUnit==='ore'?'Pris per månad':'Kostnad per månad';
 $('chartUnitLabel').textContent=chartUnit==='ore'?'öre/kWh':'tkr / månad';
 $('differenceUnitLabel').textContent=chartUnit==='ore'?'öre/kWh':'tkr / månad';
 $('chartAvailability').textContent=r.count<12?`${12-r.count} månader saknar underlag`:'Alla 12 månader har underlag';
 document.querySelectorAll('[data-chart-unit]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.chartUnit===chartUnit)));
 syncMobileMonth(selectedMonth);
 if(focusedMonth!==undefined)$('monthButtons').querySelector(`[data-month-index="${focusedMonth}"]`)?.focus({preventScroll:true});
}
function selectMonth(index,reveal=false){if(!calculate(state).rows[index]?.available)return;selectedMonth=index;renderCharts(calculate(state));if(reveal&&!matchMedia('(max-width:700px)').matches&&matchMedia('(max-width:850px)').matches)$('monthFocus').scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});}

function tableRows(r){return r.rows.map(row=>`<tr${row.available?'':' class="missing"'}><td>${row.month}</td><td>${fmt(row.volume,1)}</td>${row.available?`<td>${fmt(row.variableRate,2)}</td><td>${fmt(row.portfolioRate,2)}</td><td class="${row.differenceRate>=0?'positive':'negative'}">${signed(row.differenceRate)}</td><td>${fmt(row.variable,2)}</td><td>${fmt(row.portfolio,2)}</td><td class="${row.difference>=0?'positive':'negative'}">${signed(row.difference)}</td><td>${fmt(row.fixed,2)}</td>`:'<td colspan="7">Underlag saknas · ingår inte</td>'}</tr>`).join('');}
function totalRow(r){return `<tr><td>Totalt / vägt snitt</td><td>${fmt(r.volume,1)}</td><td>${fmt(r.variableRate,2)}</td><td>${fmt(r.portfolioRate,2)}</td><td>${signed(r.differenceRate)}</td><td>${fmt(r.variable,2)}</td><td>${fmt(r.portfolio,2)}</td><td>${signed(r.difference)}</td><td>${fmt(r.fixed,2)}</td></tr>`;}
function render(){
 const r=calculate(state),p=DATA.periods[state.period],profile=state.profiles[state.period],total=profile.reduce((a,v)=>a+(v??0),0),peak=Math.max(0,...profile.map(v=>v??0));
 const seller=state.sellerName||'Ludwig Rosenberg';$('advisorName').textContent=seller;$('advisorInitials').textContent=seller.split(/\s+/).map(word=>word[0]).filter(Boolean).slice(0,2).join('').toUpperCase();$('notesLabel').textContent=sellerNotesTitle(seller);
 $('customerLabel').textContent=state.customer;$('annualVolume').innerHTML=`${fmt(r.volume/1000,r.volume%1000?1:0)} <small>MWh</small>`;
 const full=profile.every(v=>v!==null),winter=total?[0,1,2,9,10,11].reduce((a,i)=>a+(profile[i]??0),0)/total:0;
 $('seasonLabel').textContent=!full?'Del av året':!total?'Ingen förbrukning':winter>.55?'Vintertung':winter<.45?'Sommartung':'Jämn över året';
 $('sourceLabel').textContent=p.label;$('profileSource').textContent=profileSourceLabel(state);
 $('profileEstimateNote').hidden=state.sources[state.period]!=='estimated';$('profileEstimateNote').textContent=state.sources[state.period]==='estimated'?profileSourceLabel(state):'';
 $('profileTotal').textContent=fmt(total/1000,1)+' MWh';$('peakMonth').textContent=peak?MONTHS[profile.indexOf(peak)]+' · '+fmt(peak/1000,1)+' MWh':'—';
 $('profileChart').innerHTML=profile.map((v,i)=>`<div class="profile-bar ${v===peak?'peak':''} ${v===null?'missing':''}" title="${MONTHS[i]}: ${v===null?'saknas':fmt(v)+' kWh'}"><span class="value">${v===null?'—':fmt(v/1000,1)}</span><div class="bar" style="height:${peak?(v??0)/peak*112:0}px"></div><span class="month">${MONTHS[i]}</span></div>`).join('');
 document.querySelectorAll('[data-period]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.period===state.period)));
 $('scenarioDescription').textContent=`${r.count} av 12 månader med komplett underlag. Månadspriser från ditt Excelunderlag.`;
 for(const [key,id] of [['variable','variable'],['portfolio','secured'],['fixed','fixed']]){$(id+'Total').textContent=fmt(r[key],2)+' kr';$(id+'Unit').innerHTML=`${fmt(r[key+'Rate'],2)} <small>öre/kWh</small>`;}
 $('savingsPanel').dataset.kind=differenceKind(r);$('savingsTitle').textContent=savingsTitle(r);$('savingsOre').textContent=savingsValue(r.differenceRate);$('savingsMoney').textContent=savingsValue(r.volume?r.difference:null);$('savingsContext').textContent=r.volume?`Jämfört med rörligt, för samma ${fmt(r.volume)} kWh under ${r.periodLabel}.`:'Ingen förbrukning att jämföra för valt år.';
 $('hedgeExplanation').textContent=`${state.hedge} % av volymen prissäkras i jämförelsen. Förbrukningsprofil och andra kostnader påverkar fortfarande slutpriset.`;
 $('consumptionOutput').textContent=state.consumption+' %';$('hedgeOutput').textContent=state.hedge+' %';$('floatingShare').textContent=100-state.hedge+' % osäkrat';
 $('consumption').style.setProperty('--fill',(state.consumption-50)+'%');$('hedge').style.setProperty('--fill',state.hedge+'%');
 const diff=(n,against)=>Math.abs(n)<.005?`lika hög som med ${against}`:`${fmt(Math.abs(n))} kr ${n>0?'lägre':'högre'} än ${against}`;
 $('insightText').textContent=r.volume?`Med ${state.hedge} % säkring blir portföljens beräknade kostnad ${diff(r.difference,'rörligt')} och ${diff(r.fixedDifference,'fastpris')} för perioden.`:'Ingen förbrukning kan beräknas för valt år. Lägg in månadsvärden för att jämföra.';

 renderCharts(r);$('costRows').innerHTML=tableRows(r);$('costFoot').innerHTML=totalRow(r);
 $('priceRows').innerHTML=MONTHS.map((m,i)=>!hasMonthlyPrices(p,i)?`<tr class="missing"><td>${m}</td><td colspan="6">Prisunderlag saknas</td></tr>`:`<tr><td>${m}</td>${[p.hedged[i],p.spot[i],p.running[i],p.weighting[i],p.running[i]-p.weighting[i],state.hedge/100*p.hedged[i]+(1-state.hedge/100)*p.spot[i]+p.running[i]-p.weighting[i]+state.portfolioFee].map(v=>`<td>${fmt(v,2)}</td>`).join('')}</tr>`).join('');
 renderBusiness(r,state);renderMobile(r,state);
 $('sourceFile').textContent=`Källa: ${DATA.sourceName} · flik ${DATA.sheet}. Säkrat: ${p.columns.hedged}. Rörligt: ${p.columns.spot}. Kostnadstillägg: ${p.columns.running} − ${p.columns.weighting}.`;
}
function dialogPeriod(){return pendingImport?.period??state.period;}
function fillProfile(p){$('profileTitle').textContent='Förbrukning · '+DATA.periods[dialogPeriod()].label;$('monthInputs').innerHTML=MONTHS.map((m,i)=>`<label for="month${i}">${m} (kWh)<input id="month${i}" type="number" min="0" max="100000000" step="any" aria-describedby="consumptionUnitNote" placeholder="Saknas" value="${p[i]??''}">${!hasMonthlyPrices(DATA.periods[dialogPeriod()],i)?'<span class="month-price-note">Pris saknas</span>':''}</label>`).join('');updateDialogTotal();}
function readAnnualDraft(){
 const raw=$('annualConsumption').value.trim().replace(/\s/g,'').replace(',','.');
 const value=/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw)?Number(raw):NaN,annualKwh=value*($('annualUnit').value==='mwh'?1000:1),shape=document.querySelector('input[name="profileShape"]:checked').value;
 const profile=annualProfile(annualKwh,shape);
 return {profile,estimate:{annualKwh:Math.round(annualKwh*100)/100,shape,adjusted:false}};
}
function updateAnnualPreview(){
 try{
  const {profile,estimate}=readAnnualDraft(),p=DATA.periods[dialogPeriod()],included=profile.reduce((sum,v,i)=>sum+(hasMonthlyPrices(p,i)?v:0),0);
  $('annualProfileError').hidden=true;$('annualConsumption').setAttribute('aria-invalid','false');$('annualPreview').hidden=false;
  $('annualPreviewSummary').textContent=`${fmt(estimate.annualKwh,2)} kWh/år = ${fmt(estimate.annualKwh/1000,2)} MWh/år · ${PROFILE_SHAPES[estimate.shape].label}`;
  const priceCount=MONTHS.filter((_,i)=>hasMonthlyPrices(p,i)).length;
  $('annualPeriodNote').textContent=priceCount<12?`Årsvärdet fördelas över alla 12 månader. ${priceCount} månader har kompletta priser: ${fmt(included,2)} kWh ingår i jämförelsen. Månader utan priser ingår inte.`:'Alla 12 månader ingår i jämförelsen. Årssumman bevaras vid fördelningen.';
  $('annualPeriodNote').textContent+=' Visas före förbrukningsreglagets justering.';
  const weights=PROFILE_SHAPES[estimate.shape].weights,sum=weights.reduce((a,v)=>a+v,0);
  $('annualPreviewRows').innerHTML=MONTHS.map((m,i)=>`<tr><td>${m}${!hasMonthlyPrices(p,i)?' · pris saknas':''}</td><td>${fmt(weights[i]/sum*100,estimate.shape==='even'?2:0)} %</td><td>${fmt(profile[i],2)}</td></tr>`).join('');
  if(profileMode==='annual')$('applyProfile').disabled=false;
  return true;
 }catch(err){
  $('annualPreview').hidden=true;const show=$('annualConsumption').value.trim()!=='';$('annualProfileError').hidden=!show;$('annualProfileError').textContent=err.message;$('annualConsumption').setAttribute('aria-invalid',String(show));
  if(profileMode==='annual')$('applyProfile').disabled=true;
  return false;
 }
}
function setProfileMode(mode){
 profileMode=mode;$('annualProfilePanel').hidden=mode!=='annual';$('monthlyEntryPanel').hidden=mode!=='monthly';$('profileDialogTotalRow').hidden=mode!=='monthly';$('importStatus').hidden=mode!=='monthly';
 document.querySelectorAll('[data-profile-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.profileMode===mode)));
 document.querySelectorAll('#monthInputs input').forEach(el=>el.disabled=mode==='annual');
 $('applyProfileText').textContent=mode==='annual'?'Använd uppskattad profil':'Använd förbrukning';$('applyProfile').disabled=false;
 if(mode==='annual')updateAnnualPreview();
}
function setupAnnualDraft(s){
 const period=s.period,p=s.profiles[period],e=s.sources[period]==='estimated'?s.estimates[period]:null;
 $('annualUnit').value='kwh';$('annualConsumption').value=e?fmt(e.annualKwh,2):p.every(v=>v!==null)?fmt(p.reduce((a,v)=>a+v,0),2):'';
 document.querySelectorAll('input[name="profileShape"]').forEach(el=>el.checked=el.value===(e?.shape??'winter'));
 $('annualProfileError').hidden=true;$('annualPreview').hidden=true;
}
function openProfile(){pendingImport=null;profileImported=false;$('customer').value=state.customer;fillProfile(state.profiles[state.period]);setupAnnualDraft(state);setProfileMode(state.sources[state.period]==='estimated'&&!state.estimates[state.period].adjusted?'annual':'monthly');$('profileFile').value='';$('importStatus').textContent='Tomt fält = saknas. 0 = angiven förbrukning på noll kWh.';$('importStatus').classList.remove('error');$('profileDialog').showModal();}
function updateDialogTotal(){const total=MONTHS.reduce((a,_,i)=>a+Number($('month'+i).value||0),0);$('dialogTotal').textContent=fmt(total)+' kWh';}
function download(name,content,type){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
function csvCell(value){let str=String(value);if(/^[=+\-@]/.test(str)&&!/^[-+]?\d+(?:[,.]\d+)?$/.test(str))str="'"+str;return '"'+str.replaceAll('"','""')+'"';}
function filename(){return (state.customer.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60)||'kundrum').toLowerCase();}
for(const id of ['editCustomer','editProfile','editProfileTop'])$(id).addEventListener('click',openProfile);
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
document.querySelectorAll('[data-period]').forEach(b=>b.addEventListener('click',()=>{state.period=b.dataset.period;save();render();}));
document.querySelectorAll('[data-chart-unit]').forEach(b=>b.addEventListener('click',()=>{chartUnit=b.dataset.chartUnit;renderCharts(calculate(state));}));
$('monthButtons').addEventListener('click',e=>{const button=e.target.closest('[data-month-index]');if(button)selectMonth(Number(button.dataset.monthIndex),true);});
$('costChart').addEventListener('click',e=>{const target=e.target.closest('[data-chart-month]');if(target)selectMonth(Number(target.dataset.chartMonth),true);});
$('monthButtons').addEventListener('keydown',e=>{
 if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
 const buttons=[...$('monthButtons').querySelectorAll('button:not(:disabled)')],current=buttons.indexOf(e.target);
 if(current<0)return;e.preventDefault();
 const next=e.key==='Home'?0:e.key==='End'?buttons.length-1:(current+(e.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;
 const index=Number(buttons[next].dataset.monthIndex);selectMonth(index);$('monthButtons').querySelector(`[data-month-index="${index}"]`).focus({preventScroll:true});
});
for(const k of ['consumption','hedge','fixed','portfolioFee','variableFee']){$(k).addEventListener('input',()=>{const el=$(k),n=Number(el.value);if(el.value===''||!el.validity.valid||!Number.isFinite(n)){el.classList.add('error-field');return;}el.classList.remove('error-field');state[k]=n;save();render();});$(k).addEventListener('blur',()=>{$(k).value=state[k];$(k).classList.remove('error-field');});}
for(const k of ['notes','next','date','choice'])$(k).addEventListener('input',()=>{state[k]=$(k).value;save();});
$('businessType').addEventListener('change',()=>{state.business={type:$('businessType').value,apartments:null};$('businessApartments').value='';$('businessApartments').removeAttribute('aria-invalid');$('businessApartmentError').hidden=true;save();render();});
$('businessApartments').addEventListener('input',()=>{const raw=$('businessApartments').value.trim(),n=Number(raw),valid=raw===''||/^\d+$/.test(raw)&&Number.isInteger(n)&&n>=1&&n<=100000;state.business={type:$('businessType').value,apartments:valid&&raw!==''?n:null};$('businessApartmentError').hidden=valid;$('businessApartments').setAttribute('aria-invalid',String(!valid));save();render();});
$('resetScenario').addEventListener('click',()=>{for(const k of ['consumption','hedge','fixed','portfolioFee','variableFee'])state[k]=defaults()[k];setControls();save();render();toast('Reglagen återställda till 80 % säkring och filens påslag.');});
$('monthInputs').addEventListener('input',updateDialogTotal);
document.querySelectorAll('[data-profile-mode]').forEach(b=>b.addEventListener('click',()=>setProfileMode(b.dataset.profileMode)));
$('annualConsumption').addEventListener('input',updateAnnualPreview);$('annualUnit').addEventListener('change',updateAnnualPreview);
document.querySelectorAll('input[name="profileShape"]').forEach(el=>el.addEventListener('change',updateAnnualPreview));
$('profileForm').addEventListener('submit',e=>{e.preventDefault();const customer=$('customer').value.trim(),target=pendingImport?cleanState(pendingImport):cleanState(state),period=target.period;target.estimates??={};let profile;
 if(profileMode==='annual'){
  if(!updateAnnualPreview())return;const draft=readAnnualDraft();profile=draft.profile;target.sources[period]='estimated';target.estimates[period]=draft.estimate;
 }else{
  profile=MONTHS.map((_,i)=>$('month'+i).value===''?null:Number($('month'+i).value));
  const changed=!profile.every((v,i)=>v===target.profiles[period][i]);
  if(profileImported){target.sources[period]='own';delete target.estimates[period];}
  else if(changed){if(target.sources[period]==='estimated')target.estimates[period].adjusted=true;else target.sources[period]='own';}
 }
 target.profiles[period]=profile;target.customer=customer;
 if(!validateState(target)){ $('importStatus').textContent='Kontrollera företagsnamn och månadsvärden.';$('importStatus').classList.add('error');return;}
 state=target;setControls();save();render();$('profileDialog').close();toast(canSave?'Kundrummet är uppdaterat.':'Uppdaterat. Exportera för att behålla uppgifterna.');});
$('profileFile').addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;try{if(f.size>1024*1024)throw Error('Maximal filstorlek är 1 MB.');const txt=await f.text();let p;
 if(f.name.toLowerCase().endsWith('.json')){const data=JSON.parse(txt),s=data.version===1?migrateLegacy(data.state):data.version===2?data.state:null;if(!validateState(s))throw Error('Filen är inte ett giltigt kundrum med detta prisunderlag.');pendingImport=cleanState(s);p=s.profiles[s.period];$('customer').value=s.customer;profileImported=false;}else{p=parseProfile(txt);pendingImport=null;profileImported=true;}
 fillProfile(p);setupAnnualDraft(pendingImport??{...state,profiles:{...state.profiles,[state.period]:p},sources:{...state.sources,[state.period]:'own'}});setProfileMode('monthly');$('importStatus').classList.remove('error');$('importStatus').textContent=pendingImport?'Kundrummet inläst. Använd förbrukning återställer även år, reglage och anteckningar.':'Profilen är inläst för valt år. Tomma månader ingår inte i jämförelsen.';
 }catch(err){$('importStatus').textContent='Kunde inte läsa filen: '+err.message;$('importStatus').classList.add('error');}finally{e.target.value='';}});
$('downloadTemplate').addEventListener('click',()=>download('manadsprofil-mall.csv','\uFEFFMånad;kWh\n'+MONTHS.map(m=>m+';').join('\n'),'text/csv;charset=utf-8'));
$('sellerName').addEventListener('change',()=>{const name=$('sellerName').value.trim();if(!name||/[\r\n]/.test(name)){toast('Ange säljarens namn.');return;}state.sellerName=name;save();render();});
function shareEmail(){return buildCustomerEmail(shareSnapshot,{recipientName:$('shareCustomerName').value,recipientEmail:$('shareCustomerEmail').value.trim(),includeNotes:$('shareIncludeNotes').checked});}
function updateEmailPreview(){
 try{const email=shareEmail();$('emailPreview').innerHTML=email.body;$('shareSubject').textContent=email.subject;$('shareYear').textContent=shareSnapshot.period;$('shareNotesLabel').textContent=shareSnapshot.notes.trim()?`Ta med ${sellerNotesTitle(shareSnapshot.sellerName)}`:'Inga anteckningar är ifyllda';$('shareIncludeNotes').disabled=!shareSnapshot.notes.trim();$('shareStatus').textContent='';}catch(err){$('shareStatus').textContent=err.message;}
}
function openShare(){
 if(!calculate(state).volume){toast('Lägg in förbrukning med prisunderlag innan du delar.');return;}
 shareSnapshot=cleanState(state);shareSnapshot.sellerName??='Ludwig Rosenberg';
 $('shareCustomerName').value='';$('shareCustomerEmail').value='';$('shareCustomerEmail').setCustomValidity('');$('shareSellerName').value=shareSnapshot.sellerName;$('shareSellerName').setCustomValidity('');$('shareIncludeNotes').checked=!!shareSnapshot.notes.trim();
 updateEmailPreview();$('shareDialog').showModal();
}
for(const id of ['shareTop','shareBottom'])$(id).addEventListener('click',openShare);
for(const id of ['shareCustomerName','shareIncludeNotes'])$(id).addEventListener('input',updateEmailPreview);
$('shareCustomerEmail').addEventListener('input',()=>{$('shareCustomerEmail').setCustomValidity('');$('shareStatus').textContent='';});
$('shareSellerName').addEventListener('input',()=>{const name=$('shareSellerName').value.trim();$('shareSellerName').setCustomValidity(name&&!/[\r\n]/.test(name)?'':'Ange säljarens namn.');if(name&&!/[\r\n]/.test(name)){shareSnapshot.sellerName=name;state.sellerName=name;$('sellerName').value=name;save();render();updateEmailPreview();}});
async function copyEmail(email){
 if(navigator.clipboard?.write&&typeof ClipboardItem!=='undefined'){
  try{await navigator.clipboard.write([new ClipboardItem({'text/html':new Blob([email.body],{type:'text/html'}),'text/plain':new Blob([email.text],{type:'text/plain'})})]);return;}catch{}
 }
 if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(email.text);return;}
 throw Error('Kopiering stöds inte här. Hämta mejlfilen i stället.');
}
function recipientValid(){const el=$('shareCustomerEmail');el.setCustomValidity(validEmail(el.value.trim())?'':'Ange en giltig mejladress för en kund.');return $('shareForm').reportValidity();}
$('copyCustomerEmail').addEventListener('click',async()=>{if(!$('shareSellerName').reportValidity())return;try{await copyEmail(shareEmail());$('shareStatus').textContent='Hela mejlet är kopierat. Klistra in det i ditt mejlprogram. Inget har skickats.';}catch{$('shareStatus').textContent='Kunde inte kopiera. Hämta mejlfilen i stället.';}});
$('downloadCustomerEmail').addEventListener('click',()=>{if(!recipientValid())return;try{const email=shareEmail();download(filename()+'-'+shareSnapshot.period+'-kundmejl.eml',emailFile(email),'application/octet-stream');$('shareStatus').textContent='Mejlfilen är skapad och nedladdningen har startats. Öppna filen i ditt mejlprogram och kontrollera avsändare och mottagare. Inget har skickats.';}catch{$('shareStatus').textContent='Kunde inte skapa mejlfilen. Kopiera mejlet i stället.';}});
$('shareForm').addEventListener('submit',async e=>{e.preventDefault();if(!recipientValid())return;const button=$('openCustomerEmail');button.disabled=true;try{const email=shareEmail();await copyEmail(email);const link=document.createElement('a');link.href=mailtoLink({...email,text:''});document.body.append(link);link.click();link.remove();$('shareStatus').textContent='Mejlet är kopierat. Klistra in (Ctrl+V eller ⌘V) i mejlet som öppnas och klicka Skicka där. Om inget öppnas: skapa ett mejl själv och klistra in. Inget har skickats från kundrummet.';}catch{$('shareStatus').textContent='Kunde inte kopiera. Hämta mejlfilen eller kopiera förhandsvisningen manuellt. Inget har skickats.';}finally{button.disabled=false;}});
for(const k of ['exportTop','exportBottom'])$(k).addEventListener('click',()=>$('exportDialog').showModal());
$('downloadRoom').addEventListener('click',()=>{download(filename()+'-kundrum.json',JSON.stringify({version:2,exportedAt:new Date().toISOString(),state},null,2),'application/json');toast('Redigerbart kundrum exporterat.');});
$('downloadCalculation').addEventListener('click',()=>{
 const r=calculate(state),n=v=>v===null?'':v.toFixed(2).replace('.',','),keys=['volume','hedged','spot','running','weighting','cost','variableRate','portfolioRate','differenceRate','variable','portfolio','difference','fixedRate','fixed'];
 const rows=[['Kundrummet – beräknad jämförelse, ingen offert'],['Företag',state.customer],['År',r.periodLabel],['Källa',DATA.sourceName],['Prisunderlag ID',DATA.id],['Profilkälla',profileSourceLabel(state)],['Verksamhet',businessImpact(r,state).type.label],['Antal lägenheter',state.business?.type==='brf'?state.business.apartments??'':''],['Skillnad per lägenhet kr (plus = besparing)',state.business?.type==='brf'&&state.business.apartments?n(r.difference/state.business.apartments):''],...businessImpact(r,state).lines.map(line=>[line]),['Förbrukning av profil (%)',state.consumption],['Säkringsgrad (%)',state.hedge],['Säkringsgraden gäller volym, inte hela fakturan. Förbrukningsprofil och andra kostnader påverkar fortfarande slutpriset.'],['Påslag portfölj öre/kWh',n(state.portfolioFee)],['Påslag rörligt öre/kWh',n(state.variableFee)],['Fastpris öre/kWh',n(state.fixed)],['Kostnadstillägg = rörlig kostnad minus volymvägning, gäller portfölj och rörligt. Inget separat säkringspåslag.'],['Portfölj = kWh × (säkrad andel × säkrat pris + rörlig andel × rörligt pris + kostnadstillägg + portföljpåslag) / 100.'],['Rörligt = kWh × (rörligt pris + kostnadstillägg + rörligt påslag) / 100. Fastpris = kWh × fastpris / 100.'],['Belopp exklusive moms, elnät och energiskatt. Månadsmodell. Ingen fakturaberäkning.'],['Skillnad = rörligt minus portfölj. Positivt = besparing; negativt = merkostnad. Snittpriser viktas efter förbrukning. Skillnader räknas före avrundning.'],[],['Sammanfattning','Snittpris öre/kWh','Kostnad kr'],['Rörligt',n(r.variableRate),n(r.variable)],['Portfölj',n(r.portfolioRate),n(r.portfolio)],['Skillnad',n(r.differenceRate),n(r.difference)],['Fastpris',n(r.fixedRate),n(r.fixed)],[],['Månad','kWh','Säkrat öre/kWh','Rörligt baspris öre/kWh','Rörlig kostnad öre/kWh','Volymvägning öre/kWh','Kostnadstillägg öre/kWh','Rörligt inkl tillägg öre/kWh','Portfölj inkl tillägg öre/kWh','Skillnad öre/kWh','Rörligt kr','Portfölj kr','Skillnad kr','Fastpris öre/kWh','Fastpris kr','Status'],...r.rows.map(row=>[row.month,...keys.map(k=>n(row.available?row[k]:k==='volume'?row.volume:null)),row.available?'Ingår':'Underlag saknas – ingår inte']),['Totalt / vägt snitt',...keys.map(k=>n(r[k]??null)),`${r.count} månader`]];
 download(filename()+'-'+state.period+'-berakning.csv','\uFEFF'+rows.map(row=>row.map(csvCell).join(';')).join('\r\n'),'text/csv;charset=utf-8');
});
function prepareReport(){
 const r=calculate(state),choice={undecided:'Vi vill jämföra mer',variable:'Rörligt',portfolio:'Portfölj',fixed:'Fastpris'}[state.choice];
 $('printArea').innerHTML=`<div class="print-brand"><img src="/brand/kraftringen-logo.svg" alt="Kraftringen" width="190" height="33"><span>Kundrummet</span></div><p>KUNDRUMMET · ${new Date().toLocaleDateString('sv-SE')}</p><h1>${esc(state.customer)}</h1><p class="print-note"><strong>Beräknad jämförelse – ingen offert.</strong> Månadsmodell med priser från ditt Excelunderlag och valbar säkringsgrad.</p><h2>${r.periodLabel}</h2><p>${r.count} månader med underlag. Förbrukning i jämförelsen: ${fmt(r.volume)} kWh (${state.consumption} % av profilen).<br>Profil: ${esc(profileSourceLabel(state))} Säkringsgrad: ${state.hedge} %.<br>Påslag portfölj: ${fmt(state.portfolioFee,2)} öre/kWh. Påslag rörligt: ${fmt(state.variableFee,2)} öre/kWh. Fastpris: ${fmt(state.fixed,2)} öre/kWh.</p><table class="print-comparison"><thead><tr><th>Alternativ</th><th>Snittpris, öre/kWh</th><th>Kostnad för perioden, kr</th></tr></thead><tbody><tr><td>Rörligt</td><td>${fmt(r.variableRate,2)}</td><td>${fmt(r.variable,2)}</td></tr><tr><td>Portfölj</td><td>${fmt(r.portfolioRate,2)}</td><td>${fmt(r.portfolio,2)}</td></tr><tr><td>Fastpris</td><td>${fmt(r.fixedRate,2)}</td><td>${fmt(r.fixed,2)}</td></tr></tbody></table><div class="print-savings"><strong>${savingsTitle(r)}</strong><p>${savingsValue(r.differenceRate)} öre/kWh · ${savingsValue(r.volume?r.difference:null)} kr för perioden</p></div><p>Förbrukningsvägda snittpriser. Belopp exklusive moms, elnät och energiskatt.</p><h2>För er verksamhet</h2>${businessImpact(r,state).lines.map(line=>`<p>${esc(line)}</p>`).join('')}<h2>Priser per månad · öre/kWh</h2><div class="print-chart">${priceChart(r,'ore','print-price')}</div><p>Korall: rörligt. Blå: portfölj. Streckad grå: fastpris.</p><h2>Besparing eller merkostnad per månad · kr</h2><div class="print-chart">${differenceChart(r,'kr','print-difference')}</div><p>Plus = besparing med portfölj. Minus = merkostnad.</p><h2>Månadstabell</h2><table class="print-months"><thead><tr><th>Månad</th><th>kWh</th><th>Rörligt<br>öre/kWh</th><th>Portfölj<br>öre/kWh</th><th>Skillnad<br>öre/kWh</th><th>Rörligt<br>kr</th><th>Portfölj<br>kr</th><th>Skillnad<br>kr</th><th>Fastpris<br>kr</th></tr></thead><tbody>${tableRows(r)}</tbody><tfoot>${totalRow(r)}</tfoot></table><h2>${esc(sellerNotesTitle(state.sellerName||'Ludwig Rosenberg'))}</h2><p class="print-notes">${esc(state.notes||'Inga anteckningar ännu.')}</p><p><strong>Alternativ att undersöka:</strong> ${choice}<br><strong>Nästa steg:</strong> ${esc(state.next||'Inte bestämt')}<br><strong>Uppföljningsdatum:</strong> ${esc(state.date||'Inte bestämt')}</p><h2>Beräkning och underlag</h2>${$('methodText').innerHTML}<p class="source-filename">${esc($('sourceFile').textContent)}</p><p>Kontakt: ${esc(state.sellerName||'Ludwig Rosenberg')}. Valet är en mötesanteckning. Inget avtal eller någon bokning skapas.</p>`;
}
window.addEventListener('beforeprint',prepareReport);
$('printReport').addEventListener('click',()=>{$('exportDialog').close();prepareReport();window.print();});
$('resetRoom').addEventListener('click',()=>$('resetDialog').showModal());$('confirmReset').addEventListener('click',()=>{state=defaults();migrated=false;$('migrationNote').hidden=true;setControls();save();render();$('resetDialog').close();toast('Filens värden och 80 % säkring har återställts.');});
document.querySelectorAll('.header nav a').forEach(a=>a.addEventListener('click',()=>{document.querySelectorAll('.header nav a').forEach(x=>x.classList.remove('active'));a.classList.add('active');}));
if(migrated){$('migrationNote').hidden=false;$('migrationNote').textContent='Din tidigare profil och dina anteckningar finns kvar. Demopriserna har ersatts med Excelunderlaget och dess påslag. Profilen har kopierats till båda åren.';save();}
initMobile();setControls();render();

````

## Fil: public/brand.css

````text
/* Adapted from Kraftringen's public website, inspected 2026-10-27.
   Official palette: navy #013c57, yellow #fbc34e, pink #f8c3c6.
   Chart colours are darker variants for readable values on white. */
:root{--bg:#fff;--paper:#fff;--ink:#013c57;--muted:#526572;--border:#d9e3e8;--lime:#fbc34e;--green:#007aa3;--orange:#b84636;--pink:#f8c3c6}
body{font-family:'Poppins',Arial,sans-serif;font-weight:400}
button:focus-visible,a:focus-visible,summary:focus-visible{outline-color:#007aa3}
input:focus-visible,select:focus-visible,textarea:focus-visible{outline-color:#007aa3}
.header{background:var(--ink);color:#fff;border-bottom:3px solid var(--lime);height:88px;gap:24px}
.brand{gap:22px;flex-shrink:0;letter-spacing:0}
.brand-logo{width:200px;height:auto;display:block}
.brand-room{font-size:17px;font-weight:600;border-left:1px solid #ffffff55;padding-left:20px;line-height:1.35}
.brand-room small{display:block;font-size:8px;letter-spacing:1.7px;margin-top:4px;font-weight:400}
.header nav{gap:0;color:#fff;font-weight:500}
.header nav a{padding:0 16px;border:0}
.header nav a.active,.header nav a:hover{background:var(--lime);color:var(--ink);border:0}
.header .btn.light{background:var(--pink);color:var(--ink);font-weight:600;flex-shrink:0}
.header a:focus-visible,.header button:focus-visible,.controls :focus-visible{outline-color:var(--lime)}
.btn{border-radius:10px;font-weight:600;min-height:44px}
.btn.primary{background:var(--pink);color:var(--ink)}
.btn.primary:hover,.header .btn:hover{background:#f4aeb2}
.btn.light{background:#e9f0f4}.btn.outlined{border-color:var(--ink)}
.btn.outlined:hover{background:#edf5f8}
main{padding-top:24px}.contextline{font-size:10px;letter-spacing:1.1px}
.status-dot{background:#007aa3}.demo-badge{background:#fff5dc;border:1px solid #f0d99f;color:var(--ink);font-size:9px}
.hero{padding:36px 0 32px}.eyebrow{font-size:10px;letter-spacing:1.3px;color:var(--muted)}
h1{font-size:clamp(36px,3.6vw,50px);font-weight:700;letter-spacing:-1.7px;line-height:1.18;margin-bottom:16px}
h1 em{color:var(--ink);text-decoration:underline;text-decoration-color:var(--lime);text-decoration-thickness:5px;text-underline-offset:8px}
h2{font-weight:700;letter-spacing:-.7px;font-size:29px}h3{font-weight:600}
.lead{font-size:14px;line-height:1.8}.avatar{border:0;background:var(--pink);font-weight:600}
.advisor strong{font-size:13px}.advisor span{font-size:11px}
.summary-strip{background:#eff5f8;border:0;border-radius:12px;padding:21px 24px;gap:18px}
.summary-strip strong{font-weight:600;font-size:21px;letter-spacing:-.5px}.summary-strip span{font-size:11px}
.summary-strip>div{border-color:#cad9e1}.summary-strip strong small{color:var(--muted)}
.app-install-bar{background:#fff8e7;border-color:#f1dfb3;padding:14px 20px}
.app-install-bar strong{font-size:13px}.app-install-bar p{font-size:11px}
.explore{padding-top:36px}.comparison{border-radius:14px;box-shadow:0 4px 20px #013c5705}
.scenario-tabs{background:#edf3f6;border-radius:10px;padding:4px;gap:4px}
.scenario-tabs button{font-size:12px;color:var(--ink);min-height:40px;border-radius:7px}
.scenario-tabs button[aria-pressed=true]{background:var(--ink);color:#fff;box-shadow:none;font-weight:600}
.comparison-heading h3{font-size:18px;font-weight:600}.comparison-heading p{font-size:11px}
.cost-card{background:#fff5f3;border-color:#f0d6d1;border-radius:10px;padding:20px}
.portfolio-card{background:#edf6fa;border-color:#c7e0ea}.cost-card h4{font-size:14px;font-weight:600;margin-bottom:17px}
.cost-card .metric-caption{font-size:11px}.rate-value{font-weight:600;font-size:clamp(28px,2.5vw,36px);letter-spacing:-1px}
.money-value{font-size:clamp(20px,1.9vw,27px);font-weight:600;letter-spacing:-.7px}
.cost-card p{font-size:11px;line-height:1.7}
.savings-panel{background:var(--lime);color:var(--ink);border-radius:10px;padding:24px}
.savings-panel h4{color:var(--ink);font-weight:600;font-size:14px;margin-bottom:18px}
.savings-values strong{color:var(--ink);font-weight:600;letter-spacing:-1.3px;font-size:clamp(30px,2.8vw,40px)}
.savings-values span{color:var(--ink);font-size:11px}.savings-panel p{color:var(--ink);font-size:11px}
.savings-values>div+div{border-color:#013c5740}
.savings-panel[data-kind=extra]{background:#fbe6e2;color:var(--ink);border:1px solid #e9bbb1}
.savings-panel[data-kind=extra] h4,.savings-panel[data-kind=extra] p,.savings-panel[data-kind=extra] span{color:var(--ink)}
.savings-panel[data-kind=extra] strong{color:#a33326}
.savings-panel[data-kind=equal],.savings-panel[data-kind=empty]{background:#edf3f6}
.savings-panel[data-kind=equal] strong,.savings-panel[data-kind=empty] strong{color:var(--ink)}
.comparison-note{font-size:11px}.fixed-reference{font-size:11px}
.unit-toggle{background:#edf3f6;border-radius:9px}.unit-toggle button{color:var(--ink);font-size:12px;border-radius:6px}
.unit-toggle button[aria-pressed=true]{background:var(--ink);color:#fff;box-shadow:none}
.chart-toolbar h3{font-size:17px}.chart-header h4,.chart-header>span{font-size:11px}
.legend{font-size:10px}.line.fixed{background:#71818b}.positive{color:#007aa3}.negative{color:#a33326}
.controls{border-radius:14px;background:var(--ink);padding:26px 24px}
.controls h3{font-size:24px;font-weight:600;line-height:1.4;letter-spacing:-.6px}
.controls .eyebrow{color:#cfdee5;font-size:9px;letter-spacing:1px}
.control-intro{color:#d8e5eb;font-size:12px}.control label{font-size:12px}
.control output{font-weight:500;font-size:20px}.range-labels{color:#c5d8e1;font-size:9px}
input[type=range]{height:5px;background:linear-gradient(to right,var(--lime) 0%,var(--lime) var(--fill,50%),#4a7183 var(--fill,50%))}
input[type=range]::-webkit-slider-thumb{width:19px;height:19px;border-width:3px}
input[type=range]::-moz-range-thumb{width:14px;height:14px}
.price-inputs label{font-size:11px;color:#d8e5eb}.input-unit{background:#164e67;border-color:#5c7f90;border-radius:8px}
.input-unit span{color:#d1e0e8}.control-footnote{color:#d1e0e8;font-size:10px;line-height:1.8}
.reset{border-color:#4a7183;font-size:11px}.control-return{color:#fff}
.insight-icon{background:#e5f0f6;color:var(--ink)}.insight p{font-size:11px;line-height:1.8}
.price-breakdown strong{font-weight:600}.breakdown-heading{font-size:11px}.price-breakdown b{color:#6e8795}
.calculation summary{font-size:12px;color:var(--ink);font-weight:500}.basis-note{background:#fff5dc}
.profile-bar .bar{background:#b6d5e3}.profile-bar.peak .bar{background:#007aa3}
.profile-copy p:not(.eyebrow){color:var(--muted)}.profile-chart-top h3{font-size:14px}
.meeting-grid label,dialog label{font-size:12px}.meeting-grid input::placeholder,.meeting-grid textarea::placeholder{color:#657985}
.meeting-section{border-top:1px solid var(--border)}.save-status{font-size:10px}
footer{margin:15px calc(-1 * max(4.5vw,24px)) 0;padding:28px max(4.5vw,24px);background:var(--ink);color:#fff;border:0;gap:20px}
.footer-brand{flex-shrink:0}.footer-brand img{display:block;max-width:100%;height:auto}.footer-brand span{color:#d1e0e8;font-size:10px;margin-top:9px}
footer p{color:#d1e0e8;font-size:10px}footer .text-btn{font-size:10px}
dialog{background:#fff;border-radius:16px;box-shadow:0 30px 100px #013c5730}dialog::backdrop{background:#013c5777}
.close{background:#edf3f6}.import-area{border-color:#89acbd}.form-message{color:#007aa3}
.export-option strong{font-size:13px}.export-option small{font-size:11px}
.install-platforms{background:#edf3f6}.install-platforms button[aria-pressed=true]{background:var(--ink);color:#fff}
.install-heading h2{font-weight:700}.app-nav{background:#fffffff5}.app-nav a[aria-current=location]{background:var(--lime);color:var(--ink)}
@media(min-width:1500px){footer{margin-left:-60px;margin-right:-60px;padding-left:60px;padding-right:60px}}
@media(max-width:1100px){.header{gap:18px}.brand{gap:15px}.brand-logo{width:170px}.brand-room{padding-left:15px;font-size:15px}.header nav a{padding:0 12px;font-size:12px}.header .btn{font-size:11px;padding:10px 12px}.controls{padding:24px 18px}.cost-card{padding:17px}.money-value{font-size:21px}}
@media(max-width:950px){.brand-room{display:none}.header nav a{padding:0 14px}.brand-logo{width:185px}}
@media(max-width:850px){.header{height:76px}.brand-logo{width:170px}.summary-strip{padding:20px}.summary-strip strong{font-size:18px}.controls{padding:24px}.rate-value{font-size:34px}.money-value{font-size:25px}footer{margin-left:-24px;margin-right:-24px;padding:26px 24px}.footer-brand img{width:165px}.comparison-heading h3{font-size:17px}.savings-values strong{font-size:36px}}
@media(max-width:560px){.header{height:76px;gap:14px}.brand-logo{width:170px}.header .btn{min-height:40px;font-size:10px;padding:10px}.header .btn svg{display:none}main{padding-top:20px}.contextline{font-size:8px;letter-spacing:.5px}.demo-badge{font-size:7px;letter-spacing:0}.hero{padding:30px 0 27px}.hero .eyebrow{font-size:9px}h1{font-size:36px;letter-spacing:-1.2px;line-height:1.22;max-width:350px}h1 em{text-decoration-thickness:4px;text-underline-offset:6px}.lead{font-size:12px}h2{font-size:25px}.eyebrow{font-size:9px}.summary-strip{padding:16px 13px;gap:9px;border-radius:10px}.summary-strip>div{padding-left:10px}.summary-strip span{font-size:8px}.summary-strip strong{font-size:14px;letter-spacing:-.4px}.summary-strip strong small{font-size:9px}.app-install-bar{padding:15px}.app-install-bar strong{font-size:12px}.explore{padding-top:30px}.comparison{padding:15px 13px;border-radius:12px}.scenario-tabs button{font-size:10px;line-height:1.6;min-height:44px;padding:8px 6px}.comparison-heading h3{font-size:16px}.cost-card{padding:15px 11px}.cost-card h4{font-size:12px}.cost-card .metric-caption{font-size:9px}.rate-value{font-size:27px}.money-value{font-size:18px;letter-spacing:-.7px}.cost-card p{font-size:10px}.savings-panel{padding:20px 16px}.savings-panel h4{font-size:13px}.savings-values strong{font-size:28px;letter-spacing:-1px}.savings-values span,.savings-panel p{font-size:10px}.comparison-note{font-size:10px}.chart-toolbar h3{font-size:16px}.unit-toggle button{font-size:12px}.controls h3{font-size:24px}.control label{font-size:11px}.control output{font-size:19px}.control-intro{font-size:12px}.control-footnote{font-size:10px}.controls .eyebrow{font-size:8px}.legend{font-size:9px}.insight p{font-size:10px}.calculation summary{font-size:11px}.profile-chart-top h3{font-size:12px}.meeting-section .section-heading{gap:10px}.meeting-grid label{font-size:12px}footer{margin-left:-18px;margin-right:-18px;padding:26px 18px}.footer-brand img{width:170px}footer p{font-size:9px}footer .text-btn{font-size:10px}.app-nav a{font-size:10px}.dialog-head h2{font-size:24px}.install-heading h2{font-size:21px}}
@media(max-width:360px){.brand-logo{width:145px}.header .btn{font-size:9px;padding:9px 8px}.cost-cards{grid-template-columns:1fr}.cost-card{padding:15px}.money-value{font-size:19px}.savings-values strong{font-size:24px}h1{font-size:33px}.summary-strip strong{font-size:12px}.summary-strip strong small{font-size:8px}}
@media print{body{color:#013c57}.print-brand{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #fbc34e;padding-bottom:10px}.print-brand img{filter:brightness(0);height:auto}.print-brand span{font-weight:700}#printArea h1,#printArea h2{font-family:'Poppins',Arial,sans-serif;font-weight:700}#printArea .print-savings{background:#fff5dc;border-color:#e1c783}#printArea .print-note{background:#edf3f6}.positive{color:#007aa3}.negative{color:#a33326}}

.consumption-unit-note{font-size:12px;line-height:1.8;background:#fff5dc;border:1px solid #f1dfb3;border-radius:8px;padding:13px 15px;margin:0 0 18px;color:var(--ink)}
.month-grid label{font-size:12px;font-weight:500}.month-price-note{display:block;margin-top:5px}
@media(max-width:560px){.month-grid label{font-size:11px}.consumption-unit-note{font-size:12px}.profile-chart-top{align-items:flex-start;flex-wrap:wrap;gap:5px}.profile-chart-top h3{font-size:12px}}

````

## Fil: public/business-impact.css

````text
.business-impact{background:#f5f7fa;border:1px solid #e1e8ed;border-radius:20px;padding:26px;margin-top:28px;color:#013c57}
.business-heading{display:flex;gap:14px;align-items:center;margin-bottom:24px}.business-icon{width:48px;height:48px;border-radius:16px;background:#f8d9dc;display:grid;place-items:center;flex-shrink:0}.business-icon svg{width:26px;height:26px;fill:none;stroke:#013c57;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}.business-heading p{font-size:9px;letter-spacing:1.2px;font-weight:500;margin:0 0 5px;color:#62717e}.business-heading h3{font-size:22px;font-weight:500;letter-spacing:-.6px;margin:0;line-height:1.4}
.business-inputs{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:23px}.business-inputs:has(#businessApartmentField[hidden]){grid-template-columns:1fr}.business-inputs label{display:block;font-size:12px;font-weight:500;color:#526572}.business-inputs label>span{font-weight:400;font-size:11px}.business-inputs select,.business-inputs input{display:block;width:100%;font:400 16px 'Poppins',sans-serif;color:#013c57;border:1px solid #cfdae2;background:white;border-radius:12px;min-height:48px;padding:11px 13px;margin-top:7px}.business-inputs input[aria-invalid=true]{border-color:#a33326}.business-inputs input::placeholder{color:#82929e;font-size:13px}#businessApartmentError{font-size:11px;color:#a33326;line-height:1.6;margin:7px 0 0}
.business-result{background:#fff2cf;border-radius:17px;padding:21px}.business-result>p:first-child{font-size:13px;line-height:1.7;margin:0 0 11px}.business-amount{display:flex;flex-wrap:wrap;align-items:baseline;gap:3px 9px}.business-amount strong{font-size:34px;font-weight:600;letter-spacing:-1px;line-height:1.3;overflow-wrap:anywhere}.business-amount span{font-size:13px;white-space:nowrap}.business-secondary{font-size:12px;line-height:1.7;margin:10px 0 0!important}.business-impact[data-kind=extra] .business-result{background:#fbe0e2}.business-impact[data-kind=equal] .business-result,.business-impact[data-kind=empty] .business-result{background:#e7eef3}
.business-sensitivity{font-size:13px;font-weight:500;line-height:1.8;margin:20px 0 12px}.business-context{font-size:12px;line-height:1.8;color:#526572;margin:12px 0}.business-scope{font-size:10px;color:#62717e;line-height:1.8;border-top:1px solid #dce4eb;padding-top:13px;margin:16px 0 0}
@media screen and (max-width:700px){
 .business-impact{background:#fff;border:0;border-radius:26px;margin:0 0 20px;padding:24px}.business-heading{margin-bottom:23px;gap:13px}.business-heading h3{font-size:21px}.business-heading p{font-size:8px;letter-spacing:1px}.business-icon{width:45px;height:45px;border-radius:15px}.business-inputs{grid-template-columns:1fr;gap:18px}.business-inputs select,.business-inputs input{min-height:52px;border-radius:14px;background:#f7f9fb}.business-inputs label{font-size:13px}.business-result{border-radius:18px;padding:20px}.business-result>p:first-child{font-size:13px}.business-amount strong{font-size:34px}.business-amount span{font-size:12px}.business-secondary{font-size:12px}.business-sensitivity{font-size:13px;line-height:1.8}.business-context{font-size:11px;line-height:1.9}.business-scope{font-size:10px;line-height:1.9}
}
@media screen and (max-width:360px){.business-impact{padding:21px}.business-heading h3{font-size:19px}.business-heading p{font-size:7px}.business-heading{gap:10px}.business-amount strong{font-size:29px}.business-result{padding:17px}}

````

## Fil: public/business-impact.mjs

````text
// Presentation only: all values derive from the same included comparison months.
export const BUSINESS_TYPES=Object.freeze({
 company:{label:'Företag',subject:'verksamheten',context:'En tydligare bild av vad elvalet betyder för er kostnadsbudget.'},
 brf:{label:'BRF',subject:'föreningen',context:'Se skillnaden för föreningen och, om ni vill, per lägenhet.'},
 hotel:{label:'Hotell',subject:'hotellet',context:'Ett konkret belopp att ta med i hotellets driftbudget.'},
 industry:{label:'Industri',subject:'produktionen',context:'Elkostnaden för den förbrukning ni har jämfört. Ändrad produktion behöver en uppdaterad förbrukningsprofil.'},
 farm:{label:'Lantbruk',subject:'lantbruket',context:'Förbrukningens fördelning över året avgör utfallet. Utgå från månaderna då elen faktiskt används.'},
 shop:{label:'Butik',subject:'butiken',context:'Ett konkret belopp att ta med i butikens kostnadsbudget.'}
});
export function validBusiness(b){return b===undefined||!!b&&typeof b==='object'&&!Array.isArray(b)&&Object.hasOwn(BUSINESS_TYPES,b.type)&&(b.apartments===null||Number.isInteger(b.apartments)&&b.apartments>=1&&b.apartments<=100000);}
const format=(n,d=2)=>new Intl.NumberFormat('sv-SE',{minimumFractionDigits:d,maximumFractionDigits:d}).format(n);
const magnitude=n=>Math.abs(n)>1e-8&&Math.abs(n)<.005?'< 0,01':format(Math.abs(n));
export function businessImpact(r,s){
 const business=validBusiness(s.business)&&s.business?s.business:{type:'company',apartments:null},type=BUSINESS_TYPES[business.type],perApartment=business.type==='brf'&&business.apartments!==null;
 const kind=!r.volume?'empty':Math.abs(r.difference)<1e-8?'equal':r.difference>0?'saving':'extra';
 const direction=kind==='extra'?'högre':kind==='equal'?'oförändrad':'lägre';
 const amount=r.volume?(perApartment?r.difference/business.apartments:r.difference):null;
 const unit=perApartment?'kr per lägenhet':'kr';
 const caption=perApartment?`${direction[0].toUpperCase()+direction.slice(1)} beräknad elkostnad`:`${direction[0].toUpperCase()+direction.slice(1)} beräknad elkostnad för ${type.subject}`;
 const percent=r.volume&&r.variable>0?r.difference/r.variable*100:null;
 const percentText=percent===null?'':kind==='equal'?'Samma beräknade elkostnad som rörligt':`${format(Math.abs(percent),1)} % ${direction} elkostnad än rörligt`;
 const scope=`${s.period} · ${r.count} av 12 månader · ${format(r.volume/1000,r.volume%1000?1:0)} MWh i jämförelsen${s.sources[s.period]==='estimated'?' · uppskattad förbrukning':''}.`;
 const basis=perApartment?`Jämnt fördelat på ${format(business.apartments,0)} lägenheter. Ett räkneexempel, inte en beräknad ändring av månadsavgiften.`:type.context;
 const sensitivity=`1 öre/kWh motsvarar ${format(r.volume/100)} kr för er förbrukning i jämförelsen.`;
 const total=`${magnitude(r.difference)} kr ${kind==='extra'?'mer':kind==='equal'?'i skillnad':'mindre'} för ${type.subject} jämfört med rörligt.`;
 const result=amount===null?'Lägg in förbrukning för att se effekten.':`${magnitude(amount)} ${unit} · ${caption.toLowerCase()}.`;
 const lines=[`Verksamhet: ${type.label}.`,result,...(perApartment?[total]:percentText?[percentText+'.']:[]),sensitivity,basis,scope,'Exklusive moms, elnät och energiskatt. Ingen prognos.'];
 return {business,type,kind,amount,unit,caption,percent,percentText,scope,basis,sensitivity,total,result,lines,displayAmount:amount===null?'—':magnitude(amount)};
}
export function renderBusiness(r,s){
 const v=businessImpact(r,s),$=id=>document.getElementById(id);
 $('businessType').value=v.business.type;
 if(document.activeElement!==$('businessApartments')){$('businessApartments').value=v.business.apartments??'';$('businessApartments').removeAttribute('aria-invalid');$('businessApartmentError').hidden=true;}
 $('businessApartmentField').hidden=v.business.type!=='brf';
 $('businessImpact').dataset.kind=v.kind;
 $('businessImpactIcon').dataset.type=v.business.type;
 const icon={company:'M4 21V7h16v14M8 7V3h8v4M9 11h1m4 0h1m-6 4h1m4 0h1m-5 6v-3h4v3',brf:'M4 21V3h11v18M15 10h5v11M8 7h3m-3 4h3m-3 4h3m-3 6v-3h3v3',hotel:'M3 20V9m18 11V9M3 15h18M6 15v-4h5v4m0-4h7v4M5 5h14',industry:'M3 21V10l6 4V9l6 5V7h6v14H3m14-14V3h3v4M7 18h1m4 0h1m4 0h1',farm:'M3 21V11l9-8 9 8v10H3m5 0v-9h8v9M8 12l8 9m0-9-8 9',shop:'M4 10v11h16V10M3 10l2-7h14l2 7M3 10c0 4 6 4 6 0 0 4 6 4 6 0 0 4 6 4 6 0M8 21v-6h4v6'};
 $('businessIconPath').setAttribute('d',icon[v.business.type]);
 $('businessImpactAmount').textContent=v.displayAmount;$('businessImpactUnit').textContent=v.unit;
 $('businessImpactCaption').textContent=v.kind==='empty'?'Lägg in förbrukning för att se effekten':v.caption;
 $('businessImpactSecondary').textContent=v.business.type==='brf'&&v.business.apartments!==null?v.total:v.percentText;
 $('businessImpactSecondary').hidden=!$('businessImpactSecondary').textContent||v.kind==='empty';
 $('businessImpactSensitivity').textContent=v.sensitivity;$('businessImpactSensitivity').hidden=v.kind==='empty';
 $('businessImpactContext').textContent=v.basis;$('businessImpactScope').textContent=v.scope;
}

````

## Fil: public/chart-experience.css

````text
.month-explorer{padding-top:28px;margin-top:24px;border-top:1px solid var(--border)}
.month-explorer .chart-toolbar{margin:0;align-items:center}.chart-eyebrow{font-size:9px;font-weight:600;letter-spacing:1.5px;color:#526572;margin:0 0 5px}.month-explorer .chart-toolbar h3{font-size:23px;letter-spacing:-.8px;margin:0}.chart-instruction{font-size:11px;color:#526572;margin:8px 0 19px;line-height:1.7}
.month-focus{scroll-margin-top:16px;background:#013c57;color:#fff;border-radius:13px;overflow:hidden;padding:16px;min-width:0}.month-focus-heading{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px}.month-focus-heading>div>span{font-size:8px;font-weight:500;letter-spacing:1.4px;color:#bad0db}.month-focus-heading h4{font-size:19px;letter-spacing:-.4px;margin:4px 0 0}.month-focus-heading>p{font-size:12px;white-space:nowrap;margin:0;color:#d4e2e9}.month-focus-heading>p>span{font-size:10px}
.month-metrics{display:grid;grid-template-columns:1fr 1fr 1.22fr;gap:14px;align-items:center}.month-metric{min-width:0}.month-metric>span{display:flex;gap:7px;align-items:center;font-size:10px;color:#d9e7ee}.month-metric .line{width:17px;height:3px;border:0;flex-shrink:0}.month-metric .variable{background:#efac94}.month-metric .secured{background:#76cde5}.month-metric strong,.month-result strong{display:block;font-size:clamp(17px,1.7vw,23px);line-height:1.35;font-weight:600;letter-spacing:-.6px;margin-top:9px;overflow-wrap:anywhere}.month-metric strong small,.month-result strong small{font-size:10px;font-weight:400;letter-spacing:0;white-space:nowrap}.month-metric p,.month-result p{font-size:10px;line-height:1.6;margin:5px 0 0;color:#d9e7ee}.month-result{padding:14px;border-radius:9px;background:#fbc34e;color:#013c57;min-width:0}.month-result>span{font-size:9px;font-weight:500;display:block}.month-result strong{font-size:clamp(19px,1.9vw,27px);margin-top:6px}.month-result p{color:#013c57;font-size:10px}.month-result[data-kind=extra]{background:#f8c3c6}.month-result[data-kind=equal]{background:#d9e7ee}.month-empty strong{font-size:15px}.month-empty p{font-size:12px;color:#d9e7ee;line-height:1.7}
.month-explorer .chart-header{display:flex;justify-content:space-between;gap:12px;margin-top:23px}.month-explorer .chart-header h4{font-size:11px;color:#013c57;font-weight:500}.month-explorer .chart-header>span{font-size:10px;color:#526572}.month-explorer .cost-chart{margin:4px 0 8px}.month-explorer .legend{display:flex;flex-wrap:wrap;gap:8px 18px;font-size:10px;margin:0}.gap-key{margin-left:auto}.gap-key i{width:13px;height:10px;background:linear-gradient(90deg,#fbc34e 50%,#f8c3c6 50%);border-radius:2px}.month-explorer .mobile-chart-hint{font-size:9px}
.month-nav-heading{border-top:1px solid var(--border);padding-top:18px}.month-buttons{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:3px;margin:8px 0 10px}.month-button{appearance:none;position:relative;border:1px solid transparent;background:transparent;color:#007aa3;border-radius:8px;padding:3px 1px 8px;font-family:inherit;min-width:0;cursor:pointer;transition:background .15s,border-color .15s}.month-button:hover{background:#edf3f6}.month-button[aria-pressed=true]{background:#edf3f6;border-color:#013c57;box-shadow:inset 0 -3px #013c57}.month-button:focus-visible{outline:3px solid #007aa3;outline-offset:2px;z-index:1}.month-bar-space{display:block;position:relative;height:77px;margin:0 4px}.month-bar-space:after{content:"";position:absolute;top:38px;left:-5px;right:-5px;height:1px;background:#cbd8df}.month-bar-space i{display:block;position:absolute;bottom:39px;width:70%;max-width:26px;left:50%;transform:translateX(-50%);border-radius:3px 3px 0 0;background:#007aa3;z-index:1}.month-button[data-kind=extra]{color:#a33326}.month-button[data-kind=extra] .month-bar-space i{top:39px;bottom:auto;border-radius:0 0 3px 3px;background:#b84636}.month-button[data-kind=equal]{color:#526572}.month-button[data-kind=equal] .month-bar-space i{background:#8798a1;bottom:38px}.month-value{display:block;font-size:9px;font-weight:600;white-space:nowrap}.month-name{display:block;font-size:10px;font-weight:500;margin-top:5px;color:#013c57}.month-button:disabled{cursor:default;color:#526572;background:transparent;opacity:.7}.month-missing{position:absolute;top:25px;left:0;right:0;font-size:15px}.month-chart-footer{display:flex;flex-wrap:wrap;gap:7px 15px;font-size:9px;color:#526572;line-height:1.6;margin-top:8px}.month-chart-footer>span{display:flex;align-items:center;gap:5px}.month-chart-footer i{display:inline-block;width:6px;height:6px;border-radius:50%}.month-chart-footer .saving-dot{background:#007aa3}.month-chart-footer .extra-dot{background:#b84636}#chartAvailability{margin-left:auto}
@media(max-width:1100px){.month-focus{padding:16px}.month-metrics{gap:10px}.month-result{padding:11px}.month-metric strong{font-size:18px}.month-result strong{font-size:20px}}
@media(max-width:850px){.month-metric strong{font-size:23px}.month-result strong{font-size:27px}}
@media(max-width:560px){.month-explorer{margin-top:20px;padding-top:23px}.month-explorer .chart-toolbar{align-items:stretch;gap:13px}.month-explorer .chart-toolbar h3{font-size:24px}.chart-instruction{font-size:11px}.month-focus{padding:17px}.month-focus-heading{align-items:start;margin-bottom:20px}.month-focus-heading h4{font-size:17px}.month-focus-heading>p{font-size:10px;margin-top:5px;white-space:normal;text-align:right}.month-metrics{grid-template-columns:1fr 1fr;gap:19px 13px}.month-metric strong{font-size:19px;line-height:1.6}.month-metric p{font-size:10px}.month-result{grid-column:1/-1;padding:14px 16px;display:grid;grid-template-columns:1fr auto;column-gap:9px;align-items:center}.month-result>span{font-size:10px;grid-column:1/-1}.month-result strong{font-size:24px;margin-top:5px}.month-result p{font-size:10px;max-width:110px;text-align:right}.month-explorer .legend{font-size:9px;gap:8px 14px}.gap-key{margin-left:0;width:100%}.month-buttons{grid-template-columns:repeat(6,minmax(0,1fr));gap:6px 3px}.month-button{padding-bottom:10px}.month-value{font-size:10px}.month-name{font-size:11px}.month-chart-footer{font-size:9px;gap:8px 12px}#chartAvailability{margin-left:0;width:100%}.month-explorer .chart-scroll svg{min-width:480px}}
@media(max-width:360px){.month-focus{padding:12px}.month-focus-heading h4{font-size:15px}.month-metric strong{font-size:16px}.month-result{padding:12px}.month-result strong{font-size:21px}.month-result{grid-template-columns:1fr}.month-result p{max-width:none;font-size:10px;text-align:left}}
@media(prefers-reduced-motion:reduce){.month-button{transition:none}}

````

## Fil: public/charts.mjs

````text
import {MONTHS} from './model.mjs';
const fmt=(n,d=0)=>new Intl.NumberFormat('sv-SE',{minimumFractionDigits:d,maximumFractionDigits:d}).format(n);
function niceStep(span){const rough=Math.max(span/4,.01),p=10**Math.floor(Math.log10(rough)),v=rough/p;return (v<=1?1:v<=2?2:v<=2.5?2.5:v<=5?5:10)*p;}
function emptyMonths(r,x,top,height){return r.rows.filter(row=>!row.available).map(row=>`<rect x="${x(row.index)-20}" y="${top}" width="40" height="${height}" fill="#f0f4f6"/><text x="${x(row.index)}" y="${top+14}" fill="#647580" text-anchor="middle" font-size="11">—</text>`).join('');}
function monthLabels(x,height){return MONTHS.map((m,i)=>`<text x="${x(i)}" y="${height-6}" text-anchor="middle" fill="#526572" font-size="11">${m}</text>`).join('');}
export function priceChart(r,unit='ore',prefix='price',selected=null){
 const w=700,h=210,left=46,right=22,top=20,bottom=30,available=r.rows.filter(row=>row.available),keys=unit==='ore'?['variableRate','portfolioRate','fixedRate']:['variable','portfolio','fixed'],values=available.flatMap(row=>keys.map(k=>row[k])),step=niceStep(Math.max(0,...values)-Math.min(0,...values)),min=Math.floor(Math.min(0,...values)/step)*step,max=Math.max(step,Math.ceil(Math.max(0,...values)/step)*step),ph=h-top-bottom;
 const x=i=>left+i*(w-left-right)/11,y=v=>top+ph-(v-min)/(max-min)*ph,unitLabel=unit==='ore'?'öre/kWh':'kr/månad';
 let svg=`<svg viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="${prefix}-title ${prefix}-desc"><title id="${prefix}-title">${unit==='ore'?'Månadspris':'Månadskostnad'} · ${r.periodLabel}</title><desc id="${prefix}-desc">Rörligt i korall, portfölj i blått och fastpris som streckad grå linje. ${unitLabel}, inklusive påslag och angivna kostnadstillägg. Saknade månader visas som streck. Exakta tal finns i månadstabellen.</desc>`;
 svg+=`<defs><linearGradient id="${prefix}-saving" gradientUnits="userSpaceOnUse" x1="0" y1="20" x2="0" y2="200"><stop stop-color="#fbc34e" stop-opacity=".5"/><stop offset="1" stop-color="#fbc34e" stop-opacity=".14"/></linearGradient><linearGradient id="${prefix}-extra" gradientUnits="userSpaceOnUse" x1="0" y1="20" x2="0" y2="200"><stop stop-color="#f8c3c6" stop-opacity=".65"/><stop offset="1" stop-color="#f8c3c6" stop-opacity=".2"/></linearGradient></defs>`;
 if(selected!==null)svg+=`<rect x="${x(selected)-21}" y="${top}" width="42" height="${ph}" rx="9" fill="#edf3f6"/>`;
 for(let v=min;v<=max+step*.01;v+=step)svg+=`<line x1="${left}" x2="${w-right}" y1="${y(v)}" y2="${y(v)}" stroke="#dde5e9" stroke-dasharray="3 5"/><text x="${left-8}" y="${y(v)+4}" text-anchor="end" fill="#526572" font-size="10">${fmt(unit==='ore'?v:v/1000,unit==='ore'?(step<1?2:step%1?1:0):(step%1000?1:0))}</text>`;
 // Split the band where the lines cross. Missing months never get bridged.
 for(let i=1;i<r.rows.length;i++){
  const a=r.rows[i-1],b=r.rows[i];if(!a.available||!b.available)continue;
  const da=a[keys[0]]-a[keys[1]],db=b[keys[0]]-b[keys[1]],points=[{x:x(a.index),v:a[keys[0]],p:a[keys[1]],d:da}];
  if(da*db<0){const t=da/(da-db),v=a[keys[0]]+t*(b[keys[0]]-a[keys[0]]);points.push({x:x(a.index)+t*(x(b.index)-x(a.index)),v,p:v,d:0});}
  points.push({x:x(b.index),v:b[keys[0]],p:b[keys[1]],d:db});
  for(let j=1;j<points.length;j++){const u=points[j-1],v=points[j],kind=(u.d+v.d)>=0?'saving':'extra';svg+=`<path data-gap="${kind}" d="M${u.x},${y(u.v)} L${v.x},${y(v.v)} L${v.x},${y(v.p)} L${u.x},${y(u.p)} Z" fill="url(#${prefix}-${kind})"/>`;}
 }
 if(selected!==null)svg+=`<line x1="${x(selected)}" x2="${x(selected)}" y1="${top}" y2="${top+ph}" stroke="#013c57" stroke-opacity=".35" stroke-dasharray="3 4"/>`;
 for(const [key,color,label,dash] of [[keys[2],'#8798a1','Fastpris',true],[keys[0],'#b84636','Rörligt',false],[keys[1],'#007aa3','Portfölj',false]]){
  let d='',active=false;for(const row of r.rows){if(!row.available){active=false;continue;}d+=`${active?'L':'M'}${x(row.index)},${y(row[key])} `;active=true;}
  svg+=`<path d="${d}" stroke="${color}" stroke-width="${dash?1.5:key===keys[1]?3.5:2.5}" ${dash?'stroke-dasharray="5 5"':''} fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  for(const row of available)svg+=`<circle cx="${x(row.index)}" cy="${y(row[key])}" r="${row.index===selected?5:2.5}" fill="white" stroke="${color}" stroke-width="${row.index===selected?2.5:1.5}"><title>${row.month}: ${label} ${fmt(row[key],2)} ${unitLabel}</title></circle>`;
 }
 for(const row of r.rows){if(!row.available)svg+=`<text x="${x(row.index)}" y="${top+ph-10}" text-anchor="middle" fill="#8798a1" font-size="13">—</text>`;else if(selected!==null)svg+=`<rect data-chart-month="${row.index}" x="${x(row.index)-22}" y="${top}" width="44" height="${ph}" fill="transparent" aria-hidden="true" style="cursor:pointer"><title>${row.month} · klicka för att jämföra</title></rect>`;}
 return svg+monthLabels(x,h)+'</svg>';
}
export function differenceChart(r,unit='ore',prefix='difference'){
 const w=700,h=178,left=46,right=15,top=26,bottom=29,key=unit==='ore'?'differenceRate':'difference',values=r.rows.filter(row=>row.available).map(row=>row[key]),extent=Math.max(unit==='ore'?1:100,...values.map(Math.abs))*1.28,ph=h-top-bottom;
 const x=i=>left+i*(w-left-right)/11,y=v=>top+ph/2-v/extent*ph/2,unitLabel=unit==='ore'?'öre/kWh':'kr';
 let svg=`<svg viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="${prefix}-title ${prefix}-desc"><title id="${prefix}-title">Skillnad mot rörligt per månad i ${unitLabel}</title><desc id="${prefix}-desc">Positiva blå staplar är besparing med portfölj. Negativa korallfärgade staplar är merkostnad. Saknade månader ingår inte. Exakta tal finns i månadstabellen.</desc>`;
 svg+=emptyMonths(r,x,top,ph);
 svg+=`<line x1="${left-24}" x2="${w-right+10}" y1="${y(0)}" y2="${y(0)}" stroke="#a4b4bd"/><text x="${left-29}" y="${y(0)+3}" text-anchor="end" fill="#526572" font-size="10">0</text>`;
 for(const row of r.rows){if(!row.available)continue;const v=row[key],zero=Math.abs(v)<1e-8,color=zero?'#a4b4bd':v>0?'#007aa3':'#b84636',height=Math.abs(y(v)-y(0)),signed=(zero?'':v>0?'+':'−')+fmt(Math.abs(v),unit==='ore'?1:0);
  svg+=`<rect x="${x(row.index)-13}" y="${Math.min(y(v),y(0))}" width="26" height="${Math.max(zero?1:0,height)}" rx="3" fill="${color}"><title>${row.month}: ${zero?'Ingen skillnad':v>0?'Besparing':'Merkostnad'} ${fmt(Math.abs(row.differenceRate),2)} öre/kWh · ${fmt(Math.abs(row.difference),2)} kr</title></rect><text x="${x(row.index)}" y="${v>=0?y(v)-7:y(v)+14}" text-anchor="middle" fill="${color}" font-size="10" font-weight="600">${signed}</text>`;
 }
 return svg+monthLabels(x,h)+'</svg>';
}

const FULL_MONTHS=['Januari','Februari','Mars','April','Maj','Juni','Juli','Augusti','September','Oktober','November','December'];
const magnitude=n=>Math.abs(n)>1e-8&&Math.abs(n)<.005?'< 0,01':fmt(Math.abs(n),2);
export function monthFocus(r,index){
 const row=r.rows[index];
 if(!row?.available)return '<div class="month-empty"><strong>Här syns månadens jämförelse.</strong><p>Lägg in förbrukning för en månad med priser för att se skillnaden.</p></div>';
 const kind=Math.abs(row.differenceRate)<1e-8?'equal':row.differenceRate>0?'saving':'extra';
 const title=row.volume===0?'Prisskillnad · 0 kWh':{saving:'Besparing med portfölj',extra:'Merkostnad med portfölj',equal:'Samma kostnad'}[kind];
 return `<div class="month-focus-heading"><div><span>VALD MÅNAD</span><h4>${FULL_MONTHS[index]} ${r.periodLabel}</h4></div><p>${fmt(row.volume,row.volume%1?2:0)} <span>kWh</span></p></div><div class="month-metrics"><div class="month-metric"><span><i class="line variable"></i>Rörligt</span><strong>${fmt(row.variable,2)} <small>kr</small></strong><p>${fmt(row.variableRate,2)} öre/kWh</p></div><div class="month-metric"><span><i class="line secured"></i>Portfölj</span><strong>${fmt(row.portfolio,2)} <small>kr</small></strong><p>${fmt(row.portfolioRate,2)} öre/kWh</p></div><div class="month-result" data-kind="${kind}"><span>${title}</span><strong>${magnitude(row.difference)} <small>kr</small></strong><p>${magnitude(row.differenceRate)} öre/kWh${kind==='equal'?'':kind==='saving'?' lägre':' högre'}</p></div></div>`;
}
export function monthButtons(r,unit='ore',selected=null){
 const key=unit==='ore'?'differenceRate':'difference',extent=Math.max(1,...r.rows.filter(row=>row.available).map(row=>Math.abs(row[key])));
 return r.rows.map(row=>{
  if(!row.available)return `<button type="button" class="month-button unavailable" disabled aria-label="${FULL_MONTHS[row.index]}: underlag saknas"><span class="month-bar-space" aria-hidden="true"><span class="month-missing">—</span></span><span class="month-value" aria-hidden="true">—</span><span class="month-name">${row.month}</span></button>`;
  const v=row[key],zero=Math.abs(v)<1e-8,kind=zero?'equal':v>0?'saving':'extra',signed=(zero?'':v>0?'+':'−')+fmt(Math.abs(v)/(unit==='kr'?1000:1),1),height=zero?2:Math.max(2,Math.abs(v)/extent*35);
  return `<button type="button" class="month-button" data-month-index="${row.index}" data-kind="${kind}" aria-pressed="${row.index===selected}" aria-controls="monthFocus" aria-label="${FULL_MONTHS[row.index]}: ${zero?'ingen skillnad':v>0?'besparing':'merkostnad'} ${magnitude(row.differenceRate)} öre per kWh, ${magnitude(row.difference)} kronor"><span class="month-bar-space" aria-hidden="true"><i style="height:${height}px"></i></span><span class="month-value" aria-hidden="true">${signed}</span><span class="month-name" aria-hidden="true">${row.month}</span></button>`;
 }).join('');
}

````

## Fil: public/comparison.css

````text
.comparison-summary{margin-top:26px}.comparison-heading{display:flex;justify-content:space-between;gap:15px;align-items:start}.comparison-heading h3{font-size:16px;margin:0 0 6px}.comparison-heading p{font-size:11px;color:var(--muted);line-height:1.7;margin:0 0 18px}.controls-link{display:none}
.cost-cards{display:grid;grid-template-columns:1fr 1fr;gap:14px}.cost-card{padding:20px;background:#f8f5f0;border:1px solid #e9e0d5;border-radius:9px;min-width:0}.cost-card h4{display:flex;align-items:center;gap:8px;margin:0 0 18px;font-size:13px}.portfolio-card{background:#eff4e9;border-color:#d9e4d0}.portfolio-card .dot{background:var(--green)}.cost-card .metric-caption{display:block;color:var(--muted);font-size:10px;margin:13px 0 5px}.rate-value{display:block;font:500 clamp(26px,2.7vw,36px)/1.2 'Poppins',sans-serif;letter-spacing:-1px}.rate-value small{font:400 11px 'Poppins',sans-serif;letter-spacing:0;white-space:nowrap}.money-value{display:block;font:500 clamp(19px,2vw,26px)/1.35 'Poppins',sans-serif;letter-spacing:-.7px;overflow-wrap:anywhere}.cost-card p{font-size:10px;color:var(--muted);line-height:1.6;margin:15px 0 0}
.savings-panel{padding:22px 24px;background:#163a32;border-radius:9px;color:#fff;margin-top:16px}.savings-panel h4{font-size:12px;font-weight:500;margin:0 0 18px;color:#d0e0ca}.savings-values{display:grid;grid-template-columns:1fr 1.25fr;gap:20px}.savings-values>div+div{border-left:1px solid #ffffff30;padding-left:22px}.savings-values strong{font:500 clamp(27px,3vw,39px)/1.15 'Poppins',sans-serif;letter-spacing:-1.4px;color:var(--lime);display:block;overflow-wrap:anywhere}.savings-values span{display:block;font-size:10px;color:#c5d6c7;margin-top:7px}.savings-panel p{font-size:10px;line-height:1.6;color:#b9d0bc;margin:17px 0 0}.savings-panel[data-kind=extra]{background:#703e2b}.savings-panel[data-kind=extra] h4,.savings-panel[data-kind=extra] p,.savings-panel[data-kind=extra] span{color:#f0dacf}.savings-panel[data-kind=extra] strong{color:#ffdbc6}.savings-panel[data-kind=equal],.savings-panel[data-kind=empty]{background:#4e5e56}.savings-panel[data-kind=equal] strong,.savings-panel[data-kind=empty] strong{color:#fff}.comparison-note{font-size:10px;line-height:1.7;color:var(--muted);margin:12px 0 18px}.fixed-reference{display:flex;align-items:center;flex-wrap:wrap;gap:9px 18px;font-size:11px;padding:13px 0;border-bottom:1px solid var(--border);color:var(--muted)}.fixed-reference>span{display:flex;gap:7px;align-items:center;margin-right:auto}.fixed-reference strong{font-weight:500;color:var(--ink)}.fixed-reference small{font-size:10px;font-weight:400}
.chart-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:28px}.chart-toolbar h3{font-size:15px;margin:0}.unit-toggle{display:flex;padding:3px;border:1px solid var(--border);border-radius:7px;background:#f1f4ec}.unit-toggle button{font-size:11px;min-height:35px;border:0;background:transparent;border-radius:4px;padding:8px 12px;color:var(--muted)}.unit-toggle button[aria-pressed=true]{background:#fff;color:var(--ink);box-shadow:0 1px 4px #163a3210;font-weight:600}.chart-header{margin-top:18px;align-items:center}.chart-header h4{margin:0;font-size:11px;font-weight:500;color:var(--muted)}.chart-scroll{overflow-x:auto;margin-top:12px}.chart-scroll svg{display:block;width:100%;height:auto}.difference-heading{border-top:1px solid var(--border);padding-top:20px;margin-top:17px}.legend{margin-bottom:10px}.saving-dot{background:var(--green)}.difference-legend{font-size:10px;margin-bottom:18px}.mobile-chart-hint{display:none}.positive{color:#2d6a51}.negative{color:#a55332}.controls{align-self:start;position:sticky;top:20px}.control-return{display:none}
@media(max-width:1100px){.cost-card{padding:16px}.savings-panel{padding:20px}.savings-values strong{font-size:31px}.money-value{font-size:21px}}
@media(max-width:850px){.controls{position:static}.controls-link{display:inline-flex;font-size:10px;white-space:nowrap}.control-return{display:block;grid-column:1/-1;font-size:12px;margin-top:18px;text-align:center;text-decoration:underline;text-underline-offset:4px}.rate-value{font-size:36px}.money-value{font-size:26px}.savings-values strong{font-size:38px}}
@media(max-width:560px){.comparison-heading{display:block}.comparison-heading h3{font-size:15px}.comparison-heading p{font-size:11px;margin-bottom:8px}.controls-link{font-size:11px;margin-bottom:16px}.cost-cards{gap:9px}.cost-card{padding:15px 11px}.cost-card h4{font-size:12px;margin-bottom:15px}.cost-card .metric-caption{font-size:9px}.rate-value{font-size:28px;letter-spacing:-1px}.rate-value small{display:block;margin-top:4px;font-size:10px}.money-value{font-size:19px;letter-spacing:-.7px;line-height:1.5}.cost-card p{font-size:10px}.savings-panel{padding:19px 15px}.savings-panel h4{font-size:12px;line-height:1.6}.savings-values{grid-template-columns:1fr 1.3fr;gap:12px}.savings-values>div+div{padding-left:14px}.savings-values strong{font-size:29px;letter-spacing:-1px}.savings-values span{font-size:10px}.savings-panel p{font-size:10px}.comparison-note{font-size:10px}.fixed-reference{font-size:10px;gap:8px 12px}.fixed-reference>span{width:100%}.chart-toolbar{gap:8px;align-items:flex-start;flex-direction:column}.unit-toggle{align-self:stretch}.unit-toggle button{flex:1;min-height:42px;font-size:12px}.chart-header>span{display:block;font-size:10px}.chart-scroll svg{min-width:480px}.mobile-chart-hint{display:block;font-size:10px;color:var(--muted);line-height:1.6;margin-top:8px}.difference-legend{font-size:9px;gap:12px}.comparison-summary{margin-top:23px}}
@media(max-width:360px){.cost-cards{grid-template-columns:1fr}.cost-card{display:grid;grid-template-columns:1fr 1fr;gap:0 10px;padding:15px}.cost-card h4{grid-column:1/-1;margin-bottom:7px}.cost-card .metric-caption{grid-row:2}.cost-card .rate-value{grid-column:1;grid-row:3}.cost-card .money-value{grid-column:2;grid-row:3;font-size:19px;align-self:center}.cost-card p{grid-column:1/-1}.savings-values strong{font-size:24px}.savings-values{gap:8px}.savings-values>div+div{padding-left:10px}}
@media print{.app-nav{display:none!important}#printArea .print-comparison{font-size:10pt}#printArea .print-savings{border:1px solid #aab8a6;background:#edf3e8;padding:12px;margin-top:16px;break-inside:avoid}#printArea .print-savings p{font-size:16pt;margin:8px 0 0}#printArea .print-chart{break-inside:avoid;max-width:100%}#printArea .print-chart svg{display:block;width:100%;height:auto}#printArea .print-months{font-size:7pt}#printArea .print-months th,#printArea .print-months td{padding:5px 3px}#printArea .print-months thead{display:table-header-group}#printArea .print-months tfoot{display:table-row-group}}

````

## Fil: public/customer-agreement-ui.mjs

````text
import {AGREEMENT_TYPES,SOURCE_TYPES,PRICE_MODES,newCustomerAgreement,agreementMonths,agreementErrors} from './customer-agreement.mjs';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const opts=(values,current)=>Object.entries(values).map(([key,label])=>`<option value="${key}" ${key===current?'selected':''}>${esc(label)}</option>`).join('');
const number=(id,label,value,min=-500,max=2000)=>`<label>${label}<input id="${id}" data-ca="${id.slice(3)}" type="number" min="${min}" max="${max}" step="any" inputmode="decimal" value="${value??''}" placeholder="Behöver kontrolleras"></label>`;
export function bindCustomerAgreement({root,getState,onChange,onLoadCustomer}){
 let pending=null,saving=false,bankRecords=[],nextOffset=null,queryVersion=0;
 const $=id=>root.querySelector('#'+id),state=()=>getState(),agreement=()=>state().customerAgreement;
 function ensure(){const s=state();s.comparisonMode??='reference';s.customerAgreement??=newCustomerAgreement(s.customer);s.selectedMonthlyFee??=null;s.comparisonArea??='unknown';s.comparisonScopeChecked??=false;}
 function status(message,bad=false){$('ca-status').textContent=message;$('ca-status').className=bad?'error':'muted';}
 function render(){
  const openPanels=new Set([...root.querySelectorAll("details[id][open]")].map(d=>d.id));
  ensure();const s=state(),a=agreement();
  root.innerHTML=`<div class="ca-heading"><div><p class="eyebrow">JÄMFÖRELSEGRUND</p><h2>Vad betalar kunden i dag?</h2></div><button type="button" id="ca-bankOpen" class="secondary">Öppna prisbanken</button></div>
  <div class="segments ca-modes" role="group" aria-label="Välj jämförelsegrund"><button type="button" data-comparison="reference" aria-pressed="${s.comparisonMode!=='customer'}">Kvartsprisreferens</button><button type="button" data-comparison="customer" aria-pressed="${s.comparisonMode==='customer'}">Kundens avtal</button></div>
  <p class="muted">Jämför med kundens priser eller använd kvartsprisreferensen.</p>
  <div id="ca-editor" ${s.comparisonMode==='customer'?'':'hidden'}>
  <div class="form-grid"><label>Leverantör<input id="ca-provider" data-ca="provider" maxlength="100" list="ca-providers" value="${esc(a.provider)}" placeholder="Till exempel Eneas eller Fortum"></label><label>Avtalsform<select id="ca-type" data-ca="type">${opts(AGREEMENT_TYPES,a.type)}</select></label></div>
  <datalist id="ca-providers">${['Eneas','Fortum','E.ON','Vattenfall','Bixia','Göta Energi','Kraftringen'].map(x=>`<option value="${x}"></option>`).join('')}</datalist>
  <div class="ca-prices"><h3>Kundens pris</h3><label>Så vill jag ange priset<select id="ca-mode" data-ca="mode">${opts(PRICE_MODES,a.mode)}</select></label><p class="muted">Ange elhandel exklusive moms, elnät och energiskatt.</p>
  ${a.mode!=='invoice'?`${a.mode==='constant'?number('ca-rate',a.composition==='total'?'Pris inklusive tillägg, öre/kWh':'Energipris, öre/kWh',a.rate):''}
  <details id="ca-costDetails" class="ca-disclosure" ${a.composition==='components'?'open':''}><summary>Påslag och övriga tillägg <small>${a.composition==='components'?'Anges separat':'Ingår i priset'}</small></summary><label>Vad omfattar priset?<select id="ca-composition" data-ca="composition">${opts({total:'Hela elhandelspriset, inklusive tillägg',components:'Energipris + separata tillägg'},a.composition)}</select></label>${a.composition==='components'?`<div class="form-grid">${number('ca-margin','Avtalspåslag, öre/kWh',a.margin,-500,1000)}${number('ca-other','Övriga tillägg, öre/kWh',a.other,-500,1000)}</div>`:''}<p class="muted">Ta bara med tillägg som inte redan ingår i priset. Okända kostnader ska vara tomma.</p></details>
  ${number('ca-monthlyFee','Månadsavgift, kr',a.monthlyFee,-100000,100000)}<p class="muted">Skriv 0 om avgift saknas. Tomt betyder okänt.</p>`:'<p class="notice">Ange fakturans elhandelsbelopp och kWh för hela månaden. Månadsavgiften ska ingå. Ta bort moms, elnät och energiskatt.</p>'}
  <details id="ca-monthDetails" class="ca-disclosure" ${a.mode==='constant'?'hidden':''}><summary>${a.mode==='invoice'?'Fyll i fakturabelopp':'Fyll i månadspriser'} <small id="ca-monthCount"></small></summary><p class="muted">${a.mode==='invoice'?'Använd förbrukningen från samma faktura.':'För tim- och kvartspris: använd kundens förbrukningsvägda månadspris från fakturan.'} Saknade månader lämnas tomma.</p><div id="ca-months"></div>${a.mode==='invoice'?'<button type="button" id="ca-applyVolumes" class="secondary">Använd fakturornas förbrukning i mötet</button>':''}</details>
  </div>
  <details id="ca-sourceDetails" class="ca-disclosure"><summary>Period och underlag <small id="ca-sourceSummary">${esc(a.from)} – ${esc(a.to)}${a.sourceRef?' · Källa angiven':' · Ange källa'}</small></summary><div class="form-grid"><label>Uppgiften gäller kunden<input id="ca-customer" data-ca="customer" maxlength="120" value="${esc(a.customer)}"></label><label>Produkt / avtalsnamn <span class="optional">Valfritt</span><input id="ca-product" data-ca="product" maxlength="120" value="${esc(a.product)}"></label><label>Elområde<select id="ca-area" data-ca="area">${opts({unknown:'Behöver kontrolleras',SE1:'SE1',SE2:'SE2',SE3:'SE3',SE4:'SE4'},a.area)}</select></label><label>Typ av underlag<select id="ca-sourceType" data-ca="sourceType">${opts(SOURCE_TYPES,a.sourceType)}</select></label><label>Prisuppgiften gäller från<input id="ca-from" data-ca="from" type="month" min="2000-01" max="2099-12" value="${esc(a.from)}"></label><label>Till och med<input id="ca-to" data-ca="to" type="month" min="2000-01" max="2099-12" value="${esc(a.to)}"></label><label>Källa / dokumentreferens<input id="ca-sourceRef" data-ca="sourceRef" maxlength="240" value="${esc(a.sourceRef)}" placeholder="Till exempel faktura 1234 eller offert 30 oktober"></label><label>Datum på underlaget<input id="ca-sourceDate" data-ca="sourceDate" type="date" min="2000-01-01" max="2099-12-31" value="${esc(a.sourceDate)}"></label></div><label>Kommentar <span class="optional">Valfritt</span><textarea id="ca-notes" data-ca="notes" maxlength="2000" rows="2" placeholder="Till exempel rabattens giltighet.">${esc(a.notes)}</textarea></label></details>
  <label class="ca-check"><input id="ca-scopeConfirmed" data-ca="scopeConfirmed" type="checkbox" ${a.scopeConfirmed?'checked':''}><span>Jag har kontrollerat att uppgifterna omfattar all elhandel och att moms, elnät och energiskatt är borttagna.</span></label>
  <div class="ca-save"><button type="button" id="ca-save" class="secondary" ${saving?'disabled':''}>${s.customerAgreementRecord?'Spara som ny version':'Spara i teamets prisbank'}</button><p class="muted">Sparas för ${esc(a.customer||s.customer)} och blir sökbart för teamet.</p></div><p id="ca-status" class="muted" role="status">${s.customerAgreementRecord?'Inläst från prisbanken. Ändringar behöver sparas som en ny version.':'Ditt utkast sparas automatiskt på den här enheten.'}</p>
  <details id="ca-compareDetails" class="ca-compare-settings ca-disclosure"><summary>Kontrollera jämförelsen <small>Elområde och avgifter</small></summary><div class="form-grid"><label>Elområde i förslagets prisunderlag<select id="ca-comparisonArea">${opts({unknown:'Behöver kontrolleras',SE1:'SE1',SE2:'SE2',SE3:'SE3',SE4:'SE4'},s.comparisonArea)}</select></label>${number('ca-selectedMonthlyFee','Förslagets fasta avgift, kr/månad',s.selectedMonthlyFee,0,100000)}</div><p class="muted">Områdesvalet byter inte historiska priser. Kontrollera området i det prisunderlag ni använder. Förslagets fasta avgift läggs ovanpå priset per kWh; ange 0 om den redan ingår eller saknas.</p><label class="ca-check"><input id="ca-comparisonScopeChecked" type="checkbox" ${s.comparisonScopeChecked?'checked':''}><span>Jag har kontrollerat elområde, påslag, fasta avgifter och att båda alternativen avser samma kostnader och period.</span></label><p class="muted">Förslaget använder fortfarande kalkylens historik eller manuella offertpris. Jämförelsen blir inte ett verifierat faktiskt utfall för båda avtalen.</p></details></div>
  <dialog id="ca-bank" aria-labelledby="ca-bankTitle"><div class="ca-heading"><div><p class="eyebrow">TEAMETS UNDERLAG</p><h2 id="ca-bankTitle">Prisbanken</h2></div><button id="ca-bankClose" class="secondary" type="button">Stäng</button></div><p class="muted">Kundspecifika priser, inmatade av teamet. Kontrollera källa och giltighetsperiod före användning.</p><div class="ca-bank-search"><label>Sök leverantör eller kund<input id="ca-search" maxlength="120" placeholder="Eneas, Fortum eller kundnamn"></label><label>År<input id="ca-year" type="number" min="2000" max="2099" placeholder="Alla"></label><button type="button" id="ca-searchButton" class="primary">Sök</button></div><p id="ca-bankStatus" role="status"></p><div id="ca-records"></div><button type="button" id="ca-more" class="secondary" hidden>Visa fler</button></dialog>`;
  for(const id of openPanels){const panel=$(id);if(panel)panel.open=true;}
  renderMonths();updateMonthCount();
 }
 function renderMonths(){const a=agreement(),months=agreementMonths(a);$('ca-months').innerHTML=a.mode==='constant'?'':`<div class="ca-month-grid">${months.map(key=>{const m=a.months[key]||{},invoice=a.mode==='invoice';return `<div class="ca-month-row"><strong>${key}</strong>${invoice?`<label>Elhandel, kr<input data-ca-month="${key}" data-part="amount" type="number" inputmode="decimal" step="any" min="-1000000000" max="1000000000" value="${m.amount??''}" placeholder="Saknas"></label><label>Fakturerad kWh<input data-ca-month="${key}" data-part="kwh" type="number" inputmode="decimal" step="any" min="0" max="100000000" value="${m.kwh??''}" placeholder="Saknas"></label>`:`<label>${a.composition==='total'?'Hela elhandelspriset':'Energipris'}, öre/kWh<input data-ca-month="${key}" data-part="rate" type="number" inputmode="decimal" step="any" min="-500" max="2000" value="${m.rate??''}" placeholder="Saknas"></label>`}</div>`;}).join('')}</div>${months.length?'':'<p class="error">Ange en giltig period på högst fem år.</p>'}`;}
 function updateMonthCount(){const a=agreement(),months=agreementMonths(a),count=months.filter(k=>a.mode==='invoice'?a.months[k]?.amount!=null&&a.months[k]?.kwh!=null:a.months[k]?.rate!=null).length;const el=$('ca-monthCount');if(el)el.textContent=`${count} av ${months.length} månader inlagda`;}
 function revealRequired(){
  const a=agreement(),s=state();
  if(!a.sourceRef.trim()||!a.sourceDate||!agreementMonths(a).length||a.area==='unknown'||a.customer.trim().toLocaleLowerCase('sv')!==s.customer.trim().toLocaleLowerCase('sv'))$('ca-sourceDetails').open=true;
  if(a.mode!=='constant'&&!agreementMonths(a).some(k=>a.mode==='invoice'?a.months[k]?.amount!=null&&a.months[k]?.kwh!=null:a.months[k]?.rate!=null))$('ca-monthDetails').open=true;
  if(s.selectedMonthlyFee===null||s.comparisonArea==='unknown'||s.comparisonArea!==a.area||!s.comparisonScopeChecked)$('ca-compareDetails').open=true;
 }
 function changed(){onChange();const a=agreement(),summary=$('ca-sourceSummary');if(summary)summary.textContent=`${a.from} – ${a.to}${a.sourceRef?' · Källa angiven':' · Ange källa'}`;const el=$('ca-status');if(el)el.textContent='Ändrat i formuläret. Spara prisuppgiften när den är klar.';}
 root.addEventListener('input',e=>{
  const t=e.target,a=agreement(),s=state();
  if(t.dataset.caMonth){a.months[t.dataset.caMonth]??={rate:null,amount:null,kwh:null};a.months[t.dataset.caMonth][t.dataset.part]=t.value!==''&&t.validity.valid?Number(t.value):null;updateMonthCount();changed();return;}
  if(t.id==='ca-selectedMonthlyFee'){s.selectedMonthlyFee=t.value!==''&&t.validity.valid?Number(t.value):null;changed();return;}
  if(t.id==='ca-comparisonScopeChecked'){s.comparisonScopeChecked=t.checked;changed();return;}
  if(t.dataset.ca){const key=t.dataset.ca;a[key]=t.type==='checkbox'?t.checked:t.type==='number'?t.value!==''&&t.validity.valid?Number(t.value):null:t.value;changed();}
 });
 root.addEventListener('change',e=>{
  const t=e.target,a=agreement();if(t.id==='ca-comparisonArea'){state().comparisonArea=t.value;changed();}
  if(t.dataset.ca&&['mode','composition','from','to'].includes(t.dataset.ca)){if(t.dataset.ca==='mode'&&a.mode==='invoice')a.sourceType='invoice';render();}
 });
 root.addEventListener('click',async e=>{
  const t=e.target.closest('button');if(!t)return;
  if(t.dataset.comparison){state().comparisonMode=t.dataset.comparison;if(!agreement().customer)agreement().customer=state().customer;changed();render();return;}
  if(t.id==='ca-bankOpen'){$('ca-bank').showModal();await search();}
  if(t.id==='ca-bankClose'){$('ca-bank').close();$('ca-bankOpen').focus();}
  if(t.id==='ca-searchButton')await search();
  if(t.id==='ca-more')await search(nextOffset);
  if(t.id==='ca-applyVolumes'){
   const a=agreement(),entries=Object.entries(a.months).filter(([key,m])=>key>=a.from&&key<=a.to&&['2025','2026'].includes(key.slice(0,4))&&m.kwh!==null);
   if(!entries.length){status('Lägg först in fakturerad förbrukning för 2025 eller 2026.',true);return;}
   if(!confirm('Ersätta mötets förbrukningsprofiler med dessa fakturor? Månader utan fakturerad kWh lämnas tomma.'))return;
   const s=state();s.consumptionMode='separate';s.profiles={'2025':Array(12).fill(null),'2026':Array(12).fill(null)};s.estimates={};s.sources={'2025':'own','2026':'own'};for(const [key,m]of entries)s.profiles[key.slice(0,4)][Number(key.slice(5))-1]=m.kwh;
   changed();onLoadCustomer(false);status('Fakturornas förbrukning används nu. Saknade månader är tomma.');
  }
  if(t.id==='ca-save')await saveRecord();
  if(t.dataset.record){
   const record=bankRecords.find(x=>x.id===t.dataset.record);if(!record)return;
   const different=record.agreement.customer.trim().toLocaleLowerCase('sv')!==state().customer.trim().toLocaleLowerCase('sv');
   if(!confirm(different?`Öppna prisuppgiften för ${record.agreement.customer}? Ett nytt möte startas för kunden. Spara nuvarande mötesunderlag först.`:'Läsa in den sparade prisuppgiften? Osparade ändringar i avtalsformuläret ersätts.'))return;
   $('ca-bank').close();if(different)onLoadCustomer(record.agreement.customer);const s=state();s.customerAgreement=structuredClone(record.agreement);s.customerAgreementRecord={id:record.id,createdAt:record.createdAt,createdName:record.createdName};s.comparisonMode='customer';onChange();render();
  }
 });
 async function saveRecord(){
  if(saving)return;const a=structuredClone(agreement()),errors=agreementErrors(a);
  if(errors.length){revealRequired();status(errors[0],true);return;}
  const signature=JSON.stringify(a);if(!pending||pending.signature!==signature)pending={id:crypto.randomUUID(),agreement:a,supersedes:state().customerAgreementRecord?.id??null,signature};
  const body={id:pending.id,agreement:pending.agreement,supersedes:pending.supersedes};saving=true;$('ca-save').disabled=true;status('Sparar i teamets prisbank …');
  try{const res=await fetch('/api/price-records',{method:'POST',signal:AbortSignal.timeout(25000),headers:{'Content-Type':'application/json','X-Requested-With':'Kundrummet'},body:JSON.stringify(body)}),data=await res.json().catch(()=>({error:'Prisbanken svarar inte just nu. Försök igen.'}));if(!res.ok||!data.record)throw Error(data.error||'Kunde inte spara prisuppgiften.');
   if(JSON.stringify(agreement())===signature){state().customerAgreementRecord={id:data.record.id,createdAt:data.record.createdAt,createdName:data.record.createdName};onChange();pending=null;status('Sparat i teamets prisbank. '+data.record.createdName+' · '+new Date(data.record.createdAt).toLocaleDateString('sv-SE'));$('ca-save').textContent='Spara som ny version';}
   else status('Versionen sparades. Dina senaste ändringar är ännu inte sparade i prisbanken.');
  }catch(error){status(error.name==='TimeoutError'?'Prisbanken svarade inte i tid. Formuläret finns kvar; försök igen.':error.message||'Kunde inte spara. Formuläret finns kvar; försök igen.',true);}finally{saving=false;$('ca-save').disabled=false;}
 }
 async function search(offset=0){
  const seq=++queryVersion;$('ca-bankStatus').textContent='Hämtar prisuppgifter …';$('ca-more').hidden=true;
  try{const query=new URLSearchParams({q:$('ca-search').value,year:$('ca-year').value,offset:String(offset||0)}),res=await fetch('/api/price-records?'+query,{cache:'no-store',signal:AbortSignal.timeout(25000)}),data=await res.json().catch(()=>({error:'Prisbanken svarar inte just nu. Försök igen.'}));if(!res.ok||!Array.isArray(data.records))throw Error(data.error||'Prisbanken kunde inte läsas.');if(seq!==queryVersion)return;
   bankRecords=offset?[...bankRecords,...data.records]:data.records;nextOffset=data.nextOffset;
   $('ca-bankStatus').textContent=bankRecords.length?`${bankRecords.length} prisuppgifter visas.`:'Inga prisuppgifter hittades. Spara en uppgift från avtalsformuläret.';
   $('ca-records').innerHTML=bankRecords.map(r=>{const a=r.agreement,errors=agreementErrors(a,{forComparison:true});return `<article class="ca-record"><div><p class="eyebrow">${esc(a.from)} – ${esc(a.to)} · ${esc(a.area)}</p><h3>${esc(a.provider)} · ${esc(a.customer)}</h3><p>${esc(AGREEMENT_TYPES[a.type])}${a.product?' · '+esc(a.product):''}</p><p class="muted">${esc(SOURCE_TYPES[a.sourceType])}: ${esc(a.sourceRef)} · ${esc(a.sourceDate)}<br>Registrerad av ${esc(r.createdName)} · ${new Date(r.createdAt).toLocaleDateString('sv-SE')}${r.supersedes?' · Ny version':''}</p><span class="ca-tag">${errors.length?'Behöver kompletteras':'Inmatad kunduppgift'}</span></div><button type="button" class="secondary" data-record="${esc(r.id)}">Öppna uppgiften</button></article>`;}).join('');$('ca-more').hidden=nextOffset===null;
  }catch(error){if(seq===queryVersion){$('ca-bankStatus').textContent=error.name==='TimeoutError'?'Prisbanken svarade inte i tid. Försök igen.':error.message||'Prisbanken kunde inte läsas.';$('ca-records').innerHTML='';}}
 }
 return {render,revealRequired,validate(){ensure();if(state().comparisonMode!=='customer')return [];const s=state(),a=agreement(),errors=agreementErrors(a,{forComparison:true});if(a.customer.trim().toLocaleLowerCase('sv')!==s.customer.trim().toLocaleLowerCase('sv'))errors.push('Prisuppgiften och mötet måste gälla samma kund.');if(s.selectedMonthlyFee===null)errors.push('Ange förslagets fasta månadsavgift, även om den är 0.');if(s.comparisonArea!==a.area||s.comparisonArea==='unknown')errors.push('Bekräfta att båda prisunderlagen gäller samma elområde.');if(!s.comparisonScopeChecked)errors.push('Kontrollera jämförelsens förutsättningar.');if(a.mode!=='constant'&&!agreementMonths(a).some(k=>a.mode==='invoice'?a.months[k]?.amount!=null&&a.months[k]?.kwh!=null:a.months[k]?.rate!=null))errors.push('Fyll i pris eller fakturabelopp för minst en månad.');return errors.slice(0,1);}};
}

````

## Fil: public/customer-agreement.css

````text
.ca-heading{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:20px}.ca-heading .eyebrow{margin:0 0 8px}.ca-heading h2{margin:0}.ca-heading button{flex-shrink:0}.ca-modes{width:max-content;max-width:100%}#ca-editor>.form-grid{margin:28px 0;gap:20px}.ca-prices{background:#f4f7f8;padding:24px;border-radius:16px;margin-top:24px}.ca-prices>label,.ca-prices>.form-grid{margin:22px 0}.ca-prices h3{margin-top:0;font-size:19px}.ca-check{display:flex;flex-direction:row;gap:12px;align-items:flex-start;margin:24px 0;font-weight:400}.ca-check input{width:22px;min-width:22px;min-height:22px;height:22px;margin:3px 0 0;accent-color:#013c57}.ca-month-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:24px 0}.ca-month-row{display:flex;flex-wrap:wrap;gap:10px;background:white;border-radius:12px;padding:16px}.ca-month-row strong{display:block;width:100%;font-size:14px}.ca-month-row label{flex:1;min-width:120px;font-size:11px}.ca-month-row input{font-size:16px;min-width:0}.ca-save{margin-top:28px}.ca-save>p{max-width:650px}.ca-compare-settings{margin-top:28px}.ca-compare-settings .form-grid{margin-top:20px}.ca-bank-search{display:grid;grid-template-columns:minmax(0,1fr) 110px auto;gap:14px;align-items:end}#ca-bank{width:min(900px,calc(100vw - 32px));max-height:85dvh;border:0;border-radius:24px;padding:30px;color:var(--ink)}#ca-bank::backdrop{background:#013c5775;backdrop-filter:blur(4px)}.ca-record{display:flex;align-items:center;justify-content:space-between;gap:24px;border-top:1px solid var(--line);padding:24px 0;overflow-wrap:anywhere}.ca-record h3{font-size:19px;margin:8px 0}.ca-record p{margin:6px 0}.ca-record button{flex-shrink:0}.ca-tag{display:inline-block;font-size:11px;background:#e6f1f5;padding:5px 10px;border-radius:20px}.customer-basis{padding:20px 24px;background:#fff6df;border-left:4px solid #fbc34e;border-radius:10px;margin:24px 0}.customer-basis h3{margin:0 0 8px}.customer-basis p{font-size:12px;margin:6px 0;overflow-wrap:anywhere}.customer-basis strong{font-weight:600}#ca-more{margin-top:16px}
@media(max-width:700px){.ca-heading{align-items:flex-start;flex-direction:column}.ca-heading button{width:100%}.ca-modes{width:100%}.ca-modes button{flex:1;padding:10px;font-size:12px}.ca-prices{padding:18px 14px}.ca-month-grid{grid-template-columns:1fr}.ca-prices>.form-grid,#ca-editor>.form-grid,.ca-compare-settings .form-grid{grid-template-columns:1fr}.ca-month-row{padding:14px}.ca-bank-search{grid-template-columns:minmax(0,1fr) 100px}.ca-bank-search button{grid-column:1/-1}#ca-bank{padding:22px 18px}.ca-record{align-items:stretch;flex-direction:column;gap:12px}.ca-record button{width:100%}.ca-record h3{font-size:17px}.ca-save button{width:100%}}
.ca-disclosure{border-top:1px solid var(--line);padding:18px 0;margin-top:18px}.ca-disclosure>summary{font-weight:600;font-size:14px;cursor:pointer;min-height:44px;align-content:center}.ca-disclosure>summary small{display:block;font-size:12px;font-weight:400;color:var(--muted);margin:4px 0 0 19px}.ca-disclosure>label,.ca-disclosure>.form-grid{margin-top:18px}.ca-disclosure>.form-grid{gap:20px}.ca-disclosure>.muted{margin-top:14px}.ca-prices>.ca-disclosure{margin-top:18px;padding-bottom:0}.ca-prices>.ca-disclosure[hidden]{display:none}.ca-prices>.ca-disclosure>summary{font-size:13px}.ca-save>p{font-size:12px}.ca-source-note{font-size:12px}
@media(max-width:700px){.ca-disclosure>.form-grid{grid-template-columns:1fr}.ca-disclosure>summary{font-size:14px}.ca-prices{margin-top:20px}.ca-disclosure .ca-month-grid{margin:16px 0}.ca-heading{gap:16px}}

````

## Fil: public/customer-agreement.mjs

````text
// Shared validation and price logic: browser and server use the same bounded schema.
export const AGREEMENT_TYPES={fixed:'Fastpris',monthly:'Rörligt månadspris',hourly:'Timpris',quarter:'Kvartspris',portfolio:'Portfölj',mixed:'Mixavtal',other:'Annat'};
export const SOURCE_TYPES={invoice:'Faktura',contract:'Avtal',offer:'Offert',customer:'Uppgift från kunden'};
export const PRICE_MODES={constant:'Samma pris för perioden',monthly:'Pris per månad',invoice:'Fakturerad elhandel per månad'};
export const COST_PARTS={profile:'Profil / volymvägning',balance:'Balans och avräkning',certificates:'Elcertifikat / ursprung',other:'Övriga elhandelstillägg'};
export const newCustomerAgreement=(customer='')=>({version:1,provider:'',customer,product:'',area:'unknown',type:'quarter',from:'2026-01',to:'2026-12',sourceType:'invoice',sourceRef:'',sourceDate:'',mode:'monthly',composition:'total',rate:null,margin:null,other:null,monthlyFee:null,months:{},scopeConfirmed:false,notes:''});
const text=(x,max)=>typeof x==='string'&&x.length<=max;
const number=(x,min,max)=>x===null||typeof x==='number'&&Number.isFinite(x)&&x>=min&&x<=max;
export const validMonth=x=>typeof x==='string'&&/^(20[0-9]{2})-(0[1-9]|1[0-2])$/.test(x);
export const validDate=x=>typeof x==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;
export function agreementMonths(a){
 if(!validMonth(a.from)||!validMonth(a.to)||a.from>a.to)return [];
 const out=[];let [y,m]=a.from.split('-').map(Number);
 for(let i=0;i<60;i++){const key=`${y}-${String(m).padStart(2,'0')}`;if(key>a.to)break;out.push(key);if(++m===13){m=1;y++;}}
 return out.at(-1)===a.to?out:[];
}
export function validCustomerAgreement(a){
 return !!a&&a.version===1&&text(a.provider,100)&&text(a.customer,120)&&text(a.product,120)&&text(a.sourceRef,240)&&text(a.notes,2000)&&['SE1','SE2','SE3','SE4','unknown'].includes(a.area)&&Object.hasOwn(AGREEMENT_TYPES,a.type)&&Object.hasOwn(SOURCE_TYPES,a.sourceType)&&Object.hasOwn(PRICE_MODES,a.mode)&&['total','components'].includes(a.composition)&&typeof a.scopeConfirmed==='boolean'&&validMonth(a.from)&&validMonth(a.to)&&agreementMonths(a).length>0&&(a.sourceDate===''||validDate(a.sourceDate))&&number(a.rate,-500,2000)&&number(a.margin,-500,1000)&&number(a.other,-500,1000)&&number(a.monthlyFee,-100000,100000)&&a.months&&typeof a.months==='object'&&!Array.isArray(a.months)&&Object.keys(a.months).length<=60&&Object.entries(a.months).every(([k,v])=>validMonth(k)&&v&&number(v.rate,-500,2000)&&number(v.amount,-1000000000,1000000000)&&number(v.kwh,0,100000000));
}
export function agreementErrors(a,{forComparison=false}={}){
 if(!validCustomerAgreement(a))return ['Kontrollera datum och priser. Perioden får vara högst fem år.'];
 const errors=[];
 if(!a.provider.trim())errors.push('Ange leverantör.');if(!a.customer.trim())errors.push('Ange kund.');
 if(!a.sourceRef.trim())errors.push('Ange källa, till exempel fakturanummer eller offertnamn.');
 if(!validDate(a.sourceDate))errors.push('Ange datum på underlaget.');
 if(a.mode==='invoice'&&a.sourceType!=='invoice')errors.push('Fakturerade belopp behöver ha faktura som källa.');
 if(forComparison){
  if(a.area==='unknown')errors.push('Bekräfta kundens elområde.');
  if(!a.scopeConfirmed)errors.push('Bekräfta att priset omfattar all elhandel men inte moms, elnät eller energiskatt.');
  if(a.mode!=='invoice'){
   if(a.monthlyFee===null)errors.push('Ange månadsavgiften. Skriv 0 bara om avgift saknas.');
   if(a.composition==='components'&&(a.margin===null||a.other===null))errors.push('Fyll i påslag och övriga elhandelstillägg. Okända kostnader får inte anges som 0.');
   if(a.mode==='constant'&&a.rate===null)errors.push('Ange priset för perioden.');
  }
 }
 return errors;
}
export function customerMonth(a,key,kwh,{estimated=false}={}){
 if(key<a.from||key>a.to)return {available:false,reason:'Utanför kundavtalets prisperiod'};
 if(kwh===null)return {available:false,reason:'Förbrukning saknas'};
 const m=a.months[key];
 if(a.mode==='invoice'){
  if(m?.amount===null||m?.amount===undefined||m?.kwh===null||m?.kwh===undefined)return {available:false,reason:'Fakturabelopp eller fakturerad förbrukning saknas'};
  if(estimated||Math.abs(m.kwh-kwh)>.01)return {available:false,reason:'Förbrukningen måste stämma med fakturan'};
  return {available:true,cost:m.amount,rate:kwh?m.amount/kwh*100:0,monthlyFee:null};
 }
 const price=a.mode==='constant'?a.rate:m?.rate;
 if(price===null||price===undefined)return {available:false,reason:'Kundens månadspris saknas'};
 if(a.monthlyFee===null||a.composition==='components'&&(a.margin===null||a.other===null))return {available:false,reason:'Avgift eller tillägg saknas'};
 const energy=price+(a.composition==='components'?a.margin+a.other:0),cost=kwh*energy/100+a.monthlyFee;
 return {available:true,cost,rate:kwh?cost/kwh*100:energy,monthlyFee:a.monthlyFee};
}
export const customerReferenceLabel=s=>s.comparisonMode==='customer'&&s.customerAgreement?`${s.customerAgreement.provider} · ${AGREEMENT_TYPES[s.customerAgreement.type]}`:'Kvartspris';
export function customerBasis(s){
 const a=s.customerAgreement;if(s.comparisonMode!=='customer'||!a)return '';
 return `${SOURCE_TYPES[a.sourceType]}: ${a.sourceRef} (${a.sourceDate}). ${a.provider}, ${a.customer}, ${a.area}, ${a.from}–${a.to}. ${a.mode==='invoice'?'Kundens fakturerade elhandel är inmatad av säljaren och matchas mot fakturans förbrukning.':'Kundens inmatade priser tillämpas på jämförelsens förbrukning.'} Det föreslagna avtalet är en beräkning, inte kundens faktiska utfall. Samma månader används på båda sidor. Endast elhandel exklusive moms, elnät och energiskatt.`;
}

````

## Fil: public/customer-email.mjs

````text
import {businessImpact} from './business-impact.mjs';
import {calculate,profileSourceLabel,validateState} from './model.mjs';
const fmt=(n,d=2)=>new Intl.NumberFormat('sv-SE',{minimumFractionDigits:d,maximumFractionDigits:d}).format(n);
export const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const sellerNotesTitle=name=>`${name.trim()}${/[sxz]$/i.test(name.trim())?'':'s'} anteckningar`;
export const validEmail=s=>typeof s==='string'&&s.length<=254&&!/[\u0000-\u001f\u007f]/.test(s)&&/^[^\s@<>,;:"\\]+@[^\s@<>,;:"\\]+\.[^\s@<>,;:"\\]+$/.test(s);
const sign=n=>(Math.abs(n)<1e-8?'':n>0?'+':'−')+fmt(Math.abs(n));
const amount=n=>Math.abs(n)>1e-8&&Math.abs(n)<.005?'< 0,01':fmt(Math.abs(n));
export function buildCustomerEmail(state,{recipientName='',recipientEmail='',includeNotes=true}={}){
 if(!validateState(state))throw Error('Kundrummets underlag är inte giltigt.');
 const seller=(state.sellerName||'Ludwig Rosenberg').trim(),r=calculate(state);
 if(!seller||seller.length>100)throw Error('Ange säljarens namn.');
 if(r.volume<=0)throw Error('Lägg in förbrukning med komplett prisunderlag innan du delar.');
 const subject=`Er eljämförelse ${r.periodLabel} – ${state.customer}`.replace(/[\r\n]+/g,' ');
 const greeting=recipientName.trim()?`Hej ${recipientName.trim()}!`:'Hej!';
 const intro=`Tack för samtalet. Här är sammanställningen för ${state.customer}, utifrån de val vi gick igenom i kundrummet.`;
 const coverage=`${r.periodLabel} · ${r.count} av 12 månader · ${fmt(r.volume,r.volume%1?2:0)} kWh (${fmt(r.volume/1000)} MWh) i jämförelsen.`;
 const profile=profileSourceLabel(state).replace('ditt Excelunderlag','jämförelseunderlaget').replace('Din inlagda','Inlagd');
 const comparison=[['Rörligt',r.variableRate,r.variable],['Portfölj',r.portfolioRate,r.portfolio],['Fastpris (referens)',r.fixedRate,r.fixed]];
 const same=Math.abs(r.differenceRate)<1e-8,extra=r.difference<0;
 const resultTitle=same?'Samma beräknade kostnad':extra?'Merkostnad med portfölj':'Besparing med portfölj';
 const resultText=`${amount(r.difference)} kr · ${amount(r.differenceRate)} öre/kWh${same?'':extra?' högre kostnad än rörligt':' lägre kostnad än rörligt'}.`;
 const explanation=[
 `Med rörligt följer hela förbrukningen underlagets rörliga månadspris.`,
 `Med portfölj räknar vi här med prisavtal för ${fmt(state.hedge,0)} % av volymen och ${fmt(100-state.hedge,0)} % osäkrad volym. Procentsiffrorna gäller mängden el, inte hur stor del av hela fakturan som är låst.`,
 `Prisavtalen räknas av i pengar och justerar elkostnaden uppåt eller nedåt. När och hur mycket el ni använder, avgifter, balanskostnader, elcertifikat och ursprungsgarantier kan fortfarande påverka slutpriset. Den här månadsjämförelsen beräknar inte er egen förbrukningsprofil från kvartsmätvärden.`,
 `Månadskostnaden är förbrukningen i kWh × priset i öre/kWh ÷ 100. Snittpriset vägs efter hur mycket el som används varje månad. Samma förbrukning används för alla alternativ.`,
 `Påslag: portfölj ${fmt(state.portfolioFee)} öre/kWh och rörligt ${fmt(state.variableFee)} öre/kWh. Underlagets kostnadstillägg ingår i båda. Inget separat säkringspåslag har lagts till. Fastprisreferensen är ${fmt(state.fixed)} öre/kWh.`,
 `Förbrukningen är beräknad med ${fmt(state.consumption,0)} % av den inlagda profilen. ${profile}`,
 ...(r.count<12?[`Månader utan komplett pris- eller förbrukningsunderlag ingår inte i jämförelsen: ${r.rows.filter(row=>!row.available).map(row=>row.month).join(', ')}.`]:[]),
 `Beloppen är exklusive moms, elnät och energiskatt. Detta är en beräknad jämförelse med månadspriser, inte en faktura, offert eller garanti för framtida besparing.`
 ];
 const impact=businessImpact(r,state);
 const notes=includeNotes&&state.notes.trim()?state.notes.trim():'';
 const choice={variable:'Rörligt',portfolio:'Portfölj',fixed:'Fastpris'}[state.choice];
 const followup=[...(choice?[`Alternativ att undersöka vidare: ${choice}.`]:[]),...(state.next.trim()?[`Nästa steg: ${state.next.trim()}`]:[]),...(state.date?[`Uppföljningsdatum: ${state.date}`]:[])];
 const monthly=r.rows.filter(row=>row.available).map(row=>`${row.month} · ${fmt(row.volume,row.volume%1?2:0)} kWh\nRörligt: ${fmt(row.variableRate)} öre/kWh / ${fmt(row.variable)} kr. Portfölj: ${fmt(row.portfolioRate)} öre/kWh / ${fmt(row.portfolio)} kr. Skillnad: ${sign(row.differenceRate)} öre/kWh / ${sign(row.difference)} kr.`);
 const text=[greeting,intro,coverage,'JÄMFÖRELSE',...comparison.map(([name,rate,cost])=>`${name}: ${fmt(rate)} öre/kWh · ${fmt(cost)} kr.`),`${resultTitle}\n${resultText}`,'FÖR ER VERKSAMHET',...impact.lines,'SÅ FUNGERAR JÄMFÖRELSEN',...explanation,...(notes?[sellerNotesTitle(seller),notes]:[]),...(followup.length?['DET HÄR TAR VI VIDARE',...followup]:[]),'MÅNAD FÖR MÅNAD','Plus = besparing med portfölj. Minus = merkostnad.',...monthly,`Vänliga hälsningar\n${seller}\nKraftringen`].join('\n\n');
 const e=escapeHtml,paragraph=t=>`<p style="font-size:14px;line-height:1.75;margin:0 0 14px;white-space:pre-wrap">${e(t)}</p>`,heading=t=>`<h2 style="font-size:17px;line-height:1.4;margin:28px 0 13px;color:#013c57">${e(t)}</h2>`;
 const cell='padding:12px 8px;border-bottom:1px solid #d9e3e8;text-align:right;font-size:13px;';
 const body=`<div class="customer-email" style="font-family:Arial,sans-serif;color:#013c57;background:#fff;max-width:720px;margin:auto"><div style="padding:24px;background:#013c57;color:#fff;border-radius:12px 12px 0 0"><p style="font-size:19px;font-weight:bold;margin:0 0 18px">Kraftringen <span style="font-size:12px;font-weight:normal;color:#c9dce6">/ Kundrummet</span></p><p style="font-size:12px;color:#fbc34e;letter-spacing:1px;margin:0 0 8px">ER ELJÄMFÖRELSE · ${e(r.periodLabel)}</p><h1 style="font-size:25px;line-height:1.3;margin:0;overflow-wrap:anywhere">${e(state.customer)}</h1></div><div style="padding:24px">${paragraph(greeting)}${paragraph(intro)}<p style="padding:12px;background:#edf3f6;font-size:13px;line-height:1.7;border-radius:6px">${e(coverage)}</p><table style="width:100%;border-collapse:collapse;margin:20px 0" aria-label="Beräknad jämförelse"><thead><tr><th style="${cell}text-align:left">Alternativ</th><th style="${cell}">öre/kWh</th><th style="${cell}">Kostnad, kr</th></tr></thead><tbody>${comparison.map(([name,rate,cost])=>`<tr><th scope="row" style="${cell}text-align:left;font-weight:normal">${e(name)}</th><td style="${cell}">${fmt(rate)}</td><td style="${cell}">${fmt(cost)}</td></tr>`).join('')}</tbody></table><div style="background:${same?'#edf3f6':extra?'#f8c3c6':'#fbc34e'};padding:20px;border-radius:8px"><strong style="font-size:14px">${e(resultTitle)}</strong><p style="font-size:26px;font-weight:bold;margin:10px 0 4px">${e(amount(r.difference))} kr</p><p style="font-size:14px;margin:0;line-height:1.6">${e(amount(r.differenceRate))} öre/kWh${same?'':extra?' högre än rörligt':' lägre än rörligt'}</p></div>${heading('För er verksamhet')}${impact.lines.map(paragraph).join('')}${heading('Så fungerar jämförelsen')}${explanation.map(paragraph).join('')}${notes?heading(sellerNotesTitle(seller))+`<div style="border-left:3px solid #fbc34e;padding-left:16px">${paragraph(notes)}</div>`:''}${followup.length?heading('Det här tar vi vidare')+followup.map(paragraph).join(''):''}${heading('Månad för månad')}${paragraph('Plus = besparing med portfölj. Minus = merkostnad.')}${r.rows.filter(row=>row.available).map(row=>`<div style="border-top:1px solid #d9e3e8;padding:14px 0"><strong style="font-size:14px">${e(row.month)} · ${fmt(row.volume,row.volume%1?2:0)} kWh</strong><p style="font-size:13px;line-height:1.8;margin:5px 0">Rörligt: ${fmt(row.variableRate)} öre/kWh · ${fmt(row.variable)} kr<br>Portfölj: ${fmt(row.portfolioRate)} öre/kWh · ${fmt(row.portfolio)} kr<br><strong>Skillnad: ${sign(row.differenceRate)} öre/kWh · ${sign(row.difference)} kr</strong></p></div>`).join('')}${paragraph(`Vänliga hälsningar\n${seller}\nKraftringen`)}</div></div>`;
 return {subject,text,body,html:`<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(subject)}</title></head><body style="margin:0;background:#f2f5f7;padding:12px">${body}</body></html>`,recipientEmail,notesIncluded:!!notes};
}
function base64(text){const bytes=new TextEncoder().encode(text);let str='';for(const byte of bytes)str+=String.fromCharCode(byte);return btoa(str);}
function header(text){const chunks=[];let current='';for(const char of text){if(new TextEncoder().encode(current+char).length>42){chunks.push(current);current='';}current+=char;}if(current)chunks.push(current);return chunks.map(chunk=>'=?UTF-8?B?'+base64(chunk)+'?=').join('\r\n ');}
export function emailFile(email){
 if(!validEmail(email.recipientEmail))throw Error('Ange kundens mejladress.');
 const boundary='kundrum_customer_email_alternative';
 const part=(type,value)=>`--${boundary}\r\nContent-Type: ${type}; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${base64(value).match(/.{1,76}/g).join('\r\n')}\r\n`;
 return `To: ${email.recipientEmail}\r\nSubject: ${header(email.subject)}\r\nMIME-Version: 1.0\r\nX-Unsent: 1\r\nContent-Type: multipart/alternative; boundary="${boundary}"\r\n\r\n${part('text/plain',email.text)}${part('text/html',email.html)}--${boundary}--\r\n`;
}
export function mailtoLink(email){if(!validEmail(email.recipientEmail))throw Error('Ange kundens mejladress.');return `mailto:${email.recipientEmail.split('@').map(encodeURIComponent).join('@')}?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.text)}`;}

````

## Fil: public/customer-share.css

````text
.header-actions,.meeting-actions{display:flex;align-items:center;gap:10px}.header-actions .btn{white-space:nowrap}#sellerName{display:block;width:100%;margin:8px 0 22px}#notesLabel{display:block}.notes-share-hint{font-size:11px;line-height:1.7;color:var(--muted);margin:9px 0}.meeting-actions{flex-wrap:wrap}.meeting-bottom{gap:20px}#shareDialog{width:min(940px,calc(100vw - 36px));max-width:940px;padding:28px;max-height:92dvh}#shareDialog .dialog-head{margin-bottom:8px}.share-intro{font-size:13px;color:var(--muted);line-height:1.7;margin:0 0 24px}.share-fields{display:grid;grid-template-columns:1fr 1.2fr 1fr;gap:15px}.share-fields label{font-size:11px;line-height:1.6;font-weight:500;min-width:0}.share-fields label>span{font-weight:400;color:var(--muted)}.share-fields input{display:block;width:100%;margin-top:7px;min-height:44px;font-size:13px}.share-notes-choice{display:flex;align-items:center;gap:10px;margin:20px 0;font-size:12px;line-height:1.6;cursor:pointer}.share-notes-choice input{width:18px;height:18px;margin:0;accent-color:#013c57;flex-shrink:0}.share-preview-heading{display:flex;justify-content:space-between;align-items:center;font-size:12px;margin:23px 0 10px}.share-preview-heading>span{border-radius:5px;background:#edf3f6;padding:5px 10px}.share-subject{border:1px solid #d9e3e8;border-bottom:0;padding:13px 16px;display:flex;gap:15px;line-height:1.6;font-size:12px;border-radius:8px 8px 0 0}.share-subject>span{color:var(--muted)}.share-subject strong{font-weight:500;overflow-wrap:anywhere}.email-preview{border:1px solid #d9e3e8;border-radius:0 0 8px 8px;background:#edf3f6;padding:18px;max-height:480px;overflow:auto;overscroll-behavior:contain}.email-preview:focus-visible{outline:2px solid #007aa3;outline-offset:2px}.email-preview .customer-email table{min-width:0}.email-preview .customer-email h1{font-family:Arial,sans-serif;letter-spacing:0;text-transform:none}.share-delivery{padding:16px 18px;margin-top:20px;background:#fff5dc;border-radius:8px}.share-delivery strong{font-size:12px}.share-delivery p{font-size:11px;line-height:1.75;margin:6px 0 0}.share-actions{display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:10px;margin-top:14px}.share-actions .btn{font-size:11px;min-height:44px}.share-file-help{font-size:10px;line-height:1.7;color:var(--muted);margin:12px 0 0}#shareStatus{font-size:12px;line-height:1.7}#shareStatus:empty{display:none}
@media(max-width:1100px){.header-actions{gap:7px}.header-actions .btn{font-size:10px;padding:11px 13px}.header-actions .btn svg{display:none}}
@media(max-width:750px){.header-actions #exportTop{display:none}.share-fields{grid-template-columns:1fr 1fr}.share-fields label:last-child{grid-column:1/-1}.meeting-actions{justify-content:flex-start}}
@media(max-width:560px){#shareDialog{padding:20px 15px;width:calc(100vw - 24px)}#shareDialog .dialog-head h2{font-size:24px}.share-intro{font-size:12px;margin-bottom:18px}.share-fields{grid-template-columns:1fr;gap:12px}.share-fields label:last-child{grid-column:auto}.share-fields input{font-size:16px}.share-notes-choice{font-size:11px}.share-subject{font-size:11px;padding:12px}.email-preview{padding:7px;max-height:380px}.email-preview .customer-email>div{padding:16px!important}.email-preview .customer-email th,.email-preview .customer-email td{padding:10px 4px!important;font-size:11px!important}.share-preview-heading{font-size:11px}.share-delivery{padding:14px}.share-actions .btn{flex:1 1 45%;font-size:10px;padding:12px 9px}.share-actions #openCustomerEmail{flex-basis:100%;font-size:12px;order:-1}.meeting-actions{width:100%}.meeting-actions .btn{flex:1;font-size:11px;padding:12px 10px}.header-actions #shareTop{font-size:10px;min-height:42px;padding:10px 11px}.notes-share-hint{font-size:10px}}
#shareDialog .share-notes-choice input{width:18px;min-width:18px;height:18px;padding:0;margin:0;flex:0 0 18px}
@media(min-width:561px){.email-preview{max-height:clamp(220px,34dvh,360px)}}
@media(max-width:360px){.email-preview .customer-email>div{padding:12px!important}.email-preview .customer-email th,.email-preview .customer-email td{font-size:10px!important}}

````

## Fil: public/data.mjs

````text
export const DATA = {
  "id": "ludwig-2025-2026-v1",
  "sourceName": "Jämförelse_Estimerade_priser_portfölj_mot_rörligt_kvartspris_och_fastpris_2025_2026_ludwig.xlsx",
  "sha256": "a368dee5d7ba6cdf0112ae35a0a10ef76030ec3c96e0f20d7569bae89531ec10",
  "sheet": "Elförbrukning",
  "parameters": {
    "portfolioFee": 2.0,
    "variableFee": 2.4,
    "fixed": 101.4
  },
  "periods": {
    "2025": {
      "label": "2025",
      "count": 12,
      "columns": {
        "volume": "B",
        "hedged": "T",
        "spot": "U",
        "running": "V",
        "weighting": "W"
      },
      "volume": [
        10000.0,
        11000.0,
        12000.0,
        13000.0,
        14000.0,
        15000.0,
        16000.0,
        17000.0,
        18000.0,
        19000.0,
        20000.0,
        21000.0
      ],
      "hedged": [
        83.49,
        81.92,
        62.46,
        50.54,
        39.91,
        37.41,
        39.13,
        46.57,
        53.4,
        60.83,
        77.21,
        85.67
      ],
      "spot": [
        76.11,
        103.87,
        60.46,
        58.35,
        60.01,
        40.7,
        46.37,
        73.23,
        70.6,
        71.25,
        80.7,
        64.88
      ],
      "running": [
        6.98,
        9.56,
        6.89,
        5.98,
        4.0,
        4.3,
        4.84,
        5.55,
        7.59,
        6.11,
        12.07,
        5.14
      ],
      "weighting": [
        3.27,
        5.72,
        3.24,
        2.35,
        0.36,
        0.74,
        1.19,
        1.8,
        3.89,
        2.4,
        8.53,
        1.73
      ]
    },
    "2026": {
      "label": "2026",
      "count": 9,
      "columns": {
        "volume": "K",
        "hedged": "Z",
        "spot": "AA",
        "running": "AB",
        "weighting": "AC"
      },
      "volume": [
        10000.0,
        11000.0,
        12000.0,
        13000.0,
        14000.0,
        15000.0,
        16000.0,
        17000.0,
        18000.0,
        null,
        null,
        null
      ],
      "hedged": [
        95.02,
        97.25,
        72.78,
        53.34,
        50.29,
        47.9,
        42.42,
        47.95,
        52.92,
        null,
        null,
        null
      ],
      "spot": [
        112.99,
        113.28,
        84.58,
        66.55,
        94.64,
        103.72,
        86.44,
        80.47,
        120.2,
        null,
        null,
        null
      ],
      "running": [
        5.73,
        5.83,
        9.0,
        7.77,
        9.07,
        6.73,
        5.95,
        7.98,
        11.67,
        null,
        null,
        null
      ],
      "weighting": [
        2.57,
        2.65,
        4.42,
        3.29,
        4.45,
        2.05,
        1.33,
        3.37,
        6.85,
        null,
        null,
        null
      ]
    }
  }
};

````

## Fil: public/details.html

````text
<!doctype html>
<html lang="sv">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="theme-color" content="#013c57"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="default"><meta name="apple-mobile-web-app-title" content="Kundrummet"><meta name="description" content="Utforska er elanvändning, jämför prisscenarier och samla nästa steg i ett interaktivt kundrum."><title>Kraftringen · Kundrummet</title><link rel="stylesheet" href="styles.css"><link rel="manifest" href="/manifest.webmanifest" crossorigin="use-credentials"><link rel="icon" type="image/svg+xml" href="/icons/kundrum.svg"><link rel="apple-touch-icon" sizes="180x180" href="/icons/kundrum-180.png"><link rel="stylesheet" href="/install.css"><link rel="stylesheet" href="/comparison.css"><link rel="stylesheet" href="/brand.css"><link rel="stylesheet" href="/annual-profile.css"><link rel="stylesheet" href="/chart-experience.css"><link rel="stylesheet" href="/customer-share.css"><link rel="stylesheet" href="/mobile-app.css"><link rel="stylesheet" href="/business-impact.css"><link rel="stylesheet" href="/purchases.css"><script type="module" src="/install.mjs"></script></head>
<body data-mobile-page="home" data-mobile-comparison="year">
<svg class="symbols" xmlns="http://www.w3.org/2000/svg"><symbol id="arrow" viewBox="0 0 24 24"><path d="M5 12h14m-6-6 6 6-6 6"/></symbol><symbol id="download" viewBox="0 0 24 24"><path d="M12 3v12m-5-5 5 5 5-5M5 16v5h14v-5"/></symbol><symbol id="sliders" viewBox="0 0 24 24"><path d="M4 7h6m4 0h6M4 17h10m4 0h2M10 4v6m4 4v6"/></symbol><symbol id="check" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></symbol><symbol id="plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></symbol></svg>
<header class="header"><a class="brand" href="#" aria-label="Kraftringen Kundrummet – till toppen"><img class="brand-logo" src="/brand/kraftringen-logo.svg" alt="Kraftringen" width="200" height="34"><span class="brand-room">Kundrummet<small>FÖRETAG</small></span></a><nav aria-label="Huvudmeny"><a href="/">Mötesflöde</a><a class="active" href="#explore">Utforska</a><a href="#profile">Er förbrukning</a><a href="#meeting">Nästa steg</a><a href="/stories.html">Kundberättelser</a></nav><div class="header-actions"><button class="btn light" id="exportTop"><svg><use href="#download"/></svg><span>Spara underlag</span></button><button class="btn primary" id="shareTop">Dela till kund <svg><use href="#arrow"/></svg></button></div></header>
<div class="mobile-shell">
<div class="mobile-brand"><img src="/brand/kraftringen-logo.svg" width="138" height="24" alt="Kraftringen"><span>Kundrummet</span></div>
<div class="mobile-topbar"><button id="mobileCustomer" class="customer-pill" aria-label="Ändra företagsnamn och förbrukning"><span id="mobileCustomerName"></span><svg viewBox="0 0 24 24"><path d="m7 10 5 5 5-5"/></svg></button><button id="mobileInfo" class="round-button" aria-label="Appinformation och installation"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/></svg></button></div>
<div class="mobile-yearbar"><div class="mobile-years" role="group" aria-label="Välj år"><button data-period="2025" aria-pressed="true">2025</button><button data-period="2026" aria-pressed="false">2026</button></div><span id="mobileCoverage"></span></div>
</div>
<main>
<section id="home" class="mobile-home" aria-labelledby="mobileHomeTitle">
<div class="mobile-page-title"><p>EN ÖVERBLICK, TILLSAMMANS</p><h1 id="mobileHomeTitle" tabindex="-1">Ert elår.<br>Lite tydligare.</h1></div>
<article class="mobile-savings" id="mobileSavings" data-kind="saving"><div class="mobile-card-label"><span id="mobileSavingsTitle">Beräknad besparing</span><svg viewBox="0 0 24 24"><path d="M5 7l6 6 4-4 5 8m-6 0h6v-6"/></svg></div><div class="mobile-amount"><strong id="mobileSavingsAmount"></strong><span>kr</span></div><p id="mobileSavingsRate"></p><div class="mobile-savings-bottom"><span id="mobileSavingsBasis"></span><a href="#explore" data-mobile-target="explore" aria-label="Se hela jämförelsen"><svg viewBox="0 0 24 24"><path d="M5 12h14m-6-6 6 6-6 6"/></svg></a></div></article>
<p class="mobile-basis" id="mobileBasis"></p>
<div id="mobileBusinessSlot"></div>
<article class="mobile-card mobile-costs"><div class="mobile-card-heading"><h2>Vad hade elen kostat?</h2><a href="#explore" data-mobile-target="explore" aria-label="Öppna prisjämförelsen">↗</a></div>
<div class="mobile-cost-row"><span class="mobile-tile pink"><svg viewBox="0 0 24 24"><path d="m3 15 5-5 4 3 8-9M15 4h5v5"/></svg></span><div><span>Rörligt</span><strong id="mobileFloatingCost"></strong><small id="mobileFloatingRate"></small></div></div><div class="mobile-cost-track"><span id="mobileFloatingBar"></span></div>
<div class="mobile-cost-row"><span class="mobile-tile blue"><svg viewBox="0 0 24 24"><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM8 12l3 3 5-6"/></svg></span><div><span>Portfölj</span><strong id="mobilePortfolioCost"></strong><small id="mobilePortfolioRate"></small></div></div><div class="mobile-cost-track portfolio"><span id="mobilePortfolioBar"></span></div>
<p>För samma förbrukning och månader.</p></article>
<button class="mobile-card mobile-action-card" data-mobile-target="profile"><span class="mobile-tile blue"><svg viewBox="0 0 24 24"><path d="M5 19V11m7 8V4m7 15V8"/></svg></span><span><span>Förbrukning i jämförelsen</span><strong id="mobileVolume"></strong><small id="mobileProfileType"></small></span><span class="chevron">›</span></button>
<button type="button" class="mobile-card mobile-action-card purchase-entry" data-open-purchases><span class="mobile-tile"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18h4v-4h5V9h7M4 5v15h16"/></svg></span><span><strong>Så fungerar er portfölj</strong><small>Vad säkrar vi? Vad kan ändras?<br>Förklarat med ett enkelt exempel.</small></span><span class="chevron" aria-hidden="true">›</span></button>
<button class="mobile-card mobile-action-card" id="mobileBalance"><span class="mobile-tile pink"><svg viewBox="0 0 24 24"><use href="#sliders"/></svg></span><span><span>Er balans</span><strong id="mobileHedge"></strong><small id="mobileFloatingShare"></small></span><span class="chevron">›</span></button>
<a class="mobile-card mobile-action-card" href="/stories.html" style="text-decoration:none;color:inherit"><span><strong>Kundberättelser</strong><small>Sju verksamheter. Olika perspektiv på elaffären.</small></span><span class="chevron" aria-hidden="true">›</span></a>
<button class="mobile-share-button" id="mobileShare">Dela till kund <svg viewBox="0 0 24 24"><use href="#arrow"/></svg></button><p class="mobile-endnote">Sammanställning och anteckningar i ett kundmejl.</p>
</section>
<div class="contextline"><span><span class="status-dot"></span> ERT DIGITALA KUNDRUMMET</span><span class="demo-badge">DITT PRISUNDERLAG · JÄMFÖRELSE</span></div>
<section class="hero"><div><p class="eyebrow" id="customerLabel">KUND ENLIGT DITT UNDERLAG</p><h1>El som går att <em>förstå.</em></h1><p class="lead">Ert elår. Era förutsättningar. Utforska vad olika val<br class="desktop-break"> kan betyda för er – tillsammans.</p></div><div class="advisor"><div class="avatar" id="advisorInitials">LR</div><div><strong id="advisorName">Ludwig Rosenberg</strong><span>Din kontakt i kundrummet</span><button class="text-btn" id="editCustomer">Anpassa kundrum <span aria-hidden="true">↗</span></button></div></div></section>
<div class="summary-strip"><div><span>Förbrukning i jämförelsen (MWh)</span><strong id="annualVolume">186 <small>MWh</small></strong></div><div><span>Förbrukningsprofil</span><strong id="seasonLabel">Vintertyngd</strong></div><div><span>Underlag</span><strong id="sourceLabel">2025</strong></div><div class="strip-action"><button class="text-btn" id="editProfileTop">Redigera förbrukning <svg><use href="#arrow"/></svg></button></div></div>
<aside class="app-install-bar" id="appInstallBar" aria-label="Installera Kundrummet"><img src="/icons/kundrum-192.png" width="46" height="46" alt=""><div><strong>Kundrummet, ett tryck bort.</strong><p>Öppna från en egen ikon på mobilen eller datorn.</p></div><button class="btn primary" id="installApp">Installera app <svg><use href="#arrow"/></svg></button></aside>
<p class="connection-note" id="connectionNote" role="status" hidden>Du är offline. Internet behövs för att öppna kundrummet på nytt.</p>
<section id="explore" class="explore"><div class="section-heading"><div><p class="eyebrow">01 / UTFORSKA TILLSAMMANS</p><h2>Vad händer om …</h2></div><span class="quiet">Välj år och säkringsgrad. Se skillnaden direkt.</span></div>
<div class="mobile-compare-toolbar"><div role="group" aria-label="Visa jämförelse"><button data-comparison-view="year" aria-pressed="true">Överblick</button><button data-comparison-view="months" aria-pressed="false">Månader</button></div><button class="round-button" id="mobileAdjust" aria-label="Ändra säkringsgrad och priser"><svg viewBox="0 0 24 24"><use href="#sliders"/></svg></button></div><div class="explore-grid"><div class="comparison"><div class="scenario-tabs" role="group" aria-label="År"><button data-period="2025" aria-pressed="true">2025</button><button data-period="2026" aria-pressed="false">2026</button></div><p class="basis-note" id="migrationNote" hidden></p><section class="comparison-summary" id="comparisonSummary" aria-labelledby="comparisonTitle"><div class="comparison-heading"><div><h3 id="comparisonTitle">Vad kostar elen med varje alternativ?</h3><p id="scenarioDescription"></p><p id="profileEstimateNote" class="estimate-notice" hidden></p></div><a class="text-btn controls-link" href="#scenarioControls">Ändra säkringsgrad ↓</a></div><div class="cost-cards"><div class="cost-card floating-card"><h4><i class="dot"></i> Rörligt</h4><span class="metric-caption">Genomsnittligt pris</span><strong class="rate-value" id="variableUnit"></strong><span class="metric-caption">Kostnad för perioden</span><strong class="money-value" id="variableTotal"></strong><p>Hela volymen följer underlagets rörliga pris.</p></div><div class="cost-card portfolio-card"><h4><i class="dot"></i> Portfölj</h4><span class="metric-caption">Genomsnittligt pris</span><strong class="rate-value" id="securedUnit"></strong><span class="metric-caption">Kostnad för perioden</span><strong class="money-value" id="securedTotal"></strong><p id="hedgeExplanation"></p><button type="button" class="purchase-link" data-open-purchases>Så fungerar er portfölj <svg viewBox="0 0 24 24" aria-hidden="true"><use href="#arrow"/></svg></button></div></div><div class="savings-panel" id="savingsPanel" role="status" aria-live="polite"><h4 id="savingsTitle"></h4><div class="savings-values"><div><strong id="savingsOre"></strong><span>öre/kWh</span></div><div><strong id="savingsMoney"></strong><span>kronor för perioden</span></div></div><p id="savingsContext"></p></div><p class="comparison-note">Beräknat från valt underlag. Förbrukningsvägda snittpriser. Exklusive moms, elnät och energiskatt.</p><div class="fixed-reference"><span><i class="line fixed"></i> Fastpris som referens</span><strong id="fixedUnit"></strong><strong id="fixedTotal"></strong></div></section>
<section class="business-impact" id="businessImpact" aria-labelledby="businessImpactTitle">
<div class="business-heading"><span class="business-icon" id="businessImpactIcon"><svg viewBox="0 0 24 24" aria-hidden="true"><path id="businessIconPath" d="M4 21V7h16v14M8 7V3h8v4"/></svg></span><div><p>VAD BETYDER DET FÖR ER?</p><h3 id="businessImpactTitle">För er verksamhet.</h3></div></div>
<div class="business-inputs"><label for="businessType">Verksamhet<select id="businessType"><option value="company">Företag</option><option value="brf">BRF</option><option value="hotel">Hotell</option><option value="industry">Industri</option><option value="farm">Lantbruk</option><option value="shop">Butik</option></select></label><div id="businessApartmentField" hidden><label for="businessApartments">Antal lägenheter <span>(valfritt)</span><input id="businessApartments" type="text" inputmode="numeric" maxlength="6" placeholder="Till exempel 50" aria-describedby="businessApartmentError"></label><p id="businessApartmentError" role="status" hidden>Ange ett heltal mellan 1 och 100 000.</p></div></div>
<div class="business-result" aria-live="polite" aria-atomic="true"><p id="businessImpactCaption"></p><div class="business-amount"><strong id="businessImpactAmount"></strong><span id="businessImpactUnit"></span></div><p class="business-secondary" id="businessImpactSecondary"></p></div>
<p class="business-sensitivity" id="businessImpactSensitivity"></p><p class="business-context" id="businessImpactContext"></p><p class="business-scope" id="businessImpactScope"></p>
</section>
<section class="month-explorer" aria-labelledby="monthExplorerTitle">
<div class="chart-toolbar"><div><p class="chart-eyebrow">ERT ELÅR I NÄRBILD</p><h3 id="monthExplorerTitle">Månad för månad.</h3></div><div class="unit-toggle" role="group" aria-label="Enhet i diagrammen"><button data-chart-unit="ore" aria-pressed="true">Öre/kWh</button><button data-chart-unit="kr" aria-pressed="false">Kronor</button></div></div>
<p class="chart-instruction">Välj en månad. Se vad prisskillnaden betyder för er.</p>
<div class="month-focus" id="monthFocus" role="status" aria-live="polite" aria-atomic="true"></div>
<div class="chart-header"><h4 id="priceChartHeading">Pris per månad</h4><span id="chartUnitLabel">öre/kWh</span></div>
<div class="chart-scroll cost-chart" id="costChart"></div>
<div class="legend"><span><i class="line variable"></i>Rörligt</span><span><i class="line secured"></i>Portfölj</span><span><i class="line fixed"></i>Fastpris</span><span class="gap-key"><i></i>Gult = besparing · rosa = merkostnad</span></div>
<p class="mobile-chart-hint">Svep prisgrafen i sidled för att se hela året.</p>
<div class="chart-header month-nav-heading"><h4>Skillnaden med portfölj</h4><span id="differenceUnitLabel">öre/kWh</span></div>
<div class="month-buttons" id="monthButtons" role="group" aria-label="Välj månad att jämföra"></div>
<div class="month-chart-footer"><span><i class="saving-dot"></i>Plus = besparing</span><span><i class="extra-dot"></i>Minus = merkostnad</span><span id="chartAvailability"></span></div>
</section><div class="price-breakdown" id="priceBreakdown"></div><div class="insight"><span class="insight-icon" aria-hidden="true">↗</span><p id="insightText"></p></div></div>
<aside class="controls" id="scenarioControls"><div class="control-heading"><span class="eyebrow">PROVA ERA FÖRUTSÄTTNINGAR</span><svg><use href="#sliders"/></svg></div><h3>Ni väljer balansen.</h3><p class="control-intro">Justera en sak i taget och se hur utfallet förändras.</p><div class="control"><label for="consumption">Förbrukning <output id="consumptionOutput">100 %</output></label><input type="range" id="consumption" min="50" max="150" value="100" step="5"><div class="range-labels"><span>50 %</span><span>Av årsprofilen</span><span>150 %</span></div></div><div class="control"><label for="hedge">Prissäkrad volym <output id="hedgeOutput">80 %</output></label><input type="range" id="hedge" min="0" max="100" value="80" step="1"><div class="range-labels"><span>0 %</span><span id="floatingShare">20 % osäkrat</span><span>100 %</span></div></div><div class="price-inputs"><label for="portfolioFee">Påslag portfölj<div class="input-unit"><input type="number" id="portfolioFee" min="0" max="100" step="0.01" value="2"><span>öre/kWh</span></div></label><label for="variableFee">Påslag rörligt<div class="input-unit"><input type="number" id="variableFee" min="0" max="100" step="0.01" value="2.4"><span>öre/kWh</span></div></label><label for="fixed">Fastpris<div class="input-unit"><input type="number" id="fixed" min="0" max="500" step="0.01" value="101.4"><span>öre/kWh</span></div></label></div><p class="control-footnote"><strong>Andelen gäller mängden el, inte hela slutpriset.</strong> Förbrukningsprofil och andra kostnader kan fortfarande påverka priset.</p><p class="control-footnote">Säkrade och rörliga månadspriser hämtas från ditt Excelunderlag. Påslag gäller hela volymen. Inget separat säkringspåslag har lagts till.</p><button class="reset" id="resetScenario">Återställ reglage <span aria-hidden="true">↺</span></button><a class="control-return" href="#comparisonSummary">Visa jämförelsen ↑</a></aside></div>
<details class="calculation"><summary>Så räknar vi – antaganden och månadstabell <span aria-hidden="true">+</span></summary><div class="calculation-body"><div id="methodText"><p><strong>Prissäkrad volym är inte samma sak som fast slutpris.</strong> Prisavtalen räknas av i pengar. Kundens förbrukningsprofil och övriga kostnader påverkar fortfarande priset. Den här jämförelsen använder månadspriser och kostnadstillägg från underlaget; den räknar inte fram kundens egen kostnad från kvartsmätvärden.</p><p><strong>Beräknad jämförelse med priser från ditt underlag.</strong> Portföljpris = säkrad andel × säkrat månadspris + osäkrad andel × rörligt månadspris + portföljpåslag + kostnadstillägg. Rörligt pris = rörligt månadspris + rörligt påslag + samma kostnadstillägg. Fastpris används direkt, utan dessa tillägg.</p><p>Kostnadstillägget är filens ”rörlig kostnad minus volymvägning”. Månadskostnad = kWh × öre/kWh ÷ 100. Samma valda säkringsgrad används varje månad. Säkringsandelen beräknas på angiven månadsförbrukning. Snittpriset är total kostnad dividerad med total förbrukning. Besparing i öre/kWh = (rörlig totalkostnad − portföljens totalkostnad) ÷ förbrukningen × 100. Positiv skillnad är besparing med portfölj; negativ skillnad är merkostnad. Skillnader räknas före avrundning. Belopp exklusive moms, elnät och energiskatt; inga ytterligare avgifter antas.</p><p>Detta är en månadsmodell, inte en beräkning från kundens kvartsmätvärden eller en offert. Priserna i filen är inte oberoende marknadsverifierade. Månader som saknar kompletta prisuppgifter ingår inte i jämförelsen. Om en förbrukningsmånad lämnas tom utesluts den för alla tre alternativ; noll är däremot en angiven förbrukning.</p><p><strong>Skillnaden mot Excel:</strong> T/Z används som pris på den säkrade delen, enligt ditt förtydligande. Resterande andel använder U/AA. Vid 100 % säkring återges originalets portföljberäkning; startvärdet här är 80 %.</p></div><p class="source-filename" id="sourceFile"></p><div class="table-scroll"><table><caption>Månadsberäkning · plus = besparing, minus = merkostnad · exklusive moms</caption><thead><tr><th>Månad</th><th>kWh</th><th>Rörligt<br>öre/kWh</th><th>Portfölj<br>öre/kWh</th><th>Skillnad<br>öre/kWh</th><th>Rörligt<br>kr</th><th>Portfölj<br>kr</th><th>Skillnad<br>kr</th><th>Fastpris<br>kr</th></tr></thead><tbody id="costRows"></tbody><tfoot id="costFoot"></tfoot></table></div><div class="table-scroll"><table><caption>Priser och kostnadstillägg · öre/kWh</caption><thead><tr><th>Månad</th><th>Säkrat</th><th>Rörligt</th><th>Rörlig kostnad</th><th>Volymvägning</th><th>Tillägg</th><th>Portfölj inkl. påslag</th></tr></thead><tbody id="priceRows"></tbody></table></div></div></details></section>
<section id="profile" class="profile-section"><div class="profile-copy"><p class="eyebrow">02 / ERT ELÅR</p><h2>När ni använder el <br>gör skillnad.</h2><p>Ange månadsvärden i kWh eller utgå från årsförbrukningen och välj vintertung, sommartung eller jämn profil. Varje år har en egen förbrukningsprofil.</p><button class="btn outlined" id="editProfile"><svg><use href="#plus"/></svg> Ange förbrukning</button><span id="profileSource" class="source-note">Visar förbrukningen från ditt underlag.</span></div><div class="profile-visual"><div class="profile-chart-top"><h3>Förbrukning per månad (MWh)</h3><span>Före scenariojustering</span></div><div id="profileChart" class="profile-chart"></div><div class="profile-facts"><span>Angiven förbrukning: <strong id="profileTotal"></strong></span><span>Störst förbrukning: <strong id="peakMonth"></strong></span></div></div></section>
<section id="meeting" class="meeting-section"><div class="section-heading"><div><p class="eyebrow">03 / TA SAMTALET VIDARE</p><h2>Det här tar vi med oss.</h2></div><span id="saveStatus" class="save-status">Sparas i den här webbläsaren</span></div><div class="meeting-grid"><div class="notes-block"><label for="sellerName">Säljarens namn<input id="sellerName" maxlength="100" autocomplete="name" value="Ludwig Rosenberg" required></label><label for="notes" id="notesLabel">Ludwig Rosenbergs anteckningar</label><textarea id="notes" maxlength="10000" placeholder="Sammanfatta vad ni pratade om, kundens behov och det ni vill ta vidare …"></textarea><p class="notes-share-hint">Ifyllda anteckningar tas med i kundmejlet. Du kan välja bort dem i förhandsvisningen.</p></div><div class="next-block"><label for="choice">Alternativ att undersöka vidare</label><select id="choice"><option value="undecided">Vi vill jämföra mer</option><option value="variable">Rörligt</option><option value="portfolio">Portfölj</option><option value="fixed">Fastpris</option></select><div class="next-fields"><label for="next">Nästa steg<input id="next" maxlength="1000" placeholder="T.ex. ta fram ett verifierat prisunderlag"></label><label for="date">Uppföljningsdatum<input type="date" id="date"></label></div><p>Valet är en mötesanteckning. Inget avtal eller någon bokning skapas.</p></div></div><div class="meeting-bottom"><p>Samla jämförelsen och era anteckningar i ett underlag.</p><div class="meeting-actions"><button class="btn outlined" id="exportBottom">Spara underlag</button><button class="btn primary" id="shareBottom">Dela till kund <svg><use href="#arrow"/></svg></button></div></div></section>
<footer><div class="footer-brand"><img src="/brand/kraftringen-logo.svg" width="180" height="31" alt="Kraftringen"><span>Kundrummet · En tydligare dialog om el.</span></div><p>Koncept för Kraftringen B2B · Delas med behöriga användare.<br>Uppgifter sparas lokalt i din webbläsare och synkas inte mellan enheter.</p><button class="text-btn" id="appInfo">Appinformation</button><button class="text-btn" id="resetRoom">Återställ till filens värden</button></footer>
</main>
<nav class="app-nav" aria-label="Appmeny"><a href="#home" data-mobile-target="home" aria-current="page"><svg viewBox="0 0 24 24"><path d="m3 10 9-7 9 7v11h-7v-7h-4v7H3z"/></svg><span>Hem</span></a><a href="#explore" data-mobile-target="explore"><svg viewBox="0 0 24 24"><path d="M5 20V11m7 9V4m7 16V8"/></svg><span>Jämför</span></a><a href="#profile" data-mobile-target="profile"><svg viewBox="0 0 24 24"><path d="m13 2-9 12h7l-1 8 10-13h-8z"/></svg><span>Elprofil</span></a><a href="#meeting" data-mobile-target="meeting"><svg viewBox="0 0 24 24"><path d="M4 4h16v13H9l-5 4zM8 8h8m-8 5h5"/></svg><span>Mötet</span></a></nav>
<dialog id="mobileControlsDialog" aria-labelledby="mobileControlsTitle"><div class="dialog-head"><div><p class="eyebrow">PROVA & JÄMFÖR</p><h2 id="mobileControlsTitle">Er balans.</h2></div><button class="close" data-close aria-label="Stäng">×</button></div><div id="mobileLiveResult" class="mobile-live-result" role="status" aria-live="polite"></div><div id="mobileControlsSlot"></div><button id="mobileApplyControls" class="mobile-share-button">Visa jämförelsen <svg viewBox="0 0 24 24"><use href="#arrow"/></svg></button></dialog>
<dialog id="installDialog" aria-labelledby="installTitle"><div class="dialog-head"><div class="install-heading"><img src="/icons/kundrum-192.png" width="58" height="58" alt=""><div><p class="eyebrow">KUNDRUMMET SOM APP</p><h2 id="installTitle">Ett tryck bort.</h2></div></div><button class="close" data-close aria-label="Stäng">×</button></div><p id="installDescription">Lägg Kundrummet på hemskärmen eller i datorns appmeny. Appen öppnas i ett eget fönster.</p><button class="btn primary install-confirm" id="nativeInstall" hidden>Installera Kundrummet</button><p class="form-message" id="installStatus" role="status" aria-live="polite"></p><div id="installGuide"><div class="install-platforms" role="group" aria-label="Välj enhet"><button data-platform="desktop" aria-pressed="true">Dator</button><button data-platform="ios" aria-pressed="false">iPhone / iPad</button><button data-platform="android" aria-pressed="false">Android</button></div><ol id="installSteps"></ol><p class="install-tip" id="installTip"></p></div><div class="install-facts"><p><strong>Privat och uppkopplad.</strong> Internet behövs när du öppnar appen. Logga in med ditt ChatGPT-konto om du blir ombedd.</p><p><strong>Dina uppgifter.</strong> Förbrukning och anteckningar sparas lokalt och synkas inte mellan enheter. Om uppgifterna inte följer med till appen: välj Spara underlag → Spara redigerbart kundrum i den gamla vyn. Importera sedan filen via Ange förbrukning → Jag har månadsvärden → Välj fil.</p></div></dialog>
<dialog id="profileDialog"><form id="profileForm"><div class="dialog-head"><div><p class="eyebrow">ANPASSA KUNDRUMMET</p><h2 id="profileTitle">Månadsförbrukning (kWh)</h2></div><button type="button" class="close" data-close aria-label="Stäng">×</button></div><label for="customer">Företagsnamn<input id="customer" required maxlength="120" autocomplete="organization"></label>
<div class="profile-entry-mode" role="group" aria-label="Hur vill du ange förbrukningen?"><button type="button" data-profile-mode="monthly" aria-pressed="true">Jag har månadsvärden</button><button type="button" data-profile-mode="annual" aria-pressed="false">Jag vet bara årsförbrukningen</button></div>
<section id="annualProfilePanel" aria-labelledby="annualProfileTitle" hidden>
<h3 id="annualProfileTitle">Utgå från hela årets förbrukning</h3>
<div class="annual-entry"><label for="annualConsumption">Årsförbrukning<input id="annualConsumption" type="text" inputmode="decimal" maxlength="24" placeholder="Till exempel 150 000" aria-describedby="annualUnitHelp annualProfileError"></label><label for="annualUnit">Enhet<select id="annualUnit"><option value="kwh">kWh</option><option value="mwh">MWh</option></select></label></div>
<p class="annual-unit-help" id="annualUnitHelp">1 MWh = 1 000 kWh. Ange förbrukningen för alla 12 månader.</p>
<fieldset class="profile-shapes"><legend>När används mest el?</legend>
<label><input type="radio" name="profileShape" value="winter" checked><span><strong>Vintertung</strong><small>65 % oktober–mars</small></span></label>
<label><input type="radio" name="profileShape" value="summer"><span><strong>Sommartung</strong><small>65 % april–september</small></span></label>
<label><input type="radio" name="profileShape" value="even"><span><strong>Jämn över året</strong><small>Lika mycket varje månad</small></span></label></fieldset>
<p class="annual-assumption">Fördelningen är en uppskattning med schablon. Den visar inte kundens uppmätta månadsförbrukning. Du kan justera månadsvärdena efter att profilen har sparats.</p>
<p class="form-message error" id="annualProfileError" role="alert" hidden></p>
<div class="annual-preview" id="annualPreview" hidden><p id="annualPreviewSummary" role="status" aria-live="polite"></p><p id="annualPeriodNote"></p><details><summary>Visa månadsfördelningen (kWh)</summary><table><thead><tr><th>Månad</th><th>Andel av året</th><th>kWh</th></tr></thead><tbody id="annualPreviewRows"></tbody></table></details></div>
</section>
<div id="monthlyEntryPanel"><div class="import-area"><div><strong>Importera månadsförbrukning</strong><p>CSV med månad och kWh för valt år, eller ett sparat kundrum (JSON). Tomma månader betyder att förbrukning saknas.</p></div><label class="btn outlined file-label">Välj fil<input type="file" id="profileFile" accept=".csv,.txt,.json" aria-label="Välj profilfil"></label><button type="button" id="downloadTemplate" class="text-btn">Hämta CSV-mall ↓</button></div><p class="consumption-unit-note" id="consumptionUnitNote"><strong>Ange månadsförbrukningen i kWh.</strong><br>1 MWh = 1 000 kWh. Exempel: 10 MWh anges som 10 000.</p><div class="month-grid" id="monthInputs"></div></div><div class="profile-dialog-total" id="profileDialogTotalRow">Total förbrukning (kWh) <strong id="dialogTotal"></strong></div><p id="importStatus" class="form-message" role="status"></p><div class="dialog-actions"><button type="button" class="btn light" data-close>Avbryt</button><button type="submit" class="btn primary" id="applyProfile"><span id="applyProfileText">Använd förbrukning</span> <svg><use href="#check"/></svg></button></div></form></dialog>
<dialog id="purchasesDialog" aria-labelledby="purchasesTitle" aria-describedby="portfolioIntro">
<div class="dialog-head"><div><p class="eyebrow">ELPRISET, STEG FÖR STEG</p><h2 id="purchasesTitle">Så fungerar er portfölj.</h2></div><button type="button" class="close" data-close aria-label="Stäng portföljförklaringen" autofocus>×</button></div>
<div class="purchase-content">
<p class="portfolio-intro" id="portfolioIntro">Vi gör prisavtal i förväg för en del av er planerade elanvändning. Det kallas att prissäkra.</p>
<div class="portfolio-tabs" role="tablist" aria-label="Förstå portföljen"><button type="button" role="tab" id="portfolioSimpleTab" aria-controls="portfolioSimple" aria-selected="true" data-portfolio-tab="simple">Kort förklarat</button><button type="button" role="tab" id="portfolioTimelineTab" aria-controls="portfolioTimeline" aria-selected="false" tabindex="-1" data-portfolio-tab="timeline">Följ säkringarna</button></div>
<section id="portfolioSimple" role="tabpanel" aria-labelledby="portfolioSimpleTab" tabindex="0">
<div class="portfolio-lead"><span class="portfolio-kicker">IDÉN PÅ 20 SEKUNDER</span><h3>Lite i taget.<br>Över längre tid.</h3><p>Vi sprider prisavtalen över många dagar. Då avgör inte priset en enda dag hela säkringen. Det ger mer förutsägbarhet, men garanterar inte lägst pris.</p></div>
<ol class="portfolio-steps">
<li><span aria-hidden="true">1</span><div><h3>Vi planerar tillsammans.</h3><p>Vi uppskattar hur mycket el ni kommer att använda varje månad och bestämmer hur stor del som ska prissäkras.</p></div></li>
<li><span aria-hidden="true">2</span><div><h3>Vi säkrar en liten del i taget.</h3><p>I upplägget här börjar vi två år före leverans. Vi gör nya prisavtal på handelsdagar och är klara fyra månader före leverans.</p></div></li>
<li><span aria-hidden="true">3</span><div><h3>Ni använder el som vanligt.</h3><p>Elkostnaden räknas på när och hur mycket el ni använder. Sedan dras pengar av eller läggs till från prisavtalen. Övriga kostnader tillkommer.</p></div></li>
</ol>
<article class="portfolio-share"><span class="portfolio-kicker">VAD BETYDER 80 PROCENT?</span><div class="portfolio-share-number">80 <span>av 100 kWh</span></div><p>Om ni planerar att använda 100 kWh har vi i det här exemplet gjort prisavtal för 80 kWh. De sista 20 kWh saknar prissäkring.</p><p class="portfolio-share-rule"><strong>80 % gäller mängden el.</strong><br>Det betyder inte att 80 % av hela fakturan är låst.</p></article>
<article class="portfolio-demo" aria-labelledby="portfolioDemoTitle"><span class="portfolio-kicker">ETT FÖRENKLAT RÄKNEEXEMPEL</span><h3 id="portfolioDemoTitle">Vad gör ett prisavtal?</h3><p>Vi har avtalat <strong>70 öre för en säkrad kWh</strong>. Se vad som händer med just den delen.</p>
<div class="portfolio-demo-options" role="group" aria-label="Välj marknadsläge"><button type="button" data-price-example="high" aria-pressed="true">Priset stiger</button><button type="button" data-price-example="low" aria-pressed="false">Priset sjunker</button></div>
<div class="portfolio-equation" id="portfolioExampleResult" role="status" aria-live="polite" aria-atomic="true"><div><span>Marknadens snittpris</span><strong id="portfolioSpot">100 öre</strong></div><div><span id="portfolioAdjustmentLabel">Prisavtalet ger tillbaka</span><strong id="portfolioAdjustment">−30 öre</strong></div><div class="portfolio-equation-total"><span>Efter prisavtalet</span><strong id="portfolioNet">70 öre</strong></div></div>
<p class="portfolio-demo-note"><strong>Det här är inte hela kundpriset.</strong> Vi räknar på samma mängd el och samma period, mot elområdets snittpris. När ni använder el och andra kostnader påverkar fortfarande slutpriset.</p></article>
<section class="portfolio-remaining" aria-labelledby="portfolioRemainingTitle"><span class="portfolio-kicker">DET HÄR FINNS KVAR</span><h3 id="portfolioRemainingTitle">Vad kan fortfarande ändra priset?</h3><div class="portfolio-cost-list">
<article><span class="portfolio-cost-symbol" aria-hidden="true">◷</span><div><h4>När ni använder el.</h4><p>El kan vara dyrare på morgonen än på natten. Använder ni mest el när den är dyr blir ert snittpris högre. Mönstret kallas er förbrukningsprofil. Den prissäkras inte här och påverkar hela förbrukningen.</p></div></article>
<article><span class="portfolio-cost-symbol" aria-hidden="true">↕</span><div><h4>Hur mycket el ni använder.</h4><p>Säkrar vi 80 kWh men ni använder 120 kWh, är cirka 67 % säkrat. Mängden som redan säkrats ändras inte automatiskt.</p></div></article>
<article><span class="portfolio-cost-symbol" aria-hidden="true">≈</span><div><h4>Kostnader för handel och balans.</h4><p>Det kostar att handla el och hantera skillnader mellan planerad och faktisk användning. Avgifter och balanskostnader kan ändras.</p></div></article>
<article><span class="portfolio-cost-symbol" aria-hidden="true">+</span><div><h4>Elcertifikat och elens ursprung.</h4><p>Elcertifikat och ursprungsgarantier är separata kostnader. De låses inte av prisavtalen för elen.</p></div></article>
</div><p class="portfolio-reminder">Det här gäller även när säkringarna är färdiga. Ni har då säkrat en del av elens pris, men inte hela slutpriset.</p></section>
<button type="button" class="portfolio-next" id="portfolioShowTimeline">Se hur säkringarna byggs upp <span aria-hidden="true">→</span></button>
<details class="portfolio-details"><summary>Lite mer om prisavtalen och avgifterna</summary><p><strong>Vi reserverar inte fysisk el.</strong> Prisavtalen är finansiella avtal: de räknas av i pengar. De ger ingen garanti mot strömavbrott.</p><p><strong>SYS + EPAD:</strong> SYS gäller det gemensamma nordiska systempriset. EPAD gäller skillnaden till ert elområde. Tillsammans säkrar de områdets genomsnittliga prisnivå för avtalad mängd och period. De säkrar inte automatiskt er förbrukningsprofil.</p><p><strong>Svenska kraftnät och eSett:</strong> vissa avgifter bestäms av Svenska kraftnät och debiteras genom eSett. De är därför inte alltid två olika kostnader. Kostnaden för obalanser och avgifter för handel och avräkning tillkommer enligt ert avtal.</p><p><strong>Påslag och valuta:</strong> vårt påslag följer avtalet och kan vara fast. Terminerna handlas i euro. Om valutarisken inte säkras eller tas över av leverantören kan även valutakursen påverka priset.</p><p><strong>Utanför prissäkringen:</strong> elnät, energiskatt och moms. Ert avtal avgör vilka övriga kostnader som är fasta eller rörliga.</p><p class="portfolio-sources">Läs mer: <a href="https://www.kraftringen.se/foretag/el/vara-elavtal/portfoljforvaltning/" target="_blank" rel="noopener noreferrer">Kraftringens portföljavtal ↗</a> · <a href="https://www.kraftringen.se/globalassets/kraftringen/media/dokument-gammalt/avtalsvillkor/elhandel/naringsidkare/avtalsvillkor-keab-portfoljforvaltning-2025-02-19.pdf" target="_blank" rel="noopener noreferrer">Avtalsvillkor ↗</a> · <a href="https://live.euronext.com/en/resources/contracts-specifications/power-derivatives-futures-epad" target="_blank" rel="noopener noreferrer">Terminskontrakt ↗</a> · <a href="https://www.svk.se/en/stakeholders-portal/electricity-market/balance-responsibility/balance-responsibility-agreement/" target="_blank" rel="noopener noreferrer">Avgifter för balansansvar ↗</a></p></details>
</section>
<section id="portfolioTimeline" role="tabpanel" aria-labelledby="portfolioTimelineTab" tabindex="0" hidden>

<p class="purchase-disclosure" id="purchaseDisclosure"><strong>Se hur prisavtalen blir fler, dag för dag.</strong> Vi börjar två år före leverans och är klara fyra månader före. Helger och röda dagar är pausdagar i exemplet. Detta visar arbetssättet, inte era verkliga säkringar.</p>
<p class="purchase-period" id="purchasePeriod"></p>
<div class="purchase-visual">
<div class="purchase-visual-top"><span id="purchaseTime">1 jan 2026</span><span class="purchase-target">Exemplets mål: 80 %</span></div>
<div class="purchase-numbers"><div><strong id="purchasePercent">0 %</strong><span>Säkrad volym</span></div><div><strong id="purchaseMarket">100 %</strong><span>Osäkrad volym</span></div></div>
<div class="purchase-blocks" aria-hidden="true"><span class="purchase-block"><i></i></span><span class="purchase-block"><i></i></span><span class="purchase-block"><i></i></span><span class="purchase-block"><i></i></span><span class="purchase-block"><i></i></span><span class="purchase-block"><i></i></span><span class="purchase-block"><i></i></span><span class="purchase-block"><i></i></span><span class="purchase-block"><i></i></span><span class="purchase-block"><i></i></span></div>
<div class="purchase-block-caption"><span>En ruta = 10 % av planerad volym</span><span id="purchaseCount">0 dagar med ny säkring</span></div>
<div class="purchase-day-status"><strong id="purchaseDayStatus"></strong><span id="purchaseDayAmount"></span></div>
</div>
<p class="purchase-limit"><strong>Stapeln visar mängden el som prissäkrats.</strong> Förbrukningsprofil och andra kostnader kan fortfarande ändra slutpriset – även för den säkrade delen.</p>
<div class="purchase-week-heading"><span>Veckans säkringar</span><small>• Ny säkring &nbsp; – Paus</small></div>
<div class="purchase-week" role="group" aria-label="Dagar i den valda veckan"><button type="button" data-purchase-day="0"><small>Mån</small><b></b><span aria-hidden="true"></span></button><button type="button" data-purchase-day="1"><small>Tis</small><b></b><span aria-hidden="true"></span></button><button type="button" data-purchase-day="2"><small>Ons</small><b></b><span aria-hidden="true"></span></button><button type="button" data-purchase-day="3"><small>Tor</small><b></b><span aria-hidden="true"></span></button><button type="button" data-purchase-day="4"><small>Fre</small><b></b><span aria-hidden="true"></span></button><button type="button" data-purchase-day="5"><small>Lör</small><b></b><span aria-hidden="true"></span></button><button type="button" data-purchase-day="6"><small>Sön</small><b></b><span aria-hidden="true"></span></button></div>
<div class="purchase-timeline"><label for="purchaseTimeline">Dra framåt och följ säkringarna</label><p>24 månader före → färdigbyggd 4 månader före → leverans.</p><input id="purchaseTimeline" type="range" min="0" max="730" step="1" value="0" aria-describedby="purchaseDisclosure">
<p class="purchase-quick-label">Hoppa i tiden</p><div class="purchase-milestones" role="group" aria-label="Välj tidpunkt i exemplet"><button type="button" data-purchase-step="0" aria-pressed="false"><b></b><small></small></button><button type="button" data-purchase-step="1" aria-pressed="false"><b></b><small></small></button><button type="button" data-purchase-step="2" aria-pressed="false"><b></b><small></small></button><button type="button" data-purchase-step="3" aria-pressed="false"><b></b><small></small></button><button type="button" data-purchase-step="4" aria-pressed="false"><b></b><small></small></button></div>
<div class="purchase-playback"><button type="button" id="purchasePrevious" aria-label="Föregående dag" disabled><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg></button><button type="button" id="purchasePlay" aria-pressed="false">Spela upp</button><button type="button" id="purchaseNext" aria-label="Nästa dag"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 6 6 6-6 6"/></svg></button></div>
</div>
<div class="purchase-explanation"><p class="purchase-event" id="purchaseEvent">Före första säkringen</p><h3 id="purchaseStageTitle">Vi börjar med hela volymen öppen.</h3><p id="purchaseStageText">Inga prisavtal har gjorts i exemplet.</p></div>
<p class="purchase-sr-only" id="purchaseStatus" role="status" aria-live="polite" aria-atomic="true"></p>
<details class="purchase-notes"><summary>Om det här exemplet</summary><p>Exemplet har målet 80 % av en oförändrad, planerad mängd el. Vi lägger till lika stora prissäkringar varje handelsdag. Verkliga säkringar kan se annorlunda ut. Inköpsperioden från 24 till 4 månader före leverans följer upplägget som beskrivs här.</p><p>Kalendern pausar på helger och svenska röda dagar. Även midsommar-, jul- och nyårsafton är pausdagar i exemplet. Den verkliga handelskalendern kan skilja sig. <a href="https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/lag-1989253-om-allmanna-helgdagar_sfs-1989-253/" target="_blank" rel="noopener noreferrer">Svenska helgdagar ↗</a></p><p>Uppspelningen visar tiden i snabb takt. Använd pilarna eller veckodagarna för att gå en dag i taget. För att visa just era säkringar behövs bekräftade affärer, mängder, leveransperioder och aktuell förbrukningsprognos.</p></details>
<p class="purchase-footnote">Exemplet ändrar inte säkringsgraden i er prisjämförelse.</p>
</section>
</div></dialog>
<dialog id="shareDialog" aria-labelledby="shareTitle"><div class="dialog-head"><div><p class="eyebrow">FRÅN MÖTE TILL KUND</p><h2 id="shareTitle">Dela till kund.</h2></div><button type="button" class="close" data-close aria-label="Stäng">×</button></div>
<p class="share-intro">Jämförelsen, förklaringen och era nästa steg – samlat i ett mejl.</p>
<form id="shareForm"><div class="share-fields"><label for="shareCustomerName">Kontaktperson <span>(valfritt)</span><input id="shareCustomerName" maxlength="100" autocomplete="off" placeholder="Till exempel Anna"></label><label for="shareCustomerEmail">Kundens mejladress<input id="shareCustomerEmail" type="email" required maxlength="254" autocomplete="off" placeholder="namn@foretag.se"></label><label for="shareSellerName">Säljarens namn<input id="shareSellerName" required maxlength="100" autocomplete="name"></label></div>
<label class="share-notes-choice"><input type="checkbox" id="shareIncludeNotes" checked><span id="shareNotesLabel">Ta med säljarens anteckningar</span></label>
<div class="share-preview-heading"><strong>Så här ser kundens mejl ut</strong><span id="shareYear"></span></div><div class="share-subject"><span>Ämne</span><strong id="shareSubject"></strong></div><div id="emailPreview" class="email-preview" tabindex="0" aria-label="Förhandsvisning av kundmejlet"></div>
<div class="share-delivery"><strong>Skicka från ditt vanliga mejlprogram</strong><p>Mejlet kopieras och ditt mejlprogram öppnas med mottagare och ämne. Klistra in texten och klicka Skicka där. Direktutskick från kundrummet är inte anslutet.</p></div>
<p id="shareStatus" class="form-message" role="status" aria-live="polite"></p><div class="share-actions"><button type="button" class="btn outlined" id="copyCustomerEmail">Kopiera mejlet</button><button type="button" class="btn outlined" id="downloadCustomerEmail">Hämta mejlfil (.eml)</button><button type="submit" class="btn primary" id="openCustomerEmail">Kopiera &amp; öppna mejl <svg><use href="#arrow"/></svg></button></div><p class="share-file-help">Mejlfilen innehåller hela det formaterade mejlet för ett mejlprogram som stöder .eml. Inget skickas automatiskt.</p>
</form></dialog>
<dialog id="exportDialog"><div class="dialog-head"><div><p class="eyebrow">ERT MÖTESUNDERLAG</p><h2>Ta med samtalet.</h2></div><button class="close" data-close aria-label="Stäng">×</button></div><p>Underlaget innehåller valt år, månadsförbrukning, säkringsgrad, antaganden och era nästa steg.</p><button class="export-option" id="printReport"><span><strong>Skriv ut / spara som PDF</strong><small>Öppnar webbläsarens utskriftsvy.</small></span><svg><use href="#arrow"/></svg></button><button class="export-option" id="downloadRoom"><span><strong>Spara redigerbart kundrum</strong><small>JSON-fil som kan importeras i kundrummet igen.</small></span><svg><use href="#download"/></svg></button><button class="export-option" id="downloadCalculation"><span><strong>Hämta månadsberäkning</strong><small>CSV-fil med antaganden och resultat.</small></span><svg><use href="#download"/></svg></button><p class="export-note">Rummet är privat. En länk till sidan delar inte dina lokalt sparade uppgifter.</p></dialog>
<dialog id="resetDialog"><div class="dialog-head"><h2>Återställ till filens värden?</h2><button class="close" data-close aria-label="Stäng">×</button></div><p>Din lokala profil och dina anteckningar ersätts med filens värden. Spara ett redigerbart kundrum först om du vill behålla dem.</p><div class="dialog-actions"><button class="btn light" data-close>Avbryt</button><button class="btn primary" id="confirmReset">Återställ</button></div></dialog>
<div id="toast" role="status" aria-live="polite"></div><section id="printArea"></section><script type="module" src="app.mjs"></script><script type="module">import {initPurchases} from "./purchases.mjs";initPurchases();</script>
</body></html>

````

## Fil: public/index.html

````text
<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#013c57"><meta name="apple-mobile-web-app-capable" content="yes"><title>Kraftringen · Kundrummet</title><link rel="icon" href="/icons/kundrum.svg"><link rel="apple-touch-icon" href="/icons/kundrum-180.png"><link rel="manifest" href="/manifest.webmanifest" crossorigin="use-credentials"><link rel="stylesheet" href="/meeting-flow.css"><link rel="stylesheet" href="/customer-agreement.css"></head><body>
<header class="top"><a href="/" aria-label="Kundrummet startsida"><img src="/brand/kraftringen-logo.svg" alt="Kraftringen" width="180" height="31"><small class="room-name">Kundrummet</small></a><span>Kundrummet <small>FÖRETAG</small></span><a href="/stories.html">Kundröster ↗</a></header>
<main><nav class="steps" aria-label="Mötets steg">
<button data-step="1" aria-current="step"><span class="step-number">1</span><span class="step-label">Kund &amp; förbrukning</span><span class="step-short">Kund</span></button>
<button data-step="2"><span class="step-number">2</span><span class="step-label">Välj avtal</span><span class="step-short">Avtal</span></button>
<button data-step="3"><span class="step-number">3</span><span class="step-label">Se jämförelsen</span><span class="step-short">Jämför</span></button>
<button data-step="4"><span class="step-number">4</span><span class="step-label">Sammanfatta</span><span class="step-short">Avslut</span></button></nav>
<section id="step1"><p class="eyebrow">STEG 1 AV 4 · ER VERKSAMHET</p><h1>Hur ser ert elbehov ut?</h1><p class="lead">Välj bransch och lägg in förbrukningen. Sedan tittar vi på avtalet tillsammans.</p>
<form id="profileForm"><div class="sheet"><div class="form-grid"><label>Företag / kund<input id="customer" maxlength="120" placeholder="Kundens namn" required autocomplete="organization"></label><label>Bransch<select id="business"><option value="company">Företag</option><option value="brf">BRF</option><option value="hotel">Hotell</option><option value="industry">Industri</option><option value="farm">Lantbruk</option><option value="shop">Butik</option><option value="transport">Transport och logistik</option><option value="property">Fastigheter</option><option value="other">Annan verksamhet</option></select></label></div><label class="need-field">Vad vill ni uppnå med ert elavtal?<textarea id="goal" maxlength="1000" rows="2" placeholder="T.ex. en mer förutsägbar budget eller mindre tid på elinköp."></textarea></label>
<div class="section-line"><h2>Förbrukning</h2><div class="segments" id="profileYears" aria-label="År för förbrukning" hidden><button type="button" data-profile-year="2025" aria-pressed="true">2025</button><button type="button" data-profile-year="2026" aria-pressed="false">2026</button></div></div>
<p class="muted" id="profileModeHint">Ange förbrukningen en gång. Samma årsvolym och månadsfördelning används för 2025 och 2026.</p>
<label class="mode-toggle"><input id="differentYears" type="checkbox"><span>Ange olika förbrukning per år</span></label>
<div id="sharedChoice" class="notice" hidden><p>Åren har olika profiler. Välj vilken som ska användas för båda åren.</p><div class="shared-actions"><button type="button" class="secondary" data-share-year="2025">Använd 2025</button><button type="button" class="secondary" data-share-year="2026">Använd 2026</button><button type="button" class="text-button" id="keepSeparate">Behåll olika profiler</button></div></div>
<div class="annual"><label>Årsförbrukning<input id="annual" inputmode="decimal" placeholder="T.ex. 200 000"></label><label>Enhet<select id="unit"><option value="kwh">kWh</option><option value="mwh">MWh</option></select></label><label>Fördelning<select id="shape"><option value="even">Jämn över året</option><option value="winter">Vintertung</option><option value="summer">Sommartung</option></select></label><button type="button" id="applyAnnual" class="secondary">Fördela på månader</button></div>
<p id="profileError" class="error" role="alert" hidden></p><p id="profileStatus" class="profile-status" aria-live="polite"></p>
<button type="button" id="copyYear" class="text-button" hidden>Använd samma förbrukning för 2026</button>
<details id="monthlyDetails"><summary>Se eller ändra månadsvärden</summary><p class="muted">kWh per månad. Tomt fält betyder att uppgift saknas. Noll betyder ingen förbrukning.</p><div id="monthInputs" class="month-grid"></div></details>
<details><summary>Importera månadsvärden</summary><p class="muted">Klistra in månad och kWh, separerade med semikolon. Exempel: Jan;10000</p><textarea id="csvInput" rows="4" aria-label="Månadsvärden i CSV-format" placeholder="Månad;kWh&#10;Jan;10000&#10;Feb;12000"></textarea><button type="button" id="importCsv" class="secondary">Läs in för båda åren</button><button type="button" id="loadPrevious" class="text-button">Hämta tidigare kundrum</button></details>
</div><div class="actions"><button class="primary" type="submit">Vidare till avtalsval <span>→</span></button></div></form></section>
<section id="step2" hidden><p class="eyebrow">STEG 2 AV 4 · AVTALSVAL</p><h1>Vilket avtal vill vi gå vidare med?</h1><p class="lead">Vi utgår från era behov och väljer ett upplägg att undersöka tillsammans.</p><p class="context" id="customerContext"></p>
<div class="sheet"><h2>Vilket upplägg passar era behov?</h2><p id="agreementGoal" class="need-summary"></p><div id="contractCards" class="contract-grid" role="group" aria-label="Välj avtal"></div><div id="contractDescription" hidden></div><label class="need-field">Därför föreslår vi detta upplägg<textarea id="recommendation" maxlength="2000" rows="2" placeholder="Koppla förslaget till det som är viktigt för er."></textarea></label><h2>Period att jämföra</h2><div class="segments years" aria-label="Jämförelseperiod"><button data-period="2025" aria-pressed="true">2025</button><button data-period="2026" aria-pressed="false">2026</button><button data-period="both" aria-pressed="false">Båda åren</button></div><p id="coverageNote" class="muted"></p>
<div id="manualFields" class="price-fields" hidden><label id="manualLabel" for="manualPrice">Pris, öre/kWh</label><input id="manualPrice" type="number" min="0" max="500" step="any" inputmode="decimal" placeholder="Ange pris"><p class="muted" id="manualScenario"></p><p class="muted">Ange hela elhandelspriset för jämförelsen, inklusive avtalets påslag och övriga elhandelstillägg, exklusive moms, elnät och energiskatt. Inga tillägg läggs på automatiskt. Samma pris används för alla valda månader.</p></div>
<div id="portfolioFields" class="price-fields" hidden><label for="hedge">Säkrad volym <strong id="hedgeOutput">80 %</strong></label><input id="hedge" type="range" min="0" max="100" value="80"><label>Portföljpåslag, öre/kWh<input id="portfolioFee" type="number" min="0" max="100" step="any" inputmode="decimal"></label><p class="muted">Individuell portfölj, Pool Offensiv och Pool Trygg använder samma historiska prisunderlag i den här illustrationen. Samma säkringsgrad och påslag ger samma utfall. Detta visar inte skillnader i avtalens villkor.</p></div>
<details id="referenceSettings"><summary>Påslag för kvartsprisreferensen</summary><label>Påslag kvartspris, öre/kWh<input id="variableFee" type="number" min="0" max="100" step="any" inputmode="decimal"></label><p class="muted">Vi använder underlagets rörliga månadspriser och kostnadstillägg. Det är inte en beräkning från era kvartsmätvärden.</p></details></div>
<section id="customerAgreement" class="sheet"></section>
<p id="agreementError" class="error" role="alert" hidden></p><div class="actions"><button class="secondary" data-back="1">← Förbrukning</button><button id="showComparison" class="primary">Visa jämförelsen →</button></div></section>
<section id="step3" hidden>
<p class="eyebrow">STEG 3 AV 4 · JÄMFÖRELSEN</p><h1 id="resultTitle">Er jämförelse</h1><p class="lead" id="resultContext"></p><div id="result"></div>
<details class="deeper"><summary>Fördjupad portföljanalys</summary><p>Följ hur prissäkringen byggs upp och se portfölj mot rörligt, ett år i taget.</p><a href="/details.html" id="openDetails">Öppna fördjupningen</a></details>
<div class="actions step-actions"><button class="secondary" data-back="2">← Ändra avtalsval</button><button class="primary" id="showClosing">Sammanfatta mötet →</button></div></section>
<section id="step4" hidden>
<p class="eyebrow">STEG 4 AV 4 · SAMMANFATTNING</p><h1>Det här tar vi vidare.</h1><p class="lead">Samla det viktigaste från samtalet och ta med ett färdigt underlag.</p>
<div id="closingOverview"></div>
<div class="closing-grid"><div class="sheet meeting-notes"><p class="eyebrow">FRÅN SAMTALET</p><h2>Vad blir nästa steg?</h2>
<label>Det här behöver vi kontrollera<textarea id="checks" maxlength="2000" rows="2" placeholder="T.ex. månadsprofil, avgifter och villkor i offerten."></textarea></label>
<label>Nästa steg<input id="next" maxlength="1000" placeholder="T.ex. Vi stämmer av offert och villkor på fredag."></label>
<div class="form-grid"><label>Vem ansvarar?<input id="owner" maxlength="100" placeholder="Namn och ansvar"></label><label>När följer vi upp?<input id="followUp" type="date" min="0001-01-01" max="9999-12-31"></label></div>
<label>Mötesanteckningar <span class="optional">Valfritt</span><textarea id="notes" maxlength="10000" rows="3" placeholder="Det vi pratade om och vill ta vidare …"></textarea></label>
<label>Er kontakt<input id="seller" maxlength="100" autocomplete="name"></label>
<p class="muted meeting-disclaimer">Avtalsvalet dokumenterar samtalet. Inget avtal tecknas här.</p></div>
<div class="closing-aside"><div id="meetingStories"></div></div></div>
<div class="sheet handoff-card"><div class="handoff-heading"><div><p class="eyebrow">UNDERLAG ATT TA MED</p><h2>Hela mötet i en PDF</h2><p class="muted">Era behov, föreslaget upplägg, jämförelse, nästa steg och två kundröster.</p></div><button class="primary" id="saveSummary">Skapa PDF</button></div>
<p id="summaryStatus" class="export-status" role="status" hidden></p><div id="pdfActions" hidden><h3>Din PDF är klar</h3><p class="muted">Avtalsförklaringen följer med automatiskt. Öppna PDF visar filen i samma flik. Använd Tillbaka för att återgå till mötet.</p><div class="actions"><a id="summaryDownload" class="text-button" download="Kundunderlag.pdf">Hämta PDF ↓</a><a id="summaryOpen" class="text-button" target="_self">Öppna PDF</a><button id="summaryShare" class="primary" type="button" hidden>Dela/spara</button></div><details class="download-help"><summary>Hjälp att spara på mobilen</summary><p class="muted">På iPhone: välj Dela/spara → Spara i Filer. Om knappen saknas kan du öppna PDF:en och använda PDF-visarens delningsknapp. Om du använder en inbyggd webbläsare och inget händer, öppna kundrummet i Safari.</p></details></div></div>
<div class="actions step-actions"><button class="secondary" data-back="3">← Till jämförelsen</button><span class="closing-hint">Kunden kan läsa PDF:en utan inloggning.</span></div></section>
<p id="saveNote" class="save-note" role="status">Mötesutkastet sparas i den här webbläsaren. Prisbanken delas med teamet.</p>
<footer><span>Kraftringen · Kundrummet</span><a href="/stories.html">Kundröster</a><a href="https://kundrum-radgivning.rosen123.chatgpt.site/" target="_blank" rel="noopener">Rådgivarrummet ↗</a><button id="newMeeting" class="text-button">Nytt kundmöte</button></footer></main><script type="module" src="/meeting-flow.mjs"></script></body></html>

````

## Fil: public/install.css

````text
[hidden]{display:none!important}
.app-install-bar{display:flex;align-items:center;gap:15px;background:#edf2e7;border:1px solid #dbe4d1;border-radius:10px;padding:17px 20px;margin-top:24px}
.app-install-bar img,.install-heading img{border-radius:12px;flex-shrink:0}
.app-install-bar>div{flex:1;min-width:0}.app-install-bar strong{font:600 14px 'Poppins',sans-serif}.app-install-bar p{font-size:11px;color:var(--muted);margin:5px 0 0;line-height:1.6}
#installDialog{max-width:560px}.install-heading{display:flex;align-items:center;gap:16px}.install-heading .eyebrow{margin-bottom:8px}.install-heading h2{font-size:25px}.install-confirm{width:100%;margin:8px 0}
.install-platforms{display:flex;gap:4px;background:#e9ede3;border-radius:8px;padding:4px;margin:22px 0 15px}.install-platforms button{flex:1;border:0;border-radius:5px;background:transparent;font-size:11px;min-height:42px;padding:8px}.install-platforms button[aria-pressed=true]{background:white;font-weight:600;box-shadow:0 2px 6px #163a3209}
#installSteps{padding-left:25px;margin:12px 0 15px;font-size:12px;line-height:1.8}#installSteps li{padding-left:5px;margin-bottom:10px}#installSteps li::marker{font-weight:700;color:var(--green)}
.install-tip{font-size:11px;color:var(--muted);line-height:1.7}.install-facts{border-top:1px solid var(--border);margin-top:20px;padding-top:5px}.install-facts p{font-size:11px;color:var(--muted);line-height:1.8;margin:13px 0 0}.install-facts strong{color:var(--ink)}
.connection-note{padding:12px 16px;border:1px solid #dfcba6;background:#fbf4e6;border-radius:7px;font-size:12px;line-height:1.6;margin:18px 0 0}.app-nav{display:none}
@media(display-mode:standalone){.header{padding-top:env(safe-area-inset-top);height:calc(80px + env(safe-area-inset-top))}.hero{padding-top:30px}html{overscroll-behavior-y:none}}
@media(max-width:560px){body{padding-bottom:calc(72px + env(safe-area-inset-bottom))}.header{padding-left:max(18px,env(safe-area-inset-left));padding-right:max(18px,env(safe-area-inset-right))}main{padding-left:max(18px,env(safe-area-inset-left));padding-right:max(18px,env(safe-area-inset-right))}.app-install-bar{padding:15px;gap:12px;flex-wrap:wrap;margin-top:20px}.app-install-bar strong{font-size:13px}.app-install-bar p{font-size:11px}.app-install-bar .btn{width:100%;min-height:44px}.app-install-bar img{width:42px;height:42px}.app-nav{display:flex;position:fixed;z-index:10;bottom:0;left:0;right:0;border-top:1px solid var(--border);background:#f7f8f3f5;backdrop-filter:blur(12px);padding:5px max(12px,env(safe-area-inset-right)) calc(5px + env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left));box-shadow:0 -5px 24px #163a3205}.app-nav a{flex:1;min-height:54px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;font-size:10px;color:var(--muted);border-radius:8px}.app-nav svg{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linejoin:round;stroke-linecap:round}.app-nav a[aria-current=location]{background:#e4edda;color:var(--ink);font-weight:600}#toast{bottom:calc(84px + env(safe-area-inset-bottom))}.install-heading{gap:12px}.install-heading img{width:46px;height:46px}.install-heading h2{font-size:22px}#installSteps{font-size:13px}.install-facts p,.install-tip{font-size:12px}.install-platforms button{font-size:11px}.install-heading .eyebrow{font-size:8px}.header+.app-nav{display:none}}
@media print{.app-install-bar,.app-nav,.connection-note{display:none!important}body{padding-bottom:0}}

````

## Fil: public/install.mjs

````text
const $=id=>document.getElementById(id);
const standalone=window.matchMedia('(display-mode: standalone)');
let installEvent=null,installedThisSession=false,installing=false;
const isApp=()=>standalone.matches||navigator.standalone===true;
const guides={
 desktop:{steps:['Öppna Kundrummet i Chrome eller Edge och logga in vid behov.','Välj installationsikonen i adressfältet, eller webbläsarens meny för att installera sidan som app.','Bekräfta installationen. Öppna sedan Kundrummet från datorns appmeny.'],tip:'På Mac i Safari: välj Arkiv → Lägg till i Dock. Om inget installationsval finns, använd Chrome eller Edge.'},
 ios:{steps:['Öppna Kundrummet i Safari och logga in vid behov.','Öppna Dela-menyn och välj Lägg till på hemskärmen.','Låt Öppna som webbapp vara aktiverat om valet visas. Tryck på Lägg till.'],tip:'Öppna sedan Kundrummet från den nya ikonen på hemskärmen.'},
 android:{steps:['Öppna Kundrummet i Chrome och logga in vid behov.','Öppna webbläsarens meny och välj Installera app eller Lägg till på startskärmen.','Bekräfta och öppna Kundrummet från den nya ikonen.'],tip:'Benämningen kan skilja mellan telefoner och webbläsare.'}
};
function showGuide(platform){
 const guide=guides[platform]??guides.desktop;
 $('installSteps').replaceChildren(...guide.steps.map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));
 $('installTip').textContent=guide.tip;
 document.querySelectorAll('[data-platform]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.platform===platform)));
}
function syncInstallUI(){
 const installed=isApp()||installedThisSession;
 $('appInstallBar').hidden=installed;
 $('nativeInstall').hidden=!installEvent||installed;
 $('nativeInstall').disabled=installing;
 $('installGuide').hidden=installed;
 $('installTitle').textContent=installed?'Kundrummet som app.':'Ett tryck bort.';
 $('installDescription').textContent=isApp()?'Du använder Kundrummet i ett eget appfönster.':installedThisSession?'Kundrummet har installerats på den här enheten. Öppna appen från din nya ikon.':'Lägg Kundrummet på hemskärmen eller i datorns appmeny. Appen öppnas i ett eget fönster.';
 document.documentElement.classList.toggle('in-app',isApp());
}
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installEvent=event;syncInstallUI();});
window.addEventListener('appinstalled',()=>{installedThisSession=true;installEvent=null;$('installStatus').textContent='Kundrummet är installerat. Du hittar det bland dina appar.';syncInstallUI();});
standalone.addEventListener('change',syncInstallUI);
for(const id of ['installApp','appInfo'])$(id).addEventListener('click',()=>{syncInstallUI();$('installDialog').showModal();});
$('nativeInstall').addEventListener('click',async()=>{
 if(!installEvent||installing)return;
 const prompt=installEvent;installEvent=null;installing=true;syncInstallUI();
 try{
  await prompt.prompt();const choice=await prompt.userChoice;
  $('installStatus').textContent=installedThisSession?'Kundrummet är installerat.':choice.outcome==='accepted'?'Installationen har godkänts. Följ webbläsarens steg för att slutföra.':'Installationen avbröts. Du kan fortfarande använda kundrummet här.';
 }catch{$('installStatus').textContent='Installationsrutan kunde inte öppnas. Använd stegen för din enhet nedan.';}
 finally{installing=false;syncInstallUI();}
});
document.querySelectorAll('[data-platform]').forEach(b=>b.addEventListener('click',()=>showGuide(b.dataset.platform)));
const ios=/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
showGuide(ios?'ios':/Android/.test(navigator.userAgent)?'android':'desktop');
const syncConnection=()=>{$('connectionNote').hidden=navigator.onLine!==false;};
window.addEventListener('online',syncConnection);window.addEventListener('offline',syncConnection);syncConnection();syncInstallUI();
const navLinks=[...document.querySelectorAll('.app-nav a')];
function selectSection(id){for(const a of navLinks){if(a.hash==='#'+id)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current');}}
let queued=false;
function updateNav(){queued=false;if(matchMedia('(max-width:700px)').matches)return;let selected='explore';for(const id of ['explore','profile','meeting'])if($(id).getBoundingClientRect().top<window.innerHeight*.4)selected=id;selectSection(selected);}
for(const a of navLinks)a.addEventListener('click',()=>{if(!matchMedia('(max-width:700px)').matches)selectSection(a.hash.slice(1));});
window.addEventListener('scroll',()=>{if(!queued){queued=true;requestAnimationFrame(updateNav);}},{passive:true});
window.addEventListener('hashchange',()=>{if(matchMedia('(max-width:700px)').matches)return;const id=location.hash.slice(1);if(['explore','profile','meeting'].includes(id))selectSection(id);});updateNav();

````

## Fil: public/manifest.webmanifest

````text
{
  "id": "/",
  "name": "Kraftringen Kundrummet",
  "short_name": "Kundrummet",
  "description": "Kundmötet steg för steg: förbrukning, bransch, avtalsval och jämförelse.",
  "lang": "sv-SE",
  "start_url": "/?launch=app",
  "scope": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#013c57",
  "prefer_related_applications": false,
  "icons": [
    {
      "src": "/icons/kundrum-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/kundrum-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/kundrum-maskable-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ],
  "shortcuts": [
    {
      "name": "Starta kundmötet",
      "short_name": "Kundmöte",
      "url": "/?launch=app"
    },
    {
      "name": "Kundberättelser",
      "short_name": "Berättelser",
      "url": "/stories.html"
    }
  ]
}

````

## Fil: public/meeting-delivery.mjs

````text
// Prepare first; file actions must run from a fresh, explicit user gesture.
export function bindPdfDelivery({button,status,actions,download,open,share,getMeeting,generate,platform=globalThis}){
 let readyFile=null,url=null,generation=0;
 const say=(message,error=false)=>{status.hidden=false;status.classList.toggle('error',error);status.textContent=message;};
 function invalidate(){generation++;readyFile=null;actions.hidden=true;status.hidden=true;}
 button.addEventListener('click',async()=>{
  if(button.disabled)return;
  const ticket=++generation,snapshot=structuredClone(getMeeting());readyFile=null;actions.hidden=true;
  button.disabled=true;button.textContent='Skapar PDF …';say('Sätter samman ert mötesunderlag. Vänta tills filen är klar.');
  try{
   const result=await generate(snapshot);
   if(ticket!==generation||JSON.stringify(snapshot)!==JSON.stringify(getMeeting())){say('Mötesuppgifterna ändrades. Tryck på Skapa PDF för ett aktuellt underlag.');return;}
   const file=new platform.File([result.bytes],result.filename,{type:'application/pdf'});
   const nextUrl=platform.URL.createObjectURL(file);if(url)platform.URL.revokeObjectURL(url);url=nextUrl;readyFile=file;
   download.href=url;download.download=result.filename;open.href=url;
   let canShare=false;try{canShare=typeof platform.navigator.share==='function'&&platform.navigator.canShare?.({files:[file]})===true;}catch{}
   share.hidden=!canShare;actions.hidden=false;
   say(`PDF klar: ${result.pageCount} sidor. Välj Hämta PDF eller Öppna PDF nedan. ${canShare?'På iPhone: välj Dela/spara och sedan Spara i Filer.':''}${result.replacedCharacters.length?' Vissa specialtecken har ersatts med frågetecken; kontrollera texten före delning.':''}`);
   download.focus({preventScroll:true});actions.scrollIntoView({behavior:'smooth',block:'nearest'});
  }catch(e){say('PDF:en kunde inte skapas. '+e.message+' Försök igen.',true);}
  finally{button.disabled=false;button.textContent='Skapa PDF';}
 });
 // No generation/fetch/await before calling share: preserve the user's activation.
 share.addEventListener('click',async()=>{
  if(!readyFile||share.disabled)return;
  share.disabled=true;
  try{await platform.navigator.share({files:[readyFile],title:readyFile.name});say('Delningsdialogen har stängts. PDF:en finns kvar här om du vill spara eller dela igen.');}
  catch(e){if(e.name==='AbortError')say('Delningen avbröts. PDF:en finns kvar; välj Hämta PDF eller Dela/spara igen.');else say('Mobilens delning kunde inte öppnas. Välj Öppna PDF och spara från PDF-visaren, eller öppna kundrummet i Safari.',true);}
  finally{share.disabled=false;}
 });
 download.addEventListener('click',()=>say('Nedladdningen har begärts. Om ingen fil visas: välj Öppna PDF, eller Dela/spara och Spara i Filer på iPhone.'));
 return {invalidate};
}

````

## Fil: public/meeting-export.mjs

````text
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function meetingDocument({meeting,branchLabel,periodLabel,resultMarkup,storyMarkup}){
 if(!storyMarkup)throw Error('Kundberättelserna saknas i underlaget.');
 return `<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mötesunderlag · ${esc(meeting.customer)}</title><style>body{max-width:900px;margin:40px auto;padding:20px;font:16px/1.6 Arial;color:#013c57}article,.sheet,.difference{border:1px solid #ddd;padding:20px;margin:16px 0}table{width:100%;border-collapse:collapse}td,th{padding:8px;text-align:left;border-bottom:1px solid #ddd}.selected-cost strong,.difference>strong{display:block;font-size:26px}.year-summary span,.year-summary small{display:block}.chart-scroll svg{width:100%;height:auto;min-width:0!important}.chart-legend{display:flex;gap:20px}.chart-legend i{display:inline-block;width:22px;border-top:3px solid #007aa3;margin-right:8px}.chart-legend .variable-line{border-color:#b84636;border-top-style:dashed}.benefits{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.benefits article{padding:14px}.comparison-table table{white-space:normal}.comparison-table th,.comparison-table td{text-align:left}.source-link{color:#013c57}.tradeoff,.conversation-prompt{background:#f3f5f7;padding:16px}.chart-sheet{break-inside:avoid}.year-saving{font-weight:bold}table{font-size:11px}@media(max-width:600px){.benefits{display:block}}@media print{details>*{display:block!important}}.export-stories{margin-top:48px}.export-story{border:0;padding:0;margin:32px 0}.export-story-intro{break-inside:avoid}.export-story h3{font-size:24px}.story-slide{margin:20px 0;break-inside:avoid}.story-slide img{display:block;width:100%;height:auto}.story-slide figcaption{font-size:12px;color:#526572;margin-top:6px}.story-draft{background:#fff7e4;border-left:3px solid #fbc34e;padding:12px 16px;font-size:13px}.eyebrow{font-size:12px;letter-spacing:.1em;text-transform:uppercase}@media print{.export-stories,.export-story+.export-story{break-before:page}.story-slide{break-inside:avoid}.story-slide img{max-height:180mm;object-fit:contain}}</style></head><body><h1>${esc(meeting.customer)}</h1><p>${esc(branchLabel)} · ${esc(periodLabel)}</p>${resultMarkup}<h2>Anteckningar</h2><p style="white-space:pre-wrap">${esc(meeting.notes)}</p><h2>Det ni vill uppnå</h2><p>${esc(meeting.goal??'')}</p><h2>Varför detta upplägg</h2><p>${esc(meeting.recommendation??'')}</p><h2>Det här behöver vi kontrollera</h2><p>${esc(meeting.checks??'')}</p><h2>Nästa steg</h2><p>${esc(meeting.next)}</p><p>Ansvarig: ${esc(meeting.owner||'Inte bestämt')} · Uppföljning: ${esc(meeting.followUp||'Inte bestämt')}</p><p>${esc(meeting.seller)} · Kraftringen</p><p>Avtalsvalet är ett samtalsunderlag. Inget avtal har tecknats.</p>${storyMarkup}</body></html>`.replaceAll('<details>','<details open>');
}

````

## Fil: public/meeting-flow.css

````text
@font-face{font-family:Poppins;src:url('/brand/fonts/poppins-400.ttf')}@font-face{font-family:Poppins;src:url('/brand/fonts/poppins-600.ttf');font-weight:600}@font-face{font-family:Poppins;src:url('/brand/fonts/poppins-700.ttf');font-weight:700}
:root{color-scheme:light;--ink:#013c57;--yellow:#fbc34e;--muted:#526572;--line:#dae3e7}*{box-sizing:border-box}[hidden]{display:none!important}body{margin:0;background:#f3f5f7;color:var(--ink);font:15px/1.65 Poppins,Arial,sans-serif}button,input,select,textarea{font:inherit;color:inherit}button,a{touch-action:manipulation}button{cursor:pointer}a{color:inherit}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,summary:focus-visible{outline:3px solid #007aa3;outline-offset:3px}.top{background:var(--ink);color:white;display:flex;align-items:center;gap:28px;padding:22px max(24px,calc((100vw - 1160px)/2));border-bottom:3px solid var(--yellow)}.top img{display:block;width:180px;height:auto}.top>span{font-weight:600;border-left:1px solid #ffffff60;padding-left:24px}.top small{display:block;font-size:9px;letter-spacing:2px}.top>a:last-child{margin-left:auto;font-size:13px;text-decoration:none}main{max-width:1100px;margin:auto;padding:24px 28px 45px}.steps{display:flex;gap:8px;margin:0 0 8px}.steps button{border:0;background:transparent;padding:12px 18px;border-radius:30px;font-size:14px;min-height:48px}.steps button span{display:inline-grid;place-items:center;width:27px;height:27px;border-radius:50%;background:#dfe7eb;margin-right:8px}.steps [aria-current]{background:var(--ink);color:white}.steps [aria-current] span{background:var(--yellow);color:var(--ink)}.save-note{font-size:11px;color:var(--muted);margin:8px 0 30px}.eyebrow{font-size:10px;font-weight:600;letter-spacing:1.6px;margin:28px 0 16px}h1{font-size:clamp(30px,4vw,44px);line-height:1.2;font-weight:600;letter-spacing:-1.3px;max-width:820px;margin:0 0 18px}h1:focus{outline:none}.lead{font-size:16px;color:var(--muted);max-width:730px;margin-bottom:32px}h2{font-size:21px;line-height:1.4;margin:0 0 18px;font-weight:600}.sheet{padding:30px;background:white;border-radius:22px;margin:22px 0}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:22px}label{display:flex;flex-direction:column;gap:8px;font-size:13px;font-weight:600}input,select,textarea{border:1px solid #beced5;border-radius:10px;background:#fff;width:100%;min-height:48px;padding:11px 12px;font-size:16px;font-weight:400}textarea{resize:vertical}.section-line{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-top:36px}.section-line h2{margin:0}.segments{display:flex;padding:4px;background:#edf2f5;border-radius:14px;gap:3px}.segments button{background:none;border:0;padding:10px 16px;min-height:44px;border-radius:10px;font-size:14px}.segments [aria-pressed=true]{background:var(--ink);color:white}.muted{font-size:12px;color:var(--muted)}.annual{display:grid;grid-template-columns:1.1fr .5fr 1fr auto;gap:12px;align-items:end;margin-top:24px}.primary,.secondary{min-height:48px;padding:12px 22px;border-radius:12px;border:1px solid var(--ink);font-size:14px;font-weight:600}.primary{background:var(--ink);color:white}.primary:hover{background:#075d78}.secondary{background:white}.text-button{background:none;border:0;padding:10px 0;min-height:44px;text-align:left;text-decoration:underline;font-size:13px}.profile-status{font-size:13px;margin-top:20px}.actions{display:flex;justify-content:flex-end;gap:14px;margin:28px 0}.actions .secondary{margin-right:auto}.error{background:#fff0ed;color:#9c301b;padding:12px;border-radius:10px}.month-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}details{border-top:1px solid var(--line);padding:18px 0;margin-top:18px}summary{cursor:pointer;min-height:36px;font-size:14px;font-weight:600}details>label{margin-top:16px;max-width:380px}details textarea{margin:14px 0}.context{font-size:13px;color:var(--muted);margin:16px 0}.years{width:max-content;max-width:100%}.contract-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:28px}.contract{position:relative;background:white;border:1px solid #bdcdd4;border-radius:15px;padding:24px 46px 24px 22px;text-align:left;min-height:135px}.contract strong{font-size:17px;display:block;margin-bottom:10px}.contract small{font-size:12px;color:var(--muted);display:block}.contract.selected{border:2px solid var(--ink);background:#f4f8f9;padding:23px 45px 23px 21px;box-shadow:inset 4px 0 var(--yellow)}.check{position:absolute;right:18px;top:23px;font-size:20px}.price-fields{background:#f1f5f7;padding:22px;border-radius:16px;margin-top:24px}.price-fields>input:not([type=range]){max-width:260px;margin-top:10px}.price-fields>label{max-width:360px}.price-fields input[type=range]{padding:0;border:0;accent-color:var(--ink)}.price-fields .muted{max-width:760px}.comparison{display:grid;grid-template-columns:1fr 1fr;gap:18px}.comparison article{background:white;padding:28px;border-radius:20px}.comparison article>p{font-size:10px;letter-spacing:1.5px;font-weight:600}.comparison article h2{font-size:20px}.comparison article>strong{font-size:clamp(25px,3vw,36px);display:block;line-height:1.3}.comparison small{font-size:18px}.comparison article>span{display:block;font-size:13px;margin-top:14px}.comparison .selected-cost{background:var(--ink);color:white}.difference{border-radius:18px;padding:24px 28px;margin-top:20px;background:#e4ecf0}.difference.lower{background:#fff1cf}.difference.higher{background:#f9dadd}.difference>span{font-size:13px}.difference>strong{font-size:32px;display:block}.difference p{font-size:13px;margin:4px 0}.basis{font-size:12px;line-height:1.8;color:var(--muted);margin:24px 0}.notice{padding:15px 20px;border-left:3px solid var(--yellow);background:#fff9ea;font-size:12px}.year-summary{display:flex;gap:40px}.year-summary span,.year-summary small{display:block}.year-summary span{font-size:23px;margin:8px 0}.year-summary small{font-size:12px;color:var(--muted)}.table-scroll{overflow:auto}table{width:100%;border-collapse:collapse;font-size:12px;white-space:nowrap}td,th{padding:12px 10px;text-align:right;border-bottom:1px solid var(--line)}th:first-child{text-align:left}caption{text-align:left;padding:15px 0;color:var(--muted)}#step3 .sheet>label{margin-top:20px}.deeper{font-size:13px}footer{display:flex;gap:24px;align-items:center;border-top:1px solid var(--line);padding-top:20px;margin-top:40px;font-size:12px;color:var(--muted)}footer button{margin-left:auto}@media(max-width:700px){.top{padding:18px 20px;gap:16px}.top img{width:137px}.top>span{display:none}.top>a:last-child{font-size:11px}main{padding:18px 16px 32px}.steps{gap:3px;justify-content:space-between}.steps button{padding:9px 10px;font-size:11px;flex:1}.steps button span{width:23px;height:23px;margin-right:3px}.sheet{padding:22px 18px;border-radius:20px}.form-grid{grid-template-columns:1fr;gap:20px}.annual{grid-template-columns:1fr 90px;gap:16px}.annual label:nth-child(3),.annual button{grid-column:1/-1}.section-line{gap:12px;flex-wrap:wrap}.month-grid{grid-template-columns:repeat(2,1fr)}.contract-grid{grid-template-columns:1fr}.contract{min-height:100px;padding:21px 44px 21px 18px}.contract.selected{padding:20px 43px 20px 17px}.contract strong{font-size:17px}.comparison{grid-template-columns:1fr}.comparison article{padding:24px}.comparison article>strong{font-size:34px}.actions{flex-wrap:wrap}.actions button{flex:1;min-width:145px}.year-summary{flex-direction:column;gap:24px}.years button{padding:10px 13px}h1{font-size:32px}.lead{font-size:14px}.save-note{font-size:10px;margin-bottom:26px}footer{flex-wrap:wrap;gap:12px}footer button{margin-left:0}input,select,textarea{font-size:16px}.price-fields{padding:18px}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}
/* One consumption profile by default; expanded annual controls are optional. */
.mode-toggle{display:flex;flex-direction:row;align-items:center;gap:12px;font-size:13px;min-height:48px;font-weight:400;margin:12px 0}.mode-toggle input{width:22px;height:22px;min-height:22px;accent-color:var(--ink);flex-shrink:0}.shared-actions{display:flex;gap:12px;flex-wrap:wrap}.shared-actions button{font-size:12px}.year-saving{margin:8px 0;font-size:15px;font-weight:600}.year-summary>div{flex:1}
.chart-header{display:flex;justify-content:space-between;align-items:center;gap:20px}.chart-header .eyebrow,.benefit-sheet>.eyebrow{margin-top:0}.chart-header h2{margin-bottom:10px}.chart-legend{display:flex;gap:20px;flex-wrap:wrap;font-size:12px;margin:18px 0}.chart-legend span{display:flex;align-items:center;gap:8px}.chart-legend i{width:25px;border-top:3px solid #007aa3}.chart-legend .variable-line{border-color:#b84636;border-top-style:dashed}.chart-scroll{overflow-x:auto;overscroll-behavior-x:contain;max-width:100%;border-radius:10px}.chart-scroll svg{display:block;width:100%;height:auto}.chart-sheet h3{font-size:16px;margin:22px 0 6px}.chart-hint{font-size:11px;color:var(--muted);margin:15px 0}.focus-select{max-width:280px;margin-top:24px}.month-focus{background:#f1f6f8;padding:22px;border-radius:16px;margin-top:18px}.focus-heading{display:flex;align-items:baseline;justify-content:space-between;gap:16px}.focus-heading h3{margin:0 0 20px}.focus-heading>span{font-size:12px;color:var(--muted)}.month-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}.month-metrics span,.month-metrics small{display:block;font-size:11px}.month-metrics strong{display:block;font-size:20px;margin:8px 0 4px}.month-metrics .saving{color:#006d8a}.month-metrics .extra{color:#9c301b}.price-ranges{display:flex;gap:32px;flex-wrap:wrap}.price-ranges p{margin:12px 0}.price-ranges span,.price-ranges strong{display:block;font-size:13px}.price-ranges span{font-size:12px;color:var(--muted);margin-bottom:5px}
.benefit-intro{font-size:14px;color:var(--muted);max-width:770px}.benefits{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px;margin:28px 0}.benefits article{padding:0 22px 0 0;border-right:1px solid var(--line)}.benefits article:last-child{border:0;padding-right:0}.benefit-number{font-size:12px;font-weight:600;display:inline-grid;place-items:center;background:#fff1cf;width:36px;height:36px;border-radius:50%;margin-bottom:12px}.benefits h3{font-size:16px;line-height:1.45;margin:0 0 10px}.benefits p{font-size:12px;line-height:1.8;color:var(--muted);margin:0}.tradeoff{border-left:3px solid var(--yellow);background:#f8f9f6;padding:16px 20px;font-size:12px;line-height:1.8}.tradeoff strong{display:block}.comparison-table{overflow-x:auto}.comparison-table table{white-space:normal;table-layout:fixed;min-width:560px}.comparison-table th,.comparison-table td{text-align:left;vertical-align:top;font-size:12px;padding:16px 12px}.comparison-table th:first-child{width:22%}.conversation-prompt{background:var(--ink);color:white;padding:22px 24px;border-radius:16px;margin-top:28px}.conversation-prompt span{font-size:9px;letter-spacing:1.3px;color:var(--yellow);font-weight:600}.conversation-prompt p{font-size:17px;margin:9px 0 0;line-height:1.6}.source-link{font-size:12px}
@media(max-width:700px){.chart-header{align-items:flex-start;flex-direction:column;gap:8px}.chart-header .segments{width:100%}.chart-header .segments button{flex:1}.chart-legend{gap:12px;font-size:11px}.month-metrics{grid-template-columns:1fr;gap:18px}.month-metrics>div{padding-bottom:16px;border-bottom:1px solid #dae3e7}.month-metrics>div:last-child{padding-bottom:0;border:0}.month-metrics strong{font-size:23px}.month-focus{padding:20px 18px}.benefits{grid-template-columns:1fr;gap:22px}.benefits article{border-right:0;border-bottom:1px solid var(--line);padding:0 0 22px}.benefits article:last-child{padding-bottom:0}.benefits p{font-size:13px}.benefit-number{margin-bottom:10px}.conversation-prompt p{font-size:16px}.focus-select{max-width:none}.mode-toggle{font-size:12px;align-items:flex-start}.mode-toggle input{margin-top:0}.tradeoff{padding:16px}.chart-sheet .eyebrow{margin-bottom:10px}}

.meeting-story-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px;margin:24px 0}.meeting-story{border:1px solid #dce5e9;border-radius:18px;overflow:hidden;min-width:0}.meeting-story>img{display:block;width:100%;height:auto;aspect-ratio:16/9;object-fit:cover}.meeting-story-copy{padding:20px}.meeting-story h3{margin:8px 0 12px}.meeting-story p{font-size:14px;line-height:1.7}.meeting-story .story-sector{margin:0;font-size:11px;text-transform:uppercase;letter-spacing:.1em;font-weight:700}.story-reason{padding:12px 0;border-top:1px solid #e6ecef}.story-reason strong{display:block}.meeting-story a{display:inline-block;font-size:14px;font-weight:600;padding:10px 0;color:#013c57}.story-draft{padding:16px 18px;background:#fff7e4;border-left:3px solid #fbc34e;font-size:13px;line-height:1.7}.meeting-stories select{max-width:100%}.export-status{margin-top:12px;font-size:14px;line-height:1.6}.export-status.error{color:#a42e29}@media(max-width:700px){.meeting-story-grid{grid-template-columns:1fr}.meeting-story-copy{padding:18px}}
#pdfActions .actions{justify-content:flex-start;margin:18px 0;gap:12px}#pdfActions .actions a{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:12px 22px;border:1px solid var(--ink);border-radius:14px;text-decoration:none;font-size:14px;font-weight:600}#summaryDownload{background:var(--ink);color:#fff}#summaryOpen{background:#fff;color:var(--ink)}#pdfActions .actions button{min-height:48px}@media(max-width:700px){#pdfActions .actions a{flex:1;min-width:130px}}
/* Four deliberate meeting stages. Keep the comparison customer-facing. */
.steps{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;background:#e8eef1;border-radius:18px;padding:6px;margin-bottom:36px}.steps button{display:flex;align-items:center;justify-content:center;gap:10px;padding:12px 10px;border-radius:13px;font-size:12px;font-weight:600;min-width:0}.steps button span{display:inline;width:auto;height:auto;border-radius:0;background:none;margin:0}.steps button .step-number{display:inline-grid;place-items:center;width:28px;height:28px;flex-shrink:0;border-radius:50%;background:#d7e1e6;font-size:12px}.steps .step-short{display:none}.steps [aria-current] .step-number{background:var(--yellow);color:var(--ink)}.steps [aria-current] .step-label,.steps [aria-current] .step-short{background:transparent;color:#fff}.steps .step-past:not([aria-current]) .step-number{background:#d1e5e8;color:#005b70}.step-actions{padding-top:14px;align-items:center}.step-actions .primary{min-width:230px}.basis-short{font-size:12px;color:var(--muted);margin:18px 0 4px}.basis{margin:0 0 18px;padding:12px 0;border-top:0;font-size:12px}.basis summary{font-size:12px;min-height:24px}.basis p{margin:10px 0}.calculation-details>summary{font-size:16px;min-height:28px}.calculation-details>h2{margin-top:24px}.chart-extra h3{display:none}.chart-hint{margin-bottom:0}.chart-sheet details{margin-top:12px;padding:14px 0}.benefit-sheet .conversation-prompt{background:#f0f5f7;color:var(--ink);padding:18px 22px}.benefit-sheet .conversation-prompt span{color:#526572}.save-note{margin:30px 0 0;font-size:10px}.closing-overview{background:var(--ink);color:#fff;border-radius:22px;padding:28px 32px;border-top:4px solid var(--yellow);display:grid;grid-template-columns:1fr 1.55fr;gap:18px 32px}.closing-overview .eyebrow{color:#a7c9d6;margin:0 0 10px;font-size:9px}.closing-customer h2{font-size:25px;overflow-wrap:anywhere;margin:0 0 8px;line-height:1.3}.closing-customer>p:last-child{font-size:12px;color:#c3d9e3;margin:0}.closing-facts{display:grid;grid-template-columns:1fr 1fr;gap:24px;border-left:1px solid #ffffff35;padding-left:28px}.closing-facts span,.closing-facts small{display:block;color:#c3d9e3;font-size:11px}.closing-facts strong{display:block;font-size:20px;font-weight:600;line-height:1.4;margin:7px 0;overflow-wrap:anywhere}.overview-note{grid-column:1/-1;border-top:1px solid #ffffff25;padding-top:14px;margin:0;font-size:10px;color:#c3d9e3}.closing-grid{display:grid;grid-template-columns:1.08fr 1fr;gap:24px;margin-top:24px;align-items:start}.closing-grid .sheet{margin:0;padding:26px}.closing-grid .eyebrow,.handoff-card .eyebrow{margin:0 0 10px}.meeting-notes>label{margin-top:22px}.meeting-notes>label:first-of-type{margin-top:0}.optional{font-size:11px;font-weight:400;color:var(--muted);display:inline}.meeting-notes textarea{min-height:120px}.meeting-disclaimer{border-top:1px solid var(--line);margin:22px 0 0;padding-top:16px;font-size:11px}.stories-heading{display:flex;align-items:flex-start;gap:12px}.stories-heading h2{font-size:18px;line-height:1.5;margin-bottom:8px}.count-tag{margin-left:auto;background:#edf3f5;border-radius:50%;min-width:28px;height:28px;display:grid;place-items:center;font-size:12px}.story-list{margin:12px 0}.story-row{display:flex;align-items:center;gap:14px;padding:16px 0;border-bottom:1px solid var(--line);text-decoration:none}.story-row:last-child{border-bottom:0}.story-row img{width:80px;height:60px;object-fit:cover;border-radius:9px;flex-shrink:0}.story-row>span:not(.story-arrow){min-width:0}.story-row small{display:block;font-size:9px;color:var(--muted);margin-bottom:3px;text-transform:uppercase;letter-spacing:.4px}.story-row strong{font-size:14px;line-height:1.5;font-weight:600;display:block;overflow-wrap:anywhere}.story-arrow{margin-left:auto;flex-shrink:0;color:#007a9d}.story-row:hover strong{text-decoration:underline}.draft-caption{font-size:10px;line-height:1.65;color:var(--muted);margin:10px 0 0}.compact-stories details{margin-top:16px;padding:16px 0 0}.compact-stories summary{font-size:12px}.compact-stories select{max-width:100%;font-size:14px}.handoff-card{border:1px solid #d5e2e9;border-left:4px solid var(--yellow);margin-top:24px}.handoff-heading{display:flex;justify-content:space-between;align-items:center;gap:24px}.handoff-heading h2{margin-bottom:6px}.handoff-heading p:last-child{margin:0}.handoff-heading>.primary{min-width:180px;flex-shrink:0}.handoff-card #pdfActions{border-top:1px solid var(--line);margin-top:20px;padding-top:16px}.handoff-card #pdfActions h3{font-size:16px;margin:0}.handoff-card .download-help{margin-top:6px;padding-bottom:0}.download-help summary{font-size:12px}.closing-hint{font-size:11px;color:var(--muted)}
@media(max-width:700px){.steps{gap:4px;padding:5px;margin-bottom:28px;border-radius:16px}.steps button{flex-direction:column;gap:6px;padding:10px 2px;font-size:10px;line-height:1.3;border-radius:12px;min-width:0}.steps .step-label{display:none}.steps .step-short{display:inline}.steps button .step-number{width:26px;height:26px;font-size:11px}.step-actions{gap:12px}.step-actions .primary{min-width:160px}.step-actions button{font-size:12px;padding:12px 14px}.closing-overview{padding:24px 20px;grid-template-columns:1fr;gap:20px}.closing-customer h2{font-size:24px}.closing-facts{border-left:0;border-top:1px solid #ffffff35;padding:18px 0 0;gap:18px}.closing-facts strong{font-size:17px}.closing-facts small{font-size:10px}.closing-facts span{font-size:10px}.overview-note{font-size:9px;line-height:1.7}.closing-grid{grid-template-columns:1fr;gap:20px;margin-top:20px}.closing-grid .sheet{padding:22px 20px}.meeting-notes textarea{min-height:110px}.story-row img{width:72px;height:54px}.handoff-heading{flex-direction:column;align-items:stretch;gap:20px}.handoff-heading>.primary{width:100%;min-width:0}.handoff-card{padding:24px 20px}.closing-hint{font-size:10px}.benefit-sheet .conversation-prompt p{font-size:14px}.calculation-details>summary{font-size:14px}}

.top .room-name{display:none}@media(max-width:700px){.top .room-name{display:block;margin-top:7px;font-size:10px;letter-spacing:.5px;font-weight:400}.top>a:first-child{text-decoration:none}}
/* Customer conversation: needs, agreement and next step. */
.need-field{display:block;margin:24px 0}.need-summary{color:#466572;margin:12px 0 24px}.agreement-description{display:grid;grid-template-columns:1fr 1fr;gap:24px;background:#f1f5f7;padding:22px;border-radius:12px;margin:22px 0}.agreement-description p{margin:0;line-height:1.6}.recommendation-summary{background:#013c57;color:#fff;border-radius:18px;padding:30px;margin:0 0 22px}.recommendation-summary h2{color:#fff;font-size:25px;line-height:1.35;margin:12px 0}.recommendation-summary .eyebrow{color:#fbc34e}.recommendation-summary>p:last-child{line-height:1.6;white-space:pre-wrap}.comparison-heading{margin-top:34px}.closing-needs{display:grid;grid-template-columns:1fr 1fr;gap:24px;padding:24px 0;border-top:1px solid #dce5e9}.closing-needs span{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em}.closing-needs p{white-space:pre-wrap;overflow-wrap:anywhere;margin:10px 0 0}.meeting-notes .form-grid{margin:0}.quote-mark{font:64px/1 Georgia,serif;color:#007a9d;padding:10px 4px 0}.reference-source{font-size:12px;line-height:1.6;color:#58707b;margin-top:20px}.reference-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin:32px 0}.reference-grid .sheet{margin:0}.reference-card blockquote{margin:24px 0;font-size:20px;line-height:1.55}.quote-person{font-weight:700}.reference-single{margin-top:30px;padding:48px}.reference-single blockquote{font-size:clamp(24px,3.4vw,42px);line-height:1.45;margin:28px 0}.reference-single:fullscreen{background:#fff;padding:8vw;overflow:auto}.contract small{line-height:1.5}input[type=date]{min-width:0;max-width:100%}
@media(max-width:680px){.agreement-description,.closing-needs,.reference-grid{grid-template-columns:1fr}.recommendation-summary{padding:22px}.reference-single{padding:24px}.reference-card blockquote{font-size:18px}.meeting-notes .form-grid{grid-template-columns:1fr}}
.closing-customer{grid-column:1;grid-row:1}.closing-facts{grid-column:2;grid-row:1}.closing-needs{grid-column:1/-1;grid-row:2;border-color:#ffffff35}.overview-note{grid-row:3}.meeting-notes>.form-grid{margin-top:22px}.story-row small:last-child{text-transform:none;letter-spacing:0;font-size:11px}
@media(max-width:700px){.closing-customer,.closing-facts,.closing-needs,.overview-note{grid-column:1;grid-row:auto}}

.agreement-explainer{padding:24px;border-radius:18px;background:#f1f5f7;margin-top:24px}.agreement-explainer .eyebrow{margin:0 0 14px}.agreement-explainer h3{font-size:15px;margin:22px 0 6px}.agreement-explainer p{font-size:14px;max-width:780px}.agreement-explainer h2{margin-bottom:12px}summary{touch-action:manipulation;min-height:48px;padding:8px 0}#pdfActions .text-button{display:inline-flex;align-items:center;min-height:48px;padding:12px 16px;border:1px solid var(--line);border-radius:12px}@media(max-width:700px){.agreement-explainer{padding:20px 18px}#pdfActions .actions{flex-direction:column;align-items:stretch}#pdfActions .text-button{justify-content:center}}

````

## Fil: public/meeting-flow.mjs

````text
import {agreementExplanationHtml} from './agreement-explanation.mjs';
import {bindCustomerAgreement} from './customer-agreement-ui.mjs';
import {customerBasis,customerReferenceLabel} from './customer-agreement.mjs';
import {bindPdfDelivery} from './meeting-delivery.mjs';
import {closingOverviewHtml} from './meeting-summary.mjs';
import {storyPickerHtml,selectedStories} from './meeting-stories.mjs';
import {chartsHtml,monthFocusHtml,benefitsHtml} from './meeting-insights.mjs';
import {MONTHS,annualProfile,parseProfile,defaults,validateState} from './model.mjs';
import {CONTRACTS,YEARS,initialMeeting,validMeeting,meetingResult,manualPriceKey,yearsFor,normalizeMeeting,sameProfiles,copyProfile,syncSharedProfile} from './meeting-model.mjs';
const $=id=>document.getElementById(id),fmt=(n,d=0)=>n===null?'—':new Intl.NumberFormat('sv-SE',{maximumFractionDigits:d,minimumFractionDigits:d}).format(n);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const branches={company:'Företag',brf:'BRF',hotel:'Hotell',industry:'Industri',farm:'Lantbruk',shop:'Butik',transport:'Transport och logistik',property:'Fastigheter',other:'Annan verksamhet'};
let pdfDelivery,lastSavedSignature;
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
 if(next===2)drawAgreement();step=next;
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
 generate:async snapshot=>{const {createMeetingPdf}=await import('./meeting-pdf.mjs');return createMeetingPdf(snapshot);}
});
$('openDetails').addEventListener('click',()=>{const d=defaults(),period=s.period==='both'?'2025':s.period;Object.assign(d,{customer:s.customer,period,profiles:structuredClone(s.profiles),sources:structuredClone(s.sources),estimates:structuredClone(s.estimates??{}),business:{type:Object.hasOwn(branches,s.business)&&['company','brf','hotel','industry','farm','shop'].includes(s.business)?s.business:'company',apartments:null},hedge:s.hedge,portfolioFee:s.portfolioFee,variableFee:s.variableFee,fixed:s.fixedPrice??d.fixed,notes:s.notes,next:s.next,sellerName:s.seller||'Ludwig Rosenberg'});for(const y of YEARS)if(d.sources[y]==='estimated'&&!d.estimates[y])d.sources[y]='own';try{localStorage.setItem('kundrum-v2',JSON.stringify(d));}catch{}});
lastSavedSignature=JSON.stringify(s);
$('newMeeting').addEventListener('click',()=>{if(!confirm('Börja ett nytt kundmöte? Spara mötesunderlaget först om du vill behålla det.'))return;s=initialMeeting();$('goal').value='';$('recommendation').value='';profileYear='2025';annualDirty=false;$('customer').value='';$('business').value='company';$('annual').value='';$('csvInput').value='';$('sharedChoice').hidden=true;drawProfile();customerUI.render();save();showStep(1);});

````

## Fil: public/meeting-insights.mjs

````text
import {CONTRACTS} from './meeting-model.mjs';
const fmt=(n,d=2)=>new Intl.NumberFormat('sv-SE',{minimumFractionDigits:d,maximumFractionDigits:d}).format(n);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function monthComparison(r,index){
 const row=r.rows[index];
 return !row?.available?null:{...row,difference:row.variable-row.selected,differenceRate:row.variableRate-row.selectedRate};
}
export function priceRanges(r){
 const rows=r.available.filter(x=>x.volume>0);
 if(!rows.length)return null;
 const bounds=key=>({low:Math.min(...rows.map(x=>x[key])),high:Math.max(...rows.map(x=>x[key]))});
 return {selected:bounds('selectedRate'),variable:bounds('variableRate')};
}
function niceStep(span){const rough=Math.max(span/4,.01),p=10**Math.floor(Math.log10(rough)),v=rough/p;return(v<=1?1:v<=2?2:v<=2.5?2.5:v<=5?5:10)*p;}
export function meetingChart(r,label,unit='ore',difference=false){
 const selected=unit==='ore'?'selectedRate':'selected',variable=unit==='ore'?'variableRate':'variable';
 const w=Math.max(700,r.rows.length*36+80),h=difference?220:280,L=64,R=25,T=30,B=44,ph=h-T-B;
 const values=r.available.flatMap(row=>difference?[row[variable]-row[selected]]:[row[selected],row[variable]]);
 const step=niceStep(Math.max(0,...values)-Math.min(0,...values)),min=Math.floor(Math.min(0,...values)/step)*step,max=Math.max(step,Math.ceil(Math.max(0,...values)/step)*step);
 const x=i=>L+i*(w-L-R)/Math.max(1,r.rows.length-1),y=v=>T+ph-(v-min)/(max-min)*ph;
 const labelUnit=unit==='ore'?'öre/kWh':'kr',prefix=difference?'monthly-difference':'monthly-price';
 let svg=`<svg viewBox="0 0 ${w} ${h}" style="min-width:${w}px" role="img" aria-labelledby="${prefix}-title ${prefix}-desc"><title id="${prefix}-title">${difference?'Besparing eller merkostnad per månad':'Utveckling månad för månad'} i ${labelUnit}</title><desc id="${prefix}-desc">${difference?'Blå positiva staplar visar lägre kostnad med valt avtal, röda negativa staplar visar högre kostnad.':`${esc(label)} i blått och ${esc(r.referenceLabel||'Kvartspris')} i streckad korallfärgad linje.`} Saknade månader lämnas tomma. Exakta värden finns i månadstabellen.</desc>`;
 for(let v=min;v<=max+step*.01;v+=step)svg+=`<line x1="${L}" x2="${w-R}" y1="${y(v)}" y2="${y(v)}" stroke="${Math.abs(v)<1e-8?'#9fb2bd':'#dfe7eb'}" stroke-dasharray="${Math.abs(v)<1e-8?'none':'3 5'}"/><text x="${L-10}" y="${y(v)+4}" text-anchor="end" fill="#526572" font-size="11">${fmt(unit==='kr'?v/1000:v,step<1?2:1)}</text>`;
 svg+=`<text x="${L}" y="15" fill="#526572" font-size="11">${unit==='kr'?'tusen kr':'öre/kWh'}</text>`;
 r.rows.forEach((row,i)=>{
  if(!row.available)svg+=`<rect x="${x(i)-16}" y="${T}" width="32" height="${ph}" fill="#f1f4f5"/><text x="${x(i)}" y="${T+ph/2}" text-anchor="middle" fill="#687f8d" font-size="14">—</text>`;
  svg+=`<text x="${x(i)}" y="${h-20}" text-anchor="middle" fill="#526572" font-size="11">${row.month}</text>`;
  if(i===0||row.year!==r.rows[i-1].year)svg+=`<text x="${x(i)}" y="${h-5}" text-anchor="middle" fill="#013c57" font-weight="600" font-size="10">${row.year}</text>`;
 });
 if(difference){
  r.rows.forEach((row,i)=>{if(!row.available)return;const d=row[variable]-row[selected],color=d>=0?'#007aa3':'#b84636';
   svg+=`<rect x="${x(i)-12}" y="${Math.min(y(d),y(0))}" width="24" height="${Math.max(1,Math.abs(y(d)-y(0)))}" rx="3" fill="${color}"><title>${row.label}: ${d>=0?'lägre':'högre'} med ${fmt(Math.abs(d))} ${labelUnit}</title></rect>`;
  });
 }else{
  for(const [key,color,dash] of [[variable,'#b84636',true],[selected,'#007aa3',false]]){
   let path='',active=false;
   r.rows.forEach((row,i)=>{if(!row.available){active=false;return;}path+=`${active?'L':'M'}${x(i)},${y(row[key])} `;active=true;});
   svg+=`<path d="${path}" stroke="${color}" stroke-width="3" ${dash?'stroke-dasharray="6 5"':''} fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
   r.rows.forEach((row,i)=>{if(row.available)svg+=`<circle cx="${x(i)}" cy="${y(row[key])}" r="3" fill="white" stroke="${color}" stroke-width="2"><title>${row.label}: ${key===selected?esc(label):esc(r.referenceLabel||'Kvartspris')} ${fmt(row[key])} ${labelUnit}</title></circle>`;});
  }
 }
 r.rows.forEach((row,i)=>{svg+=`<rect data-chart-row="${i}" x="${x(i)-20}" y="${T}" width="40" height="${ph}" fill="transparent" style="cursor:pointer"><title>${row.label}${row.available?' · visa månadens siffror':' · underlag saknas'}</title></rect>`;});
 return svg+'</svg>';
}
export function monthFocusHtml(r,index,label){
 const row=monthComparison(r,index);
 if(!row)return `<div class="month-focus"><h3>${esc(r.rows[index]?.label??'Månad')}</h3><p>Komplett pris- eller förbrukningsunderlag saknas. Månaden ingår inte i jämförelsen.</p></div>`;
 const equal=Math.abs(row.difference)<.005;
 return `<div class="month-focus"><div class="focus-heading"><h3>${row.label}</h3><span>${fmt(row.volume)} kWh</span></div><div class="month-metrics"><div><span>${esc(label)}</span><strong>${fmt(row.selected)} kr</strong><small>${fmt(row.selectedRate)} öre/kWh</small></div><div><span>${esc(r.referenceLabel||'Kvartspris')}</span><strong>${fmt(row.variable)} kr</strong><small>${fmt(row.variableRate)} öre/kWh</small></div><div class="${row.difference>=0?'saving':'extra'}"><span>${equal?'Samma kostnad':row.difference>0?'Beräknad besparing':'Beräknad merkostnad'}</span><strong>${fmt(Math.abs(row.difference))} kr</strong><small>${fmt(Math.abs(row.differenceRate))} öre/kWh ${equal?'i prisskillnad':row.differenceRate>=0?'lägre':'högre'}${row.volume===0?' · ingen förbrukning':''}</small></div></div></div>`;
}
export function chartsHtml(r,s,unit='ore',focus=0,interactive=true,compact=false){
 const label=CONTRACTS[s.contract].label,range=priceRanges(r);
 return `<section class="sheet chart-sheet" aria-labelledby="chartHeading"><div class="chart-header"><div><p class="eyebrow">FÖLJ SKILLNADEN</p><h2 id="chartHeading">Månad för månad</h2></div>${interactive?`<div class="segments" aria-label="Diagrammets enhet"><button type="button" data-chart-unit="ore" aria-pressed="${unit==='ore'}">Öre/kWh</button><button type="button" data-chart-unit="kr" aria-pressed="${unit==='kr'}">Kronor</button></div>`:''}</div><div class="chart-legend"><span><i class="selected-line"></i>${label}</span><span><i class="variable-line"></i>${esc(r.referenceLabel||'Kvartspris')}</span></div><p class="muted">${unit==='ore'?'Priset per kWh gör det lättare att jämföra prisvariationer.':'Kostnaden i kronor visar både prisets och förbrukningens påverkan.'} Samma månader används för båda avtalen.</p><div class="chart-scroll" tabindex="0" aria-label="Prisdiagram, bläddra i sidled vid behov">${meetingChart(r,label,unit)}</div>${compact?'<details class="chart-extra"><summary>Se besparing eller merkostnad per månad</summary>':''}<h3>Besparing eller merkostnad</h3><p class="muted">Blått över noll = lägre med valt avtal. Rött under noll = högre med valt avtal.</p><div class="chart-scroll" tabindex="0" aria-label="Skillnadsdiagram, bläddra i sidled vid behov">${meetingChart(r,label,unit,true)}</div>${compact?'</details>':''}${interactive?`<p class="chart-hint">Svep diagrammen i sidled på mobilen. Tryck på en månad eller välj nedan.</p>${compact?'<details id="monthDetails"><summary>Se exakta månadssiffror</summary>':''}<label class="focus-select">Visa månad<select id="focusMonth">${r.rows.map((row,i)=>`<option value="${i}" ${i===focus?'selected':''}>${row.label}${row.available?'':' · saknar underlag'}</option>`).join('')}</select></label><div id="monthFocus" aria-live="polite">${monthFocusHtml(r,focus,label)}</div>${compact?'</details>':''}`:''}${range?`<details><summary>Hur mycket varierade månadspriset?</summary><div class="price-ranges"><p><span>${label}</span><strong>${fmt(range.selected.low)}–${fmt(range.selected.high)} öre/kWh</strong></p><p><span>${esc(r.referenceLabel||'Kvartspris')}</span><strong>${fmt(range.variable.low)}–${fmt(range.variable.high)} öre/kWh</strong></p></div><p class="muted">Lägsta och högsta månadspris bland månader med förbrukning. Det beskriver det här underlaget, inte framtida prisrisk.</p></details>`:''}</section>`;
}

const portfolioBenefits=[
 ['Tryggare planering','En plan för prissäkringen ger stöd för budgeten och minskar beroendet av en enda köpdag.'],
 ['Jämnare pris över tid','Prissäkring vid flera tillfällen kan dämpa prisrörelser. Priset kan fortfarande variera.'],
 ['Tydlig kostnadsbild','Här visar vi pris, påslag och antaganden. Gå också igenom vilka avgifter som tillkommer i avtalet.']
];
export const CONTRACT_DESCRIPTIONS={
 "individual": {
  "intro": "En egen inköpsplan utifrån er förbrukning och risknivå.",
  "benefits": [
   [
    "En egen plan",
    "Inköpsplanen utgår från er verksamhet, förbrukning och risknivå."
   ],
   [
    "Inköp över tid",
    "Prissäkringarna fördelas enligt den plan vi kommer överens om."
   ],
   [
    "Gemensam uppföljning",
    "Vi följer upp förbrukning och förändringar som påverkar planen."
   ]
  ]
 },
 "safe": {
  "intro": "Gemensamma inköp som sprids över tid för en jämnare prisbild.",
  "benefits": [
   [
    "Gemensamma inköp",
    "Ni ingår i en pool med en gemensam inköpsstrategi."
   ],
   [
    "Löpande prissäkring",
    "Inköpen sprids över tid för att dämpa beroendet av ett enskilt köptillfälle."
   ],
   [
    "Mindre egen bevakning",
    "Förvaltningen följer strategin. Ni kan fokusera på verksamheten."
   ]
  ]
 },
 "offensive": {
  "intro": "Gemensam prissäkring med aktiv förvaltning av delar av inköpen.",
  "benefits": [
   [
    "En gemensam grund",
    "En del av inköpen följer poolens löpande prissäkring."
   ],
   [
    "Aktiva beslut",
    "Delar förvaltas aktivt utifrån marknadsläget."
   ],
   [
    "Acceptera variation",
    "Aktiv förvaltning kan ge både bättre och sämre prisutfall."
   ]
  ]
 },
 "direct": {
  "intro": "Säkra vid ett tillfälle, med ett säkringspris för varje avtalsmånad.",
  "benefits": [
   [
    "Ett säkringstillfälle",
    "En överenskommen andel säkras vid ett tillfälle för avtalsperioden."
   ],
   [
    "Pris för varje månad",
    "Varje avtalsmånad får sin egen kända säkringsnivå."
   ],
   [
    "Planera för återstoden",
    "Osäkrad volym, användningsmönster och avgifter påverkar slutpriset."
   ]
  ]
 },
 "stable": {
  "intro": "Ett gemensamt säkringspris, vägt efter er månadsförbrukning.",
  "benefits": [
   [
    "En gemensam nivå",
    "Månadernas säkringspriser vägs samman efter er förbrukningsprofil."
   ],
   [
    "En grund för budget",
    "Samma säkringspris används under den överenskomna perioden."
   ],
   [
    "Följ upp förbrukningen",
    "Profil, faktisk volym och osäkrad del påverkar fortfarande fakturan."
   ]
  ]
 },
 "quarter": {
  "intro": "Följ marknaden och påverka kostnaden genom när ni använder el.",
  "benefits": [
   [
    "Följ marknadspriset",
    "Både stigande och fallande spotpriser får genomslag."
   ],
   [
    "Påverka tidpunkten",
    "Flyttbar elanvändning kan läggas på billigare kvartar."
   ],
   [
    "Planera för svängningar",
    "Budgeten behöver klara att marknadspriset varierar."
   ]
  ]
 },
 "fixed": {
  "intro": "Ett avtalat pris för den del och period som omfattas av offerten.",
  "benefits": [
   [
    "Ett avtalat pris",
    "Den fasta prisdelen gäller under perioden i offerten."
   ],
   [
    "Enklare prisbudget",
    "Förbrukningen påverkar fortfarande månadskostnaden."
   ],
   [
    "Tydliga villkor",
    "Vi går igenom volymvillkor, tillägg och avtalstid tillsammans."
   ]
  ]
 }
};
export const BRANCH_PROMPTS={
 hotel:'Hur påverkar beläggning och drift er budget för el?',industry:'Hur viktigt är ett planerat elpris när ni kalkylerar produktionen?',farm:'Hur varierar behovet mellan säsongerna?',shop:'Vilken del av butikens elanvändning går faktiskt att flytta i tid?',brf:'Hur stora kostnadsförändringar klarar föreningens budget?',transport:'När använder terminaler och laddning mest el?',property:'Hur följer ni upp energikostnaden per fastighet?',company:'Vad väger tyngst för er: planering eller att följa marknadens pris?',other:'Vad väger tyngst för er: planering eller att följa marknadens pris?'
};
export function benefitsHtml(s){
 const c=CONTRACTS[s.contract],v=CONTRACT_DESCRIPTIONS[s.contract],portfolio=c.kind==='portfolio';
 const caveat=portfolio?'Säkringarna är finansiella prisavtal, inte el som läggs i lager. De kan även göra utfallet dyrare än rörligt. Förbrukning, dygnsprofil och övriga kostnader kan fortfarande påverka fakturan.':s.contract==='quarter'?'Ni bär marknadens prisvariationer. Jämförelsen använder månadspriser och kan inte visa vinsten av att flytta användning mellan kvartar.':['stable','direct'].includes(s.contract)?'Ett konstant pris i kalkylen innebär inte att hela elräkningen är garanterat fast. Offertens omfattning måste stämma med det inmatade priset.':'Ett fast pris per kWh betyder inte en fast månadsfaktura. Förbrukning, avtalets tillägg, elnät och skatt behöver också räknas med.';
 const rows=portfolio?[
  ['När priset formas','Stegvis, genom prissäkringar före förbrukningen.','Spotpris när elen används.'],
  ['När marknaden stiger','Säkringarna kan dämpa uppgången.','Spotprisets uppgång får genomslag.'],
  ['När marknaden faller','Gjorda säkringar kan ligga över det nya marknadspriset.','Spotprisets nedgång får genomslag.'],
  ['Vad som återstår','Osäkrad del, förbrukningsmönster och kostnader enligt avtal.','Förbrukningsmönster och kostnader enligt avtal.']
 ]:s.contract==='quarter'?[]:[
  ['Pris i den här kalkylen','Samma manuellt angivna pris för alla månader.','Underlagets rörliga månadspriser.'],
  ['Budget','Prisscenariot kan användas som jämförelsepunkt.','Kostnaden följer pris och förbrukning.'],
  ['Att kontrollera',s.contract==='stable'?'Vad offerten för Stabil omfattar och hur länge den gäller.':'Bindningstid, tillägg och volymvillkor.','Påslag, avgifter och möjlighet att flytta användning.']
 ];
 const source=portfolio?(s.contract==='individual'?'https://www.kraftringen.se/foretag/el/vara-elavtal/portfoljforvaltning/':'https://www.kraftringen.se/foretag/el/vara-elavtal/poolportfolj/'):'https://www.kraftringen.se/foretag/el/vara-elavtal/avtalsvillkor/';
 return `<section class="sheet benefit-sheet"><p class="eyebrow">UPPLÄGGET I PRAKTIKEN</p><h2>Vad betyder ${c.label} för er?</h2><p class="benefit-intro">${v.intro}</p><div class="benefits">${v.benefits.map(([title,text],i)=>`<article><span class="benefit-number" aria-hidden="true">0${i+1}</span><h3>${title}</h3><p>${text}</p></article>`).join('')}</div><p class="tradeoff"><strong>Det här behöver ni också veta.</strong> ${caveat}</p>${rows.length?`<details><summary>Jämför egenskaper med kvartspris</summary><div class="comparison-table"><table><caption>Så skiljer sig avtalen – beskrivning, inte ett betyg</caption><thead><tr><th>Att jämföra</th><th>${c.label}</th><th>Kvartspris</th></tr></thead><tbody>${rows.map(row=>`<tr>${row.map((cell,i)=>i===0?`<th scope="row">${cell}</th>`:`<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`:''}<div class="conversation-prompt"><span>FRÅGA ATT PRATA OM</span><p>${BRANCH_PROMPTS[s.business]}</p></div><details><summary>Om beskrivningen och underlaget</summary><p class="muted">Kvalitativa egenskaper är skilda från resultatet i kalkylen. Transparens kräver att prisdelar och avgifter redovisas tydligt, oavsett avtalsform. Individuell portfölj och båda poolerna har samma historiska siffror här i denna illustration; en aktiv strategi får inget extra simulerat resultat. Direkt och Stabil visas som förenklade prisscenarier utifrån offertens jämförpris. Direkt har separata månadssäkringspriser som inte räknas fram här.</p><a class="source-link" href="${source}" target="_blank" rel="noopener">Kraftringens produktinformation och villkor ↗</a></details></section>`;
}

````

## Fil: public/meeting-model.mjs

````text
import {agreementErrors,customerMonth,customerReferenceLabel} from './customer-agreement.mjs';
import {DATA,defaults,calculate} from './model.mjs';
export const CONTRACTS={
 "individual": {
  "label": "Individuell portfölj",
  "kind": "portfolio",
  "hint": "En egen inköpsplan utifrån er förbrukning och risknivå.",
  "fit": "För er som behöver anpassa inköpen till verksamheten.",
  "variation": "Osäkrad volym, förbrukningsmönster och avgifter påverkar slutpriset."
 },
 "safe": {
  "label": "Pool Trygg",
  "kind": "portfolio",
  "hint": "Gemensamma inköp som sprids över tid för en jämnare prisbild.",
  "fit": "För er som vill ha en färdig strategi och mindre egen marknadsbevakning.",
  "variation": "Priset följer poolens gemensamma säkringar. Osäkrad del och avtalskostnader återstår."
 },
 "offensive": {
  "label": "Pool Offensiv",
  "kind": "portfolio",
  "hint": "Gemensam prissäkring med aktiv förvaltning av delar av inköpen.",
  "fit": "För er som accepterar mer variation för möjligheten till ett bättre utfall.",
  "variation": "Aktiva beslut kan ge både bättre och sämre utfall än en ren indexstrategi."
 },
 "direct": {
  "label": "Kraftringen Direkt",
  "kind": "manual",
  "hint": "Säkra vid ett tillfälle, med ett säkringspris för varje avtalsmånad.",
  "fit": "För er som vill känna månadens säkringsnivå och har förutsägbar elanvändning.",
  "variation": "Osäkrad del, faktisk volym och när elen används påverkar slutpriset."
 },
 "stable": {
  "label": "Kraftringen Stabil",
  "kind": "manual",
  "hint": "Ett gemensamt säkringspris, vägt efter er månadsförbrukning.",
  "fit": "För er som vill planera med en gemensam säkringsnivå och har stabil förbrukningsprofil.",
  "variation": "Säkringspriset är gemensamt. Förbrukning, profil, osäkrad del och avgifter kan ändå ändra fakturan."
 },
 "quarter": {
  "label": "Kvartspris",
  "kind": "variable",
  "hint": "Följ marknaden och påverka kostnaden genom när ni använder el.",
  "fit": "För er som kan bära prissvängningar och eventuellt flytta elanvändningen.",
  "variation": "Spotpris och er användning under varje kvart styr kostnaden, tillsammans med avtalets tillägg."
 },
 "fixed": {
  "label": "Fastpris",
  "kind": "manual",
  "hint": "Ett avtalat pris för den del och period som omfattas av offerten.",
  "fit": "För er som prioriterar ett känt avtalat pris framför att följa marknaden.",
  "variation": "Förbrukning, volymvillkor och tillägg kan fortfarande påverka fakturan."
 }
};
export const manualPriceKey=contract=>({stable:"stablePrice",direct:"directPrice",fixed:"fixedPrice"}[contract]);
export const MEETING_TEXT_FIELDS={goal:1000,recommendation:2000,checks:2000,owner:100};
export const validFollowUp=v=>v===''||typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
export const YEARS=['2025','2026'];
export const sameProfiles=s=>s.profiles['2025'].every((v,i)=>v===s.profiles['2026'][i]);
export function copyProfile(s,from,to){
 if(!YEARS.includes(from)||!YEARS.includes(to))throw Error('Ogiltigt profilår.');
 s.profiles[to]=[...s.profiles[from]];s.sources[to]=s.sources[from];s.estimates??={};
 if(s.estimates[from])s.estimates[to]=structuredClone(s.estimates[from]);else delete s.estimates[to];
}
export function syncSharedProfile(s,from){if(s.consumptionMode==='shared')copyProfile(s,from,YEARS.find(y=>y!==from));}
export function normalizeMeeting(s){
 const next=structuredClone(s);
 for(const key of Object.keys(MEETING_TEXT_FIELDS))next[key]??='';next.followUp??='';next.directPrice??=null;next.comparisonMode??='reference';
 if(next.consumptionMode===undefined){
  const filled=YEARS.filter(y=>next.profiles[y].some(v=>v!==null));
  next.consumptionMode=sameProfiles(next)||filled.length<=1?'shared':'separate';
  if(next.consumptionMode==='shared')syncSharedProfile(next,filled[0]??'2025');
 }
 return next;
}
export function yearsFor(period){if(period==='both')return YEARS;if(YEARS.includes(period))return [period];throw Error('Välj ett giltigt år.');}
export function initialMeeting(){return {version:1,comparisonMode:'reference',consumptionMode:'shared',customer:'',business:'company',seller:'Ludwig Rosenberg',period:'2025',contract:null,profiles:{'2025':Array(12).fill(null),'2026':Array(12).fill(null)},sources:{'2025':'own','2026':'own'},hedge:80,portfolioFee:DATA.parameters.portfolioFee,variableFee:DATA.parameters.variableFee,stablePrice:null,fixedPrice:null,directPrice:null,goal:'',recommendation:'',checks:'',owner:'',followUp:'',notes:'',next:''};}
export function validMeeting(s){return !!s&&s.version===1&&(s.consumptionMode===undefined||['shared','separate'].includes(s.consumptionMode))&&typeof s.customer==='string'&&s.customer.length<=120&&typeof s.seller==='string'&&s.seller.length<=100&&['company','brf','hotel','industry','farm','shop','transport','property','other'].includes(s.business)&&['2025','2026','both'].includes(s.period)&&(s.contract===null||Object.hasOwn(CONTRACTS,s.contract))&&YEARS.every(y=>Array.isArray(s.profiles?.[y])&&s.profiles[y].length===12&&s.profiles[y].every(v=>v===null||Number.isFinite(v)&&v>=0&&v<=100000000)&&['own','estimated','file'].includes(s.sources?.[y]))&&['hedge','portfolioFee','variableFee'].every(k=>Number.isFinite(s[k])&&s[k]>=0&&s[k]<=100)&&['stablePrice','fixedPrice'].every(k=>s[k]===null||Number.isFinite(s[k])&&s[k]>=0&&s[k]<=500)&&(s.directPrice===undefined||s.directPrice===null||Number.isFinite(s.directPrice)&&s.directPrice>=0&&s.directPrice<=500)&&Object.entries(MEETING_TEXT_FIELDS).every(([k,max])=>s[k]===undefined||typeof s[k]==='string'&&s[k].length<=max)&&(s.followUp===undefined||validFollowUp(s.followUp))&&typeof s.notes==='string'&&s.notes.length<=10000&&typeof s.next==='string'&&s.next.length<=1000&&(s.consumptionMode!=='shared'||sameProfiles(s));}
export function meetingResult(s){
 if(!validMeeting(s)||!s.contract)throw Error('Välj avtal och kontrollera era uppgifter.');
 const customer=s.comparisonMode==='customer',a=s.customerAgreement;
 if(customer){
  const errors=agreementErrors(a,{forComparison:true});
  if(typeof a?.customer!=='string'||a.customer.trim().toLocaleLowerCase('sv')!==s.customer.trim().toLocaleLowerCase('sv'))errors.push('Mötet och prisuppgiften gäller olika kunder.');
  if(!Number.isFinite(s.selectedMonthlyFee)||s.selectedMonthlyFee<0||s.selectedMonthlyFee>100000)errors.push('Ange förslagets månadsavgift.');
  if(!s.comparisonScopeChecked||s.comparisonArea==='unknown'||s.comparisonArea!==a?.area)errors.push('Bekräfta samma elområde och kostnadsomfattning.');
  if(errors.length)throw Error(errors.join(' '));
 }
 const kind=CONTRACTS[s.contract].kind,manual=s[manualPriceKey(s.contract)]??null;
 if(kind==='manual'&&manual===null)throw Error('Ange ett pris i öre/kWh för det valda avtalet.');
 const years=yearsFor(s.period),base=defaults(),rows=[];
 for(const year of years){
  const r=calculate({...base,period:year,profiles:s.profiles,hedge:s.hedge,portfolioFee:s.portfolioFee,variableFee:s.variableFee});
  for(const row of r.rows){
   const key=`${year}-${String(row.index+1).padStart(2,'0')}`;
   const ref=customer?customerMonth(a,key,row.volume,{estimated:s.sources[year]==='estimated'}):null;
   const selectedAvailable=customer&&kind==='manual'?row.volume!==null:row.available;
   const available=selectedAvailable&&(!customer||ref.available);
   const unitRate=!available?null:kind==='portfolio'?row.portfolioRate:kind==='variable'?row.variableRate:manual;
   const selected=available?row.volume*unitRate/100+(customer?s.selectedMonthlyFee:0):null;
   rows.push({...row,available,year,label:`${row.month} ${year}`,selectedRate:available?(row.volume?selected/row.volume*100:unitRate):null,selected,
    ...(customer?{variable:available?ref.cost:null,variableRate:available?ref.rate:null,missingReason:!selectedAvailable?'Förslagets pris eller förbrukning saknas':ref.reason,selectedMonthlyFee:s.selectedMonthlyFee}:{} )});
  }
 }
 const available=rows.filter(r=>r.available),sum=k=>available.reduce((a,r)=>a+r[k],0),volume=sum('volume'),selected=sum('selected'),variable=sum('variable');
 return {referenceLabel:customerReferenceLabel(s),customerComparison:customer,rows,years,available,count:available.length,totalMonths:rows.length,volume,selected,variable,selectedRate:volume?selected/volume*100:null,variableRate:volume?variable/volume*100:null,difference:variable-selected,differenceRate:volume?(variable-selected)/volume*100:null,periodLabel:s.period==='both'?'2025 och 2026':s.period};
}

````

## Fil: public/meeting-pdf.mjs

````text
import {agreementExplanation} from './agreement-explanation.mjs';
import {customerBasis,AGREEMENT_TYPES,SOURCE_TYPES,PRICE_MODES} from './customer-agreement.mjs';
import {PDFDocument,rgb} from './vendor/pdf-lib.mjs';
import fontkit from './vendor/fontkit.mjs';
import {meetingResult,CONTRACTS,manualPriceKey} from './meeting-model.mjs';
import {CONTRACT_DESCRIPTIONS,BRANCH_PROMPTS} from './meeting-insights.mjs';
import {selectedStories,STORY_SOURCE_NOTE} from './meeting-stories.mjs';
const W=960,H=540,M=48;
const C={navy:'#013c57',blue:'#007a9d',yellow:'#fbc34e',cream:'#fff1cf',ink:'#163f51',muted:'#58707b',line:'#dce5e9',pale:'#f1f5f7',red:'#ae493e',white:'#ffffff'};
const color=v=>rgb(...v.slice(1).match(/../g).map(x=>parseInt(x,16)/255));
const amount=(n,d=2)=>new Intl.NumberFormat('sv-SE',{minimumFractionDigits:d,maximumFractionDigits:d}).format(n).replace(/\u00a0|\u202f/g,' ');
const branchLabels={company:'Företag',hotel:'Hotell',industry:'Industri',farm:'Lantbruk',shop:'Butik',brf:'BRF',transport:'Transport och logistik',property:'Fastigheter',other:'Annan verksamhet'};
export const pdfFilename=s=>'Kundunderlag-'+(s.customer||'kund').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9-]+/gi,'-').replace(/^-+|-+$/g,'').slice(0,70)+'-'+s.period+'.pdf';
export async function createMeetingPdf(meeting,{fetcher=globalThis.fetch,now=new Date()}={}){
 const s=structuredClone(meeting),r=meetingResult(s),contract=CONTRACTS[s.contract],stories=selectedStories(s.business,s.storyChoice),copy=CONTRACT_DESCRIPTIONS[s.contract];
 if(!r.volume)throw Error('Det saknas jämförbar förbrukning.');
 const asset=async path=>{const response=await fetcher(path);if(!response.ok)throw Error('En del av underlaget kunde inte hämtas. Försök igen.');return new Uint8Array(await response.arrayBuffer());};
 const [regularBytes,boldBytes,logoBytes]=await Promise.all([asset('/brand/LiberationSans-Regular.ttf'),asset('/brand/LiberationSans-Bold.ttf'),asset('/brand/kraftringen-logo.png')]);
 const doc=await PDFDocument.create();doc.setTitle(`Kundunderlag - ${s.customer}`);doc.setAuthor(s.seller||'Kraftringen');doc.setSubject(`${contract.label} - ${r.periodLabel}`);doc.setCreator('Kraftringen Kundrummet');doc.setCreationDate(now);doc.setModificationDate(now);doc.setLanguage('sv-SE');
 doc.registerFontkit(fontkit);
 const font=await doc.embedFont(regularBytes,{subset:true}),bold=await doc.embedFont(boldBytes,{subset:true}),logo=await doc.embedPng(logoBytes),supported=new Set(font.getCharacterSet()),replaced=new Set(),audit=[];
 const clean=v=>Array.from(String(v??'').replace(/[\u00a0\u202f]/g,' ').replace(/[‐‑–—−]/g,'-').replace(/→/g,'>').replace(/\r/g,'')).map(ch=>{if(ch==='\n'||supported.has(ch.codePointAt(0)))return ch;if(ch==='\t')return ' ';if(ch.codePointAt(0)<32)return '';replaced.add(ch);return '?';}).join('');
 function lines(text,width,size=12,f=font){const result=[];for(const paragraph of clean(text).split('\n')){if(!paragraph){result.push('');continue;}let line='';for(const word of paragraph.split(/\s+/)){if(!word)continue;const next=line?line+' '+word:word;if(f.widthOfTextAtSize(next,size)<=width){line=next;continue;}if(line){result.push(line);line='';}let part='';for(const ch of word){if(f.widthOfTextAtSize(part+ch,size)>width&&part){result.push(part);part='';}part+=ch;}line=part;}if(line)result.push(line);}return result;}
 function text(p,value,x,top,{size=12,w=W-2*M,f=font,fill=C.ink,leading=size*1.35,maxHeight=Infinity,align='left'}={}){let content=lines(value,w,size,f);while(content.length*leading>maxHeight&&size>6){size-=.5;leading=size*1.35;content=lines(value,w,size,f);}if(content.length*leading>maxHeight)throw Error('Texten är för lång för sidans layout.');for(let i=0;i<content.length;i++){const ln=content[i],tx=x+(align==='right'?w-f.widthOfTextAtSize(ln,size):align==='center'?(w-f.widthOfTextAtSize(ln,size))/2:0),ty=H-top-size-i*leading;p.drawText(ln,{x:tx,y:ty,size,font:f,color:color(fill)});if(ty<18||tx<0||tx+f.widthOfTextAtSize(ln,size)>W+.1)throw Error('Text utanför sidans layout.');}audit.push({page:doc.getPages().indexOf(p)+1,top,height:content.length*leading,x,w,text:clean(value)});return content.length*leading;}
 function box(p,x,top,w,h,fill){p.drawRectangle({x,y:H-top-h,width:w,height:h,color:color(fill)});}
 function line(p,x1,top1,x2,top2,fill=C.line,thickness=1,dash){p.drawLine({start:{x:x1,y:H-top1},end:{x:x2,y:H-top2},color:color(fill),thickness,...(dash?{dashArray:dash}:{})});}
 function page(section,{dark=false}={}){const p=doc.addPage([W,H]);box(p,0,0,W,H,dark?C.navy:C.white);box(p,0,0,W,68,C.navy);p.drawImage(logo,{x:M,y:H-43,width:174,height:29.58});text(p,section.toUpperCase(),566,28,{size:9,f:bold,fill:C.white,w:W-M-566,align:'right'});box(p,0,66,W,2,C.yellow);return p;}
 function heading(p,title,subtitle){text(p,title,M,90,{size:28,f:bold,maxHeight:42});if(subtitle)text(p,subtitle,M,132,{size:12,fill:C.muted,maxHeight:38});}
 const referenceTitle=r.customerComparison?'Kundens avtal':'Kvartspris';
 const date=new Intl.DateTimeFormat('sv-SE',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/Stockholm'}).format(now);
 const diffWord=Math.abs(r.difference)<.005?'Samma beräknade kostnad':r.difference>0?'Beräknad besparing':'Beräknad merkostnad';
 let meetingPage=page('Vårt samtal'),meetingCursor=170;heading(meetingPage,s.customer,`${branchLabels[s.business]} - ${date}`);
 const followUp=s.followUp?new Intl.DateTimeFormat('sv-SE',{dateStyle:'long',timeZone:'UTC'}).format(new Date(s.followUp)):'Inte bestämt';
 const decisions=[['Det ni vill uppnå',s.goal||'Inte sammanfattat ännu'],['Föreslaget upplägg',contract.label+(s.recommendation?' - '+s.recommendation:' - vi bekräftar hur upplägget möter era behov.')],['Det här behöver vi kontrollera',s.checks||'Inte sammanfattat ännu'],['Nästa steg',s.next||'Inte bestämt'],['Ansvar och uppföljning',`${s.owner||'Ansvarig inte bestämd'} / Uppföljning: ${followUp}`]];
 for(const [title,value] of decisions){if(meetingCursor>428){meetingPage=page('Vårt samtal - fortsättning');meetingCursor=100;}text(meetingPage,title,M,meetingCursor,{size:10,f:bold,fill:C.blue});meetingCursor+=20;for(const ln of lines(value,864,13)){if(meetingCursor>474){meetingPage=page('Vårt samtal - fortsättning');text(meetingPage,title+' (fortsättning)',M,98,{size:10,f:bold,fill:C.blue});meetingCursor=122;}text(meetingPage,ln,M,meetingCursor,{size:13});meetingCursor+=18;}meetingCursor+=15;}
 const benefits=page('Avtalet i praktiken');heading(benefits,'Vad betyder avtalet för er?',copy.intro);
 const cardWidth=272;copy.benefits.forEach(([title,body],i)=>{const x=M+i*296;box(benefits,x,181,cardWidth,144,C.pale);text(benefits,'0'+(i+1),x+18,195,{size:11,f:bold,fill:C.blue});text(benefits,title,x+18,219,{size:17,w:cardWidth-36,f:bold,maxHeight:47});text(benefits,body,x+18,260,{size:11.5,w:cardWidth-36,maxHeight:53});});
 const caveat=contract.kind==='portfolio'?'Säkringarna är finansiella prisavtal. De kan dämpa prisuppgångar men också göra utfallet dyrare än rörligt. Förbrukning, dygnsprofil och övriga avgifter kan fortfarande påverka fakturan.':s.contract==='quarter'?'Ni bär marknadens prisvariationer. Månadsunderlaget visar inte vinsten av att flytta användning mellan kvartar.':['stable','direct'].includes(s.contract)?'Offerten avgör vad som är fast och vad som kan ändras. Det konstanta priset i kalkylen betyder inte att hela fakturan är garanterat fast.':'Ett fast pris per kWh betyder inte en fast månadsfaktura. Förbrukning, avtalets tillägg, elnät och skatt behöver också räknas med.';
 box(benefits,M,344,W-2*M,65,C.cream);text(benefits,'Att känna till',M+16,356,{size:10.5,f:bold});text(benefits,caveat,M+16,375,{size:10.5,w:W-2*M-32,maxHeight:29});
 text(benefits,'ATT PRATA VIDARE OM',M,437,{size:9,f:bold,fill:C.muted});text(benefits,BRANCH_PROMPTS[s.business],M,456,{size:17,w:864,maxHeight:40});
 const explanation=page('Avtalet i klartext');heading(explanation,contract.label,'Samma förklaring som i mötet - att läsa i lugn och ro.');
 let explanationTop=176;
 for(const [title,body] of agreementExplanation(s)){
  text(explanation,title,M,explanationTop,{size:12,f:bold,fill:C.blue});
  const height=text(explanation,body,278,explanationTop,{size:12,w:634,maxHeight:71});
  explanationTop+=Math.max(49,height+17);
  if(explanationTop<480)line(explanation,M,explanationTop-8,W-M,explanationTop-8);
 }
 const p=page('Prisjämförelsen');box(p,0,68,W,124,C.navy);text(p,'FÖRBERETT FÖR',M,88,{size:9,f:bold,fill:'#a6c6d3'});text(p,s.customer,M,108,{size:34,w:650,f:bold,fill:C.white,maxHeight:72});text(p,`${branchLabels[s.business]}\n${r.periodLabel}`,735,112,{size:12,w:177,fill:C.white,maxHeight:62,align:'right'});
 text(p,'VALT AVTAL',M,218,{size:9,f:bold,fill:C.muted});text(p,contract.label,M,237,{size:26,w:420,f:bold,maxHeight:38});
 text(p,'Med valt avtal',M,295,{size:11,fill:C.muted});text(p,amount(r.selected)+' kr',M,315,{size:26,w:215,f:bold,maxHeight:42});text(p,amount(r.selectedRate)+' öre/kWh',M,356,{size:13,w:215});
 text(p,r.customerComparison?'Med kundens avtal':'Med kvartspris',280,295,{size:11,fill:C.muted});text(p,amount(r.variable)+' kr',280,315,{size:26,w:215,f:bold,maxHeight:42});text(p,amount(r.variableRate)+' öre/kWh',280,356,{size:13,w:215});
 box(p,528,214,384,177,r.difference>=0?C.cream:'#fbe9e7');text(p,diffWord,552,237,{size:13,f:bold,w:336});text(p,amount(Math.abs(r.difference))+' kr',552,266,{size:40,f:bold,w:336,maxHeight:56});text(p,Math.abs(r.difference)<.005?'Ingen skillnad för samma förbrukning.':`${amount(Math.abs(r.differenceRate))} öre/kWh ${r.difference>0?'lägre':'högre'} än ${referenceTitle.toLowerCase()}`,552,332,{size:14,w:336,maxHeight:42});
 line(p,M,411,W-M,411);text(p,`${r.count} av ${r.totalMonths} månader  /  ${amount(r.volume)} kWh`,M,429,{size:14,f:bold});
 const basis=r.customerComparison?'Kundens inmatade avtals- eller fakturauppgifter jämförs med ett beräknat alternativ. Det är inte två verifierade faktiska utfall.':contract.kind==='manual'?'Manuellt pris jämfört med underlagets historiska kvartspriser. Ett prisscenario, inte ett historiskt utfall för avtalet.':contract.kind==='portfolio'?`${s.hedge} % säkrad volym i kalkylen. Volymandelen är inte samma sak som andel fast faktura.`:'Underlagets rörliga månadspriser används. Kundens kvartsmätvärden är inte beräknade.';
 text(p,basis+' Belopp exklusive moms, elnät och energiskatt. Ingen garanti för framtida besparing.',M,459,{size:10.5,fill:C.muted,maxHeight:34});
 const chartPage=page('Pris och kostnad');heading(chartPage,'Skillnaden, månad för månad','Priserna jämförs på samma förbrukning. Tomma månader saknar komplett underlag.');
 text(chartPage,contract.label,72,164,{size:10,f:bold,fill:C.blue});text(chartPage,referenceTitle+' (streckad)',445,164,{size:10,f:bold,fill:C.red});
 function drawChart(p,{top,height,kind}){
  const left=85,right=901,bottom=top+height,rows=r.rows,difference=kind==='difference',values=r.available.flatMap(x=>difference?[x.variable-x.selected]:[x.selectedRate,x.variableRate]);
  let low=Math.min(0,...values),high=Math.max(0,...values);const rough=Math.max((high-low)/4,.01),power=10**Math.floor(Math.log10(rough)),v=rough/power,step=(v<=1?1:v<=2?2:v<=5?5:10)*power;low=Math.floor(low/step)*step;high=Math.max(step,Math.ceil(high/step)*step);
  const xx=i=>left+i*(right-left)/Math.max(1,rows.length-1),yy=n=>bottom-(n-low)/(high-low)*height;
  for(let n=low;n<=high+step/100;n+=step){line(p,left,yy(n),right,yy(n),Math.abs(n)<1e-8?'#9bb1bc':C.line,.6);text(p,amount(difference?n/1000:n,step<1?2:0),M,yy(n)-5,{size:8,w:29,fill:C.muted,align:'right'});}
  text(p,difference?'tkr':'öre/kWh',M,top-18,{size:8.5,fill:C.muted});
  rows.forEach((row,i)=>{if(!row.available){box(p,xx(i)-10,top,20,height,C.pale);text(p,'-',xx(i)-8,top+height/2-5,{size:12,w:16,align:'center',fill:C.muted});}text(p,row.month,xx(i)-15,bottom+7,{size:8.5,w:30,align:'center',fill:C.muted});if(i===0||row.year!==rows[i-1].year)text(p,row.year,xx(i)-17,bottom+19,{size:8,w:34,align:'center',f:bold});});
  if(difference)rows.forEach((row,i)=>{if(row.available){const d=row.variable-row.selected;box(p,xx(i)-7,Math.min(yy(d),yy(0)),14,Math.max(.7,Math.abs(yy(d)-yy(0))),d>=0?C.blue:C.red);}});
  else for(const [key,fill,dash] of [['variableRate',C.red,[4,3]],['selectedRate',C.blue,null]]){rows.forEach((row,i)=>{if(!row.available)return;if(i&&rows[i-1].available)line(p,xx(i-1),yy(rows[i-1][key]),xx(i),yy(row[key]),fill,2,dash);p.drawCircle({x:xx(i),y:H-yy(row[key]),size:2,color:color(C.white),borderColor:color(fill),borderWidth:1.3});});}
 }
 drawChart(chartPage,{top:194,height:115,kind:'price'});text(chartPage,'Besparing eller merkostnad i kronor',M,357,{size:13,f:bold});text(chartPage,'Blått = lägre kostnad med valt avtal. Rött = högre kostnad.',490,359,{size:9,fill:C.muted,w:422});drawChart(chartPage,{top:394,height:64,kind:'difference'});
 if(s.notes.trim()){
  let notePage=page('Mötet och nästa steg'),cursor=158;heading(notePage,'Det här tar vi vidare',`${s.seller||'Er kontakt på Kraftringen'} - ${date}`);
  for(const [title,value] of [['Det här pratade vi om',s.notes]]){if(!value.trim())continue;if(cursor>425){notePage=page('Mötet - fortsättning');cursor=104;}text(notePage,title,M,cursor,{size:16,f:bold});cursor+=30;for(const ln of lines(value,864,13)){if(cursor>475){notePage=page('Mötet - fortsättning');text(notePage,title+' (fortsättning)',M,98,{size:16,f:bold});cursor=132;}text(notePage,ln,M,cursor,{size:13});cursor+=19;}cursor+=25;}
 }
 for(const year of r.years){
  const rows=r.rows.filter(x=>x.year===year),available=rows.filter(x=>x.available),vol=available.reduce((a,x)=>a+x.volume,0),selected=available.reduce((a,x)=>a+x.selected,0),variable=available.reduce((a,x)=>a+x.variable,0),delta=variable-selected;
  const detail=page('Siffror och antaganden');heading(detail,`Beräkningsunderlag ${year}`,`${available.length} av 12 månader ingår. ${s.consumptionMode==='shared'?'Samma förbrukningsprofil används för båda åren.':'Året har en separat förbrukningsprofil.'}`);
  const metrics=[['JÄMFÖRD VOLYM',amount(vol,0)+' kWh'],['VALT AVTAL',amount(selected)+' kr'],[referenceTitle.toUpperCase(),amount(variable)+' kr'],[delta>=0?'BESPARING':'MERKOSTNAD',amount(Math.abs(delta))+' kr']];metrics.forEach(([label,value],i)=>{text(detail,label,M+i*220,174,{size:8.5,f:bold,fill:C.muted,w:210});text(detail,value,M+i*220,192,{size:18,f:bold,w:210,maxHeight:28});});
  const cols=[{x:48,w:93,label:'Månad'},{x:141,w:112,label:'Förbrukning\nkWh'},{x:253,w:109,label:'Valt avtal\nöre/kWh'},{x:362,w:109,label:referenceTitle+'\nöre/kWh'},{x:471,w:144,label:'Valt avtal\nkr'},{x:615,w:144,label:referenceTitle+'\nkr'},{x:759,w:153,label:'Skillnad (+/-)\nkr'}];
  box(detail,M,232,864,34,C.navy);cols.forEach(c=>text(detail,c.label,c.x+8,238,{size:9,w:c.w-16,f:bold,fill:C.white}));
  rows.forEach((row,i)=>{const top=266+i*17;box(detail,M,top,864,17,i%2?C.white:C.pale);const cells=[row.month,amount(row.volume,2),row.available?amount(row.selectedRate):'-',row.available?amount(row.variableRate):'-',row.available?amount(row.selected):'-',row.available?amount(row.variable):'-',row.available?amount(row.variable-row.selected):'Saknar underlag'];cells.forEach((value,j)=>text(detail,value,cols[j].x+8,top+3,{size:9,w:cols[j].w-16,align:j?'right':'left',fill:j===6&&row.available&&row.variable<row.selected?C.red:C.ink}));});
  text(detail,'+ = lägre kostnad med valt avtal. - = högre kostnad. Snittpriser = kostnad / kWh × 100. Fasta avgifter ingår när de har lagts in.',M,480,{size:8.5,fill:C.muted,maxHeight:15});
 }
 const method=page('Så ska underlaget läsas');heading(method,'Tydliga siffror. Tydliga förutsättningar.','Det här ligger bakom jämförelsen.');
 const methodRows=[
 ['Prisunderlaget',contract.kind==='portfolio'?`Individuell portfölj och båda poolerna använder samma historiska prisunderlag. ${s.hedge} % av volymen räknas till säkrat månadspris och ${100-s.hedge} % till rörligt månadspris, med underlagets kostnadstillägg och ${amount(s.portfolioFee)} öre/kWh portföljpåslag.`:contract.kind==='manual'?`Offertens jämförpris på ${amount(s[manualPriceKey(s.contract)])} öre/kWh används för alla månader. Priset ska omfatta elhandelns påslag och tillägg. Inga tillägg läggs på automatiskt. ${s.contract==='direct'?'Direkt har separata månadssäkringspriser; detta är ett förenklat scenario med ett jämförpris, inte avtalets månadskalkyl.':''}`:'Kvartspris jämförs med samma rörliga månadsunderlag. Kundens kvartsmätvärden ingår inte.'],
 ['Jämförelsen',r.customerComparison?`Kundens inmatade priser eller fakturerade elhandelsbelopp används för ${r.count} gemensamma månader. Förslagets fasta avgift är ${amount(s.selectedMonthlyFee)} kr/månad. Saknade månader och fakturor med avvikande förbrukning ingår inte. Se kundavtalets källa på nästa sida.`:`Kvartspris beräknas med underlagets rörliga månadspris, kostnadstillägg och ${amount(s.variableFee)} öre/kWh påslag. Totalt ingår ${r.count} av ${r.totalMonths} månader. ${r.count<r.totalMonths?'Saknade månader räknas inte som noll och extrapoleras inte.':''}`],
 ['Förbrukningen',r.years.map(y=>`${y}: ${s.sources[y]==='estimated'?'uppskattad månadsfördelning':s.sources[y]==='file'?'förbrukning från tidigare underlag':'inlagda månadsvärden'}`).join('. ')+'. Beloppen ändras om förbrukningen ändras.'],
 ['Omfattningen','Beloppen gäller elhandel, exklusive moms, elnät och energiskatt. Prissäkrad volym innebär inte att samma andel av hela fakturan är fast. Historiska priser och scenarier är ingen garanti för framtida besparing.'],
 ['Kundrösterna',`${stories.map(x=>x.title).join(' och ')} följer på nästa sidor. ${STORY_SOURCE_NOTE}`]
 ];let cursor=177;methodRows.forEach(([title,body])=>{text(method,title,M,cursor,{size:12,w:170,f:bold});const h=text(method,body,236,cursor,{size:11,w:676,maxHeight:64});cursor+=Math.max(42,h+14);if(cursor<482)line(method,M,cursor-7,W-M,cursor-7);});
 if(r.customerComparison){
  const a=s.customerAgreement;let cp=page('Kundens nuvarande avtal'),cy=176;heading(cp,'Kundens avtal och prisuppgift','Kundspecifikt underlag, inmatat av säljaren. Ingen generell leverantörsprislista.');
  const fields=[['Leverantör och kund',`${a.provider} / ${a.customer}`],['Avtalet',`${AGREEMENT_TYPES[a.type]}${a.product?' / '+a.product:''} / ${a.area} / ${a.from} - ${a.to}`],['Källa',`${SOURCE_TYPES[a.sourceType]}: ${a.sourceRef} / Datum: ${a.sourceDate}`],['Prisuppgiften',`${PRICE_MODES[a.mode]}.${a.mode==='constant'?' '+amount(a.rate)+' öre/kWh.':''} ${a.mode==='invoice'?'Hela elhandelsbeloppet inklusive fasta avgifter är inmatat per månad.':`${a.composition==='total'?'Inmatat pris per kWh innehåller samtliga elhandelstillägg.':`Energipris + ${amount(a.margin)} öre/kWh påslag + ${amount(a.other)} öre/kWh övriga tillägg.`} Fast avgift: ${amount(a.monthlyFee)} kr/månad.`}`],['Beräkningsgrund',customerBasis(s)],['Registrering',s.customerAgreementRecord?`Prisbankspost ${s.customerAgreementRecord.id}. Registrerad av ${s.customerAgreementRecord.createdName} / ${s.customerAgreementRecord.createdAt}. Formuläret kan ha ändrats efter att posten lästes in; PDF:en visar mötets aktuella uppgifter.`:'Uppgiften är inmatad i mötet och saknar sparad prisbankspost.'],['Kommentar',a.notes||'Ingen kommentar.']];
  for(const [title,body] of fields){if(cy>420){cp=page('Kundens avtal - fortsättning');cy=100;}text(cp,title,M,cy,{size:10,f:bold,fill:C.blue});cy+=19;for(const ln of lines(body,864,12)){if(cy>476){cp=page('Kundens avtal - fortsättning');cy=100;}text(cp,ln,M,cy,{size:12});cy+=17;}cy+=14;}
 }
 const corePages=doc.getPageCount();
 for(const story of stories){const ref=page('Kundernas egna ord');heading(ref,story.title,story.sector);box(ref,M,176,864,216,C.pale);text(ref,'”'+story.quote+'”',M+28,198,{size:23,w:808,maxHeight:158,leading:31});text(ref,story.person,M+28,361,{size:13,f:bold,w:808,maxHeight:20});text(ref,'Källa: '+story.source,M,414,{size:11,fill:C.muted,maxHeight:38});text(ref,'Erfarenheten gäller portföljförvaltning. Inget löfte om ett visst pris eller resultat.',M,465,{size:10.5,fill:C.muted,maxHeight:28});}
 const pages=doc.getPages();pages.forEach((p,i)=>{line(p,M,505,W-M,505);text(p,`${s.seller||'Kraftringen'}  /  ${date}`,M,513,{size:8,w:650,fill:C.muted,maxHeight:13});text(p,`${i+1} / ${pages.length}`,822,513,{size:8,w:90,fill:C.muted,align:'right'});});
 return {bytes:await doc.save(),filename:pdfFilename(s),pageCount:pages.length,corePages,storyTitles:stories.map(x=>x.title),replacedCharacters:[...replaced],audit};
}

````

## Fil: public/meeting-stories.mjs

````text
export const STORY_CATALOG={
 "mats-palm": {
  "title": "Mats Palm",
  "sector": "Lantbruk",
  "person": "Mats Palm",
  "headline": "En genomtänkt strategi över tid",
  "quote": "Jag driver inte ett jordbruk för att sitta och spekulera i elpriset. Det viktiga är att ha en genomtänkt strategi över tid och slippa stressen kring när man ska binda. Det här upplägget känns betydligt mer seriöst än hur vi arbetade tidigare.",
  "summary": "En genomtänkt strategi över tid",
  "source": "Trygg Portfölj – ett stabilt alternativ till rörligt pris, avsnitt Kundreferenser, Kraftringen."
 },
 "freja": {
  "title": "FREJA",
  "sector": "Transport och logistik",
  "person": "Marina Wallin",
  "headline": "En kontakt som känner verksamheten",
  "quote": "Det är så värdefullt för oss att ha en personlig kontakt på Kraftringen – det förenklar dialogen och ger oss tillgång till hjälp från någon som känner vår verksamhet och kan guida oss.",
  "summary": "En kontakt som känner verksamheten",
  "source": "Trygg Portfölj – ett stabilt alternativ till rörligt pris, avsnitt Kundreferenser, Kraftringen."
 },
 "repligen": {
  "title": "Repligen Sweden AB",
  "sector": "Industri",
  "person": "Anders Rosberg",
  "headline": "Trygghet och marknadskunskap",
  "quote": "För oss handlar portföljavtalet om trygghet. Vi slipper gissa oss fram i elmarknaden och vet att någon som kan det här följer utvecklingen åt oss.",
  "summary": "Trygghet och marknadskunskap",
  "source": "Trygg Portfölj – ett stabilt alternativ till rörligt pris, avsnitt Kundreferenser, Kraftringen."
 },
 "ica-bjarred": {
  "title": "ICA Bjärred",
  "sector": "Dagligvaruhandel",
  "person": "Alex",
  "headline": "Kontroll och långsiktig strategi",
  "quote": "För oss handlar det inte om att vinna en enskild månad. Det handlar om kontroll, stabilitet och en långsiktig strategi kring energikostnaderna. Nu arbetar vi mycket mer strukturerat.",
  "summary": "Kontroll och långsiktig strategi",
  "source": "Trygg Portfölj – ett stabilt alternativ till rörligt pris, avsnitt Kundreferenser, Kraftringen."
 },
 "planetstaden": {
  "title": "First Hotel Planetstaden",
  "sector": "Hotell",
  "person": "Malin",
  "headline": "Bättre förutsägbarhet i verksamheten",
  "quote": "För oss är det viktigare att ha en långsiktig och genomtänkt strategi än att försöka tajma rätt månad eller vecka. Portföljupplägget har skapat en större trygghet och bättre förutsägbarhet i vår verksamhet.",
  "summary": "Bättre förutsägbarhet i verksamheten",
  "source": "Trygg Portfölj – ett stabilt alternativ till rörligt pris, avsnitt Kundreferenser, Kraftringen."
 }
};
export const STORY_PAIRS={
 "company": [
  [
   "repligen",
   "Marknadsbevakning och trygghet."
  ],
  [
   "ica-bjarred",
   "Kontroll och en långsiktig strategi."
  ]
 ],
 "brf": [
  [
   "ica-bjarred",
   "Närliggande behov: kontroll över energikostnaden."
  ],
  [
   "planetstaden",
   "Närliggande behov: förutsägbarhet i verksamheten."
  ]
 ],
 "hotel": [
  [
   "planetstaden",
   "Samma bransch: hotell och långsiktig planering."
  ],
  [
   "freja",
   "Personlig kontakt och vägledning."
  ]
 ],
 "industry": [
  [
   "repligen",
   "Samma bransch: industri och marknadsbevakning."
  ],
  [
   "ica-bjarred",
   "Kontroll och struktur kring energikostnaden."
  ]
 ],
 "farm": [
  [
   "mats-palm",
   "Samma bransch: lantbruk och inköpsstrategi."
  ],
  [
   "ica-bjarred",
   "Långsiktig kostnadsplanering."
  ]
 ],
 "shop": [
  [
   "ica-bjarred",
   "Samma bransch: dagligvaruhandel och kostnadskontroll."
  ],
  [
   "planetstaden",
   "Långsiktig planering i en serviceverksamhet."
  ]
 ],
 "transport": [
  [
   "freja",
   "Samma bransch: transport och personlig kontakt."
  ],
  [
   "repligen",
   "Marknadsbevakning och fokus på verksamheten."
  ]
 ],
 "property": [
  [
   "planetstaden",
   "Närliggande behov: förutsägbarhet i verksamheten."
  ],
  [
   "ica-bjarred",
   "Kontroll över energikostnaden."
  ]
 ],
 "other": [
  [
   "repligen",
   "Marknadsbevakning och trygghet."
  ],
  [
   "ica-bjarred",
   "Kontroll och en långsiktig strategi."
  ]
 ]
};
export const STORY_SOURCE_NOTE='Kundernas egna erfarenheter ur Kraftringens presentation Trygg Portfölj. Citaten beskriver portföljförvaltning och är inget löfte om ett visst pris eller resultat.';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function validStoryChoice(choice,business){return !!choice&&choice.business===business&&Array.isArray(choice.ids)&&choice.ids.length===2&&new Set(choice.ids).size===2&&choice.ids.every(id=>typeof id==='string'&&Object.hasOwn(STORY_CATALOG,id));}
export function selectedStories(business,choice){const pair=STORY_PAIRS[business]??STORY_PAIRS.other;return (validStoryChoice(choice,business)?choice.ids:pair.map(x=>x[0])).map(id=>({id,...STORY_CATALOG[id],reason:pair.find(x=>x[0]===id)?.[1]??'Vald som ett relevant exempel för vårt samtal.'}));}
export function storyPickerHtml(business,choice,{compact=false}={}){
 const stories=selectedStories(business,choice),manual=validStoryChoice(choice,business);
 return `<section class="sheet compact-stories" aria-labelledby="storiesHeading"><div class="stories-heading"><div><p class="eyebrow">ERFARENHETER AV PORTFÖLJFÖRVALTNING</p><h2 id="storiesHeading">Två kundröster att ta med</h2></div></div><div class="story-list">${stories.map(story=>`<a class="story-row" href="/presentation.html?deck=${story.id}" target="_blank" rel="noopener" aria-label="Läs kundrösten från ${story.title}"><span class="quote-mark" aria-hidden="true">”</span><span><small>${story.sector}</small><strong>${story.title}</strong><small>${story.headline}</small></span><span class="story-arrow" aria-hidden="true">↗</span></a>`).join('')}</div><p class="reference-source">Ur Kraftringens presentation Trygg Portfölj. Kundernas erfarenheter gäller portföljförvaltning.</p><details id="storyChoices"><summary>Se urvalet eller byt kundröster</summary><p class="muted">${manual?'Valda för vårt samtal.':'Förslag utifrån er bransch eller liknande behov.'}</p>${stories.map((story,i)=>`<label for="storyChoice${i}">Kundröst ${i+1}<select id="storyChoice${i}" data-story-slot="${i}">${Object.entries(STORY_CATALOG).map(([id,item])=>`<option value="${id}" ${id===story.id?'selected':''} ${id===stories[1-i].id?'disabled':''}>${item.title} · ${item.sector}</option>`).join('')}</select></label><p class="muted">${story.reason}</p>`).join('')}${manual?'<button type="button" class="text-button" data-story-auto>Återställ branschens förslag</button>':''}<p class="muted">${STORY_SOURCE_NOTE}</p></details></section>`;
}
export async function embeddedStoryAppendix(business,choice){return `<section class="export-stories"><h2>Kundernas egna ord</h2>${selectedStories(business,choice).map(story=>`<article class="export-story"><p>${esc(story.sector)}</p><h3>${esc(story.title)}</h3><blockquote>”${esc(story.quote)}”</blockquote><p>${esc(story.person)}</p><p>${esc(story.source)}</p></article>`).join('')}<p>${STORY_SOURCE_NOTE}</p></section>`;}

````

## Fil: public/meeting-summary.mjs

````text
import {CONTRACTS} from './meeting-model.mjs';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>new Intl.NumberFormat('sv-SE',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n);
export function closingOverviewHtml(s,r,branch){
 const same=Math.abs(r.difference)<.005,lower=r.difference>0;
 return `<section class="closing-overview" aria-label="Mötets sammanfattning"><div class="closing-customer"><p class="eyebrow">ERT MÖTE I KORTHET</p><h2>${esc(s.customer)}</h2><p>${esc(branch)} · ${r.periodLabel}</p></div><div class="closing-needs"><div><span>Det ni vill uppnå</span><p>${esc(s.goal||'Inte sammanfattat ännu')}</p></div><div><span>Därför föreslår vi upplägget</span><p>${esc(s.recommendation||'Vi bekräftar tillsammans hur förslaget möter era behov.')}</p></div></div><div class="closing-facts"><div><span>Föreslaget upplägg</span><strong>${CONTRACTS[s.contract].label}</strong><small>${r.count} av ${r.totalMonths} månader i jämförelsen</small></div><div><span>${same?'Samma beräknade kostnad':lower?'Beräknad besparing':'Beräknad merkostnad'}</span><strong>${fmt(Math.abs(r.difference))} kr</strong><small>${fmt(Math.abs(r.differenceRate))} öre/kWh ${same?'i skillnad':lower?'lägre':'högre'} än ${esc(r.referenceLabel||'Kvartspris')}</small></div></div><p class="overview-note">Elhandel exklusive moms, elnät och energiskatt. Ingen garanti för framtida besparing.</p></section>`;
}

````

## Fil: public/mobile-app.css

````text
/* The compact app shares all inputs and calculations with the desktop room. */
.mobile-shell,.mobile-home,.mobile-compare-toolbar{display:none}
@media screen and (max-width:700px){
 :root{--mobile-bg:#f2f4f7;--mobile-muted:#62717e}
 html{scroll-padding-top:20px;scroll-behavior:auto}
 body{background:var(--mobile-bg);padding-bottom:calc(106px + env(safe-area-inset-bottom));color:#013c57}
 body:has(dialog[open]){overflow:hidden}
 .header,.contextline,.hero,.summary-strip,.app-install-bar,main>footer{display:none!important}
 main{max-width:600px;padding:0 max(20px,env(safe-area-inset-right)) 24px max(20px,env(safe-area-inset-left))}
 .mobile-shell{display:block;max-width:600px;margin:auto;padding:calc(20px + env(safe-area-inset-top)) 20px 0}
 .mobile-brand{display:flex;align-items:center;justify-content:space-between;margin:0 4px 20px}
 .mobile-brand img{filter:brightness(0) saturate(100%) invert(17%) sepia(32%) saturate(1694%) hue-rotate(160deg) brightness(90%);width:138px;height:auto}
 .mobile-brand>span{font-size:12px;letter-spacing:.3px;color:var(--mobile-muted)}
 .mobile-topbar{display:flex;gap:12px;align-items:center;margin-bottom:22px}
 .customer-pill{display:flex;align-items:center;gap:12px;flex:1;min-width:0;text-align:left;border:0;border-radius:30px;background:#fff;padding:15px 19px;min-height:56px;box-shadow:0 6px 28px #013c5705}
 .customer-pill span{font-size:15px;font-weight:500;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;flex:1}
 .customer-pill svg{flex-shrink:0;width:18px;height:18px}
 .round-button{border:0;border-radius:50%;height:54px;width:54px;display:grid;place-items:center;background:#fff;flex-shrink:0;padding:15px}
 .round-button svg{width:24px;height:24px}
 .mobile-yearbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:26px}
 .mobile-years{display:flex;gap:6px}
 .mobile-years button{min-width:72px;min-height:44px;background:transparent;border:0;border-radius:24px;font-size:16px;font-weight:500;color:var(--mobile-muted)}
 .mobile-years button[aria-pressed=true]{background:#013c57;color:#fff}
 #mobileCoverage{font-size:11px;color:var(--mobile-muted)}
 .mobile-home{display:block}
 body[data-mobile-page]:not([data-mobile-page=home]) #home,body[data-mobile-page]:not([data-mobile-page=explore]) #explore,body[data-mobile-page]:not([data-mobile-page=profile]) #profile,body[data-mobile-page]:not([data-mobile-page=meeting]) #meeting{display:none!important}
 .mobile-page-title{margin:0 4px 24px}.mobile-page-title p{font-size:10px;letter-spacing:1.6px;font-weight:500;margin:0 0 10px;color:var(--mobile-muted)}
 .mobile-page-title h1{font-size:36px;font-weight:500;letter-spacing:-1.3px;line-height:1.2;margin:0}
 .mobile-savings{background:#fbc34e;border-radius:28px;padding:24px 24px 18px;overflow:hidden}
 .mobile-card-label{display:flex;justify-content:space-between;align-items:center;gap:15px;font-size:14px;font-weight:500}
 .mobile-card-label svg{width:27px;height:27px;stroke:currentColor;stroke-width:1.7;fill:none}
 .mobile-amount{display:flex;align-items:baseline;gap:9px;margin:25px 0 8px;font-variant-numeric:tabular-nums}
 .mobile-amount strong{font-size:clamp(29px,8.4vw,48px);font-weight:600;line-height:1.12;letter-spacing:-1.8px;overflow-wrap:anywhere}
 .mobile-amount>span{font-size:18px}
 .mobile-savings>p{font-size:14px;margin:0 0 24px;font-weight:500;line-height:1.7}
 .mobile-savings-bottom{border-top:1px solid #013c5726;padding-top:14px;display:flex;justify-content:space-between;align-items:center;gap:6px}
 .mobile-savings-bottom>span{font-size:11px}.mobile-savings-bottom>a{height:44px;width:44px;display:grid;place-items:center;border:1px solid #013c5730;border-radius:50%;flex-shrink:0}
 .mobile-savings-bottom svg{height:20px;width:20px;stroke:currentColor;stroke-width:1.6;fill:none}
 .mobile-savings[data-kind=extra]{background:#f8c3c6}.mobile-savings[data-kind=extra] .mobile-card-label svg{transform:scaleY(-1)}.mobile-savings[data-kind=equal],.mobile-savings[data-kind=empty]{background:#e0e8ee}
 .mobile-basis{font-size:11px;line-height:1.8;color:var(--mobile-muted);margin:14px 6px 24px}
 .mobile-card{background:white;border:0;border-radius:26px;padding:23px;margin-bottom:18px;box-shadow:none}
 .mobile-card-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:23px}.mobile-card h2{font-size:18px;font-weight:500;letter-spacing:-.4px;line-height:1.5}.mobile-card-heading a{min-width:35px;min-height:44px;display:grid;place-items:center;font-size:24px;color:var(--mobile-muted)}
 .mobile-cost-row{display:flex;align-items:center;gap:14px}.mobile-tile{width:46px;height:46px;border-radius:15px;display:grid;place-items:center;flex-shrink:0}.mobile-tile.pink{background:#fbe0e2}.mobile-tile.blue{background:#d9eef5}.mobile-tile svg{width:25px;height:25px;stroke:currentColor;stroke-width:1.7;fill:none;stroke-linecap:round;stroke-linejoin:round}
 .mobile-cost-row>div{flex:1;min-width:0;display:grid;grid-template-columns:1fr;gap:3px}.mobile-cost-row>div>span{font-size:13px;color:var(--mobile-muted)}.mobile-cost-row strong{font-size:23px;font-weight:500;letter-spacing:-.7px;overflow-wrap:anywhere}.mobile-cost-row small{font-size:12px;color:var(--mobile-muted)}
 .mobile-cost-track{height:7px;background:#edf0f4;border-radius:6px;margin:14px 0 24px}.mobile-cost-track span{display:block;background:#f1a8ab;height:100%;border-radius:6px;max-width:100%;transition:width .25s}.mobile-cost-track.portfolio span{background:#007aa3}.mobile-costs>p{font-size:11px;color:var(--mobile-muted);line-height:1.7;margin:0}.mobile-cost-track.portfolio{margin-bottom:15px}
 .mobile-action-card{width:100%;text-align:left;display:flex;align-items:center;gap:14px;min-height:124px}.mobile-action-card>span:nth-child(2){flex:1;min-width:0}.mobile-action-card>span>span{font-size:12px;color:var(--mobile-muted);display:block;line-height:1.5}.mobile-action-card strong{font-size:22px;display:block;letter-spacing:-.6px;font-weight:500;line-height:1.5;margin:4px 0}.mobile-action-card small{font-size:11px;color:var(--mobile-muted);display:block;line-height:1.6}.chevron{font-size:28px;font-weight:400;color:#81909b}
 .mobile-share-button{width:100%;display:flex;align-items:center;justify-content:space-between;gap:15px;background:#013c57;color:#fff;border:0;border-radius:20px;min-height:58px;padding:16px 23px;font-size:15px;font-weight:500}.mobile-share-button svg{width:21px;height:21px;stroke:currentColor;fill:none;stroke-width:1.6}.mobile-endnote{font-size:11px;line-height:1.8;color:var(--mobile-muted);margin:12px 6px 0}
 .app-nav{position:fixed;z-index:10;display:flex;left:max(16px,env(safe-area-inset-left));right:max(16px,env(safe-area-inset-right));bottom:calc(12px + env(safe-area-inset-bottom));width:auto;max-width:560px;margin:0 auto;border:2px solid #fff;background:#ffffffed;border-radius:40px;padding:5px;box-shadow:0 8px 45px #013c5712;backdrop-filter:blur(20px)}
 .app-nav a{min-width:0;flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;border-radius:30px;min-height:62px;font-size:11px;font-weight:500;color:#64747f}
 .app-nav svg{width:25px;height:25px;stroke:currentColor;fill:none;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
 .app-nav a[aria-current=page]{background:#e5edf2;color:#013c57;font-weight:600}.app-nav a[aria-current=location]{background:transparent}
 #toast{bottom:calc(98px + env(safe-area-inset-bottom));font-size:12px}
 /* Focused mobile pages instead of one compressed desktop canvas. */
 .explore{padding:0}.section-heading{margin:0 4px 24px;display:block}.section-heading h2{font-size:29px;font-weight:500;line-height:1.3;letter-spacing:-.8px}.section-heading .eyebrow{font-size:10px;margin-bottom:10px;font-weight:500}.section-heading .quiet{display:none}
 .mobile-compare-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:24px}
 .mobile-compare-toolbar>div{display:flex;background:#e4e9ee;padding:5px;border-radius:30px;flex:1}.mobile-compare-toolbar>div button{border:0;background:transparent;border-radius:24px;min-height:44px;flex:1;font-size:13px}.mobile-compare-toolbar>div button[aria-pressed=true]{background:#fff;font-weight:500;box-shadow:0 3px 10px #013c5706}
 .explore-grid{display:block}.comparison{background:transparent;border:0;box-shadow:none;padding:0;border-radius:0}.comparison>.scenario-tabs{display:none}.comparison-summary{margin:0}.comparison-heading{display:block;margin:0 4px 18px}.comparison-heading h3{font-size:18px;line-height:1.6;margin-bottom:10px}.comparison-heading p{font-size:12px;line-height:1.8;margin-bottom:12px}.controls-link{display:none}.cost-cards{display:grid;grid-template-columns:1fr;gap:18px}.cost-card{display:block;border:0;border-radius:25px;background:white;padding:24px}.cost-card h4{font-size:16px;margin:0 0 20px;display:flex;align-items:center;gap:9px}.cost-card .dot{width:9px;height:9px}.cost-card .metric-caption{font-size:12px;margin:17px 0 6px}.cost-card .rate-value{display:block;font-size:36px;font-weight:500;line-height:1.4;letter-spacing:-1px}.cost-card .rate-value small{display:inline;font-size:13px;margin:0}.cost-card .money-value{font-size:29px;font-weight:500;line-height:1.4}.cost-card p{font-size:12px;line-height:1.8;margin-top:17px}.portfolio-card{background:#e2eff5}
 .savings-panel{padding:24px;border-radius:25px;margin-top:18px}.savings-panel h4{font-size:15px;line-height:1.6}.savings-values{display:flex;flex-direction:column;gap:20px}.savings-values>div+div{border:0;border-top:1px solid #013c5726;padding:19px 0 0}.savings-values strong{font-size:36px}.savings-values span,.savings-panel p{font-size:12px;line-height:1.7}.comparison-note{font-size:11px;line-height:1.8;margin:18px 6px}.fixed-reference{background:white;border:0;border-radius:22px;padding:22px;font-size:12px;gap:12px 18px}.fixed-reference>span{width:100%;font-size:13px}.fixed-reference small{font-size:11px}
 body[data-mobile-comparison=year] .month-explorer,body[data-mobile-comparison=year] .price-breakdown{display:none}
 body[data-mobile-comparison=months] .comparison-summary,body[data-mobile-comparison=months] .comparison>.insight{display:none}
 .month-explorer{padding:0;border:0;margin:0}.month-explorer .chart-toolbar{display:flex;flex-direction:column;gap:18px}.month-explorer .chart-toolbar h3{font-size:25px;line-height:1.4}.chart-eyebrow{display:none}.unit-toggle{border:0;padding:5px;border-radius:18px;width:100%;background:#e4e9ee}.unit-toggle button{font-size:13px;min-height:44px;border-radius:14px}.unit-toggle button[aria-pressed=true]{background:#fff;color:#013c57}.chart-instruction{font-size:12px;line-height:1.8;margin:16px 4px}
 .month-buttons{display:flex;position:relative;gap:8px;overflow-x:auto;overscroll-behavior-x:contain;scrollbar-width:none;margin:0 -20px 20px;padding:3px 20px 6px}.month-buttons::-webkit-scrollbar{display:none}.month-button{flex:0 0 55px;min-height:48px;padding:8px 10px;border-radius:24px;border:0;color:#013c57}.month-button .month-bar-space,.month-button .month-value{display:none}.month-button .month-name{font-size:14px;margin:0;font-weight:500}.month-button[aria-pressed=true]{background:#013c57;box-shadow:none}.month-button[aria-pressed=true] .month-name{color:#fff}.month-button:disabled{opacity:.35}
 .month-focus{padding:24px;border-radius:26px}.month-focus-heading{align-items:center;gap:12px;margin-bottom:25px}.month-focus-heading>div>span{font-size:9px}.month-focus-heading h4{font-size:20px;line-height:1.4;margin-top:6px}.month-focus-heading>p{font-size:12px;line-height:1.6;margin:0;white-space:normal}.month-focus-heading>p>span{font-size:11px;display:block}.month-metrics{display:flex;flex-direction:column;align-items:stretch;gap:22px}.month-metric>span{font-size:13px}.month-metric strong{font-size:28px;line-height:1.4;font-weight:500;margin-top:8px}.month-metric strong small{font-size:13px}.month-metric p{font-size:13px}.month-metric+.month-metric{padding-top:20px;border-top:1px solid #ffffff25}.month-result{padding:20px;border-radius:19px;display:block}.month-result>span{font-size:12px;line-height:1.6}.month-result strong{font-size:30px;margin-top:10px}.month-result strong small{font-size:13px}.month-result p{font-size:12px;max-width:none;text-align:left;margin-top:8px}
 .month-explorer .chart-header{margin:25px 4px 10px;align-items:center}.month-explorer .chart-header h4{font-size:14px}.month-explorer .chart-header>span{display:block;font-size:11px}.month-explorer .cost-chart{background:white;border-radius:20px;padding:20px 10px;margin:0 0 15px}.month-explorer .chart-scroll svg{min-width:550px}.month-explorer .legend{font-size:11px;line-height:1.6;gap:12px 18px;padding:0 4px}.gap-key{width:100%;margin:0}.month-explorer .mobile-chart-hint{display:block;font-size:11px;margin:12px 4px 20px}.month-nav-heading{display:none!important}.month-chart-footer{font-size:11px;line-height:1.8;margin:18px 4px}.month-chart-footer>span:not(#chartAvailability){display:none}#chartAvailability{margin:0}
 .price-breakdown{border:0;border-radius:24px;background:white;padding:24px;margin-top:24px}.breakdown-heading{font-size:13px;line-height:1.7}.price-breakdown>div{display:grid;grid-template-columns:1fr 1fr;gap:20px}.price-breakdown>div>b{display:none}.price-breakdown>div>span{font-size:11px;line-height:1.7}.price-breakdown strong{font-size:24px;font-weight:500}.insight{margin:22px 4px;align-items:start}.insight p{font-size:12px;line-height:1.8}.insight-icon{margin-top:3px}
 .calculation{background:#e8edf2;border:0;border-radius:22px;padding:0 20px;margin-top:24px}.calculation summary{font-size:12px;line-height:1.8;padding:20px 0;gap:15px}.calculation-body{font-size:13px;line-height:1.8}.calculation table{font-size:12px}.calculation th,.calculation td{padding:12px}.source-filename{font-size:11px}
 .profile-section{display:block;padding:0;border:0}.profile-copy{margin:0 4px 26px}.profile-copy .eyebrow{font-size:10px}.profile-copy h2{font-size:29px;font-weight:500;line-height:1.35}.profile-copy h2 br{display:none}.profile-copy p:not(.eyebrow){max-width:none;font-size:14px;line-height:1.8;margin:20px 0}.profile-copy .btn{width:100%;font-size:14px;min-height:54px;border:0;background:#013c57;color:white;border-radius:18px}.source-note{font-size:11px;line-height:1.7;margin-top:16px}.profile-visual{padding:24px;background:white;border-radius:26px}.profile-chart-top{display:block}.profile-chart-top h3{font-size:16px;line-height:1.5;margin-bottom:8px}.profile-chart-top span{font-size:11px}.profile-chart{height:210px;overflow-x:auto;gap:10px;padding-bottom:8px}.profile-bar{flex:0 0 28px;min-width:28px}.profile-chart .value,.profile-chart .month{font-size:10px}.profile-bar .bar{border-radius:6px}.profile-facts{flex-direction:column;font-size:12px;line-height:1.8;gap:14px;margin-top:20px;padding-top:20px}
 .meeting-section{padding:0;border:0}.save-status{display:block;font-size:11px;margin-top:15px}.meeting-grid{display:block}.notes-block,.next-block{padding:24px;background:white;border-radius:26px;margin-bottom:20px}.meeting-grid label{font-size:14px;line-height:1.7}.meeting-grid input,.meeting-grid select,.meeting-grid textarea{font-size:16px;border-radius:12px;padding:14px;min-height:50px;background:#f7f9fb}.meeting-grid textarea{min-height:220px;font-size:16px;line-height:1.8}.next-fields{display:block;margin-top:20px}.next-fields label+label{margin-top:20px}.next-block p,.notes-share-hint{font-size:11px;line-height:1.8;margin-top:14px}.meeting-bottom{display:block;padding:0 4px}.meeting-bottom p{font-size:13px;line-height:1.8;margin-bottom:18px}.meeting-actions{display:flex;flex-direction:column;gap:12px}.meeting-actions .btn{width:100%;min-height:56px;border-radius:18px;font-size:14px}.meeting-actions #shareBottom{order:-1;background:#013c57;color:white}
 /* Native modal sheets keep controls accessible and preserve focus / Escape. */
 dialog,#shareDialog,#exportDialog,#installDialog{width:100%;max-width:600px;max-height:calc(94dvh - env(safe-area-inset-top));margin:auto auto 0;border:0;border-radius:28px 28px 0 0;padding:26px 24px calc(28px + env(safe-area-inset-bottom));overscroll-behavior:contain}
 dialog .dialog-head{margin-bottom:24px;align-items:center;gap:12px}dialog .dialog-head h2{font-size:25px;font-weight:500;line-height:1.4}dialog .eyebrow{font-size:9px;line-height:1.6}.close{width:44px;height:44px;font-size:25px;position:sticky;top:0;z-index:2}.dialog-head{position:relative}
 dialog label,.share-fields label{font-size:13px;line-height:1.7}dialog input:not([type=file]):not([type=range]):not([type=radio]):not([type=checkbox]),dialog select{font-size:16px!important;min-height:50px;border-radius:12px;padding:12px!important}.month-grid{grid-template-columns:1fr 1fr;gap:18px 14px}.month-grid label{font-size:13px}.month-grid label span{font-size:10px}.dialog-actions{gap:10px;flex-wrap:wrap}.dialog-actions .btn{flex:1;min-height:52px;font-size:13px!important;border-radius:15px}.profile-entry-mode{margin:24px 0;display:flex;flex-direction:column;gap:5px;border-radius:18px;padding:5px}.profile-entry-mode button{font-size:13px;min-height:50px;border-radius:14px}.annual-entry{grid-template-columns:minmax(0,1fr) 90px}.annual-unit-help,.annual-assumption,#annualPeriodNote{font-size:12px;line-height:1.8}.profile-shapes{grid-template-columns:1fr}.profile-shapes label{padding:18px!important;border-radius:16px;align-items:center!important}.profile-shapes strong{font-size:14px}.profile-shapes small{font-size:11px}.profile-shapes label span{display:block}.profile-shapes small{text-align:left;margin-top:4px}#annualPreviewSummary{font-size:13px}.annual-preview{padding:18px;border-radius:16px}.import-area{border-radius:16px}.import-area strong{font-size:13px}.import-area p,.import-area .text-btn,.form-message{font-size:12px;line-height:1.8}.import-area .file-label{font-size:13px}.consumption-unit-note{font-size:12px;border:0;border-radius:15px;padding:16px}.profile-dialog-total{font-size:12px;gap:15px;line-height:1.8}.profile-dialog-total strong{white-space:nowrap}
 #mobileControlsDialog{background:#fff}#mobileControlsSlot .controls{display:block;position:static;background:#fff;color:#013c57;padding:0;border-radius:0;overflow:visible}#mobileControlsSlot .control-heading,#mobileControlsSlot .controls h3,#mobileControlsSlot .control-intro,#mobileControlsSlot .control-return{display:none}
 .mobile-live-result{font-size:15px;font-weight:500;line-height:1.7;background:#fff1cc;border-radius:18px;padding:18px;margin-bottom:28px}
 #mobileControlsSlot .control{margin-bottom:30px}#mobileControlsSlot .control label{font-size:14px;margin-bottom:18px}#mobileControlsSlot .control output{font-size:24px;color:#013c57}#mobileControlsSlot .range-labels{font-size:11px;color:#62717e;margin-top:16px}
 #mobileControlsSlot input[type=range]{height:24px;appearance:none;background:linear-gradient(to right,#fbc34e 0%,#fbc34e var(--fill,50%),#dfe7ed var(--fill,50%));background-size:100% 6px;background-position:center;background-repeat:no-repeat}
 #mobileControlsSlot input[type=range]::-webkit-slider-thumb{width:28px;height:28px;border:4px solid white;box-shadow:0 1px 8px #013c5730;background:#013c57}#mobileControlsSlot input[type=range]::-moz-range-thumb{width:22px;height:22px;background:#013c57;border:4px solid white}
 #mobileControlsSlot .price-inputs{display:grid;grid-template-columns:1fr;gap:20px}#mobileControlsSlot .price-inputs label{font-size:13px;color:#013c57}#mobileControlsSlot .input-unit{background:#f2f5f8;border:0;border-radius:14px;padding:0 15px}#mobileControlsSlot .input-unit input{color:#013c57}#mobileControlsSlot .input-unit span{font-size:12px;color:#62717e}#mobileControlsSlot .control-footnote{font-size:11px;color:#62717e;line-height:1.8;margin:22px 0}#mobileControlsSlot .reset{font-size:13px;color:#013c57;border-color:#d9e3e8;min-height:50px;margin-bottom:24px}
 .share-fields{grid-template-columns:1fr;gap:18px}.share-intro{font-size:13px;line-height:1.8}.share-notes-choice{font-size:12px!important;line-height:1.8}.share-fields label:last-child{grid-column:auto}.share-actions{display:flex;flex-direction:column;gap:12px}.share-actions .btn{width:100%;font-size:13px;min-height:50px;border-radius:15px}.share-actions #openCustomerEmail{font-size:14px;order:-1}.share-delivery p,.share-file-help{font-size:12px;line-height:1.8}.share-preview-heading{font-size:12px}.share-subject{font-size:11px}.email-preview{padding:5px}.share-delivery{border-radius:16px}.export-option strong{font-size:14px;line-height:1.7}.export-option small{font-size:12px;line-height:1.8}.export-option{padding:23px 0}.export-note{font-size:12px!important}dialog>p,.install-facts p,.install-tip{font-size:13px;line-height:1.8}.install-platforms button{font-size:11px;min-height:48px}
}
@media screen and (max-width:360px){
 main{padding-left:16px;padding-right:16px}.mobile-shell{padding-left:16px;padding-right:16px}.mobile-savings,.mobile-card{padding:21px}.mobile-page-title h1{font-size:33px}.mobile-amount strong{font-size:29px;letter-spacing:-1.4px}.mobile-card h2{font-size:17px}.mobile-cost-row strong{font-size:21px}.mobile-action-card{gap:11px}.mobile-action-card strong{font-size:20px}.mobile-tile{width:42px;height:42px}.customer-pill{padding:14px 16px}.customer-pill span{font-size:14px}.mobile-compare-toolbar>div button{font-size:12px}.month-focus{padding:21px}.month-focus-heading h4{font-size:18px}.month-metric strong{font-size:26px}.month-result strong{font-size:27px}.month-buttons{margin-left:-16px;margin-right:-16px;padding-left:16px;padding-right:16px}.mobile-yearbar{gap:8px}.mobile-years button{min-width:66px}#mobileCoverage{font-size:10px}.app-nav a{font-size:10px;min-height:59px}dialog,#shareDialog{padding-left:20px;padding-right:20px}.dialog-head h2{font-size:23px!important}.profile-dialog-total{flex-direction:column;gap:6px}
}
@media(prefers-reduced-motion:reduce){.mobile-cost-track span{transition:none}}
@media print{.mobile-shell,.mobile-home,.mobile-compare-toolbar,#mobileControlsDialog{display:none!important}}

````

## Fil: public/mobile-app.mjs

````text
import {profileSourceLabel} from './model.mjs';
const $=id=>document.getElementById(id),mobile=matchMedia('(max-width:700px)');
const number=(n,d=2)=>n===null?'—':new Intl.NumberFormat('sv-SE',{maximumFractionDigits:d,minimumFractionDigits:d}).format(n);
const put=(id,text)=>$(id).textContent=text;
let page='home',comparison='year',controlsAnchor,monthsAnchor,businessAnchor;
const pages=['home','explore','profile','meeting'];
function showPage(next,{history=true,focus=false}={}){
 if(!pages.includes(next))next='home';page=next;
 document.body.dataset.mobilePage=page;
 if(!mobile.matches)return;
 document.querySelectorAll('.app-nav a').forEach(a=>{if(a.dataset.mobileTarget===page)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
 if(history&&location.hash!=='#'+page)window.history.pushState(null,'','#'+page);
 window.scrollTo({top:0,behavior:'instant'});
 if(page==='explore'&&comparison==='months')syncMobileMonth(Number($('monthButtons').querySelector('[aria-pressed=true]')?.dataset.monthIndex));
 if(focus){const heading=$(page).querySelector('h1,h2');if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}}
}
function showComparison(view){comparison=view;document.body.dataset.mobileComparison=view;document.querySelectorAll('[data-comparison-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.comparisonView===view)));if(view==='months')syncMobileMonth(Number($('monthButtons').querySelector('[aria-pressed=true]')?.dataset.monthIndex));}
function openControls(){if(!mobile.matches)return;$('mobileControlsDialog').showModal();}
function onBreakpoint(){
 if(mobile.matches){$('mobileBusinessSlot').append($('businessImpact'));$('mobileControlsSlot').append($('scenarioControls'));$('monthFocus').before($('monthButtons'));showPage(pages.includes(location.hash.slice(1))?location.hash.slice(1):page,{history:false});}
 else{businessAnchor.after($('businessImpact'));if($('mobileControlsDialog').open)$('mobileControlsDialog').close();controlsAnchor.after($('scenarioControls'));monthsAnchor.after($('monthButtons'));document.querySelectorAll('.app-nav a').forEach(a=>a.removeAttribute('aria-current'));}
}
export function initMobile(){
 businessAnchor=document.createComment('Desktop business impact position');$('businessImpact').before(businessAnchor);
 controlsAnchor=document.createComment('Desktop controls position');$('scenarioControls').before(controlsAnchor);
 monthsAnchor=document.createComment('Desktop month selector position');$('monthButtons').before(monthsAnchor);
 document.querySelectorAll('[data-mobile-target]').forEach(el=>el.addEventListener('click',e=>{if(!mobile.matches)return;e.preventDefault();showPage(el.dataset.mobileTarget,{focus:true});}));
 document.querySelectorAll('[data-comparison-view]').forEach(el=>el.addEventListener('click',()=>showComparison(el.dataset.comparisonView)));
 $('mobileCustomer').addEventListener('click',()=>$('editCustomer').click());
 $('mobileInfo').addEventListener('click',()=>$('appInfo').click());
 $('mobileShare').addEventListener('click',()=>$('shareTop').click());
 $('mobileBalance').addEventListener('click',openControls);$('mobileAdjust').addEventListener('click',openControls);
 $('mobileApplyControls').addEventListener('click',()=>{$('mobileControlsDialog').close();showComparison('year');showPage('explore',{focus:true});});
 document.querySelector('.controls-link').addEventListener('click',e=>{if(mobile.matches){e.preventDefault();openControls();}});
 const route=()=>{if(!mobile.matches)return;const hash=location.hash.slice(1);if(hash==='scenarioControls')openControls();else if(hash==='comparisonSummary'){showComparison('year');showPage('explore',{history:false});}else showPage(pages.includes(hash)?hash:'home',{history:false});};
 window.addEventListener('load',()=>{if(mobile.matches)requestAnimationFrame(()=>showPage(page,{history:false}));},{once:true});
 window.addEventListener('popstate',route);window.addEventListener('hashchange',route);mobile.addEventListener('change',onBreakpoint);onBreakpoint();
}
export function syncMobileMonth(selected){
 if(!mobile.matches)return;
 const scroller=$('monthButtons'),button=scroller.querySelector(`[data-month-index="${selected}"]`);
 if(button)scroller.scrollLeft=button.offsetLeft-scroller.offsetLeft-scroller.clientWidth/2+button.offsetWidth/2;
}
export function renderMobile(r,s){
 const kind=!r.volume?'empty':Math.abs(r.difference)<1e-8?'equal':r.difference>0?'saving':'extra';
 put('mobileCustomerName',s.customer);put('mobileCoverage',`${r.count} av 12 månader`);
 $('mobileSavings').dataset.kind=kind;
 put('mobileSavingsTitle',{empty:'Lägg in er förbrukning',equal:'Samma beräknade kostnad',saving:'Beräknad besparing',extra:'Beräknad merkostnad'}[kind]);
 put('mobileSavingsAmount',r.volume?number(Math.abs(r.difference)): '—');
 put('mobileSavingsRate',r.volume?`${number(Math.abs(r.differenceRate))} öre/kWh ${kind==='equal'?'i skillnad':kind==='extra'?'högre':'lägre'} än rörligt`:'För att se er jämförelse');
 put('mobileSavingsBasis',`Portfölj · ${s.hedge} % säkrat · ${s.period}`);
 put('mobileFloatingCost',number(r.variable)+' kr');put('mobilePortfolioCost',number(r.portfolio)+' kr');
 put('mobileFloatingRate',number(r.variableRate)+' öre/kWh');put('mobilePortfolioRate',number(r.portfolioRate)+' öre/kWh');
 const max=Math.max(r.variable,r.portfolio,1);
 $('mobileFloatingBar').style.width=Math.max(0,r.variable)/max*100+'%';$('mobilePortfolioBar').style.width=Math.max(0,r.portfolio)/max*100+'%';
 document.querySelectorAll('.mobile-cost-track').forEach(el=>el.hidden=r.variable<0||r.portfolio<0||!r.volume);
 put('mobileVolume',number(r.volume/1000,r.volume%1000?1:0)+' MWh');
 put('mobileProfileType',s.sources[s.period]==='estimated'?'Uppskattad profil':$('seasonLabel').textContent);
 put('mobileHedge',s.hedge+' % av volymen säkrad');put('mobileFloatingShare',(100-s.hedge)+' % osäkrad volym. Andra kostnader tillkommer.');
 const estimate=s.sources[s.period]==='estimated';
 put('mobileBasis',`${r.count<12?r.count+' av 12 månader ingår. ':''}${estimate?'Uppskattad förbrukningsprofil. ':''}Beräknat från underlaget. Exkl. moms, elnät och energiskatt.`);
 $('mobileBasis').title=profileSourceLabel(s);
 put('mobileLiveResult',r.volume?`${number(Math.abs(r.difference))} kr ${kind==='extra'?'mer':kind==='equal'?'i skillnad':'mindre'} än rörligt · ${s.period}`:'Lägg in förbrukning för att jämföra.');
}

````

## Fil: public/model.mjs

````text
import {validBusiness} from './business-impact.mjs';
import {DATA} from './data.mjs';
export {DATA};
export const MONTHS=['Jan','Feb','Mar','Apr','Maj','Jun','Jul','Aug','Sep','Okt','Nov','Dec'];
export const hasMonthlyPrices=(prices,index)=>['hedged','spot','running','weighting'].every(key=>Number.isFinite(prices[key]?.[index]));
// Illustrative assumptions, not measured or official Kraftringen load profiles.
export const PROFILE_SHAPES=Object.freeze({
 winter:{label:'Vintertung',description:'65 % oktober–mars',weights:[12,12,11,8,6,4,4,5,8,9,10,11]},
 summer:{label:'Sommartung',description:'65 % april–september',weights:[4,5,8,9,10,11,12,12,11,8,6,4]},
 even:{label:'Jämn över året',description:'Lika mycket varje månad',weights:Array(12).fill(1)}
});
export function annualProfile(annualKwh,shape){
 if(!Number.isFinite(annualKwh)||annualKwh<.01||annualKwh>100000000||!Object.hasOwn(PROFILE_SHAPES,shape))throw Error('Ange en årsförbrukning mellan 0,01 och 100 000 000 kWh och välj en profil.');
 const total=Math.round(annualKwh*100),weights=PROFILE_SHAPES[shape].weights,sum=weights.reduce((a,v)=>a+v,0),raw=weights.map(w=>total*w/sum),cents=raw.map(Math.floor);
 // Largest remainder keeps the rounded months equal to the entered annual sum.
 const order=raw.map((v,i)=>({i,remainder:v-cents[i]})).sort((a,b)=>b.remainder-a.remainder||a.i-b.i);
 for(let i=0,left=total-cents.reduce((a,v)=>a+v,0);i<left;i++)cents[order[i].i]++;
 return cents.map(v=>v/100);
}
export function profileSourceLabel(s,period=s.period){
 if(s.sources[period]==='file')return 'Förbrukning från ditt Excelunderlag.';
 if(s.sources[period]==='estimated'){
  const e=s.estimates[period],shape=PROFILE_SHAPES[e.shape],annual=new Intl.NumberFormat('sv-SE',{maximumFractionDigits:2}).format(e.annualKwh);
  return `Uppskattad profil: ${shape.label.toLowerCase()}. Utgångspunkt: ${annual} kWh/år, ${shape.description.toLowerCase()}.${e.adjusted?' Månadsvärden har justerats manuellt efter fördelningen.':' Schablon, inte uppmätta månadsvärden.'}`;
 }
 return 'Din inlagda månadsförbrukning.';
}
export function defaults(){return {basis:DATA.id,customer:'Kund enligt ditt underlag',sellerName:'Ludwig Rosenberg',business:{type:'company',apartments:null},period:'2025',profiles:{'2025':[...DATA.periods['2025'].volume],'2026':[...DATA.periods['2026'].volume]},sources:{'2025':'file','2026':'file'},estimates:{},consumption:100,hedge:80,...DATA.parameters,notes:'',next:'',date:'',choice:'undecided'};}
export function calculate(state){
 const p=DATA.periods[state.period],h=state.hedge/100,profile=state.profiles[state.period];
 const rows=MONTHS.map((month,i)=>{
  const volume=profile[i]===null?null:profile[i]*state.consumption/100;
  if(!hasMonthlyPrices(p,i)||volume===null)return {month,index:i,available:false,volume};
  const cost=p.running[i]-p.weighting[i],hedgedPart=h*p.hedged[i],floatingPart=(1-h)*p.spot[i];
  const portfolioRate=hedgedPart+floatingPart+cost+state.portfolioFee,variableRate=p.spot[i]+cost+state.variableFee;
  const portfolio=volume*portfolioRate/100,variable=volume*variableRate/100;
  return {month,index:i,available:true,volume,hedged:p.hedged[i],spot:p.spot[i],running:p.running[i],weighting:p.weighting[i],cost,hedgedPart,floatingPart,portfolioRate,variableRate,fixedRate:state.fixed,portfolio,variable,fixed:volume*state.fixed/100,difference:variable-portfolio,differenceRate:variableRate-portfolioRate};
 });
 const available=rows.filter(r=>r.available),sum=k=>available.reduce((a,r)=>a+r[k],0),volume=sum('volume'),portfolio=sum('portfolio'),variable=sum('variable'),fixed=sum('fixed');
 return {rows,volume,portfolio,variable,fixed,difference:variable-portfolio,differenceRate:volume?(variable-portfolio)/volume*100:null,fixedDifference:fixed-portfolio,portfolioRate:volume?portfolio/volume*100:null,variableRate:volume?variable/volume*100:null,fixedRate:volume?fixed/volume*100:null,periodLabel:p.label,count:available.length};
}
export function parseProfile(text){
 const lines=text.replace(/^\uFEFF/,'').trim().split(/\r?\n/).filter(s=>s.trim()),values=Array(12).fill(null),used=new Set();let mode=null;
 for(let row=0;row<lines.length;row++){
  const line=lines[row];if(row===0&&/kwh|förbrukning|månad|month/i.test(line))continue;
  const cells=(line.includes(';')?line.split(';'):line.includes('\t')?line.split('\t'):line.split(',')).map(s=>s.trim().replace(/^"|"$/g,''));
  if(cells.length>2)throw Error('Använd månad och kWh, separerade med semikolon eller tabbar.');
  const current=cells.length===2?'named':'plain';if(mode&&mode!==current)throw Error('Alla rader behöver samma format.');mode=current;
  let index=used.size;
  if(mode==='named'){const key=cells[0].toLowerCase();index=MONTHS.findIndex(m=>m.toLowerCase()===key.slice(0,3));if(index<0&&/^\d{1,2}$/.test(key))index=Number(key)-1;}
  if(index<0||index>11||used.has(index))throw Error('Ange varje månad högst en gång, som Jan–Dec eller 1–12.');
  const str=cells.at(-1).replace(/\s/g,'').replace(',','.');const value=str===''?null:Number(str);
  if(value!==null&&(!Number.isFinite(value)||value<0||value>100000000))throw Error('Förbrukningen ska vara 0–100 000 000 kWh.');
  values[index]=value;used.add(index);
 }
 if(!values.some(v=>v>0))throw Error('Minst en månad behöver förbrukning över noll.');
 return values;
}
export function validateState(s){
 if(!validBusiness(s?.business))return false;
 if(s?.sellerName!==undefined&&(typeof s.sellerName!=='string'||!s.sellerName.trim()||s.sellerName.length>100||/[\r\n]/.test(s.sellerName)))return false;
 if(!s||s.basis!==DATA.id||!Object.hasOwn(DATA.periods,s.period)||typeof s.customer!=='string'||!s.customer.trim()||s.customer.length>120)return false;
 for(const period of Object.keys(DATA.periods)){
  const p=s.profiles?.[period];
  if(!Array.isArray(p)||p.length!==12||!p.every(v=>v===null||(Number.isFinite(v)&&v>=0&&v<=100000000))||!['file','own','estimated'].includes(s.sources?.[period]))return false;
  if(s.sources[period]==='estimated'){
   const e=s.estimates?.[period];
   if(!e||!Number.isFinite(e.annualKwh)||e.annualKwh<.01||e.annualKwh>100000000||!Object.hasOwn(PROFILE_SHAPES,e.shape)||typeof e.adjusted!=='boolean')return false;
   if(!e.adjusted&&!annualProfile(e.annualKwh,e.shape).every((v,i)=>p[i]!==null&&Math.abs(v-p[i])<1e-7))return false;
  }
 }
 for(const [k,min,max] of [['consumption',50,150],['hedge',0,100],['fixed',0,500],['portfolioFee',0,100],['variableFee',0,100]])if(!Number.isFinite(s[k])||s[k]<min||s[k]>max)return false;
 return typeof s.notes==='string'&&s.notes.length<=10000&&typeof s.next==='string'&&s.next.length<=1000&&['undecided','variable','portfolio','fixed'].includes(s.choice)&&typeof s.date==='string'&&(!s.date||/^\d{4}-\d{2}-\d{2}$/.test(s.date));
}
export function migrateLegacy(old){
 if(!old||typeof old.customer!=='string'||!Array.isArray(old.profile)||old.profile.length!==12||!old.profile.every(v=>Number.isFinite(v)&&v>=0&&v<=100000000))return null;
 const s=defaults();
 for(const k of ['customer','hedge','consumption','notes','next','date'])if(old[k]!==undefined)s[k]=old[k];
 s.profiles={'2025':[...old.profile],'2026':[...old.profile]};s.sources={'2025':'own','2026':'own'};
 s.choice=old.choice==='secured'?'portfolio':old.choice??'undecided';
 return validateState(s)?s:null;
}

````

## Fil: public/presentation.css

````text
@font-face{font-family:Poppins;src:url('/brand/fonts/poppins-400.ttf');font-display:swap}
@font-face{font-family:Poppins;src:url('/brand/fonts/poppins-600.ttf');font-weight:600;font-display:swap}
:root{color-scheme:light;--navy:#013c57;--yellow:#fbc34e;--muted:#536975}
*{box-sizing:border-box}body{margin:0;background:#f3f5f5;color:var(--navy);font:14px/1.6 Poppins,Arial,sans-serif}
[hidden]{display:none!important}a{color:inherit}button{font:inherit;cursor:pointer}button,a{touch-action:manipulation}button:disabled{cursor:default;opacity:.35}
a:focus-visible,button:focus-visible,summary:focus-visible,.stage:focus-visible{outline:3px solid #bf8011;outline-offset:4px}
.viewer-header{display:flex;justify-content:space-between;align-items:center;gap:20px;padding:19px max(24px,calc((100vw - 1360px)/2));background:var(--navy);color:white;border-bottom:3px solid var(--yellow)}
.back{font-size:13px;text-decoration:none;min-height:44px;display:flex;align-items:center}.brand img{display:block;max-width:100%;height:auto}
main{max-width:1360px;margin:auto;padding:30px 24px 40px}.heading{display:flex;align-items:center;justify-content:space-between;gap:24px}.eyebrow{font-size:10px;letter-spacing:1.6px;font-weight:600;margin:0 0 4px}h1{font-size:clamp(23px,2.3vw,32px);line-height:1.25;letter-spacing:-.7px;font-weight:600;margin:0}
button{min-height:46px;padding:10px 18px;border:1px solid #c4d0d4;border-radius:12px;background:white;color:var(--navy);font-weight:600;font-size:13px}button:hover:not(:disabled){background:#fff2d3}#fullscreen{flex-shrink:0}.draft{font-size:11px;line-height:1.6;color:var(--muted);margin:15px 0 18px;border-left:3px solid var(--yellow);padding-left:12px}
.stage{position:relative;background:#dce3e6;border-radius:10px;overflow:hidden;min-height:200px;display:flex;justify-content:center;align-items:center;touch-action:pan-y pinch-zoom}.stage img{display:block;width:100%;height:auto;max-height:calc(100dvh - 330px);object-fit:contain}.stage>p{margin:0;max-width:520px;padding:28px;text-align:center}.stage #loading{position:absolute;background:rgba(255,255,255,.95);border-radius:8px;font-size:13px;padding:12px 20px}.stage #error{background:white;margin:20px;border-radius:8px}
.controls{display:flex;align-items:center;gap:14px;justify-content:center;margin-top:18px}.controls>button{min-width:125px}.pages{display:flex;gap:8px}.pages button{width:44px;min-height:44px;border-radius:50%;padding:0;font-size:12px}.pages button[aria-current="true"]{background:var(--navy);border-color:var(--navy);color:white}.counter{min-width:75px;text-align:center;font-size:12px;color:var(--muted);margin:0}.hint{text-align:center;color:var(--muted);font-size:11px;margin:10px 0 22px}
.support{max-width:900px;margin:24px auto 0}.downloads{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}.downloads a{padding:11px 20px;border-bottom:2px solid var(--yellow);font-weight:600;font-size:12px;min-height:44px;display:flex;gap:20px;text-decoration:none}.downloads a:hover{background:#fff2d3}details{margin-top:28px;padding:16px 20px;border:1px solid #d3dee1;border-radius:12px;background:white}summary{cursor:pointer;font-size:12px;font-weight:600;min-height:28px}#transcript{white-space:pre-line;font-size:14px;margin-top:16px;color:#314e5d}.source-note{text-align:center;font-size:10px;color:var(--muted);margin-top:20px}
body.immersive{background:#0c2030}body.immersive .viewer-header,body.immersive .support,body.immersive .hint,body.immersive .draft,body.immersive .eyebrow{display:none}body.immersive main{max-width:none;height:100dvh;padding:14px 24px;display:flex;flex-direction:column;color:white}body.immersive .heading{margin-bottom:12px}body.immersive h1{font-size:16px;letter-spacing:0}body.immersive .stage{flex:1;min-height:0;background:#0c2030;border-radius:0}body.immersive .stage img{width:100%;height:100%;max-height:100%;object-fit:contain}body.immersive .controls{margin-top:12px}body.immersive .counter{color:white}body.immersive #loading{color:var(--navy)}
@media(max-width:650px){.viewer-header{padding:12px 16px;gap:12px}.brand img{width:120px}.back{font-size:11px}main{padding:24px 16px}.heading{align-items:flex-start;gap:12px}h1{font-size:23px}.heading>button{font-size:11px;padding:8px 11px;max-width:100px;line-height:1.4}.draft{font-size:10px;margin-top:18px}.stage{min-height:150px;border-radius:6px}.stage img{max-height:none}.controls{gap:10px;flex-wrap:wrap;justify-content:space-between}.controls>button{min-width:50px;padding:10px 14px}.controls>button span{display:none}.pages{gap:4px}.pages button{width:36px;min-height:44px;border-radius:10px}.counter{order:4;flex-basis:100%}.hint{font-size:10px}.downloads{gap:10px}.downloads a{font-size:11px;padding:10px 12px}body.immersive main{padding:12px}body.immersive h1{font-size:13px}body.immersive .counter{display:none}body.immersive .controls{justify-content:center}body.immersive .heading>button{max-width:none}body.immersive .stage img{max-height:100%}}
@media(max-height:500px){body.immersive main{padding:8px 16px}body.immersive .heading{margin-bottom:4px}body.immersive .controls{margin-top:4px}body.immersive button{min-height:36px;padding-top:6px;padding-bottom:6px}body.immersive .pages button{min-height:36px;width:36px}}
@media(max-width:380px){.pages{gap:2px}.pages button{width:30px}}

````

## Fil: public/presentation.html

````text
<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kundröster · Kraftringen Kundrummet</title><link rel="icon" href="/icons/kundrum.svg"><link rel="stylesheet" href="/meeting-flow.css"></head><body><header class="top"><a href="/" aria-label="Till Kundrummet"><img src="/brand/kraftringen-logo.svg" alt="Kraftringen" width="180" height="31"></a><a href="/">← Till kundrummet</a></header><main><a href="/stories.html">← Alla kundröster</a><article id="reference" class="sheet reference-single" aria-live="polite"><p>Laddar kundrösten …</p></article><button id="fullscreen" class="secondary" type="button" hidden>Visa i helskärm</button><script type="module" src="/presentation.mjs"></script></main></body></html>
````

## Fil: public/presentation.mjs

````text
import {STORY_CATALOG,STORY_SOURCE_NOTE} from './meeting-stories.mjs';
const story=STORY_CATALOG[new URLSearchParams(location.search).get('deck')],root=document.getElementById('reference');
root.replaceChildren();
function add(tag,content,cls){const el=document.createElement(tag);el.textContent=content;if(cls)el.className=cls;root.append(el);}
if(story){document.title=story.title+' · Kraftringen Kundrummet';add('p',story.sector,'eyebrow');add('h1',story.title);add('blockquote','”'+story.quote+'”');add('p',story.person,'quote-person');add('p','Källa: '+story.source,'reference-source');add('p',STORY_SOURCE_NOTE,'reference-source');}else{add('h1','Välj en kundröst');add('p','Den här kundrösten finns inte i det aktuella urvalet. Du hittar alla kundröster på översiktssidan.');}
const button=document.getElementById('fullscreen');if(root.requestFullscreen){button.hidden=false;button.addEventListener('click',async()=>{try{await root.requestFullscreen();}catch{button.textContent='Helskärm stöds inte här';}});}

````

## Fil: public/purchases.css

````text
.purchase-link{display:inline-flex;align-items:center;gap:8px;border:0;border-bottom:1px solid #8eafbe;background:transparent;padding:10px 0;min-height:44px;font-size:12px;font-weight:500;color:#013c57;text-align:left;margin-top:8px}
.purchase-link svg{width:17px;height:17px}
.purchase-entry{width:100%;text-align:left;border:0;color:#013c57;background:#e8f1f6!important}
.purchase-entry strong{font-size:18px!important;font-weight:500!important;line-height:1.4}.purchase-entry small{line-height:1.7!important}.purchase-entry .mobile-tile{background:#fff3d5}
#purchasesDialog{width:calc(100% - 48px);max-width:850px;max-height:90dvh;padding:0;border:0;border-radius:28px;overflow:auto;color:#013c57;overscroll-behavior:contain}
#purchasesDialog .dialog-head{padding:25px 30px 18px;position:sticky;top:0;background:#fff;z-index:3;margin:0;align-items:center;border-bottom:1px solid #edf1f4}
#purchasesDialog h2{font-size:28px;font-weight:500;letter-spacing:-.8px;line-height:1.25}
#purchasesDialog .eyebrow{font-size:9px;margin:0 0 7px;letter-spacing:1.2px;color:#526572}
#purchasesDialog .close{flex-shrink:0;width:44px;height:44px;border-radius:50%;font-size:26px;position:static}
.purchase-content{padding:22px 30px 30px}.purchase-disclosure{font-size:12px;color:#526572;line-height:1.8;margin:0 0 20px}.purchase-disclosure strong{color:#013c57;font-weight:500}
.purchase-visual{background:#013c57;color:white;padding:25px 27px;border-radius:22px}
.purchase-visual-top{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:12px;color:#d3e5ee}
.purchase-target{background:#ffffff12;border:1px solid #ffffff26;border-radius:20px;padding:5px 10px;font-size:11px;white-space:nowrap}
.purchase-numbers{display:flex;align-items:flex-end;justify-content:space-between;gap:14px;margin:18px 0 23px}.purchase-numbers strong{display:block;font-size:54px;font-weight:500;letter-spacing:-2px;line-height:1.2;color:#fbc34e;font-variant-numeric:tabular-nums}.purchase-numbers span{display:block;font-size:12px;margin-top:5px}.purchase-numbers>div:last-child{text-align:right}.purchase-numbers>div:last-child strong{font-size:32px;color:#fff;letter-spacing:-1px}.purchase-numbers>div:last-child span{color:#d3e5ee}
.purchase-blocks{display:grid;grid-template-columns:repeat(10,minmax(0,1fr));gap:6px}.purchase-block{height:55px;background:repeating-linear-gradient(135deg,#ffffff0a,#ffffff0a 5px,#ffffff16 5px,#ffffff16 7px);border:1px solid #86a6b7;border-radius:8px;position:relative;transition:background .4s,border-color .4s,transform .4s}
.purchase-block i{position:absolute;inset:0 auto 0 0;width:var(--block-fill,0%);background:#fbc34e;border-radius:5px;transition:width .1s linear}.purchase-block[data-full=true]{border-color:#fbc34e}.purchase-block[data-full=true]::after{content:'✓';position:absolute;inset:0;display:grid;place-items:center;color:#013c57;font-size:17px;font-weight:500}
.purchase-block-caption{display:flex;justify-content:space-between;gap:10px;margin:13px 0 0;font-size:10px;color:#d3e5ee;line-height:1.6}
.purchase-timeline{margin:25px 0 20px}.purchase-timeline label{display:block;font-size:13px!important;font-weight:500;margin-bottom:6px}.purchase-timeline>p{font-size:11px;color:#526572;margin:0 0 14px}
#purchaseTimeline{display:block;width:100%;appearance:none;height:44px;margin:0;background:transparent;border:0;cursor:ew-resize;border-radius:12px;touch-action:pan-y}
#purchaseTimeline::-webkit-slider-runnable-track{height:6px;border-radius:8px;background:linear-gradient(to right,#013c57 var(--purchase-progress,0%),#dce6ec var(--purchase-progress,0%))}
#purchaseTimeline::-moz-range-track{height:6px;border-radius:8px;background:#dce6ec}#purchaseTimeline::-moz-range-progress{height:6px;background:#013c57;border-radius:8px}
#purchaseTimeline::-webkit-slider-thumb{appearance:none;width:28px;height:28px;border:5px solid white;background:#013c57;border-radius:50%;margin-top:-11px;box-shadow:0 0 0 1px #b0c5d0,0 3px 8px #013c5730}
#purchaseTimeline::-moz-range-thumb{width:18px;height:18px;border:5px solid white;background:#013c57;border-radius:50%;box-shadow:0 0 0 1px #b0c5d0}
.purchase-milestones{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px}.purchase-milestones button{min-width:0;min-height:49px;padding:5px 2px;border:0;border-radius:10px;background:transparent;color:#526572;font-size:10px;line-height:1.5}.purchase-milestones b{display:block;font-size:13px;font-weight:500}.purchase-milestones button[aria-pressed=true]{color:#013c57;background:#edf3f6}.purchase-milestones button[data-passed=true] b{color:#013c57}
.purchase-playback{display:flex;justify-content:center;align-items:center;gap:12px;margin:17px 0 0}.purchase-playback button{min-height:44px;min-width:44px;border:1px solid #cbd9e2;border-radius:50%;background:white;display:grid;place-items:center}.purchase-playback #purchasePlay{border:0;border-radius:24px;padding:10px 25px;min-width:148px;background:#013c57;color:white;font-size:13px;font-weight:500}.purchase-playback button:disabled{opacity:.35;cursor:default}
.purchase-explanation{background:#fff4d9;border-radius:18px;padding:21px 24px;min-height:156px}.purchase-event{margin:0 0 8px;font-size:10px;font-weight:500;letter-spacing:.3px;color:#62522d}#purchaseStageTitle{font-size:19px;font-weight:500;letter-spacing:-.4px;margin:0 0 9px;line-height:1.45}#purchaseStageText{font-size:12px;line-height:1.85;margin:0}
.purchase-notes{margin-top:18px;font-size:11px;color:#526572;line-height:1.8}.purchase-notes summary{min-height:44px;padding:12px 0;cursor:pointer;font-weight:500;color:#013c57}.purchase-notes p{margin:5px 0 10px}.purchase-footnote{font-size:10px;color:#62717e;line-height:1.7;margin:10px 0 0}.purchase-sr-only{position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip-path:inset(50%)}
@media screen and (max-width:700px){
 #purchasesDialog{width:100%;max-width:600px;max-height:94dvh;border-radius:28px 28px 0 0;margin:auto auto 0;padding:0}
 #purchasesDialog .dialog-head{padding:21px 22px 16px;gap:8px}#purchasesDialog h2{font-size:24px}#purchasesDialog .eyebrow{font-size:8px;letter-spacing:1px}
 .purchase-content{padding:18px 22px calc(25px + env(safe-area-inset-bottom))}.purchase-disclosure{font-size:11px;line-height:1.8;margin-bottom:16px}
 .purchase-visual{padding:21px 20px;border-radius:21px}.purchase-visual-top{font-size:10px;align-items:flex-start}.purchase-target{font-size:9px;padding:4px 8px}.purchase-visual-top>span:first-child{max-width:130px}
 .purchase-numbers{margin:20px 0}.purchase-numbers strong{font-size:46px}.purchase-numbers>div:last-child strong{font-size:29px}.purchase-numbers span{font-size:11px}
 .purchase-blocks{gap:4px}.purchase-block{height:38px;border-radius:5px}.purchase-block[data-full=true]::after{font-size:12px}.purchase-block-caption{font-size:8px;gap:8px}
 .purchase-timeline{margin-top:24px}.purchase-milestones button{font-size:9px}.purchase-milestones b{font-size:12px}.purchase-explanation{padding:20px;min-height:0}#purchaseStageTitle{font-size:19px}#purchaseStageText{font-size:12px}.purchase-notes{font-size:11px}
}
@media screen and (max-width:360px){#purchasesDialog .dialog-head{padding-left:18px;padding-right:18px}#purchasesDialog h2{font-size:21px!important}.purchase-content{padding-left:18px;padding-right:18px}.purchase-visual{padding:18px 16px}.purchase-numbers strong{font-size:40px}.purchase-numbers>div:last-child strong{font-size:27px}.purchase-visual-top{gap:7px}.purchase-target{font-size:8px}.purchase-milestones button{font-size:8px}.purchase-block-caption{font-size:7px}.purchase-explanation{padding:18px}}
@media(prefers-reduced-motion:reduce){.purchase-block{transition:none}.purchase-block i{transition:none}}
@media print{#purchasesDialog,.purchase-link,.purchase-entry{display:none!important}}

.purchase-period{font-size:10px;color:#526572;margin:-9px 0 17px;line-height:1.7}
.purchase-day-status{border-top:1px solid #ffffff25;margin-top:16px;padding-top:14px;display:flex;justify-content:space-between;align-items:center;gap:7px;flex-wrap:wrap;line-height:1.6}.purchase-day-status strong{font-size:11px;font-weight:500;color:#e2edf2}.purchase-day-status strong[data-buy=true]{color:#fbc34e}.purchase-day-status span{font-size:10px;color:#d3e5ee}
.purchase-week-heading{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:20px 0 9px;color:#013c57;font-size:12px;font-weight:500}.purchase-week-heading small{font-size:9px;color:#526572;font-weight:400}
.purchase-week{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px}.purchase-week button{min-width:0;min-height:65px;padding:8px 2px 3px;border:1px solid transparent;border-radius:12px;background:#f0f3f6;color:#677982;line-height:1.3}.purchase-week button small{display:block;font-size:10px}.purchase-week button b{display:block;font-size:14px;margin-top:3px;font-weight:500}.purchase-week button span{display:block;font-size:18px;line-height:1.2}.purchase-week button[data-buy=true]{background:#fff2d0;color:#013c57}.purchase-week button[aria-pressed=true]{border:2px solid #013c57;padding:7px 1px 2px}.purchase-week button:disabled{opacity:.35;cursor:default}.purchase-week button[data-passed=false]{background:#fff;border-color:#e0e8ed}
.purchase-milestones button small{display:block;font-size:9px}.purchase-notes a{text-decoration:underline;text-underline-offset:3px}
@media screen and (max-width:700px){.purchase-period{font-size:9px;margin-top:-7px}.purchase-day-status{margin-top:13px;padding-top:11px}.purchase-day-status strong{font-size:10px}.purchase-day-status span{font-size:9px}.purchase-week-heading{font-size:11px}.purchase-week-heading small{font-size:8px}.purchase-week{gap:4px}.purchase-week button{min-height:60px;border-radius:9px}.purchase-week button small{font-size:9px}.purchase-week button b{font-size:12px}.purchase-milestones b{font-size:10px}.purchase-milestones button small{font-size:8px}.purchase-numbers strong{font-size:40px}.purchase-numbers>div:last-child strong{font-size:27px}}
@media screen and (max-width:360px){.purchase-numbers strong{font-size:34px}.purchase-numbers>div:last-child strong{font-size:24px}.purchase-numbers span{font-size:10px}.purchase-day-status{flex-direction:column;align-items:flex-start;gap:3px}.purchase-week-heading{gap:4px;font-size:10px}.purchase-week-heading small{font-size:7px}.purchase-milestones b{font-size:9px}}

.purchase-quick-label{font-size:9px!important;color:#62717e;margin:6px 0 6px!important}

/* Plain-language explanation, with the detailed timeline on its own tab. */
#purchasesDialog [hidden]{display:none!important}
#purchasesDialog h3,#purchasesDialog h4{font-weight:500}
.portfolio-intro{font-size:15px;line-height:1.8;margin:0 0 22px;color:#425c6a}
.portfolio-tabs{display:grid;grid-template-columns:1fr 1fr;padding:5px;background:#edf2f5;border-radius:16px;gap:5px;margin-bottom:25px}
.portfolio-tabs button{border:0;background:transparent;border-radius:12px;min-height:48px;padding:10px 8px;color:#526572;font-size:13px;font-weight:500;line-height:1.5}
.portfolio-tabs button[aria-selected=true]{background:white;color:#013c57;box-shadow:0 2px 8px #013c5710}
.portfolio-kicker{display:block;font-size:10px;letter-spacing:1px;font-weight:500;line-height:1.6;color:#526572}
.portfolio-lead{background:#e8f1f6;border-radius:22px;padding:26px 28px}
.portfolio-lead h3{font-size:32px;line-height:1.25;letter-spacing:-.8px;margin:12px 0 16px}
.portfolio-lead p,.portfolio-share p,.portfolio-demo p,.portfolio-remaining p{font-size:14px;line-height:1.8;margin:0}
.portfolio-steps{list-style:none;padding:0;margin:28px 0;display:grid;gap:24px}
.portfolio-steps li{display:flex;gap:16px;align-items:flex-start}
.portfolio-steps li>span{flex:0 0 34px;height:34px;display:grid;place-items:center;background:#edf2f5;border-radius:50%;font-size:14px;font-weight:500}
.portfolio-steps h3{font-size:17px;line-height:1.5;margin:2px 0 6px}
.portfolio-steps p{margin:0;font-size:14px;line-height:1.8;color:#425c6a}
.portfolio-share{background:#013c57;color:white;border-radius:22px;padding:25px 28px;margin-bottom:26px}
.portfolio-share .portfolio-kicker{color:#d3e5ee}
.portfolio-share-number{font-size:56px;line-height:1.3;letter-spacing:-2px;color:#fbc34e;margin:12px 0}
.portfolio-share-number span{font-size:20px;letter-spacing:-.4px;color:white}
.portfolio-share p{color:#e0edf3}
.portfolio-share .portfolio-share-rule{border-top:1px solid #ffffff28;padding-top:17px;margin-top:20px;color:white}
.portfolio-demo{border:1px solid #dbe6ed;border-radius:22px;padding:26px 28px;margin:0 0 30px}
.portfolio-demo h3,.portfolio-remaining>h3{font-size:23px;letter-spacing:-.5px;line-height:1.4;margin:10px 0 14px}
.portfolio-demo-options{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:21px 0 15px}
.portfolio-demo-options button{border:1px solid #c7d7e0;border-radius:12px;background:white;color:#013c57;min-height:46px;padding:8px 5px;font-size:12px;font-weight:500}
.portfolio-demo-options button[aria-pressed=true]{background:#013c57;color:white;border-color:#013c57}
.portfolio-equation>div{display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding:12px 0;font-size:13px;line-height:1.6}
.portfolio-equation strong{white-space:nowrap;font-size:21px;font-weight:500;font-variant-numeric:tabular-nums}
.portfolio-equation .portfolio-equation-total{border-top:1px solid #c7d7e0;background:#fff3d5;border-radius:0 0 12px 12px;padding:14px 12px;margin-top:4px}
.portfolio-demo .portfolio-demo-note{font-size:12px;color:#526572;margin-top:20px;line-height:1.85}
.portfolio-cost-list{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:18px 0}
.portfolio-cost-list article{display:flex;gap:13px;background:#f2f5f7;border-radius:18px;padding:20px}
.portfolio-cost-symbol{flex:0 0 34px;width:34px;height:34px;display:grid;place-items:center;border-radius:10px;background:#dfeaf1;font-size:22px;font-family:Arial,sans-serif}
.portfolio-cost-list h4{font-size:15px;line-height:1.5;margin:3px 0 7px}
.portfolio-cost-list p{font-size:13px;color:#425c6a}
.portfolio-remaining .portfolio-reminder{border-left:3px solid #fbc34e;padding:6px 0 6px 17px;margin:23px 0;font-size:14px}
.portfolio-next{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:52px;width:100%;padding:15px 20px;margin-top:25px;background:#013c57;color:white;border:0;border-radius:15px;font-size:14px;font-weight:500;text-align:left;line-height:1.6}
.portfolio-next span{font-size:24px}
.portfolio-details{margin-top:20px;font-size:13px;line-height:1.85;color:#425c6a}
.portfolio-details summary{cursor:pointer;min-height:48px;padding:14px 0;font-weight:500;color:#013c57}
.portfolio-details p{margin:8px 0 15px}.portfolio-details a{color:#013c57;text-decoration:underline;text-underline-offset:3px}
.portfolio-sources{font-size:11px}
.purchase-limit{border-left:3px solid #fbc34e;background:#fff9eb;color:#425c6a;padding:14px 17px;margin:16px 0 23px;font-size:13px;line-height:1.8;border-radius:0 12px 12px 0}
.purchase-limit strong{color:#013c57;font-weight:500}
#purchasesDialog :focus-visible{outline:3px solid #d18b00;outline-offset:3px}
#purchasesDialog [role=tabpanel]:focus-visible{outline-offset:5px}
@media screen and (max-width:700px){
 #purchasesDialog .dialog-head{padding:19px 22px 16px}
 #purchasesDialog h2{font-size:23px;line-height:1.35;letter-spacing:-.6px}
 .portfolio-intro{font-size:14px;margin-bottom:20px}
 .portfolio-tabs{margin-bottom:22px}.portfolio-tabs button{font-size:12px}
 .portfolio-lead,.portfolio-share,.portfolio-demo{padding:23px 21px;border-radius:20px}
 .portfolio-lead h3{font-size:30px}
 .portfolio-steps{gap:25px}.portfolio-steps li{gap:12px}.portfolio-steps h3{font-size:16px}
 .portfolio-share-number{font-size:50px}.portfolio-share-number span{font-size:18px}
 .portfolio-demo h3,.portfolio-remaining>h3{font-size:21px}
 .portfolio-cost-list{grid-template-columns:1fr;gap:12px}.portfolio-cost-list article{padding:19px 18px}
 .portfolio-cost-list h4{font-size:15px}.portfolio-cost-list p{font-size:13px}
 .portfolio-next{font-size:13px;padding:14px 17px}
 .portfolio-details{font-size:12px}.portfolio-details summary{font-size:12px}
 .purchase-disclosure{font-size:13px}.purchase-period{font-size:11px}
 .purchase-visual-top{font-size:12px}.purchase-target{font-size:10px}
 .purchase-numbers span{font-size:12px}.purchase-block-caption{font-size:10px;flex-wrap:wrap}
 .purchase-day-status strong{font-size:12px}.purchase-day-status span{font-size:11px}
 .purchase-week-heading{font-size:12px}.purchase-week-heading small{font-size:10px}
 #purchaseStageText{font-size:14px}.purchase-notes{font-size:12px}.purchase-footnote{font-size:11px}
}
@media screen and (max-width:360px){
 #purchasesDialog .dialog-head{padding-left:18px;padding-right:18px}
 .portfolio-tabs button{font-size:11px}.portfolio-lead,.portfolio-share,.portfolio-demo{padding:21px 18px}
 .portfolio-demo-options{gap:6px}.portfolio-demo-options button{font-size:11px}
 .portfolio-equation>div{font-size:12px;gap:6px}.portfolio-equation strong{font-size:19px}
 .portfolio-share-number span{font-size:16px}.portfolio-cost-list article{padding:17px 14px}
 .purchase-week-heading{align-items:flex-start;flex-direction:column;gap:3px}
}

````

## Fil: public/purchases.mjs

````text
// Teaching model: cadence and 24-to-4-month window supplied by Ludwig.
// Equal daily sizes, 80% target, example dates and extra holiday-eve closures are illustrative.
const DAY=86400000;
const date=(y,m,d)=>new Date(Date.UTC(y,m-1,d));
const key=d=>d.toISOString().slice(0,10);
const addDays=(d,n)=>new Date(d.getTime()+n*DAY);
const fmtDate=new Intl.DateTimeFormat('sv-SE',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
const fmtShort=new Intl.DateTimeFormat('sv-SE',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
const fmtWeekday=new Intl.DateTimeFormat('sv-SE',{weekday:'long',timeZone:'UTC'});
const pct=n=>new Intl.NumberFormat('sv-SE',{maximumFractionDigits:1}).format(n);
const precise=n=>new Intl.NumberFormat('sv-SE',{maximumFractionDigits:2}).format(n);
const holidayCache=new Map();
function easter(year){
 const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3);
 const h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451);
 const n=h+l-7*m+114;return date(year,Math.floor(n/31),n%31+1);
}
function saturdayFrom(d){return addDays(d,(6-d.getUTCDay()+7)%7);}
// Swedish public holidays: SFS 1989:253. Eves are additional example closures, not public holidays.
export function holidayName(day){
 const year=day.getUTCFullYear();
 if(!holidayCache.has(year)){
  const days=new Map(),put=(d,name)=>days.set(key(d),name),e=easter(year),midsummer=saturdayFrom(date(year,6,20));
  for(const [m,d,name] of [[1,1,'Nyårsdagen'],[1,6,'Trettondedag jul'],[5,1,'Första maj'],[6,6,'Nationaldagen'],[12,25,'Juldagen'],[12,26,'Annandag jul']])put(date(year,m,d),name);
  for(const [offset,name] of [[-2,'Långfredagen'],[0,'Påskdagen'],[1,'Annandag påsk'],[39,'Kristi himmelsfärdsdag'],[49,'Pingstdagen']])put(addDays(e,offset),name);
  put(midsummer,'Midsommardagen');put(saturdayFrom(date(year,10,31)),'Alla helgons dag');
  put(addDays(midsummer,-1),'Midsommarafton');put(date(year,12,24),'Julafton');put(date(year,12,31),'Nyårsafton');
  holidayCache.set(year,days);
 }
 return holidayCache.get(year).get(key(day))||null;
}
export function dayClosure(day){return holidayName(day)||([0,6].includes(day.getUTCDay())?'Helg':null);}
export function buildPurchaseSchedule(deliveryYear=2028){
 if(!Number.isInteger(deliveryYear)||deliveryYear<2007||deliveryYear>2100)throw new RangeError('Ogiltigt leveransår');
 const start=date(deliveryYear-2,1,1),finish=date(deliveryYear-1,9,1),delivery=date(deliveryYear,1,1),target=80,days=[];
 let purchases=0;
 for(let day=start;day<=delivery;day=addDays(day,1)){
  const closure=dayClosure(day),phase=day>=delivery?'delivery':day>=finish?'complete':'buying',buy=phase==='buying'&&!closure;
  if(buy)purchases++;
  days.push({index:days.length,iso:key(day),date:day,closure,phase,buy,purchases,fullDate:fmtDate.format(day),shortDate:fmtShort.format(day),weekday:fmtWeekday.format(day)});
 }
 const totalPurchases=purchases,dailyShare=target/totalPurchases;
 const rows=days.map(d=>Object.freeze({...d,secured:target*d.purchases/totalPurchases,market:100-target*d.purchases/totalPurchases,added:d.buy?dailyShare:0}));
 const positions=[start,date(deliveryYear-2,7,1),date(deliveryYear-1,1,1),finish,delivery];
 const labels=['24 mån före','18 mån före','12 mån före','4 mån före','Leverans'];
 const marks=positions.map((d,i)=>Object.freeze({index:(d-start)/DAY,label:labels[i],date:fmtShort.format(d)}));
 return Object.freeze({days:Object.freeze(rows),marks:Object.freeze(marks),totalPurchases,dailyShare,target,deliveryYear,start:key(start),finish:key(finish),delivery:key(delivery)});
}
export function purchaseSnapshot(index,schedule){
 if(!Number.isInteger(index)||index<0||index>=schedule.days.length)throw new RangeError('Ogiltig dag');
 return schedule.days[index];
}
export function initPurchases(){
 const $=id=>document.getElementById(id),dialog=$('purchasesDialog'),slider=$('purchaseTimeline'),schedule=buildPurchaseSchedule(),last=schedule.days.length-1;
 const marks=[...dialog.querySelectorAll('[data-purchase-step]')],blocks=[...dialog.querySelectorAll('.purchase-block')],weekButtons=[...dialog.querySelectorAll('[data-purchase-day]')];
 let index=0,timer=null,opener=null;
 slider.max=last;
 marks.forEach((button,i)=>{const m=schedule.marks[i];button.dataset.purchaseStep=m.index;button.querySelector('b').textContent=m.label;button.querySelector('small').textContent=i===3?'Klar':i===4?'Start':'Bygger upp';button.setAttribute('aria-label',`${m.label}, ${m.date}${i===3?', uppbyggnaden klar':''}`);});
 $('purchasePeriod').textContent=`Exempel: prissäkringar ${schedule.deliveryYear-2}–${schedule.deliveryYear-1} · leveransstart 1 jan ${schedule.deliveryYear}`;
 function announce(){const s=schedule.days[index];$('purchaseStatus').textContent=`${s.fullDate}. ${pct(s.secured)} procent säkrad volym. ${pct(s.market)} procent osäkrad volym. ${s.buy?'Ny prissäkring':s.phase==='buying'?(s.closure+', ingen ny säkring'):'Uppbyggnaden är klar'}.`;}
 function stop(){clearInterval(timer);timer=null;$('purchasePlay').textContent=index===last?'Spela igen':'Spela upp';$('purchasePlay').setAttribute('aria-pressed','false');announce();}
 function render(speak=true){
  const s=purchaseSnapshot(index,schedule),complete=s.phase!=='buying',selectedMark=schedule.marks.findLastIndex(m=>m.index<=index);
  slider.value=index;slider.setAttribute('aria-valuetext',`${s.fullDate}: ${pct(s.secured)} procent säkrad volym, ${pct(s.market)} procent osäkrad volym`);slider.style.setProperty('--purchase-progress',index/last*100+'%');
  $('purchaseTime').textContent=s.shortDate;$('purchasePercent').textContent=pct(s.secured)+' %';$('purchaseMarket').textContent=pct(s.market)+' %';$('purchaseCount').textContent=`${s.purchases} av ${schedule.totalPurchases} dagar med ny säkring`;
  $('purchaseDayStatus').textContent=complete?'Uppbyggnaden klar':s.buy?'Ny prissäkring':s.closure+' · ingen ny säkring';
  $('purchaseDayAmount').textContent=complete?'Inga fler säkringar i exemplet':s.buy?`+ ≈ ${precise(s.added)} procentenheter`:'Säkringen ligger kvar';
  $('purchaseDayStatus').dataset.buy=String(s.buy);
  const title=s.phase==='delivery'?'Nu börjar ni använda elen.':complete?'Klar fyra månader före leverans.':index===0?'Två år före leverans börjar vi.':!s.buy?'Paus idag. Prisavtalen ligger kvar.':`${pct(s.secured)} % av den planerade mängden är säkrad.`;
  const text=s.phase==='delivery'?`Prisavtalen motsvarar 80 % av den planerade mängden el. De blev klara fyra månader tidigare. Er förbrukning och andra kostnader påverkar fortfarande slutpriset.`:complete?`Vi har nått målet: prisavtal för 80 % av den planerade mängden. De sista 20 % saknar prissäkring. Under de sista fyra månaderna lägger vi inte till fler säkringar i exemplet.`:index===0?'Vi gör små prisavtal på handelsdagar, från två år till fyra månader före leverans. Idag är det nyårsdagen, så den första säkringen görs nästa handelsdag.':!s.buy?`${s.closure}: ingen ny säkring idag. Prisavtalen täcker fortfarande ${pct(s.secured)} % av den planerade mängden. Vi fortsätter nästa handelsdag, tills uppbyggnaden är klar.`:`Prisavtalen har byggts på under ${s.purchases} handelsdagar. Nu är ${pct(s.secured)} % av den planerade mängden prissäkrad och ${pct(s.market)} % osäkrad. En andel på exempelvis 60 % kan betyda att vi fortfarande bygger upp mot målet 80 %.`;
  $('purchaseStageTitle').textContent=title;$('purchaseStageText').textContent=text;$('purchaseEvent').textContent=s.phase==='delivery'?'Leveransstart':complete?'Säkringarna är färdiga':`Dag för dag · ${s.weekday} ${s.shortDate}`;
  blocks.forEach((b,i)=>{const fill=Math.max(0,Math.min(100,(s.secured-i*10)*10));b.style.setProperty('--block-fill',fill+'%');b.dataset.full=String(fill>=100);});
  marks.forEach((b,i)=>{b.setAttribute('aria-pressed',String(i===selectedMark));b.dataset.passed=String(Number(b.dataset.purchaseStep)<=index);});
  const monday=index-(s.date.getUTCDay()+6)%7;
  weekButtons.forEach((button,i)=>{
   const pos=monday+i,d=schedule.days[pos];button.disabled=!d;button.dataset.purchaseDay=pos;button.setAttribute('aria-pressed',String(pos===index));
   const outDate=d?.date||addDays(s.date,pos-index);
   button.querySelector('b').textContent=outDate.getUTCDate();button.querySelector('span').textContent=!d?'':d.buy?'•':'–';
   button.dataset.buy=String(!!d?.buy);button.dataset.passed=String(pos<=index);
   button.setAttribute('aria-label',`${fmtDate.format(outDate)}: ${!d?'utanför exemplet':d.phase!=='buying'?'uppbyggnaden klar':d.buy?'handelsdag':d.closure+', ingen ny säkring'}`);
  });
  $('purchasePrevious').disabled=index===0;$('purchaseNext').disabled=index===last;
  if(!timer)$('purchasePlay').textContent=index===last?'Spela igen':'Spela upp';if(speak)announce();
 }
 function go(next){stop();index=next;render();}
 const tabs=[...dialog.querySelectorAll('[data-portfolio-tab]')];
 function selectTab(name,focus=false){
  stop();
  for(const button of tabs){const active=button.dataset.portfolioTab===name;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;$(button.getAttribute('aria-controls')).hidden=!active;if(active&&focus)button.focus({preventScroll:true});}
  dialog.scrollTop=0;
 }
 tabs.forEach((button,i)=>{
  button.addEventListener('click',()=>selectTab(button.dataset.portfolioTab));
  button.addEventListener('keydown',event=>{
   let next;if(event.key==='ArrowRight')next=(i+1)%tabs.length;else if(event.key==='ArrowLeft')next=(i-1+tabs.length)%tabs.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=tabs.length-1;else return;
   event.preventDefault();selectTab(tabs[next].dataset.portfolioTab,true);
  });
 });
 $('portfolioShowTimeline').addEventListener('click',()=>selectTab('timeline',true));
 const priceButtons=[...dialog.querySelectorAll('[data-price-example]')];
 function priceExample(which){
  const spot=which==='low'?40:100,agreed=70,adjustment=agreed-spot;
  $('portfolioSpot').textContent=spot+' öre';$('portfolioAdjustmentLabel').textContent=adjustment<0?'Prisavtalet ger tillbaka':'Prisavtalet lägger till';
  $('portfolioAdjustment').textContent=(adjustment<0?'−':'+')+Math.abs(adjustment)+' öre';$('portfolioNet').textContent=(spot+adjustment)+' öre';
  priceButtons.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.priceExample===which)));
 }
 priceButtons.forEach(button=>button.addEventListener('click',()=>priceExample(button.dataset.priceExample)));
 document.querySelectorAll('[data-open-purchases]').forEach(button=>button.addEventListener('click',()=>{opener=button;go(0);selectTab('simple');priceExample('high');dialog.showModal();dialog.scrollTop=0;}));
 slider.addEventListener('input',()=>go(Number(slider.value)));
 marks.forEach(b=>b.addEventListener('click',()=>go(Number(b.dataset.purchaseStep))));
 weekButtons.forEach(b=>b.addEventListener('click',()=>go(Number(b.dataset.purchaseDay))));
 $('purchasePrevious').addEventListener('click',()=>go(Math.max(0,index-1)));$('purchaseNext').addEventListener('click',()=>go(Math.min(last,index+1)));
 $('purchasePlay').addEventListener('click',()=>{
  if(timer){stop();return;}if(index===last)index=0;
  $('purchasePlay').textContent='Pausa';$('purchasePlay').setAttribute('aria-pressed','true');
  timer=setInterval(()=>{index=Math.min(last,index+1);render(false);if(index===last)stop();},50);render(false);
 });
 dialog.addEventListener('close',()=>{stop();opener?.focus({preventScroll:true});});document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});render();
}

````

## Fil: public/stories.css

````text
@font-face{font-family:Poppins;src:url('/brand/fonts/poppins-400.ttf')}@font-face{font-family:Poppins;src:url('/brand/fonts/poppins-600.ttf');font-weight:600}*{box-sizing:border-box}body{margin:0;background:#fafbf9;color:#013c57;font:15px/1.65 Poppins,Arial,sans-serif}header{background:#013c57;border-bottom:3px solid #fbc34e;padding:25px max(24px,calc((100vw - 1160px)/2));display:flex;align-items:center;justify-content:space-between;gap:24px}header img{display:block;max-width:100%;height:auto}.back{color:white;font-size:13px;text-decoration:none}main{max-width:1160px;margin:auto;padding:64px 24px 32px}.eyebrow,.sector{font-size:11px;letter-spacing:1.4px;font-weight:600;text-transform:uppercase}.eyebrow{margin-bottom:24px}h1{font-size:clamp(32px,4.5vw,56px);line-height:1.17;letter-spacing:-1.7px;font-weight:600;margin:0 0 24px;max-width:900px}.lead{font-size:18px;color:#526572;max-width:640px}.editorial-note{border-left:3px solid #fbc34e;padding:12px 20px;margin:36px 0 44px;max-width:820px;background:#f1f4f3}.editorial-note strong{font-size:13px}.editorial-note p{font-size:12px;color:#526572;margin:5px 0}.story{display:grid;grid-template-columns:60px minmax(0,1fr) 220px;gap:24px;padding:36px 0;border-top:1px solid #cfd9dd;align-items:start}.number{font-size:21px;color:#72848d;padding-top:5px}.sector{margin:0 0 8px;color:#526572}h2{font-size:clamp(22px,2.7vw,30px);line-height:1.25;margin:0 0 8px;font-weight:600;letter-spacing:-.5px}.person{font-size:13px;color:#526572;margin:0 0 22px}h3{font-size:16px;font-weight:600;margin:0 0 7px}.story-copy>p:last-child{max-width:570px;margin:0;color:#526572;font-size:14px}.open{margin-top:27px;min-height:48px;padding:12px 0;border-bottom:2px solid #fbc34e;text-decoration:none;color:#013c57;font-weight:600;font-size:13px;display:flex;justify-content:space-between;gap:16px}.open:hover{background:#fff2d3}.open span{font-size:20px}a:focus-visible{outline:3px solid #de9f22;outline-offset:6px}footer{font-size:12px;color:#526572;padding:32px 0;border-top:1px solid #cfd9dd}@media(max-width:650px){header{padding:20px;gap:16px}header img{width:145px}.back{font-size:11px}main{padding:36px 20px}.lead{font-size:16px}h1{letter-spacing:-1px}.story{grid-template-columns:32px minmax(0,1fr);gap:14px;padding:28px 0}.number{font-size:16px}.open{grid-column:2;margin-top:0;max-width:260px}.editorial-note{margin:28px 0 32px}.person{margin-bottom:16px}}
/* Locally hosted presentation covers and downloads. */
.story{grid-template-columns:180px minmax(0,1fr) 220px;gap:28px}
.cover{display:block;margin-top:5px;border-radius:9px;overflow:hidden;box-shadow:0 5px 18px #013c5710;background:#edf1f2;aspect-ratio:16/9}
.cover img{display:block;width:100%;height:auto;transition:transform .2s}.cover:hover img{transform:scale(1.025)}
.story-actions .open{margin-top:27px}.story-downloads{display:flex;gap:20px;margin-top:10px;flex-wrap:wrap}.story-downloads a{display:flex;align-items:center;min-height:44px;font-size:11px;color:#526572;text-decoration:none}.story-downloads a:hover{text-decoration:underline}
@media(max-width:850px){.story{grid-template-columns:130px minmax(0,1fr);gap:20px}.story-actions{grid-column:2}.story-actions .open{margin-top:0;max-width:300px}}
@media(max-width:650px){.story{grid-template-columns:minmax(0,1fr);gap:20px}.cover{width:100%;max-width:360px;margin:0}.story-actions{grid-column:1}.story-actions .open{max-width:none}.story-downloads{gap:24px}}
@media(prefers-reduced-motion:reduce){.cover img{transition:none}}

````

## Fil: public/stories.html

````text
<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kundröster · Kraftringen Kundrummet</title><link rel="icon" href="/icons/kundrum.svg"><link rel="stylesheet" href="/meeting-flow.css"></head><body><header class="top"><a href="/" aria-label="Till Kundrummet"><img src="/brand/kraftringen-logo.svg" alt="Kraftringen" width="180" height="31"></a><a href="/">← Till kundrummet</a></header><main><p class="eyebrow">KUNDERNAS EGNA ORD</p><h1>En plan för elen.<br>Mer fokus på verksamheten.</h1><p class="lead">Fem kunder berättar om sin erfarenhet av portföljförvaltning.</p><div class="reference-grid"><article class="sheet reference-card"><p class="eyebrow">Lantbruk</p><h2>Mats Palm</h2><blockquote>”Jag driver inte ett jordbruk för att sitta och spekulera i elpriset. Det viktiga är att ha en genomtänkt strategi över tid och slippa stressen kring när man ska binda. Det här upplägget känns betydligt mer seriöst än hur vi arbetade tidigare.”</blockquote><p class="quote-person">Mats Palm</p><a href="/presentation.html?deck=mats-palm">Visa kundrösten →</a></article><article class="sheet reference-card"><p class="eyebrow">Transport och logistik</p><h2>FREJA</h2><blockquote>”Det är så värdefullt för oss att ha en personlig kontakt på Kraftringen – det förenklar dialogen och ger oss tillgång till hjälp från någon som känner vår verksamhet och kan guida oss.”</blockquote><p class="quote-person">Marina Wallin</p><a href="/presentation.html?deck=freja">Visa kundrösten →</a></article><article class="sheet reference-card"><p class="eyebrow">Industri</p><h2>Repligen Sweden AB</h2><blockquote>”För oss handlar portföljavtalet om trygghet. Vi slipper gissa oss fram i elmarknaden och vet att någon som kan det här följer utvecklingen åt oss.”</blockquote><p class="quote-person">Anders Rosberg</p><a href="/presentation.html?deck=repligen">Visa kundrösten →</a></article><article class="sheet reference-card"><p class="eyebrow">Dagligvaruhandel</p><h2>ICA Bjärred</h2><blockquote>”För oss handlar det inte om att vinna en enskild månad. Det handlar om kontroll, stabilitet och en långsiktig strategi kring energikostnaderna. Nu arbetar vi mycket mer strukturerat.”</blockquote><p class="quote-person">Alex</p><a href="/presentation.html?deck=ica-bjarred">Visa kundrösten →</a></article><article class="sheet reference-card"><p class="eyebrow">Hotell</p><h2>First Hotel Planetstaden</h2><blockquote>”För oss är det viktigare att ha en långsiktig och genomtänkt strategi än att försöka tajma rätt månad eller vecka. Portföljupplägget har skapat en större trygghet och bättre förutsägbarhet i vår verksamhet.”</blockquote><p class="quote-person">Malin</p><a href="/presentation.html?deck=planetstaden">Visa kundrösten →</a></article></div><p class="reference-source">Källa: Kraftringens presentation Trygg Portfölj – ett stabilt alternativ till rörligt pris, avsnitt Kundreferenser. Erfarenheterna gäller portföljförvaltning och är inget löfte om ett visst pris eller resultat.</p></main></body></html>
````

## Fil: public/styles.css

````text
@font-face{font-family:'Poppins';font-style:normal;font-weight:400;font-display:swap;src:url('/brand/fonts/poppins-400.ttf') format('truetype')}
@font-face{font-family:'Poppins';font-style:normal;font-weight:500;font-display:swap;src:url('/brand/fonts/poppins-500.ttf') format('truetype')}
@font-face{font-family:'Poppins';font-style:normal;font-weight:600;font-display:swap;src:url('/brand/fonts/poppins-600.ttf') format('truetype')}
@font-face{font-family:'Poppins';font-style:normal;font-weight:700;font-display:swap;src:url('/brand/fonts/poppins-700.ttf') format('truetype')}
:root{--bg:#f7f8f3;--paper:#fff;--ink:#163a32;--muted:#6a7770;--border:#dce3d9;--lime:#d8f28b;--green:#2d6a51;--orange:#bb6a42}*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:110px}body{margin:0;background:var(--bg);color:var(--ink);font:14px 'Poppins',sans-serif}button,input,select,textarea{font:inherit}button,a,input,summary,select,textarea{-webkit-tap-highlight-color:transparent}button{cursor:pointer}a{color:inherit;text-decoration:none}button svg,svg.icon{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}button{color:inherit}button:focus-visible,a:focus-visible,summary:focus-visible{outline:3px solid #709f3b;outline-offset:4px}input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid #81a947;outline-offset:2px}.symbols{position:absolute;width:0;height:0;overflow:hidden}.header{height:92px;padding:0 max(4.5vw,24px);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;background:var(--bg);gap:24px}.brand{display:flex;gap:12px;align-items:center;font:800 23px 'Poppins',sans-serif;letter-spacing:-.8px}.brandmark{width:40px;height:40px;border-radius:50%;background:var(--ink);color:var(--lime);display:grid;place-items:center}.brandmark svg{width:27px;height:27px;fill:none;stroke:currentColor;stroke-width:1.5}.brand-sub{display:block;font:600 8px 'Poppins',sans-serif;letter-spacing:1.45px;margin-top:3px}.header nav{display:flex;gap:32px;height:100%;align-items:center;color:var(--muted);font-size:13px}.header nav a{height:100%;display:flex;align-items:center;border-bottom:2px solid transparent}.header nav a:hover,.header nav a.active{color:var(--ink);border-bottom-color:var(--ink)}.btn{min-height:42px;padding:11px 18px;border:1px solid transparent;border-radius:7px;display:inline-flex;gap:10px;align-items:center;justify-content:center;font-size:12px;font-weight:600;transition:background .2s,transform .2s}.btn:hover{transform:translateY(-1px)}.btn.light{background:#ecefe7}.btn.outlined{border-color:var(--border);background:transparent}.btn.primary{background:var(--ink);color:white}.btn.primary:hover{background:#285a47}.text-btn{border:0;background:transparent;padding:0;font-size:12px;font-weight:600;display:inline-flex;gap:10px;align-items:center;text-decoration:underline;text-underline-offset:4px}.text-btn svg{width:18px}main{max-width:1450px;margin:auto;padding:28px max(4.5vw,24px) 0}.contextline{display:flex;justify-content:space-between;align-items:center;font-size:9px;letter-spacing:1.8px;font-weight:600;color:var(--muted)}.status-dot{display:inline-block;width:6px;height:6px;background:#71a176;border-radius:50%;margin-right:9px}.demo-badge{padding:6px 9px;background:#ebece2;border:1px solid #e0e2d6;color:#656b57;font-size:8px;letter-spacing:1.15px;border-radius:4px}.hero{display:flex;justify-content:space-between;align-items:center;padding:48px 0 38px;gap:24px}.eyebrow{font-size:9px;letter-spacing:1.7px;font-weight:700;margin:0 0 14px;color:var(--muted)}h1,h2,h3,p{margin-top:0}h1{font:500 clamp(36px,4.3vw,62px)/1.1 'Poppins',sans-serif;letter-spacing:-3px;margin-bottom:20px}h1 em{font-style:normal;color:#658465}h2{font:500 29px/1.25 'Poppins',sans-serif;letter-spacing:-1.1px;margin:0}h3{font:600 15px/1.4 'Poppins',sans-serif;letter-spacing:-.3px}.lead{font-size:14px;color:var(--muted);line-height:1.8;margin:0}.advisor{display:flex;align-items:center;gap:13px;padding-top:24px;flex-shrink:0}.avatar{width:48px;height:48px;display:grid;place-items:center;border:1px solid #cdd6c5;border-radius:50%;background:#e5eadb;font:600 14px 'Poppins',sans-serif}.advisor strong,.advisor span{display:block}.advisor strong{font-size:12px;font-weight:600}.advisor span{font-size:11px;color:var(--muted);margin:5px 0 10px}.advisor .text-btn span{margin:0;color:var(--ink)}.summary-strip{display:grid;grid-template-columns:1fr 1fr 1fr 1.1fr;border-top:1px solid var(--border);border-bottom:1px solid var(--border);padding:24px 0;gap:20px}.summary-strip>div{padding-left:26px;border-left:1px solid var(--border)}.summary-strip>div:first-child{padding:0;border:0}.summary-strip span{font-size:10px;color:var(--muted);display:block}.summary-strip strong{font:500 22px 'Poppins',sans-serif;display:block;margin-top:8px;letter-spacing:-.6px}.summary-strip strong small{font:400 12px 'Poppins',sans-serif;letter-spacing:0;color:var(--muted)}.summary-strip .strip-action{display:flex;align-items:center;justify-content:flex-end}.small-dot{width:6px;height:6px;background:#9aa786;border-radius:50%;display:inline-block!important;margin-left:5px}.explore{padding:42px 0 0}.section-heading{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:24px;gap:20px}.section-heading .eyebrow{margin-bottom:10px}.quiet{font-size:11px;color:var(--muted);padding-bottom:5px}.explore-grid{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:22px}.comparison{background:white;border:1px solid var(--border);border-radius:12px;padding:23px 26px 18px;min-width:0}.scenario-tabs{display:flex;background:#f0f2ec;padding:4px;border-radius:7px;gap:4px}.scenario-tabs button{flex:1;border:0;background:transparent;border-radius:5px;padding:10px 6px;color:#69756a;font-size:11px;white-space:nowrap;transition:.2s}.scenario-tabs button span{font-size:13px;margin-right:4px}.scenario-tabs button[aria-pressed=true]{background:white;color:var(--ink);box-shadow:0 2px 5px #163a3210;font-weight:600}.chart-header{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;margin-top:30px}.chart-header h3{margin-bottom:5px;font-size:13px}.chart-header p{color:var(--muted);font-size:10px;line-height:1.5;max-width:440px;margin-bottom:10px}.chart-header>span{color:var(--muted);font-size:9px;white-space:nowrap;margin-top:3px}.cost-chart{width:100%;margin-top:0}.cost-chart svg{width:100%;height:auto;display:block;overflow:visible}.legend{display:flex;gap:18px;font-size:9px;align-items:center;margin:10px 0 25px;color:var(--muted);flex-wrap:wrap}.legend>span{display:flex;gap:7px;align-items:center}.legend .legend-unit{margin-left:auto;font-size:8px}.line{width:17px;height:3px;display:inline-block;border-radius:4px}.line.variable{background:var(--orange)}.line.secured{background:var(--green)}.result-grid{display:grid;grid-template-columns:1fr 1fr;gap:15px}.result{padding:17px 16px;background:#f7f7f2;border:1px solid #e7e8e0;border-radius:7px}.secured-result{background:#edf3e8;border-color:#dde7d3}.result-label{font-size:10px;font-weight:600;display:flex;align-items:center;gap:5px;flex-wrap:wrap}.dot{display:inline-block;width:6px;height:6px;background:var(--orange);border-radius:50%}.secured-result .dot{background:var(--green)}.result strong{font:500 clamp(21px,2.4vw,31px)/1.25 'Poppins',sans-serif;display:block;margin:15px 0 4px;letter-spacing:-1px}.result>span:not(.result-label){font-size:10px;color:var(--muted)}.result p{font-size:10px;line-height:1.6;color:var(--muted);margin:12px 0 0}.example-tag{font-size:7px;font-weight:400;border:1px solid #cfdbc7;border-radius:3px;padding:2px 3px;margin-left:auto}.insight{margin-top:18px;display:flex;gap:10px;align-items:center}.insight-icon{flex-shrink:0;width:26px;height:26px;background:#eff3e8;border-radius:50%;display:grid;place-items:center;font-size:14px}.insight p{font-size:10px;line-height:1.6;margin:0;color:#5c6e5c}.controls{background:var(--ink);border-radius:12px;color:white;padding:25px 24px;position:relative;overflow:hidden}.control-heading{display:flex;align-items:center;justify-content:space-between}.control-heading svg{width:19px;height:19px;stroke:var(--lime);fill:none;stroke-width:1.3}.controls .eyebrow{font-size:8px;letter-spacing:1.3px;color:#a8bdb0;margin:0}.controls h3{font-size:24px;font-weight:400;letter-spacing:-.7px;margin:22px 0 9px}.control-intro{color:#b4c7bc;font-size:11px;line-height:1.7;margin:0 0 28px}.control{margin-bottom:27px}.control label{display:flex;justify-content:space-between;font-size:11px;align-items:center;margin-bottom:15px}.control output{color:var(--lime);font-size:17px;letter-spacing:-.5px}input[type=range]{appearance:none;width:100%;margin:0;height:4px;cursor:pointer;accent-color:var(--lime);border-radius:10px;background:linear-gradient(to right,var(--lime) 0%,var(--lime) var(--fill,50%),#496557 var(--fill,50%));outline-offset:8px}input[type=range]::-webkit-slider-thumb{appearance:none;width:16px;height:16px;border-radius:50%;background:var(--lime);border:3px solid white;box-shadow:0 0 0 3px #ffffff10}input[type=range]::-moz-range-thumb{width:12px;height:12px;border-radius:50%;background:var(--lime);border:3px solid white}.range-labels{display:flex;justify-content:space-between;color:#98afa0;font-size:8px;margin-top:12px}.price-inputs{display:grid;gap:14px}.price-inputs label{font-size:10px;color:#c0d1c5}.input-unit{display:flex;border:1px solid #486155;border-radius:5px;background:#23473a;align-items:center;margin-top:7px;padding:9px 12px;gap:12px}.input-unit input{background:transparent;color:white;width:100%;border:0;min-width:0;font-size:16px;outline-offset:3px}.input-unit span{font-size:9px;white-space:nowrap;color:#a7bdac}.control-footnote{font-size:9px;line-height:1.7;color:#b4c7bc;margin:18px 0}.reset{border:0;border-top:1px solid #3c594c;background:transparent;display:flex;justify-content:space-between;width:100%;padding:17px 0 0;font-size:10px;color:var(--lime)}.calculation{border-bottom:1px solid var(--border);margin-top:14px}.calculation summary{display:flex;justify-content:space-between;padding:16px 0;font-size:10px;color:var(--muted);cursor:pointer;list-style:none}.calculation summary::-webkit-details-marker{display:none}.calculation[open] summary span{transform:rotate(45deg)}.calculation-body{padding:10px 0 22px;font-size:12px;color:var(--muted);line-height:1.8}.table-scroll{overflow:auto}table{width:100%;border-collapse:collapse;font-size:11px;text-align:right;white-space:nowrap}th,td{padding:10px;border-bottom:1px solid var(--border)}th:first-child,td:first-child{text-align:left}caption{text-align:left;padding:10px;font-weight:600}tfoot{font-weight:600}.profile-section{display:grid;grid-template-columns:1fr 1.65fr;gap:65px;padding:54px 0;border-bottom:1px solid var(--border);align-items:center}.profile-copy h2{font-size:29px;line-height:1.3}.profile-copy p:not(.eyebrow){font-size:12px;color:var(--muted);line-height:1.9;margin:17px 0 22px;max-width:300px}.source-note{display:block;font-size:9px;color:var(--muted);margin-top:13px}.profile-visual{min-width:0}.profile-chart-top{display:flex;justify-content:space-between;align-items:center;gap:12px}.profile-chart-top h3{font-size:12px;margin:0}.profile-chart-top span{font-size:9px;color:var(--muted)}.profile-chart{height:190px;display:flex;gap:10px;align-items:flex-end;padding:23px 0 0}.profile-bar{display:flex;flex:1;flex-direction:column;justify-content:flex-end;height:100%;gap:8px;text-align:center;min-width:0}.profile-bar .bar{background:#d7e2ce;border-radius:4px 4px 0 0;min-height:2px;transition:height .4s}.profile-bar.peak .bar{background:#517358}.profile-bar .value{font-size:9px;color:var(--muted)}.profile-bar .month{font-size:9px;color:var(--muted)}.profile-facts{display:flex;justify-content:space-between;border-top:1px solid var(--border);padding-top:17px;margin-top:18px;font-size:10px;color:var(--muted);gap:12px}.profile-facts strong{font-weight:500;color:var(--ink)}.meeting-section{padding:45px 0}.save-status{font-size:9px;color:var(--muted)}.meeting-grid{display:grid;grid-template-columns:1fr 1fr;gap:28px}.meeting-grid label,dialog label{display:block;font-size:11px;font-weight:500}.meeting-grid textarea,.meeting-grid input,.meeting-grid select,dialog input:not([type=file]){width:100%;padding:12px;border:1px solid var(--border);background:white;border-radius:6px;margin-top:9px;color:var(--ink);font-size:12px}.meeting-grid textarea{resize:vertical;min-height:174px;line-height:1.8}.meeting-grid textarea::placeholder,.meeting-grid input::placeholder{color:#8b968b}.meeting-grid select{height:43px}.next-fields{display:grid;grid-template-columns:1.5fr 1fr;gap:12px;margin-top:17px}.next-block p{font-size:9px;line-height:1.7;color:var(--muted);margin:12px 0 0}.meeting-bottom{display:flex;justify-content:space-between;align-items:center;padding:25px 0 0;gap:20px}.meeting-bottom p{font-size:12px;color:var(--muted);margin:0}footer{padding:25px 0 32px;border-top:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;gap:24px}.footer-brand{font:700 16px 'Poppins',sans-serif}.footer-brand span{display:block;font:400 9px 'Poppins',sans-serif;color:var(--muted);margin-top:6px}footer p{font-size:9px;line-height:1.8;color:var(--muted);margin:0}footer .text-btn{font-size:9px}dialog{width:min(650px,calc(100% - 30px));max-height:90dvh;border:1px solid var(--border);border-radius:14px;padding:30px;background:var(--bg);color:var(--ink);box-shadow:0 30px 100px #163a3230}dialog::backdrop{background:#102f2770;backdrop-filter:blur(4px)}.dialog-head{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:24px;gap:18px}.dialog-head h2{font-size:27px}.close{background:#e8ece2;border:0;border-radius:50%;width:32px;height:32px;flex-shrink:0;font-size:22px;line-height:1}.import-area{border:1px dashed #b9c7b2;border-radius:8px;padding:16px;margin:20px 0;display:flex;flex-wrap:wrap;align-items:center;gap:13px}.import-area>div{flex:1;min-width:200px}.import-area strong{font-size:11px}.import-area p{font-size:10px;line-height:1.6;color:var(--muted);margin:6px 0 0}.file-label{position:relative;overflow:hidden;cursor:pointer}.file-label input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%}.file-label:focus-within{outline:2px solid var(--green)}.import-area .text-btn{font-size:10px}.month-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:13px}.month-grid input{font-size:12px!important;padding:9px!important}.month-grid label span{font-size:9px;color:var(--muted);font-weight:400}.profile-dialog-total{display:flex;justify-content:space-between;padding:18px 0;margin-top:12px;border-bottom:1px solid var(--border);font-size:12px}.dialog-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:20px}.form-message{font-size:11px;line-height:1.6;margin:10px 0;color:var(--green)}.form-message.error{color:#a13328}#exportDialog{max-width:480px}dialog>p{font-size:12px;line-height:1.8;color:var(--muted)}.export-option{width:100%;display:flex;justify-content:space-between;align-items:center;text-align:left;padding:18px 0;background:transparent;border:0;border-bottom:1px solid var(--border)}.export-option strong{display:block;font-size:12px}.export-option small{display:block;color:var(--muted);font-size:10px;margin-top:5px}.export-note{margin:18px 0 0;font-size:10px!important}.error-field{outline:2px solid #b84232!important}#toast{position:fixed;bottom:25px;left:50%;transform:translateX(-50%);padding:13px 20px;background:var(--ink);color:white;box-shadow:0 5px 20px #163a3220;border-radius:7px;font-size:12px;opacity:0;pointer-events:none;transition:opacity .2s;z-index:20;max-width:90vw}#toast.show{opacity:1}#printArea{display:none}
@media(min-width:1500px){main{padding-left:60px;padding-right:60px}}@media(max-width:1100px){.explore-grid{grid-template-columns:minmax(0,1fr) 260px;gap:16px}.controls{padding:22px 18px}.comparison{padding:20px}.legend .legend-unit{width:100%;margin:0}.summary-strip strong{font-size:18px}.profile-section{gap:35px}.result strong{font-size:24px}.example-tag{margin-left:0}.result-label{min-height:28px}}@media(max-width:850px){.header nav{gap:18px}.header{height:76px;padding:0 24px}.hero{padding:35px 0}.advisor{display:none}main{padding-left:24px;padding-right:24px}.explore-grid{grid-template-columns:1fr}.controls{display:grid;grid-template-columns:1fr 1fr;column-gap:30px;padding:24px}.control-heading,.controls h3,.control-intro,.control-footnote,.reset{grid-column:1/-1}.controls h3{margin-top:14px}.control-intro{margin-bottom:20px}.price-inputs{grid-column:1/-1;grid-template-columns:1fr 1fr}.control-footnote{margin:15px 0}.profile-section{gap:30px;grid-template-columns:1fr 1.5fr}.profile-copy h2{font-size:24px}.profile-chart{gap:6px}.quiet{display:none}.summary-strip{grid-template-columns:1fr 1fr 1fr}.summary-strip .strip-action{display:none}.result strong{font-size:32px}.legend .legend-unit{width:auto;margin-left:auto}.result-label{min-height:0}.example-tag{margin-left:auto}.meeting-grid{gap:20px}.next-fields{grid-template-columns:1fr}footer{flex-wrap:wrap}footer p{order:3;width:100%}}@media(max-width:560px){.header{padding:0 18px;height:74px}.header nav{display:none}.header .btn{font-size:10px;padding:10px}.header .btn svg{width:15px}.brand{font-size:20px;gap:8px}.brandmark{width:34px;height:34px}.brand-sub{font-size:6.5px}main{padding:22px 18px 0}.contextline{font-size:7px;letter-spacing:1px}.demo-badge{font-size:6.5px;padding:5px;letter-spacing:.5px}.hero{padding:32px 0}.hero .eyebrow{font-size:8px}h1{font-size:39px;letter-spacing:-2px;max-width:330px;line-height:1.17}.lead{font-size:12px}.desktop-break{display:none}.summary-strip{padding:20px 0;gap:12px}.summary-strip>div{padding-left:12px}.summary-strip span{font-size:8px;line-height:1.5}.summary-strip strong{font-size:15px;letter-spacing:-.4px}.summary-strip strong small{font-size:10px}.summary-strip .small-dot{display:none!important}.explore{padding-top:30px}h2{font-size:25px}.eyebrow{font-size:8px}.section-heading{margin-bottom:20px}.comparison{padding:15px 13px;border-radius:9px}.scenario-tabs{gap:0;padding:3px}.scenario-tabs button{font-size:9px;padding:10px 3px}.scenario-tabs button span{margin-right:2px;font-size:11px}.chart-header{margin-top:24px;gap:10px}.chart-header h3{font-size:12px}.chart-header p{font-size:9px}.chart-header>span{font-size:8px}.legend{font-size:8px;gap:12px;margin-bottom:20px}.legend .legend-unit{width:100%;margin-left:0;font-size:7px}.result-grid{gap:8px}.result{padding:13px 10px}.result-label{font-size:9px;min-height:29px;align-content:flex-start}.example-tag{margin-left:0;font-size:6px}.result strong{font-size:24px;letter-spacing:-1px;margin-top:10px}.result>span:not(.result-label){font-size:8px}.result p{font-size:9px}.insight p{font-size:9px}.controls{padding:22px 20px;gap:0 20px;border-radius:9px}.control label{font-size:10px}.control output{font-size:16px}.control .range-labels{font-size:7px}.price-inputs{gap:12px}.price-inputs label{font-size:9px}.input-unit{padding:9px 8px;gap:5px}.input-unit input{font-size:14px}.input-unit span{font-size:8px}.calculation summary{font-size:9px}.profile-section{grid-template-columns:1fr;padding:35px 0;gap:30px}.profile-copy h2{font-size:26px}.profile-copy h2 br{display:none}.profile-copy p:not(.eyebrow){max-width:none;margin-top:14px}.profile-chart{height:170px;gap:6px}.profile-chart .value{font-size:8px}.profile-chart .month{font-size:8px}.profile-chart-top span{font-size:8px}.profile-facts{font-size:9px}.meeting-section{padding:32px 0}.meeting-section .section-heading{align-items:flex-start;flex-direction:column;gap:10px}.meeting-grid{grid-template-columns:1fr}.meeting-grid textarea{min-height:130px}.next-fields{grid-template-columns:1fr}.meeting-bottom{align-items:stretch;flex-direction:column;gap:15px}.meeting-bottom p{font-size:11px}.meeting-bottom .btn{width:100%}.month-grid{grid-template-columns:repeat(3,1fr);gap:11px}dialog{padding:23px 18px}.dialog-actions .btn{font-size:11px;padding:10px 13px}.import-area{padding:13px}.profile-dialog-total{font-size:11px}footer .text-btn{font-size:8px}footer p{font-size:8px}.save-status{font-size:8px}}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important;animation:none!important}}@media print{@page{size:A4;margin:16mm}body{background:white;color:#163a32;font:10pt Arial,sans-serif}.header,main,dialog,#toast,.symbols{display:none!important}#printArea{display:block}#printArea h1{font:24pt Arial;letter-spacing:-1px;margin:10px 0}#printArea h2{font:16pt Arial;margin:22px 0 10px}#printArea p{font-size:10pt;line-height:1.6}#printArea table{font-size:8pt;white-space:normal}#printArea th,#printArea td{padding:6px}#printArea .print-note{background:#f1f3ed;padding:10px}#printArea .print-totals{display:flex;gap:40px;margin:22px 0}#printArea .print-totals strong{display:block;font-size:18pt;margin-top:5px}#printArea .print-notes{white-space:pre-wrap;overflow-wrap:anywhere}#printArea tr{break-inside:avoid}#printArea h2{break-after:avoid}}
/* Readable touch controls on small screens. */
.result strong,.summary-strip strong{overflow-wrap:anywhere}
@media(max-width:560px){.scenario-tabs button{min-height:44px;font-size:10px}.scenario-tabs button span{display:none}.result p,.insight p,.control-footnote{font-size:10px}.control label,.price-inputs label{font-size:11px}.control .range-labels{font-size:9px}.input-unit input,.meeting-grid textarea,.meeting-grid input,.meeting-grid select,dialog input:not([type=file]),.month-grid input{font-size:16px!important}.result-label{font-size:10px}.result>span:not(.result-label){font-size:10px}.text-btn{min-height:32px}.calculation summary{font-size:11px;line-height:1.5}.source-note,.save-status{font-size:10px}.controls{column-gap:16px}.input-unit span{font-size:8px}}
/* Workbook-backed comparison */
.result-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.result{padding:16px 12px}.result strong{font-size:clamp(20px,2vw,28px)}.result-label{min-height:28px}.fixed-result{background:#f0f3f5;border-color:#e0e5e8}.fixed-result .dot,.line.fixed{background:#738397}.price-breakdown{margin-top:20px;padding:16px 0;border-top:1px solid var(--border);border-bottom:1px solid var(--border)}.breakdown-heading{font-size:10px;color:var(--muted)}.price-breakdown>div{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-top:13px}.price-breakdown span span{display:block}.price-breakdown>div>span{font-size:9px;color:var(--muted)}.price-breakdown strong{display:block;font:600 18px 'Poppins',sans-serif;color:var(--ink);margin-bottom:4px}.price-breakdown b{font-size:14px;font-weight:400;color:#899383}.breakdown-total strong{color:var(--green)}.missing{color:#92998f}.profile-bar.missing .bar{background:transparent}.source-filename{overflow-wrap:anywhere;font-size:10px}.basis-note{font-size:11px;line-height:1.6;background:#f4f3e7;padding:12px;border-radius:6px;margin:15px 0 0}.price-inputs{grid-template-columns:1fr}.profile-section{align-items:start}.legend{gap:14px}.legend .legend-unit{width:100%;margin-left:0}
@media(max-width:850px){.price-inputs{grid-template-columns:repeat(3,minmax(0,1fr))}.result strong{font-size:25px}.result-label{min-height:30px}}
@media(max-width:560px){.result-grid{grid-template-columns:1fr;gap:8px}.result{display:grid;grid-template-columns:1fr auto;gap:4px 12px;padding:14px}.result-label{min-height:0;grid-column:1;align-content:center}.result strong{grid-column:2;grid-row:1/3;margin:0;align-self:center;font-size:25px}.result>span:not(.result-label){grid-column:1}.result p{grid-column:1/-1;margin-top:4px;font-size:10px}.example-tag{display:none}.price-inputs{grid-template-columns:1fr 1fr}.price-inputs label:last-child{grid-column:1/-1}.price-breakdown strong{font-size:16px}.price-breakdown>div>span{font-size:8px}.price-breakdown>div{gap:3px}.controls{column-gap:18px}.summary-strip strong{font-size:14px}.scenario-tabs button{white-space:normal}.contextline{gap:10px}.demo-badge{text-align:right}.chart-header>span{display:none}}
@media print{#printArea .print-totals{gap:25px}#printArea .print-totals strong{font-size:16pt}#printArea .source-filename{font-size:8pt}}

````

## Fil: test-business-impact.mjs

````text
import assert from 'node:assert/strict';
import {defaults,calculate,validateState} from './public/model.mjs';
import {businessImpact,validBusiness,BUSINESS_TYPES} from './public/business-impact.mjs';
import {buildCustomerEmail} from './public/customer-email.mjs';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const s=defaults();s.business={type:'brf',apartments:50};
let i=businessImpact(calculate(s),s);close(i.amount,220.6048);assert.equal(i.unit,'kr per lägenhet');assert.match(i.result,/220,60/);assert.match(i.sensitivity,/1.?860,00 kr/);assert.match(i.basis,/inte en beräknad ändring/);
const email=buildCustomerEmail(s);assert.match(email.text,/220,60 kr per lägenhet/);assert.match(email.body,/220,60 kr per lägenhet/);
s.period='2026';i=businessImpact(calculate(s),s);close(i.amount,745.4016);assert.match(i.scope,/9 av 12/);assert.match(i.sensitivity,/1.?260,00 kr/);assert.doesNotMatch(i.result,/per år|per månad/);
s.period='2025';s.portfolioFee=100;i=businessImpact(calculate(s),s);close(i.amount,-3424.9952);assert.equal(i.kind,'extra');assert.match(i.caption,/Högre/);
s.hedge=0;s.portfolioFee=s.variableFee;i=businessImpact(calculate(s),s);close(i.amount,0);assert.equal(i.kind,'equal');assert.match(i.percentText,/Samma/);
s.profiles['2025']=Array(12).fill(0);i=businessImpact(calculate(s),s);assert.equal(i.amount,null);assert.equal(i.kind,'empty');assert.equal(i.percent,null);
for(const apartments of [0,-1,1.5,100001,'50',NaN,Infinity])assert.equal(validBusiness({type:'brf',apartments}),false);
assert.equal(validBusiness({type:'__proto__',apartments:null}),false);assert.equal(validBusiness(null),false);
const old=defaults();delete old.business;assert.equal(validateState(old),true);assert.equal(businessImpact(calculate(old),old).business.type,'company');
const roundtrip=JSON.parse(JSON.stringify({...defaults(),business:{type:'brf',apartments:50}}));assert.equal(validateState(roundtrip),true);close(businessImpact(calculate(roundtrip),roundtrip).amount,220.6048);
for(const type of Object.keys(BUSINESS_TYPES)){const s=defaults(),before=calculate(s);s.business={type,apartments:type==='brf'?50:null};assert.equal(validateState(s),true);assert.deepEqual(calculate(s),before);}
console.log('PASS: per-apartment arithmetic, partial-year coverage without annualization, one-ore conversion, negative/equal/empty outcomes, email consistency, old state compatibility, JSON round-trip and unchanged pricing across sectors.');

````

## Fil: test-customer-agreement-dom.mjs

````text
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {JSDOM} from 'jsdom';
import {handlePriceRecords} from './lib/price-records.mjs';
const dom=new JSDOM(await readFile('public/index.html','utf8'),{url:'https://kundrum.test/'}),w=dom.window,errors=[];
Object.assign(globalThis,{window:w,document:w.document,localStorage:w.localStorage,confirm:()=>true});
Object.defineProperty(globalThis,'navigator',{value:{},configurable:true});
w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
w.addEventListener('error',e=>errors.push(e.error));
const sql=new DatabaseSync(':memory:');sql.exec(await readFile('drizzle/0000_sloppy_eternals.sql','utf8'));
const db={prepare(query){return {bind(...params){const statement=sql.prepare(query);return {first:async()=>statement.get(...params)||null,all:async()=>({results:statement.all(...params)}),run:async()=>statement.run(...params)};}};}};
let failSave=false,authorized=true;
globalThis.fetch=async(path,init={})=>{
 if(!path.startsWith('/api/'))return new Response(await readFile('public'+path));
 if(failSave&&init.method==='POST')throw Error('Test: nätverksavbrott');
 return handlePriceRecords(new Request('https://kundrum.test'+path,{...init,headers:{...init.headers,...authorized?{'oai-authenticated-user-id':'seller-1','oai-authenticated-user-email':'test@example.com'}:{}}}),db);
};
await import('./public/meeting-flow.mjs?customer-flow-test');
const el=id=>document.getElementById(id),state=()=>JSON.parse(localStorage.getItem('kundrum-meeting-v1'));
const click=selector=>document.querySelector(selector).dispatchEvent(new w.MouseEvent('click',{bubbles:true,cancelable:true}));
const input=(id,value)=>{const target=el(id);if(target.type==='checkbox')target.checked=value;else target.value=value;target.dispatchEvent(new w.Event('input',{bubbles:true}));target.dispatchEvent(new w.Event('change',{bubbles:true}));};
async function settled(){for(let i=0;i<30;i++)await new Promise(r=>setTimeout(r,1));}
input('customer','Testkund AB');input('annual','12000');input('shape','even');click('#applyAnnual');click('[data-step="2"]');click('[data-contract="fixed"]');click('[data-period="2026"]');input('manualPrice','80');click('[data-comparison="customer"]');
click('#showComparison');assert(!el('step2').hidden);assert(el('agreementError').textContent.includes('leverantör'));
for(const [id,value]of Object.entries({provider:'Fortum',type:'fixed',area:'SE4',sourceType:'contract',sourceRef:'Avtal 123',sourceDate:'2026-01-01',mode:'constant',rate:'100',monthlyFee:'50',scopeConfirmed:true,comparisonArea:'SE4',selectedMonthlyFee:'25',comparisonScopeChecked:true}))input('ca-'+id,value);
click('#showComparison');assert(!el('step3').hidden,el('agreementError').textContent);assert.match(el('result').textContent,/2\s700,00/);assert(el('result').textContent.includes('Fortum · Fastpris'));
click('[data-step="2"]');failSave=true;click('#ca-save');await settled();assert(el('ca-status').textContent.includes('nätverksavbrott'));assert.equal(state().customerAgreement.rate,100);assert(!el('ca-save').disabled);
failSave=false;click('#ca-save');await settled();assert(el('ca-status').textContent.includes('Sparat i teamets prisbank'),el('ca-status').textContent);const first=state().customerAgreementRecord.id;
input('ca-rate','110');click('#ca-save');await settled();const second=state().customerAgreementRecord.id;assert.notEqual(first,second);assert.equal(sql.prepare('SELECT supersedes FROM price_records WHERE id=?').get(second).supersedes,first);
click('#ca-bankOpen');await settled();assert.equal(document.querySelectorAll('.ca-record').length,2);input('ca-search','fortum');input('ca-year','2025');click('#ca-searchButton');await settled();assert.equal(document.querySelectorAll('.ca-record').length,0);input('ca-year','2026');click('#ca-searchButton');await settled();assert.equal(document.querySelectorAll('.ca-record').length,2);
click(`[data-record="${first}"]`);assert.equal(state().customerAgreement.rate,100);assert(!el('ca-bank').open);
// Opening another customer's saved record starts a clean meeting, never reuses their consumption.
input('ca-customer','Annan Testkund');click('#ca-save');await settled();const other=state().customerAgreementRecord.id;input('ca-customer','Testkund AB');click('#ca-bankOpen');await settled();click(`[data-record="${other}"]`);assert.equal(state().customer,'Annan Testkund');assert(state().profiles['2026'].every(x=>x===null));assert(!el('step1').hidden);
// Invoices deliberately replace estimated volumes only after explicit action.
input('annual','12000');click('#applyAnnual');click('[data-step="2"]');input('ca-mode','invoice');
const month=document.querySelector('[data-ca-month="2026-01"][data-part="kwh"]');month.value='1234';month.dispatchEvent(new w.Event('input',{bubbles:true}));click('#ca-applyVolumes');assert.equal(state().profiles['2026'][0],1234);assert.equal(state().profiles['2026'][1],null);assert.equal(state().sources['2026'],'own');assert.equal(state().consumptionMode,'separate');
authorized=false;click('#ca-bankOpen');await settled();assert(el('ca-bankStatus').textContent.includes('Logga in'));assert.equal(state().customerAgreement.months['2026-01'].kwh,1234);assert.deepEqual(errors,[]);
console.log('PASS: customer form, comparison guards, correct money, local draft, failed save/retry, shared versions and search, reload record, customer isolation, invoice volume replacement and signed-out state.');

````

## Fil: test-customer-agreement.mjs

````text
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {newCustomerAgreement,customerMonth,agreementErrors,validCustomerAgreement} from './public/customer-agreement.mjs';
import {initialMeeting,meetingResult,normalizeMeeting} from './public/meeting-model.mjs';
import {handlePriceRecords} from './lib/price-records.mjs';
import {createMeetingPdf} from './public/meeting-pdf.mjs';
const fixture=()=>Object.assign(newCustomerAgreement('Testkund AB'),{provider:'Fortum',area:'SE4',sourceType:'contract',sourceRef:'Avtal 2026-123',sourceDate:'2026-01-01',from:'2026-01',to:'2026-12',mode:'constant',rate:100,monthlyFee:50,scopeConfirmed:true});
const a=fixture();assert(validCustomerAgreement(a));assert.deepEqual(agreementErrors(a,{forComparison:true}),[]);
// 1,000 kWh × 1 SEK + 50 SEK = 1,050. A fee is charged even at zero consumption.
assert.equal(customerMonth(a,'2026-01',1000).cost,1050);assert.equal(customerMonth(a,'2026-01',1000).rate,105);assert.equal(customerMonth(a,'2026-01',0).cost,50);
assert.equal(customerMonth(a,'2025-12',1000).available,false);
const components={...a,composition:'components',margin:4,other:6};assert.equal(customerMonth(components,'2026-01',1000).cost,1150);
assert.equal(customerMonth({...components,other:null},'2026-01',1000).available,false);
assert.equal(customerMonth({...a,rate:-10,monthlyFee:0},'2026-01',1000).cost,-100);
assert(agreementErrors({...a,scopeConfirmed:false},{forComparison:true}).length);
assert(agreementErrors({...a,monthlyFee:null},{forComparison:true}).length);
const m=Object.assign(initialMeeting(),{customer:'Testkund AB',period:'2026',contract:'fixed',fixedPrice:80,comparisonMode:'customer',customerAgreement:a,comparisonArea:'SE4',comparisonScopeChecked:true,selectedMonthlyFee:25});m.profiles['2026']=Array(12).fill(1000);m.profiles['2025']=Array(12).fill(1000);
let r=meetingResult(m);assert.equal(r.count,12);assert.equal(r.selected,9900);assert.equal(r.variable,12600);assert.equal(r.difference,2700);assert.equal(r.differenceRate,22.5);assert(r.referenceLabel.includes('Fortum'));
assert.throws(()=>meetingResult({...m,comparisonArea:'SE3'}),/elområde/);assert.throws(()=>meetingResult({...m,customer:'Annan kund'}),/olika kunder/);
const monthly={...a,mode:'monthly',months:{'2026-01':{rate:100,amount:null,kwh:null},'2026-03':{rate:200,amount:null,kwh:null}}};r=meetingResult({...m,customerAgreement:monthly});assert.equal(r.count,2);assert.equal(r.volume,2000);assert.equal(r.variable,3100);assert.equal(r.selected,1650);assert.equal(r.difference,1450);
const invoice={...a,mode:'invoice',sourceType:'invoice',months:{'2026-01':{amount:1075,kwh:1000,rate:null},'2026-02':{amount:2000,kwh:1100,rate:null}}};r=meetingResult({...m,customerAgreement:invoice});assert.equal(r.count,1);assert.equal(r.variable,1075);assert.equal(r.difference,250);assert(r.rows[1].missingReason.toLowerCase().includes('förbrukningen'));
r=meetingResult({...m,customerAgreement:invoice,sources:{...m.sources,'2026':'estimated'}});assert.equal(r.count,0);
// Existing history: unknown October–December remain missing for portfolio comparisons.
r=meetingResult({...m,contract:'individual'});assert.equal(r.count,9);
assert.equal(normalizeMeeting({...initialMeeting()}).comparisonMode,'reference');
const sql=new DatabaseSync(':memory:');sql.exec(await readFile('drizzle/0000_sloppy_eternals.sql','utf8'));
const db={prepare(query){return {bind(...params){const statement=sql.prepare(query);return {first:async()=>statement.get(...params)||null,all:async()=>({results:statement.all(...params)}),run:async()=>statement.run(...params)};}};}};
const id='5b28c6bb-8d44-4f60-833a-120628c22620',id2='30a3d0d5-23b0-4c2a-aa40-bc6bbbca7595';
const req=(method='GET',body,headers={},suffix='')=>new Request('https://kundrum.test/api/price-records'+suffix,{method,headers:{'oai-authenticated-user-id':'seller-1','oai-authenticated-user-email':'seller@example.com','Content-Type':'application/json','X-Requested-With':'Kundrummet',...headers},...(body?{body:JSON.stringify(body)}:{})});
assert.equal((await handlePriceRecords(new Request('https://kundrum.test/api/price-records'),db)).status,401);
assert.equal((await handlePriceRecords(req('POST',{id,agreement:a},{origin:'https://evil.test'}),db)).status,403);
assert.equal((await handlePriceRecords(req('POST',{id,agreement:a},{'x-requested-with':''}),db)).status,415);
assert.equal((await handlePriceRecords(req('POST',{id,agreement:{...a,rate:'100'}}),db)).status,400);
assert.equal((await handlePriceRecords(req('POST',{id,agreement:{...a,sourceRef:''}}),db)).status,400);
let saved=await handlePriceRecords(req('POST',{id,agreement:a}),db);assert.equal(saved.status,201);const record=(await saved.json()).record;assert.equal(record.createdName,'seller@example.com');
assert.equal((await handlePriceRecords(req('POST',{id,agreement:a}),db)).status,200,'Retry must not create duplicate');
assert.equal((await handlePriceRecords(req('POST',{id,agreement:{...a,rate:101}}),db)).status,409,'Existing record immutable');
assert.equal((await handlePriceRecords(req('POST',{id,agreement:a},{'oai-authenticated-user-id':'seller-2'}),db)).status,409);
saved=await handlePriceRecords(req('POST',{id:id2,agreement:{...a,rate:101},supersedes:id}),db);assert.equal(saved.status,201);
let bank=await (await handlePriceRecords(req('GET',undefined,{},'?q=Fortum&year=2026'),db)).json();assert.equal(bank.records.length,2);
bank=await (await handlePriceRecords(req('GET',undefined,{},'?q=Fortum&year=2025'),db)).json();assert.equal(bank.records.length,0);
bank=await (await handlePriceRecords(req('GET',undefined,{},'?q=%25'),db)).json();assert.equal(bank.records.length,0,'LIKE wildcard must be literal');
const before=await (await handlePriceRecords(req('GET',undefined,{},'?id='+id),db)).json();assert.equal(before.record.agreement.rate,100);
assert.equal((await handlePriceRecords(req('DELETE'),db)).status,405);
const fetcher=async path=>new Response(await readFile(new URL('./public'+path,import.meta.url)));
const pdf=await createMeetingPdf({...m,customerAgreementRecord:record},{fetcher});assert(pdf.audit.some(x=>x.text.includes('Fortum / Testkund AB')));assert(pdf.audit.some(x=>x.text.includes('Kundens avtal')));assert(pdf.audit.every(x=>x.top+x.height<530));
await mkdir('outputs',{recursive:true});await writeFile('outputs/customer-comparison.pdf',pdf.bytes);
console.log('PASS: independent fee/math fixtures, complete/manual and partial/historical periods, invoices/consumption matching, missing data, negative prices, area/scope validation; actual SQLite API authentication, CSRF, immutable versions, retry, filters and PDF provenance.');

````

## Fil: test-customer-email.mjs

````text
import assert from 'node:assert/strict';
import {defaults,annualProfile,validateState} from './public/model.mjs';
import {buildCustomerEmail,emailFile,mailtoLink,sellerNotesTitle,validEmail} from './public/customer-email.mjs';
const s=defaults(),recipient={recipientName:'Anna',recipientEmail:'anna@example.com'};
s.notes='Budget och risk.\nVi följer upp nästa vecka.';s.next='Gå igenom årsförbrukningen';s.date='2026-11-04';
const e=buildCustomerEmail(s,recipient);
for(const value of ['135 489,80','124 459,56','11 030,24','5,93','80 %','20 %','Ludwig Rosenbergs anteckningar',s.notes,s.next,s.date])assert.ok(e.text.includes(value),value);
assert.ok(e.html.includes('Budget och risk.'));assert.ok(e.notesIncluded);assert.ok(!buildCustomerEmail(s,{...recipient,includeNotes:false}).text.includes(s.notes));assert.ok(!buildCustomerEmail({...s,notes:'   '},recipient).text.includes('anteckningar'));
const old=structuredClone(s);delete old.sellerName;assert.ok(validateState(old));assert.match(buildCustomerEmail(old).text,/Ludwig Rosenberg/);
assert.equal(validateState({...s,sellerName:'\n'}),false);assert.equal(sellerNotesTitle('Marcus'),'Marcus anteckningar');
const partial=buildCustomerEmail({...s,period:'2026'},recipient);assert.match(partial.text,/9 av 12 månader/);assert.match(partial.text,/Okt, Nov, Dec/);assert.ok(partial.text.includes('37 270,08'));
const estimated=structuredClone(s);estimated.period='2026';estimated.profiles['2026']=annualProfile(100000,'winter');estimated.sources['2026']='estimated';estimated.estimates['2026']={annualKwh:100000,shape:'winter',adjusted:false};assert.match(buildCustomerEmail(estimated).text,/Uppskattad profil: vintertung/);assert.match(buildCustomerEmail(estimated).text,/70 000 kWh/);
assert.match(buildCustomerEmail({...s,portfolioFee:20}).text,/Merkostnad med portfölj/);
assert.match(buildCustomerEmail({...s,hedge:0,portfolioFee:s.variableFee}).text,/Samma beräknade kostnad/);
const zero=structuredClone(s);zero.profiles['2025'].fill(0);assert.throws(()=>buildCustomerEmail(zero));
const unsafe=buildCustomerEmail({...s,customer:'<img src=x onerror=alert(1)>',notes:'<script>bad()</script>',sellerName:'Karl & Oscar'},recipient);assert.ok(!unsafe.body.includes('<script>'));assert.ok(!unsafe.body.includes('<img'));assert.match(unsafe.body,/&lt;script&gt;/);assert.match(unsafe.body,/Karl &amp; Oscar/);
for(const bad of ['','a@b','a@example.com\r\nBcc:b@example.com','a@example.com,b@example.com','a\0b@example.com'])assert.equal(validEmail(bad),false);
assert.ok(validEmail('anna+kund@example.com'));const link=mailtoLink({...e,recipientEmail:'a%0Abcc=x@example.com'});assert.ok(link.includes('a%250Abcc%3Dx@example.com'));assert.ok(!link.includes('bcc=x'));
const mime=emailFile(e);assert.match(mime,/X-Unsent: 1/);assert.match(mime,/multipart\/alternative/);assert.ok(mime.split('\r\n').every(line=>line.length<998));
console.log('PASS: customer summary totals, notes, seller names, partial-year/estimated disclosure, negative and zero outcomes, HTML escaping, recipient/header safety and MIME generation.');

````

## Fil: test-meeting-delivery.mjs

````text
import assert from 'node:assert/strict';
import {bindPdfDelivery} from './public/meeting-delivery.mjs';
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

````

## Fil: test-meeting-experience.mjs

````text
import assert from 'node:assert/strict';
import {annualProfile} from './public/model.mjs';
import {initialMeeting,validMeeting,normalizeMeeting,syncSharedProfile,copyProfile,meetingResult} from './public/meeting-model.mjs';
import {monthComparison,priceRanges,meetingChart,benefitsHtml} from './public/meeting-insights.mjs';
const s=initialMeeting();
assert.equal(s.consumptionMode,'shared');
s.profiles['2025']=annualProfile(120000,'winter');s.sources['2025']='estimated';s.estimates={'2025':{annualKwh:120000,shape:'winter',adjusted:false}};
syncSharedProfile(s,'2025');
assert.deepEqual(s.profiles['2026'],s.profiles['2025']);assert.notEqual(s.profiles['2026'],s.profiles['2025']);
assert.deepEqual(s.estimates['2026'],s.estimates['2025']);assert.notEqual(s.estimates['2026'],s.estimates['2025']);
assert.ok(validMeeting(s));
s.profiles['2025'][0]=3;syncSharedProfile(s,'2025');assert.equal(s.profiles['2026'][0],3);
s.consumptionMode='separate';s.profiles['2026'][0]=9;syncSharedProfile(s,'2026');assert.equal(s.profiles['2025'][0],3);
const old=structuredClone(s);delete old.consumptionMode;
assert.equal(normalizeMeeting(old).consumptionMode,'separate');assert.equal(normalizeMeeting(old).profiles['2026'][0],9);
old.profiles['2026']=Array(12).fill(null);delete old.estimates['2026'];
const migrated=normalizeMeeting(old);assert.equal(migrated.consumptionMode,'shared');assert.deepEqual(migrated.profiles['2026'],old.profiles['2025']);assert.equal(old.profiles['2026'][0],null);
delete s.estimates['2026'];s.sources['2026']='own';copyProfile(s,'2026','2025');assert.equal(s.estimates['2025'],undefined);assert.equal(s.sources['2025'],'own');
const blank=initialMeeting();delete blank.consumptionMode;assert.equal(normalizeMeeting(blank).consumptionMode,'shared');
const full={...initialMeeting(),contract:'stable',stablePrice:70,period:'both',profiles:{'2025':Array(12).fill(10000),'2026':Array(12).fill(10000)}};
assert.ok(validMeeting(full));assert.ok(!validMeeting({...full,consumptionMode:'invalid'}));assert.ok(!validMeeting({...full,profiles:{...full.profiles,'2026':[null,...Array(11).fill(10000)]}}));
const r=meetingResult(full);assert.equal(r.count,21);assert.equal(r.selected,147000);
for(let i=0;i<r.rows.length;i++){const m=monthComparison(r,i);if(r.rows[i].available){assert.equal(m.selectedRate,70);assert.equal(m.difference,r.rows[i].variable-7000);assert.equal(m.differenceRate,r.rows[i].variableRate-70);}else assert.equal(m,null);}
assert.deepEqual(priceRanges(r).selected,{low:70,high:70});
const expensive=meetingResult({...full,stablePrice:500});assert.ok(expensive.difference<0);assert.ok(monthComparison(expensive,0).difference<0);
const quarter=meetingResult({...full,contract:'quarter'});assert.equal(quarter.difference,0);assert.equal(monthComparison(quarter,0).difference,0);
const hole={...full,consumptionMode:'separate',profiles:{...full.profiles,'2025':[10000,null,...Array(10).fill(10000)]}};
const gap=meetingResult(hole);assert.equal(monthComparison(gap,1),null);
for(const result of [r,expensive,quarter,gap])for(const unit of ['ore','kr'])for(const diff of [false,true]){const svg=meetingChart(result,'Test',unit,diff);assert.ok(!svg.includes('NaN'));assert.ok(!svg.includes('Infinity'));assert.ok(svg.includes('2025')&&svg.includes('2026'));}
assert.ok(benefitsHtml({...full,contract:'individual'}).includes('finansiella prisavtal'));
assert.ok(benefitsHtml(full).includes('offerten'));
console.log('Shared annual profiles, legacy migration, independent edits, manual-price charts, missing months and signed differences passed.');

````

## Fil: test-meeting-flow-dom.mjs

````text
// DOM integration test, not a rendered-browser/layout test. Requires jsdom.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {JSDOM}=await import(process.env.JSDOM_MODULE||'jsdom');
const html=await readFile(new URL('./public/index.html',import.meta.url),'utf8');
const dom=new JSDOM(html,{url:'https://kundrum.test/'}),w=dom.window,errors=[];
Object.assign(globalThis,{window:w,document:w.document,localStorage:w.localStorage,confirm:()=>true});
Object.defineProperty(globalThis,'navigator',{value:{},configurable:true});
w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.addEventListener('error',e=>errors.push(e.error));
globalThis.fetch=async path=>new Response(await readFile(new URL('./public'+path,import.meta.url)));
await import('./public/meeting-flow.mjs?four-step-test');
const el=id=>document.getElementById(id),click=selector=>document.querySelector(selector).dispatchEvent(new w.MouseEvent('click',{bubbles:true,cancelable:true}));
const input=(id,value,type='input')=>{el(id).value=value;el(id).dispatchEvent(new w.Event(type,{bubbles:true}));};
const active=n=>{for(let i=1;i<=4;i++)assert.equal(el('step'+i).hidden,i!==n);assert(document.querySelector(`[data-step="${n}"][aria-current="step"]`));};
click('[data-step="4"]');active(1);
input('customer','Testkund & Partner');input('business','hotel','change');input('goal','En förutsägbar budget.');input('annual','200000');click('#applyAnnual');click('[data-step="2"]');active(2);
click('[data-step="4"]');active(2);assert(!el('agreementError').hidden);
click('[data-contract="individual"]');assert(el('contractDescription').textContent.includes('finansiellt prisutfall'));assert.equal(el('summaryOpen').target,'_self');assert(!el('openDetails').target);click('[data-period="both"]');input('recommendation','Sprida inköpen över tid.');click('#showComparison');active(3);assert(el('result').innerHTML.indexOf('benefit-sheet')<el('result').innerHTML.indexOf('selected-cost'));assert(el('result').textContent.includes('En förutsägbar budget.'));
assert(!el('result').contains(el('meetingStories')));assert(!el('result').contains(el('notes')));assert(!el('monthDetails').open);assert(!document.querySelector('.chart-extra').open);
click('[data-chart-row="18"]');assert(el('monthDetails').open);assert.equal(el('focusMonth').value,'18');click('[data-chart-unit="kr"]');assert.equal(el('focusMonth').value,'18');
click('#showClosing');active(4);assert(el('closingOverview').textContent.includes('21 av 24'));assert.equal(document.querySelectorAll('#meetingStories .story-row').length,2);
input('checks','Kontrollera profil och villkor.');input('owner','Karin');input('followUp','2026-11-12');input('notes','Budget och genomgång av avgifterna.');input('next','Offert på fredag.');input('seller','Test Säljare');input('storyChoice0','repligen','change');assert(JSON.parse(localStorage.getItem('kundrum-meeting-v1')).storyChoice.ids.includes('repligen'));
click('[data-back="3"]');active(3);click('#showClosing');active(4);assert.equal(el('notes').value,'Budget och genomgång av avgifterna.');assert.equal(el('next').value,'Offert på fredag.');assert.equal(el('checks').value,'Kontrollera profil och villkor.');assert.equal(el('owner').value,'Karin');assert.equal(el('followUp').value,'2026-11-12');assert.equal(el('storyChoice0').value,'repligen');
click('#saveSummary');for(let i=0;el('saveSummary').disabled&&i<1000;i++)await new Promise(r=>setTimeout(r,10));
assert(!el('saveSummary').disabled);assert(!el('pdfActions').hidden,el('summaryStatus').textContent);assert(el('summaryDownload').download.endsWith('.pdf'));
click('[data-back="3"]');click('#showClosing');assert(!el('pdfActions').hidden,'unchanged navigation preserves ready PDF');input('next','Offert på måndag.');assert(el('pdfActions').hidden,'editing invalidates prepared PDF');
click('[data-step="1"]');input('business','transport','change');click('[data-step="4"]');active(4);assert.equal(el('storyChoice0').value,'freja');assert.equal(el('storyChoice1').value,'repligen');
click('[data-step="2"]');click('[data-contract="stable"]');click('[data-step="4"]');active(2);assert(!el('agreementError').hidden);input('manualPrice','500');click('[data-step="4"]');active(4);assert(el('closingOverview').textContent.includes('Beräknad merkostnad'));
click('[data-step="2"]');click('[data-contract="direct"]');input('manualPrice','80');click('#showComparison');active(3);assert(el('result').textContent.includes('Kraftringen Direkt'));assert.equal(JSON.parse(localStorage.getItem('kundrum-meeting-v1')).directPrice,80);click('#newMeeting');active(1);assert.equal(el('goal').value,'');click('[data-step="4"]');active(1);
const ids=[...document.querySelectorAll('[id]')].map(e=>e.id);assert.equal(new Set(ids).size,ids.length);assert.deepEqual(errors,[]);
console.log('PASS: four-stage guards, chart disclosure, notes retention, story override/reset, real PDF generation, ready-file preservation/invalidation, manual pricing and new meeting.');

````

## Fil: test-meeting-pdf.mjs

````text
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
console.log('PDF: all agreements, exact costs, missing months, embedded stories, long notes, unsupported characters and failed assets passed.');

````

## Fil: test-meeting-stories.mjs

````text
import assert from 'node:assert/strict';
import {STORY_CATALOG,STORY_PAIRS,STORY_SOURCE_NOTE,selectedStories,storyPickerHtml,embeddedStoryAppendix} from './public/meeting-stories.mjs';
import {meetingDocument} from './public/meeting-export.mjs';
for(const branch of Object.keys(STORY_PAIRS)){const selected=selectedStories(branch);assert.equal(selected.length,2);assert.equal(new Set(selected.map(s=>s.id)).size,2);assert(selected.every(s=>s.quote&&s.person&&s.source&&s.reason));}
assert.equal(Object.keys(STORY_CATALOG).length,5);
assert.deepEqual(selectedStories('transport').map(s=>s.id),['freja','repligen']);
assert.deepEqual(selectedStories('hotel').map(s=>s.id),['planetstaden','freja']);
const choice={business:'hotel',ids:['ica-bjarred','repligen']};assert.deepEqual(selectedStories('hotel',choice).map(s=>s.id),choice.ids);
for(const ids of [['freja','freja'],['constructor','repligen'],['ohlssons','tensor'],['grand-lundia','tensor'],['freja'],null])assert.deepEqual(selectedStories('hotel',{business:'hotel',ids}).map(s=>s.id),['planetstaden','freja']);
const picker=storyPickerHtml('transport');assert(picker.includes('FREJA'));assert(!picker.includes('Berättelseutkast'));assert.equal((picker.match(/data-story-slot=/g)||[]).length,2);
const appendix=await embeddedStoryAppendix('hotel',choice);assert.equal((appendix.match(/<blockquote>/g)||[]).length,2);assert(appendix.includes(STORY_SOURCE_NOTE));assert(!appendix.includes('/presentations/'));assert(!appendix.includes('<script'));
const html=meetingDocument({meeting:{customer:'<kund>',notes:'<script>alert(1)</script>',next:'Ring & följ upp',seller:'Ludwig',goal:'<img>',recommendation:'<b>Plan</b>',checks:'<script>',owner:'Karin',followUp:'2026-11-12'},branchLabel:'Hotell',periodLabel:'2025',resultMarkup:'<svg><title>Diagram</title></svg>',storyMarkup:appendix});assert(html.includes('&lt;kund&gt;'));assert(html.includes('&lt;script&gt;'));assert(!html.includes('<script>'));assert(html.includes('Karin'));assert(html.includes('2026-11-12'));
console.log('PASS: five source-backed quotes, relevant pairs, old draft selections migrated, safe offline export and escaping.');

````

## Fil: test-meeting-summary.mjs

````text
import assert from 'node:assert/strict';
import {initialMeeting,meetingResult} from './public/meeting-model.mjs';
import {closingOverviewHtml} from './public/meeting-summary.mjs';
import {storyPickerHtml} from './public/meeting-stories.mjs';
import {chartsHtml} from './public/meeting-insights.mjs';
const s={...initialMeeting(),customer:'<img onerror="bad">',contract:'individual',period:'both',business:'hotel',profiles:{'2025':Array(12).fill(10000),'2026':Array(12).fill(10000)}};
const r=meetingResult(s),overview=closingOverviewHtml(s,r,'Hotell');
assert(!overview.includes('<img'));assert(overview.includes('&lt;img'));assert(overview.includes('21 av 24'));assert(overview.includes(new Intl.NumberFormat('sv-SE',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Math.abs(r.difference))));
const higher={...s,contract:'fixed',fixedPrice:500};assert(closingOverviewHtml(higher,meetingResult(higher),'Hotell').includes('Beräknad merkostnad'));
const neutral={...s,contract:'quarter'};assert(closingOverviewHtml(neutral,meetingResult(neutral),'Hotell').includes('Samma beräknade kostnad'));
const compact=storyPickerHtml('hotel',null,{compact:true});assert(compact.includes('First Hotel Planetstaden'));assert(compact.includes('FREJA'));assert.equal((compact.match(/class="story-row"/g)||[]).length,2);assert(compact.includes('Trygg Portfölj'));assert(compact.includes('data-story-slot="1"'));
const chart=chartsHtml(r,s,'ore',0,true,true);assert(chart.includes('id="monthDetails"'));assert(chart.includes('Se besparing eller merkostnad'));assert(chart.includes('monthly-price-title'));assert(chart.includes('monthly-difference-title'));assert(!chart.includes('id="monthDetails" open'));
console.log('PASS: summary exact values, higher/equal costs, escaping, compact story selection and progressive charts.');

````

## Fil: test-meeting.mjs

````text
import assert from 'node:assert/strict';
import {initialMeeting,validMeeting,meetingResult,CONTRACTS} from './public/meeting-model.mjs';
import {DATA} from './public/model.mjs';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const s={...initialMeeting(),consumptionMode:'separate',customer:'Test',contract:'individual',period:'both',profiles:{'2025':DATA.periods['2025'].volume,'2026':DATA.periods['2026'].volume}};
assert.ok(validMeeting(s));
const r=meetingResult(s);
assert.equal(r.count,21);assert.equal(r.totalMonths,24);assert.equal(r.rows.length,24);
near(r.volume,312000);near(r.selected,216265.38);near(r.variable,264565.70);near(r.difference,48300.32);near(r.selectedRate,216265.38/312000*100);
for(const contract of ['offensive','safe'])near(meetingResult({...s,contract}).selected,r.selected);
near(meetingResult({...s,contract:'quarter'}).difference,0);
assert.throws(()=>meetingResult({...s,contract:'stable'}));
assert.throws(()=>meetingResult({...s,contract:'fixed'}));
near(meetingResult({...s,contract:'stable',stablePrice:70}).selected,218400);
near(meetingResult({...s,contract:'fixed',fixedPrice:90}).selected,280800);
near(meetingResult({...s,contract:'stable',stablePrice:0}).selected,0);
const zero={...s,profiles:{'2025':Array(12).fill(0),'2026':Array(12).fill(0)}};assert.equal(meetingResult(zero).selectedRate,null);
const full26={...s,period:'2026',profiles:{...s.profiles,'2026':Array(12).fill(10000)}};
assert.equal(meetingResult(full26).volume,90000);assert.equal(meetingResult({...full26,contract:'stable',stablePrice:70}).selected,63000);
assert.equal(meetingResult({...s,period:'2025'}).count,12);assert.equal(meetingResult({...s,period:'2026'}).count,9);
assert.equal(meetingResult({...s,profiles:{...s.profiles,'2025':[null,...s.profiles['2025'].slice(1)]}}).count,20);
assert.equal(Object.keys(CONTRACTS).length,7);
for(const price of [-1,501,NaN,Infinity])assert.ok(!validMeeting({...s,stablePrice:price}));
console.log('Meeting calculations: 7 contracts, both years, weighted totals, missing months, manual prices and invalid input passed.');

assert.throws(()=>meetingResult({...s,contract:'direct'}));
near(meetingResult({...s,contract:'direct',directPrice:70}).selected,218400);
for(const price of [-1,501,NaN,Infinity])assert.ok(!validMeeting({...s,directPrice:price}));
for(const followUp of ['2026-02-30','not-a-date'])assert.ok(!validMeeting({...s,followUp}));
assert.ok(validMeeting({...s,followUp:'2026-11-12',goal:'Budget',owner:'Karin'}));
const legacy=structuredClone(s);for(const key of ['goal','recommendation','checks','owner','followUp','directPrice'])delete legacy[key];assert.ok(validMeeting(legacy));

````

## Fil: test-model.mjs

````text
import assert from 'node:assert/strict';
import {calculate,parseProfile,defaults,MONTHS,DATA,validateState,migrateLegacy,PROFILE_SHAPES,annualProfile,profileSourceLabel,hasMonthlyPrices} from './public/model.mjs';
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} != ${expected}`);
const s=defaults();
// Independently calculated from the supplied worksheet using decimal arithmetic.
for(const [period,volume,portfolio,variable,fixed,at100,diff] of [
 ['2025',186000,124459.56,135489.8,188604,121888,11030.24],
 ['2026',126000,91805.82,129075.9,127764,82614.3,37270.08]
]){
 const state={...s,period},r=calculate(state);
 for(const [actual,expected] of [[r.volume,volume],[r.portfolio,portfolio],[r.variable,variable],[r.fixed,fixed],[r.difference,diff],[calculate({...state,hedge:100}).portfolio,at100]])near(actual,expected);
 near(calculate({...state,hedge:0}).difference,volume*.004);
 near(calculate({...state,consumption:150}).portfolio,portfolio*1.5);
 near(r.portfolioRate,portfolio/volume*100);
}
// One month's actual units: Jan 2025 at 80% -> 87.724 öre, 8,772.40 kr.
near(calculate(s).rows[0].portfolioRate,87.724);near(calculate(s).rows[0].portfolio,8772.4);
const partial=calculate({...s,period:'2026'});assert.equal(partial.count,9);
assert.ok(partial.rows.slice(9).every(row=>row.available===false&&!Object.hasOwn(row,'portfolio')));
// A full annual profile does not create missing 2026 prices or zero-cost Q4.
const annual={...s,period:'2026',profiles:{...s.profiles,'2026':Array(12).fill(10000)}};
assert.equal(calculate(annual).volume,90000);assert.equal(calculate(annual).count,9);
const noJan={...s,profiles:{...s.profiles,'2025':[null,...s.profiles['2025'].slice(1)]}};
near(calculate(noJan).portfolio,calculate(s).portfolio-8772.4);assert.equal(calculate(noJan).count,11);
const zero={...s,profiles:{...s.profiles,'2025':Array(12).fill(0)}};assert.ok(validateState(zero));assert.equal(calculate(zero).portfolioRate,null);
assert.deepEqual(parseProfile('Månad;kWh\n'+MONTHS.map((m,i)=>m+';'+s.profiles['2025'][i]).reverse().join('\n')),s.profiles['2025']);
assert.deepEqual(parseProfile('Månad;kWh\nJan;1 000,5\nFeb;0\nMar;'),[1000.5,0,...Array(10).fill(null)]);
assert.throws(()=>parseProfile('Jan;100\nJan;200'));assert.throws(()=>parseProfile('Jan;-1'));assert.throws(()=>parseProfile('Jan;100\n200'));assert.throws(()=>parseProfile('Jan;abc'));
assert.ok(validateState(s));assert.ok(!validateState({...s,hedge:101}));assert.ok(!validateState({...s,portfolioFee:-1}));assert.ok(!validateState({...s,basis:'wrong'}));
const old={customer:'Existing customer',profile:Array(12).fill(2000),scenario:'base',consumption:120,hedge:65,fixed:70,fee:4,notes:'Keep notes',next:'Follow up',date:'2026-11-02',choice:'secured'};
const migrated=migrateLegacy(old);assert.ok(validateState(migrated));assert.equal(migrated.notes,old.notes);assert.equal(migrated.hedge,65);assert.equal(migrated.choice,'portfolio');assert.equal(migrated.fixed,101.4);assert.equal(migrated.portfolioFee,2);assert.deepEqual(migrated.profiles['2025'],old.profile);assert.equal(migrated.sources['2026'],'own');
assert.ok(validateState(JSON.parse(JSON.stringify(s))));
assert.equal(DATA.periods['2025'].hedged.length,12);assert.equal(DATA.periods['2026'].hedged.filter(x=>x!==null).length,9);
// Savings use the same consumed volume as both prices; do not average monthly savings.
near(calculate(s).differenceRate,5.930236559139785);
near(calculate({...s,period:'2026'}).differenceRate,29.57942857142857);
near(calculate(s).rows[0].differenceRate,-5.504);
near(calculate(s).rows[0].difference,-550.4);
near(calculate({...s,consumption:150}).differenceRate,calculate(s).differenceRate);
near(calculate({...s,consumption:150}).difference,calculate(s).difference*1.5);
near(calculate(s).rows.reduce((sum,row)=>sum+row.differenceRate*row.volume,0)/calculate(s).volume,calculate(s).differenceRate);
assert.equal(calculate(zero).differenceRate,null);
const equal=calculate({...s,hedge:0,portfolioFee:s.variableFee});near(equal.differenceRate,0);near(equal.difference,0);
const higher=calculate({...s,portfolioFee:20});assert.ok(higher.differenceRate<0&&higher.difference<0);
assert.ok(partial.rows.slice(9).every(row=>!Object.hasOwn(row,'differenceRate')));
const {priceChart,differenceChart}=await import('./public/charts.mjs');
for(const result of [calculate(s),partial,calculate(zero),higher,equal])for(const unit of ['ore','kr']){
 for(const chart of [priceChart(result,unit),differenceChart(result,unit)])assert.ok(!/NaN|Infinity/.test(chart));
}
console.log('PASS: verified worksheet totals, 0/80/100% hedging, independent monthly check, missing months, weighted prices, import, validation and legacy migration.');
console.log(JSON.stringify({2025:calculate(s),2026:calculate({...s,period:'2026'})},(k,v)=>k==='rows'?undefined:v));
// Annual estimates preserve the annual total, including fractional kWh.
const winterMonths=[0,1,2,9,10,11];
for(const shape of Object.keys(PROFILE_SHAPES))for(const annual of [.01,1,100.01,100000,186000.37,100000000]){
 const profile=annualProfile(annual,shape);
 assert.equal(profile.length,12);assert.ok(profile.every(v=>Number.isFinite(v)&&v>=0));
 near(profile.reduce((a,v)=>a+v,0),annual);
}
const winterProfile=annualProfile(100000,'winter'),summerProfile=annualProfile(100000,'summer'),evenProfile=annualProfile(120000,'even');
assert.deepEqual(winterProfile,[12000,12000,11000,8000,6000,4000,4000,5000,8000,9000,10000,11000]);
near(winterMonths.reduce((a,i)=>a+winterProfile[i],0),65000);
near(winterMonths.reduce((a,i)=>a+summerProfile[i],0),35000);
assert.ok(evenProfile.every(v=>v===10000));
for(const bad of [-1,0,.001,NaN,Infinity,100000001])assert.throws(()=>annualProfile(bad,'winter'));
assert.throws(()=>annualProfile(100000,'bad'));assert.throws(()=>annualProfile(100000,'__proto__'));
const estimate={...defaults(),period:'2026'};estimate.profiles['2026']=winterProfile;estimate.sources['2026']='estimated';estimate.estimates['2026']={annualKwh:100000,shape:'winter',adjusted:false};
assert.ok(validateState(estimate));assert.ok(validateState(JSON.parse(JSON.stringify(estimate))));
assert.match(profileSourceLabel(estimate),/Uppskattad profil: vintertung/);
const estimatedResult=calculate(estimate);assert.equal(estimatedResult.count,9);near(estimatedResult.volume,70000);
assert.ok(estimatedResult.rows.slice(9).every(r=>!r.available&&r.volume>0));
assert.deepEqual(estimate.profiles['2025'],defaults().profiles['2025']);
const forged=structuredClone(estimate);forged.profiles['2026'][0]+=100;assert.equal(validateState(forged),false);
forged.estimates['2026'].adjusted=true;assert.ok(validateState(forged));assert.match(profileSourceLabel(forged),/justerats manuellt/);
const missingMeta=structuredClone(estimate);delete missingMeta.estimates;assert.equal(validateState(missingMeta),false);
const legacyV2=defaults();delete legacyV2.estimates;assert.ok(validateState(legacyV2));
console.log('PASS: annual shape shares, exact annual totals, invalid input, estimated provenance, JSON round-trip and partial-year comparison.');
// Availability follows the data as prices are added; zero is a valid price.
const updatedPrices=structuredClone(DATA.periods['2026']);
assert.equal(MONTHS.filter((_,i)=>hasMonthlyPrices(updatedPrices,i)).length,9);
for(const key of ['hedged','spot','running','weighting'])updatedPrices[key][9]=0;
assert.equal(MONTHS.filter((_,i)=>hasMonthlyPrices(updatedPrices,i)).length,10);
updatedPrices.weighting[9]=null;assert.equal(hasMonthlyPrices(updatedPrices,9),false);
for(const key of ['hedged','spot','running','weighting'])for(let i=9;i<12;i++)updatedPrices[key][i]=0;
assert.equal(MONTHS.filter((_,i)=>hasMonthlyPrices(updatedPrices,i)).length,12);
// Visual comparisons must preserve negative/zero outcomes and missing-data gaps.
const {monthFocus,monthButtons}=await import('./public/charts.mjs');
assert.match(monthFocus(calculate(s),0),/Merkostnad med portfölj/);
assert.match(monthFocus(calculate(s),0),/550,40/);
assert.match(monthFocus(calculate(s),0),/5,50 öre\/kWh högre/);
assert.match(monthFocus(equal,0),/Samma kostnad/);
assert.match(monthFocus(calculate(zero),0),/Prisskillnad · 0 kWh/);
assert.equal((monthButtons(partial).match(/disabled/g)||[]).length,3);
const crossing={periodLabel:'2025',rows:[{index:0,available:true,variableRate:80,portfolioRate:100,fixedRate:90},{index:1,available:true,variableRate:100,portfolioRate:80,fixedRate:90}]};
assert.match(priceChart(crossing),/data-gap="extra"/);assert.match(priceChart(crossing),/data-gap="saving"/);
crossing.rows[0].available=false;assert.doesNotMatch(priceChart(crossing),/data-gap=/);
const noMonths={...partial,count:0,rows:partial.rows.map(row=>({...row,available:false}))};
assert.match(monthFocus(noMonths,null),/Lägg in förbrukning/);
assert.ok(!/NaN|Infinity/.test(priceChart(noMonths)+monthButtons(noMonths)));
console.log('PASS: chart crossings, missing months, negative/zero savings and empty comparison.');

````

## Fil: test-purchases.mjs

````text
import assert from 'node:assert/strict';
import {buildPurchaseSchedule,purchaseSnapshot,dayClosure,holidayName} from './public/purchases.mjs';
const utc=s=>new Date(s+'T00:00:00.000Z');
const s=buildPurchaseSchedule(),byDate=iso=>s.days.find(d=>d.iso===iso);
assert.equal(s.start,'2026-01-01');assert.equal(s.finish,'2027-09-01');assert.equal(s.delivery,'2028-01-01');
assert.equal(s.days.length,731);assert.equal(s.marks[3].index,s.days.findIndex(d=>d.iso==='2027-09-01'));
// Independently enumerated holiday and closure dates for this example, not from the calendar implementation.
const closed=new Set(['2026-01-01','2026-01-06','2026-04-03','2026-04-06','2026-05-01','2026-05-14','2026-06-19','2026-12-24','2026-12-25','2026-12-31','2027-01-01','2027-01-06','2027-03-26','2027-03-29','2027-05-06','2027-06-25']);
let independentCount=0;
for(let t=Date.UTC(2026,0,1);t<Date.UTC(2027,8,1);t+=86400000){const d=new Date(t);if(d.getUTCDay()!==0&&d.getUTCDay()!==6&&!closed.has(d.toISOString().slice(0,10)))independentCount++;}
assert.equal(s.totalPurchases,independentCount);
for(const d of closed)assert.equal(byDate(d).buy,false,d);
for(const d of s.days){
 assert.ok(Math.abs(d.secured+d.market-100)<1e-10);
 assert.equal(d.secured,80*d.purchases/independentCount);
 if(d.buy){assert.ok(d.iso<'2027-09-01');assert.ok(![0,6].includes(d.date.getUTCDay()));assert.equal(d.added,80/independentCount);}
 else assert.equal(d.added,0);
 if(d.index>0&&!d.buy)assert.equal(d.secured,s.days[d.index-1].secured);
 if(d.iso>='2027-09-01'){assert.equal(d.secured,80);assert.equal(d.market,20);assert.equal(d.buy,false);}
}
assert.equal(byDate('2026-01-02').purchases,1);assert.equal(byDate('2026-01-03').purchases,1);assert.equal(byDate('2026-01-04').purchases,1);assert.equal(byDate('2026-01-05').purchases,2);assert.equal(byDate('2026-01-06').purchases,2);
assert.equal(byDate('2027-08-31').secured,80);assert.equal(byDate('2027-09-01').phase,'complete');assert.equal(byDate('2028-01-01').phase,'delivery');
assert.equal(holidayName(utc('2026-04-05')),'Påskdagen');assert.equal(holidayName(utc('2027-03-28')),'Påskdagen');assert.equal(holidayName(utc('2026-06-20')),'Midsommardagen');assert.equal(holidayName(utc('2027-11-06')),'Alla helgons dag');
assert.equal(dayClosure(utc('2026-05-15')),null); // no assumed bridge-day closure
assert.equal(holidayName(utc('2028-04-16')),'Påskdagen');
const leap=buildPurchaseSchedule(2030);assert.equal(leap.days.length,732);assert.ok(leap.days.some(d=>d.iso==='2028-02-29'));
for(const n of [-1,s.days.length,.5,NaN,'2',null])assert.throws(()=>purchaseSnapshot(n,s),RangeError);
for(const n of [2006,2101,2028.5,null])assert.throws(()=>buildPurchaseSchedule(n),RangeError);
console.log(`PASS: ${independentCount} independently counted daily purchases, public holidays/eves/weekends, leap year, stable 4-month tail, exact 80/20 endpoint and invalid inputs.`);

````
