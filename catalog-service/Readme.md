# — Microservicio de Catalogo 

## Catalogo de productos y precios (Catalog service)

Microservicio encargado de gestionar el **catalogo completo de los productos de Mimbral**, obtiene los productos desde la base de datos de SAP Businnes One y los almacena cada 5 minutos en la base de datos del microservicio. Este servicio funciona de manera autónoma y no necesita consumir información desde kafka para complementar el proceso.

-----
## Tecnologías Utilizadas

Este microservicio ha sido desarrollado utilizando el siguiente stack tecnológico:

- **Node.js v22.15.0**: Entorno de ejecución para JavaScript del lado del servidor.
- **Express**: Framework minimalista y flexible para construir APIs REST.
- **Microsoft SQL Server (MSSQL)**: Motor de base de datos utilizado tanto para el catálogo (`CATALOG_SERVICE_DB`) como para la integración con SAP (`SBO_COM_MIM`).
- **Apache Kafka**: Sistema de mensajería distribuido utilizado para crear *topics* y enviar eventos del sistema (por ejemplo, inicio de sesión).
- **API Gateway**: Punto de entrada centralizado para el ruteo de solicitudes hacia los distintos microservicios.
- **Docker**: Contenerización de servicios para facilitar la portabilidad y despliegue en distintos entornos.
- **`dotenv`**: Gestión segura de variables de entorno mediante archivos `.env`.
- **`node-cron`**: Programación de tareas automáticas (como la limpieza de tokens expirados).
- **`p-limit`**: Control de concurrencia para limitar el número de promesas ejecutadas simultáneamente.
- **`date-fns`**: Utilidades modernas y eficientes para el manejo de fechas.

-----

## Endpoints

## 📘 API - Categorías

### `GET /getcategory`

Permite obtener todas las categorías o realizar búsquedas filtradas. El servicio retorna un arreglo JSON con los campos `Code` y `Name` correspondientes a cada categoría registrada.

**URL:**

```json
http://localhost:8080/api/catalog/getcategory
```

**Descripción:**

Obtiene la lista completa de categorías disponibles.

**Respuesta exitosa: `200 OK`**

```json
[
  {
    "Code": "2000016",
    "Name": "Piscinas y Playa"
  },
  {
    "Code": "464",
    "Name": "Climatización"
  },
  {
    "Code": "753",
    "Name": "Herramientas Eléctricas e Inalámbricas"
  }
]
```


    *Descripción*: El usuario ha iniciado sesión correctamente. Se incluye un token JWT para la autenticación de futuras solicitudes y el `userId` asociado.

  * **`401 Unauthorized` - Credenciales Inválidas**

    ```json
    {
      "message": "Credenciales inválidas"
    }
    ```

    *Descripción*: Las credenciales proporcionadas (usuario o contraseña) son incorrectas.

-----

## Configuración

### 1\. Variables de Entorno (`.env`)

Para ejecutar el servicio, se requieren las siguientes variables de entorno. Crea un archivo `.env` en la raíz del proyecto y configúralo según tu entorno.

| Variable            | Descripción                                                                 | Ejemplo                         |
| :------------------ | :-------------------------------------------------------------------------- | :------------------------------ |
| `PORT`              | Puerto en el que el servidor Express escuchará.                             | `5006`                          |
| `DB_HOST`           | Host para la conexión a la base de datos del catálogo.                      | `host.docker.internal`          |
| `DB_USER`           | Usuario para la conexión a la base de datos del catálogo.                   | `Tu_Usuario de donde esta la BD`|
| `DB_PASSWORD`       | Contraseña para la conexión a la base de datos del catálogo.                | `*****`                         |
| `DB_NAME`           | Nombre de la base de datos del microservicio de catálogo.                   | `CATALOG_SERVICE_DB`            |
| `DB_PORT`           | Puerto del servidor MSSQL Generalmente es 1433.                             | `1433`                          |
| `SAP_DB_HOST`       | Dirección del servidor MSSQL con los datos de SAP.                          | `192.168.0.24`                  |
| `SAP_DB_USER`       | Usuario para conectarse a la base de datos de SAP.                          | `Tu_Usuario`                    |
| `SAP_DB_PASSWORD`   | Contraseña del usuario de SAP.                                              | `*****`                         |
| `SAP_DB_NAME`       | Nombre de la base de datos de SAP.                                          | `COMERCIAL_ENERO`               |
| `KAFKA_BROKER`      | Dirección del broker de Kafka.                                              | `kafka:9092`                    |
| `KAFKA_CLIENT_ID`   | Identificador del cliente Kafka para este microservicio.                    | `catalog-service`               |
| `JWT_SECRET`        | Secreto para la firma de tokens JWT. **Debe ser una cadena robusta.**       | `*****************`             |
| `JWT_EXPIRES_IN`    | Tiempo de expiración del token JWT.                                         | `1h`                            |

