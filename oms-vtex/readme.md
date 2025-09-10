#  OMS-VTEX - Mimbral

El **OMS-VTEX** es un microservicio encargado de registrar y sincronizar pedidos provenientes de la plataforma VTEX hacia el Order Management System (OMS) de Mimbral.

---

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

## Diagrama de base de datos:
<p align= "center">
  <img src= "" alt="Diagrama ER" width="600">
</p>

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

# Endpoints Detallados (Comerce-Service)


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

## 🏢 Company

### Crear compañía
**POST** `/company/Crear`

**Body**
```json
{
  "LegalName": "Mimbral ",
  "BusinessName": "Mimbral",
  "Tax": "19%",
  "Email": "example@mimbral.cl",
  "PhoneNumber": "+56911111111",
  "DocumentType": "RUT",
  "DocumentNumber": "11111111-1",
  "WebsiteUrl": "https://www.mimbral.cl",
  "Industry": "Ferreteria",
  "Status": 1,
  "UserCreated": 5
}
```
**201 CREATED**
```json
{
    "ok": true,
    "data": {
    }
}
```
**400 BAD REQUEST**

```json
{
    "ok": false,
    "message": "El LegalName ya está registrado."
}
```
```json
{
    "ok": false,
    "message": "El DocumentNumber ya está registrado."
}
```
**URL base**: `https://catalogomimbral.loclx.io/api/comerce-service/company/Crear`

---

### Obtener compañía por ID
**GET** `/company/{id}`

**200 OK**
```json
{
    "ok": true,
    "data": {
        "Id": 1,
        "ReferenceId": "MIM-001",
        "LegalName": "Mimbral.",
        "BusinessName": "Mimbral",
        "Tax": "19%",
        "Email": "example@mimbral.cl",
        "PhoneNumber": "+56 9 11111111",
        "DocumentType": "RUT",
        "DocumentNumber": "11.111.111-1",
        "Status": true,
        "Industry": "Ferretería",
        "CreatedAt": "2025-08-13T21:55:43.203Z",
        "UserCreated": "5",
        "UpdatedAt": "2025-08-14T14:06:02.197Z",
        "UserModified": "5"
    }
}
```
**404 NOT FOUND**
```json
{
    "ok": false,
    "message": "Compañía no encontrada"
}
```

**URL base**: `https://catalogomimbral.loclx.io/api/comerce-service/company/1`

---

### Listar compañías
**GET** `/company`

**Parametros de busqueda**
> NULL

**200 OK**
```json
{
    "ok": true,
    "count": 10,
    "data": [
        {
            "Id": 1,
            "ReferenceId": "ACME-001",
            "LegalName": "Mimbral Ltda.",
            "BusinessName": "Mimbral",
            "Tax": "19%",
            "Email": "mimbral@mimbral.cl",
            "PhoneNumber": "+56 9 1234 5678",
            "DocumentType": "RUT",
            "DocumentNumber": "12.345.678-9",
            "Status": true,
            "Industry": "Tecnología",
            "CreatedAt": "2025-08-13T21:55:43.203Z",
            "UserCreated": "5",
            "UpdatedAt": "2025-08-14T14:06:02.197Z",
            "UserModified": "5"
        },
        {
            "Id": 17,
            "ReferenceId": "MIM-001",
            "LegalName": "Mimbral ",
            "BusinessName": "Mimbral",
            "Tax": "19%",
            "Email": "mimbral@mimbral.cl",
            "PhoneNumber": "+56 9 1234 5678",
            "DocumentType": "RUT",
            "DocumentNumber": "761234569",
            "Status": true,
            "Industry": "Tecnología",
            "CreatedAt": "2025-08-14T10:04:16.760Z",
            "UserCreated": "5",
            "UpdatedAt": "2025-08-14T12:24:23.353Z",
            "UserModified": "5"
        }
    ]
}
```
**URL base**: `https://catalogomimbral.loclx.io/api/comerce-service/company`

---

### Editar compañía

**PUT** `/company/{id}`

**Body**
```json
{
  "LegalName": "Mimbral Ltda.",
  "BusinessName": "Mimbral",
  "Tax": "19%",
  "Email": "mimbral@mimbral.cl",
  "PhoneNumber": "+56 9 1234 5678",
  "DocumentType": "RUT",
  "DocumentNumber": "11.111.111-1",
  "Status": 0,
  "Industry": "Tecnología",
  "UserModified": 5
}
```
**Consideraciones**
> Solo se actualiza los campos pasados en el body

**URL base**: `https://catalogomimbral.loclx.io/api/comerce-service/company/1`

---

## 🏬 Store

### Crear store
**POST** `/store/Crear`

***Consideraciones**
>Name, Email, Status, UserCreated son obligatorios

