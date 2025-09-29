docker exec -it kafka sh
1.
# kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic vtex.order.integration --from-beginning 
 <!-- {"orderId":"1558860554229-01","state":"ready-for-handling"}  -->



{"orderId":"1560880554995-01","state":"ready-for-handling"}

# docker exec -it kafka sh -c "kafka-console-producer.sh --broker-list localhost:9092 --topic vtex.order.integration"

# kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic vtex.status --from-beginning 

{"commerceId":"1561090555061-01","state":"picking","source":"finance"}

{"commerceId": "123-456", "state":"invoiced", "source": "finance"} 




{"orderId":"1560880554995-01","state":"ready-for-handling"}

{"OrderID":290,"ok":"true","CardCode":"20230330c"}