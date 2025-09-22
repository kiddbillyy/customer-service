const OrdersRepository = require("../models/ordersRepository.js");
const { sendMessage } = require("../producer");
const axios = require("axios");
const {
loginToSap,          // ← NUEVO
logoutSap,           // ← opcional si quieres usarlo directo
buildSapOrderPayload,
sendToSap,
buildReserveInvoicePayload,
createInvoiceInSap
} = require("./sapService.js");
const { setOrderStartHandling, sendInvoiceToVtex  } = require("../services/vtexService.js")
// Ajusta la URL según tu configuración real (IP, puertos, etc.).
const PICKING_SERVICE_URL = "http://localhost:5001/api/picking";
const dayjs  = require("dayjs");

// --- helpers -------------------------------------------------
function rutToFederal(body) {
  // body: solo dígitos (ej. "77268446")
  let sum = 0, mul = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body[i], 10) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const rest = 11 - (sum % 11);
  const dv   = rest === 11 ? "0" : rest === 10 ? "K" : String(rest);
  return { federal: `${body}-${dv}`, dv };
}

function getProfileFields(o) {
  const p = o.clientProfileData;

  const isCorp = !!(p?.corporateName && p.corporateName.trim());

  return isCorp
    ? {                      // ← FACTURA (empresa)
        rutRaw   : p.corporateDocument,          //  772684460
        cardName : p.corporateName.trim(),       //  "Comercialización…"
        phone    : p.corporatePhone || p.phone,  //  usa corporatePhone si existe
        isCorp
      }
    : {                      // ← BOLETA (consumidor)
        rutRaw   : p.document,                   //  18424876K
        cardName : `${p.firstName} ${p.lastName}`.trim(),
        phone    : p.phone,
        isCorp
      };
}

function calcDiscountPercent(listPrice, sellingPrice, digits = 2) {
  if (!listPrice || listPrice <= sellingPrice) return 0;

  const raw = ((listPrice - sellingPrice) / listPrice) * 100;  // 34.317…
  const factor = 10 ** digits;                                 // 100
  return Math.round(raw * factor) / factor;                    // → 34.32
}

function isRutValid(rawRut) {
  if (!rawRut) return false;
  const clean = String(rawRut).replace(/\./g, "").toUpperCase();

  // separar cuerpo y dígito verificador
  const [bodyPart, dvPart] = clean.includes("-")
    ? clean.split("-")
    : [clean.slice(0, -1), clean.slice(-1)];

  const body = bodyPart.replace(/\D/g, "");
  let dv = dvPart;
  if (!body || !dv) return false;

  // calcular dígito esperado con algoritmo módulo-11
  let sum = 0, mul = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body[i], 10) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const rest = 11 - (sum % 11);
  const dvExp = rest === 11 ? "0" : rest === 10 ? "K" : String(rest);

  return dv === dvExp;
}

function toCardCode(rawRut) {
  const raw = String(rawRut).trim().replace(/\./g, "");

  // 1) Con guion  →  nos quedamos con todo lo anterior al guion
  if (raw.includes("-")) {
    return raw.split("-")[0].replace(/\D/g, "") + "C";
  }

  // 2) Termina en K/k  →  quitamos la K
  if (/[kK]$/.test(raw)) {
    return raw.slice(0, -1).replace(/\D/g, "") + "C";
  }

  // 3) Solo dígitos, sin guion ni K
  const digits = raw.replace(/\D/g, "");

  /* ✔️  Nuevo criterio:
         - 9 dígitos  → quitamos el último (DV)
         - 8 dígitos  → quitamos el último (DV)
         - 7 o menos  → lo dejamos tal cual (no viene DV)            */
  const body = digits.length >= 8 ? digits.slice(0, -1) : digits;

  return body + "C";
}

// `sellingPrice` ya viene **con** IVA y con los descuentos aplicados.
// Sólo lo convertimos a CLP:
function mapVtexItemToPicking(item) {
  return {
    itemcode      : item.refId,
    dscription    : item.name,
    quantity      : item.quantity,
    priceAfterVAT : item.sellingPrice / 100,               // CLP finales
    codebars      : item.ean,
    whscode       : item.logisticsInfo?.warehouseId ?? null,
    U_Subcategoria: item.additionalInfo?.categories?.at(-1)?.name ?? null,
  };
}

