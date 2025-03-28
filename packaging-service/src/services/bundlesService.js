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
    // 1) Validar primero, sin crear bulto todavía
    //    Si alguno falla, retorna error o null
    for (const prod of products) {
      const { orderProductID, quantity } = prod;
  
      // 1.1) assignedQuantity => picking-service
      const assignedQuantity = await pickingServiceClient.fetchAssignedQuantity(orderProductID, pickerRUT);
  
      // 1.2) Sumar lo que ya está asignado en bultos anteriores
      //      NOTA: Al no existir bulto todavía, le pasamos excludeBundleID=0, 
      //      para que no afecte la query con "!= excludeBundleID".
      const alreadyAssigned = await BundlesRepository.getAlreadyAssignedToPicker(orderProductID, pickerRUT, 0);
  
      const remaining = assignedQuantity - alreadyAssigned;
      if (quantity > remaining) {
        throw new Error(`No se puede crear el bulto: Intentas asignar ${quantity}, pero sólo quedan ${remaining} disponibles para el producto ${orderProductID}.`);
      }
    }
  
    // 2) Si llegamos aquí, significa que todos los productos son válidos.
    //    Ahora sí creamos el bulto en la base de datos.
  
    const bundleID = await BundlesRepository.createBundle(
      orderID,
      pickerRUT,
      packageTypeID,
      products, // Insertamos de una vez los productos
      height,
      width,
      length,
      weight,
      location,
      cubage,
      status
    );
  
    if (!bundleID) {
      // Si por alguna razón falló la inserción
      return null;
    }
  
    // 3) Opcional: Emitir evento "bundle.created"
    await sendMessage("bundle.created", {
      bundleID,
      orderID,
      pickerRUT,
      status
    });
  
    return bundleID;
  },
  updateBundleDraft: async (bundleID, fieldsToUpdate, products) => {
    // 1) Verificamos si el bulto está en 'draft'
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

    // 2) Actualizamos campos (dimensiones, location, etc.)
    const updated = await BundlesRepository.updateBundleDraft(bundleID, fieldsToUpdate);
    if (!updated) {
      return {
        success: false,
        statusCode: 400,
        message: "No se pudo actualizar el bulto en la base de datos"
      };
    }

    // 3) Si 'products' viene, podría significar:
    //    - Agregar productos (si no están ya)
    //    - Eliminar productos (?)
    //    Lo más simple: “agregar los que no estén”
    //    Podrías hacer una lógica extra si quieres eliminar o reemplazar
    if (products && products.length > 0) {
      // Lógica para insertar o actualizar
      // Asumo que 'products' es array con { orderProductID, quantity }
      for (const prod of products) {
        try {
          await BundlesService.addOrUpdateProductWithValidation(
            bundleID,
            prod.orderProductID,
            prod.quantity
          );
        } catch (err) {
          return {
            success: false,
            statusCode: 400,
            message: err.message
          };
        }
      }
    }

    // Listo
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
              `http://192.168.0.83:5002/api/users/${bundle.Controlador}`
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
  }
  
};

module.exports = BundlesService;
