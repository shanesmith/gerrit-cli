"use strict";

var Q = require("bluebird");
var _ = require("lodash");
var fs = require("fs");
var util = require("util");
var open = require("open");
var chalk = require("chalk");
var Table = require("cli-table");
var moment = require("moment");

var git = require("./git");
var gerrit = require("./gerrit");
var logger = require("./logger");
var helpers = require("./helpers");
var prompter = require("./prompter");
var gerrit_ssh = require("./gerrit-ssh");

var cli = {};

var CliError = helpers.makeError("CliError");

cli.CliError = CliError;

cli.loglevel = "warn";

cli.setLogLevel = function(level) {
  if (!_.includes(logger.LEVELS, level)) {
    throw new CliError("Invalid log level: " + level);
  }
  cli.loglevel = level;
};

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
              message: "Host " + chalk.grey("(ex: example.com)"),
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

  return configsToDisplay.then(_).call("forEach", function(config, name) {

    logger.info([
      [
        "name = %s",
        "host = %s",
        "user = %s",
        "port = %s",
        ""
      ].join("\n"),
      config.name || "<undefined>",
      config.host || "<undefined>",
      config.user || "<undefined>",
      config.port || "<undefined>",
    ]);

  });

};

cli.projects = function(options) {
  var config = options.config || "default";

  return requireConfigExists(config)
    .then(function() {
      return gerrit.projects(config);
    })
    .then(function(projects) {
      logger.info(projects.join("\n"));
    });
};

