const ProducerSingleton = require("./producerSingleton");

const sendMessage = async (topic, message) => {
  await ProducerSingleton.sendMessage(topic, message);
};

module.exports = {
  sendMessage,
};
