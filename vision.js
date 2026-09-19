/* ============================================================
   WasGegessen? – Bilderkennung (optionales Zusatzfeature)

   Schickt ein Foto an die Anthropic-API und lässt Claude die
   Bestandteile schätzen. Das Ergebnis ist ausdrücklich nur ein
   VORSCHLAG: Portionsgrößen auf Fotos lassen sich nicht exakt
   bestimmen, verdeckte Zutaten (Öl, Butter, Zucker) sieht man
   gar nicht. Gespeichert wird erst, was der Nutzer bestätigt.

   Der API-Schlüssel liegt nur im localStorage dieses Geräts und
   geht ausschließlich an api.anthropic.com.
   ============================================================ */

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

/* Antwortformat – die API garantiert damit gültiges JSON */
const FOTO_SCHEMA = {
  type: 'object',
  properties: {
    erkannt: { type:'boolean', description:'true, wenn Essen oder Trinken zu sehen ist' },
    gericht: { type:'string', description:'Kurzer Name des Gerichts, z. B. "Spaghetti Bolognese". Leer, wenn nichts erkannt.' },
    hinweis: { type:'string', description:'Ein Satz zur Unsicherheit der Schätzung, auf Deutsch.' },
    posten: {
      type:'array',
      description:'Die einzelnen Bestandteile des Gerichts.',
      items:{
        type:'object',
        properties:{
          name:       { type:'string', description:'Name des Bestandteils auf Deutsch' },
          menge:      { type:'number', description:'Geschätzte Menge in Gramm, bei Getränken in Millilitern' },
          fluessig:   { type:'boolean', description:'true bei Getränken und Suppen' },
          kcal100:    { type:'number', description:'Kalorien je 100 g bzw. 100 ml' },
          eiweiss100: { type:'number', description:'Eiweiß in Gramm je 100 g bzw. 100 ml' },
          fett100:    { type:'number', description:'Fett in Gramm je 100 g bzw. 100 ml' },
          kh100:      { type:'number', description:'Kohlenhydrate in Gramm je 100 g bzw. 100 ml' },
          sicherheit: { type:'string', enum:['hoch','mittel','gering'], description:'Wie sicher ist die Schätzung?' }
        },
        required:['name','menge','fluessig','kcal100','eiweiss100','fett100','kh100','sicherheit'],
        additionalProperties:false
      }
    }
  },
  required:['erkannt','gericht','hinweis','posten'],
  additionalProperties:false
};

const FOTO_AUFTRAG = [
  'Du hilfst beim Führen eines Kalorientagebuchs. Analysiere das Foto und schätze,',
  'was darauf zu essen oder zu trinken ist.',
  '',
  'Vorgehen:',
  '- Zerlege das Gericht in seine sichtbaren Bestandteile (z. B. Nudeln, Soße, geriebener Käse).',
  '- Schätze für jeden Bestandteil die Menge in Gramm, bei Getränken in Millilitern.',
  '  Nutze Teller-, Glas- und Besteckgrößen als Anhaltspunkt.',
  '- Gib für jeden Bestandteil übliche Nährwerte je 100 g bzw. 100 ml an.',
  '- Rechne sichtbares Zubereitungsfett mit ein, wenn das Gericht offensichtlich gebraten',
  '  oder frittiert ist.',
  '- Setze "sicherheit" ehrlich: "gering", wenn die Menge kaum abzuschätzen ist oder',
  '  Zutaten verdeckt sein könnten.',
  '- Der "hinweis" ist ein kurzer deutscher Satz dazu, was an der Schätzung unsicher ist.',
  '',
  'Ist auf dem Bild nichts Essbares zu sehen, setze "erkannt" auf false und "posten" auf eine leere Liste.'
].join('\n');

/* ---------- Schlüsselverwaltung ---------- */
function apiSchluessel(){
  try { return localStorage.getItem('wasgegessen-key') || ''; }
  catch { return ''; }
}
function bilderkennungBereit(){
  return apiSchluessel().trim().length > 0;
}

/* ---------- Foto analysieren ---------- */
/* Liefert { erkannt, gericht, hinweis, posten[] } oder wirft einen
   Fehler mit einer Meldung, die direkt angezeigt werden kann. */
