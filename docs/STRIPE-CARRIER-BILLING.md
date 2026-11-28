# Stripe Live za naročnine prevoznikov

Ta integracija velja za odobrene prevoznike na `https://dz-transport.eu`. Registracija in paket Free ostajata brezplačna. Basic stane 19,00 € na mesec, Pro pa 49,90 € na mesec. Stopnje provizije so 10 %, 7 % in 5 %. Pogoji novega prevoza uporabljajo stopnjo ob dokončni potrditvi. Obstoječe obračunane postavke se ohranijo. Dosedanje ročne dodelitve paketov ostanejo v zgodovini in nimajo vpliva na nove obračune.

Portal prevoznika odpre Stripe Checkout. Veljavnost paketa potrdi plačan začetni ali obnovitveni račun, prebran s Stripe API-ja. Za neuspešno obnovo ni podaljšanja. Ob preklicu na koncu obdobja plačane ugodnosti veljajo do izteka. Stripe Customer Portal omogoča račune, spremembo plačilnega sredstva in preklic ob koncu obdobja. Menjava paketa znotraj naročnine je izključena. Prevoznik lahko po izteku kupi drug paket.

## Cloudflare Pages Production

Uporabi namenski projekt DZ Transport in produkcijsko okolje za `dz-transport.eu`. Nakup je mogoč samo v načinu `DZ_SITE_MODE=production`. Portal prevoznika potrebuje obstoječe nastavitve `PUBLIC_DZ_PORTAL=true`, `PUBLIC_DZ_PARTNER=true`, javne Supabase nastavitve in `BASE_PATH=/`. Skrbniško preverjanje zahteva tudi `PUBLIC_DZ_MANAGER=true`. Skrivnosti vnesi neposredno v Cloudflare.

Produkcijska gradnja še vedno zahteva potrjene pravne nastavitve v `config/site.json` in konfigurirane poti obrazcev. Uporabi [obstoječi seznam za javni zagon](./PRODUCTION-READINESS.md) in izpolni dejanske odločitve. Predogled se lahko zgradi z izključenim nakupom.

| Vrsta | Ime | Vrednost |
| --- | --- | --- |
| Secret | `DZ_STRIPE_BILLING_API_KEY` | Stripe Live ključ računa DZ Transport (`rk_live_…` z ustreznimi pravicami ali `sk_live_…`) |
| Secret | `DZ_STRIPE_BILLING_WEBHOOK_SECRET` | Podpisna skrivnost `whsec_…` destinacije **DZ Transport Billing – Live** |
| Text | `DZ_STRIPE_BILLING_ACCOUNT_ID` | `acct_…` namenskega Live računa, potrjen neodvisno od ključa |
| Text | `DZ_STRIPE_BILLING_BASIC_PRICE_ID` | `price_1UgoRjLP0d1wngzHgpVmIeco` |
| Text | `DZ_STRIPE_BILLING_PRO_PRICE_ID` | `price_1UgoTHLP0d1wngzHEPAhJuL7` |
| Text | `DZ_STRIPE_BILLING_PORTAL_ID` | `bpc_…` namenske Live konfiguracije DZ Transport |
| Text | `DZ_STRIPE_BILLING_TAX_BEHAVIOR` | `inclusive` ali `exclusive`, po potrditvi dejanskega obračuna DDV |
| Text | `DZ_STRIPE_BILLING_PURCHASE_ENABLED` | `false` ob objavi. `true` po uspešnem preverjanju. |

Funkcije uporabijo obstoječe `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` in `SUPABASE_SECRET_KEY`. Omejen Stripe ključ potrebuje branje računa, cen, Stripe Tax Settings, naročnin in računov, branje in ustvarjanje Customers ter Checkout Sessions ter branje konfiguracije in ustvarjanje sej Customer Portal. Preveri pravice z gumbom za diagnostiko pred preklopom. Prva dejanska seja preveri še dovoljenja za pisanje.

Pri obeh cenah preveri `livemode=true`, `active=true`, `EUR`, en mesečni interval, enotno ceno brez porabe ter znesek 1900 oziroma 4990 centov. Preverjanje DDV upošteva izrecno nastavitev cene oziroma potrjeno privzeto nastavitev Stripe Tax. V Live računu preveri aktivne davčne registracije in davčno obravnavo naročnin. Če ponudnik zahteva DDV, morajo javni prikaz, Checkout in račun uporabljati isto pravilo. Drugega Stripe računa ali njegovega cenika ne uporabljaj za odpravljanje neskladja.

