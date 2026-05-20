# 类型定义

## 核心类型

```typescript
import type {
  PayPlexOptions,
  PayPlexDbConfig,
  PayPlexHooks,
  PayPlexLogger,
  IPayProvider,
  ProviderMeta,
  ProviderCapabilityMatrix,
  CreateOrderParams,
  QueryOrderOptions,
  OrderResult,
  OrderStatusResult,
  OrderStatus,
  RefundParams,
  RefundResult,
  WebhookEvent,
  SignatureToolkit,
  ICapabilityPlugin,
} from 'payplex'
```

## `PayPlexOptions`

```typescript
interface PayPlexOptions {
  /**
   * 数据库连接配置或已有 MonSQLize 实例。
   * 不传时持久化功能禁用，操作仍可正常工作，但不落库。
   */
  db?: PayPlexDbConfig | MonSQLizeRuntimeLike

  /** 默认 Provider 名称，设置后可通过 pay.provider() 省略参数 */
  defaultProvider?: string

  /** 生命周期 Hook 配置 */
  hooks?: PayPlexHooks

  /** 自定义日志器，默认输出到 console */
  logger?: PayPlexLogger
}
```

## `PayPlexDbConfig`

传入连接配置时，PayPlex 会在首次使用时自动建立数据库连接，无需手动创建 MonSQLize 实例。

```typescript
interface PayPlexDbConfig {
  /** MongoDB 连接字符串，如 mongodb://localhost:27017 */
  url: string

  /** 数据库名称 */
  dbName: string

  /** 连接池大小，默认 5 */
  poolSize?: number

  /** 连接超时（毫秒），默认 10000 */
  connectTimeout?: number
}
```

## `PayPlexHooks`

PayPlex 提供两类 Hook：

- **操作 Hook** — 在 API 调用前后同步触发，`before*` 可修改参数或中止操作
- **事件 Hook** — 由 Webhook 处理完成后触发，用于业务侧副作用（通知、MQ、激活服务等）

```typescript
interface PayPlexHooks {
  // ─── 订单 ─────────────────────────────────────────────
  /**
   * 下单前触发。
   * - 返回修改后的 params 可改变下单参数
   * - 抛出错误将中止下单
   */
  beforeCreateOrder?: (params: CreateOrderParams) => Promise<CreateOrderParams | void>

  /** 下单成功并持久化后触发。抛出错误不影响主流程，由 logger 记录。 */
  afterCreateOrder?: (result: OrderResult) => Promise<void>

  /** 取消订单前触发。抛出错误将中止取消操作。 */
  beforeCancelOrder?: (orderId: string) => Promise<void>

  /** 取消订单完成后触发。 */
  afterCancelOrder?: (orderId: string) => Promise<void>

  // ─── 退款 ─────────────────────────────────────────────
  /**
   * 退款前触发。
   * - 返回修改后的 params 可改变退款参数
   * - 抛出错误将中止退款
   */
  beforeRefund?: (params: RefundParams) => Promise<RefundParams | void>

  /** 退款请求已发送给支付网关后触发。抛出错误不影响主流程。 */
  afterRefund?: (result: RefundResult) => Promise<void>

  // ─── 支付事件（由 Webhook 触发）──────────────────────
  /** 收到支付成功 Webhook 并验签通过后触发 */
  onPaymentSuccess?: (event: WebhookEvent) => Promise<void>

  /** 收到支付失败 Webhook 并验签通过后触发 */
  onPaymentFailed?: (event: WebhookEvent) => Promise<void>

  /** 收到支付待处理 Webhook 并验签通过后触发（如银行转账等异步渠道）*/
  onPaymentPending?: (event: WebhookEvent) => Promise<void>

  // ─── 退款事件（由 Webhook 触发）──────────────────────
  /** 收到退款成功 Webhook 并验签通过后触发 */
  onRefundSuccess?: (event: WebhookEvent) => Promise<void>

  /** 收到退款失败 Webhook 并验签通过后触发 */
  onRefundFailed?: (event: WebhookEvent) => Promise<void>

  // ─── 订阅事件（由 Webhook 触发）──────────────────────
  /** 新订阅创建成功后触发 */
  onSubscriptionCreated?: (event: WebhookEvent) => Promise<void>

  /** 订阅扣款成功（续费）后触发 */
  onSubscriptionRenewed?: (event: WebhookEvent) => Promise<void>

  /** 订阅已取消后触发 */
  onSubscriptionCanceled?: (event: WebhookEvent) => Promise<void>

  /** 订阅扣款失败后触发 */
  onSubscriptionPaymentFailed?: (event: WebhookEvent) => Promise<void>

  // ─── Webhook 处理 ──────────────────────────────────────
  /** Webhook 到达，验签之前触发（传入原始 payload），适合请求日志 */
  onWebhookReceived?: (raw: unknown) => Promise<void>

  /** Webhook 验签并标准化完成后触发 */
  onWebhookProcessed?: (event: WebhookEvent) => Promise<void>

  /** Webhook 验签失败或处理中抛出未捕获异常时触发 */
  onWebhookError?: (err: Error, raw: unknown) => Promise<void>
}
```

