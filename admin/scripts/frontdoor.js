
/**
 *
 */
const sg                      = require('sgsg');
const _                       = sg._;
const util                    = require('util');
const child_process           = require('child_process');
const path                    = require('path');
const http                    = require('http');
const urlLib                  = require('url');
const formidable              = require('formidable');
const fs                      = sg.extlibs.fs;
const sh                      = sg.extlibs.shelljs;

sg.requireShellJsGlobal();

const ARGV                    = sg.ARGV();
const argvGet                 = sg.argvGet;
const argvExtract             = sg.argvExtract;
const setOnn                  = sg.setOnn;
const deref                   = sg.deref;
const spawn                   = child_process.spawn;
const exec                    = child_process.exec;
const execEz                  = util.promisify(sg.execEz);

const uploadDir               = path.join('/tmp', 'frontdoor', 'upload');
const zzPackagesDir           = path.join(process.env.HOME, 'zz_packages');

var   zzPackages;

if (!ARGV.port) { console.error('Need --port='); process.exit(2); }
if (!ARGV.ip)   { console.error('Need --ip='); process.exit(2); }

var lib = {};

const main = function() {

  const server = http.createServer((req, res) => {

    // Long held connections
    req.setTimeout(0);
    res.setTimeout(0);

    const url       = urlLib.parse(req.url, true);
    const pathParts = _.rest(url.pathname.split('/'));

    const [ a, b ]  = pathParts;

    if (a === 'exit' || a === 'close') {
      sg._200(req, res, {closing:true});
      setTimeout(function() { server.close(); }, 100);
    }

    if (lib[a] && _.isFunction(lib[a][b])) {
      return lib[a][b](req, res, url, _.rest(pathParts, 2).join('/'));

    } else if (_.isFunction(lib[a])) {
      return lib[a][b](req, res, url, _.rest(pathParts).join('/'));
    }

    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain');
    res.end('Not Found\n');
  });

  server.listen(ARGV.port, ARGV.ip, () => {
    console.log(`Server running at http://${ARGV.ip}:${ARGV.port}/`);
  });

};

const handleUpload = function(req, res, callback) {

  var   form    = new formidable.IncomingForm();
  var   result  = {};

  form.keepExtensions = true;
  form.uploadDir      = uploadDir;

  // ---------- On:progress ----------
  form.on('progress', (recd, expected) => {
  });

  // ---------- On:file ----------
  form.on('file', (name, file) => {
  });

  // ---------- parse ----------
  form.parse(req, (err, fields_, files) => {
    // fs.unlink, fs.rmdir

    var fields, body;
    if (sg.ok(err, fields_, files)) {
      //console.log(`uploaded`, fields_, _.map(files,(f,k) => {return sg.kv(k,_.pick(f, 'name','path','size')); }));

      result.files    = sg.deepCopy(files);
      result.fields   = sg.deepCopy(fields_);

//      // Fields is the payload, but might have the key attributes
//      fields          = serverassist.normalizeBody(fields_ || {}, {}, {});
//
//      // Restore the payload field -- probably undefined, but forcibly added by normalizeBody
//      fields.payload  = fields_.payload;
//
//      body            = serverassist.normalizeBody(fields || {}, params || {}, query || {});
//
//      if (!body.sessionId) {
//        code = 400;
//        msg  = `Must provide sessionId`;
//        return;
//      }
//
//      const bucket   = bucketName(body.projectId);
//      if (!bucket) {
//        code = 404;
//        msg  = `No bucket for ${body.projectId}`;
//        return;
//      }

//      var item = sg.extend(body.payload.shift(), _.omit(fields, 'clientId,sessionId,projectId,version'.split(',')));
//      sg.__each(files, (file, nextFile, key) => {
//        const s3Params = serverassist.bucketParamsFile(body.clientId, body.sessionId, bucket, file.path, file.name);
//
//        return s3.putObject(s3Params, (err, data) => {
//          console.log(`uploadedBlob ${file.name} (${file.size} bytes) to ${bucket} ${shortenKey(s3Params.Key)}`, err, data);
//          item = sg.kv(item, key, file.name);
//          return nextFile();
//        });
//
//      }, function() {
//
//        body.payload.unshift(item);
//
//        // Add a JSON object to reference the uploaded
//        const s3Params  = serverassist.bucketParamsJson(body.clientId, body.sessionId, bucket, JSON.stringify(body));
//        return s3.putObject(s3Params, (err, data) => {
//          console.log(`telemetry added ${body.payload.length} to S3 (${shortenKey(s3Params.Key)}):`, err, data);
//        });
//      });
    }

  });

  // ---------- On:end ----------
  form.on('end', () => {
    return callback(null, result);
//    code      = code || 200;
//    result.ok = (code >= 200 && code < 400);
//    serverassist['_'+code](req, res, result, msg);
  });

  // ---------- On:error ----------
  form.on('error', (err) => {
  });

  // ---------- On:aborted ----------
  form.on('aborted', () => {
  });
};

lib.run = {};

lib.run.bash = lib.run.sh = function(req, res, url, restOfPath) {

  var result = {exits:[]};

  return handleUpload(req, res, function(err, uploadResult) {
    if (sg.ok(err, uploadResult)) {

      var scriptsToRun = [];
      _.each(uploadResult.files, function(file, fieldName) {
        if (test('-f', file.path)) {
          chmod('u+x', file.path);
          scriptsToRun.push(file.path);
        }
      });

      // Now, run them
      var index = 0;
      return sg.__each(scriptsToRun, function(path, next) {
        const runIndex    = index;
        var   runResult   = {outlen:0, index, path};
        var   child       = exec(path, {async:true});

        child.stdout.on('data', function(chunk) {
          runResult.outlen += chunk.length;
          process.stdout.write(chunk);
        });

        child.stderr.on('data', function(chunk) {
          process.stderr.write(chunk);
        });

        child.on('exit', function(code, signal) {

          _.extend(runResult, {code, signal});
          result.exits[runIndex] = runResult;
          return next();
        });

        index += 1;

      }, function done() {

        console.log("======================================");
        console.log("Done running:", result);
        return sg._200(req, res, result);
      });
    }

    /* otherwise */
    return sg._400(req, res);
  });
};



zzPackages = lib.zzPackages = function(pathname) {
  return path.join(zzPackagesDir, pathname);
};



_.each(lib, (value, key) => {
  exports[key] = value;
});

fs.mkdirpSync(uploadDir);

main();

