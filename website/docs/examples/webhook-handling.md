# Webhook 处理示例

## Express：单渠道（推荐方式）

```typescript
import express from 'express'
import { PayPlex } from 'payplex'
import { stripeProvider } from 'payplex/stripe'

const pay = new PayPlex({
  db: { url: process.env.MONGODB_URL!, dbName: 'payplex' },
  hooks: {
    onPaymentSuccess: async (event) => {
      await fulfillOrder(event.orderId)
    },
    onPaymentFailed: async (event) => {
      await notifyUserPaymentFailed(event.orderId)
    },
    onRefundSuccess: async (event) => {
      await notifyUserRefundComplete(event.orderId)
    },
    onRefundFailed: async (event) => {
      await alertOpsTeam(`退款失败，需人工处理：${event.orderId}`)
    },
    onWebhookError: async (err) => {
      console.error('Webhook error:', err.message)
    },
  },
})

pay.useProvider(
  stripeProvider({
    apiKey: process.env.STRIPE_SECRET_KEY!,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
  })
)

const app = express()

// ✅ createHandler 一行搞定：验签 → 标准化 → 触发 Hook
app.post(
  '/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  pay.createHandler('stripe')
)

app.use(express.json())
```

## Fastify：单渠道

```typescript
import Fastify from 'fastify'
import { pay } from './pay'

const fastify = Fastify()

fastify.addContentTypeParser(
  'application/json',
  { parseAs: 'buffer' },
  (_req, body, done) => done(null, body)
)

fastify.post('/webhooks/stripe', pay.createHandler('stripe'))
```

## Express：多渠道路由

注册多个 Provider 时，建议每个 Provider 独立路径：

```typescript
// 每个 Provider 独立 raw body 处理策略
app.post('/webhooks/stripe',   express.raw({ type: 'application/json' }), pay.createHandler('stripe'))
app.post('/webhooks/alipay',   express.text({ type: '*/*' }),             pay.createHandler('alipay'))
app.post('/webhooks/razorpay', express.raw({ type: 'application/json' }), pay.createHandler('razorpay'))
```

## 手动验签（进阶）

需要在事件处理前后加入自定义逻辑时：

```typescript
app.post(
  '/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = req.headers['stripe-signature'] as string

    let event
    try {
      event = await pay.provider('stripe').verifyWebhook(req.body, sig)
    } catch (err) {
      res.status(400).send(`Webhook Error: ${err.message}`)
      return
    }

    // 根据标准化事件类型分发
    switch (event.type) {
      case 'payment.success':
        await handlePaymentSuccess(event)
        break
      case 'payment.failed':
        await handlePaymentFailed(event)
        break
      case 'refund.success':
        await handleRefundSuccess(event)
        break
      case 'refund.failed':
        await handleRefundFailed(event)
        break
      case 'subscription.renewed':
        await handleSubscriptionRenewed(event)
        break
      case 'subscription.payment_failed':
        await handleSubscriptionFailed(event)
        break
      default:
        // 使用原始事件类型处理 PayPlex 未映射的事件
        console.log('未处理的事件类型：', event.type, event.providerEventType)
    }

    res.json({ received: true })
  }
)
```

## Webhook 事件类型参考

| PayPlex 标准类型 | 说明 |
|---|---|
| `payment.success` | 支付成功 |
| `payment.failed` | 支付失败 |
| `payment.pending` | 支付待处理（异步渠道）|
| `refund.success` | 退款成功 |
| `refund.failed` | 退款失败 |
| `subscription.created` | 订阅创建成功 |
| `subscription.renewed` | 订阅续费成功 |
| `subscription.canceled` | 订阅已取消 |
| `subscription.payment_failed` | 订阅扣款失败 |

## 幂等处理

PayPlex 内置幂等去重（需启用 `db`），相同 `provider + eventId` 的 Webhook 只触发一次 Hook，无需自己维护幂等表：

```typescript
// 即使 Stripe 重试投递同一事件，onPaymentSuccess 也只执行一次
```
