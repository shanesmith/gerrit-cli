"use strict";

var child_process = require("child_process");
var sync_exec = require("sync-exec");
var _ = require("lodash");

var execSync_wrapper = child_process.execSync && function(command, options) {
  options = _.defaults(options || {}, {encoding: "utf-8", stdio: "pipe"});
  return child_process.execSync(command, options);
};

var sync_exec_wrapper = function(command, options) {
  options = options || {};
  var result = sync_exec(command, options.timeout, options);
  if (result.status !== 0) {
    var err = new Error("Command failed: " + command);
    _.extend(err, result, {
      cmd: command,
      options: options
    });
    throw err;
  }
  return result.stdout;
};

module.exports = execSync_wrapper || sync_exec_wrapper;
