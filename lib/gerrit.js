
var git = require("./git");
var gerrit_ssh = require("./gerrit-ssh");

var gerrit = {};

gerrit.repoConfig = function() {
  git.requireInRepo();

  try {
    var name = git("config remote.origin.gerrit");
    return gerrit.config(name);
  }
  catch (err) {
    return null;
  }
};

gerrit.allConfigs = function() {

  var configs = {};
  var hosts = git("config --global --get-regexp 'gerrit.*.host'");

  hosts.split('\n').forEach(function(host) {
    var hostMatch = host.match(/^gerrit\.(.*)\.host.*$/);
    if (hostMatch.length > 1) {
      var configName = hostMatch[1];
      configs[configName] = gerrit.config(configName);
    }
  });

  return configs;

};

gerrit.config = function(name) {
  var config = {};
  config.name = name;
  ["user", "host", "port"].forEach(function(key) {
    var value = git("config 'gerrit." + name + "." + key + "'");
    config[key] = value;
  });
  return config;
};

gerrit.projects = function(name) {
  return gerrit_ssh("ls-projects").then(function(result) {
    return result.split("\n");
  });
};

module.exports = gerrit;
