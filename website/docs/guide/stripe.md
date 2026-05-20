# Stripe 集成指南

PayPlex 内置 Stripe Provider，支持 PaymentIntent 和 Checkout Session 两种支付模式。

## 安装

```bash
npm install payplex stripe
```

---

## 初始化

```typescript
import { PayPlex } from 'payplex'
import { stripeProvider } from 'payplex/stripe'

const pay = new PayPlex({
  db: {
    url: process.env.MONGODB_URL!,
    dbName: 'my-app-payments',
  },
})

pay.useProvider(
  stripeProvider({
    apiKey: process.env.STRIPE_SECRET_KEY!,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
  })
)
```

---

## 完整配置参数

```typescript
stripeProvider({
  // ─── 必填 ──────────────────────────────────────────────

  /**
   * Stripe 密钥。
   * - 测试环境：sk_test_51...
   * - 生产环境：sk_live_51...
   *
   * 从 Stripe Dashboard → Developers → API keys 获取。
   */
  apiKey: process.env.STRIPE_SECRET_KEY!,

  /**
   * Webhook 端点签名密钥。
   * - 格式：whsec_...
   * - 本地开发：由 stripe listen 命令输出
   * - 生产：在 Stripe Dashboard → Webhooks 创建端点后获取
   *
   * 使用 verifyWebhook() 或 createHandler() 时必须提供。
   */
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,

  // ─── 可选 ──────────────────────────────────────────────

  /**
   * 支付模式。
   * - 'payment_intent'（默认）：适合单次支付，前端使用 Stripe.js 完成支付
   * - 'checkout'：Stripe 托管的支付页面，用户跳转后完成支付，结果通过 returnUrl 回调
   */
  mode?: 'payment_intent' | 'checkout',

  /**
   * Stripe API 版本。默认使用 PayPlex 内置的稳定版本。
   * 通常不需要手动指定，除非有特定版本需求。
   * 格式：'YYYY-MM-DD'，如 '2024-06-20'
   */
  apiVersion?: string,

  /**
   * 网络错误自动重试次数。默认 2。
   * 重试采用指数退避策略，仅对网络类错误生效，不重试支付拒绝等业务错误。
   */
  maxNetworkRetries?: number,  // 默认: 2

  /**
   * HTTP 请求超时（毫秒）。默认 80000（80 秒）。
   */
  timeout?: number,            // 默认: 80000

  /**
   * 可发布密钥（Publishable Key）。
   * - 格式：pk_test_... 或 pk_live_...
   * - 仅在需要从服务端传递给前端时使用（如动态返回 Stripe 配置 API）
   * - 大多数服务端场景不需要此参数
   */
  publishableKey?: string,
})
```

---

## 环境变量设置

在项目根目录创建 `.env` 文件：

```ini
# 测试环境（开发时使用）
STRIPE_SECRET_KEY=sk_test_51...
STRIPE_WEBHOOK_SECRET=whsec_...    # 见下方"获取 Webhook Secret"

# 生产环境
# STRIPE_SECRET_KEY=sk_live_51...
# STRIPE_WEBHOOK_SECRET=whsec_...
```

:::danger 密钥安全
- 永远不要将 `sk_live_...` 密钥提交到 Git
- 在 `.gitignore` 中添加 `.env`
- 生产环境通过环境变量或 Secret Manager 注入密钥
:::

---

## 获取 Stripe 密钥

### Secret Key

