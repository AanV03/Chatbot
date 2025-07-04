/**
 * @file Chat_logic.js
 * @description Lógica del chat del usuario. Administra sesiones, historial, conversaciones, envío de mensajes, feedback y renderizado.
 * @author 
 * @version 1.0
 */

/** 
 * Almacena todas las conversaciones por ID.
 * @type {Object.<string, Array<{rol: string, texto: string, timestamp: Date}>>}
 */
const conversaciones = {};

/**
 * ID de la conversación actual activa.
 * @type {string|null}
 */
let conversacionActual = localStorage.getItem('conversacionActual') || null;

// ==========================
// Persistencia de sesión anónima
// ==========================

if (!localStorage.getItem('sessionId')) {
    localStorage.setItem('sessionId', 'anon-' + Date.now());
}

/**
 * ID persistente del usuario, generado localmente.
 * @type {string}
 */
const usuarioId = localStorage.getItem('sessionId');


// ==========================
// Función principal de apertura
// ==========================

/**
 * Muestra la interfaz del chat, carga historial y activa la conversación actual.
 * @returns {Promise<void>}
 */
async function abrirChat() {
    const chat = document.getElementById('chat-container');
    chat.classList.remove('d-none');

    await cargarHistorialConversaciones();

    if (conversacionActual) {
        renderListaConversaciones();
        cargarConversacion(conversacionActual);
    } else {
        const nueva = await crearNuevaConversacion();
        if (nueva) {
            conversacionActual = nueva;
            localStorage.setItem('conversacionActual', nueva);
            renderListaConversaciones();
            cargarConversacion(nueva);
        }
    }
}



// funcion simplemente para cerrar la ventana del chat
function cerrarChat() {
    const chat = document.getElementById('chat-container');
    chat.classList.add('d-none');
}



/**
 * Renderiza en la interfaz la lista de conversaciones existentes.
 */
function renderListaConversaciones() {
    const lista = document.getElementById('chat-list');
    if (!lista) return;

    lista.innerHTML = '';

    Object.keys(conversaciones).forEach(id => {
        const conversacion = conversaciones[id];
        const nombreManual = conversacion?.nombre?.trim();
        const primerMensaje = conversacion.find(m => m.rol === 'user');
        const fecha = new Date(primerMensaje?.timestamp || Date.now()).toLocaleDateString('es-MX', {
            day: '2-digit', month: '2-digit', year: 'numeric'
        });

        const nombre = nombreManual || (primerMensaje?.texto?.slice(0, 40) ?? '(Sin nombre)');
        const resumen = primerMensaje?.texto?.slice(0, 60) ?? '...';

        const btn = document.createElement('button');
        btn.className = 'btn btn-sm w-100 text-start';
        btn.style.overflow = 'hidden';
        btn.style.textOverflow = 'ellipsis';
        btn.style.whiteSpace = 'normal';
        btn.style.color = 'white';
        btn.style.textAlign = 'left';
        btn.style.lineHeight = '1.3';

        // Si esta es la conversación actual, aplica estilos adicionales
        if (id === conversacionActual) {
            btn.classList.add('w-100');
            btn.classList.remove('chat-sidebar-btn');
            btn.style.color = 'white';
        }

        btn.innerHTML = `
            <strong>${nombre}</strong><br>
            <i class="bi bi-calendar-event-fill"></i> ${fecha}
        `;

        btn.onclick = () => cambiarConversacion(id);
        lista.appendChild(btn);
    });
}



/**
 * Cambia a una conversación específica por ID.
 * @param {string} id - ID de la conversación o 'nuevo'
 * @returns {Promise<void>}
 */
