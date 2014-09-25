
var Promise = require("bluebird");

var exec = Promise.promisify(require("child_process").exec);

var gerrit_ssh = function(command, gerrit_name) {
  var gerrit = require("./gerrit");
  var config;

  if (!gerrit_name) {
    config = gerrit.repoConfig();
  }
  else {
    config = gerrit.config(gerrit_name);
  }

  return exec("ssh -p " + config.port + " " + config.user + "@" + config.host + " -- gerrit " + command).then(function(outputs) {
    var stdout = outputs[0];
    // trimRight() to get rid of the trailing newline
    return stdout.trimRight();
  });

};

module.exports = gerrit_ssh;
