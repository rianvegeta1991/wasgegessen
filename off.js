/* ============================================================
   WasGegessen? – Open Food Facts als Lebensmitteldatenbank
   Freie Datenbank, keine Registrierung, CORS erlaubt.
   Alles wird auf ein einheitliches Format je 100 g/ml gebracht.
   ============================================================ */

const OFF_SUCHE = 'https://world.openfoodfacts.org/cgi/search.pl';
const OFF_FELDER = [
  'code','product_name','product_name_de','generic_name','generic_name_de',
  'brands','nutriments','serving_size','serving_quantity','quantity',
  'image_small_url','categories_tags'
].join(',');

/* Open Food Facts bremst häufige Suchanfragen aus (rund zehn pro Minute).
   Deshalb merken wir uns jedes Ergebnis: Wer einen Buchstaben löscht oder
   zweimal dasselbe sucht, löst keine neue Anfrage aus. */
const SUCH_CACHE = new Map();
const CACHE_MAX = 40;

/* Suche in der Datenbank. Liefert ein Array im App-Format.
   `signal` bricht die Anfrage ab, wenn schneller weitergetippt wird. */
async function offSuche(text, signal){
  const schluessel = text.trim().toLowerCase();
  if (SUCH_CACHE.has(schluessel)) return SUCH_CACHE.get(schluessel);

  const url = OFF_SUCHE
    + '?search_terms=' + encodeURIComponent(text)
    + '&search_simple=1&action=process&json=1&page_size=40&lc=de&cc=de'
    + '&fields=' + OFF_FELDER;

  let antwort;
  try {
    antwort = await fetch(url, { signal, headers:{ 'Accept':'application/json' } });
  } catch (fehler) {
    if (fehler.name === 'AbortError') throw fehler;
    // Tritt auf, wenn Open Food Facts gestört ist, das Gerät offline ist
    // oder die Datenbank wegen zu vieler Anfragen dichtmacht
    throw new Error('Die Lebensmitteldatenbank ist gerade nicht erreichbar. '
      + 'Versuch es gleich noch einmal – oder leg das Lebensmittel selbst an.');
  }

  if (antwort.status === 429){
    throw new Error('Zu viele Suchanfragen hintereinander. Warte kurz und such dann weiter.');
  }
  if (!antwort.ok) throw new Error('Die Datenbank antwortet nicht (Fehler ' + antwort.status + ').');

  const daten = await antwort.json();
  const treffer = (daten.products || [])
    .map(offUmwandeln)
    .filter(Boolean)
    .sort(nachRelevanz(text))
    .slice(0, 25);

  if (SUCH_CACHE.size >= CACHE_MAX) SUCH_CACHE.delete(SUCH_CACHE.keys().next().value);
  SUCH_CACHE.set(schluessel, treffer);
  return treffer;
}

/* Ein OFF-Produkt in unser Format übersetzen.
   Gibt null zurück, wenn Name oder Kalorien fehlen – solche
   Einträge sind für ein Kalorientagebuch wertlos. */
function offUmwandeln(p){
  const name = (p.product_name_de || p.product_name || p.generic_name_de || p.generic_name || '').trim();
  if (!name) return null;

  const n = p.nutriments || {};
  const kcal = zahl(n['energy-kcal_100g']) !== null
    ? zahl(n['energy-kcal_100g'])
    : (zahl(n['energy_100g']) !== null ? zahl(n['energy_100g']) / 4.184 : null);
  if (kcal === null || kcal <= 0 || kcal > 902) return null; // 902 = reines Fett, alles darüber ist ein Datenfehler

  const fluessig = offIstGetraenk(p, name);

  const lm = {
    id: 'off:' + p.code,
    quelle: 'off',
    name,
    marke: (p.brands || '').split(',')[0].trim(),
    bild: p.image_small_url || '',
    fluessig,
    kcal100: runde(kcal, 1),
    eiweiss100: runde(zahl(n['proteins_100g']) || 0, 1),
    fett100:    runde(zahl(n['fat_100g']) || 0, 1),
    kh100:      runde(zahl(n['carbohydrates_100g']) || 0, 1),
    portionen: []
  };

  lm.portionen = portionenAufbauen(lm, p);
  return lm;
}

/* Getränke-Kategorien von Open Food Facts, ohne Sprachpräfix.
   Bewusst nur eindeutige Tags: die Oberkategorie
   "plant-based-foods-and-beverages" hängt auch an Brot und Nudeln,
   deshalb darf hier nichts auf Teilwörter wie "beverages" matchen. */
