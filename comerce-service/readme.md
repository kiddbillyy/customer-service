# 🛒 Commerce Service - Mimbral

El **Commerce Service** es un microservicio encargado de la **gestión de entidades comerciales como compañías, tiendas, canales de venta, cuentas, localizaciones y reglas de negocio (geofences, holidays, etc.)**. Forma parte del ecosistema de microservicios de Mimbral y está diseñado para centralizar la administración de información comercial y logística.

---

## 🚀 Tecnologías Utilizadas

- **Node.js**: Entorno de ejecución para JavaScript.
- **Express**: Framework para construir APIs REST.
- **Microsoft SQL Server (MSSQL)**: Motor de base de datos.
- **Docker**: Contenerización y despliegue de servicios.
- **API Gateway**: Punto de entrada centralizado para ruteo de solicitudes.
- **Kafka**: Encargado de Enviar Topic de los datos relevantes para que consuman otros microservicios

---

## 📌 Endpoints Principales

### Company

- **POST /company/Crear** → Crear Comañia.
- **GET /company/{id}** → Obtener Compañia por ID.
- **GET /company** → Obtener Lista de Compañias.
- **PUT /company/{id}** → Editar Compañia por ID.

###  Store

- **POST /store/Crear** →  Crear Store.
- **GET /store/{id}** → Obtener Store por ID.
- **GET /store** → Obtener Lista de Store.
- **PUT /store/{id}** → Editar Store por ID.

### Sales Channel

- **POST /sales-channel/Crear** → Crear Canal de Venta.
- **GET /sales-channel/Listar** → Obtener Lista de Canales de Venta.
- **GET /sales-channel/{id}** → Obtener Canales de Venta por ID.
- **PUT /sales-channel/{id}** → Editar Canales de Venta por ID.
- **POST /sales-channel/massive** → Crear Canales de Venta Masivo.

### Account

- **POST /account/Crear** → Crear una nueva Cuenta.
- **GET /account/{id}** → Obtener Cuenta por ID.
- **GET /account/Listar** → Obtener Lista de Cuentas.
- **PUT /account/{id}** → Editar cuenta por ID.
- **POST /account/massive** → Crear Cuentas de Forma Masiva.
- **GET /account/features/{id}** → Obtener Configuración de Features.

### Location

- **GET /locations** → Obtener Lista de Locaciones.
- **GET /locations/{id}** → Obtener Locaciones por ID.
- **POST /locations** → Crear Locaciones.
- **PUT /locations/{id}** → Editar Locaciones por ID.
- **PATCH /locations/{id}** → Editar Locaciones por ID.

### Geofence

- **POST /geofences** → Crear Geofence.
- **PUT /geofences/{id}** → Editar Geofence.
- **GET /geofences** → Obtener lista de Geofence.

### Holiday

- **POST /holidays** → Crear Feriados.
- **PUT /holidays/{id}** → Actualizar Feriados.
- **GET /holidays/{id}** → Obtener Feriados por ID.
- **GET /holidays** → Obtener Lista de Feriados.
- **DELETE /holidays/{id}** → Eliminar Feriados.

### LocationGeo

- **GET /location-geo/by-location/{id}** → Obtener Geofence de una Locación por ID.
- **GET /location-geo/by-geofenc** → Obtener Locaciones de una Geofence.
- **GET /location-geo** → Obtener Lista de Geofence.
- **POST /location-geo** → Crear LocationGeo.
- **DELETE /location-geo/{id}** → Eliminar LocationGeo por ID.
- **DELETE /location-geo?locationId=&geofenceId=** → Eliminar LocationGeo por Par.

## ⚙️ Configuración

### Variables de Entorno (`.env`)

| Variable         | Descripción                            | Ejemplo                       |
|------------------|----------------------------------------|-------------------------------|
| `PORT`           | Puerto donde corre el servicio         | `5009`                        |
| `DB_HOST`        | Host base de datos                     | `localhost`                   |
| `DB_USER`        | Usuario de la base de datos            | `user_db`                     |
| `DB_PASSWORD`    | Contraseña de la base de datos         | `******`                      |
| `DB_NAME`        | Nombre de la base de datos             | `COMMERCE_SERVICE`            |
| `DB_PORT`        | Puerto de la base de datos (MSSQL)     | `1433`                        |
| `KAFKA_BROKER`   | Dirección del broker de Kafka          | `kafka:9092`                  |
| `KAFKA_CLIENT_ID`| Identificador del cliente Kafka        | `comerce-service`             |
| `JWT_SECRET`              | Secreto para firmar tokens JWT| `********`                    |
| `KAFKA_TOPIC_COMPANY`     | TOPIC                         | `commerce.company.events`     |
| `KAFKA_TOPIC_SALESCHANNEL`| TOPIC                         | `commerce.saleschannel.events`|
| `KAFKA_TOPIC_HOLIDAY`     | TOPIC                         | `commerce.holiday.events`     |
| `KAFKA_TOPIC_GEOFENCE`    | TOPIC                         | `commerce.geofence.events`    |


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
  orders-service_kafka_network:
    external: true

