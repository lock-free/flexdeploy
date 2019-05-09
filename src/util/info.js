const chalk = require('chalk');
const log = console.log.bind(console); // eslint-disable-line
const info = (title, txt) => {
  log(chalk.blue(`[${title}] ${txt}`));
};

const infoErr = (title, txt) => {
  log(chalk.red(`[${title}] ${txt}`));
};

module.exports = {
  info,
  infoErr
};
