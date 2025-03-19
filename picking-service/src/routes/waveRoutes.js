const express = require('express');
const {
    createWave,
    createRound,
    updateWaveStatus,
    updateRoundStatus,
    assignProductsAndPickers,
    getWaves,         
    getWaveById,      
    getRoundsByWave,  
    getRoundById,
    createRoundAndAssign     
} = require('../controllers/waveController');

const router = express.Router();

// Crear ola
router.post('/waves', createWave);

// Crear ronda (usa :waveID en la ruta)
router.post('/waves/:waveID/rounds', createRound);

// Asignar productos + pickers en la misma acción
router.post('/waves/:waveID/rounds/:roundID/assign', assignProductsAndPickers);

// Actualizar estado de ola
router.patch('/waves/:waveID/status', updateWaveStatus);

// Actualizar estado de ronda
router.patch('/waves/:waveID/rounds/:roundID/status', updateRoundStatus);


// Nuevos endpoints GET
router.get('/waves', getWaves);
router.get('/waves/:waveID', getWaveById);
router.get('/waves/:waveID/rounds', getRoundsByWave);
router.get('/waves/:waveID/rounds/:roundID', getRoundById);


// **Nuevo endpoint unificado** 
// Crea la ronda y asigna productos/pickers en la misma acción:
router.post('/waves/:waveID/rounds/unified', createRoundAndAssign);


module.exports = router;
