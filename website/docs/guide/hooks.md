# 生命周期 Hook

## 概念

生命周期 Hook 是 PayPlex 的横切扩展点，允许你在支付操作的关键节点插入自定义逻辑，而不需要修改核心流程：

- **埋点与监控** — 记录支付漏斗
- **风控拦截** — 在下单前调用风控引擎
- **下游通知** — 支付成功后触发消息队列
- **补偿逻辑** — 支付失败后自动处理

## 配置 Hook

通过 `PayPlexOptions.hooks` 配置：

```typescript
const pay = new PayPlex({
  db,
  hooks: {
    beforeCreateOrder: async (params) => { ... },
    afterCreateOrder:  async (result) => { ... },
    beforeRefund:      async (params) => { ... },
    afterRefund:       async (result) => { ... },
    onPaymentSuccess:  async (event) => { ... },
    onPaymentFailed:   async (event) => { ... },
    onWebhookReceived: async (raw) => { ... },
    onWebhookProcessed: async (event) => { ... },
  },
})
```

## Hook 参考

### `beforeCreateOrder`

下单前触发。可以修改参数（返回新参数对象）或抛出错误拒绝下单。

```typescript
beforeCreateOrder: async (params: CreateOrderParams): Promise<CreateOrderParams | void> => {
  // 风控检查
  const riskScore = await riskEngine.score(params)
  if (riskScore > 80) {
    throw new Error('风控拦截：订单风险分过高')
  }
  // 可选：修改参数
  return { ...params, extra: { ...params.extra, riskScore } }
}
```

### `afterCreateOrder`

下单成功后触发（持久化已完成）。抛出错误不影响主流程，错误会被 logger 记录。

```typescript
afterCreateOrder: async (result: OrderResult): Promise<void> => {
  await analytics.track('order_created', {
    orderId: result.orderId,
    provider: result.provider,
  })
},
```

### `beforeRefund`

退款前触发。可拦截退款或修改退款参数。

```typescript
beforeRefund: async (params: RefundParams): Promise<RefundParams | void> => {
  // 检查退款权限（通过业务服务层查询订单状态）
  // 示例：const status = await orderService.getStatus(params.orderId)
  // if (status !== 'paid') throw new Error('只有已支付的订单可以退款')
},
```

### `afterRefund`

退款完成后触发。

```typescript
afterRefund: async (result: RefundResult): Promise<void> => {
  await notifyUser(result.orderId, '您的退款已处理')
},
```

### `onPaymentSuccess`

支付成功 Webhook 处理完成后触发。

```typescript
onPaymentSuccess: async (event: WebhookEvent): Promise<void> => {
  // PayPlex 内部已自动更新订单持久化状态
  // 此处适合执行业务侧副作用：发送通知、MQ 消息等
  await messageBus.publish('payment.success', event)
},
```

### `onPaymentFailed`

支付失败 Webhook 处理后触发。

```typescript
onPaymentFailed: async (event: WebhookEvent): Promise<void> => {
  // PayPlex 内部已自动更新订单持久化状态
  await alertOps(event)
},
```

### `onWebhookReceived`

Webhook 到达验签**之前**触发（传入原始 payload），适合日志记录。

```typescript
onWebhookReceived: async (raw: unknown): Promise<void> => {
  logger.debug('Webhook received', { size: JSON.stringify(raw).length })
},
```

### `onWebhookProcessed`

Webhook 验签并标准化完成后触发。

```typescript
onWebhookProcessed: async (event: WebhookEvent): Promise<void> => {
  metrics.increment('webhook.processed', { provider: event.provider, type: event.type })
},
```

## 错误处理策略

| Hook 类型 | 错误处理方式 |
|---|---|
| `before*` | 抛出错误会**中断**当前操作，错误向调用方传播 |
| `after*` | 抛出错误**不中断**主流程，通过 `logger` 记录 |
| `on*` | 抛出错误**不中断**主流程，通过 `logger` 记录 |

```typescript
// beforeCreateOrder 抛出错误会中止下单
try {
  await pay.provider('stripe').createOrder(params)
} catch (err) {
  // 可能来自 beforeCreateOrder 的拦截，也可能来自 Stripe API 错误
  console.error(err.message)
}
```

## 异步 Hook

所有 Hook 均支持异步操作。`before*` Hook 会被 `await`，确保在主操作执行前完成。`after*` / `on*` Hook 也会被 `await`，但错误不会传播：

```typescript
afterCreateOrder: async (result) => {
  // 长时间异步操作不会阻塞 createOrder 的返回值
  // 但本 Hook 的 await 完成前，createOrder 不会 resolve
  await heavyAsyncOperation(result)
},
```

