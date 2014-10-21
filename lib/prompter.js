
var Promise = require("bluebird");
var inquirer = require('inquirer');
var util = require("util");

var prompter = {};

prompter.confirm = function(text, defaultValue) {
  if (Array.isArray(text)) {
    text = util.format.apply(null, text);
  }
  return new Promise(function(resolve, reject) {
    inquirer.prompt({
      type: 'confirm',
      message: text,
      name: 'answer',
      default: defaultValue
    }, function(answer) {
      resolve(answer.answer);
    });
  });
};

module.exports = prompter;
