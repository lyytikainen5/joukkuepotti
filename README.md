# Joukkuepotti

Suomenkielinen verkkosovellus harrastejoukkueen kulujen jakamiseen. Tämä on ensimmäinen kehitysversio, ei vielä valmis kaupallinen palvelu.

## Mitä toimii

- Joukkueen luonti (yksi joukkue per käyttäjä tässä versiossa).
- Pelaajien lisääminen, nimen muokkaus, arkistointi ja palautus.
- Kulujen lisääminen, muokkaus ja poisto.
- Tasajako valituille osallistujille kokonaisina sentteinä. Ylijäävät sentit jaetaan osallistujalistan järjestyksessä.
- Joukkueen yhteenveto ja pelaajakohtaiset kuluosuudet.
- Supabase-tilillä sähköposti–salasana-kirjautuminen, rekisteröinti ja salasanan palautus.
- Supabase-tallennuksen sovellusliitäntä, SQL-migraatio ja omistajakohtaiset käyttöoikeudet.
- Päällekkäisten kulumuokkausten tunnistus revisionumerolla.

**Ilman tietokanta-asetuksia sovellus on esittelytila:** siinä on esimerkkidata ja muutokset häviävät sivun päivityksessä. Tämä tila ei tallenna oikeita tuotetietoja selaimeen.

GitHub-yhteys ja käyttäjän oma Supabase-projekti eivät ole vielä yhdistettyjä. SQL ja käyttöoikeudet on testattu paikallisella PostgreSQL-moottorilla (PGlite), ei käyttäjän tuotantoprojektissa. Kirjautumisen sähköpostitoimitusta, selaimen käyttöliittymää ja ulkoista tietokantayhteyttä ei ole päästä päähän testattu.

## Käynnistä omalla koneella

Asenna Node.js 22.13 tai uudempi, avaa tämä kansio VS Codessa ja suorita:

```sh
npm ci
npm run dev:next
```

Avaa http://localhost:3000. Aluksi saat esittelytilan. Tavallinen Next.js toimii itsenäisesti; ChatGPT-tiliä ei tarvita oman palvelimen versiossa.

## Ota käyttöön oma Supabase

1. Luo oma Supabase-projekti omalle tilillesi.
2. Aja tiedosto `supabase/migrations/202609080001_initial.sql` uuden projektin SQL-editorissa. Migraatio luo taulut, käyttöoikeudet ja atomiset kulutoiminnot. Aja se vain kerran; tee tulevat muutokset uusina migraatioina.
3. Kopioi `.env.example` tiedostoksi `.env.local`.
4. Täytä projektin URL ja **publishable key** näihin muuttujiin:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://oma-projekti.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=projektin-julkinen-publishable-avain
```

Älä käytä service_role-/secret-avainta tai tietokannan salasanaa. `.env.local` ei kuulu Gitiin.

5. Supabase Authin URL-asetuksissa: määritä Site URL ja sallitut paluuosoitteet. Kehityksessä käytä `http://localhost:3000`, tuotannossa omaa HTTPS-osoitetta. Pidä sähköpostin vahvistus käytössä. Aseta tuotantoon oma SMTP-palvelu ja testaa vahvistus- sekä palautusviestit.
6. Käynnistä sovellus uudelleen, rekisteröidy ja vahvista sähköpostisi. Luo joukkue ja lisää pelaajat.
7. Testaa kahdella omalla testitilillä, etteivät joukkueet näe toistensa tietoja. Varmista myös tietojen säilyminen sivun päivityksessä ja toisella laitteella.

`NEXT_PUBLIC_*`-arvot sisältyvät selaimelle toimitettavaan koodiin. Niiden muuttamisen jälkeen tuotantoversio täytyy rakentaa uudelleen.

## Testit ja oma julkaisu

```sh
npm run test:product
npm run typecheck
npm run build:next
npm run start:next
```

`tests/product/money.test.ts` tarkistaa senttijaon, syötteet ja arkistoitujen pelaajien historian. `tests/product/database.test.ts` ajaa varsinaisen SQL-migraation PGlitessa ja tarkistaa käyttäjärajat, luvattomat kirjoitukset, atomiset muutokset sekä versioristiriidat. Testi käyttää erillistä muistissa olevaa tietokantaa; se ei koske tuotantotietoihin.

Tavallisen Next.js-julkaisun voi tehdä Node-palvelimelle. Repo sisältää myös aiemman Sites-esikatselun Vinext/Cloudflare-sovittimen. Sen `dev`, `build` ja `start` ovat erillisiä Sites-komentoja; omaan palvelimeen käytä yllä olevia `:next`-komentoja. Sovelluksen liiketoimintalogiikka ja kirjautuminen eivät käytä ChatGPT:n käyttäjätietoja.

## Mistä muokataan

| Asia                         | Tiedosto                                   |
| ---------------------------- | ------------------------------------------ |
| Sivun aloitus                | `app/page.tsx`                             |
| Värit ja ulkoasu             | `app/globals.css`                          |
| Sovelluksen näkymät          | `components/joukkuepotti/app.tsx`          |
| Kululomake                   | `components/joukkuepotti/expense-form.tsx` |
| Kirjautuminen                | `components/joukkuepotti/auth.tsx`         |
| Tietotyypit ja kululaskenta  | `lib/joukkuepotti/model.ts`                |
| Supabase-yhteys              | `lib/joukkuepotti/supabase.ts`             |
| Tietokanta ja käyttöoikeudet | `supabase/migrations/`                     |

## GitHub omalle tilille

Luo GitHubissa **tyhjä yksityinen** repositorio `joukkuepotti`. Olemassa olevan projektin tiedostoja ei pidä korvata. Kun käytössä on oma GitHub-yhteys, koodi voidaan siirtää sinne. Ladatusta lähdekoodipaketista voit tehdä ensimmäisen siirron näin:

```sh
git init -b main
git add .
git commit -m "Joukkuepotin ensimmäinen versio"
git remote add origin https://github.com/OMA-KAYTTAJANIMI/joukkuepotti.git
git push -u origin main
```

Kirjaudu GitHubin normaalia kirjautumisreittiä käyttäen. Älä lisää tunnuksia tai tokeneita koodiin tai etärepositorion osoitteeseen.

## Rajaukset ja seuraava vaihe

- Tässä versiossa joukkueen omistaja hallitsee tietoja. Pelaajilla ei vielä ole omia tunnuksia, kutsulinkkejä tai pääsyä joukkueeseen.
- Maksuliikennettä, avoimien maksujen kirjanpitoa, verkkolaskuja tai palvelun omaa tilausmaksua ei ole toteutettu.
- Seuraava vaihe on oma GitHub-yhteys, Supabase-projektin kytkentä ja päästä päähän tehtävä käyttäjätesti. Näiden jälkeen voidaan tehdä pelaajien kutsuminen tai muu seuraava sovittu ominaisuus.
- Ennen oikeita asiakkaita tarvitaan vielä tuotannon varmuuskopioiden ja palautuksen testaus sekä käyttäjätietojen poistoprosessi.
- Projektilla ei ole tarkoituksella julkista avoimen lähdekoodin lisenssiä. Riippuvuuksien omat lisenssit ovat edelleen voimassa.

Viralliset ohjeet: https://nextjs.org/docs/app/guides/self-hosting ja https://supabase.com/docs/guides/auth
