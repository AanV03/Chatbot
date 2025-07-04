/**
 * @file server.js
 * @description Servidor principal del chatbot. Conecta con MongoDB, define rutas de API REST y sirve archivos estáticos para la interfaz web.
 */

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const app = express();

const PORT = process.env.PORT || 3000;

console.log('[INFO] Iniciando servidor...');

// =====================
// 🛡️ Middlewares
// =====================
app.use(cors());
app.use(express.json());

console.log('[INFO] Conectando a MongoDB...');

// =====================
//  Conexión a MongoDB
// =====================
mongoose.connect('mongodb+srv://Aaron:pgS81WQt5ejdJSy9@chatbot.eelundm.mongodb.net/Chatbot', {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('[SUCCESS] Conectado a MongoDB');

    // =====================
    //  Importación de modelos y controlador
    // =====================
    const Conversacion = require('./models/models_conversacion');
    const ChatFeedback = require('./models/models_Feedback');
    const Tema = require('./models/models_temas');
    const { procesarConsulta } = require('./controllers/consultaController');

    Tema.find({}).then(temas => {
        console.log('[DEBUG] Temas en server.js al iniciar:', temas.map(t => t.clave));
    });

    // =====================
    //  RUTAS DE API
    // =====================

    /**
     * Procesa una consulta del usuario.
     * @route POST /api/consulta
     * @access Public
     */
    app.post('/api/consulta', procesarConsulta);

    /**
     * Crea una nueva conversación.
     * @route POST /api/conversacion
     * @access Public
     */
    app.post('/api/conversacion', async (req, res) => {
        const { sessionId, usuarioId = 'anonimo', nombre, mensajes } = req.body;
        try {
            if (!sessionId || !mensajes?.length) {
                return res.status(400).send("Datos insuficientes");
            }

            await Conversacion.create({ sessionId, usuarioId, nombre, mensajes });
            res.sendStatus(200);
        } catch (err) {
            console.error('[ERROR][/api/conversacion]', err);
            res.status(500).send("Error al crear conversación");
        }
    });

    /**
     * Agrega un mensaje a una conversación existente.
     * @route POST /api/conversacion/mensaje
     * @access Public
     */
    app.post('/api/conversacion/mensaje', async (req, res) => {
        const { sessionId, mensaje } = req.body;
        try {
            if (!sessionId || !mensaje) {
                return res.status(400).send("Faltan datos");
            }

            await Conversacion.updateOne(
                { sessionId },
                { $push: { mensajes: mensaje } }
            );

            res.sendStatus(200);
        } catch (err) {
            console.error('[ERROR][/api/conversacion/mensaje]', err);
            res.status(500).send("Error al agregar mensaje");
        }
    });

    /**
     * Obtiene un listado resumido de las conversaciones de un usuario.
     * @route GET /api/conversaciones?usuarioId=...
     * @access Public
     */
    app.get('/api/conversaciones', async (req, res) => {
        const usuarioId = req.query.usuarioId;
        if (!usuarioId) return res.status(400).send("Falta usuarioId");

        try {
            const conversaciones = await Conversacion.find(
                { usuarioId },
                'sessionId nombre fechaCreacion'
            ).sort({ fechaCreacion: -1 });

            res.json(conversaciones);
        } catch (err) {
            console.error('[ERROR][listar conversaciones]', err);
            res.status(500).send("Error al obtener conversaciones");
        }
    });

    /**
     * Obtiene los mensajes de una conversación específica.
     * @route GET /api/conversacion/:id
     * @access Public
     */
    app.get('/api/conversacion/:id', async (req, res) => {
        try {
            const conversacion = await Conversacion.findOne({ sessionId: req.params.id });
            if (!conversacion) return res.status(404).send("No encontrada");
            res.json(conversacion);
        } catch (err) {
            console.error('[ERROR][obtener conversacion]', err);
            res.status(500).send("Error al obtener conversación");
        }
    });

    /**
     * Elimina una conversación por su ID.
     * @route DELETE /api/conversacion/:id
     * @access Public
     */
    app.delete('/api/conversacion/:id', async (req, res) => {
        try {
            await Conversacion.deleteOne({ sessionId: req.params.id });
            res.sendStatus(200);
        } catch (err) {
            console.error('[ERROR][borrar conversacion]', err);
            res.status(500).send("Error al eliminar conversación");
        }
    });

    /**
     * Cambia el nombre de una conversación.
     * @route PATCH /api/conversacion/:id
     * @access Public
     */
    app.patch('/api/conversacion/:id', async (req, res) => {
        try {
            const { nuevoNombre } = req.body;
            if (!nuevoNombre || typeof nuevoNombre !== 'string') {
                return res.status(400).send("Nombre inválido");
            }

            await Conversacion.updateOne(
                { sessionId: req.params.id },
                { $set: { nombre: nuevoNombre } }
            );

            res.sendStatus(200);
        } catch (err) {
            console.error('[ERROR][editar nombre]', err);
            res.status(500).send("Error al editar nombre");
        }
    });

    /**
     * Guarda un feedback cuando la respuesta del bot no fue útil.
     * @route POST /api/feedback
     * @access Public
     */
    app.post('/api/feedback', async (req, res) => {
        const {
            sessionId,
            mensajes,
            fueUtil,
            intencionesDetectadas = [],
            temasDetectados = [],
            subtemasDetectados = [],
            fin = new Date()
        } = req.body;

        if (!sessionId || !Array.isArray(mensajes) || mensajes.length < 2) {
            return res.status(400).json({ error: 'Faltan datos para el feedback' });
        }

        try {
            await ChatFeedback.create({
                sessionId,
                mensajes,
                fueUtil,
                intencionesDetectadas,
                temasDetectados,
                subtemasDetectados,
                fin
            });

            res.sendStatus(200);
        } catch (err) {
            console.error('[ERROR][feedback]', err);
            res.status(500).json({ error: 'Error al guardar feedback' });
        }
    });

    // =====================
    // Archivos estáticos y página principal
    // =====================

    /**
     * Sirve archivos estáticos desde la carpeta /public
     */
    app.use(express.static(path.join(__dirname, 'public')));

    /**
     * Devuelve el HTML principal del chatbot.
     * @route GET /main
     */
    app.get('/main', (req, res) => {
        console.log('[ROUTE] /main - Enviando Chatbot.html');
        res.sendFile(path.join(__dirname, 'public', 'Chatbot.html'));
    });

    /**
     * Inicia el servidor en el puerto especificado.
     */
    app.listen(PORT, () => {
        console.log(`[SUCCESS] Servidor escuchando en http://localhost:${PORT}`);
    });

}).catch((err) => {
    console.error('[ERROR] Error al conectar a MongoDB:', err);
});