## `ProviderMeta`

```typescript
interface ProviderMeta {
  name: string
  regions: string[]
  currencies: string[]
  settlementModes: string[]
  capabilities: ProviderCapabilityMatrix
}

interface ProviderCapabilityMatrix {
  payment: boolean
  refund: boolean
  webhook: boolean
  subscription: boolean
  split: boolean
  reconciliation: boolean
  risk: boolean
  settlement: boolean
  signatures: string[]
}
```

## `OrderStatus`

```typescript
type OrderStatus = 'pending' | 'paid' | 'failed' | 'refunded' | 'cancelled'
```

## `CreateOrderParams`

```typescript
interface CreateOrderParams {
  orderId: string
  amount: number                         // 最小货币单位（分）
  currency: string
  subject: string
  notifyUrl?: string
  returnUrl?: string
  extra?: Record<string, unknown>
}
```

## `OrderResult`

```typescript
interface OrderResult {
  orderId: string
  providerOrderId: string
  paymentUrl?: string
  status: OrderStatus
  provider: string
  createdAt: Date
  raw: unknown
}
```

## `QueryOrderOptions`

```typescript
interface QueryOrderOptions {
  idType?: 'orderId' | 'providerOrderId'
}
```

## `OrderStatusResult`

```typescript
interface OrderStatusResult {
  orderId: string
  providerOrderId: string
  status: OrderStatus
  amount: number
  currency: string
  paidAt?: Date
  provider: string
  raw: unknown
}
```

## `RefundParams`

```typescript
interface RefundParams {
  orderId: string
  refundId: string
  amount?: number   // 不填则全额退款
  reason?: string
}
```

## `RefundResult`

```typescript
interface RefundResult {
  refundId: string
  providerRefundId: string
  status: 'success' | 'pending' | 'failed'
  amount: number
  provider: string
  raw: unknown
}
```

## `WebhookEvent`

```typescript
interface WebhookEvent {
  type: string              // 标准化事件类型，如 'payment.success'
  providerEventType: string // Provider 原始事件类型
  orderId: string
  providerOrderId: string
  amount?: number
  currency?: string
  provider: string
  raw: unknown
}
```

## 错误类型

```typescript
import {
  PayPlexError,
  PayPlexProviderError,
  PayPlexSignatureError,
  PayPlexCapabilityError,
  PayPlexPersistenceError,
  PayPlexValidationError,
  PayPlexIdempotencyError,
} from 'payplex'
```

所有错误均继承自 `PayPlexError`：

```typescript
class PayPlexError extends Error {
  readonly provider?: string    // 相关 Provider 名称
  readonly operation?: string   // 触发错误的操作
  readonly orderId?: string     // 关联业务 ID
  readonly raw?: unknown        // 原始错误
}
```
