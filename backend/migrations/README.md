# Migraciones SQL — EduApp

Migraciones versionadas y **reversibles** del esquema. Se ejecutan al arrancar el
backend, antes de `sequelize.sync()`, desde `src/services/migration.service.js`.

## Formato

```
migrations/
  001_dashboard_telemetria.up.sql    <- qué se crea
  001_dashboard_telemetria.down.sql  <- cómo se deshace exactamente
  002_dashboard_reportes.up.sql
  002_dashboard_reportes.down.sql
```

Cada migración aplicada se registra en la tabla `schema_migrations`. El arranque es
idempotente: una migración ya registrada nunca se vuelve a ejecutar.

## Comandos

```bash
# Aplicar las pendientes (automático al arrancar; también manual)
npm run migrate

# Ver qué se aplicó y qué falta
npm run migrate:status

# Revertir la última migración aplicada
npm run migrate:down

# Revertir una migración concreta
npm run migrate:down -- 001_dashboard_telemetria
```

## Por qué SQL y no `sync({ alter: true })`

- `alter: true` puede **destruir datos** al cambiar tipos o agregar índices sobre
  columnas con colisiones.
- No se depende de `sequelize-cli` ni de ninguna librería nueva: se ejecuta el SQL
  con la conexión ya abierta por `src/config/database.js`.
- Los scripts `.up.sql` son **reentrantes**: usan `CREATE TABLE IF NOT EXISTS` y
  un bloque `information_schema + PREPARE` por cada columna añadida, así que da
  igual si la tabla llegó a existir por `sync()` o por una migración anterior.

## Regla de escritura

Los scripts no usan procedimientos almacenados ni disparadores, así que el runner
puede separarlos por `;` respetando comillas y comentarios `--` / `/* */`.

`DROP COLUMN IF EXISTS` **no** se usa en los `.down.sql`: solo existe a partir de
MySQL 8.0.29. Para eliminar columnas se usa el mismo patrón `information_schema +
PREPARE`, que funciona desde MySQL 5.7.

## Rollback completo

```bash
npm run migrate:down   # revierte 002_dashboard_reportes
npm run migrate:down   # revierte 001_dashboard_telemetria
```

Esto **elimina los datos de telemetría y reportes**. Las tablas preexistentes
(`progreso_estudiante`, `contenidos`, `usuarios`, …) no se tocan, salvo las columnas
nuevas que desaparecen junto con sus datos.