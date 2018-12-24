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
const readdir = promisify(fs.readdir);
const writeFile = promisify(fs.writeFile);
const _exec = promisify(require('child_process').exec);
const sshClient = require('ssh2').Client;
const log = console.log.bind(console); // eslint-disable-line

const info = (title, txt) => {
  log(chalk.blue(`[${title}] ${txt}`));
};

const infoErr = (title, txt) => {
  log(chalk.red(`[${title}] ${txt}`));
};

const spawnp = async(...args) => {
  try {
    info('start spawn', `${args}`);
    return await _spawnp(...args);
  } catch (err) {
    infoErr('fail spawn', JSON.stringify(args));
    throw err;
  }
};

const exec = async(...args) => {
  try {
    info('start exec', `${args}`);
    return await _exec(...args);
  } catch (err) {
    log(chalk.red(`[fail exec] ${JSON.stringify(args)}.`));
    throw err;
  }
};

const readTxt = async(filePath) => {
  return await readFile(filePath, 'utf-8');
};

const writeTxt = async(filePath, txt) => {
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
  return async(...args) => {
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

const connectSSHServer = (options) => {
  const conn = new sshClient();

  return new Promise((resolve, reject) => {
    try {
      conn.on('ready', () => {
        resolve(_.assign({
          conn
        }, wrapFunForSSH2Conn(conn)));
      }).connect(options);

      conn.on('error', (err) => {
        reject(err);
      });
    } catch (err) {
      reject(err);
    }
  });
};

const wrapFunForSSH2Conn = (conn) => {
  const exec = (cmd) => {
    return new Promise((resolve, reject) => {
      try {
        conn.exec(cmd, (err, stream) => {
          if (err) throw err;
          stream.on('close', function(code, signal) {
            if (code !== 0) {
              reject(new Error(`command exit with code ${code}, signal ${signal}`));
            } else {
              resolve();
            }
          }).on('data', function(data) {
            process.stdout.write(data);
          }).stderr.on('data', function(data) {
            process.stderr.write(data);
          });
        });
      } catch (err) {
        reject(err);
      }
    });
  };

  const execStream = (cmd) => {
    return new Promise((resolve, reject) => {
      try {
        conn.exec(cmd, (err, stream) => {
          if (err) throw err;
          resolve(stream);
        });
      } catch (err) {
        reject(err);
      }
    });
  };

  const buildSftp = () => {
    return new Promise((resolve, reject) => {
      try {
        conn.sftp((err, sftp) => {
          if (err) {
            reject(err);
          } else {
            resolve(sftp);
          }
        });
      } catch (err) {
        reject(err);
      }
    });
  };
  const getSftp = async() => {
    const sftp = await buildSftp();

    const download = (remote, local) => {
      return new Promise((resolve, reject) => {
        sftp.fastGet(remote, local, {}, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    };

    const sftp_mkdir = async(filePath) => {
      return new Promise((resolve, reject) => {
        try {
          sftp.mkdir(filePath, (err, data) => {
            if (err) {
              reject(err);
            } else {
              resolve(data);
            }
          });
        } catch (err) {
          reject(err);
        }
      });
    };

    const sftp_stat = async(filePath) => {
      return new Promise((resolve, reject) => {
        try {
          sftp.stat(filePath, (err, statObj) => {
            if (err) {
              reject(err);
            } else {
              resolve(statObj);
            }
          });
        } catch (err) {
          reject(err);
        }
      });
    };

    const sftp_existsDir = async(remoteDir) => {
      try {
        const stat = await sftp_stat(remoteDir);
        return stat.isDirectory();
      } catch (err) {
        return false;
      }
    };

    const sftp_existsFile = async(remoteDir) => {
      try {
        const stat = sftp_stat(remoteDir);
        return stat.isDirectory();
      } catch (err) {
        return false;
      }
    };

    const upload = async(local, remote) => {
      const localStat = await stat(local);
      if (localStat.isDirectory()) {
        return uploadDir(local, remote);
      } else {
        return uploadFile(local, remote);
      }
    };

    const uploadFile = (local, remote) => {
      const readStream = fs.createReadStream(local);
      const writeStream = sftp.createWriteStream(remote);
      return new Promise((resolve, reject) => {
        readStream.on('error', reject);
        writeStream.on('error', reject);
        readStream.pipe(writeStream).on('finish', resolve);
      });
    };

    const uploadDir = async(localDir, remoteDir) => {
      // create remote dir if not exists
      if (!await sftp_existsDir(remoteDir)) {
        await sftp_mkdir(remoteDir);
      }
      const files = await readdir(localDir);
      files.map(async(file) => {
        const filePath = path.resolve(localDir, file);
        const fileStat = await stat(filePath);

        const remoteFilePath = path.resolve(remoteDir, file);
        if (fileStat.isDirectory()) {
          return uploadDir(filePath, remoteFilePath);
        } else {
          return uploadFile(filePath, remoteFilePath);
        }
      });
    };

    return {
      download,
      upload,
      mkdir: sftp_mkdir,
      existsDir: sftp_existsDir,
      existsFile: sftp_existsFile,
      unlink: promisify(sftp.unlink),
      rmdir: promisify(sftp.rmdir)
    };
  };

  return {
    exec,
    execStream,
    getSftp
  };
};

const hopConnection = async(options1, _options2) => {
  const {
    conn,
    execStream
  } = await connectSSHServer(options1);

  try {
    const options2 = _.assign({}, _options2);
    const stream = await execStream(`nc ${options2.host} ${options2.port || 22}`);
    delete options2.host;
    delete options2.port;

    return Object.assign({
      parentConn: conn
    }, await connectSSHServer(_.assign({
      sock: stream
    }, options2)));
  } catch (err) {
    conn.end();
    throw err;
  }
};

const getSSHClient = async({
  type = 'normal', //proxy or normal
  options,
  proxyOptions
}) => {
  if (type === 'proxy') {
    const client = await hopConnection(proxyOptions, options);
    return Object.assign({
      close: () => {
        client.conn.end();
        client.parentConn.end();
      }
    }, client);
  } else {
    const client = await connectSSHServer(options);
    return Object.assign({
      close: () => {
        client.conn.end();
      }
    }, client);
  }
};

module.exports = {
  getSSHClient,
  connectSSHServer,
  hopConnection,
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
