const path = require('path');
const {
  readTxt,
  readJson,
  writeTxt,
  parseTpl
} = require('./util');

/**
 *
 * cnfJson = {
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
  config
}) => {
  const tpl = await readTxt(tplPath);
  const cnfJson = await readJson(config);

  const envNames = Object.keys(cnfJson.env);

  await Promise.all(envNames.map(async (envName) => {
    let {
      name,
      dir,
      vars
    } = cnfJson.env[envName];
    name = name || `docker-compose-${envName}.yml`;
    dir = dir ? path.join(path.dirname(config), dir) : path.join(path.dirname(config), 'ymls');

    const tarPath = path.join(dir, name);
    const txt = parseTpl(tpl, Object.assign({
      env: envName,
      project: cnfJson.project
    }, vars));

    await writeTxt(tarPath, txt);
  }));
};

module.exports = {
  generateDCY
};
