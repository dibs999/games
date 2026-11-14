# Games

Denkspiele auf Deutsch für Familie und Freunde, ganz ohne Anmeldung: Seite öffnen, Profil wählen, spielen.
Spielstände und Statistiken liegen im Profil und sind auf allen Geräten gleich.

**https://dibs999.github.io/games/**

## Die Spiele

- **Wordle** – Errate das deutsche Wort mit fünf Buchstaben in sechs Versuchen.
  - **Tagesrätsel:** ein Wort pro Tag, für alle gleich, neu um Mitternacht (deutsche Zeit).
  - **Endlos:** beliebig viele zufällige Wörter mit eigener Statistik.
  - **Extrem:** vier richtig schwere Varianten – 😈 Teufel, 🤥 Lügner, 🙈 Blind, 🎯 Mastermind.
  - **Blitz:** 2 Minuten, so viele Wörter wie möglich. Jedes gelöste Wort bringt Punkte und Extrazeit
    (je weniger Versuche, desto mehr), dazu Kombo-Bonus für Wörter in Folge.
  - QWERTZ-Tastatur mit Ä, Ö, Ü (ß wird als SS geschrieben), Ergebnis teilen.
- **Sudoku** – Leicht, Mittel und Schwer, dazu ein Tagesrätsel (Mo–Di leicht, Mi–Fr mittel, Sa–So schwer).
  - Notizen, Zurück, Fehleranzeige, Zeit und Bestzeiten je Stufe.
  - Das angefangene Rätsel bleibt im Profil gespeichert und lässt sich auf einem anderen Gerät fortsetzen.
  - Die Rätsel werden im Browser erzeugt und nach der Schwierigkeit bewertet, die man zum Lösen braucht
    (Einzelkandidaten, Paare, Drillinge, X-Wing, Annahme-Probe). Jedes Rätsel hat genau eine Lösung.

- **Kreuzworträtsel** – Leicht, Mittel und Schwer, dazu ein Tagesrätsel (Wochenplan wie beim Sudoku).
  - Das Gitter wird im Browser aus einer Liste von rund 350 Wörtern mit Hinweisen gebaut (`crossword/words.js`). Je schwerer die Stufe, desto größer das Gitter und desto kniffliger die Wörter.
  - Hinweisleiste mit den Pfeilen für den nächsten und vorherigen Hinweis, Liste aller Hinweise, eigene Buchstaben-Tastatur mit Ä, Ö, Ü (ß wird als SS geschrieben).
  - Uhr, Fehleranzeige, Speichern pro Profil (auch auf anderen Geräten fortsetzbar), Bestzeiten je Stufe.

- **Zahlenjagd** – Aus sechs Zahlen mit + − × ÷ die Zielzahl erreichen (leicht 4, mittel 5, schwer 6 Zahlen).
  - Jede Aufgabe ist lösbar (der Browser prüft das beim Erzeugen), Zurück, Neustart, „Lösung zeigen“ am Ende.
  - Abzeichen für Treffer, knappe Rechenwege und Tempo; Rangliste nach Zeit.

**Tages-Serie:** Bei den Rätselspielen (Sudoku, Kreuzworträtsel, Zahlenjagd) hat jedes Spiel sein
Tagesrätsel, aber es gibt nur **eine gemeinsame Serie**: Ein Tag zählt, sobald man irgendein Tagesrätsel (oder das
Wordle-Tageswort) gelöst hat. Auf der Spieleseite steht die Serie oben, so muss man nicht in jedem Spiel jeden Tag
spielen, um sie zu halten.

Für alle Spiele gemeinsam: **Abzeichen** in Bronze, Silber und Gold (mit Fortschritt und Datum), **Ranglisten** im
Vergleich aller Profile, Töne und Konfetti (im Browser erzeugt, ohne Audio- oder Bilddateien), helles und
dunkles Design, hoher Kontrast.

Reine statische Webseite (HTML, CSS, JavaScript ohne Build) – läuft kostenlos auf GitHub Pages.

## Aufbau

