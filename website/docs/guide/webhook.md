# Webhook 路由

PayPlex 提供两种 Webhook 接入方式：

| 方式 | 适用场景 |
|---|---|
| **`pay.createHandler()`**（推荐）| 大多数项目，一行代码完成接入 |
| **手动验签** | 需要在验签前后插入自定义逻辑的进阶场景 |

---

## 推荐方式：`pay.createHandler()`

`pay.createHandler(providerName)` 返回一个框架兼容的中间件函数，内部完成：

1. 读取 raw body
2. 调用 `verifyWebhook()` 验签
3. 标准化事件类型
4. 触发对应的事件 Hook
5. 验签失败时自动返回 `400`

### Express

```typescript
import express from 'express'
import { pay } from './pay'

const app = express()

// ✅ Webhook 路由：使用 raw body，在 express.json() 之前注册
app.post(
  '/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  pay.createHandler('stripe')
)

// 其他普通路由
app.use(express.json())
app.use('/api', apiRouter)

app.listen(3000)
```

:::warning raw body 是关键
Stripe 验签使用原始 body 计算 HMAC，**必须在 `express.json()` 解析之前**拿到 Buffer。  
`pay.createHandler()` 会自动从 `req.body` 取 Buffer，前提是已通过 `express.raw()` 解析。
:::

### Fastify

```typescript
import Fastify from 'fastify'
import { pay } from './pay'

const app = Fastify()

// Fastify 需要将 JSON 解析为 Buffer，让 PayPlex 自行处理
app.addContentTypeParser(
  'application/json',
  { parseAs: 'buffer' },
  (_req, body, done) => done(null, body)
)

app.post('/webhooks/stripe', pay.createHandler('stripe'))
```

### Koa

```typescript
import Koa from 'koa'
import Router from '@koa/router'
import { pay } from './pay'

const app = new Koa()
const router = new Router()

// Koa 中需要手动读取 raw body
router.post('/webhooks/stripe', async (ctx) => {
  const rawBody = ctx.request.rawBody  // 需要 koa-bodyparser 的 enableTypes 或 raw body 中间件
  const sig = ctx.headers['stripe-signature'] as string

  try {
    const event = await pay.provider('stripe').verifyWebhook(rawBody, sig)
    ctx.status = 200
    ctx.body = { received: true }
  } catch {
    ctx.status = 400
    ctx.body = 'Webhook Error'
  }
})
```

### Hono（Edge / Cloudflare Workers）

```typescript
import { Hono } from 'hono'
import { pay } from './pay'

const app = new Hono()

app.post('/webhooks/stripe', async (c) => {
  const rawBody = await c.req.arrayBuffer()
  const sig = c.req.header('stripe-signature') ?? ''

  try {
    const event = await pay.provider('stripe').verifyWebhook(
      Buffer.from(rawBody),
      sig
    )
    return c.json({ received: true })
  } catch {
    return c.text('Webhook Error', 400)
  }
})

export default app
```

---

## 多 Provider Webhook 路由

注册多个 Provider 后，可以使用统一路径路由，也可以分开路径：

### 统一路径（推荐）

```typescript
// Express：每个 Provider 独立路径，Stripe 的 raw body 要求不影响其他 Provider
app.post('/webhooks/stripe',   express.raw({ type: 'application/json' }), pay.createHandler('stripe'))
app.post('/webhooks/alipay',   express.text({ type: '*/*' }),             pay.createHandler('alipay'))
app.post('/webhooks/razorpay', express.raw({ type: 'application/json' }), pay.createHandler('razorpay'))
```

### 动态路径（进阶）

```typescript
// 所有 Provider 共用一个路由
app.post(
  '/webhooks/:provider',
  express.raw({ type: '*/*' }),
  async (req, res, next) => {
    const { provider: providerName } = req.params

    if (!pay.hasProvider(providerName)) {
      res.status(404).send('Unknown provider')
      return
    }

    // 将控制权交给 PayPlex handler
    pay.createHandler(providerName)(req, res, next)
  }
)
```

---

## 手动验签（进阶）

需要在验签前后执行自定义逻辑时，可以直接调用底层 API：

```typescript
app.post(
  '/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = req.headers['stripe-signature'] as string

    let event
    try {
      // 1. 验签 + 标准化
      event = await pay.provider('stripe').verifyWebhook(req.body, sig)
    } catch (err) {
      // 验签失败：Stripe 要求返回 400
      res.status(400).send(`Webhook Error: ${err.message}`)
      return
    }

    // 2. 处理事件（根据事件类型分发）
    switch (event.type) {
      case 'payment.success':
        await handlePaymentSuccess(event)
        break
      case 'refund.success':
        await handleRefundSuccess(event)
        break
      case 'payment.failed':
        await handlePaymentFailed(event)
        break
    }

    // 3. 必须在合理时间内返回 200，否则 Stripe 会重试
    res.json({ received: true })
  }
)
```

### 标准化事件类型

PayPlex 将不同 Provider 的原始事件标准化为统一的事件类型：

| PayPlex 标准类型 | Stripe 原始事件 |
|---|---|
| `payment.success` | `payment_intent.succeeded` |
| `payment.failed` | `payment_intent.payment_failed` |
| `payment.pending` | `payment_intent.processing` |
| `refund.success` | `charge.refunded` |
| `refund.failed` | `charge.refund.updated`（status=failed）|
| `subscription.created` | `customer.subscription.created` |
| `subscription.renewed` | `invoice.payment_succeeded` |
| `subscription.canceled` | `customer.subscription.deleted` |
| `subscription.payment_failed` | `invoice.payment_failed` |

`event.providerEventType` 始终保存 Provider 原始事件类型，可用于处理上表之外的事件。

---

## 幂等性

PayPlex 自动对 Webhook 事件去重：

- 相同 `provider + eventId` 的事件只触发一次 Hook
- Stripe 的重试投递不会重复执行业务逻辑
- 需要传入 `db` 配置才能启用去重（去重记录存储在 `payment_events` 中）

```typescript
// 即使 Stripe 重试投递同一 Webhook，onPaymentSuccess 也只执行一次
```

---

## 在 Stripe Dashboard 配置 Webhook

1. 登录 [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/webhooks)
2. 点击 **Add endpoint**
3. 填写你的 URL，如 `https://your-app.com/webhooks/stripe`
4. 选择需要监听的事件：
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `charge.refunded`
   - 订阅相关：`customer.subscription.*`、`invoice.*`（按需）
5. 保存后复制 **Signing secret**（`whsec_...`），填入环境变量 `STRIPE_WEBHOOK_SECRET`

详见 [Stripe 完整配置](/guide/stripe)。
