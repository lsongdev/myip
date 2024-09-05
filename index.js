// Constants
const DNS_API = 'https://dns.google/resolve';

const SPEED_TEST_WEBSITES = [
  { name: 'Google', url: 'https://www.google.com/favicon.ico' },
  { name: 'Baidu', url: 'https://www.baidu.com/favicon.ico' },
  { name: 'Facebook', url: 'https://www.facebook.com/favicon.ico' },
  { name: 'Twitter', url: 'https://twitter.com/favicon.ico' },
  { name: 'Amazon', url: 'https://www.amazon.com/favicon.ico' },
  { name: 'Microsoft', url: 'https://www.microsoft.com/favicon.ico' }
];

// Utility functions
const displayResult = (message) => {
  document.getElementById('results').innerHTML = message;
};

const displayGeoResults = (geoData) => {
  const tableRows = Object.entries(geoData)
    .map(([key, value]) => `
      <tr>
        <td>${key}</td>
        <td>${value || '-'}</td>
      </tr>
    `)
    .join('');
  const html = `
    <table>
      <tr><th>Information</th><th>Value</th></tr>
      ${tableRows}
    </table>
  `;

  displayResult(html);
};

const getInputValue = (id) => document.getElementById(id).value;
const setInputValue = (id, value) => document.getElementById(id).value = value;

// Independent service functions
const ipify = async (version) => {
  const url = `https://api${version === 'v6' ? '64' : ''}.ipify.org?format=json`;
  const response = await fetch(url);
  const data = await response.json();
  return data.ip;
};

const httpbin = async () => {
  const url = 'https://httpbin.org/ip';
  const response = await fetch(url);
  const data = await response.json();
  return data.origin;
};

const ipapi = async ip => {
  const url = `https://ipapi.co/${ip}/json/`;
  const response = await fetch(url);
  return response.json();
};

const ipinfo = async ip => {
  const url = `https://ipinfo.io/${ip}/json`;
  const response = await fetch(url);
  return response.json();
};

// Main functions
const resolveDomain = async domain => {
  const response = await fetch(`${DNS_API}?name=${domain}`);
  const data = await response.json();
  return data.Answer[0].data;
};

const checkIP = async (type, source) => {
  return await ({ ipify, httpbin }[source])(type);
};

const geolocateIP = async (ip, source) => {
  return await ({ ipapi, ipinfo }[source])(ip);
};

// Speed test functions
const testWebsiteSpeed = (updateCallback) => {
  SPEED_TEST_WEBSITES.forEach(site => {
    const startTime = performance.now();
    const img = new Image();

    img.onload = img.onerror = () => {
      const duration = (performance.now() - startTime).toFixed(2);
      updateCallback({
        name: site.name,
        duration,
        success: img.complete
      });
    };

    img.src = `${site.url}?t=${new Date().getTime()}`;
  });
};

const initializeSpeedTestResults = () => {
  const tableBody = SPEED_TEST_WEBSITES
    .map(site => `
      <tr id="speed-${site.name.toLowerCase()}">
        <td>${site.name}</td>
        <td>Testing...</td>
      </tr>
    `)
    .join('');

  const html = `
    <table>
      <tr><th>Website</th><th>Latency</th></tr>
      ${tableBody}
    </table>
    <p>Note: Latency values are for reference only. Actual values may be lower.</p>
  `;
  document.getElementById('speedtest_results').innerHTML = html;
};

const updateSpeedTestResult = (result) => {
  const row = document.getElementById(`speed-${result.name.toLowerCase()}`);
  if (row) {
    const latencyCell = row.cells[1];
    if (result.success) {
      const duration = parseFloat(result.duration);
      const color = duration < 300 ? 'green' : duration < 500 ? 'orange' : 'red';
      latencyCell.innerHTML = `<span style="color: ${color}">${result.duration} ms</span>`;
    } else {
      latencyCell.innerHTML = '<span style="color: red">Access failed</span>';
    }
  }
};

// Event listeners
document.addEventListener('DOMContentLoaded', () => {

  document.getElementById('testSpeedBtn').addEventListener('click', speedtest);
  document.getElementById('dns').addEventListener('submit', async e => {
    e.preventDefault();
    const domain = getInputValue('domainInput');
    const ip = await resolveDomain(domain);
    displayResult(`Domain ${domain} resolved successfully<br>IP: ${ip}`);
    setInputValue('ipInput', ip);
    await handleGeolocateIP(ip);
  });

  document.getElementById('checkIPv4Btn').addEventListener('click', async () => {
    await handleCheckIP('v4');
  });

  document.getElementById('checkIPv6Btn').addEventListener('click', async () => {
    await handleCheckIP('v6');
  });

  document.getElementById('geolocation').addEventListener('submit', async e => {
    e.preventDefault();
    const ip = getInputValue('ipInput');
    await handleGeolocateIP(ip);
  });

  speedtest();
  handleCheckIP();
});

const speedtest = () => {
  initializeSpeedTestResults();
  testWebsiteSpeed(updateSpeedTestResult);
};

// Helper functions
const handleCheckIP = async (version) => {
  const source = getInputValue('ipSource');
  const ip = await checkIP(version, source);
  setInputValue('ipInput', ip);
  await handleGeolocateIP(ip);
};

const handleGeolocateIP = async (ip) => {
  const source = getInputValue('geoSource');
  const result = await geolocateIP(ip, source);
  displayGeoResults(result);
};