# multivende-oms

Microservicio para integrar pedidos de **Multivende** hacia **OMS-SERVICE**.

## Endpoints

- `POST /multivende/webhooks/order` – recibe el JSON de Multivende, persiste y envía a OMS.
- `POST /multivende/orders/:uRef1/retry` – reintenta envío a OMS por número externo.
- `GET /multivende/orders/:uRef1` – consulta por número externo.

## Environment
Ver `.env.example`.

## Run
```bash
npm i
npm run dev
# o con Docker:
docker compose up --build -d
