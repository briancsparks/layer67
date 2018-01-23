
/**
 *  Uses AWS KMS to encrypt server SSL keys.
 *
 *  The HTTP SSL certs for all the domain names that are served in this stack are stored
 *  in S3. Of course, they are encrypted. So this script uses AWS Key Management Service
 *  to decrypt them. KMS holds keys that only it knows about, and lets you refer to them
 *  by a nice identifier, and lets you encrypt and decrypt bolbs.
 *
 *    Usage:
 *
 *      To decrypt a cert from S3 that holds the credentials for the stack. This
 *      assumes that /tmp/config.json hols the basename of the cert at .certfile.
 *
 *        ra invoke $(fn ~/dev lib/crypto-kms.js) decrypt --base-name="$(basename $(cat /tmp/config.json | jq -r '.certfile'))"
 *
 *      To decrypt as above, and copy the cert ot a running instance, use pushCertToServer(), as run-instance does.
 *
 *
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
 *
 * To pull a credential from s3, and decrypt it:
 *
 * ra invoke lib/crypto-kms.js decrypt --base-name="$(basename $(cat /tmp/config.json | jq -r '.certfile'))"
 *
 *
 */
lib.pushCertToServer = function() {
  var   u               = sg.prepUsage();

  var ra = raLib.adapt(arguments, (argv_, context, callback) => {
    const decrypt         = ra.wrap(lib.decrypt);

    var   argv            = sg.deepCopy(argv_);

    const ip              = argvGet(argv, 'ip');
    const fullserverpath  = argvGet(argv, 'fullpath,path');
    var   fullpathParts   = fullserverpath.split('/');

    const basename        = argv.basename   = fullpathParts.pop();
    const dirpath         = argv.dirpath    = fullpathParts.join('/');

    return decrypt(argv, function(err, result) {
      if (!sg.ok(err, result))    { return callback(err); }

      // We get a filename of where the cert is
      const certFilename = result.cert;

      // curl -sS 'http://10.13.2.9:12340/sudo/put/etc/nginx/asdf?chmod=640&chown=root' -F 'cfg.json=@layer67.js'

      const url = `'http://${ip}:12340/sudo/put${dirpath}?chmod=644&chown=root'`;
      const args  = ['-sS', url, '-F', `${basename}=@${certFilename}`];

      const opts  = {cwd:path.join(process.env.HOME, 'stmp'), env: process.env};
      return child_process.exec('curl '+args.join(' '), opts, function(err, stdout, stderr) {
        if (!sg.ok(err))    { return callback(err); }

        //if (stdout) {
        //  console.error(stdout);
        //}

        if (stderr) {
          console.error(stderr);
        }

        return callback(null, stdout);
      });
    });

  });
};

/**
 *
 * aws s3 cp "s3://sa-system-storage/${project}/secrets/${area}/${orig_file}.enc" ./
 * aws s3 cp "s3://sa-system-storage/${project}/secrets/deploy/${project}-data-key.json" ./
 *
 *
 * console.mobilewebassist.net.crt
 * console.mobilewebassist.net.key
 * console.mobilewebprint.net.crt
 * console.mobilewebprint.net.key
 * console.mobilewexprint.net.crt
 * console.mobilewexprint.net.key
 * hq.mobilewebassist.net.crt
 * hq.mobilewebassist.net.key
 *
 * mobilewebassist_root_client_ca.crt
 * mobilewebprint_root_client_ca.crt
 * mobilewexprint_root_client_ca.crt
 *
 *
 */

lib.decrypt = function() {
  var   u               = sg.prepUsage();

  var ra = raLib.adapt(arguments, (argv, context, callback) => {

    const Bucket        = `sa-system-storage`;
    const area          = argvGet(argv, u('area',  '=area', 'The area.'))                               || 'deploy';
    const baseName      = argvGet(argv, u('base-name,basename,base',  '=baseFilename', 'The original file.'));

    if (!baseName)      { return u.sage('baseName', 'Need original base filename.', callback); }

    const project       = argvGet(argv, u('project',  '=project', 'The project.'))    || projectFromCertName(baseName);

    if (!project)       { return u.sage('project', 'Need project.', callback); }
    if (!area)          { return u.sage('area', 'Need area.', callback); }

    const storedObj     = `${project}/secrets/${area}/${baseName}.enc`;               /* The filename path of the encrypted file */
    const dataKeyKey    = `${project}/secrets/deploy/${project}-data-key.json`;
    const workfile      = path.join(process.env.HOME, 'stmp', `${baseName}.enc`);   /* The encrpyted file on the local disk */

    var   encrypted, plainTextKey, dataKey, CiphertextBlob;

    return sg.__run2({}, callback, [function(result, next, last, abort) {
      return sg.__runll([function(next) {

        return s3.getObject({Key:storedObj, Bucket}, (err, data) => {
          if (!sg.ok(err, data)) { return abort('Could not get encrypted object from S3: '+storedObj); }

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
        result.cert   = path.join(opts.cwd, baseName);
        result.ok     = true;
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

function projectFromCertName(certName) {
  const parts = certName.split('.');
  if (parts.length === 4) {
    return parts[1];
  }

  const m = /(.*)+_root_client_ca/i.exec(certName);
  if (m) {
    return m[1];
  }

  return /*undefined*/;
}

