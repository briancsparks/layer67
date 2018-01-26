
/**
 *
 */
const sg                      = require('sgsg');
const _                       = sg._;
const unhandledRoutes         = require('../../lib/unhandled-routes');
const http                    = require('http');
const urlLib                  = require('url');

const ARGV                    = sg.ARGV();
const argvGet                 = sg.argvGet;
const argvExtract             = sg.argvExtract;
const setOnn                  = sg.setOnn;
const deref                   = sg.deref;
const unhandled               = unhandledRoutes.unhandled;

const main = function() {

  const ip          = ARGV.ip       || '127.0.0.1';
  const port        = ARGV.port;

  if (!port) {
    console.log('Need --port=');
    process.exit(2);
  }

  const server = http.createServer(function(req, res) {

    // We are a long-poll server
    req.setTimeout(0);
    res.setTimeout(0);

    const url = urlLib.parse(req.url, true);
    if (url.pathname.toLowerCase() !== '/clientstart') {
      return unhandled(req, res);
    }

    return sg.getBody(req, function(err) {
      if (err) { return unhandled(req, res); }

      // TODO: get from db
      return sg._200(req, res, {upstream:'prod.mobilewebassist.net/api/v1'});
    });

  });

  server.listen(port, ip, function() {
    console.log(`Listening on ${ip}:${port}`);
  });
};






main();

