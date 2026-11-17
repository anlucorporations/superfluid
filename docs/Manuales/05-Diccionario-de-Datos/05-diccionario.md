# Diccionario de datos (versión sencilla)

## ¿Dónde vive cada cosa?

### Dos manos que trabajan juntas
1. **La cadena** guarda lo que cuesta dinero: quién cobró, cuánto y cuándo.
2. **La base MongoDB** guarda papeleo: fichas, proyectos, permisos, historial y avisos.
3. La app **compara siempre** las dos y se corrige si difieren.

## Cosas que la base guarda

### Pequeño glosario
| Cosa | Qué es |
|---|---|
| Empleado | Cada persona con su wallet. |
| Proyecto | La “familia” a la que pertenece un empleado (info). |
| Flujo | El “grifo” del salario con su número (#1, #2…). |
| Programado | Una nómina “apuntada” para lanzarse más adelante. |
| Lote | Hasta 10 flujos creados de golpe, con control anti-duplicados. |
| Historial (`flows_history`) | El diario de los eventos del contrato. |
| Trabajo (`job_runs`) | Las veces que la app se “auto-revisa”. |
| Auditoría | Quién hizo qué y cuándo (sin secretos ni datos íntimos). |
| **Límites del tope** (`limites`) | Los 4 números que ve el empleado: asignado, tope 80%, ya descargado y disponible. |

## Los 4 números del tope del 80%

### ¿De dónde salen?
| Número | De dónde viene |
|---|---|
| **Asignado a tu cuenta** | Del contrato: todo el dinero depositado en tus flujos (vivos o terminados). |
| **Tope 80%** | El 80% de lo asignado (se calcula, redondeando hacia abajo). |
| **Ya descargado** | De la auditoría: suma de tus cobros confirmados por la cadena. |
| **Disponible** | El tope menos lo ya descargado (nunca sale negativo). |

Ejemplo: asignado 10.000 BRLT → tope 8.000 → ya descargado 1.500 → **disponible
6.500 BRLT**. Si un cobro supera el disponible, se rechaza con el aviso
«tope_80_superado» y no se registra.

## Datos personales (y tus derechos)

### Reglas del juego
- Email y teléfono **se borran al instante** si lo pides («Borrar mis datos»).
- A los **30 días**, la app anonimiza el nombre automáticamente (ya no se sabe quién es).
- Tu **wallet** se aguanta hasta **90 días** después de la baja para que puedas
  retirar lo que te debían; después la cuenta queda sellada.

<!-- GENERAR_IMAGEN: glosario-visual.svg|png -->

```mermaid
mindmap
  root((Datos))
    Cadena
      Flujos y pagos
      Eventos (historial)
      Escrow y tasas
      Total asignado (tope 80%)
    MongoDB
      Empleados y proyectos
      Sesiones y permisos
      Auditoría (ya descargado)
      Jobs
    Portal del Empleado
      Resumen (3 números)
      Downgrade de flujos (4 fichas)
      Mi perfil
    Derechos
      Borrado inmediato
      Anonimizado a 30 días
      Retiro hasta 90 días
```

## Estados de un flujo

### Los cuatro estados
<!-- GENERAR_IMAGEN: estados-flujo.svg|png -->

```mermaid
stateDiagram-v2
    [*] --> activo: se crea el flujo
    activo --> pausado: pausa del admin
    pausado --> activo: reanudación
    activo --> vencido: pasa su tiempo
    vencido --> terminado: liquidación (cualquiera)
    activo --> terminado: terminación del admin
    terminado --> [*]
```

---

*Actualizado 2026-11-17*
