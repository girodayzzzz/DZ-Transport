import {corridors} from './corridors';
import { localized, type Lang, type Page } from './routes';

export const titles: Record<Page,string[]> = {
 germany:corridors.germany.title,
 austria:corridors.austria.title,
 italy:corridors.italy.title,
 croatia:corridors.croatia.title,
 home:['Organizacija prevozov po Sloveniji in Evropi','Transport coordination across Slovenia and Europe','Transportkoordination in Slowenien und Europa'],
 services:['Prevozne storitve','Transport services','Transportleistungen'],
 vehicle:['Prevoz vozil','Vehicle transport','Fahrzeugtransport'],
 pallet:['Prevoz palet','Pallet transport','Palettentransport'],
 cargo:['Prevoz tovora','General cargo transport','Stückguttransport'],
 moving:['Selitve','Moving and relocation','Umzug und Übersiedlung'],
 express:['Ekspresni prevoz','Express transport','Expresstransport'],
 special:['Posebni prevozi','Special transport','Spezialtransport'],
 inquiry:['Povpraševanje za prevoz','Transport inquiry','Transportanfrage'],
 business:['Za podjetja','Business customers','Geschäftskunden'],
 partners:['Prevozni partnerji','Transport partners','Transportpartner'],
 process:['Kako poteka','How it works','So funktioniert’s'],
 faq:['Pogosta vprašanja','Frequently asked questions','Häufige Fragen'],
 about:['O nas','About us','Über uns'],
 contact:['Kontakt','Contact','Kontakt'],
 privacy:['Politika zasebnosti','Privacy policy','Datenschutzerklärung'],
 terms:['Pogoji poslovanja','Terms and conditions','Geschäftsbedingungen'],
 cookies:['Politika piškotkov','Cookie policy','Cookie-Richtlinie'],
 confirmation:['Potrditev oddaje','Submission confirmation','Versandbestätigung'],
 missing:['Strani ni mogoče najti','Page not found','Seite nicht gefunden']
};

