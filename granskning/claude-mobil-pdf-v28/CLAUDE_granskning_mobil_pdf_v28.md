# Claude-granskning: PDF i mobilen och avtalsförklaringen

Kundrummet version 28, snapshot 052b2d1 (kundrummet-kod-v28.zip). Granskat 1 november 2026.
Till ChatGPT. Patchen ligger i `kundrummet-v28-claude-mobil-pdf.patch`. Samma ändringar finns som hela filer i `andrade-filer/`.

## Kort sammanfattning

- Avtalsförklaringen följer med i PDF:en för alla sju avtal. Det är verifierat i genererade PDF:er.
- Tre fel i mobilflödet är verifierade i kod och webbläsartest. Det största är att Kundrummet glömmer steget. När sidan laddas om hamnar säljaren på steg 1 och PDF:en är borta.
- Fördjupningen saknar synlig väg tillbaka till mötet på mobil.
- iOS-specifika orsaker kan inte verifieras härifrån. De står som hypoteser med en kort testlista för en riktig iPhone.
- Patchen rör 9 filer, lägger till 1 modul och 1 webbläsartest och utökar 2 befintliga tester.

## 1. Verifierade fynd

### V1. Steget glöms. Efter omladdning visas steg 1 och PDF:en är borta (hög)

- Fil och funktion: `public/meeting-flow.mjs`. `step=1` sätts vid start. `showStep()` sparar inte steget och inget återställer det. Mötet sparas i `localStorage`, men inte var säljaren var.
- Belägg: Playwright med Chromium och iPhone 13-vy. Säljaren går till steg 4 och skapar PDF. Efter `reload()` visas `step1` och `#pdfActions` är dold.
- Följd: Alla vägar som lämnar sidan slutar på steg 1 när webbläsaren inte återställer sidan från sitt minne. Det gäller Öppna PDF följt av Tillbaka, fördjupningen följt av Mötesflöde, byte av app på iPhone och omstart av hemskärmsappen. För säljaren ser det ut som att PDF:en "försvann".
- Fix i patchen: steget sparas med tidsstämpel i 12 timmar och återställs vid start. Om PDF:en gällde exakt samma möte skapas den igen automatiskt. Att skapa filen kräver inget klick. Att öppna och dela kräver fortfarande ett klick.

### V2. Fördjupningen saknar väg tillbaka på mobil (hög)

- Fil: `public/details.html` och `public/mobile-app.css`. Länken "Mötesflöde" (`href="/"`) ligger i `.header`. Den döljs helt vid 700 px och mindre (`.header,...{display:none!important}`). Mobilmenyn `.app-nav` har bara ankare inom sidan: `#home`, `#explore`, `#profile` och `#meeting`.
- Belägg: Playwright i 390 px bredd hittade 0 synliga länkar till `/` på details.html.
- Följd: I hemskärmsappen finns ingen bakåtknapp, så sidan blir en återvändsgränd. I Safari fungerar Bakåt, men utan V1-fixen landar man på steg 1.
- Fix: länken "← Till kundmötet" i `.mobile-brand`. Den leder till `/`, och med V1-fixen öppnas steg 3 igen.

### V3. Avtalsförklaringen: innehållet följer med men har luckor (medel)

Det som är verifierat:
- Sidan "Avtalet i klartext" (sida 3) har alla rader för alla sju avtal. Portföljerna testades vid 0, 80 och 100 procent säkring.
- Texten lästes ut ur de färdiga PDF:erna med pdfjs, inte bara ur `audit`.
- Texten slutar vid 356 till 422 pt. Sidfoten börjar vid 505 pt, så inget överlappar.
- Rubrikerna ryms i sin kolumn.

Det som saknas enligt CLAUDE.md, prioritet 2:
- Kraftringen Direkt och Kraftringen Stabil saknar raden om att prissäkring är finansiell och inte gör samma andel av fakturan fast. Bara portföljerna har den raden (`c.kind==='portfolio'`). Båda produkterna är prissäkring.
- Raden "Det här visar jämförelsen" säger inte att ett offertpris är ett scenario. Den säger inte heller att individuell portfölj och båda poolerna bygger på samma underlag. Båda sakerna står på andra PDF-sidor, men inte i förklaringen som också visas i steg 2.
- "80 % … och 20 % rörlig" kan brytas så att "%" hamnar först på nästa rad. Det syntes i renderingen av sida 3. Orsaken är att `clean()` gör hårda mellanslag till vanliga och att `lines()` delar på alla mellanslag.
- Det finns inget skydd mot att texten växer förbi sidfoten. `text()` stoppar först vid y < 18. Befintligt test tillåter `top+height<=530`, men sidfotslinjen ligger vid 505.

Fixar i patchen:
- Ny rad för Direkt och Stabil.
- Scenario- och underlagsmening i sista raden.
- "%" hålls ihop med talet.
- Sidbrytning till "Avtalet i klartext - fortsättning" om texten blir för lång.
- Rubrikbredd 220 pt.

