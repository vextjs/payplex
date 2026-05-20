# PayPlex 客户端

## `new PayPlex(options?)`

创建 PayPlex 实例。

```typescript
import { PayPlex } from 'payplex'
import { stripeProvider } from 'payplex/stripe'

const pay = new PayPlex({
  // 传入连接配置（推荐），PayPlex 自动管理连接
  db: {
    url: process.env.MONGODB_URL!,
    dbName: 'my-app-payments',
  },
  defaultProvider: 'stripe',
  hooks: {
    onPaymentSuccess: async (event) => {
      await activateUserSubscription(event.orderId)
    },
    onRefundSuccess: async (event) => {
      await notifyUser(event.orderId, '退款已到账')
    },
  },
})

pay.useProvider(
  stripeProvider({
    apiKey: process.env.STRIPE_SECRET_KEY!,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
  })
)
```

### 选项

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `db` | `PayPlexDbConfig \| MonSQLizeRuntimeLike` | 否 | 数据库连接配置或已有实例。不传时持久化功能禁用，下单/退款仍可正常工作 |
| `defaultProvider` | `string` | 否 | 默认 Provider 名称，设置后 `pay.provider()` 无需传参 |
| `hooks` | `PayPlexHooks` | 否 | 生命周期 Hook 配置，详见 [生命周期 Hook](/guide/hooks) |
| `logger` | `PayPlexLogger` | 否 | 自定义日志器，默认输出到 console |

### 数据库连接方式

**方式一：连接配置（推荐）**

直接传入连接参数，PayPlex 自动建立和管理连接：

```typescript
const pay = new PayPlex({
  db: {
    url: process.env.MONGODB_URL!,   // mongodb://user:pass@host:27017
    dbName: 'payplex',
    poolSize: 10,                    // 可选，连接池大小，默认 5
    connectTimeout: 10000,           // 可选，连接超时 ms，默认 10000
  },
})
```

**方式二：传入已有实例（进阶）**

适合已在项目中自行管理 MonSQLize 连接的场景：

```typescript
import { MonSQLize } from 'monsqlize'

const db = new MonSQLize({ url: '...', dbName: '...' })
await db.connect()

const pay = new PayPlex({ db })
```

---

## `pay.useProvider(provider)`

注册 Provider。支持链式调用。

```typescript
pay
  .useProvider(stripeProvider({ apiKey: '...', webhookSecret: '...' }))
  .useProvider(alipayProvider({ appId: '...', privateKey: '...' }))
```

同名 Provider 后注册的会覆盖前者。

**返回**：`this`（支持链式）

---

## `pay.provider(name?)`

获取已注册的 Provider，未注册时抛出 `Error`。若设置了 `defaultProvider`，`name` 可省略。

```typescript
// 按名称获取
const stripe = pay.provider('stripe')
await stripe.createOrder({ ... })

// 使用默认 Provider
const pay = new PayPlex({ defaultProvider: 'stripe', db: { url: '...', dbName: '...' } })
await pay.provider().createOrder({ ... })
```

**返回**：`IPayProvider`

---

## `pay.createHandler(providerName)`

为指定 Provider 创建框架级 Webhook 处理器，验签 → 标准化 → 触发 Hook 全流程一体化。

**支持 Express、Fastify、Koa、Hono 等主流 Node.js 框架。**

```typescript
import express from 'express'

const app = express()

// ✅ 推荐：一行集成 Webhook
app.post(
  '/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  pay.createHandler('stripe')
)
```

更多框架用法见 [Webhook 路由](/guide/webhook)。

**返回**：框架兼容的中间件函数 `(req, res, next?) => Promise<void>`

---

## `pay.hasProvider(name)`

检查 Provider 是否已注册。

```typescript
if (pay.hasProvider('alipay')) {
  await pay.provider('alipay').createOrder({ ... })
}
```

**返回**：`boolean`

---

## `pay.listProviders()`

返回所有已注册的 Provider 名称。

```typescript
pay.listProviders()  // ['stripe', 'alipay', 'xendit']
```

**返回**：`string[]`

---

## `pay.listCapabilities(providerName?)`

返回指定 Provider（或所有 Provider）的能力矩阵。

```typescript
// 单个 Provider
pay.listCapabilities('stripe')
// { payment: true, refund: true, subscription: true, split: true, ... }

// 所有 Provider
pay.listCapabilities()
// { stripe: { ... }, alipay: { ... } }
```

**返回**：`ProviderCapabilityMatrix` 或 `Record<string, ProviderCapabilityMatrix>`

---

## `pay.useCapabilityPlugin(plugin)`

注册全局能力插件（如风控引擎）。

```typescript
pay.useCapabilityPlugin(myRiskPlugin({ apiUrl: '...' }))
```

**返回**：`this`（支持链式）

---

## `pay.signatures()`

获取公共签名工具集。

```typescript
const signer = pay.signatures()
await signer.hmac.sign({ ... })
await signer.rsa2.verify({ ... })
await signer.webhook.verifyStripe({ ... })
```

**返回**：`SignatureToolkit`

详见 [签名工具 API](/api/signatures-api)。
