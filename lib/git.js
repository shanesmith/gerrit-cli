
var exec = require("child_process").exec;
var execSync = require("execSync");

var git = function(command) {

  var result = git.exec(command);

  if (result.code !== 0) {
    throw new Error("Error, exit code " + result.code + " while running: git " + command);
  }

  // trimRight() to get rid of the trailing newline
  return result.stdout.trimRight();

};

git.exec = function(command) {
  return execSync.exec("git " + command);
};

git.inRepo = function() {
  return (git.exec("rev-parse --git-dir").code === 0);
};

git.requireInRepo = function() {
  if (!git.inRepo()) {
    throw new Error("Working directory must be in a repository");
  }
};

module.exports = git;
