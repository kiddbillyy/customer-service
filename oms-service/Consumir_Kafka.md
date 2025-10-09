docker exec -it kafka sh
1.
# kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic commerce.order.events --from-beginning
# kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic customer.validations --from-beginning
# kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic customer-ok --from-beginning 
# kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic customer-ok --from-beginning 

 <!-- {"OrderID":720,"ok":"true","CardCode":"20230330c"}  -->



# kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic seller-validation-sap --from-beginning 