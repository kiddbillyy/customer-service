const nodemailer = require("nodemailer");
const { otpTemplate } = require("../templates/otpTemplate");

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT),
  secure: process.env.EMAIL_SECURE === "true",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Genérico
const sendEmail = async ({ to, subject, html, text = "", fromName = "Equipo Mimbral" }) => {
  try {
    await transporter.sendMail({
      from: `"${fromName}" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
      text,
    });
    console.log(`📧 Correo enviado a: ${to}`);
  } catch (err) {
    console.error(" Error al enviar correo: ", err);
    throw err;
  }
};

// OTP específico
const sendOtpEmail = async ({ to, otpCode }) => {
  const html = otpTemplate(otpCode);
  return sendEmail({
    to,
    subject: "Tu código de verificación",
    html,
  });
};

module.exports = { sendEmail, sendOtpEmail };
