const path = require('path');
const {
  diffListByLayer
} = require('./syncRemoteDir');
const {
  delay,
  info,
  readJson,
  getSSHClient
} = require('./util');

/**
 * deploy code to server and using docker-compose way to start service
 */
const deployToServer = async(options) => {
  const sshClient = await getSSHClient(options.sshConfig);
  info('ssh-connection', `connected: ${options.host}`);
  const sftpClient = await sshClient.getSftp();
  info('sftp-connection', `connected: ${options.host}`);

  try {
    await deployToServerHelp(Object.assign({
      sshClient,
      sftpClient
    }, options));
  } catch (err) {
    throw err;
  } finally {
    sshClient.conn.end();
    if (sshClient.parentConn) {
      sshClient.parentConn.end();
    }
  }
};

const deployToServerHelp = async({
  sshClient,
  sftpClient,
  host,
  deployDir,
  remoteDir,
  dockerComposeYml,
  deployStageName,
  digestMapFileName = 'dirDigestMap.json'
}) => {
  // create remote dir if not exists
  if (!await sftpClient.existsDir(remoteDir)) {
    await sftpClient.mkdir(remoteDir);
  }

  // copy yml
  const remoteDockerComposeYml = path.resolve(remoteDir, 'docker-compose.yml');
  info('sftp-upload', `from ${dockerComposeYml} to ${host}:${remoteDockerComposeYml}`);
  await sftpClient.upload(dockerComposeYml, remoteDockerComposeYml);

  // copy binaries
  await copyFiles({
    host,
    deployDir,
    deployStageName,
    remoteDir,
    digestMapFileName,
    sshClient,
    sftpClient
  });

  // start server
  // source some startup files first to set up environment
  const startServiceCommand = `source ~/.bash_profile; cd ${remoteDir} && docker-compose down && docker-compose build --force-rm && docker-compose up -d && docker system prune -f`;
  info('ssh-command', `${host}:${startServiceCommand}`);
  await sshClient.exec(startServiceCommand);

  // logs
  await delay(5 * 1000);
  const checkRemoteLogCommand = `cd ${remoteDir} && docker-compose logs --tail 100`;
  await sshClient.exec(checkRemoteLogCommand);
};

const copyFiles = async({
  host,
  deployDir,
  remoteDir,
  deployStageName,
  digestMapFileName = 'dirDigestMap.json',
  sshClient,
  sftpClient
}) => {
  const remoteStageDir = path.join(remoteDir, deployStageName);
  const stageCacheDir = path.join(deployDir, deployStageName);
  const stageDigestFilePath = path.join(deployDir, digestMapFileName);
  const remoteDigestFilePath = path.join(remoteDir, digestMapFileName);

  if (await sftpClient.existsFile(remoteDigestFilePath)) {
    const remoteDigest = await readRemoteJson(host, remoteDigestFilePath, sftpClient);
    const localDigest = await readJson(stageDigestFilePath);
    const diffList = diffListByLayer(localDigest, remoteDigest);

    const delList = diffList.reduce((prev, diffObj) => {
      if (diffObj.diffType === 'diffType' ||
        diffObj.diffType === 'diffMd5' ||
        diffObj.diffType === 'removeOld') {
        const remoteFilePath = path.join(remoteStageDir, ...diffObj.path);
        prev.push(remoteFilePath);
      }
      return prev;
    }, []);

    const copyList = diffList.reduce((prev, diffObj) => {
      if (diffObj.diffType === 'diffType' ||
        diffObj.diffType === 'diffMd5' ||
        diffObj.diffType === 'addNew') {
        prev.push({
          local: path.join(stageCacheDir, ...diffObj.path),
          remote: path.join(remoteStageDir, ...diffObj.path)
        });
      }
      return prev;
    }, []);

    info('del list', JSON.stringify(delList, null, 4));
    info('copy list', JSON.stringify(copyList, null, 4));

    if (delList.length) {
      await deleteRemoteFiles(host, delList, sftpClient);
    }
    if (copyList.length) {
      await copyFilesToRemote(host, copyList, sftpClient);
    }
  } else {
    info('missing-remote-digest-json', `can not find remote digest json. ${host}:${remoteDigestFilePath}`);
    if (await sftpClient.existsDir(remoteStageDir)) {
      const clearRemoteStageCommand = `rm -r ${remoteStageDir}`;
      info('ssh-command', `${host}:${clearRemoteStageCommand}`);
      // copy binaries
      await sshClient.exec(clearRemoteStageCommand);
    }

    info('sftp-upload', `from ${stageCacheDir} to ${host}:${remoteStageDir}`);
    await sftpClient.upload(stageCacheDir, remoteStageDir);
  }

  // copy digest map json at last
  info('sftp-upload', `from ${stageDigestFilePath} to ${host}:${remoteDigestFilePath}`);
  await sftpClient.upload(stageDigestFilePath, remoteDigestFilePath);
};

const copyFilesToRemote = async(host, list, sftpClient) => {
  return Promise.all(list.map(async({
    remote,
    local
  }) => {
    info('sftp-upload', `from ${local} to ${host}:${remote}`);
    await sftpClient.upload(local, remote);
  }));
};

const deleteRemoteFiles = async(host, files, sftpClient) => {
  return Promise.all(files.map(async(file) => {
    if (await sftpClient.existsFile(file)) {
      info('sftp-unlink', `${host}:${file}`);
      await sftpClient.unlink(file);
    }
  }));
};

const readRemoteJson = async(host, jsonFilePath, sftpClient) => {
  info('sftp-readFile', `${host}:${jsonFilePath}`);
  const ret = await sftpClient.readFile(jsonFilePath);
  return JSON.parse(ret.toString());
};

module.exports = {
  deployToServer
};
