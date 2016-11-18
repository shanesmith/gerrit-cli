"use strict";

var Q = require("bluebird");
var spawn = require("child_process").spawn;
var util = require("util");

var _ = require("lodash");

var gerrit_ssh = function(command, config) {
  if (Array.isArray(command)) {
    command = util.format.apply(null, command);
  }

  var host = util.format("%s@%s", config.user, config.host);

  var sshArgs = [host];

  if (config.port) {
    sshArgs.push("-p", config.port);
  }

  sshArgs.push(
    "--",
    "gerrit " + command
  );

  return promisifiedSpawn("ssh", sshArgs);
};

gerrit_ssh.query = function(query, config) {
  var queryString = "";
  if (_.isArray(query)) {
    queryString = util.format.apply(null, query);
  }
  else if (_.isPlainObject(query)) {
    var queryObj = _.cloneDeep(query);
    var queryNotObj = queryObj.not || {};
    delete queryObj.not;

    queryString = []
      .concat( _.reduce(queryObj, reduceFunction(false), []) )
      .concat( _.reduce(queryNotObj, reduceFunction(true), []) )
      .join(" ");
  }
  else {
    queryString = "" + query;
  }

  queryString = util.format("query '%s' --format json --patch-sets --files --all-approvals --comments --commit-message --submit-records", queryString);

  return gerrit_ssh(queryString, config).then(function(result) {
    return result.split("\n").slice(0, -1).map(JSON.parse);
  });

  function reduceFunction(not) {
    return function (result, val, key) {
      if (!_.isArray(val)) {
        val = [val];
      }
      val.forEach(function(v) {
        var str = "";
        if (not) {
          str += "-";
        }
        str += key + ":" + v;
        result.push(str);
      });
      return result;
    };
  }
};

gerrit_ssh.query.number = function(number, config) {
  return gerrit_ssh.query(["%s project:%s limit:1", number, config.project], config);
};

gerrit_ssh.query.topic = function(topic, config) {
  return gerrit_ssh.query(["project:%s topic:%s limit:1", config.project, topic], config);
};

gerrit_ssh.scp = function(src, dest, config) {
  var hostsource = util.format("%s@%s:'%s'", config.user, config.host, src);

  var scpArgs = ["-p"];

  if (config.port) {
    scpArgs.push("-P", config.port);
  }

  scpArgs.push(hostsource, dest);

  return promisifiedSpawn("scp", scpArgs);
};

function promisifiedSpawn(command, args) {
  var bufStdOut = [];
  var bufStdErr = [];
  return new Q(function(resolve, reject) {
    var child = spawn(command, args);
    // child.stdout.pipe(process.stdout);
    // child.stderr.pipe(process.stderr);
    child.stdout.on("data", [].push.bind(bufStdOut));
    child.stderr.on("data", [].push.bind(bufStdErr));
    child.on("error", reject);
    child.on("close", resolve);
  })
  .then(function(code) {
    if (code !== 0) {
      var errOutput = Buffer.concat(bufStdErr).toString().trimRight();
      return Q.reject(errOutput);
    }
    else {
      return Buffer.concat(bufStdOut).toString().trimRight();
    }
  });
}

module.exports = gerrit_ssh;
