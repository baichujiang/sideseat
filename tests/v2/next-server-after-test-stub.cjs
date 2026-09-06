"use strict";

// Successful Plan service mutations schedule push delivery through Next's
// request-scoped `after()`. PostgreSQL contract tests exercise persistence,
// not APNs delivery, so keep that side effect outside the test transaction.
exports.after = function after() {};
