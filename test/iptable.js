const assert = require('assert');
const {
  insertOpenRule,
  insertOpenIpFragRule,
  insertOpenIpFragPortRangeRule
} = require('../src/host/iptable');

describe('iptable', () => {
  it('insertOpenRule', () => {
    assert(insertOpenRule('9000'), 'sudo iptables -C INPUT -p tcp --dport 9000 -j ACCEPT || sudo iptables -I INPUT -p tcp --dport 9000 -j ACCEPT');
  });

  it('insertOpenIpFragRule', () => {
    assert(insertOpenIpFragRule('8000', '10.12.12.12/26'), 'sudo iptables -C INPUT -p tcp --dport 8000 -s 10.12.12.12/26 -j ACCEPT || sudo iptables -I INPUT -p tcp --dport 9000 -s 10.12.12.12/26 -j ACCEPT');
  });

  it('insertOpenIpFragPortRangeRule', () => {
    assert(insertOpenIpFragPortRangeRule(1000, 3000, '10.12.12.12/26'), 'sudo iptables -C INPUT -p tcp --match multiport --dports 1000:3000 -s 10.12.12.12/26 -j ACCEPT || sudo iptables -I INPUT -p tcp --match multiport --dports 1000:3000 -s 10.12.12.12/26 -j ACCEPT');
  });
});
