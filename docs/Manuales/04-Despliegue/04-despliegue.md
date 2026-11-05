# Despliegue (versión sencilla)

## ¿Dónde vive la aplicación?

### Hoy (red de práctica)
- **Contratos**: desplegados en la red de práctica Besu (chainId 81234), bloque
  6.412.104. Nada que instalar: la app ya está conectada.
- **App**: se puede correr en cualquier ordenador con Node 20+.

## Cómo poner la aplicación en marcha

### Modo rápido (5 comandos)
```bash
cd web
npm install
cp .env.example .env.local    # y rellena lo que pide
npm run seed                  # prepara la base y tu wallet admin
npm run dev                   # http://localhost:3000
```

### Modo container (para servidor)
```bash
npm run build
npm run verify:standalone     # prueba el “ejecutable” de producción
gcp/deploy.sh                 # sube a Google Cloud Run (requiere acceso)
```

![Panel admin con tarjetas de resumen](../imagenes/capturas/04-admin-resumen.png)
*(El panel admin tal y como lo verá el administrador tras iniciar sesión.)*

## ¿Qué pide la app para conectarse?

### Variables importantes (solo el administrador técnico)
- `MONGODB_URI` / `MONGODB_DB` — dónde vive la base de datos.
- `SIWE_DOMAIN` — **debe coincidir exactamente** con la dirección web usada.
- `NEXT_PUBLIC_BRLT_ADDRESS` / `NEXT_PUBLIC_BRLTX_ADDRESS` — las direcciones de los contratos.
- `ADMIN_BOOTSTRAP_WALLET` — la wallet que puede entrar como admin.

## Healthcheck

### ¿Está vivo el sistema?
Una visita a **`/api/health`** responde:
- `200 ok` — base de datos y red funcionando.
- `503 degradado` — algo no responde (la app no está muerta solo degradada).
