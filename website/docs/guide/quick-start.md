# 快速开始

## 安装

```bash
npm install payplex
# or
pnpm add payplex
# or
yarn add payplex
```

Stripe 支持需要额外安装 Stripe SDK（可选依赖）：

```bash
npm install stripe
```

:::tip
PayPlex 采用可选依赖策略 — 未使用某个 Provider 时无需安装其 SDK。
:::

## 基础用法（Stripe）

### 1. 创建 PayPlex 实例

```typescript
import { PayPlex } from 'payplex'
import { stripeProvider } from 'payplex/stripe'
import { MonSQLize } from 'monsqlize'

// 可选：初始化 monSQLize（启用持久化功能）
const db = new MonSQLize({
  url: process.env.MONGODB_URL,
  dbName: 'payplex',
})
await db.connect()

const pay = new PayPlex({
  db,   // 可选，不传时持久化功能会给出友好错误
})

pay.useProvider(
  stripeProvider({
    apiKey: process.env.STRIPE_SECRET_KEY!,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,  // verifyWebhook 时必须
  })
)
```

### 2. 创建支付订单

```typescript
const order = await pay.provider('stripe').createOrder({
  orderId: 'order_001',        // 你的业务订单 ID（幂等键）
  amount: 9900,                 // 金额，单位：分（99.00 USD）
  currency: 'usd',
  subject: 'Pro 会员订阅',
  notifyUrl: 'https://your-domain.com/webhooks/stripe',
  returnUrl: 'https://your-domain.com/payment/success',
})

console.log(order.providerOrderId)  // Stripe PaymentIntent ID
console.log(order.paymentUrl)        // 跳转支付的 URL（如有）
```

### 3. 查询订单状态

```typescript
// 按业务订单 ID 查询（默认，查 payment_orders collection）
const status = await pay.provider('stripe').queryOrder('order_001')

// 按支付网关订单 ID 查询
const status2 = await pay.provider('stripe').queryOrder(
  'pi_xxx',
  { idType: 'providerOrderId' }
)

console.log(status.status)  // 'pending' | 'paid' | 'failed' | 'refunded' | 'cancelled'
```

### 4. 处理 Webhook

```typescript
// Express 示例
// 注意：Stripe Webhook 验签需要 raw body（未解析的 Buffer）
app.post(
  '/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    try {
      const event = await pay.provider('stripe').verifyWebhook(
        req.body,
        req.headers['stripe-signature'] as string
      )
      // event 已经过签名验证，可安全处理
      console.log(event.type)      // 'payment_intent.succeeded' 等
      console.log(event.orderId)   // 标准化后的业务订单 ID
      res.json({ received: true })
    } catch (err) {
      res.status(400).send('Webhook signature verification failed')
    }
  }
)
```

### 5. 退款

```typescript
const refund = await pay.provider('stripe').refund({
  orderId: 'order_001',
  refundId: 'refund_001',   // 退款幂等键
  amount: 9900,              // 可选，不填则全额退款
  reason: '用户申请退款',
})

console.log(refund.status)  // 'success' | 'pending' | 'failed'
```

## 使用 Hook（可选）

```typescript
const pay = new PayPlex({
  db,
  hooks: {
    // 下单前可修改参数或拦截（抛出错误会中断下单）
    beforeCreateOrder: async (params) => {
      console.log('准备下单：', params.orderId)
      // 可选：返回修改后的 params
    },
    // 支付成功后的通知
    onPaymentSuccess: async (event) => {
      await notifyUser(event.orderId)
    },
    // 支付失败记录
    onPaymentFailed: async (event) => {
      await logFailure(event.orderId, event.raw)
    },
  },
})
```

## 多 Provider 场景

```typescript
import { alipayProvider } from 'payplex-alipay'

pay.useProvider(
  alipayProvider({
    appId: process.env.ALIPAY_APP_ID!,
    privateKey: process.env.ALIPAY_PRIVATE_KEY!,
  })
)

// 按 Provider 名称使用
await pay.provider('alipay').createOrder({ ... })
await pay.provider('stripe').createOrder({ ... })

// 多 Provider 的 Webhook 路由
app.post('/webhooks/:provider', express.raw({ type: '*/*' }), async (req, res) => {
  const providerName = req.params.provider  // 'stripe' | 'alipay' | ...
  const sig = req.headers['stripe-signature'] ?? req.headers['x-alipay-sign'] ?? ''

  const event = await pay.provider(providerName).verifyWebhook(req.body, sig as string)
  res.json({ received: true })
})
```

## TypeScript 类型支持

PayPlex 完全使用 TypeScript 编写，所有 API 均有完整类型定义，无需额外安装 `@types/*`。

```typescript
import type {
  CreateOrderParams,
  OrderResult,
  RefundParams,
  WebhookEvent,
  ProviderMeta,
} from 'payplex'
```

## 下一步

- [Provider 体系](/guide/providers) — 了解 Provider 注册、能力矩阵与插件发布
- [Webhook 路由](/guide/webhook) — 深入了解多 Provider 路由策略
- [monSQLize 集成](/guide/persistence) — 配置持久化层
- [区域渠道支持](/guide/regional-providers) — 接入东南亚等区域渠道

