const _ = require('lodash');
const path = require('path');
const _spawnp = require('spawnp');
const promisify = require('./promisify');
const fs = require('./fs');

const _exec = promisify(require('child_process').exec);

const {
  info,
  infoErr
} = require('./info');

const spawnp = async (...args) => {
  try {
    info('start spawn', `${args}`);
    return await _spawnp(...args);
  } catch (err) {
    infoErr('fail spawn', JSON.stringify(args));
    throw err;
  }
};

const exec = async (...args) => {
  try {
    info('start exec', `${args}`);
    return await _exec(...args);
  } catch (err) {
    infoErr('fail exec', JSON.stringify(args));
    throw err;
  }
};

const parseTpl = (tpl, obj = {}) => {
  const compiled = _.template(tpl, {
    interpolate: /{{([\s\S]+?)}}/g
  });
  return compiled(obj);
};

const errorLogWrapper = (fn) => {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (e) {
      infoErr('error', `${e.message}. ${e.stack}`);
      process.exit(500);
    }
  };
};

const retry = (fn, max = 0) => {
  const help = (args, retain) => {
    return fn(...args).catch((err) => {
      if (retain <= 0) {
        throw err;
      } else {
        return help(args, retain - 1);
      }
    });
  };

  return (...args) => help(args, max);
};

const delay = (t) => {
  return new Promise((resolve, reject) => {
    try {
      setTimeout(() => {
        resolve();
      }, t);
    } catch (err) {
      reject(err);
    }
  });
};

function getUserHome() {
  return process.env[(process.platform === 'win32') ? 'USERPROFILE' : 'HOME'];
}

const getBranchName = async (dir) => {
  // check branch
  const gbc = await spawnp('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    cwd: dir
  }, {
    stdout: true
  });
  return gbc.stdouts.join('').trim();
};

const isGitRootRepo = async (dir) => {
  return await fs.existsDir(path.join(dir, '.git'));
};

const checkoutToBranch = async (dir, branchName) => {
  await spawnp('git', ['checkout', '-B', branchName], {
    cwd: dir
  }, {
    stdout: true
  });
};

// support json and js filetype
const readConfig = async (cnfFilePath) => {
  const ext = path.extname(cnfFilePath);
  switch (ext) {
    case '.json':
      return await fs.readJson(cnfFilePath);
    case '.js':
      return readJs(cnfFilePath);
    default:
      throw new Error(`unexpected extname of path ${ext}, expect .json or .js`);
  }
};

const readJs = (filePath) => {
  return require(filePath);
};

module.exports = _.assign({
  checkoutToBranch,
  getBranchName,
  getUserHome,
  spawnp,
  exec,
  info,
  infoErr,
  parseTpl,
  errorLogWrapper,
  retry,
  delay,
  isGitRootRepo,
  readConfig
}, require('./sshClient'), require('./fs'), require('./syncFilesWithDiff'), require('./syncRemoteDir'));
