# 4:00 AM Frontend Parameter Audit

Branch: `inv_branch`

## Findings

- No active frontend schedule/config parameter for `4:00 AM`, `04:00`, or `4.00 AM` was found in `src/app`.
- The frontend now reads actual scheduler values from backend responses:
  - Sales: `health.salesScheduler`
  - Inventory: `health.inventoryScheduler`
- The relevant UI is `src/app/features/settings/settings.component.*`.
- The Settings page only displays and saves values from the backend scheduler APIs:
  - `GET /sync/scheduler/sales`
  - `PUT /sync/scheduler/sales`
  - `GET /sync/scheduler/inventory`
  - `PUT /sync/scheduler/inventory`
- Search false positives for `4` were CSS values such as `.04em`, not schedule settings.
- The old `WeeklyScheduleStatusComponent` is no longer used by the dashboard after moving weekly schedule details into Settings.

## Current Defaults

- Sales scheduler default: Wednesday `22:00` `America/New_York`.
- Inventory scheduler default: Sunday `22:00` `America/New_York`.

## Conclusion

There is no frontend-owned `4:00 AM` parameter to remove or wire up. Scheduler time is backend-owned and frontend components use the actual persisted values returned by the API.