**Body**
```json
{
  "CompanyId": 19,
  "Name": "Sucursal Chorrillo",
  "Email": "Chorrillo@mimbral.cl",
  "PhoneNumber": "+56911111111",
  "Status": 1,
  "UserCreated": 5
}
```

**409 CONFLICT**
```json
{
    "ok": false,
    "code": "UNIQUE_NAME",
    "message": "Ya existe una tienda con ese Nombre."
}
```
**201 CREATED**
```json
{
    "ok": true,
    "data": {
    }
}

```

**URL base**: `https://catalogomimbral.loclx.io/api/comerce-service/store/Crear`

---

### Obtener store por ID
**GET** `/store/{id}`

**200 OK**

```json
{
    "ok": true,
    "data": {
        "Id": 10,
        "CompanyId": 19,
        "Name": "Sucursal Chorrillo",
        "Email": "Chorrillo@mimbral.cl",
        "PhoneNumber": "+56911111111",
        "Status": true,
        "CreatedAt": "2025-08-14T17:00:38.237Z",
        "UpdatedAt": null,
        "UserCreated": "5",
        "UserModified": null,
        "CompanyName": "MimbralSDS "
    }
}
```

**URL base**: `https://catalogomimbral.loclx.io/api/comerce-service/store/6`

---

### Listar stores (filtros)
**GET** `/store`
**Filtros**
>search(Busca por nombre.companyname)
>status(puede ser 1 o 0)

```json
{
    "ok": true,
    "page": 1,
    "pageSize": 10,
    "total": 3,
    "data": [
        {
            "Id": 10,
            "CompanyId": 19,
            "CompanyName": "Mimbral ",
            "Name": "Sucursal Chorrillo",
            "Email": "Chorrillo@mimbral.cl",
            "PhoneNumber": "+56911111111",
            "Status": true,
            "CreatedAt": "2025-08-14T17:00:38.237Z",
            "UpdatedAt": null,
            "UserCreated": "5",
            "UserModified": null
        },
        {
            "Id": 6,
            "CompanyId": 1,
            "CompanyName": "Mimbral",
            "Name": "Sucursal Balmaceda",
            "Email": "balmaceda@mimbral.cl",
            "PhoneNumber": "+56911111111",
            "Status": true,
            "CreatedAt": "2025-08-14T14:40:03.853Z",
            "UpdatedAt": "2025-08-14T17:29:10.247Z",
            "UserCreated": "5",
            "UserModified": "5"
        }
    ]
}
```

**URL base**: `https://catalogomimbral.loclx.io/api/comerce-service/store?search=Mimbral&status=1`

---

### Actualizar store
**PUT** `/store/{id}`

**Body**
```json
{
  "Name": "Sucursal Balmaceda",
  "Email": "balmaceda@mimbral.cl",
  "PhoneNumber": "+56911111111",
  "Status": 1,
  "UserModified": 5
}
```

**200 OK**

```json
{
    "ok": true,
    "message": "La tienda ha sido actualizada correctamente"
}
```

**URL base**: `https://catalogomimbral.loclx.io/api/comerce-service/store/6`

---

## 🛒 Sales Channel

### Crear sales channel
**POST** `/sales-channel/Crear`

**Body**
```json
{
  "CompanyId": 1,
  "Name": "Vtex",
  "ExternalDelivery": 1,
  "IsActive": 1,
  "UserCreated": 5
}
```
**201 CREATED**
```json
{
    "ok": true,
    "data": {
    }
}
```
**400 BAD REQUEST**
```json
{
    "ok": false,
    "code": "FK_VIOLATION",
    "message": "CompanyId no existe o viola la restricción de la base de datos."
}
```

**409 CONFLICT**
```json
{
    "ok": false,
    "code": "UNIQUE_NAME",
    "message": "Ya existe un canal de venta registrado con este nombre para la compañía."
}
```

**URL base**: `https://catalogomimbral.loclx.io/api/comerce-service/sales-channel/Crear`

---

### Listar sales channels (filtros)
**GET** `/sales-channel/Listar?search=&companyId=&isActive=1&externalDelivery=`

**Filtros**
>search(Busca por nombre companyname, name)
>companyId
>isActive(1 o 0)
>externalDelivery(1 o 0)

