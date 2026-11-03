# LockedIn 🔒

Sportapp om elkaar accountable te houden. Web-app (PWA): openen via een link en op je beginscherm zetten.

**Functies:** trainingen loggen (hardlopen, kracht, overig) met optionele foto · persoonlijk weekdoel · punten per minuut met bonussen (weekdoel, streak, PR, groepsbonus) · ranglijst · feed met kudos en reacties · uitnodigingslink · meerdere challenges na elkaar.

Stack: React + Vite · Supabase (database, login, foto-opslag) · Vercel (hosting).

---

## Installatie (eenmalig)

### 1. Supabase
1. Maak in [supabase.com](https://supabase.com) een nieuw project aan (regio: *West EU*).
2. Ga naar **SQL Editor → New query**, plak de inhoud van [`supabase/schema.sql`](supabase/schema.sql) en klik op **Run**.
3. Ga naar **Authentication → Emails → Magic Link** en vervang de template door:
   ```html
   <h2>Inloggen bij De touwtjes in handen</h2>
   <p><a href="{{ .ConfirmationURL }}">Klik hier om in te loggen</a></p>
   <p>Of vul deze code in de app in: <b>{{ .Token }}</b></p>
   ```
   *(De code is nodig op de iPhone: een link uit de mail opent in Safari, niet in de app op je beginscherm.)*
4. Ga naar **Project Settings → API** en kopieer de **Project URL** en de **anon public key**.

### 2. Vercel
1. Ga naar **Add New → Project** en importeer deze GitHub-repository. Vercel herkent Vite automatisch.
2. Zet onder **Environment Variables**:
   - `VITE_SUPABASE_URL` = de Project URL
   - `VITE_SUPABASE_ANON_KEY` = de anon key
3. Klik op **Deploy** en noteer de URL, bijvoorbeeld `https://touwtjesinhanden.vercel.app`.

### 3. Supabase koppelen aan de URL
In Supabase, onder **Authentication → URL Configuration**:
- **Site URL** = je Vercel-URL
- **Redirect URLs** = `https://<jouw-url>/**`

### 4. Starten
Open de app, log in, maak de groep aan en deel via **Groep → Deel uitnodigingslink** de link in de groepsapp.

> **Let op met e-mail:** de ingebouwde mailserver van Supabase verstuurt maar een paar mails per uur. Voor 5 mensen is dat meestal genoeg. Loopt het vast, koppel dan een gratis SMTP-dienst (bijvoorbeeld Resend) onder **Authentication → SMTP Settings**.

## App op je beginscherm
- **iPhone:** open de link in Safari → deelknop → *Zet op beginscherm*
- **Android:** open de link in Chrome → menu → *App installeren*

## Online zetten
Elke push naar `main` wordt automatisch door Vercel online gezet. Laat de repository openbaar: bij een privé
repository blokkeert het gratis Vercel-abonnement wijzigingen die niet van de eigenaar van het project komen.

## Lokaal ontwikkelen
```bash
cp .env.example .env   # vul je Supabase-gegevens in
npm install
npm run dev
```

## Puntenregels aanpassen
Alle regels staan bovenaan in [`src/points.ts`](src/points.ts) (`RULES`). Punten worden live berekend, dus een aanpassing geldt meteen ook voor eerdere weken.
