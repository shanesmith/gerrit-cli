
var Promise = require("bluebird");
var util = require('util');
var fs = require('fs');
var mkdirp = Promise.promisify(require('mkdirp'));
var _ = require("lodash");

var git = require("./git");
var gerrit_ssh = require("./gerrit-ssh");
var logger = require("./logger");
var prompter = require('./prompter');


var gerrit = {};

gerrit.repoConfig = function() {
  git.requireInRepo();

  var name = git.config("remote.origin.gerrit");
  return gerrit.config(name);
};

gerrit.repoProject = function() {
  git.requireInRepo();

  var remoteUrl = git.config("remote.origin.url");

  var projectMatch = remoteUrl.match(/^ssh:\/\/[^/]*\/(.*?)(.git)?$/);
  if (projectMatch && projectMatch.length > 1) {
    var projectName = projectMatch[1];
    return projectName;
  }

  return null;
};

gerrit.allConfigs = function() {

  var configs = {};
  var hosts = git.config("gerrit.*.host", {global: true, regex: true});

  hosts.split('\n').forEach(function(host) {
    var hostMatch = host.match(/^gerrit\.(.*)\.host.*$/);
    if (hostMatch && hostMatch.length > 1) {
      var configName = hostMatch[1];
      configs[configName] = gerrit.config(configName);
    }
  });

  return configs;

};

gerrit.config = function(name) {
  if (name === undefined) {
    return gerrit.repoConfig();
  }

  var config = {};

  config.name = name;

  ["user", "host", "port"].forEach(function(key) {
    var value = git.config(util.format("gerrit.%s.%s", name, key));
    config[key] = value;
  });

  return config;

};

gerrit.projects = function(name) {
  return gerrit_ssh("ls-projects", gerrit.config(name)).then(function(result) {
    return result.split("\n");
  });
};

gerrit.clone = function(gerrit_name, project_name, destination_folder) {
  var config = gerrit.config(gerrit_name);

  destination_folder = destination_folder || project_name;

  if (fs.exists(destination_folder)) {
    return Promise.reject(util.format("Destination %s already exists", destination_folder));
  }

  logger.info("Cloning project %s from %s into folder %s...", project_name, gerrit_name, destination_folder);

  var source_url = util.format("ssh://%s@%s:%d/%s.git", config.user, config.host, config.port, project_name);

  return git.show(["clone", "--progress", source_url, destination_folder]).then(function(){

    process.chdir(destination_folder);

    git.config("remote.origin.gerrit", gerrit_name);

    return gerrit.installHook();

  });

};

gerrit.installHook = function() {
  logger.info("Setting up commit-msg hook...");

  git.requireInRepo();

  var hooks_dir = git.dir() + "/hooks";

  return mkdirp(hooks_dir).then(function() {

    return gerrit_ssh.scp("hooks/commit-msg", hooks_dir, gerrit.config());

  });

};

gerrit.ssh = function(command) {
  git.requireInRepo();

  return gerrit_ssh(command, gerrit.repoConfig());
};

gerrit.status = function() {
  git.requireInRepo();

  var project = gerrit.repoProject();

  return gerrit_ssh(["query status:open project:%s --format json", project], gerrit.repoConfig()).then(function(result) {
    return result.split("\n").slice(0, -1).map(JSON.parse);
  });
};

gerrit.assign = function(reviewersArray) {
  git.requireInRepo();

  var commit = git("rev-list --max-count=1 HEAD");

  var currentReviewers = git.config('gerrit.reviewers', {all: true}) || [];

  reviewersArray.forEach(function(reviewer) {

    gerrit_ssh(["set-reviewers --add '%s' -- %s", reviewer, commit], gerrit.repoConfig()).then(function() {

      logger.info("Assigned reviewer " + reviewer);

      if (currentReviewers.indexOf(reviewer) === -1) {
        git.config.add('gerrit.reviewers', reviewer);
      }

    });

  });
};

gerrit.push = function(base_branch, is_draft) {
  git.requireInRepo();

  var config = gerrit.repoConfig();

  var topic = git.branch.name();

  var type = (is_draft ? 'drafts' : 'for');

  base_branch = base_branch || git.config.get(util.format('branch.%s.merge', topic)) || "master";

  var ref = util.format("refs/%s/%s/%s", type, base_branch, topic);

  var draft_config_key = util.format('branch.%s.draft', topic);

  var should_undraft = false;

  if (!is_draft && git.config(draft_config_key) === "yes") {

    return prompter.confirm(
      ['Topic "%s" was previously saved as a *draft*, are you sure you want to un-draft it?', topic],
      false
    ).then(function(confirmed) {
      if (!confirmed) {
        return Promise.reject();
      }
      should_undraft = true;
      return do_push();
    });

  }

  return do_push();

  function do_push() {
    logger.info("Pushing to %s (%s)", config.name, ref);
    return git.show(['push', 'origin', 'HEAD:'+ref]).then(function() {
      if (should_undraft) {
        git.config.unset(draft_config_key);
      }
      else if (is_draft) {
        git.config(draft_config_key, "yes");
      }
    });
  }

};

gerrit.checkout = function(target, patch_set) {
  git.requireInRepo();

  var config = gerrit.repoConfig();


  var change_id;
  var topic;

  var q;

  if (/^[0-9]+$/.test(target)) {
    // change id

    change_id = target;

    q = gerrit_ssh.query(change_id, config).then(function(result) {

      if (result.length === 0) {
        return Promise.reject(util.format('Could not find change id "%s"', change_id));
      }

      topic = result[0].topic;

      if (!topic) {
        logger.warn("No topic found for this patch, you will be checked out in a detached head.");
      }

    });

  }
  else {

    topic = target;

    q = gerrit_ssh.query(["project:%s topic:%s limit:1", gerrit.repoProject(), topic], config).then(function(result) {

      if (result.length === 0) {
        return Promise.reject(util.format('Could not find topic "%s".', topic));
      }

      change_id = number;

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
        .max()
        .value();

    }

    ref = ref + "/" + patch_set;

    logger.info("Refspec is %s", ref);

    git('fetch origin %s', ref);

    var q = true;

    git('checkout FETCH_HEAD');

    if (topic === "master") {

      logger.warn("Patch topic is \"master\", therefore staying on detached head.");

    }
    else if (topic && git.branch.exists(topic)) {

      q = prompter.confirm(
        ['Branch with name "%s" already exists. Overwrite?', topic],
        false
      ).then(function(confirmed) {
        if (confirmed) {
          git.branch.remove(topic);
        }
        else {
          logger.warn("Staying on detached head.");
        }
      });

    }

    Promise.resolve(q).then(function() {

      if (topic && !git.branch.exists(topic)) {
        git('checkout -b "%s" FETCH_HEAD', topic);
      }

    });

  });

};

module.exports = gerrit;
