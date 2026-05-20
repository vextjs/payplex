# 能力分层

## 概念

PayPlex 将支付能力分为两层：

1. **基础支付能力** — 固定在 `IPayProvider` 接口，所有 Provider 必须实现
2. **高级金融能力** — 通过 Capability Plugin 或 Provider Capability Adapter 按需暴露

这样的设计确保基础支付接口保持简洁，高级能力不污染核心接口，且不同 Provider 可以只声明自己支持的高级能力子集。

## 基础支付能力

| 方法 | 说明 | 是否必须 |
|---|---|---|
| `createOrder` | 创建支付订单 | ✅ 必须 |
| `queryOrder` | 查询订单状态 | ✅ 必须 |
| `refund` | 发起退款 | ✅ 必须 |
| `verifyWebhook` | Webhook 验签 | ✅ 必须 |
| `cancelOrder` | 取消订单 | ⚠️ 可选 |

## 高级金融能力

| 能力 | 接口 | 首期参考实现 |
|---|---|---|
| 订阅扣款 | `ISubscriptionCapability` | Stripe |
| 分账 | `ISplitCapability` | Stripe Connect |
| 对账 | `IReconciliationCapability` | Stripe Reports |
| 风控 | `IRiskCapability` | 外部风控引擎接入 |
| 结算 | `ISettlementCapability` | Stripe Payouts |

## 查询能力

```typescript
// 查询某 Provider 支持的所有能力
const caps = pay.listCapabilities('stripe')
// {
//   payment: true, refund: true, webhook: true,
//   subscription: true, split: true,
//   reconciliation: true, risk: false, settlement: true,
// }

// 检查某能力是否支持
if (caps.subscription) {
  // 可以使用订阅
}
```

## 使用高级能力

高级能力有两种获取路径：

- **Provider capability adapter**：从 `pay.provider('xxx')` 获取（如订阅、分账）
- **全局 capability plugin**：通过 `pay.useCapabilityPlugin()` 注册后，从 `pay` 获取（如通用风控插件）

```typescript
import { getCapability } from 'payplex'

// 订阅
const subscription = getCapability(pay.provider('stripe'), 'subscription')
if (!subscription) throw new Error('当前 Provider 不支持订阅能力')
await subscription.create({ customerId: 'cus_xxx', planId: 'plan_pro_monthly' })

// 分账
const split = getCapability(pay.provider('stripe'), 'split')
await split.execute({
  orderId: 'order_001',
  routes: [
    { accountId: 'acct_vendor', amount: 8000, currency: 'usd' },
    { accountId: 'acct_platform', amount: 1900, currency: 'usd' },
  ],
})
```

## Provider 不支持能力时的行为

对于 Provider 不支持的能力，`getCapability` 返回 `null`，或者调用 Provider 上不存在的能力会抛出 `PayPlexCapabilityError`：

```typescript
const risk = getCapability(pay.provider('xendit'), 'risk')
// null — Xendit Provider 未声明 risk 能力

// 或者直接调用时抛出
try {
  await someCapabilityCall()
} catch (err) {
  if (err instanceof PayPlexCapabilityError) {
    console.log(err.message)
    // "Provider 'xendit' 不支持 'risk' 能力，请检查 ProviderMeta.capabilities"
  }
}
```

## 自定义能力插件

通过 `useCapabilityPlugin()` 挂载自定义高级能力：

```typescript
import { defineCapabilityPlugin } from 'payplex'

const myRiskPlugin = defineCapabilityPlugin({
  name: 'risk',
  create(config: { apiUrl: string }) {
    return {
      async evaluate(params) {
        const score = await callRiskEngine(config.apiUrl, params)
        return { score, decision: score > 80 ? 'reject' : 'approve' }
      },
    }
  },
})

pay.useCapabilityPlugin(myRiskPlugin({ apiUrl: process.env.RISK_API_URL! }))

const risk = getCapability(pay, 'risk')
```

详细说明见各高级能力专页：

- [订阅扣款](/guide/subscription)
- [分账](/guide/split)
- [对账](/guide/reconciliation)
- [风控](/guide/risk)
- [结算](/guide/settlement)