const GETRAENK_TAGS = new Set([
  'beverages','drinks','waters','spring-waters','mineral-waters','flavoured-waters',
  'juices','fruit-juices','vegetable-juices','nectars','fruit-nectars','smoothies',
  'sodas','carbonated-drinks','colas','lemonades','iced-teas','energy-drinks',
  'sports-drinks','syrups','beers','wines','sparkling-wines','ciders','spirits',
  'alcoholic-beverages','non-alcoholic-beverages','hot-beverages','coffees','coffee-drinks',
  'teas','herbal-teas','milks','plant-based-milk-alternatives','milk-drinks','dairy-drinks'
]);

/* Eindeutige Getränkewörter für den Fall, dass Kategorien fehlen.
   Absichtlich ohne "milch", "tee" oder "sahne" – die stecken auch in
   Milchbrötchen, Teewurst und Sahnetorte. */
const GETRAENK_WOERTER = ['saft','cola','limonade','schorle','sprudel','mineralwasser',
  'getränk','smoothie','nektar','bier','wein','sekt','prosecco','espresso','latte'];

function offIstGetraenk(p, name){
  const tags = (p.categories_tags || []).map(t => t.replace(/^[a-z]{2}:/, ''));
  if (tags.some(t => GETRAENK_TAGS.has(t))) return true;
  if (tags.length) return false; // eingeordnet, aber kein Getränk

  const n = name.toLowerCase();
  return GETRAENK_WOERTER.some(w => n.includes(w));
}

/* Portionsliste: erst die Herstellerangabe, dann unsere Standardportionen */
function portionenAufbauen(lm, p){
  const liste = [];

  // Portionsangabe der Packung, z. B. "30 g" oder "1 Glas (200 ml)"
  const menge = portionsGramm(p);
  if (menge) liste.push({ name:'1 Portion (Packung)', gramm: menge });

  // Ganze Packung, wenn sie als Portion realistisch ist
  const ganz = mengeInGramm(p.quantity);
  if (ganz && ganz <= 1000) liste.push({ name:'ganze Packung (' + formatMenge(ganz, lm.fluessig) + ')', gramm: ganz });

  const namen = new Set(liste.map(x => x.name));
  return liste.concat(portionenFuer(lm.name, lm.fluessig).filter(x => !namen.has(x.name)));
}

/* Portionsgröße aus serving_quantity bzw. serving_size lesen */
function portionsGramm(p){
  const q = zahl(p.serving_quantity);
  if (q && q > 0 && q < 2000) return runde(q, 0);
  return mengeInGramm(p.serving_size);
}

/* "500 g", "0,33 l", "1.5 kg" → Gramm bzw. Milliliter */
function mengeInGramm(text){
  if (!text) return null;
  const t = String(text).toLowerCase().replace(',', '.');
  const treffer = t.match(/([\d.]+)\s*(kg|g|l|ml|cl)/);
  if (!treffer) return null;
  const wert = parseFloat(treffer[1]);
  if (!isFinite(wert) || wert <= 0) return null;
  const faktor = { kg:1000, g:1, l:1000, ml:1, cl:10 }[treffer[2]];
  const gramm = Math.round(wert * faktor);
  return gramm > 0 && gramm <= 5000 ? gramm : null;
}

/* Treffer mit dem Suchwort vorn und mit Bild nach oben sortieren */
function nachRelevanz(suchtext){
  const s = suchtext.toLowerCase().trim();
  return (a, b) => punkte(b) - punkte(a);

  function punkte(lm){
    const n = lm.name.toLowerCase();
    let p = 0;
    if (n === s) p += 100;
    if (n.startsWith(s)) p += 50;
    if (n.includes(s)) p += 20;
    if (lm.bild) p += 5;
    if (lm.marke) p += 2;
    p -= Math.min(n.length / 20, 5); // kurze, allgemeine Namen bevorzugen
    return p;
  }
}

/* ---------- kleine Helfer ---------- */
function zahl(x){
  if (x === null || x === undefined || x === '') return null;
  const n = typeof x === 'number' ? x : parseFloat(String(x).replace(',', '.'));
  return isFinite(n) ? n : null;
}

function runde(n, stellen){
  const f = Math.pow(10, stellen);
  return Math.round(n * f) / f;
}

function formatMenge(gramm, fluessig){
  const einheit = fluessig ? 'ml' : 'g';
  if (gramm >= 1000) return (gramm / 1000).toFixed(gramm % 1000 === 0 ? 0 : 1).replace('.', ',') + (fluessig ? ' l' : ' kg');
  return gramm + ' ' + einheit;
}
