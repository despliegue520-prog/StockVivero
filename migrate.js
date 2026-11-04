require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
  });

  try {
    await client.connect();
    console.log('Conectado a la base de datos de Render...');

    const sqlPath = path.join(__dirname, 'sql', 'schema.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('Ejecutando schema.sql...');
    
    await client.query(sql);

    console.log('✅ Schema "stock" creado/actualizado correctamente.');
  } catch (error) {
    console.error('❌ Error ejecutando la migración:', error);
  } finally {
    await client.end();
  }
}

runMigration();