import { probeEndpoint } from '../lib/connectivity.js?v=8';

const site = (id, name, region, resource, icon = `${id}.ico`) => ({
  id,
  name,
  region,
  icon: `assets/sites/${icon}`,
  probe: ({ signal }) => probeEndpoint({ url: resource, signal }),
});

export const websites = [
  site(
    'bytedance',
    'ByteDance',
    'mainland',
    'https://www.bytedance.com/',
    'bytedance.png',
  ),
  site(
    'bilibili',
    'Bilibili',
    'mainland',
    'https://www.bilibili.com/favicon.ico',
  ),
  site(
    'wechat',
    'WeChat',
    'mainland',
    'https://res.wx.qq.com/a/wx_fed/assets/res/NTI4MWU5.ico',
    'wechat.png',
  ),
  site('taobao', 'Taobao', 'mainland', 'https://www.taobao.com/favicon.ico'),
  site('github', 'GitHub', 'global', 'https://github.com/favicon.ico'),
  site(
    'jsdelivr',
    'jsDelivr',
    'global',
    'https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js',
  ),
  site(
    'cloudflare',
    'Cloudflare',
    'global',
    'https://www.cloudflare.com/cdn-cgi/trace',
    'cloudflare.png',
  ),
  site('youtube', 'YouTube', 'global', 'https://www.youtube.com/favicon.ico'),
];
