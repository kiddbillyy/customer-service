#  OMS-VTEX - Mimbral

El **OMS-VTEX** es un microservicio encargado de registrar y sincronizar pedidos provenientes de la plataforma VTEX hacia el Order Management System (OMS) de Mimbral.

---



## Flujo base entre vtex-oms y el resto de microservicios

<p align="center">
  <img src="DIAGRAMA.png" alt="Diagrama ER" width="600">
</p>

---

## Diagrama de base de datos:
<p align= "center">
  <img src= "DiagramaER" alt="Diagrama ER" width="600">
</p>

---

# Proceso de Integración de Pedidos con VTEX

El flujo de integración de pedidos funciona de la siguiente manera:

1. **Recepción del Pedido**
   - Un **webhook** en VTEX recibe pedidos cuando el pedido se encuentra en estado `ready-for-handling`.
   - Al momento de recibir el pedido, este se **crea en la base de datos de `vtex-oms`**.

2. **Integración con OMS-SERVICE**
   - Utilizando el **endpoint de `oms-service`**, el pedido se **integra en el microservicio principal**, que centraliza pedidos de diferentes canales.
   - Cuando el pedido se inserta en la base de datos de `OMS-SERVICE`, se **retorna la ID correspondiente** a la orden y esta se registra en la base de datos de `vtex-service`.

3. **Consumo de Eventos de Kafka**
   - Se crea un **consumidor de eventos de Kafka** que recibe un evento para actualizar el estado de la orden en VTEX.
   - Este evento, enviado desde el **microservicio de finanzas**, es el responsable de notificar el cambio de estado del pedido.

4. **Control de Estado de Integración**
   - El microservicio **controla el estado de integración hacia `oms-service`**, ofreciendo visibilidad completa del estado de las integraciones.
   - Después de obtener el nuevo estado, se **registra en la base de datos** y, en base a este estado, se utiliza la **API de VTEX** para cambiar el estado de la orden.

### Ejemplos de Endpoints Utilizados

```
# Iniciar el manejo de la orden
POST /api/oms/pvt/orders/{orderId}/start-handling

# Generar la factura de la orden
POST /api/oms/pvt/orders/{orderId}/invoice

```


## 🚀 Tecnologías Utilizadas

- **Node.js**: Entorno de ejecución para JavaScript.
- **Express**: Framework para construir APIs REST.
- **Microsoft SQL Server (MSSQL)**: Motor de base de datos.
- **Docker**: Contenerización y despliegue de servicios.
- **API Gateway**: Punto de entrada centralizado para ruteo de solicitudes.
- **Kafka**: Encargado de Enviar Topic de los datos relevantes para que consuman otros microservicios y consumir topic       de otro MS.

---
## 📌 Endpoints Principales

### WEBHOOKS

- **POST /vtex/vtex-hook

## ⚙️ Configuración

### Variables de Entorno (`.env`)

### Variables de Entorno (`.env`)

| Variable               | Descripción                                               | Ejemplo                                          |
|-------------------------|-----------------------------------------------------------|--------------------------------------------------|
| `PORT`                 | Puerto donde corre el servicio                            | `5011`                                           |
| `DB_HOST`              | Host de la base de datos (MSSQL)                          | `host.docker.internal`                           |
| `DB_USER`              | Usuario de la base de datos                               | `DEV`                                            |
| `DB_PASSWORD`          | Contraseña de la base de datos                            | `1234`                                           |
| `DB_NAME`              | Nombre de la base de datos                                | `OMS_VTEX_DB`                                    |
| `DB_PORT`              | Puerto de conexión a la base de datos (MSSQL)             | `1433`                                           |
| `KAFKA_BROKER`         | Dirección del broker de Kafka                             | `kafka:9092`                                     |
| `KAFKA_CLIENT_ID`      | Identificador del cliente Kafka                           | `oms-service`                                    |
| `KAFKA_GROUP_ORDERS`   | Identificador del consumer group para órdenes             | `oms-vtex-sync`                                  |
| `KAFKA_TOPIC_ORDER_STATUS` | Tópico Kafka de integración de órdenes desde VTEX     | `vtex.order.integration`                         |
| `OMS_POST_URL`         | URL del endpoint del OMS para registrar pedidos           | `https://catalogomimbral.loclx.io/api/oms-service/orders` |
| `VTEX_APP_KEY`         | AppKey de integración con la API de VTEX                  | `vtexappkey-mimbralb2c-FNMFHC`                   |
| `VTEX_APP_TOKEN`       | AppToken de integración con la API de VTEX                | `PZUKZKOCOTTZDFWXRGD...`                         |
| `VTEX_ACCOUNT`         | Cuenta de VTEX asociada                                   | `mimbralb2c`                                     |
| `VTEX_ENVIRONMENT`     | Entorno de VTEX                                           | `vtexcommercestable`                             |



