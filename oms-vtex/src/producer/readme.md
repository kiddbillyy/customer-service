# 📮 Productor Kafka — `src/producer/index.js`

Este módulo es el **productor de mensajes** hacia **Kafka** dentro del microservicio **oms-vtex**.  
Permite publicar eventos como “nueva orden recibida”, “estado actualizado” o “error de integración”.

---

## 🌐 Explicación no técnica
Imagina que tu sistema tiene que **avisar algo** (por ejemplo: *“llegó una orden nueva de VTEX”*).  
Este archivo actúa como un **cartero digital**:

- Arma la carta con los datos (`message`).  
- Le pone un **RUT** a la carta (la `key`, normalmente el `orderId`).  
- Si hace falta, le pega **post-its** con notas extras (`headers`).  
- Y la envía a un **buzón** llamado Kafka (`topic`).  

Otros microservicios abren ese buzón y siguen el flujo (crear cliente, facturar, actualizar estados, etc.).

---

## ⚙️ Explicación técnica
La función `sendMessage(topic, message, options)`:

1. Serializa el `message` a **JSON**.  
2. Construye un objeto Kafka `{ key, value, headers }`.  
3. Llama a `sendBatch(topic, [message])` de `src/utils/kafkaProducer.js`.  
4. Escribe en consola confirmando el envío.  

### Firma

```ts
sendMessage(
  topic: string,
  message: object,
  options?: {
    key?: string | number,
    headers?: Record<string, string | Buffer>
  }
): Promise<void>

	•	topic → Nombre del tópico Kafka (ej: vtex.orderIntegration).
	•	message → Objeto con la información a publicar (se convierte a JSON).
	•	key → Clave de partición (recomendado: orderId para mantener orden).
	•	headers → Metadatos como trace-id, schema-version, etc.

⸻

🚀 Ejemplo de uso

const { sendMessage } = require('../producer');

await sendMessage(
  'vtex.orderIntegration',
  {
    orderId: '1561909550561-01',
    state: 'start-handling',
    source: 'finance',
    occurredAt: new Date().toISOString(),
  },
  {
    key: '1561909550561-01', // partición estable por orden
    headers: {
      'trace-id': '6b7a0c9d-2f41-4d7e-9b9e-0f0c123abcde',
      'schema-version': '1',
      'origin-service': 'oms-vtex'
    }
  }
);

📋 Resultado esperado:
El mensaje se publica en el tópico vtex.orderIntegration y cualquier consumidor suscrito podrá procesarlo.

⸻

📊 Flujo simplificado

Webhook VTEX → OMS-VTEX
          ↓
Validación y persistencia en DB
          ↓
sendMessage() → Evento a Kafka
          ↓
OMS-SERVICE / Customer-Service / Finanzas consumen


⸻

✅ Buenas prácticas

Tema	Recomendación
Key	Siempre usar orderId como key para garantizar orden relativo.
Headers	Incluir trace-id, correlation-id, origin-service, schema-version.
Contratos	Versionar los esquemas de mensajes con un header schema-version.
Logs	Evitar datos sensibles en consola. Loguear solo tópico, key y estado.
Resiliencia	Manejar reintentos y DLQ (Dead Letter Queue) en consumidores.
Observabilidad	Medir entregas, latencia y errores por tópico.


⸻

🛑 Errores frecuentes
	•	sendBatch is not a function → Revisar que src/utils/kafkaProducer.js exporte correctamente.
	•	Timeouts o desconexión → Verificar KAFKA_BROKER, red Docker (kafka_network) y credenciales.
	•	Mensajes desordenados → Usar siempre key = orderId.
	•	Payload inválido → Revisar que message sea serializable con JSON.stringify.

⸻

🔧 Variables de entorno necesarias

Ejemplo en .env:

KAFKA_BROKER=kafka:9092
KAFKA_CLIENT_ID=oms-service
KAFKA_GROUP_ORDERS=oms-vtex-sync
KAFKA_TOPIC_ORDER_STATUS=vtex.order.status


⸻

📂 Relación con otros módulos
	•	src/utils/kafkaProducer.js → Inicializa el producer Kafka y expone sendBatch().
	•	Consumidores → Otros microservicios o workers que leen estos tópicos (oms-service, customer-service, finanzas).

⸻

🔎 Pseudocódigo del módulo

sendMessage(topic, payload, { key, headers }):
  mensaje = {
    key: key ? String(key) : undefined
    value: JSON.stringify(payload)
    headers: headers
  }

  sendBatch(topic, [mensaje])
  log "📮 Mensaje enviado", topic, payload

---
