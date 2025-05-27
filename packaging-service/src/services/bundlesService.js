const BundlesRepository = require("../models/bundlesRepository");
const pickingServiceClient = require("../client/pickingServiceClient")
const { sendMessage } = require("../producer");
const axios = require("axios");

const BundlesService = {
  
  createBundle: async (
    orderID,
    pickerRUT,
    packageTypeID,
    products,
    height,
    width,
    length,
    weight,
    location,
    cubage,
    status
  ) => {
    // 1) Validar primero, sin crear el bulto todavía
    //    Si alguno falla, retorna error (no se crea en DB).
    for (const prod of products) {
      const { orderProductID, quantity } = prod;
      console.log("Validando prod:", prod.orderProductID, "qtyWanted=", prod.quantity);

  
      // 1.1) Obtener cuántas unidades tiene el picker en picking-service
      const assignedQuantity = await pickingServiceClient.fetchAssignedQuantity(
        orderProductID,
        pickerRUT
      );
      console.log("assignedQuantity=", assignedQuantity);
  
      // 1.2) Sumar cuántas ya están en bultos anteriores
      //      Al no existir bulto nuevo todavía, usamos excludeBundleID=0.
      const alreadyAssigned = await BundlesRepository.getAlreadyAssignedToPicker(
        orderProductID,
        pickerRUT,
        0
      );
      console.log("alreadyAssigned=", alreadyAssigned);
      const remaining = assignedQuantity - alreadyAssigned;
  
      // Si remaining <= 0, ya no hay disponibilidad para este producto.
      if (remaining <= 0) {
        throw new Error(
          `No se puede crear el bulto: el producto ${orderProductID} no tiene disponibilidad (restan ${remaining}).`
        );
      }
      console.log("remaining=", remaining);
      // Si la cantidad requerida excede lo que queda, también error.
      if (quantity > remaining) {
        throw new Error(
          `No se puede crear el bulto: intentas asignar ${quantity}, pero sólo quedan ${remaining} disponibles (producto ${orderProductID}).`
        );
      }
    }
  
    // 2) Si todas las validaciones pasan, ahora sí creamos el bulto en DB.
    const bundleID = await BundlesRepository.createBundle(
      orderID,
      pickerRUT,
      packageTypeID,
      products, // Insertamos los productos de una vez.
      height,
      width,
      length,
      weight,
      location,
      cubage,
      status
    );
  
    if (!bundleID) {
      // Si la inserción falló por alguna razón
      return null;
    }
  
  
    return bundleID;
  },
  updateBundleDraft: async (bundleID, fieldsToUpdate, products) => {
    // 1) Verificamos si el bulto existe y está en 'draft'
    const bundle = await BundlesRepository.getBundleById(bundleID);
    if (!bundle || bundle.length === 0) {
      return { success: false, statusCode: 404, message: "Bulto no encontrado" };
    }
    if (bundle[0].status !== "draft") {
      return {
        success: false,
        statusCode: 400,
        message: "No se puede editar un bulto que no está en 'draft'"
      };
    }
  
    // 2) Actualizamos los campos generales del bulto (dimensiones, ubicación, etc.)
    const updated = await BundlesRepository.updateBundleDraft(bundleID, fieldsToUpdate);
    if (!updated) {
      return {
        success: false,
        statusCode: 400,
        message: "No se pudo actualizar el bulto en la base de datos"
      };
    }
  
    // 3) Manejo de los productos:
    // 3.1 Obtener la lista de productos que ya están en el bulto
    const existingProducts = await BundlesRepository.getProductsOfBundle(bundleID);
    // Construir un mapa de los productos actuales, clave: orderProductID, valor: quantity
    const existingMap = {};
    existingProducts.forEach(prod => {
      existingMap[prod.orderProductID] = prod.quantity;
    });
  
    // 3.2 Construir un mapa de los productos enviados en el request
    const newMap = {};
    if (products && Array.isArray(products)) {
      products.forEach(prod => {
        newMap[prod.orderProductID] = prod.quantity;
      });
    }
  
    // 3.3 Eliminar los productos que estaban en el bulto pero ya no vienen en el request
    for (const orderProductID in existingMap) {
      if (!newMap.hasOwnProperty(orderProductID)) {
        await BundlesRepository.removeBundleProduct(bundleID, orderProductID);
      }
    }
  
    // 3.4 Insertar o actualizar los productos enviados
    // Para cada producto en el nuevo array, se realiza la validación parcial
    for (const orderProductID in newMap) {
      const quantity = newMap[orderProductID];
      try {
        // Esta función valida que la cantidad no supere lo disponible y
        // inserta o actualiza el registro en Bundle_Products
        await BundlesService.addOrUpdateProductWithValidation(
          bundleID,
          orderProductID,
          quantity
        );
      } catch (err) {
        return {
          success: false,
          statusCode: 400,
          message: err.message
        };
      }
    }
  
    return { success: true, message: "Bulto en draft actualizado correctamente" };
  },

  // FINALIZAR PACKAGING DE LA ORDEN
  finalizeOrderPackaging: async (orderID) => {
    // A) Verificar que exista al menos 1 bulto para la orden
    const bundles = await BundlesRepository.getBundlesByOrder(orderID);
    if (!bundles || bundles.length === 0) {
      return {
        success: false,
        message: "No hay bultos creados para esta orden"
      };
    }

    // B) Verificar que NINGÚN bulto esté vacío (sin productos)
    //    Nos basta con contar cuántos productos hay en cada bulto
    for (const b of bundles) {
      const countProducts = await BundlesRepository.countProductsInBundle(b.bundleID);
      if (countProducts === 0) {
        return {
          success: false,
          message: `El bulto ${b.bundleID} no tiene productos, debes eliminarlo o asignarle productos antes de finalizar`
        };
      }
    }

    // C) Verificar que TODOS los productos de la orden estén en algún bulto
    //    1) Cuántos productos totales tiene la orden
    const totalOrderProducts = await BundlesRepository.countOrderProducts(orderID);
    //    2) Cuántos están asignados a algún bundle
    const totalAssigned = await BundlesRepository.countOrderProductsAssignedToBundles(orderID);

    if (totalOrderProducts !== totalAssigned) {
      return {
        success: false,
        message: "Existen productos de esta orden que no están en ningún bulto"
      };
    }

    // Si todo está OK, cambiamos todos los bultos a 'completed'
    // (o cada uno a 'completed' si todavía tienen 'draft')
    await BundlesRepository.completeAllBundlesOfOrder(orderID);

    return {
      success: true,
      message: "Todos los bultos de la orden han sido finalizados con éxito"
    };
  },
  addOrUpdateProductWithValidation: async (bundleID, orderProductID, quantity) => {
    // 1) Obtener info del bulto local, para saber pickerRUT
    const bundleRows = await BundlesRepository.getBundleById(bundleID);
    if (!bundleRows || bundleRows.length === 0) {
      throw new Error(`Bulto ${bundleID} no existe`);
    }
    const pickerRUT = bundleRows[0].pickerRUT;
  
    // 2) Llamar a picking-service -> assignedQuantity
    const assignedQuantity = await pickingServiceClient.fetchAssignedQuantity(orderProductID, pickerRUT);
    console.log("assignedQuantity =>", assignedQuantity);
    // Ej: 5
  
    // 3) Sumar cuántas ya están asignadas a bultos distintos (o el mismo bulto si quieres excluirlo)
    // Creamos un método en BundlesRepository que sume:
    // "SELECT COALESCE(SUM(quantity), 0) FROM Bundle_Products bp JOIN Bundles b ON b.bundleID=bp.bundleID
    //  WHERE bp.orderProductID=? AND b.pickerRUT=? AND b.bundleID != ?"
    const alreadyAssigned = await BundlesRepository.getAlreadyAssignedToPicker(
      orderProductID,
      pickerRUT,
      bundleID
    );
    console.log("alreadyAssigned =>", alreadyAssigned);
    console.log("quantity =>", quantity);
    // p.e. 2
  
    const remaining = assignedQuantity - alreadyAssigned; // p.e. 3
    if (quantity > remaining) {
      throw new Error(`Asignas ${quantity}, pero sólo quedan ${remaining} disponibles para este picker/producto.`);
    }
  
    // 4) Insert/Update en la DB local
    await BundlesRepository.addOrUpdateBundleProduct(bundleID, orderProductID, quantity);
  },

  markProductAsLoose: async (orderProductID) => {
    return await BundlesRepository.markProductAsLoose(orderProductID);
  },

  getBundlesByOrder: async (orderID) => {
    return await BundlesRepository.getBundlesByOrder(orderID);
  },

  getBundlesByPicker: async (orderID, pickerRUT) => {
    return await BundlesRepository.getBundlesByPicker(orderID, pickerRUT);
  },

  getBundleDetails: async (bundleID) => {
    return await BundlesRepository.getBundleDetails(bundleID);
  },

  getOrderProductsWithBundleID: async (orderID) => {
    return await BundlesRepository.getOrderProductsWithBundleID(orderID);
  },
  getMyBundlesByOrder: async (orderID, pickerRUT) => {
    // Delegamos la query al repositorio
    return await BundlesRepository.getBundlesByPicker(orderID, pickerRUT);
  },
  getTotalAssignedToPicker: async (orderProductID, pickerRUT) => {
    // Llama a un método del repositorio
    return await BundlesRepository.getTotalAssignedToPicker(orderProductID, pickerRUT);
  },

  getAllBundles: async () => {
    // 1. Obtener los bultos desde la base de datos
    const bundles = await BundlesRepository.getAllBundles();
    
    // 2. (Opcional) Enriquecer con datos de usuario, si tienes un servicio de usuarios
    const bundlesWithUserData = await Promise.all(
      bundles.map(async (bundle) => {
        if (bundle.Controlador) {
          try {
            // Llama a tu servicio de usuarios, ajusta el endpoint según sea necesario
            const { data: user } = await axios.get(
              `http://192.168.0.254:5002/api/users/${bundle.Controlador}`
            );
            bundle.ControladorName = user.name || null;
            bundle.ControladorEmail = user.email || null;
          } catch (error) {
            console.error(
              `Error al obtener datos del usuario con RUT ${bundle.Controlador}:`,
              error.message
            );
            bundle.ControladorName = null;
            bundle.ControladorEmail = null;
          }
        } else {
          bundle.ControladorName = null;
          bundle.ControladorEmail = null;
        }
        return bundle;
      })
    );
    
    return bundlesWithUserData;
  },

  updateDimensions: async (bundleID, { height, width, length, weight, cubage, location }) => {
    // Actualiza dimensiones en la DB
    const result = await BundlesRepository.updateDimensions(bundleID, {
      height,
      width,
      length,
      weight,
      cubage,
      location
    });
    return result;
  },
  handleBundleCreated: async (msg) => {
    console.log(`📦 Procesando bundle.created con ID=${msg.bundleID} en Packaging Service...`);

    // Delegar a la capa repository la consulta
    const bundle = await BundlesRepository.getBundleById(msg.bundleID);
    if (!bundle || bundle.length === 0) {
      console.warn(`⚠️ Bulto ${msg.bundleID} no encontrado en la base de datos.`);
      return;
    }
    
    console.log(`✅ Bulto ${msg.bundleID} encontrado en Packaging Service, listo para auditoría.`);
    // Aquí podrías agregar más lógica relacionada a auditoría si fuese necesario.
  },
  
  getBundleDetails: async (bundleID) => {
    // 1) Obtener datos locales de Bundles y Bundle_Products
    const rows = await BundlesRepository.getBundleAndProductsLocal(bundleID);
    if (!rows || rows.length === 0) return null;
    

    // Armar objeto base con los campos del primer registro
    const bundleDetails = {
      bundleID: rows[0].bundleID,
      orderID: rows[0].orderID,
      packageTypeID: rows[0].packageTypeID,
      barcode: rows[0].barcode,
      refid: rows[0].refid,
      auditStatusID: rows[0].auditStatusID,
      height: rows[0].height,
      width: rows[0].width,
      length: rows[0].length,
      weight: rows[0].weight,
      cubage: rows[0].cubage,
      location: rows[0].location,
      products: []
    };


    // Lista de orderProductIDs (únicos) para pedir a picking-service
    const orderProductIDs = [];

    rows.forEach((row) => {
      bundleDetails.products.push({
        bundleProductID: row.bundleProductID,
        orderProductID: row.orderProductID,
        // expected viene de la DB local
        expected: row.expected
        // (por ahora, itemcode y demás están vacíos, los obtendremos vía picking-service)
      });
      orderProductIDs.push(row.orderProductID);
    });
    if (orderProductIDs.length === 0) {
      // No hay productos: retorna inmediatamente el bundle con products: []
      return bundleDetails; // 'bundleDetails' va con products vacío
    }

    // 2) Llamar a picking-service con la lista de orderProductIDs
    const pickingData = await pickingServiceClient.fetchOrderProductDetails(orderProductIDs);
    // pickingData es un array de objetos con { orderProductID, itemcode, dscription, found, not_found, repicked, pickerRUT }

    // 3) Crear un mapa para acceder rápido por orderProductID
    const pickingMap = {};
    pickingData.forEach((p) => {
      pickingMap[p.orderProductID] = p;
    });

    // 4) Fusionar datos
    bundleDetails.products = bundleDetails.products.map((product) => {
      const match = pickingMap[product.orderProductID];
      if (match) {
        return {
          ...product,
          itemcode: match.itemcode,
          dscription: match.dscription,
          found: match.found,
          not_found: match.not_found,
          repicked: match.repicked,
          pickerRUT: match.pickerRUT
        };
      } else {
        // Si no hay match, devuelves lo que tengas
        return product;
      }
    });

    return bundleDetails;
  },
  finalizePackingManual: async (orderID, bundles) => {
    try {
      // 1) Actualizar cada bulto
      for (const b of bundles) {
        // Cambiar su estado a 'completed'
        const updated = await BundlesRepository.markBundleCompleted(b.bundleID, orderID);
        if (!updated) {
          return {
            success: false,
            message: `No se pudo completar el bulto ${b.bundleID} (no existe o no es 'draft').`,
          };
        }
      }

      // 2) Juntar todos los orderProductID en un array para notificar
      const allOrderProductIDs = [];
      for (const b of bundles) {
        if (b.products && Array.isArray(b.products)) {
          for (const p of b.products) {
            allOrderProductIDs.push(p.orderProductID);
          }
        }
      }

      // 3) Emitir el evento "bundle.ready" via Kafka con la lista
      await sendMessage("bundle.ready", {
        orderID,
        orderProductIDs: allOrderProductIDs
      });

      return {
        success: true,
        message: "Finalizado correctamente",
        details: { totalBundles: bundles.length, totalProducts: allOrderProductIDs.length },
      };

    } catch (error) {
      console.error("❌ Error en finalizePackingManual:", error);
      return { success: false, message: error.message };
    }
  },
  
};

module.exports = BundlesService;
