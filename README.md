# Andrum – bokningssystem för yoga och behandlingar

Kunder bokar drop-in-pass, hela kurser (t.ex. 7 veckor) och behandlingar, betalar med Swish eller kort och får bekräftelse, kalenderfil och påminnelser per mejl. Studion sköter allt i en mobilvänlig adminpanel. Byggt för flera studios från dag 1.

**Tjänster som används:** Vercel (appen), Supabase (databas), Stripe (betalning), Resend (mejl). Kundens hemsida ligger kvar på ONE.com.

---

## Installation – steg för steg (ca 45 minuter)

Gör stegen i ordning. Spara alla nycklar du kopierar i en anteckning medan du jobbar.

### 1. Supabase – databasen

1. Skapa konto på [supabase.com](https://supabase.com) → **New project**. Välj en region i EU (Stockholm eller Frankfurt). Spara databaslösenordet.
2. När projektet är klart: vänstermenyn → **SQL Editor** → **New query**.
3. Öppna filen `supabase/schema.sql` i det här projektet, kopiera **hela** innehållet, klistra in och tryck **Run**. Det ska stå *Success*.
4. Vänstermenyn → **Database → Extensions**: kontrollera att **pg_cron** och **pg_net** är påslagna (sök på namnen). Om inte: slå på dem och kör `schema.sql` en gång till.
5. **Project Settings → API**: kopiera **Project URL** och nyckeln **service_role** (klicka *Reveal*). Dela aldrig service_role-nyckeln.

### 2. Resend – mejlen

1. Skapa konto på [resend.com](https://resend.com).
2. **Domains → Add domain**. Använd en domän du äger, t.ex. kundens domän (`hennesdoman.se`) eller din egen.
3. Resend visar några DNS-rader (TXT och MX). Logga in på ONE.com → domänen → **DNS-inställningar** och lägg till raderna exakt som de står. Tryck **Verify** i Resend (det kan ta upp till en timme).
4. **API Keys → Create API key** (Full access). Kopiera nyckeln.
5. Bestäm avsändaradress, t.ex. `bokning@hennesdoman.se`.

### 3. Stripe – betalningen

1. Skapa konto på [stripe.com](https://stripe.com) (det här är *ditt* plattformskonto).
2. Se till att **Test mode** är på (reglaget uppe till höger) – vi testar först.
3. Gå till **Connect → Get started** och välj att du bygger en plattform. Fyll i plattformsprofilen.
4. **Developers → API keys**: kopiera **Secret key** (börjar med `sk_test_`).

Du behöver **inte** skapa någon webhook – appen gör det själv.

### 4. GitHub + Vercel – appen

1. Lägg projektet i ett **privat** repo på GitHub (eller be Claude göra det åt dig).
2. Logga in på [vercel.com](https://vercel.com) med GitHub → **Add New → Project** → välj repot → **Import**.
3. Öppna **Environment Variables** och lägg in (se `.env.example`):

| Namn | Värde |
| --- | --- |
| `SUPABASE_URL` | Project URL från steg 1 |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role-nyckeln från steg 1 |
| `STRIPE_SECRET_KEY` | `sk_test_…` från steg 3 |
| `RESEND_API_KEY` | från steg 2 |
| `EMAIL_FROM` | t.ex. `bokning@hennesdoman.se` |
| `SUPERADMIN_EMAILS` | din egen e-post |

4. Tryck **Deploy**. Appen hittar själv sin adress på Vercel.

### 5. Första inloggningen

1. Gå till `https://<din-adress>/admin` och logga in med din e-post. Du får en länk i mejlen.
2. Fyll i studions namn och **kundens e-post som ägare** → Skapa studio.
3. Gå till **System** i menyn. Sidan installerar automatiken (påminnelser, väntelista) och Stripe-webhooken av sig själv. Allt ska bli gröna bockar inom 10 minuter.

### 6. Kunden tar över

Kunden går till `/admin`, loggar in med sin e-post och följer rutan **Kom igång** på startsidan:

1. **Inställningar → Betalning → Koppla Stripe.** Hon fyller i sina uppgifter hos Stripe (organisationsnummer, bank, BankID). Efteråt: i hennes Stripe-konto, **Settings → Payment methods → Swish → Turn on**.
2. **Inställningar → Studions uppgifter:** adress, e-post, org.nr, färg, logga.
3. **Mallar:** justera de tre färdiga mallarna (yoga, kurs, behandling) eller skapa egna.
4. **+ Kurs:** välj mall, startdatum och tid → klart. Kursen syns direkt på bokningssidan.

### 7. Länka från hemsidan på ONE.com

Under **Inställningar → Dela bokningssidan** finns länken och en färdig knappkod. I ONE.com:s sajtbyggare: lägg till ett HTML-block och klistra in knappkoden.

**Egen adress (valfritt), t.ex. `boka.hennesdoman.se`:**

1. Vercel → projektet → **Settings → Domains → Add** → skriv `boka.hennesdoman.se`.
2. ONE.com → DNS-inställningar → lägg till **CNAME**: namn `boka`, värde `cname.vercel-dns.com`.
3. I adminpanelen → **System** → studion → **Egen domän**: `boka.hennesdoman.se` → Spara.

### 8. Testa – och gå live

**Testa i testläge:** boka en kurs på bokningssidan och betala med kortet `4242 4242 4242 4242` (valfritt framtida datum och CVC). Kontrollera mejlet, avboka via länken och se att återbetalningen syns.

**Gå live:**

1. Stripe: stäng av Test mode → **Developers → API keys** → kopiera `sk_live_…`.
2. Vercel: byt `STRIPE_SECRET_KEY` till live-nyckeln → **Redeploy**.
3. Öppna **System** i adminpanelen – den skapar live-webhooken automatiskt.
4. Kunden trycker **Koppla Stripe** en gång till (test- och live-konton är separata hos Stripe) och slår på Swish.

---

## Vad systemet gör automatiskt

- Platsen hålls i 30 minuter medan kunden betalar och släpps om betalningen avbryts.
- Två saker kan aldrig ligga på samma tid i lokalen – databasen stoppar det, inklusive pauser mellan behandlingar.
- Påminnelse före varje pass (även varje kurstillfälle).
- Avbokning via länk i mejlet enligt studions regler: pengar tillbaka (Swish och kort) eller tillgodo.
- Väntelista: när en plats blir ledig får nästa i kön ett mejl och platsen reserveras en stund åt henne.
- Ställer studion in ett pass får alla deltagare mejl och pengarna tillbaka med ett klick.
- Kalenderfil (.ics) i varje bekräftelse.
- Mejl som misslyckas skickas igen. Systemsidan visar om något är fel.

## Projektstruktur

```
supabase/schema.sql      Databasen (tabeller, krockskydd, bokningsfunktioner, schemaläggning)
src/lib/                 All logik: bokning, betalning, mejl, väntelista, påminnelser
src/app/s/[slug]/        Den publika bokningssidan
src/app/admin/           Adminpanelen
src/app/api/             Betalningshändelser, schemalagda jobb, kalenderfiler
tests/logic.test.ts      Tester för tider, sommartid, regler, kalenderfiler och belopp
```

## Felsökning

| Problem | Lösning |
| --- | --- |
| Inloggningsmejlet kommer inte | Kontrollera att domänen är verifierad i Resend och att `EMAIL_FROM` använder den domänen. |
| "Studion kan inte ta emot betalningar" | Studion har inte slutfört Stripe-kopplingen. Inställningar → Betalning. |
| Påminnelser skickas inte | System-sidan visar när automatiken senast körde. Kontrollera pg_cron och pg_net i Supabase. |
| Något annat | Öppna System-sidan – den visar vad som saknas och hur man fixar det. |
