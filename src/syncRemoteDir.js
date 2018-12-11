/**
 * sync directory with remote directory
 */

const crypto = require('crypto');
const fs = require('fs');
const {
  promisify
} = require('es6-promisify');
const readdir = promisify(fs.readdir);
const lstat = promisify(fs.lstat);
const path = require('path');

const getMd5FromFile = (filePath) => {
  return new Promise((resolve, reject) => {
    try {
      const sum = crypto.createHash('md5');
      const stream = fs.ReadStream(filePath);
      stream.on('data', (data) => {
        sum.update(data);
      });

      stream.on('end', () => {
        const has = sum.digest('hex');
        resolve(has);
      });

      stream.on('error', (err) => {
        reject(err);
      });
    } catch (err) {
      reject(err);
    }
  });
};

const getDirMd5FileMapping = async (dirPath) => {
  const files = await readdir(dirPath);

  const filesMapping = (await Promise.all(files.map(async (file) => {
    const nextFilePath = path.join(dirPath, file);
    const stats = await lstat(nextFilePath);
    if (stats.isFile()) {
      return ['file', file, await getMd5FromFile(nextFilePath)];
    } else if (stats.isDirectory()) {
      return ['dir', file, await getDirMd5FileMapping(nextFilePath)];
    } else {
      return null;
    }
  }).filter((item) => item !== null))).reduce((prev, [type, fileName, value]) => {
    if (type === 'file') {
      prev[fileName] = {
        type,
        md5: value
      };
    } else if (type === 'dir') {
      prev[fileName] = value;
    }
    return prev;
  }, {});

  return {
    type: 'dir',
    files: filesMapping
  };
};

const diffListByLayer = (mapping1, mapping2) => {
  const diffList = [];
  diffListByLayerHelp(mapping1, mapping2, [], diffList);
  return diffList;
};

const diffListByLayerHelp = (mapping1, mapping2, fromPath, diffList) => {
  if (mapping1.type !== mapping2.type) {
    diffList.push(diffObj('diffType', fromPath.slice(0)));
  } else {
    if (mapping1.type === 'file') {
      if (mapping1.md5 !== mapping2.md5) {
        diffList.push(diffObj('diffMd5', fromPath.slice(0)));
      }
    } else {
      const files1 = mapping1.files;
      const files2 = mapping2.files;
      for (let name in files1) {
        if (!files2[name]) {
          diffList.push(diffObj('addNew', fromPath.concat([name]).slice(0)));
        } else {
          fromPath.push(name);
          diffListByLayerHelp(files1[name], files2[name], fromPath, diffList);
          fromPath.pop();
        }
      }
      for (let name in files2) {
        if (!files1[name]) {
          diffList.push(diffObj('removeOld', fromPath.concat([name]).slice(0)));
        }
      }
    }
  }
};

const diffObj = (diffType, path) => {
  return {
    diffType,
    path
  };
};

module.exports = {
  getDirMd5FileMapping,
  diffListByLayer
};
