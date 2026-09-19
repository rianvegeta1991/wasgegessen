/* ============================================================
   WasGegessen? – Stammdaten und Rechenformeln
   Alles, was sich nicht ändert: Aktivitätsstufen, Mahlzeiten,
   Standardportionen und die Bedarfsrechnung.
   ============================================================ */

/* ---------- Aktivitätslevel (PAL-Faktoren) ---------- */
const AKTIVITAET = [
  { id:'sitzend',  faktor:1.2,  name:'Sitzend',        hilfe:'Bürojob, kaum Bewegung, kein Sport' },
  { id:'leicht',   faktor:1.375, name:'Leicht aktiv',  hilfe:'Leichter Sport 1–3 Tage pro Woche' },
  { id:'moderat',  faktor:1.55, name:'Moderat aktiv',  hilfe:'Sport 3–5 Tage pro Woche' },
  { id:'sehr',     faktor:1.725, name:'Sehr aktiv',    hilfe:'Sport 6–7 Tage pro Woche' },
  { id:'extrem',   faktor:1.9,  name:'Extrem aktiv',   hilfe:'Harter Sport täglich oder körperliche Arbeit' }
];

/* ---------- Mahlzeiten ---------- */
const MAHLZEITEN = [
  { id:'fruehstueck', name:'Frühstück',   icon:'☕' },
  { id:'mittag',      name:'Mittagessen', icon:'🍽️' },
  { id:'abend',       name:'Abendessen',  icon:'🌙' },
  { id:'snack',       name:'Snacks',      icon:'🍎' }
];

/* Mahlzeit nach Tageszeit vorschlagen */
function mahlzeitNachUhrzeit(){
  const h = new Date().getHours();
  if (h < 10.5) return 'fruehstueck';
  if (h < 15)   return 'mittag';
  if (h < 21)   return 'abend';
  return 'snack';
}

/* ---------- Standardportionen ----------
   Durchschnittsgewichte für die Portionseingabe. Greift über
   Stichwörter im Lebensmittelnamen; `muster` wird klein
   geschrieben gegen den Namen geprüft.                        */
