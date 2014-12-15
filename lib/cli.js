"use strict";

var util = require("util");
var open = require("open");

var git = require("./git");
var gerrit = require("./gerrit");
var logger = require("./logger");
var prompter = require("./prompter");


var cli = {};

cli.CliError = function(msg) {
  Error.call(this);
  Error.captureStackTrace(this, cli.CliError);
  this.message = msg;
  if (util.isArray(this.message)) {
    this.message = util.format.apply(null, this.message);
  }
};
util.inherits(cli.CliError, Error);
var CliError = cli.CliError;

cli.config = function(name, options) {

  var configs = [];

  if (options.all) {

    configs = gerrit.allConfigs();

  }
  else  {

    name = name || "default";

    var configExists = gerrit.configExists(name);

    if (configExists && !options.edit) {

      configs.push(gerrit.config(name));

    }
    else {

      var logText = (options.edit && configExists ? "Editing configuration for \"%s\"" : "Creating new configuration for \"%s\"");

      var defaults = {};

      if (configExists) {
        defaults = gerrit.config(name);
      }

      logger.info([logText, name]);

      prompter.prompt([{
        type: "input",
        name: "host",
        message: "Host",
        default: defaults.host
      }, {
        type: "input",
        name: "port",
        message: "Port",
        default: defaults.port || "29418"
      }, {
        type: "input",
        name: "user",
        message: "User",
        default: defaults.user
      }])
      .then(function(answers) {
        gerrit.config(name, answers);
      });

    }

  }

  for (var key in configs) {
    var config = configs[key];
    logger.info([
      [
        "name = %s",
        "host = %s",
        "user = %s",
        "port = %s",
        "url = %s",
        ""
      ].join("\n"),
      config.name || "<undefined>",
      config.host || "<undefined>",
      config.user || "<undefined>",
      config.port || "<undefined>",
      config.url  || "<undefined>"
    ]);
  }

};

cli.projects = function(name, options) {
  name = name || "default";
  gerrit.projects(name).then(function(projects) {
    logger.info(projects.join("\n"));
  });
};

cli.clone = function(gerrit_name, project_name, destination_folder, options) {
  gerrit.clone(gerrit_name, project_name, destination_folder);
};

cli.status = function() {
  requireInRepo();
  gerrit.status().then(function(patches) {
    patches.forEach(function(patch) {
      logger.info(["%s [%s] \"%s\" (%s)", patch.number, patch.topic, patch.subject, patch.owner.name]);
    });
  });
};

cli.assign = function(reviewersArray) {
  requireInRepo();
  gerrit.assign(reviewersArray);
};

cli.ssh = function(command) {
  requireInRepo();
  gerrit.ssh(command).then(function(result) {
    logger.info(result);
  });
};

cli.push = function(base_branch, reviewers, is_draft) {
  requireInRepo();
  gerrit.push(base_branch, is_draft).then(function() {
    gerrit.assign(reviewers);
  });
};

cli.checkout = function(target, patch_set) {
  requireInRepo();
  gerrit.checkout(target, patch_set);
};

cli.recheckout = function() {
  requireInRepo();
  gerrit.checkout(git.branch.name(), null, true);
};

cli.review = function(verified_score, code_review_score, message) {
  requireInRepo();
  gerrit.review(verified_score, code_review_score, message);
};

cli.submit = function(message) {
  requireInRepo();
  gerrit.review(1, 2, message, "submit");
};

cli.abandon = function(message) {
  requireInRepo();
  gerrit.review(null, null, message, "abandon");
};

cli.comment = function(message) {
  requireInRepo();
  gerrit.review(null, null, message);
};

cli.pubmit = function(base_branch) {
  requireInRepo();
  gerrit.push(base_branch, false).then(function() {
    cli.submit();
  });
};

cli.browse = function() {
  var config = gerrit.repoConfig();
  var hash = git.hashFor("HEAD");
  open(util.format("%s/#/q/%s,n,z", config.url, hash));
};


function requireInRepo() {
  if (!git.inRepo()) {
    throw new CliError("This command requires the working directory to be in a repository.");
  }
}


module.exports = cli;
