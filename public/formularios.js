// Formularios HTML compatibles con visores que no admiten prompt().
(() => {
  let accesoPendiente = null;
  window.solicitarTexto = ({ titulo, etiqueta, valor = '', secreto = false, validar }) => new Promise(resolve => {
    const previo = document.activeElement;
    const fondo = document.createElement('div');
    fondo.style.cssText = 'position:fixed;inset:0;z-index:10000;background:#0009;display:grid;place-items:center;padding:1rem';
    const panel = document.createElement('form');
    panel.style.cssText = 'background:#fff;color:#193c2c;border-radius:14px;padding:1.5rem;width:min(100%,420px);display:grid;gap:1rem;box-shadow:0 20px 60px #0004';
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true');
    const h = document.createElement('h2'); h.textContent = titulo; h.id = 'formulario-titulo-' + Math.random().toString(36).slice(2); panel.setAttribute('aria-labelledby', h.id);
    const label = document.createElement('label'); label.textContent = etiqueta; label.style.cssText = 'display:grid;gap:.5rem;color:#193c2c';
    const input = document.createElement('input'); input.type = secreto ? 'password' : 'text'; input.value = valor; input.required = true;
    input.maxLength = secreto ? 1000 : 150; input.autocomplete = secreto ? 'current-password' : 'off'; input.style.cssText = 'width:100%;box-sizing:border-box;padding:.75rem;border:1px solid #9daf9e;border-radius:8px;color:#193c2c;background:#fff;font:inherit'; label.append(input);
    const error = document.createElement('p'); error.setAttribute('role', 'alert'); error.style.cssText = 'color:#a53a25;margin:0';
    const acciones = document.createElement('div'); acciones.style.cssText = 'display:flex;justify-content:flex-end;gap:.7rem';
    const cancelar = document.createElement('button'); cancelar.type = 'button'; cancelar.textContent = 'Cancelar';
    const aceptar = document.createElement('button'); aceptar.type = 'submit'; aceptar.textContent = secreto ? 'Ingresar' : 'Guardar';
    [cancelar, aceptar].forEach(b => { b.style.cssText = 'padding:.7rem 1rem;border:1px solid #24583e;border-radius:8px;background:#24583e;color:white;cursor:pointer;font:inherit'; });
    acciones.append(cancelar, aceptar); panel.append(h, label, error, acciones); fondo.append(panel); document.body.append(fondo); input.focus();
    let cerrado = false;
    const terminar = value => { if (cerrado) return; cerrado = true; fondo.remove(); previo?.focus(); resolve(value); };
    cancelar.onclick = () => terminar(null);
    panel.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !aceptar.disabled) { event.preventDefault(); terminar(null); }
      if (event.key === 'Tab') {
        const focusables = [input, cancelar, aceptar].filter(n => !n.disabled);
        if (event.shiftKey && document.activeElement === focusables[0]) { event.preventDefault(); focusables.at(-1).focus(); }
        else if (!event.shiftKey && document.activeElement === focusables.at(-1)) { event.preventDefault(); focusables[0].focus(); }
      }
    });
    panel.onsubmit = async event => {
      event.preventDefault(); const texto = input.value.trim(); if (!texto) return;
      aceptar.disabled = true; cancelar.disabled = true; input.disabled = true; error.textContent = '';
      try { if (validar) await validar(texto); terminar(texto); }
      catch (err) { error.textContent = err.message || 'No se pudo completar la solicitud'; }
      finally { aceptar.disabled = false; cancelar.disabled = false; input.disabled = false; if (!cerrado) input.focus(); }
    };
  });
  window.solicitarClave = () => {
    if (!accesoPendiente) accesoPendiente = window.solicitarTexto({
      titulo: 'Acceso a Los Aromos', etiqueta: 'API key', secreto: true,
      validar: async key => {
        const response = await fetch('/categorias', { headers: { 'x-api-key': key }, cache: 'no-store' });
        if (response.status === 401) throw new Error('La clave no es válida. Revisala e intentá nuevamente.');
        if (!response.ok) throw new Error('No se pudo verificar la clave. Intentá nuevamente.');
        sessionStorage.setItem('apiKey', key);
      }
    }).finally(() => { accesoPendiente = null; });
    return accesoPendiente;
  };
})();