const PORTIONS_REGELN = [
  { muster:['brot','toast','baguette','brötchen','semmel','knäcke'], portionen:[
      { name:'1 Scheibe', gramm:45 }, { name:'1 Brötchen', gramm:60 }, { name:'1 dicke Scheibe', gramm:70 } ] },
  { muster:['reis'],        portionen:[ { name:'1 Tasse gekocht', gramm:180 }, { name:'1 Portion roh', gramm:75 }, { name:'1 Teller', gramm:250 } ] },
  { muster:['nudel','pasta','spaghetti','penne','makkaroni'], portionen:[
      { name:'1 Portion roh', gramm:100 }, { name:'1 Teller gekocht', gramm:250 } ] },
  { muster:['kartoffel'],   portionen:[ { name:'1 mittelgroße', gramm:150 }, { name:'1 Portion', gramm:250 } ] },
  { muster:['apfel'],       portionen:[ { name:'1 Apfel', gramm:130 }, { name:'1 großer Apfel', gramm:180 } ] },
  { muster:['banane'],      portionen:[ { name:'1 Banane', gramm:120 }, { name:'1 große Banane', gramm:150 } ] },
  { muster:['orange','mandarine','clementine'], portionen:[ { name:'1 Stück', gramm:130 } ] },
  { muster:['birne'],       portionen:[ { name:'1 Birne', gramm:150 } ] },
  { muster:['tomate'],      portionen:[ { name:'1 Tomate', gramm:100 }, { name:'1 Cocktailtomate', gramm:15 } ] },
  { muster:['gurke'],       portionen:[ { name:'1 Scheibe', gramm:10 }, { name:'1 halbe Gurke', gramm:200 } ] },
  { muster:['ei ','eier','hühnerei'], portionen:[ { name:'1 Ei (M)', gramm:58 }, { name:'1 Ei (L)', gramm:68 } ] },
  { muster:['käse','gouda','emmentaler','cheddar'], portionen:[ { name:'1 Scheibe', gramm:30 }, { name:'1 Würfel', gramm:20 } ] },
  { muster:['wurst','salami','schinken','aufschnitt'], portionen:[ { name:'1 Scheibe', gramm:25 } ] },
  { muster:['butter','margarine'], portionen:[ { name:'1 Teelöffel', gramm:5 }, { name:'1 Esslöffel', gramm:15 }, { name:'1 Portion', gramm:10 } ] },
  { muster:['öl','olivenöl'], portionen:[ { name:'1 Teelöffel', gramm:5 }, { name:'1 Esslöffel', gramm:13 } ] },
  { muster:['zucker','honig','marmelade','konfitüre','nutella','nuss-nougat'], portionen:[
      { name:'1 Teelöffel', gramm:6 }, { name:'1 Esslöffel', gramm:20 } ] },
  { muster:['joghurt','quark','skyr'], portionen:[ { name:'1 Becher', gramm:150 }, { name:'1 großer Becher', gramm:250 } ] },
  { muster:['müsli','cornflakes','haferflocken','granola'], portionen:[ { name:'1 Portion', gramm:50 }, { name:'1 Schüssel', gramm:80 } ] },
  { muster:['schokolade','riegel'], portionen:[ { name:'1 Riegel', gramm:50 }, { name:'1 Stück', gramm:10 }, { name:'1 Tafel', gramm:100 } ] },
  { muster:['keks','plätzchen','cookie'], portionen:[ { name:'1 Keks', gramm:12 }, { name:'1 Handvoll', gramm:40 } ] },
  { muster:['chips','flips','erdnuss','nüsse','mandel','cashew','walnuss'], portionen:[
      { name:'1 Handvoll', gramm:25 }, { name:'1 kleine Tüte', gramm:50 } ] },
  { muster:['pizza'],       portionen:[ { name:'1 Stück', gramm:125 }, { name:'1 ganze Pizza', gramm:400 } ] },
  { muster:['hähnchen','hühner','pute','schnitzel','steak','fleisch','rind','schwein'], portionen:[
      { name:'1 Portion', gramm:150 }, { name:'1 kleine Portion', gramm:100 } ] },
  { muster:['lachs','fisch','thunfisch','forelle'], portionen:[ { name:'1 Filet', gramm:140 }, { name:'1 Portion', gramm:120 } ] },
  { muster:['suppe','eintopf','soße','sauce'], portionen:[ { name:'1 Teller', gramm:300 }, { name:'1 Tasse', gramm:200 } ] },
  { muster:['salat'],       portionen:[ { name:'1 Portion', gramm:120 }, { name:'1 Schüssel', gramm:250 } ] }
];

/* Portionen für Flüssiges (Basis Milliliter) */
const PORTIONS_REGELN_FLUESSIG = [
  { muster:['kaffee','espresso','tee'],  portionen:[ { name:'1 Tasse', gramm:150 }, { name:'1 große Tasse', gramm:250 }, { name:'1 Espresso', gramm:30 } ] },
  { muster:['milch','buttermilch','sahne'], portionen:[ { name:'1 Glas', gramm:200 }, { name:'1 Schuss', gramm:30 }, { name:'1 Tasse', gramm:150 } ] },
  { muster:['bier'],  portionen:[ { name:'1 Glas (0,3 l)', gramm:300 }, { name:'1 Flasche (0,5 l)', gramm:500 } ] },
  { muster:['wein','sekt','prosecco'], portionen:[ { name:'1 Glas', gramm:200 }, { name:'1 kleines Glas', gramm:125 } ] },
  { muster:['saft','schorle','limonade','cola','limo','sprudel','wasser','smoothie'], portionen:[
      { name:'1 Glas', gramm:250 }, { name:'1 Flasche (0,5 l)', gramm:500 }, { name:'1 Dose (0,33 l)', gramm:330 } ] }
];

