/**
 * @file Consultas_Simples.js
 * @description Módulo de búsqueda simple para el chatbot. Detecta coincidencias de tokens clave y frases relevantes.
 */

const Respuesta = require('../models/models_respuestas');

/** Palabras irrelevantes para el análisis semántico */
const palabrasIgnoradas = new Set([
    'yo', 'tú', 'me', 'te', 'es', 'un', 'una', 'el', 'la', 'de', 'en', 'a', 'que',
    'por', 'con', 'mal', 'bien', 'muy', 'hace', 'como', 'qué', 'quién', 'cuando'
]);

/**
 * Limpia tildes y normaliza texto
 * @param {string} str
 * @returns {string}
 */
function limpiarTexto(str) {
    return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Calcula coincidencia por intersección de tokens relevantes
 * @param {string} input
 * @param {string[]} referencias
 * @returns {number} porcentaje de match
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
 * Busca coincidencias simples por palabras clave o subtemas.
 * Devuelve la mejor respuesta si el match supera 0.4
 * @param {string} textoUsuario
 * @returns {Promise<string|null>}
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
