# voiceboxer-api-client

An easy-to-use client for the https://github.com/voiceboxer/voiceboxer-api wrapper.

	npm install voiceboxer-api-client

# Usage

Initiate the module with a config for the api endpoint and client_id, the air endpoint and optional cookies-js defaults for storing a session cookie.

```javascript
var config = {
  api: {
    client_id: 'client_id',
    url: 'url'
  },
  air: {
    url: 'url'
  },
  cookie: {
    // cookies-js defaults
  }
};

var voiceboxer = require('voiceboxer-api-client').init(config);

voiceboxer.login({ email: 'your@email.com', password: 'password' }, function(err) {
  console.log(err);
});

voiceboxer.on('login', function(user) {
  console.log(user);
});

voiceboxer.loginWithToken(token, function() {
    console.log('logged');
 });
```
