# 📄 Orders Consumer (Finance Service)

Este módulo (`src/consumer/ordersConsumer.js`) es el **consumer de Kafka** encargado de procesar eventos de órdenes entrantes relacionados con la **reserva de facturas y pagos** en el *Finance Service*.

---

## 🚀 Flujo general

1. **Conexión a Kafka**
   - Se conecta al broker configurado (`KAFKA_BROKER`), usando el cliente **kafkajs**.  
   - Se suscribe al tópico de entrada **`finance.orders.reserve`**.  

2. **Recepción de mensajes**
   - Cada mensaje recibido se intenta parsear como JSON.  
   - Si el mensaje está mal formado → se envía al **Dead Letter Queue (DLQ)** con la razón `BAD_JSON`.  
   - Si falta el identificador **`u_ref1`** (commerceId/pedido) → también se envía a DLQ con la razón `MISSING_U_REF1`.  

3. **Procesamiento de órdenes**
   - Llama a `processOrder(u_ref1)` (servicio que genera la **factura de reserva** en SAP u otro backend financiero).  
   - Con el resultado (`invoiceDocEntry`, `invoiceDocNum`, `invoiceFolioNum`, `invoiceDocTotal`), publica:  
     - Evento interno de éxito en **`finance.reservation.created`**.  
     - Evento de estado para OMS/VTEX en el tópico **`vtex.status`** con el estado `start-handling`.  

4. **Manejo de pagos**
   - Si el proceso devuelve información de pago (`payDocEntry`, `payDocNum`), se generan dos eventos adicionales:  
     - **`finance.billing.completed`** → confirmación interna de facturación/pago.  
     - **`vtex.status`** con estado `invoiced` → actualización de estado para OMS/VTEX.  

5. **Errores en el proceso**
   - Si ocurre una excepción, se normaliza con `normalizeSlError()` y se publica en **`finance.deadletter`** con la razón `RESERVE_FAILED`.  

---

## 📌 Tópicos usados

- **Entrada**
  - `finance.orders.reserve` → pedidos que deben generar factura de reserva.  

- **Salida (éxitos)**
  - `finance.reservation.created` → confirmación de que la reserva fue creada.  
  - `finance.billing.completed` → confirmación de que la facturación/pago fue realizado.  
  - `vtex.status` → actualización de estados para OMS/VTEX (`start-handling`, `invoiced`).  

- **Errores**
  - `finance.deadletter` → mensajes rechazados o fallidos (errores de parseo, falta de `u_ref1`, error en reserva).  

---

## 📑 Ejemplo de evento publicado en `vtex.status`

```json
{
  "commerceId": "12345",
  "state": "start-handling",
  "source": "finance",
  "eventId": "finance-12345-1696261234567-987654"
}

## ✅ Logs de referencia

```markdown
```bash
✅ Reserva/Billing OK u_ref1=12345 invEntry=100 invNum=500 folio=F123 payEntry=200 payNum=600
❌ Error Reserva: { u_ref1: '12345', error: { code: 'SL_ERR', httpStatus: 400, message: 'Bad Request' } }

## 🖼️ Diagrama de flujo

```markdown
```mermaid
flowchart TD
    subgraph IN["Kafka Topics - Entrada"]
        A["finance.orders.reserve"]
    end

    subgraph FINANCE["Finance Service (Consumer)"]
        A --> B[Parsear mensaje]
        B -->|BAD_JSON| DLQ["finance.deadletter"]
        B -->|MISSING_u_ref1| DLQ

        B -->|OK| C[processOrder(u_ref1)]
        C -->|Error| DLQ

        C --> D1[Publicar en finance.reservation.created]
        C --> D2[Publicar estado VTEX: start-handling → vtex.status]

        C -->|Tiene pago| E1[Publicar en finance.billing.completed]
        C -->|Tiene pago| E2[Publicar estado VTEX: invoiced → vtex.status]
    end

    subgraph OUT["Kafka Topics - Salida"]
        D1
        D2
        E1
        E2
        DLQ
    end
