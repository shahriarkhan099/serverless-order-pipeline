# orders

Places an order and writes an outbox row in the same Postgres transaction. A second process publishes those rows to Kafka.

The design notes are in [BUILD.md](BUILD.md).

```sh
createdb orders_test
cp .env.example .env
npm install
npx prisma migrate deploy
npm test
```

`POST /orders` takes `sku`, `qty`, and `idempotencyKey`. The same key returns the original order.