async function cambiarConversacion(id) {
    if (!id || id === 'nuevo') {
        const nuevoId = await crearNuevaConversacion();
        if (nuevoId) {
            conversacionActual = nuevoId;
            renderListaConversaciones();
            cargarConversacion(nuevoId);
        }
        return;
    }

    try {
        const resp = await fetch(`/api/conversacion/${id}`);
        if (!resp.ok) throw new Error('No encontrada');

        const data = await resp.json();
        conversaciones[id] = data.mensajes.map(m => ({
            rol: m.emisor === 'usuario' ? 'user' : 'bot',
            texto: m.contenido,
            timestamp: m.timestamp
        }));

        // 👇 Solo guardar nombre si fue personalizado (no nombre genérico)
        if (data.nombre && !data.nombre.toLowerCase().startsWith('chat')) {
            conversaciones[id].nombre = data.nombre.trim();
        }

        conversacionActual = id;
        localStorage.setItem('conversacionActual', id);
        cargarConversacion(id);
    } catch (err) {
        console.error('[ERROR] al cargar conversación:', err);
    }
}



/**
 * Crea una nueva conversación y la guarda en el servidor.
 * @returns {Promise<string>} El ID de la nueva conversación
 */
async function crearNuevaConversacion() {
    const nuevoId = 'chat-' + Date.now();

    const mensaje = {
        rol: 'bot',
        texto: 'Hola, soy GuardBot. ¿En qué puedo ayudarte?',
        timestamp: new Date()
    };

    conversaciones[nuevoId] = [mensaje];
    conversacionActual = nuevoId;
    localStorage.setItem('conversacionActual', nuevoId);

    await fetch('/api/conversacion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            sessionId: nuevoId,
            usuarioId: usuarioId,
            // nombre omitido => se genera visualmente con el primer prompt luego
            mensajes: [{
                mensajeId: `msg-${Date.now()}-0`,
                emisor: 'bot',
                contenido: mensaje.texto,
                timestamp: mensaje.timestamp
            }]
        })
    });

    renderListaConversaciones();
    console.log('[INFO] Conversación creada:', nuevoId);
    return nuevoId;
}



/**
 * Consulta al backend la respuesta del bot para una pregunta dada.
 * @param {string} pregunta
 * @returns {Promise<string>}
 */
async function obtenerRespuestaReal(pregunta) {
    try {
        const resp = await fetch('/api/consulta', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pregunta, sessionId: conversacionActual })
        });

        const data = await resp.json();
        return Array.isArray(data.respuestas) && data.respuestas.length > 0
            ? data.respuestas[0].respuesta
            : "Lo siento, no encontré una respuesta precisa a tu consulta.";
    } catch (err) {
        console.error('[ERROR] Al obtener respuesta del servidor:', err);
        return "Ocurrió un error al consultar la base de datos.";
    }
}



/**
 * Envía el mensaje del usuario, lo guarda, obtiene respuesta del bot y actualiza la conversación.
 */
