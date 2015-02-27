"use strict";

var Q = require("bluebird");
var spawn = require("child_process").spawn;
var util = require("util");

var gerrit_ssh = function(command, config) {
  if (Array.isArray(command)) {
    command = util.format.apply(null, command);
  }

  command = "gerrit " + command;

  return promisifiedSpawn("ssh", ["-p", config.port, util.format("%s@%s", config.user, config.host), "--"].concat([command]));
};

gerrit_ssh.query = function(query, config) {
  if (Array.isArray(query)) {
    query = util.format.apply(null, query);
  }

  query = util.format("query %s --format json", query);

  return gerrit_ssh(query, config).then(function(result) {
    return result.split("\n").slice(0, -1).map(JSON.parse);
  });
};

gerrit_ssh.query.change_id = function(change_id, config) {
  return gerrit_ssh.query(change_id, config);
};

gerrit_ssh.query.topic = function(topic, config) {
  return gerrit_ssh.query(["project:%s topic:%s limit:1", config.project, topic], config);
};

gerrit_ssh.scp = function(src, dest, config) {
  var hostsource = util.format("%s@%s:'%s'", config.user, config.host, src);
  return promisifiedSpawn("scp", ["-p", "-P", config.port, hostsource, dest]);
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
