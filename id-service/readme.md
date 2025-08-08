# Microservicio ID-Service

## Descripción General

El **ID-Service** es el microservicio encargado de la **gestión centralizada de identidad, permisos y control de acceso** en el ecosistema de microservicios de Mimbral. Permite administrar usuarios, roles, plataformas, módulos, submódulos y endpoints, asegurando un control robusto basado en autenticación y autorización RBAC.

Este servicio se integra con el **API Gateway** para validar y enrutar las solicitudes según los permisos del usuario autenticado.

---

## Tecnologías Utilizadas

- **Node.js**: Entorno de ejecución para JavaScript.
- **Express**: Framework web minimalista para la construcción de APIs REST.
- **Microsoft SQL Server (MSSQL)**: Base de datos relacional para almacenar usuarios, roles y permisos.
- **JWT**: Autenticación basada en tokens.
- **Bcrypt**: Hashing seguro de contraseñas.
- **LRU Cache**: Cacheo de permisos para mejorar el rendimiento en validaciones RBAC.
- **Docker**: Contenerización para despliegue en entornos aislados.

---

## Endpoints Principales

### 🔑 Autenticación y Sesiones

- **POST /auth/login** → Iniciar sesión.
- **POST /auth/logout** → Cerrar sesión.
- **POST /auth/renovar** → Renovar sesión.
- **POST /auth/recuperar** → Generar OTP de recuperación.
- **POST /auth/cambiar-contrasena** → Cambiar contraseña con OTP.
- **POST /auth/verificar-otp** → Validar OTP.

### 👥 Usuarios

- **POST /usuarios/crear** → Crear usuario.
- **PUT /usuarios/editar/\*\*\*\*\*\*\*\*****:id** → Editar usuario.
- **GET /usuarios** → Listar usuarios.

### 🏢 Departamentos

- **POST /departments/post** → Crear departamento.
- **GET /departments/get** → Listar departamentos.
- **PUT /departments/put/\*\*\*\*\*\*\*\*****:id** → Editar departamento.

### 🖥 Plataformas, Módulos y Endpoints

- **POST /plataformas** → Crear plataforma.
- **GET /plataformas/obtener** → Listar plataformas.
- **PUT /plataformas/editar/\*\*\*\*\*\*\*\*****:id** → Editar plataforma.
- **POST /modulos-plataforma** → Crear módulo.
- **POST /submodulos** → Crear submódulo.
- **POST /endpoint-api** → Registrar endpoint.

### 🛡 Roles y Permisos

- **POST /create-rol** → Crear rol con permisos.
- **PUT /role/\*\*\*\*\*\*\*\*****:id** → Actualizar rol.
- **PATCH /users/****:id****/permissions** → Dar permisos puntuales.
- **POST /asignar-rol** → Asignar rol a usuario.
- **PATCH /users/****:userId****/roles/\*\*\*\*\*\*\*\*****:roleId** → Activar/Desactivar rol.
- **GET /all-roles** → Listar roles.

### 📄 Perfil de Usuario

- **PUT /perfiles/editar/\*\*\*\*\*\*\*\*****:id** → Editar perfil.
- **GET /perfiles/\*\*\*\*\*\*\*\*****:id** → Obtener perfil.
- **PUT /perfiles/subir-imagen/\*\*\*\*\*\*\*\*****:id** → Subir imagen de perfil.

---

## Configuración

### Variables de Entorno (`.env`)

| Variable             | Descripción                                 | Ejemplo                  |
| -------------------- | ------------------------------------------- | ------------------------ |
| `PORT`               | Puerto del servidor                         | `5007`                   |
| `DB_HOST`            | Host de la base de datos                    | `host.docker.internal`   |
| `DB_USER`            | Usuario de la base de datos                 | `sa`                     |
| `DB_PASSWORD`        | Contraseña de la base de datos              | `*****`                  |
| `DB_NAME`            | Nombre de la base de datos                  | `ID_SERVICE_DB`          |
| `DB_PORT`            | Puerto del servidor MSSQL                   | `1433`                   |
| `JWT_SECRET`         | Clave secreta para generación de tokens JWT | `********`               |
| `JWT_EXPIRES_IN`     | Tiempo de expiración del token              | `1h`                     |
| `RBAC_CACHE_TTL_MS`  | Tiempo de vida del cache de permisos (ms)   | `60000`                  |
| `IDSERVICE_INTERNAL` | URL interna para validación de permisos     | `http://id-service:5007` |

