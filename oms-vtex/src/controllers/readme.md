## Controller VTEX — `src/controllers/vtexController.js`

Este módulo expone el **controlador HTTP** que atiende el **webhook de VTEX**.  
Recibe el `body` del request, delega el procesamiento a `handleVtexIntegration(...)` y responde **200** si todo salió bien o **500** si ocurrió un error.

---

## 🌍 Explicación no técnica

Piensa en este archivo como el **recepcionista**:
1. 📥 **Recibe** el aviso que manda VTEX (webhook).
2. 📤 **Entrega** ese aviso al equipo interno que lo procesa (`handleVtexIntegration`).
3. 🟢 Si todo ok → **responde 200**: “VTEX hook procesado correctamente”.
4. 🔴 Si algo falla → **responde 500** con un mensaje de error y deja un **log**.

---

## ⚙️ Explicación técnica

### Función exportada

```ts
vtexIntegrations(req: Request, res: Response): Promise<Response>
```

### Detalles de funcionamiento
- Llama a `handleVtexIntegration(req.body)` (service externo) dentro de un `try/catch`.
- `return res.status(200).json({ message: 'VTEX hook procesado correctamente' })` en éxito.
- En error:
  - `console.error('Error en vtexIntegrations:', err);`
  - `return res.status(500).json({ error: 'Error interno al procesar VTEX hook' })`.

### Código relevante (resumen):

```js
const { handleVtexIntegration } = require('../services/vtexIntegrationService');

async function vtexIntegrations(req, res) {
  try {
    await handleVtexIntegration(req.body);
    return res.status(200).json({ message: 'VTEX hook procesado correctamente' });
  } catch (err) {
    console.error('Error en vtexIntegrations:', err);
    return res.status(500).json({ error: 'Error interno al procesar VTEX hook' });
  }
}

module.exports = vtexIntegrations;
```

---

## 🚀 Ejemplo de uso (Express)

```js
// src/routes/vtex.routes.js
const express = require('express');
const router = express.Router();
const vtexIntegrations = require('../controllers/vtexController');

// Endpoint que VTEX llamará como webhook:
router.post('/webhooks/vtex', vtexIntegrations);

module.exports = router;
```

```js
// server.js (bootstrap)
const express = require('express');
const app = express();

app.use(express.json());
app.use('/v1', require('./src/routes/vtex.routes'));

app.listen(process.env.PORT || 3000, () => {
  console.log('API escuchando...');
});
```

---

## 🧪 Prueba rápida (curl)

```bash
curl -X POST http://localhost:3000/v1/webhooks/vtex \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "1561909550561-01",
    "state": "start-handling",
    "source": "vtex"
  }'
# → {"message":"VTEX hook procesado correctamente"}
```

---

## 📊 Flujo simplificado

```mermaid
flowchart TD
  VTEX[Webhook VTEX] --> C[vtexIntegrations controller]
  C --> S[handleVtexIntegration (service)]
  S -->|OK| COK[HTTP 200 JSON {message}]
  S -->|Error| CERR[HTTP 500 JSON {error}]
```

---

## ✅ Buenas prácticas

| Área               | Recomendación                                                                 |
|--------------------|-------------------------------------------------------------------------------|
| **Validación**     | Validar `req.body` (schema) antes de llamar al service.                       |
| **Seguridad**      | Verificar firma/secret del webhook si aplica (HMAC).                          |
| **Idempotencia**   | Asegurar que el service sea idempotente (manejo de reintentos desde VTEX).    |
| **Observabilidad** | Loguear `orderId` y `state` (sin datos sensibles) y trazar `trace-id`.        |
| **Errores**        | No revelar detalles internos en la respuesta; usar mensajes genéricos.        |
| **Timeouts**       | Configurar timeouts en el reverse proxy para evitar cuelgues.                 |

---

## 🛑 Errores frecuentes

- **400/422** por body inválido → Falta validación previa del payload.
- **500** por excepciones del service → Aislar con `try/catch` y logs útiles.
- **401/403** si el webhook no está autenticado → Implementar verificación de firma.

---

## 🔎 Pseudocódigo

```text
vtexIntegrations(req, res):
  try:
    handleVtexIntegration(req.body)
    return 200 { message: 'VTEX hook procesado correctamente' }
  catch err:
    log 'Error en vtexIntegrations', err
    return 500 { error: 'Error interno al procesar VTEX hook' }
```