'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _pouchdbErrors = require('pouchdb-errors');

var _parseDoc = require('./parseDoc');

var _parseDoc2 = _interopRequireDefault(_parseDoc);

var _pouchdbMerge = require('pouchdb-merge');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function updateDoc(revLimit, prev, docInfo, results, i, cb, writeDoc, newEdits) {

  if ((0, _pouchdbMerge.revExists)(prev.rev_tree, docInfo.metadata.rev)) {
    results[i] = docInfo;
    return cb();
  }

  // sometimes this is pre-calculated. historically not always
  var previousWinningRev = prev.winningRev || (0, _pouchdbMerge.winningRev)(prev);
  var previouslyDeleted = 'deleted' in prev ? prev.deleted : (0, _pouchdbMerge.isDeleted)(prev, previousWinningRev);
  var deleted = 'deleted' in docInfo.metadata ? docInfo.metadata.deleted : (0, _pouchdbMerge.isDeleted)(docInfo.metadata);
  var isRoot = /^1-/.test(docInfo.metadata.rev);

  if (previouslyDeleted && !deleted && newEdits && isRoot) {
    var newDoc = docInfo.data;
    newDoc._rev = previousWinningRev;
    newDoc._id = docInfo.metadata.id;
    docInfo = (0, _parseDoc2.default)(newDoc, newEdits);
  }

  var merged = (0, _pouchdbMerge.merge)(prev.rev_tree, docInfo.metadata.rev_tree[0], revLimit);

  var inConflict = newEdits && (previouslyDeleted && deleted && merged.conflicts !== 'new_leaf' || !previouslyDeleted && merged.conflicts !== 'new_leaf' || previouslyDeleted && !deleted && merged.conflicts === 'new_branch');

  if (inConflict) {
    var err = (0, _pouchdbErrors.createError)(_pouchdbErrors.REV_CONFLICT);
    results[i] = err;
    return cb();
  }

  var newRev = docInfo.metadata.rev;
  docInfo.metadata.rev_tree = merged.tree;
  docInfo.stemmedRevs = merged.stemmedRevs || [];
  /* istanbul ignore else */
  if (prev.rev_map) {
    docInfo.metadata.rev_map = prev.rev_map; // used only by leveldb
  }

  // recalculate
  var winningRev = (0, _pouchdbMerge.winningRev)(docInfo.metadata);
  var winningRevIsDeleted = (0, _pouchdbMerge.isDeleted)(docInfo.metadata, winningRev);

  // calculate the total number of documents that were added/removed,
  // from the perspective of total_rows/doc_count
  var delta = previouslyDeleted === winningRevIsDeleted ? 0 : previouslyDeleted < winningRevIsDeleted ? -1 : 1;

  var newRevIsDeleted;
  if (newRev === winningRev) {
    // if the new rev is the same as the winning rev, we can reuse that value
    newRevIsDeleted = winningRevIsDeleted;
  } else {
    // if they're not the same, then we need to recalculate
    newRevIsDeleted = (0, _pouchdbMerge.isDeleted)(docInfo.metadata, newRev);
  }

  writeDoc(docInfo, winningRev, winningRevIsDeleted, newRevIsDeleted, true, delta, i, cb);
}

exports.default = updateDoc;