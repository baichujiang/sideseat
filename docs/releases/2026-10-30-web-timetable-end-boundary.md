# Web timetable end boundary — 2026-10-30

Source `4c7b710a42c00420b38c555b64faf5c4e2bd4b9c`, candidate `dpl_4ErWTW4pWsUqRk6w4PHw8RWwuUCM`.

The left-hand timetable labels were cell starts: for a 15:30 end, the final 15:00 row represents 15:00–15:30. Local and production browser/API readback confirmed both quarter-hour IDs and the 15:30 endpoint were saved. The web timetable now labels its end beneath each day and explains the left-hand start labels. The selection logic, persisted data, business rules, native App and API are unchanged.

Local Mac in-app browser verification covered create, select, submit and reload, guest share page, a trailing 15-minute cell, and midnight shown as next day. Focused ESLint and two availability-cell tests passed. This is not a physical iPhone or Safari test.

The source package preserves 1,429 of 1,430 production baseline files, overlays the single shared timetable component and adds one marker; all 1,431 uploaded source hashes matched.

The READY candidate login returned HTTP 200; the same build was promoted without rebuilding. Root, www and api aliases point to it. Live browser verification on an existing QA plan showed the 15:30 footer and the previously saved 15:00–15:30 selection remained selected. Both local and production own QA account pairs were deleted; old cookies returned 401.
