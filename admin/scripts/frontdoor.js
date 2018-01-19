
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
const chalk                   = sg.extlibs.chalk;

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

var   g_execLabels = {stdout:'stdout', stderr:'stderr'};
var   zzPackages;

if (!ARGV.port) { console.error('Need --port='); process.exit(2); }
if (!ARGV.ip)   { console.error('Need --ip='); process.exit(2); }

chalk.enabled = true;
chalk.level   = 2;

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
      return;
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
    console.log('Info:progress', {recd, expected});
  });

  // ---------- On:file ----------
  form.on('file', (name, file) => {
    console.log('Info:file', {name, size: file.size, origName: file.name});
  });

  // ---------- parse ----------
  form.parse(req, (err, fields_, files) => {
    // fs.unlink, fs.rmdir

    var fields, body;
    if (sg.ok(err, fields_, files)) {
      //console.log(`uploaded`, fields_, _.map(files,(f,k) => {return sg.kv(k,_.pick(f, 'name','path','size')); }));

      result.files    = sg.deepCopy(files);
      result.fields   = sg.deepCopy(fields_);
    }

  });

  // ---------- On:end ----------
  form.on('end', () => {
    return callback(null, result);
  });

  // ---------- On:error ----------
  form.on('error', (err) => {
    console.error('Error', err);
  });

  // ---------- On:aborted ----------
  form.on('aborted', () => {
    console.log('Info:aborted');
  });
};

lib.run = {};

lib.run.bash = lib.run.sh = function(req, res, url, restOfPath) {

  var   result = {exits:[]};
console.log('--', sg.inspect(url));

  const stdoutLabel = url.query.stdoutLabel || url.query.stdout || url.query.label || g_execLabels.stdout;
  const stderrLabel = url.query.stderrLabel || url.query.stderr || url.query.label || g_execLabels.stderr;

  var   sectionLabel = '';

  const evalLine = function(line, isLast) {
    const m = line.match(/~~~annsect~~~ [(][(](.*)[)][)] [(][(](.*)[)][)]/i);
    if (m) {
      sectionLabel = m[2];
      return "---------- "+m[1]+" ----------";
    }
    return line;
  };

  const toStdout = function(line_, isLast) {
    if (isLast && line_.length === 0) { return; }
    const line = evalLine(line_, isLast);
    process.stdout.write(`${tpad(`${stdoutLabel}.${sectionLabel}`, 28)}: ${line}\n`);
  };

  const toStderr = function(line_, isLast) {
    if (isLast && line_.length === 0) { return; }
    const line = evalLine(line_, isLast);
    process.stderr.write(`${tpad(`${stderrLabel}.${sectionLabel}`, 28)}: ${chalk.red(line)}\n`);
  };

  return handleUpload(req, res, function(err, uploadResult) {
    if (sg.ok(err, uploadResult)) {

      var   execOptions = {async:true, timeout:0, shell: '/bin/bash'};

      if (url.cwd) {
        execOptions.cwd = url.cwd;
      }

      var scriptsToRun = [];
      _.each(uploadResult.files, function(file, fieldName) {
        if (test('-f', file.path)) {
          chmod('u+x', file.path);
          scriptsToRun.push(file.path);
        }
      });

      // Now, run them
      const spawnOptions = {
        cwd:  process.env.HOME,
        env:  process.env
      };

      var index = 0;
      return sg.__each(scriptsToRun, function(path, next) {
        const runIndex    = index;
        var   runResult   = {outlen:0, errlen:0, index, path};
        var   child       = child_process.spawn(path, [], spawnOptions);

        var stdoutRemainder = '';
        child.stdout.on('data', function(chunk) {
          var lines = (stdoutRemainder + chunk).split('\n');
          stdoutRemainder = lines.pop();

          runResult.outlen += chunk.length;
          _.each(lines, line => { toStdout(line); });
        });

        var stderrRemainder = '';
        child.stderr.on('data', function(chunk) {
          var lines = (stderrRemainder + chunk).split('\n');
          stderrRemainder = lines.pop();

          runResult.errlen += chunk.length;
          _.each(lines, line => { toStderr(line); });
        });

        child.on('close', function(code) {

          toStdout(stdoutRemainder, true);
          toStderr(stderrRemainder, true);

          _.extend(runResult, {code});
          result.exits[runIndex] = runResult;
          return next();
        });

        index += 1;

      }, function done() {

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

// Truncate and pad
function tpad(str, len) {
  return sg.lpad(str.substr(0,len), len);
}

