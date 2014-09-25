
var git = require("./git");
var gerrit_ssh = require("./gerrit-ssh");

var util = require('util');

var fs = require('fs');

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
  if (name === undefined) {
    return gerrit.repoConfig();
  }

  var config = {};
  
  config.name = name;

  ["user", "host", "port"].forEach(function(key) {
    var value = git("config 'gerrit.%s.%s'", name, key);
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
    console.error("Destination %s already exists", destination_folder);
  }

  console.log("Cloning project %s from %s into folder %s...", project_name, gerrit_name, destination_folder);

  var source_url = util.format("ssh://%s@%s:%d/%s.git", config.user, config.host, config.port, project_name);

  var spawn = git.show("clone", source_url, destination_folder).then(function(){

    process.chdir(destination_folder);

    git("config remote.origin.gerrit '%s'", gerrit_name);

    gerrit.installHook();

  });

};

gerrit.installHook = function() {
  console.log("Setting up commit-msg hook...");

  git.requireInRepo();

  var hooks_dir = git.dir() + "/hooks";

  fs.mkdir(hooks_dir, function(err) {
  
    gerrit_ssh.scp("hooks/commit-msg", hooks_dir, gerrit.config());

  });

  
};

module.exports = gerrit;
