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

## Ubicaciones y etiquetas QR

Configurar `PUBLIC_BASE_URL=https://stock.viverolosaromos.com.ar` en el entorno local y en Render. Ejecutar `npm run migrate` y reiniciar el servidor. Abrir `/invernaderos/` para crear canteros y filas, o `/etiquetas/` para seleccionar etiquetas de ubicaciones y categorias, descargar SVG e imprimir una hoja o guardar PDF.

Los codigos y las rutas son permanentes; solo el nombre visible se puede editar. Los QR usan exclusivamente PUBLIC_BASE_URL. Las fichas y los QR no ejecutan movimientos; los datos y la generacion QR conservan la proteccion de API key. Las etiquetas no incluyen credenciales. No hay soporte sin conexion ni cola de sincronizacion. Las fichas permiten relevar capacidades y registrar movimientos de plantas; lo pendiente figura como Sin relevar.

DonWeb: configurar solo el subdominio stock con el destino indicado por el alojamiento, y asociar el dominio y HTTPS en Render. No crear registros DNS por ruta.

## Plantas por cantero

Escanear el QR abre la ficha sin modificar existencias. Los enlaces nuevos de cantero usan /canteros/I01-C01/; los enlaces jerarquicos anteriores siguen vigentes. Los canteros y filas se crean con sus numeros reales, sin precargar 28 canteros ni capacidades estimadas.

En la ficha del cantero se relevan filas con capacidad uniforme o individual. Cada fila tiene una configuracion activa de maceta, identificada por nombre o codigo, sin medidas fisicas. No se cambia la configuracion mientras tenga ocupacion. Los resumenes separan capacidades por configuracion; si faltan filas por relevar el total se indica como incompleto. Equivalencia confirmada por el usuario: una maceta contiene una planta. Las cantidades del modulo son enteros en macetas.

Los ingresos, salidas, bajas y traslados se confirman tras revisar un resumen. La capacidad no cambia con los movimientos. Los movimientos se guardan como historial y los saldos se derivan de sus efectos; las bajas acumuladas se muestran aparte. El servidor bloquea las filas durante cada transaccion y rechaza saldos negativos, destinos no relevados, configuraciones diferentes o sobreocupacion. Un UUID permanente por operacion evita duplicados por reintentos y se rechaza reutilizarlo con otros datos.

Los traslados permiten elegir fila destino, pegar un enlace QR o usar camara cuando BarcodeDetector y HTTPS estan disponibles. El borrador se guarda en localStorage del mismo navegador para continuar al abrir el QR destino, incluso en otra pestana del mismo origen. No es una cola de operaciones ni hay sincronizacion sin conexion. No comparte borradores entre localhost y el dominio de produccion. Los registros de altura conservan lote, fila, valor, unidad (cm/m) y fecha.

La API conserva la API key existente. La integracion de usuarios y permisos individuales queda pendiente. El planificador y los movimientos de insumos no se modifican.

Pruebas: node scripts/test-ubicaciones.js; node scripts/test-plantas-ficha.js; node scripts/test-plantas.js. Esta ultima necesita PostgreSQL y crea un esquema aislado dentro de una transaccion que se revierte completamente.
