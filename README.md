 1) 📄 PEDIDO RECIBIDO
    - Origen del pedido:
        - Retail Pro (bajo demanda, con número de folio).
        - SAP (carga automática cada 10 minutos).
    - Estado inicial: Pedido Recibido (estado = 1).

# 2) 🙋 ASIGNACIÓN A PICKERS
    - Un usuario con rol ASIGNER revisa qué pedidos necesitan ser surtidos y asigna productos a los pickers.
    - Condiciones para asignar:
        1. El pedido existe y está en Pedido Recibido.
        2. El pedido tiene productos disponibles sin asignar.
        3. Existen pickers en estado activo.
        4. El producto aún no está asignado a otro picker.
    - Resultado:
        1. Se cambia a un estado de “Asignación de Picking”.
        2. Queda listo para que el picker comience la búsqueda.

3) 🏷️ PROCESO DE PICKING
    - El picker ve qué productos le asignaron y procede a localizarlos:

        1. Ver productos y buscar stock
            - El picker localiza físicamente los productos requeridos.

        2. Asignar a bultos

            - El picker decide cómo agrupar productos en bultos o contenedores.
            - Registra cantidades efectivamente encontradas.

        3. Reportar faltantes

            - Si encuentra todo, marca Picking Completo.
            - Si no encuentra uno o varios productos (o encuentra menos de la cantidad requerida), marca Picking        Incompleto.
            - El picker NO decide si se hace backorder o cancelación; solo reporta la situación en el sistema.

***Estados resultantes:***
- Picking Completo (si todo se encontró).
- Picking Incompleto (si hubo faltantes).


4) 🔎 AUDITORÍA
***En este paso entra el rol Auditor, quien revisa los pedidos en Picking Completo o Picking Incompleto:***

1. Revisión de productos y cantidades

    - El auditor verifica que lo reportado por el picker coincida con el pedido original.
    - Revisa bultos, documentación, cantidades, posibles errores.

2. ¿Hay faltantes?

    - No faltan productos -> Pasa directo a Empaque/Despacho.
    - Sí faltan productos -> El auditor decide qué hacer:

        1. 📆 Reabastecer / Backorder
            - Dejar la línea en un estado “Pendiente de Reabastecer”.
            - Se podría esperar a nuevo stock o coordinar con compras para un surtido posterior.
        2. 📦 Envío Parcial
            - Se hace el embarque con lo disponible.
            - La parte faltante se cancela o se pasa a backorder (dependiendo de la política).
        3. ❌ Cancelación Parcial o Total
            - Si el cliente no quiere espera o no hay más stock programado, se cancela esa parte o incluso todo el pedido.
            - El auditor actualiza las cantidades canceladas en el sistema, dejando constancia del motivo.

***Estados resultantes:***
- Pedido Aprobado para Empaque (todo surtido o se asume parcial confirmado).
- Pedido Pendiente de Reabastecer (si el auditor elige esperar stock).
- Pedido Cancelado Parcial/Total (si el auditor decide no surtir).

5) 📦 EMPAQUE
    - Se procede a embalar los productos según las directrices del auditor y la naturaleza del pedido.
    - Si había faltantes pero el auditor aprobó “envío parcial”, se empacan solo los productos disponibles.

***Resultado: El pedido queda listo para despacho.***

6) 🚚 DESPACHO / ENVÍO
    - Se genera la guía de transporte o el documento de salida.
    - Se hace el embarque físico de la mercancía.

7) ✅ CIERRE DE PEDIDO
    - Tras el envío (o la decisión de cancelación parcial/total), el pedido pasa a Cerrado.
    - Se registran las cantidades definitivas enviadas y/o canceladas.

***El sistema puede:***
- Notificar al cliente.
- Actualizar el estado en SAP o en Retail Pro (si hay integración de feedback).
- Estado final: Pedido Cerrado / Completado.


***FLUJO***

1. 📄 PEDIDO RECIBIDO
      |
      v
2. 🙋 ASIGNACIÓN A PICKERS
      |
      v
3. 🏷️ PROCESO DE PICKING
      |
      |--- (a) El picker busca productos
      |--- (b) Si encuentra todo -> "Picking Completo"
      |--- (c) Si faltan productos -> "Picking Incompleto"
      |
      v
4. 🔎 AUDITORÍA
      |--- (a) Verifica cantidades y faltantes
      |--- (b) Si todo coincide -> pasa a Empaque
      |--- (c) Si hay faltantes -> 
      |       El auditor decide:
      |         1) ♻ Reabastecer / Backorder
      |         2) 📦 Envío Parcial
      |         3) ❌ Cancelación Parcial/Total
      |
      v
