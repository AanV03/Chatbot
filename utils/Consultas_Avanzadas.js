/**
 * @file Consultas_Avanzadas.js
 * @description Búsqueda avanzada optimizada: prioriza coincidencia por subtema + intención, luego por tema, y selecciona la mejor pregunta_clave semánticamente.
 */

const Respuesta = require('../models/models_respuestas');
const { analizarPregunta } = require('../NLP');
const { buscarConsultaSimple } = require('./Consultas_Simples');
const { registrarFeedback } = require('./Feedback');

/**
 * Limpia un texto convirtiéndolo a minúsculas, eliminando acentos y caracteres especiales.
 * @param {string} str - Texto a limpiar.
 * @returns {string} Texto limpio y normalizado.
 */
function limpiarTexto(str) {
    return str?.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\s]/g, '') || '';
}

/**
 * Calcula una métrica de similitud entre dos textos basada en la intersección de palabras.
 * @param {string} a - Primer texto.
 * @param {string} b - Segundo texto.
 * @returns {number} Score de similitud entre 0 y 1.
 */
function calcularScore(a, b) {
    const setA = new Set(a.split(/\s+/));
    const setB = new Set(b.split(/\s+/));
    const inter = [...setA].filter(p => setB.has(p));
    return inter.length / Math.max(setA.size, 1);
}

/**
 * Realiza una búsqueda avanzada de respuesta utilizando intención, subtema y tema como filtros jerárquicos.
 * Utiliza fallback semántico y textual si no hay coincidencias exactas.
 * @async
 * @param {string} textoUsuario - Pregunta original del usuario.
 * @param {string} [sessionId='default'] - ID de sesión del usuario.
 * @returns {Promise<Array<Object>>} Lista de respuestas más relevantes ordenadas por score.
 */
async function buscarConsultaAvanzada(textoUsuario, sessionId = 'default') {
    const analisis = await analizarPregunta(textoUsuario);
    const { textoNormalizado, tema, subtema, intencion, fueraDeDominio } = analisis;

    console.log('[DEBUG] Analisis NLP:', analisis);

    // Si la pregunta está fuera de dominio, registrar como feedback
    if (fueraDeDominio) {
        await registrarFeedback({ sessionId, pregunta: textoUsuario, analisis });
        return [{
            respuesta: 'Lo siento, esa pregunta no está relacionada con los temas que manejo. ¿Quieres preguntar algo sobre calidad del aire, sensores o salud?',
            origen: 'feedback_guardado'
        }];
    }

    let filtros = [];

    // Filtros jerárquicos de precisión alta a baja
    if (tema && subtema && intencion) {
        filtros.push({ tema, subtema: new RegExp(`^${subtema}$`, 'i'), intencion });
    }
    if (tema && subtema) {
        filtros.push({ tema, subtema: new RegExp(`^${subtema}$`, 'i') });
    }
    if (subtema && intencion) {
        filtros.push({ subtema: new RegExp(`^${subtema}$`, 'i'), intencion });
    }
    if (subtema) {
        filtros.push({ subtema: new RegExp(`^${subtema}$`, 'i') });
    }
    if (tema && intencion) {
        filtros.push({ tema, intencion });
    }
    if (tema) {
        filtros.push({ tema });
    }

    let respuestas = [];

    // Búsqueda inicial filtrada por subtema o tema
    let filtroPrincipal = {};
    if (subtema) filtroPrincipal.subtema = new RegExp(`^${subtema}$`, 'i');
    else if (tema) filtroPrincipal.tema = tema;

    respuestas = await Respuesta.find(filtroPrincipal).lean();
    console.log('[DEBUG] Respuestas encontradas (sin filtrar intención):', respuestas.length);

    // Fallback textual simple si no hay resultados
    if (!respuestas.length) {
        const palabras = textoNormalizado.split(/\s+/).filter(w => w.length > 2);
        const regex = new RegExp(palabras.slice(0, 5).join('|'), 'i');

        respuestas = await Respuesta.find({
            $or: [
                { pregunta_clave: regex },
                { respuesta: regex },
                { descripcion: regex },
                { ejemplo: regex },
                { palabras_clave: { $in: [regex] } }
            ]
        }).lean();
    }

    // Fallback a búsqueda simple si sigue sin resultados
    if (!respuestas.length) {
        const simple = await buscarConsultaSimple(textoUsuario);
        if (simple) {
            return [{
                respuesta: simple,
                fuente: 'consulta_simple'
            }];
        }

        // Registrar como feedback si aún no se encuentra respuesta
        await registrarFeedback({ sessionId, pregunta: textoUsuario, analisis });
        return [{
            respuesta: 'No encontré una respuesta clara a tu consulta.',
            origen: 'feedback_guardado'
        }];
    }

    // Ranking por similitud semántica ponderada
    const scored = respuestas.map(r => {
        const score =
            calcularScore(textoNormalizado, limpiarTexto(r.pregunta_clave)) * 0.5 +
            calcularScore(textoNormalizado, limpiarTexto(r.descripcion)) * 0.2 +
            calcularScore(textoNormalizado, limpiarTexto(r.respuesta)) * 0.2 +
            calcularScore(textoNormalizado, limpiarTexto(r.ejemplo)) * 0.1;
        return { ...r, score };
    }).sort((a, b) => b.score - a.score);

    const top = scored[0];

    if (top?.score < 0.2 && scored.length > 3) {
        console.warn('[WARN] Score muy bajo. La respuesta puede no ser relevante.');
    }

    if (top) {
        console.log('[DEBUG][FINAL] Respuesta enviada al usuario:');
        console.log('→ Subtema:', top.subtema);
        console.log('→ Intención:', top.intencion);
        console.log('→ Respuesta:', top.respuesta);
    }

    return scored.slice(0, 3);
}

module.exports = { buscarConsultaAvanzada };
