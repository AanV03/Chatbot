/**
 * @file models_Feedback.js
 * @description Modelo de Mongoose para almacenar retroalimentación del chatbot cuando una respuesta no fue útil o incompleta.
 */

const mongoose = require('mongoose');

/**
 * Esquema de un mensaje dentro del historial de feedback.
 * Se utiliza para registrar tanto la entrada del usuario como la respuesta del bot asociada.
 */
const MensajeSchema = new mongoose.Schema({
    /**
     * Emisor del mensaje: 'usuario' o 'bot'.
     */
    emisor: { type: String, enum: ['usuario', 'bot'], required: true },

    /**
     * Contenido textual del mensaje.
     */
    mensaje: { type: String, required: true },

    /**
     * Fecha y hora en la que se generó el mensaje.
     */
    timestamp: { type: Date, default: Date.now }
});

/**
 * Esquema principal que representa un documento de retroalimentación.
 * Se genera cuando el bot no puede dar una respuesta satisfactoria al usuario.
 */
const ChatFeedbackSchema = new mongoose.Schema({
    /**
     * ID de la sesión en la que ocurrió el problema.
     */
    sessionId: { type: String, required: true, index: true },

    /**
     * Arreglo de mensajes relacionados con la retroalimentación (usuario y bot).
     */
    mensajes: { type: [MensajeSchema], required: true },

    /**
     * Indica si la respuesta del bot fue útil (true), no útil (false) o sin respuesta aún (null).
     */
    fueUtil: { type: Boolean, default: null },

    /**
     * Lista de intenciones detectadas por el motor NLP al analizar la pregunta.
     */
    intencionesDetectadas: { type: [String], default: [] },

    /**
     * Lista de temas detectados durante el análisis de la consulta.
     */
    temasDetectados: { type: [String], default: [] },

    /**
     * Lista de subtemas detectados relacionados con la pregunta original.
     */
    subtemasDetectados: { type: [String], default: [] },

    /**
     * Momento en que inició la interacción con el usuario.
     */
    inicio: { type: Date, required: true, default: Date.now },

    /**
     * Momento en que se registró el feedback o se finalizó la conversación.
     */
    fin: { type: Date }

}, {
    /**
     * Agrega automáticamente `createdAt` y `updatedAt` al documento.
     */
    timestamps: true
});

/**
 * Modelo exportado para registrar retroalimentación del chatbot en la colección 'feedback'.
 */
module.exports = mongoose.model('ChatFeedback', ChatFeedbackSchema, 'feedback');