```
index.html, hub.js     Startseite: Profil wählen, Spiel wählen
shared/                gemeinsamer Code aller Spiele
  store.js             Speichern der Profile (Supabase oder Browser), Zusammenführen bei Konflikten
  profile.js           Profildaten über alle Spiele (Normalisieren, Zusammenführen)
  session.js           welches Profil gerade spielt, Profil für ein Spiel laden
  day.js               Kalendertage und Mitternacht (deutsche Zeit) für die Tagesrätsel
  sound.js, fx.js      Töne und Konfetti
  ui.js, settings.js, badge-popup.js   Oberflächen-Bausteine
  puzzle-stats.js, puzzle-ui.js, puzzle.css   Statistik, Ranglisten, Abzeichen-Ansicht für Rätselspiele
  puzzle-shell.js      fertiges Gerüst eines Rätselspiels (Kopf, Stufen, Uhr, Speichern, Statistik, Rangliste, Hilfe)
  streak.js            die gemeinsame Tages-Serie
  random.js            Zufall, der überall gleich ist (für die Tagesrätsel)
  style.css, theme.js  Gestaltung (inkl. dunklem Design und hohem Kontrast)
  config.js            Supabase-Zugangsdaten
wordle/                das Spiel Wordle (index.html, app.js, game.js, words.js)
sudoku/                das Spiel Sudoku (index.html, app.js, logic.js, data.js, sudoku.css)
crossword/             das Kreuzworträtsel (index.html, app.js, logic.js, data.js, words.js, crossword.css)
numbers/               die Zahlenjagd (index.html, app.js, logic.js, data.js, numbers.css)
supabase/schema.sql    Tabelle und Zugriffsregeln für Supabase
tests/                 Tests der Spiellogik und des Speicherns (npm test)
tools/serve.mjs        kleiner Webserver zum lokalen Testen
```

Die Logik der Spiele (`game.js`, `logic.js`, `data.js`) kommt ohne Zugriff auf die Seite aus und wird deshalb mit
Node getestet.

### Profildaten

Alles liegt in einer Tabelle `profiles` (Name und ein JSON-Feld `data`). Im JSON hat jedes Spiel seinen Abschnitt:
Wordle auf oberster Ebene (`daily`, `endless`, `extreme`, `stats`, `blitzStats` …), Sudoku unter `sudoku`, das
Kreuzworträtsel unter `crossword`, die Zahlenjagd unter `numbers`. Die gemeinsame Serie steht
unter `dayStreak`.
Abzeichen aller Spiele stehen gemeinsam unter `achievements` (Kennung → Datum).

Zwei Geräte können gleichzeitig spielen: Beim Speichern wird nur überschrieben, wenn der Server noch den Stand hat,
auf dem die Daten aufbauen. Sonst werden beide Stände zusammengeführt (weiter fortgeschrittenes Spiel gewinnt,
Statistiken zählen nur hoch, Abzeichen werden vereinigt). Unbekannte Schlüssel bleiben dabei erhalten.

### Ein neues Spiel hinzufügen

Für ein Rätselspiel mit Stufen und Tagesrätsel (der übliche Fall) braucht es nur das Spiel selbst, alles Übrige liefert
`shared/puzzle-shell.js`. Vorlage ist `numbers/`:

1. `<spiel>/logic.js`: Regeln, Erzeugen von Rätseln je Stufe und das Tagesrätsel aus dem Datum (mit `shared/random.js`, damit es für
   alle gleich ist).
2. `<spiel>/data.js`: Spielstand, Fortschritt (`gameProgress`) und Abzeichen; `createSection` aus `shared/puzzle-stats.js` liefert
   Leeren, Normalisieren und Zusammenführen des Abschnitts.
3. `<spiel>/app.js` mit `createPuzzleShell({...})` und der Darstellung des Spielfelds, dazu `index.html` und ein kleines Stylesheet.
4. Den Abschnitt in `SECTIONS` in `shared/profile.js` eintragen (dann zählt das Tagesrätsel auch für die gemeinsame Serie) und in `hub.js`
   einen Eintrag in `GAMES` ergänzen (Name, Kurzbeschreibung, Symbol, „Stand heute“; Abzeichen in `earnedBadges`).
5. Tests in `tests/` schreiben, auch einen Test, der das Tagesrätsel eines festen Datums festnagelt, damit es sich nie unbemerkt ändert.

Wordle, Sudoku und das Kreuzworträtsel sind älter und bringen ihr Gerüst noch selbst mit.

## Seite auf GitHub Pages veröffentlichen

1. Auf GitHub das Repository öffnen → **Settings** → links **Pages**.
2. Bei **Build and deployment** → **Source**: „Deploy from a branch“.
3. **Branch**: `main` und Ordner `/ (root)` wählen → **Save**.
4. Nach ca. 1–2 Minuten ist die Seite erreichbar unter `https://<benutzer>.github.io/<repository>/`,
   hier **https://dibs999.github.io/games/**.

Jeder weitere Push auf `main` aktualisiert die Seite automatisch. Die Adresse folgt dem Namen des Repositorys: Wird es
umbenannt, ändert sich die Adresse, und die alte liefert „nicht gefunden“ (Profile und Spielstände bleiben erhalten,
sie liegen in Supabase).

## Profile geräteübergreifend speichern (Supabase)

Ohne diese Einrichtung werden Profile nur im jeweiligen Browser gespeichert.
Mit Supabase (kostenloser Tarif) sind Profile und Spielstände auf allen Geräten gleich.

