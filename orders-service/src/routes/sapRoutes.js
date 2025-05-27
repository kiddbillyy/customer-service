const express = require("express");
const { login, createInvoice, createDeliveryNote } = require("../controllers/sapController");

const router = express.Router();

// POST /api/sap/login
router.post("/login", login);

// POST /api/sap/invoices
router.post("/invoices", createInvoice);

//POST /api/sap/delivery-notes
router.post("/delivery-notes", createDeliveryNote);

module.exports = router;
