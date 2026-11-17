# Build

Order intake. The HTTP process is Express. It is not a Lambda. The request holds a Postgres transaction, and the publisher is a poller. Lambda is the right shape for a later worker that reacts to `orders.events`. It is not the right shape for this write.

## Path

`POST /orders` validates the body, then `PrismaOrderStore.place` does one transaction:

1. insert `orders`
2. insert `outbox` with type `order.placed`

`idempotency_key` is unique. A replay returns the first order. A race that loses the insert catches the unique violation and reads the winner. A thrown error rolls both rows back.

`src/publish-main.ts` is a separate process. It locks unpublished outbox rows with `FOR UPDATE SKIP LOCKED`, sends them to Kafka, then sets `published_at`, then commits. The message key is the order id, so one order stays in one partition. The event id is the outbox id, so a republish of the same row keeps the same id.

If the send throws, the transaction rolls back and the row stays unpublished. If the process dies after Kafka accepts the record and before the commit, the row is unpublished and will be sent again. Consumers have to treat `orders.events` as at-least-once. That is why the notification service dedupes on event id.

## Layout

- `src/domain` validates an order. No database.
- `src/application` is the use case and the ports it needs.
- `src/infrastructure` is Prisma and Kafka.
- `src/interfaces/http` is Express. It maps `InvalidOrder` to 400 and anything else to 500.

## Local

```sh
createdb orders_test
cp .env.example .env
npm install
npx prisma migrate deploy
npm test
npm run dev
npm run publish
```

`docker compose up` starts Postgres on 54329 and Kafka on 9092. Point `DATABASE_URL` at that Postgres if you are not using the local server.

Topic: `orders.events`.

## Not here yet

SQS, a dead-letter queue, and a Lambda worker. The publisher already speaks `MessageSender`, so that worker can sit on the other side of the topic without changing the write path.
