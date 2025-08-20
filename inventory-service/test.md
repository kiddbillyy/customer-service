*simular evento recibido de producto creado*

-   docker compose exec kafka bash -c "printf '{\"sku\":\"094001887\"}\n' | kafka-console-producer.sh --bootstrap-server localhost:9092 --topic new-product-created"