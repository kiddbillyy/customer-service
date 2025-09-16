# Usar Node.js como base
FROM node:18

# Establecer el directorio de trabajo
WORKDIR /app

# Copiar archivos necesarios
COPY package.json package-lock.json ./
RUN npm install

# Copiar el resto del código
COPY . .

# Exponer el puerto del microservicio
EXPOSE 5000

# Comando para iniciar el microservicio
CMD ["node", "src/server.js"]
