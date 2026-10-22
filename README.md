# MyIP

A browser network utility at [lsong.org/myip](https://lsong.org/myip/). Native HTML, CSS and ES modules; no framework, bundler, backend or runtime dependency. Serve the repository as static files, at `/myip/` or any other subdirectory.

```sh
npm run dev # http://127.0.0.1:8080
npm test
```

## Architecture

- `index.html` / `index.css`: semantic page and responsive light/dark presentation. Styles are self-contained so the homepage's global header, heading and form rules cannot affect tool layouts; the logo uses a local copy of the homepage's actual `/assets/web/icon.png` asset, avoiding cross-origin image loading failures.
- `index.js`: DOM events, rendering, request ownership, cancellation and ephemeral UI state.
- `ui/throughput-chart.js`: pure SVG plot geometry for the shared chart. During a transfer it shows that direction; completed results share a time and Mbps scale, with download above zero and upload below it. Below-axis positions represent positive upload rates.
- `ui/connectivity.js`: compact website cards, per-tab response history, lazy checks and cancellation when hidden or running a bandwidth test.
- `lib/connectivity.js`: bounded concurrent sampling over `probe({ signal })` targets, with independent response, timeout and unavailable results. `probeEndpoint({ url, signal, timeout })` measures time to an HTTP response without requiring CORS.
- `lib/speedtest.js`: measurement lifecycle and immutable progress snapshots. Its context-aware API is `runSpeedtest({ transport, streams, signal, onUpdate })`. No DOM or vendor endpoints.
- `lib/statistics.js`: pure latency, jitter and throughput calculations.
- `lib/http.js`: CORS requests, HTTP status validation, full-body deadlines and cancellable waits. No service-specific parsing.
- `providers/cloudflare.js`: Cloudflare's public download/upload wire protocol, streaming byte counting and acknowledged uploads.
- `providers/network.js`: IP, geolocation and Google DNS JSON adapters, validation and normalized domain results.
- `providers/websites.js`: named connectivity targets and public resource URLs. Brand icons are local; their official sources are listed in `assets/sites/SOURCES.md`.

To replace the default speed server, implement `ping({ signal })`, `download({ signal, bytes, onBytes })` and optionally `upload({ signal, bytes })`, then set `speedTransport` in `index.js` to that provider. There is no server picker while only one provider is configured. Ping resolves in milliseconds; download reports actual received chunks; upload resolves only after server acknowledgement. Endpoints must support CORS, uncached responses and cancellation; `Timing-Allow-Origin` improves ping accuracy. These details belong in the provider, not the measurement engine. A provider without upload skips that phase.

## Measurements and limits

An initial latency request warms up the connection. Eight subsequent requests produce median idle latency and mean absolute successive difference (jitter). Downloads sample bytes received every 250 ms. Upload rates use acknowledged payload size divided by each request's duration; local upload progress is never used. Each direction excludes its first 1.5 seconds and reports a trimmed mean over the trailing five seconds. It stops after seven seconds if samples are stable, or at 12 seconds. Three concurrent transfers are the default; the Multi / Single switch selects one stream when enabled. HTTP/2 or HTTP/3 may multiplex these over one connection. Loaded latency is measured alongside transfers and can be unavailable under heavy congestion.

Measurements are to the configured endpoint, not a guarantee of access-line capacity. Browser scheduling, proxies, server limits and request overhead affect them. A test can use substantial data on a fast connection. Failed requests fail the run; partial and cancelled runs are visibly labelled and cannot be copied as completed results. There is no test history or IP storage; localStorage stores only the theme preference. Hiding details masks addresses/location on the page and omits them from copied speed results; it does not prevent requests to providers.

IPv4 and IPv6 use family-specific ipify endpoints with family-specific icanhazip fallback. An unavailable IPv6 result is not evidence that the device has no IPv6 configuration. DNS supports multiple records, CNAME answers, NODATA and NXDOMAIN; it respects the selected type. Location providers can reject requests or rate limit, and their databases are approximate. API output is rendered as text, never injected as HTML.

Website connectivity checks start once the section enters view. Each run samples eight destinations 12 times each, at most four requests concurrently, with a five-second deadline per request. A card retries only that destination; the header retries or stops the group. Starting a check resets the selected destinations' dots; each completed attempt fills one dot, including timeout and unavailable results. A completed run therefore fills all 12 dots per selected destination. Early stops show the completed/total attempt count and identify tab-hidden cancellation. Results stay in memory until the page is closed or reloaded. Checks pause during the speed test and stop when the tab is hidden. Green dots indicate responses under 800 ms, amber slower responses, and red timeout/unavailable results.

These are direct, credential-free, uncached `HEAD` requests to public resources. Timings include browser scheduling, DNS/TLS when needed and HTTP overhead; they are not ICMP ping. Cross-origin opaque responses do not expose HTTP status, so “Responded” includes error responses and does not establish complete website health. Failed probes may reflect browser policy, extensions, endpoint behavior or network restrictions, and are never labelled as proof of blocking.

The numeric reading is the median of successful response timings in the current run. It remains visible during pending probes and after individual failures; the status label describes the latest attempt. The 12 dots preserve each attempt's raw timing or failure, so aggregation never hides unsuccessful probes. All-failed runs have no numeric timing. Starting a new run clears the selected sites' previous readings.

## Inspiration

The measurement-first layout, separate download/upload curves, loaded latency and sustained-rate approach were inspired by [SukkaW/speed.skk.moe](https://github.com/SukkaW/speed.skk.moe). This is an independent implementation for this static site; it does not use Sukka's private endpoints or build stack. Default measurement endpoints are documented by [Cloudflare's speedtest project](https://github.com/cloudflare/speedtest). Public address APIs are documented at [ipify](https://www.ipify.org).

The compact destination cards, regional badges and response-history dots take inspiration from [ip.skk.moe](https://ip.skk.moe/). Requests use the destinations' public resources rather than Sukka's infrastructure.
