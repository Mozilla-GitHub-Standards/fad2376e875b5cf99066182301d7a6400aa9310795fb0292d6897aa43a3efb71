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

let EXPORTED_SYMBOLS = ["SnowlSource"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

// modules that are generic
Cu.import("resource://snowl/modules/Observers.js");
Cu.import("resource://snowl/modules/URI.js");

// modules that are Snowl-specific
Cu.import("resource://snowl/modules/constants.js");
Cu.import("resource://snowl/modules/datastore.js");
Cu.import("resource://snowl/modules/message.js");
Cu.import("resource://snowl/modules/utils.js");

// FIXME: make strands.js into a module.
let loader = Cc["@mozilla.org/moz/jssubscript-loader;1"].getService(Ci.mozIJSSubScriptLoader);
loader.loadSubScript("chrome://snowl/content/strands.js");

/**
 * SnowlSource: a source of messages.
 *
 * FIXME: update this documentation now that we're using it via mixins
 * instead of inheritance.
 *
 * This is an abstract class that should not be instantiated. Rather, objects
 * should inherit it via one of two methods (depending on whether or not they
 * also inherit other functionality):
 *
 * Objects that only inherit SnowlSource may assign it to their prototype
 * (or to their prototype's prototype) and then declare overridden attributes
 * as appropriate, with the prototype chain automatically delegating other
 * attributes to SnowlSource:
 *
 *   function MySource = {
 *     SnowlSource.init.call(this, ...);
 *     this.overriddenMethod: function(...) {...},
 *     this.overriddenProperty: "foo",
 *     this.__defineGetter("overriddenGetter", function() {...}),
 *     this.__defineSetter("overriddenSetter", function(newVal) {...}),
 *   }
 *   MySource.prototype = SnowlSource;
 *
 *     -- or --
 *
 *   function MySource = {
 *     SnowlSource.init.call(this, ...);
 *   }
 *   MySource.prototype = {
 *     __proto__: SnowlSource,
 *     overriddenMethod: function(...) {...},
 *     overriddenProperty: "foo",
 *     get overriddenGetter() {...},
 *     set overriddenSetter(newVal) {...}
 *   };
 *
 * Objects that inherit other functionality should redeclare every attribute
 * in SnowlSource, manually delegating to SnowlSource as appropriate:
 * FIXME: make it possible to import attributes instead of redeclaring them.
 *
 *   function MyThing = {
 *     SnowlSource.init.call(this, ...);
 *   }
 *
 *   MyThing.prototype = {
 *     overriddenMethod: function(...) {...},
 *     overriddenProperty: "foo",
 *     get overriddenGetter() {...},
 *     set overriddenSetter(newVal) {...}
 *
 *     delegatedMethod: function(...) {
 *       SnowlSource.call(this, ...);
 *     },
 *
 *     get delegatedProperty: function() {
 *       return SnowlSource.delegatedProperty;
 *     },
 *
 *     // It's dangerous to set the base class's properties; don't do this!!!
 *     set delegatedProperty: function(newVal) {
 *       SnowlSource.delegatedProperty = newVal;
 *     },
 *
 *     get delegatedGetter: function() {
 *       return SnowlSource.__lookupGetter__("delegatedGetter").call(this);
 *     },
 *
 *     set delegatedSetter: function(newVal) {
 *       SnowlSource.__lookupSetter__("delegatedSetter").call(this, newVal);
 *     }
 *   };
 *
 * Memoizing unary getters in this object must memoize to another getter
 * so that subclasses can call the getters directly without causing trouble
 * for other subclasses that access them via __lookupGetter__.
 */
function SnowlSource() {}

SnowlSource.retrieve = function(id) {
  let source = null;

  // FIXME: memoize this.
  let statement = SnowlDatastore.createStatement(
    "SELECT type, name, machineURI, humanURI, username, lastRefreshed, " +
    "importance, placeID FROM sources WHERE id = :id"
  );

  try {
    statement.params.id = id;
    if (statement.step()) {
      let row = statement.row;
      let constructor;
      // Bleh, this function is called within the JS context for this module,
      // which means it doesn't know anything about other modules it doesn't
      // import (like SnowlFeed and SnowlTwitter).  The current hack to deal
      // with this is to set the constructor to |this| hoping that |this| is
      // the right constructor (which it is as long as this function got mixed
      // into the right constructor), but this isn't going to work when we want
      // to use this to pull all accounts and make them available in the service,
      // so we'll have to figure out something better to do then.
      try { constructor = eval(row.type) } catch(ex) { constructor = this };
      source = new constructor(id,
                               row.name,
                               URI.get(row.machineURI),
                               URI.get(row.humanURI),
                               row.username,
                               row.lastRefreshed ? SnowlDateUtils.julianToJSDate(row.lastRefreshed) : null,
                               row.importance,
                               row.placeID);
    }
  }
  finally {
    statement.reset();
  }

  return source;
}

SnowlSource.prototype = {
  init: function(aID, aName, aMachineURI, aHumanURI, aUsername, aLastRefreshed, aImportance, aPlaceID) {
    this.id = aID;
    this.name = aName;
    this.machineURI = aMachineURI;
    this.humanURI = aHumanURI;
    this.username = aUsername;
    this.lastRefreshed = aLastRefreshed;
    // FIXME: make it so I don't have to set importance to null if it isn't
    // specified in order for its non-set value to remain null.
    this.importance = aImportance || null;
    this.placeID = aPlaceID;
  },

  // How often to refresh sources, in milliseconds.
  refreshInterval: 1000 * 60 * 30, // 30 minutes

  id: null,

  name: null,

  /**
   * The URL at which to find a machine-processable representation of the data
   * provided by the source.  For a feed source, this is the URL of its RSS/Atom
   * document; for an email source, it's the URL of its POP/IMAP server.
   */
  machineURI: null,

  /**
   * The codebase principal for the machine URI.  We use this to determine
   * whether or not the source can link to the links it provides, so we can
   * prevent sources from linking to javascript: and data: links that would
   * run with chrome privileges if inserted into our views.
   */
  get principal() {
    let securityManager = Cc["@mozilla.org/scriptsecuritymanager;1"].
                          getService(Ci.nsIScriptSecurityManager);
    let principal = securityManager.getCodebasePrincipal(this.machineURI);
    this.__defineGetter__("principal", function() principal);
    return this.principal;
  },

  // The URL at which to find a human-readable representation of the data
  // provided by the source.  For a feed source, this is the website that
  // publishes the feed; for an email source, it might be the webmail interface.
  humanURI: null,

  // The username with which the user gets authorized to access the account.
  username: null,

  // A JavaScript Date object representing the last time this source
  // was checked for updates to its set of messages.
  lastRefreshed: null,

  // An integer representing how important this source is to the user
  // relative to other sources to which the user is subscribed.
  importance: null,

  // The ID of the place representing this source in a list of collections.
  placeID: null,

  // The collection of messages from this source.
  messages: null,

  // Favicon Service
  get faviconSvc() {
    let faviconSvc = Cc["@mozilla.org/browser/favicon-service;1"].
                     getService(Ci.nsIFaviconService);
    this.__defineGetter__("faviconSvc", function() faviconSvc);
    return this.faviconSvc;
  },

  // XXX: If a favicon is not in cache, getFaviconForPage throws, but we do
  // not want to try getFaviconImageForPage as that returns a default moz image.
  // Perhaps overkill to try to get a data uri for the favicon via additional
  // favicon methods. So we will try the former, and use the below for first
  // time visits for sources we have so far, til this can be fixed properly.
  get faviconURI() {
    if (this.humanURI) {
      try {
        // If the page has been visited and the icon is in cache
        return this.faviconSvc.getFaviconForPage(this.humanURI);
      }
      catch(ex) {
        // Try to get the image, returns moz default if not found
//        return this.faviconSvc.getFaviconImageForPage(this.humanURI);
//        return this.faviconSvc.getFaviconLinkForIcon(this.humanURI);
      }
    }

    // The default favicon for feed sources.
    // FIXME: get icon from collections table instead of hardcoding
    if (this.constructor.name == "SnowlFeed")
      return URI.get("chrome://snowl/skin/livemarkFolder-16.png");

    // The default favicon for twitter.
    // FIXME: get icon from collections table instead of hardcoding
    if (this.constructor.name == "SnowlTwitter")
      return URI.get("http://static.twitter.com/images/favicon.ico");

    return null;
  },

  /**
   * Check for new messages and update the local store of messages to reflect
   * the latest updates available from the source.  This method is a stub that
   * is expected to be overridden by subclass implementations.
   *
   * @param   refreshTime   {Date}
   *          the time at which a refresh currently in progress began
   *          Note: we use this as the received time when adding messages to
   *          the datastore.  We get it from the caller instead of generating it
   *          ourselves to allow the caller to synchronize received times
   *          across refreshes of multiple sources, which makes message views
   *          sorted by received, then published look better for messages
   *          received in the same refresh cycle.
   */
  refresh: function(refreshTime) {},

  retrieveMessages: function() {
    // FIXME: memoize this.
    let messagesStatement = SnowlDatastore.createStatement(
      "SELECT id FROM messages WHERE sourceID = :id"
    );
    
    try {
      messagesStatement.params.id = id;
      this.messages = [];
      // FIXME: retrieve all messages at once instead of one at a time.
      while (messagesStatement.step())
        this.messages.push(SnowlMessage.retrieve(messagesStatement.row.id));
    }
    finally {
      messagesStatement.reset();
    }
  },

  /**
   * Insert a record for this source into the database, or update an existing
   * record; store placeID back into sources table.
   *
   * FIXME: move this to a SnowlAccount interface.
   */
  persist: function() {
    let statement, placeID;
    if (this.id) {
      statement = SnowlDatastore.createStatement(
        "UPDATE sources " +
        "SET      name = :name,          " +
        "         type = :type,          " +
        "   machineURI = :machineURI,    " +
        "     humanURI = :humanURI,      " +
        "     username = :username,      " +
        "lastRefreshed = :lastRefreshed, " +
        "   importance = :importance     " +
        "WHERE     id = :id"
      );
    }
    else {
      statement = SnowlDatastore.createStatement(
        "INSERT INTO sources ( name,  type,  machineURI,  humanURI,  username,  lastRefreshed,  importance) " +
        "VALUES              (:name, :type, :machineURI, :humanURI, :username, :lastRefreshed, :importance)"
      );
    }

    SnowlDatastore.dbConnection.beginTransaction();
    try {
      statement.params.name = this.name;
      statement.params.type = this.constructor.name;
      statement.params.machineURI = this.machineURI.spec;
      statement.params.humanURI = this.humanURI ? this.humanURI.spec : null;
      statement.params.username = this.username;
      statement.params.lastRefreshed = this.lastRefreshed ? SnowlDateUtils.jsToJulianDate(this.lastRefreshed) : null;
      statement.params.importance = this.importance;
      if (this.id)
        statement.params.id = this.id;
      statement.step();
      if (!this.id) {
        // Extract the ID of the source from the newly-created database record.
        this.id = SnowlDatastore.dbConnection.lastInsertRowID;

        // Update messages and their authors to include the source ID.
        if (this.messages) {
          for each (let message in this.messages) {
            message.sourceID = this.id;
            if (message.author)
              message.author.sourceID = this.id;
          }
        }

        // Create places record
        this.placeID = SnowlPlaces.persistPlace("sources",
                                                this.id,
                                                this.name,
                                                this.machineURI,
                                                null, // this.username,
                                                this.faviconURI,
                                                this.id); // aSourceID

        // Store placeID back into messages for db integrity
        SnowlDatastore.dbConnection.executeSimpleSQL(
          "UPDATE sources " +
          "SET    placeID = " + this.placeID +
          " WHERE      id = " + this.id);
this._log.info("persist placeID:sources.id - " + this.placeID + " : " + this.id);

        // Use 'added' here for collections observer for more specificity
        Observers.notify("snowl:source:added", this.placeID);
      }

      if (this.messages)
        this.persistMessages();

      SnowlDatastore.dbConnection.commitTransaction();
    }
    catch(ex) {
      SnowlDatastore.dbConnection.rollbackTransaction();
      throw ex;
    }
    finally {
      statement.reset();
    }

    return this.id;
  },

  persistMessages: strand(function() {
    // Sort the messages by date, so we insert them from oldest to newest,
    // which makes them show up in the correct order in views that expect
    // messages to be inserted in that order and sort messages by their IDs.
    this.messages.sort(function(a, b) a.timestamp < b.timestamp ? -1 :
                                      a.timestamp > b.timestamp ?  1 : 0);

    let currentMessageIDs = [];
    let messagesChanged = false;

    for each (let message in this.messages) {
      this._log.info("persisting message " + message.externalID);

      let added = false;
      try {
        added = message.persist();
      }
      catch(ex) {
        this._log.error("couldn't persist " + message.externalID + ": " + ex);
        continue;
      }
      if (messagesChanged == false && added)
        messagesChanged = true;
      currentMessageIDs.push(message.id);

      // Sleep for a bit to give other sources that are being refreshed
      // at the same time the opportunity to insert messages themselves,
      // so the messages appear mixed together in views that display messages
      // by the order in which they are received, which is more pleasing
      // than if the messages were clumped together by source.
      // As a side effect, this might reduce horkage of the UI thread
      // during refreshes.
      yield sleep(50);
    }

    // Update the current flag.
    this.updateCurrentMessages(currentMessageIDs);

    // Notify list and collections views on completion of messages download, list
    // also notified of each message addition.
    if (messagesChanged)
      Observers.notify("snowl:messages:changed", this.id);
  }),

  /**
   * Add a message with a single part to the datastore.
   *
   * @param aSourceID    {integer} the record ID of the message source
   * @param aExternalID  {string}  the external ID of the message
   * @param aSubject     {string}  the title of the message
   * @param aAuthorID    {string}  the author of the message
   * @param aTimestamp   {Date}    the date/time when the message was sent
   * @param aReceived    {Date}    the date/time when the message was received
   * @param aLink        {nsIURI}  a link to the content of the message,
   *                               if the content is hosted on a server
   *
   * @returns {integer} the internal ID of the newly-created message
   */
  addSimpleMessage: function(aSourceID, aExternalID, aSubject, aAuthorID,
                             aTimestamp, aReceived, aLink) {
    let messageID =
      SnowlDatastore.insertMessage(aSourceID,
                                   aExternalID,
                                   aSubject,
                                   aAuthorID,
                                   SnowlDateUtils.jsToJulianDate(aTimestamp),
                                   SnowlDateUtils.jsToJulianDate(aReceived),
                                   aLink ? aLink.spec : null);

    return messageID;
  },

  get _stmtInsertPart() {
    let statement = SnowlDatastore.createStatement(
      "INSERT INTO parts( messageID,  content,  mediaType,  partType,  baseURI,  languageTag) " +
      "VALUES           (:messageID, :content, :mediaType, :partType, :baseURI, :languageTag)"
    );
    this.__defineGetter__("_stmtInsertPart", function() statement);
    return this._stmtInsertPart;
  },

  get _stmtInsertPartText() {
    let statement = SnowlDatastore.createStatement(
      "INSERT INTO partsText( docid,  content) " +
      "VALUES               (:docid, :content)"
    );
    this.__defineGetter__("_stmtInsertPartText", function() statement);
    return this._stmtInsertPartText;
  },

  /**
   * Add a message part (i.e. a portion of its content) to the datastore.
   *
   * FIXME: make a version of this method that takes an nsITextConstruct
   * to improve performance for sources (like SnowlFeed) that get content
   * in that form.
   *
   * @param messageID     {integer}
   *        the ID of the message to which the part belongs
   *
   * @param content       {string}
   *        the content of the part
   *
   * @param mediaType     {string}
   *        the type of content it contains (plaintext, HTML, etc.);
   *        must be an Internet media type (text/plain, image/png, etc.)
   *
   * @param partType      {integer}   [optional]
   *        the kind of part it is (content, summary, attachment, etc.);
   *        must be one of the PART_TYPE_* constants defined in constants.js
   *
   * @param baseURI       {nsIURI}    [optional]
   *        the URI against which to resolve relative references in the content;
   *        only matters for (X)HTML content
   *
   * @param languageTag   {string}    [optional]
   *        the language in which the content is written;
   *        must be an IETF language tag (en-US, fr, etc.)
   *
   * @returns the ID of the part
   */
  addPart: function(messageID, content, mediaType, partType, baseURI, languageTag) {
    // Insert the part into the parts table.
    this._stmtInsertPart.params.messageID     = messageID;
    this._stmtInsertPart.params.content       = content;
    this._stmtInsertPart.params.mediaType     = mediaType;
    this._stmtInsertPart.params.partType      = partType || PART_TYPE_CONTENT;
    this._stmtInsertPart.params.baseURI       = (baseURI ? baseURI.spec : null);
    this._stmtInsertPart.params.languageTag   = languageTag || null;
    this._stmtInsertPart.execute();
    let id = SnowlDatastore.dbConnection.lastInsertRowID;

    // Insert a plaintext version of the content into the partsText fulltext
    // table, converting it to plaintext first if necessary (and possible).
    let plainText = content;
    switch (mediaType) {
      case "text/html":
      case "application/xhtml+xml":
        // Use nsIFeedTextConstruct to convert the markup to plaintext.
        let (construct = Cc["@mozilla.org/feed-textconstruct;1"].
                         createInstance(Ci.nsIFeedTextConstruct)) {
          construct.text = content;
          construct.type = TEXT_CONSTRUCT_TYPES[mediaType];
          plainText = construct.plainText();
        }
        // Now that we've converted the markup to plaintext, fall through
        // to the text/plain case that inserts the data into the database.

      case "text/plain":
        // Give the fulltext record the same doc ID as the row ID of the parts
        // record so we can join them together to get the part (and thence the
        // message) when doing a fulltext search.
        this._stmtInsertPartText.params.docid = id;
        this._stmtInsertPartText.params.content = plainText;
        this._stmtInsertPartText.execute();
        break;

      default:
        // It isn't a type we understand, so don't do anything with it.
        // XXX If it's text/*, shouldn't we fulltext index it anyway?
    }
  },

  /**
   * Update the current flag for messages in a source, after a refresh.
   * If message's current flag = 1 set to 0, then set current flag for messages
   * in the current refresh list to 1.
   *
   * @param aCurrentMessageIDs  {array} messages table ids of the current list
   */
  updateCurrentMessages: function(aCurrentMessageIDs) {
    SnowlDatastore.dbConnection.executeSimpleSQL(
      "UPDATE messages SET current =  0" +
      " WHERE sourceID = " + this.id + " AND current = 1"
    );
    SnowlDatastore.dbConnection.executeSimpleSQL(
      "UPDATE messages SET current = 1" +
      " WHERE sourceID = " + this.id + " AND id IN " +
      "(" + aCurrentMessageIDs.join(", ") + ")"
    );
  }

};
