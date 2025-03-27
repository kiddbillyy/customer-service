const BundlesService = require("../services/bundlesService");


exports.createBundle = async (req, res) => {
  try {
    const {
      orderID,
      pickerRUT,
      packageTypeID,
      products,
      height,
      width,
      length,
      weight,
      location,
      status = "draft"
    } = req.body;

    // 1) Validación de campos mínimos
    if (!orderID || !pickerRUT) {
      return res.status(400).json({ message: "Faltan campos requeridos (orderID y pickerRUT)" });
    }

    // 2) Validar que obligatoriamente haya al menos 1 producto
    if (!products || products.length === 0) {
      return res.status(400).json({
        message: "Debes asignar al menos 1 producto al crear el bulto"
      });
    }

    // Calcular cubage si se desea
    const cubage = (height && width && length) ? height * width * length : 0;

    // 3) Llamar al servicio
    const bundleID = await BundlesService.createBundle(
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
    );

    if (!bundleID) {
      return res.status(500).json({ message: "Error al crear el bulto" });
    }

    return res.status(201).json({
      message: "Bulto creado con éxito",
      bundleID
    });
  } catch (error) {
    console.error("❌ Error creando bulto:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};


exports.updateBundleDraft = async (req, res) => {
  try {
    const { bundleID } = req.params;
    const {
      packageTypeID,
      height,
      width,
      length,
      weight,
      location,
      products,   // si queremos agregar/quitar o actualizar productos
    } = req.body;

    // Llamamos al service
    const result = await BundlesService.updateBundleDraft(
      bundleID,
      {
        packageTypeID,
        height,
        width,
        length,
        weight,
        location
      },
      products // array con la nueva lista o productos a agregar/quitar
    );

    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }

    res.json({ message: result.message });
  } catch (error) {
    console.error("❌ Error actualizando bulto en draft:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};
exports.finalizeOrderPackaging = async (req, res) => {
  try {
    const { orderID } = req.params;

    const result = await BundlesService.finalizeOrderPackaging(orderID);

    if (!result.success) {
      return res.status(400).json({ message: result.message });
    }

    return res.json({ message: "Packaging finalizado con éxito" });
  } catch (error) {
    console.error("❌ Error finalizando packaging de la orden:", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};

exports.getBundlesByPicker = async (req, res) => {
  try {
    const { orderID, pickerRUT } = req.params;
    const bundles = await BundlesService.getBundlesByPicker(orderID, pickerRUT);
    return res.json(bundles);
  } catch (error) {
    console.error("❌ Error obteniendo bultos por picker:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

exports.getMyBundlesByOrder = async (req, res) => {
  try {
    const { orderID, pickerRUT } = req.params;

    // Llamamos al servicio
    const bundles = await BundlesService.getMyBundlesByOrder(orderID, pickerRUT);

    // Si no hay bultos, podemos retornar un arreglo vacío o un 404, según tu preferencia
    // Aquí devolvemos un array vacío y status 200
    return res.status(200).json(bundles);
  } catch (error) {
    console.error("❌ Error obteniendo bultos por picker:", error);
    return res.status(500).json({ message: "Error interno del servidor" });
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



