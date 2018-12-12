const chalk = require('chalk');
const _ = require('lodash');
const path = require('path');
const _spawnp = require('spawnp');
const {
  promisify
} = require('es6-promisify');
const stat = promisify(require('fs').stat);
const mkdirp = promisify(require('mkdirp'));
const fs = require('fs');
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const _exec = promisify(require('child_process').exec);
const log = console.log.bind(console); // eslint-disable-line

const info = (title, txt) => {
  log(chalk.blue(`[${title}] ${txt}`));
};

const infoErr = (title, txt) => {
  log(chalk.red(`[${title}] ${txt}`));
};

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
    log(chalk.red(`[fail exec] ${JSON.stringify(args)}.`));
    throw err;
  }
};

const readTxt = async (filePath) => {
  return await readFile(filePath, 'utf-8');
};

const writeTxt = async (filePath, txt) => {
  await mkdirp(path.dirname(filePath));
  return await writeFile(filePath, txt, 'utf-8');
};

const saveJsonObj = (filePath, obj, format) => {
  return writeFile(filePath, JSON.stringify(obj, null, format));
};

const readJson = (filePath) => {
  return readTxt(filePath).then((txt) => {
    return JSON.parse(txt);
  });
};

const existsFile = (filePath) => {
  return new Promise((resolve) => {
    stat(filePath).then((statObj) => {
      resolve(statObj.isFile());
    }).catch(() => {
      resolve(false);
    });
  });
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

module.exports = {
  spawnp,
  exec,
  info,
  infoErr,
  readTxt,
  readJson,
  writeTxt,
  existsFile,
  parseTpl,
  errorLogWrapper,
  saveJsonObj,
  retry,
  delay
};
