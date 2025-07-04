/**
 * @file NLP.js
 * @description Procesamiento de lenguaje natural para detectar intención, tema y subtema en preguntas del usuario.
 */

const nlp = require('compromise');
const fuzzysort = require('fuzzysort');
const Respuesta = require('./models/models_respuestas');
const Tema = require('./models/models_temas');
const { PalabrasClave, PalabrasPorSubtema } = require('./utils/palabras_tema');

/**
 * Intenciones posibles clasificadas por patrones típicos de texto.
 * @type {Object.<string, string[]>}
 */
// === Intenciones detectadas por frases clave ===
const intenciones = {
    informativa: ["qué es", "cómo afecta", "cuáles son", "describe", "detalla", "significa", "en qué consiste", "cómo varía", "por qué es importante", "cual es la diferencia", "cómo contaminan", "cómo contribuye", "cómo está estructurado", "cómo funcionan", "cómo se mide"],
    recomendacion: ["puedo hacer", "qué consejos", "cómo prevenir", "cómo reducir", "cómo evitar", "cómo mejorar", "dame consejos", "me recomiendas", "cómo protegerme", "cómo aprovechar", "cómo elegir", "cómo cuidar", "qué alternativas"],
    tecnica: ["cómo funciona", "cómo se mide", "detección", "arquitectura", "tecnología", "estructura técnica", "cómo están conectados", "cómo procesan los datos", "cómo se configuran", "cómo opera", "cómo se comunica", "cómo monitorea", "cómo sincroniza", "cómo ventila", "cómo purifica"],
    salud: ["afecta", "enferma", "daña", "provoca", "impacta", "riesgo", "consecuencias", "síntomas", "me hace daño", "a la salud", "cómo afecta la salud", "intoxicación", "problemas respiratorios", "daños a largo plazo", "qué efectos"]
};

/**
 * Correcciones para malformulaciones frecuentes del usuario.
 * @type {Object.<string, string>}
 */
// Corrección de malformulaciones comunes
const MalFormulacion = {
    "que ase": "qué hace",
    "como funsiona": "cómo funciona",
    "me puedes desir": "me puedes decir",
    "que es el smock": "qué es el smog",
    "co mo se usa": "cómo se usa",
    "aire puresa": "aire pureza"
};

/**
 * Limpia un texto convirtiéndolo a minúsculas, eliminando tildes y caracteres especiales.
 * @param {string} str - Texto a limpiar.
 * @returns {string} Texto limpio y normalizado.
 */
function limpiarTexto(str) {
        return str.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w\s]/g, "");
}

/**
 * Corrige expresiones mal formuladas con base en una tabla de reemplazo.
 * @param {string} texto - Texto a corregir.
 * @returns {string} Texto corregido.
 */
function corregirMalFormulacion(texto) {
    let textoNorm = limpiarTexto(texto);
    for (const [mal, bien] of Object.entries(MalFormulacion)) {
        if (textoNorm.includes(limpiarTexto(mal))) {
            return texto.replace(new RegExp(mal, "gi"), bien);
        }
    }
    return texto;
}

/**
 * Detecta la intención del usuario con base en expresiones comunes.
 * @param {string} texto - Texto normalizado.
 * @returns {string} Intención detectada.
 */
function detectarIntencion(texto) {
    for (const [intencion, frases] of Object.entries(intenciones)) {
        if (frases.some(f => texto.includes(f))) return intencion;
    }
    return "informativa";
}

/**
 * Calcula un score de similitud entre dos cadenas basado en el índice de Jaccard.
 * @param {string} a - Texto A.
 * @param {string} b - Texto B.
 * @returns {number} Score de similitud entre 0 y 1.
 */
function calcularScore(a, b) {
    const setA = new Set(a.split(/\s+/));
    const setB = new Set(b.split(/\s+/));
    const inter = [...setA].filter(p => setB.has(p));
    const union = new Set([...setA, ...setB]);
    return inter.length / Math.max(union.size, 1);
}

/**
 * Analiza una pregunta del usuario para detectar intención, tema y subtema.
 * Usa similitud textual, heurística y coincidencias difusas.
 * @async
 * @param {string} pregunta - Pregunta original del usuario.
 * @returns {Promise<Object>} Resultado del análisis con detalles como intención, tema, subtema y score.
 */
