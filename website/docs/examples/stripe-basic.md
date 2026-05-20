# Stripe 基础集成

本示例展示在 Express 项目中集成 PayPlex + Stripe 的完整流程。

## 安装

```bash
npm install payplex stripe express
npm install -D @types/express typescript
```

## 项目结构

```
my-payment-app/
├── src/
│   ├── index.ts
│   ├── pay.ts          # PayPlex 实例
│   └── routes/
│       └── payment.ts  # 支付路由
├── package.json
└── tsconfig.json
```

## 初始化 PayPlex

```typescript
// src/pay.ts
import { PayPlex } from 'payplex'
import { stripeProvider } from 'payplex/stripe'
import { MonSQLize } from 'monsqlize'

const db = new MonSQLize({
  url: process.env.MONGODB_URL!,
  dbName: 'my-app-payments',
})

await db.connect()

export const pay = new PayPlex({
  db,
  hooks: {
    onPaymentSuccess: async (event) => {
      console.log(`✅ 支付成功：${event.orderId}，金额：${event.amount}`)
      // 在这里触发业务逻辑：发货、激活会员等
    },
    onPaymentFailed: async (event) => {
      console.log(`❌ 支付失败：${event.orderId}`)
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

## 支付路由

```typescript
// src/routes/payment.ts
import { Router } from 'express'
import { pay } from '../pay'
import { PayPlexProviderError } from 'payplex'

const router = Router()

// 创建支付
router.post('/create', async (req, res) => {
  const { amount, currency, subject } = req.body

  const orderId = `order_${Date.now()}`   // 你的业务订单 ID

  try {
    const order = await pay.provider('stripe').createOrder({
      orderId,
      amount,
      currency,
      subject,
      returnUrl: `${process.env.APP_URL}/payment/success?orderId=${orderId}`,
    })

    res.json({
      orderId: order.orderId,
      paymentUrl: order.paymentUrl,      // 如果是 Checkout Session 模式
      clientSecret: order.raw?.client_secret,  // 如果是 PaymentIntent 模式
    })
  } catch (err) {
    if (err instanceof PayPlexProviderError) {
      res.status(422).json({ error: err.providerMessage })
    } else {
      throw err
    }
  }
})

// 查询订单
router.get('/order/:orderId', async (req, res) => {
  const order = await pay.provider('stripe').queryOrder(req.params.orderId)
  res.json(order)
})

// 退款
router.post('/refund', async (req, res) => {
  const { orderId, amount, reason } = req.body

  const refund = await pay.provider('stripe').refund({
    orderId,
    refundId: `refund_${Date.now()}`,
    amount,
    reason,
  })

  res.json(refund)
})

// Webhook 处理（需要 raw body）
router.post(
  '/webhooks/stripe',
  (req, res, next) => {
    // express.raw() 可以在这里局部应用，或全局配置
    next()
  },
  async (req, res) => {
    try {
      const event = await pay.provider('stripe').verifyWebhook(
        req.body,
        req.headers['stripe-signature'] as string
      )
      res.json({ received: true })
    } catch {
      res.status(400).send('Webhook signature verification failed')
    }
  }
)

export { router as paymentRouter }
```

## 应用入口

```typescript
// src/index.ts
import express from 'express'
import { paymentRouter } from './routes/payment'

const app = express()

// 重要：Webhook 路由必须在 express.json() 之前注册，以保留 raw body
app.post(
  '/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    // 或者将 Stripe Webhook 路由单独处理
  }
)

app.use(express.json())
app.use('/payment', paymentRouter)

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000')
})
```

## 环境变量

```ini
MONGODB_URL=mongodb://localhost:27017
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
APP_URL=http://localhost:3000
```

## 测试 Webhook

使用 Stripe CLI 在本地测试 Webhook：

```bash
stripe listen --forward-to localhost:3000/webhooks/stripe
stripe trigger payment_intent.succeeded
```

