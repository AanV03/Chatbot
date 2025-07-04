const nlp = require('compromise');
const Respuesta = require('./models/models_respuestas');
const Tema = require('./models/models_temas');
const { PalabrasClave, PalabrasPorSubtema } = require('./utils/palabras_tema');

// === Intenciones ===
const intenciones = {
    informativa: [
        "qué es", "cómo afecta", "cuáles son", "describe", "detalla", "significa",
        "en qué consiste", "cómo varía", "por qué es importante", "cual es la diferencia",
        "cómo contaminan", "cómo contribuye", "cómo está estructurado", "cómo funcionan", "cómo se mide"
    ],
    recomendacion: [
        "puedo hacer", "qué consejos", "cómo prevenir", "cómo reducir", "cómo evitar",
        "cómo mejorar", "dame consejos", "me recomiendas", "cómo protegerme", "cómo aprovechar",
        "cómo elegir", "cómo evitar la exposición", "cómo usar el sensor", "cómo cuidar", "qué alternativas"
    ],
    tecnica: [
        "cómo funciona", "cómo se mide", "detección", "arquitectura", "tecnología", "estructura técnica",
        "cómo están conectados", "cómo procesan los datos", "cómo se configuran", "cómo opera",
        "cómo se comunica", "cómo monitorea", "cómo sincroniza", "cómo ventila", "cómo purifica"
    ],
    salud: [
        "afecta", "enferma", "daña", "provoca", "impacta", "riesgo", "consecuencias", "síntomas",
        "me hace daño", "a la salud", "cómo afecta la salud", "intoxicación", "problemas respiratorios",
        "daños a largo plazo", "qué efectos"
    ]
};

const MalFormulacion = {
    "que ase": "qué hace",
    "como funsiona": "cómo funciona",
    "me puedes desir": "me puedes decir",
    "que es el smock": "qué es el smog",
    "co mo se usa": "cómo se usa",
    "aire puresa": "aire pureza"
};

