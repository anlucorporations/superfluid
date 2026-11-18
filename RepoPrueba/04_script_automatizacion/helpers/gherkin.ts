// helpers/gherkin.ts — FASE 3
// Parser ligero de Gherkin: extrae Feature, Escenarios, tags y el ID (comentario "# captura: ESC-NNN_…").
// Sin dependencias externas. Solo soporta el dialecto generado en FASE 2 (03_features/*.feature).

export interface Paso {
  tipo: 'Given' | 'When' | 'Then' | 'And' | 'But';
  texto: string;
}

export interface Escenario {
  id: string;                 // ESC-NNN (extraído del comentario "# captura: ESC-NNN_...")
  feature: string;            // nombre de la Feature
  archivo: string;            // ruta del .feature
  linea: number;              // línea 1-based del tag inicial
  titulo: string;
  tags: string[];
  pasos: Paso[];
  na: boolean;                // tiene tag @na
  plataforma: string | null;  // @plataforma:x
  navegador: string | null;   // @navegador:y
  wallet: string | null;      // @wallet:target
  modo: string | null;        // @modo:real|simulada
  prioridad: string | null;   // @prioridad:alta|media|baja
  requisitos: string[];       // @REQ-WALLET-NN
}

const R_TAG = /^@(\S+)/;
const R_ESCENARIO = /^(?:Escenario|Scenario):\s*(.+)$/i;
const R_PASO = /^(Given|When|Then|And|But)\s+(.*)$/i;
const R_CAPTURA = /# captura:\s*(ESC-\d+)/i;

function tagsDeLinea(linea: string): string[] {
  const out: string[] = [];
  for (const m of linea.matchAll(/@([\w:.\/-]+)/g)) out.push(m[1]);
  return out;
}

function valorTag(tags: string[], prefijo: string): string | null {
  const t = tags.find((x) => x.startsWith(prefijo + ':'));
  return t ? t.slice(prefijo.length + 1) : null;
}

/** Parsea el contenido de un .feature a la lista de escenarios. */
export function parseFeature(contenido: string, archivo: string): Escenario[] {
  const lineas = contenido.split(/\r?\n/);
  const escenarios: Escenario[] = [];
  let feature = archivo;
  let actual: Escenario | null = null;
  let lineaActual = 0;
  let idPendiente: string | null = null;

  for (let i = 0; i < lineas.length; i++) {
    const bruta = lineas[i];
    const linea = bruta.trim();
    lineaActual = i + 1;

    if (!linea || linea.startsWith('#')) {
      // El ID del escenario llega como comentario "# captura: ESC-NNN_..." dentro del cuerpo
      const mId = bruta.match(R_CAPTURA);
      if (mId && actual && !actual.id) actual.id = mId[1];
      continue;
    }
    if (/^(Feature|Característica):/i.test(linea)) {
      feature = linea.replace(/^(Feature|Característica):\s*/i, '');
      continue;
    }
    const mTag = bruta.match(R_TAG);
    if (mTag) continue; // las líneas de tags se procesan al llegar al Escenario
    const mEsc = linea.match(R_ESCENARIO);
    if (mEsc) {
      // Los tags leídos desde la última línea no-Escenario se acumulan en pendientes
      actual = {
        id: '',
        feature,
        archivo,
        linea: lineaActual,
        titulo: mEsc[1].trim(),
        tags: [],
        pasos: [],
        na: false,
        plataforma: null,
        navegador: null,
        wallet: null,
        modo: null,
        prioridad: null,
        requisitos: [],
      };
      escenarios.push(actual);
      continue;
    }
    if (actual) {
      const mPaso = linea.match(R_PASO);
      if (mPaso) {
        actual.pasos.push({ tipo: mPaso[1].toLowerCase() as Paso['tipo'], texto: mPaso[2].trim() });
      }
    }
  }

  // Segunda pasada: asociar cada bloque de tags con el escenario que le sigue inmediatamente
  let pendientes: string[] = [];
  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i].trim();
    if (linea.startsWith('@')) {
      pendientes = pendientes.concat(tagsDeLinea(linea));
      continue;
    }
    if (R_ESCENARIO.test(linea)) {
      const esc = escenarios.find((e) => e.titulo === linea.replace(R_ESCENARIO, '$1').trim() && !e.tags.length);
      if (esc) {
        esc.tags = pendientes;
        esc.na = esc.tags.includes('na');
        esc.plataforma = valorTag(esc.tags, 'plataforma');
        esc.navegador = valorTag(esc.tags, 'navegador');
        esc.wallet = valorTag(esc.tags, 'wallet');
        esc.modo = valorTag(esc.tags, 'modo');
        esc.prioridad = valorTag(esc.tags, 'prioridad');
        esc.requisitos = esc.tags.filter((t) => /^REQ-WALLET-\d+$/.test(t));
      }
      pendientes = [];
      continue;
    }
    if (linea && !linea.startsWith('#')) pendientes = []; // paso u otra palabra clave: corta el bloque de tags
  }

  // Fallback de ID: si el comentario de captura no existe, genera ESC-XXX por orden estable
  escenarios.forEach((e, idx) => {
    if (!e.id) e.id = 'ESC-' + String(escenarios.length > 0 ? idx + 1 : 0).padStart(3, '0');
  });
  return escenarios;
}

/** Lee todos los .feature de una carpeta y devuelve el inventario completo ordenado por archivo/línea. */
export function parseFeaturesDir(dir: string, leerFn: (ruta: string) => string): Escenario[] {
  const salida: Escenario[] = [];
  for (const nombre of leerFn(dir)) {
    const ruta = `${dir}/${nombre}`;
    salida.push(...parseFeature(leerFn(ruta), ruta));
  }
  return salida.sort((a, b) => a.archivo.localeCompare(b.archivo) || a.linea - b.linea);
}
