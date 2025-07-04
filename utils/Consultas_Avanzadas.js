/**
 * @file Consultas_Avanzadas.js
 * @description Búsqueda avanzada con jerarquía lógica: primero exacto por tema/subtema/intención, luego relajado, luego textual, luego simple.
 */

const Respuesta = require('../models/models_respuestas');
const { analizarPregunta } = require('../NLP');
const { buscarConsultaSimple } = require('./Consultas_Simples');

function limpiarTexto(str) {
    return str?.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') || '';
}

function calcularScore(a, b) {
    const setA = new Set(a.split(/\s+/));
    const setB = new Set(b.split(/\s+/));
    const inter = [...setA].filter(p => setB.has(p));
    return inter.length / Math.max(setA.size, 1);
}

async function buscarConsultaAvanzada(textoUsuario) {
    const analisis = await analizarPregunta(textoUsuario);
    const { textoNormalizado, tema, subtema, intencion } = analisis;

    console.log('[DEBUG] Analisis NLP:', analisis);

    let filtros = [];

    if (tema && subtema && intencion) {
        filtros.push({ tema, subtema: new RegExp(`^${subtema}$`, 'i'), intencion });
    }
    if (tema && subtema) {
        filtros.push({ tema, subtema: new RegExp(`^${subtema}$`, 'i') });
    }
    if (tema && intencion) {
        filtros.push({ tema, intencion });
    }
    if (tema) {
        filtros.push({ tema });
    }

    let respuestas = [];
    for (const filtro of filtros) {
        respuestas = await Respuesta.find(filtro).lean();
        if (respuestas.length) {
            console.log('[DEBUG] Filtro aplicado:', filtro);
            break;
        }
    }

    // Si aún no hay, hace búsqueda textual directa (similar a MongoShell manual)
    if (!respuestas.length) {
        console.log('[DEBUG] Búsqueda por coincidencia textual directa');
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

    // Si aún no hay nada, fallback a búsqueda simple
    if (!respuestas.length) {
        const simple = await buscarConsultaSimple(textoUsuario);
        if (simple) {
            return [{
                respuesta: simple,
                fuente: 'consulta_simple'
            }];
        }
        return [{
            respuesta: 'No encontré una respuesta clara a tu consulta. 😔',
            origen: 'fallback'
        }];
    }

    // Calcular score por similitud semántica
    const textoNorm = textoNormalizado;

    const scored = respuestas.map(r => {
        const score =
            calcularScore(textoNorm, limpiarTexto(r.pregunta_clave)) * 0.5 +
            calcularScore(textoNorm, limpiarTexto(r.descripcion)) * 0.2 +
            calcularScore(textoNorm, limpiarTexto(r.respuesta)) * 0.2 +
            calcularScore(textoNorm, limpiarTexto(r.ejemplo)) * 0.1;
        return { ...r, score };
    });

    scored.sort((a, b) => b.score - a.score);

    console.log('[DEBUG] Respuestas encontradas:', scored.length);
    console.log('[DEBUG] Top score:', scored[0]?.score?.toFixed(3));

    if (scored.length > 0) {
        console.log('[DEBUG][FINAL] Respuesta enviada al usuario:');
        console.log('→ Subtema:', scored[0].subtema);
        console.log('→ Intención:', scored[0].intencion);
        console.log('→ Respuesta:', scored[0].respuesta);
    }

    return scored.slice(0, 3); // devuelve top 3
}

module.exports = { buscarConsultaAvanzada };