// === Utilidades ===
function limpiarTexto(str) {
    return str.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function corregirMalFormulacion(texto) {
    let textoNorm = limpiarTexto(texto);
    for (const [mal, bien] of Object.entries(MalFormulacion)) {
        if (textoNorm.includes(limpiarTexto(mal))) {
            return texto.replace(new RegExp(mal, "gi"), bien);
        }
    }
    return texto;
}

function detectarIntencion(texto) {
    for (const [intencion, frases] of Object.entries(intenciones)) {
        if (frases.some(f => texto.includes(f))) return intencion;
    }
    return "informativa";
}

function calcularScore(texto, campo) {
    const limpiar = str => str.toLowerCase().replace(/[^\w\s]/gi, '').split(/\s+/);
    const setA = new Set(limpiar(texto));
    const setB = new Set(limpiar(campo));
    return [...setA].filter(x => setB.has(x)).length / Math.max(setA.size, 1);
}

// === Procesamiento principal ===
async function analizarPregunta(pregunta) {
    console.log('[NLP] Pregunta cruda:', pregunta);
    const textoCorregido = corregirMalFormulacion(pregunta);
    const textoNormalizado = limpiarTexto(
        nlp(textoCorregido).normalize({ punctuation: true, plurals: true }).out('text')
    );
    console.log('[nlpProcessor] Texto normalizado:', textoNormalizado);

    const intencion = detectarIntencion(textoNormalizado);
    const respuestas = await Respuesta.find({}).lean();
    const temas = await Tema.find({}).lean();

    let temaDetectado = null;
    let subtemaDetectado = null;
    let mejorScore = 0;
    let mejorCoincidencia = null;

    const tokens = limpiarTexto(textoNormalizado)
        .replace(/[^\w\s]/gi, '')
        .split(/\s+/)
        .filter(Boolean);

    // 1. Coincidencia fuerte por similitud semántica
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
        temaDetectado = mejorCoincidencia.tema;
        subtemaDetectado = mejorCoincidencia.subtema;
        console.log(`[DEBUG][NLP] Coincidencia fuerte con: ${mejorCoincidencia.pregunta_clave} score: ${mejorScore.toFixed(2)}`);
    }

    const fuzzysort = require('fuzzysort');

    // Paso 1.5: FuzzySearch sobre pregunta_clave y descripcion si no hubo buen score ni subtema
    if (!subtemaDetectado && mejorScore < 0.45) {
        const fuzzyMatches = fuzzysort.go(textoNormalizado, respuestas, {
            keys: ['pregunta_clave', 'descripcion'],
            threshold: -1000, // más bajo = más flexible
            limit: 1
        });

        if (fuzzyMatches.length > 0 && fuzzyMatches[0].score < -10) {
            const mejor = fuzzyMatches[0].obj;
            mejorScore = 0.42; // mejor que un score bajo, pero sin ser 0.5
            mejorCoincidencia = mejor;
            subtemaDetectado = mejor.subtema;
            temaDetectado = mejor.tema;
            console.log(`[DEBUG][NLP] Coincidencia fuzzy con: ${mejor.pregunta_clave} (score fuzzy: ${fuzzyMatches[0].score})`);
        }
    }

    // 2. Subtema por palabras_clave
    if (!subtemaDetectado) {
        for (const r of respuestas) {
            const claves = (r.palabras_clave || []).map(p => limpiarTexto(p));
            const comunes = claves.filter(p => tokens.includes(p));
            if (comunes.length >= 2) {
                subtemaDetectado = r.subtema;
                temaDetectado = r.tema;
                console.log('[DEBUG][NLP] Subtema detectado por palabras_clave:', subtemaDetectado, '→ coincidencias:', comunes);
                break;
            }
        }
    }

    // 3. Subtema por heurística mejorada
    if (!subtemaDetectado) {
        let mejoresCoincidencias = [];
        for (const [subtema, sinonimos] of Object.entries(PalabrasPorSubtema)) {
            if (!Array.isArray(sinonimos)) continue;
            const coincidencias = sinonimos.filter(palabra => tokens.includes(limpiarTexto(palabra))).length;
            if (coincidencias > 0) {
                mejoresCoincidencias.push({ subtema, coincidencias });
            }
        }
        mejoresCoincidencias.sort((a, b) => b.coincidencias - a.coincidencias);

        const mejor = mejoresCoincidencias[0];
        if (mejoresCoincidencias.length > 0) {
            const esUnicoCon1 = mejoresCoincidencias.length === 1 && mejor.coincidencias === 1;
            const esFuerte = mejor.coincidencias >= 2;
            if (esUnicoCon1 || esFuerte) {
                const subtemaExiste = respuestas.some(r =>
                    r.subtema && limpiarTexto(r.subtema) === limpiarTexto(mejor.subtema)
                );
                if (subtemaExiste) {
                    subtemaDetectado = mejor.subtema;
                    console.log('[DEBUG][NLP] Subtema por heurística mejorada:', subtemaDetectado);
                }
            }
        }
    }

    // 4. Tema por PalabrasClave si no hay aún
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

    // 5. Corregir tema según subtema
    if (subtemaDetectado) {
        const r = respuestas.find(r => r.subtema && limpiarTexto(r.subtema) === limpiarTexto(subtemaDetectado));
        if (r && (!temaDetectado || r.tema.toString() !== temaDetectado.toString())) {
            temaDetectado = r.tema;
            console.log('[DEBUG][NLP] Corrigiendo tema según subtema detectado:', subtemaDetectado);
        }
    }

    // 6. Razonamiento y ambigüedad
    const razonamiento = mejorScore >= 0.45
        ? 'Detectado por similitud textual fuerte'
        : subtemaDetectado ? 'Subtema por heurística'
            : temaDetectado ? 'Tema por keyword'
                : 'Sin coincidencia clara';

    const esConsultaAmbigua = !temaDetectado || (mejorScore < 0.3 && !subtemaDetectado);

    if (esConsultaAmbigua) {
        console.warn('[NLP][WARN] Consulta ambigua o sin coincidencia clara:', {
            pregunta,
            textoNormalizado,
            intencion,
            mejorScore,
            temaDetectado,
            subtemaDetectado
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
        esConsultaAmbigua
    };
}

module.exports = { analizarPregunta, limpiarTexto };
