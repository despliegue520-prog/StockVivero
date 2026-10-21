require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pool = require('./db');
const productos = require('./routes/productos');
const movimientos = require('./routes/movimientos');

const app = express();

app.use(cors());
app.use(express.json());

// Frontend estático (sin API key)
app.use(express.static(require('path').join(__dirname, '..', 'public')));

// Health check (sin API key, útil para Render)
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false });
  }
});

// Evitar que la solicitud automática del favicon llegue al middleware de API key.
app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

// Protección opcional por API key
app.use((req, res, next) => {
  const key = process.env.API_KEY;
  if (key && req.header('x-api-key') !== key) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  next();
});

app.use('/productos', productos);
app.use('/movimientos', movimientos);

app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: status === 500 ? 'Error interno' : err.message });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Stock API escuchando en el puerto ${PORT}`));
