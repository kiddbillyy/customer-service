// utils/kafkaConsumer.js
const kafka = require('../config/kafka'); 
const { otpTemplate } = require('../templates/otpTemplate');
const { sendEmail } = require('./emailService');

const consumer = kafka.consumer({ groupId: 'email-service-group' });

const runConsumer = async () => {
  await consumer.connect();
  console.log('🟢 Kafka Consumer conectado');

  await consumer.subscribe({ topic: 'otp-recuperacion', fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        const payload = JSON.parse(message.value.toString());
        const { to, code, template } = payload;

        console.log(`📨 Recibido desde Kafka [${topic}]:`, payload);

        if (template === 'recuperacion-otp') {
          const html = otpTemplate(code); 
          await sendEmail({
            to,
            subject: 'Código para recuperación de contraseña',
            html,
            text: `Tu código OTP es: ${code}`
          });
        } else {
          console.warn('⚠️ Plantilla no reconocida:', template);
        }
      } catch (err) {
        console.error('❌ Error procesando mensaje Kafka:', err);
      }
    }
  });
};

module.exports = { runConsumer };
