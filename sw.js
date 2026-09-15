/* Iron Log service worker —— 离线优先缓存应用外壳
 * 版本串由构建时 sed 替换（见 .github/workflows/deploy.yml），与 APP_VERSION 联动，
 * 版本一变缓存即失效，避免移动端长期跑旧副本。
 */
const CACHE = 'ironlog-v0.7.0';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg', './css/style.css', './js/app.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if(req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  // 导航请求：走网络，失败回退缓存 —— 新版本尽快生效，离线仍可用
  if(req.mode === 'navigate'){
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // 其余同源资源：缓存优先，后台更新
  e.respondWith(
    caches.match(req).then(hit => {
      const network = fetch(req).then(res => {
        if(res && res.status === 200){
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => hit);
      return hit || network;
    })
  );
});