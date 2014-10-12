
var Promise = require("bluebird");
var util = require('util');
var fs = require('fs');
var mkdirp = Promise.promisify(require('mkdirp'));

var git = require("./git");
var gerrit_ssh = require("./gerrit-ssh");
var logger = require("./logger");


var gerrit = {};

gerrit.repoConfig = function() {
  git.requireInRepo();

  var name = git("config remote.origin.gerrit");
  return gerrit.config(name);
};

gerrit.repoProject = function() {
  git.requireInRepo();

  var remoteUrl = git("config remote.origin.url");

  var projectMatch = remoteUrl.match(/^ssh:\/\/[^/]*\/(.*?)(.git)?$/);
  if (projectMatch && projectMatch.length > 1) {
    var projectName = projectMatch[1];
    return projectName;
  }

  return null;
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
    return Promise.reject(util.format("Destination %s already exists", destination_folder));
  }

  logger.info("Cloning project %s from %s into folder %s...", project_name, gerrit_name, destination_folder);

  var source_url = util.format("ssh://%s@%s:%d/%s.git", config.user, config.host, config.port, project_name);

  return git.show("clone", source_url, destination_folder).then(function(){

    process.chdir(destination_folder);

    git("config remote.origin.gerrit '%s'", gerrit_name);

    return gerrit.installHook();

  });

};

gerrit.installHook = function() {
  logger.info("Setting up commit-msg hook...");

  git.requireInRepo();

  var hooks_dir = git.dir() + "/hooks";

  return mkdirp(hooks_dir).then(function() {
  
    return gerrit_ssh.scp("hooks/commit-msg", hooks_dir, gerrit.config());

  });
  
};

gerrit.status = function() {
  git.requireInRepo();

  var project = gerrit.repoProject();

  return gerrit_ssh(["query status:open project:%s --format json", project], gerrit.repoConfig()).then(function(result) {
    return result.split("\n").slice(0, -1).map(JSON.parse);
  });
};

module.exports = gerrit;
