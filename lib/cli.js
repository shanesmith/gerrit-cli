
var exec = require("child_process").exec;

function cmdConfig(name, options) {
  exec("git branch -vv", function(err, stdout, stderr) {
    if (err) {
      return console.log("OH NOES");
    }
    else if (stderr) {
      return console.log("ERR: " + stderr);
    }

    console.log("BRANCH");
    console.log(stdout);
  });
}

function cmdProjects(options) {
  
}

function cmdClone(options) {

}

module.exports = {
  config: cmdConfig,
  projects: cmdProjects,
  clone: cmdClone
};