## Ejecución con Docker

### Dockerfile

```dockerfile
FROM node:18
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 5009
CMD ["npm", "start"]
```

### docker-compose.yml

```yaml
version: '3.8'

networks:
  kafka_network:
    external: true

services:
  oms-service:
    build: .
    container_name: oms-vtex
    restart: always
    ports:
      - "5011:5011"
    extra_hosts:
      - "host.docker.internal:host-gateway"
      - "win-hp03dio6fsk:192.168.0.165"
    dns:
      - 127.0.0.11
      - 8.8.8.8         
      - 1.1.1.1 
    environment:
      PORT: 5011
      DB_HOST: host.docker.internal
      DB_USER: DEV
      DB_PASSWORD: 1234
      DB_NAME: OMS_VTEX_DB
      DB_PORT: 1433
      KAFKA_BROKER: kafka:9092
      KAFKA_CLIENT_ID: oms-service
      KAFKA_GROUP_ORDERS: oms-vtex-sync
      KAFKA_TOPIC_ORDER_STATUS: vtex.order.integration
      VTEX_APP_KEY: ${VTEX_APP_KEY}
      VTEX_APP_TOKEN: ${VTEX_APP_TOKEN}
      VTEX_ACCOUNT: ${VTEX_ACCOUNT}
      VTEX_ENVIRONMENT: ${VTEX_ENVIRONMENT}

    networks:
      - kafka_network

```

## 📦 Estructura del Proyecto

```
commerce-service/
│
├── .env                  # Variables de entorno
├── Dockerfile            # Configuración de imagen Docker
├── docker-compose.yml    # Orquestación con Docker
├── package.json          # Dependencias y scripts
├── server.js             # Punto de entrada principal
│
├── src/
│   ├── config/           # Configuración DB, Kafka, etc.
│   ├── controllers/      # Controladores de endpoints
│   ├── models/           # Modelos y consultas a la BD
│   ├── routes/           # Definición de rutas
│   ├── services/         # Lógica de negocio y helpers
│   └── utils/            # Funciones auxiliares
│
└── README.md
```
## Consideraciones

- **Seguridad**: Todas las operaciones necesitan del ID-SERVICE para poder operar con **JWT**, este es validado en el middleware **auth** en *API Gateway** y los permisos en el middleware de **RBAC**. 
- **Kafka**: Este microservicio disponibiliza **Topic** para que los consuman otros MS.
- **Integración**: Funciona en conjunto con API Gateway y otros microservicios para el control centralizado de acceso. Todos los servicios requieren del token para realizar acciones.

# Endpoints Detallados (-Service)


> **Notas generales**
>
> - Base URL (prod/dev según entorno): `https://catalogomimbral.loclx.io` o `http://localhost:8080`.
> - Subfijo MS Comerce-service: `/api/comerce-service`
> - Autenticación: **Bearer Token** (`Authorization: Bearer <token>`)
> - Todas las rutas requieren encabezado `x-plataforma-id: <id>`.
> - Las respuestas de ejemplo son referenciales.

**Headers**
- `Authorization: Bearer <token>`
- `x-plataforma-id: 1`
