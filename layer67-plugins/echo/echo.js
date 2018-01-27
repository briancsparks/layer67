
/**
 *
 */
const sg                      = require('sgsg');
const _                       = sg._;
const unhandledRoutes         = require('../../lib/unhandled-routes');
const utils                   = require('../../lib/utils');
const http                    = require('http');
const urlLib                  = require('url');
const request                 = sg.extlibs.superagent;

const ARGV                    = sg.ARGV();
const argvGet                 = sg.argvGet;
const argvExtract             = sg.argvExtract;
const setOnn                  = sg.setOnn;
const deref                   = sg.deref;
const unhandled               = unhandledRoutes.unhandled;

const main = function() {

  var   ip          = ARGV.ip       || '127.0.0.1';
  const port        = ARGV.port;

  if (!port) {
    console.log('Need --port=');
    process.exit(2);
  }

  return sg.__run([function(next) {
    return request.get('http://169.254.169.254/latest/meta-data/local-ipv4').end((err, result) => {
      console.log(err, result.text, result.ok, result.body);
      if (sg.ok(err, result, result.text)) {
        ip = result.text;
      }
      return next();
    });
  }], function done() {
    const server = http.createServer(function(req, res) {

      // We are a long-poll server
      req.setTimeout(0);
      res.setTimeout(0);

      var result = {};

      const url = urlLib.parse(req.url, true);

      _.extend(result, url);
      _.extend(result, {headers: req.headers});

      console.log('Echoing: '+req.url);
      return sg._200(req, res, result);
    });

    server.listen(port, ip, function() {
      console.log(`Listening on ${ip}:${port}`);
      tell();
      function tell() {
        setTimeout(tell, 15);
        utils.tellService('/echo', `http://${ip}:${port}`, 30, function(err) {
          utils.tellService('/echo/xapi/v1', `http://${ip}:${port}`, 30, function(err) {
          });
        });
      };
    });
  });
};






main();