```json
{
    "ok": true,
    "page": 1,
    "pageSize": 10,
    "total": 21,
    "data": [
        {
            "Id": 33,
            "CompanyId": 1,
            "CompanyName": "MIMBRAL",
            "ReferenceId": "MIM-001",
            "Name": "MIMBRAL",
            "ExternalDelivery": true,
            "IsActive": true,
            "CreatedAt": "2025-08-21T15:17:27.637Z",
            "UpdatedAt": null,
            "UserCreated": "80",
            "UserModified": null
        },
        {
            "Id": 29,
            "CompanyId": 1,
            "CompanyName": "MIMBRAL.",
            "ReferenceId": "MIM-002",
            "Name": "MIMBRAL S",
            "ExternalDelivery": true,
            "IsActive": true,
            "CreatedAt": "2025-08-21T15:15:04.217Z",
            "UpdatedAt": null,
            "UserCreated": "5",
            "UserModified": null
        }
    ]
}
```
**URL base**: `https://catalogomimbral.loclx.io/api/comerce-service/sales-channel/Listar?search=&companyId=&isActive=1&externalDelivery=`

---

### Obtener sales channel por ID
**GET** `/sales-channel/{id}`

**200 OK**
```json
{
    "ok": true,
    "data": {
        "Id": 2,
        "CompanyId": 1,
        "CompanyName": "Mimbral",
        "ReferenceId": "MAR-001",
        "Name": "Falabella",
        "ExternalDelivery": false,
        "IsActive": true,
        "CreatedAt": "2025-08-14T18:27:22.130Z",
        "UpdatedAt": "2025-08-18T11:22:24.470Z",
        "UserCreated": "5",
        "UserModified": "5"
    }
}
```
**URL base**: `https://catalogomimbral.loclx.io/api/comerce-service/sales-channel/5`

---

### Actualizar sales channel
**PUT** `/sales-channel/{id}`

**Body**
```json
{
  "Name": "Vtex",
  "ExternalDelivery": 1,
  "IsActive": 1,
  "UserModified": 5
}
```

**200 OK**
```json
{
    "ok": true,
    "message": "El canal de venta ha sido actualizado correctamente."
}
```
**404 NOT FOUND**
```json
{
    "ok": false,
    "message": "Sales Channel no encontrado"
}
```
**409 CONFLICT**
```json
{
    "ok": false,
    "code": "UNIQUE_NAME",
    "message": "Ya existe un canal de venta registrado con este nombre para la compañía."
}
```

**URL base**: `https://catalogomimbral.loclx.io/api/comerce-service/sales-channel/5`

---

### Creación masiva de sales channels
**POST** `/sales-channel/massive`

**Body**
```json
{
  "items": [
    { "CompanyId": 1, "Name": "Falabella", "ExternalDelivery": 1, "IsActive": 1, "UserCreated": 5 },
    { "CompanyId": 1, "Name": "Marketplace B2B", "ExternalDelivery": 0, "IsActive": 1, "UserCreated": 5 },
    { "CompanyId": 1, "Name": "Tienda Online", "ExternalDelivery": 0, "IsActive": 1, "UserCreated": 5 },
    { "CompanyId": 1, "Name": "Canal Desconocido", "ExternalDelivery": 0, "IsActive": 1, "UserCreated": 5 }
  ]
}
```
**201 CREATED**
```json
{
    "ok": true,
    "message": "1 canales de venta creados correctamente.",
    "summary": {
        "total": 1,
        "inserted": 1,
        "failed": 0
    },
    "data": [
        {
            "Id": 38,
            "CompanyId": 1,
            "ReferenceId": "PRU-016",
            "Name": "Prueba",
            "ExternalDelivery": true,
            "IsActive": true,
            "CreatedAt": "2025-08-21T15:38:43.613Z",
            "UpdatedAt": null,
            "UserCreated": "5",
            "UserModified": null
        }
    ]
}
```
**400 BAD REQUEST**
```json
{
    "ok": false,
    "message": "Ningún canal de venta fue creado.",
    "summary": {
        "total": 4,
        "inserted": 0,
        "failed": 4
    },
    "errors": [
        {
            "index": 0,
            "CompanyId": 1,
            "Name": "Falabella",
            "code": "UNIQUE_NAME",
            "number": 2601,
            "message": "Ya existe un canal de venta registrado con este nombre para la compañía."
        },
        {
            "index": 1,
            "CompanyId": 1,
            "Name": "Marketplace B2B",
            "code": "UNIQUE_NAME",
            "number": 2601,
            "message": "Ya existe un canal de venta registrado con este nombre para la compañía."
        },
        {
            "index": 2,
            "CompanyId": 1,
            "Name": "Tienda Online",
            "code": "UNIQUE_NAME",
            "number": 2601,
            "message": "Ya existe un canal de venta registrado con este nombre para la compañía."
        },
        {
            "index": 3,
            "CompanyId": 1,
            "Name": "Canal Desconocido",
            "code": "UNIQUE_NAME",
            "number": 2601,
            "message": "Ya existe un canal de venta registrado con este nombre para la compañía."
        }
    ]
}
```
Esto pasa porque los 4 canales ya han sido creados y no se pueden repetir, en el caso que en la carga masiva 1 canal ya exista y se estan insertando 10 canales, se insertan todos excepto el que no cumple con la condición, informando el error

