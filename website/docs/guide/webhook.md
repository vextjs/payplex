# Webhook 路由

## 概念

支付网关通过 Webhook 通知你的服务器支付状态变化。当你注册了多个 Provider 时，需要将入站的 Webhook 请求路由到正确的 Provider 进行验签和处理。

PayPlex 支持两种 Webhook 路由策略。

## 策略一：路径路由（推荐）

为每个 Provider 配置独立 URL 路径，从路径中提取 provider 名称：

```typescript
// Express
app.post(
  '/webhooks/:provider',
  express.raw({ type: '*/*' }),   // 保留原始 body
  async (req, res) => {
    const providerName = req.params.provider  // 'stripe' | 'alipay' | ...

    // 根据 Provider 选择签名 header
    const sig = getSignatureHeader(req, providerName)

    const event = await pay.provider(providerName).verifyWebhook(req.body, sig)
    await handleEvent(event)
    res.json({ received: true })
  }
)

function getSignatureHeader(req: Request, provider: string): string {
  const headerMap: Record<string, string> = {
    stripe: 'stripe-signature',
    alipay: 'x-alipay-sign',
    xendit: 'x-callback-token',
    razorpay: 'x-razorpay-signature',
  }
  return req.headers[headerMap[provider]] as string ?? ''
}
```

注册 Webhook URL 到各支付平台时使用对应路径：

| Provider | Webhook URL |
|---|---|
| Stripe | `https://your-domain.com/webhooks/stripe` |
| 支付宝 | `https://your-domain.com/webhooks/alipay` |
| Xendit | `https://your-domain.com/webhooks/xendit` |

## 策略二：分离路由

为每个 Provider 注册独立路由处理函数：

```typescript
// Stripe
app.post(
  '/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const event = await pay.provider('stripe').verifyWebhook(
      req.body,
      req.headers['stripe-signature'] as string
    )
    await handleStripeEvent(event)
    res.json({ received: true })
  }
)

// 支付宝（若使用 payplex-alipay 插件）
app.post('/webhooks/alipay', express.urlencoded({ extended: true }), async (req, res) => {
  const event = await pay.provider('alipay').verifyWebhook(req.body, '')
  await handleAlipayEvent(event)
  res.send('success')  // 支付宝需要返回字符串 'success'
})
```

## 路由辅助工具

PayPlex 提供 `resolveWebhookProvider` 辅助函数，从 `PayPlex` 实例中安全查找 Provider：

```typescript
import { resolveWebhookProvider } from 'payplex/webhook-router'

app.post('/webhooks/:provider', express.raw({ type: '*/*' }), async (req, res) => {
  // 验证 provider 存在，不存在则抛出明确错误
  const provider = resolveWebhookProvider(pay, req.params.provider)

  const event = await provider.verifyWebhook(req.body, getSignatureHeader(req, provider.meta.name))
  res.json({ received: true })
})
```

## 处理 Webhook 事件

`verifyWebhook` 返回标准化的 `WebhookEvent`：

```typescript
interface WebhookEvent {
  type: string              // 标准化事件类型，如 'payment.success'
  providerEventType: string // Provider 原始事件类型，如 'payment_intent.succeeded'
  orderId: string           // 业务订单 ID
  providerOrderId: string   // Provider 侧订单 ID
  provider: string          // Provider 名称
  amount?: number
  currency?: string
  raw: unknown              // Provider 原始事件对象
}
```

结合 Hook 处理支付成功事件：

```typescript
const pay = new PayPlex({
  db,
  hooks: {
    onPaymentSuccess: async (event) => {
      // PayPlex 内部已自动更新订单持久化状态
      // 此处适合执行业务侧副作用：发送通知、MQ 消息等
      await sendNotification(event.orderId)
    },
    onPaymentFailed: async (event) => {
      await logFailure(event)
    },
  },
})
```

## 幂等性与重复投递

支付网关通常会在你的服务器返回非 2xx 时重试 Webhook。PayPlex 的 `payment_events` collection 通过 `provider + eventId` 组合键自动去重，确保不同投递的同一事件只被处理一次：

```typescript
// 无需手动处理去重，PayPlex 内部自动完成
const event = await pay.provider('stripe').verifyWebhook(rawBody, sig)
// ↑ 若该事件已处理过，会返回 null 或抛出 PayPlexIdempotencyError（取决于配置）
```

## raw body 注意事项

:::warning
多数支付网关（尤其是 Stripe）的 Webhook 验签依赖**原始 body（未解析的 Buffer）**。如果你的框架自动 JSON 解析了请求体，验签会失败。

不同框架的 raw body 配置方式：

```typescript
// Express
app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), handler)

// Fastify
fastify.addContentTypeParser(
  'application/json',
  { parseAs: 'buffer' },
  (_req, body, done) => done(null, body)
)

// Koa
import { koaBody } from 'koa-body'
router.post('/webhooks/stripe', koaBody({ includeUnparsed: true }), handler)
```
:::

