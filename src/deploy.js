const path = require('path');
const {
  diffListByLayer
} = require('./syncRemoteDir');
const {
  spawnp,
  exec,
  info,
  readJson
} = require('./util');

/**
 * deploy code to server and using docker-compose way to start service
 */
const deployToServer = async ({
  host,
  deployDir,
  remoteDir,
  dockerComposeYml,
  deployStageName,
  digestMapFileName = 'dirDigestMap.json'
}) => {
  const opt = {
    stdio: 'inherit'
  };

  // create remote dir if not exists
  await exec(`ssh ${host} "[ -d ${remoteDir} ] || mkdir -p ${remoteDir}"`);

  // copy yml
  await spawnp('scp', [dockerComposeYml, `${host}:${remoteDir}/docker-compose.yml`], opt);

  // copy binaries
  await copyFiles({
    host,
    deployDir,
    deployStageName,
    remoteDir,
    digestMapFileName
  });

  // start server
  // source some startup files first to set up environment
  await exec(`ssh ${host} "source ~/.bash_profile; cd ${remoteDir} && docker-compose down && docker-compose up -d --build"`);

  // 100 logs
  info('100 logs', await exec(`ssh ${host} "cd ${remoteDir} && docker-compose logs --tail 100"`));
};

const copyFiles = async ({
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

  const opt = {
    stdio: 'inherit'
  };

  if (await existsRemoteFile(host, remoteDigestFilePath)) {
    const remoteDigest = await readRemoteJson(host, remoteDigestFilePath);
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
      await deleteRemoteFiles(host, delList);
    }
    if (copyList.length) {
      await copyFilesToRemote(host, copyList);
    }
  } else {
    info('missing-remote-digest-json', `can not find remote digest json. ${host}:${remoteDigestFilePath}`);
    // copy binaries
    await exec(`ssh ${host} "[ -d ${remoteStageDir} ] && rm -r ${remoteStageDir} || echo \\"no stage dir\\""`);
    await spawnp('scp', ['-r', stageCacheDir, `${host}:${remoteStageDir}`], opt);
  }

  // copy digest map json at last
  await spawnp('scp', [stageDigestFilePath, `${host}:${remoteDigestFilePath}`], opt);
};

const copyFilesToRemote = async (host, list) => {
  return Promise.all(list.map(async ({
    remote,
    local
  }) => {
    await spawnp('scp', ['-r', local, `${host}:${remote}`], {
      stdio: 'inherit'
    });
  }));
};

const deleteRemoteFiles = async (host, files) => {
  await exec(`ssh ${host} "rm -r ${files.join(' ')}" || echo "some deletion may fail."`);
};

const readRemoteJson = async (host, jsonFilePath) => {
  const ret = await exec(`ssh ${host} "cat ${jsonFilePath}"`);
  return JSON.parse(ret.toString());
};

const existsRemoteFile = async (host, remoteFile) => {
  try {
    await exec(`ssh ${host} stat ${remoteFile}`);
    return true;
  } catch (e) {
    return false;
  }
};

module.exports = {
  deployToServer
};
