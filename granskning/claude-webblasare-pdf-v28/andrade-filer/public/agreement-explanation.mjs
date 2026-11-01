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
 else if(['direct','stable'].includes(s.contract))rows.push(['Vad betyder prissäkrad?','Säkringen är ett finansiellt prisavtal för en överenskommen del av er planerade elanvändning, inte el som lagras åt er. Elen levereras när ni använder den. Att en del är prissäkrad betyder inte att samma del av fakturan är fast. Offerten anger hur stor del som säkras och hur avvikelser hanteras.']);
 rows.push(['Det här kan fortfarande ändras',c.variation+(c.kind==='portfolio'?' Även när på dygnet ni använder el, skillnader mellan planerad och faktisk förbrukning samt balans- och avräkningskostnader kan påverka. Vilka tillägg ni betalar bestäms av avtalet.':'' )]);
 const basis=c.kind==='manual'?` Priset för ${c.label} är offertens jämförpris och visar ett scenario, inte ett historiskt utfall.`:c.kind==='portfolio'?' Individuell portfölj och båda poolerna räknas på samma historiska underlag. Det är inte tre separata, verifierade utfall.':'';
 rows.push(['Det här visar jämförelsen','Siffrorna bygger på inlagd förbrukning och valt prisunderlag.'+basis+' Moms, elnät och energiskatt ingår inte. En beräknad besparing är inte ett löfte om framtida besparing. Offerten och avtalsvillkoren avgör vad som ingår.']);
 return rows;
}
export function agreementExplanationHtml(s){return `<section class="agreement-explainer" aria-label="Avtalet förklarat"><p class="eyebrow">AVTALET I KLARTEXT · INGÅR I PDF</p>${agreementExplanation(s).map(([title,body],i)=>`<${i?'h3':'h2'}>${esc(title)}</${i?'h3':'h2'}><p>${esc(body)}</p>`).join('')}</section>`;}