### 2\. Configuración conexiones DB

El microservicio utiliza dos conexiones MSSQL: una para la base de datos interna del catálogo (`CATALOG_SERVICE_DB`) y otra para consultar los datos de productos desde SAP (`COMERCIAL_ENERO`).

####  2.1 Archivo: `dbnew.js` (Conexión a la base de datos del microservicio)

```js
const sql = require('mssql');
require('dotenv').config();

const omsConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_HOST,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT, 10),
  options: { encrypt: false, trustServerCertificate: true },
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 }
};

const catalogPool = new sql.ConnectionPool(omsConfig);
const catalogPoolConnect = catalogPool.connect()
  .then(() => console.log('✅ Conectado a Catalog (OMS) DB'))
  .catch(err => console.error('❌ Error conectando a OMS DB:', err));

module.exports = { sql, catalogPool, catalogPoolConnect };
```
####  2.2 Archivo: `dbnewsap.js` (Conexión a la base de datos de SAP)

```js
// dbnewsap.js
const sql = require('mssql');
require('dotenv').config();

const sapConfig = {
  user: process.env.SAP_DB_USER,
  password: process.env.SAP_DB_PASSWORD,
  server: process.env.SAP_DB_HOST,
  database: process.env.SAP_DB_NAME,
  port: parseInt(process.env.SAP_DB_PORT, 10),
  options: { encrypt: false, trustServerCertificate: true },
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 }
};

const sapPool = new sql.ConnectionPool(sapConfig);
const sapPoolConnect = sapPool.connect()
  .then(() => console.log(' Conectado a SAP DB'))
  .catch(err => console.error(' Error conectando a SAP DB:', err));

module.exports = { sql, sapPool, sapPoolConnect };

```

### 3\.  Configurar archivos para instalar en Docker 

Se proporciona un `Dockerfile` y un `docker-compose.yml` para una fácil implementación y orquestación del servicio junto con sus dependencias (Kafka y MSSQL).

#### **`Dockerfile`**

```dockerfile
FROM node:18

# Crear directorio de trabajo
WORKDIR /app

# Copiar package.json (y lock) antes de copiar todo el código,
# así se aprovecha la cache si no cambian las dependencias
COPY package*.json ./

# Instalar dependencias
RUN npm install

# Copiar el resto del código
COPY . .

# Exponer puerto y comando para iniciar
EXPOSE 5005
CMD ["npm", "start"]

```

#### **`docker-compose.yml` (Configuración)**