**URL base**: `https://catalogomimbral.loclx.io/api/comerce-service/sales-channel/massive`

---

## 🧾 Account

### Crear account
**POST** `/account/Crear`

**Consideraciones**
>SalesChannelId, Name, Platform son obligatorios

**Body**
```json
{
  "SalesChannelId": 5,
  "Name": "VTEX Chile Oficial",
  "Platform": "VTEX",
  "EcommerceName": "vtexcl",
  "Features": { "smartcheckout": true, "inventorySync": "push" },
  "Status": 1,
  "UserCreated": 5
}
```

**201 CREATED**
```json
{
    "ok": true,
    "message": "Cuenta creada exitosamente",
    "data": {
    }
}
```

**400 bad request**
```json
{
    "ok": false,
    "message": "Name es obligatorio"
}
```
```json
{
    "ok": false,
    "message": "Platform es obligatorio"
}
```

```json
{
    "ok": false,
    "message": "SalesChannelId es obligatorio"
}
```

**URL base**: `https://catalogomimbral.loclx.io/api/comerce-service/account/Crear`

---

### Obtener account por ID
**GET** `/account/{id}`


**200 OK**

```json
{
    "ok": true,
    "data": {
        "Id": 2,
        "SalesChannelId": 5,
        "SalesChannelName": "Vtex",
        "ReferenceId": "VTE-001",
        "Name": "Cuenta Oficial Chile",
        "Platform": "vtex",
        "EcommerceName": "tienda-chile",
        "Features": "{\"multiWarehouseeeee\":false}",
        "Status": true,
        "DateCreated": "2025-08-18T17:34:58.827Z",
        "DateModified": "2025-08-18T18:05:40.773Z",
        "UserCreated": 5,
        "UserModified": 5
    }
}
```

**404 NOT FOUND**
```json
{
    "ok": false,
    "message": "Account no encontrada"
}
```
**URL base**: `https://catalogomimbral.loclx.io/api/comerce-service/account/2`

---

### Listar accounts (filtros/paginación)
**GET** `/account/Listar?page=1&pagesize=10&name=&platform=&ecommerceName=&salesChannelName=&status=1`

**Filtros**
>*page*, *pagesize*, *name*, *platform*, *ecommerceName*, *salesChannelName*, *status*

```json
{
    "ok": true,
    "page": 1,
    "pageSize": 10,
    "total": 6,
    "data": [
        {
            "Id": 11,
            "SalesChannelId": 5,
            "SalesChannelName": "Vtex",
            "ReferenceId": "VTE-006",
            "Name": "VTEX Chile Ofi",
            "Platform": "VTEX",
            "EcommerceName": "vtexcAl",
            "Features": "{\"smartcheckout\":true,\"inventorySync\":\"push\"}",
            "Status": true,
            "DateCreated": "2025-08-21T15:56:07.010Z",
            "DateModified": null,
            "UserCreated": 5,
            "UserModified": null
        },
        {
            "Id": 10,
            "SalesChannelId": 5,
            "SalesChannelName": "Vtex",
            "ReferenceId": "VTE-005",
            "Name": "VTEX Chile Ofi",
            "Platform": "VTEX",
            "EcommerceName": "vtexcAl",
            "Features": "{\"smartcheckout\":true,\"inventorySync\":\"push\"}",
            "Status": true,
            "DateCreated": "2025-08-21T15:55:58.533Z",
            "DateModified": null,
            "UserCreated": 5,
            "UserModified": null
        }
    ]
}
```

**URL base**: `https://catalogomimbral.loclx.io/api/comerce-service/account/Listar?page=1&pagesize=10&name=&platform=&ecommerceName=&salesChannelName=&status=1`

---

### Actualizar account
**PUT** `/account/{id}`

**Body**
```json
{
  "Name": "Cuenta Oficial Chile",
  "Platform": "vtex",
  "EcommerceName": "tienda-chile",
  "Features": { "multiWarehouseeeee": false },
  "Status": 1,
  "UserModified": 5
}
```

**200 OK**
```json
{
    "ok": true,
    "message": "Account actualizada correctamente",
    "data": {
        "Id": 2,
        "SalesChannelId": 5,
        "ReferenceId": "VTE-001",
        "Name": "Cuenta Oficial Chile",
        "Platform": "vtex",
        "EcommerceName": "tienda-chile",
        "Features": "{\"multiWarehouseeeee\":false}",
        "Status": true,
        "DateCreated": "2025-08-18T17:34:58.827Z",
        "DateModified": "2025-08-21T16:06:13.990Z",
        "UserCreated": 5,
        "UserModified": 5
    }
}
```
**404 NOT FOUND**
```json
{
    "ok": false,
    "message": "Account no encontrada"
}
```
**URL base**: `https://catalogomimbral.loclx.io/api/comerce-service/account/2`

