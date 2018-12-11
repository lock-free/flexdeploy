const {
  errorLogWrapper
} = require('./util');
const {
  deployToServer
} = require('./deploy');
const {
  buildCode
} = require('./build');

const {
  generateDCY
} = require('./dockerComposeYml');

module.exports = {
  deployToServer: errorLogWrapper(deployToServer),
  generateDCY: errorLogWrapper(generateDCY),
  buildCode: errorLogWrapper(buildCode)
};