services:
  comerce-service:
    build: .
    container_name: comerce-service
    restart: always
    ports:
      - "5009:5009"
    extra_hosts:
      - "host.docker.internal:host-gateway"
      - "win-hp03dio6fsk:192.168.0.165"
    dns:
      - 127.0.0.11
      - 8.8.8.8         
      - 1.1.1.1 
    environment:
      PORT: 5009
      DB_HOST: host.docker.internal
      DB_USER: DEV
      DB_PASSWORD: 1234
      DB_NAME: COMERCE_SERVICE_DB
      DB_PORT: 1433
      EMAIL_USER: noreply1@cmimbral.cl
      EMAIL_PASS: nOre_!234
      EMAIL_HOST: mail.cmimbral.cl
      EMAIL_PORT: 465
      EMAIL_SECURE: true
      JWT_SECRET: mysupersecretkey
      KAFKA_BROKER: kafka:9092
      KAFKA_CLIENT_ID: comerce-service
      VTEX_APP_KEY: ${VTEX_APP_KEY}
      VTEX_APP_TOKEN: ${VTEX_APP_TOKEN}
      VTEX_ACCOUNT: ${VTEX_ACCOUNT}
      VTEX_ENVIRONMENT: ${VTEX_ENVIRONMENT}
      SAP_BASE_URL: ${SAP_BASE_URL}
      SAP_COMPANY_DB: ${SAP_COMPANY_DB}
      SAP_USERNAME: ${SAP_USERNAME}
      SAP_PASSWORD: ${SAP_PASSWORD}
    networks:
      - orders-service_kafka_network


```
## Flujo de Company

## Flujo de Store

## Flujo de Sales Channel

## Flujo de Account

## Flujo de Location

## Flujo de Geofence

## Flujo de Holiday

## Flujo de LocationGeo


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
  "LegalName": "MOmbralSDS ",
  "BusinessName": "MimbralMTS",
  "Tax": "76.123.456-7",
  "Email": "contacto@acme.cl",
  "PhoneNumber": "+56 2 2345 6789",
  "DocumentType": "RUT",
  "DocumentNumber": "7612469",
  "WebsiteUrl": "https://www.acme.cl",
  "Industry": "Manufactura",
  "Status": 1,
  "UserCreated": 5
}
```

**URL base**: `https://catalogomimbral.loclx.io/api/comerce-service/company/Crear`

---

### Obtener compañía por ID
**GET** `/company/{id}`

**URL base**: `https://catalogomimbral.loclx.io/api/comerce-service/company/1`

---

### Listar compañías
**GET** `/company`

**URL base**: `https://catalogomimbral.loclx.io/api/comerce-service/company`

---

### Editar compañía
**PUT** `/company/{id}`

**Body**
```json
{
  "LegalName": "Comercial Yoni Ltda.",
  "BusinessName": "Yoni Corp",
  "Tax": "19%",
  "Email": "ventas@yonicorp.cl",
  "PhoneNumber": "+56 9 1234 5678",
  "DocumentType": "RUT",
  "DocumentNumber": "12.345.678-9",
  "Status": 1,
  "Industry": "Tecnología",
  "UserModified": 5
}
```

**URL base**: `https://catalogomimbral.loclx.io/api/comerce-service/company/1`

---

## 🏬 Store

### Crear store
**POST** `/store/Crear`

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

**URL base**: `https://catalogomimbral.loclx.io/api/comerce-service/store/Crear`

---

### Obtener store por ID
**GET** `/store/{id}`

**URL base**: `https://catalogomimbral.loclx.io/api/comerce-service/store/6`

---

### Listar stores (filtros)
**GET** `/store?search={texto}&status={1|0}`

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

**URL base**: `https://catalogomimbral.loclx.io/api/comerce-service/sales-channel/Crear`

---

### Listar sales channels (filtros)
**GET** `/sales-channel/Listar?search=&companyId=&isActive=1&externalDelivery=`

**URL base**: `https://catalogomimbral.loclx.io/api/comerce-service/sales-channel/Listar?search=&companyId=&isActive=1&externalDelivery=`