async function fotoAnalysieren(datei){
  const schluessel = apiSchluessel().trim();
  if (!schluessel) throw new Error('Kein API-Schlüssel hinterlegt. Du findest das Feld im Profil.');

  const bild = await bildVerkleinern(datei);
  const modell = ladeModell();

  let antwort;
  try {
    antwort = await fetch(API_URL, {
      method:'POST',
      headers:{
        'content-type':'application/json',
        'x-api-key': schluessel,
        'anthropic-version': API_VERSION,
        // Ohne diesen Header lehnt die API Anfragen direkt aus dem Browser ab.
        'anthropic-dangerous-direct-browser-access':'true',
        'anthropic-beta':'server-side-fallback-2026-07-01'
      },
      body: JSON.stringify({
        model: modell,
        max_tokens: 16000,
        // Lehnt ein Sicherheitsfilter die Anfrage ab, übernimmt automatisch ein Ersatzmodell.
        fallbacks: 'default',
        output_config: {
          effort: 'medium',
          format: { type:'json_schema', schema: FOTO_SCHEMA }
        },
        messages: [{
          role:'user',
          content:[
            { type:'image', source:{ type:'base64', media_type:'image/jpeg', data: bild } },
            { type:'text', text: FOTO_AUFTRAG }
          ]
        }]
      })
    });
  } catch (fehler) {
    throw new Error('Keine Verbindung zur Anthropic-API. Bist du online?');
  }

  if (!antwort.ok) throw new Error(await fehlerText(antwort));

  const daten = await antwort.json();
  if (daten.stop_reason === 'refusal'){
    throw new Error('Die Anfrage wurde abgelehnt. Versuch es mit einem anderen Foto.');
  }

  const block = (daten.content || []).find(b => b.type === 'text');
  if (!block) throw new Error('Die Antwort enthielt kein Ergebnis.');

  let ergebnis;
  try { ergebnis = JSON.parse(block.text); }
  catch { throw new Error('Die Antwort war unlesbar. Versuch es noch einmal.'); }

  ergebnis.posten = (ergebnis.posten || []).map(saeubern).filter(Boolean);
  return ergebnis;
}

/* Modellwahl aus den Einstellungen, mit sicherem Rückfall */
function ladeModell(){
  let m = '';
  try { m = localStorage.getItem('wasgegessen-modell') || ''; } catch {}
  return (m === 'claude-sonnet-5') ? m : 'claude-opus-5';
}

/* Geschätzte Werte auf plausible Bereiche begrenzen –
   ein verrutschter Wert soll das Tagebuch nicht sprengen. */
function saeubern(p){
  const name = String(p.name || '').trim();
  if (!name) return null;
  const grenze = (wert, max) => Math.max(0, Math.min(Number(wert) || 0, max));
  return {
    name,
    menge:      Math.max(1, Math.round(grenze(p.menge, 3000))),
    fluessig:   !!p.fluessig,
    kcal100:    runde(grenze(p.kcal100, 902), 1),
    eiweiss100: runde(grenze(p.eiweiss100, 100), 1),
    fett100:    runde(grenze(p.fett100, 100), 1),
    kh100:      runde(grenze(p.kh100, 100), 1),
    sicherheit: ['hoch','mittel','gering'].includes(p.sicherheit) ? p.sicherheit : 'mittel'
  };
}

/* Fehlermeldungen der API in verständliches Deutsch übersetzen */
async function fehlerText(antwort){
  let detail = '';
  try {
    const d = await antwort.json();
    detail = d && d.error && d.error.message ? d.error.message : '';
  } catch {}

  if (antwort.status === 401) return 'Der API-Schlüssel wird nicht akzeptiert. Prüf ihn im Profil.';
  if (antwort.status === 403) return 'Der Schlüssel hat keine Berechtigung für dieses Modell.';
  if (antwort.status === 429) return 'Zu viele Anfragen oder Guthaben aufgebraucht. Versuch es später.';
  if (antwort.status === 400) return 'Die Anfrage wurde abgelehnt' + (detail ? ': ' + detail : '.');
  if (antwort.status >= 500)  return 'Die Anthropic-API hat gerade ein Problem. Versuch es später.';
  return 'Fehler ' + antwort.status + (detail ? ': ' + detail : '');
}

/* ---------- Bild vorbereiten ----------
   Verkleinert auf maximal 1024 px Kantenlänge und wandelt in
   JPEG um. Das spart Übertragung und Kosten deutlich, ohne dass
   die Erkennung schlechter wird.                                */
function bildVerkleinern(datei, maxKante = 1024){
  return new Promise((erfuellen, ablehnen) => {
    const leser = new FileReader();
    leser.onerror = () => ablehnen(new Error('Das Bild konnte nicht gelesen werden.'));
    leser.onload = () => {
      const bild = new Image();
      bild.onerror = () => ablehnen(new Error('Das Bild konnte nicht geöffnet werden.'));
      bild.onload = () => {
        const faktor = Math.min(1, maxKante / Math.max(bild.width, bild.height));
        const breite = Math.max(1, Math.round(bild.width * faktor));
        const hoehe  = Math.max(1, Math.round(bild.height * faktor));

        const flaeche = document.createElement('canvas');
        flaeche.width = breite;
        flaeche.height = hoehe;
        const stift = flaeche.getContext('2d');
        stift.drawImage(bild, 0, 0, breite, hoehe);

        const datenUrl = flaeche.toDataURL('image/jpeg', 0.82);
        erfuellen(datenUrl.split(',')[1]);
      };
      bild.src = leser.result;
    };
    leser.readAsDataURL(datei);
  });
}
