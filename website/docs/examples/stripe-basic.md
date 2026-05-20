# Stripe 基础集成

本示例展示在 Express 项目中集成 PayPlex + Stripe 的完整流程，包含下单、Webhook 接收和退款。

## 安装

```bash
npm install payplex stripe express
npm install -D @types/express typescript
```

## 项目结构

```
my-payment-app/
├── src/
│   ├── index.ts          # Express 应用入口
│   ├── pay.ts            # PayPlex 单例
│   └── routes/
│       └── payment.ts    # 支付路由
├── .env
├── package.json
└── tsconfig.json
```

## 环境变量（`.env`）

```ini
MONGODB_URL=mongodb://localhost:27017
DB_NAME=my-app-payments
STRIPE_SECRET_KEY=sk_test_51...
STRIPE_WEBHOOK_SECRET=whsec_...
APP_URL=http://localhost:3000
```

## 初始化 PayPlex（`src/pay.ts`）

```typescript
import { PayPlex } from 'payplex'
import { stripeProvider } from 'payplex/stripe'

export const pay = new PayPlex({
  db: {
    url: process.env.MONGODB_URL!,
    dbName: process.env.DB_NAME ?? 'my-app-payments',
  },
  hooks: {
    onPaymentSuccess: async (event) => {
      console.log(`✅ 支付成功：${event.orderId}，金额：${event.amount}`)
      // 激活服务、发货、发送确认邮件等
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
    onWebhookError: async (err, raw) => {
      console.error('Webhook 处理失败：', err.message)
      // 生产环境建议接入告警系统（如 Sentry、PagerDuty）
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

## 支付路由（`src/routes/payment.ts`）

```typescript
import { Router } from 'express'
import { pay } from '../pay'
import { PayPlexProviderError } from 'payplex'

const router = Router()

// 创建支付订单
router.post('/create', async (req, res) => {
  const { amount, currency, subject, userId } = req.body

  const orderId = `order_${userId}_${Date.now()}`

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
      paymentUrl: order.paymentUrl,              // Checkout 模式：跳转支付页
      clientSecret: (order.raw as any)?.client_secret, // PaymentIntent 模式：传给前端 Stripe.js
    })
  } catch (err) {
    if (err instanceof PayPlexProviderError) {
      res.status(422).json({ error: err.providerMessage })
    } else {
      throw err
    }
  }
})

// 查询订单状态
router.get('/order/:orderId', async (req, res) => {
  const order = await pay.provider('stripe').queryOrder(req.params.orderId)
  res.json(order)
})

// 发起退款
router.post('/refund', async (req, res) => {
  const { orderId, amount, reason } = req.body

  const refund = await pay.provider('stripe').refund({
    orderId,
    refundId: `refund_${Date.now()}`,
    amount,      // 部分退款金额（分）。不传则全额退款
    reason,
  })

  res.json({ refundId: refund.refundId, status: refund.status })
})

export { router as paymentRouter }
```

## 应用入口（`src/index.ts`）

```typescript
import express from 'express'
import { paymentRouter } from './routes/payment'
import { pay } from './pay'

const app = express()

// ⚠️ Webhook 必须在 express.json() 之前注册，使用 raw body
app.post(
  '/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  pay.createHandler('stripe')   // 一行搞定验签 + Hook 触发
)

app.use(express.json())
app.use('/payment', paymentRouter)

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000')
})
```

## 本地测试 Webhook

```bash
# 安装 Stripe CLI
brew install stripe/stripe-cli/stripe

# 转发 Webhook（会输出 Webhook Secret，更新到 .env）
stripe listen --forward-to localhost:3000/webhooks/stripe

# 另开一个终端，触发测试事件
stripe trigger payment_intent.succeeded
stripe trigger charge.refunded
```
