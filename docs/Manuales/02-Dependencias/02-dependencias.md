# Dependencias (versión sencilla)

## ¿Qué programa necesita mi ordenador?

### Para usar la plataforma (empleado o admin)
Solo un navegador (Chrome/Edge/Firefox) y **MetaMask** instalado en el navegador.

### Para trabajar en el código
- **Node.js 20+** (probado con 24).
- **Foundry** para los contratos (`forge`, `cast`).
- MongoDB **no hace falta instalarla**: el proyecto puede usar una “Mongo de bolsillo”
  que se borra al cerrar (útil en Windows).

## Programas que usa el proyecto

### Del lado del servidor
| Programa | Qué hace |
|---|---|
| Next.js 15 | El “motor” de la web. |
| ethers 5 | El traductor con MetaMask y la red. |
| MongoDB driver | Guarda las fichas, flujos e historial. |
| SIWE lib | Comprueba el “iniciando sesión con la wallet” (firma). |
| Zod | Vigila que los datos que llegan tengan la forma correcta. |

### Del lado del desarrollador
| Programa | Qué hace |
|---|---|
| Vitest | Ejecuta las pruebas rápidas. |
| Playwright | Controla un Chrome “invisible” para pruebas y pantallazos. |
| tsx | Ejecuta los utilitarios sin compilar. |
| TailwindCSS | Los estilos visuales. |

## ¿Qué cambió con el Portal del Empleado nuevo?

### Sin instalar nada nuevo
- El rediseño del Portal (`/suite`), el tope del 80% y la validación continua de
  la wallet usan lo que ya había: **BigInt nativo** y la API de MetaMask.
- La nueva cara visual (azul noche `#0d1425`, tarjeta `#131c30`, cabecera violeta
  `#1b1140`) son **colores de configuración** de Tailwind (tokens `empleado.*`),
  no un paquete nuevo.
- Resultado: **no se añadió ninguna dependencia nueva** de producción ni de
  desarrollo (ver [manual técnico de dependencias](../../../RepoTecnico/Manuales/02-Dependencias/02-dependencias.md)).

## Cómo revisar que todo está en orden

### Comandos de control
```bash
cd web
npm test               # pruebas rápidas (43)
npm run smoke:h4       # prueba completa contra la red de práctica
npm run e2e:ui         # prueba con el navegador automático
```
Si todos acaban con “**TODO OK**”, el sistema está sano.

---

*Actualizado 2026-11-17*
