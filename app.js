/* ============================================================
   WasGegessen? – Hauptlogik
   Alles läuft im Browser, alles bleibt auf dem Gerät.
   ============================================================ */
(function(){
'use strict';

const APP_VERSION = '1.12';

/* ---------- Speicherschlüssel ---------- */
const SP = {
  profil:    'wasgegessen-profil',
  eintraege: 'wasgegessen-eintraege',
  eigene:    'wasgegessen-eigene',
  zuletzt:   'wasgegessen-zuletzt',
  gewicht:   'wasgegessen-gewicht',
  sport:     'wasgegessen-sport',
  key:       'wasgegessen-key',
  modell:    'wasgegessen-modell'
};

/* ---------- kleine Helfer ---------- */
const $  = (id) => document.getElementById(id);
const $$ = (wahl, wurzel) => Array.from((wurzel || document).querySelectorAll(wahl));

function lade(schluessel, standard){
  try {
    const roh = localStorage.getItem(schluessel);
    return roh ? JSON.parse(roh) : standard;
  } catch { return standard; }
}
function sichere(schluessel, wert){
  try { localStorage.setItem(schluessel, JSON.stringify(wert)); }
  catch { toast('Speicher voll – Eintrag konnte nicht gesichert werden.'); }
}
function neueId(){
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function zahlOderNull(wert){
  const n = parseFloat(String(wert).replace(',', '.'));
  return isFinite(n) ? n : null;
}
function text(inhalt){ return document.createTextNode(inhalt); }

/* HTML-sicher: alle Namen kommen aus Fremddaten (Datenbank, Foto) */
function bau(tag, klasse, inhalt){
  const e = document.createElement(tag);
  if (klasse) e.className = klasse;
  if (inhalt !== undefined && inhalt !== null) e.textContent = String(inhalt);
  return e;
}

/* ---------- Datum ---------- */
function datumStr(d){
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const t = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + m + '-' + t;
}
function heuteStr(){ return datumStr(new Date()); }
function ausDatumStr(s){
  const [j, m, t] = s.split('-').map(Number);
  return new Date(j, m - 1, t);
}
function tageDazu(s, n){
  const d = ausDatumStr(s);
  d.setDate(d.getDate() + n);
  return datumStr(d);
}
const WOCHENTAGE = ['So','Mo','Di','Mi','Do','Fr','Sa'];
const MONATE = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];

function datumLesbar(s){
  const d = ausDatumStr(s);
  return WOCHENTAGE[d.getDay()] + ', ' + d.getDate() + '. ' + MONATE[d.getMonth()] + ' ' + d.getFullYear();
}

/* ---------- Zustand ---------- */
let profil    = lade(SP.profil, { groesse:null, gewicht:null, alter:null, geburtstag:null, geschlecht:null, aktivitaet:'leicht', zielManuell:null, zielGewicht:null, aktivModus:'pauschal' });
let eintraege = lade(SP.eintraege, []);
let eigene    = lade(SP.eigene, []);
let zuletzt   = lade(SP.zuletzt, []);
let gewichte  = lade(SP.gewicht, []);   // [{datum, kg}], aufsteigend
let sport     = lade(SP.sport, []);     // [{id, datum, art, minuten, kcal}]

/* Zustand des Bewegungs-Fensters */
let sp = null;

/* Für welchen Tag die Wiege-Erinnerung weggelegt wurde (nur diese Sitzung
   bzw. dieser Tag – morgen fragt sie wieder) */
let wiegenVertagt = null;

let aktDatum  = heuteStr();
let aktScreen = 'heute';
let aktZeitraum = 'woche';
let suchQuelle = 'suche';
let suchAbbruch = null;
let suchTimer = null;
let fotoErgebnis = null;
let zielMahlzeit = 'mittag';

/* Höhe der Balken im Verlaufsdiagramm: Container (150px) minus Beschriftung */
const BALKEN_MAX = 132;

/* Zustand des Eintrags-Fensters */
let d = null;
/* Zustand des Fensters für eigene Lebensmittel */
let e = null;

/* ============================================================
   Bildschirm „Heute"
   ============================================================ */
function eintraegeVon(datum){
  return eintraege.filter(x => x.datum === datum);
}

function summeVon(liste){
  return liste.reduce((s, x) => ({
    kcal:    s.kcal + x.kcal,
    eiweiss: s.eiweiss + x.eiweiss,
    fett:    s.fett + x.fett,
    kh:      s.kh + x.kh
  }), { kcal:0, eiweiss:0, fett:0, kh:0 });
}

function renderHeute(){
  const liste = eintraegeVon(aktDatum);
  const summe = summeVon(liste);
  const grundZiel = tagesZiel(profil);
  // Wer seine Bewegung einzeln erfasst, darf das Verbrauchte dazuessen
  const ausSport = sportZaehltMit() ? sportKcalVon(aktDatum) : 0;
  const ziel = grundZiel ? grundZiel + ausSport : null;

  // Ring: die erste Runde zeigt den Weg zum Tagesziel. Wird es überschritten,
  // läuft eine zweite Runde in Rot darüber – je nach Überschuss. Ist auch die
  // voll (also beim doppelten Ziel), färbt sich der ganze Kreis rot.
  const umfang = 2 * Math.PI * 55;
  const setzeRing = (id, anteil) => {
    const kreis = $(id);
    kreis.setAttribute('stroke-dasharray', umfang.toFixed(1));
    kreis.setAttribute('stroke-dashoffset', (umfang * (1 - anteil)).toFixed(1));
  };

  const anteilZiel  = ziel ? Math.min(summe.kcal / ziel, 1) : 0;
  const ueberschuss = ziel ? Math.max(0, summe.kcal - ziel) : 0;
  const anteilUeber = ziel ? Math.min(ueberschuss / ziel, 1) : 0;

  setzeRing('ring-wert', anteilZiel);
  setzeRing('ring-ueber', anteilUeber);
  $('ring').classList.toggle('drueber', ueberschuss > 0);
  $('ring').classList.toggle('voll', anteilUeber >= 1);

  // Der Text unter der Zahl sagt im Klartext, woran man ist – das hängt nicht
  // an der Farbe und hilft, wenn sich Rot und Grün schlecht trennen lassen.
  $('ring-zahl').textContent = Math.round(summe.kcal);
  $('ring-label').textContent = !ziel ? 'kcal gegessen'
    : ueberschuss > 0 ? Math.round(ueberschuss) + ' kcal drüber'
    : 'von ' + ziel + ' kcal';

  // Zahlen daneben
  $('f-ziel').textContent = ziel ? ziel + ' kcal' : 'kein Profil';
  $('f-ziel').title = ausSport
    ? grundZiel + ' kcal Grundbedarf plus ' + ausSport + ' kcal durch Bewegung'
    : '';
  $('f-gegessen').textContent = Math.round(summe.kcal) + ' kcal';
  const rest = ziel ? ziel - Math.round(summe.kcal) : null;
  $('f-rest').textContent = rest === null ? '–' : (rest >= 0 ? rest + ' kcal' : Math.abs(rest) + ' kcal drüber');
  $('f-rest-zeile').classList.toggle('drueber', rest !== null && rest < 0);

  // Makros
  const mz = makroZiele(ziel);
  setzeMakro('eiweiss', summe.eiweiss, mz && mz.eiweiss);
  setzeMakro('fett',    summe.fett,    mz && mz.fett);
  setzeMakro('kh',      summe.kh,      mz && mz.kh);
  renderVerteilung(summe);

  renderMahlzeiten(liste);
  renderBewegung();
  renderWiegeKarte();
}

/* ============================================================
   Bewegung
   ============================================================ */
function sportVon(datum){
  return sport.filter(x => x.datum === datum);
}

function sportKcalVon(datum){
  return sportVon(datum).reduce((s, x) => s + x.kcal, 0);
}

/* Angerechnet wird Sport nur, wenn die Bewegung einzeln erfasst wird.
   Im pauschalen Modus steckt sie schon im Aktivitätsfaktor – sie noch
   einmal aufs Budget zu legen, hieße sie doppelt zu zählen. */
function sportZaehltMit(){
  return profil.aktivModus === 'einzeln';
}

function renderBewegung(){
  const behaelter = $('bewegung');
  behaelter.textContent = '';

  const liste = sportVon(aktDatum);
  const summe = sportKcalVon(aktDatum);

  const block = bau('div', 'mahlzeit');
  const kopf  = bau('div', 'mahlzeit-kopf');
  const h3 = bau('h3');
  h3.appendChild(bau('span', 'icon', '🏃'));
  h3.appendChild(text('Bewegung'));
  kopf.appendChild(h3);
  kopf.appendChild(bau('span', 'summe', summe ? '+' + summe + ' kcal' : ''));

  const plus = bau('button', 'plus', '+');
  plus.setAttribute('aria-label', 'Bewegung eintragen');
  plus.onclick = () => oeffneSport(null);
  kopf.appendChild(plus);
  block.appendChild(kopf);

  if (!liste.length){
    const leer = bau('div', 'leer', 'Noch nichts eingetragen');
    leer.onclick = () => oeffneSport(null);
    block.appendChild(leer);
  } else {
    const kasten = bau('div', 'eintraege');
    for (const x of liste){
      const knopf = bau('button', 'eintrag');
      const txt = bau('div', 'txt');
      const art = sportart(x.art);
      txt.appendChild(bau('div', 'name', art ? art.name : x.art));
      txt.appendChild(bau('div', 'menge', x.minuten + ' Minuten'
        + (sportZaehltMit() ? '' : ' · zählt nicht aufs Budget')));
      knopf.appendChild(txt);
      const kcal = bau('div', 'kcal', '+' + x.kcal);
      kcal.appendChild(bau('small', null, ' kcal'));
      knopf.appendChild(kcal);
      knopf.onclick = () => oeffneSport(x);
      kasten.appendChild(knopf);
    }
    block.appendChild(kasten);
  }
  behaelter.appendChild(block);
}

function oeffneSport(vorhanden){
  const gewichtKg = profil.gewicht;
  if (!gewichtKg){
    toast('Für den Verbrauch braucht die App dein Gewicht – trag es im Profil ein.');
    return;
  }

  sp = {
    id: vorhanden ? vorhanden.id : null,
    art: vorhanden ? vorhanden.art : 'joggen',
    minuten: vorhanden ? vorhanden.minuten : 30
  };

  $('sport-titel').textContent = vorhanden ? 'Bewegung bearbeiten' : 'Bewegung eintragen';
  $('sp-loeschen').hidden = !vorhanden;

  // Auswahlliste nach Gruppen
  const auswahl = $('sp-art');
  auswahl.textContent = '';
  for (const gruppe of ['Cardio','Kraft','Sport','Alltag']){
    const og = document.createElement('optgroup');
    og.label = gruppe;
    for (const a of SPORTARTEN.filter(s => s.gruppe === gruppe)){
      const opt = document.createElement('option');
      opt.value = a.id;
      opt.textContent = a.name;
      og.appendChild(opt);
    }
    auswahl.appendChild(og);
  }
  auswahl.value = sp.art;
  $('sp-dauer').value = sp.minuten;

  sportRechnen();
  oeffneOverlay('ov-sport');
}

function sportRechnen(){
  const art = sportart(sp.art);
  const kcal = sportKcal(art ? art.met : 0, sp.minuten, profil.gewicht);
  $('sp-kcal').textContent = kcal;
  $('sp-hinweis').textContent = '';
  $('sp-hinweis').appendChild(bau('span', null,
    sportZaehltMit() ? 'kommt heute aufs Budget' : 'wird nur protokolliert'));
  $('sp-formel').textContent = art
    ? art.name + ' entspricht etwa ' + String(art.met).replace('.', ',')
      + ' MET. Gerechnet mit ' + mengeText(profil.gewicht) + ' kg Körpergewicht; '
      + 'der Grundumsatz für dieselbe Zeit ist schon abgezogen.'
    : '';
  return kcal;
}

function sportSpeichern(){
  const art = sportart(sp.art);
  if (!art){ toast('Bitte eine Aktivität wählen.'); return; }
  if (!sp.minuten || sp.minuten < 1){ toast('Bitte eine Dauer angeben.'); return; }
  if (sp.minuten > 1440){ toast('Mehr als 24 Stunden gehen nicht.'); return; }

  const eintrag = {
    id: sp.id || neueId(),
    datum: aktDatum,
    zeit: new Date().toISOString(),
    art: sp.art,
    minuten: sp.minuten,
    kcal: sportKcal(art.met, sp.minuten, profil.gewicht)
  };

  if (sp.id){
    const i = sport.findIndex(x => x.id === sp.id);
    if (i >= 0){ eintrag.datum = sport[i].datum; sport[i] = eintrag; }
  } else {
    sport.push(eintrag);
  }
  sichere(SP.sport, sport);
  schliesseOverlay('ov-sport');
  renderHeute();
  toast(sp.id ? 'Geändert' : '+' + eintrag.kcal + ' kcal verbraucht');
}

function sportLoeschen(){
  sport = sport.filter(x => x.id !== sp.id);
  sichere(SP.sport, sport);
  schliesseOverlay('ov-sport');
  renderHeute();
  toast('Einheit gelöscht');
}

/* ============================================================
   Gewicht
   ============================================================ */
function gewichtVon(datum){
  const treffer = gewichte.find(g => g.datum === datum);
  return treffer ? treffer.kg : null;
}

function gewichtSetzen(datum, kg){
  const i = gewichte.findIndex(g => g.datum === datum);
  if (i >= 0) gewichte[i].kg = kg;
  else gewichte.push({ datum, kg });
  gewichte.sort((a, b) => a.datum.localeCompare(b.datum));
  sichere(SP.gewicht, gewichte);

  // Das jüngste Gewicht ist auch das Profilgewicht – der Grundumsatz
  // soll mitwandern, wenn sich das Gewicht ändert.
  const juengstes = gewichte[gewichte.length - 1];
  if (juengstes && juengstes.datum >= datum){
    profil.gewicht = juengstes.kg;
    sichere(SP.profil, profil);
  }
}

/* Die Erinnerung erscheint an Wiegetagen, solange für heute nichts
   eingetragen und sie nicht weggelegt wurde. */
function renderWiegeKarte(){
  const karte = $('wiege-karte');
  const heute = heuteStr();
  const faellig = aktDatum === heute
    && istWiegetag(heute)
    && gewichtVon(heute) === null
    && wiegenVertagt !== heute;

  karte.hidden = !faellig;
  if (!faellig) return;

  const letztes = gewichte[gewichte.length - 1];
  $('wiege-sub').textContent = letztes
    ? 'Zuletzt ' + mengeText(letztes.kg) + ' kg am ' + datumLesbar(letztes.datum) + '.'
    : 'Zweimal die Woche reicht, um den Verlauf zu sehen.';
  $('wiege-feld').value = '';
}

function wiegenEintragen(){
  const kg = zahlOderNull($('wiege-feld').value);
  if (kg === null || kg < 20 || kg > 400){
    toast('Bitte ein Gewicht zwischen 20 und 400 kg angeben.');
    return;
  }
  gewichtSetzen(heuteStr(), Math.round(kg * 10) / 10);
  renderWiegeKarte();
  renderProfil();
  renderHeute();
  toast('Gewicht eingetragen');
}

/* Kurve über die letzten Wiegungen, mit Zielgewicht als Linie */
function renderGewicht(){
  const inhalt = $('gewicht-inhalt');
  inhalt.textContent = '';

  if (!gewichte.length){
    const hinweis = bau('p', 'abw-hinweis',
      'Noch kein Gewicht erfasst. Mittwochs und samstags fragt die App auf der Heute-Seite danach – eintragen kannst du es jederzeit im Profil.');
    inhalt.appendChild(hinweis);
    return;
  }

  // Zeitraum wie im übrigen Verlauf begrenzen
  const tage = aktZeitraum === 'woche' ? 7 : aktZeitraum === 'monat' ? 30 : 365;
  const ab = tageDazu(heuteStr(), -(tage - 1));
  let punkte = gewichte.filter(g => g.datum >= ab);
  // Mindestens die letzten beiden zeigen, damit nie ein leeres Feld steht
  if (punkte.length < 2) punkte = gewichte.slice(-2);

  const aktuell = gewichte[gewichte.length - 1];
  const ziel = profil.zielGewicht;

  const kopf = bau('div', 'gew-kopf');
  const wert = bau('b', null, mengeText(aktuell.kg) + ' kg');
  kopf.appendChild(wert);
  kopf.appendChild(bau('span', 'leise', 'am ' + datumLesbar(aktuell.datum)));

  // Veränderung gegenüber der ersten gezeigten Wiegung
  if (punkte.length >= 2){
    const diff = aktuell.kg - punkte[0].kg;
    const trend = bau('span', 'trend',
      (diff > 0 ? '+' : diff < 0 ? '−' : '±') + mengeText(Math.abs(Math.round(diff * 10) / 10)) + ' kg');
    trend.title = 'Veränderung seit ' + datumLesbar(punkte[0].datum);
    kopf.appendChild(trend);
  }
  inhalt.appendChild(kopf);

  // Kurve als SVG: Werte auf 0–100 normiert, Zielgewicht als Linie
  const werte = punkte.map(p => p.kg).concat(ziel ? [ziel] : []);
  const min = Math.min(...werte), max = Math.max(...werte);
  const spanne = Math.max(max - min, 1);          // nie durch 0 teilen
  const rand = spanne * 0.15;
  const unten = min - rand, oben = max + rand;
  const y = (kg) => 100 - ((kg - unten) / (oben - unten)) * 100;
  const x = (i) => punkte.length === 1 ? 50 : (i / (punkte.length - 1)) * 100;

  const plot = bau('div', 'gew-plot');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', 'none');

  if (ziel){
    const linie = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    linie.setAttribute('class', 'gew-ziellinie');
    linie.setAttribute('x1', 0); linie.setAttribute('x2', 100);
    linie.setAttribute('y1', y(ziel)); linie.setAttribute('y2', y(ziel));
    linie.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.appendChild(linie);
  }

  const pfad = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  pfad.setAttribute('class', 'gew-linie');
  pfad.setAttribute('vector-effect', 'non-scaling-stroke');
  pfad.setAttribute('points', punkte.map((p, i) => x(i) + ',' + y(p.kg)).join(' '));
  svg.appendChild(pfad);

  punkte.forEach((p, i) => {
    const kreis = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    kreis.setAttribute('class', 'gew-punkt');
    kreis.setAttribute('cx', x(i)); kreis.setAttribute('cy', y(p.kg));
    kreis.setAttribute('r', 3);
    kreis.setAttribute('vector-effect', 'non-scaling-stroke');
    const titel = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    titel.textContent = datumLesbar(p.datum) + ': ' + mengeText(p.kg) + ' kg';
    kreis.appendChild(titel);
    svg.appendChild(kreis);
  });

  plot.appendChild(svg);
  inhalt.appendChild(plot);

  const achse = bau('div', 'gew-achse');
  achse.appendChild(bau('span', null, kurzDatum(punkte[0].datum)));
  if (ziel) achse.appendChild(bau('span', null, 'Ziel ' + mengeText(ziel) + ' kg'));
  achse.appendChild(bau('span', null, kurzDatum(punkte[punkte.length - 1].datum)));
  inhalt.appendChild(achse);

  if (ziel){
    const rest = Math.round((aktuell.kg - ziel) * 10) / 10;
    const fuss = bau('p', 'gew-fuss');
    fuss.textContent = Math.abs(rest) < 0.05
      ? 'Du bist auf deinem Zielgewicht.'
      : (rest > 0 ? 'Noch ' + mengeText(rest) + ' kg bis zum Zielgewicht.'
                  : mengeText(Math.abs(rest)) + ' kg unter deinem Zielgewicht.');
    inhalt.appendChild(fuss);
  }

  // Die letzten Wiegungen zum Nachsehen und Löschen
  const liste = bau('div', 'gew-liste');
  for (const g of gewichte.slice(-6).reverse()){
    const zeile = bau('div', 'gew-eintrag');
    zeile.appendChild(bau('span', 'datum', datumLesbar(g.datum)));
    zeile.appendChild(bau('b', null, mengeText(g.kg) + ' kg'));
    const weg = bau('button', 'weg', '✕');
    weg.setAttribute('aria-label', 'Wiegung vom ' + datumLesbar(g.datum) + ' löschen');
    weg.onclick = () => {
      gewichte = gewichte.filter(x => x.datum !== g.datum);
      sichere(SP.gewicht, gewichte);
      renderVerlauf();
      renderWiegeKarte();
      toast('Wiegung gelöscht');
    };
    zeile.appendChild(weg);
    liste.appendChild(zeile);
  }
  inhalt.appendChild(liste);
}

function kurzDatum(iso){
  const d = ausDatumStr(iso);
  return d.getDate() + '.' + (d.getMonth() + 1) + '.';
}

function setzeMakro(name, wert, ziel){
  $('mk-' + name).textContent = ziel
    ? Math.round(wert) + ' / ' + ziel + ' g'
    : Math.round(wert) + ' g';
  $('mkb-' + name).style.width = ziel ? Math.min(100, (wert / ziel) * 100) + '%' : '0%';
}

/* Woraus die Kalorien des Tages kamen. Gerechnet wird mit den
   Brennwerten der Nährstoffe (Eiweiß und Kohlenhydrate 4 kcal/g,
   Fett 9 kcal/g), nicht mit der Kalorienangabe des Lebensmittels –
   sonst gingen Rundungen und Alkohol in die Anteile ein. */
function renderVerteilung(summe){
  const box = $('verteilung');
  const ausEiweiss = summe.eiweiss * 4;
  const ausFett    = summe.fett * 9;
  const ausKh      = summe.kh * 4;
  const gesamt     = ausEiweiss + ausFett + ausKh;

  // Ohne Einträge gibt es nichts zu verteilen
  if (gesamt < 1){ box.hidden = true; return; }
  box.hidden = false;

  const anteile = {
    eiweiss: ausEiweiss / gesamt * 100,
    fett:    ausFett / gesamt * 100,
    kh:      ausKh / gesamt * 100
  };
  for (const [name, wert] of Object.entries(anteile)){
    $('vt-' + name).style.width = wert.toFixed(1) + '%';
  }

  const text = $('vert-text');
  text.textContent = '';
  [['eiweiss','Eiweiß'], ['fett','Fett'], ['kh','Kohlenh.']].forEach(([id, name]) => {
    const pos = bau('div', 'pos');
    pos.appendChild(bau('span', 'punkt v-' + id));
    pos.appendChild(bau('span', null, name + ' '));
    pos.appendChild(bau('b', null, Math.round(anteile[id]) + ' %'));
    text.appendChild(pos);
  });

  // Zum Vergleich die Richtwerte, nach denen auch die Balken oben rechnen
  $('vert-ziel').textContent = 'empfohlen 20 / 30 / 50 %';
}

function renderMahlzeiten(liste){
  const behaelter = $('mahlzeiten');
  behaelter.textContent = '';

  for (const m of MAHLZEITEN){
    const eigene = liste.filter(x => x.mahlzeit === m.id);
    const summe = summeVon(eigene).kcal;

    const block = bau('div', 'mahlzeit');
    const kopf  = bau('div', 'mahlzeit-kopf');

    const h3 = bau('h3');
    h3.appendChild(bau('span', 'icon', m.icon));
    h3.appendChild(text(m.name));
    kopf.appendChild(h3);
    kopf.appendChild(bau('span', 'summe', summe ? Math.round(summe) + ' kcal' : ''));

    const plus = bau('button', 'plus', '+');
    plus.setAttribute('aria-label', m.name + ' – Eintrag hinzufügen');
    plus.onclick = () => oeffneSuche(m.id);
    kopf.appendChild(plus);
    block.appendChild(kopf);

    if (!eigene.length){
      const leer = bau('div', 'leer', 'Noch nichts eingetragen');
      leer.onclick = () => oeffneSuche(m.id);
      block.appendChild(leer);
    } else {
      const kasten = bau('div', 'eintraege');
      for (const x of eigene) kasten.appendChild(eintragZeile(x));
      block.appendChild(kasten);
    }
    behaelter.appendChild(block);
  }
}

function eintragZeile(x){
  const knopf = bau('button', 'eintrag');
  const txt = bau('div', 'txt');
  txt.appendChild(bau('div', 'name', x.name));

  const menge = x.portionName
    ? mengeText(x.anzahl) + ' × ' + x.portionName + ' (' + Math.round(x.menge) + ' ' + x.einheit + ')'
    : Math.round(x.menge) + ' ' + x.einheit;
  txt.appendChild(bau('div', 'menge', menge + (x.marke ? ' · ' + x.marke : '')));
  knopf.appendChild(txt);

  const kcal = bau('div', 'kcal', Math.round(x.kcal));
  kcal.appendChild(bau('small', null, ' kcal'));
  knopf.appendChild(kcal);

  knopf.onclick = () => oeffneDetailZumBearbeiten(x);
  return knopf;
}

function mengeText(n){
  return Number(n).toLocaleString('de-DE', { maximumFractionDigits:2 });
}

/* ---------- Datumsleiste ---------- */
function renderDatum(){
  const ist = aktDatum === heuteStr();
  const gestern = aktDatum === tageDazu(heuteStr(), -1);
  $('datum-text').textContent = ist ? 'Heute' : (gestern ? 'Gestern' : WOCHENTAGE[ausDatumStr(aktDatum).getDay()]);
  $('datum-sub').textContent = datumLesbar(aktDatum);
  $('tag-vor').disabled = ist;
}

/* ============================================================
   Bildschirm „Verlauf"
   ============================================================ */
function renderVerlauf(){
  const ziel = tagesZiel(profil);
  const daten = aktZeitraum === 'jahr' ? monatsDaten() : tagesDaten(aktZeitraum === 'woche' ? 7 : 30);

  // Reicht die Erfassung noch nicht über den ganzen Zeitraum, nennt die
  // Überschrift das, statt Tage zu versprechen, die gar nicht da sind.
  const voll = aktZeitraum === 'woche' ? 7 : aktZeitraum === 'monat' ? 30 : 12;
  const einheit = aktZeitraum === 'jahr' ? 'Monate' : 'Tage';
  $('verlauf-titel').textContent = daten.length >= voll
    ? 'Letzte ' + voll + ' ' + einheit
    : 'Seit dem ersten Eintrag · ' + daten.length + ' '
      + (daten.length === 1 ? einheit.slice(0, -1) : einheit);

  const werte = daten.map(x => x.kcal);
  const hoechst = Math.max(ziel || 0, ...werte, 1) * 1.1;

  // Ziellinie über dem Diagramm einblenden
  const linie = $('ziel-linie');
  if (ziel && aktZeitraum !== 'jahr'){
    linie.hidden = false;
    const y = 6 + BALKEN_MAX - (ziel / hoechst) * BALKEN_MAX;
    linie.querySelector("i").style.top = y + "px";
    linie.querySelector("b").style.top = y + "px";
  } else {
    linie.hidden = true;
  }

  const diagramm = $('diagramm');
  diagramm.textContent = '';
  for (const eintrag of daten){
    const spalte = bau('div', 'balken-sp');
    const balken = bau('div', 'balken');
    balken.style.height = Math.max(2, (eintrag.kcal / hoechst) * BALKEN_MAX) + "px";
    if (!eintrag.kcal) balken.classList.add('leer-tag');
    else if (ziel && eintrag.kcal > ziel) balken.classList.add('drueber');
    balken.title = eintrag.label + ': ' + Math.round(eintrag.kcal) + ' kcal';
    spalte.appendChild(balken);
    spalte.appendChild(bau('div', 'bl', eintrag.kurz));
    diagramm.appendChild(spalte);
  }

  const erfasst = daten.filter(x => x.kcal > 0);
  const schnitt = erfasst.length ? erfasst.reduce((s, x) => s + x.kcal, 0) / erfasst.length : 0;
  $('st-schnitt').textContent = erfasst.length ? Math.round(schnitt) : '–';
  $('st-tage').textContent = erfasst.length + ' / ' + daten.length;
  if (ziel && erfasst.length){
    const diff = Math.round(schnitt - ziel);
    const proz = Math.round(Math.abs(diff) / ziel * 100);
    $('st-bilanz').textContent = (diff > 0 ? '+' : diff < 0 ? '−' : '') + Math.abs(diff);
    $('st-bilanz').appendChild(bau('span', 'abw-prozent',
      ' ' + (diff > 0 ? '+' : diff < 0 ? '−' : '') + proz + ' %'));
  } else {
    $('st-bilanz').textContent = '–';
  }

  renderNaehrstoffe(daten);
  renderGewicht();
  renderAbweichung(daten, ziel);
  renderProtokoll();
}

/* Je Nährstoff ein eigenes Diagramm, aufgebaut wie das Kaloriendiagramm
   darüber: absolute Balken je Tag und eine gestrichelte Linie für den
   Richtwert. Balken über dem Richtwert stehen in voller Deckkraft, die
   darunter zurückgenommen – die Linie zeigt die Richtung, nicht die
   Farbe. Darunter die Bilanz in Gramm und Prozent. */
const ABW_MAX = 86;   // Höhe der Balkenfläche in Pixeln

function renderAbweichung(daten, ziel){
  const inhalt = $('abw-inhalt');
  inhalt.textContent = '';

  const zw = makroZiele(ziel);
  if (!zw){
    inhalt.appendChild(bau('p', 'abw-hinweis',
      'Dafür fehlt dein Tagesziel – trag dein Profil ein, dann stehen hier die Richtwerte je Nährstoff.'));
    return;
  }

  const erfasst = daten.filter(x => (x.eiweiss + x.fett + x.kh) > 0.5);
  if (!erfasst.length){
    inhalt.appendChild(bau('p', 'abw-hinweis', 'Noch keine Nährwerte in diesem Zeitraum erfasst.'));
    return;
  }

  for (const [id, name] of [['eiweiss','Eiweiß'], ['fett','Fett'], ['kh','Kohlenhydrate']]){
    const sollWert = zw[id];
    const schnitt = erfasst.reduce((s, x) => s + x[id], 0) / erfasst.length;
    const abw = schnitt - sollWert;
    const prozent = sollWert > 0 ? Math.round(Math.abs(abw) / sollWert * 100) : 0;
    const hoechst = Math.max(sollWert, ...daten.map(x => x[id]), 1) * 1.1;

    const zeile = bau('div', 'abw-zeile');

    // Kopf: Name, Richtwert und der Schnitt pro Tag
    const kopf = bau('div', 'abw-kopf');
    kopf.appendChild(bau('span', 'punkt v-' + id));
    kopf.appendChild(bau('span', 'name', name));
    kopf.appendChild(bau('span', 'einheit', 'Richtwert ' + sollWert + ' g'));
    const wert = bau('b', null, Math.round(schnitt) + ' g');
    wert.appendChild(bau('span', 'abw-prozent', ' Ø pro Tag'));
    kopf.appendChild(wert);
    zeile.appendChild(kopf);

    // Richtwertlinie – dieselbe Technik wie die Ziellinie beim Kaloriendiagramm
    const linie = bau('div', 'ziel-linie');
    const strich = document.createElement('i');
    const marke = document.createElement('b');
    marke.textContent = sollWert + ' g';
    const y = 4 + ABW_MAX - (sollWert / hoechst) * ABW_MAX;
    strich.style.top = y + 'px';
    marke.style.top = y + 'px';
    linie.appendChild(strich);
    linie.appendChild(marke);
    zeile.appendChild(linie);

    const plot = bau('div', 'abw-plot');
    for (const tag of daten){
      const wertTag = tag[id];
      const hatEintrag = (tag.eiweiss + tag.fett + tag.kh) > 0.5;
      const sp = bau('div', 'abw-sp');
      const balken = bau('div', 'abw-bar');

      if (!hatEintrag){
        balken.classList.add('leer-tag');
        balken.style.height = '2px';
      } else {
        balken.classList.add('v-' + id);
        if (wertTag < sollWert) balken.classList.add('drunter');
        balken.style.height = Math.max(3, (wertTag / hoechst) * ABW_MAX) + 'px';

        const diff = wertTag - sollWert;
        const vz = diff >= 0 ? '+' : '−';
        const dProz = sollWert > 0 ? Math.round(Math.abs(diff) / sollWert * 100) : 0;
        sp.title = tag.label + ': ' + Math.round(wertTag) + ' g ' + name
          + ' · ' + vz + Math.round(Math.abs(diff)) + ' g (' + vz + dProz + ' %) '
          + (diff >= 0 ? 'über' : 'unter') + ' dem Richtwert von ' + sollWert + ' g';
      }

      sp.appendChild(balken);
      plot.appendChild(sp);
    }
    zeile.appendChild(plot);

    const achse = bau('div', 'abw-achse');
    for (const tag of daten) achse.appendChild(bau('div', 'bl', tag.kurz));
    zeile.appendChild(achse);

    // Bilanz: absolut und relativ
    const bilanz = bau('div', 'abw-bilanz');
    const zeichen = abw >= 0 ? '+' : '−';
    bilanz.appendChild(text('Im Schnitt '));
    bilanz.appendChild(bau('b', null, zeichen + Math.round(Math.abs(abw)) + ' g ('
      + zeichen + prozent + ' %)'));
    bilanz.appendChild(text(abw >= 0 ? ' über dem Richtwert' : ' unter dem Richtwert'));
    zeile.appendChild(bilanz);

    inhalt.appendChild(zeile);
  }

  const fuss = bau('p', 'abw-fuss');
  fuss.textContent = 'Die Richtwerte verteilen dein Tagesziel von ' + ziel
    + ' kcal auf 20 % Eiweiß, 30 % Fett und 50 % Kohlenhydrate. '
    + 'Volle Balken liegen über dem Richtwert, blasse darunter.';
  inhalt.appendChild(fuss);
}

/* Nährstoffe über den gewählten Zeitraum: je Tag (bzw. Monat) ein
   Balken, der nach dem Kalorienanteil der drei Nährstoffe gestapelt
   ist. Die Höhe entspricht derselben Skala wie im Diagramm darüber,
   damit sich beide Ansichten vergleichen lassen. */
function renderNaehrstoffe(daten){
  const diagramm = $('naehr-diagramm');
  const schnitt  = $('naehr-schnitt');
  diagramm.textContent = '';
  schnitt.textContent = '';

  const istJahr = (aktZeitraum === 'jahr');
  $('naehr-titel').textContent = istJahr
    ? 'Woraus die Kalorien kamen (Schnitt je Monat)'
    : 'Woraus die Kalorien kamen';

  // Kalorien je Nährstoff – über die Brennwerte, nicht über die
  // Kalorienangabe des Lebensmittels (siehe renderVerteilung)
  const ausMakros = (x) => ({
    eiweiss: x.eiweiss * 4, fett: x.fett * 9, kh: x.kh * 4
  });
  const mitWerten = daten.filter(x => {
    const m = ausMakros(x);
    return m.eiweiss + m.fett + m.kh > 1;
  });

  if (!mitWerten.length){
    diagramm.appendChild(bau('p', 'naehr-leer',
      'Für diesen Zeitraum sind noch keine Nährwerte erfasst.'));
    return;
  }

  const hoechst = Math.max(...daten.map(x => {
    const m = ausMakros(x);
    return m.eiweiss + m.fett + m.kh;
  }), 1) * 1.1;

  for (const eintrag of daten){
    const m = ausMakros(eintrag);
    const gesamt = m.eiweiss + m.fett + m.kh;
    const spalte = bau('div', 'balken-sp');
    const saeule = bau('div', 'naehr-saeule');

    if (gesamt < 1){
      saeule.classList.add('leer-tag');
      saeule.style.height = '2px';
    } else {
      saeule.style.height = Math.max(3, (gesamt / hoechst) * BALKEN_MAX) + 'px';
      // Von unten nach oben: Kohlenhydrate, Fett, Eiweiß
      for (const [name, wert] of [['kh', m.kh], ['fett', m.fett], ['eiweiss', m.eiweiss]]){
        const teil = bau('div', 'naehr-teil v-' + name);
        teil.style.height = (wert / gesamt * 100) + '%';
        saeule.appendChild(teil);
      }
      saeule.title = eintrag.label + ': '
        + Math.round(m.eiweiss / gesamt * 100) + ' % Eiweiß, '
        + Math.round(m.fett / gesamt * 100) + ' % Fett, '
        + Math.round(m.kh / gesamt * 100) + ' % Kohlenhydrate';
    }

    spalte.appendChild(saeule);
    spalte.appendChild(bau('div', 'bl', eintrag.kurz));
    diagramm.appendChild(spalte);
  }

  // Schnitt über die Tage, an denen überhaupt etwas erfasst wurde
  const mittel = (feld) => mitWerten.reduce((s, x) => s + x[feld], 0) / mitWerten.length;
  const g = { eiweiss: mittel('eiweiss'), fett: mittel('fett'), kh: mittel('kh') };
  const kcalGesamt = g.eiweiss * 4 + g.fett * 9 + g.kh * 4;

  [['eiweiss','Eiweiß'], ['fett','Fett'], ['kh','Kohlenhydrate']].forEach(([id, name]) => {
    const stat = bau('div', 'stat');
    const kopf = bau('div', 'kopf');
    kopf.appendChild(bau('span', 'punkt v-' + id));
    kopf.appendChild(bau('span', null, name));
    kopf.querySelector('span:last-child').style.fontSize = '11.5px';
    stat.appendChild(kopf);
    stat.appendChild(bau('b', null, Math.round(g[id]) + ' g'));
    const anteil = kcalGesamt > 0
      ? Math.round((g[id] * (id === 'fett' ? 9 : 4)) / kcalGesamt * 100) : 0;
    stat.appendChild(bau('span', null, 'Ø pro Tag · ' + anteil + ' %'));
    schnitt.appendChild(stat);
  });
}

/* Der erste Tag, an dem überhaupt etwas eingetragen wurde.
   Was davor liegt, ist keine Lücke, sondern Zeit vor der Nutzung –
   und taucht im Verlauf deshalb gar nicht erst auf. */
function ersterEintragstag(){
  if (!eintraege.length) return null;
  return eintraege.reduce((frueh, x) => x.datum < frueh ? x.datum : frueh, eintraege[0].datum);
}

function tagesDaten(anzahl){
  const liste = [];
  const start = ersterEintragstag();
  for (let i = anzahl - 1; i >= 0; i--){
    const datum = tageDazu(heuteStr(), -i);
    if (start && datum < start) continue;
    const d = ausDatumStr(datum);
    const summe = summeVon(eintraegeVon(datum));
    liste.push({
      datum,
      kcal: summe.kcal,
      eiweiss: summe.eiweiss, fett: summe.fett, kh: summe.kh,
      label: datumLesbar(datum),
      kurz: ''
    });
  }

  // Beschriftung nach der Zahl der wirklich gezeigten Tage, nicht nach dem
  // gewählten Zeitraum: wer die App seit drei Tagen nutzt, sieht in der
  // Monatsansicht drei Spalten – die sollen alle beschriftet sein.
  const alleBeschriften = liste.length <= 10;
  for (const x of liste){
    const d = ausDatumStr(x.datum);
    x.kurz = alleBeschriften ? WOCHENTAGE[d.getDay()]
      : (d.getDate() % 5 === 0 ? String(d.getDate()) : '');
  }
  return liste;
}

function monatsDaten(){
  const liste = [];
  const jetzt = new Date();
  const start = ersterEintragstag();
  const startMonat = start ? start.slice(0, 7) : null;
  for (let i = 11; i >= 0; i--){
    const d = new Date(jetzt.getFullYear(), jetzt.getMonth() - i, 1);
    const praefix = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    if (startMonat && praefix < startMonat) continue;
    const treffer = eintraege.filter(x => x.datum.startsWith(praefix));
    const tage = new Set(treffer.map(x => x.datum)).size;
    const summe = summeVon(treffer);
    const proTag = (wert) => tage ? wert / tage : 0;
    liste.push({
      datum: praefix,
      kcal: proTag(summe.kcal),
      eiweiss: proTag(summe.eiweiss), fett: proTag(summe.fett), kh: proTag(summe.kh),
      label: MONATE[d.getMonth()] + ' ' + d.getFullYear(),
      kurz: MONATE[d.getMonth()].slice(0, 3)
    });
  }
  return liste;
}

function renderProtokoll(){
  const behaelter = $('protokoll');
  behaelter.textContent = '';

  const tage = Array.from(new Set(eintraege.map(x => x.datum))).sort().reverse().slice(0, 30);
  if (!tage.length){
    behaelter.appendChild(bau('p', 'hinweis', 'Noch keine Einträge vorhanden.'));
    return;
  }

  const ziel = tagesZiel(profil);
  for (const datum of tage){
    const liste = eintraegeVon(datum);
    const summe = summeVon(liste);
    const zeile = bau('button', 'prot-tag');
    const txt = bau('div', 'txt');
    txt.appendChild(bau('div', 'name', datumLesbar(datum)));
    const abstand = Math.round(summe.kcal - ziel);
    const unter = liste.length + (liste.length === 1 ? ' Eintrag' : ' Einträge')
      + (ziel ? ' · ' + (abstand > 0 ? abstand + ' über dem Ziel' : Math.abs(abstand) + ' unter dem Ziel') : '');
    txt.appendChild(bau('div', 'sub', unter));
    zeile.appendChild(txt);
    zeile.appendChild(bau('div', 'kcal', Math.round(summe.kcal) + ' kcal'));
    zeile.onclick = () => { aktDatum = datum; zeigeScreen('heute'); };
    behaelter.appendChild(zeile);
  }
}

/* ============================================================
   Bildschirm „Profil"
   ============================================================ */
function renderProfil(){
  const bmr  = berechneBMR(profil);
  const tdee = berechneTDEE(profil);
  const ziel = tagesZiel(profil);

  if (tdee){
    $('tdee-zahl').textContent = '';
    $('tdee-zahl').appendChild(text(String(tdee)));
    const klein = bau('small', null, ' kcal');
    $('tdee-zahl').appendChild(klein);
    $('bedarf-text').textContent = 'Um dein Gewicht zu halten, benötigst du ca. ' + tdee + ' kcal pro Tag.';
    $('bedarf-auf').hidden = false;
    $('bmr-zahl').textContent = bmr;
    $('fakt-zahl').textContent = String(aktivitaetFaktor(profil.aktivitaet)).replace('.', ',');
    $('ziel-zahl').textContent = ziel;
  } else {
    $('tdee-zahl').textContent = '–';
    $('bedarf-text').textContent = 'Fülle Größe, Gewicht, Alter und Geschlecht aus, um deinen Bedarf zu berechnen.';
    $('bedarf-auf').hidden = true;
  }

  $$('#geschlecht-chips .chip').forEach(c => {
    c.classList.toggle('aktiv', c.dataset.geschlecht === profil.geschlecht);
  });
  const alsText = (n) => (n === null || n === undefined || n === '') ? '' : String(n).replace('.', ',');
  $('p-groesse').value = alsText(profil.groesse);
  $('p-gewicht').value = alsText(profil.gewicht);
  $('p-alter').value   = alsText(profil.alter);
  $('p-geburtstag').value = profil.geburtstag || '';

  // Das Geburtsdatum hat Vorrang; das alte Altersfeld bleibt nur sichtbar,
  // solange noch keines eingetragen ist und eine Zahl gespeichert war.
  const ausGeburtstag = alterAusGeburtstag(profil.geburtstag);
  $('feld-alter').hidden = (ausGeburtstag !== null) || !profil.alter;
  $('alter-hinweis').textContent = ausGeburtstag !== null
    ? 'Du bist ' + ausGeburtstag + ' Jahre alt – das zählt von allein weiter.'
    : (profil.alter ? 'Trag dein Geburtsdatum ein, dann läuft das Alter von selbst mit.'
                    : 'Daraus wird dein Alter berechnet.');
  $('p-aktivitaet').value = profil.aktivitaet;
  $('p-ziel').value = profil.zielManuell || '';
  $('p-zielgewicht').value = alsText(profil.zielGewicht);
  $('zielgewicht-hinweis').textContent = profil.zielGewicht && profil.gewicht
    ? (Math.abs(profil.gewicht - profil.zielGewicht) < 0.05
        ? 'Du bist auf deinem Zielgewicht.'
        : 'Von ' + mengeText(profil.gewicht) + ' kg sind es noch '
          + mengeText(Math.abs(Math.round((profil.gewicht - profil.zielGewicht) * 10) / 10)) + ' kg.')
    : 'Erscheint als Linie im Gewichtsverlauf.';
  $('aktivitaet-hilfe').textContent = (AKTIVITAET.find(a => a.id === profil.aktivitaet) || {}).hilfe || '';

  const einzeln = profil.aktivModus === 'einzeln';
  $$('#aktivmodus-chips .chip').forEach(c =>
    c.classList.toggle('aktiv', c.dataset.modus === (einzeln ? 'einzeln' : 'pauschal')));
  $('feld-aktivitaet').hidden = einzeln;
  $('aktivmodus-hilfe').textContent = einzeln
    ? 'Gerechnet wird mit dem Grundumsatz plus Alltag (Faktor 1,2). Was du unter „Bewegung" einträgst, kommt für den jeweiligen Tag obendrauf.'
    : 'Dein Aktivitätslevel ist im Tagesbedarf eingerechnet. Sporteinheiten kannst du trotzdem protokollieren – sie zählen dann aber nicht zusätzlich aufs Budget.';

  renderEigeneListe();
  renderKeyStatus();
}

function renderEigeneListe(){
  const behaelter = $('eigene-liste');
  behaelter.textContent = '';
  if (!eigene.length){
    behaelter.appendChild(bau('p', 'klein leise', 'Noch keine eigenen Lebensmittel. Praktisch für Gerichte, die du oft kochst.'));
    return;
  }
  const kasten = bau('div', 'eintraege');
  for (const lm of eigene){
    const zeile = bau('button', 'eintrag');
    const txt = bau('div', 'txt');
    txt.appendChild(bau('div', 'name', lm.name));
    txt.appendChild(bau('div', 'menge', lm.kcal100 + ' kcal je 100 ' + (lm.fluessig ? 'ml' : 'g')));
    zeile.appendChild(txt);
    zeile.appendChild(bau('div', 'kcal', '›'));
    zeile.onclick = () => oeffneEigen(lm);
    kasten.appendChild(zeile);
  }
  behaelter.appendChild(kasten);
}

function renderKeyStatus(){
  const status = $('key-status');
  if (bilderkennungBereit()){
    status.textContent = 'Schlüssel hinterlegt – die Bilderkennung ist aktiv.';
    status.style.color = 'var(--akzent)';
  } else {
    status.textContent = 'Ohne Schlüssel bleibt die Bilderkennung deaktiviert.';
    status.style.color = '';
  }
}

function profilSpeichern(){
  sichere(SP.profil, profil);
  renderProfil();
  renderHeute();
}

/* ============================================================
   Suche und Auswahl
   ============================================================ */
function oeffneSuche(mahlzeit){
  zielMahlzeit = mahlzeit || mahlzeitNachUhrzeit();
  oeffneOverlay('ov-suche');
  setzeLeerKnopf();
  if (suchQuelle === 'suche' && !$('such-feld').value){
    setTimeout(() => $('such-feld').focus(), 300);
  }
  renderSuchInhalt();
}

function setzeQuelle(quelle){
  suchQuelle = quelle;
  $$('#such-reiter button').forEach(b => b.classList.toggle('aktiv', b.dataset.quelle === quelle));
  $('such-feld').closest('.suchleiste').hidden = (quelle !== 'suche');
  setzeLeerKnopf();
  renderSuchInhalt();
}

/* Der Löschknopf erscheint nur, wenn auch etwas zu löschen ist */
function setzeLeerKnopf(){
  $('such-leeren').hidden = !$('such-feld').value;
}

function renderSuchInhalt(){
  const behaelter = $('such-inhalt');
  behaelter.textContent = '';

  if (suchQuelle === 'foto'){ renderFotoBereich(behaelter); return; }

  if (suchQuelle === 'zuletzt'){
    if (!zuletzt.length){
      behaelter.appendChild(bau('p', 'hinweis', 'Hier erscheinen die Lebensmittel, die du zuletzt eingetragen hast.'));
      return;
    }
    behaelter.appendChild(trefferListe(zuletzt));
    return;
  }

  if (suchQuelle === 'eigene'){
    const knopf = bau('button', 'knopf zweit', '+ Neues Lebensmittel anlegen');
    knopf.style.marginBottom = '14px';
    knopf.onclick = () => oeffneEigen(null);
    behaelter.appendChild(knopf);
    if (!eigene.length){
      behaelter.appendChild(bau('p', 'hinweis', 'Noch keine eigenen Lebensmittel angelegt.'));
    } else {
      behaelter.appendChild(trefferListe(eigene));
    }
    return;
  }

  // Quelle „Suche"
  const suchtext = $('such-feld').value.trim();
  if (suchtext.length < 2){
    renderStoebern(behaelter);
    return;
  }
  sucheStarten(suchtext);
}

/* Ohne Suchbegriff: die Grundnahrungsmittel nach Gruppen zum Stöbern.
   Sonst bliebe die wichtigste Quelle unsichtbar, solange niemand das
   richtige Wort errät. */
function renderStoebern(behaelter){
  const hinweis = bau('p', 'klein leise');
  hinweis.style.margin = '0 2px 12px';
  hinweis.textContent = 'Tipp einen Namen ein – oder stöber hier durch die Grundnahrungsmittel.';
  behaelter.appendChild(hinweis);

  for (const [gruppe, liste] of grundnahrungGruppen()){
    const block = document.createElement('details');
    block.className = 'akkordeon';
    block.style.marginTop = '0';

    const titel = document.createElement('summary');
    titel.appendChild(text(gruppe));
    const anzahl = bau('span', 'leise klein', ' ' + liste.length);
    anzahl.style.marginLeft = 'auto';
    titel.appendChild(anzahl);
    block.appendChild(titel);

    const inhalt = bau('div', 'inhalt');
    inhalt.appendChild(trefferListe(liste, true));
    block.appendChild(inhalt);
    behaelter.appendChild(block);
  }
}

/* `ohneUntertitel` beim Stöbern: dort steht die Gruppe schon als
   Überschrift darüber, jede Zeile müsste sie nicht wiederholen. */
function trefferListe(liste, ohneUntertitel){
  const ul = bau('ul', 'treffer');
  for (const lm of liste){
    const li = document.createElement('li');
    const knopf = bau('button');

    if (lm.bild){
      const img = document.createElement('img');
      img.className = 'bild';
      img.src = lm.bild;
      img.alt = '';
      img.loading = 'lazy';
      img.onerror = () => img.remove();
      knopf.appendChild(img);
    } else {
      const platz = bau('div', 'bild');
      platz.style.display = 'grid';
      platz.style.placeItems = 'center';
      platz.style.fontSize = '18px';
      platz.textContent = lm.quelle === 'basis'
        ? (GRUPPEN_ICON[lm.gruppe] || '🍽️')
        : (lm.fluessig ? '🥤' : '🍽️');
      knopf.appendChild(platz);
    }

    const txt = bau('div', 'txt');
    txt.appendChild(bau('div', 'name', lm.name));
    if (!ohneUntertitel){
      let unter = lm.quelle === 'basis' ? lm.gruppe
        : lm.quelle === 'eigen' ? 'eigenes Lebensmittel'
        : (lm.marke || 'Open Food Facts');
      // Kam der Treffer über ein anderes Wort, gehört das dazu – sonst
      // wirkt er wie ein Fehlgriff ("Knusperstange" → "Laugenstange").
      if (lm.gefundenUeber){
        const wort = lm.gefundenUeber;
        unter += ' · auch: ' + wort.charAt(0).toUpperCase() + wort.slice(1);
      }
      txt.appendChild(bau('div', 'sub', unter));
    }
    knopf.appendChild(txt);

    const kcal = bau('div', 'kcal', Math.round(lm.kcal100) + ' kcal');
    kcal.appendChild(bau('div', null, 'je 100 ' + (lm.fluessig ? 'ml' : 'g')));
    knopf.appendChild(kcal);

    knopf.onclick = () => oeffneDetail(lm);
    li.appendChild(knopf);
    ul.appendChild(li);
  }
  return ul;
}

/* Die Suche läuft zweistufig: Grundnahrungsmittel und eigene Einträge
   stehen sofort da (sie liegen in der App), die Markenprodukte von
   Open Food Facts kommen nach. So sieht man auch dann etwas, wenn die
   Datenbank langsam ist oder gar nicht antwortet. */
function sucheStarten(suchtext){
  const behaelter = $('such-inhalt');
  behaelter.textContent = '';

  const s = suchtext.toLowerCase();
  const basis  = grundnahrungSuche(suchtext);
  const meine  = eigene.filter(lm => lm.name.toLowerCase().includes(s));

  if (meine.length){
    behaelter.appendChild(abschnitt('Eigene Lebensmittel'));
    behaelter.appendChild(trefferListe(meine));
  }
  if (basis.length){
    behaelter.appendChild(abschnitt('Grundnahrungsmittel'));
    behaelter.appendChild(trefferListe(basis));
  }

  // Platzhalter für die Markenprodukte, wird gleich ersetzt
  const markenTeil = bau('div');
  const laden = bau('div', 'hinweis');
  laden.appendChild(bau('div', 'spinner'));
  laden.appendChild(bau('div', null, 'Suche Markenprodukte …'));
  markenTeil.appendChild(laden);
  behaelter.appendChild(markenTeil);

  if (suchAbbruch) suchAbbruch.abort();
  suchAbbruch = new AbortController();

  offSuche(suchtext, suchAbbruch.signal)
    .then(treffer => {
      if (suchQuelle !== 'suche') return;
      markenTeil.textContent = '';

      // Was schon als Grundnahrungsmittel dasteht, nicht doppelt zeigen
      const bekannt = new Set(basis.map(x => x.name.toLowerCase()));
      const neue = treffer.filter(x => !bekannt.has(x.name.toLowerCase()));

      if (!neue.length){
        if (!basis.length && !meine.length) nichtsGefunden(markenTeil, suchtext);
        else markenTeil.appendChild(fussKnopf(suchtext));
        return;
      }
      markenTeil.appendChild(abschnitt('Markenprodukte', 'Open Food Facts'));
      markenTeil.appendChild(trefferListe(neue));
      markenTeil.appendChild(fussKnopf(suchtext));
    })
    .catch(fehler => {
      if (fehler.name === 'AbortError') return;
      markenTeil.textContent = '';

      if (basis.length || meine.length){
        // Es gibt bereits Treffer – die Störung nur beiläufig erwähnen
        const notiz = bau('p', 'klein leise');
        notiz.style.textAlign = 'center';
        notiz.textContent = 'Markenprodukte gerade nicht abrufbar.';
        markenTeil.appendChild(notiz);
        markenTeil.appendChild(fussKnopf(suchtext));
      } else {
        markenTeil.appendChild(bau('p', 'hinweis', fehler.message));
        markenTeil.appendChild(fussKnopf(suchtext));
      }
    });
}

function abschnitt(titel, unter){
  const kopf = bau('div');
  kopf.style.cssText = 'display:flex;align-items:baseline;gap:8px;margin:16px 2px 4px';
  const h = bau('h3', null, titel);
  h.style.cssText = 'font-size:13px;color:var(--leise);font-weight:650';
  kopf.appendChild(h);
  if (unter) kopf.appendChild(bau('span', 'klein leise', unter));
  return kopf;
}

function nichtsGefunden(behaelter, suchtext){
  behaelter.appendChild(bau('p', 'hinweis', 'Nichts gefunden. Du kannst das Lebensmittel selbst anlegen.'));
  behaelter.appendChild(fussKnopf(suchtext));
}

function fussKnopf(suchtext){
  const knopf = bau('button', 'knopf zweit', '+ „' + suchtext + '" selbst anlegen');
  knopf.style.marginTop = '14px';
  knopf.onclick = () => oeffneEigen(null, suchtext);
  return knopf;
}

/* ============================================================
   Eintrags-Fenster
   ============================================================ */
function oeffneDetail(lm, vorgabe){
  // Eigene bzw. mitgelieferte Portionen zuerst, dahinter die Standardportionen.
  // Wer schon eigene Portionen hat, bekommt nur noch die allgemeinen dazu –
  // sonst doppeln sich die Stichwortregeln mit den gepflegten Angaben.
  const eigenePortionen = (lm.portionen || []).filter(p => p && p.name && p.gramm > 0);
  const bekannt = new Set(eigenePortionen.map(p => p.name));
  const portionen = eigenePortionen.concat(
    portionenFuer(lm.name, lm.fluessig, eigenePortionen.length > 0).filter(p => !bekannt.has(p.name))
  );
  d = {
    lm: Object.assign({}, lm, { portionen }),
    modus: (vorgabe && vorgabe.modus) || 'menge',
    menge: (vorgabe && vorgabe.menge) || (lm.fluessig ? 250 : 100),
    portionIdx: 0,
    anzahl: 1,
    mahlzeit: (vorgabe && vorgabe.mahlzeit) || zielMahlzeit,
    bearbeiteId: (vorgabe && vorgabe.bearbeiteId) || null
  };

  if (vorgabe && vorgabe.portionName){
    const idx = portionen.findIndex(p => p.name === vorgabe.portionName);
    if (idx >= 0){ d.portionIdx = idx; d.anzahl = vorgabe.anzahl || 1; }
  }

  $('detail-titel').textContent = d.bearbeiteId ? 'Bearbeiten' : 'Eintragen';
  $('d-name').textContent = lm.name;
  $('d-marke').textContent = lm.marke
    || (lm.quelle === 'eigen' ? 'Eigenes Lebensmittel'
    :  lm.quelle === 'basis' ? 'Grundnahrungsmittel · ' + lm.gruppe : '');
  $('d-loeschen').hidden = !d.bearbeiteId;
  $('d-einheit').value = lm.fluessig ? 'ml' : 'g';
  $('d-basis-einheit').textContent = lm.fluessig ? 'ml' : 'g';

  // Portionsauswahl füllen
  const auswahl = $('d-portion');
  auswahl.textContent = '';
  portionen.forEach((p, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = p.name + ' – ' + p.gramm + ' ' + (lm.fluessig ? 'ml' : 'g');
    auswahl.appendChild(opt);
  });
  auswahl.value = String(d.portionIdx);
  $('d-anzahl').value = d.anzahl;

  // Mahlzeit-Chips
  const chips = $('mahlzeit-chips');
  chips.textContent = '';
  for (const m of MAHLZEITEN){
    const chip = bau('button', 'chip' + (m.id === d.mahlzeit ? ' aktiv' : ''), m.name);
    chip.onclick = () => {
      d.mahlzeit = m.id;
      $$('.chip', chips).forEach(c => c.classList.remove('aktiv'));
      chip.classList.add('aktiv');
    };
    chips.appendChild(chip);
  }

  // Nährwerttabelle
  const tabelle = $('d-naehr');
  tabelle.textContent = '';
  [['Kalorien', lm.kcal100 + ' kcal'],
   ['Eiweiß', mengeText(lm.eiweiss100) + ' g'],
   ['Fett', mengeText(lm.fett100) + ' g'],
   ['Kohlenhydrate', mengeText(lm.kh100) + ' g']].forEach(([k, v]) => {
    const tr = document.createElement('tr');
    tr.appendChild(bau('td', null, k));
    tr.appendChild(bau('td', null, v));
    tabelle.appendChild(tr);
  });

  setzeModus(d.modus);
  oeffneOverlay('ov-detail');
}

function oeffneDetailZumBearbeiten(x){
  const lm = {
    id: x.lmId, quelle: x.quelle, name: x.name, marke: x.marke, bild:'',
    fluessig: x.einheit === 'ml',
    kcal100: x.kcal100, eiweiss100: x.eiweiss100, fett100: x.fett100, kh100: x.kh100,
    portionen: x.portionen || portionenFuer(x.name, x.einheit === 'ml')
  };
  oeffneDetail(lm, {
    modus: x.portionName ? 'portion' : 'menge',
    menge: x.menge,
    portionName: x.portionName,
    anzahl: x.anzahl,
    mahlzeit: x.mahlzeit,
    bearbeiteId: x.id
  });
}

function setzeModus(modus){
  d.modus = modus;
  $$('#modus-chips .chip').forEach(c => c.classList.toggle('aktiv', c.dataset.modus === modus));
  $('feld-menge').hidden   = (modus !== 'menge');
  $('feld-portion').hidden = (modus !== 'portion');
  $('menge-label').textContent = 'Menge in ' + (d.lm.fluessig ? 'Milliliter' : 'Gramm');
  if (modus === 'menge') $('d-menge').value = Math.round(d.menge);
  detailRechnen();
}

/* Wie viel Gramm bzw. Milliliter ergibt die aktuelle Eingabe? */
function detailGramm(){
  if (d.modus === 'menge') return d.menge;
  const p = d.lm.portionen[d.portionIdx];
  return p ? p.gramm * d.anzahl : 0;
}

function detailRechnen(){
  const gramm = detailGramm();
  const f = gramm / 100;
  const einheit = d.lm.fluessig ? 'ml' : 'g';

  $('d-kcal').textContent = Math.round(d.lm.kcal100 * f);
  $('d-makros').textContent = '';
  [['Eiweiß', d.lm.eiweiss100 * f], ['Fett', d.lm.fett100 * f], ['KH', d.lm.kh100 * f]].forEach(([k, v]) => {
    $('d-makros').appendChild(bau('span', null, k + ' ' + mengeText(Math.round(v * 10) / 10) + ' g'));
  });
  $('d-portion-gramm').value = Math.round(gramm) + ' ' + einheit;
}

function detailSpeichern(){
  const gramm = detailGramm();
  if (!gramm || gramm <= 0){ toast('Bitte eine Menge angeben.'); return; }
  if (gramm > 20000){ toast('Das ist zu viel – bitte prüf die Menge.'); return; }

  const f = gramm / 100;
  const portion = d.modus === 'portion' ? d.lm.portionen[d.portionIdx] : null;

  const eintrag = {
    id: d.bearbeiteId || neueId(),
    datum: aktDatum,
    zeit: new Date().toISOString(),
    mahlzeit: d.mahlzeit,
    name: d.lm.name,
    marke: d.lm.marke || '',
    menge: Math.round(gramm * 10) / 10,
    einheit: d.lm.fluessig ? 'ml' : 'g',
    portionName: portion ? portion.name : null,
    anzahl: portion ? d.anzahl : null,
    kcal:    Math.round(d.lm.kcal100 * f),
    eiweiss: Math.round(d.lm.eiweiss100 * f * 10) / 10,
    fett:    Math.round(d.lm.fett100 * f * 10) / 10,
    kh:      Math.round(d.lm.kh100 * f * 10) / 10,
    kcal100: d.lm.kcal100, eiweiss100: d.lm.eiweiss100, fett100: d.lm.fett100, kh100: d.lm.kh100,
    portionen: d.lm.portionen,
    quelle: d.lm.quelle,
    lmId: d.lm.id
  };

  if (d.bearbeiteId){
    const i = eintraege.findIndex(x => x.id === d.bearbeiteId);
    if (i >= 0){
      eintrag.datum = eintraege[i].datum;
      eintrag.zeit  = eintraege[i].zeit;
      eintraege[i] = eintrag;
    }
  } else {
    eintraege.push(eintrag);
    merkeZuletzt(d.lm);
  }

  sichere(SP.eintraege, eintraege);
  schliesseOverlay('ov-detail');
  renderHeute();
  toast(d.bearbeiteId ? 'Geändert' : Math.round(eintrag.kcal) + ' kcal eingetragen');
}

function eintragLoeschen(){
  eintraege = eintraege.filter(x => x.id !== d.bearbeiteId);
  sichere(SP.eintraege, eintraege);
  schliesseOverlay('ov-detail');
  renderHeute();
  toast('Eintrag gelöscht');
}

function merkeZuletzt(lm){
  zuletzt = [lm].concat(zuletzt.filter(x => x.id !== lm.id)).slice(0, 30);
  sichere(SP.zuletzt, zuletzt);
}

/* ============================================================
   Eigene Lebensmittel
   ============================================================ */
function oeffneEigen(lm, namensVorschlag){
  e = {
    id: lm ? lm.id : null,
    fluessig: lm ? lm.fluessig : false,
    portionen: lm ? lm.portionen.slice() : []
  };
  $('eigen-titel').textContent = lm ? 'Bearbeiten' : 'Eigenes Lebensmittel';
  $('e-name').value    = lm ? lm.name : (namensVorschlag || '');
  $('e-kcal').value    = lm ? lm.kcal100 : '';
  $('e-eiweiss').value = lm ? lm.eiweiss100 : '';
  $('e-fett').value    = lm ? lm.fett100 : '';
  $('e-kh').value      = lm ? lm.kh100 : '';
  $('e-loeschen').hidden = !lm;
  setzeArt(e.fluessig ? 'fluessig' : 'fest');
  renderEigenPortionen();
  oeffneOverlay('ov-eigen');
}

function setzeArt(art){
  e.fluessig = (art === 'fluessig');
  $$('#e-art-chips .chip').forEach(c => c.classList.toggle('aktiv', c.dataset.art === art));
  $$('.e-einheit').forEach(x => x.textContent = e.fluessig ? 'ml' : 'g');
}

function renderEigenPortionen(){
  const behaelter = $('e-portionen');
  behaelter.textContent = '';
  e.portionen.forEach((p, i) => {
    const reihe = bau('div', 'feld-reihe');
    reihe.style.marginBottom = '8px';

    const name = document.createElement('input');
    name.type = 'text'; name.value = p.name; name.placeholder = 'z. B. 1 Teller';
    name.oninput = () => { e.portionen[i].name = name.value; };
    Object.assign(name.style, { padding:'11px 12px', border:'1px solid var(--rand)', borderRadius:'var(--r-klein)', background:'var(--bg)' });

    const gramm = document.createElement('input');
    gramm.type = 'text'; gramm.inputMode = 'numeric'; gramm.value = p.gramm;
    gramm.style.maxWidth = '100px';
    gramm.oninput = () => { e.portionen[i].gramm = zahlOderNull(gramm.value) || 0; };
    Object.assign(gramm.style, { padding:'11px 12px', border:'1px solid var(--rand)', borderRadius:'var(--r-klein)', background:'var(--bg)' });

    const weg = bau('button', null, '✕');
    weg.style.flex = 'none'; weg.style.width = '38px'; weg.style.color = 'var(--leise)';
    weg.onclick = () => { e.portionen.splice(i, 1); renderEigenPortionen(); };

    reihe.appendChild(name); reihe.appendChild(gramm); reihe.appendChild(weg);
    behaelter.appendChild(reihe);
  });
}

function eigenSpeichern(){
  const name = $('e-name').value.trim();
  const kcal = zahlOderNull($('e-kcal').value);
  if (!name){ toast('Bitte einen Namen angeben.'); return; }
  if (kcal === null || kcal < 0){ toast('Bitte die Kalorien je 100 angeben.'); return; }
  if (kcal > 902){ toast('Mehr als 902 kcal je 100 g gibt es nicht – das schafft nicht mal reines Fett.'); return; }

  const lm = {
    id: e.id || 'eigen:' + neueId(),
    quelle: 'eigen',
    name,
    marke: '',
    bild: '',
    fluessig: e.fluessig,
    kcal100: kcal,
    eiweiss100: zahlOderNull($('e-eiweiss').value) || 0,
    fett100:    zahlOderNull($('e-fett').value) || 0,
    kh100:      zahlOderNull($('e-kh').value) || 0,
    portionen: e.portionen.filter(p => p.name.trim() && p.gramm > 0)
  };
  if (!lm.portionen.length) lm.portionen = portionenFuer(name, e.fluessig);

  const i = eigene.findIndex(x => x.id === lm.id);
  if (i >= 0) eigene[i] = lm; else eigene.push(lm);
  sichere(SP.eigene, eigene);

  schliesseOverlay('ov-eigen');
  renderEigeneListe();
  if (istOffen('ov-suche')) renderSuchInhalt();
  toast('Gesichert');

  // Direkt eintragen, wenn es ein neues Lebensmittel war
  if (i < 0 && istOffen('ov-suche')) setTimeout(() => oeffneDetail(lm), 200);
}

function eigenLoeschen(){
  eigene = eigene.filter(x => x.id !== e.id);
  sichere(SP.eigene, eigene);
  schliesseOverlay('ov-eigen');
  renderEigeneListe();
  if (istOffen('ov-suche')) renderSuchInhalt();
  toast('Gelöscht');
}

/* ============================================================
   Bilderkennung (optional)
   ============================================================ */
function renderFotoBereich(behaelter){
  behaelter.textContent = '';

  const fahne = bau('div');
  fahne.style.marginBottom = '12px';
  fahne.appendChild(bau('span', 'stretch-fahne', 'Optional'));
  behaelter.appendChild(fahne);

  if (!bilderkennungBereit()){
    const kasten = bau('div', 'warnung');
    kasten.appendChild(bau('b', null, 'Noch nicht eingerichtet'));
    kasten.appendChild(bau('p', null, 'Die Bilderkennung braucht einen eigenen API-Schlüssel von Anthropic. Du hinterlegst ihn im Profil; er bleibt auf diesem Gerät.'));
    kasten.querySelector('p').style.margin = '6px 0 0';
    behaelter.appendChild(kasten);
    const knopf = bau('button', 'knopf zweit', 'Zum Profil');
    knopf.onclick = () => { schliesseOverlay('ov-suche'); zeigeScreen('profil'); };
    behaelter.appendChild(knopf);
    return;
  }

  const warnung = bau('div', 'warnung');
  warnung.textContent = 'Geschätzte Werte: Portionsgrößen lassen sich auf Fotos nur ungefähr bestimmen, '
    + 'und verdeckte Zutaten wie Öl oder Zucker sieht man gar nicht. Prüf jeden Vorschlag, bevor du ihn übernimmst.';
  behaelter.appendChild(warnung);

  if (!fotoErgebnis){
    const feld = bau('button', 'foto-feld');
    feld.innerHTML = '<svg viewBox="0 0 24 24"><path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2L8 5h8l1.5 2h2A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z"/><circle cx="12" cy="12.5" r="3.5"/></svg>';
    feld.appendChild(bau('div', null, 'Foto aufnehmen oder auswählen'));
    feld.onclick = () => $('foto-input').click();
    behaelter.appendChild(feld);
    return;
  }

  if (fotoErgebnis.laedt){
    const laden = bau('div', 'hinweis');
    laden.appendChild(bau('div', 'spinner'));
    laden.appendChild(bau('div', null, 'Claude schaut sich das Foto an …'));
    behaelter.appendChild(bildVorschau());
    behaelter.appendChild(laden);
    return;
  }

  behaelter.appendChild(bildVorschau());

  if (fotoErgebnis.fehler){
    behaelter.appendChild(bau('p', 'hinweis', fotoErgebnis.fehler));
    behaelter.appendChild(nochmalKnopf());
    return;
  }

  const erg = fotoErgebnis.daten;
  if (!erg.erkannt || !erg.posten.length){
    behaelter.appendChild(bau('p', 'hinweis', 'Darauf war nichts Essbares zu erkennen.'));
    behaelter.appendChild(nochmalKnopf());
    return;
  }

  if (erg.gericht){
    const titel = bau('h3', null, erg.gericht);
    titel.style.margin = '0 0 4px';
    behaelter.appendChild(titel);
  }
  if (erg.hinweis){
    const h = bau('p', 'klein leise', erg.hinweis);
    h.style.margin = '0 0 14px';
    behaelter.appendChild(h);
  }

  const SICHER = { hoch:'sichere Schätzung', mittel:'ungefähr', gering:'sehr grobe Schätzung' };
  for (const p of erg.posten){
    const knopf = bau('button', 'vorschlag');
    const txt = bau('div', 'txt');
    txt.appendChild(bau('div', 'name', p.name));
    txt.appendChild(bau('div', 'sub', p.menge + ' ' + (p.fluessig ? 'ml' : 'g') + ' · ' + (SICHER[p.sicherheit] || '')));
    knopf.appendChild(txt);
    knopf.appendChild(bau('div', 'kcal', Math.round(p.kcal100 * p.menge / 100) + ' kcal'));
    knopf.onclick = () => oeffneDetail(postenAlsLebensmittel(p), { menge: p.menge });
    behaelter.appendChild(knopf);
  }

  const hinweis = bau('p', 'klein leise');
  hinweis.textContent = 'Tippe einen Vorschlag an, um Menge und Werte zu prüfen und ihn einzutragen.';
  behaelter.appendChild(hinweis);

  const alle = bau('button', 'knopf', 'Alle ' + erg.posten.length + ' Posten übernehmen');
  alle.onclick = () => alleUebernehmen(erg.posten);
  behaelter.appendChild(alle);
  behaelter.appendChild(nochmalKnopf());
}

function bildVorschau(){
  const img = document.createElement('img');
  img.className = 'foto-vorschau';
  img.src = fotoErgebnis.vorschau;
  img.alt = 'Aufgenommenes Foto';
  return img;
}

function nochmalKnopf(){
  const knopf = bau('button', 'knopf zweit', 'Anderes Foto');
  knopf.style.marginTop = '10px';
  knopf.onclick = () => { fotoErgebnis = null; renderSuchInhalt(); };
  return knopf;
}

function postenAlsLebensmittel(p){
  return {
    id: 'foto:' + neueId(),
    quelle: 'foto',
    name: p.name,
    marke: 'aus Foto geschätzt',
    bild: '',
    fluessig: p.fluessig,
    kcal100: p.kcal100,
    eiweiss100: p.eiweiss100,
    fett100: p.fett100,
    kh100: p.kh100,
    portionen: portionenFuer(p.name, p.fluessig)
  };
}

function alleUebernehmen(posten){
  for (const p of posten){
    const f = p.menge / 100;
    eintraege.push({
      id: neueId(),
      datum: aktDatum,
      zeit: new Date().toISOString(),
      mahlzeit: zielMahlzeit,
      name: p.name,
      marke: 'aus Foto geschätzt',
      menge: p.menge,
      einheit: p.fluessig ? 'ml' : 'g',
      portionName: null, anzahl: null,
      kcal:    Math.round(p.kcal100 * f),
      eiweiss: Math.round(p.eiweiss100 * f * 10) / 10,
      fett:    Math.round(p.fett100 * f * 10) / 10,
      kh:      Math.round(p.kh100 * f * 10) / 10,
      kcal100: p.kcal100, eiweiss100: p.eiweiss100, fett100: p.fett100, kh100: p.kh100,
      portionen: portionenFuer(p.name, p.fluessig),
      quelle: 'foto',
      lmId: null
    });
  }
  sichere(SP.eintraege, eintraege);
  fotoErgebnis = null;
  schliesseOverlay('ov-suche');
  renderHeute();
  toast(posten.length + ' Posten eingetragen');
}

function fotoGewaehlt(datei){
  if (!datei) return;
  fotoErgebnis = { laedt:true, vorschau: URL.createObjectURL(datei) };
  renderSuchInhalt();

  fotoAnalysieren(datei)
    .then(daten => { fotoErgebnis = { vorschau: fotoErgebnis.vorschau, daten }; })
    .catch(fehler => { fotoErgebnis = { vorschau: fotoErgebnis.vorschau, fehler: fehler.message }; })
    .finally(() => { if (suchQuelle === 'foto') renderSuchInhalt(); });
}

/* ============================================================
   CSV-Export
   ============================================================ */
function csvExport(){
  if (!eintraege.length){ toast('Noch keine Einträge zum Exportieren.'); return; }

  const spalten = ['Datum','Mahlzeit','Name','Marke','Menge','Einheit','Portion','Anzahl','kcal','Eiweiss_g','Fett_g','Kohlenhydrate_g'];
  const zeilen = [spalten.join(';')];

  for (const x of eintraege.slice().sort((a, b) => a.datum.localeCompare(b.datum) || a.zeit.localeCompare(b.zeit))){
    const mahlzeit = (MAHLZEITEN.find(m => m.id === x.mahlzeit) || {}).name || x.mahlzeit;
    zeilen.push([
      x.datum, mahlzeit, feld(x.name), feld(x.marke),
      komma(x.menge), x.einheit, feld(x.portionName || ''), x.anzahl === null ? '' : komma(x.anzahl),
      x.kcal, komma(x.eiweiss), komma(x.fett), komma(x.kh)
    ].join(';'));
  }

  // BOM, damit Excel die Umlaute richtig liest
  const blob = new Blob(['﻿' + zeilen.join('\r\n')], { type:'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'wasgegessen-' + heuteStr() + '.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('CSV wird heruntergeladen');

  function feld(wert){
    const s = String(wert || '');
    return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function komma(n){ return String(n).replace('.', ','); }
}

/* ============================================================
   Overlays, Bildschirme, Toast
   ============================================================ */
function oeffneOverlay(id){
  $(id).classList.add('auf');
  document.body.style.overflow = 'hidden';
}
function schliesseOverlay(id){
  $(id).classList.remove('auf');
  if (!$$('.overlay.auf').length) document.body.style.overflow = '';
}
function istOffen(id){ return $(id).classList.contains('auf'); }

function zeigeScreen(name){
  aktScreen = name;
  ['heute','verlauf','profil'].forEach(s => { $('s-' + s).hidden = (s !== name); });
  $$('.tabs button[data-screen]').forEach(b => b.classList.toggle('aktiv', b.dataset.screen === name));
  $('datum-nav').hidden = (name !== 'heute');
  window.scrollTo(0, 0);

  if (name === 'heute')   { renderDatum(); renderHeute(); }
  if (name === 'verlauf') renderVerlauf();
  if (name === 'profil')  renderProfil();
}

let toastTimer = null;
function toast(nachricht){
  const t = $('toast');
  t.textContent = nachricht;
  t.classList.add('an');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('an'), 2200);
}

/* ============================================================
   Verdrahtung
   ============================================================ */
function verdrahten(){
  // Tabs
  $$('.tabs button[data-screen]').forEach(b => {
    b.onclick = () => zeigeScreen(b.dataset.screen);
  });
  $('tab-plus').onclick = () => oeffneSuche(null);

  // Datum
  $('tag-zurueck').onclick = () => { aktDatum = tageDazu(aktDatum, -1); renderDatum(); renderHeute(); };
  $('tag-vor').onclick     = () => {
    if (aktDatum === heuteStr()) return;
    aktDatum = tageDazu(aktDatum, 1); renderDatum(); renderHeute();
  };

  // Overlays schließen
  $$('[data-schliessen]').forEach(b => {
    b.onclick = () => schliesseOverlay(b.dataset.schliessen);
  });
  document.addEventListener('keydown', ev => {
    if (ev.key !== 'Escape') return;
    const offen = $$('.overlay.auf').pop();
    if (offen) schliesseOverlay(offen.id);
  });

  // Suche
  $('such-feld').addEventListener('input', () => {
    setzeLeerKnopf();
    clearTimeout(suchTimer);
    suchTimer = setTimeout(renderSuchInhalt, 600);
  });
  $('such-leeren').onclick = () => {
    $('such-feld').value = '';
    setzeLeerKnopf();
    clearTimeout(suchTimer);
    if (suchAbbruch) suchAbbruch.abort();
    renderSuchInhalt();
    $('such-feld').focus();
  };
  $$('#such-reiter button').forEach(b => {
    b.onclick = () => setzeQuelle(b.dataset.quelle);
  });

  // Eintrags-Fenster
  $$('#modus-chips .chip').forEach(c => { c.onclick = () => setzeModus(c.dataset.modus); });
  $('d-menge').addEventListener('input', () => {
    d.menge = zahlOderNull($('d-menge').value) || 0;
    detailRechnen();
  });
  $('d-einheit').addEventListener('change', () => {
    d.lm.fluessig = ($('d-einheit').value === 'ml');
    $('d-basis-einheit').textContent = d.lm.fluessig ? 'ml' : 'g';
    setzeModus(d.modus);
  });
  $('d-portion').addEventListener('change', () => {
    d.portionIdx = Number($('d-portion').value);
    detailRechnen();
  });
  $('d-anzahl').addEventListener('input', () => {
    d.anzahl = zahlOderNull($('d-anzahl').value) || 0;
    detailRechnen();
  });
  $('detail-speichern').onclick = detailSpeichern;
  $('d-loeschen').onclick = () => {
    if (confirm('Diesen Eintrag wirklich löschen?')) eintragLoeschen();
  };

  // Eigene Lebensmittel
  $$('#e-art-chips .chip').forEach(c => { c.onclick = () => setzeArt(c.dataset.art); });
  $('e-portion-plus').onclick = () => {
    e.portionen.push({ name:'', gramm:100 });
    renderEigenPortionen();
  };
  $('eigen-speichern').onclick = eigenSpeichern;
  $('e-loeschen').onclick = () => {
    if (confirm('Dieses Lebensmittel wirklich löschen?')) eigenLoeschen();
  };
  $('neu-eigen').onclick = () => oeffneEigen(null);

  // Foto
  $('foto-input').addEventListener('change', ev => {
    fotoGewaehlt(ev.target.files[0]);
    ev.target.value = '';
  });

  // Profil
  $$('#geschlecht-chips .chip').forEach(c => {
    c.onclick = () => { profil.geschlecht = c.dataset.geschlecht; profilSpeichern(); };
  });
  // Die Felder sind Textfelder, damit auch ein Komma als Dezimaltrenner geht.
  // Grenzen deshalb hier prüfen: unsinnige Werte werden auf den Rand gezogen.
  const zahlenFelder = [
    ['p-groesse', 'groesse',     100, 250],
    ['p-gewicht', 'gewicht',      20, 400],
    ['p-alter',   'alter',        10, 120],
    ['p-ziel',    'zielManuell', 500, 9000],
    ['p-zielgewicht', 'zielGewicht', 20, 400]
  ];
  for (const [id, schluessel, min, max] of zahlenFelder){
    $(id).addEventListener('change', () => {
      const roh = $(id).value.trim();
      let wert = roh ? zahlOderNull(roh) : null;
      if (wert !== null){
        wert = Math.min(max, Math.max(min, wert));
        wert = Math.round(wert * 10) / 10;
        $(id).value = String(wert).replace('.', ',');
      } else {
        $(id).value = '';
      }
      profil[schluessel] = wert;
      profilSpeichern();
    });
  }

  // Ein im Profil geändertes Gewicht ist zugleich eine Wiegung von heute –
  // sonst stünde es nirgends im Verlauf.
  $('p-gewicht').addEventListener('change', () => {
    const kg = zahlOderNull($('p-gewicht').value);
    if (kg !== null) gewichtSetzen(heuteStr(), Math.round(kg * 10) / 10);
  });

  // Bewegung
  $$('#aktivmodus-chips .chip').forEach(c => {
    c.onclick = () => { profil.aktivModus = c.dataset.modus; profilSpeichern(); };
  });
  $('sp-art').addEventListener('change', () => { sp.art = $('sp-art').value; sportRechnen(); });
  $('sp-dauer').addEventListener('input', () => {
    sp.minuten = Math.round(zahlOderNull($('sp-dauer').value) || 0);
    sportRechnen();
  });
  $$('#sp-dauer-chips .chip').forEach(c => {
    c.onclick = () => {
      sp.minuten = Number(c.dataset.min);
      $('sp-dauer').value = sp.minuten;
      sportRechnen();
    };
  });
  $('sport-speichern').onclick = sportSpeichern;
  $('sp-loeschen').onclick = () => {
    if (confirm('Diese Einheit wirklich löschen?')) sportLoeschen();
  };

  $('wiege-sichern').onclick = wiegenEintragen;
  $('wiege-feld').addEventListener('keydown', ev => {
    if (ev.key === 'Enter') wiegenEintragen();
  });
  $('wiege-spaeter').onclick = () => {
    wiegenVertagt = heuteStr();
    renderWiegeKarte();
  };

  $('p-geburtstag').addEventListener('change', () => {
    const wert = $('p-geburtstag').value;
    const alter = alterAusGeburtstag(wert);
    if (wert && alter === null){
      toast('Das Geburtsdatum ergibt kein sinnvolles Alter.');
      $('p-geburtstag').value = profil.geburtstag || '';
      return;
    }
    profil.geburtstag = wert || null;
    // Die alte feste Zahl wird überflüssig, sobald ein Datum da ist
    if (alter !== null) profil.alter = null;
    profilSpeichern();
  });

  const auswahl = $('p-aktivitaet');
  for (const a of AKTIVITAET){
    const opt = document.createElement('option');
    opt.value = a.id;
    opt.textContent = a.name + ' (×' + String(a.faktor).replace('.', ',') + ')';
    auswahl.appendChild(opt);
  }
  auswahl.addEventListener('change', () => { profil.aktivitaet = auswahl.value; profilSpeichern(); });

  $('p-key').addEventListener('change', () => {
    const wert = $('p-key').value.trim();
    try {
      if (wert) localStorage.setItem(SP.key, wert);
      else localStorage.removeItem(SP.key);
    } catch {}
    renderKeyStatus();
    toast(wert ? 'Schlüssel gespeichert' : 'Schlüssel entfernt');
  });
  $('p-modell').addEventListener('change', () => {
    try { localStorage.setItem(SP.modell, $('p-modell').value); } catch {}
  });

  // Verlauf
  $$('#zeitraum-chips .chip').forEach(c => {
    c.onclick = () => {
      aktZeitraum = c.dataset.zeitraum;
      $$('#zeitraum-chips .chip').forEach(x => x.classList.remove('aktiv'));
      c.classList.add('aktiv');
      renderVerlauf();
    };
  });

  // Daten
  $('export-csv').onclick = csvExport;
  $('alles-loeschen').onclick = () => {
    if (!confirm('Wirklich alle Einträge, eigenen Lebensmittel und Profildaten löschen?')) return;
    if (!confirm('Das lässt sich nicht rückgängig machen. Sicher?')) return;
    Object.values(SP).forEach(k => { try { localStorage.removeItem(k); } catch {} });
    location.reload();
  };

  // Kopfzeile absetzen, sobald gescrollt wird
  window.addEventListener('scroll', () => {
    $('kopf').classList.toggle('scrollt', window.scrollY > 4);
  }, { passive:true });
}

/* ---------- Start ---------- */
function start(){
  $('version').textContent = 'v' + APP_VERSION;

  // Gespeicherten Schlüssel und Modellwahl anzeigen
  try {
    $('p-key').value = localStorage.getItem(SP.key) || '';
    const m = localStorage.getItem(SP.modell);
    if (m) $('p-modell').value = m;
  } catch {}

  verdrahten();
  zeigeScreen('heute');

  // Beim Tageswechsel im Hintergrund auf den neuen Tag springen
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (aktScreen === 'heute' && aktDatum < heuteStr()){
      aktDatum = heuteStr();
      renderDatum();
      renderHeute();
    }
  });

  if ('serviceWorker' in navigator){
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();

})();
