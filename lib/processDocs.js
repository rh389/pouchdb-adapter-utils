'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _pouchdbErrors = require('pouchdb-errors');

var _updateDoc = require('./updateDoc');

var _updateDoc2 = _interopRequireDefault(_updateDoc);

var _pouchdbMerge = require('pouchdb-merge');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function rootIsMissing(docInfo) {
  return docInfo.metadata.rev_tree[0].ids[1].status === 'missing';
}

function processDocs(revLimit, docInfos, api, fetchedDocs, tx, results, writeDoc, opts, overallCallback) {

  // Default to 1000 locally
  revLimit = revLimit || 1000;

  function insertDoc(docInfo, resultsIdx, callback) {
    // Cant insert new deleted documents
    var winningRev = (0, _pouchdbMerge.winningRev)(docInfo.metadata);
    var deleted = (0, _pouchdbMerge.isDeleted)(docInfo.metadata, winningRev);
    if ('was_delete' in opts && deleted) {
      results[resultsIdx] = (0, _pouchdbErrors.createError)(_pouchdbErrors.MISSING_DOC, 'deleted');
      return callback();
    }

    // 4712 - detect whether a new document was inserted with a _rev
    var inConflict = newEdits && rootIsMissing(docInfo);

    if (inConflict) {
      var err = (0, _pouchdbErrors.createError)(_pouchdbErrors.REV_CONFLICT);
      results[resultsIdx] = err;
      return callback();
    }

    var delta = deleted ? 0 : 1;

    writeDoc(docInfo, winningRev, deleted, deleted, false, delta, resultsIdx, callback);
  }

  var newEdits = opts.new_edits;
  var idsToDocs = new Map();

  var docsDone = 0;
  var docsToDo = docInfos.length;

  function checkAllDocsDone() {
    if (++docsDone === docsToDo && overallCallback) {
      overallCallback();
    }
  }

  docInfos.forEach(function (currentDoc, resultsIdx) {

    if (currentDoc._id && (0, _pouchdbMerge.isLocalId)(currentDoc._id)) {
      var fun = currentDoc._deleted ? '_removeLocal' : '_putLocal';
      api[fun](currentDoc, { ctx: tx }, function (err, res) {
        results[resultsIdx] = err || res;
        checkAllDocsDone();
      });
      return;
    }

    var id = currentDoc.metadata.id;
    if (idsToDocs.has(id)) {
      docsToDo--; // duplicate
      idsToDocs.get(id).push([currentDoc, resultsIdx]);
    } else {
      idsToDocs.set(id, [[currentDoc, resultsIdx]]);
    }
  });

  // in the case of new_edits, the user can provide multiple docs
  // with the same id. these need to be processed sequentially
  idsToDocs.forEach(function (docs, id) {
    var numDone = 0;

    function docWritten() {
      if (++numDone < docs.length) {
        nextDoc();
      } else {
        checkAllDocsDone();
      }
    }
    function nextDoc() {
      var value = docs[numDone];
      var currentDoc = value[0];
      var resultsIdx = value[1];

      if (fetchedDocs.has(id)) {
        (0, _updateDoc2.default)(revLimit, fetchedDocs.get(id), currentDoc, results, resultsIdx, docWritten, writeDoc, newEdits);
      } else {
        // Ensure stemming applies to new writes as well
        var merged = (0, _pouchdbMerge.merge)([], currentDoc.metadata.rev_tree[0], revLimit);
        currentDoc.metadata.rev_tree = merged.tree;
        currentDoc.stemmedRevs = merged.stemmedRevs || [];
        insertDoc(currentDoc, resultsIdx, docWritten);
      }
    }
    nextDoc();
  });
}

exports.default = processDocs;