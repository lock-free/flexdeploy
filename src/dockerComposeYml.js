const path = require('path');
const {
  readTxt,
  writeTxt,
  parseTpl
} = require('./util');
const _ = require('lodash');

/**
 *
 * config = {
 *   env: {
 *    [env]: {
 *      name,
 *      dir,
 *      vars
 *    }
 *   }
 * }
 */
const generateDCY = async ({
  tplPath,
  config,
  tarDir
}) => {
  const tpl = await readTxt(tplPath);
  const dir = tarDir || path.join(path.dirname(config), 'ymls');

  const envNames = Object.keys(config.env);

  await Promise.all(envNames.map(async (envName) => {
    let {
      name,
      vars
    } = config.env[envName];
    name = name || `docker-compose-${envName}.yml`;

    const tarPath = path.join(dir, name);
    const txt = parseTpl(tpl, _.assign({}, config, {
      env: envName,
      project: config.project
    }, vars));

    await writeTxt(tarPath, txt);
  }));
};

module.exports = {
  generateDCY
};
