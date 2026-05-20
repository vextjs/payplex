# 能力接口 API

## 高级能力接口

### `ISubscriptionCapability`

```typescript
interface ISubscriptionCapability {
  create(params: CreateSubscriptionParams): Promise<SubscriptionResult>
  updatePlan(params: UpdateSubscriptionPlanParams): Promise<SubscriptionResult>
  cancel(params: CancelSubscriptionParams): Promise<void>
  query(subscriptionId: string): Promise<SubscriptionStatusResult>
}
```

### `ISplitCapability`

```typescript
interface ISplitCapability {
  execute(params: SplitExecuteParams): Promise<SplitResult>
  query(splitId: string): Promise<SplitStatusResult>
}
```

### `IReconciliationCapability`

```typescript
interface IReconciliationCapability {
  fetchBill(params: FetchBillParams): Promise<BillResult>
  run(params: RunReconciliationParams): Promise<ReconciliationJob>
  queryJob(jobId: string): Promise<ReconciliationJobStatus>
}
```

### `IRiskCapability`

```typescript
interface IRiskCapability {
  evaluate(params: RiskEvaluateParams): Promise<RiskDecision>
}
```

### `ISettlementCapability`

```typescript
interface ISettlementCapability {
  list(params: ListSettlementParams): Promise<SettlementRecord[]>
  query(settlementId: string): Promise<SettlementStatus>
}
```

## `getCapability(target, name)`

安全获取高级能力，不存在时返回 `null`：

- 当能力由 **Provider capability adapter** 暴露时，传入 `pay.provider('xxx')`
- 当能力由 `pay.useCapabilityPlugin()` **全局挂载**时，传入 `pay`

```typescript
import { getCapability } from 'payplex'

const sub = getCapability(pay.provider('stripe'), 'subscription')
// ISubscriptionCapability | null

const risk = getCapability(pay, 'risk')
// IRiskCapability | null

if (sub) {
  await sub.create({ ... })
}
```

## `defineCapabilityPlugin(options)`

定义自定义能力插件工厂：

```typescript
import { defineCapabilityPlugin } from 'payplex'

const myPlugin = defineCapabilityPlugin({
  name: 'risk',
  create(config: { apiUrl: string }) {
    return {
      async evaluate(params) {
        return { score: 0, decision: 'approve', raw: { apiUrl: config.apiUrl, params } }
      }
    }
  },
})
```

