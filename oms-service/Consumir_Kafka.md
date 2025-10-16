docker exec -it kafka sh
1.
# kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic commerce.order.events --from-beginning
# kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic customer.validations --from-beginning
# kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic customer-ok --from-beginning 
# kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic customer-ok --from-beginning 

 <!-- {"OrderID":1633,"ok":"true","CardCode":"20230330c"}  -->



# kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic seller-validation-sap --from-beginning 
# kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic seller.created --from-beginning 


# docker exec -it kafka sh -c "kafka-console-producer.sh --broker-list localhost:9092 --topic customer-ok"