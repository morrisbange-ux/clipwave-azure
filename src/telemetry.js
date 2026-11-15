'use strict';
// Must be required before anything else so requests/dependencies are auto-instrumented.
const cs = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;
if (cs) {
  const appInsights = require('applicationinsights');
  appInsights.setup(cs).setAutoCollectConsole(true, true).start();
  appInsights.defaultClient.context.tags[appInsights.defaultClient.context.keys.cloudRole] = 'clipwave-api';
  console.log('Application Insights enabled');
}
