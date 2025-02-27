const BundlesRepository = require('../models/bundlesRepository');
const { sendMessage } = require('../producer');
const axios = require('axios');


const BundlesService = {
  createBundle: async (orderID, pickerRUT, packageType, products) => {
    // 1. Crear el bulto en la DB (inserta barcode + refid)
    const bundleID = await BundlesRepository.createBundle(orderID, pickerRUT, packageType, products);
    if (!bundleID) return null;

    // 2. Determinar si es bulto suelto o múltiple
    const isLoose = (products.length === 1);

    // 3. Publicar evento en Kafka con la información del bulto
    await sendMessage('bundle.created', {
      orderID,
      pickerRUT,
      bundleID,
      packageType,
      isLoose
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
    // Obtener los bultos desde la base de datos
    const bundles = await BundlesRepository.getAllBundles();
    
    // Para cada bulto, obtener los datos del usuario basado en el RUT del auditor (Controlador)
    const bundlesWithUserData = await Promise.all(
      bundles.map(async (bundle) => {
        if (bundle.Controlador) {
          try {
            // Llamada al endpoint para obtener la información del usuario
            const { data: user } = await axios.get(`http://192.168.0.211:5002/api/users/${bundle.Controlador}`);
            // Supongamos que el endpoint devuelve la propiedad "name" (ajusta según tu respuesta real)
            bundle.ControladorName = user.name || null;
            bundle.ControladorEmail = user.email || null;
          } catch (error) {
            console.error(`Error al obtener datos del usuario con RUT ${bundle.Controlador}:`, error.message);
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
};

module.exports = BundlesService;
