const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
let document;
class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.style = {}; this.value = ''; }
  append(...children) { this.children.push(...children); children.forEach(c => { c.parent = this; }); }
  setAttribute(name, value) { this[name] = value; }
  addEventListener() {}
  focus() { document.activeElement = this; }
  remove() { this.parent.children = this.parent.children.filter(c => c !== this); }
}
document = { body: new Element('body'), createElement: tag => new Element(tag), activeElement: null };
const values = new Map();
const context = {
  window: { stockApiUrl: path => path, stockApiCredentials: 'same-origin' }, document,
  sessionStorage: { setItem: (k,v) => values.set(k,v) },
  fetch: async (url, options) => ({ status: options.headers['x-api-key'] === 'test-valid' ? 200 : 401, ok: options.headers['x-api-key'] === 'test-valid' })
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/formularios.js'), 'utf8'), context);
(async () => {
  const primero = context.window.solicitarClave(), segundo = context.window.solicitarClave();
  assert.equal(primero, segundo, 'Solicitudes paralelas deben compartir un único formulario');
  assert.equal(document.body.children.length, 1);
  const panel = document.body.children[0].children[0];
  const input = panel.children[1].children[0];
  assert.equal(input.type, 'password');
  input.value = 'incorrecta'; await panel.onsubmit({ preventDefault() {} });
  assert.match(panel.children[2].textContent, /no es válida/);
  assert.equal(document.body.children.length, 1);
  assert.equal(values.has('apiKey'), false);
  input.value = 'test-valid'; await panel.onsubmit({ preventDefault() {} });
  assert.equal(await primero, 'test-valid'); assert.equal(values.get('apiKey'), 'test-valid');
  assert.equal(document.body.children.length, 0);
  const cancelado = context.window.solicitarClave();
  document.body.children[0].children[0].children[3].children[0].onclick();
  assert.equal(await cancelado, null);
  console.log('OK: acceso sin prompt, clave oculta, error recuperable, formulario único y cancelación.');
})().catch(err => { console.error(err); process.exitCode = 1; });
