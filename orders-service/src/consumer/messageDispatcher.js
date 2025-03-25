const pool = require('../config/db');
const OrdersService = require('../services/ordersService');
const { sendMessage } = require('../producer');


module.exports = {
  /**
   * Procesa el mensaje de 'sap.order.imported'
   */
  'sap.order.imported': async (msg) => {
    try {
      // 1. Verificar si la orden ya existe en la tabla Orders (por folionum)
      const [existingOrder] = await pool.query(
        'SELECT 1 FROM Orders WHERE folionum = ? LIMIT 1',
        [msg.folionum]
      );
      const orderAlreadyExists = existingOrder.length > 0;

      // Si no se envía orderStatusID (o es null), usamos 1
      const orderStatusID = msg.orderStatusID || 1;

      // 2. Insertar o actualizar la orden
      await pool.query(
        `
        INSERT INTO Orders (
          docentry, docnum, folionum, cardcode, cardname, phone1, e_mail,
          u_ref1, slpname, docdate, itemsamount, doctotalsy, orderStatusID, paymentMethodID, 
          deliveryTypeID, salesChannelID, recipient, deliveryDate, createdate, createts
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          docentry       = VALUES(docentry),
          docnum         = VALUES(docnum),
          cardcode       = VALUES(cardcode),
          cardname       = VALUES(cardname),
          phone1         = VALUES(phone1),
          e_mail         = VALUES(e_mail),
          u_ref1         = VALUES(u_ref1),
          slpname         = VALUES(slpname),
          docdate        = VALUES(docdate),
          itemsamount    = VALUES(itemsamount),
          doctotalsy     = VALUES(doctotalsy),
          paymentMethodID= VALUES(paymentMethodID),
          deliveryTypeID = VALUES(deliveryTypeID),
          salesChannelID = VALUES(salesChannelID),
          recipient      = VALUES(recipient),
          deliveryDate   = VALUES(deliveryDate),
          createdate     = VALUES(createdate),
          createts       = VALUES(createts)
        `,
        [
          msg.docentry, msg.docnum, msg.folionum, msg.cardcode, msg.cardname, msg.phone1, msg.e_mail,
          msg.u_ref1, msg.slpname, msg.docdate, msg.itemsamount, msg.doctotalsy, orderStatusID, msg.paymentMethodID,
          msg.deliveryTypeID, msg.salesChannelID, msg.recipient, msg.deliveryDate, 
          msg.createdate, msg.createts
        ]
      );

      // 3. Recuperar la orden insertada/actualizada
      const [orderRow] = await pool.query(
        'SELECT * FROM Orders WHERE folionum = ?',
        [msg.folionum]
      );
      if (orderRow.length === 0) {
        console.error(`❌ Error: No se encontró la orden después de insertarla.`);
        return;
      }
      const order = orderRow[0];
      console.log(`✅ Orden ${msg.orderID} creada/actualizada en Orders Service`);

      // 4. Solo si la orden es nueva (no existía previamente) se envía el mensaje new.order.created
      if (!orderAlreadyExists) {
        await sendMessage('new.order.created', { ...order, products: msg.products });
        console.log(`📤 Evento new.order.created enviado para orderID=${order.orderID}`);
      } else {
        console.log(`⚠️ Orden ${msg.orderID} ya existía. No se envía new.order.created.`);
      }
    } catch (error) {
      console.error('❌ Error al procesar "sap.order.imported":', error);
    }
  },

  /**
   * Procesa el mensaje de 'order.status.updated'
   */
  'order.status.updated': async (msg) => {
    console.log(`🔄 Actualizando estado de la orden ${msg.orderID} a estado ${msg.newStatus}...`);
    await OrdersService.updateOrderStatus(msg.orderID, msg.newStatus);

    // Ejemplo: puedes abstraer estos 'switch' en un "State" Pattern
    switch (msg.newStatus) {
      case 2:
        console.log(`📦 Orden ${msg.orderID} ahora está en "Asignando Pickers".`);
        break;
      case 3:
        console.log(`📦 Orden ${msg.orderID} ahora está "En Picking".`);
        break;
      case 4:
        console.log(`⚠️ Orden ${msg.orderID} está "Picking Completado Parcialmente" (Faltan productos).`);
        break;
      case 5:
        console.log(`✅ Orden ${msg.orderID} ahora está "Picking Completado".`);
        break;
      default:
        console.log(`ℹ️ Estado de la orden ${msg.orderID} actualizado a ${msg.newStatus}.`);
        break;
    }
  },
};