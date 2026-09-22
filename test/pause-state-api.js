#!/usr/bin/env node
/**
 * Pause calls exposed to the subscriptions list: webhook, payload, outcome and reporting.
 *
 * Usage : node test/pause-state-api.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT = fs.readFileSync(path.join(ROOT, 'account/pause-state.js'), 'utf8');
const RESUME = 'https://hook.eu1.make.com/2y3halxc530pmbgju3les5b6gk1kwydc';
const CANCEL = 'https://hook.eu1.make.com/greskl1wedbnhktd5cne0i88mq4qg7wr';

function page({ memberId = 'mem_test', outcome = { status: 200 } } = {}) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://www.ordotype.fr/membership/compte',
    runScripts: 'outside-only',
  });
  const w = dom.window;
  const requests = [];
  const reported = [];
  function FakeXhr() {
    this.headers = {};
  }
  FakeXhr.prototype.open = function(method, url) { this.method = method; this.url = url; };
  FakeXhr.prototype.setRequestHeader = function(k, v) { this.headers[k] = v; };
  FakeXhr.prototype.send = function(body) {
    const xhr = this;
    xhr.body = body;
    requests.push(xhr);
    setTimeout(() => {
      if (outcome.network) return xhr.onerror();
      xhr.status = outcome.status;
      xhr.responseText = outcome.body || '';
      xhr.onload();
    }, 0);
  };
  w.XMLHttpRequest = FakeXhr;
  w.OrdoMemberstack = memberId ? { memberId, metaData: {}, planConnections: [] } : { metaData: {}, planConnections: [] };
  w.OrdoErrorReporter = { report(ctx, err) { reported.push(err.name); } };
  w.eval(SCRIPT);
  return { w, requests, reported };
}

const wait = (ms = 20) => new Promise((r) => setTimeout(r, ms));

async function main() {
  {
    const t = page();
    let result = null;
    t.w.OrdoPause.resume((ok) => { result = ok; });
    await wait();
    assert.strictEqual(t.requests.length, 1);
    assert.strictEqual(t.requests[0].method, 'POST');
    assert.strictEqual(t.requests[0].url, RESUME);
    assert.strictEqual(t.requests[0].headers['Content-Type'], 'application/x-www-form-urlencoded');
    assert.ok(t.requests[0].body.startsWith('memberId=mem_test&pageUrl='));
    assert.strictEqual(result, true);
    assert.strictEqual(t.w.OrdoPause.resumedUrl, '/membership/abonnement-repris');
  }
  {
    const t = page({ outcome: { status: 500, body: 'boom' } });
    let result = null;
    t.w.OrdoPause.cancelDefinitive((ok) => { result = ok; });
    await wait();
    assert.strictEqual(t.requests[0].url, CANCEL);
    assert.strictEqual(result, false);
    assert.deepStrictEqual(t.reported, ['PauseStateActionFailed']);
  }
  {
    const t = page({ outcome: { network: true } });
    let result = null;
    t.w.OrdoPause.resume((ok) => { result = ok; });
    await wait();
    assert.strictEqual(result, false);
    assert.deepStrictEqual(t.reported, ['PauseStateNetworkError']);
  }
  {
    const t = page({ memberId: '' });
    let result = null;
    t.w.OrdoPause.resume((ok) => { result = ok; });
    await wait();
    assert.strictEqual(t.requests.length, 0, 'no call without a member id');
    assert.strictEqual(result, false);
    assert.deepStrictEqual(t.reported, ['PauseStateMissingMemberId']);
  }
  console.log('pause-state-api: OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
