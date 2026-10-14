# Stock API

Control de stock basado en movimientos. El stock actual de un producto es la suma de sus movimientos.
Usa la misma base PostgreSQL que el planificador, pero en un schema separado llamado `stock`.

## Puesta en marcha local

1. `npm install`
2. Copiar `.env.example` a `.env` y completar `DATABASE_URL` (External Database URL de Render, con `DB_SSL=true`)
3. `npm run migrate` crea el schema `stock` y sus tablas
4. `npm run dev` y abrí http://localhost:3000 (la interfaz web está en `public/index.html`)

## Deploy en Render

- Build Command: `npm install`
- Start Command: `npm start`
- Variables: `DATABASE_URL` (Internal Database URL), `API_KEY`, `ALLOW_NEGATIVE`
- Correr `npm run migrate` una vez (desde tu PC con la External URL, o desde el Shell de Render)

## Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| GET | /health | Estado del servicio |
| GET | /productos | Lista con stock actual |
| GET | /productos/alertas/bajo-stock | Productos en o bajo el mínimo |
| GET | /productos/:id | Un producto |
| POST | /productos | Crear producto |
| PUT | /productos/:id | Editar producto |
| GET | /movimientos | Historial (`?producto_id=&tarea_id=`) |
| POST | /movimientos | Registrar entrada, salida o ajuste |

Ejemplo de salida ligada a una tarea del planificador:

```json
{ "producto_id": 1, "tipo": "salida", "cantidad": 5, "motivo": "Consumo en tarea", "tarea_id": 42 }
```
