"use strict";

var _ = require("lodash");
var Q = require("bluebird");
var fs = require("fs");
var util = require("util");
var child_process = require("child_process");

var logger = require("./logger");
var helpers = require("./helpers");

var git = {};

var GitError = helpers.makeError("GitError", function(code, command, output, error) {
  this.code = code;
  this.command = command;
  this.output = output;
  this.error = error;
});

git.GitError = GitError;

git.exec = function(command) {

  if (arguments.length > 1) {
    command = util.format.apply(null, arguments);
  }

  logger.debug("git.exec: " + command);

  var output;

  try {
    output = child_process.execSync("git " + command, {encoding: "utf-8", stdio: "pipe"});
  }
  catch(err) {
    throw new GitError(err.status, command, err.stdout.trimRight(), err.stderr.trimRight());
  }

  // trimRight() to get rid of the trailing newline
  output = output.trimRight();

  return output;
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

  args = _.castArray(args);

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
      throw new GitError(code, concatArgs, "", errOutput);
    }
  });

};

git.inRepo = function() {
  return git.execSuccess("rev-parse --git-dir");
};

git.dir = function() {
  return git.exec("rev-parse --git-dir");
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

git.isIndexClean = function() {
  return git.execSuccess("diff-index --no-ext-diff --quiet --exit-code HEAD");
};

git.hashFor = function(name) {
  return git.exec("rev-list --max-count=1 '%s'", name);
};

git.revList = function(target, excludeTarget) {
  var revList = git.exec("rev-list '%s' '^%s'", target, excludeTarget);

  if (!revList) {
    return [];
  }

  return revList.split("\n");
};

git.describeHash = function(hash) {
  return git.commitInfo(hash, "%h %s");
};

git.commitInfo = function(commit, format) {
  return git.exec("show --no-patch --format='%s' %s", format, commit);
};

git.getChangeId = function(commit) {
  var message = git.commitInfo(commit, "%b");
  var match = message.match(/^Change-Id:\s*(I[a-z0-9]+)$/m);

  if (!match) {
    return null;
  }

  return match[1];
};

git.config = function(key, values, options) {
  if (arguments.length === 2 && !_.isString(values) && !_.isArray(values)) {
    options = values;
    values = undefined;
  }

  if (_.isUndefined(values)) {
    return git.config.get(key, options);
  }

  return git.config.set(key, values, options);
};

git.config.get = function(key, options) {
  var output;
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

  try {
    output = git.exec("config %s '%s'", flags.join(" "), key);
  }
  catch (err) {
    if (options.all || options.regex) {
      return [];
    }
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
      if (!output[match[1]]) {
        output[match[1]] = [];
      }
      output[match[1]].push(match[3]);
    });
  }

  return output;

};

git.config.set = function(key, values, options) {
  var flags = [];
  var defaults = {
    global: false,
    local: false,
    add: false,
    unique: false
  };

  values = _.castArray(values);

  options = _.extend({}, defaults, options);

  if (options.global) {
    flags.push("--global");
  }

  if (options.local) {
    flags.push("--local");
  }

  flags.push("--add");

  if (!options.add) {
    try {
      git.config.unset(key, options);
    }
    catch (e) {}
  }
  else if (options.unique) {
    // we want to add unique values
    var getOptions =  _.extend({}, options, {all: true});
    var currentValues = git.config.get(key, getOptions);
    values = _.difference(values, currentValues);
  }

  values.forEach(function(val, i) {
    git.exec("config %s '%s' '%s'", flags.join(" "), key, val);
  });

  return values;

};

git.config.add = function(key, values, options) {
  options = _.extend({}, options, {add: true});
  return git.config.set(key, values, options);
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

  git.exec("config --unset-all %s '%s'", flags.join(" "), key);
};

git.config.unsetMatching = function(key, values, options) {
  var flags = [];
  var defaults = {
    global: false,
    local: false,
  };

  values = _.castArray(values);

  options = _.extend({}, defaults, options);

  if (options.global) {
    flags.push("--global");
  }

  if (options.local) {
    flags.push("--local");
  }

  var getOptions =  _.extend({}, options, {all: true});
  var currentValues = git.config.get(key, getOptions);
  values = _.intersection(values, currentValues);

  values.forEach(function(val) {
    git.exec("config --unset %s '%s' '^%s$'", flags.join(" "), key, val);
  });

  return values;
};

git.config.subsections = function(section, options) {
  options = _.extend({}, options, {regex: true});
  var configs = git.config("^" + section + "\\.", options);
  return _.chain(configs)
    .keys()
    .map(function(subsection) { return subsection.substr(section.length + 1).replace(/\.[^.]*$/, ""); })
    .value();
};

git.config.removeSection = function(section, options) {
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

  git.exec("config --remove-section %s '%s'", flags.join(" "), section);
};

git.config.renameSection = function(section, name, options) {
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

  git.exec("config --rename-section %s '%s' '%s'", flags.join(" "), section, name);
};

git.config.sectionExists = function(section, options) {
  options = _.extend({}, options, {regex: true});
  var result = git.config.get(util.format("^%s\\.", section), options);
  return !_.isEmpty(result);
};

git.branch = {};

git.branch.name = function(ref) {
  ref = ref || "HEAD";
  return git.exec("symbolic-ref --quiet --short %s", ref);
};

git.branch.exists = function(name) {
  return git.execSuccess("show-ref --verify --quiet 'refs/heads/%s'", name);
};

git.branch.remove = function(name) {
  git.exec("branch -D '%s'", name);
};

git.branch.create = function(name, start_point, checkout) {
  start_point = start_point || "HEAD";
  if (checkout) {
    return git.exec("checkout -b '%s' '%s'", name, start_point);
  }
  else {
    return git.exec("branch '%s' '%s'", name, start_point);
  }
};

git.branch.hasUpstream = function(name) {
  name = name || "HEAD";
  return git.execSuccess("rev-parse --verify '%s@{u}'", name);
};

git.branch.setUpstream = function(name, upstream) {
  name = name || "HEAD";
  return git.exec("branch --set-upstream-to='%s' '%s'", upstream, name);
};

git.branch.upstream = function(name) {
  name = name || "HEAD";
  return git.exec("rev-parse --symbolic-full-name --abbrev-ref '%s@{u}'", name);
};

git.branch.isRemote = function(name) {
  return git.execSuccess("rev-parse --verify 'refs/remotes/%s'", name);
};

git.branch.parsedRemote = function(name) {
  var match = name.match(/(.*?)\/(.*)/);
  return {remote: match[1], branch: match[2]};
};

git.branch.list = function() {
  return git.exec("for-each-ref --format='%(refname:short)' refs/heads/").split("\n");
};

module.exports = git;
