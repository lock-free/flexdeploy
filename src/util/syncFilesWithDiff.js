const path = require('path');
const {
  info
} = require('./info');
const {
  readJson
} = require('./fs');
const {
  diffListByLayer
} = require('./syncRemoteDir');

const syncFilesWithDiff = async (sshClient, sftpClient, {
  host,
  deployDir,
  remoteDir,
  deployStageName,
  digestMapFileName = 'dirDigestMap.json'
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
      await uploadFiles(host, copyList, sftpClient);
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

const readRemoteJson = async (host, jsonFilePath, sftpClient) => {
  info('sftp-readFile', `${host}:${jsonFilePath}`);
  const ret = await sftpClient.readFile(jsonFilePath);
  return JSON.parse(ret.toString());
};

const deleteRemoteFiles = async (host, files, sftpClient) => {
  return Promise.all(files.map(async (file) => {
    if (await sftpClient.existsFile(file)) {
      info('sftp-unlink', `${host}:${file}`);
      await sftpClient.unlink(file);
    }
  }));
};

const uploadFiles = async (host, list, sftpClient) => {
  return Promise.all(list.map(async ({
    remote,
    local
  }) => {
    info('sftp-upload', `from ${local} to ${host}:${remote}`);
    await sftpClient.upload(local, remote);
  }));
};

module.exports = {
  syncFilesWithDiff
};
