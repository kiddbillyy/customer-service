docker exec -it kafka sh
1.
# kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic commerce.order.events --from-beginning
# kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic customer.validations --from-beginning
# kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic customer-ok --from-beginning 

 <!-- {"OrderID":27,"ok":"true","CardCode":"20230330c"}  -->


kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic vtex.order.imported --from-beginning 