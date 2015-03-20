"use strict";

var child_process = require("child_process");
var util = require("util");
var fs = require("fs");
var Q = require("bluebird");
var _ = require("lodash");

var execSync = require("./execSyncPolyfill");

var GitError = function(code, command, msg) {
  Error.call(this);
  Error.captureStackTrace(this, GitError);
  this.message = msg;
  this.command = command;
  this.code = code;
};
util.inherits(GitError, Error);

var git = function(command) {

  if (arguments.length > 1) {
    command = util.format.apply(null, arguments);
  }

  var output;

  try {
    output = git.exec(command);
  }
  catch(err) {
    throw new GitError(err.status, command, err.stdout.trimRight());
  }

  return output;

};

git.GitError = GitError;

git.exec = function(command) {
  if (arguments.length > 1) {
    command = util.format.apply(null, arguments);
  }
  // trimRight() to get rid of the trailing newline
  return execSync("git " + command).trimRight();
};

git.execSuccess = function(command) {
  if (arguments.length > 1) {
    command = util.format.apply(null, arguments);
  }
  try {
    git.exec(command);
    return true;
  }
  catch (err) {
    return false;
  }
};

git.show = function(args) {
  var bufStdOut = [];
  var bufStdErr = [];

  var showStdOut = (arguments[1] !== undefined) ? arguments[1] : true;
  var showStdErr = (arguments[2] !== undefined) ? arguments[2] : true;

  if (!Array.isArray(args)) {
    args = [args];
  }

  return new Q(function(resolve, reject) {
    var spawn = child_process.spawn("git", args);
    if (showStdOut) {
      spawn.stdout.pipe(process.stdout);
    }
    if (showStdErr) {
      spawn.stderr.pipe(process.stderr);
    }
    spawn.stdout.on("data", [].push.bind(bufStdOut));
    spawn.stderr.on("data", [].push.bind(bufStdErr));
    spawn.on("error", reject);
    spawn.on("close", resolve);
  })
  .then(function(code) {
    if (code !== 0) {
      var errOutput = Buffer.concat(bufStdErr).toString().trimRight();
      var concatArgs = args.map(function(a) { return "'" + a + "'"; }).join(" ");
      throw new GitError(code, concatArgs, errOutput);
    }
  });

};

git.inRepo = function() {
  return git.execSuccess("rev-parse --git-dir");
};

git.dir = function() {
  return git("rev-parse --git-dir");
};

git.isDetachedHead = function() {
  // logic copied from __git_ps1
  // http://git.kernel.org/cgit/git/git.git/tree/contrib/completion/git-prompt.sh
  var headFile = git.dir() + "/HEAD";

  if (fs.lstatSync(headFile).isSymbolicLink()) {
    return false;
  }

  var headContent = fs.readFileSync(headFile, {encoding: "utf-8"});

  return !headContent.match(/^ref: /);
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

  var output;

  try {
    output = git.exec("config %s \"%s\"", flags.join(" "), key);
  }
  catch (err) {
    return null;
  }

  if (options.all) {
    output = output.split("\n");
  }
  else if (options.regex) {
    var lines = output.split("\n");
    output = {};
    lines.forEach(function(line) {
      var match = line.match(/^(.*?)( (.*))?$/);
      output[match[1]] = match[3];
    });
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
  return git("config %s \"%s\" \"%s\"", flags.join(" "), key, value);
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
  return git("config --unset %s \"%s\"", flags.join(" "), key);
};

git.branch = {};

git.branch.name = function(ref) {
  ref = ref || "HEAD";
  return git("symbolic-ref --quiet --short %s", ref);
};

git.branch.exists = function(name) {
  return git.execSuccess("show-ref --verify --quiet \"refs/heads/%s\"", name);
};

git.branch.remove = function(name) {
  git("branch -D \"%s\"", name);
};

git.hashFor = function(name) {
  return git("rev-list --max-count=1 \"%s\"", name);
};

git.revList = function(target, excludeTarget) {
  return git("rev-list \"%s\" \"^%s\"", target, excludeTarget).split("\n");
};

git.describeHash = function(hash) {
  return git("show --no-patch --format='%%h %%s' %s", hash);
};

module.exports = git;
