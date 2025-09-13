Productor Kafka — src/producer/index.js

¿Qué hace? (explicación no técnica)

Este archivo es como el cartero de tu sistema.
Cuando tu aplicación tiene una novedad (por ejemplo, “llegó una orden de VTEX”), arma una carta con la información y la envía a un “buzón” llamado Kafka (un sistema de mensajería).
	•	El tópico es el nombre del buzón (ej. vtex.orderIntegration).
	•	La key es como el RUT de la carta (ej. el orderId), útil para que todas las cartas de la misma orden lleguen juntas.
	•	Los headers son post-its con metadatos (ej. trace-id).

Otros microservicios leen ese buzón y actúan: validan cliente, actualizan estados, facturan, etc.

⸻

¿Qué hace? (explicación técnica)

Expone una función asíncrona sendMessage(topic, message, options) que:
	1.	Serializa message a JSON.
	2.	Construye el objeto Kafka { key, value, headers }.
	3.	Publica el mensaje usando un helper sendBatch(topic, messages[]) (definido en src/utils/kafkaProducer.js).
	4.	Loguea el envío exitoso.

La key se convierte a string si viene definida. Recomendado usar orderId como clave para particionado determinístico (garantiza orden relativo por orden).

⸻

API

sendMessage(topic, message, options?) → Promise<void>
	•	topic string — Tópico Kafka destino (p. ej. vtex.orderIntegration).
	•	message object — Payload del evento (se serializa con JSON.stringify).
	•	options object (opcional)
	•	key string|number — Clave de partición. Recomendado: orderId.
	•	headers Record<string, string|Buffer> — Metadatos (ej. trace-id, schema-version, origin-service).

Errores: Propaga errores de sendBatch (conexión, timeouts, auth). Manejar reintentos/DLQ en capas superiores.

⸻

Ejemplo de uso

// en cualquier parte de tu servicio
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
    key: '1561909550561-01', // particionado estable por orden
    headers: {
      'trace-id': '6b7a0c9d-2f41-4d7e-9b9e-0f0c123abcde',
      'schema-version': '1',
      'origin-service': 'oms-vtex'
    }
  }
);


⸻

Flujo recomendado (resumen)
	1.	Webhook VTEX → tu API.
	2.	Validas y persistes datos.
	3.	sendMessage() publica el evento al tópico.
	4.	Otros servicios (OMS, Customer, Finanzas) consumen y continúan el proceso.

⸻

Buenas prácticas
	•	Key obligatoria en eventos por orden: usa orderId.
Garantiza orden relativo y procesamiento consistente en los consumidores.
	•	Headers con trazabilidad: trace-id, correlation-id, origin-service, schema-version.
	•	Contrato de evento: mantener un esquema estable y versionado (ej. schema-version en header).
	•	Logs: no imprimir datos sensibles; loguea tópico, orderId y estado.
	•	Resiliencia: maneja reintentos y DLQ (cola de mensajes muertos) en los consumidores.
	•	Observabilidad: métricas de entrega, latencia, y errores por tópico.

⸻

Errores frecuentes y cómo resolver
	•	sendBatch is not a function
Revisa src/utils/kafkaProducer.js (que exporte sendBatch correctamente).
	•	Timeout/Conexión
Verifica KAFKA_BROKER, red Docker (kafka_network), credenciales y ACLs.
	•	Mensajes “desordenados”
Asegura key constante (orderId) para todos los eventos de la misma orden.
	•	Payload inválido
Chequea que message sea serializable (sin referencias circulares).

⸻

Dependencias de entorno (ejemplo)

Ajusta en .env o variables del contenedor:

KAFKA_BROKER=kafka:9092
KAFKA_CLIENT_ID=oms-service
KAFKA_GROUP_ORDERS=oms-vtex-sync
KAFKA_TOPIC_ORDER_STATUS=vtex.order.status


⸻

Relación con otros módulos
	•	src/utils/kafkaProducer.js: inicializa el producer de Kafka (singleton) y exporta sendBatch(topic, messages[]).
	•	Consumidores: otros microservicios/threads que se suscriben a los tópicos para continuar el flujo (validaciones, facturación, etc.).

⸻

Pseudocódigo del módulo

sendMessage(topic, payload, { key, headers }):
  msg = {
    key:   key != null ? String(key) : undefined
    value: JSON.stringify(payload)
    headers: headers
  }
  sendBatch(topic, [msg])
  log "enviado", topic, payload


⸻

Si quieres, te dejo también la plantilla de src/utils/kafkaProducer.js para que el sendBatch quede documentado igual de claro.