const _ = require('lodash');
const promisify = require('./promisify');
const sshClient = require('ssh2').Client;
const path = require('path');
const fs = require('fs');
const readdir = promisify(fs.readdir);
const stat = promisify(require('fs').stat);

const getSSHClient = async ({
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

const hopConnection = async (options1, _options2) => {
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
          if (err) {
            reject(err);
          } else {
            stream.on('close', function(code, signal) {
              if (code !== 0) {
                reject(new Error(`command exit with code ${code}, signal ${signal}. Cmd is ${cmd}`));
              } else {
                resolve();
              }
            }).on('data', function(data) {
              process.stdout.write(data);
            }).stderr.on('data', function(data) {
              process.stderr.write(data);
            });
          }
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
          if (err) {
            reject(err);
          } else {
            resolve(stream);
          }
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

  const getSftp = async () => {
    const sftp = await buildSftp();

    const download = promisify(sftp.fastGet.bind(sftp));
    const sftp_mkdir = promisify(sftp.mkdir.bind(sftp));
    const sftp_stat = promisify(sftp.stat.bind(sftp));
    const sftp_chmod = promisify(sftp.chmod.bind(sftp));
    const sftp_readFile = promisify(sftp.readFile.bind(sftp));

    const sftp_mkdirp = async (dir) => {
      const levels = path.resolve(dir).split('/');

      let i = levels.length - 1;

      // find first exists dir
      while (i >= 0) {
        if (await sftp_existsDir(getPathFromArr(levels.slice(0, i + 1)))) {
          i++;
          break;
        } else {
          i--;
        }
      }

      for (; i < levels.length; i++) {
        await sftp_mkdir(getPathFromArr(levels.slice(0, i + 1)));
      }
    };

    const getPathFromArr = (arr) => '/' + arr.join('/');

    const sftp_existsDir = async (remoteDir) => {
      try {
        const stat = await sftp_stat(remoteDir);
        return stat.isDirectory();
      } catch (err) {
        return false;
      }
    };

    const sftp_existsFile = async (remoteDir) => {
      try {
        const statObj = await sftp_stat(remoteDir);
        return statObj.isFile();
      } catch (err) {
        return false;
      }
    };

    const upload = async (local, remote) => {
      const localStat = await stat(local);
      if (localStat.isDirectory()) {
        return uploadDir(local, remote);
      } else {
        return uploadFile(local, remote);
      }
    };

    const keepFileMod = async (local, remote) => {
      const statObj = await stat(local);
      await sftp_chmod(remote, statObj.mode);
    };

    const uploadFile = async (local, remote) => {
      const readStream = fs.createReadStream(local);
      const writeStream = sftp.createWriteStream(remote);
      await new Promise((resolve, reject) => {
        readStream.on('error', reject);
        writeStream.on('error', reject);
        readStream.pipe(writeStream).on('finish', resolve);
      });

      await keepFileMod(local, remote);
    };

    const uploadDir = async (localDir, remoteDir) => {
      // create remote dir if not exists
      if (!await sftp_existsDir(remoteDir)) {
        await sftp_mkdir(remoteDir);
        await keepFileMod(localDir, remoteDir);
      }
      const files = await readdir(localDir);
      return Promise.all(
        files.map(async (file) => {
          const filePath = path.resolve(localDir, file);
          const fileStat = await stat(filePath);

          const remoteFilePath = path.resolve(remoteDir, file);
          if (fileStat.isDirectory()) {
            return uploadDir(filePath, remoteFilePath);
          } else {
            return uploadFile(filePath, remoteFilePath);
          }
        })
      );
    };

    return {
      download,
      upload,
      mkdir: sftp_mkdir,
      mkdirp: sftp_mkdirp,
      existsDir: sftp_existsDir,
      existsFile: sftp_existsFile,
      readFile: sftp_readFile,
      unlink: promisify(sftp.unlink.bind(sftp)),
      rmdir: promisify(sftp.rmdir.bind(sftp))
    };
  };

  return {
    exec,
    execStream,
    getSftp
  };
};

module.exports = {
  getSSHClient,
  connectSSHServer,
  hopConnection
};