---

### Creación masiva de accounts
**POST** `/account/massive`

**Body**
```json
{
  "items": [
    {
      "SalesChannelId": 2,
      "Name": "VTEX CHILE OFICIAL",
      "Platform": "VTEX",
      "EcommerceName": "vtex-cl",
      "Features": { "smartcheckout": true, "inventorySync": "push" },
      "Status": 1,
      "UserCreated": 5
    },
    {
      "SalesChannelId": 2,
      "Name": "VTEX CHILE SECUNDARIA",
      "Platform": "VTEX",
      "EcommerceName": "vtex-cl-2",
      "Status": 1,
      "UserCreated": 5
    }
  ]
}
```

**201 Created**
```json
{
    "ok": true,
    "message": "2 accounts creados correctamente.",
    "summary": {
        "total": 2,
        "inserted": 2,
        "failed": 0
    },
    "data": [
        {
            "Id": 12,
            "SalesChannelId": 2,
            "ReferenceId": "VTE-007",
            "Name": "VTEX CHILE OFICIAL",
            "Platform": "VTEX",
            "EcommerceName": "vtex-cl",
            "Features": "{\"smartcheckout\":true,\"inventorySync\":\"push\"}",
            "Status": true,
            "DateCreated": "2025-08-21T16:07:52.373Z",
            "DateModified": null,
            "UserCreated": 5,
            "UserModified": null
        },
        {
            "Id": 13,
            "SalesChannelId": 2,
            "ReferenceId": "VTE-008",
            "Name": "VTEX CHILE SECUNDARIA",
            "Platform": "VTEX",
            "EcommerceName": "vtex-cl-2",
            "Features": null,
            "Status": true,
            "DateCreated": "2025-08-21T16:07:52.377Z",
            "DateModified": null,
            "UserCreated": 5,
            "UserModified": null
        }
    ]
}
```

**URL base**: `https://catalogomimbral.loclx.io/api/comerce-service/account/massive`

---

### Obtener configuración (features) por ID
**GET** `/account/features/{id}`

**200 OK**

```json
{
    "ok": true,
    "data": {
        "features": {
            "smartcheckout": true,
            "inventorySync": "push"
        },
        "isJson": true
    }
}
```

**404 NOT FOUND**

```json
{
    "ok": false,
    "message": "Account no encontrada"
}
```

**URL base**: `https://catalogomimbral.loclx.io/api/comerce-service/account/features/3`

---

## 📍 Location


### Listar locations
**GET** `/locations`

**200 OK**
```json
{
    "total": 0,
    "items": []
}
```

**URL base**: `https://catalogomimbral.loclx.io/api/comerce-service/locations`

---

### Obtener location por ID
**GET** `/locations/{id}`

**200 OK**
```json
{
    "items": []
}
```
**404 NOT FOUND**
```json
{
    "message": "Location no encontrada."
}
```
**URL base**: `https://catalogomimbral.loclx.io/api/comerce-service/locations/1`

---

### Crear location
**POST** `/locations`

**Body**
```json 
{
  "storeId": 6,
  "name": "Sucursal San Javier Centro",
  "country": "Chile",
  "stateProvince": "Maule",
  "city": "San Javier",
  "addressLine1": "Av. Chorrillos 2137",
  "postalCode": "3660000",
  "status": "active",
  "user": "1"
}
```

**201 CREATED**
```json 
{
    "id": "1",
    "message": "Location creada exitosamente."
}
```
**404 NOT FOUND**
```json 
{
    "message": "STORE_NOT_FOUND"
}
```
**URL base**: `https://catalogomimbral.loclx.io/api/comerce-service/locations`

---

### Actualizar location (PUT)
**PUT** `/locations/{id}`

**Body**
```json
{
  "storeId": 1,
  "name": "Sucursal San Javier Centro (Remodelada)",
  "country": "Chile",
  "stateProvince": "Maule",
  "city": "San Javier",
  "addressLine1": "Av. Balmaceda 456",
  "addressLine2": "Local 12 - Segundo piso",
  "postalCode": "3660000",
  "status": "active",
  "user": "1"
}
```

**200 OK**
```json
{
    "id": "1",
    "message": "Location actualizada."
}
```

**URL base**: `https://catalogomimbral.loclx.io/api/comerce-service/locations/1`

---

### Actualizar location (PATCH)
**PATCH** `/locations/{id}`

**Body**
```json
{
  "storeId": 1,
  "name": "Sucursal San Javier Centro (Remodelada)",
  "stateProvince": "Maule",
  "city": "San Javier",
  "addressLine1": "Av. Balmaceda 456",
  "addressLine2": "Local 12 - Segundo piso",
  "postalCode": "3660000",
  "status": "active",
  "user": "1"
}
```
**200 OK**
```json
{
    "id": "1",
    "changed": true,
    "message": "Location actualizada."
}
```

