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

prompter.choose = function(text, list) {
  if (Array.isArray(text)) {
    text = util.format.apply(null, text);
  }
  return prompter.prompt({
    type: "list",
    message: text,
    choices: list,
    name: "answer"
  }).then(function(answer) {
    return answer.answer;
  });
};

prompter.input = function(text, defaultValue) {
  return prompter.prompt({
    type: "input",
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

prompter.untilValid = function(ask, validate) {
  return new Q(function loop(resolve, reject) {
    ask().then(function(answer) {
      if (!validate(answer)) {
        return loop(resolve, reject);
      }
      resolve(answer);
    });
  });
};

module.exports = prompter;