---

## Ejecución con Docker

### Dockerfile

```dockerfile
FROM node:18
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 5007
CMD ["npm", "start"]
```

### docker-compose.yml

```yaml
version: '3.8'
services:
  id-service:
    build: .
    container_name: id-service
    restart: always
    ports:
      - "5007:5007"
    environment:
      PORT: 5007
      DB_HOST: host.docker.internal
      DB_USER: DEV
      DB_PASSWORD: 1234
      DB_NAME: ID_SERVICE_DB
      DB_PORT: 1433
      JWT_SECRET: secret
      JWT_EXPIRES_IN: 1h
      RBAC_CACHE_TTL_MS: 60000
      IDSERVICE_INTERNAL: http://id-service:5007
    networks:
      - kafka_network
```

---

## Flujo de Autenticación y Autorización

1. El cliente realiza **login** y obtiene un token JWT.
2. El **API Gateway** valida el token y consulta **ID-Service** para verificar permisos vía RBAC.
3. El microservicio responde según si el usuario tiene permisos para el recurso solicitado.

---

## Estructura del Proyecto

```
id-service/
├── src/
│   ├── controllers/   # Lógica de endpoints
│   ├── middlewares/   # auth, rbac, validaciones
│   ├── models/        # Consultas a BD
│   ├── routes/        # Definición de rutas
│   ├── utils/         # Herramientas y helpers
├── Dockerfile
├── docker-compose.yml
├── package.json
└── README.md
```

---

## Consideraciones

- **Seguridad**: Todas las operaciones sensibles requieren autenticación vía JWT y validación de permisos RBAC.
- **Cacheo**: Los permisos se cachean en memoria con TTL para mejorar el rendimiento.
- **Integración**: Funciona en conjunto con API Gateway y otros microservicios para el control centralizado de acceso.


## Endpoints con Ejemplos

### 🔑 Autenticación y Sesiones

#### POST /auth/login
**Body:**
```json
{
  "correo": "jmolina@mimbral.cl",
  "password": "nuevaContrasena123",
  "plataformaId": 1,
  "forzarSesion": false
}
```
**Respuesta:**
```json
{
  "token": "jwt-token",
  "usuario": { "id": 1, "nombre": "Jonathan" }
}
```

#### POST /auth/logout
**Body:**
```json
{
  "usuarioId": 1,
  "plataformaId": 1
}
```

---

### 👥 Usuarios

#### POST /usuarios/crear
**Body:**
```json
{
  "correo": "jmolina@mimbral.cl",
  "password": "1234M!",
  "activo": true,
  "usuarioCreadorId": 1,
  "nombres": "Jonathan",
  "apellidos": "Molina",
  "rut": "20.230.330-7",
  "departamentoId": 2,
  "telefono": "+56911112222",
  "urlImagenPerfil": "https://miapp.cl/perfiles/nuevo.png",
  "rolId": 3,
  "plataformaIds": [1, 3]
}
```

---

### 🏢 Departamentos

#### POST /departments/post
**Body:**
```json
{
  "nombre": "Prueba 5",
  "descripcion": "Área de Prueba Mantenimiento",
  "contacto": "TI@mimbral.cl",
  "estado": 1,
  "usuarioCreador": 3
}
```

#### GET /departments/get?buscar=
**Respuesta:**
```json
[
  { "id": 1, "nombre": "TI" }
]
```

---

### 🖥 Plataformas y Módulos

#### POST /plataformas
**Body:**
```json
{
  "nombre": "Analisis 360",
  "codigo": "AN001",
  "descripcion": "Plataforma de analisis de datos."
}
```

#### POST /submodulos
**Body:**
```json
{
  "moduloId": 1,
  "nombre": "Nuevo Submódulo de Prueba",
  "codigo": "NUEVO_SUBMOD_PRUEBA",
  "descripcion": "Descripción del submódulo.",
  "ruta": "/nueva/ruta/prueba"
}
```

---

### 🛡 Roles y Permisos