**URL base**: `https://catalogomimbral.loclx.io/api/comerce-service/locations/1`

---

## 🗺️ Geofence

### Insertar geofence
**POST** `/geofences`

**Body** 
```json
{  
  "name":"San javier",
  "status": "active",
  "description": "Geocerca poligonal de San Javier, Región del Maule, Chile (aproximación urbana)",
  "user": "1",
  "coverage": [
    [
      [
        [-71.773000, -35.582000],
        [-71.742500, -35.568500],
        [-71.715000, -35.585000],
        [-71.705000, -35.604000],
        [-71.715000, -35.622000],
        [-71.740000, -35.634000],
        [-71.765000, -35.627000],
        [-71.780000, -35.607000],
        [-71.773000, -35.582000]
      ]
    ]
  ]
}
```

**201 CREATED**
```json
{
    "id": "1",
    "message": "Geofence creada exitosamente."
}
```
**500 INTERNAL SERVER ERROR**
```json
{
    "message": "Could not find stored procedure 'dbo.Geofence_Upsert_FromCoverage'."
}
```

**URL base**: `https://catalogomimbral.loclx.io/api/comerce-service/geofences`

---

### Actualizar geofence
**PUT** `/geofences/{id}`

**Body**

```json
{  
  "name": "San javier",
  "status": "active",
  "description": "Geocerca poligonal de San Javier, Región del Maule, Chile ",
  "user": "5",
  "coverage": [
    [
      [
        [-71.773000, -35.582000],
        [-71.742500, -35.568500],
        [-71.715000, -35.585000],
        [-71.705000, -35.604000],
        [-71.715000, -35.622000],
        [-71.740000, -35.634000],
        [-71.765000, -35.627000],
        [-71.780000, -35.607000],
        [-71.773000, -35.582000]
      ]
    ]
  ]
}
```
**200 OK**
```json
{
    "id": "1",
    "message": "Geofence actualizada."
}
```
**404**
```json
{
    "message": "GEOFENCE_NOT_FOUND"
}
```
**URL base**: `https://catalogomimbral.loclx.io/api/comerce-service/geofences/3`

---

### Listar geofences
**GET** `/geofences`

**200 OK**
```json
[
    {
        "id": "2",
        "name": "San javier",
        "status": "active",
        "dateCreated": "2025-08-21T20:35:36.153Z",
        "userCreated": "1",
        "dateModified": "2025-08-21T20:35:36.153Z",
        "userModified": "1",
        "description": "Geocerca poligonal de San Javier, Región del Maule, Chile (aproximación urbana)",
        "coverage": [
            [
                [
                    [
                        -71.74,
                        -35.634
                    ],
                    [
                        -71.715,
                        -35.622
                    ],
                    [
                        -71.705,
                        -35.604
                    ],
                    [
                        -71.715,
                        -35.585
                    ],
                    [
                        -71.7425,
                        -35.5685
                    ],
                    [
                        -71.773,
                        -35.582
                    ],
                    [
                        -71.78,
                        -35.607
                    ],
                    [
                        -71.765,
                        -35.627
                    ],
                    [
                        -71.74,
                        -35.634
                    ]
                ]
            ]
        ]
    },
    {
        "id": "1",
        "name": "San javier",
        "status": "active",
        "dateCreated": "2025-08-21T20:35:26.573Z",
        "userCreated": "1",
        "dateModified": "2025-08-21T20:37:44.670Z",
        "userModified": "5",
        "description": "Geocerca poligonal de San Javier, Región del Maule, Chile ",
        "coverage": [
            [
                [
                    [
                        -71.74,
                        -35.634
                    ],
                    [
                        -71.715,
                        -35.622
                    ],
                    [
                        -71.705,
                        -35.604
                    ],
                    [
                        -71.715,
                        -35.585
                    ],
                    [
                        -71.7425,
                        -35.5685
                    ],
                    [
                        -71.773,
                        -35.582
                    ],
                    [
                        -71.78,
                        -35.607
                    ],
                    [
                        -71.765,
                        -35.627
                    ],
                    [
                        -71.74,
                        -35.634
                    ]
                ]
            ]
        ]
    }
]
```

**URL base**: `https://catalogomimbral.loclx.io/api/comerce-service/geofences`

---

## 🎌 Holiday
> **Nota:** también en `localhost:5009`.

### Crear holiday
**POST** `/holidays`

**Body**
```json
{
  "name": "Año Nuevo",
  "day": "2025-01-01",
  "status": "active",
  "target": { "delivery": true },
  "scope": {
    "carrierIds": ["d555345345345aa67a342a00"],
    "carrierReferenceIds": ["carr-001"]
  },
  "description": "Feriado nacional - sin entregas",
  "user": "JCS01"
}
```
**201 CREATED**
```json
{
    "id": "1",
    "message": "Holiday creada."
}
```

