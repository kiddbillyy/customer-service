### Worker VTEX Sync — `src/workers/vtexSync.js`

Este archivo es el **worker principal** que arranca el **Consumer de Kafka** (`CustomerOkConsumer`) encargado de escuchar y procesar mensajes de integración de órdenes provenientes de **VTEX**.

---

## 🌐 Explicación no técnica

Imagina que el **OMS-VTEX** es un centro logístico que recibe cajas (mensajes) desde Kafka.  
El **worker** es el **operador** que enciende la cinta transportadora:  
- 🔑 Carga las credenciales desde `.env`.  
- ▶️ Inicia el **consumer** (`CustomerOkConsumer`).  
- 🚨 Si algo falla al arrancar, **apaga el sistema** con un error controlado.  

En palabras simples: **este archivo asegura que el servicio esté escuchando las órdenes nuevas**.

---

## ⚙️ Explicación técnica

### Flujo
1. Carga variables de entorno con `dotenv`.
2. Importa `startCustomerOkConsumer` desde `utils/kafka/consumers/CustomerOkConsumer.js`.
3. Ejecuta `startCustomerOkConsumer()`.
4. Maneja errores de arranque:
   - 📛 Log de error en consola.
   - 🔴 `process.exit(1)` para detener el worker si no puede conectarse.

---

## 📄 Código relevante

```js
// workers/vtexSync.js
require('dotenv').config();
const { startCustomerOkConsumer } = require('../utils/kafka/consumers/CustomerOkConsumer');

startCustomerOkConsumer().catch((e) => {
  console.error('Fallo al iniciar consumer:', e);
  process.exit(1);
});