#### POST /create-rol
**Body:**
```json
{
  "nombre": "Gestor de Precios",
  "descripcion": "Rol para administrar precios.",
  "plataformaCod": "MIMBRAL_360",
  "permisos": [
    {
      "subModuloId": 3,
      "accionesId": [1, 3]
    }
  ],
  "usuarioId": 22
}
```

#### PATCH /users/{id}/permissions
**Body:**
```json
{
  "permisos": [
    { "subModuloId": 4, "accionesId": [3, 2] },
    { "subModuloId": 6, "accionesId": [1] }
  ],
  "adminId": 1
}
```

---

## Configuración

Variables de entorno principales:
```
PORT=5007
DB_HOST=host.docker.internal
DB_USER=DEV
DB_PASSWORD=1234
DB_NAME=ID_SERVICE_DB
DB_PORT=1433
JWT_SECRET=secret
JWT_EXPIRES_IN=1h
RBAC_CACHE_TTL_MS=60000
IDSERVICE_INTERNAL=http://id-service:5007
```

---

¿Quieres que añada el resto de endpoints con sus ejemplos completos en la misma estructura?



---

# Endpoints Detallados (ID-Service)

> **Notas generales**
>
> - Base URL (prod/dev según entorno): `https://catalogomimbral.loclx.io/api/idservice` o `http://localhost:8080/api/idservice`.
> - Autenticación: **Bearer Token** (`Authorization: Bearer <token>`), salvo `/auth/login`, `/auth/recuperar`, `/auth/verificar-otp`, `/auth/cambiar-contrasena`.
> - Algunas rutas requieren encabezado `x-plataforma-id: <id>`.
> - Las respuestas de ejemplo son referenciales.

---

## 🔑 Auth

### Iniciar sesión
**POST** `/auth/login`

**Body (JSON)**
```json
{
  "correo": "usuario@dominio.cl",
  "password": "contrasenaSegura",
  "plataformaId": 1,
  "forzarSesion": false
}
```
**200 OK**
```json
{
  "token": "<jwt>",
  "usuario": {
    "id": 10,
    "correo": "usuario@dominio.cl",
    "nombres": "Nombre",
    "apellidos": "Apellido"
  },
  "expiraEn": 3600
}
```
**URL base de ejemplo**: `https://catalogomimbral.loclx.io/api/idservice/auth/login`

---

### Cerrar sesión
**POST** `/auth/logout`

**Headers**
- `Authorization: Bearer <token>`
- `x-plataforma-id: 1`

**Body (JSON)**
```json
{
  "usuarioId": 1,
  "plataformaId": 1
}
```
**200 OK**
```json
{ "message": "Sesión cerrada" }
```

---

### Renovar sesión
**POST** `/auth/renovar`

**Headers**
- `Authorization: Bearer <token>`
- `x-plataforma-id: 1`

**Body (JSON)**
```json
{ "password": "admin1234" }
```
**200 OK**
```json
{ "token": "<jwt-refrescado>", "expiraEn": 3600 }
```

---

### Generar OTP (recuperación)
**POST** `/auth/recuperar`

**Body (JSON)**
```json
{ "correo": "usuario@dominio.cl" }
```
**200 OK**
```json
{ "message": "OTP enviado al correo" }
```

---

### Validar OTP
**POST** `/auth/verificar-otp`

**Body (JSON)**
```json
{ "correo": "usuario@dominio.cl", "codigoOtp": "259215" }
```
**200 OK**
```json
{ "valid": true }
```

---

### Cambiar contraseña con OTP
**POST** `/auth/cambiar-contrasena`

**Body (JSON)**
```json
{
  "correo": "usuario@dominio.cl",
  "codigoOtp": "544248",
  "nuevaContraseña": "NuevaClave123",
  "confirmarContraseña": "NuevaClave123"
}
```
**200 OK**
```json
{ "message": "Contraseña actualizada" }
```

---

## 👥 Usuarios

### Crear usuario
**POST** `/usuarios/crear`

**Headers**
- `Authorization: Bearer <token>`
- `x-plataforma-id: 1`

