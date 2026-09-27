/* GLBN — parse.js
 * Парсинг share-ссылок (vless/vmess/trojan/ss/подписка) и сборка xray-конфига.
 * UMD: работает и в Node (require), и в браузере (window.GLBNParse).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GLBNParse = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function safeDecode(s) {
    try { return decodeURIComponent(s || ''); } catch (e) { return s || ''; }
  }

  function genId() {
    return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function b64Decode(s) {
    s = String(s || '').replace(/-/g, '+').replace(/_/g, '/').trim();
    while (s.length % 4) s += '=';
    try {
      if (typeof Buffer !== 'undefined' && Buffer.from) {
        return Buffer.from(s, 'base64').toString('utf8');
      }
      var bin = atob(s);
      var bytes = Uint8Array.from(bin, function (c) { return c.charCodeAt(0); });
      return new TextDecoder('utf-8').decode(bytes);
    } catch (e) { return ''; }
  }

  function printable(s) {
    return /^[\t\n\r\x20-\x7e\u00a0-\uffff]*$/.test(s);
  }

  function splitHostPort(s) {
    s = String(s || '').trim();
    var m6 = /^\[([^\]]+)\]:(\d+)$/.exec(s);
    var host, port;
    if (m6) { host = m6[1]; port = +m6[2]; }
    else {
      var i = s.lastIndexOf(':');
      if (i < 0) return null;
      host = s.slice(0, i);
      port = +(s.slice(i + 1));
      if (host.indexOf(':') >= 0) return null;
    }
    if (!host || !(port >= 1 && port <= 65535)) return null;
    return { host: host, port: port };
  }

  function makeProfile(protocol, address, port, name, extra) {
    extra = extra || {};
    var p = {
      id: genId(),
      name: (name || '').trim() || (address + ':' + port),
      protocol: protocol,
      address: address,
      port: port,
      params: extra.params || {},
      raw: extra.raw || '',
      addedAt: Date.now()
    };
    if (extra.uuid) p.uuid = extra.uuid;
    if (extra.password) p.password = extra.password;
    if (extra.method) p.method = extra.method;
    if (extra.url) p.url = extra.url;
    return p;
  }

  function parseVlessLike(link, protocol) {
    var u;
    try { u = new URL(link); } catch (e) { return null; }
    if (!u.username || !u.hostname || !u.port) return null;
    var q = {};
    u.searchParams.forEach(function (v, k) { q[k] = v; });
    return makeProfile(protocol, u.hostname, +u.port, safeDecode(u.hash.replace(/^#/, '')), {
      uuid: protocol === 'vless' ? safeDecode(u.username) : undefined,
      password: protocol === 'trojan' ? safeDecode(u.username) : undefined,
      params: q,
      raw: link
    });
  }

  function parseVmess(link) {
    var b64 = link.replace(/^vmess:\/\//i, '').split('#')[0].split('?')[0];
    var json = b64Decode(b64);
    var j;
    try { j = JSON.parse(json); } catch (e) { return null; }
    if (!j || !j.add || !j.port || !j.id) return null;
    var port = +j.port;
    if (!(port >= 1 && port <= 65535)) return null;
    var q = {
      type: j.net || 'tcp',
      security: j.tls === 'tls' ? 'tls' : (j.tls === 'reality' ? 'reality' : 'none'),
      path: j.path || '',
      host: j.host || '',
      sni: j.sni || j.host || '',
      fp: j.fp || '',
      aid: String(j.aid || 0),
      scy: j.scy || 'auto',
      serviceName: j.net === 'grpc' ? (j.path || '') : ''
    };
    return makeProfile('vmess', j.add, port, safeDecode(j.ps || ''), { uuid: j.id, params: q, raw: link });
  }

  function parseSS(link) {
    var m = /^ss:\/\/([^#]+)(?:#(.*))?$/i.exec(link);
    if (!m) return null;
    var body = m[1];
    var name = safeDecode(m[2] || '');
    if (body.indexOf('@') >= 0) {
      // SIP002: ss://base64(method:password)@host:port#name
      var at = body.lastIndexOf('@');
      var userinfo = body.slice(0, at);
      var hostpart = body.slice(at + 1).split('/')[0].split('?')[0];
      var hp = splitHostPort(hostpart);
      if (!hp) return null;
      var mp = null;
      var dec = b64Decode(userinfo);
      if (dec && dec.indexOf(':') > 0 && printable(dec)) mp = [dec.slice(0, dec.indexOf(':')), dec.slice(dec.indexOf(':') + 1)];
      if (!mp) {
        var plain = safeDecode(userinfo);
        if (plain && plain.indexOf(':') > 0) mp = [plain.slice(0, plain.indexOf(':')), plain.slice(plain.indexOf(':') + 1)];
      }
      if (!mp) return null;
      return makeProfile('shadowsocks', hp.host, hp.port, name, { method: mp[0], password: mp[1], raw: link });
    }
    // legacy: ss://base64(method:password@host:port)#name
    var whole = b64Decode(body.split('/')[0]);
    var a2 = whole.lastIndexOf('@');
    if (a2 <= 0) return null;
    var cred = whole.slice(0, a2);
    var hp2 = splitHostPort(whole.slice(a2 + 1));
    if (!hp2) return null;
    var ci = cred.indexOf(':');
    if (ci <= 0) return null;
    return makeProfile('shadowsocks', hp2.host, hp2.port, name, { method: cred.slice(0, ci), password: cred.slice(ci + 1), raw: link });
  }

  function parseShareLink(link) {
    var s = String(link || '').trim();
    if (!s) return null;
    var low = s.toLowerCase();
    if (low.indexOf('vless://') === 0) return parseVlessLike(s, 'vless');
    if (low.indexOf('trojan://') === 0) return parseVlessLike(s, 'trojan');
    if (low.indexOf('vmess://') === 0) return parseVmess(s);
    if (low.indexOf('ss://') === 0) return parseSS(s);
    if (/^https?:\/\//i.test(s)) {
      var u;
      try { u = new URL(s); } catch (e) { return null; }
      return makeProfile('subscription', u.hostname, +u.port || 443, u.hostname, { url: s });
    }
    return null;
  }

  function streamFromParams(q) {
    q = q || {};
    var ss = { network: q.type || 'tcp', security: q.security || 'none' };
    if (ss.network === 'ws') {
      var ws = { path: q.path || '/' };
      if (q.host) ws.headers = { Host: q.host };
      ss.wsSettings = ws;
    } else if (ss.network === 'grpc') {
      ss.grpcSettings = { serviceName: q.serviceName || q.path || '' };
    } else if (ss.network === 'http') {
      ss.network = 'tcp';
      ss.tcpSettings = { header: { type: 'http' } };
    }
    if (ss.security === 'tls') {
      ss.tlsSettings = {
        serverName: q.sni || q.host || '',
        allowInsecure: q.allowInsecure === '1' || q.allowInsecure === 'true',
        fingerprint: q.fp || ''
      };
    } else if (ss.security === 'reality') {
      ss.realitySettings = {
        serverName: q.sni || '',
        fingerprint: q.fp || 'chrome',
        publicKey: q.pbk || '',
        shortId: q.sid || ''
      };
    }
    return ss;
  }

  function buildXrayConfig(p, socksPort) {
    socksPort = socksPort || 10808;
    var outbound = { tag: 'proxy', protocol: p.protocol };
    var ss = streamFromParams(p.params);
    switch (p.protocol) {
      case 'vless':
        outbound.settings = {
          vnext: [{
            address: p.address,
            port: +p.port,
            users: [{ id: p.uuid, encryption: 'none', flow: (p.params && p.params.flow) || '' }]
          }]
        };
        break;
      case 'vmess':
        outbound.settings = {
          vnext: [{
            address: p.address,
            port: +p.port,
            users: [{
              id: p.uuid,
              alterId: +((p.params && p.params.aid) || 0),
              security: (p.params && p.params.scy) || 'auto'
            }]
          }]
        };
        break;
      case 'trojan':
        outbound.settings = { servers: [{ address: p.address, port: +p.port, password: p.password }] };
        if (ss.security === 'none' && (p.params && p.params.sni)) ss.security = 'tls';
        break;
      case 'shadowsocks':
        outbound.settings = {
          servers: [{ address: p.address, port: +p.port, method: p.method, password: p.password }]
        };
        break;
      default:
        return null;
    }
    outbound.streamSettings = ss;
    return {
      log: { loglevel: 'warning' },
      inbounds: [{
        tag: 'socks-in',
        listen: '127.0.0.1',
        port: socksPort,
        protocol: 'socks',
        settings: { auth: 'noauth', udp: true }
      }],
      outbounds: [outbound, { tag: 'direct', protocol: 'freedom' }]
    };
  }

  return {
    parseShareLink: parseShareLink,
    buildXrayConfig: buildXrayConfig,
    splitHostPort: splitHostPort,
    b64Decode: b64Decode,
    genId: genId
  };
});
