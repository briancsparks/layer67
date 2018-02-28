
/**
 *  Handles requests to the server that have unknown domain.
 */
const sg                      = require('sgsg');
const _                       = sg._;
const unhandledRoutes         = require('../../lib/unhandled-routes');
const http                    = require('http');
const request                 = sg.extlibs.superagent;

const ARGV                    = sg.ARGV();
const argvGet                 = sg.argvGet;
const argvExtract             = sg.argvExtract;
const setOnn                  = sg.setOnn;
const deref                   = sg.deref;
const unhandled               = unhandledRoutes.unhandled;

const main = function() {

  var   ip          = ARGV.ip       || '127.0.0.1';
  const port        = ARGV.port     || 5776;

  const server = http.createServer(function(req, res) {

    console.log('unknown-host: ', req.headers.host || 'no-host', req.url);
    console.log(req.headers);
    console.log(req.connection.remoteAddress);

    return sg._400(req, res);
  });

  return server.listen(port, ip, function() {
    console.log(`Listening on ${ip}:${port}`);
  });
};






main();


