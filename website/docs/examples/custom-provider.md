# 自定义 Provider

本示例展示如何通过 `defineProvider()` 创建自定义支付 Provider，以对接不在官方插件列表中的支付服务商。

## 使用 `defineProvider()`

```typescript
import { defineProvider } from 'payplex'
import type { CreateOrderParams, OrderResult, RefundParams, RefundResult, WebhookEvent } from 'payplex'

interface MyProviderConfig {
  apiKey: string
  apiUrl?: string
  webhookSecret: string
}

export const myProvider = defineProvider({
  // 能力矩阵声明
  meta: {
    name: 'my-pay',
    regions: ['CN'],
    currencies: ['CNY'],
    settlementModes: ['t1', 'weekly'],
    capabilities: {
      payment: true,
      refund: true,
      webhook: true,
      subscription: false,
      split: false,
      reconciliation: true,
      risk: false,
      settlement: true,
      signatures: ['hmac-sha256'],
    },
  },

  create(config: MyProviderConfig) {
    const baseUrl = config.apiUrl ?? 'https://api.my-pay.example.com'

    async function callApi(path: string, body: unknown) {
      const res = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(`My-Pay API error: ${err.message}`)
      }
      return res.json()
    }

    return {
      async createOrder(params: CreateOrderParams): Promise<OrderResult> {
        const data = await callApi('/orders', {
          out_trade_no: params.orderId,
          total_fee: params.amount,
          currency: params.currency,
          subject: params.subject,
          notify_url: params.notifyUrl,
          return_url: params.returnUrl,
        })

        return {
          orderId: params.orderId,
          providerOrderId: data.trade_no,
          paymentUrl: data.pay_url,
          status: 'pending',
          provider: 'my-pay',
          createdAt: new Date(),
          raw: data,
        }
      },

      async queryOrder(id, options) {
        const isProviderOrder = options?.idType === 'providerOrderId'
        const query = isProviderOrder ? { trade_no: id } : { out_trade_no: id }
        const data = await callApi('/orders/query', query)

        return {
          orderId: data.out_trade_no,
          providerOrderId: data.trade_no,
          status: mapStatus(data.trade_state),
          amount: data.total_fee,
          currency: data.currency,
          paidAt: data.paid_at ? new Date(data.paid_at) : undefined,
          provider: 'my-pay',
          raw: data,
        }
      },

      async refund(params: RefundParams): Promise<RefundResult> {
        const data = await callApi('/refunds', {
          out_trade_no: params.orderId,
          out_refund_no: params.refundId,
          refund_fee: params.amount,
          refund_desc: params.reason,
        })

        return {
          refundId: params.refundId,
          providerRefundId: data.refund_no,
          status: 'success',
          amount: data.refund_fee,
          provider: 'my-pay',
          raw: data,
        }
      },

      async verifyWebhook(payload, signature): Promise<WebhookEvent> {
        // 使用公共签名层验签
        const { hmacVerify } = await import('payplex/signatures')
        const bodyStr = typeof payload === 'string'
          ? payload
          : Buffer.isBuffer(payload)
            ? payload.toString()
            : JSON.stringify(payload)

        const valid = await hmacVerify({
          key: config.webhookSecret,
          data: bodyStr,
          signature,
          algorithm: 'sha256',
        })

        if (!valid) {
          throw new Error('My-Pay Webhook signature verification failed')
        }

        const body = JSON.parse(bodyStr)
        return {
          type: mapEventType(body.event_type),
          providerEventType: body.event_type,
          orderId: body.out_trade_no,
          providerOrderId: body.trade_no,
          amount: body.total_fee,
          currency: body.currency,
          provider: 'my-pay',
          raw: body,
        }
      },

      // cancelOrder 是可选的
      async cancelOrder(orderId: string) {
        await callApi('/orders/cancel', { out_trade_no: orderId })
      },
    }
  },
})

function mapStatus(state: string) {
  const map: Record<string, string> = {
    NOTPAY: 'pending', SUCCESS: 'paid', CLOSED: 'cancelled',
    REFUND: 'refunded', PAYERROR: 'failed',
  }
  return (map[state] ?? 'pending') as any
}

function mapEventType(type: string) {
  const map: Record<string, string> = {
    PAY_SUCCESS: 'payment.success',
    PAY_FAILED: 'payment.failed',
    REFUND_SUCCESS: 'refund.success',
  }
  return map[type] ?? type
}
```

## 使用自定义 Provider

```typescript
import { PayPlex } from 'payplex'
import { myProvider } from './my-provider'

const pay = new PayPlex({ db })
pay.useProvider(
  myProvider({
    apiKey: process.env.MY_PAY_API_KEY!,
    webhookSecret: process.env.MY_PAY_WEBHOOK_SECRET!,
  })
)

await pay.provider('my-pay').createOrder({ ... })
```

## 发布为 npm 包

将自定义 Provider 发布为 `payplex-my-pay`：

```json
{
  "name": "payplex-my-pay",
  "version": "1.0.0",
  "peerDependencies": {
    "payplex": ">=0.0.1"
  },
  "exports": {
    ".": "./dist/index.js"
  }
}
```

其他用户只需：

```bash
npm install payplex-my-pay
```

```typescript
import { myProvider } from 'payplex-my-pay'
pay.useProvider(myProvider({ ... }))
```

