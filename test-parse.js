/* GLBN — самопроверка парсера. Запуск: node test-parse.js */
'use strict';
const assert = require('assert');
const { parseShareLink, buildXrayConfig, splitHostPort } = require('./parse');

let passed = 0, failed = 0;
function t(name, fn) {
  try { fn(); passed++; console.log('PASS ' + name); }
  catch (e) { failed++; console.log('FAIL ' + name + ' :: ' + e.message); }
}

t('splitHostPort обычный', () => {
  assert.deepStrictEqual(splitHostPort('example.com:443'), { host: 'example.com', port: 443 });
});
t('splitHostPort ipv6', () => {
  assert.deepStrictEqual(splitHostPort('[2001:db8::1]:8443'), { host: '2001:db8::1', port: 8443 });
});
t('splitHostPort мусор', () => {
  assert.strictEqual(splitHostPort('nonsense'), null);
});

t('vless парсится', () => {
  const p = parseShareLink('vless://b831381d-6324-4d53-ad4f-8cda48b30811@de1.example.com:443?type=ws&security=tls&path=%2Fws&host=de1.example.com&sni=de1.example.com#Germany%20WS-TLS');
  assert.ok(p, 'profile null');
  assert.strictEqual(p.protocol, 'vless');
  assert.strictEqual(p.address, 'de1.example.com');
  assert.strictEqual(p.port, 443);
  assert.strictEqual(p.uuid, 'b831381d-6324-4d53-ad4f-8cda48b30811');
  assert.strictEqual(p.params.security, 'tls');
  assert.strictEqual(p.params.type, 'ws');
  assert.strictEqual(p.params.path, '/ws');
  assert.ok(p.name.includes('Germany'));
});

t('vmess base64-JSON парсится', () => {
  const j = { v: '2', ps: 'Тест VMess', add: 'jp1.example.com', port: '8443', id: 'b831381d-6324-4d53-ad4f-8cda48b30811', aid: '0', scy: 'auto', net: 'ws', host: 'jp1.example.com', path: '/ray', tls: 'tls', sni: 'jp1.example.com' };
  const link = 'vmess://' + Buffer.from(JSON.stringify(j)).toString('base64');
  const p = parseShareLink(link);
  assert.ok(p, 'profile null');
  assert.strictEqual(p.protocol, 'vmess');
  assert.strictEqual(p.address, 'jp1.example.com');
  assert.strictEqual(p.port, 8443);
  assert.strictEqual(p.uuid, j.id);
  assert.strictEqual(p.params.security, 'tls');
  assert.strictEqual(p.params.type, 'ws');
  assert.strictEqual(p.name, 'Тест VMess');
});

t('trojan парсится', () => {
  const p = parseShareLink('trojan://passw0rd@fr2.example.com:443?security=tls&sni=fr2.example.com&type=tcp#France');
  assert.ok(p, 'profile null');
  assert.strictEqual(p.protocol, 'trojan');
  assert.strictEqual(p.password, 'passw0rd');
  assert.strictEqual(p.address, 'fr2.example.com');
  assert.strictEqual(p.port, 443);
  assert.strictEqual(p.params.sni, 'fr2.example.com');
});

t('ss SIP002 парсится', () => {
  const userinfo = Buffer.from('aes-256-gcm:secret123').toString('base64');
  const p = parseShareLink('ss://' + userinfo + '@nl1.example.com:8388#Netherlands');
  assert.ok(p, 'profile null');
  assert.strictEqual(p.protocol, 'shadowsocks');
  assert.strictEqual(p.method, 'aes-256-gcm');
  assert.strictEqual(p.password, 'secret123');
  assert.strictEqual(p.address, 'nl1.example.com');
  assert.strictEqual(p.port, 8388);
});

t('ss legacy (всё в base64) парсится', () => {
  const body = Buffer.from('chacha20-ietf-poly1305:pass@sg1.example.com:443').toString('base64');
  const p = parseShareLink('ss://' + body + '#SG');
  assert.ok(p, 'profile null');
  assert.strictEqual(p.method, 'chacha20-ietf-poly1305');
  assert.strictEqual(p.password, 'pass');
  assert.strictEqual(p.address, 'sg1.example.com');
  assert.strictEqual(p.port, 443);
});

t('подписка http(s) сохраняется как есть', () => {
  const p = parseShareLink('https://sub.example.com/token/link?u=1');
  assert.ok(p, 'profile null');
  assert.strictEqual(p.protocol, 'subscription');
  assert.strictEqual(p.address, 'sub.example.com');
  assert.ok(p.url.startsWith('https://'));
});

t('мусор возвращает null', () => {
  assert.strictEqual(parseShareLink(''), null);
  assert.strictEqual(parseShareLink('привет'), null);
  assert.strictEqual(parseShareLink('vless://broken'), null);
  assert.strictEqual(parseShareLink('vmess://!!!notbase64json!!!'), null);
});

t('buildXrayConfig: vless + ws + tls', () => {
  const p = parseShareLink('vless://b831381d-6324-4d53-ad4f-8cda48b30811@de1.example.com:443?type=ws&security=tls&path=%2Fws&host=de1.example.com&sni=de1.example.com#X');
  const cfg = buildXrayConfig(p, 10808);
  assert.ok(cfg, 'config null');
  assert.strictEqual(cfg.inbounds[0].port, 10808);
  assert.strictEqual(cfg.inbounds[0].listen, '127.0.0.1');
  const ob = cfg.outbounds[0];
  assert.strictEqual(ob.protocol, 'vless');
  assert.strictEqual(ob.settings.vnext[0].address, 'de1.example.com');
  assert.strictEqual(ob.streamSettings.network, 'ws');
  assert.strictEqual(ob.streamSettings.tlsSettings.serverName, 'de1.example.com');
  assert.strictEqual(cfg.outbounds[1].protocol, 'freedom');
});

t('buildXrayConfig: trojan получает tls', () => {
  const p = parseShareLink('trojan://passw0rd@fr2.example.com:443?security=tls&sni=fr2.example.com&type=tcp#F');
  const cfg = buildXrayConfig(p, 10808);
  assert.strictEqual(cfg.outbounds[0].protocol, 'trojan');
  assert.strictEqual(cfg.outbounds[0].streamSettings.security, 'tls');
});

t('buildXrayConfig: subscription не собирается', () => {
  const p = parseShareLink('https://sub.example.com/x');
  assert.strictEqual(buildXrayConfig(p, 10808), null);
});

console.log('\nИтого: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
