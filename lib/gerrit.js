"use strict";

var Q = require("bluebird");
var util = require("util");
var fs = require("fs");
var url = require("url");
var mkdirp = Q.promisify(require("mkdirp"));
var _ = require("lodash");

var git = require("./git");
var gerrit_ssh = require("./gerrit-ssh");
var logger = require("./logger");
var prompter = require("./prompter");


var gerrit = {};

gerrit.GerritError = function(msg) {
  Error.call(this);
  Error.captureStackTrace(this, gerrit.GerritError);
  this.message = msg;
  if (util.isArray(this.message)) {
    this.message = util.format.apply(null, this.message);
  }
};
util.inherits(gerrit.GerritError, Error);
var GerritError = gerrit.GerritError;

gerrit.repoConfig = function() {
  requireInRepo();

  var remoteUrl = git.config("remote.origin.url");

  if (remoteUrl) {
    if (/:\/\//.test(remoteUrl)) {
      remoteUrl = url.parse(remoteUrl);
    }
    else {
      remoteUrl = url.parse("ssh://" + remoteUrl);
      remoteUrl.pathname = remoteUrl.pathname && remoteUrl.pathname.replace(/^\/:/, "");
    }
    return {
      name: "origin",
      host: remoteUrl.hostname,
      port: remoteUrl.port,
      user: remoteUrl.auth,
      project: remoteUrl.pathname
    };
  }
  else {
    throw Error("OH NOES");
  }
};

gerrit.allConfigs = function() {

  var configs = {};
  var hosts = git.config("gerrit.*.host", {global: true, regex: true});

  for (var host in hosts) {
    var hostMatch = host.match(/^gerrit\.(.*)\.host$/);
    var configName = hostMatch[1];
    configs[configName] = gerrit.config(configName);
  }

  return configs;

};

gerrit.configExists = function(name) {
  var gitconfig = git.config(util.format("gerrit\\.%s\\..+", name), {global: true, regex: true});
  return !_.isEmpty(gitconfig);
};

gerrit.config = function(name, values) {

  var config = {};

  var key;

  var gitconfig = git.config(util.format("gerrit\\.%s\\..+", name), {global: true, regex: true});

  if (_.isEmpty(gitconfig) && !values) {
    throw new gerrit.GerritError(["Config for %s does not exist.", name]);
  }

  for (key in gitconfig) {
    var value = gitconfig[key];
    key = key.match(/\.([^.]*)$/)[1];
    config[key] = value || null;
  }

  if (values) {

    config = _.extend(config, values);

    for (key in config) {
      var configKey = util.format("gerrit.%s.%s", name, key);
      git.config(configKey, config[key], {global: true});
    }

  }

  if (config.url) {
    // normalize url by removing trailing slash
    config.url = config.url.replace(/\/$/, "");
  }

  config.name = name;

  return config;

};

gerrit.topic_for_changeid = function(change_id, config) {
  return gerrit_ssh.query(change_id, config).then(function(result) {

    if (result.length === 0) {
      return Q.reject(util.format("Could not find change id \"%s\"", change_id));
    }

    return result[0].topic;

  });
};

gerrit.changeid_for_topic = function(topic, config) {
  return gerrit_ssh.query(["project:%s topic:%s limit:1", config.project, topic], config).then(function(result) {

    if (result.length === 0) {
      return Q.reject(util.format("Could not find topic \"%s\".", topic));
    }

    return result[0].number;

  });
};

gerrit.projects = function(name) {
  return gerrit_ssh("ls-projects", gerrit.config(name)).then(function(result) {
    return result.split("\n");
  });
};

gerrit.clone = function(gerrit_name, project_name, destination_folder) {
  var config = gerrit.config(gerrit_name);

  destination_folder = destination_folder || project_name;

  if (fs.existsSync(destination_folder)) {
    throw new GerritError(["Destination %s already exists", destination_folder]);
  }

  logger.info(["Cloning project %s from %s into folder %s...", project_name, gerrit_name, destination_folder]);

  var source_url = util.format("ssh://%s@%s:%d/%s.git", config.user, config.host, config.port, project_name);

  return git.show(["clone", "--progress", source_url, destination_folder]).then(function(){

    process.chdir(destination_folder);

    git.config("remote.origin.gerrit", gerrit_name);

    return gerrit.installHook();

  });

};

gerrit.installHook = function() {
  logger.info("Setting up commit-msg hook...");

  requireInRepo();

  var hooks_dir = git.dir() + "/hooks";

  return mkdirp(hooks_dir).then(function() {

    return gerrit_ssh.scp("hooks/commit-msg", hooks_dir, gerrit.repoConfig());

  });

};

gerrit.ssh = function(command) {
  requireInRepo();

  return gerrit_ssh(command, gerrit.repoConfig());
};

gerrit.status = function() {
  requireInRepo();

  var config = gerrit.repoConfig();

  return gerrit_ssh.query(["status:open project:%s", config.project], config);
};

