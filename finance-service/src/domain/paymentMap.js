// domain/paymentMap.js
module.exports = {

    MercadoPagoV2: { formaPago: 26, cuenta: "11004022" },
  
    /* “NC”, “SI”, “VC”, “VD”, “VN”, “VP” vienen en el campo
       connectorResponses.Message  (ej: "VC-18") o en PaymentSystemName  */
    NC: { formaPago: 24, cuenta: "11004005" },
    SI: { formaPago: 24, cuenta: "11004005" },
    VC: { formaPago: 24, cuenta: "11004005", isVC: true }, // regla cuotas
    VD: { formaPago: 25, cuenta: "11004008" },
    VN: { formaPago: 25, cuenta: "11004008" },
    VP: { formaPago: 25, cuenta: "11004008" }
  };
  