
var git = require("./git");
var gerrit = require("./gerrit");
var logger = require("./logger");

var cli = {};

cli.config = function(name, options) {
  var configs;

  if (options.all) {
    configs = gerrit.allConfigs();
  }
  else if (name) {
    configs = {name: gerrit.config(name)};
  }
  else if (git.inRepo()) {
    var repoConfig = gerrit.repoConfig();
    if (repoConfig) {
      configs = {};
      configs[repoConfig.name] = repoConfig;
    }
    else {
      logger.error("Could not find the repository's gerrit config name. Was it set up with `gerrit clone`?");
      return;
    }
  }
  else {
    logger.error("You are not in a repository. Please specify a config name or --all.");
    return;
  }

  for (var key in configs) {
    var config = configs[key];
    logger.info(
      [
        "---------------",
        "Conf: %s",
        "---------------",
        "Host: %s",
        "User: %s",
        "Port: %s",
        ""
      ].join("\n"),
      config.name,
      config.host,
      config.user,
      config.port
    );

  }
};

cli.projects = function(name, options) {
  gerrit.projects(name).then(function(projects) {
    logger.info(projects.join("\n"));
  });
};

cli.clone = function(gerrit_name, project_name, destination_folder, options) {
  gerrit.clone(gerrit_name, project_name, destination_folder);
};

cli.status = function() {
  gerrit.status().then(function(patches) {
    patches.forEach(function(patch) {
      logger.info("%s [%s] \"%s\" (%s)", patch.number, patch.topic, patch.subject, patch.owner.name);
    });
  });
};

cli.assign = function(reviewersArray) {
  gerrit.assign(reviewersArray);
};

cli.ssh = function(command) {
  gerrit.ssh(command).then(function(result) {
    logger.info(result);
  });
};

cli.push = function(base_branch, reviewers, is_draft) {
  gerrit.push(base_branch, is_draft).then(function() {
    gerrit.assign(reviewers);
  });
};

cli.checkout = function(target, patch_set) {
  gerrit.checkout(target, patch_set);
};

cli.recheckout = function() {
  gerrit.checkout(git.branch.name(), null, true);
};

cli.review = function(verified_score, code_review_score, message) {
  gerrit.review(verified_score, code_review_score, message);
};

cli.submit = function(message) {
  gerrit.review(1, 2, message, "submit");
};

cli.abandon = function(message) {
  gerrit.review(null, null, message, "abandon");
};

cli.comment = function(message) {
  gerrit.review(null, null, message);
};

cli.pubmit = function(base_branch) {
  gerrit.push(base_branch, false).then(function() {
    cli.submit();
  });
};

module.exports = cli;
