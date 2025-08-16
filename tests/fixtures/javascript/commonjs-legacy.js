/**
 * CommonJS and legacy JavaScript test fixture
 * Used for testing mixed JavaScript patterns
 */

// CommonJS requires
const fs = require('fs')
const path = require('path')
const { EventEmitter } = require('events')

// Function declaration
function legacyFunction(data) {
  return data.toString().toUpperCase()
}

// Variable declarations
var globalVar = 'global'
let blockScoped = 'block'
const CONSTANT_VALUE = 42

// Constructor function
function LegacyClass(name) {
  this.name = name
  this.created = new Date()
}

// Prototype method
LegacyClass.prototype.getName = function() {
  return this.name
}

LegacyClass.prototype.processData = function(data) {
  return legacyFunction(data)
}

// Static method simulation
LegacyClass.create = function(name) {
  return new LegacyClass(name)
}

// Event emitter class
function DataProcessor() {
  EventEmitter.call(this)
  this.queue = []
}

// Inheritance setup
DataProcessor.prototype = Object.create(EventEmitter.prototype)
DataProcessor.prototype.constructor = DataProcessor

DataProcessor.prototype.addData = function(data) {
  this.queue.push(data)
  this.emit('data-added', data)
}

DataProcessor.prototype.processQueue = function() {
  const processed = this.queue.map(item => legacyFunction(item))
  this.queue = []
  this.emit('queue-processed', processed)
  return processed
}

// IIFE pattern
const utilities = (function() {
  function privateHelper(value) {
    return value * 2
  }
  
  return {
    double: privateHelper,
    triple: function(value) {
      return privateHelper(value) + value
    }
  }
})()

// Module pattern
const modulePattern = (function(global) {
  'use strict'
  
  var privateVar = 'secret'
  
  function privateMethod() {
    return privateVar
  }
  
  // Public API
  return {
    getSecret: function() {
      return privateMethod()
    },
    setSecret: function(newSecret) {
      privateVar = newSecret
    }
  }
})(this)

// CommonJS exports
module.exports = {
  legacyFunction,
  LegacyClass,
  DataProcessor,
  utilities,
  modulePattern,
  CONSTANT_VALUE
}

// Alternative export syntax
module.exports.extraFunction = function(x, y) {
  return x + y
}

// Dynamic export
if (process.env.NODE_ENV === 'development') {
  module.exports.debugMode = true
}