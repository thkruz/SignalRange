# Phase 1: Dynamic Alarm Ticker - Retrospective

## What worked

- **Centralized AlarmService approach** - Polling equipment every 1 second keeps all alarm logic in one place, making it easy to understand and extend
- **Type-safe event system** - Using the existing EventBus with typed events (AlarmStateChangedData) made the integration clean
- **Severity filtering logic** - Filtering to show only one severity tier at a time (all errors OR all warnings OR all info) provides clear visual priority
- **Existing CSS patterns** - The ticker animation and severity-based styling classes were mostly already in place
- **Plan-driven implementation** - Having a detailed plan file made implementation straightforward with minimal backtracking

## What didn't work

- **Protected method access** - Had to change `getStatusAlarms()` from protected to public on 3 equipment classes (antenna-core, rf-front-end-core, receiver)
- **Type mismatch with AlarmStatus severity** - The `AlarmStatus.severity` includes `'off'` but `AggregatedAlarm` doesn't, requiring explicit type casting when filtering alarms

## What to change next time

- **Consider interface abstraction** - An `IAlarmProvider` interface could formalize the alarm collection contract without modifying access levels
- **Add alarm deduplication by key** - Currently alarms are compared by JSON hash; a proper alarm key system would enable tracking alarm age/duration
- **Consider push-based approach for satellites** - When satellites are added, they may have different update frequencies; a hybrid poll/push model might be more efficient
