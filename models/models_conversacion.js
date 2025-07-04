/**
 * @file models_conversacion.js
 * @description Modelo de Mongoose para almacenar conversaciones del chatbot, incluyendo mensajes individuales y metadatos de sesión.
 */

const mongoose = require('mongoose');

/**
 * Esquema de un mensaje dentro de una conversación.
 * Cada mensaje contiene un ID, emisor, contenido textual y marca de tiempo.
 */
const MensajeSchema = new mongoose.Schema({
    /**
     * ID único del mensaje dentro de la conversación.
     */
    mensajeId: { type: String, required: true },

    /**
     * Emisor del mensaje, puede ser 'usuario' o 'bot'.
     */
    emisor: { type: String, enum: ['usuario', 'bot'], required: true },

    /**
     * Contenido textual del mensaje.
     */
    contenido: { type: String, required: true },

    /**
     * Marca de tiempo del momento en que fue enviado el mensaje.
     */
    timestamp: { type: Date, default: Date.now }
});

/**
 * Esquema principal que representa una conversación entre un usuario y el chatbot.
 * Incluye la sesión, el identificador del usuario, un nombre asignado y el historial de mensajes.
 */
const ConversacionSchema = new mongoose.Schema({
    /**
     * ID de la sesión, único por conversación. Facilita búsquedas y persistencia.
     */
    sessionId: {
        type: String,
        required: true,
        index: true
    },

    /**
     * ID del usuario que inició la conversación (puede ser anónimo).
     */
    usuarioId: {
        type: String,
        index: true
    },

    /**
     * Nombre personalizado de la conversación.
     */
    nombre: {
        type: String,
        default: 'Chat sin título'
    },

    /**
     * Arreglo de mensajes pertenecientes a la conversación.
     */
    mensajes: [MensajeSchema]
}, {
    /**
     * Agrega automáticamente campos `fechaCreacion` y `fechaActualizacion`.
     */
    timestamps: {
        createdAt: 'fechaCreacion',
        updatedAt: 'fechaActualizacion'
    }
});

/**
 * Modelo exportado para usar en controladores y consultas de MongoDB.
 * Colección: 'conversacion'
 */
module.exports = mongoose.model('Conversacion', ConversacionSchema, 'conversacion');
