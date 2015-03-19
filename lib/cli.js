"use strict";

var util = require("util");
var open = require("open");
var fs = require("fs");
var Q = require("bluebird");
var _ = require("lodash");

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

  var configsToDisplay;

  if (options.all) {

    configsToDisplay = gerrit.allConfigs();

  }
  else  {

    name = name || "default";

    configsToDisplay = gerrit.configExists(name)
      .then(function(configExists) {

        if (!configExists) {
          return null;
        }

        return gerrit.config(name);

      })
      .then(function(config) {

        if (config && !options.edit) {

          return {name: config};

        }
        else {

          var logText = (options.edit && config ? "Editing configuration for \"%s\"" : "Creating new configuration for \"%s\"");

          var defaults = config || {};

          logger.info([logText, name]);

          return prompter.prompt([{
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
              return gerrit.config(name, answers);
            })
            // don't display anything
            .return({});

        }

      });

  }

  configsToDisplay.then(function(configs) {

    for (var name in configs) {
      var config = configs[name];

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

  });

};

cli.projects = function(name, options) {
  name = name || "default";
  gerrit.projects(name).then(function(projects) {
    logger.info(projects.join("\n"));
  });
};

cli.clone = function(config_name, project_name, destination_folder, options) {

  var q;

  if (!config_name) {

    q = gerrit.allConfigs()
      .then(function(allConfigs) {
        var projects = _.keys(allConfigs);
        if (projects.length === 1) {
          return projects[0];
        }
        return prompter.choose("Clone from which server?", projects);
      })
      .then(function(answer) {
        config_name = answer;
        return gerrit.projects(config_name);
      })
      .then(function(projects) {
        return prompter.choose("Clone which project?", projects);
      })
      .then(function(answer) {
        project_name = answer;
        return prompter.untilValid(function() {
          return prompter.input("Clone to which folder?", project_name);
        }, function(answer) {
          var exists = fs.existsSync(answer);
          if (exists) {
            logger.info(["Destination %s already exists, please select another.", answer]);
          }
          return !exists;
        });
      })
      .then(function(answer) {
        destination_folder = answer;
      });

  }

  Q.resolve(q).then(function() {
    gerrit.clone(config_name, project_name, destination_folder);
  });

};

cli.status = function(options) {
  requireInRepo();
  gerrit.status(options.remote).then(function(patches) {
    patches.forEach(function(patch) {
      logger.info(["%s [%s] \"%s\" (%s)", patch.number, patch.topic, patch.subject, patch.owner.name]);
    });
  });
};

cli.assign = function(reviewersArray, options) {
  requireInRepo();

  var currentReviewers = git.config("gerrit.reviewers", {all: true}) || [];

  var revList = git.revList("HEAD", "@{u}");

  Q.resolve(revList)
    .then(function(revList) {

      if (revList.length === 1 || options.all) {
        return revList;
      }

      if (!options.interactive) {
        throw new CliError("There are more than one patch in this topic.\nPlease use the -a flag to assign to all, or -i to select interactively.");
      }

      var choices = _.map(revList, function(rev) {
        return {value: rev, name: git.describeHash(rev)};
      });

      return prompter.select("Which patches to assign reviewers?", choices);

    })
    .then(function(result) {

      revList = result;

      return gerrit.assign(revList, reviewersArray, options.remote);

    })
    .each(function(revResult, index) {

      if (index !== 0) {
        logger.newline();
      }

      logger.info(git.describeHash(revList[index]));

      Q.each(revResult, function(result) {

        var reviewer = result.reviewer;

        if (result.success) {
          logger.info("Assigned reviewer " + reviewer);

          if (currentReviewers.indexOf(reviewer) === -1) {
            git.config.add("gerrit.reviewers", reviewer);
          }
        }
        else {
          logger.warn("Could not assign reviewer " + reviewer);
        }

      });

    });
};

cli.ssh = function(command, options) {
  requireInRepo();
  gerrit.ssh(command, options.remote).then(function(result) {
    logger.info(result);
  });
};

cli.push = function(base_branch, reviewers, is_draft, options) {
  requireInRepo();
  gerrit.push(base_branch, is_draft, options.remote).then(function() {
    gerrit.assign(reviewers, options.remote);
  });
};

cli.checkout = function(target, patch_set, options) {
  requireInRepo();
  gerrit.checkout(target, patch_set, options.remote);
};

cli.recheckout = function(options) {
  requireInRepo();
  gerrit.checkout(git.branch.name(), null, true, options.remote);
};

cli.review = function(verified_score, code_review_score, message, options) {
  requireInRepo();
  gerrit.review(verified_score, code_review_score, message, null, options.remote);
};

cli.submit = function(message, options) {
  requireInRepo();
  gerrit.review(1, 2, message, "submit", options.remote);
};

cli.abandon = function(message, options) {
  requireInRepo();
  gerrit.review(null, null, message, "abandon", options.remote);
};

cli.comment = function(message, options) {
  requireInRepo();
  gerrit.review(null, null, message, null, options.remote);
};

cli.pubmit = function(base_branch, options) {
  requireInRepo();
  gerrit.push(base_branch, false, options.remote).then(function() {
    cli.submit(null, options);
  });
};

cli.browse = function(options) {
  var config = gerrit.remoteConfig(options.remote);
  var hash = git.hashFor("HEAD");
  open(util.format("%s/#/q/%s,n,z", config.url, hash));
};

cli.completion = function() {
  var code = 0;
  var output;
  try {
    output = gerrit.completion();
  }
  catch (err) {
    code = 1;
    output = "echo 'Error reading autocompletion file.'";
  }
  console.log(output);
  process.exit(code);
};


function requireInRepo() {
  if (!git.inRepo()) {
    throw new CliError("This command requires the working directory to be in a repository.");
  }
}


module.exports = cli;
