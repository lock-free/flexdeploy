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
  config,
  tarDir
}) => {
  const tpl = await readTxt(tplPath);
  const cnfJson = await readJson(config);
  const dir = tarDir || path.join(path.dirname(config), 'ymls');

  const envNames = Object.keys(cnfJson.env);

  await Promise.all(envNames.map(async (envName) => {
    let {
      name,
      vars
    } = cnfJson.env[envName];
    name = name || `docker-compose-${envName}.yml`;

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