**Body (JSON)**
```json
{
  "correo": "jmolina@mimbral.cl",
  "password": "1234M!",
  "activo": true,
  "usuarioCreadorId": 1,
  "nombres": "Jonathan",
  "apellidos": "Molina",
  "rut": "20.230.330-7",
  "departamentoId": 2,
  "telefono": "+56911112222",
  "urlImagenPerfil": "https://miapp.cl/perfiles/nuevo.png",
  "rolId": 3,
  "plataformaIds": [1, 3]
}
```
**201 Created**
```json
{
  "id": 18,
  "correo": "jmolina@mimbral.cl",
  "activo": true,
  "rolId": 3,
  "plataformaIds": [1,3]
}
```

---

### Editar usuario
**PUT** `/usuarios/editar/:id`

**Headers**
- `Authorization: Bearer <token>`
- `x-plataforma-id: 1`

**Body (JSON)**
```json
{
  "correo": "nuo.suario@demo.cl",
  "activo": true,
  "nombres": "Nuevo Actualizado",
  "apellidos": "Usuario Editado",
  "rut": "2.325.678-4",
  "departamentoId": 2,
  "telefono": "+56912345678",
  "urlImagenPerfil": "https://miapp.cl/perfiles/actualizado.png",
  "usuarioActualizadorId": 1,
  "rolId": 2,
  "plataformaIds": [1,2]
}
```
**200 OK**
```json
{ "message": "Usuario actualizado" }
```

---

### Listar usuarios
**GET** `/usuarios`

**Headers**
- `Authorization: Bearer <token>`
- `x-plataforma-id: 1`

**Query**
`page=1&pageSize=20&document=&firstname=&lastname=&email=`

**200 OK**
```json
{
  "page": 1,
  "pageSize": 20,
  "total": 120,
  "data": [
    {
      "id": 22,
      "correo": "persona@dominio.cl",
      "nombres": "Persona",
      "apellidos": "Ejemplo",
      "activo": true,
      "rolId": 2
    }
  ]
}
```

---

## 🏢 Departamentos

### Crear departamento
**POST** `/departments/post`

**Headers**
- `Authorization: Bearer <token>`
- `x-plataforma-id: 1`

**Body (JSON)**
```json
{
  "nombre": "Prueba 5",
  "descripcion": "Área de Prueba Mantenimiento",
  "contacto": "TI@mimbral.cl",
  "estado": 1,
  "usuarioCreador": 3
}
```
**201 Created**
```json
{ "id": 28, "message": "Departamento creado" }
```

---

### Listar departamentos
**GET** `/departments/get?buscar=`

**200 OK**
```json
[
  {
    "id": 28,
    "nombre": "Tecnologías de Información",
    "estado": 1
  }
]
```

---

### Editar departamento
**PUT** `/departments/put/:id`

**Body (JSON)**
```json
{
  "nombre": "TI actualizado",
  "descripcion": "Área técnica y soporte",
  "contacto": "ti@mimbral.cl",
  "estado": 1,
  "usuarioActualizador": 2
}
```
**200 OK**
```json
{ "message": "Departamento actualizado" }
```

---

## 🖥 Plataformas, Módulos y Endpoints

### Crear plataforma
**POST** `/plataformas`

**Body (JSON)**
```json
{
  "nombre": "Analisis 360",
  "codigo": "AN001",
  "descripcion": "Plataforma de analisis de datos."
}
```
**201 Created**
```json
{ "id": 2, "message": "Plataforma creada" }
```

---

### Obtener plataformas
**GET** `/plataformas/obtener`

**Headers**
- `Authorization: Bearer <token>`
- `x-plataforma-id: 1`

**200 OK**
```json
[
  { "id": 1, "codigo": "MIMBRAL_360", "nombre": "Mimbral 360" },
  { "id": 2, "codigo": "AN001", "nombre": "Analisis 360" }
]
```

---

### Editar plataforma
**PUT** `/plataformas/editar/:id`

**Headers**
- `Authorization: Bearer <token>`
- `x-plataforma-id: 1`

**Body (JSON)**
```json
{
  "nombre": "Pricing Pro",
  "descripcion": "Actualizado: comparador de precios"
}
```
**200 OK**
```json
{ "message": "Plataforma actualizada" }
```

---

### Crear módulo de plataforma
**POST** `/modulos-plataforma`

