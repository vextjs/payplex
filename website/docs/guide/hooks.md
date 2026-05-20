# 生命周期 Hook

PayPlex 提供两类 Hook，覆盖支付全流程的关键节点：

| 类型 | 触发时机 | 典型用途 |
|---|---|---|
| **操作 Hook**（`before*` / `after*`）| API 调用前后，同步触发 | 参数校验、风控拦截、日志记录 |
| **事件 Hook**（`on*`）| Webhook 验签完成后触发 | 业务通知、激活服务、发送邮件、MQ 消息 |

> **关键原则**：PayPlex 内部已自动更新订单持久化状态（`paid` / `refunded` 等），**事件 Hook 不应操作数据库订单状态**，专注执行业务侧副作用即可。

---

## Hook 配置

在 `new PayPlex({ hooks: { ... } })` 中声明，或通过单独传入：

```typescript
const pay = new PayPlex({
  db: { url: process.env.MONGODB_URL!, dbName: 'payplex' },
  hooks: {
    onPaymentSuccess: async (event) => {
      await activateUserPlan(event.orderId)
    },
    onRefundSuccess: async (event) => {
      await sendRefundEmail(event.orderId)
    },
  },
})
```

所有 Hook 均为异步（`async`），**抛出的错误不会影响主支付流程**（由 logger 捕获）。

---

## 订单 Hook

### `beforeCreateOrder`

下单前触发。可修改参数，也可抛出错误中止下单。

```typescript
beforeCreateOrder: async (params) => {
  // 风控：高风险订单拦截
  if (params.amount > 1_000_000) {
    throw new Error('单笔金额不得超过 10,000 元，请联系客服')
  }

  // 参数增强：自动补全 notifyUrl
  return {
    ...params,
    notifyUrl: `${process.env.APP_URL}/webhooks/${params.extra?.provider ?? 'stripe'}`,
  }
}
```

### `afterCreateOrder`

下单成功并持久化后触发。

```typescript
afterCreateOrder: async (result) => {
  // 埋点上报
  await analytics.track('order_created', {
    orderId: result.orderId,
    provider: result.provider,
    amount: result.amount,    // 注意：从 extra 或原始 params 中取
  })
}
```

### `beforeCancelOrder`

取消订单前触发。抛出错误将中止取消操作。

```typescript
beforeCancelOrder: async (orderId) => {
  // 检查订单是否已超出可取消时间窗口
  const order = await orderService.get(orderId)
  if (order.createdAt < Date.now() - 30 * 60 * 1000) {
    throw new Error('订单创建超过 30 分钟，不可取消')
  }
}
```

### `afterCancelOrder`

取消订单完成后触发。

```typescript
afterCancelOrder: async (orderId) => {
  await releaseInventory(orderId)
}
```

---

## 退款 Hook

### `beforeRefund`

退款前触发。可修改退款参数，也可抛出错误中止退款。

```typescript
beforeRefund: async (params) => {
  // 退款权限校验（通过业务服务层查询）
  const isEligible = await orderService.isRefundEligible(params.orderId)
  if (!isEligible) {
    throw new Error('该订单不满足退款条件')
  }

  // 退款原因标准化
  return {
    ...params,
    reason: params.reason ?? '用户申请退款',
  }
}
```

### `afterRefund`

退款请求已发送到支付网关后触发（退款结果由后续 Webhook 确认）。

```typescript
afterRefund: async (result) => {
  // 记录退款操作日志
  await auditLog.write('refund_initiated', {
    refundId: result.refundId,
    status: result.status,
  })
}
```

---

## 支付事件 Hook（Webhook 触发）

以下 Hook 在 Stripe（或其他 Provider）发送 Webhook、验签通过后触发。

### `onPaymentSuccess`

支付成功。这是最常用的 Hook，用于激活服务、发货等。

```typescript
onPaymentSuccess: async (event) => {
  // event.orderId — 你的业务订单 ID
  // event.providerOrderId — Stripe PaymentIntent ID
  // event.amount — 支付金额（分）
  // event.currency — 货币
  // event.provider — 'stripe'

  await Promise.all([
    activateSubscription(event.orderId),
    sendReceiptEmail(event.orderId),
    analytics.track('payment_success', { orderId: event.orderId }),
  ])
}
```

### `onPaymentFailed`

支付失败（如卡被拒绝）。

```typescript
onPaymentFailed: async (event) => {
  await sendPaymentFailedNotification(event.orderId)
  await releaseCartItems(event.orderId)
}
```

