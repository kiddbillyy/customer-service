const express = require('express');
const router = express.Router();
const { sendOtpEmail } = require('../utils/emailService');

router.post('/otp', async (req, res) => {
  const { to, code } = req.body;

  if (!to || !code) {
    return res.status(400).json({ error: 'Faltan campos: to y code son requeridos.' });
  }

  try {
    await sendOtpEmail({ to, otpCode: code });
    res.status(200).json({ message: 'Correo enviado con OTP.' });
  } catch (err) {
    console.error('Error en /otp:', err);
    res.status(500).json({ error: 'Error al enviar correo.' });
  }
});

module.exports = router;
