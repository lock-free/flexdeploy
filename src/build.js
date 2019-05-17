const path = require('path');
const {
  mkdirp,
  existsDir,
  spawnp,
  exec,
  info,
  saveJsonObj,
  getDirMd5FileMapping,
  checkoutToBranch,
  isGitRootRepo
} = require('./util');

/**
 * build code from source and copy the staging code to deploy directory
 * TODO sync code with master
 */
const buildCode = async (options) => {
  info('build code', `start to build code for ${options.project}-${options.onlineType}`);

  if (options.pktRepo) {
    await checkoutToBranch(options.pktRepo, options.onlineType);
    await spawnp('git', ['pull', 'origin', options.onlineType], {
      cwd: options.pktRepo,
      stdio: 'inherit'
    });
  }

  await buildFromSource(options);

  if (options.pktRepo) {
    // auto commit local changes
    await autoCommitLocal(options.project, options.onlineType, options.pktRepo);

    // tag it
    await autoTag(options.project, options.pktRepo, options.onlineType);
  }
};

const buildFromSource = async ({
  project,
  onlineType,
  sourceProjectDir,
  sourceStageDir,
  deployStageName,
  deployDir,
  digestMapFileName = 'dirDigestMap.json'
}) => {
  const stageCacheDir = path.join(deployDir, deployStageName);

  // create if not exists
  if(!await existsDir(stageCacheDir)) {
    await mkdirp(stageCacheDir);
  }

  const spopt = {
    cwd: sourceProjectDir,
    stdio: 'inherit'
  };

  if (await isGitRootRepo(sourceProjectDir)) {
    await checkoutToBranch(sourceProjectDir, onlineType);
    await spawnp('git', ['pull', 'origin', onlineType], spopt);
    // auto commit local changes
    await autoCommitLocal(project, onlineType, sourceProjectDir);
  }

  // build code
  if (process.env['BUILD'] !== 'OFF') {
    await spawnp('make', ['test'], spopt);
    await spawnp('make', ['build'], spopt);
  }

  // copy stage dir
  await copyStageDir(sourceProjectDir, sourceStageDir, stageCacheDir);

  // save digest map for stage dir
  await saveJsonObj(path.join(deployDir, digestMapFileName), await getDirMd5FileMapping(stageCacheDir), 4);

  if (await isGitRootRepo(sourceProjectDir)) {
    // tag it
    await autoTag(project, sourceProjectDir, onlineType);
  }
};

const autoTag = async (project, sourceProjectDir, onlineType) => {
  const spopt = {
    cwd: sourceProjectDir,
    stdio: 'inherit'
  };

  // tag it
  await spawnp('git', ['tag', '-a', `${onlineType}-${project}-${new Date().getTime()}`, '-m', `#tag auto build to ${onlineType} at ${new Date()}.`], spopt);
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

const autoCommitLocal = async (project, onlineType, sourceProjectDir) => {
  const spopt = {
    cwd: sourceProjectDir,
    stdio: 'inherit'
  };

  await spawnp('git', ['add', '.'], spopt);
  try {
    await spawnp('git', ['commit', '-m', `#auto build to ${project} ${onlineType} commit ${new Date()}.`], spopt);
  } catch (err) {
    // ignore
    // it's common to have nothing to commit
  }
};

module.exports = {
  buildCode
};
