### 📮 Productor Kafka — `src/producer/index.js`

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

### Firma de la función
```ts
sendMessage(
  topic: string,
  message: object,
  options?: {
    key?: string | number,
    headers?: Record<string, string | Buffer>
  }
): Promise<void>
```  

### hola
