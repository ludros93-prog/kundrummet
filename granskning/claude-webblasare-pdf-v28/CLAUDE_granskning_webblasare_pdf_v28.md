# Claude-granskning: PDF i datorns webbläsare

Kundrummet version 28, snapshot 052b2d1. Granskat 1 november 2026. Till ChatGPT.
Detta är en fortsättning på mobilgranskningen i `granskning/claude-mobil-pdf-v28/`. Läs den först.

## Vilken patch ska användas

- Om mobilpatchen redan är införd: använd `kundrummet-v28-claude-webblasare-efter-mobil.patch`.
- Om ingenting är infört: använd `kundrummet-v28-claude-mobil-och-webblasare.patch`. Den innehåller båda patcharna.
- `andrade-filer/` visar slutläget efter båda patcharna, som hela filer.

Båda patcharna går in utan konflikter i exporten. Det är testat.

## Kort sammanfattning

- **Huvudfelet finns även på datorn: Kundrummet glömmer steget.**
  - Öppna PDF följt av Bakåt ger steg 1, och PDF:en är borta.
  - Fördjupningen följt av Bakåt ger också steg 1.
  - Mobilpatchen löser detta även på datorn. Det är verifierat.
- **Öppna PDF ersätter mötet i samma flik, på alla enheter.**
  - Version 28 gjorde så för mobilens skull.
  - På datorn finns inget skäl till det. Förslaget är ny flik på dator och samma fönster på mobil, surfplatta och hemskärmsapp.
- **Hämta PDF fungerar på datorn och ger rätt filnamn.**
- **Avtalsförklaringen är densamma som i mobilgranskningen.** PDF:en skapas likadant oavsett enhet.

## 1. Verifierade fynd

### W1. Steget glöms även på datorn (hög)

Belägget kommer från full Chromium i 1440 × 900 bildpunkter, styrd av Playwright. Version 28 testades med och utan `Cache-Control: no-store`.

| Vad testades | Version 28 | Med mobilpatchen |
|---|---|---|
| Öppna PDF | Visar PDF:en i samma flik | Visar PDF:en i samma flik |
| Bakåt efter Öppna PDF | Steg 1, `#pdfActions` dold | Steg 4, PDF:en klar igen |
| Fördjupningen, sedan Bakåt | Steg 1 | Steg 3 |
| Omladdning | Steg 1 | Steg 4, PDF:en klar igen |

Vanlig Chrome kan ibland återställa sidan ur webbläsarens minne. Men `no-store` och flera andra orsaker stänger av det minnet. Patchen gör att Kundrummet fungerar likadant oavsett om sidan återställs eller laddas om.

### W2. Öppna PDF ersätter mötet på datorn (medel)

- Fil: `public/index.html` har `target="_self"` på `#summaryOpen`. Det gäller alla enheter.
- Följd: På datorn försvinner mötet ur sikte och säljaren måste gå tillbaka. Med W1 betydde det steg 1.
- Fix i `meeting-delivery.mjs`: funktionen `opensNewTab()` styr vart länken öppnas.
  - Ny flik bara när pekaren är exakt och kan hovra.
  - Aldrig i hemskärmsapp eller installerad app, på iOS eller iPadOS, eller på Android.
  - Ny flik får `rel="noopener"` och texten "Öppna PDF ↗". Statustexten nämner den nya fliken.
  - Annars blir det `_self` precis som i version 28.
- Verifierat i Chromium: en ny flik öppnas med PDF:en och mötet står kvar på steg 4 med PDF:en klar.
- Skäl att behålla samma fönster på mobilen: en blob-adress kan sakna åtkomst från ett nytt fönster i hemskärmsappar och inbyggda webbläsare. Det var skälet till ändringen i version 28.

### W3. Dela/spara lades först på alla skärmbredder (låg, rättar mobilpatchen)

- Mobilpatchen satte `#summaryShare{order:-1}` för alla bredder.
- På datorn kan Dela/spara visas i Edge och Chrome i Windows och i Safari på Mac. Där är Hämta PDF det naturliga valet.
- Fix: ordningen ändras bara under 700 bildpunkter.

### W4. Hjälptexten stämmer inte på datorn (låg)

- "Öppna PDF visar filen i samma fönster" blir fel med ny flik.
- Ny text, som stämmer på alla enheter: "Avtalsförklaringen följer med automatiskt. Om du lämnar sidan öppnar Kundrummet samma steg igen när du kommer tillbaka."

### Fungerar redan

- Hämta PDF gav filen `Kundunderlag-Testkund-AB-both.pdf`.
- Tangentbordsfokus syns: en ram på 3 bildpunkter runt knapparna i steg 4. Det är kontrollerat på skärmbild.
- Inga JavaScript-fel uppstod i något flöde.

