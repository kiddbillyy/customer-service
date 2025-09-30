# 📄 Finance Payments Controller

Este módulo expone los endpoints relacionados con la **recepción de pagos** y la **consulta de estado de pago** en el Finance Service.

---

## 📂 Archivo
`controllers/FinancePayments.Controller.js`

---

## 🚀 Endpoints

### 1. **POST /finance/payments**
Recibe un pago asociado a una orden.

- **Request Body (FinancePaymentDTO):**
```json
{
  "orderId": "12345",
  "amount": 5000,
  "method": "credit_card",
  "transactionId": "txn_abc123"
}
````

* **Response (201 Created):**

```json
{
  "orderId": "12345",
  "message": "Pago recibido."
}
```

* **Errores posibles:**

  * `400 ORDER_ID_REQUIRED` → El campo `orderId` es obligatorio.
  * `500` → Error interno del servidor.
  * `4xx/5xx` → Códigos según `err.statusCode` en caso de excepción.

---

### 2. **GET /finance/payments/state/:orderId**

Consulta el estado del pago de una orden.

* **Parámetros de URL:**

  * `orderId` → ID de la orden.

* **Response (200 OK):**

```json
{
  "state": "paid"
}
```

* **Errores posibles:**

  * `404` → Orden no encontrada.
  * `500` → Error interno del servidor.

---

## ⚙️ Flujo General
<img width="3840" height="2086" alt="Untitled diagram _ Mermaid Chart-2025-09-30-210542" src="https://github.com/user-attachments/assets/9c66e4b4-0b27-416c-ad8b-86d46fe763a0" />

```
flowchart TD
  A[Cliente/Frontend] -->|POST /finance/payments| B[intakePayment]
  A -->|GET /finance/payments/state/:orderId| C[getPaymentState]

  subgraph Controller
    B --> M[model.savePaymentIntake(dto)]
    C --> M2[model.getState(orderId)]
  end

  M -->|OK| R1[201 Pago recibido]
  M -->|Error| E1[400/500 Error]

  M2 -->|OK| R2[200 Estado de pago]
  M2 -->|No encontrado| E2[404 Orden no encontrada]
```

---

## 🛠️ Dependencias

* `../models/FinancePayments.Model.js`

  * `savePaymentIntake(dto)` → Persiste un nuevo pago.
  * `getState(orderId)` → Devuelve el estado actual del pago.

---

## 📌 Notas

* Todos los errores son logueados en `console.error`.
* Se maneja un `map` de errores conocidos para devolver status codes específicos.
* Compatible con integraciones vía **REST API**.

---
