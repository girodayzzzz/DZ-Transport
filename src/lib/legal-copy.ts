import {booking} from './content';

type Localized = [string, string, string];
type Section = [Localized, Localized];

export const terms: [Localized, readonly string[]][] = [
 [
  ['Povpraševanje in ponudba','Inquiry and offer','Anfrage und Angebot'],
  booking
 ],
 [
  ['Sklenitev pogodbe in račun','Contract formation and invoice','Vertragsschluss und Rechnung'],
  [
   'Pogodbo o prevozu skleneta stranka in izbrani prevoznik. Prevoznik je dobavitelj prevozne storitve, odgovarja za izvedbo in stranki izda račun za prevoz. DZ Transport prevozniku izda ločen račun za provizijo. Pred zavezujočim sprejemom mora biti stranki znan prevoznik, skupaj s celotno ceno z davki in obveznimi stroški, obsegom storitve, relacijo, termini, veljavnostjo in načinom sprejema.',
   'The customer contracts for carriage directly with the selected carrier. The carrier supplies the transport service, is responsible for performing it and invoices the customer. DZ Transport invoices the carrier separately for its commission. Before binding acceptance, the customer must know the identity of the carrier, the total price including taxes and mandatory charges, the service, route, dates, validity and how to accept.',
   'Der Kunde schließt den Beförderungsvertrag direkt mit dem ausgewählten Transportunternehmen. Dieses erbringt die Transportleistung, ist für ihre Durchführung verantwortlich und stellt dem Kunden die Rechnung. DZ Transport stellt dem Transportunternehmen eine separate Provisionsrechnung. Vor der verbindlichen Annahme müssen dem Kunden das Transportunternehmen, der Gesamtpreis einschließlich Steuern und Pflichtkosten, Leistungsumfang, Strecke, Termine, Gültigkeit und Annahmeverfahren bekannt sein.'
  ]
 ],
 [
  ['Quick Deal in plačilo','Quick Deal and payment','Quick Deal und Zahlung'],
  [
   'Pri običajni ponudbi je predvideno plačilo prek DZ Transporta po izbiri ponudbe prevoznika. DZ Transport po potrjeni dostavi upravlja izplačilo prevozniku po odbitku dogovorjene provizije. Pri Quick Dealu stranka objavi fiksno ceno, izbrani prevoznik pa ob objavi še ni znan. Za javni zagon je predlagano plačilo po določitvi in razkritju prevoznika. Če naloge nihče ne sprejme v roku, predlog predvideva zaprtje naloge brez plačila. Stripe je omejen na testiranje. Potrdilo o plačilu in račun za prevoz sta ločena dokumenta.',
   'For a regular offer, the planned model is for the customer to pay through DZ Transport after selecting a carrier offer. DZ Transport manages the carrier payout after delivery is confirmed and deducts the agreed commission. A Quick Deal lists a fixed price while the carrier is still unknown. For public launch, the proposal is to take payment once the carrier is selected and disclosed. If nobody accepts by the deadline, the listing would close without a payment. Stripe is limited to testing. The payment receipt and transport invoice are separate documents.',
   'Bei einem regulären Angebot ist die Zahlung über DZ Transport nach Auswahl eines Angebots des Transportunternehmens vorgesehen. Nach bestätigter Zustellung verwaltet DZ Transport die Auszahlung nach Abzug der vereinbarten Provision. Beim Quick Deal wird ein Festpreis veröffentlicht, während das Transportunternehmen noch unbekannt ist. Für den öffentlichen Start ist vorgesehen, die Zahlung nach Auswahl und Offenlegung des Transportunternehmens einzuziehen. Erfolgt bis zum Fristende keine Annahme, soll der Auftrag ohne Zahlung geschlossen werden. Stripe ist nur für Tests vorgesehen. Zahlungsbeleg und Transportrechnung sind getrennte Dokumente.'
  ]
 ],
 [
  ['Odpoved, odstop in vračilo','Cancellation, withdrawal and refunds','Stornierung, Widerruf und Erstattung'],
  [
   'Zahtevo za odpoved ali vračilo pošljite na objavljeni e-poštni naslov in navedite referenco. Pred zavezujočim sprejemom je treba razkriti pogoje odpovedi, morebitne stroške in način vračila. Obvezne pravice potrošnika veljajo tudi za spletna naročila. Izjema od pravice do odstopa pri prevozu blaga pride v poštev, če so izpolnjeni zakonski pogoji, vključno z dogovorjenim točnim datumom ali rokom izvedbe. Cenik odpovedi in postopek vračil še čakata na potrditev.',
   'Email the published contact with your reference to request cancellation or a refund. Cancellation conditions, any charges and the refund process must be disclosed before binding acceptance. Mandatory consumer rights apply to online orders. The withdrawal exception for carriage of goods may apply where statutory conditions are met, including an agreed specific date or period for performance. Cancellation charges and the refund process remain subject to approval.',
   'Stornierungen oder Erstattungen können per E-Mail an den veröffentlichten Kontakt unter Angabe der Referenz beantragt werden. Die Stornierungsbedingungen, etwaige Kosten und das Erstattungsverfahren müssen vor der verbindlichen Annahme offengelegt werden. Zwingende Verbraucherrechte gelten auch für Onlinebestellungen. Die Ausnahme vom Widerrufsrecht für die Beförderung von Gütern kommt bei Erfüllung der gesetzlichen Voraussetzungen in Betracht, darunter ein vereinbarter konkreter Termin oder Zeitraum. Stornierungskosten und Erstattungsverfahren sind noch zu bestätigen.'
  ]
 ],
 [
  ['Obveznosti pri prevozu','Transport responsibilities','Pflichten beim Transport'],
  [
   'Stranka zagotovi točne podatke o tovoru, dostopu, nevarnem blagu in posebnih zahtevah ter pripravi tovor v skladu z dogovorom. Prevoznik fizično izvede prevoz, poskrbi za ustrezno opremo in zahtevana dovoljenja ter izpolni dogovorjene naloge pri prevzemu in dostavi. DZ Transport odgovarja za lastne obveznosti pri organizaciji, komunikaciji in ravnanju s prejetim plačilom. Odgovornost za izvedbo prevoza se določi po dejanski pogodbeni vlogi in veljavnih predpisih.',
   'The customer gives accurate cargo, access, hazardous goods and special handling information and prepares the shipment as agreed. The carrier physically transports the goods, provides suitable equipment and required licences, and performs agreed pickup and delivery tasks. DZ Transport is responsible for its own coordination, communication and handling of payments it receives. Liability for carriage follows the actual contractual role and applicable law.',
   'Der Kunde macht zutreffende Angaben zu Ladung, Zugang, Gefahrgut und besonderen Anforderungen und bereitet das Transportgut wie vereinbart vor. Das Transportunternehmen führt den Transport aus, stellt geeignete Ausrüstung und erforderliche Genehmigungen sicher und erfüllt die vereinbarten Aufgaben bei Abholung und Zustellung. DZ Transport haftet für seine eigenen Pflichten bei Organisation, Kommunikation und Abwicklung empfangener Zahlungen. Die Haftung für den Transport richtet sich nach der tatsächlichen Vertragsrolle und den anwendbaren Vorschriften.'
  ]
 ],
 [
  ['Reklamacije, izguba in poškodbe','Complaints, loss and damage','Reklamationen, Verlust und Schäden'],
  [
   'Vidno škodo ali primanjkljaj zabeležite ob dostavi v prevozni dokument ali zapisnik. Čim prej sporočite referenco, opis in razpoložljiva dokazila, na primer fotografije in prevzemne dokumente. DZ Transport sprejme obvestilo in ga glede na vrsto zahtevka obravnava ali posreduje pristojni pogodbeni stranki. Upoštevajte roke za pridržke in zahtevke po veljavnih pravilih. Za mednarodni cestni prevoz blaga lahko velja CMR, kadar je prevoz v njenem področju uporabe. Postopek reševanja potrošniških sporov še čaka na potrditev.',
   'Record visible damage or shortages on the transport document or delivery record at handover. Promptly send the reference, description and available evidence, such as photos and pickup records. DZ Transport receives the report and handles or routes it to the appropriate contracting party depending on the claim. Applicable rules govern notice and claim periods. The CMR Convention may apply to international road carriage of goods within its scope. The consumer dispute procedure remains subject to approval.',
   'Halten Sie sichtbare Schäden oder Fehlmengen bei der Übergabe im Frachtbrief oder Zustellprotokoll fest. Übermitteln Sie zeitnah Referenz, Beschreibung und verfügbare Nachweise wie Fotos und Abholbelege. DZ Transport nimmt die Meldung entgegen und bearbeitet sie je nach Anspruch oder leitet sie an den zuständigen Vertragspartner weiter. Für Vorbehalte und Ansprüche gelten die einschlägigen Fristen. Bei grenzüberschreitender Güterbeförderung auf der Straße kann die CMR in ihrem Anwendungsbereich gelten. Das Verfahren für Verbraucherstreitigkeiten ist noch zu bestätigen.'
  ]
 ]
];

