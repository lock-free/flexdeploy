const {
  spawnp,
  info
} = require('../util');

// block: sudo iptables -A INPUT -p tcp --dport 16379 -j DROP

const insertOpenRule = (port) => {
  return `sudo iptables -C INPUT -p tcp --dport ${port} -j ACCEPT || sudo iptables -I INPUT -p tcp --dport ${port} -j ACCEPT`;
};

// ipFrag: eg 10.65.204.10/26
const insertOpenIpFragRule = (port, ipFrag) => {
  return `sudo iptables -C INPUT -p tcp -m tcp --dport ${port} -s ${ipFrag} -j ACCEPT || sudo iptables -I INPUT -p tcp -m tcp --dport ${port} -s ${ipFrag} -j ACCEPT`;
};

const insertOpenIpFragPortRangeRule = (startPort, endPort, ipFrag) => {
  const portRange = `${startPort}:${endPort}`;

  return `sudo iptables -C INPUT -p tcp --match multiport --dports ${portRange} -s ${ipFrag} -j ACCEPT || sudo iptables -I INPUT -p tcp --match multiport --dports ${portRange} -s ${ipFrag} -j ACCEPT`;
};

const deployIpTableRules = (host, rules) => {
  const code = rules.map((rule) => `(${rule})`).join(' && ');
  info('iptable rules', code);
  info('host', host);
  return spawnp('ssh', ['-qtt', host, '--', code], {
    stdio: 'inherit'
  });
};
const getShellCode = (host, rules) => {
  const code = rules.map((rule) => `(${rule})`).join(' && ');
  return `ssh ${host} -t "${code}"`;
};

module.exports = {
  insertOpenRule,
  insertOpenIpFragRule,
  deployIpTableRules,
  getShellCode,
  insertOpenIpFragPortRangeRule
};
