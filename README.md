# SafeGuard V2

Monorepo npm de la aplicación existente SafeGuard. El repositorio `../safeguard` permanece como respaldo intacto.

## Estructura

- `frontend/`: Next.js 16, React 19, Tailwind CSS 4, rutas App Router y BFF.
- `backend/`: NestJS 12, Prisma 7, API CRM y migraciones existentes.
- Better Auth servidor, sesiones, autorización y Prisma residen únicamente en `backend/`; `frontend/` solo utiliza el cliente y proxies BFF.
- Ambos `tsconfig.json` son independientes; no se necesita un `tsconfig.base.json` raíz. El login valida contraseñas con Better Auth almacenado en Supabase PostgreSQL (no con Supabase Auth); el backend verifica el rol empresarial antes del acceso CRM.
- `docs/`: `CONTEXTO.md` y `ROADMAP.md` (incluyen historial previo a V2).

## Inicio

Requiere Node.js >=22.12 y configuración local privada: `backend/.env` y `frontend/.env.local` (plantillas en los respectivos `.env.example`). Next lee `.env.local` en el frontend; Nest y Prisma CLI leen `.env` desde el backend. Las variables del proceso tienen precedencia. El frontend no necesita `DATABASE_URL` ni `BETTER_AUTH_SECRET`; `AUTH_API_URL` apunta al origen privado del backend y `API_URL` a su API CRM. `BETTER_AUTH_URL` del backend conserva el origen público del frontend, que gestiona las cookies. Nunca versionar credenciales.

```bash
npm install
npm run dev
```

Abrir http://localhost:3000/login (API health: http://localhost:4000/api/v1/health). No detener procesos ajenos si los puertos ya están ocupados.
Si `/api/auth/*` responde 500 aunque health devuelva 200, comprobar la conectividad DNS hacia el pooler Supabase configurado en `backend/.env`; health no prueba el acceso a PostgreSQL. No desactivar la protección ni crear otra base de datos como solución.
Ejecutar `npm run build` con `npm run dev` detenido: el compilador Nest en watch y el build comparten `backend/dist` y pueden provocar un reinicio transitorio.

```bash
npm run build
npm run lint
npm run typecheck
npm test
npm run prisma:status  # solo consulta de estado, no aplica migraciones
```

Para agregar una dependencia desde la raíz: `npm install <paquete> -w @safeguard/web` o `npm install <paquete> -w @safeguard/api`; para desarrollo añadir `-D`. Solo se mantiene `package-lock.json` raíz. No usar pnpm ni `workspace:*`.

`backend/scripts/admin-link-manual.ts` es un bootstrap **manual y restringido**, trasladado sin ejecutarse. No invocarlo sin aprobación expresa. No ejecutar `prisma db push`, `prisma migrate deploy/reset` ni crear usuarios/datos durante este traslado. `CRM_SCHEMA_READY` y `BETTER_AUTH_TOTP_SCHEMA_READY` conservan su estado local; el vínculo empresarial SUPER_ADMIN y las pruebas de login autenticado siguen pendientes.
