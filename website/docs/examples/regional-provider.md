# 区域渠道接入示例

:::info
以下示例中的区域渠道插件包（`payplex-paymongo`、`payplex-razorpay`、`payplex-xendit` 等）目前处于**规划阶段**，尚未发布到 npm。示例代码仅供参考，展示接入后的用法模式。
:::

本示例展示如何接入菲律宾 GCash / Maya（通过 PayMongo）和印度 Razorpay。

## 菲律宾：PayMongo 集成

```bash
npm install payplex-paymongo
```

```typescript
import { paymongoProvider } from 'payplex-paymongo'

pay.useProvider(
  paymongoProvider({
    secretKey: process.env.PAYMONGO_SECRET_KEY!,
    webhookSecret: process.env.PAYMONGO_WEBHOOK_SECRET!,
  })
)

// 检查能力矩阵
const meta = pay.provider('paymongo').meta
console.log(meta.regions)      // ['PH']
console.log(meta.currencies)   // ['PHP']
console.log(meta.capabilities.subscription)  // false

// 创建支付（GCash / Maya / 信用卡）
const order = await pay.provider('paymongo').createOrder({
  orderId: 'order_ph_001',
  amount: 50000,              // 500.00 PHP（单位：分）
  currency: 'php',
  subject: '课程购买',
  extra: {
    paymentMethod: 'gcash',   // 或 'paymaya', 'card'
  },
})
```

## 印度：Razorpay 集成

```bash
npm install payplex-razorpay razorpay
```

```typescript
import { razorpayProvider } from 'payplex-razorpay'

pay.useProvider(
  razorpayProvider({
    keyId: process.env.RAZORPAY_KEY_ID!,
    keySecret: process.env.RAZORPAY_KEY_SECRET!,
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET!,
  })
)

const order = await pay.provider('razorpay').createOrder({
  orderId: 'order_in_001',
  amount: 99900,              // 999.00 INR（单位：分）
  currency: 'inr',
  subject: 'SaaS 月度订阅',
})

// Razorpay 支持 UPI / 网银 / 信用卡
console.log(order.raw?.id)  // Razorpay Order ID，前端需要用这个唤起支付
```

## 东南亚多渠道路由

```typescript
import { xenditProvider } from 'payplex-xendit'
import { paymongoProvider } from 'payplex-paymongo'
import { razorpayProvider } from 'payplex-razorpay'

// 注册所有区域渠道
pay
  .useProvider(stripeProvider({ apiKey: process.env.STRIPE_SECRET_KEY! }))
  .useProvider(xenditProvider({ apiKey: process.env.XENDIT_API_KEY! }))
  .useProvider(paymongoProvider({ secretKey: process.env.PAYMONGO_SECRET_KEY! }))
  .useProvider(razorpayProvider({ keyId: '...', keySecret: '...' }))

// 根据用户区域自动选择最优渠道
function selectProvider(userCountry: string, preferredMethod?: string): string {
  const regionMap: Record<string, string> = {
    PH: 'paymongo',
    IN: 'razorpay',
    ID: 'xendit',
    TH: 'xendit',
    VN: 'xendit',
    MY: 'xendit',
    SG: 'stripe',
    // 其他地区默认 Stripe
  }
  return regionMap[userCountry] ?? 'stripe'
}

// 支付入口
async function createPayment(user: User, amount: number, subject: string) {
  const providerName = selectProvider(user.country)
  const provider = pay.provider(providerName)

  // 检查该渠道是否支持用户需要的能力
  const caps = pay.listCapabilities(providerName)
  if (!caps.payment) {
    throw new Error(`${providerName} 不支持支付能力`)
  }

  return provider.createOrder({
    orderId: `order_${Date.now()}`,
    amount,
    currency: getCurrencyByCountry(user.country),
    subject,
  })
}
```

## 处理区域渠道的特殊签名

不同区域渠道使用不同签名算法，通过公共签名层统一处理：

```typescript
import { hmacSign, rsa2Sign } from 'payplex/signatures'

// Xendit 使用 x-callback-token 直接对比
// （不需要复杂签名，在 verifyWebhook 内部处理）

// 某些渠道需要 RSA2 签名的 API 请求
const apiBody = JSON.stringify({ out_trade_no: 'order_001', amount: 9900 })
const sig = await rsa2Sign({
  privateKey: process.env.MY_RSA2_PRIVATE_KEY!,
  data: apiBody,
})

// 某些渠道需要 HMAC + 字段排序
const sorted = Object.entries(params)
  .filter(([, v]) => v !== '')
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([k, v]) => `${k}=${v}`)
  .join('&')

const hmacSig = await hmacSign({
  key: process.env.HMAC_KEY!,
  data: sorted,
  algorithm: 'sha256',
})
```

