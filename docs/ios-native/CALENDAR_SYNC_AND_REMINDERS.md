# Calendar synchronization and reminders

## Decision

SideSeat does not depend on a frequent server cron to deliver ordinary iPhone
calendar reminders. The server remains the source of truth for schedule data,
while iOS schedules exact local notifications for data already synchronized to
the device.

```text
Calendar mutation or foreground refresh
                 |
                 v
      GET /api/v1/home/schedule
                 |
                 v
      Save per-user device cache
                 |
                 v
  Reconcile pending iOS notifications
                 |
                 v
 iOS delivers at event start minus 15 minutes
```

This follows the platform split used by mature calendar apps: the server
synchronizes state, and the device handles exact reminders without requiring
network access at delivery time.

## Sync policy

- First render may use the last successful per-user cache.
- The Home calendar always revalidates that cache against the server.
- Pull to refresh always performs a server request.
- Creating, editing, moving, duplicating, or deleting an event reloads the
  current schedule window immediately.
- Returning to the foreground refreshes when the last successful server sync is
  at least 60 seconds old.
- Moving near the edge of the loaded window requests a new 14-day-back,
  45-day-forward window.
- A failed revalidation keeps the saved schedule visible and presents a soft
  refresh warning instead of replacing the calendar with an error screen.
- Signing out removes the cached schedule so another account cannot see it.

The current endpoint returns a bounded snapshot rather than a change token.
That is appropriate for the current data volume. Add `revision`/`updatedSince`
incremental sync only after measurements show snapshot transfer or decoding is
a meaningful bottleneck.

## Local reminder policy

- Default lead time: 15 minutes.
- Sources: SideSeat events, subscribed calendar entries, and expanded course
  timetable occurrences.
- Horizon: 45 days from the current sync.
- Pending cap: the nearest 48 reminders.
- Notification identifiers include stable event identity and occurrence time.
  Moving an event therefore creates a new identifier, while reconciliation
  removes the old request.
- Only identifiers with the `sideseat.calendar.` prefix are managed. Chat and
  other notification types are never removed by calendar reconciliation.
- Notification taps deep-link to the native Home tab.
- If notification permission is granted after the schedule loads, the latest
  in-memory schedule is reconciled immediately.
- Signing out removes all pending SideSeat calendar reminders.

## Server push responsibilities

APNs remains appropriate for events that originate away from the current
device, such as:

- another participant changes or cancels a shared plan;
- an organizer changes a public activity;
- the server revokes access or detects a conflict requiring attention.

Those writes should send an event-driven APNs update. A future background push
may ask iOS to refresh and reconcile local reminders, but delivery of the final
15-minute reminder must not depend on that background execution because iOS
decides when background work runs.

## Cron responsibilities

The calendar reminder endpoint remains browser-only as a Web Push recovery
mechanism, so enabling it cannot duplicate native local reminders. It is not
part of the normal native iOS reminder path. Daily Hobby cron jobs
are still suitable for retention cleanup and catalog maintenance. Minute-level
shared-event jobs require an event-driven worker, an external scheduler, or a
Vercel plan that supports that frequency.

## Follow-up gates

Before adding more infrastructure, measure:

- schedule payload size and p95 refresh latency;
- cache age when users open Home;
- local notification scheduling failures;
- percentage of users with notification permission;
- shared-event updates that arrive after the device's last sync.

Introduce incremental sync and silent background pushes when shared remote
mutations become common, not merely because they are available.
