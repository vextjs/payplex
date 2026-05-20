# 快速开始

本指南带你在 10 分钟内完成 PayPlex + Stripe 集成，包含下单、Webhook 接收和退款。

## 前提条件

- Node.js >= 18
- 一个 [Stripe 账户](https://stripe.com)，获取 **Secret Key** 和 **Webhook Secret**
- MongoDB 实例（本地或云端，如 MongoDB Atlas）

## 第一步：安装

```bash
npm install payplex stripe
```

如需持久化（推荐）：

```bash
npm install mongodb
```

---

## 第二步：初始化 PayPlex

在项目中创建 `src/pay.ts`（或 `pay.js`），作为 PayPlex 的单例：

```typescript
// src/pay.ts
import { PayPlex } from 'payplex'
import { stripeProvider } from 'payplex/stripe'

export const pay = new PayPlex({
  // 传入 MongoDB 连接配置，PayPlex 自动管理连接生命周期
  db: {
    url: process.env.MONGODB_URL!,       // mongodb://localhost:27017
    dbName: process.env.DB_NAME ?? 'payplex',
  },

  // 全局事件 Hook —— 支付/退款成功后的业务通知
  hooks: {
    onPaymentSuccess: async (event) => {
      console.log(`✅ 支付成功：${event.orderId}`)
      // 在这里执行业务逻辑：激活会员、发货、发邮件等
      await fulfillOrder(event.orderId)
    },
    onPaymentFailed: async (event) => {
      console.log(`❌ 支付失败：${event.orderId}`)
      await notifyUserPaymentFailed(event.orderId)
    },
    onRefundSuccess: async (event) => {
      console.log(`💸 退款成功：${event.orderId}`)
      await notifyUserRefundComplete(event.orderId)
    },
  },
})

// 注册 Stripe Provider
pay.useProvider(
  stripeProvider({
    apiKey: process.env.STRIPE_SECRET_KEY!,           // sk_test_... 或 sk_live_...
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!, // whsec_...
  })
)
```

:::tip 不需要数据库？
`db` 是可选参数。不传时，PayPlex 仍可正常下单和退款，但不会持久化记录，且无法用 `orderId` 查询历史订单。
:::

---

## 第三步：环境变量

创建 `.env` 文件（不要提交到 Git）：

```ini
MONGODB_URL=mongodb://localhost:27017
DB_NAME=my-app-payments
STRIPE_SECRET_KEY=sk_test_51...
STRIPE_WEBHOOK_SECRET=whsec_...
```

获取 `STRIPE_WEBHOOK_SECRET` 的两种方式：
- **本地开发**：使用 [Stripe CLI](https://stripe.com/docs/stripe-cli) 监听，CLI 会输出 Webhook Secret（见第五步）
- **生产**：在 [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/webhooks) 创建端点后获取

---

## 第四步：创建支付订单

```typescript
// src/routes/checkout.ts
import { pay } from '../pay'

async function createCheckout(userId: string, plan: string) {
  const orderId = `order_${userId}_${Date.now()}`  // 你自己的业务订单 ID

  const order = await pay.provider('stripe').createOrder({
    orderId,                         // 幂等键：相同 orderId 重复调用会返回已有记录
    amount: 9900,                    // 单位：分（99.00 USD）
    currency: 'usd',
    subject: `${plan} 计划订阅`,
    returnUrl: `https://your-app.com/payment/success?orderId=${orderId}`,
  })

  return {
    orderId: order.orderId,
    // Stripe Checkout Session 模式：paymentUrl 为支付页面地址
    paymentUrl: order.paymentUrl,
    // Stripe PaymentIntent 模式：clientSecret 供前端 Stripe.js 使用
    clientSecret: (order.raw as any)?.client_secret,
  }
}
```

---

## 第五步：接收 Webhook（最重要）

> Stripe 通过 Webhook 通知你的服务器支付结果。必须正确处理 Webhook，才能可靠地响应支付成功/失败事件。

### Express

```typescript
// src/app.ts
import express from 'express'
import { pay } from './pay'

const app = express()

// ⚠️ Webhook 路由必须在 express.json() 之前注册，且使用 express.raw() 解析 raw body
app.post(
  '/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  pay.createHandler('stripe')   // 自动验签 → 标准化 → 触发 Hook
)

// 其他路由可以正常使用 JSON 解析
app.use(express.json())
app.use('/api', apiRoutes)

app.listen(3000, () => console.log('Server running on http://localhost:3000'))
```

### Fastify

```typescript
import Fastify from 'fastify'
import { pay } from './pay'

const app = Fastify()

// Fastify 需要单独注册 buffer 解析
app.addContentTypeParser(
  'application/json',
  { parseAs: 'buffer' },
  (_req, body, done) => done(null, body)
)

app.post('/webhooks/stripe', pay.createHandler('stripe'))
```

### 本地开发测试

使用 Stripe CLI 在本地转发 Webhook：

```bash
# 安装 Stripe CLI
brew install stripe/stripe-cli/stripe  # macOS
# 或从 https://stripe.com/docs/stripe-cli 下载

# 登录并开始监听（会输出 Webhook Secret，填入 .env）
stripe listen --forward-to localhost:3000/webhooks/stripe

# 模拟支付成功事件
stripe trigger payment_intent.succeeded
```

---

## 第六步：查询订单和退款

### 查询订单状态

```typescript
// 查询本地记录（快，不请求 Stripe）
const order = await pay.provider('stripe').queryOrder('order_001')
console.log(order.status)   // 'pending' | 'paid' | 'failed' | 'refunded' | 'cancelled'

// 实时查询 Stripe（按 providerOrderId）
const liveOrder = await pay.provider('stripe').queryOrder('pi_xxx', {
  idType: 'providerOrderId',
})
```

### 发起退款

```typescript
const refund = await pay.provider('stripe').refund({
  orderId: 'order_001',
  refundId: `refund_${Date.now()}`,  // 退款幂等键，相同 refundId 重复调用不会重复退款
  // amount: 5000,                   // 部分退款：金额（分）。不填则全额退款
  reason: '用户申请退款',
})

console.log(refund.status)   // 'success' | 'pending' | 'failed'
```

退款成功后，Stripe 会发送 Webhook，触发 `onRefundSuccess` Hook。

---

## 完整环境变量参考

```ini
# 数据库
MONGODB_URL=mongodb://localhost:27017
DB_NAME=my-app-payments

# Stripe（测试环境）
STRIPE_SECRET_KEY=sk_test_51...
STRIPE_WEBHOOK_SECRET=whsec_...

# 应用
APP_URL=http://localhost:3000
```

---

## 下一步

- [Stripe 完整配置](/guide/stripe) — 所有 `stripeProvider()` 参数说明
- [生命周期 Hook](/guide/hooks) — 完整 Hook 参考（订单/退款/订阅事件）
- [Webhook 路由](/guide/webhook) — 多 Provider、自定义路由策略
- [monSQLize 持久化](/guide/persistence) — 了解数据库集成细节
- [错误处理](/guide/error-handling) — 生产环境错误处理最佳实践