cli.clone = function(project_name, destination_folder, options) {
  var config = options.config || "default";

  return requireConfigExists(config)
    .then(function() {

      if (project_name) {
        return;
      }

      return gerrit.projects(config)
        .then(function(projects) {
          return prompter.autocomplete("Clone which project?", projects);
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

    })
    .then(function() {

      return gerrit.clone(config, project_name, destination_folder, !options.noHook);

    });

};

cli.addRemote = function(remote_name, project_name, options) {
  var config = options.config || "default";

  requireInRepo();

  return requireConfigExists(config)
    .then(function() {

      if (project_name) {
        return project_name;
      }

      return gerrit.projects(config)
        .then(function(projects) {
          return prompter.autocomplete("Add remote for which project?", projects);
        });

    })
    .then(function(project_name) {
      return gerrit.addRemote(remote_name, config, project_name, options.installHook);
    });

};

cli.installHook = function(options) {
  requireInRepo();

  return gerrit.installHook(options.remote);
};

var noBorders = {
  "top": "", "top-mid": "", "top-left": "", "top-right": "",
  "bottom": "", "bottom-mid": "", "bottom-left": "", "bottom-right": "",
  "left": "", "left-mid": "",
  "mid": "", "mid-mid": "",
  "right": "", "right-mid": "",
  "middle": ""
};

var MINUTE = 60;
var HOUR = 60 * MINUTE;
var DAY = 24 * HOUR;
var YEAR = 365 * DAY;
var dynamicTimeFormat = cli._dynamicTimeFormat = function(m) {
  var diff = moment().diff(m, "seconds");
  var format;
  if (diff < DAY) {
    format = "hh:mm a";
  }
  else if (diff < YEAR) {
    format = "MMM Do";
  }
  else {
    format = "MMM Do, YYYY";
  }
  return m.format(format);
};

cli.patches = function(options) {
  requireInRepo();

  var format = (options.format || cli.patches.defaultFormat).match(/\x25[a-zA-Z0-9]{1,2}|\x25{2}|[^\x25]+/g);

  var opts = options.opts();

  var query = {};

  if (!options.table && !options.vertical && !options.oneline) {
    options.table = true;
  }

  for (var key in opts) {
    var val = opts[key];
    var target = query;

    if (_.isUndefined(val)) {
      continue;
    }

    if (key.match(/^not[A-Z0-9]/)) {
      key = key.replace(/^not/, "");
      key = key[0].toLowerCase() + key.substr(1);
      query.not = (query.not || {});
      target = query.not;
    }

    switch(key) {
      case "author":
        target.owner = val;
        break;

      case "assigned":
        target.reviewer = "self";
        break;

      case "mine":
        target.owner = "self";
        break;

      case "reviewed":
      case "watched":
      case "starred":
      case "drafts":
        if (!target.is) {
          target.is = [];
        }
        target.is.push(key);
        break;

      case "number":
        target.change = val;
        break;

      case "owner":
      case "reviewer":
      case "branch":
      case "topic":
      case "message":
      case "age":
        target[key] = val;
        break;
    }

  }

  var head = [];
  var multiline = [];
  var getval = [];

  format.forEach(function(str) {
    if (str[0] !== "%" || str === "%%") {
      return;
    }
    var key = str.substr(1);
    var val = cli.patches.tokens[key];
    if (!val) {
      throw new CliError("Unknown format: " + str);
    }
    head.push(val[0]);
    multiline.push(val[1]);
    if (typeof val[2] === "string") {
      getval.push(function(patch) { return patch[val[2]]; });
    }
    else {
      getval.push(val[2]);
    }
  });

  return gerrit.patches(query, options.remote).then(function(patches) {

    if (options.oneline) {

      patches.forEach(function(patch) {

        var i = 0;
        var line = "";

        format.forEach(function(str) {

          if (str === "%%") {
            line += "%";
          }
          else if (str[0] === "%") {
            line += getval[i](patch, options);
            i++;
          }
          else {
            line += str;
          }

        });

        logger.info(line);

      });

      return;

    }

    var table = new Table({
      chars: noBorders,
      head: head,
      multiline: multiline
    });

    patches.forEach(function(patch) {

      var row = [];

      getval.forEach(function(func) {
        row.push(func(patch, options) || "");
      });

      table.push(row);

    });

    if (options.table) {
      logger.info(table.toString());
      return;
    }

    table.forEach(function(row) {

      var string = "";

      var printTable = new Table({chars: noBorders});

      table.options.head.forEach(function(header, index) {
        header = chalk.yellow(header);
        if (table.options.multiline[index]) {
          string += printTable.toString();
          printTable = new Table({chars: noBorders});
          string += "\n " + header + ":\n" + helpers.indent(4, row[index]);
        }
        else {
          printTable.push([header + ":", row[index]]);
        }
      });

      string += printTable.toString();

      logger.info(string);
      logger.newline();

    });

  });

};

cli.patches.defaultFormat = "%n %R %t %b %ou %du %s";

cli.patches.tokens = {
  "n": [
    "Number",
    false,
    "number"
  ],
  "i": [
    "Change-Id",
    false,
    "id"
  ],
  "c": [
    "Comments",
    true,
    function(patch) {
      if (!patch.comments) {
        return "<none>";
      }

      var comments = [];

      patch.comments.reverse().forEach(function(comm) {
        var time = dynamicTimeFormat(moment.unix(comm.timestamp));
        comments.push(comm.reviewer.username + " (" + time + ")\n" + helpers.indent(2, comm.message));
      });

      return comments.join("\n\n");
    }
  ],
  "O": [
    "Owner",
    false,
    function(patch) { return util.format("%s <%s>", patch.owner.name, patch.owner.email); }
  ],
  "on": [
    "Owner Name",
    false,
    function(patch) { return patch.owner.name; }
  ],
  "oe": [
    "Owner Email",
    false,
    function(patch) { return patch.owner.email; }
  ],
  "ou": [
    "Owner",
    false,
    function(patch) { return patch.owner.username; }
  ],
  "p": [
    "Project",
    false,
    "project"
  ],
  "b": [
    "Branch",
    false,
    "branch"
  ],
  "t": [
    "Topic",
    false,
    "topic"
  ],
  "dc": [
    "Created",
    false,
    function(patch) {
      var createdOn = moment.unix(patch.createdOn);
      return dynamicTimeFormat(createdOn);
    }
  ],
  "du": [
    "Updated",
    false,
    function(patch) {
      var lastUpdate = moment.unix(patch.lastUpdated);
      return dynamicTimeFormat(lastUpdate);
    }
  ],
  "u": [
    "URL",
    false,
    "url"
  ],
  "s": [
    "Subject",
    false,
    function(patch, options) {
      var subject = patch.subject;
      if (options.table && subject.length > 85) {
        subject = subject.substring(0, 80) + "...";
      }
      return subject;
    }
  ],
  "a": [
    "Status",
    false,
    "status"
  ],
  "e": [
    "Patch Sets",
    false,
    function(patch) { return patch.patchSets.length; }
  ],
  "r": [
    "Reviews (Verified, Code-Review)",
    true,
    function(patch) {
      var reviewers = {};
      var lastPatchSet = patch.patchSets[patch.patchSets.length-1];

      if (!lastPatchSet.approvals) {
        return "<none>";
      }

      lastPatchSet.approvals.forEach(function(approval) {
        reviewers[approval.by.name] = reviewers[approval.by.name] || {};
        reviewers[approval.by.name][approval.type] = approval.value;
      });

      var reviewersTable = new Table({
        chars: noBorders,
        colAligns: ["left", "right", "right"],
        wordWrap: true
      });

      for (var name in reviewers) {
        var verified = reviewers[name].Verified || 0;
        var codeReview = reviewers[name]["Code-Review"] || 0;
        if (verified === 0) {
          verified = " " + verified;
        }
        else if (verified > 0) {
          verified = "+" + verified;
        }
        if (codeReview === 0) {
          codeReview = " " + codeReview;
        }
        else if (codeReview > 0) {
          codeReview = "+" + codeReview;
        }
        reviewersTable.push([
          name,
          verified,
          codeReview
        ]);
      }

      return reviewersTable.toString();
    }
  ],
  "R": [
    " V / CR",
    false,
    function(patch) {
      var minReview = {};
      var lastPatchSet = patch.patchSets[patch.patchSets.length-1];

      if (!lastPatchSet.approvals) {
        return " 0 /  0";
      }

      lastPatchSet.approvals.forEach(function(approval) {
        var curValue = minReview[approval.type] || 99;
        minReview[approval.type] = Math.min(approval.value, curValue);
      });

      if (!minReview["Code-Review"]) {
        minReview["Code-Review"] = " 0";
      }
      else if (minReview["Code-Review"] > 0) {
        minReview["Code-Review"] = "+" + minReview["Code-Review"];
      }

      if (!minReview.Verified) {
        minReview.Verified = " 0";
      }
      else if (minReview.Verified > 0) {
        minReview.Verified = "+" + minReview.Verified;
      }

      return minReview.Verified + " / " + minReview["Code-Review"];
    }
  ],
  "f": [
    "Files",
    true,
    function(patch) {
      var lastPatchSet = patch.patchSets[patch.patchSets.length-1];
      var filesTable = new Table({
        chars: noBorders,
        colAligns: ["left", "left", "right", "right"]
      });
      lastPatchSet.files.forEach(function(file) {
        if (file.file === "/COMMIT_MSG") {
          return;
        }
        filesTable.push([
          file.type[0],
          file.file,
          "+" + file.insertions,
          file.deletions || "-0"
        ]);
      });
      return filesTable.toString();
    }
  ],
  "m": [
    "Message",
    true,
    function(patch) { return patch.commitMessage.replace(/^\s*Change-Id:\s*.+$/m, "").trim(); }
  ]
};

cli.status = function(what) {
  requireInRepo();

  var options = arguments[arguments.length-1];

  if (!what) {
    what = git.branch.name();
  }

  if (/^[0-9]+$/.test(what)) {
    // blergh....
    options.option("--number <number>");
    options.number = what;
  }
  else {
    options.option("--topic <topic>");
    options.topic = what;
  }

  options.format = "%n %t %b %ou %du %s %R %c";
  options.vertical = true;

  return cli.patches(options);
};

cli.assign = function(reviewersArray, options) {
  requireInRepo();

  var currentReviewers = git.config("gerrit.reviewers", {all: true}) || [];

  var revList = getRevList();

  return Q.try(function() {

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

      return Q.each(revResult, function(result) {

        var reviewer = result.reviewer;

        if (result.success) {
          logger.info("Assigned reviewer " + reviewer);

          if (currentReviewers.indexOf(reviewer) === -1) {
            git.config.add("gerrit.reviewers", reviewer);
          }
        }
        else {
          logger.warn("Could not assign reviewer " + reviewer);
          logger.warn(result.error);
        }

      });

    });
};

cli.ssh = function(command, options) {
  requireInRepo();

  return gerrit.ssh(command, options.remote).then(function(result) {
    logger.info(result);
  });
};

cli.up = function(options) {
  requireInRepo();
  requireRemoteUpstream();

  var hasComments = !!options.comment;
  var hasAssignees = !!(options.assign && options.assign.length);

  var all = true;

  return _push(options.remote, options.branch, options.draft)
    .then(function() {

      if (hasAssignees || hasComments) {

        var revList = getRevList();

        if (revList.length > 1) {

          var what = [];

          if (hasAssignees) {
            what.push("reviewers");
          }

          if (hasComments) {
            what.push("comments");
          }

          what = what.join(" and ");

          logger.newline();
          logger.log("More than one patch detected.");

          return prompter.confirm("Assign " + what + " to all patches being pushed?")
            .then(function(result) {
              all = result;
            });
        }

      }

    })
    .then(function() {

      if (all) {
        options.all = true;
      }
      else {
        options.interactive = true;
      }

      return Q.try(function() {
        if (hasComments) {
          return cli.comment(options.comment, options);
        }
      })
      .then(function() {
        if (hasAssignees) {
          return cli.assign(options.assign, options);
        }
      });

    });

};

cli.checkout = function(target, patch_set, options) {
  requireInRepo();
  requireCleanIndex();

  return gerrit.checkout(target, patch_set, false, options.remote);
};

cli.recheckout = function(options) {
  requireInRepo();
  requireCleanIndex();

  return gerrit.checkout(git.getChangeId("HEAD"), null, true, options.remote);
};

cli.review = function(verified_score, code_review_score, message, options) {
  requireInRepo();

  var questions = [{
    type: "input",
    name: "verified_score",
    message: "Verified score [-1 to +1]",
    default: verified_score,
    validate: function(val) {
      return _.includes(["", "-1", "0", "1", "+1"], val.trim()) || "Please enter a valid score between -1 and +1";
    }
  }, {
    type: "input",
    name: "code_review_score",
    message: "Code Review score [-2 to +2]",
    default: code_review_score,
    validate: function(val) {
      return _.includes(["", "-2", "-1", "0", "1", "+1", "2", "+2"], val.trim()) || "Please enter a valid score between -2 and +2";
    }
  }, {
    type: "input",
    name: "message",
    message: "Message",
    default: message
  }];

  return _review("review", questions, options)
    .each(function(result) {
      return gerrit.review(result.hash, result.verified_score, result.code_review_score, result.message, null, options.remote);
    })
    .then(function(result) {
      if (result.length === 0) {
        logger.info("Nothing has been reviewed.");
      }
      else {
        logger.info("Reviews have been posted successfully.");
      }
    });
};

cli.submit = function(message, options) {
  requireInRepo();

  var questions = [{
    type: "input",
    name: "message",
    message: "Message",
    default: message
  }];

  return _review("submit", questions, options)
    .each(function(result) {
      return gerrit.review(result.hash, "1", "2", result.message, "submit", options.remote);
    })
    .then(function(result) {
      if (result.length === 0) {
        logger.info("Nothing has been bsubmitted.");
      }
      else {
        logger.info("Submissions successful.");
      }
    });
};

cli.abandon = function(message, options) {
  requireInRepo();

  var questions = [{
    type: "input",
    name: "message",
    message: "Message",
    default: message
  }];

  return _review("abandon", questions, options)
    .each(function(result) {
      return gerrit.review(result.hash, null, null, result.message, "abandon", options.remote);
    })
    .then(function(result) {
      if (result.length === 0) {
        logger.info("Nothing has been abandonned.");
      }
      else {
        logger.info("Abandons successful.");
      }
    });
};

cli.comment = function(message, options) {
  requireInRepo();

  var questions = [{
    type: "input",
    name: "message",
    message: "Message",
    default: message
  }];

  return _review("comment", questions, options)
    .each(function(result) {
      if (result.message) {
        return gerrit.review(result.hash, null, null, result.message, null, options.remote);
      }
    })
    .then(function(result) {
      if (result.length === 0) {
        logger.info("Nothing has been posted.");
      }
      else {
        logger.info("Comments have been posted successfully.");
      }
    });
};

cli.ninja = function(options) {
  requireInRepo();
  requireRemoteUpstream();

  return Q.try(function() {

    var revList = getRevList();

    if (revList.length === 1 || options.all) {
      return true;
    }

    return prompter.confirm("There are more than one patch in this topic, are you sure you want to submit them all?");

  })
  .then(function(result) {

    if (!result) {
      return;
    }

    options = _.extend({}, options, {all: true});

    return _push(options.remote, options.branch, false)
      .then(function() {
        return cli.submit(null, options);
      });

  });

};

function _push(remote, branch, is_draft) {

  var remoteConfig;

  var prompt_undraft = function() {
    return prompter.confirm("This commit already exists in Gerrit as a *draft*, would you like to un-draft it?", false)
      .then(function(confirmed) {

        if (!confirmed) {
          return;
        }

        return gerrit.undraft(git.hashFor("HEAD"), remote)
          .then(function() {
            logger.info("Successfully undrafted!");
          });

      });
  };

  return gerrit.parseRemote(remote)
    .then(function(result) {

      remoteConfig = result;

      return gerrit_ssh.query(git.getChangeId("HEAD"), remoteConfig);

    })
    .then(function(patch) {

      var last_patch_set;
      var is_same_commit;

      if (patch.length !== 0) {

        last_patch_set = _.last(patch[0].patchSets);

        is_same_commit = (last_patch_set.revision === git.hashFor("HEAD"));

        if (is_same_commit) {

          if (!last_patch_set.isDraft || is_draft) {
            throw new CliError("This commit has already been sent to Gerrit.");
          }

          return prompt_undraft();

        }

      }

      return Q.try(function() {

        if (last_patch_set && last_patch_set.isDraft && !is_draft) {

          return prompter.confirm("The last patch set was sent as a *draft*, would you like to send this patch set as a draft as well?", true)
            .then(function(confirmed) {
              is_draft = confirmed;
            });

        }

      })
      .then(function() {

        return gerrit.up(remote, branch, is_draft);

      });

    });

}

function _review(type, questions, options) {
  var revList = getRevList().reverse();

  if (revList.length > 1 && !options.all && !options.interactive) {
    throw new CliError("There are more than one patch in this topic.\nPlease use the -i or -a flag to select interactively or apply to all.");
  }

  var capitalizedType = type.charAt(0).toUpperCase() + type.slice(1);

  var prompt = capitalizedType + " this patch?";

  return Q.mapSeries(revList, function(hash, index) {

    if (revList.length === 1 || options.all) {

      var result = {hash: hash};

      for (var i in questions) {
        var q = questions[i];
        result[q.name] = q.default;
      }

      return result;

    }

    if (index !== 0) {
      logger.newline();
    }

    logger.info(git.describeHash(hash));

    return prompter.confirm(prompt)
      .then(function(confirmed) {
        if (!confirmed) {
          return null;
        }
        return prompter.prompt(questions);
      })
      .then(function(answers) {
        if (answers) {
          answers.hash = hash;
        }
        return answers;
      });

  })
  .filter(function(result) {
    return !!result;
  });

}

cli.web = function(options) {
  requireInRepo();

  var hash = git.hashFor("HEAD");

  return gerrit.ssh_query(hash, options.remote)
    .then(function(result) {
      var patch = result[0];
      open(patch.url);
    });
};

cli.topic = function(name, upstream, options) {
  requireInRepo();

  if (git.branch.exists(name) && !options.force) {
    throw new CliError("A branch named " + name + " already exists.");
  }

  if (!upstream) {
    if (!git.branch.hasUpstream()) {
      throw new CliError("No upstream set for current branch, cannot create topic. Please manually specify an upstream.");
    }
    upstream = git.branch.upstream();
  }

  if (!git.branch.isRemote(upstream)) {
    throw new CliError("Upstream must be a remote branch.");
  }

  var result = gerrit.topic(name, upstream, options.force);
  if (result) {
    logger.info(result);
  }
  return result;
};


// TODO also mark branches that need rebasing?
cli.clean = function(options) {
  requireInRepo();

  var beforeDate = "";

  var upstream = git.branch.upstream();

  if (options.force && options.dryRun) {
    throw new CliError("Cannot do both a forced and dry run... that's just silly...");
  }

  if (options.age) {
    beforeDate = moment();

    // expected format "2w3d5h" or "2w 3d 5h"
    var sublist = options.age.match(/\S{2}/g);

    if (!sublist) {
      throw new CliError("Invalid age specified: " + options.age);
    }

    sublist.forEach(function(sub) {
      beforeDate.subtract(sub[0], sub[1]);
    });

    beforeDate = beforeDate.toISOString();
  }

  logger.info("Gathering candidate branches to clean...\n");

  var cleanList = gerrit.mergedTopics(upstream, beforeDate);

  if (cleanList.length === 0) {
    logger.info("Nothing to clean!");
    return Q.resolve();
  }

  var confirm;

  if (options.force) {
    confirm = Q.resolve(true);
  }
  else {
    logger.info(cleanList.join("\n"));

    if (options.dryRun) {
      return Q.resolve();
    }

    confirm = prompter.confirm("These branches will be removed, are you sure?");
  }

  return confirm
    .then(function(confirmed) {
      if (!confirmed) {
        return;
      }

      git.show(["branch", "-D", "--"].concat(cleanList));
    });

};

cli.squad = {};

cli.squad.list = function(squad) {
  if (!squad) {
    var result = gerrit.squad.getAll();
    _.forEach(result, function(reviewers, name) {
      if (!reviewers.length) {
        return;
      }
      logger.info(["%s: %s", name, reviewers.join(", ")]);
    });
    return;
  }

  requireSquadExists(squad);
  var reviewers = gerrit.squad.get(squad);
  logger.info(reviewers.join(", "));
};

cli.squad.set = function(squad, reviewers) {
  gerrit.squad.set(squad, reviewers);
  logger.info(["Reviewer(s) \"%s\" set to squad \"%s\".", reviewers.join(", "), squad]);
};

cli.squad.add = function(squad, reviewers) {
  gerrit.squad.add(squad, reviewers);
  logger.info(["Reviewer(s) \"%s\" added to squad \"%s\".", reviewers.join(", "), squad]);
};

cli.squad.remove = function(squad, reviewers) {
  requireSquadExists(squad);
  var removedReviewers = gerrit.squad.remove(squad, reviewers);
  var absentReviewers = _.difference(reviewers, removedReviewers);
  if (absentReviewers.length) {
    logger.warn(["Reviewer(s) \"%s\" do not exist in squad \"%s\".", absentReviewers.join(", "), squad]);
  }
  if (removedReviewers.length) {
    logger.info(["Reviewer(s) \"%s\" removed from squad \"%s\".", removedReviewers.join(", "), squad]);
  }
};

cli.squad.delete = function(squad) {
  requireSquadExists(squad);
  gerrit.squad.delete(squad);
  logger.info(["Squad \"%s\" deleted.", squad]);
};

cli.squad.rename = function(squad, name) {
  requireSquadExists(squad);
  gerrit.squad.rename(squad, name);
  logger.info(["Squad \"%s\" renamed to \"%s\".", squad, name]);
};

function requireInRepo() {
  if (!git.inRepo()) {
    throw new CliError("This command requires the working directory to be in a repository.");
  }
}

function requireCleanIndex() {
  if (!git.isIndexClean()) {
    throw new CliError("There are uncommitted changes.");
  }
}

function requireRemoteUpstream() {
  if (!git.branch.hasUpstream()) {
    throw new CliError("Topic branch requires an upstream.");
  }
  if (!git.branch.isRemote(git.branch.upstream())) {
    throw new CliError("Topic's upstream is not a remote branch.");
  }
}

function requireConfigExists(config) {
  return gerrit.configExists(config)
    .then(function(exists) {
      if (!exists) {
        throw new CliError("Config \"" + config + "\" does not exist. Run `gerrit config " + config + "` to configure.");
      }
    });
}

function requireSquadExists(squad) {
  if (!gerrit.squad.exists(squad)) {
    throw new CliError("Squad \"" + squad + "\" does not exist.");
  }
}

function getRevList() {
  if (git.isDetachedHead() || !git.branch.hasUpstream()) {
    return [ git.hashFor("HEAD") ];
  }
  return git.revList("HEAD", "@{u}");
}

module.exports = cli;
