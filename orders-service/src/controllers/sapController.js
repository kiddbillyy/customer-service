const { loginToSap, createInvoiceInSap, createDeliveryNoteInSap } = require("../services/sapService");

exports.login = async (req, res) => {
  try {
    const credentials = req.body;

    const loginInfo = await loginToSap(credentials);

    return res.status(200).json({
      message: "Login exitoso contra SAP Service Layer",
      cookie:  loginInfo.rawCookie,          
      sessionId: loginInfo.sessionId,
      routeId:   loginInfo.routeId
    });
  } catch (err) {
    console.error("❌ Error en sapController.login:", err.message);
    return res
      .status(err.code === "SAP_LOGIN" ? 401 : 500)
      .json({ error: err.message });
  }
};

/* ---------- CREAR FACTURA ---------- */
exports.createInvoice = async (req, res) => {
  try {
    const invoicePayload = req.body;            

    const sapResponse = await createInvoiceInSap(invoicePayload);

    return res.status(201).json({
      message : "Factura creada en SAP B1",
      data    : sapResponse                       // { docEntry, docNum, documentLines }
    });
  } catch (err) {
    console.error("❌ Error en sapController.createInvoice:", err);
    // Error típico de SL: err.response.data
    const status = err.response?.status || 500;
    return res.status(status).json({
      error: err.response?.data || err.message || "Error al crear factura en SAP"
    });
  }
};

/* ---------- CREAR ENTREGA ---------- */
exports.createDeliveryNote = async (req, res) => {
  try {
    const dnPayload = req.body;                  // el front envía el JSON para SL

    const sapResp = await createDeliveryNoteInSap(dnPayload);

    return res.status(201).json({
      message: "Entrega creada en SAP B1",
      data   : sapResp                           // { docEntry, docNum, documentLines }
    });
  } catch (err) {
    console.error("❌ Error en sapController.createDeliveryNote:", err);
    const status = err.response?.status || 500;
    return res.status(status).json({
      error: err.response?.data || err.message || "Error al crear la entrega en SAP"
    });
  }
};