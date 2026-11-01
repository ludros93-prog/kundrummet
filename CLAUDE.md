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

