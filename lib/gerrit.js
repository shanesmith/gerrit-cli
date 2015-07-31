"use strict";

var Q = require("bluebird");
var util = require("util");
var fs = require("fs");
var url = require("url");
var path = require("path");
var mkdirp = Q.promisify(require("mkdirp"));
var _ = require("lodash");

var git = require("./git");
var gerrit_ssh = require("./gerrit-ssh");
var logger = require("./logger");
var prompter = require("./prompter");


var gerrit = {};

var GerritError = function(msg, code) {
  Error.call(this);
  Error.captureStackTrace(this, GerritError);
  this.message = msg;
  this.code = code;
  if (util.isArray(this.message)) {
    this.message = util.format.apply(null, this.message);
  }
};
util.inherits(GerritError, Error);
GerritError.GIT_PUSH_ERROR = 1;

gerrit.GerritError = GerritError;

gerrit.parseRemote = function(remote) {

  remote = remote || "origin";

  return requireInRepo()
    .then(function() {

      var remoteUrl = git.config(util.format("remote.%s.url", remote));

      if (!remoteUrl) {
        throw new GerritError(["Remote named \"%s\" does not exist", remote]);
      }

      if (/:\/\//.test(remoteUrl)) {
        remoteUrl = url.parse(remoteUrl);
        remoteUrl.pathname = remoteUrl.pathname && remoteUrl.pathname.replace(/^\//, "");
      }
      else {
        remoteUrl = url.parse("ssh://" + remoteUrl);
        remoteUrl.pathname = remoteUrl.pathname && remoteUrl.pathname.replace(/^\/:/, "");
      }

      remoteUrl.pathname = remoteUrl.pathname && remoteUrl.pathname.replace(/\.git$/, "");

      return {
        name: remote,
        host: remoteUrl.hostname,
        port: remoteUrl.port,
        user: remoteUrl.auth,
        project: remoteUrl.pathname
      };

    });

};

gerrit.allConfigs = function() {
  return Q.try(function() {

    var configs = {};
    var hosts = git.config("gerrit\\..*\\.host", {global: true, regex: true});

    for (var host in hosts) {
      var hostMatch = host.match(/^gerrit\.(.*)\.host$/);
      var configName = hostMatch[1];
      configs[configName] = gerrit.config(configName);
    }

    return Q.props(configs);

  });
};

gerrit.configExists = function(name) {
  return Q.try(function() {

    var gitconfig = git.config(util.format("gerrit\\.%s\\..+", name), {global: true, regex: true});

    return !_.isEmpty(gitconfig);

  });
};

gerrit.config = function(name, values) {
  return Q.try(function() {

    var config = {};

    var key;

    var gitconfig = git.config(util.format("gerrit\\.%s\\..+", name), {global: true, regex: true});

    if (_.isEmpty(gitconfig) && !values) {
      throw new GerritError(["Config for %s does not exist.", name]);
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

    config.name = name;

    return config;

  });
};

gerrit.projects = function(name) {
  return gerrit.config(name)
    .then(function(config) {
      return gerrit_ssh("ls-projects", config).call("split", "\n");
    });
};

gerrit.clone = function(gerrit_name, project_name, destination_folder) {
  return gerrit.config(gerrit_name)
    .then(function(config) {

      destination_folder = destination_folder || project_name;

      if (fs.existsSync(destination_folder)) {
        throw new GerritError(["Destination %s already exists", destination_folder]);
      }

      logger.info(["Cloning project %s from %s into folder %s...", project_name, gerrit_name, destination_folder]);

      var source_url = util.format("ssh://%s@%s:%d/%s.git", config.user, config.host, config.port, project_name);

      return git.show(["clone", "--progress", source_url, destination_folder]);

    })
    .then(function() {

        process.chdir(destination_folder);

        git.config("remote.origin.gerrit", gerrit_name);

        return gerrit.installHook("origin");

    });
};

gerrit.installHook = function(remote) {

  var hooks_dir;

  return requireInRepo()
    .then(function() {

      logger.info("Setting up commit-msg hook...");

      hooks_dir = git.dir() + "/hooks";

      return mkdirp(hooks_dir);

    })
    .then(function() {
      return gerrit.parseRemote(remote);
    })
    .then(function(remoteConfig) {
      return gerrit_ssh.scp("hooks/commit-msg", hooks_dir, remoteConfig);
    });

};

gerrit.ssh = function(command, remote) {
  return requireInRepo()
    .then(function() {
      return gerrit.parseRemote(remote);
    })
    .then(function(remoteConfig) {
      return gerrit_ssh(command, remoteConfig);
    });
};

gerrit.ssh_query = function(query, remote) {
  return requireInRepo()
    .then(function() {
      return gerrit.parseRemote(remote);
    })
    .then(function(remoteConfig) {
      return gerrit_ssh.query(query, remoteConfig);
    });
};

gerrit.patches = function(query, remote) {
  return requireInRepo()
    .then(function() {
      return gerrit.parseRemote(remote);
    })
    .then(function(remoteConfig){
      query = _.extend({
        status: "open",
        project: remoteConfig.project
      }, query);
      return gerrit_ssh.query(query, remoteConfig);
    });
};

gerrit.assign = function(revList, reviewersArray, remote) {

  var remoteConfig;

  if (!_.isArray(revList)) {
    revList = [revList];
  }

  return requireInRepo()
    .then(function() {
      return gerrit.parseRemote(remote);
    })
    .then(function(result) {

      remoteConfig = result;

      return revList;

    })
    .map(function(hash) {

      return Q.map(reviewersArray, function(reviewer) {

        return gerrit_ssh(["set-reviewers --add '%s' -- %s", reviewer, hash], remoteConfig)
          .then(function() {
            return {success: true, reviewer: reviewer};
          })
          .catch(function(err) {
            return {success: false, reviewer: reviewer};
          });

      });

    });

};

gerrit.up = function(remote, branch, is_draft) {

  var ref;

  var topic;

  var draft_config_key;

  var should_undraft = false;

  return requireInRepo()
    .then(function() {

      var type = (is_draft ? "drafts" : "for");

      if (!git.branch.hasUpstream()) {
        throw new GerritError("Topic does not have upstream branch.");
      }

      var upstream = git.branch.upstream();

      if (!git.branch.isRemote(upstream)) {
        throw new GerritError("Topic's upstream is not a remote branch.");
      }

      var parsedUpstream = git.branch.parsedRemote(upstream);

      branch = branch || parsedUpstream.branch;

      remote = remote || parsedUpstream.remote;

      topic = git.branch.name();

      ref = util.format("refs/%s/%s/%s", type, branch, topic);

      draft_config_key = util.format("branch.%s.draft", topic);

      if (!is_draft && git.config(draft_config_key) === "yes") {

        return prompter.confirm(
          ["Topic \"%s\" was previously saved as a *draft*, are you sure you want to un-draft it?", topic],
          false
        ).then(function(confirmed) {
          if (!confirmed) {
            return Q.reject();
          }
          should_undraft = true;
        });

      }

    })
    .then(function() {
      return gerrit.parseRemote(remote);
    })
    .then(function(remoteConfig) {
      logger.info(["Pushing to %s (%s)", remoteConfig.name, ref]);
      return git.show(["push", remoteConfig.name, "HEAD:"+ref])
        .catch(git.GitError, function() {
          throw new GerritError("Error while pushing commit.", GerritError.GIT_PUSH_ERROR);
        });
    })
    .then(function() {
      if (should_undraft) {
        git.config.unset(draft_config_key);
      }
      else if (is_draft) {
        git.config(draft_config_key, "yes");
      }
    });

};

gerrit.checkout = function(target, patch_set, force_branch_overwrite, remote) {

  var topic;
  var number;
  var branch;

  return requireInRepo()
    .then(requireCleanIndex)
    .then(function() {
      return gerrit.parseRemote(remote);
    })
    .then(function(remoteConfig) {

      remote = remoteConfig.name;

      //// TODO do we want this?
      // if (/^https?:\/\/.*\/#\/c\/[0-9]+/.test(target)) {
      //   var matches = target.match(/#\/c\/([0-9]+)(\/([0-9]+))?/);
      //   change_id = matches[1];
      //   patch_set = matches[3];
      // }

      return Q.props({
        number: gerrit_ssh.query.number(target, remoteConfig),
        topic:  gerrit_ssh.query.topic(target, remoteConfig)
      });

    })
    .then(function(result) {

      if (result.number.length && result.topic.length) {
        return prompter.choose(
          "Target " + target + " is both a topic name and patch number, which do you want to checkout?",
          [{value: "topic", name: "Topic Name"}, {value: "patch", name: "Patch Number"}]
        ).then(function(answer) {
          if (answer === "topic") {
            return result.topic[0];
          }
          else {
            return result.number[0];
          }
        });
      }
      else if (result.number.length) {
        return result.number[0];
      }
      else if (result.topic.length) {
        return result.topic[0];
      }
      else {
        throw new GerritError("Target " + target + " is neither a patch number nor a topic name.");
      }

    })
    .then(function(result) {

      topic = result.topic;
      number = result.number;
      branch = result.branch;

      var hash = number % 100;

      if (hash < 10) {
        hash = "0" + hash;
      }

      var ref = util.format("refs/changes/%s/%s", hash, number);

      if (!patch_set) {

        logger.info("Getting latest patchset...");

        var remote_refs = git("ls-remote '%s' '%s/*'", remote, ref).split("\n");

        patch_set = _.chain(remote_refs)
          .invoke(String.prototype.replace, /.*\/(.*)$/, "$1")
          .map(function(i) { return parseInt(i, 10); })
          .max()
          .value();

      }

      ref = ref + "/" + patch_set;

      logger.info(["Refspec is %s", ref]);

      git("fetch '%s' '%s'", remote, ref);

      git("checkout FETCH_HEAD");

      if (topic === "master") {

        logger.warn("Patch topic is \"master\", therefore staying on detached head.");

      }
      else if (topic && git.branch.exists(topic)) {

        if (force_branch_overwrite) {
          return true;
        }

        return prompter.confirm(
          ["Branch with name \"%s\" already exists. Overwrite?", topic],
          false
        );

      }

    })
    .then(function(removeBranch) {

      if (!_.isUndefined(removeBranch)) {

        if (removeBranch) {
          git.branch.remove(topic);
        }
        else {
          logger.warn("Staying on detached head.");
        }

      }

      if (topic && !git.branch.exists(topic)) {
        git.branch.create(topic, "FETCH_HEAD", true);
        git.branch.setUpstream(topic, remote + "/" + branch);
      }

    });

};

gerrit.review = function(hash, verified_score, code_review_score, message, action, remote) {

  return requireInRepo()
    .then(function() {
      return gerrit.parseRemote(remote);
    })
    .then(function(remoteConfig) {

      var allowedActions = ["submit", "abandon"];

      var command = ["review"];

      command.push(util.format("--project '%s'", remoteConfig.project));

      if (action && _.contains(allowedActions, action)) {
        command.push("--" + action);
      }

      if (verified_score || verified_score === 0) {
        command.push(util.format("--verified '%s'", verified_score));
      }

      if (code_review_score || code_review_score === 0) {
        command.push(util.format("--code-review '%s'", code_review_score));
      }

      if (message) {
        command.push(util.format("--message '%s'", message));
      }

      command.push(hash);

      command = command.join(" ");

      return gerrit_ssh(command, remoteConfig);

    });

};

gerrit.completion = function() {
  var filepath = path.join(__dirname, "..", "completion", "gerrit-completion.bash");
  return String(fs.readFileSync(filepath));
};

gerrit.topic = function(name, upstream) {
  if (!upstream) {
    upstream = git.branch.upstream();
  }
  git.branch.create(name, "HEAD", true);
  git.branch.setUpstream("HEAD", upstream);
};

function requireInRepo() {
  return Q.try(function() {
    if (!git.inRepo()) {
      throw new GerritError("Working directory must be in a repository.");
    }
  });
}

function requireCleanIndex() {
  return Q.try(function() {
    if (!git.isIndexClean()) {
      throw new GerritError("There are uncommitted changes.");
    }
  });
}

module.exports = gerrit;