async function enviarMensaje() {
    const input = document.getElementById('chat-text');
    const msg = input.value.trim();
    if (!msg) return;

    if (!conversacionActual || !conversaciones[conversacionActual]) {
        const nueva = await crearNuevaConversacion();
        if (nueva) {
            conversacionActual = nueva;
            renderListaConversaciones();
            cargarConversacion(nueva);
        } else {
            alert("No se pudo crear una nueva conversación.");
            return;
        }
    }

    const timestamp = new Date();
    const mensajeUsuario = { rol: 'user', texto: msg, timestamp };
    conversaciones[conversacionActual].push(mensajeUsuario);
    input.value = "";
    cargarConversacion(conversacionActual);

    guardarMensajeEnConversacion({
        mensajeId: `msg-${Date.now()}-u`,
        emisor: 'usuario',
        contenido: msg,
        timestamp
    });

    // ⬇️ Asignar nombre si es el primer mensaje del usuario y aún no hay nombre asignado
    const tieneNombre = conversaciones[conversacionActual].nombre;
    const yaHayUsuario = conversaciones[conversacionActual].filter(m => m.rol === 'user').length === 1;

    if (!tieneNombre && yaHayUsuario) {
        const nombreAuto = msg.slice(0, 40).trim();

        try {
            await fetch(`/api/conversacion/${conversacionActual}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nuevoNombre: nombreAuto })
            });
            conversaciones[conversacionActual].nombre = nombreAuto;
            renderListaConversaciones(); // para que se actualice el nombre en el sidebar
        } catch (err) {
            console.error('[ERROR] al asignar nombre automático:', err);
        }
    }

    const respuestaBot = await obtenerRespuestaReal(msg);

    const timeBot = new Date();
    const mensajeBot = { rol: 'bot', texto: respuestaBot, timestamp: timeBot };
    conversaciones[conversacionActual].push(mensajeBot);
    cargarConversacion(conversacionActual);

    guardarMensajeEnConversacion({
        mensajeId: `msg-${Date.now()}-b`,
        emisor: 'bot',
        contenido: respuestaBot,
        timestamp: timeBot
    });

    if (
        respuestaBot.toLowerCase().includes("no encontré una respuesta") ||
        respuestaBot.toLowerCase().includes("no tengo una respuesta") ||
        respuestaBot.toLowerCase().includes("ocurrió un error")
    ) {
        fetch('/api/feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId: conversacionActual,
                mensajes: [
                    { emisor: "usuario", mensaje: msg, timestamp },
                    { emisor: "bot", mensaje: respuestaBot, timestamp: timeBot }
                ],
                fueUtil: false,
                fin: new Date()
            })
        }).catch(err => {
            console.error('[ERROR] al enviar feedback automático:', err);
        });
    }
}



/**
 * Guarda un mensaje individual en el backend.
 * @param {{mensajeId: string, emisor: string, contenido: string, timestamp: Date}} mensaje
 */
function guardarMensajeEnConversacion(mensaje) {
    if (!conversacionActual) return;

    fetch('/api/conversacion/mensaje', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: conversacionActual, mensaje })
    }).catch(err => {
        console.error('[ERROR][guardarMensajeEnConversacion]', err);
    });
}



/**
 * Carga y muestra los mensajes de una conversación específica.
 * @param {string} id - ID de la conversación
 */
function cargarConversacion(id) {
    const mensajesDiv = document.getElementById('chat-messages');
    mensajesDiv.innerHTML = "";

    const mensajes = conversaciones[id];
    if (!mensajes) return;

    mensajes.forEach(msgObj => {
        const p = document.createElement("p");

        const hora = new Date(msgObj.timestamp).toLocaleTimeString('es-MX', {
            hour: '2-digit',
            minute: '2-digit'
        });

        const fecha = new Date(msgObj.timestamp).toLocaleDateString('es-MX');

        let contenido = '';
        let clase = '';

        switch (msgObj.rol) {
            case 'user':
                contenido = ` Tú: ${msgObj.texto}<br><span class="mensaje-timestamp"><i class="bi bi-clock-fill"></i> ${hora} <i class="bi bi-calendar-event-fill"></i> ${fecha}</span>`;
                clase = 'mensaje mensaje-user';
                break;
            case 'bot':
                contenido = `<i class="bi bi-robot"></i> EcoBot: ${msgObj.texto}<br><span class="mensaje-timestamp"> <i class="bi bi-clock-fill"></i> ${hora} <i class="bi bi-calendar-event-fill"></i> ${fecha}</span>`;
                clase = 'mensaje mensaje-bot';
                break;
            case 'sistema':
                contenido = `Sistema: ${msgObj.texto}`;
                clase = 'mensaje mensaje-sistema';
                break;
        }

        p.innerHTML = contenido;
        p.className = clase;
        mensajesDiv.appendChild(p);
    });

    const titulo = document.getElementById('chat-title');
    const nombreConversacion = conversaciones[id].nombre;
    titulo.textContent = nombreConversacion || 'Conversación sin título';

    mensajesDiv.scrollTop = mensajesDiv.scrollHeight;
}



/**
 * Registra la respuesta del usuario a una solicitud de feedback.
 * @param {boolean} util - Indica si la respuesta fue útil
 */
function responderFeedback(util) {
    const mensaje = util
        ? "¡Gracias por tu respuesta!"
        : "Gracias por avisarnos, lo mejoraremos.";
    conversaciones[conversacionActual].push({
        rol: 'sistema',
        texto: mensaje,
        timestamp: new Date()
    });
    document.getElementById('chat-modal').classList.add('d-none');
    cargarConversacion(conversacionActual);
}



/**
 * Carga el historial de conversaciones anteriores del usuario desde el backend.
 * @returns {Promise<void>}
 */
async function cargarHistorialConversaciones() {
    try {
        const resp = await fetch(`/api/conversaciones?usuarioId=${usuarioId}`);
        const data = await resp.json();

        const backup = { ...conversaciones };
        Object.keys(conversaciones).forEach(k => delete conversaciones[k]);

        let restaurarConversacion = null;
        if (backup[conversacionActual]) {
            restaurarConversacion = conversacionActual;
        }

        data.forEach(conv => {
            conversaciones[conv.sessionId] = {
                nombre: conv.nombre?.trim() || null,
                mensajesCargados: false
            };
        });

        await Promise.all(
            data.map(async (conv) => {
                try {
                    const r = await fetch(`/api/conversacion/${conv.sessionId}`);
                    const detalle = await r.json();

                    conversaciones[conv.sessionId] = detalle.mensajes.map(m => ({
                        rol: m.emisor === 'usuario' ? 'user' : 'bot',
                        texto: m.contenido,
                        timestamp: m.timestamp
                    }));

                    if (
                        detalle.nombre &&
                        !/^chat\s|^chat\s+sin/i.test(detalle.nombre.trim())
                    ) {
                        conversaciones[conv.sessionId].nombre = detalle.nombre.trim();
                    }

                } catch (e) {
                    console.error('[ERROR] al cargar conversación:', conv.sessionId, e);
                }
            })
        );

        // Restaurar conversación 
        if (
            restaurarConversacion &&
            conversaciones[restaurarConversacion] &&
            conversaciones[restaurarConversacion].some(m => m.rol === 'user')
        ) {
            conversacionActual = restaurarConversacion;
            localStorage.setItem('conversacionActual', restaurarConversacion);
        }

        renderListaConversaciones();

    } catch (err) {
        console.error('[ERROR] al cargar historial:', err);
    }
}



/**
 * Elimina la conversación actual del historial y del backend.
 * @returns {Promise<void>}
 */
async function eliminarConversacion() {
    if (!conversacionActual) return;

    if (confirm('¿Eliminar esta conversación?')) {
        try {
            await fetch(`/api/conversacion/${conversacionActual}`, { method: 'DELETE' });
            delete conversaciones[conversacionActual];
            localStorage.removeItem('conversacionActual');
            conversacionActual = null;

            await cargarHistorialConversaciones();

            const keys = Object.keys(conversaciones);
            if (keys.length > 0) {
                conversacionActual = keys[0];
                localStorage.setItem('conversacionActual', keys[0]);
                renderListaConversaciones();
                cargarConversacion(conversacionActual);
            } else {
                renderListaConversaciones();
                document.getElementById('chat-messages').innerHTML =
                    '<p class="sistema-msg">Haz clic en "Nueva conversación" para comenzar.</p>';
            }

        } catch (err) {
            console.error('[ERROR] al eliminar conversación:', err);
        }
    }
}



/**
 * Permite al usuario cambiar el nombre de la conversación actual.
 * @returns {Promise<void>}
 */
async function renombrarConversacion() {
    if (!conversacionActual) return;

    const nuevoNombre = prompt("Nuevo nombre para esta conversación:");
    if (!nuevoNombre || !nuevoNombre.trim()) return;

    try {
        await fetch(`/api/conversacion/${conversacionActual}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nuevoNombre: nuevoNombre.trim() })
        });

        if (conversaciones[conversacionActual]) {
            conversaciones[conversacionActual].nombre = nuevoNombre.trim();
        }

        await cargarHistorialConversaciones();
        renderListaConversaciones();
        cargarConversacion(conversacionActual);

    } catch (err) {
        console.error('[ERROR] al renombrar conversación:', err);
        alert("No se pudo cambiar el nombre");
    }
}