```yaml
version: '3.8'

networks:
  orders-service_kafka_network:
    external: true

services:
  catalog-service:
    build: .
    container_name: catalog-service
    restart: always
    ports:
      - "5006:5006"
    extra_hosts:
      - "host.docker.internal:host-gateway"
      - "win-hp03dio6fsk:192.168.0.165"
    dns:
      - 127.0.0.11
      - 8.8.8.8         
      - 1.1.1.1 
    environment:
      PORT: 5006
      DB_HOST: host.docker.internal
      DB_USER: DEV
      DB_PASSWORD: 1234
      DB_NAME: CATALOG_SERVICE_DB
      DB_PORT: 1433
      KAFKA_BROKER: kafka:9092
      KAFKA_CLIENT_ID: catalog-service
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


### 4\. Instalación y Ejecución Docker (Modo Desarrollo)

Sigue estos pasos para configurar y ejecutar el servicio en tu máquina local:

1.  **Clona el repositorio principal de microservicios de Mimbral:**
    ```bash
    git clone https://github.com/mimbral1/Microservicios.git
    cd Microservicios
    ```
2.  **Configurar las variables de entorno:**

    Dentro de cada microservicio (order-service, catalog-service, api-gateway), crea un archivo .env con sus respectivas variables de entorno. Revisa la sección configuración para ver el detalle de cómo configurar el `.env`.
    
3.  **Instalar `Docker Desktop`**

    Se debe instalar Docker Desktop: `https://www.docker.com/products/docker-desktop/`
    Debe estar activo y ejcutado antes de continuar. Esto es importante para poder construir y levantar los contenedores para los microservicios.
   
4.  **Levantar los microservicios con Docker:**
   
    Cada microservico debe levantarse de forma independiente. Para esto, se debe abrir una terminal para cada uno y seguir los siguientes pasos:

    1. Levantar Microservicio de order-service
    ```bash
    
    cd -- y despues la ruta de donde esta el microservicio
    docker-compose up --build -d
    ```
    
    <img width="930" height="140" alt="image" src="https://github.com/user-attachments/assets/fe972c97-51a9-4180-b381-bba6fe3e8176" />

    2. Levantar catalog-service
       
    ```bash
    cd -- y despues la ruta de donde esta el microservicio
    docker-compose up --build -d
    ```
    
    <img width="933" height="121" alt="image" src="https://github.com/user-attachments/assets/0d69781e-18b6-4266-a311-9604fa7435c0" />

    3. Levantar api-gateway
       
    ```bash
    cd -- y despues la ruta de donde esta el microservicio
    docker-compose up --build -d
    ```
    
    <img width="960" height="221" alt="image" src="https://github.com/user-attachments/assets/4310a5ae-d309-4419-b2a8-d122696d2336" />

    Puedes veriicar que los microservicios esten corriendo en la opción de contenedores en docker

    <img width="1370" height="159" alt="image" src="https://github.com/user-attachments/assets/716e3dea-0b4a-422e-b892-ab871a54eea6" />



## 📚 Arquitectura y Flujo

El "Login Service" sigue una arquitectura basada en microservicios con énfasis en la **separación de responsabilidades** y la **comunicación asíncrona** a través de Kafka.

Cuando un usuario intenta iniciar sesión:

1.  **Validación de Credenciales**: El servicio recibe la solicitud `POST /login` y procede a validar las credenciales (`username` y `password`) contra la base de datos **MSSQL**.
2.  **Generación de JWT**: Si las credenciales son correctas, se genera un **JSON Web Token (JWT)**. Este token contiene información de la sesión y se firma con un secreto (`JWT_SECRET`) para garantizar su integridad y autenticidad.
3.  **Emisión de Evento a Kafka**: Se publica un evento de "login exitoso" en el tópico de Kafka **`login-events`**. Este evento puede ser consumido por otros microservicios (ej. servicio de auditoría, servicio de notificaciones) para reaccionar a la acción de inicio de sesión de forma asíncrona.
4.  **Respuesta al Cliente**: El servicio responde al cliente con el token JWT y un mensaje de éxito.

Adicionalmente, el servicio gestiona el ciclo de vida de los tokens de sesión mediante una **tarea programada**:

  * **Limpieza de Tokens Expirados**: Una tarea `node-cron` se ejecuta periódicamente (por ejemplo, cada hora) para identificar y eliminar tokens JWT que hayan caducado, ayudando a mantener la base de datos limpia y la seguridad del sistema.

-----

## ⏰ Tareas Programadas (`node-cron`)

El servicio utiliza `node-cron` para ejecutar tareas de mantenimiento de forma periódica.

