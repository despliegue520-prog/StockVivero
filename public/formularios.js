(() => {
  let accesoPendiente = null;
  window.solicitarTexto = ({ titulo, etiqueta, descripcion = '', textoAceptar, peligro = false, placeholder = '', valor = '', secreto = false, validar }) => new Promise(resolve => {
    const previo = document.activeElement;
    const fondo = document.createElement('div');
    fondo.style.cssText = 'position:fixed;inset:0;z-index:10000;background:#10291fc2;backdrop-filter:blur(4px);display:grid;place-items:center;padding:1rem;box-sizing:border-box;overflow:auto';
    const panel = document.createElement('form');
    panel.style.cssText = 'background:#fff;color:#193c2c;border:1px solid #dde5df;border-top:4px solid '+(peligro?'#c95137':'#24583e')+';border-radius:18px;padding:clamp(1.25rem,5vw,2rem);width:min(100%,480px);min-width:0;max-height:calc(100dvh - 2rem);overflow:auto;box-sizing:border-box;display:flex;flex-direction:column;align-items:stretch;gap:1.1rem;margin:auto;box-shadow:0 24px 80px #061a1840';
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true');
    const h = document.createElement('h2'); h.textContent = titulo; h.id = 'formulario-titulo-' + Math.random().toString(36).slice(2); panel.setAttribute('aria-labelledby', h.id);
    h.style.cssText='margin:0;width:100%;font:700 1.35rem/1.3 system-ui,sans-serif;letter-spacing:-.035em;color:#193c2c;overflow-wrap:anywhere';
    const label = document.createElement('label'); label.textContent = etiqueta; label.style.cssText = 'display:flex;flex-direction:column;align-items:stretch;gap:.6rem;color:#344d40;font:600 .85rem/1.5 system-ui,sans-serif;min-width:0;width:100%;margin:0;flex:none';
    const input = document.createElement('input'); input.type = secreto ? 'password' : 'text'; input.value = valor; input.required = true;
    input.maxLength = secreto ? 1000 : 150; input.autocomplete = secreto ? 'current-password' : 'off'; input.style.cssText = 'width:100%;box-sizing:border-box;padding:.75rem;border:1px solid #9daf9e;border-radius:8px;color:#193c2c;background:#fff;font:inherit'; label.append(input);
    input.placeholder=placeholder;
    const error = document.createElement('p'); error.setAttribute('role', 'alert'); error.style.cssText = 'color:#a53a25;margin:0';
    const acciones = document.createElement('div'); acciones.style.cssText = 'display:flex;justify-content:flex-end;align-items:stretch;flex-wrap:wrap;gap:.65rem;width:100%;box-sizing:border-box;padding-top:1rem;border-top:1px solid #e5ebe4;margin:0';
    const cancelar = document.createElement('button'); cancelar.type = 'button'; cancelar.textContent = 'Cancelar';
    const aceptar = document.createElement('button'); aceptar.type = 'submit'; aceptar.textContent = textoAceptar || (secreto ? 'Ingresar' : 'Guardar');
    [cancelar, aceptar].forEach(b => { b.style.cssText = 'padding:.75rem 1rem;border:1px solid #24583e;border-radius:9px;background:#24583e;color:white;cursor:pointer;font:600 .88rem/1.3 system-ui,sans-serif;min-height:44px;min-width:0;max-width:100%;box-sizing:border-box;margin:0;position:static;transform:none;flex:1 1 140px'; });
    cancelar.style.cssText+=';background:#f5f7f3;color:#365141;border-color:#dbe3d8';
    if(peligro)aceptar.style.cssText+=';background:#b8412e;border-color:#b8412e;color:#fff';
    acciones.append(cancelar, aceptar); panel.append(h, label, error, acciones); fondo.append(panel); document.body.append(fondo); input.focus();
    if(descripcion){const ayuda=document.createElement('p');ayuda.textContent=descripcion;ayuda.id=h.id+'-descripcion';ayuda.style.cssText='margin:0;font:400 .9rem/1.6 system-ui,sans-serif;color:#66776b';panel.insertBefore(ayuda,label);panel.setAttribute('aria-describedby',ayuda.id);}
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
        const response = await fetch(window.stockApiUrl('/categorias'), { headers: { 'x-api-key': key }, cache: 'no-store', credentials: window.stockApiCredentials });
        if (response.status === 401) throw new Error('La clave no es válida. Revisala e intentá nuevamente.');
        if (!response.ok) throw new Error('No se pudo verificar la clave. Intentá nuevamente.');
        sessionStorage.setItem('apiKey', key);
      }
    }).finally(() => { accesoPendiente = null; });
    return accesoPendiente;
  };
})();
