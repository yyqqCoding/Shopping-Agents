# commerce-service

The order system behind the shopping agent: catalog, live stock, per-conversation carts
and orders in MySQL. The agent API reaches it through `examples/assistant/api/java_retail.py`,
one `StorefrontBackend` implementation; the agent core does not change. Design, tables,
indexes and the submit transaction are in
[docs/commerce-service-design.md](../docs/commerce-service-design.md).

Java 17, Spring Boot 3, MyBatis-Plus, Flyway, MySQL 8.

## Layout

- `catalog/`: products, SKUs, the search query (`resources/mapper/ProductMapper.xml`) and
  the wire shape (`ProductView`, the agent's `ProductDetails`).
- `inventory/`: stock rows; `InventoryMapper.deduct` is the conditional decrement.
- `cart/`: a cart per conversation; adding checks stock without taking it.
- `order/`: `OrderService.submit`, the one transaction that locks the cart, compares it
  with the checkout card, takes stock and writes the order.
- `store/`: policies, delivery quotes from `policies.json` terms, `/health`.
- `importer/`: `CatalogSeed` turns `examples/assistant/data/` into rows; `CatalogImporter`
  writes them under the `import` profile.
- `resources/db/migration/`: the Flyway schema.

## Run

```bash
./mvnw test                                      # unit tests; no database needed
COMMERCE_DB_URL=jdbc:mysql://localhost:3306/commerce COMMERCE_DB_PASSWORD=… \
COMMERCE_SERVICE_TOKEN=dev-token ./mvnw spring-boot:run
java -jar target/commerce-service-1.0.0.jar --spring.profiles.active=import   # import
```

`MysqlIntegrationTest` runs when `COMMERCE_TEST_DB_URL` is set; `bash scripts/deploy_commerce.sh --test`
runs it against a throwaway MySQL. Deployment: [docs/deployment.md](../docs/deployment.md#订单服务).

## Interface

Every `/internal/v1` route requires `Authorization: Bearer <COMMERCE_SERVICE_TOKEN>`;
cart and order routes take the customer in `X-User-Id`. Bodies are snake_case. Errors are
`application/problem+json` with a `code`: `VALIDATION`, `UNAUTHORIZED`, `NOT_FOUND`,
`UNAVAILABLE`, `OUT_OF_STOCK`, `CART_CHANGED`, `CART_EMPTY`, `INTERNAL`.

| Route | Use |
|---|---|
| `POST /catalog/search` | The agent's search: filters, sort, at most 8 products, keyset cursor |
| `GET /catalog/products`, `GET /catalog/products/{id}` | Listing and details with live stock |
| `POST /policies/search`, `POST /fulfillment/quote` | Policies and delivery options |
| `GET /carts/{conversationId}`, `POST …/items`, `PUT`/`DELETE …/items/{skuId}` | The conversation's cart |
| `POST /orders` (`Idempotency-Key`), `GET /orders`, `GET /orders/{orderNo}` | Submit and read orders |
| `GET /health` | Health check, no token |
