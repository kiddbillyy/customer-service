const ProducerSingleton = require('./ProducerSingleton');

const sendMessage = async (topic, message) => {
  await ProducerSingleton.sendMessage(topic, message);
};

module.exports = { sendMessage };
