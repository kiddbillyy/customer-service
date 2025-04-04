const express = require('express');
const {
    createWave,
    createRound,
    updateWaveStatus,
    updateRoundStatus,
    getWaves,         
    getWaveById,      
    getRoundsByWave,  
    getRoundById,
    createRoundAndAssign,
    getRounds     
} = require('../controllers/waveController');

const router = express.Router();

// Crear ola
router.post('/waves', createWave);

// Crear ronda (usa :waveID en la ruta)
router.post('/waves/:waveID/rounds', createRound);

// Actualizar estado de ola
router.patch('/waves/:waveID/status', updateWaveStatus);

// Actualizar estado de ronda
router.patch('/waves/:waveID/rounds/:roundID/status', updateRoundStatus);


// Nuevos endpoints GET
router.get('/waves', getWaves);
router.get('/rounds', getRounds)
router.get('/waves/:waveID', getWaveById);
router.get('/waves/:waveID/rounds', getRoundsByWave);
router.get('/waves/:waveID/rounds/:roundID', getRoundById);
router.post('/waves/:waveID/rounds/unified', createRoundAndAssign);


module.exports = router;