export const intro: Record<Page,string[]> = {
 germany:corridors.germany.intro,
 austria:corridors.austria.intro,
 italy:corridors.italy.intro,
 croatia:corridors.croatia.intro,
 home:['DZ Transport je del DZ Auto Trade in usklajuje prevoz vozil in tovora z ustreznimi izvajalci po Sloveniji in Evropi.','DZ Transport, part of DZ Auto Trade, coordinates vehicle and cargo transport through suitable providers across Slovenia and Europe.','DZ Transport gehört zu DZ Auto Trade und koordiniert Fahrzeug- und Warentransporte mit geeigneten Anbietern in Slowenien und Europa.'],
 services:['Izberite vrsto prevoza in nam sporočite, kaj želite prepeljati.','Choose a service and tell us what you need to move.','Wählen Sie eine Leistung und teilen Sie uns mit, was Sie transportieren möchten.'],
 vehicle:['Organizacija prevoza avtomobilov, motornih koles in dostavnikov po Sloveniji in Evropi.','Coordinate transport for cars, motorcycles and vans across Slovenia and Europe.','Organisation von Transporten für Pkw, Motorräder und Transporter in Slowenien und Europa.'],
 pallet:['Prevoz posameznih palet in večjih paletnih pošiljk po Sloveniji in Evropi.','Arrange transport for single pallets and larger palletised shipments in Slovenia and across Europe.','Palettentransport für einzelne Paletten und größere Sendungen in Slowenien und Europa.'],
 cargo:['Organizacija prevoza paketov, kosovnega blaga in drugega splošnega tovora.','Coordinate transport for packages, individual items and other general cargo.','Organisation von Transporten für Pakete, Einzelstücke und sonstiges Stückgut.'],
 moving:['Organizacija prevoza pohištva in osebnih stvari pri selitvah.','Arrange transport for furniture and personal belongings when you move.','Organisation von Transporten für Möbel und persönliche Gegenstände beim Umzug.'],
 express:['Za pošiljke s kratkimi roki ali določenim časom prevzema in dostave.','For time-sensitive shipments and pickups or deliveries with firm deadlines.','Für zeitkritische Sendungen und Abholungen oder Zustellungen mit festen Fristen.'],
 special:['Individualna presoja prevoza strojev, nestandardnih in reguliranih pošiljk.','Individual assessment for machinery, unusual shipments and regulated cargo.','Individuelle Prüfung für Maschinen, Sonderladungen und regulierte Güter.'],
 inquiry:['Sporočite nam podatke o relaciji, tovoru in želenih terminih.','Tell us about your route, cargo and preferred dates.','Teilen Sie uns Strecke, Ladung und Wunschtermine mit.'],
 business:['Prevoz za občasne pošiljke in redne poslovne potrebe v Sloveniji in Evropi.','Transport coordination for occasional shipments and recurring business needs in Slovenia and across Europe.','Transportkoordination für gelegentliche Sendungen und regelmäßigen Bedarf in Slowenien und Europa.'],
 partners:['Sodelovanje za profesionalne prevoznike in logistična podjetja.','Cooperation for professional transport providers and logistics companies.','Zusammenarbeit für professionelle Transportunternehmen und Logistikdienstleister.'],
 process:['Od prvega povpraševanja do uskladitve prevzema in dostave.','From your initial inquiry to coordinated pickup and delivery arrangements.','Von der ersten Anfrage bis zur Abstimmung von Abholung und Zustellung.'],
 faq:['Odgovori o ponudbah, območju prevoza in oddaji povpraševanja.','Answers about offers, coverage and submitting a transport inquiry.','Antworten zu Angeboten, Transportgebieten und Ihrer Anfrage.'],
 about:['DZ Transport je platforma znamke DZ Auto Trade za organizacijo prevozov.','DZ Transport is a DZ Auto Trade platform for coordinating transport.','DZ Transport ist eine Plattform von DZ Auto Trade zur Koordination von Transporten.'],
 contact:['Za konkretno relacijo in tovor oddajte povpraševanje za prevoz.','For a specific route and cargo, use the transport inquiry form.','Für eine konkrete Strecke und Ladung nutzen Sie das Anfrageformular.'],
 privacy:['Kako obdelujemo podatke iz povpraševanj in prijav prevoznikov.','How we process information from transport inquiries and partner applications.','Wie wir Daten aus Transportanfragen und Partnerbewerbungen verarbeiten.'],
 terms:['Pogoji za oddajo povpraševanj, pripravo ponudb in organizacijo prevoza.','Conditions for inquiries, offers and transport arrangements.','Bedingungen für Anfragen, Angebote und Transportkoordination.'],
 cookies:['Kako spletno mesto uporablja pomnilnik brskalnika.','How this site uses browser storage.','Wie diese Website Browserspeicher nutzt.'],
 confirmation:['Tukaj se prikaže referenca po potrjeni oddaji obrazca.','Your reference appears here after confirmed submission.','Nach bestätigtem Versand erscheint hier Ihre Referenz.'],
 missing:['Povezava je morda zastarela ali pa je bil naslov napačno vnesen.','The link may be outdated or the address may have been mistyped.','Der Link ist möglicherweise veraltet oder die Adresse wurde falsch eingegeben.']
};