**Body (JSON)**
```json
{
  "plataformaId": 1,
  "nombre": "Módulo de Finanzas",
  "codigo": "FIN-MOD",
  "ruta": "/finanzas"
}
```
**201 Created**
```json
{ "id": 12, "message": "Módulo creado" }
```

---

### Crear submódulo
**POST** `/submodulos`

**Body (JSON)**
```json
{
  "moduloId": 1,
  "nombre": "Nuevo Submódulo de Prueba",
  "codigo": "NUEVO_SUBMOD_PRUEBA",
  "descripcion": "Descripción del submódulo de prueba.",
  "ruta": "/nueva/ruta/prueba"
}
```
**201 Created**
```json
{ "id": 25, "message": "Submódulo creado" }
```

---

### Registrar endpoint API
**POST** `/endpoint-api`

**Body (JSON)**
```json
{
  "subModuloId": 25,
  "metodoHttp": "POST",
  "path": "/api/v1/facturas",
  "target": "http://servicio-finanzas:3001/facturas",
  "activo": true
}
```
**201 Created**
```json
{ "id": 77, "message": "Endpoint registrado" }
```

---

## 🛡 Roles y Permisos

### Crear rol
**POST** `/create-rol`

**Body (JSON)**
```json
{
  "nombre": "Gestor de Precios Numero 2",
  "descripcion": "Rol para administrar los precios y listas del catálogo.",
  "plataformaCod": "MIMBRAL_360",
  "permisos": [
    { "subModuloId": 3, "accionesId": [1,3] }
  ],
  "usuarioId": 22
}
```
**201 Created**
```json
{ "id": 2, "message": "Rol creado" }
```

---

### Actualizar rol
**PUT** `/role/:id`

**Body (JSON)**
```json
{
  "nombre": "CatalogAudit",
  "descripcion": "Lectura de catálogo",
  "plataformaCod": "MIMBRAL_360",
  "usuarioId": 2,
  "permisos": [
    { "subModuloId": 1, "accionesId": [1] },
    { "subModuloId": 2, "accionesId": [1] },
    { "subModuloId": 3, "accionesId": [1] }
  ],
  "activo": true
}
```
**200 OK**
```json
{ "message": "Rol actualizado" }
```

---

### Dar permiso puntual a usuario
**PATCH** `/users/:id/permissions`

**Body (JSON)**
```json
{
  "permisos": [
    { "subModuloId": 4, "accionesId": [3,2] },
    { "subModuloId": 6, "accionesId": [1] }
  ],
  "adminId": 1
}
```
**200 OK**
```json
{ "message": "Permisos actualizados" }
```

---

### Activar/Desactivar rol de usuario
**PATCH** `/users/:userId/roles/:roleId`

**200 OK**
```json
{ "message": "Rol de usuario actualizado" }
```

---

### Listar roles
**GET** `/all-roles`

**Query**
`page=1&pageSize=10&name=&creatorEmail=&createdFrom=&createdTo=`

**200 OK**
```json
{
  "page": 1,
  "pageSize": 10,
  "total": 2,
  "data": [
    { "id": 1, "nombre": "Admin" },
    { "id": 2, "nombre": "CatalogAudit" }
  ]
}
```

---

## 📄 Perfil de Usuario

### Editar perfil
**PUT** `/perfiles/editar/:id`

**Headers**
- `Authorization: Bearer <token>`
- `x-plataforma-id: 1`

**Body (JSON)**
```json
{
  "nombres": "Jonathan",
  "apellidos": "Molina",
  "rut": "11.111.111-2",
  "telefono": "+56999998888",
  "urlImagenPerfil": "https://miapp.cl/perfiles/nuevo.png"
}
```
**200 OK**
```json
{ "message": "Perfil actualizado" }
```

---

### Obtener perfil por usuario
**GET** `/perfiles/:id`

**200 OK**
```json
{
  "id": 22,
  "usuarioId": 22,
  "nombres": "Jonathan",
  "apellidos": "Molina",
  "telefono": "+56999998888",
  "urlImagenPerfil": "https://miapp.cl/perfiles/nuevo.png"
}
```

---

### Subir imagen de perfil
**PUT** `/perfiles/subir-imagen/:id`

**FormData**
- `imagen`: archivo (png/jpg)

**200 OK**
```json
{ "message": "Imagen actualizada" }
```

