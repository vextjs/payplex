# Provider 体系

## 概念

**Provider** 是 PayPlex 的支付渠道适配单元。每个 Provider 实现统一的 `IPayProvider` 接口，向核心层暴露基础支付、查询、退款、Webhook 验签等能力。

PayPlex 通过 `useProvider()` 注册 Provider，通过 `provider(name)` 按名称使用：

```typescript
const pay = new PayPlex({ db })
pay.useProvider(stripeProvider({ apiKey: '...' }))

// 使用
const stripe = pay.provider('stripe')
await stripe.createOrder({ ... })
```

## 内置 Provider：Stripe

PayPlex 默认内置 `stripeProvider`，无需额外安装插件包：

```typescript
import { PayPlex } from 'payplex'
import { stripeProvider } from 'payplex/stripe'

pay.useProvider(
  stripeProvider({
    apiKey: process.env.STRIPE_SECRET_KEY!,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,  // 可选，verifyWebhook 时必须
  })
)
```

Stripe Provider 支持的能力：

| 能力 | 支持状态 |
|---|---|
| 创建订单（PaymentIntent / Checkout） | ✅ |
| 查询订单（orderId / providerOrderId）| ✅ |
| 退款 | ✅ |
| Webhook 验签 | ✅ |
| 取消订单 | ✅ |
| 订阅（`ISubscriptionCapability`）| ✅ |
| 分账（Connect）| ✅ |
| 对账单 | ✅ |

## 外部渠道插件

其他稳定渠道可以独立 npm 包形式提供；部分区域渠道插件当前仍处于规划阶段，下面的包名主要用于说明未来接入形态：

```typescript
// 支付宝
import { alipayProvider } from 'payplex-alipay'
pay.useProvider(alipayProvider({ appId: '...', privateKey: '...' }))

// Xendit（东南亚，规划中的未来包形态）
import { xenditProvider } from 'payplex-xendit'
pay.useProvider(xenditProvider({ apiKey: '...' }))
```

## Provider 注册与管理

```typescript
// 注册（支持链式调用）
pay.useProvider(stripeProvider({...})).useProvider(alipayProvider({...}))

// 查询
pay.hasProvider('stripe')           // true
pay.listProviders()                  // ['stripe', 'alipay']

// 能力矩阵查询
const matrix = pay.listCapabilities('stripe')
// { payment: true, refund: true, subscription: true, split: true, ... }
```

## ProviderMeta — 能力矩阵

每个 Provider 必须声明 `meta`，描述自身支持的区域、货币、能力与签名方式：

```typescript
interface ProviderMeta {
  name: string
  regions: string[]          // 支持的区域，如 ['US', 'EU', 'SG']
  currencies: string[]       // 支持的货币，如 ['USD', 'EUR', 'SGD']
  settlementModes: string[]  // 结算模式
  capabilities: {
    payment: boolean
    refund: boolean
    webhook: boolean
    subscription: boolean
    split: boolean
    reconciliation: boolean
    risk: boolean
    settlement: boolean
    signatures: string[]     // 支持的签名方式，如 ['hmac-sha256', 'rsa2']
  }
}
```

对于**未支持的能力**，Provider 调用时会返回 `PayPlexCapabilityError`，错误信息中明确说明哪个 Provider 不支持哪个能力，而非模糊失败。

## 覆盖已有 Provider

同名 Provider 后注册的会覆盖前者：

```typescript
pay.useProvider(stripeProvider({ apiKey: 'old-key' }))
pay.useProvider(stripeProvider({ apiKey: 'new-key' }))  // 覆盖
```

## defineProvider() — 自定义 Provider

通过 `defineProvider()` 工厂函数创建自定义 Provider：

```typescript
import { defineProvider } from 'payplex'

const myProvider = defineProvider({
  meta: {
    name: 'my-pay',
    regions: ['CN'],
    currencies: ['CNY'],
    settlementModes: ['t1'],
    capabilities: {
      payment: true,
      refund: true,
      webhook: true,
      subscription: false,
      split: false,
      reconciliation: false,
      risk: false,
      settlement: false,
      signatures: ['hmac-sha256'],
    },
  },

  create(config: { apiKey: string }) {
    return {
      async createOrder(params) {
        // 自定义实现
        return { providerOrderId: '...', status: 'pending' }
      },
      async queryOrder(id, options) {
        // 自定义实现
        return { orderId: id, status: 'paid' }
      },
      async refund(params) {
        return { refundId: params.refundId, status: 'success' }
      },
      async verifyWebhook(payload, signature) {
        // 验签逻辑
        return { type: 'payment.success', orderId: '...' }
      },
    }
  },
})

pay.useProvider(myProvider({ apiKey: 'my-key' }))
```

详见 [自定义 Provider 示例](/examples/custom-provider)。

## 发布插件包

你可以将 Provider 发布为独立的 npm 包，命名建议：

- `payplex-<渠道名>` — 开源社区包，如 `payplex-razorpay`
- `@scope/payplex-<渠道名>` — 组织/私有包，如 `@acme/payplex-internal`

插件包只需导出由 `defineProvider()` 创建的工厂函数，不需要将 `payplex` 列为 `dependencies`，只需列为 `peerDependencies`。

