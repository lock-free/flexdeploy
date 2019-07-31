const path = require('path');
const _ = require('lodash');
const {
  delay,
  info,
  getSSHClient,
  syncFilesWithDiff,
  parseTpl
} = require('./util');

/**
 * deploy code to server and using docker-compose way to start service
 * TODO add release notes
 */
const deployToServer = async (options) => {
  // check inst options
  if (!options.sshConfig) {
    throw new Error(`missing sshConfigs for host ${options.host}.`);
  }

  info('deploy-options', `${JSON.stringify(options, null, 4)}`);

  info('ssh-connection', `try to connected: ${options.host} with ${JSON.stringify(options.sshConfig, null, 4)}`);
  const sshClient = await getSSHClient(options.sshConfig);
  info('ssh-connection', `connected: ${options.host}`);
  const sftpClient = await sshClient.getSftp();
  info('sftp-connection', `connected: ${options.host}`);

  try {
    await deployToServerHelp(sshClient, sftpClient, options);

    // execute remote commands after deployment
    const afterCmds = _.get(options, 'hooks.afterDeployRemoteCmds');
    if (afterCmds) {
      await Promise.all(afterCmds.map((afterCmd) => {
        return sshClient.exec(parseTpl(afterCmd, options));
      }));
    }
  } finally {
    sshClient.conn.end();
    if (sshClient.parentConn) {
      sshClient.parentConn.end();
    }
  }
};

const deployToServerHelp = async (sshClient, sftpClient, options) => {
  // create remote dir if not exists
  info('sftp-mkdirp', `try to create dir ${options.remoteDir} if not exists.`);
  await sftpClient.mkdirp(options.remoteDir);

  // copy docker-compose.yml
  await syncDockerComposeYml(sftpClient, options);

  // copy binaries
  await syncFilesWithDiff(sshClient, sftpClient, options);

  // start service
  await lunchService(sshClient, options);
};

const syncDockerComposeYml = async (sftpClient, {
  host,
  remoteDir,
  dockerComposeYml
}) => {
  if (dockerComposeYml) {
    // copy yml
    const remoteDockerComposeYml = path.resolve(remoteDir, 'docker-compose.yml');
    info('sftp-upload', `from ${dockerComposeYml} to ${host}:${remoteDockerComposeYml}`);
    await sftpClient.upload(dockerComposeYml, remoteDockerComposeYml);
  }
};

const lunchService = async (sshClient, {
  host,
  remoteDir,
  dockerComposeYml,
  startCommand
}) => {
  if (dockerComposeYml) {
    // start server
    // source some startup files first to set up environment
    const startServiceCommand = startCommand || `source ~/.bash_profile; cd ${remoteDir} && docker-compose down && docker-compose build --force-rm && docker-compose up -d && docker system prune -f`;
    info('ssh-command', `${host}:${startServiceCommand}`);
    await sshClient.exec(startServiceCommand);

    if (!startCommand) {
      // logs
      await delay(5 * 1000);
      const checkRemoteLogCommand = `cd ${remoteDir} && docker-compose logs --tail 100`;
      await sshClient.exec(checkRemoteLogCommand);
    }
  }
};

module.exports = {
  deployToServer
};
