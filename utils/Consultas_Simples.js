/**
 * @file Consultas_Simples.js
 * @description Módulo de búsqueda simple para el chatbot. Detecta coincidencias de tokens clave y frases relevantes usando intersección léxica.
 */

const Respuesta = require('../models/models_respuestas');

/**
 * Lista de palabras funcionales ignoradas durante el análisis semántico.
 * @type {Set<string>}
 */
const palabrasIgnoradas = new Set([
    'yo', 'tú', 'me', 'te', 'es', 'un', 'una', 'el', 'la', 'de', 'en', 'a', 'que',
    'por', 'con', 'mal', 'bien', 'muy', 'hace', 'como', 'qué', 'quién', 'cuando'
]);

/**
 * Limpia un texto: convierte a minúsculas y elimina tildes y diacríticos.
 * @param {string} str - Texto a limpiar.
 * @returns {string} Texto limpio.
 */
function limpiarTexto(str) {
    return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Calcula el porcentaje de coincidencia entre los tokens relevantes del input y las frases de referencia.
 * Ignora palabras comunes y evalúa la intersección de palabras significativas.
 * @param {string} input - Texto del usuario.
 * @param {string[]} referencias - Lista de frases o campos contra los cuales comparar.
 * @returns {number} Porcentaje de coincidencia entre 0 y 1.
 */
function calcularCoincidencia(input, referencias) {
    const inputTokens = new Set(
        limpiarTexto(input)
            .split(/\s+/)
            .filter(p => !palabrasIgnoradas.has(p) && p.length > 2)
    );
    const refTokens = new Set(
        referencias.flatMap(frase => limpiarTexto(frase).split(/\s+/))
    );
    const inter = [...inputTokens].filter(token => refTokens.has(token));
    return inter.length / Math.max(inputTokens.size, 1);
}

/**
 * Realiza una búsqueda simple basada en coincidencias por tokens clave en subtemas, palabras clave y otros campos.
 * Devuelve la mejor respuesta si el score de coincidencia es mayor o igual a 0.4.
 * @async
 * @param {string} textoUsuario - Pregunta original del usuario.
 * @returns {Promise<string|null>} Respuesta encontrada o `null` si no hay coincidencia suficiente.
 */
async function buscarConsultaSimple(textoUsuario) {
    const textoNorm = limpiarTexto(textoUsuario);
    console.log('[DEBUG][SIMPLE] Texto normalizado del usuario:', textoNorm);

    const respuestas = await Respuesta.find({}).lean();
    let mejorRespuesta = null;
    let mayorScore = 0;

    for (const r of respuestas) {
        const camposReferencia = [
            r.subtema,
            ...(r.palabras_clave || []),
            r.pregunta_clave,
            r.descripcion,
            r.ejemplo
        ].filter(Boolean);

        const score = calcularCoincidencia(textoNorm, camposReferencia);
        if (score > mayorScore) {
            mayorScore = score;
            mejorRespuesta = r;
        }
    }

    if (mayorScore >= 0.4) {
        console.log('[DEBUG][SIMPLE] Mejor match con score:', mayorScore.toFixed(2));
        return mejorRespuesta.respuesta;
    }

    console.log('[DEBUG][SIMPLE] No se encontró ninguna coincidencia útil.');
    return null;
}

module.exports = { buscarConsultaSimple };
