# Servicio VTEX — `src/services/vtexService.js`

Este módulo implementa un **servicio de integración con VTEX** que permite obtener información de un pedido específico a partir de su `orderId`.  

Se utiliza en el flujo de OMS para **consultar los datos completos de la orden en VTEX** antes de procesarla e integrarla con otros microservicios.

---

## Explicación no técnica

Imagina que necesitas **pedirle a VTEX la ficha completa de un pedido**:  
- 📌 Tú le das el número de orden (`orderId`).  
- 📡 El servicio se conecta a la API de VTEX usando una llave (`AppKey`) y un token (`AppToken`).  
- 📑 VTEX responde con toda la información de la orden (cliente, productos, precios, etc.).  
- 🔄 Esa información se devuelve para que el OMS la procese.  

---

## ⚙️ Explicación técnica

### Función exportada
```ts
fetchVtexOrder(orderId: string): Promise<any>
```

### Detalles de funcionamiento
1. Construye la URL de la API de VTEX usando el `orderId`.  
2. Llama a **`axios.get`** con headers de autenticación (`X-VTEX-API-AppKey`, `X-VTEX-API-AppToken`).  
3. Configura un **timeout de 10 segundos**.  
4. Devuelve la respuesta (`data`) con la información de la orden.  

---

## 🚀 Ejemplo de uso

```js
const { fetchVtexOrder } = require('./services/vtexService');

(async () => {
  const orderId = '1561909550561-01';
  const order = await fetchVtexOrder(orderId);
  console.log(order);
})();
```

📋 **Resultado esperado**:  
Un objeto con toda la información de la orden desde VTEX (cliente, ítems, totales, direcciones, etc.).

---

## 📊 Flujo simplificado

```mermaid
flowchart TD
    Subgraph VTEX
    API[VTEX Orders API]
    end

    App[OMS-VTEX Service] -->|orderId| API
    API -->|JSON con detalles| App
```

---

## ✅ Buenas prácticas

| Área            | Recomendación                                                                 |
|-----------------|-------------------------------------------------------------------------------|
| **Seguridad**   | Nunca exponer `AppKey` y `AppToken` en el código → deben venir de `.env`.     |
| **Errores**     | Manejar `try/catch` para timeouts, credenciales inválidas o pedido no existe. |
| **Timeouts**    | Ajustar el `timeout` según la latencia esperada de la API de VTEX.            |
| **Logs**        | Loguear solo el `orderId` consultado, nunca los tokens.                       |

---

## 🛑 Errores frecuentes

- ❌ **401 Unauthorized** → Revisar `VTEX_APP_KEY` y `VTEX_APP_TOKEN`.  
- ❌ **404 Not Found** → El `orderId` no existe en VTEX.  
- ⏳ **ECONNABORTED** → Timeout superado, revisar conexión o aumentar el límite.  
- ⚠️ **AxiosError** → Validar la estructura del `orderId` y la URL de la API.  

---

## 🔧 Variables de entorno

Ejemplo en `.env`:

```env
VTEX_APP_KEY=tu_app_key
VTEX_APP_TOKEN=tu_app_token
```

---

## 📂 Relación con otros módulos

- Se utiliza en **OMS-VTEX** para consultar detalles de pedidos antes de insertarlos en la base de datos.  
- Forma parte de la integración inicial de órdenes que luego son procesadas por **OMS-SERVICE**, **CUSTOMER-SERVICE** y **FINANZAS**.  

---

## 🔎 Pseudocódigo

```text
fetchVtexOrder(orderId):
  url = "https://<account>.vtexcommercestable.com.br/api/checkout/pub/orders/" + orderId
  respuesta = axios.get(url, headers: { AppKey, AppToken }, timeout=10000)
  return respuesta.data
```