**URL base**: `https://catalogomimbral.loclx.io/api/comerce-service/holidays`

---

### Actualizar holiday
**PUT** `/holidays/{id}`

**Body**
```json
{
  "name": "Año Nuevo (ajuste)",
  "day": "2025-01-01",
  "status": "inactive",
  "target": { "delivery": false },
  "scope": { "carrierIds": [], "carrierReferenceIds": [] },
  "description": "Reabre entregas",
  "user": "JCS01"
}
```
**200 OK**
```json
{
    "id": "1",
    "message": "Holiday actualizada."
}
```
**500**
```json
{
    "message": "Erro interno"
}
```

**URL base**: `https://catalogomimbral.loclx.io/api/comerce-service/holidays/1`

---

### Obtener holiday por ID
**GET** `/holidays/{id}`

**200 OK**
```json
{
    "id": "1",
    "name": "Año Nuevo (ajuste)",
    "day": "2025-01-01",
    "status": "inactive",
    "target": {
        "delivery": true
    },
    "scope": {
        "carrierIds": [
            6
        ],
        "carrierReferenceIds": [
            6
        ]
    },
    "description": "Reabre entregas",
    "dateCreated": "2025-08-21T20:39:45.000Z",
    "dateModified": "2025-08-21T21:04:28.000Z",
    "userCreated": "JCS01",
    "userModified": "5"
}
```

**404 NOT FOUND**
```json
{
    "message": "Holiday no encontrada."
}
```
**URL base**: `https://catalogomimbral.loclx.io/api/comerce-service/holidays/{{id}}`

---

### Listar holidays (filtros)
**GET** `/holidays?active=active&dateFrom=2025-01-01&dateTo=2025-12-31&q=Año&page=1&pageSize=50`
**FILTROS**
>active=active
>dateFrom, dateTo
>q
>page
>pagesize

**200 OK**

```json
{
    "total": 4,
    "items": [
        {
            "id": "7",
            "name": "Año Nuevo",
            "day": "2025-01-01",
            "status": "active",
            "target": {
                "delivery": true
            },
            "scope": {
                "carrierIds": [
                    "d555345345345aa67a342a00"
                ],
                "carrierReferenceIds": [
                    "carr-001"
                ]
            },
            "description": "Feriado nacional - sin entregas",
            "dateCreated": "2025-08-19T20:13:21.000Z",
            "dateModified": null,
            "userCreated": "JCS01",
            "userModified": null
        },
        {
            "id": "6",
            "name": "Año Nuevo",
            "day": "2025-01-01",
            "status": "active",
            "target": {
                "delivery": true
            },
            "scope": {
                "carrierIds": [
                    "d555345345345aa67a342a00"
                ],
                "carrierReferenceIds": [
                    "carr-001"
                ]
            },
            "description": "Feriado nacional - sin entregas",
            "dateCreated": "2025-08-19T20:06:00.000Z",
            "dateModified": null,
            "userCreated": "JCS01",
            "userModified": null
        },
        {
            "id": "5",
            "name": "Año Nuevo",
            "day": "2025-01-01",
            "status": "active",
            "target": {
                "delivery": true
            },
            "scope": {
                "carrierIds": [
                    "d555345345345aa67a342a00"
                ],
                "carrierReferenceIds": [
                    "carr-001"
                ]
            },
            "description": "Feriado nacional - sin entregas",
            "dateCreated": "2025-08-19T19:56:53.000Z",
            "dateModified": null,
            "userCreated": "JCS01",
            "userModified": null
        },
        {
            "id": "4",
            "name": "Año Nuevo",
            "day": "2025-01-01",
            "status": "active",
            "target": {
                "delivery": true
            },
            "scope": {
                "carrierIds": [
                    "d555345345345aa67a342a00"
                ],
                "carrierReferenceIds": [
                    "carr-001"
                ]
            },
            "description": "Feriado nacional - sin entregas",
            "dateCreated": "2025-08-19T19:56:42.000Z",
            "dateModified": null,
            "userCreated": "JCS01",
            "userModified": null
        }
    ]
}
```

**URL base**: `https://catalogomimbral.loclx.io/api/comerce-service/holidays?active=active&dateFrom=2025-01-01&dateTo=2025-12-31&q=Año&page=1&pageSize=50`

---

### Eliminar holiday
**DELETE** `/holidays/{id}`

**URL base**: `https://catalogomimbral.loclx.io/api/comerce-service/holidays/1`