Ny text som ska godkännas före publicering:
> Säkringen är ett finansiellt prisavtal för en överenskommen del av er planerade elanvändning, inte el som lagras åt er. Elen levereras när ni använder den. Att en del är prissäkrad betyder inte att samma del av fakturan är fast. Offerten anger hur stor del som säkras och hur avvikelser hanteras.

Texten innehåller inga produktvillkor, andelar eller avgifter.

### V4. Öppna PDF ger nedladdning med slumpnamn i Chromium (låg, kräver Android-test)

- Belägg: I huvudlös Chromium gav Öppna PDF en nedladdning med namnet `fa1efa61-…pdf` i stället för `Kundunderlag-…pdf`. Länken navigerar till en blob-adress utan `download`.
- Hämta PDF har rätt namn.
- Om Android Chrome visar eller laddar ned filen är inte testat. Detta är inte åtgärdat i patchen.

### V5. Mindre fel (låg)

- `invalidate()` släpper inte den gamla blob-adressen, så minnet frigörs inte förrän sidan stängs. Det är åtgärdat.
- Statusen säger "På iPhone: välj Dela/spara …" på alla enheter som kan dela, även Android. Det är åtgärdat: texten styrs nu av plattform.
- Felet vid delning visar inte felnamnet. Det gör felsökning svår. Felnamnet visas nu, till exempel `NotAllowedError`.

## 2. Hypoteser som kräver riktig telefon

| # | Hypotes | Varför | Hur det testas |
|---|---|---|---|
| H1 | Hemskärmsappen på iPhone (`display: standalone`) saknar bakåtknapp. Öppna PDF i samma fönster kan låsa säljaren i PDF-visaren. | Manifestet har `standalone` och installation uppmuntras. v28 öppnar PDF i samma fönster. | Hemskärmsapp, steg 4, Skapa PDF, Öppna PDF. Gå det att komma tillbaka? |
| H2 | En inbyggd webbläsare i en annan app ger "inget händer". Det gäller länkar som öppnas från ChatGPT-appen, Teams, Outlook eller Messenger. | Där saknas ofta `navigator.share`, `download` ignoreras och blob-sidor kan bli tomma. | Öppna länken från appen där Ludwig brukar öppna den, med `?diagnos`. |
| H3 | Safari laddar alltid om sidan vid Tillbaka. Då slår V1 till varje gång. | Inloggade sajter skickar ofta `Cache-Control: no-store`. Det kan stänga av Safaris sidminne. | Kontrollera svarshuvuden för `/` på den publicerade sajten. Diagnosrutan visar "efter ny laddning" eller "från webbläsarens minne". |
| H4 | Hämta PDF fungerar dåligt i hemskärmsappen på iOS. | `a[download]` har varit opålitligt i standalone-läge. | Som H1, men med Hämta PDF. |
| H5 | Nytt kundmöte gör ingenting i vissa inbyggda webbläsare. | `confirm()` kan returnera false direkt i appar som inte stödjer dialogen. | Tryck Nytt kundmöte i inbyggd webbläsare. |

Inga kodfel hittades i details/summary eller dialogerna i PDF-flödet.

Om H1 bekräftas: dölj Öppna PDF i hemskärmsappen på iOS när Dela/spara finns. Lägg detta i `bindPdfDelivery`, efter `share.hidden=!canShare;`:
```js
const standalone=platform.matchMedia?.('(display-mode: standalone)').matches||platform.navigator.standalone===true;
open.hidden=standalone&&canShare&&isIOS(platform);
```
Detta finns inte i patchen eftersom beteendet inte är verifierat.

## 3. Patchen fil för fil

Patchen utgår från snapshot 052b2d1. Kontrollera med `git apply --check kundrummet-v28-claude-mobil-pdf.patch` och kör sedan `git apply`. Patchen applicerar rent på en orörd kopia av zip-exporten.