/* Allgemeine Rückfallportionen, wenn kein Stichwort greift */
const PORTIONEN_ALLGEMEIN_FEST = [
  { name:'1 kleine Portion', gramm:100 },
  { name:'1 Portion',        gramm:200 },
  { name:'1 große Portion',  gramm:350 },
  { name:'1 Esslöffel',      gramm:15 },
  { name:'1 Teelöffel',      gramm:5 }
];
const PORTIONEN_ALLGEMEIN_FLUESSIG = [
  { name:'1 Glas',       gramm:250 },
  { name:'1 Tasse',      gramm:150 },
  { name:'1 kleines Glas', gramm:125 },
  { name:'1 Flasche (0,5 l)', gramm:500 }
];

/* Wörter, die auf ein Getränk hindeuten */
const FLUESSIG_WOERTER = [
  'wasser','saft','cola','limo','limonade','schorle','bier','wein','sekt','prosecco',
  'milch','kaffee','tee','espresso','smoothie','drink','getränk','shake','buttermilch',
  'sirup','energy','brause','nektar','likör','whisky','wodka','rum','gin','sahne'
];

/* Ist der Name ein Getränk? */
function istFluessig(name){
  const n = (name || '').toLowerCase();
  return FLUESSIG_WOERTER.some(w => n.includes(w));
}

/* Passende Standardportionen zu einem Namen finden.
   Liefert immer mindestens die allgemeine Liste zurück. */
function portionenFuer(name, fluessig){
  const n = (name || '').toLowerCase();
  const regeln = fluessig ? PORTIONS_REGELN_FLUESSIG : PORTIONS_REGELN;
  const treffer = [];
  for (const regel of regeln){
    if (regel.muster.some(m => n.includes(m))) treffer.push(...regel.portionen);
  }
  const basis = fluessig ? PORTIONEN_ALLGEMEIN_FLUESSIG : PORTIONEN_ALLGEMEIN_FEST;
  // Treffer zuerst, danach die allgemeinen – ohne Namensdoppler
  const namen = new Set(treffer.map(p => p.name));
  return treffer.concat(basis.filter(p => !namen.has(p.name)));
}

/* ============================================================
   Bedarfsrechnung
   ============================================================ */

/* Grundumsatz nach Mifflin-St-Jeor.
   Männer: 10×kg + 6,25×cm − 5×Alter + 5
   Frauen: 10×kg + 6,25×cm − 5×Alter − 161 */
function berechneBMR(profil){
  const { gewicht, groesse, alter, geschlecht } = profil;
  if (!gewicht || !groesse || !alter || !geschlecht) return null;
  const basis = 10 * gewicht + 6.25 * groesse - 5 * alter;
  return Math.round(basis + (geschlecht === 'm' ? 5 : -161));
}

/* Gesamtumsatz = Grundumsatz × Aktivitätsfaktor */
function berechneTDEE(profil){
  const bmr = berechneBMR(profil);
  if (bmr === null) return null;
  return Math.round(bmr * aktivitaetFaktor(profil.aktivitaet));
}

function aktivitaetFaktor(id){
  const stufe = AKTIVITAET.find(a => a.id === id);
  return stufe ? stufe.faktor : 1.2;
}

function aktivitaetName(id){
  const stufe = AKTIVITAET.find(a => a.id === id);
  return stufe ? stufe.name : '–';
}

/* Tagesziel: eigener Wert schlägt den berechneten Gesamtumsatz */
function tagesZiel(profil){
  if (profil.zielManuell) return profil.zielManuell;
  return berechneTDEE(profil);
}

/* Richtwerte für die Makro-Balken: 20 % Eiweiß, 30 % Fett, 50 % KH.
   Eiweiß und Kohlenhydrate haben 4 kcal/g, Fett 9 kcal/g. */
function makroZiele(ziel){
  if (!ziel) return null;
  return {
    eiweiss: Math.round(ziel * 0.20 / 4),
    fett:    Math.round(ziel * 0.30 / 9),
    kh:      Math.round(ziel * 0.50 / 4)
  };
}
