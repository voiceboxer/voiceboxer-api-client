var events = require('events');
var util = require('util');
var voiceboxer = require('voiceboxer-api');
var Cookies = require('cookies-js');
var extend = require('xtend');
var debug = require('debug')('voiceboxer:api');

var COOKIE = '__vb.token';

var noop = function() {};

var getCookieToken = function() {
  var token = Cookies.get(COOKIE);
  if(!token) return null;

  try {
    return JSON.parse(token);
  } catch(err) {};
};

module.exports = Client;

function Client() {
  events.EventEmitter.call(this);

  this.authenticated = false;
  this.token = getCookieToken();
  this.registered = false;
  this.state = {};
};

util.inherits(Client, events.EventEmitter);

Client.prototype.init = function(options) {
  this.options = options || {};
  Cookies.defaults = extend(this.options.cookie || {}, Cookies.defaults);

  var defaults = {
    client_id: this.options.api ? this.options.api.client_id : null,
    version: this.options.version || 'latest',
    api: this.options.api ? this.options.api.url : null,
    air: this.options.air ? this.options.air.url : null,
    fil: this.options.fil ? this.options.fil.url : null
  };

  this.defaults = voiceboxer.defaults(defaults);
  this.api = this._api(this.token);

  return this;
};

Client.prototype.login = function(credentials, callback) {
  if(!callback && typeof credentials === 'function') {
    callback = credentials;
    credentials = null;
  }

  callback = callback || noop;

  var api = credentials ? this._api(credentials) : this.api;

  api.authenticate(function(err, token) {
    if(err) return callback(err);

    this.token = token;
    this.api = api;
    this.authenticated = true;

    Cookies.set(COOKIE, JSON.stringify(token));

    api.get('/users/me', function(err, user) {
      if(err) return callback(err);
      this.emit('login', user);
    }.bind(this));
  }.bind(this));
};

Client.prototype.logout = function() {
  Cookies.expire(COOKIE);

  this.unregister();

  this.token = null;
  this.api = this._api();
  this.authenticated = false;
  this.state = {};

  this.emit('logout');
};

Client.prototype.register = function(literalId, options, callback) {
  if(!callback && typeof options === 'function') {
    callback = options;
    options = null;
  }

  options = options || {};

  if(this.registered) throw new Error('Already registered');

  this.registered = true;
  this.state.literalId = literalId;

  var self = this;
  var status = options.status || this.state.status;
  var language = options.language || this.state.language;

  this.api.on('disconnect', function() {
    self.unregister({ disable: true });
  });

  this.api.register(literalId, {
    status: status,
    language: language,
    connection: options.connection
  }, callback);
};

Client.prototype.unregister = function(options) {
  options = options || {};

  this.api.unregister(this.state.literalId);
  this.registered = false;

  if(!options.disable) delete this.state.literalId;
};

Client.prototype.update = function(options) {
  this.state.status = options.status;
  this.state.language = options.language;
};

Client.prototype._api = function(credentials) {
  var self = this;
  var api = this.defaults(credentials);

  var request = function(method, resource) {
    var prefix = resource === 'liveEvents' ? '/live-events/' : '/chats/';

    if(!api[resource]) api[resource] = {};

    api[resource][method] = function(url, data, callback) {
      var literalId = self.state.literalId;
      if(!literalId) throw new Error('Literal ID missing');

      api[method](prefix + literalId + url, data, callback);
    };
  };

  ['get', 'post', 'put', 'delete', 'patch'].forEach(function(method) {
    request(method, 'liveEvents');
    request(method, 'chats');
  });

  return api;
};
