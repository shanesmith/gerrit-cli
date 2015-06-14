"use strict";

var util = require("util");
var open = require("open");
var fs = require("fs");
var Q = require("bluebird");
var _ = require("lodash");
var Table = require("cli-table");
var moment = require("moment");

var git = require("./git");
var gerrit = require("./gerrit");
var logger = require("./logger");
var prompter = require("./prompter");


var cli = {};

var CliError = function(msg) {
  Error.call(this);
  Error.captureStackTrace(this, CliError);
  this.message = msg;
  if (util.isArray(this.message)) {
    this.message = util.format.apply(null, this.message);
  }
};
util.inherits(CliError, Error);

cli.CliError = CliError;

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

  var q = Q.resolve();

  if (!config_name) {

    q = q
      .then(function() {
        return gerrit.allConfigs();
      })
      .then(function(allConfigs) {
        var projects = _.keys(allConfigs);
        if (projects.length === 0) {
          throw new CliError("There are no configured servers. Run `gerrit config` to set one up.");
        }
        else if (projects.length === 1) {
          return projects[0];
        }
        return prompter.choose("Clone from which server?", projects);
      })
      .then(function(answer) {
        config_name = answer;
      });

  }

  if (!project_name) {

    q = q
      .then(function() {
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

  q.then(function() {

    gerrit.clone(config_name, project_name, destination_folder);

  });

};

var noBorders = {
  "top": "", "top-mid": "", "top-left": "", "top-right": "",
  "bottom": "", "bottom-mid": "", "bottom-left": "", "bottom-right": "",
  "left": "", "left-mid": "",
  "mid": "", "mid-mid": "",
  "right": "", "right-mid": "",
  "middle": ""
};

var status_map = {
  "n": [
    "Number",
    false,
    "number"
  ],
  "c": [
    "Change-Id",
    false,
    "id"
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
    "Owner Username",
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
    function(patch) { return moment.unix(patch.createdOn).format("MMM Do, YYYY, hh:mm a"); }
  ],
  "du": [
    "Updated",
    false,
    function(patch) { return moment.unix(patch.lastUpdated).format("MMM Do, YYYY, hh:mm a"); }
  ],
  "u": [
    "URL",
    false,
    "url"
  ],
  "s": [
    "Subject",
    false,
    "subject"
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
    "Review Status",
    false,
    function(patch) {

      var minReview = {};
      var lastPatchSet = patch.patchSets[patch.patchSets.length-1];

      if (!lastPatchSet.approvals) {
        return "0 / 0";
      }

      lastPatchSet.approvals.forEach(function(approval) {
        var curValue = minReview[approval.type] || 99;
        minReview[approval.type] = Math.min(approval.value, curValue);
      });

      if (!minReview["Code-Review"]) {
        minReview["Code-Review"] = 0;
      }
      else if (minReview["Code-Review"] > 0) {
        minReview["Code-Review"] = "+" + minReview["Code-Review"];
      }

      if (!minReview.Verified) {
        minReview.Verified = 0;
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

cli.status = function(options) {
  requireInRepo();

  var defaultFormat = "%n %ou %b %t %dc %du %s %R %f";

  var format = (options.format || defaultFormat).match(/\x25[a-zA-Z0-9]{1,2}|\x25{2}|[^\x25]+/g);

  var opts = options.opts();

  var query = {
    not: {}
  };

  function indent(num, string) {
    var spaces = new Array(num + 1).join(" ");
    return spaces + string.replace(/\n/g, "\n" + spaces);
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
    var val = status_map[key];
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

  gerrit.status(query, options.remote).then(function(patches) {

    if (options.oneline) {

      patches.forEach(function(patch) {

        var i = 0;
        var line = "";

        format.forEach(function(str) {

          if (str[0] === "%") {
            if (str === "%%") {
              line += "%";
            }
            else {
              line += getval[i++](patch);
            }
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
      head: head,
      multiline: multiline
    });

    patches.forEach(function(patch) {

      var row = [];

      getval.forEach(function(func) {
        row.push(func(patch) || "");
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
        if (table.options.multiline[index]) {
          string += printTable.toString();
          printTable = new Table({chars: noBorders});
          string += "\n " + header + ":\n" + indent(4, row[index]);
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

cli.assign = function(reviewersArray, options) {
  requireInRepo();

  var currentReviewers = git.config("gerrit.reviewers", {all: true}) || [];

  var revList = getRevList();

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

cli.up = function(base_branch, reviewers, is_draft, options) {
  requireInRepo();

  if (!git.branch.hasUpstream()) {
    throw new CliError("Topic branch requires an upstream.");
  }

  var revList = getRevList();

  if (!reviewers.length || revList.length === 1) {
    doPush();
    return;
  }

  logger.info("More than one patch detected.");

  prompter.confirm("Assign reviewers to all patches being pushed?")
  .then(function(result) {
    if (!result) {
      logger.warn("Aborting.");
      return;
    }
    doPush();
  });

  function doPush() {
    gerrit.up(base_branch, is_draft, options.remote)
      .catch(gerrit.GerritError, function(err) {
        switch(err.code) {
          case gerrit.GerritError.GIT_PUSH_ERROR:
            throw new CliError("Error while pushing commit.");
          default:
            throw err;
        }
      })
      .then(function() {
        options.all = true;
        cli.assign(reviewers, options);
      });
  }
};

cli.checkout = function(target, patch_set, options) {
  requireInRepo();
  requireCleanIndex();
  gerrit.checkout(target, patch_set, options.remote);
};

cli.recheckout = function(options) {
  requireInRepo();
  requireCleanIndex();
  gerrit.checkout(git.branch.name(), null, true, options.remote);
};

cli.review = function(verified_score, code_review_score, message, options) {
  requireInRepo();

  var questions = [{
    type: "input",
    name: "verified_score",
    message: "Verified score [-1 to +1]",
    default: verified_score,
    validate: function(val) {
      return _.contains(["", "-1", "0", "1", "+1"], val.trim()) || "Please enter a valid score between -1 and +1";
    }
  }, {
    type: "input",
    name: "code_review_score",
    message: "Code Review score [-2 to +2]",
    default: code_review_score,
    validate: function(val) {
      return _.contains(["", "-2", "-1", "0", "1", "+1", "2", "+2"], val.trim()) || "Please enter a valid score between -2 and +2";
    }
  }, {
    type: "input",
    name: "message",
    message: "Message",
    default: message
  }];

  _review("review", questions, options)
    .each(function(result) {
      return gerrit.review(result.hash, result.verified_score, result.code_review_score, result.message, null, options.remote);
    })
    .then(function() {
      logger.info("Reviews have been posted successfully.");
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

  _review("submit", questions, options)
    .each(function(result) {
      return gerrit.review(result.hash, 1, 2, result.message, "submit", options.remote);
    })
    .then(function() {
      logger.info("Submissions successful.");
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

  _review("abandon", questions, options)
    .each(function(result) {
      return gerrit.review(result.hash, null, null, result.message, "abandon", options.remote);
    })
    .then(function() {
      logger.info("Abandons successful.");
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

  _review("comment", questions, options)
    .each(function(result) {
      if (result.message) {
        return gerrit.review(result.hash, null, null, result.message, null, options.remote);
      }
    })
    .then(function() {
      logger.info("Comments have been posted successfully.");
    });
};

cli.pubmit = function(base_branch, options) {
  requireInRepo();
  gerrit.up(base_branch, false, options.remote).then(function() {
    cli.submit(null, options);
  });
};

function _review(type, questions, options) {
  var revList = getRevList().reverse();

  if (revList.length === 1) {

    var result = {hash: revList[0]};

    for (var i in questions) {
      var q = questions[i];
      result[q.name] = q.default;
    }

    return Q.resolve([result]);

  }

  if (!options.interactive) {
    throw new CliError("There are more than one patch in this topic.\nPlease use the -i flag to select interactively.");
  }

  var capitalizedType = type.charAt(0).toUpperCase() + type.slice(1);

  var prompt = capitalizedType + " this patch?";

  return Q
  .map(revList, function(hash, index) {

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

  }, {concurrency: 1})
  .filter(function(result) {
    return !!result;
  });

}

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

cli.topic = function(name, upstream, options) {
  requireInRepo();
  requireCleanIndex();

  if (!upstream) {
    if (!git.branch.hasUpstream()) {
      throw new CliError("No upstream set for current branch, cannot create topic. Please manually specify an upstream");
    }
    upstream = git.branch.upstream();
  }

  if (!git.branch.isRemote(upstream)) {
    throw new CliError("Upstream must be a remote branch");
  }

  gerrit.topic(name, upstream);
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

function getRevList() {
  if (git.isDetachedHead()) {
    return [ git.hashFor("HEAD") ];
  }
  // FIXME what if no upstream?
  return git.revList("HEAD", "@{u}");
}


module.exports = cli;
