const BundlesService = require('../services/bundlesService');

exports.createBundle = async (req, res) => {
  try {
    // En el body esperamos: { orderID, pickerRUT, packageTypeID, products }
    const { orderID, pickerRUT, packageTypeID, products } = req.body;

    const bundleID = await BundlesService.createBundle(orderID, pickerRUT, packageTypeID, products);
    if (!bundleID) {
      return res.status(500).json({ message: 'Error al crear el bulto' });
    }

    return res.status(201).json({ message: 'Bulto creado con éxito', bundleID });
  } catch (error) {
    console.error('❌ Error creando bulto:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

exports.markProductAsLoose = async (req, res) => {
  try {
    const { orderProductID } = req.body;
    const updated = await BundlesService.markProductAsLoose(orderProductID);

    if (!updated) {
      return res.status(404).json({ message: 'No se pudo actualizar el producto' });
    }
    res.json({ message: 'Producto marcado como suelto' });
  } catch (error) {
    console.error('❌ Error marcando producto como suelto:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

exports.getBundlesByOrder = async (req, res) => {
  try {
    const bundles = await BundlesService.getBundlesByOrder(req.params.orderID);
    res.json(bundles);
  } catch (error) {
    console.error('❌ Error obteniendo bultos:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

exports.getBundleDetails = async (req, res) => {
  try {
    const bundle = await BundlesService.getBundleDetails(req.params.bundleID);
    if (!bundle) {
      return res.status(404).json({ message: 'Bulto no encontrado' });
    }
    res.json(bundle);
  } catch (error) {
    console.error('❌ Error obteniendo detalles del bulto:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

exports.getOrderProductsWithBundleID = async (req, res) => {
  try {
    const products = await BundlesService.getOrderProductsWithBundleID(req.params.orderID);
    res.json(products);
  } catch (error) {
    console.error('❌ Error obteniendo productos de la orden:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

exports.getAllBundles = async (req, res) => {
  try {
    const bundles = await BundlesService.getAllBundles();
    res.json(bundles);
  } catch (error) {
    console.error('❌ Error obteniendo productos de la orden:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

exports.updateBundleDimensions = async (req, res) => {
  try {
    const { bundleID } = req.params;
    const { height, width, length, weight, location } = req.body;

    // (1) Validaciones adicionales: verificar que sean numéricos, positivos, etc.
    // Normalmente se hace con un validador. Aquí podrías dejarlo por si acaso:
    if (height <= 0 || width <= 0 || length <= 0 || weight <= 0) {
      return res.status(400).json({
        message: 'Las dimensiones deben ser valores numéricos positivos.'
      });
    }

    // (2) Calcular cubage en el backend
    const cubage = height * width * length;

    // (3) Llamar al servicio para actualizar
    const updated = await BundlesService.updateDimensions(bundleID, {
      height,
      width,
      length,
      weight,
      cubage,
      location
    });

    if (!updated) {
      return res.status(404).json({ message: 'No se pudo actualizar el bulto o no existe' });
    }

    res.json({ message: 'Dimensiones del bulto actualizadas correctamente' });
  } catch (error) {
    console.error('❌ Error actualizando dimensiones del bulto:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

