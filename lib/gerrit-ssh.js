
var Promise = require("bluebird");
var exec = require("child_process").exec;
var util = require("util");

var gerrit_ssh = function(command, config) {
  if (Array.isArray(command)) {
    command = util.format.apply(null, command);
  }
  return promisifiedExec(util.format("ssh -p %s %s@%s -- gerrit %s", config.port, config.user, config.host, command));
};

gerrit_ssh.query = function(query, config) {
  if (Array.isArray(query)) {
    query = util.format.apply(null, query);
  }

  query = util.format('query %s --format json', query);

  return gerrit_ssh(query, config).then(function(result) {
    return result.split("\n").slice(0, -1).map(JSON.parse);
  });
};

gerrit_ssh.scp = function(src, dest, config) {
  return promisifiedExec(util.format("scp -p -P %s %s@%s:'%s' '%s'", config.port, config.user, config.host, src, dest));
};

function promisifiedExec(command) {
  return new Promise(function(resolve, reject) {
    exec(command, function(err, stdout, stderr) {
      if (err) {
        reject(err, stderr.trimRight());
      }
      else {
        resolve(stdout.trimRight());
      }
    });
  });
}

module.exports = gerrit_ssh;
