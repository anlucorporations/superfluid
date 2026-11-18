// helpers/pasos.ts — FASE 3
// Intérprete de pasos de Caja Negra funcional sobre la UI: convierte cada paso del .feature en
// acciones de Playwright sobre la dApp. NO es una batería de pruebas unitarias: todo lo que se
// verifica pasa por la interfaz (textos, botones, window.ethereum, navegación por rol).
//
// Cobertura del intérprete (FASE 3, esqueleto ejecutable):
//   - Navegación a rutas entrecomilladas (/entrar, /login, /suite/login, /admin, /suite…).
//   - Clics en textos entrecomillados ("Entrar con wallet", botones de la Suite…).
//   - Afirmaciones de texto entrecomillado en Then/And (visible u oculto según negación).
//   - Afirmaciones sobre window.ethereum (detecta / no detecta).
//   - Botón habilitado / deshabilitado.
//   - Aprobaciones de conexión: en modo simulada el mock de wallet-mock.ts responde al instante;
//     en modo real el popup de la extensión NO se automatiza en este esqueleto (ver README).
// Los pasos no cubiertos NO hacen fallar el escenario: se reportan como 'pendientes' y el estado
// del escenario queda NOT_RUN con el detalle — decisión de diseño documentada en el README.

import type { Escenario } from './gherkin.ts';

export interface ConfigPasos {
  baseUrl: string;         // E2E_BASE_URL
  modo: string;            // real | simulada
  cuentaSimulada: string;
}

export interface ResultadoPasos {
  ok: boolean;             // true si todos los pasos interpretados se superaron
  pendientes: string[];    // pasos sin intérprete (→ NOT_RUN)
  detalle: string;         // primer error o resumen
  saltosPendientes: string[];
}

const RUTAS = /\/(entrar|login|suite\/login|admin|suite(?:\/[\w-]+)?)/i;

/** Extrae rutas de un paso. */
function rutaDe(texto: string): string | null {
  const m = texto.match(RUTAS);
  return m ? '/' + m[1].toLowerCase() : null;
}

/** Extrae todos los textos entre comillas de un paso. */
function textosDe(texto: string): string[] {
  return Array.from(texto.matchAll(/"([^"]+)"/g)).map((m) => m[1]);
}

/** ¿El paso exige que algo NO esté visible? */
function esNegacion(texto: string): boolean {
  return /no se (muestra|detecta|inicia|crea)|permanece deshabilitado|sin error de|nunca|no se solicita|no se envía/i.test(texto);
}

/** Clasifica un paso para el intérprete. */
type TipoPaso = 'navegacion' | 'clic' | 'afirmacion_texto' | 'afirmacion_ethereum' | 'afirmacion_boton' | 'aprobacion' | 'setup' | 'desconocido';

function clasificar(texto: string): TipoPaso {
  // Pasos de PREPARACIÓN del entorno (given): el mock ya inyecta la wallet y la
  // red 31337, así que describir "extensión instalada", "red activa" o "dApp
  // desplegada" no exige acción sobre la UI. Se registran como ejecutados.
  if (/^dada|^given/i.test(texto.trim()) || /está desplegada|instalada manualmente|instalada desde la tienda|extensión .+ (activa|está activa)|red activa chainId|no añadida|perfil preparado/i.test(texto)) {
    return 'setup';
  }
  if (rutaDe(texto) && /abre|está desplegada|está en|naveg|accede|pulsa/i.test(texto)) return 'navegacion';
  if (/hace clic|pulsa/i.test(texto)) return 'clic';
  if (/aprueba la solicitud|aprueba la conexión|aprueba el cambio|firma el mensaje|aprueba la firma/i.test(texto)) return 'aprobacion';
  if (/window\.ethereum/i.test(texto) && /(detecta|no detecta|no se detecta)/i.test(texto)) return 'afirmacion_ethereum';
  if (/(proveedor EIP-1193|window\.ethereum)/i.test(texto) && /detecta/i.test(texto)) return 'afirmacion_ethereum';
  if (/está dentro de|está en la|permanece en la/i.test(texto) && rutaDe(texto)) return 'navegacion';
  if (/(habilitado|deshabilitado)/i.test(texto)) return 'afirmacion_boton';
  if (/(muestra|el sistema detecta|obtiene|devuelve|aparece|permanece|envía|registra|continúa|redirige|se bloquea)/i.test(texto)) return 'afirmacion_texto';
  return 'desconocido';
}