### `onPaymentPending`

支付待处理（如银行转账、部分异步支付渠道）。

```typescript
onPaymentPending: async (event) => {
  await updateOrderStatusUI(event.orderId, 'processing')
}
```

---

## 退款事件 Hook（Webhook 触发）

### `onRefundSuccess`

退款到账（Stripe 确认退款成功）。

```typescript
onRefundSuccess: async (event) => {
  await sendRefundCompletedEmail(event.orderId)
  await deactivateSubscription(event.orderId)
}
```

### `onRefundFailed`

退款失败（通常是银行拒绝，需人工介入）。

```typescript
onRefundFailed: async (event) => {
  await alertOpsTeam(`退款失败，需人工处理：${event.orderId}`)
}
```

---

## 订阅事件 Hook（Webhook 触发）

适用于使用 Stripe 订阅能力的场景。

### `onSubscriptionCreated`

新订阅创建成功。

```typescript
onSubscriptionCreated: async (event) => {
  await createUserSubscriptionRecord(event.orderId)
  await sendWelcomeEmail(event.orderId)
}
```

### `onSubscriptionRenewed`

订阅自动续费成功。

```typescript
onSubscriptionRenewed: async (event) => {
  await extendSubscriptionExpiry(event.orderId)
  await sendRenewalReceiptEmail(event.orderId)
}
```

### `onSubscriptionCanceled`

订阅已取消（周期结束时生效）。

```typescript
onSubscriptionCanceled: async (event) => {
  await deactivateUserFeatures(event.orderId)
  await sendCancellationConfirmationEmail(event.orderId)
}
```

### `onSubscriptionPaymentFailed`

订阅续费扣款失败。

```typescript
onSubscriptionPaymentFailed: async (event) => {
  await sendDunningEmail(event.orderId)          // 发送催款邮件
  await gracefullyDegradeFeatures(event.orderId) // 功能降级
}
```

---

## Webhook 处理 Hook

### `onWebhookReceived`

Webhook 到达、验签之前触发，传入原始 payload。适合请求日志记录。

```typescript
onWebhookReceived: async (raw) => {
  logger.info('Webhook 收到原始请求', { bodyLength: String(raw).length })
}
```

### `onWebhookProcessed`

Webhook 验签通过、标准化完成后触发。

```typescript
onWebhookProcessed: async (event) => {
  logger.info('Webhook 处理完成', { type: event.type, orderId: event.orderId })
}
```

### `onWebhookError`

验签失败或处理过程中发生未捕获异常时触发。**生产环境必须配置此 Hook**，用于告警。

```typescript
onWebhookError: async (err, raw) => {
  logger.error('Webhook 处理失败', { error: err.message })
  await alertOpsTeam(`Webhook 错误：${err.message}`)
  // 注意：此时不要重新抛出错误，否则会死循环
}
```

---

## Hook 完整参考

| Hook | 类型 | 触发时机 | `before*` 可中止？ |
|---|---|---|:---:|
| `beforeCreateOrder` | 操作 | 下单前 | ✅ |
| `afterCreateOrder` | 操作 | 下单后 | — |
| `beforeCancelOrder` | 操作 | 取消订单前 | ✅ |
| `afterCancelOrder` | 操作 | 取消订单后 | — |
| `beforeRefund` | 操作 | 退款前 | ✅ |
| `afterRefund` | 操作 | 退款请求发出后 | — |
| `onPaymentSuccess` | 事件 | Webhook：支付成功 | — |
| `onPaymentFailed` | 事件 | Webhook：支付失败 | — |
| `onPaymentPending` | 事件 | Webhook：支付待处理 | — |
| `onRefundSuccess` | 事件 | Webhook：退款成功 | — |
| `onRefundFailed` | 事件 | Webhook：退款失败 | — |
| `onSubscriptionCreated` | 事件 | Webhook：订阅创建 | — |
| `onSubscriptionRenewed` | 事件 | Webhook：订阅续费成功 | — |
| `onSubscriptionCanceled` | 事件 | Webhook：订阅取消 | — |
| `onSubscriptionPaymentFailed` | 事件 | Webhook：订阅扣款失败 | — |
| `onWebhookReceived` | 处理 | Webhook 到达、验签前 | — |
| `onWebhookProcessed` | 处理 | Webhook 验签并处理完成 | — |
| `onWebhookError` | 处理 | Webhook 验签或处理失败 | — |

详细类型定义见 [类型定义 → PayPlexHooks](/api/types#payplexhooks)。
