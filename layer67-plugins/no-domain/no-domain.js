
/**
 *  Handles requests to the server that have unknown domain.
 */
const sg                      = require('sgsg');
const _                       = sg._;
const unhandledRoutes         = require('../../lib/unhandled-routes');
const redisUtils              = require('../../lib/redis-utils');
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

    // We are a long-poll server
    //req.setTimeout(0);
    //res.setTimeout(0);

    console.log('unknown-host: ', req.url, req.headers);

    return sg._400(req, res, {error: 'unknown-host'});
  });

//  return request.get('http://169.254.169.254/latest/meta-data/local-ipv4').end((err, result) => {
//    if (sg.ok(err, result, result.text)) { ip = result.text; }
//
//    return server.listen(port, ip, function() {
//      console.log(`Listening on ${ip}:${port}`);
//
//      tell();
//      function tell() {
//        setTimeout(tell, 15 * 1000);
//        redisUtils.tellService('/echo', `http://${ip}:${port}`, 30000, function(err) {
//          redisUtils.tellService('/echo/xapi/v1', `http://${ip}:${port}`, 30000, function(err) {
//          });
//        });
//      };
//    });
//  });
};






main();


