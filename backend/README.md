# ⚠️ Legacy — reemplazado por /api (Vercel + Supabase)

Este backend en Go (WebSockets crudos) causaba problemas de alojamiento y requería
infraestructura propia (Cloud Run, contenedores, etc.).

Se reemplazó por funciones serverless de TypeScript en [`/api`](../api) desplegadas junto
al frontend en Vercel, usando [Supabase](https://supabase.com) (Postgres + Realtime) como
estado autoritativo y capa de mensajería. Ver [`/supabase/schema.sql`](../supabase/schema.sql)
para el esquema y [`ROADMAP_ARQUITECTURA.md`](../ROADMAP_ARQUITECTURA.md) para el detalle.

Esta carpeta se conserva temporalmente como referencia de las reglas de combate originales,
pero **ya no se despliega ni se usa en producción**. Puede eliminarse una vez confirmado que
`/api` cubre el mismo comportamiento en producción.
