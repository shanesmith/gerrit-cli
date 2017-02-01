"use strict";

var Q = require("bluebird");
var util = require("util");
var inquirer = require("inquirer");
var inquirerAutocomplete = require("inquirer-autocomplete-prompt");

// injects into String.prototype.....
require("string_score");

inquirer.registerPrompt("autocomplete", inquirerAutocomplete);

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

prompter.autocomplete = function(text, list) {
  if (Array.isArray(text)) {
    text = util.format.apply(null, text);
  }
  return prompter.prompt({
    type: "autocomplete",
    message: text,
    name: "answer",
    source: function(answer, input) {
      if (input === null || input === "") {
        return Q.resolve(list);
      }
      return Q.resolve(list.filter(function(item) {
        return item.score(input) > 0;
      }));
    }
  }).then(function(answer) {
    return answer.answer;
  });
};

prompter.select = function(text, list) {
  if (Array.isArray(text)) {
    text = util.format.apply(null, text);
  }
  return prompter.prompt({
    type: "checkbox",
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
  return Q.resolve(inquirer.prompt(questions));
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