---

### Obtener sales channel por ID
**GET** `/sales-channel/{id}`

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

**URL base**: `https://catalogomimbral.loclx.io/api/comerce-service/sales-channel/massive`

---

## 🧾 Account

### Crear account
**POST** `/account/Crear`

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

**URL base**: `https://catalogomimbral.loclx.io/api/comerce-service/account/Crear`

---

### Obtener account por ID
**GET** `/account/{id}`

**URL base**: `https://catalogomimbral.loclx.io/api/comerce-service/account/2`

---

### Listar accounts (filtros/paginación)
**GET** `/account/Listar?page=1&pagesize=10&name=&platform=&ecommerceName=&salesChannelName=&status=1`

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

**URL base**: `https://catalogomimbral.loclx.io/api/comerce-service/account/massive`

---

### Obtener configuración (features) por ID
**GET** `/account/features/{id}`

**URL base**: `https://catalogomimbral.loclx.io/api/comerce-service/account/features/3`

---

## 📍 Location
> **Nota:** En la colección, las rutas de Location están sirviendo en `localhost:5009`.

### Listar locations
**GET** `/locations`

**URL base**: `https://catalogomimbral.loclx.io/api/comerce-service/locations`

---

### Obtener location por ID
**GET** `/locations/{id}`

**URL base**: `https://catalogomimbral.loclx.io/api/comerce-service/locations/1`

---

### Crear location
**POST** `/locations`

**Body** *(defínelo según tu modelo; no hay ejemplo de creación en la colección)*

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

**URL base**: `https://catalogomimbral.loclx.io/api/comerce-service/locations/1`

---

## 🗺️ Geofence
> **Nota:** también en `localhost:5009`.

### Insertar geofence
**POST** `/geofences`

**Body** *(no hay ejemplo en la colección)*

**URL base**: `https://catalogomimbral.loclx.io/api/comerce-service/geofences`

---

### Actualizar geofence
**PUT** `/geofences/{id}`

**Body** *(no hay ejemplo en la colección)*

**URL base**: `https://catalogomimbral.loclx.io/api/comerce-service/geofences/3`

---

### Listar geofences
**GET** `/geofences`

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

**URL base**: `https://catalogomimbral.loclx.io/api/comerce-service/holidays/1`

---

### Obtener holiday por ID
**GET** `/holidays/{id}`

**URL base**: `https://catalogomimbral.loclx.io/api/comerce-service/holidays/{{id}}`

---

### Listar holidays (filtros)
**GET** `/holidays?active=active&dateFrom=2025-01-01&dateTo=2025-12-31&q=Año&page=1&pageSize=50`

**URL base**: `https://catalogomimbral.loclx.io/api/comerce-service/holidays?active=active&dateFrom=2025-01-01&dateTo=2025-12-31&q=Año&page=1&pageSize=50`

---

### Eliminar holiday
**DELETE** `/holidays/{id}`

**URL base**: `https://catalogomimbral.loclx.io/api/comerce-service/holidays/1`

---

## 🧩 LocationGeo (enlace Location ↔ Geofence)
> **Nota:** también en `localhost:5009`.

### Obtener geofence(s) de una location
**GET** `/location-geo/by-location/{locationId}?includeCoverage=true&active=true`

**URL base**: `https://catalogomimbral.loclx.io/api/comerce-service/location-geo/by-location/1?includeCoverage=true&active=true`

---

### Obtener locations de una geofence
**GET** `/location-geo/by-geofence/{geofenceId}?active=true`

**URL base**: `https://catalogomimbral.loclx.io/api/comerce-service/location-geo/by-geofence/3?active=true`

---

### Listar enlaces (filtros/paginación)
**GET** `/location-geo?locationId=1&geofenceId=3&page=1&pageSize=50`

**URL base**: `https://catalogomimbral.loclx.io/api/comerce-service/location-geo?locationId=1&geofenceId=3&page=1&pageSize=50`

---

### Crear enlace LocationGeo
**POST** `/location-geo`

**Body**
```json
{ "locationId": 1, "geofenceId": 3 }
```

**URL base**: `https://catalogomimbral.loclx.io/api/comerce-service/location-geo`

---

### Eliminar enlace por ID
**DELETE** `/location-geo/{id}`

**URL base**: `https://catalogomimbral.loclx.io/api/comerce-service/location-geo/2`

---

### Eliminar enlace por par (query)
**DELETE** `/location-geo?locationId=1&geofenceId=3`

**URL base**: `https://catalogomimbral.loclx.io/api/comerce-service/location-geo?locationId=1&geofenceId=3`

