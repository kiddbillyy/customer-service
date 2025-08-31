# 📄 PEDIDO RECIBIDO
*Origen del pedido:*
Retail Pro (bajo demanda, con número de folio).
SAP (carga automática cada 10 minutos).
Estado inicial: Pedido Recibido (estado = 1).
2) 🙋 ASIGNACIÓN A PICKERS
- Un usuario con rol ASIGNER revisa qué pedidos necesitan ser surtidos y asigna productos a los pickers.
- Condiciones para asignar:
    1. El pedido existe y está en Pedido Recibido.
    2. El pedido tiene productos disponibles sin asignar.
    3. Existen pickers en estado activo.
    4. El producto aún no está asignado a otro picker.
- Resultado:
    1. Se cambia a un estado de “Asignación de Picking”.
    2. Queda listo para que el picker comience la búsqueda.
🏷️ PROCESO DE PICKING
El picker ve qué productos le asignaron y procede a localizarlos:

Ver productos y buscar stock

El picker localiza físicamente los productos requeridos.
Asignar a bultos

El picker decide cómo agrupar productos en bultos o contenedores.
Registra cantidades efectivamente encontradas.
Reportar faltantes

Si encuentra todo, marca Picking Completo.
Si no encuentra uno o varios productos (o encuentra menos de la cantidad requerida), marca Picking Incompleto.
El picker NO decide si se hace backorder o cancelación; solo reporta la situación en el sistema.
Estados resultantes:

Picking Completo (si todo se encontró).
Picking Incompleto (si hubo faltantes).
🔎 AUDITORÍA En este paso entra el rol Auditor, quien revisa los pedidos en Picking Completo o Picking Incompleto:
Revisión de productos y cantidades

El auditor verifica que lo reportado por el picker coincida con el pedido original.
Revisa bultos, documentación, cantidades, posibles errores.
¿Hay faltantes?

No faltan productos -> Pasa directo a Empaque/Despacho.

Sí faltan productos -> El auditor decide qué hacer:

📆 Reabastecer / Backorder
Dejar la línea en un estado “Pendiente de Reabastecer”.
Se podría esperar a nuevo stock o coordinar con compras para un surtido posterior.
📦 Envío Parcial
Se hace el embarque con lo disponible.
La parte faltante se cancela o se pasa a backorder (dependiendo de la política).
❌ Cancelación Parcial o Total
Si el cliente no quiere espera o no hay más stock programado, se cancela esa parte o incluso todo el pedido.
El auditor actualiza las cantidades canceladas en el sistema, dejando constancia del motivo.
Estados resultantes:

Pedido Aprobado para Empaque (todo surtido o se asume parcial confirmado).
Pedido Pendiente de Reabastecer (si el auditor elige esperar stock).
Pedido Cancelado Parcial/Total (si el auditor decide no surtir).
📦 EMPAQUE
Se procede a embalar los productos según las directrices del auditor y la naturaleza del pedido.
Si había faltantes pero el auditor aprobó “envío parcial”, se empacan solo los productos disponibles.
Resultado: El pedido queda listo para despacho.

🚚 DESPACHO / ENVÍO

Se genera la guía de transporte o el documento de salida.
Se hace el embarque físico de la mercancía.
✅ CIERRE DE PEDIDO

Tras el envío (o la decisión de cancelación parcial/total), el pedido pasa a Cerrado.
Se registran las cantidades definitivas enviadas y/o canceladas.
El sistema puede:

Notificar al cliente.
Actualizar el estado en SAP o en Retail Pro (si hay integración de feedback).
Estado final: Pedido Cerrado / Completado.
FLUJO

📄 PEDIDO RECIBIDO | v
🙋 ASIGNACIÓN A PICKERS | v
🏷️ PROCESO DE PICKING | |--- (a) El picker busca productos |--- (b) Si encuentra todo -> "Picking Completo" |--- (c) Si faltan productos -> "Picking Incompleto" | v
🔎 AUDITORÍA |--- (a) Verifica cantidades y faltantes |--- (b) Si todo coincide -> pasa a Empaque |--- (c) Si hay faltantes -> | El auditor decide: | 1) ♻ Reabastecer / Backorder | 2) 📦 Envío Parcial | 3) ❌ Cancelación Parcial/Total | v
📦 EMPAQUE | v
🚚 DESPACHO / ENVÍO | v
✅ CIERRE DE PEDIDO
