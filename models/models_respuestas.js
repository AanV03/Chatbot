/**
 * @file models_respuestas.js
 * @description Modelo de Mongoose que representa una respuesta estructurada del chatbot. Incluye tema, subtema, pregunta clave, intención, tipo de respuesta y metadatos.
 */

const mongoose = require('mongoose');

/**
 * Esquema que define una respuesta específica del chatbot,
 * asociada a un tema y subtema, con metadatos de clasificación y utilidad.
 */
const RespuestaSchema = new mongoose.Schema({
    /**
     * Referencia al tema principal relacionado con esta respuesta.
     * Es una relación con el modelo 'Tema'.
     */
    tema: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Tema',
        required: true,
        index: true
    },

    /**
     * Subtema específico dentro del tema principal.
     */
    subtema: {
        type: String,
        required: true,
        trim: true,
        index: true
    },

    /**
     * Pregunta clave que resume o representa esta respuesta.
     * Utilizada para búsqueda aproximada o coincidencia directa.
     */
    pregunta_clave: {
        type: String,
        required: true,
        trim: true
    },

    /**
     * Respuesta textual completa que el bot debe entregar.
     */
    respuesta: {
        type: String,
        required: true
    },

    /**
     * Descripción opcional o aclaración adicional.
     */
    descripcion: {
        type: String,
        default: '',
        trim: true
    },

    /**
     * Palabras clave adicionales relacionadas con esta respuesta.
     * Utilizadas en coincidencias semánticas o búsqueda simple.
     */
    palabras_clave: {
        type: [String],
        default: []
    },

    /**
     * Intención asociada a esta respuesta.
     * Ej: informativa, técnica, salud, recomendación, otro.
     */
    intencion: {
        type: String,
        enum: ['informativa', 'tecnica', 'salud', 'recomendacion', 'otro'],
        default: 'informativa'
    },

    /**
     * Tipo de respuesta: texto plano, enlace, o personalizada.
     */
    tipo_respuesta: {
        type: String,
        enum: ['texto', 'enlace', 'otro'],
        default: 'texto'
    },

    /**
     * Ejemplo adicional opcional que ilustra el uso o contenido de la respuesta.
     */
    ejemplo: {
        type: String,
        default: ''
    }

}, {
    /**
     * Agrega automáticamente campos de fecha de creación y actualización.
     */
    timestamps: true
});

/**
 * Índice compuesto para mejorar las búsquedas por tema y subtema.
 */
RespuestaSchema.index({ tema: 1, subtema: 1 });

/**
 * Modelo exportado para la colección 'respuestas'.
 */
module.exports = mongoose.model('Respuesta', RespuestaSchema, 'respuestas');