gerrit.assign = function(reviewersArray) {
  requireInRepo();

  var hash = git.hashFor("HEAD");

  var currentReviewers = git.config("gerrit.reviewers", {all: true}) || [];

  reviewersArray.forEach(function(reviewer) {

    gerrit_ssh(["set-reviewers --add '%s' -- %s", reviewer, hash], gerrit.repoConfig()).then(function() {

      logger.info("Assigned reviewer " + reviewer);

      if (currentReviewers.indexOf(reviewer) === -1) {
        git.config.add("gerrit.reviewers", reviewer);
      }

    });

  });
};

gerrit.push = function(base_branch, is_draft) {
  requireInRepo();

  var config = gerrit.repoConfig();

  var topic = git.branch.name();

  var type = (is_draft ? "drafts" : "for");

  base_branch = base_branch || git.config.get(util.format("branch.%s.merge", topic)) || "master";

  var ref = util.format("refs/%s/%s/%s", type, base_branch, topic);

  var draft_config_key = util.format("branch.%s.draft", topic);

  var should_undraft = false;

  if (!is_draft && git.config(draft_config_key) === "yes") {

    return prompter.confirm(
      ["Topic \"%s\" was previously saved as a *draft*, are you sure you want to un-draft it?", topic],
      false
    ).then(function(confirmed) {
      if (!confirmed) {
        return Q.reject();
      }
      should_undraft = true;
      return do_push();
    });

  }

  return do_push();

  function do_push() {
    logger.info(["Pushing to %s (%s)", config.name, ref]);
    return git.show(["push", "origin", "HEAD:"+ref]).then(function() {
      if (should_undraft) {
        git.config.unset(draft_config_key);
      }
      else if (is_draft) {
        git.config(draft_config_key, "yes");
      }
    });
  }

};

gerrit.checkout = function(target, patch_set, force_branch_overwrite) {
  requireInRepo();

  var config = gerrit.repoConfig();

  var change_id;
  var topic;

  var q;

  if (/^[0-9]+$/.test(target)) {
    // change id

    change_id = target;

  }
  else if (/^https?:\/\/.*\/#\/c\/[0-9]+/.test(target)) {

    var matches = target.match(/#\/c\/([0-9]+)(\/([0-9]+))?/);

    change_id = matches[1];
    patch_set = matches[3];

  }

  if (change_id) {

    q = gerrit.topic_for_changeid(change_id, config).then(function(result) {

      topic = result;

      if (!topic) {
        logger.warn("No topic found for this patch, you will be checked out in a detached head.");
      }

    });

  }
  else {

    topic = target;

    q = gerrit.changeid_for_topic(topic, config).then(function(result) {

      change_id = result;

    });

  }

  return q.then(function() {

    var hash = change_id % 100;

    if (hash < 10) {
      hash = "0" + hash;
    }

    var ref = util.format("refs/changes/%s/%s", hash, change_id);

    if (!patch_set) {

      logger.info("Getting latest patchset...");

      var result = git("ls-remote origin '%s/*'", ref);

      patch_set = _.chain(result.split("\n"))
        .invoke(String.prototype.replace, /.*\/(.*)$/, "$1")
        .map(function(i) { return parseInt(i, 10); })
        .max()
        .value();

    }

    ref = ref + "/" + patch_set;

    logger.info(["Refspec is %s", ref]);

    git("fetch origin %s", ref);

    var q = Q.resolve(true);

    git("checkout FETCH_HEAD");

    if (topic === "master") {

      logger.warn("Patch topic is \"master\", therefore staying on detached head.");

    }
    else if (topic && git.branch.exists(topic)) {

      if (!force_branch_overwrite) {

        q = q.then(function() {
          return prompter.confirm(
            ["Branch with name \"%s\" already exists. Overwrite?", topic],
            false
          );
        });

      }

      q.then(function(confirmed) {
        if (confirmed) {
          git.branch.remove(topic);
        }
        else {
          logger.warn("Staying on detached head.");
        }
      });

    }

    q.then(function() {

      if (topic && !git.branch.exists(topic)) {
        git("checkout -b \"%s\" FETCH_HEAD", topic);
      }

    });

  });

};

gerrit.review = function(verified_score, code_review_score, message, action) {
  requireInRepo();

  var config = gerrit.repoConfig();

  var allowedActions = ["submit", "abandon"];

  var hash = git.hashFor("HEAD");

  var command = ["review"];

  command.push(util.format("--project '%s'", config.project));

  if (action && _.contains(allowedActions, action)) {
    command.push("--" + action);
  }

  if (!_.isUndefined(verified_score) && verified_score !== null) {
    command.push(util.format("--verified '%s'", verified_score));
  }

  if (!_.isUndefined(code_review_score) && code_review_score !== null) {
    command.push(util.format("--code-review '%s'", code_review_score));
  }

  if (message) {
    command.push(util.format("--message '%s'", message));
  }

  command.push(hash);

  command = command.join(" ");

  return gerrit_ssh(command, config);

};

function requireInRepo() {
  if (!git.inRepo()) {
    throw new GerritError("Working directory must be in a repository");
  }
}

module.exports = gerrit;
