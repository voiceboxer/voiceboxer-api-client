var events = require('events');
var util = require('util');
var voiceboxer = require('voiceboxer-api-js-client');
var Cookies = require('cookies-js');
var extend = require('xtend');
var debug = require('debug')('voiceboxer:api');

var COOKIE = '__vb.token';
var IO_SERVER_DISCONNECT = 'io server disconnect';
var IO_CLIENT_DISCONNECT = 'io client disconnect';

var noop = function() {};

var _getCookieToken = function() {
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
  this.token = _getCookieToken();
  this.registered = false;
  this.connecting = false;
  this.state = {};
  this.ondisconnect = noop;
};

util.inherits(Client, events.EventEmitter);

Client.prototype.init = function(options) {
  this.options = options || {};
  Cookies.defaults = extend(this.options.cookie || {}, Cookies.defaults);

  var defaults = {
    client_id: this.options.api ? this.options.api.client_id : null,
    api: this.options.api ? this.options.api.url : null,
    air: this.options.air ? this.options.air.url : null
  };

  this.defaults = voiceboxer.defaults(defaults);
  this.api = this.defaults(this.token);

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
  this.api.removeListener('disconnect', this.ondisconnect);
  this.api.unregister(this.state.literalId);

  this.token = null;
  this.api = this.defaults();
  this.authenticated = false;
  this.registered = false;
  this.connecting = false;
  this.state = {};
  this.ondisconnect = noop;

  this.emit('logout');
};

Client.prototype.register = function(literalId) {
  if(this.registered) throw new Error('Already registered');

  this.registered = true;
  this.state.literalId = literalId;

  var connect = function(callback) {
    this.api.register(literalId, this.state, callback);
  }.bind(this);

  var retry = function(err) {
    if(err) {
      debug('connect error', err);

      setTimeout(function() {
        debug('retrying connect');
        connect(retry);
      }, this.options.reconnect);
    } else {
      this.connecting = false;
    }
  }.bind(this);

  var reconnect = function() {
    this.connecting = true;
    connect(retry);
  }.bind(this);

  this.ondisconnect = function(literalId, reason) {
    debug('disconnected', reason);

    if(reason !== IO_SERVER_DISCONNECT && reason !== IO_CLIENT_DISCONNECT) {
      // Fix for reconnect on browser reload
      setTimeout(function() {
        reconnect();
      }, 1000);
    }
  };

  this.api.on('disconnect', this.ondisconnect);
  reconnect();

  createAPIShortcutMethods(this.api, literalId);
};

Client.prototype.update = function(options) {
  this.state.status = options.status;
  this.state.language = options.language;
};

// Should go into the API wrapper:
var createAPIShortcutMethods = function(api, eventLiteralId){
	api.liveEvents = {
    get: function(url, callback){
      return api.get('live-events/'+eventLiteralId + url, callback);
    },
    post: function(url, data, callback){
      return api.post('live-events/'+eventLiteralId+ url, data, callback);
    }
  };

  api.chats = {
    get: function(url, callback){
      return api.get('chats/'+eventLiteralId + url, callback);
    },
    post: function(url, data, callback){
      return api.post('chats/'+eventLiteralId+ url, data, callback);
    }
  };
};
