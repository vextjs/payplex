# 风控

## 概述

风控能力允许你在关键支付节点（如下单、退款）接入风控引擎，对可疑交易进行评分、拦截或人工审核。

PayPlex 提供 `IRiskCapability` 扩展点，首期不内置风控引擎，需要通过 Capability 插件接入外部风控服务。

## 注册风控插件

```typescript
import { defineCapabilityPlugin } from 'payplex'

const riskPlugin = defineCapabilityPlugin({
  name: 'risk',
  create(config: { apiUrl: string; apiKey: string; threshold?: number }) {
    const threshold = config.threshold ?? 80

    return {
      async evaluate(params) {
        const res = await fetch(`${config.apiUrl}/evaluate`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            orderId: params.orderId,
            amount: params.amount,
            currency: params.currency,
            userId: params.userId,
            ip: params.ip,
            extra: params.extra,
          }),
        })
        const { score, tags, decision } = await res.json()
        return {
          score,
          tags,
          decision: score >= threshold ? 'reject' : decision,
          raw: { score, tags },
        }
      },
    }
  },
})

pay.useCapabilityPlugin(
  riskPlugin({
    apiUrl: process.env.RISK_API_URL!,
    apiKey: process.env.RISK_API_KEY!,
    threshold: 75,
  })
)
```

## 在 Hook 中接入风控

结合 `beforeCreateOrder` Hook 实现下单前风控拦截：

```typescript
import { getCapability } from 'payplex'

const pay = new PayPlex({
  db,
  hooks: {
    beforeCreateOrder: async (params) => {
      const risk = getCapability(pay, 'risk')  // 全局注册的风控 capability plugin
      if (!risk) return  // 未配置风控，放行

      const result = await risk.evaluate({
        orderId: params.orderId,
        amount: params.amount,
        currency: params.currency,
        userId: params.extra?.userId as string,
        ip: params.extra?.ip as string,
      })

      if (result.decision === 'reject') {
        throw new Error(`风控拦截：订单 ${params.orderId} 风险分 ${result.score}`)
      }

      // 高风险但未拒绝：打标记，人工审核
      if (result.score >= 60) {
        return {
          ...params,
          extra: { ...params.extra, riskScore: result.score, needReview: true },
        }
      }
    },
  },
})
```

## 持久化

风控决策记录自动落入 `risk_decisions` collection（需传入 `db`）。