| Fil | Ändring |
|---|---|
| `public/meeting-flow.mjs` | `rememberStep()` och `rememberedStep()` med nyckeln `kundrum-meeting-step` och 12 timmars giltighet. Återställning av steget vid start. `onReady` och `onInvalidate` sparar och rensar `kundrum-meeting-pdf`, som är samma JSON som mötet. PDF:en skapas igen om mötet är oförändrat. Felsökningsrutan visas med `?diagnos`. |
| `public/meeting-delivery.mjs` | Klickhanteraren är flyttad till `prepare()`, som returneras. `invalidate()` släpper blob-adressen och tar bort `href`. Nya callbacks `onReady` och `onInvalidate`. Statustext per plattform. Felnamn vid delningsfel. Fokus hamnar på Dela/spara om den finns. Exporterar `isIOS`. |
| `public/delivery-diagnostics.mjs` (ny) | `deliveryFacts()` visar fönsterläge, enhet, trolig inbyggd webbläsare (iOS: "Safari/" saknas i user agent), Dela-funktion, om PDF kan delas och user agent. `diagnosticsHtml()` bygger rutan. Ingen mötesdata visas. |
| `public/meeting-pdf.mjs` | `explanation` är `let`. Sidbrytning före en rad som skulle passera 488 pt. Rubrik med `w:220,maxHeight:46`. `lines()` slår ihop "%" med föregående ord. |
| `public/agreement-explanation.mjs` | Raden "Vad betyder prissäkrad?" för `direct` och `stable`. Mening om scenario för `manual` och om samma underlag för `portfolio` i "Det här visar jämförelsen". |
| `public/details.html` | `<span>Kundrummet</span>` i `.mobile-brand` är ersatt av `<a class="mobile-return" href="/">← Till kundmötet</a>`. |
| `public/mobile-app.css` | Stil för `.mobile-return` med 44 px tryckyta och synlig fokus. |
| `public/meeting-flow.css` | `#summaryShare{order:-1}`, så Dela/spara kommer först. Full bredd på mobil. Stil för felsökningsrutan. |
| `public/index.html` | Hjälptexten säger nu att Kundrummet öppnar samma steg igen. Den säger inte längre "Använd Tillbaka", som saknas i hemskärmsappen. |
| `test-meeting-delivery.mjs` | Nytt block: `prepare()` utan klick, blob-adressen släpps, callbacks, iOS- och Android-text, felnamn. |
| `test-meeting-pdf.mjs` | Nytt block: sida 3 slutar före 496 pt för alla avtal. Kontrollerar de nya förklaringsraderna. `corePages` är fortfarande 8. |
| `test-mobile-browser.mjs` (ny) | Playwright med Chromium och iPhone-vy mot en lokal server eller förhandsvisning (`BASE=...`). Testar omladdning, Öppna PDF och Tillbaka, inaktuell PDF, fördjupningen och tillbaka, felsökningsrutan och nytt möte. |

Integritet: `kundrum-meeting-pdf` innehåller samma mötesdata som redan ligger i `kundrum-meeting-v1`. Ingen ny data sparas och inget skickas.

## 4. Tester jag faktiskt körde

Miljö: Node 22.23 och Chromium via Playwright 1.63. `fontkit`, varumärkesfiler och `vendor/` saknas i exporten och gick inte att hämta härifrån. Jag körde därför med `pdf-lib` 1.17.1 från npm.

I testkopian, och bara där, byttes `embedFont(regularBytes/boldBytes)` mot Helvetica. Liberation Sans har samma teckenbredder som Helvetica, så radbrytningarna blir desamma. Logotypen var en platshållare. Kör om allt med de riktiga filerna.

| Test | v28 | Med patch |
|---|---|---|
| test-meeting-pdf.mjs, inklusive nytt block | Godkänt | Godkänt |
| test-meeting-delivery.mjs, inklusive nytt block | Godkänt (gamla delen) | Godkänt |
| test-meeting-summary, test-meeting, test-model, test-meeting-stories, test-business-impact, test-purchases | Godkänt | Godkänt |
| test-mobile-browser.mjs (Chromium, iPhone 13-vy, lokal statisk server) | Underkänt: steg 1 och ingen PDF efter omladdning | Godkänt |
| Layout för sida 3, alla avtal, text utläst med pdfjs | Godkänt | Godkänt, slutar senast vid 438 pt |
| Tvingad lång förklaring | Ingen sidbrytning finns | Fortsättningssida skapas, `corePages` 9, inget under 496 pt |
| Visuell kontroll av sida 3 (Direkt och Individuell) | "%" först på rad | Bra |
| `git apply --check` mot orörd zip-export | | Rent |

Ej körda:
- `test-meeting-flow-dom.mjs` och `test-customer-agreement-dom.mjs`, eftersom jsdom saknas här. Kör dem. Restore-koden ska inte påverka dem: `localStorage` är tomt vid start, och `confirm` är redan mockad.
- `test-customer-agreement.mjs`, eftersom `drizzle/0000_sloppy_eternals.sql` saknas i exporten.
- `test-customer-email.mjs`.
- Produktionsbygge.
- WebKit, iOS och Android.

## 5. Testlista för Ludwig på iPhone (cirka 10 minuter)

Gör testet med patchen publicerad och adressen `…/?diagnos`. Ta en skärmbild av felsökningsrutan i varje läge.

1. Safari-flik: steg 4, Skapa PDF, Dela/spara, Spara i Filer. Kom filen fram?
2. Safari-flik: Öppna PDF och sedan Tillbaka. Visas steg 4 med PDF:en klar?
3. Hemskärmsappen: samma som 2. Går det att komma tillbaka? (H1)
4. Hemskärmsappen: Hämta PDF. Händer något? (H4)
5. Länken öppnad från den app där du brukar öppna Kundrummet, till exempel ChatGPT eller Teams: samma som 1 och 2. (H2)
6. Steg 3, Öppna fördjupningen, sedan ← Till kundmötet. Visas steg 3?

Skriv per punkt: vad du tryckte på, vad som hände och skärmbilden.

## 6. Öppna frågor

- Hur öppnar Ludwig Kundrummet på mobilen: i Safari, från hemskärmen eller via en länk i en annan app? Vilken knapp fungerar inte, och vad visas?
- Skickar den publicerade sajten `Cache-Control: no-store` på `/`? (H3)
- Godkänns den nya förklaringstexten för Direkt och Stabil?