async function analizarPregunta(pregunta) {
    console.log('[NLP] Pregunta cruda:', pregunta);

    const textoCorregido = corregirMalFormulacion(pregunta);
    const textoNormalizado = limpiarTexto(
        nlp(textoCorregido).normalize({ punctuation: true, plurals: true }).out('text')
    );
    console.log('[NLP] Texto normalizado:', textoNormalizado);

    const intencion = detectarIntencion(textoNormalizado);
    const respuestas = await Respuesta.find({}).lean();
    const temas = await Tema.find({}).lean();

    let temaDetectado = null;
    let subtemaDetectado = null;
    let mejorScore = 0;
    let mejorCoincidencia = null;

    const tokens = textoNormalizado.split(/\s+/).filter(Boolean);

    // Evaluación directa por similitud textual
    for (const r of respuestas) {
        const campos = [r.pregunta_clave, r.descripcion, r.respuesta, r.ejemplo].map(c => limpiarTexto(c || ''));
        const score = calcularScore(textoNormalizado, campos[0]) * 0.5 +
            calcularScore(textoNormalizado, campos[1]) * 0.2 +
            calcularScore(textoNormalizado, campos[2]) * 0.2 +
            calcularScore(textoNormalizado, campos[3]) * 0.1;

        if (score > mejorScore) {
            mejorScore = score;
            mejorCoincidencia = r;
        }
    }

    if (mejorCoincidencia && mejorScore >= 0.45) {
        subtemaDetectado = mejorCoincidencia.subtema;
        temaDetectado = mejorCoincidencia.tema;
        console.log(`[DEBUG][NLP] Coincidencia fuerte con: ${mejorCoincidencia.pregunta_clave} score: ${mejorScore.toFixed(2)}`);
    }

    // Coincidencia difusa si no hay match fuerte
    if (!subtemaDetectado && mejorScore < 0.45) {
        const fuzzyMatch = fuzzysort.go(textoNormalizado, respuestas, {
            keys: ['pregunta_clave', 'descripcion'],
            limit: 1,
            threshold: -1000
        });

        if (fuzzyMatch.length && fuzzyMatch[0].score < -10) {
            const mejor = fuzzyMatch[0].obj;
            subtemaDetectado = mejor.subtema;
            temaDetectado = mejor.tema;
            mejorCoincidencia = mejor;
            mejorScore = 0.42;
            console.log(`[DEBUG][NLP] Coincidencia fuzzy con: ${mejor.pregunta_clave}`);
        }
    }

    // Heurística por palabras clave si no hay coincidencia directa
    if (!subtemaDetectado || mejorScore < 0.3) {
        let mejoresCoincidencias = [];

        for (const [subtema, sinonimos] of Object.entries(PalabrasPorSubtema)) {
            const coincidencias = sinonimos.filter(p => tokens.includes(limpiarTexto(p))).length;
            if (coincidencias > 0) {
                mejoresCoincidencias.push({ subtema, coincidencias });
            }
        }

        mejoresCoincidencias.sort((a, b) => b.coincidencias - a.coincidencias);

        if (mejoresCoincidencias.length > 0) {
            const mejor = mejoresCoincidencias[0];
            const minCoincidencias = 1;

            const subtemaExiste = respuestas.some(r => r.subtema && limpiarTexto(r.subtema) === limpiarTexto(mejor.subtema));
            if (subtemaExiste && mejor.coincidencias >= minCoincidencias) {
                subtemaDetectado = mejor.subtema;
                console.log('[DEBUG][NLP] Subtema heurístico:', subtemaDetectado);
            }
        }
    }

    // Detección de tema por palabras clave
    if (!temaDetectado) {
        for (const [clave, lista] of Object.entries(PalabrasClave)) {
            if (lista.some(p => textoNormalizado.includes(limpiarTexto(p)))) {
                const t = temas.find(t => limpiarTexto(t.clave) === limpiarTexto(clave));
                if (t) {
                    temaDetectado = t._id;
                    break;
                }
            }
        }
    }

    // Inferencia de tema si se conoce el subtema
    if (subtemaDetectado && !temaDetectado) {
        const subtemaMatch = respuestas.find(r => r.subtema === subtemaDetectado);
        if (subtemaMatch) {
            temaDetectado = subtemaMatch.tema;
            console.log('[DEBUG][NLP] Forzado tema desde subtema:', subtemaDetectado);
        }
    }

    const razonamiento = mejorScore >= 0.45
        ? 'Detectado por similitud textual fuerte'
        : subtemaDetectado
            ? 'Subtema heurístico o fuzzy'
            : temaDetectado
                ? 'Tema por keyword'
                : 'Sin coincidencia clara';

    const esConsultaAmbigua = !temaDetectado || (mejorScore < 0.3 && !subtemaDetectado);

    const subtemasGenericos = ['agradecimientos', 'saludos', 'respuesta_positiva'];
    const fueraDeDominio =
        (!temaDetectado && !subtemaDetectado && mejorScore < 0.15) ||
        (subtemasGenericos.includes(String(subtemaDetectado)?.toLowerCase()) && mejorScore < 0.15);

    if (esConsultaAmbigua || fueraDeDominio) {
        console.warn('[NLP][WARN] Consulta ambigua o fuera de dominio:', {
            pregunta,
            textoNormalizado,
            intencion,
            mejorScore,
            temaDetectado,
            subtemaDetectado,
            fueraDeDominio
        });
    }

    return {
        pregunta,
        textoNormalizado,
        intencion,
        tema: temaDetectado,
        subtema: subtemaDetectado,
        razonamiento,
        score: mejorScore,
        esConsultaAmbigua,
        fueraDeDominio
    };
}

module.exports = { analizarPregunta, limpiarTexto };
