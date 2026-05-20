# 介绍

## PayPlex 是什么？

**PayPlex** 是一个面向 Node.js 的统一支付中间层，默认内置 Stripe，通过 `defineProvider()` 插件化接入任意支付渠道，提供：

- **统一 API** — 创建订单、查询、退款、Webhook 验签一套接口；
- **公共签名层** — HMAC / RSA / RSA2 / Webhook 验签统一暴露；
- **能力分层体系** — 基础支付 + 订阅 / 分账 / 对账 / 风控 / 结算按需启用；
- **monSQLize 持久化** — 核心直接绑定自研 monSQLize（MongoDB），统一管理支付记录；
- **区域渠道支持** — 能力矩阵原生支持东南亚、菲律宾、印度等区域中小渠道。

```typescript
import { PayPlex } from 'payplex'
import { stripeProvider } from 'payplex/stripe'

const pay = new PayPlex({
  db: db,  // monSQLize 实例，可选（不传时持久化功能给出友好错误）
})

pay.useProvider(stripeProvider({ apiKey: process.env.STRIPE_SECRET_KEY }))

// 创建订单
const order = await pay.provider('stripe').createOrder({
  orderId: 'order_001',
  amount: 9900,
  currency: 'usd',
  subject: 'Pro 会员',
})
```

## 核心特性

### 🔌 插件化 Provider 体系

PayPlex 核心仅内置 Stripe。其他渠道通过 `defineProvider()` 工厂函数插件化接入，支持自行发布为独立 npm 包（`payplex-alipay`、`payplex-wechat` 等）。

```typescript
// 接入支付宝（插件包）
import { alipayProvider } from 'payplex-alipay'

pay.useProvider(alipayProvider({
  appId: process.env.ALIPAY_APP_ID,
  privateKey: process.env.ALIPAY_PRIVATE_KEY,
}))

// 使用支付宝创建订单
const order = await pay.provider('alipay').createOrder({ ... })
```

每个 Provider 通过 `ProviderMeta` 声明自身能力矩阵、支持的区域、货币、结算模式与签名方式，让消费者可以在运行时发现 Provider 支持边界。

### 🔑 公共签名层

签名与验签是支付集成中的高频横切需求。PayPlex 将常见签名能力统一抽为 `signatures` 模块，供所有 Provider 和业务代码复用：

```typescript
const signer = pay.signatures()

// HMAC 签名
const sig = await signer.hmac.sign({
  key: process.env.HMAC_KEY,
  data: 'amount=9900&currency=usd&orderId=order_001',
  algorithm: 'sha256',
})

// RSA2 签名（支付宝常用）
const signed = await signer.rsa2.sign({
  privateKey: process.env.PRIVATE_KEY,
  data: rawString,
})

// Webhook 验签
const valid = await signer.webhook.verifyStripe({
  payload: req.rawBody,
  signature: req.headers['stripe-signature'],
  secret: process.env.STRIPE_WEBHOOK_SECRET,
})
```

### 🌏 区域渠道支持

PayPlex 的能力矩阵（`ProviderMeta`）机制原生支持区域中小渠道接入：

```typescript
const meta = pay.provider('xendit').meta
// {
//   name: 'xendit',
//   regions: ['PH', 'ID', 'TH', 'VN'],
//   currencies: ['PHP', 'IDR', 'THB', 'VND'],
//   capabilities: {
//     payment: true,
//     refund: true,
//     webhook: true,
//     subscription: false,   // 不支持
//     split: true,
//     // ...
//   }
// }

// 查询某 Provider 是否支持某能力
const caps = pay.listCapabilities('xendit')
```

区域渠道只需声明支持的能力子集，对未实现的能力返回明确的 `unsupported capability` 错误，而非模糊失败。

### 🗄️ monSQLize 持久化

PayPlex 核心层直接绑定自研 [monSQLize](https://github.com/Rocky-k/monsqlize)（MongoDB-based ORM），统一管理以下数据：

| Collection | 内容 |
|---|---|
| `payment_orders` | 支付订单主记录 |
| `payment_events` | Webhook 事件流水（含幂等去重） |
| `idempotency_keys` | 下单、退款、订阅等幂等键 |
| `subscriptions` | 订阅主记录 |
| `split_transfers` | 分账记录 |
| `reconciliation_jobs` | 对账任务与账单记录 |
| `risk_decisions` | 风控决策记录 |
| `settlement_records` | 结算记录 |

```typescript
const pay = new PayPlex({
  db: db,  // MonSQLize 实例
})
// 后续 createOrder / verifyWebhook 等操作自动落库
// 调用方无需手动操作 stores
```

### 💰 高级金融能力

高级能力通过 Capability Plugin 或 Provider Capability Adapter 按需暴露，不污染基础支付接口：

```typescript
// 订阅
const sub = pay.listCapabilities('stripe').subscription
await sub.create({ customerId: 'cus_xxx', planId: 'plan_pro' })

// 分账（需 Provider 支持）
const split = pay.listCapabilities('stripe').split
await split.execute({ orderId: 'order_001', routes: [...] })
```

### 🪝 生命周期 Hook

```typescript
const pay = new PayPlex({
  db: db,
  hooks: {
    beforeCreateOrder: async (params) => {
      // 风控拦截：返回修改后的 params 或抛出错误拒绝下单
    },
    onPaymentSuccess: async (event) => {
      // 触发通知、更新订单状态、发 MQ 消息等
    },
    onWebhookReceived: async (raw) => {
      // 原始 Webhook 日志
    },
  },
})
```

## 与其他方案对比

| 特性 | PayPlex | 自研封装 | pay-js | `stripe` |
|---|---|---|---|---|
| 统一 Provider 抽象 | ✅ | 需自建 | 部分 | ❌ 单库 |
| 插件化扩展渠道 | ✅ | 需自建 | ❌ | ❌ |
| 公共签名层 | ✅ | 需自建 | ❌ | ❌ |
| 区域渠道能力矩阵 | ✅ | 需自建 | ❌ | ❌ |
| 官方持久化层 | ✅ monSQLize | 需自建 | ❌ | ❌ |
| 高级金融能力 | ✅ 分层 | 需自建 | ❌ | 仅 Stripe |
| 生命周期 Hook | ✅ | 需自建 | ❌ | ❌ |

## 环境要求

- **Node.js** >= 18.0.0
- **TypeScript** 5.x（推荐）
- **monSQLize** — 可选，启用持久化功能时必须传入

## 下一步

准备好了吗？前往 [快速开始](/guide/quick-start) 完成你的第一个支付集成。

