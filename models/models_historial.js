const mongoose = require('mongoose');

const historialSchema = new mongoose.Schema({
    usuarioId: { type: String, required: true },
    mensaje: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('HistorialConsulta', historialSchema, 'historial');
