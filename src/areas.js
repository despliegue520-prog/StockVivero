module.exports = Object.freeze([
  ['camara', 'Cámara'],
  ['invernadero', 'Invernadero'],
  ['planta_madre', 'Planta Madre'],
  ['terceros', 'Terceros'],
  ['rusticadero', 'Rusticadero'],
  ['plantado', 'Plantado'],
  ['picado', 'Picado'],
  ['general', 'General'],
].map(([slug, nombre]) => Object.freeze({ slug, nombre })));
