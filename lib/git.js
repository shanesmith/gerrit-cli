
var child_process = require("child_process");
var execSync = require("execSync");
var util = require("util");
var Promise = require("bluebird");

var git = function(command) {

  if (arguments.length > 1) {
    command = util.format.apply(null, arguments);
  }

  var result = git.exec(command);

  if (result.code !== 0) {
    throw new Error("Error, exit code " + result.code + " while running: git " + command);
  }

  // trimRight() to get rid of the trailing newline
  return result.stdout.trimRight();

};

git.exec = function(command) {
  if (arguments.length > 1) {
    command = util.format.apply(null, arguments);
  }
  return execSync.exec("git " + command);
};

git.show = function(command) {
  return new Promise(function(resolve, reject) {
    var args = Array.prototype.slice.call(arguments);
    var spawn = child_process.spawn("git", args, {
      stdio: 'inherit'
    });
    spawn.on('error', function(error) {
      reject(error);
    });
    spawn.on('close', function(code) {
      if (code === 0) {
        resolve();
      }
      else {
        reject(code);
      }
    });
  });
};

git.inRepo = function() {
  return (git.exec("rev-parse --git-dir").code === 0);
};

git.requireInRepo = function() {
  if (!git.inRepo()) {
    throw new Error("Working directory must be in a repository");
  }
};

git.dir = function() {
  return git("rev-parse --git-dir");
};

module.exports = git;
