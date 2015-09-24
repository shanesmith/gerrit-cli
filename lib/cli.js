"use strict";

var util = require("util");
var open = require("open");
var chalk = require("chalk");
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

  configsToDisplay.then(function(configs) {

    for (var name in configs) {
      var config = configs[name];

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

    }

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

  var q = requireConfigExists(config);

  if (!project_name) {

    q = q
      .then(function() {
        return gerrit.projects(config);
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

  return q.then(function() {

    return gerrit.clone(config, project_name, destination_folder);

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

var MINUTE = 60;
var HOUR = 60 * MINUTE;
var DAY = 24 * HOUR;
var YEAR = 365 * DAY;
var dynamicTimeFormat = function(m) {
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

cli._patches_map = {
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

        comments.push(comm.reviewer.username + " (" + time + ")\n" + indent(2, comm.message));

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
    "V / CR",
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


function indent(num, string) {
  var spaces = new Array(num + 1).join(" ");
  return spaces + string.replace(/\n/g, "\n" + spaces);
}

cli.patches = function(options) {
  requireInRepo();

  var defaultFormat = "%n %t %b %ou %du %s %R";

  var format = (options.format || defaultFormat).match(/\x25[a-zA-Z0-9]{1,2}|\x25{2}|[^\x25]+/g);

  var opts = options.opts();

  var query = {
    not: {}
  };

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
    var val = cli._patches_map[key];
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

          if (str[0] === "%") {
            if (str === "%%") {
              line += "%";
            }
            else {
              line += getval[i++](patch, options);
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

  return Q.resolve(revList)
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
  return gerrit.ssh(command, options.remote).then(function(result) {
    logger.info(result);
  });
};

cli.up = function(options) {
  requireInRepo();

  requireUpstream();

  var hasComments = !!options.comment;
  var hasAssignees = !!options.assign.length;

  var q = _push(options.remote, options.branch, options.draft);

  if (hasAssignees || hasComments) {

    var all = true;

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

      q = q.then(function() {
        logger.newline();
        logger.log("More than one patch detected.");
        return prompter.confirm("Assign " + what + " to all patches being pushed?");
      })
      .then(function(result) {
        all = result;
      });

    }

    return q.then(function() {

      if (all) {
        options.all = true;
      }
      else {
        options.interactive = true;
      }

      var q = Q.resolve();

      if (hasComments) {
        q = q.then(function() {
          return cli.comment(options.comment, options);
        });
      }

      if (hasAssignees) {
        q = q.then(function() {
          return cli.assign(options.assign, options);
        });
      }

      return q;

    });

  }

};

cli.checkout = function(target, patch_set, options) {
  requireInRepo();
  requireCleanIndex();
  return gerrit.checkout(target, patch_set, false, options.remote);
};

cli.recheckout = function(options) {
  requireInRepo();
  requireCleanIndex();
  return gerrit.checkout(git.hashFor("HEAD"), null, true, options.remote);
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
      return gerrit.review(result.hash, 1, 2, result.message, "submit", options.remote);
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
  requireUpstream();

  return Q.try(function(result) {

    var revList = getRevList();

    if (revList.length === 1) {
      return true;
    }

    return prompter.confirm("There are more than one patch in this topic, are you sure you want to submit them all?");

  })
  .then(function(result) {

    if (!result) {
      return;
    }

    return _push(options.remote, options.branch, false)
      .then(function() {
        return cli.submit(null, options);
      });

  });

};

function _push(remote, branch, is_draft) {
  requireInRepo();

  return gerrit.up(remote, branch, is_draft)
    .catch(gerrit.GerritError, function(err) {
      switch(err.code) {
        case gerrit.GerritError.GIT_PUSH_ERROR:
          throw new CliError("Error while pushing commit.");
        default:
          throw err;
      }
    });
}

function _review(type, questions, options) {
  var revList = getRevList().reverse();

  if (revList.length > 1 && !options.all && !options.interactive) {
    throw new CliError("There are more than one patch in this topic.\nPlease use the -i or -a flag to select interactively or apply to all.");
  }

  var capitalizedType = type.charAt(0).toUpperCase() + type.slice(1);

  var prompt = capitalizedType + " this patch?";

  return Q
  .map(revList, function(hash, index) {

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

  }, {concurrency: 1})
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
      throw new CliError("No upstream set for current branch, cannot create topic. Please manually specify an upstream.");
    }
    upstream = git.branch.upstream();
  }

  if (!git.branch.isRemote(upstream)) {
    throw new CliError("Upstream must be a remote branch.");
  }

  return gerrit.topic(name, upstream);
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
  requireSquadExists(squad);
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
  logger.info(["Squad \"%s\" deleted."]);
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

function requireUpstream() {
  if (!git.branch.hasUpstream()) {
    throw new CliError("Topic branch requires an upstream.");
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
  if (git.isDetachedHead()) {
    return [ git.hashFor("HEAD") ];
  }
  // FIXME what if no upstream?
  return git.revList("HEAD", "@{u}");
}


module.exports = cli;
