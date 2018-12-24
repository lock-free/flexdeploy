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
const deployToServer = async({
  host,
  deployDir,
  remoteDir,
  dockerComposeYml,
  deployStageName,
  digestMapFileName = 'dirDigestMap.json',
  sshConfig // ssh2 protocol connection configuration
}) => {
  const sshClient = await getSSHClient(sshConfig);
  info('ssh-connection', `connected: ${host}`);
  const sftpClient = await sshClient.getSftp();
  info('sftp-connection', `connected: ${host}`);

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
  const startServiceCommand = `source ~/.bash_profile; cd ${remoteDir} && docker-compose down && docker-compose up -d --build`;
  info('ssh-command', startServiceCommand);
  await sshClient.exec(startServiceCommand);

  // logs
  delay(10 * 1000).then(() => {
    const checkRemoteLogCommand = `cd ${remoteDir} && docker-compose logs --tail 100`;
    return sshClient.exec(checkRemoteLogCommand);
  }).then((text) => {
    // 100 logs
    info('100 logs', text);
  });
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
    const remoteDigest = await readRemoteJson(host, remoteDigestFilePath, sshClient);
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
      await deleteRemoteFiles(host, delList, sshClient);
    }
    if (copyList.length) {
      await copyFilesToRemote(host, copyList, sftpClient);
    }
  } else {
    info('missing-remote-digest-json', `can not find remote digest json. ${host}:${remoteDigestFilePath}`);
    const clearRemoteStageCommand = `[ -d ${remoteStageDir} ] && rm -r ${remoteStageDir} || echo \\"no stage dir\\"`;
    info('ssh-command', clearRemoteStageCommand);
    // copy binaries
    await sshClient.exec(clearRemoteStageCommand);
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

// TODO
const deleteRemoteFiles = async(host, files, sshClient) => {
  const removeRemoteDirCommand = `rm -r ${files.join(' ')}" || echo "some deletion may fail.`;
  info('ssh-command', removeRemoteDirCommand);
  await sshClient.exec(removeRemoteDirCommand);
};

// TODO
const readRemoteJson = async(host, jsonFilePath, sshClient) => {
  const readRemoteFileCommand = `cat ${jsonFilePath}`;
  info('ssh-command', readRemoteFileCommand);
  const ret = await sshClient.exec(readRemoteFileCommand);
  return JSON.parse(ret.toString());
};

module.exports = {
  deployToServer
};
