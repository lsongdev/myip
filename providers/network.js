import { request } from '../lib/http.js';

export function ipVersion(value) {
  const ip = String(value).trim();
  if (
    /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) &&
    ip.split('.').every((part) => Number(part) <= 255)
  )
    return 4;
  if (ip.includes(':') && !ip.includes('%')) {
    try {
      new URL(`https://[${ip}]/`);
      return 6;
    } catch {
      /* Invalid IPv6. */
    }
  }
  return null;
}

const addresses = {
  ipify: {
    4: 'https://api.ipify.org?format=json',
    6: 'https://api6.ipify.org?format=json',
  },
  icanhazip: {
    4: 'https://ipv4.icanhazip.com',
    6: 'https://ipv6.icanhazip.com',
  },
};

export async function getPublicIP({ version, provider = 'ipify', signal }) {
  const url = addresses[provider]?.[version];
  if (!url) throw new TypeError('Choose an IP provider and IPv4 or IPv6.');
  const ip = await request(url, { signal }, async (response) =>
    provider === 'ipify'
      ? (await response.json()).ip
      : (await response.text()).trim(),
  );
  if (ipVersion(ip) !== version)
    throw new Error(`The provider did not return an IPv${version} address.`);
  return ip;
}

export async function lookupLocation({ ip, provider = 'ipapi', signal }) {
  if (!ipVersion(ip))
    throw new TypeError('Enter a valid IPv4 or IPv6 address.');
  let data;
  if (provider === 'ipapi') {
    data = await request(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
      signal,
    });
    if (data.error) throw new Error(data.reason || 'Location lookup failed.');
    return {
      ip,
      city: data.city,
      region: data.region,
      country: data.country_name,
      provider: data.org,
      asn: data.asn,
      timezone: data.timezone,
    };
  }
  if (provider === 'ipinfo') {
    data = await request(`https://ipinfo.io/${encodeURIComponent(ip)}/json`, {
      signal,
    });
    if (data.error)
      throw new Error(data.error.message || 'Location lookup failed.');
    return {
      ip,
      city: data.city,
      region: data.region,
      country: data.country,
      provider: data.org,
      timezone: data.timezone,
    };
  }
  throw new TypeError('Unknown location provider.');
}

export const recordTypes = {
  A: 1,
  AAAA: 28,
  CNAME: 5,
  MX: 15,
  TXT: 16,
  NS: 2,
  SOA: 6,
  CAA: 257,
};

export async function resolveDNS({ hostname, type = 'A', signal }) {
  if (!Object.hasOwn(recordTypes, type))
    throw new TypeError('Unsupported DNS record type.');
  const host = hostname.trim().replace(/\.$/, '');
  let ascii;
  try {
    ascii = new URL(`https://${host}`).hostname;
  } catch {
    throw new TypeError('Enter a valid hostname.');
  }
  if (
    !host ||
    /[\s/:?#@]/.test(host) ||
    ascii.length > 253 ||
    !ascii
      .split('.')
      .every((label) => /^(?!-)[a-z0-9-]{1,63}(?<!-)$/.test(label))
  ) {
    throw new TypeError(
      'Enter a hostname such as lsong.org, without a URL or path.',
    );
  }
  const url = new URL('https://dns.google/resolve');
  url.search = new URLSearchParams({ name: ascii, type });
  const data = await request(url, { signal });
  if (data.Status !== 0 && data.Status !== 3)
    throw new Error(`DNS resolver returned status ${data.Status}.`);
  return {
    hostname: ascii,
    type,
    exists: data.Status !== 3,
    answers: (data.Answer ?? []).map((answer) => ({
      name: answer.name,
      type:
        Object.keys(recordTypes).find(
          (key) => recordTypes[key] === answer.type,
        ) ?? String(answer.type),
      ttl: answer.TTL,
      value: answer.data,
    })),
  };
}
