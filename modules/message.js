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
 * Portions created by the Initial Developer are Copyright (C) 2008
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

let EXPORTED_SYMBOLS = ["SnowlMessage"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

// modules that come with Firefox
Cu.import("resource://gre/modules/utils.js"); // Places

// modules that are generic
Cu.import("resource://snowl/modules/URI.js");

// modules that are Snowl-specific
Cu.import("resource://snowl/modules/constants.js");
Cu.import("resource://snowl/modules/datastore.js");
Cu.import("resource://snowl/modules/service.js");
Cu.import("resource://snowl/modules/source.js");
Cu.import("resource://snowl/modules/utils.js");

function SnowlMessage(props) {
  // The way this currently works requires instantiators to pass the value
  // of the read property via its private name _read, which seems wrong.
  // FIXME: make it so callers can pass read via its public name.
  for (let name in props)
    this[name] = props[name];
}

// FIXME: refactor this with the similar code in the SnowlCollection::messages getter.
// FIXME: retrieve all basic properties of the message in a single query.
SnowlMessage.get = function(id) {
  let message;

  let statement = SnowlDatastore.createStatement(
    "SELECT sourceID, subject, authorID, timestamp, received, link, current, read " +
    "FROM messages WHERE messages.id = :id"
  );

  try {
    statement.params.id = id;
    if (statement.step()) {
      message = new SnowlMessage({
        id:         id,
        sourceID:   statement.row.sourceID,
        subject:    statement.row.subject,
        authorID:   statement.row.authorID,
        timestamp:  SnowlDateUtils.julianToJSDate(statement.row.timestamp),
        received:   SnowlDateUtils.julianToJSDate(statement.row.received),
        link:       statement.row.link,
        current:    statement.row.current,
        _read:      (statement.row.read ? true : false)
      });
    }
  }
  finally {
    statement.reset();
  }

  return message;
};

SnowlMessage.delete = function(aMessage) {
  let message = aMessage;
  let messageID = message.id;
  let authorID = message.authorID;
  let authorPlaceID = message.author.placeID;
  let current = message.current;

  SnowlDatastore.dbConnection.beginTransaction();
  try {
    // Delete messages
    SnowlDatastore.dbConnection.executeSimpleSQL("DELETE FROM metadata " +
        "WHERE messageID = " + messageID);
//this._log.info("_deleteMessages: Delete messages METADATA DONE");
    SnowlDatastore.dbConnection.executeSimpleSQL("DELETE FROM partsText " +
        "WHERE docid IN " +
        "(SELECT id FROM parts WHERE messageID = " + messageID + ")");
//this._log.info("_deleteMessages: Delete messages PARTSTEXT DONE");
    SnowlDatastore.dbConnection.executeSimpleSQL("DELETE FROM parts " +
        "WHERE messageID  = " + messageID);
//this._log.info("_deleteMessages: Delete messages PARTS DONE");
    // If a message is current and marked deleted, need to keep the record so
    // duplicates are not re added upon refresh.  So we move to a pending purge
    // state and delete the rest of the message.
    if (current == MESSAGE_CURRENT_DELETED)
      SnowlDatastore.dbConnection.executeSimpleSQL("UPDATE messages " +
          "SET current = " + MESSAGE_CURRENT_PENDING_PURGE +
          " WHERE id = " + messageID);
    else
      SnowlDatastore.dbConnection.executeSimpleSQL("DELETE FROM messages " +
          "WHERE id = " + messageID);
//this._log.info("_deleteMessages: Delete messages DONE");
    if (!SnowlService.hasAuthorMessage(authorID)) {
      // Delete people/identities; author's only message has been deleted.
      SnowlDatastore.dbConnection.executeSimpleSQL("DELETE FROM people " +
          "WHERE id IN " +
          "(SELECT personID FROM identities WHERE id = " + authorID + ")");
      SnowlDatastore.dbConnection.executeSimpleSQL("DELETE FROM identities " +
          "WHERE id = " + authorID);
      // Finally, clean up Places bookmark by author's placeID.  A collections
      // tree rebuild is triggered by Places on removeItem of a visible item,
      // triggering a select event.  Need to bypass in onSelect.
      SnowlMessage.prototype.CollectionsView.noSelect = true;
      PlacesUtils.bookmarks.removeItem(authorPlaceID);
//this._log.info("_deleteMessages: Delete DONE authorID - "+authorID);
    }
//        PlacesUtils.history.removePage(URI(this.MESSAGE_URI + messageID));
//SnowlPlaces._log.info("_deleteMessages: Delete DONE messageID - "+messageID);

    SnowlDatastore.dbConnection.commitTransaction();
  }
  catch(ex) {
    SnowlDatastore.dbConnection.rollbackTransaction();
    throw ex;
  }
};

SnowlMessage.markDeleted = function(aMessage) {
  let message = aMessage;
  let messageID = message.id;

  SnowlDatastore.dbConnection.beginTransaction();
  try {
    // Mark message deleted, make sure this caller checks for non delete status first.
    SnowlDatastore.dbConnection.executeSimpleSQL(
      "UPDATE messages SET current =" +
      " (CASE WHEN current = " + MESSAGE_NON_CURRENT +
      "       THEN " + MESSAGE_NON_CURRENT_DELETED +
      "       WHEN current = " + MESSAGE_CURRENT +
      "       THEN " + MESSAGE_CURRENT_DELETED +
      "  END)" +
      " WHERE id = " + messageID
    );

    SnowlDatastore.dbConnection.commitTransaction();
  }
  catch(ex) {
    SnowlDatastore.dbConnection.rollbackTransaction();
    throw ex;
  }
};

SnowlMessage.prototype = {
  id: null,
  subject: null,
  // FIXME: make this an nsIURI.
  link: null,
  timestamp: null,
  received: null,

  /**
   * The author object from the people table, include identities externalID.
   */
  _author: null,
  get author() {
    let author = {}, sID, externalID;

    if (this._author)
      return this._author;

    try {
      this._getAuthorStatement.params.id = this.authorID;
      if (this._getAuthorStatement.step()) {
        author["name"] = this._getAuthorStatement.row.name;
        author["homeURL"] = this._getAuthorStatement.row.homeURL;
        author["iconURL"] = this._getAuthorStatement.row.iconURL;
        author["placeID"] = this._getAuthorStatement.row.placeID;
        [sID, externalID] = SnowlDatastore.selectIdentitiesSourceID(this.authorID);
        author["externalID"] = externalID;
      }
    }
    finally {
      this._getAuthorStatement.reset();
    }

    return this._author = author;
  },

  get _getAuthorStatement() {
    let statement = SnowlDatastore.createStatement(
      "SELECT name, homeURL, iconURL, placeID " +
      "FROM people WHERE id = :id"
    );
    this.__defineGetter__("_getAuthorStatement", function() { return statement });
    return this._getAuthorStatement;
  },

  // FIXME: figure out whether or not setters should update the database.
  _read: undefined,
  get read() {
    return this._read;
  },

  set read(newValue) {
    if (this._read == newValue)
      return;
    this._read = newValue ? true : false;
    SnowlDatastore.dbConnection.executeSimpleSQL("UPDATE messages SET read = " +
                                                 (this._read ? "1" : "0") +
                                                 " WHERE id = " + this.id);
  },

  /**
   * The content of the message.  If undefined, we haven't retrieved it from
   * the datastore.  If null, on the other hand, the message has no content.
   */
  _content: undefined,
  get content() {
    if (typeof this._content == "undefined")
      this._content = this._getPart(PART_TYPE_CONTENT);
    return this._content;
  },
  set content(newValue) {
    this._content = newValue;
  },

  /**
   * The summary of the message.  If undefined, we haven't retrieved it from
   * the datastore.  If null, on the other hand, the message has no summary.
   */
  _summary: undefined,
  get summary() {
    if (typeof this._summary == "undefined")
      this._summary = this._getPart(PART_TYPE_SUMMARY);
    return this._summary;
  },
  set summary(newValue) {
    this._summary = newValue;
  },

  get excerpt() {
    let construct = this.content || this.summary;

    if (!construct)
      return null;

    let contentText = construct.plainText();

    // XXX Does an ellipsis need to be localizable?
    // FIXME: use a real ellipsis character (…, a.k.a. &hellip;).
    return contentText.substring(0, 140) + (contentText.length > 140 ? "..." : "");
  },

  get _getPartStatement() {
    let statement = SnowlDatastore.createStatement(
      "SELECT content, mediaType, baseURI, languageTag FROM parts " +
      "WHERE messageID = :messageID AND partType = :partType"
    );
    this.__defineGetter__("_getPartStatement", function() { return statement });
    return this._getPartStatement;
  },

  _getPart: function(aPartType) {
    let part = null;

    try {
      this._getPartStatement.params.messageID = this.id;
      this._getPartStatement.params.partType = aPartType;
      if (this._getPartStatement.step()) {
        // FIXME: instead of a text construct, return a JS object that knows
        // its ID and part type.
        part = Cc["@mozilla.org/feed-textconstruct;1"].
               createInstance(Ci.nsIFeedTextConstruct);
        part.text = this._getPartStatement.row.content;
        part.type = TEXT_CONSTRUCT_TYPES[this._getPartStatement.row.mediaType];
        part.base = URI.get(this._getPartStatement.row.baseURI);
        part.lang = this._getPartStatement.row.languageTag;
      }
    }
    finally {
      this._getPartStatement.reset();
    }

    return part;
  },

  /**
   * The attributes object, from which the message header is derived.
   */
  _attributes: null,
  get attributes() {
    let attributeID, namespace, name, attributes = {};

    if (this._attributes)
      return this._attributes;

    try {
      this._getAttributesStatement.params.messageID = this.id;
      while (this._getAttributesStatement.step()) {
        attributeID = this._getAttributesStatement.row.attributeID;
        [namespace, name] = this.attributeName(attributeID);
        attributes[name] = this._getAttributesStatement.row.value;
      }
    }
    finally {
      this._getAttributesStatement.reset();
    }

    return this._attributes = attributes;
  },

  get _getAttributesStatement() {
    let statement = SnowlDatastore.createStatement(
      "SELECT attributeID, value " +
      "FROM metadata WHERE messageID = :messageID"
    );
    this.__defineGetter__("_getAttributesStatement", function() { return statement });
    return this._getAttributesStatement;
  },

  attributeName: function(aAttributeID) {
    let namespace, name;

    try {
      this._getAttributeNameStatement.params.id = aAttributeID;
      if (this._getAttributeNameStatement.step()) {
        namespace = this._getAttributeNameStatement.row.namespace;
        name = this._getAttributeNameStatement.row.name;
      }
    }
    finally {
      this._getAttributeNameStatement.reset();
    }

    return [namespace, name];
  },

  get _getAttributeNameStatement() {
    let statement = SnowlDatastore.createStatement(
      "SELECT namespace, name " +
      "FROM attributes WHERE id = :id"
    );
    this.__defineGetter__("_getAttributeNameStatement", function() { return statement });
    return this._getAttributeNameStatement;
  },

  get source() {
    return SnowlService.sourcesByID[this.sourceID];
  },

  get CollectionsView() {
    delete this._CollectionsView;
    return this._CollectionsView = SnowlService.gBrowserWindow.document.
                                                getElementById("sidebar").
                                                contentWindow.CollectionsView;
  }

};
