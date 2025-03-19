const BundlesRepository = require("../models/bundlesRepository");
const pickingServiceClient = require("../client/pickingServiceClient")
const { sendMessage } = require("../producer");
const axios = require("axios");

const BundlesService = {
  
  createBundle: async (orderID, pickerRUT, packageTypeID, products, height, width, length, weight, location, cubage) => {
    // 1. Crear el bulto en la DB (inserta barcode + refid)
    const bundleID = await BundlesRepository.createBundle(orderID, pickerRUT, packageTypeID, products, height, width, length, weight, location, cubage);
    if (!bundleID) return null;

    // 2. Opcional: Determinar si es bulto suelto o múltiple
    const isLoose = (products.length === 1);

    // 3. Enviar evento a Kafka (si quieres avisar a otros servicios)
    await sendMessage("bundle.created", {
      bundleID,
      orderID,
      pickerRUT,
      packageTypeID,
      isLoose,
      products
    });

    return bundleID;
  },

  markProductAsLoose: async (orderProductID) => {
    return await BundlesRepository.markProductAsLoose(orderProductID);
  },

  getBundlesByOrder: async (orderID) => {
    return await BundlesRepository.getBundlesByOrder(orderID);
  },

  getBundleDetails: async (bundleID) => {
    return await BundlesRepository.getBundleDetails(bundleID);
  },

  getOrderProductsWithBundleID: async (orderID) => {
    return await BundlesRepository.getOrderProductsWithBundleID(orderID);
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
              `http://192.168.0.89:5002/api/users/${bundle.Controlador}`
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
