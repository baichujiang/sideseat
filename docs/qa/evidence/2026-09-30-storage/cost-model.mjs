// Scenario model, not a measured load test or a quoted invoice. USD before tax.
// Rates verified 2026-09-30: Vercel Pro/Blob/Fluid/iad1/Flat Rate CDN docs.
const days = 30;
const scenarios = {
  light: { api: 40, publicReads: 15, privateReads: 0.5, chatMinutes: 3, uploads: 0.1 },
  normal: { api: 100, publicReads: 30, privateReads: 2, chatMinutes: 10, uploads: 0.2 },
  chatHeavy: { api: 150, publicReads: 80, privateReads: 10, chatMinutes: 30, uploads: 1 },
};
function estimate(dau, scenario, streamsPerInstance) {
  const s = scenarios[scenario];
  const api = dau * days * s.api; // Includes image proxy and upload invocations.
  const streams = dau * days * s.chatMinutes / 5; // 300-second stream lifetime.
  const chatHours = dau * days * s.chatMinutes / 60;
  const publicReads = dau * days * s.publicReads;
  const privateReads = dau * days * s.privateReads;
  const uploads = dau * days * s.uploads;
  const publicGB = publicReads * 0.0003; // 300 KB public photo.
  const privateGB = privateReads * 0.0005; // 500 KB private photo.
  const uploadGB = uploads * 0.0005;
  const apiJSONGB = api * 0.00001; // 10 KB response, excluding photo body.
  const polls = chatHours * 60 * 30; // Steady idle: one poll every 2 s.
  const resources = {
    invocation: (api + streams) / 1e6 * 0.60,
    apiCPU: api * 0.010 / 3600 * 0.128, // Assumed 10 ms active CPU per API call.
    apiMemory: api * 0.150 * 2 / 3600 * 0.0106, // 150 ms wall time, no API sharing credit.
    streamCPU: (polls * 0.002 + chatHours * 240 * 0.002) / 3600 * 0.128,
    streamMemory: chatHours * 2 / streamsPerInstance * 0.0106,
    blobStorage: dau * 0.04 * 0.023, // Assumed average 40 MB retained per DAU; not automatic deletion.
    blobAdvanced: uploads / 1e6 * 5,
    blobSimple: (publicReads * 0.2 + privateReads) / 1e6 * 0.4,
    originTransfer: (publicGB * 0.2 + privateGB * 2 + apiJSONGB + uploadGB) * 0.06,
    reserve: 3, // Reserve for background jobs, builds/logs and existing base storage.
  };
  const cdnRequests = api + streams + publicReads + privateReads;
  const transferGB = publicGB + privateGB * 2 + apiJSONGB + uploadGB;
  const cdnFee = cdnRequests <= 1e6 && transferGB <= 1000 ? 0 : cdnRequests <= 10e6 && transferGB <= 50000 ? 20 : cdnRequests <= 50e6 && transferGB <= 50000 ? 100 : 300;
  const infrastructure = Object.values(resources).reduce((a,b) => a+b, 0);
  const bill = 20 + cdnFee + Math.max(0, infrastructure - 20);
  return { dau, scenario, streamsPerInstance, cdnRequests, transferGB, infrastructure, cdnFee, bill };
}
function baseCapacity(scenario, sharing) {
  let dau = 1;
  while (estimate(dau + 1, scenario, sharing).bill <= 20) dau++;
  return dau;
}
const result = {
  assumptions: "Flat Rate CDN enabled and eligible; entire team budget available to SideSeat; iad1 rates; 2 GB Fluid instances; normal monthly activity; no tax/Neon/AI/email/App Store fees. Sharing and timings are assumptions, not production measurements. Media-heavy workloads may be ineligible for Flat Rate CDN.",
  base20CapacityDAU: Object.fromEntries(Object.keys(scenarios).map(s => [s, { noSharing: baseCapacity(s, 1), fiveStreamsPerInstance: baseCapacity(s, 5) }])),
  normalMonthlyUSD: [100,200,500,1000,2000].map(dau => ({ dau, shared: estimate(dau,"normal",5), unshared: estimate(dau,"normal",1) })),
};
console.log(JSON.stringify(result, null, 2));
