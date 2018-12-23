const path = require('path');
const {
  diffListByLayer
} = require('./syncRemoteDir');
const {
  delay,
  spawnp,
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
  const opt = {
    stdio: 'inherit'
  };

  const sshClient = await getSSHClient(sshConfig);

  // create remote dir if not exists
  await sshClient.exec(`[ -d ${remoteDir} ] || mkdir -p ${remoteDir}`);

  // copy yml
  await spawnp('scp', [dockerComposeYml, `${host}:${remoteDir}/docker-compose.yml`], opt);

  // copy binaries
  await copyFiles({
    host,
    deployDir,
    deployStageName,
    remoteDir,
    digestMapFileName,
    sshClient
  });

  // start server
  // source some startup files first to set up environment
  await sshClient.exec(`source ~/.bash_profile; cd ${remoteDir} && docker-compose down && docker-compose up -d --build`);

  // logs
  delay(10 * 1000).then(() => {
    return sshClient.exec(`cd ${remoteDir} && docker-compose logs --tail 100`);
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
  sshClient
}) => {
  const remoteStageDir = path.join(remoteDir, deployStageName);
  const stageCacheDir = path.join(deployDir, deployStageName);
  const stageDigestFilePath = path.join(deployDir, digestMapFileName);
  const remoteDigestFilePath = path.join(remoteDir, digestMapFileName);

  const opt = {
    stdio: 'inherit'
  };

  if (await existsRemoteFile(host, remoteDigestFilePath, sshClient)) {
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
      await copyFilesToRemote(host, copyList);
    }
  } else {
    info('missing-remote-digest-json', `can not find remote digest json. ${host}:${remoteDigestFilePath}`);
    // copy binaries
    await sshClient.exec(`[ -d ${remoteStageDir} ] && rm -r ${remoteStageDir} || echo \\"no stage dir\\"`);
    await spawnp('scp', ['-r', stageCacheDir, `${host}:${remoteStageDir}`], opt);
  }

  // copy digest map json at last
  await spawnp('scp', [stageDigestFilePath, `${host}:${remoteDigestFilePath}`], opt);
};

const copyFilesToRemote = async(host, list) => {
  return Promise.all(list.map(async({
    remote,
    local
  }) => {
    await spawnp('scp', ['-r', local, `${host}:${remote}`], {
      stdio: 'inherit'
    });
  }));
};

const deleteRemoteFiles = async(host, files, sshClient) => {
  await sshClient.exec(`rm -r ${files.join(' ')}" || echo "some deletion may fail.`);
};

const readRemoteJson = async(host, jsonFilePath, sshClient) => {
  const ret = await sshClient.exec(`cat ${jsonFilePath}`);
  return JSON.parse(ret.toString());
};

const existsRemoteFile = async(host, remoteFile, sshClient) => {
  try {
    await sshClient.exec(`stat ${remoteFile}`);
    return true;
  } catch (e) {
    return false;
  }
};

module.exports = {
  deployToServer
};