## Vrstni red objave

1. Po združitvi uporabi Supabase migracijo `202611280013_carrier_billing.sql`. Pred gradnjo z migracijo preveri, kateri odobreni prevozniki imajo ročno dodeljen Basic ali Pro, da jim lahko pojasniš prehod na Free. Stare provizije ostanejo pri prvotni stopnji.
2. Objavi Cloudflare gradnjo z `DZ_STRIPE_BILLING_PURCHASE_ENABLED=false`. Poti `POST /api/stripe/billing` in `POST /api/stripe/billing-webhook` sta namenjeni izključno `dz-transport.eu`.
3. V pravem Stripe Live računu pripravi namenski Customer Portal `bpc_…`. Nastavi privzeti povratni URL na `https://dz-transport.eu`. Vključi zgodovino računov, posodobitev plačilnih sredstev in preklic na koncu obdobja. Izključi menjavo paketa in promocije ob preklicu. Poveži pravne strani DZ Transport in potrdi prikaz izdajatelja na računih. Dodeli konfiguracijo samo DZ Transport.
4. Dokončaj Stripe Live destinacijo **DZ Transport Billing – Live**, obseg **Your account**, **Snapshot**, API **2025-01-27.acacia**, naslov `https://dz-transport.eu/api/stripe/billing-webhook`. Izberi `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.created`, `customer.subscription.updated` in `customer.subscription.deleted`. Vnesi obe skrivnosti in ostale nastavitve, stikalo pa pusti na `false`. Ponovno objavi.
5. Vpiši se v skrbniški panel DZ Transport z MFA in izberi **Preveri Stripe Billing Live**. Dejanje uporablja samo bralne Stripe API klice. Zabeleži rezultat za obe ceni in davčno nastavitev. Ob napaki pusti stikalo izključeno. Preveri, da odobren prevoznik vidi pakete brez gumba za nakup, in preveri dejanski odziv webhooka z ukazom spodaj.
6. Pred vklopom preveri, ali je Stripe dostavil podpisan Live dogodek na pravi endpoint. HTTP 204 za nepovezan, veljavno podpisan dogodek potrdi sprejem dogodka. Tok plačane naročnine potrdi šele podpisan dogodek za naročnino DZ Transport in primerjava stanja v Stripe, Supabase ter portalu. Če takega dogodka ali prvega nakupa še ni, v zapisniku označi, da še ni preverjen. Ne ustvarjaj plačljive naročnine brez odobritve.
7. Po potrditvi spremeni `DZ_STRIPE_BILLING_PURCHASE_ENABLED=true` in ponovno objavi. Za ustavitev novih Checkoutov spremeni vrednost na `false` in ponovno objavi. Prej izdane odprte povezave lahko še delujejo do izteka. Če mora ustavitev veljati takoj, v Stripe poišči in zapri samo odprte Checkout Sessions DZ Transport. Webhook in Customer Portal ohrani za obstoječe naročnine.

```sh
curl -sS -o /dev/null -w '%{http_code}\n' \
  -X POST -H 'Content-Type: application/json' -d '{}' \
  https://dz-transport.eu/api/stripe/billing-webhook
```

Po nastavitvi skrivnosti pričakuj `400` za nepodpisano zahtevo. `503` pred nastavitvijo pomeni, da podpisna skrivnost manjka ali je neveljavne oblike. Odziv `400` potrdi dostop do funkcije in obveznost podpisa. Veljavnost skrivnosti potrdi podpisan dogodek v Stripe Workbench.

## Usklajevanje

Ponovni klik uporabi isti Stripe Customer in isto rezervacijo Checkouta. Če je zahteva ob nastanku Customerja izpadla in je poteklo varno obdobje ponavljanja, funkcija poskuša najti izvirni zapis prek metapodatkov. Če Stripe ne more enolično potrditi zapisa, pregled opravi skrbnik. Podobno po izteku rezervacije pred novim Checkoutom funkcija preveri stanje prejšnje seje in naročnin pri Stripe. Dogodke s stanjem 503 po odpravi napake ponovi iz Stripe Workbench.

V8 Stripe Connect, plačila prevozov in izplačila še naprej uporabljajo obstoječe testne ključe in poti. Ta postopek nima korakov za spremembe DZ Auto Trade. Pred aktivacijo potrdi ponudnika, davčno obravnavo, vsebino računov, pogoje naročnine in hrambo naročniške evidence. Pri brisanju profila z zgodovino naročnin se evidenca najprej pregleda po računovodskem in pravnem postopku.