export const privacy: Section[] = [
 [
  ['Upravljavec in stik','Controller and contact','Verantwortlicher und Kontakt'],
  [
   'Upravljavec spletnega mesta DZ Transport je podjetnik, naveden spodaj. Za vprašanja in uveljavljanje pravic uporabite objavljeni e-poštni naslov.',
   'The sole proprietor listed below is the controller for the DZ Transport website. Use the published email address for questions or to exercise your rights.',
   'Der unten genannte Einzelunternehmer ist für die Website DZ Transport verantwortlich. Fragen und Anträge zur Ausübung Ihrer Rechte richten Sie an die angegebene E-Mail-Adresse.'
  ]
 ],
 [
  ['Računi in varnost','Accounts and security','Konten und Sicherheit'],
  [
   'Pri registraciji in prijavi obdelujemo e-poštni naslov, podatke za overjanje, seje, profil in dodeljene vloge. Za skrbnike je zahtevana večfaktorska avtentikacija. Supabase Auth uporablja e-pošto za potrditev naslova in obnovitev gesla. Dejanski ponudnik SMTP in njegova vloga še čakata na potrditev.',
   'Registration and sign-in involve processing email addresses, authentication data, sessions, profiles and assigned roles. Administrators must use multi-factor authentication. Supabase Auth uses email for address verification and password recovery. The actual SMTP provider and its role are pending confirmation.',
   'Bei Registrierung und Anmeldung verarbeiten wir E-Mail-Adresse, Authentifizierungsdaten, Sitzungen, Profil und zugewiesene Rollen. Administratoren müssen Mehrfaktor-Authentifizierung nutzen. Supabase Auth verwendet E-Mails zur Adressbestätigung und Passwortwiederherstellung. Der tatsächliche SMTP-Dienst und seine Rolle sind noch zu bestätigen.'
  ]
 ],
 [
  ['Povpraševanja in prijave prevoznikov','Inquiries and carrier applications','Anfragen und Transportpartnerbewerbungen'],
  [
   'Obdelujemo kontaktne podatke, podatke o prevzemu in dostavi, tovoru in terminih ter referenco oddaje. Pri prijavah prevoznikov obdelujemo tudi podatke o podjetju, vozilih, zmogljivostih, dovoljenjih in zavarovanju. Skrbniki jih uporabljajo za obravnavo povpraševanj in preverjanje prijav. Nujne podatke o prevozu delimo s prevozniki, kadar so potrebni za ponudbo ali izvedbo.',
   'We process contact, pickup and delivery, cargo and scheduling details, and the submission reference. For carrier applications we also process company, vehicle, capacity, licensing and insurance details. Administrators use the data to handle inquiries and assess applications. We share necessary shipment details with carriers where needed for a quote or carriage.',
   'Wir verarbeiten Kontakt-, Abhol-, Zustell-, Ladungs- und Termindaten sowie die Versandreferenz. Bei Bewerbungen verarbeiten wir zusätzlich Unternehmens-, Fahrzeug-, Kapazitäts-, Genehmigungs- und Versicherungsdaten. Administratoren bearbeiten damit Anfragen und prüfen Bewerbungen. Erforderliche Transportdaten geben wir zur Angebotserstellung oder Durchführung an Transportunternehmen weiter.'
  ]
 ],
 [
  ['Ponudbe, naročila in sporočila','Offers, orders and messages','Angebote, Aufträge und Nachrichten'],
  [
   'Za organizacijo prevoza obdelujemo ponudbe, dodelitve, stanja naročil, vsebino sporočil in čas pošiljanja. Zasebni klepet je omejen na udeležence konkretnega prevoza. Vprašanja in odgovori, ki so označeni za javno objavo in odobreni, so lahko vidni obiskovalcem. V javnih vprašanjih ne navajajte osebnih podatkov.',
   'To arrange transport we process offers, assignments, order status, message contents and timestamps. Private conversation access is limited to participants in the relevant transport. Questions and answers marked and approved for public publication may be visible to visitors. Keep personal information out of public questions.',
   'Zur Organisation von Transporten verarbeiten wir Angebote, Zuweisungen, Auftragsstatus, Nachrichteninhalte und Zeitstempel. Private Unterhaltungen sind auf die Teilnehmer des jeweiligen Transports beschränkt. Zur Veröffentlichung markierte und freigegebene Fragen und Antworten können für Besucher sichtbar sein. Geben Sie in öffentlichen Fragen keine personenbezogenen Daten an.'
  ]
 ],
 [
  ['Tehnični ponudniki in plačila','Technical providers and payments','Technische Dienste und Zahlungen'],
  [
   'Cloudflare Pages gosti spletno mesto in strežniške poti obrazcev. Ko je obrazec omogočen, Turnstile preveri zahtevo za preprečevanje zlorab, strežniška pot pa uporablja zgoščeni identifikator omrežja za omejevanje oddaj. Supabase je predviden za overjanje in hrambo podatkov portala in obrazcev. Stripe Checkout in Connect sta v tej različici predvidena le za testne podatke. Pred javnim vklopom je treba potrditi dejanske ponudnike, njihove vloge, lokacije obdelave in varovala za morebitne prenose zunaj EGP.',
   'Cloudflare Pages hosts the site and the server routes for the forms. When a form is enabled, Turnstile checks requests for abuse and the server route uses a hashed network identifier to limit submissions. Supabase supports authentication and storage for portal and form data. Stripe Checkout and Connect are intended for test data only in this version. The actual providers, their roles, processing locations and safeguards for any transfers outside the EEA must be confirmed before public activation.',
   'Cloudflare Pages hostet die Website und die serverseitigen Formularrouten. Bei aktiviertem Formular prüft Turnstile Anfragen auf Missbrauch, und die Serverroute nutzt eine gehashte Netzwerkkennung zur Begrenzung von Einsendungen. Supabase dient zur Authentifizierung und Speicherung von Portal- und Formulardaten. Stripe Checkout und Connect sind in dieser Version nur für Testdaten vorgesehen. Vor der öffentlichen Aktivierung sind die tatsächlichen Anbieter, ihre Rollen, Verarbeitungsorte und Garantien für etwaige Übermittlungen außerhalb des EWR zu bestätigen.'
  ]
 ],
 [
  ['Namen in pravne podlage','Purposes and legal bases','Zwecke und Rechtsgrundlagen'],
  [
   'Predlagane podlage so predpogodbeni ukrepi na zahtevo posameznika in izvajanje pogodbe za naročila in povezano komunikacijo, zakoniti interesi pri varovanju sistema in obravnavi poslovnih kontaktov ter zakonske obveznosti pri obveznih poslovnih evidencah. Če se izvaja trženje, temelji na ločeni privolitvi, ki jo lahko prekličete. Natančen popis namenov, podlag, obveznih polj in posledic, če podatkov ne posredujete, še čaka na potrditev.',
   'Proposed bases include steps requested before a contract and performance of the contract for orders and related messages, legitimate interests in protecting the system and handling business contacts, and legal obligations for required business records. Any marketing relies on separate consent that can be withdrawn. Purposes, bases, required fields and the consequences of withholding data are pending final confirmation.',
   'Vorgesehene Rechtsgrundlagen sind vorvertragliche Maßnahmen auf Anfrage und Vertragserfüllung für Aufträge und damit verbundene Kommunikation, berechtigte Interessen am Schutz des Systems und an der Bearbeitung geschäftlicher Kontakte sowie gesetzliche Pflichten für vorgeschriebene Geschäftsunterlagen. Etwaiges Marketing beruht auf gesonderter, widerruflicher Einwilligung. Zwecke, Rechtsgrundlagen, Pflichtangaben und Folgen fehlender Angaben sind noch abschließend zu bestätigen.'
  ]
 ],
 [
  ['Hramba in vaše pravice','Retention and your rights','Speicherdauer und Ihre Rechte'],
  [
   'Roki oziroma merila hrambe za račune, povpraševanja, prijave, ponudbe, klepet, varnostne dnevnike, varnostne kopije in poslovne listine še čakajo na potrditev. Pod pogoji GDPR lahko zahtevate dostop, popravek, izbris, omejitev ali prenosljivost, ugovarjate obdelavi ali prekličete privolitev. Pritožbo lahko vložite pri pristojnem nadzornem organu, v Sloveniji pri Informacijskem pooblaščencu.',
   'Retention periods or criteria for accounts, inquiries, applications, offers, messages, security logs, backups and business documents are pending confirmation. Under the conditions of the GDPR you may request access, rectification, erasure, restriction or portability, object to processing or withdraw consent. You may complain to a competent supervisory authority, including Slovenia’s Information Commissioner.',
   'Speicherfristen oder Kriterien für Konten, Anfragen, Bewerbungen, Angebote, Nachrichten, Sicherheitsprotokolle, Sicherungskopien und Geschäftsunterlagen sind noch zu bestätigen. Unter den Voraussetzungen der DSGVO können Sie Auskunft, Berichtigung, Löschung, Einschränkung oder Datenübertragbarkeit verlangen, widersprechen oder eine Einwilligung widerrufen. Sie können sich bei einer zuständigen Aufsichtsbehörde beschweren, etwa beim slowenischen Informationsbeauftragten.'
  ]
 ]
];
