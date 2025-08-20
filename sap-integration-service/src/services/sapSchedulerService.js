// src/services/sapSchedulerService.js
const axios = require('axios');
const cron = require('node-cron');
const { sendMessage } = require('../producer');
const { endpoints } = require('../config');

// Obtener el createts máximo de las órdenes
async function getMaxCreatets() {
 /* try {
    //const response = await axios.get(`${endpoints.ordersService}/api/orders/max/createts`);
    const response = await axios.get(`localhost:5000/api/orders/max/createts`);
    return response.data.maxCreatets || '000000';
  } catch (error) {
    console.error('❌ Error al obtener maxCreatets:', error);
    throw error;
  }*/

    console.log("maxts")
}

// Obtener las órdenes desde SAP
async function fetchOrdersFromSap(createts) {
  /*try {
    const { data } = await axios.get(`${endpoints.sap}?createts=000000`);
    return data;
  } catch (error) {
    console.error('❌ Error al llamar al endpoint SAP:', error);
    throw error;
  }*/
 console.log(createts)
}

async function processNewOrders() {
  /*try {
    const maxCreatets = await getMaxCreatets();
    console.log(`🔍 maxCreatets obtenido de orders-service: ${maxCreatets}`);

    const orders = await fetchOrdersFromSap(maxCreatets);
    console.log(`📥 Se obtuvieron ${orders.length} órdenes nuevas desde SAP`);

    // Enviar cada orden a Kafka de manera secuencial
    for (const order of orders) {
      console.log(`📦 Procesando orden orderID=${order.orderID}, createts=${order.createts}`);
      await sendMessage('sap.order.imported', order);
    }

    console.log('✅ Proceso completado. Órdenes enviadas a Kafka.');
  } catch (error) {
    console.error('❌ Error en processNewOrders:', error);
  }
    */
   console.log("process")
}

// Función para crear una orden a partir del folionum
async function createNewOrder(folionum) {
 /* try {
    let { data: order } = await axios.get(`${endpoints.retail}${folionum}`);

    // Si la respuesta es un array, tomar el primer elemento para mantener el mismo formato
    if (Array.isArray(order)) {
      order = order[0];
    }

    console.log(`📥 Se obtuvo la orden con folionum: ${folionum}`);
    console.log(`📦 Procesando orden orderID=${order.orderID}`);

    await sendMessage('sap.order.imported', order);
    console.log('✅ Proceso completado. Orden enviada a Kafka.');
  } catch (error) {
    console.error('❌ Error en createNewOrder:', error);
    throw error;
  }*/
 console.log("test")
}

// Cron job que se ejecuta cada 10 minutos
function startScheduler() {
  // Expresión cron: "*/10 * * * *" => cada 10 minutos
  cron.schedule('*/1 * * * *', async () => {
    console.log('⏰ [CRON] Ejecutando job para traer órdenes desde SAP...');
    await processNewOrders();
  });
  console.log('✅ Cron job iniciado (cada 10 minutos)');
}

module.exports = {
  processNewOrders,
  startScheduler,
  createNewOrder
};