const fetchVtexOrder = async (orderId) => {
  const url = `https://mimbralb2c.vtexcommercestable.com.br/api/checkout/pub/orders/${orderId}`;
  const { data } = await axios.get(url, {
    headers: {
      'X-VTEX-API-AppKey'  : process.env.VTEX_APP_KEY,
      'X-VTEX-API-AppToken': process.env.VTEX_APP_TOKEN,
      Accept: 'application/json',
    },
    timeout: 10_000,
  });
  return data;
};

function mapVtexToDB(o) {
  const itemsTotalValue    = o.totals?.find(t => t.id === "Items")?.value    || 0;
  const shippingTotalValue = o.totals?.find(t => t.id === "Shipping")?.value || 0;

  const { rutRaw, cardName, phone, isCorp } = getProfileFields(o);

  return {
    cardcode         : toCardCode(rutRaw),
    cardname         : cardName,
    phone1           : phone,
    e_mail           : o.clientProfileData.email,
    u_ref1           : o.orderId,
    itemsamount      : o.items.length,
    doctotalsy       : (itemsTotalValue + shippingTotalValue) / 100,
    orderStatusID    : 1,
    integrationStatus: 'ready-for-handling',
    isCorporate      : isCorp ? 1 : 0                // opcional, para tu BD
  };
}



