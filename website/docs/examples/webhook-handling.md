# Webhook 处理

## 单渠道 Webhook

```typescript
// Express
import express from 'express'
import { PayPlex } from 'payplex'
import { stripeProvider } from 'payplex/stripe'

const pay = new PayPlex({ db })
pay.useProvider(stripeProvider({ apiKey: '...', webhookSecret: '...' }))

const app = express()

// ⚠️ Stripe 需要 raw body，必须在 express.json() 之前配置
app.post(
  '/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    try {
      const event = await pay.provider('stripe').verifyWebhook(
        req.body,
        req.headers['stripe-signature'] as string
      )
      console.log('事件类型：', event.type)
      console.log('业务订单 ID：', event.orderId)
      res.json({ received: true })
    } catch {
      res.status(400).send('Webhook signature verification failed')
    }
  }
)
```

## 多渠道 Webhook 路由

```typescript
// 方案一：路径路由（推荐）
app.post(
  '/webhooks/:provider',
  express.raw({ type: '*/*' }),
  async (req, res) => {
    const { provider: providerName } = req.params

    if (!pay.hasProvider(providerName)) {
      return res.status(404).send('Unknown provider')
    }

    const signatureHeaders: Record<string, string> = {
      stripe:   req.headers['stripe-signature'] as string,
      alipay:   '',   // 支付宝使用 body 内的参数验签
      xendit:   req.headers['x-callback-token'] as string,
      razorpay: req.headers['x-razorpay-signature'] as string,
    }

    const sig = signatureHeaders[providerName] ?? ''

    const event = await pay.provider(providerName).verifyWebhook(req.body, sig)
    res.json({ received: true })
  }
)
```

## 处理不同事件类型

```typescript
const pay = new PayPlex({
  db,
  hooks: {
    onWebhookProcessed: async (event) => {
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
        case 'subscription.payment_succeeded':
          await handleSubscriptionRenewed(event)
          break
        case 'subscription.payment_failed':
          await handleSubscriptionFailed(event)
          break
      }
    },
  },
})

async function handlePaymentSuccess(event: WebhookEvent) {
  // PayPlex 内部已自动将订单状态更新为 'paid'
  // 此函数专注于业务侧副作用：激活服务、发送通知等
  await activateService(event.orderId)
  await sendConfirmationEmail(event.orderId)
}
```

## 幂等处理

PayPlex 内部自动对 Webhook 事件去重，相同 `provider + eventId` 的事件不会重复触发 Hook：

```typescript
// 即使支付网关重试投递同一 Webhook，onWebhookProcessed 也只触发一次
// 无需自己维护幂等表
const event = await pay.provider('stripe').verifyWebhook(rawBody, sig)
```

## 使用 Fastify

```typescript
import Fastify from 'fastify'

const fastify = Fastify()

// Fastify 需要注册 raw body 解析器
fastify.addContentTypeParser(
  'application/json',
  { parseAs: 'buffer' },
  (_req, body, done) => done(null, body)
)

fastify.post('/webhooks/stripe', async (req, res) => {
  const event = await pay.provider('stripe').verifyWebhook(
    req.body as Buffer,
    req.headers['stripe-signature'] as string
  )
  return { received: true }
})
```

