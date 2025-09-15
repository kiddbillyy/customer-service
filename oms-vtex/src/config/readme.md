## Config Kafka — `src/config/kafka.js`

Este módulo **crea y exporta** una instancia de `Kafka` (librería **kafkajs**) configurada con variables de entorno.  
Es el **punto único de configuración** que usan el producer/consumer para conectarse al clúster.

---

## 🌍 Explicación no técnica

Piensa en este archivo como el **conector del enchufe**:
- 🔌 Lee del `.env` quién es la app (`clientId`) y a qué servidor ir (`brokers`).
- ⚙️ Crea un **cliente Kafka** listo para que otros módulos lo usen.
- 🧭 Evita que cada parte del sistema tenga que saber los detalles de conexión.

---

## ⚙️ Explicación técnica

### Código (resumen)
```js
const { Kafka } = require('kafkajs');
require('dotenv').config();

const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID,
  brokers : [process.env.KAFKA_BROKER],
});

module.exports = kafka;
```

- **`dotenv.config()`**: carga variables desde `.env`.
- **`clientId`**: identificador lógico del cliente (aparece en métricas/logs del cluster).
- **`brokers`**: arreglo con al menos un `host:port`.  
  > *Nota:* el archivo actual toma **un solo** broker de `KAFKA_BROKER`.

---

## 🚀 Ejemplo de uso

```js
// utils/kafkaProducer.js (ejemplo)
const kafka = require('../config/kafka');
const producer = kafka.producer();

await producer.connect();
await producer.send({ topic: 'demo', messages: [{ value: 'hola' }] });
```

```js
// utils/kafkaConsumer.js (ejemplo)
const kafka = require('../config/kafka');
const consumer = kafka.consumer({ groupId: 'demo-group' });

await consumer.connect();
await consumer.subscribe({ topic: 'demo', fromBeginning: true });
await consumer.run({ eachMessage: async ({ message }) => console.log(message.value.toString()) });
```

---

## 🔧 Variables de entorno

```env
KAFKA_CLIENT_ID=oms-service
KAFKA_BROKER=kafka:9092
```

> Si tu clúster tiene **varios** brokers, considera una variante que los acepte separados por coma:
>
> ```js
> const brokers = (process.env.KAFKA_BROKERS || process.env.KAFKA_BROKER || '')
>   .split(',').map(s => s.trim()).filter(Boolean);
> const kafka = new Kafka({ clientId: process.env.KAFKA_CLIENT_ID, brokers });
> ```

---

## ✅ Buenas prácticas

| Área              | Recomendación                                                                 |
|-------------------|-------------------------------------------------------------------------------|
| **Un solo origen**| Centraliza la configuración en este módulo y **reúsalo** en producer/consumer|
| **Múltiples brokers** | Usa lista de brokers para alta disponibilidad.                            |
| **TLS/SASL**      | Si tu clúster lo requiere, configura `ssl` y `sasl` aquí (ver ejemplo abajo).|
| **Observabilidad**| Usa `clientId` descriptivo (servicio-ambiente, p. ej. `oms-vtex-prod`).      |

**Ejemplo con SSL/SASL (opcional):**
```js
const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID,
  brokers : brokers,
  ssl     : process.env.KAFKA_SSL === 'true',
  sasl    : process.env.KAFKA_SASL_MECHANISM ? {
    mechanism: process.env.KAFKA_SASL_MECHANISM, // 'plain' | 'scram-sha-256' | 'scram-sha-512'
    username : process.env.KAFKA_SASL_USERNAME,
    password : process.env.KAFKA_SASL_PASSWORD,
  } : undefined,
});
```

---

## 🛑 Errores frecuentes

- **`KAFKA_BROKER` vacío** → no hay a quién conectarse.  
- **DNS/puerto inválido** → `getaddrinfo ENOTFOUND` / `ECONNREFUSED`.  
- **Credenciales fallidas** (si SASL) → `SASLAuthenticationError`.  
- **Cert/SSL** mal configurado → errores de handshake TLS.

---

## 🔎 Pseudocódigo

```text
load .env
clientId = ENV.KAFKA_CLIENT_ID
brokers  = [ENV.KAFKA_BROKER] // o lista separada por coma
kafka = new Kafka({ clientId, brokers })
export kafka
```