docker exec -it kafka sh
1.
# kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic commerce.order.events --from-beginning
# kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic customer.validations --from-beginning
# kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic customer-ok --from-beginning 

 <!-- {"OrderID":27,"ok":"true","CardCode":"20230330c"}  -->

docker exec -it kafka sh
kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic vtex.order.imported --from-beginning 



{"orderId":"1558860554229-01","state":"ready-for-handling"}



kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic vtex.order.integration --from-beginning 