### `Token Cleanup Job`

  * **Descripción**: Esta tarea es responsable de buscar y eliminar los tokens de sesión que han expirado de la base de datos.
  * **Frecuencia**: Se ejecuta cada hora.
  * **Implementación (ejemplo conceptual)**:
    ```javascript
    cron.schedule('0 * * * *', async () => {
      console.log('[CRON] Iniciando la limpieza de tokens expirados...');
      try {
        await borrarTokensExpirados(); // Función que contiene la lógica para eliminar tokens
        console.log('[CRON] Limpieza de tokens expirados completada.');
      } catch (error) {
        console.error('[CRON] Error durante la limpieza de tokens:', error.message);
      }
    });
    ```

-----

## 📦 Estructura del Proyecto

La organización del código del microservicio sigue una estructura modular para facilitar la lectura y el mantenimiento:

```
login-service/
│
├── index.js                # Punto de entrada principal de la aplicación.
├── kafka/                  # Módulo para la integración con Kafka.
│   └── producer.js         # Lógica para producir (enviar) eventos a Kafka.
├── db/                     # Módulo para la gestión de la base de datos.
│   └── sql.js              # Configuración de la conexión y operaciones con MSSQL.
├── routes/                 # Definición de las rutas de la API REST.
│   └── login.js            # Lógica y manejo de la ruta POST /login.
├── jobs/                   # Tareas programadas o cronjobs.
│   └── cleanTokens.js      # Lógica para la tarea de limpieza de tokens expirados.
├── .env                    # Variables de entorno (NO subido a Git).
├── Dockerfile              # Definición para la construcción de la imagen Docker del servicio.
└── docker-compose.yml      # Archivo para la orquestación de servicios Docker (si es parte de un monorepo o stack).
```

-----

## 🧪 Pruebas Manuales

Puedes probar el endpoint `/login` utilizando herramientas como [Postman](https://www.postman.com/) o `curl`.

### Ejemplo con `curl`

```bash
curl -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" \
  -d '{"username":"usuario1", "password":"secreto123"}'
```

-----

## 🧯 Logs

El servicio emite logs informativos a la consola (o a un sistema de logging configurado) para monitorización y depuración.

Ejemplos de logs:

  * `[INFO] Login exitoso para usuario1`
  * `[CRON] Iniciando la limpieza de tokens expirados...`
  * `[INFO] Evento enviado a Kafka: login-events`
  * `[ERROR] Credenciales inválidas para usuario: usuario_intento`

-----

## 🧩 Integraciones Clave

Este microservicio se integra con los siguientes sistemas y tecnologías:

| Servicio / Tecnología | Descripción                                                              |
| :-------------------- | :----------------------------------------------------------------------- |
| **Apache Kafka** | Emite eventos cuando un usuario inicia sesión correctamente, permitiendo a otros servicios reaccionar asíncronamente. |
| **MSSQL Server** | Actúa como la fuente de verdad para la validación de credenciales de usuario. |
| **JWT (JSON Web Tokens)** | Utilizado para la generación de tokens de sesión seguros, permitiendo la autenticación sin estado en futuras solicitudes. |
| **`node-cron`** | Facilita la programación y ejecución automática de tareas de mantenimiento, como la limpieza de tokens vencidos. |

-----

## 🔐 Consideraciones de Seguridad

Aunque este es un ejemplo, se han considerado algunas prácticas de seguridad importantes:

  * **Contraseñas Hasheadas**: Se espera que las contraseñas de los usuarios estén almacenadas en la base de datos utilizando un algoritmo de hashing robusto como **bcrypt** (la lógica de hashing de contraseñas debería implementarse antes de almacenar usuarios).
  * **JWT con Firma Secreta (`JWT_SECRET`)**: Los tokens JWT son firmados con un secreto fuerte y único para prevenir manipulaciones.
  * **Uso de `.env`**: Las variables de entorno sensibles se gestionan fuera del código fuente con `.env` para evitar que se filtren.
  * **Recomendación HTTPS**: Para entornos de producción, es **crucial** implementar HTTPS para cifrar la comunicación entre el cliente y el servidor, protegiendo las credenciales y los tokens.

-----