## 2. Hypoteser som kräver test på dator

| # | Hypotes | Hur det testas |
|---|---|---|
| D1 | Safari på Mac visar PDF:en i ny flik, med blob-adress och `noopener`. | Safari: steg 4, Skapa PDF, Öppna PDF ↗. |
| D2 | Firefox gör samma sak. | Som D1 i Firefox. |
| D3 | Spara-knappen i PDF-visaren i Chrome och Edge ger ett slumpnamn som `a1b2…pdf`, eftersom adressen är en blob. | Öppna PDF ↗ och spara i visaren. Titta på filnamnet. Om det blir slumpnamn: lägg till "Använd Hämta PDF för rätt filnamn" i hjälptexten. |
| D4 | Dela/spara fungerar i Edge och Chrome i Windows och i Safari på Mac. | Tryck Dela/spara och välj till exempel Mejl. |
| D5 | Strikt blockering av popup-fönster stoppar inte länken. Det är en vanlig länk som klickas, inte `window.open`. | Slå på strikt blockering och testa D1. |

I huvudlös Chromium (headless shell) laddas PDF:en ned i stället för att visas. Det beror på att den versionen saknar PDF-visare och är ingen egenskap hos Kundrummet. Datortestet använder därför full Chromium.

## 3. Patchen fil för fil (efter mobilpatchen)

| Fil | Ändring |
|---|---|
| `public/meeting-delivery.mjs` | `opensNewTab()` exporteras. `target`, `rel` och text för `#summaryOpen` sätts när PDF:en är klar. Statustexten nämner ny flik på datorn. |
| `public/meeting-flow.css` | `#summaryShare{order:-1}` gäller bara i `@media(max-width:700px)`. |
| `public/index.html` | Hjälptexten är neutral och stämmer på alla enheter. |
| `test-meeting-delivery.mjs` | Importen tar med `opensNewTab`. Nytt block testar Mac, Windows, installerad app, iPad med styrplatta, Android, iPhone och miljö utan `matchMedia`, och kontrollerar länkens `target`, `rel` och text. |
| `test-desktop-browser.mjs` (ny) | Full Chromium (`channel: 'chromium'`) i 1440 × 900 mot `BASE`. Testar filnamn, PDF i ny flik med mötet kvar, omladdning i steg 4 och Bakåt från fördjupningen till steg 3. |

jsdom-testet `test-meeting-flow-dom.mjs` kontrollerar att `summaryOpen.target` är `_self` före PDF:en. jsdom saknar `matchMedia`, så `target` förblir `_self` även efter. Testet bör alltså gå igenom, men jag har inte kört det.

## 4. Tester jag faktiskt körde

Miljön är densamma som i mobilrapporten, med samma tillfälliga typsnittsbyte. Webbläsartesterna kördes mot två lokala servrar: en vanlig och en som skickar `Cache-Control: no-store`.

| Test | Version 28 | Med båda patcharna |
|---|---|---|
| Node-testerna (pdf, delivery, summary, meeting, model, stories, business-impact, purchases) | Godkänt | Godkänt |
| test-meeting-delivery, nytt block för dator | Finns inte | Godkänt |
| test-desktop-browser.mjs | Underkänt på vanlig server: `target` är `_self` | Godkänt på vanlig server och med `no-store` |
| test-mobile-browser.mjs | Underkänt på vanlig server | Godkänt på vanlig server och med `no-store` |
| Undersökning av flödet i full Chromium (W1) | Steg 1 efter Bakåt och omladdning | Steg 4 och steg 3 |
| Skärmbild av steg 4 på dator | | Bra, fokusram syns |
| `git apply`: stegvis patch efter mobilpatchen och samlad patch mot orörd export | | Rent, och slutläget är identiskt |

Ej körda:
- Safari, Firefox och Edge.
- Windows och macOS.
- jsdom-testerna.
- test-customer-agreement och test-customer-email.
- Produktionsbygge.

## 5. Testlista på dator (cirka 5 minuter)

1. Chrome eller Edge: steg 4, Skapa PDF, Hämta PDF. Vilket filnamn fick filen?
2. Öppna PDF ↗. Öppnas en ny flik? Står mötet kvar på steg 4?
3. Spara i PDF-visaren. Vilket filnamn fick filen? (D3)
4. Safari på Mac: gör punkt 1 och 2. (D1)
5. Steg 3, Öppna fördjupningen, sedan Mötesflöde eller Bakåt. Visas steg 3?
6. Ladda om sidan i steg 4. Visas steg 4 med PDF:en klar?

## 6. Öppna frågor

- Vilka webbläsare använder teamet på datorn?
- Är ny flik på datorn rätt? Version 28 valde samma flik medvetet, men bara mobilskälen är kända.
