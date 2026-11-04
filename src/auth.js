const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const pool = require('./db');

function jwtSecret() {
  return process.env.JWT_SECRET || process.env.SESSION_SECRET || process.env.API_KEY || '';
}

async function buscarUsuario(nombreUsuario) {
  const tabla = process.env.AUTH_USERS_TABLE || 'usuario';
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tabla)) throw new Error('Configuración de tabla de usuarios inválida');
  const { rows } = await pool.query(
    `SELECT id, nombre, nombre_usuario, password_hash, rol, activo
     FROM "${tabla}"
     WHERE nombre_usuario = $1
     LIMIT 1`,
    [nombreUsuario.trim().toLowerCase()]
  );
  return rows[0] || null;
}

async function validarPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function crearToken(usuario) {
  return jwt.sign(
    {
      id: usuario.id,
      nombre: usuario.nombre,
      nombre_usuario: usuario.nombre_usuario,
      rol: usuario.rol,
    },
    jwtSecret(),
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
}

function autenticar(req, res, next) {
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ') && jwtSecret()) {
    try {
      req.user = jwt.verify(authHeader.slice(7), jwtSecret());
      return next();
    } catch {
      return res.status(401).json({ error: 'Token inválido o expirado' });
    }
  }

  const apiKey = process.env.API_KEY;
  if (apiKey && req.header('x-api-key') === apiKey) {
    req.user = { nombre_usuario: 'api-key', rol: 'admin' };
    return next();
  }

  return res.status(401).json({ error: 'No autorizado' });
}

module.exports = { buscarUsuario, validarPassword, crearToken, autenticar };
