/**
 * @file registrarFeedback.js
 * @description Módulo encargado de registrar automáticamente el feedback cuando el bot no encuentra una respuesta útil. Guarda intención, tema y subtema detectados, junto con los mensajes.
 */

const ChatFeedback = require('../models/models_Feedback');

/**
 * Registra un documento de retroalimentación en la base de datos cuando el bot no puede proporcionar una respuesta útil.
 *
 * @param {Object} params - Parámetros necesarios para registrar el feedback.
 * @param {string} params.sessionId - ID de la sesión actual del usuario.
 * @param {string} params.pregunta - Pregunta original realizada por el usuario.
 * @param {Object} params.analisis - Resultado del análisis NLP de la pregunta.
 * @param {string} [params.analisis.intencion] - Intención detectada en la pregunta.
 * @param {string} [params.analisis.tema] - Tema identificado en la pregunta.
 * @param {string} [params.analisis.subtema] - Subtema identificado en la pregunta.
 * @returns {Promise<void>}
 */
async function registrarFeedback({ sessionId, pregunta, analisis }) {
    try {
        const feedback = await ChatFeedback.create({
            sessionId,
            mensajes: [
                { emisor: 'usuario', mensaje: pregunta },
                { emisor: 'bot', mensaje: 'No encontré una respuesta clara a tu consulta. 😔' }
            ],
            intencionesDetectadas: [analisis.intencion],
            temasDetectados: analisis.tema ? [String(analisis.tema)] : [],
            subtemasDetectados: analisis.subtema ? [analisis.subtema] : [],
            inicio: new Date(),
            fin: new Date()
        });

        console.log('[FEEDBACK] Registrado:', feedback._id);
    } catch (err) {
        console.error('[FEEDBACK] Error al registrar:', err);
    }
}

module.exports = { registrarFeedback };
