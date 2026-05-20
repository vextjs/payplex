# monSQLize 持久化

PayPlex 内置持久化层，基于自研 [monSQLize](https://github.com/Rocky-k/monsqlize)（MongoDB-based 数据访问层）。启用后，`createOrder`、`verifyWebhook`、`refund` 等操作自动落库，**无需在业务代码中手动操作数据库**。

## 启用持久化

### 方式一：传入连接配置（推荐）

直接提供 MongoDB 连接参数，PayPlex 自动管理连接和连接池：

```typescript
import { PayPlex } from 'payplex'
import { stripeProvider } from 'payplex/stripe'

const pay = new PayPlex({
  db: {
    url: process.env.MONGODB_URL!,   // 如 mongodb://localhost:27017
    dbName: 'my-app-payments',       // PayPlex 使用的数据库名
    poolSize: 5,                     // 可选，连接池大小，默认 5
    connectTimeout: 10000,           // 可选，连接超时 ms，默认 10000
  },
})

pay.useProvider(stripeProvider({ apiKey: process.env.STRIPE_SECRET_KEY! }))
```

### 方式二：传入已有实例（进阶）

适合项目中已有 MonSQLize 连接，希望与 PayPlex 共享连接池：

```typescript
import { MonSQLize } from 'monsqlize'

// 你自己管理连接
const db = new MonSQLize({
  url: process.env.MONGODB_URL!,
  dbName: 'my-app',
  cache: { driver: 'memory', ttl: 60 },  // 可选的缓存配置
})
await db.connect()

const pay = new PayPlex({ db })
```

### 不使用持久化

`db` 是可选参数。不传时，基础支付功能仍可正常使用，但：
- 无法使用 `orderId` 查询历史订单（需改用 `providerOrderId` 实时查询）
- 无 Webhook 去重（同一事件可能触发多次 Hook）

```typescript
// 无持久化模式
const pay = new PayPlex()
pay.useProvider(stripeProvider({ apiKey: process.env.STRIPE_SECRET_KEY! }))

// 基础支付可用
const order = await pay.provider('stripe').createOrder({ ... })

// ❌ 按 orderId 查询会报错（无本地记录）
// await pay.provider('stripe').queryOrder('order_001')

// ✅ 按 providerOrderId 实时查询 Stripe 可用
const status = await pay.provider('stripe').queryOrder('pi_xxx', { idType: 'providerOrderId' })
```

---

## 自动持久化行为

传入 `db` 配置后，以下操作自动落库：

```typescript
// 1. createOrder → 写入 payment_orders
const order = await pay.provider('stripe').createOrder({
  orderId: 'order_001',
  amount: 9900,
  currency: 'usd',
  subject: 'Pro 会员',
})
// → payment_orders: { orderId: 'order_001', status: 'pending', createdAt: ..., ... }

// 2. verifyWebhook（Webhook 到达）→ 写入 payment_events，更新 payment_orders.status
const event = await pay.provider('stripe').verifyWebhook(rawBody, sig)
// → payment_events: { provider: 'stripe', eventId: 'evt_xxx', type: 'payment.success', ... }
// → payment_orders.status 自动更新为 'paid'

// 3. refund → 更新 payment_orders.status，写入 idempotency_keys
await pay.provider('stripe').refund({ orderId: 'order_001', refundId: 'refund_001' })
// → payment_orders.status 更新为 'refunded'
```

---

## MongoDB Collections

PayPlex 在指定 `dbName` 下自动管理以下 collections：

### `payment_orders`

支付订单主记录：

| 字段 | 类型 | 说明 |
|---|---|---|
| `orderId` | string | 业务方订单 ID（唯一索引）|
| `providerOrderId` | string | Provider 返回的订单 ID |
| `provider` | string | Provider 名称（如 `'stripe'`）|
| `amount` | number | 金额（分）|
| `currency` | string | 货币代码（如 `'usd'`）|
| `status` | string | `pending` / `paid` / `failed` / `refunded` / `cancelled` |
| `createdAt` | Date | 创建时间 |
| `updatedAt` | Date | 最后更新时间 |
| `extra` | object | 扩展字段（透传 `CreateOrderParams.extra`）|

### `payment_events`

Webhook 事件流水（含幂等去重）：

| 字段 | 类型 | 说明 |
|---|---|---|
| `provider` | string | Provider 名称 |
| `eventId` | string | Provider 事件 ID（用于去重）|
| `signatureDigest` | string | 签名摘要（eventId 缺失时用于去重）|
| `type` | string | 标准化事件类型（如 `'payment.success'`）|
| `orderId` | string | 关联业务订单 ID |
| `processedAt` | Date | 处理时间 |
| `raw` | object | 原始事件数据 |

### `idempotency_keys`

下单、退款等操作的幂等键：

| 字段 | 类型 | 说明 |
|---|---|---|
| `key` | string | 幂等键（唯一索引）|
| `result` | object | 操作结果快照 |
| `expiresAt` | Date | 过期时间 |

其他 collections（按需创建）：`subscriptions`、`split_transfers`、`reconciliation_jobs`、`risk_decisions`、`settlement_records`。

---

## 查询订单

持久化启用后，可以用业务订单 ID 查询本地数据库，无需每次请求 Stripe：

```typescript
// 查本地（快，不发网络请求）
const order = await pay.provider('stripe').queryOrder('order_001')
// { orderId: 'order_001', status: 'paid', amount: 9900, ... }

// 实时查询 Stripe（慢，按 providerOrderId）
const liveOrder = await pay.provider('stripe').queryOrder('pi_xxx', {
  idType: 'providerOrderId',
})
```

---

## 幂等性保证

PayPlex 通过 `idempotency_keys` collection 防止重复操作：

```typescript
// 相同 orderId 重复下单 → 返回第一次的结果，不重复调用 Stripe
const order1 = await pay.provider('stripe').createOrder({ orderId: 'order_001', amount: 9900, ... })
const order2 = await pay.provider('stripe').createOrder({ orderId: 'order_001', amount: 9900, ... })
console.log(order1.providerOrderId === order2.providerOrderId)  // true

// 相同 refundId 重复退款 → 返回第一次的结果，不重复退款
await pay.provider('stripe').refund({ orderId: 'order_001', refundId: 'refund_001' })
await pay.provider('stripe').refund({ orderId: 'order_001', refundId: 'refund_001' }) // 幂等，安全

// Webhook 重复投递 → onPaymentSuccess 只触发一次（需启用 db）
```

---

## 直接查询持久化记录（进阶）

如需自定义查询（如分页查询历史订单），可以直接使用 monSQLize 访问底层数据：

```typescript
// 需要在方式二中自行持有 db 实例
const db = new MonSQLize({ url: '...', dbName: 'my-app-payments' })
await db.connect()

const pay = new PayPlex({ db })

// 自定义查询：最近 7 天的已支付订单
const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
const recentOrders = await db
  .use('my-app-payments')
  .collection('payment_orders')
  .find({ status: 'paid', createdAt: { $gte: sevenDaysAgo } })
  .sort({ createdAt: -1 })
  .limit(20)
  .toArray()
```

:::danger 不要引入其他 ORM
PayPlex 的官方持久化实现统一使用 `monSQLize`。**不要**额外引入 Prisma / Sequelize / TypeORM / Drizzle / Mongoose 作为 PayPlex 相关的持久化路径，以避免数据层分裂。
:::
