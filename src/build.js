const path = require('path');
const {
  spawnp,
  exec,
  info,
  saveJsonObj,
  getDirMd5FileMapping,
  getBranchName,
  isGitRootRepo,
  checkoutToBranch
} = require('./util');

/**
 * build code from source and copy the staging code to deploy directory
 */
const buildCode = async (options) => {
  info('build code', `start to build code for ${options.project}-${options.onlineType}`);
  const isPktGit = await isGitRootRepo(options.deployDir);

  if (isPktGit) {
    await checkoutToBranch(options.deployDir, options.onlineType);
  }
  await buildFromSource(options);

  if (isPktGit) {
    // auto commit local changes
    await autoCommitLocal(options.onlineType, options.deployDir);
    // tag it
    await autoTag(options.deployDir, options.onlineType);
  }
};

const buildFromSource = async ({
  onlineType,
  sourceProjectDir,
  sourceStageDir,
  deployStageName,
  deployDir,
  digestMapFileName = 'dirDigestMap.json'
}) => {
  const stageCacheDir = path.join(deployDir, deployStageName);

  const spopt = {
    cwd: sourceProjectDir,
    stdio: 'inherit'
  };

  // validate branch
  const curBranch = await getBranchName(sourceProjectDir);
  if (curBranch !== onlineType) {
    throw new Error(`You should checkout to ${onlineType} branch to deploy your code. Current branch is ${curBranch}.`);
  }

  // auto commit local changes
  await autoCommitLocal(onlineType, sourceProjectDir);

  // build code
  if (process.env['BUILD'] !== 'OFF') {
    await spawnp('make', ['test'], spopt);
    await spawnp('make', ['build'], spopt);
  }

  // copy stage dir
  await copyStageDir(sourceProjectDir, sourceStageDir, stageCacheDir);

  // save digest map for stage dir
  await saveJsonObj(path.join(deployDir, digestMapFileName), await getDirMd5FileMapping(stageCacheDir), 4);

  // tag it
  await autoTag(sourceProjectDir, onlineType);
};

const autoTag = async (sourceProjectDir, onlineType) => {
  const spopt = {
    cwd: sourceProjectDir,
    stdio: 'inherit'
  };

  // tag it
  await spawnp('git', ['tag', '-a', `${onlineType}-${new Date().getTime()}`, '-m', `#auto online to ${onlineType} at ${new Date()}`], spopt);
  // push
  await spawnp('git', ['push', 'origin', onlineType], spopt);
};

const copyStageDir = async (sourceProjectDir, sourceStageDir, stageCacheDir) => {
  const spopt = {
    cwd: sourceProjectDir,
    stdio: 'inherit'
  };

  await exec(`[ -d ${stageCacheDir} ] && rm -r ${stageCacheDir} || echo "no stage cache dir"`, spopt);
  await spawnp('cp', ['-r', sourceStageDir, stageCacheDir], spopt);
};

const autoCommitLocal = async (onlineType, sourceProjectDir) => {
  const spopt = {
    cwd: sourceProjectDir,
    stdio: 'inherit'
  };

  await spawnp('git', ['pull', 'origin', onlineType], spopt);
  await spawnp('git', ['add', '.'], spopt);
  try {
    await spawnp('git', ['commit', '-m', `#auto online to ${onlineType} commit`], spopt);
  } catch (err) {
    // ignore
    // it's common to have nothing to commit
  }
};

module.exports = {
  buildCode
};
