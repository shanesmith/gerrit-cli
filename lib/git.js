
var child_process = require("child_process");
var execSync = require("execSync");
var util = require("util");
var Promise = require("bluebird");
var _ = require("lodash");

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

git.config = function(key, value, options) {
  if (arguments.length === 2) {
    if (!_.isString(value)) {
      options = value;
      value = undefined;
    }
  }

  if (_.isUndefined(value)) {
    return git.config.get(key, options);
  }
  else {
    return git.config.set(key, value, options);
  }
};

git.config.get = function(key, options) {
  var flags = [];
  var defaults = {
    global: false,
    local: false,
    all: false,
    regex: false
  };

  options = _.extend({}, defaults, options);

  if (options.global) {
    flags.push("--global");
  }
  if (options.local) {
    flags.push("--local");
  }
  if (options.all) {
    flags.push("--get-all");
  }
  if (options.regex) {
    flags.push("--get-regexp");
  }

  var result = git.exec('config %s "%s"', flags.join(" "), key);

  if (result.code !== 0) {
    return null;
  }

  var output = result.stdout.trimRight();

  if (options.all) {
    output = output.split("\n");
  }

  return output;

};

git.config.set = function(key, value, options) {
  var flags = [];
  var defaults = {
    global: false,
    local: false,
    add: false
  };
  options = _.extend({}, defaults, options);
  if (options.global) {
    flags.push("--global");
  }
  if (options.local) {
    flags.push("--local");
  }
  if (options.add) {
    flags.push("--add");
  }
  return git('config %s "%s" "%s"', flags.join(" "), key, value);
};

git.config.add = function(key, value, options) {
  options = _.extend({}, options, {add: true});
  return git.config.set(key, value, options);
};

git.config.unset = function(key, options) {
  var flags = [];
  var defaults = {
    global: false,
    local: false,
  };
  options = _.extend({}, defaults, options);
  if (options.global) {
    flags.push("--global");
  }
  if (options.local) {
    flags.push("--local");
  }
  return git('config --unset %s "%s"', flags.join(" "), key);
};

git.branch = {};

git.branch.name = function(ref) {
  ref = ref || "HEAD";
  return git('symbolic-ref --quiet --short %s', ref);
};

module.exports = git;
