# 区域渠道支持

## 概述

PayPlex 的能力矩阵机制原生支持东南亚、菲律宾、印度等区域的中小型支付渠道接入，无需修改核心代码：

- 渠道只需实现其支持的能力子集
- 通过 `ProviderMeta` 显式声明区域、货币、能力
- 对未支持的能力返回明确错误，而非模糊失败

## 计划中的区域插件

:::info
以下区域插件目前处于**规划阶段**，尚未发布到 npm。请关注 [GitHub Releases](https://github.com/Rocky-k/payplex) 获取发布通知。
:::

| 渠道 | 覆盖区域 | 未来包名 |
|---|---|---|
| Xendit | 菲律宾 / 印尼 / 泰国 / 越南 / 马来西亚 | `payplex-xendit` |
| PayMongo | 菲律宾 | `payplex-paymongo` |
| Razorpay | 印度 | `payplex-razorpay` |
| GoPay | 印尼 | `payplex-gopay` |
| PromptPay | 泰国 | `payplex-promptpay` |
| 支付宝国际 | 东南亚 / 香港 | `payplex-alipay-intl` |

## 使用区域渠道插件

```typescript
import { xenditProvider } from 'payplex-xendit'

pay.useProvider(
  xenditProvider({
    apiKey: process.env.XENDIT_API_KEY!,
  })
)

// 查看能力矩阵
const meta = pay.provider('xendit').meta
// {
//   name: 'xendit',
//   regions: ['PH', 'ID', 'TH', 'VN', 'MY'],
//   currencies: ['PHP', 'IDR', 'THB', 'VND', 'MYR'],
//   capabilities: {
//     payment: true,
//     refund: true,
//     webhook: true,
//     subscription: false,  ← 不支持
//     split: true,
//     ...
//   }
// }
```

## 开发区域渠道插件

以下是区域渠道插件的模板，完整示例见 [区域渠道接入示例](/examples/regional-provider)。

```typescript
import { defineProvider } from 'payplex'

export const xenditProvider = defineProvider({
  meta: {
    name: 'xendit',
    regions: ['PH', 'ID', 'TH', 'VN', 'MY'],
    currencies: ['PHP', 'IDR', 'THB', 'VND', 'MYR'],
    settlementModes: ['t1', 't3', 'weekly'],
    capabilities: {
      payment: true,
      refund: true,
      webhook: true,
      subscription: false,
      split: true,
      reconciliation: true,
      risk: false,
      settlement: true,
      signatures: ['hmac-sha256'],   // 声明支持的签名方式
    },
  },

  create(config: { apiKey: string }) {
    return {
      async createOrder(params) {
        // 调用 Xendit API 创建 Invoice / PaymentRequest
        const res = await xenditClient.createInvoice({  // xenditClient 为 Xendit SDK 初始化实例
          external_id: params.orderId,
          amount: params.amount / 100,   // Xendit 使用元，不用分
          currency: params.currency.toUpperCase(),
          description: params.subject,
          ...
        })
        return {
          orderId: params.orderId,
          providerOrderId: res.id,
          paymentUrl: res.invoice_url,
          status: 'pending',
        }
      },

      async queryOrder(id, options) {
        if (options?.idType === 'providerOrderId') {
          const res = await xenditClient.getInvoice(id)
          return mapXenditStatus(res)
        }
        // 按 orderId 查询本地记录
        return queryLocalOrder(id)
      },

      async refund(params) {
        const res = await xenditClient.createRefund({
          invoice_id: params.providerOrderId,
          amount: params.amount,
          external_id: params.refundId,
        })
        return { refundId: params.refundId, status: 'success', raw: res }
      },

      async verifyWebhook(payload, signature) {
        // Xendit 通过 x-callback-token 验签
        const token = process.env.XENDIT_WEBHOOK_TOKEN
        if (signature !== token) throw new Error('Webhook token mismatch')
        const body = payload as Record<string, unknown>
        return {
          type: mapXenditEventType(body.status as string),
          providerEventType: body.status as string,
          orderId: body.external_id as string,
          providerOrderId: body.id as string,
          amount: (body.amount as number) * 100,
          currency: (body.currency as string).toLowerCase(),
          raw: body,
        }
      },
    }
  },
})
```

## 能力矩阵的重要性

### 区域差异

| 渠道 | subscription | split | reconciliation | settlement |
|---|---|---|---|---|
| Stripe | ✅ | ✅ | ✅ | ✅ |
| Xendit | ❌ | ✅ | ✅ | ✅ |
| PayMongo | ❌ | ❌ | ✅ | ✅ |
| Razorpay | ✅ | ✅ | ✅ | ✅ |

区域渠道经常只支持部分能力。通过能力矩阵，业务代码可以在运行时做出调整：

```typescript
const caps = pay.listCapabilities(selectedProvider)

if (!caps.subscription) {
  // 降级：提示用户该渠道不支持订阅，改用一次性支付
  return handleOneTimePayment(params)
}

await subscription.create(params)
```

### 签名差异

区域渠道的签名方式各不相同，通过 `meta.capabilities.signatures` 声明，业务侧可知道需要使用哪种签名工具：

```typescript
const meta = pay.provider('alipay').meta
// meta.capabilities.signatures: ['rsa2']

// 使用公共签名层
const signer = pay.signatures()
const sig = await signer.rsa2.sign({ privateKey: '...', data: rawString })
```

## 多渠道场景

```typescript
// 根据用户所在区域选择 Provider
function selectProvider(userRegion: string): string {
  if (userRegion === 'PH') return 'xendit'
  if (userRegion === 'IN') return 'razorpay'
  if (userRegion === 'TH') return 'promptpay'
  return 'stripe'  // 默认
}

const providerName = selectProvider(user.country)
const order = await pay.provider(providerName).createOrder({ ... })
```

