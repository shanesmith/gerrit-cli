
var Promise = require("bluebird");

var exec = Promise.promisify(require("child_process").exec);

var util = require("util");

var gerrit_ssh = function(command, config) {
  return exec(util.format("ssh -p %s %s@%s -- gerrit %s", config.port, config.user, config.host, command)).then(function(outputs) {
    var stdout = outputs[0];
    // trimRight() to get rid of the trailing newline
    return stdout.trimRight();
  });
};

gerrit_ssh.scp = function(src, dest, config) {
  return exec(util.format("scp -p -P %s %s@%s:'%s' '%s'", config.port, config.user, config.host, src, dest));
};

module.exports = gerrit_ssh;
