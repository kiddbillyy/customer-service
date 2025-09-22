# Imagen base oficial de Node.js
FROM node:20-alpine

# Definir directorio de trabajo
WORKDIR /app

# Copiar package.json y package-lock.json primero (para cache de dependencias)
COPY package*.json ./

# Instalar dependencias
RUN npm install

# Copiar el resto del código
COPY . .

# Exponer el puerto (ej: 5015 si tu microservicio usa ese)
EXPOSE 5015

# Comando de inicio
CMD ["npm", "start"]
