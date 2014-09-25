
var git = require("./git");
var gerrit = require("./gerrit");

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
      console.error("Could not find the repository's gerrit config name. Was it set up with `gerrit clone`?");
      return;
    }
  }
  else {
    console.error("You are not in a repository. Please specify a config name or --all.");
    return;
  }

  for (var key in configs) {
    var config = configs[key];
    console.log(
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
  gerrit.projects().then(function(projects) {
    console.log(projects.join("\n"));
  });
};

cli.clone = function(options) {

};

module.exports = cli;
