const { buscarConsultaAvanzada } = require('../utils/Consultas_Avanzadas');
const { buscarConsultaSimple } = require('../utils/Consultas_Simples');
const { registrarFeedback } = require('../utils/Feedback');
const { analizarPregunta } = require('../NLP');

/**
 * Determina si una consulta es avanzada según estructura.
 */
function esConsultaAvanzada(pregunta) {
    const texto = pregunta.trim().toLowerCase();
    return (
        /[?¿]\s*$/.test(pregunta) ||
        /^(qu[eé]|cu[aá]ndo|d[oó]nde|por qu[eé]|c[oó]mo|qui[eé]n|para qu[eé]|cu[aá]les?)\b/i.test(texto)
    );
}

/**
 * Procesa una pregunta del usuario y responde usando lógica avanzada o simple.
 */
async function procesarConsulta(req, res) {
    const { pregunta, sessionId } = req.body;

    if (!pregunta || typeof pregunta !== 'string') {
        return res.status(400).json({ error: 'Consulta inválida.' });
    }

    try {
        let respuestas = [];

        if (esConsultaAvanzada(pregunta)) {
            respuestas = await buscarConsultaAvanzada(pregunta);
            if (respuestas.length > 0) {
                return res.json({ respuestas, origen: 'avanzada' });
            }
        }

        const simple = await buscarConsultaSimple(pregunta);
        if (simple) {
            return res.json({
                respuestas: [{ respuesta: simple }],
                origen: 'simple'
            });
        }

        const analisis = await analizarPregunta(pregunta);
        await registrarFeedback({
            sessionId: sessionId || 'desconocido',
            pregunta,
            analisis
        });

        return res.json({
            respuestas: [{ respuesta: 'No encontré una respuesta clara a tu consulta. 😔' }],
            origen: 'fallback'
        });

    } catch (error) {
        console.error('[ERROR] procesarConsulta:', error);
        return res.status(500).json({ error: 'Error al procesar la consulta.' });
    }
}

module.exports = { procesarConsulta };
