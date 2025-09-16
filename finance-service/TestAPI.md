**Levantar el servicio**
  - *Primera vez*
  - docker-compose up --build -d 
  - docker logs -f orders-service

  - **Si no realiza cambios**
  - docker-compose up -d
  - docker logs -f orders-service

  - **Si realiza cambios**
  - docker-compose down 
  - docker-compose up --build -d
  - docker logs -f orders-service
  

**Enviar un Topic a kafka**
*En una consola aparte, ejecutar:*
- docker exec -it kafka sh

*luego crea una orden con:*
- echo '{"orderID": 1, "sequence": "778811", "clientName": "Thomas Riffo", "clientPhone": "956228070", "clientEmail": "thomas@mail.com", "itemsAmount": 2, "totalAmount": 1642980, "orderStatusID": 1, "paymentMethodID": 2, "deliveryTypeID": 1, "salesChannelID": 1, "recipient": "Thomas Riffo", "deliveryDate": "2024-02-01", "products": [{"SKU": "033004015", "quantity": 1}, {"SKU": "555201108", "quantity": 1}]}' | kafka-console-producer.sh --broker-list localhost:9092 --topic sap.order.imported






