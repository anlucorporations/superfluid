# Entrada única y portada ANLU corporations

> Fecha: 2026-11-12 · Estado: ✅ desplegado (`brltv2-00012-9nj`) y verificado en vivo.

## Qué se hizo

1. **Portada ANLU corporations** (`/`): presenta la empresa con Superfluid Brlt como producto,
   un acceso "Entrar" y las dos suites. Sustituye la home anterior, que mencionaba Besu/81234.
2. **Entrada única** (`/entrar`, componente `EntryLogin`): conecta la wallet, consulta su tipo
   y redirige a la suite correspondiente.
3. **Endpoint de rol** `POST /api/auth/role`: devuelve `admin` → `/admin`,
   `empleado` → `/suite` o `ninguno`. No crea sesión; la identidad se demuestra con la firma SIWE.
4. **Prioridad**: si una wallet es admin y empleado, entra como **admin** (decisión confirmada).
5. **Guardas cruzadas**: sin sesión, `/admin` y `/suite` envían a `/entrar`. Cada suite
   rechaza el rol que no le corresponde (admin→`/suite`, empleado→`/admin`).

## Flujo de entrada

```
/entrar → conectar wallet → POST /api/auth/role  (tipo de cuenta)
        → POST /api/auth/nonce  (purpose admin | suite)
        → firma SIWE (una vez) → POST /api/auth/verify (crea sesión)
        → redirección: /admin  ó  /suite
```

`/login` y `/suite/login` siguen existiendo para no romper enlaces.

## Funciones por suite

| Suite | Funciones habilitadas |
|---|---|
| **Administrativa** (`/admin`) | Resumen, empleados, flujos (crear, pausar, reanudar, terminar, liquidar, programados, lotes, tesorería), proyectos, sistema, jobs, auditoría |
| **Usuario / empleado** (`/suite`) | Salario por periodo, cobro autónomo (CU-16), mis flujos con refresco 5 s, perfil y ficha |

## Verificación en vivo (2026-11-12)

| Comprobación | Resultado |
|---|---|
| `/api/health` | `ok`, db true, rpc true, chainId 31337 |
| `POST /api/auth/role` · owner | `admin` → `/admin` |
| `POST /api/auth/role` · empleado de prueba | `empleado` → `/suite` |
| `POST /api/auth/role` · wallet sin alta | `ninguno` |
| Recorrido navegador · owner | home → Entrar → **redirigido a `/admin`** |
| Recorrido navegador · empleado | `/entrar` → **redirigido a `/suite`**, con datos del flujo #1 |

Capturas: `/tmp/recorrido/20_home.png`, `21_destino_admin.png`, `22_destino_suite.png`.

## Notas

- Cada login consume el cupo de intentos de su wallet (5 por 15 min). Las pruebas se
  hicieron con **un intento por wallet**.
- Typecheck limpio; 43/43 tests; build con `/entrar` y `/api/auth/role`.
