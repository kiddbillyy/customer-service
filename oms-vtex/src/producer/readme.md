¡Genial! 🙌
Aquí tienes el README.md completo en Markdown con formato bonito para GitHub. Solo copias y pegas:

# 📮 Productor Kafka — `src/producer/index.js`

Este módulo es el **productor de mensajes** hacia **Apache Kafka** dentro del microservicio **oms-vtex**.  
Permite publicar eventos como **nueva orden recibida**, **estado actualizado** o **error de integración**.

---

## 🌐 Explicación no técnica
Imagina que tu sistema tiene que **avisar algo** (por ejemplo: “📦 llegó una orden nueva de VTEX”).  

Este archivo actúa como un **cartero digital**:
- ✉️ Prepara la carta con los datos (`message`).  
- 🆔 Le pone un identificador (`key`, normalmente el `orderId`).  
- 🗒️ Puede añadir notas extras (`headers`).  
- 📮 La entrega en un buzón llamado **Kafka** (`topic`).  

Otros microservicios revisan ese buzón y continúan el proceso (crear cliente, facturar, actualizar estados, etc.).

---

## ⚙️ Explicación técnica

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

Detalles
	1.	Serializa el message a JSON.
	2.	Construye el objeto Kafka { key, value, headers }.
	3.	Llama a sendBatch(topic, [message]) (helper en utils/kafkaProducer.js).
	4.	Loguea el envío exitoso.

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

flowchart TD
    VTEX[Webhook VTEX] --> OMS[OMS-VTEX]
    OMS --> DB[(Base de datos)]
    OMS --> |sendMessage()| KAFKA[(Kafka)]
    KAFKA --> OMSService[OMS-SERVICE]
    KAFKA --> Customer[CUSTOMER-SERVICE]
    KAFKA --> Finance[FINANZAS]


⸻

✅ Buenas prácticas

Área	Recomendación
Key	Usar orderId como key → garantiza orden relativo en Kafka.
Headers	Incluir trace-id, correlation-id, origin-service, schema-version.
Contratos	Versionar esquemas de mensajes (schema-version en headers).
Logs	No imprimir datos sensibles; solo tópico, key y estado.
Resiliencia	Manejar reintentos y DLQ (Dead Letter Queue) en los consumidores.
Observabilidad	Medir entregas, latencia y errores por tópico.


⸻

🛑 Errores frecuentes
	•	❌ sendBatch is not a function → Revisar export en utils/kafkaProducer.js.
	•	⏳ Timeouts o desconexión → Revisar KAFKA_BROKER, red Docker (kafka_network) y credenciales.
	•	🔀 Mensajes desordenados → Siempre usar key = orderId.
	•	⚠️ Payload inválido → Asegurarse que message sea serializable con JSON.stringify.

⸻

🔧 Variables de entorno

Ejemplo en .env:

KAFKA_BROKER=kafka:9092
KAFKA_CLIENT_ID=oms-service
KAFKA_GROUP_ORDERS=oms-vtex-sync
KAFKA_TOPIC_ORDER_STATUS=vtex.order.status


⸻

📂 Relación con otros módulos
	•	src/utils/kafkaProducer.js → Inicializa el producer Kafka y expone sendBatch().
	•	Consumidores → Otros microservicios que procesan los tópicos (oms-service, customer-service, finanzas).

⸻

🔎 Pseudocódigo

sendMessage(topic, payload, { key, headers }):
  mensaje = {
    key: key ? String(key) : undefined
    value: JSON.stringify(payload)
    headers: headers
  }

  sendBatch(topic, [mensaje])
  log "📮 Mensaje enviado", topic, payload

---

¿Quieres que ahora te prepare el mismo `README.md` pero para el **consumer** (el que recibe los mensajes de Kafka) y así documentas los dos lados del flujo?