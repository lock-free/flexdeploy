const _ = require('lodash');
const {
  deployToServer,
  buildCode
} = require('../../');
const {
  getUserHome,
  readConfig,
  parseTpl,
  info
} = require('../../src/util');
const fs = require('fs');
const path = require('path');
const log = console.log; // eslint-disable-line

const resolveSSHConfig = (sshConfigs, configDir) => {
  if (!sshConfigs) {
    throw new Error('missing configuration of sshConfigs');
  }

  const defaultPrivateKeyFile = path.resolve(getUserHome(), '.ssh/id_rsa');

  for (let name in sshConfigs) { // eslint-disable-line
    const obj = sshConfigs[name];
    const options = obj.options;
    // resolve private key
    if (!options.privateKey) {
      options.privateKeyFile = options.privateKeyFile || defaultPrivateKeyFile;
      options.privateKey = fs.readFileSync(path.resolve(configDir, options.privateKeyFile), 'utf-8');
      delete options.privateKeyFile;
    }
    obj.options = options;

    // resolve proxy private key
    const proxyOptions = obj.proxyOptions;
    if (proxyOptions) {
      if (!proxyOptions.privateKey) {
        proxyOptions.privateKeyFile = proxyOptions.privateKeyFile || defaultPrivateKeyFile;
        proxyOptions.privateKey = fs.readFileSync(path.resolve(configDir, proxyOptions.privateKeyFile), 'utf-8');
        delete proxyOptions.privateKeyFile;
      }
      obj.proxyOptions = proxyOptions;
    }
  }

  return sshConfigs;
};

const runCommands = async (cmds, options, cwd) => {
  if (cmds) {
    await Promise.all(cmds.map(async (line) => {
      require('child_process').execSync(parseTpl(line, options), {
        cwd,
        stdio: 'inherit'
      });
    }));
  }
};

const readOptions = async (argv) => {
  // read config file
  const configFilePath = path.resolve(process.cwd(), argv.config || 'deploy-cnf.json');

  const configDir = path.dirname(configFilePath);

  // merge machine config
  const config = _.assign(

    {
      // some default values
      deployStageName: 'stage',
      stageDir: 'target/docker/stage',
      depDir: '.'
    }, // default config

    await readConfig(configFilePath), // read config

    argv.machineConfig ? await readConfig(path.resolve(process.cwd(), argv.machineConfig)) : {}, // machine config

    argv, // params
  );

  const sourceProjectDir = argv.srcDir ? path.resolve(process.cwd(), argv.srcDir) : config.srcDir ? path.resolve(configDir, config.srcDir) : null;

  if (!sourceProjectDir) {
    throw new Error('missing src dir');
  }

  const deployDir = argv.deployDir ? path.resolve(process.cwd(), argv.deployDir) : path.resolve(configDir, config.depDir);

  return _.assign(config, {
    configDir,
    sourceProjectDir,
    sourceStageDir: sourceProjectDir ? path.join(sourceProjectDir, config.stageDir) : null,
    deployDir,
    sshConfigs: resolveSSHConfig(config.sshConfigs, configDir)
  });
};

const getDockerComposeYml = (argv, options, instObj) => {
  if (!instObj.dockerComposeYml && !argv.dockerComposeYml) return null;
  if (argv.dockerComposeYml) {
    return path.resolve(process.cwd(), parseTpl(argv.dockerComposeYml, options));
  } else {
    return path.resolve(options.configDir, parseTpl(instObj.dockerComposeYml, options));
  }
};

const getDeployList = (argv, options) => {
  if (!options.onlineType) {
    throw new Error('missing onlineType');
  }
  // deploy to servers
  var instList = options.instances[options.onlineType];

  // can filter by host variable
  if (argv.host || process.env['HOST']) {
    instList = instList.filter(({
      host
    }) => host === (argv.host || process.env['HOST']));
  }

  return instList;
};

module.exports = async (argv) => {
  info('ideploy', `argv=${JSON.stringify(argv, null, 4)}`);
  try {
    const options = await readOptions(argv);
    await runCommands(_.get(options, 'hooks.pre'), options, options.configDir);

    const prepareCode = async () => {
      // build code
      return await buildCode(options);
    };

    const publishInsts = () => {
      return Promise.all(getDeployList(argv, options).map(async (inst) => {
        const remoteDir = parseTpl(options.def.remoteDir, options);
        const instObj = _.assign({}, inst, {
          remoteDir,
          dockerComposeYml: options.def.dockerComposeYml,
          startCommand: options.def.startCommand && parseTpl(options.def.startCommand, _.assign({}, options, {
            remoteDir
          }))
        });

        const obj = _.assign({},
          options,
          instObj, {
            sshConfig: options.sshConfigs[instObj.host],
            dockerComposeYml: getDockerComposeYml(argv, options, instObj),
          });

        // run pre-deploy
        await runCommands(_.get(obj, 'hooks.preDeploy'), obj, obj.configDir);
        await deployToServer(obj);
        // run after deploy
        await runCommands(_.get(obj, 'hooks.afterDeploy'), obj, obj.configDir);
      }));
    };

    if (argv.buildOnly) {
      await prepareCode();
    } else if (argv.publishOnly) {
      await publishInsts();
    } else {
      await prepareCode();
      await publishInsts();
    }
  } catch (err) {
    log(`[errored] ${err.stack}`);
    process.exit(1);
  }
};
