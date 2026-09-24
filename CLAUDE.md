# WasGegessen?

Kalorientagebuch als Web-App/PWA. Erfasst die tägliche Nahrungsaufnahme und rechnet den
Kalorienbedarf zum Gewichthalten aus. **Deutsch ist die Quellsprache** (Code, Kommentare,
Commits, Oberfläche) – anders als bei Regelsuche gibt es **keine** englische Fassung.

## Live

- **Seite:** https://rianvegeta1991.github.io/wasgegessen/
- **Repo:** https://github.com/rianvegeta1991/wasgegessen
- Deploy = `git push origin main` → Workflow `.github/workflows/pages.yml` stellt die
  Seite über **GitHub Actions** online (nicht „Deploy from a branch"), typisch in unter
  einer Minute. Deploy von Hand: `gh workflow run pages.yml`.

## Version

`const APP_VERSION` in `app.js`, klein unten im Profil. **Bei jedem veröffentlichten
Update die minor-Zahl um 1 erhöhen** – als ganze Zahl weiterzählen, nach 1.9 kommt 1.10.

**Drei Stellen hängen an der Versionsnummer und müssen zusammen geändert werden:**
1. `APP_VERSION` in `app.js`
2. `?v=` an den fünf Skript-Tags in `index.html`
3. dieselben `?v=`-Werte in der `ASSETS`-Liste von `sw.js` **plus** `CACHE` hochzählen

Ohne Schritt 2 behalten Besucher nach einem Update alte JavaScript-Dateien (GitHub
Pages schickt `max-age=600`). Ohne Schritt 3 liegen die Skripte doppelt im Cache und
werden trotzdem aus dem Netz geholt.

## Aufbau

Kein Node, kein Build. Eine HTML-Datei plus fünf Skripte, alle global (kein Modulsystem);
nur `app.js` steckt in einer IIFE.

| Datei | Inhalt |
|---|---|
| `index.html` | Markup + komplettes CSS |
| `daten.js` | `AKTIVITAET`, `MAHLZEITEN`, Portionsregeln, `berechneBMR`/`berechneTDEE` |
| `grundnahrung.js` | `GRUNDNAHRUNG` (rund 290 Einträge) + `grundnahrungSuche` |
| `off.js` | Open Food Facts: `offSuche`, Umwandlung ins App-Format |
| `vision.js` | Bilderkennung über die Anthropic-API |
| `app.js` | Oberfläche, Zustand, `localStorage` |

### Bildschirme
Drei Bereiche (`s-heute`, `s-verlauf`, `s-profil`) plus vier Overlays (`ov-suche`,
`ov-detail`, `ov-eigen`, `ov-foto`). Umgeschaltet wird über `zeigeScreen`, Overlays über
`oeffneOverlay`/`schliesseOverlay` (CSS-Klasse `.auf`, schiebt von unten herein).

### Speicher (`localStorage`)
`wasgegessen-profil`, `-eintraege`, `-eigene`, `-zuletzt`, `-key`, `-modell`.
Ein Eintrag trägt **sowohl** die absoluten Werte (`kcal`, `eiweiss`, …) **als auch** die
Werte je 100 g (`kcal100`, …) und die Portionsliste – nur so lässt er sich später
bearbeiten, ohne das Lebensmittel erneut nachzuschlagen.

### Tagesring (seit v1.3)
Zwei Kreise übereinander im selben SVG, beide mit `stroke-dasharray` über den vollen
Umfang (`2π·55`):
- `#ring-wert` (grün) zeigt `min(gegessen / ziel, 1)`.
- `#ring-ueber` (rot, liegt **darüber** – im Markup also danach) zeigt
  `min((gegessen − ziel) / ziel, 1)`, wächst also erst nach dem Ziel und dreht eine
  zweite Runde über die erste.
- Ist die zweite Runde voll (doppeltes Ziel), setzt `.voll` auch den unteren Kreis auf
  Rot – der ganze Ring ist dann rot und gefüllt. `.drueber` färbt zusätzlich die Zahl.

Beim Messen im Test: `stroke` läuft über eine Transition (0,3 s), direkt nach dem
Umschalten misst `getComputedStyle` noch die alte Farbe. Mindestens eine Sekunde warten.

### Rechnen
Mifflin-St-Jeor: Männer `10×kg + 6,25×cm − 5×Alter + 5`, Frauen dasselbe `− 161`.
Gesamtumsatz = Grundumsatz × Faktor (1,2 / 1,375 / 1,55 / 1,725 / 1,9).
Makro-Richtwerte: 20 % Eiweiß, 30 % Fett, 50 % Kohlenhydrate (4/9/4 kcal je Gramm).

### Portionen
`portionenFuer(name, fluessig, nurAllgemein)` sucht Stichwörter im Namen
(`PORTIONS_REGELN`) und hängt allgemeine Portionen hinten an. Im Eintragsfenster stehen
zuerst die mitgelieferten Portionen (Packungsangabe, selbst angelegte oder die aus
`grundnahrung.js`). Bringt ein Lebensmittel eigene Portionen mit, kommen **nur noch die
allgemeinen** dazu (`nurAllgemein`) – sonst stünde neben „1 mittelgroße Kartoffel – 100 g"
auch noch die Stichwortregel „1 mittelgroße – 150 g".

## Woher die Lebensmittel kommen

Zwei Quellen, bewusst getrennt (seit v1.1):

1. **`grundnahrung.js`** – rund 290 Lebensmittel und Gerichte fest in der App. Das ist die
   **wichtigere** Quelle: sie ist sofort da, funktioniert offline und überlebt jeden
   Ausfall von Open Food Facts. Nährwerte je 100 g nach europäischer Kennzeichnung
   (**Kohlenhydrate ohne Ballaststoffe**), dazu `alias` für Plural und Synonyme sowie
   eigene `portionen`.
2. **Open Food Facts** – nur noch für verpackte Markenware.

`sucheStarten` zeigt beides getrennt an: Grundnahrungsmittel und eigene Einträge
erscheinen **sofort**, die Markenprodukte werden nachgeladen. Fällt Open Food Facts aus,
steht dort nur eine beiläufige Notiz – die Suche bleibt benutzbar. Ohne Suchbegriff
zeigt `renderStoebern` die Gruppen zum Durchblättern.

**Neue Einträge prüfen:** `kcal` sollte ungefähr `4×Eiweiß + 4×KH + 9×Fett` ergeben.
In der Konsole:

```js
GRUNDNAHRUNG.filter(l => Math.abs(l.kcal - (4*l.eiweiss + 4*l.kh + 9*l.fett)) / Math.max(l.kcal,20) > 0.25)
```

Erlaubte Ausreißer sind nur Alkoholisches (Alkohol hat 7 kcal/g und steht in keinem
Makro) und sehr Ballaststoffreiches (Rosenkohl, Himbeeren, Aubergine, Zitrone).

## Fallstricke (aus Erfahrung)

- **Keine `<input type="number">` für Zahlen.** Bei deutscher Eingabe („9,5") liefert das
  Feld einen leeren String, der Wert wird stillschweigend 0. Alle Zahlenfelder sind
  deshalb `type="text"` mit `inputmode`; geparst wird mit `zahlOderNull`, die Grenzen
  prüft der Code (`zahlenFelder` in `verdrahten`, `detailSpeichern`, `eigenSpeichern`).
- **Open Food Facts hat eine Oberkategorie `plant-based-foods-and-beverages`**, die auch
  an Brot und Nudeln hängt. Wer auf „beverage" im Kategorietext prüft, hält Brot für ein
  Getränk. Deshalb `GETRAENK_TAGS` mit exakten Tags (`offIstGetraenk`), niemals Teilwörter.
  Ebenso wenig taugt der Name allein: „Teewurst", „Milchbrötchen", „Sahnetorte".
- **Die Suche ist gedrosselt** (rund zehn Anfragen pro Minute) und fällt auch mal ganz
  aus (503). Deshalb 600 ms Verzögerung beim Tippen, `SUCH_CACHE` für wiederholte
  Begriffe, `AbortController` beim Weitertippen und immer der Ausweg „Selbst anlegen".
  Ein Netzwerkfehler kommt im Browser als `Failed to fetch` an, nicht als Status.
- **Beim Testen cacht der eigene Service Worker.** Das war die wahre Ursache hinter
  „meine Änderung kommt nicht an": nicht der Browser, sondern `sw.js` lieferte die alte
  `index.html` – und damit die alten `?v=`-Verweise, obwohl die neuen Dateien längst auf
  der Platte lagen. Die Seite selbst wird deshalb seit v1.1 **network-first** bedient.
  Beim Entwickeln trotzdem sicherheitshalber in der Konsole leeren:

  ```js
  (async()=>{for(const r of await navigator.serviceWorker.getRegistrations())await r.unregister();
   for(const k of await caches.keys())await caches.delete(k);location.reload()})()
  ```

  `serve.ps1` schickt zusätzlich `Cache-Control: no-store` und horcht auch auf
  `127.0.0.1` (eigener Cache-Topf); ein **frischer Tab** hilft ebenfalls.
- **Die Suche von Open Food Facts gibt es in zwei Fassungen** – die neuere
  (`search.openfoodfacts.org`) liefert bessere Treffer, sendet aber **keine
  CORS-Header** und ist aus dem Browser deshalb unbrauchbar. Nicht erneut darauf
  hereinfallen: es bleibt bei `cgi/search.pl`.
- **Screenshots laufen in einen Timeout**, solange der Tab nicht im Vordergrund liegt.
  Zustand dann per `javascript_tool` aus dem DOM lesen.
- Der Service Worker cacht **einzeln** (`cache.add` je Datei), nicht `addAll` – eine
  fehlende Datei darf nicht die ganze Installation scheitern lassen.

## Bilderkennung (optional)

`vision.js` ruft `POST https://api.anthropic.com/v1/messages` direkt aus dem Browser auf.

- Der Header **`anthropic-dangerous-direct-browser-access: true` ist zwingend**, sonst
  blockt CORS. Dazu `x-api-key` und `anthropic-version: 2023-06-01`.
- Modell `claude-opus-5` (im Profil auf Sonnet 5 umstellbar), `output_config.effort:
  'medium'`, Antwortformat über `output_config.format` als `json_schema` – damit kommt
  garantiert gültiges JSON zurück, kein Parsen von Fließtext.
- `fallbacks: 'default'` mit dem Beta-Header `server-side-fallback-2026-07-01`: lehnt ein
  Sicherheitsfilter ab, übernimmt automatisch ein Ersatzmodell. `stop_reason === 'refusal'`
  wird trotzdem abgefangen.
- Bilder werden vorher auf 1024 px verkleinert (`bildVerkleinern`) – spart Tokens.
- Geschätzte Werte laufen durch `saeubern` und werden auf plausible Bereiche begrenzt.
- **Der Schlüssel liegt nur im `localStorage`** des Geräts. Niemals irgendwo anders
  hinschicken, nicht ins Repo, nicht in Fehlermeldungen.

## Entwicklungsumgebung

- **Kein Node, kein Python.** Lokaler Server: `serve.ps1` (PowerShell-`HttpListener`),
  Port **8796**, eingetragen in `.claude/launch.json`.
- Die PNG-Icons werden von `icons.ps1` mit `System.Drawing` **nachgezeichnet**, weil es
  auf dem Rechner keinen SVG-Renderer gibt. **Bei Logoänderungen `icon.svg`,
  `icon-maskable.svg`, `icons.ps1` und das Inline-SVG im Kopf von `index.html` zusammen
  nachziehen.**
- GitHub CLI: `C:\Program Files\GitHub CLI\gh.exe`, Konto `rianvegeta1991`.

## Testen

Verifizieren statt hoffen: Server starten (`preview_start`), **frischen Tab** öffnen,
mobilen Viewport (375×812) setzen, Konsole prüfen, Zustand per DOM auslesen.
Die Rechenwege (`berechneBMR`, `berechneTDEE`, `makroZiele`) lassen sich direkt in der
Konsole gegen von Hand gerechnete Werte prüfen – das ist der schnellste Test.