5. 📦 EMPAQUE
      |
      v
6. 🚚 DESPACHO / ENVÍO
      |
      v
7. ✅ CIERRE DE PEDIDO

---

# 📦 **Flujo de Pedido - Paso a Paso**

---

## 1️⃣ 📄 PEDIDO RECIBIDO

* **Origen del pedido**:

  * `Retail Pro`: bajo demanda, con número de folio.
  * `SAP`: carga automática cada 10 minutos.

* **Estado inicial**: `Pedido Recibido` (estado = 1)

---

## 2️⃣ 🙋 ASIGNACIÓN A PICKERS

* Un usuario con rol **ASIGNER** revisa qué pedidos necesitan surtido y asigna productos a pickers.

### ✅ Condiciones para asignar:

1. El pedido existe y está en **Pedido Recibido**.
2. El pedido tiene productos disponibles sin asignar.
3. Existen pickers en estado **activo**.
4. El producto aún no está asignado a otro picker.

### 🔄 Resultado:

* Estado cambia a: **Asignación de Picking**
* Listo para que el picker inicie la búsqueda.

---

## 3️⃣ 🏷️ PROCESO DE PICKING

El picker ve sus productos asignados y comienza a localizarlos:

### 🔍 1. Ver productos y buscar stock

* Localiza físicamente los productos requeridos.

### 📦 2. Asignar a bultos

* Agrupa productos en bultos o contenedores.
* Registra las cantidades efectivamente encontradas.

### 🚨 3. Reportar faltantes

* Si encuentra todo → marca **Picking Completo**.
* Si hay faltantes → marca **Picking Incompleto**.
* El picker *no* decide sobre backorder o cancelación.

#### 🔚 Estados resultantes:

* `✅ Picking Completo`
* `⚠️ Picking Incompleto`

---

## 4️⃣ 🔎 AUDITORÍA

Rol: **Auditor** — revisa los pedidos con Picking Completo o Incompleto.

### ✔ Revisión:

* Verifica productos, cantidades, bultos y documentación.

### ❓¿Hay faltantes?

* **No faltan productos** → pasa a Empaque.
* **Sí faltan productos** → el auditor decide:

#### Opciones:

1. 📆 **Reabastecer / Backorder**

   * Línea pasa a estado `Pendiente de Reabastecer`.
2. 📦 **Envío Parcial**

   * Se despacha lo disponible, lo faltante puede ir a backorder o cancelarse.
3. ❌ **Cancelación Parcial o Total**

   * Si el cliente no espera o no habrá stock, se cancela total o parcialmente.

#### 🔚 Estados resultantes:

* `📦 Pedido Aprobado para Empaque`
* `📆 Pedido Pendiente de Reabastecer`
* `❌ Pedido Cancelado Parcial/Total`

---

## 5️⃣ 📦 EMPAQUE

* Se embalan los productos aprobados por el auditor.
* Si hay envío parcial, solo se empaca lo disponible.

### 🎯 Resultado:

* Pedido **listo para despacho**.

---

## 6️⃣ 🚚 DESPACHO / ENVÍO

* Se genera la guía de transporte o documento de salida.
* Se realiza el embarque físico de la mercancía.

---

## 7️⃣ ✅ CIERRE DE PEDIDO

* Una vez enviado o cancelado, el pedido se marca como **Cerrado**.
* Se registran cantidades enviadas y/o canceladas.

### 🔔 El sistema puede:

* Notificar al cliente.
* Actualizar estado en SAP o Retail Pro.

### 🔚 Estado final: `Pedido Cerrado / Completado`

---

## 🔁 FLUJO RESUMIDO

```
1. 📄 PEDIDO RECIBIDO
      ↓
2. 🙋 ASIGNACIÓN A PICKERS
      ↓
3. 🏷️ PROCESO DE PICKING
      ├─ a) Picker busca productos
      ├─ b) Todo encontrado → "Picking Completo"
      └─ c) Faltantes → "Picking Incompleto"
      ↓
4. 🔎 AUDITORÍA
      ├─ a) Verificación
      └─ b) Si hay faltantes → Decisión del auditor:
            1) ♻ Backorder
            2) 📦 Envío Parcial
            3) ❌ Cancelación
      ↓
5. 📦 EMPAQUE
      ↓
6. 🚚 DESPACHO / ENVÍO
      ↓
7. ✅ CIERRE DE PEDIDO
```

---

¿Te gustaría que convierta esto en un archivo descargable (PDF o Markdown)?
