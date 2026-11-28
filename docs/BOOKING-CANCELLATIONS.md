# Sprejem ponudb, odpovedi in provizije

Migracija `202611280012_booking_cases.sql` doda dogovorjene pogoje ponudb, posnetke dogovorov, primere odpovedi z zgodovino in zahtevke za popravek provizije. Obstoječa naročila in postavke ostanejo v svojih evidencah. Pred preskusom nove različice portala migracijo uporabi v namenski testni bazi.

- Brez V8 skrbnik iz oddane ponudbe pripravi ponudbo za prijavljeno stranko. Sprejem v isti transakciji shrani dogovor, dodeli prevoznika, odpre klepet in zabeleži provizijo V7. Pri plačljivi ponudbi Checkout ustvari rezervacijo. Dokončni sprejem, dodelitev in obračun nastanejo po potrditvi plačila, provizija pa ostane v evidenci V8.
- Stara naročila, Quick Deal in gostujoče ponudbe obdržijo obstoječi potek. Pri starejših običajnih ponudbah brez dogovorjenih podatkov portal prikaže opozorilo in skrbnik pripravi posodobljeno ponudbo. Pred javnim zagonom je treba pregledati odprte stare ponudbe in po potrebi izdati nove z jasnim izvajalcem in pogoji.
- Zahtevo lahko vloži udeleženec. Skrbnik z MFA določi vzrok in zapiše obrazložitev. Soglasje druge strani je del zgodovine. Interna opomba je dostopna samo skrbniku. Po prevzemu, dostavi ali začetku prenosa je potreben skrbniški pregled. Če je bila dostava že zabeležena, odločitev o primeru ohrani zapis dostave.
- Odpoved ne sproži Stripe vračila. Skrbnik uporabi ločeno odločitev za vračilo stranki v obstoječem modulu V8. Dokončno obračunana provizija ostane v svoji evidenci tudi, ko je stranka prejela vračilo. Pri že prenesenih sredstvih skrbnik preveri povratni prenos in uskladitev. Obravnava dobropisa ali vračila provizije ostane računovodska.
- Prevoznik ima 30 dni od obračuna za zahtevek. Odobren zahtevek pri odprti postavki V7 zabeleži storno ob ohranjenem prvotnem znesku. Pri že knjiženi postavki ali začetem prenosu zabeleži zahtevo za računovodsko uskladitev. Za V8 je popravek odprte provizije zabeležen ob prvotni postavki v pregledu primera. Pri izvedenem in plačanem prevozu se provizija poravna z odbitkom v V8.
- Quick Deal ostaja v svojem obstoječem postopku. Plačilne nastavitve in varovala testnega načina se ob uveljavitvi migracije ne spremenijo.

## Pred javnim zagonom

- Potrdi razkritje pravnega imena, naslova in identifikacije prevoznika ob zavezujoči ponudbi ter v Stripe Checkoutu, potrdilu in bančnem izpisku. Pri Quick Dealu je treba ločeno določiti, kdaj izbrani prevoznik postane znan in kdaj nastane obveznost plačila.
- Potrdi prikaz zneska z DDV, izdajanje računa za provizijo in odgovornost za uskladitev odprte provizije, storna in dobropisa. Uskladi prenos popravkov V8 iz pregleda primera v računovodski izvoz. Določi ravnanje, kadar povratni prenos ne uspe ali ne pokrije obveznosti.
- Potrdi roke in postopek vračila stranki, pravila reklamacij po prevzemu ali dostavi in pravna besedila za dejanski poslovni model. Ločena provizija za stranko znaša 0. Morebitno nadomestilo ob odpovedi stranke zahteva ločeno poslovno odločitev.
- Uredi postopek brisanja in izjeme pri hrambi. Potrjena roka sta 90 dni od zaključka povpraševanja brez naročila in šest mesecev od zaključka zavrnjene ali umaknjene prijave. Samodejno brisanje po teh rokih še ni vzpostavljeno. Sprejete ponudbe in odprti spori imajo ločeno obravnavo. Potrdi roke za druge evidence in vloge ponudnikov obdelave.
