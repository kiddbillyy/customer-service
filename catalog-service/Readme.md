# — Microservicio de Catalogo 

## Catalogo de productos y precios (Catalog service)

Microservicio encargado de gestionar el **catalogo completo de los productos de Mimbral**, obtiene los productos desde la base de datos de SAP Businnes One y los almacena cada 5 minutos en la base de datos del microservicio. Este servicio funciona de manera autónoma y no necesita consumir información desde kafka para complementar el proceso.

-----
## 📦 Tecnologías Utilizadas

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

## 🚀 Endpoints

### `POST /login`

Autentica a un usuario utilizando sus credenciales (`username` y `password`). Si las credenciales son válidas, el servicio retorna un token JWT para futuras solicitudes y emite un evento a Kafka.

#### **Request (JSON)**

```json
{
  "username": "usuario1",
  "password": "secreto123"
}
```

#### **Responses**

  * **`200 OK` - Login Exitoso**

    ```json
    {
      "message": "Login exitoso",
      "token": "jwt_token_aqui",
      "userId": 5
    }
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

## 🛠️ Configuración

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
| `SAP_DB_PASSWORD`   | Contraseña del usuario de SAP.                                              | `*****`                        |
| `SAP_DB_NAME`       | Nombre de la base de datos de SAP.                                          | `COMERCIAL_ENERO`              |
| `KAFKA_BROKER`      | Dirección del broker de Kafka.                                              | `kafka:9092`                    |
| `KAFKA_CLIENT_ID`   | Identificador del cliente Kafka para este microservicio.                    | `catalog-service`               |
| `JWT_SECRET`        | Secreto para la firma de tokens JWT. **Debe ser una cadena robusta.**       | `*****************`             |
| `JWT_EXPIRES_IN`    | Tiempo de expiración del token JWT.                                         | `1h`                            |


### 2\. Instalación y Ejecución Local (Modo Desarrollo)

Sigue estos pasos para configurar y ejecutar el servicio en tu máquina local:

1.  **Clona el repositorio:**
    ```bash
    git clone https://github.com/tuusuario/login-service.git
    cd login-service
    ```
2.  **Instala las dependencias:**
    ```bash
    npm install
    ```
3.  **Crea el archivo `.env`** con las variables de entorno necesarias (ver sección anterior).
4.  **Ejecuta el servicio en modo desarrollo:**
    ```bash
    npm run dev
    ```
    (Asume que tu `package.json` tiene un script `dev` configurado para `nodemon` o similar).

### 3\. Ejecutar con Docker

Se proporciona un `Dockerfile` y un `docker-compose.yml` para una fácil implementación y orquestación del servicio junto con sus dependencias (Kafka y MSSQL).

#### **`Dockerfile`**

```dockerfile
# Usa una imagen oficial de Node.js en su versión 18
FROM node:18-alpine

# Establece el directorio de trabajo dentro del contenedor
WORKDIR /app

# Copia los archivos de definición de dependencias
COPY package*.json ./

# Instala las dependencias de producción
RUN npm install --production

# Copia el resto del código de la aplicación
COPY . .

# Expone el puerto en el que la aplicación escuchará
EXPOSE 3000

# Comando para iniciar la aplicación cuando el contenedor se ejecute
CMD ["node", "index.js"]
```

#### **`docker-compose.yml` (Configuración de Ejemplo)**

Este archivo define el servicio de login, Kafka y MSSQL para un entorno de desarrollo o pruebas.

```yaml
version: '3.8'

services:
  # Servicio de Autenticación (Login Service)
  login-service:
    build: . # Construye la imagen desde el Dockerfile en el directorio actual
    ports:
      - "3000:3000" # Mapea el puerto 3000 del host al puerto 3000 del contenedor
    env_file:
      - .env # Carga las variables de entorno desde el archivo .env
    depends_on:
      - kafka # Asegura que Kafka se inicie antes que este servicio
      - mssql # Asegura que MSSQL se inicie antes que este servicio
    networks:
      - app-network # Conecta este servicio a la red compartida

  # Servicio de Kafka
  kafka:
    image: bitnami/kafka:latest # Utiliza la imagen oficial de Bitnami Kafka
    # Configuración de entorno para Kafka (ejemplo, ajustar según necesidad)
    environment:
      KAFKA_CFG_NODE_ID: 0
      KAFKA_CFG_PROCESS_ROLES: controller,broker
      KAFKA_CFG_LISTENERS: PLAINTEXT://:9092,CONTROLLER://:9093
      KAFKA_CFG_ADVERTISED_LISTENERS: PLAINTEXT://kafka:9092
      KAFKA_CFG_CONTROLLER_QUORUM_VOTERS: 0@kafka:9093
      KAFKA_CFG_CONTROLLER_LISTENER_NAMES: CONTROLLER
    ports:
      - "9092:9092"
    networks:
      - app-network

  # Servicio de MSSQL Server
  mssql:
    image: mcr.microsoft.com/mssql/server:2022-latest # Utiliza la imagen oficial de MSSQL
    environment:
      SA_PASSWORD: "tu_password_segura" # ¡Cambia esto por una contraseña fuerte!
      ACCEPT_EULA: "Y" # Acepta el acuerdo de licencia de usuario final
    ports:
      - "1433:1433" # Mapea el puerto 1433 del host al puerto 1433 del contenedor
    networks:
      - app-network

networks:
  app-network:
    driver: bridge # Define una red de puente para la comunicación entre servicios
```

**Para iniciar el stack completo con Docker Compose:**

1.  Asegúrate de tener Docker y Docker Compose instalados.
2.  Crea el archivo `.env` en la raíz del proyecto.
3.  Desde el directorio raíz del proyecto, ejecuta:
    ```bash
    docker-compose up -d
    ```
    Esto construirá las imágenes (si no existen) e iniciará todos los servicios en segundo plano.

-----

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
