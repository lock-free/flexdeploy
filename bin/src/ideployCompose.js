const ideploy = require('./ideploy');
const path = require('path');
const {
  readConfig
} = require('../../src/util');
const _ = require('lodash');

/**
 * {
 *   common: {
 *      machineConfig,
 *      env,
 *      ...
 *   },
 *   apps: {
 *    [name]: idepolyConfiguration
 *   }
 * }
 */
module.exports = async (argv) => {
  // read config file
  const configFilePath = path.resolve(process.cwd(), argv.config || 'deploy-compose-cnf.json');
  const config = await readConfig(configFilePath); // read config
  const app = config.apps[argv.project];

  if (!app) {
    throw new Error('no project to deploy.');
  }

  delete argv.project;
  delete argv.config;

  return ideploy(_.assign({}, config.common || {}, app, argv));
};
