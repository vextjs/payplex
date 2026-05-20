# IPayProvider 接口

## 接口定义

```typescript
interface IPayProvider {
  readonly name: string
  readonly meta: ProviderMeta
  createOrder(params: CreateOrderParams): Promise<OrderResult>
  queryOrder(id: string, options?: QueryOrderOptions): Promise<OrderStatusResult>
  refund(params: RefundParams): Promise<RefundResult>
  verifyWebhook(payload: unknown, signature: string): Promise<WebhookEvent>
  cancelOrder?(orderId: string): Promise<void>
}
```

## `createOrder`

创建支付订单。

**参数 `CreateOrderParams`**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `orderId` | `string` | ✅ | 业务订单 ID（幂等键）|
| `amount` | `number` | ✅ | 金额，单位：分（最小货币单位）|
| `currency` | `string` | ✅ | 货币代码，如 `'usd'`、`'cny'`、`'php'` |
| `subject` | `string` | ✅ | 订单描述 |
| `notifyUrl` | `string` | 否 | Webhook 回调地址 |
| `returnUrl` | `string` | 否 | 支付完成跳转地址 |
| `extra` | `Record<string, unknown>` | 否 | Provider 特有扩展字段 |

**返回 `OrderResult`**：

| 字段 | 类型 | 说明 |
|---|---|---|
| `orderId` | `string` | 业务订单 ID |
| `providerOrderId` | `string` | Provider 侧订单 ID |
| `paymentUrl` | `string \| undefined` | 跳转支付的 URL（如有）|
| `status` | `OrderStatus` | 订单初始状态 |
| `provider` | `string` | Provider 名称 |
| `createdAt` | `Date` | 订单创建时间 |
| `raw` | `unknown` | Provider 原始响应 |

## `queryOrder`

查询订单状态。

**参数**：

| 参数 | 类型 | 说明 |
|---|---|---|
| `id` | `string` | 订单 ID |
| `options.idType` | `'orderId' \| 'providerOrderId'` | ID 类型，默认 `'orderId'` |

- `idType: 'orderId'`（默认）— 查询本地 `payment_orders` collection
- `idType: 'providerOrderId'` — 向支付网关发起实时查询

**返回 `OrderStatusResult`**：

| 字段 | 类型 | 说明 |
|---|---|---|
| `orderId` | `string` | 业务订单 ID |
| `providerOrderId` | `string` | Provider 侧订单 ID |
| `status` | `OrderStatus` | 订单状态 |
| `amount` | `number` | 金额（分）|
| `currency` | `string` | 货币码 |
| `paidAt` | `Date \| undefined` | 支付时间 |
| `provider` | `string` | Provider 名称 |
| `raw` | `unknown` | Provider 原始响应 |

**`OrderStatus`**：

```typescript
type OrderStatus = 'pending' | 'paid' | 'failed' | 'refunded' | 'cancelled'
```

## `refund`

发起退款。

**参数 `RefundParams`**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `orderId` | `string` | ✅ | 业务订单 ID |
| `refundId` | `string` | ✅ | 退款幂等键 |
| `amount` | `number` | 否 | 退款金额（分），不填则全额退款 |
| `reason` | `string` | 否 | 退款原因 |

**返回 `RefundResult`**：

| 字段 | 类型 | 说明 |
|---|---|---|
| `refundId` | `string` | 退款 ID |
| `providerRefundId` | `string` | Provider 侧退款 ID |
| `status` | `'success' \| 'pending' \| 'failed'` | 退款状态 |
| `amount` | `number` | 实际退款金额 |
| `provider` | `string` | Provider 名称 |
| `raw` | `unknown` | Provider 原始响应 |

## `verifyWebhook`

验证 Webhook 签名并解析事件。

**参数**：

| 参数 | 类型 | 说明 |
|---|---|---|
| `payload` | `unknown` | Webhook 原始 body（建议传入 `Buffer`）|
| `signature` | `string` | 签名 header 值 |

**返回 `WebhookEvent`**：

| 字段 | 类型 | 说明 |
|---|---|---|
| `type` | `string` | 标准化事件类型，如 `'payment.success'` |
| `providerEventType` | `string` | Provider 原始事件类型 |
| `orderId` | `string` | 业务订单 ID |
| `providerOrderId` | `string` | Provider 侧订单 ID |
| `amount` | `number \| undefined` | 金额（分）|
| `currency` | `string \| undefined` | 货币码 |
| `provider` | `string` | Provider 名称 |
| `raw` | `unknown` | Provider 原始事件对象 |

**抛出**：`PayPlexSignatureError` — 签名验证失败

## `cancelOrder`（可选）

取消订单。并非所有 Provider 都支持，调用前确认 `meta.capabilities.payment`。

**参数**：`orderId: string`

**返回**：`Promise<void>`