1. **Projekt anlegen:** Auf [supabase.com](https://supabase.com) mit „Continue with GitHub“ anmelden →
   **New project** → Name z. B. `games`, Region **Central EU (Frankfurt)**, ein Datenbank-Passwort
   generieren lassen (wird für die Seite nicht gebraucht) → **Create new project**.
2. **Tabelle anlegen:** Im Projekt links **SQL Editor** → **New query** → den kompletten Inhalt von
   [`supabase/schema.sql`](supabase/schema.sql) einfügen → **Run**. Supabase warnt dann eventuell vor
   „destructive operations“. Das ist normal: Das Skript ersetzt nur seine eigenen Zugriffsregeln und
   löscht keine Daten. Mit **Run query** bestätigen. Danach erscheint „Success. No rows returned“.
3. **Zugangsdaten kopieren:**
   - **Project URL:** oben im Projekt auf **Connect** klicken (oder **Project Settings** → **Data API**).
     Nur den Teil bis `.supabase.co` nehmen, z. B. `https://abcdefgh.supabase.co` – ohne `/rest/v1/`.
   - **Publishable key:** **Project Settings** → **API Keys**. Er beginnt mit `sb_publishable_…`
     (bei älteren Projekten heißt er **anon public**).

   ⚠️ Niemals den **secret** bzw. **service_role** Key verwenden – der gehört nicht in eine Webseite.
4. **Eintragen:** In [`shared/config.js`](shared/config.js) beide Werte einsetzen:
   ```js
   export const SUPABASE_URL = 'https://abcdefgh.supabase.co';
   export const SUPABASE_KEY = 'sb_publishable_...';
   ```
   Dann committen und pushen. Fertig – der Hinweis „Profile werden nur in diesem Browser gespeichert“
   verschwindet, und alle Geräte sehen dieselben Profile.

**Gut zu wissen**

- Es gibt keine Anmeldung: Wer den Link kennt, kann Profile sehen, anlegen und mit ihnen spielen. Wer sich mit den
  Schnittstellen der Datenbank auskennt, kann auch Spielstände ändern (der Schlüssel ist öffentlich gedacht).
  Für Familie und Freunde gedacht, nicht für Wettbewerbe mit Preisen.
- Profile löschen oder umbenennen: im Supabase-Dashboard unter **Table Editor** → `profiles`.
- Ein Profil darf höchstens etwa 20 KB groß werden (Regel in `supabase/schema.sql`). Mit allen sechs Spielen sind es
  bei normaler Nutzung etwa 7–12 KB. Kommen weitere Spiele dazu, die Grenze dort anheben und das SQL einmal im SQL Editor ausführen.
- Kostenlose Supabase-Projekte werden nach etwa einer Woche ohne Nutzung pausiert. Dann im
  Dashboard auf **Restore project** klicken.
- Profile, die vor der Einrichtung nur im Browser angelegt wurden, erscheinen auf diesem Gerät unter
  „Nur auf diesem Gerät gespeichert“ und lassen sich mit **Online übernehmen** samt Statistik hochladen.
- Nach einem Update kann es bis zu 10 Minuten dauern, bis jeder Browser die neue Version lädt
  (GitHub Pages lässt Dateien so lange zwischenspeichern). Neu laden mit Strg+F5 hilft sofort.

## Lokal starten

Voraussetzung: [Node.js](https://nodejs.org).

```bash
npm start
```

Dann http://localhost:8080 öffnen. (Ein Doppelklick auf `index.html` funktioniert nicht,
weil der Browser JavaScript-Module nur über einen Webserver lädt.)

`node tools/serve.mjs --local` startet den Server auf Port 8081 ohne Supabase. So landen Tests nicht in der
echten Datenbank, Profile liegen dann nur im Browser.

Tests:

```bash
npm test
```

## Kreuzworträtsel: Wörter und Hinweise

`crossword/words.js` enthält je Wort die Lösung (Großbuchstaben, ß als SS), den Hinweis und eine Stufe (1 alltäglich,
2 etwas Wissen nötig, 3 anspruchsvoll). Gespeicherte Rätsel merken sich ein Wort über seine Position in der Liste:
**Neue Wörter nur hinten anhängen und vorhandene nie umsortieren oder löschen.** Den Text eines Hinweises darf man
jederzeit verbessern. Das Tagesrätsel hängt von der Liste ab; auch der Aufbau in `crossword/logic.js` darf sich nicht
ändern (Test "Tagesrätsel bleibt stabil").

## Wortlisten (Wordle)

- **Erlaubte Wörter:** alle Wörter mit fünf Buchstaben aus
  [enz/german-wordlist](https://github.com/enz/german-wordlist) (Lizenz CC0), einer Wortliste nach
  Scrabble-Regeln mit allen Beugungsformen und ohne Namen. ß ist als SS geschrieben.
- **Lösungswörter:** eine Auswahl geläufiger Grundformen, die alle auch in dieser Liste vorkommen.
  Ihre Reihenfolge ist festgelegt, weil daraus das Tageswort folgt: Wer die Liste ändert, ändert das Tageswort.
  Neue Wörter deshalb nur hinten anhängen.
