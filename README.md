# WasGegessen?

Ein Kalorientagebuch fürs Handy und den Browser. Es rechnet aus, wie viel du essen
kannst, um dein Gewicht zu halten, und hilft dir, den Überblick über den Tag zu behalten.

**Live:** https://rianvegeta1991.github.io/wasgegessen/

Alles läuft im Browser. Es gibt kein Konto und keinen Server – deine Einträge liegen
auf deinem Gerät und verlassen es nicht.

## Was die App kann

### Essen eintragen
- **Rund 290 Lebensmittel und Gerichte sind fest eingebaut** – von Kartoffeln, Butter und
  Eiern über Brot, Gemüse, Obst und Käse bis zu fertigen Gerichten wie belegten Brötchen,
  Maultaschen, Currywurst, Käsespätzle, Sushi oder Cappuccino. Alle mit
  Durchschnittswerten und passenden Portionen („1 Maultasche", „1 Berliner", „1 Tasse").
  Sie stehen sofort da, auch offline, und lassen sich über die Gruppen im Suchfenster
  durchstöbern.
- **Suche** zusätzlich in der Lebensmitteldatenbank von
  [Open Food Facts](https://world.openfoodfacts.org/) für verpackte Markenprodukte
- **Zwei Eingabearten** je Eintrag, frei wählbar:
  - **Menge** in Gramm bzw. Millilitern
  - **Standardportion** wie „1 Scheibe Brot", „1 Tasse Reis", „1 Apfel" – das
    Durchschnittsgewicht ist hinterlegt, die Anzahl kannst du anpassen (auch 1,5)
- **Eigene Lebensmittel und Gerichte** anlegen, mit eigenen Portionsgrößen
- Vier Mahlzeiten: Frühstück, Mittagessen, Abendessen, Snacks
- Einträge lassen sich antippen, ändern und löschen; Tage lassen sich zurückblättern
- Die Sucheingabe bleibt stehen und lässt sich mit einem Knopf im Feld löschen

### Dein Bedarf
- Profil: Größe, Gewicht, Alter, Geschlecht, Aktivitätslevel (fünf Stufen)
- **Grundumsatz** nach der Mifflin-St-Jeor-Formel
- **Gesamtumsatz** = Grundumsatz × Aktivitätsfaktor (1,2 bis 1,9)
- Anzeige: „Um dein Gewicht zu halten, benötigst du ca. X kcal pro Tag"
- Tagesübersicht mit Ring: aufgenommen, Ziel, verbleibend. Isst du mehr als geplant,
  dreht der Ring eine **zweite Runde in Rot** – so groß wie der Überschuss. Beim
  doppelten Tagesziel ist sie voll und der ganze Kreis wird rot.
- Wer lieber ein eigenes Ziel setzt, überschreibt den berechneten Wert

### Überblick
- Tagesansicht mit Kalorienring und Eiweiß/Fett/Kohlenhydraten
- Verlauf über **Woche, Monat und Jahr** als Diagramm, mit Ziellinie und Durchschnitt
- Protokoll der letzten Tage, ein Tippen springt zu dem Tag
- **CSV-Export** aller Einträge (Semikolon und Komma, öffnet direkt in Excel)

### Bilderkennung *(optional)*
Ein Foto vom Teller aufnehmen, Claude schätzt die Bestandteile und Mengen.

**Das ist ausdrücklich nur ein Vorschlag.** Portionsgrößen lassen sich auf Fotos nur
ungefähr bestimmen, und verdeckte Zutaten wie Öl, Butter oder Zucker sieht man gar
nicht. Jeder Vorschlag muss bestätigt oder korrigiert werden, bevor er im Tagebuch landet.

Die Funktion braucht einen eigenen API-Schlüssel von
[console.anthropic.com](https://console.anthropic.com/). Er wird im Profil hinterlegt,
bleibt auf dem Gerät und geht ausschließlich an die Anthropic-API. Ohne Schlüssel ist
der Bereich deaktiviert – alles andere funktioniert ohne.

## Installieren

Die Seite ist eine PWA: im Browser aufrufen und über „Zum Startbildschirm hinzufügen"
(iPhone: Teilen-Menü) installieren. Danach läuft sie offline wie eine normale App –
nur die Lebensmittelsuche und die Bilderkennung brauchen Internet.

## Entwicklung

Kein Node, kein Build-Schritt. Die App besteht aus einer HTML-Datei und fünf
JavaScript-Dateien.

```powershell
powershell -ExecutionPolicy Bypass -File serve.ps1 -Port 8796
```

Dann http://localhost:8796 aufrufen.

| Datei | Inhalt |
|---|---|
| `index.html` | Markup und das komplette CSS |
| `daten.js` | Aktivitätsstufen, Mahlzeiten, Standardportionen, Bedarfsformeln |
| `grundnahrung.js` | die eingebauten Grundnahrungsmittel samt Suche |
| `off.js` | Anbindung an Open Food Facts |
| `vision.js` | Bilderkennung über die Anthropic-API |
| `app.js` | Oberfläche, Zustand, Speicherung |
| `sw.js` | Service Worker für den Offline-Betrieb |
| `icons.ps1` | zeichnet die PNG-Icons nach den SVG-Vorlagen |

Gespeichert wird im `localStorage` unter `wasgegessen-*`.

## Datenquellen

- Grundnahrungsmittel: übliche Durchschnittswerte für unverarbeitete Lebensmittel,
  gepflegt in `grundnahrung.js`. Kohlenhydrate ohne Ballaststoffe, wie auf deutschen
  Packungen.
- Markenprodukte: [Open Food Facts](https://world.openfoodfacts.org/), Open Database License
- Standardportionen: übliche Durchschnittsgewichte, in `daten.js` hinterlegt

## Was noch fehlt

- Barcode-Scanner für verpackte Lebensmittel
- Gewichtsverlauf über die Zeit
- Abgleich zwischen mehreren Geräten
