
var child_process = require("child_process");
var execSync = require("execSync");
var util = require("util");
var Promise = require("bluebird");

var GitError = function(code, command, msg) {
  Error.call(this);
  Error.captureStackTrace(this, arguments.callee);
  this.message = msg;
  this.command = command;
  this.code = code;
};
util.inherits(GitError, Error);

var git = function(command) {

  if (arguments.length > 1) {
    command = util.format.apply(null, arguments);
  }

  var result = git.exec(command);

  // trimRight() to get rid of the trailing newline
  var output = result.stdout.trimRight();

  if (result.code !== 0) {
    throw new GitError(result.code, command, output);
  }

  return output;

};

git.GitError = GitError;

git.exec = function(command) {
  if (arguments.length > 1) {
    command = util.format.apply(null, arguments);
  }
  return execSync.exec("git " + command);
};

git.show = function(command) {
  var bufStdErr = [];
  var args = [].slice.call(arguments);

  return new Promise(function(resolve, reject) {
    var spawn = child_process.spawn("git", args, {
      stdio: [process.stdin, process.stdout, 'pipe']
    });
    spawn.stderr.on('data', [].push.bind(bufStdErr));
    spawn.on('error', reject);
    spawn.on('close', resolve);
  })
  .then(function(code) {
    if (code !== 0) {
      var errOutput = Buffer.concat(bufStdErr).toString().trimRight();
      var concatArgs = args.map(function(a) { return "'" + a + "'"; }).join(' ');
      throw new GitError(code, concatArgs, errOutput);
    }
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
