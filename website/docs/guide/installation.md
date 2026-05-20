# 安装

## npm

```bash
npm install payplex
```

## pnpm

```bash
pnpm add payplex
```

## yarn

```bash
yarn add payplex
```

## 可选依赖

PayPlex 采用**可选依赖策略**，各 Provider SDK 按需安装：

| Provider | 安装命令 |
|---|---|
| Stripe（默认内置） | `npm install stripe` |
| 支付宝（插件）| `npm install payplex-alipay alipay-sdk` |
| 微信支付（插件）| `npm install payplex-wechat` |

:::info
未安装某 Provider 的 SDK 时，调用该 Provider 会收到明确的依赖缺失提示，而非模糊运行时错误。
:::

## 规划中的区域插件

以下区域插件包名目前仅作为**未来命名约定**，尚未发布到 npm，因此暂时**不要直接执行安装命令**：

| 渠道 | 未来包名 | 状态 |
|---|---|---|
| Xendit | `payplex-xendit` | 规划中 |
| PayMongo | `payplex-paymongo` | 规划中 |
| Razorpay | `payplex-razorpay` | 规划中 |

发布前请先查看项目 README / Release 说明确认可用性。

## 环境要求

- Node.js >= 18.0.0
- TypeScript 5.x（推荐，也支持纯 JavaScript）

## ESM / CJS 支持

PayPlex 同时支持 ESM 和 CJS：

```typescript
// ESM
import { PayPlex } from 'payplex'
import { stripeProvider } from 'payplex/stripe'
import { hmacSign } from 'payplex/signatures'

// CJS
const { PayPlex } = require('payplex')
const { stripeProvider } = require('payplex/stripe')
```

## 包导出结构

```
payplex          — 核心入口（PayPlex 类、类型、错误）
payplex/stripe   — 默认内置 Stripe Provider
payplex/signatures  — 公共签名工具
payplex/capabilities  — 能力接口类型
payplex/persistence   — monSQLize stores（如需直接访问）
```

