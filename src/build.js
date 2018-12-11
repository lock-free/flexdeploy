const path = require('path');
const {
  spawnp,
  exec,
  info,
  saveJsonObj
} = require('./util');
const {
  getDirMd5FileMapping
} = require('./syncRemoteDir');

/**
 * build code from source and copy the staging code to deploy directory
 */
const buildCode = async ({
  project,
  onlineType,
  sourceProjectDir,
  sourceStageDir,
  deployStageName,
  deployDir,
  digestMapFileName = 'dirDigestMap.json'
}) => {
  const stageCacheDir = path.join(deployDir, deployStageName);
  info('build code', `start to build code for ${project}-${onlineType}`);

  const spopt = {
    cwd: sourceProjectDir,
    stdio: 'inherit'
  };

  // check branch
  const gbc = await spawnp('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    cwd: sourceProjectDir
  }, {
    stdout: true
  });
  const curBranch = gbc.stdouts.join('').trim();
  if (curBranch !== onlineType) {
    throw new Error(`You should checkout to ${onlineType} branch to deploy your code. Current branch is ${curBranch}.`);
  }

  // git operations
  await spawnp('git', ['pull', 'origin', onlineType], spopt);
  await spawnp('git', ['add', '.'], spopt);
  try {
    await spawnp('git', ['commit', '-m', `#auto online to ${onlineType} commit`], spopt);
  } catch (err) {
    // ignore
    // it's common to have nothing to commit
  }

  // build code
  if(process.env['BUILD'] !== 'OFF') {
    await spawnp('make', ['test'], spopt);
    await spawnp('make', ['build'], spopt);
  }

  // copy stage dir
  await exec(`[ -d ${stageCacheDir} ] && rm -r ${stageCacheDir} || echo "no stage cache dir"`, spopt);
  await spawnp('cp', ['-r', sourceStageDir, stageCacheDir], spopt);
  // save digest map for stage dir
  await saveJsonObj(path.join(deployDir, digestMapFileName), await getDirMd5FileMapping(stageCacheDir), 4);

  // tag it
  await spawnp('git', ['tag', '-a', `${onlineType}-${new Date().getTime()}`, '-m', `#auto online to ${onlineType} at ${new Date()}`], spopt);
  // push
  await spawnp('git', ['push', 'origin', onlineType], spopt);
};

module.exports = {
  buildCode
};
