'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _pouchdbBinaryUtils = require('pouchdb-binary-utils');

var _pouchdbErrors = require('pouchdb-errors');

var _pouchdbMd = require('pouchdb-md5');

function parseBase64(data) {
  try {
    return (0, _pouchdbBinaryUtils.atob)(data);
  } catch (e) {
    var err = (0, _pouchdbErrors.createError)(_pouchdbErrors.BAD_ARG, 'Attachment is not a valid base64 string');
    return { error: err };
  }
}

function preprocessString(att, blobType, callback) {
  var asBinary = parseBase64(att.data);
  if (asBinary.error) {
    return callback(asBinary.error);
  }

  att.length = asBinary.length;
  if (blobType === 'blob') {
    att.data = (0, _pouchdbBinaryUtils.binaryStringToBlobOrBuffer)(asBinary, att.content_type);
  } else if (blobType === 'base64') {
    att.data = (0, _pouchdbBinaryUtils.btoa)(asBinary);
  } else {
    // binary
    att.data = asBinary;
  }
  (0, _pouchdbMd.binaryMd5)(asBinary, function (result) {
    att.digest = 'md5-' + result;
    callback();
  });
}

function preprocessBlob(att, blobType, callback) {
  (0, _pouchdbMd.binaryMd5)(att.data, function (md5) {
    att.digest = 'md5-' + md5;
    // size is for blobs (browser), length is for buffers (node)
    att.length = att.data.size || att.data.length || 0;
    if (blobType === 'binary') {
      (0, _pouchdbBinaryUtils.blobOrBufferToBinaryString)(att.data, function (binString) {
        att.data = binString;
        callback();
      });
    } else if (blobType === 'base64') {
      (0, _pouchdbBinaryUtils.blobOrBufferToBase64)(att.data, function (b64) {
        att.data = b64;
        callback();
      });
    } else {
      callback();
    }
  });
}

function preprocessAttachment(att, blobType, callback) {
  if (att.stub) {
    return callback();
  }
  if (typeof att.data === 'string') {
    // input is a base64 string
    preprocessString(att, blobType, callback);
  } else {
    // input is a blob
    preprocessBlob(att, blobType, callback);
  }
}

function preprocessAttachments(docInfos, blobType, callback) {

  if (!docInfos.length) {
    return callback();
  }

  var docv = 0;
  var overallErr;

  docInfos.forEach(function (docInfo) {
    var attachments = docInfo.data && docInfo.data._attachments ? Object.keys(docInfo.data._attachments) : [];
    var recv = 0;

    if (!attachments.length) {
      return done();
    }

    function processedAttachment(err) {
      overallErr = err;
      recv++;
      if (recv === attachments.length) {
        done();
      }
    }

    for (var key in docInfo.data._attachments) {
      if (docInfo.data._attachments.hasOwnProperty(key)) {
        preprocessAttachment(docInfo.data._attachments[key], blobType, processedAttachment);
      }
    }
  });

  function done() {
    docv++;
    if (docInfos.length === docv) {
      if (overallErr) {
        callback(overallErr);
      } else {
        callback();
      }
    }
  }
}

exports.default = preprocessAttachments;