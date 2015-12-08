var events = require('events');
var util = require('util');
var voiceboxer = require('voiceboxer-api-js-client');
var Cookies = require('cookies-js');
var extend = require('xtend');

var COOKIE = '__vb.token';

module.exports = Client;

function Client() {
  events.EventEmitter.call(this);
};

util.inherits(Client, events.EventEmitter);

Client.prototype.init = function(options) {
  options = options || {};
  Cookies.defaults = extend(options.cookie || {}, Cookies.defaults);

  this.defaults = voiceboxer.defaults(options.api);
  this.api = this.defaults(this._getCookieToken());

  return this;
};

Client.prototype.login = function(credentials, callback) {
  if(!callback && typeof credentials === 'function') {
    callback = credentials;
    credentials = null;
  }

  callback = callback || noop;

  var api = credentials ? this.defaults(credentials) : this.api;

  api.authenticate(function(err, token) {
    if(err) return callback(err);

    this.api = api;

    Cookies.set(COOKIE, JSON.stringify(token));

    api.get('/users/me', function(err, user) {
      if(err) return callback(err);
      this.emit('login', user);
    }.bind(this));
  }.bind(this));
};

Client.prototype.logout = function() {
  Cookies.expire(COOKIE);

  this.emit('logout');
};

Client.prototype._getCookieToken = function() {
  var token = Cookies.get(COOKIE);
  if(!token) return;

  try {
    return JSON.parse(token);
  } catch(err) {};
};