/** Ejecuta los pasos de un escenario sobre la dApp con Playwright. */
export async function ejecutarPasos(page: {
  goto: (u: string, o?: Record<string, unknown>) => Promise<unknown>;
  getByText: (t: string, o?: Record<string, unknown>) => { first: () => { waitFor: (o: Record<string, unknown>) => Promise<void>; isEnabled: () => Promise<boolean>; isVisible: () => Promise<boolean>; click: () => Promise<void> } };
  evaluate: <T>(fn: string) => Promise<T>;
}, esc: Escenario, cfg: ConfigPasos): Promise<ResultadoPasos> {
  const pendientes: string[] = [];
  let detalle = '';
  let ok = true;

  // Navegación inicial: si ningún paso trae ruta explícita, se deduce del texto
  // del escenario (los flujos de conexión/entrada viven en /entrar; el resto
  // parte de la portada). Sin esto, un clic expira sobre about:blank.
  const todoTexto = esc.pasos.map((p) => p.texto).join(' ');
  const rutaInicial = rutaDe(todoTexto)
    ?? (/entrar|conectar|conexión|wallet|firmar|firma|red 31337|cambio de red/i.test(todoTexto) ? '/entrar' : '/');
  try {
    await page.goto(cfg.baseUrl + rutaInicial, { waitUntil: 'domcontentloaded' });
  } catch (err) {
    ok = false;
    detalle = `navegación inicial ${rutaInicial} → ${(err as Error)?.message?.split('\n')[0] ?? String(err)}`;
  }

  const notaError = (paso: string, err: unknown): void => {
    ok = false;
    if (!detalle) detalle = `${paso} → ${(err as Error)?.message?.split('\n')[0] ?? String(err)}`;
  };

  for (const paso of esc.pasos) {
    const tipo = clasificar(paso.texto);
    try {
      switch (tipo) {
        case 'navegacion': {
          const ruta = rutaDe(paso.texto) ?? '/';
          await page.goto(cfg.baseUrl + ruta, { waitUntil: 'domcontentloaded' });
          break;
        }
        case 'setup':
          break; // preparación del entorno: el mock ya provee wallet y red
        case 'clic': {
          const objetivo = textosDe(paso.texto)[0];
          if (!objetivo) throw new Error('clic sin objetivo entrecomillado: ' + paso.texto);
          const loc = page.getByText(objetivo, { exact: false }).first();
          await loc.waitFor({ state: 'visible', timeout: 10000 });
          // caja negra: se pulsa el elemento real de la UI (la app decide qué hace con él)
          await loc.click();
          break;
        }
        case 'aprobacion': {
          if (cfg.modo === 'simulada') break; // el mock responde al instante (sin popup)
          pendientes.push('aprobación de popup de wallet real no automatizada en este esqueleto (FASE 5)');
          break;
        }
        case 'afirmacion_ethereum': {
          const presente = await page.evaluate<boolean>('!!window.ethereum && typeof window.ethereum.request === "function"');
          const negado = esNegacion(paso.texto);
          if (presente === negado) throw new Error(`window.ethereum ${presente ? 'presente' : 'ausente'} y se esperaba lo contrario (${paso.texto})`);
          break;
        }
        case 'afirmacion_boton': {
          const objetivo = textosDe(paso.texto).find((t) => t.length > 3) ?? 'Entrar con wallet';
          const loc = page.getByText(objetivo, { exact: false }).first();
          await loc.waitFor({ state: 'visible', timeout: 10000 });
          const habilitado = await loc.isEnabled();
          const esperaHabilitado = !esNegacion(paso.texto);
          if (habilitado !== esperaHabilitado) {
            throw new Error(`botón "${objetivo}" ${habilitado ? 'habilitado' : 'deshabilitado'} y se esperaba ${esperaHabilitado ? 'habilitado' : 'deshabilitado'}`);
          }
          break;
        }
        case 'afirmacion_texto': {
          const textos = textosDe(paso.texto);
          if (!textos.length) {
            pendientes.push('afirmación sin texto entrecomillado: ' + paso.texto);
            break;
          }
          for (const t of textos) {
            const loc = page.getByText(t, { exact: false }).first();
            if (esNegacion(paso.texto)) {
              // espera breve y comprueba que NO aparece
              await page.waitForTimeout(800);
              const visible = await loc.isVisible();
              if (visible) throw new Error(`se esperaba que NO apareciera: "${t}"`);
            } else {
              await loc.waitFor({ state: 'visible', timeout: 10000 });
            }
          }
          break;
        }
        default:
          pendientes.push(paso.tipo + ' ' + paso.texto);
      }
    } catch (err) {
      notaError(paso.tipo + ' ' + paso.texto, err);
    }
  }

  return { ok, pendientes, detalle, saltosPendientes: pendientes };
}