export const process = [
 ['Oddajte povpraševanje za prevoz.','Submit your transport inquiry.','Senden Sie Ihre Transportanfrage.'],
 ['Pregledamo vaše zahteve.','We review your transport requirements.','Wir prüfen Ihre Transportanforderungen.'],
 ['Prejmete individualno ponudbo.','Receive an individual transport offer.','Sie erhalten ein individuelles Transportangebot.'],
 ['Potrdite ponudbo.','Confirm the offer.','Bestätigen Sie das Angebot.'],
 ['Uskladimo izvedbo prevoza.','Transport arrangements are coordinated.','Wir koordinieren die Transportabwicklung.']
];
export const reasons = [
 ['Individualne rešitve','Individual transport solutions','Individuelle Transportlösungen'],
 ['Ena kontaktna točka','One point of contact','Eine zentrale Anlaufstelle'],
 ['Prilagodljiva organizacija','Flexible coordination','Flexible Koordination'],
 ['Za posameznike in podjetja','For private and business customers','Für Privat- und Geschäftskunden'],
 ['Jasna komunikacija','Transparent communication','Klare Kommunikation'],
 ['Možnosti po Evropi','European transport opportunities','Transportmöglichkeiten in Europa']
];
export const booking = ['Oddaja povpraševanja sama po sebi ne pomeni potrjene rezervacije ali zavezujočega naročila.','Submitting an inquiry does not confirm a booking or create a binding transport order.','Eine Anfrage bestätigt keine Buchung und begründet keinen verbindlichen Transportauftrag.'];
export const coverage = ['Domači in mednarodni prevozi so odvisni od relacije, vrste tovora, terminov in razpoložljivosti ustreznih prevoznikov.','Domestic and cross-border options depend on the route, cargo, dates and availability of suitable providers.','Inlands- und grenzüberschreitende Transporte hängen von Strecke, Ladung, Terminen und der Verfügbarkeit geeigneter Anbieter ab.'];
export const faq = [
 [['Ali je povpraševanje že naročilo?','Is an inquiry a booking?','Ist die Anfrage bereits eine Buchung?'],booking],
 [['Kje lahko organizirate prevoz?','Where can you arrange transport?','Wo können Sie Transporte organisieren?'],coverage],
 [['Kako dobim ceno?','How do I get a price?','Wie erhalte ich einen Preis?'],['Na podlagi relacije, tovora in terminov pripravimo individualno ponudbo, ko je prevoz izvedljiv.','When transport is feasible, we prepare an individual offer based on your route, cargo and dates.','Wenn ein Transport möglich ist, erstellen wir anhand von Strecke, Ladung und Terminen ein individuelles Angebot.']],
 [['Ali lahko prijavim reguliran tovor?','Can I inquire about regulated cargo?','Kann ich regulierte Güter anfragen?'],['Da. Označite tovor kot reguliran ali nevaren. Izvedljivost in pogoje preverimo individualno.','Yes. Flag it as regulated or hazardous so we can assess feasibility and conditions individually.','Ja. Kennzeichnen Sie die Ladung als reguliert oder gefährlich, damit wir Machbarkeit und Bedingungen im Einzelfall prüfen können.']]
];
export const serviceDetails: Record<string,string[][]> = {
 vehicle:[
 ['Pripravite znamko, model, letnik in podatek, ali je vozilo vozno. Navedite število vozil in morebitne poškodbe.','Provide the make, model, year and whether the vehicle runs. Include the number of vehicles and any damage.','Nennen Sie Marke, Modell, Baujahr, Fahrbereitschaft, Anzahl der Fahrzeuge und etwaige Schäden.'],
 ['Če želite odprt ali zaprt prevoz, to navedite pri povpraševanju.','Specify whether you prefer open or enclosed transport.','Geben Sie an, ob Sie offenen oder geschlossenen Transport bevorzugen.']],
 pallet:[
 ['Navedite tip, število in dimenzije palet ter skupno maso. Sporočite, ali je palete mogoče zlagati.','Include pallet type, count, dimensions, total weight and whether they can be stacked.','Nennen Sie Palettentyp, Anzahl, Maße, Gesamtgewicht und Stapelbarkeit.'],
 ['Opišite opremo za nakladanje na lokacijah in morebitno potrebo po dvižni ploščadi.','Describe loading equipment at each site and any tail-lift requirement.','Beschreiben Sie die Verladeausrüstung vor Ort und einen eventuellen Bedarf an einer Ladebordwand.']],
 cargo:[['Navedite vsebino, število kosov, dimenzije in maso ter označite krhkost in možnost zlaganja.','List the contents, piece count, dimensions and weight. Flag fragile items and specify stackability.','Geben Sie Inhalt, Stückzahl, Maße und Gewicht an. Kennzeichnen Sie zerbrechliche und stapelbare Güter.']],
 moving:[['Navedite približen volumen, število kosov, nadstropje in dostop do dvigala. Opišite pomoč pri nakladanju ali razstavljanju.','Share the estimated volume, item count, floor and lift access. Describe any loading or disassembly assistance.','Geben Sie geschätztes Volumen, Stückzahl, Etage und Aufzug an. Beschreiben Sie benötigte Hilfe bei Verladung oder Demontage.']],
 express:[['Vnesite najpoznejši sprejemljivi termin dostave in označite nujnost. Razpoložljivost preverimo za izbrano relacijo.','Enter the latest acceptable delivery date and mark the shipment urgent. We check availability for your route.','Geben Sie den spätesten Liefertermin an und kennzeichnen Sie die Sendung als dringend. Wir prüfen die Verfügbarkeit für Ihre Strecke.']],
 special:[['Vključite mere, maso in potrebno opremo. Nevarno ali regulirano blago je treba označiti za individualno presojo.','Include dimensions, weight and equipment requirements. Flag hazardous or regulated cargo for manual assessment.','Geben Sie Maße, Gewicht und erforderliche Ausrüstung an. Kennzeichnen Sie gefährliche oder regulierte Güter für die Einzelfallprüfung.']]
};
export const t = (lang:Lang, values:readonly string[]) => localized(lang,values);