**200 OK**
```json
{
    "id": "7",
    "message": "Holiday eliminada."
}
```
**404 NOT_FOUND**
```json
{
    "message": "HOLIDAY_NOT_FOUND"
}
```
---

## 🧩 LocationGeo (enlace Location ↔ Geofence)
> **Nota:** también en `localhost:5009`.

### Obtener geofence(s) de una location
**GET** `/location-geo/by-location/{locationId}?includeCoverage=true&active=true`

**URL base**: `https://catalogomimbral.loclx.io/api/comerce-service/location-geo/by-location/1?includeCoverage=true&active=true`

**200 OK**
```json
{
    "total": 1,
    "items": [
        {
            "id": "3",
            "name": "San javier",
            "description": "Geocerca poligonal de San Javier, Región del Maule, Chile ",
            "status": "active",
            "dateCreated": "2025-08-14T12:56:46.370Z",
            "dateModified": "2025-08-21T20:53:24.167Z",
            "userCreated": "api",
            "userModified": "2",
            "coverage": [
                [
                    [
                        [
                            -71.74,
                            -35.634
                        ],
                        [
                            -71.715,
                            -35.622
                        ],
                        [
                            -71.705,
                            -35.604
                        ],
                        [
                            -71.715,
                            -35.585
                        ],
                        [
                            -71.7425,
                            -35.5685
                        ],
                        [
                            -71.773,
                            -35.582
                        ],
                        [
                            -71.78,
                            -35.607
                        ],
                        [
                            -71.765,
                            -35.627
                        ],
                        [
                            -71.74,
                            -35.634
                        ]
                    ]
                ]
            ]
        }
    ]
}
```

---



### Obtener locations de una geofence
**GET** `/location-geo/by-geofence/{geofenceId}?active=true`

**URL base**: `https://catalogomimbral.loclx.io/api/comerce-service/location-geo/by-geofence/3?active=true`

**200 OK**
```json
{
    "total": 1,
    "items": [
        {
            "id": "1",
            "storeId": 1,
            "name": "Sucursal San Javier Centro (Remodelada)",
            "country": "Argentina",
            "stateProvince": "Maule",
            "city": "San Javier",
            "addressLine1": "Av. Balmaceda 456",
            "addressLine2": "Local 12 - Segundo piso",
            "postalCode": "3660000",
            "status": "active",
            "dateCreated": "2025-08-14T21:37:56.187Z",
            "dateModified": "2025-08-19T19:12:10.557Z",
            "userCreated": "1",
            "userModified": "1"
        }
    ]
}
```

---

### Listar enlaces (filtros/paginación)
**GET** `/location-geo?locationId=1&geofenceId=3&page=1&pageSize=50`

**URL base**: `https://catalogomimbral.loclx.io/api/comerce-service/location-geo?locationId=1&geofenceId=3&page=1&pageSize=50`

**200 OK**

```json
{
    "total": 1,
    "items": [
        {
            "id": "3",
            "locationId": 1,
            "geofenceId": 3
        }
    ]
}
```

---

### Crear enlace LocationGeo
**POST** `/location-geo`

**Body**
```json
{ "locationId": 1, "geofenceId": 3 }
```
**200 Response: ya existe**
```json
{
    "id": "3",
    "message": "Vínculo ya existía."
}
```
**201 CREATED**
```json
{
    "id": "1002",
    "message": "Vínculo creado exitosamente."
}
```
**400 BAD REQUEST INVALID**
```json
{
    "message": "INVALID_GEOFENCE_ID"
}
```

**404 Geofence not found**
**body**
```json 
{ "locationId": 1, "geofenceId": 50 }
```
**Response**
```json
{
    "message": "GEOFENCE_NOT_FOUND"
}
```

**404 Location not found**
**body**
```json 
{ "locationId": 100, "geofenceId": 50 }
```
**Response**
```json
{
    "message": "LOCATION_NOT_FOUND"
}
```
**URL base**: `https://catalogomimbral.loclx.io/api/comerce-service/location-geo`

---

### Eliminar enlace por ID
**DELETE** `/location-geo/{id}`

**URL base**: `https://catalogomimbral.loclx.io/api/comerce-service/location-geo/2`

**200 OK**
```json
{
    "id": "3",
    "message": "Vínculo eliminado."
}
```

**404 NOT FOUND**
```json
{
    "message": "LINK_NOT_FOUND"
}
```
---

### Eliminar enlace por par (query)
**DELETE** `/location-geo?locationId=1&geofenceId=3`

**URL base**: `https://catalogomimbral.loclx.io/api/comerce-service/location-geo?locationId=1&geofenceId=3`


**200 OK**
```json
{
    "locationId": 1,
    "geofenceId": 3,
    "message": "Vínculo eliminado."
}
```

**404 NOT FOUND**
```json
{
    "message": "LINK_NOT_FOUND"
}
```

