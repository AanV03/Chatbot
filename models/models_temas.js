/**
 * @file models_temas.js
 * @description Modelo de Mongoose que representa los temas principales del chatbot. Cada tema puede tener subtemas asociados y se identifica mediante una clave única.
 */

const mongoose = require('mongoose');

/**
 * Esquema que representa un tema general dentro del sistema de clasificación del chatbot.
 * Sirve como referencia para categorizar respuestas, preguntas clave e intenciones.
 */
const TemaSchema = new mongoose.Schema({
    /**
     * Nombre completo del tema. Ejemplo: "Contaminación del aire".
     */
    nombre: {
        type: String,
        required: true,
        trim: true
    },

    /**
     * Clave única que identifica el tema internamente.
     * Se usa para búsquedas y enlaces con otras colecciones (como respuestas).
     * Se guarda en minúsculas y sin espacios.
     */
    clave: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },

    /**
     * Descripción general del tema, opcional.
     * Útil para mostrar en interfaces o documentación.
     */
    descripcion: {
        type: String,
        default: '',
        trim: true
    },

    /**
     * Lista de subtemas que pertenecen a este tema.
     * Ejemplo: ['PM2.5', 'Ozono', 'Fuentes de emisión']
     */
    subtemas: {
        type: [String],
        default: []
    }

}, {
    /**
     * Agrega automáticamente campos `createdAt` y `updatedAt`.
     */
    timestamps: true
});

/**
 * Índice único sobre la clave para evitar duplicados.
 */
TemaSchema.index({ clave: 1 }, { unique: true });

/**
 * Modelo exportado. Usa mongoose.models.Tema si ya está definido para evitar redefiniciones en entornos como Next.js.
 */
module.exports = mongoose.models.Tema || mongoose.model('Tema', TemaSchema);