1. 登录 [Stripe Dashboard](https://dashboard.stripe.com)
2. 进入 **Developers → API keys**
3. 复制 **Secret key**（`sk_test_...`）

### Webhook Secret

#### 本地开发（Stripe CLI）

```bash
# 安装 Stripe CLI（macOS）
brew install stripe/stripe-cli/stripe

# Windows / Linux 见 https://stripe.com/docs/stripe-cli

# 登录 Stripe
stripe login

# 开始转发 Webhook（会打印出 Webhook Secret）
stripe listen --forward-to localhost:3000/webhooks/stripe
# > Ready! Your webhook signing secret is whsec_xxxxxxxxxxxx (^C to quit)
#                                           ^^^^ 将此值填入 .env
```

#### 生产环境

1. 登录 [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/webhooks)
2. 点击 **Add endpoint**
3. 填写端点 URL：`https://your-domain.com/webhooks/stripe`
4. 选择需要监听的事件（见下方推荐清单）
5. 保存后，进入端点详情，复制 **Signing secret**（`whsec_...`）

---

## Stripe 支持的能力

| 能力 | 支持状态 | 说明 |
|---|---|---|
| 创建订单 | ✅ | PaymentIntent 和 Checkout Session 两种模式 |
| 查询订单 | ✅ | 本地记录或实时查询 Stripe |
| 退款 | ✅ | 全额和部分退款 |
| 取消订单 | ✅ | 取消未支付的 PaymentIntent |
| Webhook 验签 | ✅ | HMAC-SHA256 |
| 订阅（`ISubscriptionCapability`）| ✅ | Stripe Billing |
| 分账（`ISplitCapability`）| ✅ | Stripe Connect |
| 对账（`IReconciliationCapability`）| ✅ | Stripe Reports |
| 结算（`ISettlementCapability`）| ✅ | Stripe Payouts |
| 风控（`IRiskCapability`）| ❌ | 需通过 Capability Plugin 外接 |

---

## 推荐监听的 Stripe Webhook 事件

在 Stripe Dashboard 创建端点时，建议选择以下事件：

```
# 基础支付
payment_intent.succeeded
payment_intent.payment_failed
payment_intent.processing
charge.refunded
charge.refund.updated

# 订阅（如使用 Stripe Billing）
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
invoice.payment_succeeded
invoice.payment_failed
invoice.finalized
```

---

## 支付模式详解

### PaymentIntent 模式（默认）

适合需要完全控制支付 UI 的场景，使用 Stripe.js + React Stripe.js 在前端完成支付：

```typescript
// 后端：创建 PaymentIntent
const order = await pay.provider('stripe').createOrder({
  orderId: 'order_001',
  amount: 9900,
  currency: 'usd',
  subject: 'Pro 会员',
})

// order.raw.client_secret 返回给前端
return { clientSecret: (order.raw as any).client_secret }
```

```typescript
// 前端：使用 Stripe.js 完成支付
const stripe = await loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)
await stripe.confirmPayment({
  elements,
  confirmParams: { return_url: 'https://your-app.com/payment/success' },
})
```

### Checkout Session 模式

适合快速接入，用户跳转到 Stripe 托管的支付页面完成支付：

```typescript
const order = await pay.provider('stripe').createOrder({
  orderId: 'order_001',
  amount: 9900,
  currency: 'usd',
  subject: 'Pro 会员',
  returnUrl: 'https://your-app.com/payment/success?orderId=order_001',
})

// 将用户重定向到 order.paymentUrl
redirect(order.paymentUrl!)
```

---

## 测试卡号

在测试环境，使用以下测试卡号：

| 场景 | 卡号 | 有效期 | CVV |
|---|---|---|---|
| 支付成功 | `4242 4242 4242 4242` | 任意未过期 | 任意 3 位 |
| 支付被拒绝 | `4000 0000 0000 0002` | 任意未过期 | 任意 3 位 |
| 需要 3D 验证 | `4000 0025 0000 3155` | 任意未过期 | 任意 3 位 |
| 余额不足 | `4000 0000 0000 9995` | 任意未过期 | 任意 3 位 |

完整测试卡列表见 [Stripe 文档](https://stripe.com/docs/testing#cards)。

---

## 常见问题

### Webhook 验签失败（400 错误）

**原因 1：使用了错误的 Webhook Secret**

确认你使用的是对应端点的 Secret，而不是 API Key。本地开发时，Secret 由 `stripe listen` 输出，生产端点使用 Dashboard 中的 Secret。

**原因 2：Body 被解析前就传给了 PayPlex**

Stripe 验签需要**原始未解析的 raw body**。确保在 `express.json()` **之前**注册 Webhook 路由，并使用 `express.raw()`：

```typescript
// ✅ 正确：Webhook 在 express.json() 之前
app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), pay.createHandler('stripe'))
app.use(express.json())

// ❌ 错误：express.json() 在前，body 已被解析
app.use(express.json())
app.post('/webhooks/stripe', pay.createHandler('stripe'))
```

**原因 3：Stripe 发送重试时时间戳过期**

Stripe 要求 Webhook 在 5 分钟内处理。如果服务器响应太慢或时钟偏移，可增加 `tolerance`：

```typescript
// 手动验签时可以增加容忍时间
const valid = await signer.webhook.verifyStripe({
  payload: req.body,
  signature: req.headers['stripe-signature'],
  secret: process.env.STRIPE_WEBHOOK_SECRET!,
  tolerance: 600,  // 允许 600 秒偏差（默认 300 秒）
})
```

### 支付成功后 Hook 没有触发

确认已正确配置 Webhook 端点并选择了正确的事件类型，且 Webhook Secret 对应正确的端点。可在 Stripe Dashboard 的端点详情页查看历史投递记录和错误信息。

### 如何区分测试和生产环境

PayPlex 通过 `apiKey` 的前缀自动识别环境：
- `sk_test_...` → 测试模式，所有操作对应 Stripe 测试账户
- `sk_live_...` → 生产模式

无需任何额外配置。

