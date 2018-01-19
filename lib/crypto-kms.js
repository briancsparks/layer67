
/**
 *
 */
const sg                      = require('sgsg');
const _                       = sg._;
const raLib                   = sg.include('run-anywhere') || require('run-anywhere');
const AWS                     = require('aws-sdk');
const child_process           = require('child_process');
const path                    = require('path');
const { StringDecoder }       = require('string_decoder');
const fs                      = sg.extlibs.fsExtra;
const utils                   = require('./utils');

const argvGet                 = sg.argvGet;
const argvExtract             = sg.argvExtract;
const setOnn                  = sg.setOnn;
const deref                   = sg.deref;
const decode                  = utils.decode;

const s3                      = new AWS.S3();
const kms                     = new AWS.KMS({region:'us-east-1'});


var lib = {};

/**
 *
 * aws s3 cp "s3://sa-system-storage/${project}/secrets/${area}/${orig_file}.enc" ./
 * aws s3 cp "s3://sa-system-storage/${project}/secrets/deploy/${project}-data-key.json" ./
 *
 */
lib.decrypt = function() {
  var   u               = sg.prepUsage();

  var ra = raLib.adapt(arguments, (argv, context, callback) => {

    const Bucket        = `sa-system-storage`;
    const area          = argvGet(argv, u('area',  '=area', 'The area.'))                               || 'deploy';
    const project       = argvGet(argv, u('project',  '=project', 'The project.'));
    const baseName      = argvGet(argv, u('base-name,base',  '=baseFilename', 'The original file.'));

    if (!project)       { return u.sage('project', 'Need project.', callback); }
    if (!area)          { return u.sage('area', 'Need area.', callback); }
    if (!baseName)      { return u.sage('baseName', 'Need original base filename.', callback); }

    const storedObj     = `${project}/secrets/${area}/${baseName}.enc`;               /* The filename path of the encrypted file */
    const dataKeyKey    = `${project}/secrets/deploy/${project}-data-key.json`;
    const workfile      = path.join(process.env.HOME, 'stmp', `${baseName}.enc`);   /* The encrpyted file on the local disk */

    var x = {};

    var   encrypted, plainTextKey, dataKey, CiphertextBlob;

    return sg.__run2({}, callback, [function(result, next, last, abort) {
      return sg.__runll([function(next) {

        return s3.getObject({Key:storedObj, Bucket}, (err, data) => {
          if (!sg.ok(err, data)) { return abort('decrypt.getObject-storedObj'); }

          return fs.writeFile(workfile, decode(data.Body, 'utf8'), function(err) {
            return next();
          });
        });

      }, function(next) {

        return s3.getObject({Key:dataKeyKey, Bucket}, (err, data) => {
          if (!sg.ok(err, data)) { return abort('decrypt.getObject-dataKey'); }

          data.Body       = sg.safeJSONParseQuiet(''+data.Body) || {};
          CiphertextBlob  = Buffer.from(deref(data, 'Body.CiphertextBlob'), 'base64');

          return kms.decrypt({CiphertextBlob}, function(err, data) {
            plainTextKey = decode(data.Plaintext, 'base64');
            return next();
          });
        });
      }], next);

    }, function(result, next, last, abort) {
      //openssl enc -aes-256-cbc -d -a -in "${secret_file}.enc" -out "${secret_file}" -k "$key"

      // Note that you could remove the '-out' option, and get the cert via stdout

      const opts  = {cwd:path.join(process.env.HOME, 'stmp'), env: process.env};
      const args  = ['enc', '-aes-256-cbc', '-d', '-a', '-in', workfile, '-out', baseName, '-k', plainTextKey];

      return child_process.exec('openssl '+args.join(' '), opts, function(err, stdout, stderr) {
        result.ok = true;
        return next();
      });

    }], function abort(err, msg) {
      if (msg)  { return sg.die(err, callback, msg); }
      return callback(err);
    });
  });
};


_.each(lib, (value, key) => {
  exports[key] = value;
});

