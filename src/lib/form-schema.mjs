const field = (key, labels, type='text', required=true, options=[]) => ({key,labels,type,required,options});
const option = (value,sl,en,de) => [value,sl,en,de];
export const types = [
 option('car','Prevoz avtomobila','Car transport','Pkw-Transport'),
 option('motorcycle','Prevoz motornega kolesa','Motorcycle transport','Motorradtransport'),
 option('van','Prevoz dostavnika','Van transport','Transportertransport'),
 option('pallet','Prevoz palet','Pallet transport','Palettentransport'),
 option('cargo','Splošni tovor','General cargo','Stückgut'),
 option('furniture','Prevoz pohištva','Furniture transport','Möbeltransport'),
 option('moving','Selitev','Moving and relocation','Umzug und Übersiedlung'),
 option('machinery','Prevoz strojev','Machinery transport','Maschinentransport'),
 option('express','Ekspresni prevoz','Express transport','Expresstransport'),
 option('nonRunning','Prevoz nevoznega vozila','Non-running vehicle transport','Transport nicht fahrbereiter Fahrzeuge'),
 option('partial','Delni tovor','Partial load','Teilladung'),
 option('full','Polni tovor','Full load','Komplettladung'),
 option('other','Drugi prevozi','Other transport','Sonstiger Transport')
];
export const countries = 'AL AD AT BA BE BG BY CH CY CZ DE DK EE ES FI FR GB GR HR HU IE IS IT LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS RU SE SI SK SM TR UA VA XK'.split(' ');
export const grouping = {car:'vehicle',motorcycle:'vehicle',van:'vehicle',pallet:'pallet',cargo:'general',furniture:'moving',moving:'moving',machinery:'machinery',express:'general',nonRunning:'vehicle',partial:'general',full:'general',other:'general'};
export const yn = [option('yes','Da','Yes','Ja'),option('no','Ne','No','Nein')];
const yesNo = (key,labels,required=true) => field(key,labels,'select',required,yn);
const notes = (key,labels) => field(key,labels,'textarea',false);
const integer = (key,labels) => field(key,labels,'integer');
const positive = (key,labels) => field(key,labels,'number');
const dimensions = [
 positive('lengthCm',['Dolžina (cm)','Length (cm)','Länge (cm)']),
 positive('widthCm',['Širina (cm)','Width (cm)','Breite (cm)']),
 positive('heightCm',['Višina (cm)','Height (cm)','Höhe (cm)'])
];
const weight = positive('totalWeightKg',['Skupna masa (kg)','Total weight (kg)','Gesamtgewicht (kg)']);
const loading = yesNo('loadingAssistance',['Potrebna pomoč pri nakladanju','Loading assistance required','Verladehilfe erforderlich']);
const stackable = yesNo('stackable',['Možnost zlaganja','Stackable','Stapelbar']);
const additional = notes('cargoNotes',['Dodatni podatki o tovoru','Additional cargo details','Weitere Angaben zur Ladung']);
export const transport = field('transportCategory',['Vrsta prevoza','Transport type','Transportart'],'select',true,types);
export const location = prefix => [
 field(prefix+'Country',['Država','Country','Land'],'country'),
 field(prefix+'City',['Kraj','City','Ort']),
 field(prefix+'Postal',['Poštna številka','Postal code','Postleitzahl']),
 field(prefix+'Address',['Naslov','Address','Adresse'],'text',false),
 field(prefix+'SiteType',['Vrsta lokacije','Location type','Standorttyp'],'select',true,[
  option('residential','Stanovanjska','Residential','Wohnadresse'),option('commercial','Poslovna','Commercial','Geschäftsadresse')])
];
export const cargo = {
 general:[
  field('description',['Opis tovora','Cargo description','Ladungsbeschreibung'],'textarea'),
  stackable,yesNo('fragile',['Krhek tovor','Fragile cargo','Zerbrechliche Güter']),loading,
  yesNo('loadingEquipmentAvailable',['Na voljo oprema za nakladanje','Loading equipment available','Verladeausrüstung verfügbar']),
  yesNo('tailLift',['Potrebna dvižna ploščad','Tail lift required','Ladebordwand erforderlich']),
  yesNo('unloadingAssistance',['Potrebna pomoč pri razkladanju','Unloading assistance required','Entladehilfe erforderlich']),additional
 ],
 pallet:[
  field('palletType',['Tip palete','Pallet type','Palettentyp'],'select',true,[
   option('eur','Evropaleta','Euro pallet','Europalette'),option('industrial','Industrijska','Industrial','Industriepalette'),option('other','Druga','Other','Sonstige')]),
  stackable,yesNo('loadingEquipmentAvailable',['Na voljo oprema za nakladanje','Loading equipment available','Verladeausrüstung verfügbar']),
  yesNo('unloadingEquipmentAvailable',['Na dostavi je na voljo oprema za razkladanje','Unloading equipment is available at delivery','Am Ziel ist Entladeausrüstung vorhanden'],false),
  yesNo('tailLift',['Potrebna dvižna ploščad','Tail lift required','Ladebordwand erforderlich'])
 ],
 vehicle:[
  field('make',['Znamka vozila','Vehicle make','Fahrzeugmarke']),
  field('model',['Model vozila','Vehicle model','Fahrzeugmodell']),
  field('year',['Letnik','Production year','Baujahr'],'year'),
  field('vehicleType',['Tip vozila','Vehicle type','Fahrzeugtyp'],'select',true,types.slice(0,3)),
  ...dimensions.map(item=>({...item,required:false})),
  yesNo('rolls',['Vozilo se lahko kotali','Vehicle can roll','Fahrzeug ist rollfähig']),
  yesNo('steers',['Krmiljenje deluje','Steering works','Lenkung funktioniert']),
  yesNo('brakes',['Zavore delujejo','Brakes work','Bremsen funktionieren']),
  notes('vehicleLoading',['Posebne zahteve za nakladanje','Additional loading requirements','Besondere Verladeanforderungen']),
  yesNo('running',['Vozilo je vozno','Vehicle runs','Fahrbereit']),
  notes('damage',['Poškodbe vozila','Vehicle damage','Fahrzeugschäden']),
  field('preference',['Način prevoza','Transport preference','Bevorzugte Transportart'],'select',true,[
   option('open','Odprt','Open','Offen'),option('enclosed','Zaprt','Enclosed','Geschlossen'),option('any','Brez preference','No preference','Keine Präferenz')]),
  integer('vehicleCount',['Število vozil','Number of vehicles','Fahrzeuganzahl'])
 ],
 moving:[
  field('propertyType',['Vrsta objekta','Property type','Gebäudeart']),
  positive('volumeM3',['Ocenjen volumen (m³)','Estimated volume (m³)','Geschätztes Volumen (m³)']),
  integer('itemCount',['Število kosov ali škatel','Number of items or boxes','Anzahl der Stücke oder Kartons']),
  field('floor',['Nadstropje pri prevzemu (0 za pritličje)','Pickup floor (0 for ground floor)','Etage bei der Abholung (0 für Erdgeschoss)'],'floor'),
  yesNo('elevator',['Dvigalo pri prevzemu','Elevator at pickup','Aufzug bei der Abholung']),loading,
  yesNo('pickupCarryingHelp',['Potrebna pomoč pri nošenju ob prevzemu','Carrying help needed at pickup','Tragehilfe bei der Abholung erforderlich'],false),
  field('deliveryFloor',['Nadstropje dostave','Delivery floor','Etage am Ziel'],'floor'),
  yesNo('deliveryElevator',['Dvigalo na dostavi','Elevator at delivery','Aufzug am Ziel']),
  yesNo('deliveryCarryingHelp',['Potrebna pomoč pri nošenju ob dostavi','Carrying help needed at delivery','Tragehilfe am Ziel erforderlich'],false),
  yesNo('packing',['Potrebno pakiranje','Packing required','Verpackung benötigt']),
  yesNo('assembly',['Potrebno sestavljanje','Assembly required','Montage benötigt']),
  yesNo('disassembly',['Potrebno razstavljanje','Disassembly required','Demontage erforderlich']),additional
 ],
 machinery:[field('machineryType',['Vrsta stroja','Machinery type','Maschinentyp']),...dimensions,weight,
  field('equipmentNeeds',['Potrebna oprema za nakladanje','Loading equipment requirements','Benötigte Verladeausrüstung'],'textarea'),
  notes('specialHandling',['Posebne zahteve za ravnanje','Special handling requirements','Besondere Handhabungsanforderungen']),additional]
};
export const cargoItem = [
 integer('quantity',['Količina','Quantity','Menge']),
 field('dimensionUnit',['Enota mer','Dimensions unit','Maßeinheit'],'select',true,[
  option('cm','Centimetri','Centimeters','Zentimeter'),option('m','Metri','Meters','Meter')]),
 ...dimensions.map((item,index)=>({...item,key:['length','width','height'][index],
  labels:item.labels.map(label=>label.replace(' (cm)',''))})),
 positive('unitWeightKg',['Masa na kos (kg)','Weight per item (kg)','Gewicht je Stück (kg)'])
];
export const oversized = yesNo('oversized',['Izredne mere ali masa','Oversized or overweight cargo','Übermaße oder Übergewicht']);
export const regulated = field('regulated',['Nevaren ali reguliran tovor','Hazardous or regulated cargo','Gefährliche oder regulierte Güter'],'select',true,yn);
export const schedule = [
 field('pickupDate',['Želeni datum prevzema','Preferred pickup date','Gewünschtes Abholdatum'],'date',false),
 field('deliveryDate',['Želeni datum dostave','Preferred delivery date','Gewünschtes Lieferdatum'],'date',false),
 field('flexible',['Prilagodljivi datumi','Flexible dates','Flexible Termine'],'checkbox',false),
 field('urgent',['Nujni prevoz','Urgent transport','Dringender Transport'],'checkbox',false),
 notes('scheduleNotes',['Dodatne zahteve glede terminov','Scheduling requirements','Weitere Terminanforderungen'])
];
const email = field('email',['E-pošta','Email','E-Mail'],'email');
const phone = field('phone',['Telefon z mednarodno predpono','Telephone with international prefix','Telefon mit internationaler Vorwahl'],'tel');
const company = field('company',['Naziv podjetja','Company name','Firmenname']);
const vat = field('vat',['Identifikacijska številka za DDV','VAT number','Umsatzsteuer-ID'],'text',false);
export const companyFields = [company,vat,
 field('businessPattern',['Pogostost prevozov','Transport frequency','Transporthäufigkeit'],'select',false,[
  option('once','Enkratno','One-time','Einmalig'),option('recurring','Redno','Recurring','Regelmäßig')])
];
export const recurringFields = [
 notes('frequency',['Pričakovana pogostost','Expected frequency','Erwartete Häufigkeit']),
 notes('typicalCargo',['Običajni tovor','Typical cargo','Typische Ladung']),
 notes('typicalRoutes',['Običajne relacije','Typical routes','Typische Strecken']),
 notes('monthlyVolume',['Ocenjena mesečna količina','Estimated monthly volume','Geschätztes Monatsvolumen'])
];
export const customer = [
 field('customerType',['Vrsta stranke','Customer type','Kundentyp'],'select',true,[
  option('private','Fizična oseba','Private customer','Privatkunde'),option('business','Podjetje','Business customer','Geschäftskunde')]),
 field('name',['Ime in priimek','Full name','Vor- und Nachname']),email,phone,
 field('contactMethod',['Želeni način stika','Preferred contact method','Bevorzugte Kontaktart'],'select',true,[
  option('email','E-pošta','Email','E-Mail'),option('phone','Telefon','Telephone','Telefon')]),
 notes('comments',['Dodatne opombe','Additional comments','Weitere Anmerkungen'])
];
export const partner = [
 company,field('country',['Država','Country','Land'],'country'),
 field('contact',['Kontaktna oseba','Contact person','Ansprechperson']),email,phone,vat,
 field('registration',['Matična številka','Company registration number','Registernummer']),
 notes('cargoDimensions',['Podprte mere tovora','Supported cargo dimensions','Unterstützte Ladungsmaße']),
 notes('coverageType',['Domači ali mednarodni prevozi','Domestic or international coverage','Nationale oder internationale Abdeckung']),
 notes('cooperation',['Želeni način sodelovanja','Preferred cooperation model','Bevorzugtes Kooperationsmodell']),
 field('vehicleTypes',['Tipi vozil','Vehicle types','Fahrzeugtypen']),
 field('capacity',['Prevozne zmogljivosti','Transport capacity','Transportkapazität']),
 field('coverage',['Države in regije','Countries and regions covered','Bediente Länder und Regionen']),
 field('categories',['Vrste prevozov','Transport service categories','Transportarten'],'textarea'),
 field('insurance',['Podatki o zavarovanju','Insurance information','Versicherungsangaben'],'textarea'),
 notes('licenses',['Licence, kjer so potrebne','Relevant licences, where applicable','Erforderliche Genehmigungen, soweit zutreffend']),
 notes('comments',['Dodatne informacije','Additional information','Weitere Angaben'])
];
export const consents = [
 field('privacy',['Prebral/-a sem politiko zasebnosti.','I have read the privacy policy.','Ich habe die Datenschutzerklärung gelesen.'],'checkbox'),
 field('marketing',['Želim prejemati tržna obvestila.','I agree to receive marketing communications.','Ich möchte Marketingmitteilungen erhalten.'],'checkbox',false)
];
