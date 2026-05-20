# 插件系统

## 两类插件

PayPlex 支持两种插件扩展点：

| 类型 | 用途 | 工厂函数 |
|---|---|---|
| **Provider 插件** | 接入新的支付渠道 | `defineProvider()` |
| **Capability 插件** | 扩展高级金融能力 | `defineCapabilityPlugin()` |

## Provider 插件

详见 [Provider 体系](/guide/providers) 和 [自定义 Provider 示例](/examples/custom-provider)。

```typescript
import { defineProvider } from 'payplex'

export const myProvider = defineProvider({
  meta: { name: 'my-pay', ... },
  create(config) {
    return {
      async createOrder(params) { ... },
      async queryOrder(id, opts) { ... },
      async refund(params) { ... },
      async verifyWebhook(payload, sig) { ... },
    }
  },
})
```

## Capability 插件

用于扩展或覆盖高级金融能力（订阅、分账、对账、风控、结算）：

```typescript
import { defineCapabilityPlugin } from 'payplex'

// 自定义风控插件
export const myRiskPlugin = defineCapabilityPlugin({
  name: 'risk',
  create(config: { apiUrl: string; apiKey: string }) {
    return {
      async evaluate(params) {
        const res = await fetch(`${config.apiUrl}/evaluate`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${config.apiKey}` },
          body: JSON.stringify(params),
        })
        const { score, decision } = await res.json()
        return { score, decision }
      },
    }
  },
})

// 注册
pay.useCapabilityPlugin(
  myRiskPlugin({
    apiUrl: process.env.RISK_API_URL!,
    apiKey: process.env.RISK_API_KEY!,
  })
)

// 使用
import { getCapability } from 'payplex'
const risk = getCapability(pay, 'risk')
const result = await risk?.evaluate({ orderId: 'order_001', amount: 9900, userId: 'user_001' })
```

## 插件生命周期

Provider 和 Capability 插件在 `useProvider()` / `useCapabilityPlugin()` 时完成初始化，不支持动态加载/卸载（设计上是方法即配置）。

## 发布插件到 npm

```json
// package.json
{
  "name": "payplex-my-plugin",
  "version": "1.0.0",
  "peerDependencies": {
    "payplex": ">=0.0.1"
  },
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  }
}
```

插件包只需将 `payplex` 列为 `peerDependencies`，不作为 `dependencies`，避免版本冲突。

