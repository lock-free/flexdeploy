const fs = require('fs');
const promisify = require('./promisify');
const path = require('path');
const stat = promisify(require('fs').stat);
const mkdirp = promisify(require('mkdirp'));
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

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

const existsDir = (filePath) => {
  return new Promise((resolve) => {
    stat(filePath).then((statObj) => {
      resolve(statObj.isDirectory());
    }).catch(() => {
      resolve(false);
    });
  });
};

module.exports = {
  readTxt,
  readJson,
  writeTxt,
  existsFile,
  saveJsonObj,
  existsDir,
  mkdirp
};