const OrdersService = {
  getAllOrders: async () => {
    return await OrdersRepository.getAllOrders();
  },
  getOrdersAudit: async () => {
    return await OrdersRepository.getOrdersAudit();
  },
  getOrderById: async (orderID) => {
    return await OrdersRepository.getOrderById(orderID);
  },
  getHistory: async (orderID) => {
    return await OrdersRepository.getHistory(orderID);
  },
  getOrdersByPickerRUT: async (pickerRUT) => {
    // 1. Obtener los productos asignados al picker desde picking-service
    const { data: assignedProducts } = await axios.get(
      `${PICKING_SERVICE_URL}/assigned/${pickerRUT}`
    );

    if (!assignedProducts || assignedProducts.length === 0) {
      return []; // No hay productos asignados
    }

    // 2. Agrupar productos asignados por orderID
    const orderGroups = {};
    assignedProducts.forEach((prod) => {
      const id = prod.orderID;
      if (!orderGroups[id]) {
        orderGroups[id] = [];
      }
      orderGroups[id].push(prod);
    });

    // 3. Extraer orderID únicos
    const uniqueOrderIDs = Object.keys(orderGroups).map((id) => parseInt(id, 10));

    // 4. Obtener detalles de las órdenes desde la base de datos local
    const orders = await OrdersRepository.getOrdersByIDs(uniqueOrderIDs);

    // 5. Obtener la lista de picking_status desde picking-service
    const { data: statuses } = await axios.get(`${PICKING_SERVICE_URL}/statuses`);
    const statusMap = {};
    statuses.forEach((s) => {
      statusMap[s.pickingStatusID] = s.statusName;
    });

    // 6. Enriquecer cada pedido con el estado real basado en TODOS sus productos
    const enrichedOrders = orders.map((order) => {
      const prods = orderGroups[order.orderID] || [];
      const assignedCount = prods.length;

      // Obtener todos los estados de los productos asignados en este pedido
      const productStatuses = prods.map((p) => p.pickingStatusID);

      // Determinar el estado real del pedido
      let pickingStatusID;
      if (productStatuses.includes(1)) {
        pickingStatusID = 1; // Hay productos pendientes
      } else if (productStatuses.includes(2)) {
        pickingStatusID = 2; // No hay pendientes, pero hay en picking
      } else if (productStatuses.includes(3)) {
        pickingStatusID = 3; // No hay pendientes, pero hay en picking
      } else {
        pickingStatusID = 4; // Todos los productos están completados
      }

      return {
        ...order,
        assignedCount,
        pickingStatusID,
        pickingStatusName: statusMap[pickingStatusID] || "Desconocido",
      };
    });

    const filteredOrders = enrichedOrders.filter(order => order.pickingStatusID !== 4);

    return filteredOrders;
  },

  updateOrderStatus: async (orderID, orderStatusID) => {
    const currentOrder = await OrdersRepository.getOrderById(orderID);
    if (!currentOrder) {
      console.warn(`⚠️ Orden ${orderID} no encontrada.`);
      return false;
    }

    // Si ya está en ese estado, no reenviamos evento.
    if (currentOrder.orderStatusID === orderStatusID) {
      console.log(
        `ℹ️ Estado de la orden ${orderID} ya es ${orderStatusID}, no se enviará otro mensaje.`
      );
      return false;
    }

    const updated = await OrdersRepository.updateOrderStatus(
      orderID,
      orderStatusID
    );

    if (updated) {
      // Notificar vía Kafka
      await sendMessage("order.status.updated", {
        orderID,
        newStatus: orderStatusID,
      });
      console.log(
        `📤 Estado de la orden ${orderID} actualizado a ${orderStatusID}`
      );
    }
    return updated;
  },

  getMaxCreatets: async () => {
    const maxCreatets = await OrdersRepository.getMaxCreatets();
    console.log(`✅ maxCreatets obtenido en Service: ${maxCreatets}`);
    return maxCreatets;
  },

  getLastQueryDate: async () => {
    const lastQueryDate = await OrdersRepository.getLastQueryDate();
    console.log(`✅ lastQueryDate obtenido en Service: ${lastQueryDate}`);
    return lastQueryDate;
  },


  ingestVtexOrder: async (orderId) => {
    let cookie;
    try{
    cookie = await loginToSap();
    // 1) Traemos la orden de VTEX
    const raw      = await fetchVtexOrder(orderId);
    const vtex     = mapVtexToDB(raw);

    // 2) Mapeamos los items
    const baseProducts = raw.items.map(mapVtexItemToPicking);

    // 3) Si hay shipping, añadimos SKU Flete al final
    const shippingValue = raw.totals?.find(t => t.id === "Shipping")?.value || 0;
    if (shippingValue > 0) {
      baseProducts.push({
        itemcode       : "701001008",
        dscription     : "Flete",
        quantity       : 1,
        priceAfterVAT  : shippingValue / 100,
        codebars       : null,
        whscode        : null,
        U_Subcategoria : "Flete"
      });
    }

    // 4) Insert / update en nuestra tabla
    const { orderRow, isNew } = await OrdersRepository.ingestVtexOrder(vtex);

    // VALIDAR RUT
      const { rutRaw, isCorp } = getProfileFields(raw);
      const rutOk = isRutValid(rutRaw);

      
      if (!rutOk) {
        const msg = `RUT inválido (${isCorp ? "corporateDocument" : "document"})`;
        await OrdersRepository.saveIntegrationError(orderRow.orderID, msg);
        console.error(`❌ ${msg}: ${rutRaw}`);
        return { orderRow, isNew: false };
      }
    // 5) Si es nueva, integramos en SAP y luego emitimos mensaje
    if (isNew) {
      try {
        // 5.1) Crear OV en SAP
        const { docEntry, docNum, lineInfo } = await sendToSap(raw, orderRow, baseProducts,cookie);
        /* 5.2-bis) Notificar a VTEX → start-handling */
        try {
          await setOrderStartHandling(orderId);   // ← el mismo orderId VTEX que recibiste al inicio
        } catch (err) {
          console.log(`ERROR 0: ` +  err.message)
          const msg = JSON.stringify(err.response?.data || err.message);
          await OrdersRepository.saveIntegrationError(orderRow.orderID, msg);
          console.error("❌ Error cambiando estado VTEX:", msg);
        }


        // 5.2) Guardar DocEntry/DocNum en BD
        await OrdersRepository.saveSapIds(orderRow.orderID, docEntry, docNum);
        console.log(`✅ Orden interna ${orderRow.orderID} linkeada a SAP (DocEntry=${docEntry}, DocNum=${docNum})`);

        // 5.3) Cruzamos línea → lineNum
        const lookup = Object.fromEntries(lineInfo.map(l => [l.itemcode, l.lineNum]));
        const productsWithLine = baseProducts.map(p => ({
          ...p,
          lineNum: lookup[p.itemcode] ?? null
        }));

        // 5.4) Emitir evento ya con lineNum
        await sendMessage("new.order.created", {
          ...orderRow,
          docentry: docEntry,
          docnum  : docNum,
          products: productsWithLine
        });
        console.log(`📤 new.order.created → picking (orderID=${orderRow.orderID}, items=${productsWithLine.length})`);

        /* 5.5) Crear factura de reserva e IncomingPayment */
        try {
          // A) payload
            const invoicePayload = buildReserveInvoicePayload({
            orderRow,
            docEntry,              
            products: productsWithLine
          });
      
          // B) crear factura + pago
          //const { docEntry: invDocEntry, payDocEntry, invoiceAmount, vtexItems } = await createInvoiceInSap(invoicePayload,cookie);


          const { docEntry: invDocEntry,docNum:   invDocNum,folioNum,  payDocEntry,invoiceAmount,  vtexItems}= await createInvoiceInSap(invoicePayload, cookie);
          console.log(
            `📄 Reserva OK (DocEntry=${invDocEntry} – `+
            `💰 Pago OK (DocEntry=${payDocEntry}`
          );


          /* 5.6) Notificar “invoice” a VTEX */
          try {
            const issuanceDate = dayjs().toISOString(); // con hora
            const invoiceValue = String(Math.round(invoiceAmount * 100)); // a centavos
        
            await sendInvoiceToVtex({
              orderId,
              invoiceNumber: folioNum,   
              issuanceDate,
              invoiceValue,
              items: vtexItems              // ya trae id, price, quantity
            });
          } catch (err) {
            const msg = JSON.stringify(err.response?.data || err.message);
            console.log(`ERROR 1: ` +  err.message)
            await OrdersRepository.saveIntegrationError(orderRow.orderID, msg);
            console.error("❌ Error invoice VTEX:", msg);
          }
      

          // C) guardar IDs en BD de invoice
          // await OrdersRepository.saveSapInvoiceIds(orderRow.orderID, invDocEntry, invDocNum, payDocEntry, payDocNum);
       
        } catch (err) {
          const msg = JSON.stringify(err.response?.data || err.message);
          console.log(`ERROR 2: ` +  err.message)
          await OrdersRepository.saveIntegrationError(orderRow.orderID, msg);
          console.error("❌ Error factura/pago:", msg);
        }



      } catch (err) {
        /* ======== A) Error creando OV o emitiendo evento ========= */
        const msg = JSON.stringify(err.response?.data || err.message);
        console.log(`ERROR 3: ` + err.message)
        await OrdersRepository.saveIntegrationError(orderRow.orderID, msg);
        console.error("❌ Error integrando OV:", msg);
      }
    }else{
      console.log('venta no integrada pq ya existia')
    }

    return { orderRow, isNew };
    } 
    finally {
     if (cookie) await logoutSap(cookie);           // ← cierre único
    }
  },




  //REPROCESAR
   /*reprocessOrder: async (orderID) => {
    // 1. Carga la orden y cliente desde tu BD
    const orderRow = await OrdersRepository.getOrderById(orderID);
    if (!orderRow) throw new Error(`Orden ${orderID} no existe en la BD`);
    if (orderRow.docentry) {
      throw new Error(
        `Orden ${orderID} ya integrada (DocEntry=${orderRow.docentry})`
      );
    }

    // 2. Consulta VTEX SOLO para obtener los ítems y precios actuales
    const raw = await fetchVtexOrder(orderRow.u_ref1);
    
    let baseProducts = raw.items.map(mapVtexItemToPicking);
    const shippingVal = raw.totals?.find(t => t.id === "Shipping")?.value || 0;
    if (shippingVal > 0) {
      baseProducts.push({
        itemcode       : "701001008",
        dscription     : "Flete",
        quantity       : 1,
        priceAfterVAT  : shippingVal / 100,
        codebars       : null,
        whscode        : null,
        U_Subcategoria : "Flete"
      });
    }

    // 3. Integra en SAP (igual que en ingestVtexOrder)
    try {
      const { docEntry, docNum, lineInfo } = await sendToSap(
        raw,
        orderRow,
        baseProducts
      );

      await OrdersRepository.saveSapIds(orderID, docEntry, docNum);

      const lookup = Object.fromEntries(
        lineInfo.map(l => [l.itemcode, l.lineNum])
      );
      const productsWithLine = baseProducts.map(p => ({
        ...p,
        lineNum: lookup[p.itemcode] ?? null
      }));

      await sendMessage("new.order.created", {
        ...orderRow,
        docentry: docEntry,
        docnum  : docNum,
        products: productsWithLine
      });

      // Reserva, pago e invoice en VTEX (reutiliza tu mismo flujo)
      const invoicePayload = buildReserveInvoicePayload({
        orderRow,
        docEntry,
        products: productsWithLine
      });
      const {
        docEntry: invDocEntry,
        payDocEntry,
        invoiceAmount,
        vtexItems
      } = await createInvoiceInSap(invoicePayload);

      await sendInvoiceToVtex({
        orderId: orderRow.u_ref1,
        invoiceNumber: invDocEntry,
        issuanceDate: dayjs().toISOString(),
        invoiceValue: String(Math.round(invoiceAmount * 100)),
        items: vtexItems
      });

      return { ok: true, docEntry, docNum };
    } catch (err) {
      const msg = JSON.stringify(err.response?.data || err.message);
      await OrdersRepository.saveIntegrationError(orderID, msg);
      throw new Error(`Reproceso falló: ${msg}`);
    }
  }
*/

reprocessOrder: async (orderID) => {
  /* 1. Orden en la BD */
  const orderRow = await OrdersRepository.getOrderById(orderID);
  if (!orderRow) throw new Error(`Orden ${orderID} no existe en la BD`);
  if (orderRow.docentry) {
    throw new Error(`Orden ${orderID} ya integrada (DocEntry=${orderRow.docentry})`);
  }

  /* 2. Traer VTEX solo para ítems/precios */
  const raw = await fetchVtexOrder(orderRow.u_ref1);

  /* ── Inyectar RUT corregido ───────────────────────────── */
  const body        = (orderRow.fixed_rut || orderRow.cardcode).replace(/C$/i, ""); // solo números
const { federal } = rutToFederal(body);                                           // cuerpo-DV
const isCorp      = !!raw.clientProfileData?.corporateName?.trim();

/* 1) Sobrescribe el documento del perfil */
if (isCorp) {
  raw.clientProfileData.corporateDocument = federal;   // empresa = cuerpo-DV
} else {
  raw.clientProfileData.document = federal;            // consumidor = cuerpo-DV
}

/* 2) Sobrescribe también el receptor de la dirección (si existe) */
const selAddr = raw.shippingData?.selectedAddresses?.[0];
if (selAddr) selAddr.receiverDocument = federal;
  /* ─────────────────────────────────────────────────────── */

  /* 3. Mapear productos (igual que ingestVtexOrder) */
  let baseProducts = raw.items.map(mapVtexItemToPicking);
  const shipVal = raw.totals?.find(t => t.id === "Shipping")?.value || 0;
  if (shipVal > 0) {
    baseProducts.push({
      itemcode       : "701001008",
      dscription     : "Flete",
      quantity       : 1,
      priceAfterVAT  : shipVal / 100,
      codebars       : null,
      whscode        : null,
      U_Subcategoria : "Flete"
    });
  }

  /* 4. Integrar en SAP + resto del flujo */
  try {
    const { docEntry, docNum, lineInfo } = await sendToSap(raw, orderRow, baseProducts);
    await OrdersRepository.saveSapIds(orderID, docEntry, docNum);

    const lookup = Object.fromEntries(lineInfo.map(l => [l.itemcode, l.lineNum]));
    const productsWithLine = baseProducts.map(p => ({ ...p, lineNum: lookup[p.itemcode] ?? null }));

    await sendMessage("new.order.created", {
      ...orderRow,
      docentry: docEntry,
      docnum  : docNum,
      products: productsWithLine
    });

    /* Reserva + pago + invoice */
    const invoicePayload = buildReserveInvoicePayload({ orderRow, docEntry, products: productsWithLine });
    const { docEntry: invDocEntry, payDocEntry, invoiceAmount, vtexItems } =
      await createInvoiceInSap(invoicePayload);

    await sendInvoiceToVtex({
      orderId      : orderRow.u_ref1,
      invoiceNumber: invDocEntry,
      issuanceDate : dayjs().toISOString(),
      invoiceValue : String(Math.round(invoiceAmount * 100)),
      items        : vtexItems
    });

    return { ok: true, docEntry, docNum };
  } catch (err) {
    const msg = JSON.stringify(err.response?.data || err.message);
    await OrdersRepository.saveIntegrationError(orderID, msg);
    throw new Error(`Reproceso falló: ${msg}`);
  }
},



//EDITAR ORDEN
patchOrder: async (orderID, changes) => {
  // Lista blanca de campos editables
  const ALLOWED = [
    "cardcode", "cardname", "phone1", "e_mail",
    "folionum", "orderStatusID", "integrationError", "INTEGRATION_STATUS",
    "fixed_rut"
  ];

  const updates = {};
  for (const [k, v] of Object.entries(changes)) {
    if (!ALLOWED.includes(k)) {
      throw new Error(`Campo no permitido: ${k}`);
    }
    updates[k] = v;
  }
  if (Object.keys(updates).length === 0) {
    throw new Error("Sin cambios válidos");
  }
  return await OrdersRepository.patchOrder(orderID, updates);
},
  
  
};



module.exports = OrdersService;
