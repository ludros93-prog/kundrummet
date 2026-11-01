// Prepare first; file actions must run from a fresh, explicit user gesture.
// prepare() may also run without a click (e.g. when the meeting is restored after leaving the page):
// creating the file needs no user activation, only opening/sharing it does.
export const isIOS=(platform=globalThis)=>{const n=platform.navigator||{};return /iPhone|iPad|iPod/.test(n.userAgent||'')||(n.platform==='MacIntel'&&n.maxTouchPoints>1);};
// On a computer the PDF opens in a new tab so the meeting stays open. Phones, tablets and home-screen apps keep the same
// window: there a blob address may not be reachable from a new window, and v28 moved away from new tabs for that reason.
export const opensNewTab=(platform=globalThis)=>{try{const n=platform.navigator||{},mm=q=>platform.matchMedia?.(q)?.matches===true;return mm('(pointer: fine)')&&mm('(hover: hover)')&&!mm('(display-mode: standalone)')&&n.standalone!==true&&!isIOS(platform)&&!/Android/.test(n.userAgent||'');}catch{return false;}};
export function bindPdfDelivery({button,status,actions,download,open,share,getMeeting,generate,platform=globalThis,onReady=()=>{},onInvalidate=()=>{}}){
 let readyFile=null,url=null,generation=0;
 const say=(message,error=false)=>{status.hidden=false;status.classList.toggle('error',error);status.textContent=message;};
 function release(){
  if(url){try{platform.URL.revokeObjectURL(url);}catch{}url=null;}
  for(const link of [download,open]){if(link.removeAttribute)link.removeAttribute('href');else link.href='';}
 }
 function invalidate(){generation++;readyFile=null;actions.hidden=true;status.hidden=true;release();onInvalidate();}
 async function prepare(){
  if(button.disabled)return;
  const ticket=++generation,snapshot=structuredClone(getMeeting());
  readyFile=null;actions.hidden=true;button.disabled=true;button.textContent='Skapar PDF …';
  say('Sätter samman ert mötesunderlag. Vänta tills filen är klar.');
  try{
   const result=await generate(snapshot);
   if(ticket!==generation||JSON.stringify(snapshot)!==JSON.stringify(getMeeting())){say('Mötesuppgifterna ändrades. Tryck på Skapa PDF för ett aktuellt underlag.');return;}
   const file=new platform.File([result.bytes],result.filename,{type:'application/pdf'});
   const nextUrl=platform.URL.createObjectURL(file);
   if(url)platform.URL.revokeObjectURL(url);
   url=nextUrl;readyFile=file;
   download.href=url;download.download=result.filename;open.href=url;
   const newTab=opensNewTab(platform);open.target=newTab?'_blank':'_self';if(newTab)open.rel='noopener';else if(open.removeAttribute)open.removeAttribute('rel');open.textContent=newTab?'Öppna PDF ↗':'Öppna PDF';
   let canShare=false;
   try{canShare=typeof platform.navigator.share==='function'&&platform.navigator.canShare?.({files:[file]})===true;}catch{}
   share.hidden=!canShare;actions.hidden=false;
   const how=canShare?(isIOS(platform)?' Välj Dela/spara och sedan Spara i Filer, eller Hämta PDF.':' Välj Dela/spara, Hämta PDF eller Öppna PDF.'):(newTab?' Välj Hämta PDF, eller Öppna PDF för att se den i en ny flik.':' Välj Hämta PDF eller Öppna PDF nedan.');
   say(`PDF klar: ${result.pageCount} sidor.${how}${result.replacedCharacters.length?' Vissa specialtecken har ersatts med frågetecken; kontrollera texten före delning.':''}`);
   onReady(snapshot);
   (canShare?share:download).focus({preventScroll:true});
   actions.scrollIntoView({behavior:'smooth',block:'nearest'});
  }catch(e){say('PDF:en kunde inte skapas. '+e.message+' Försök igen.',true);}
  finally{button.disabled=false;button.textContent='Skapa PDF';}
 }
 button.addEventListener('click',()=>prepare());
 // No generation/fetch/await before calling share: preserve the user's activation.
 share.addEventListener('click',async()=>{
  if(!readyFile||share.disabled)return;
  share.disabled=true;
  try{await platform.navigator.share({files:[readyFile],title:readyFile.name});say('Delningsdialogen har stängts. PDF:en finns kvar här om du vill spara eller dela igen.');}
  catch(e){
   if(e.name==='AbortError')say('Delningen avbröts. PDF:en finns kvar; välj Hämta PDF eller Dela/spara igen.');
   else say(`Mobilens delning kunde inte öppnas (${e.name||'okänt fel'}). Välj Öppna PDF och spara från PDF-visaren, eller öppna kundrummet i Safari.`,true);
  }finally{share.disabled=false;}
 });
 download.addEventListener('click',()=>say('Nedladdningen har begärts. Om ingen fil visas: välj Öppna PDF, eller Dela/spara och Spara i Filer på iPhone.'));
 return {invalidate,prepare};
}
