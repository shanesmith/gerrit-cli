
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

git.show = function(args) {
  var bufStdOut = [];
  var bufStdErr = [];

  var showStdOut = (arguments[1] !== undefined) ? arguments[1] : true;
  var showStdErr = (arguments[2] !== undefined) ? arguments[2] : true;

  if (!Array.isArray(args)) {
    args = [args];
  }

  return new Promise(function(resolve, reject) {
    var spawn = child_process.spawn("git", args);
    if (showStdOut) {
      spawn.stdout.pipe(process.stdout);
    }
    if (showStdErr) {
      spawn.stderr.pipe(process.stderr);
    }
    spawn.stdout.on('data', [].push.bind(bufStdOut));
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
