# MyIP

A browser network utility at [lsong.org/myip](https://lsong.org/myip/). Native HTML, CSS and ES modules; no framework, bundler, backend or runtime dependency. Serve the repository as static files, at `/myip/` or any other subdirectory.

```sh
npm run dev # http://127.0.0.1:8080
npm test
```

## Architecture

- `index.html` / `index.css`: semantic page and responsive light/dark presentation. Styles are self-contained so the homepage's global header, heading and form rules cannot affect tool layouts; the logo uses a local copy of the homepage's actual `/assets/web/icon.png` asset, avoiding cross-origin image loading failures.
- `index.js`: DOM events, rendering, request ownership, cancellation and ephemeral UI state.
- `lib/speedtest.js`: measurement lifecycle and immutable progress snapshots. Its context-aware API is `runSpeedtest({ transport, streams, signal, onUpdate })`. No DOM or vendor endpoints.
- `lib/statistics.js`: pure latency, jitter and throughput calculations.
- `lib/http.js`: CORS requests, HTTP status validation, full-body deadlines and cancellable waits. No service-specific parsing.
- `providers/cloudflare.js`: Cloudflare's public download/upload wire protocol, streaming byte counting and acknowledged uploads.
- `providers/network.js`: IP, geolocation and Google DNS JSON adapters, validation and normalized domain results.

To add a speed server, implement `ping({ signal })`, `download({ signal, bytes, onBytes })` and optionally `upload({ signal, bytes })`, then add that provider to `targets` in `index.js`. Ping resolves in milliseconds; download reports actual received chunks; upload resolves only after server acknowledgement. Endpoints must support CORS, uncached responses and cancellation; `Timing-Allow-Origin` improves ping accuracy. These details belong in the provider, not the measurement engine. A provider without upload skips that phase.

## Measurements and limits

An initial latency request warms up the connection. Eight subsequent requests produce median idle latency and mean absolute successive difference (jitter). Downloads sample bytes received every 250 ms. Upload rates use acknowledged payload size divided by each request's duration; local upload progress is never used. Each direction excludes its first 1.5 seconds and reports a trimmed mean over the trailing five seconds. It stops after seven seconds if samples are stable, or at 12 seconds. Three concurrent transfers are the default; a single stream is selectable. HTTP/2 or HTTP/3 may multiplex these over one connection. Loaded latency is measured alongside transfers and can be unavailable under heavy congestion.

Measurements are to the selected endpoint, not a guarantee of access-line capacity. Browser scheduling, proxies, server limits and request overhead affect them. A test can use substantial data on a fast connection. Failed requests fail the run; partial and cancelled runs are visibly labelled and cannot be copied as completed results. There is no test history or IP storage; localStorage stores only the theme preference. Hiding details masks addresses/location on the page and omits them from copied speed results; it does not prevent requests to providers.

IPv4 and IPv6 use family-specific ipify endpoints with family-specific icanhazip fallback. An unavailable IPv6 result is not evidence that the device has no IPv6 configuration. DNS supports multiple records, CNAME answers, NODATA and NXDOMAIN; it respects the selected type. Location providers can reject requests or rate limit, and their databases are approximate. API output is rendered as text, never injected as HTML.

## Inspiration

The measurement-first layout, separate download/upload curves, loaded latency and sustained-rate approach were inspired by [SukkaW/speed.skk.moe](https://github.com/SukkaW/speed.skk.moe). This is an independent implementation for this static site; it does not use Sukka's private endpoints or build stack. Default measurement endpoints are documented by [Cloudflare's speedtest project](https://github.com/cloudflare/speedtest). Public address APIs are documented at [ipify](https://www.ipify.org).
