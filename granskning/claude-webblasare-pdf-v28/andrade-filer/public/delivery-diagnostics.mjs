// Opt-in troubleshooting for the PDF delivery on a real phone: open Kundrummet with ?diagnos
// and take a screenshot of the panel in step 4. Shows facts only, never meeting data.
import {isIOS} from './meeting-delivery.mjs';
export function deliveryFacts(platform=globalThis){
 const n=platform.navigator||{},ua=n.userAgent||'';
 const media=q=>{try{return platform.matchMedia(q).matches;}catch{return false;}};
 let pdfShare='saknas';
 try{if(typeof n.canShare==='function')pdfShare=n.canShare({files:[new platform.File([new Uint8Array([37,80,68,70])],'test.pdf',{type:'application/pdf'})]})?'ja':'nej';}catch(e){pdfShare='fel: '+e.name;}
 const ios=isIOS(platform);
 // iOS apps that show web pages in their own WebView usually leave out "Safari/" in the user agent.
 const embedded=ios?!/Safari\//.test(ua):/; wv\)|FBAN|FBAV|Instagram|LinkedInApp/.test(ua);
 return [
  ['Fönster',media('(display-mode: standalone)')||n.standalone===true?'Hemskärmsapp':'Webbläsarflik'],
  ['Enhet',ios?'iPhone/iPad':/Android/.test(ua)?'Android':'Dator/övrigt'],
  ['Inbyggd webbläsare i annan app',embedded?'Troligen':'Nej eller okänt'],
  ['Dela-funktion',typeof n.share==='function'?'Finns':'Saknas'],
  ['Kan dela PDF-fil',pdfShare],
  ['Webbläsare',ua]
 ];
}
export function diagnosticsHtml(facts,events=[]){
 const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 return `<details class="download-help" open><summary>Felsökning för PDF på mobilen</summary><dl>${facts.map(([k,v])=>`<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>${events.length?`<p class="muted">${events.map(esc).join('<br>')}</p>`:''}<p class="muted">Ta en skärmbild av rutan och skicka den med en beskrivning av vad som hände.</p></details>`;
}
