"use strict";

var Q = require("bluebird");
var inquirer = require("inquirer");
var util = require("util");

var prompter = {};

prompter.confirm = function(text, defaultValue) {
  if (Array.isArray(text)) {
    text = util.format.apply(null, text);
  }
  return prompter.prompt({
    type: "confirm",
    message: text,
    name: "answer",
    default: defaultValue
  }).then(function(answer) {
    return answer.answer;
  });
};

prompter.prompt = function(questions) {
  return new Q(function(resolve, reject) {
    inquirer.prompt(questions, resolve);
  });
};

module.exports = prompter;
