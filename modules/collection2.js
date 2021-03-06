/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Snowl.
 *
 * The Initial Developer of the Original Code is Mozilla.
 * Portions created by the Initial Developer are Copyright (C) 2009
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Myk Melez <myk@mozilla.org>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

let EXPORTED_SYMBOLS = ["StorageCollection", "MessageCollection"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

// modules that are generic
Cu.import("resource://snowl/modules/log4moz.js");
Cu.import("resource://snowl/modules/Sync.js");
Cu.import("resource://snowl/modules/URI.js");

// modules that are Snowl-specific
Cu.import("resource://snowl/modules/constants.js");
Cu.import("resource://snowl/modules/datastore.js");
Cu.import("resource://snowl/modules/identity.js");
Cu.import("resource://snowl/modules/message.js");
Cu.import("resource://snowl/modules/service.js");
Cu.import("resource://snowl/modules/utils.js");

/**
 * A set of messages.  Use this to retrieve messages from the datastore.
 * This implementation differs from the one in collection.js in that it:
 *   * doesn't support grouping;
 *   * queries asynchronously;
 *   * retrieves messages as complete objects;
 *   * provides a custom iterator.
 *
 * To use this object, create a new instance, passing the constructor
 * the criteria that define the set of objects to retrieve.  The constructor
 * will retrieve messages without blocking execution of events on the same
 * thread, although the call will appear synchronous to the caller.
 *
 *   let collection = new StorageCollection();
 *   for each (let message in collection)
 *     dump("retrieved message " + message.id + "\n");
 */
function StorageCollection(args) {
  // Extract values from arguments and assign them to member properties.
  if (args) {
    this.constraints = "constraints" in args ? args.constraints : [];
    if ("order" in args) this.order = args.order;
    if ("limit" in args) this.limit = args.limit;
  }
}

StorageCollection.prototype = {
  //**************************************************************************//
  // Properties

  /**
   * An array of Constraint objects with expression and parameters properties
   * that let you constrain the messages returned by the datastore.  Constraint
   * objects have name, operator, value, and [optional] parameter properties.
   * Here's an example Constraint object:
   *
   *   {
   *     name: "received",
   *     operator: ">",
   *     value: :timestamp,
   *     parameters: {
   *       name: timestamp,
   *       value: 2454985
   *     }
   *   }
   */
  constraints: null,

  order: "messages.id DESC",
  limit: null,


  //**************************************************************************//
  // Shortcuts

  get _log() {
    let log = Log4Moz.repository.getLogger("Snowl.StorageCollection");
    this.__defineGetter__("_log", function() log);
    return this._log;
  },

  execute: function(callback) {
    this._callback = callback;
    this._rows = [];
    this._pendingStatement =
      this._statement._statement.statement.executeAsync(this);
    this._log.info("pending statement: " + this._pendingStatement);
  },


  //**************************************************************************//
  // mozIStorageStatementCallback

  handleResult: function(resultSet) {
    this._log.info("handleResult: " + resultSet);
    let row;
    while ((row = resultSet.getNextRow()))
      this._rows.push(row);
  },
  
  handleError: function(error) {
    this._log.info("handleError: " + error);
  },

  handleCompletion: function(reason) {
    this._log.info("handleCompletion: " + reason + "; total rows: " + this._rows.length);
    (this._callback)();
  },


  //**************************************************************************//
  // Statement Generation

  // JS to SQL property name lookup table
  _properties: {
    "source.id": "sources.id"
  },

  // JS to SQL operator lookup table
  _operators: {
    "==": "="
  },

  // JS to SQL value converters
  _valueConverters: {
    "timestamp": function(v) SnowlDateUtils.jsToJulianDate(v),
    "received": function(v) SnowlDateUtils.jsToJulianDate(v)
  },

  get _statement() {
    let columns = [
      "messages.id AS messageID",
      "messages.sourceID",
      "messages.externalID",
      "messages.subject",
      "messages.authorID",
      "messages.subject",
      "messages.timestamp",
      "messages.received",
      "messages.link",
      "messages.current",
      "messages.read",
      "messages.headers",
      "messages.attributes",
      "identities.id AS identities_id",
      "identities.sourceID AS identities_sourceID",
      "identities.externalID AS identities_externalID",
      "identities.personID AS identities_personID",
      "people.id AS people_id",
      "people.name AS people_name",
      "people.placeID AS people_placeID",
      "people.homeURL AS people_homeURL",
      "people.iconURL AS people_iconURL",
      "content.id AS content_id",
      "content.content AS content_content",
      "content.mediaType AS content_mediaType",
      "content.baseURI AS content_baseURI",
      "content.languageTag AS content_languageTag",
      "summary.id AS summary_id",
      "summary.content AS summary_content",
      "summary.mediaType AS summary_mediaType",
      "summary.baseURI AS summary_baseURI",
      "summary.languageTag AS summary_languageTag"
    ];

    let query = 
      "SELECT " + columns.join(", ") + " FROM sources " +
      "JOIN messages ON sources.id = messages.sourceID " +
      "LEFT JOIN identities ON messages.authorID = identities.id " +
      "LEFT JOIN people ON identities.personID = people.id " +

      // The partType conditions for the next two LEFT JOINS have to be
      // in the join constraints because if they were in the WHERE clause
      // they would exclude messages without parts, whereas we want
      // to retrieve messages whether or not they have these parts.

      "LEFT JOIN parts AS content ON messages.id = content.messageID " +
      "AND content.partType = " + PART_TYPE_CONTENT + " " +

      "LEFT JOIN parts AS summary ON messages.id = summary.messageID " +
      "AND summary.partType = " + PART_TYPE_SUMMARY + " " +

      "";

    let conditions = [];
    for each (let { name: name, operator: operator, value: value } in this.constraints) {
      conditions.push(
        (name in this._properties ? this._properties[name] : name) +
        (operator in this._operators ? this._operators[operator] : operator) +
        (name in this._valueConverters ? this._valueConverters[name](value) : value)
      );
    }

    if (conditions.length > 0)
      query += " WHERE " + conditions.join(" AND ");

    if (this.order)
      query += " ORDER BY " + this.order;

    if (this.limit)
      query += " LIMIT " + this.limit;

    this._log.info(query);
    let statement = SnowlDatastore.createStatement(query);

    for each (let constraint in this.constraints) {
      if ("parameters" in constraint) {
        for (let [name, value] in Iterator(constraint.parameters)) {
          this._log.info("param " + name + " = " + value);
          statement.params[name] = value;
        }
      }
    }

    return statement;
  },

  _getMessage: function(row) {
    let content;
    if (row.getResultByName("content_id")) {
      content = Cc["@mozilla.org/feed-textconstruct;1"].
                createInstance(Ci.nsIFeedTextConstruct);
      content.text = row.getResultByName("content_content");
      content.type = TEXT_CONSTRUCT_TYPES[row.getResultByName("content_mediaType")];
      content.base = URI.get(row.getResultByName("content_baseURI"));
      content.lang = row.getResultByName("content_languageTag");
    }

    let summary;
    if (row.getResultByName("summary_id")) {
      summary = Cc["@mozilla.org/feed-textconstruct;1"].
                createInstance(Ci.nsIFeedTextConstruct);
      summary.text = row.getResultByName("summary_content");
      summary.type = TEXT_CONSTRUCT_TYPES[row.getResultByName("summary_mediaType")];
      summary.base = URI.get(row.getResultByName("summary_baseURI"));
      summary.lang = row.getResultByName("summary_languageTag");
    }

    let author;
    if (row.getResultByName("authorID")) {
      let person = new SnowlPerson(row.getResultByName("people_id"),
                                   row.getResultByName("people_name"),
                                   row.getResultByName("people_placeID"),
                                   row.getResultByName("people_homeURL"),
                                   row.getResultByName("people_iconURL"));
      let identity = new SnowlIdentity(row.getResultByName("identities_id"),
                                       row.getResultByName("identities_sourceID"),
                                       row.getResultByName("identities_externalID"),
                                       person);
      author = identity;
    }

    let message = new SnowlMessage({
      id:         row.getResultByName("messageID"),
      source:     SnowlService.sourcesByID[row.getResultByName("sourceID")],
      externalID: row.getResultByName("externalID"),
      subject:    row.getResultByName("subject"),
      author:     author,
      timestamp:  SnowlDateUtils.julianToJSDate(row.getResultByName("timestamp")),
      link:       row.getResultByName("link") ? URI.get(row.getResultByName("link")) : null,
      received:   SnowlDateUtils.julianToJSDate(row.getResultByName("received")),
      read:       row.getResultByName("read") ? true : false,
      current:    row.getResultByName("current"),
      headers:    JSON.parse(row.getResultByName("headers")),
      attributes: JSON.parse(row.getResultByName("attributes")),
      content:    content,
      summary:    summary
    });

    return message;
  },

  /**
   * The messages in the collection.  Use this when you need an array
   * of messages (f.e. for concatenating with another array).  If you just need
   * to iterate messages, then just iterate across the collection object itself,
   * which uses the custom iterator method below, since the iterator method
   * lazily instantiates message objects, while this getter creates them all
   * up front.
   */
  get messages() {
    let messages = [];

    Sync(this.execute, this)();
    for each (let row in this._rows)
      messages.push(this._getMessage(row));

    return messages;
  },

  /**
   * An iterator across the messages in the collection.  Allows callers
   * to iterate messages via |for each... in|, i.e.:
   *
   *   let collection = new StorageCollection();
   *   for each (let message in collection) ...
   */
  __iterator__: function(wantKeys) {
    Sync(this.execute, this)();
    for each (let row in this._rows)
      yield this._getMessage(row);
  }

};



function MessageCollection(args) {
  // Extract values from arguments and assign them to member properties.
  this.constraints = "constraints" in args ? args.constraints : [];
  this.messages = "messages" in args ? args.messages : [];
}

MessageCollection.prototype = {
  constraints: null,

  get _log() {
    let log = Log4Moz.repository.getLogger("Snowl.MessageCollection");
    this.__defineGetter__("_log", function() log);
    return this._log;
  },

  messages: null,

  __iterator__: function(wantKeys) {
    MESSAGES: for each (let message in this.messages) {
      for each (let { name: name, operator: operator, value: value } in this.constraints) {
        with (message) {
          let propertyValue, satisfies = false;
          eval("propertyValue = " + name);
          switch(operator) {
            case "==":
              satisfies = (propertyValue == value);
              break;
            case "<=":
              satisfies = (propertyValue <= value);
              break;
            case ">=":
              satisfies = (propertyValue >= value);
              break;
          }
          if (!satisfies)
            continue MESSAGES;
        }
      }
      yield message;
    }
  }

};
