const BundlesService = require("../services/bundlesService");
const PDFDocument = require("pdfkit");
const bwipJs = require("bwip-js");
const moment = require("moment");  
const axios = require("axios");

exports.createBundle = async (req, res) => {
  try {

    const { orderID, pickerRUT, packageTypeID, products, height, width, length, weight, location} = req.body;
    const cubage = height * width * length;

    const bundleID = await BundlesService.createBundle(orderID, pickerRUT, packageTypeID, products, height, width, length, weight, location, cubage);
    if (!bundleID) {
      return res.status(500).json({ message: "Error al crear el bulto" });
    }

    return res.status(201).json({ message: "Bulto creado con éxito", bundleID });
  } catch (error) {
    console.error("❌ Error creando bulto:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

exports.markProductAsLoose = async (req, res) => {
  try {
    const { orderProductID } = req.body;
    const updated = await BundlesService.markProductAsLoose(orderProductID);

    if (!updated) {
      return res.status(404).json({ message: "No se pudo actualizar el producto" });
    }
    res.json({ message: "Producto marcado como suelto" });
  } catch (error) {
    console.error("❌ Error marcando producto como suelto:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

exports.getBundlesByOrder = async (req, res) => {
  try {
    const bundles = await BundlesService.getBundlesByOrder(req.params.orderID);
    res.json(bundles);
  } catch (error) {
    console.error("❌ Error obteniendo bultos:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

exports.getBundleDetails = async (req, res) => {
  try {
    const bundle = await BundlesService.getBundleDetails(req.params.bundleID);
    if (!bundle) {
      return res.status(404).json({ message: "Bulto no encontrado" });
    }
    res.json(bundle);
  } catch (error) {
    console.error("❌ Error obteniendo detalles del bulto:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

exports.getOrderProductsWithBundleID = async (req, res) => {
  try {
    const products = await BundlesService.getOrderProductsWithBundleID(req.params.orderID);
    res.json(products);
  } catch (error) {
    console.error("❌ Error obteniendo productos de la orden:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

exports.getAllBundles = async (req, res) => {
  try {
    const bundles = await BundlesService.getAllBundles();
    res.json(bundles);
  } catch (error) {
    console.error("❌ Error obteniendo bultos:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

exports.updateBundleDimensions = async (req, res) => {
  try {
    const { bundleID } = req.params;
    const { height, width, length, weight, location } = req.body;

    // Validaciones mínimas
    if (height <= 0 || width <= 0 || length <= 0 || weight <= 0) {
      return res.status(400).json({
        message: "Las dimensiones deben ser valores numéricos positivos."
      });
    }

    const cubage = height * width * length;
    const updated = await BundlesService.updateDimensions(bundleID, {
      height,
      width,
      length,
      weight,
      cubage,
      location
    });

    if (!updated) {
      return res.status(404).json({ message: "No se pudo actualizar el bulto o no existe" });
    }

    res.json({ message: "Dimensiones del bulto actualizadas correctamente" });
  } catch (error) {
    console.error("❌ Error actualizando dimensiones del bulto:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

exports.getBundleDetails = async (req, res) => {
  try {
    const { bundleID } = req.params;
    const result = await BundlesService.getBundleDetails(bundleID);

    if (!result) {
      return res.status(404).json({ message: "Bulto no encontrado" });
    }
    res.json(result);
  } catch (error) {
    console.error("❌ Error obteniendo detalles del bulto:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

