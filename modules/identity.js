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
 *   alta88 <alta88@gmail.com>
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

const EXPORTED_SYMBOLS = ["SnowlIdentity", "SnowlPerson"];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

// modules that are generic
Cu.import("resource://snowl/modules/log4moz.js");

// modules that are Snowl-specific
Cu.import("resource://snowl/modules/datastore.js");
Cu.import("resource://snowl/modules/source.js");
Cu.import("resource://snowl/modules/URI.js");


function SnowlIdentity(id, sourceID, externalID, personID) {
  this.id = id;
  this.sourceID = sourceID;
  this.externalID = externalID;
  this.personID = personID;
}

SnowlIdentity.__defineGetter__("_log", function() {
  delete this._log;
  return this._log = Log4Moz.repository.getLogger("Snowl.Identity");
});

SnowlIdentity.retrieve = function(id) {
  this._log.debug("retrieving " + id);

  let identity;

  let statement = SnowlDatastore.createStatement(
    "SELECT sourceID, externalID, personID FROM identities WHERE id = :id"
  );

  try {
    statement.params.id = id;
    if (statement.step()) {
      identity = new SnowlIdentity(id,
                                   statement.row.sourceID,
                                   statement.row.externalID,
                                   statement.row.personID);
      identity.person = SnowlPerson.retrieve(statement.row.personID);
    }
  }
  finally {
    statement.reset();
  }


  return identity;
};


SnowlIdentity.prototype = {
  id:         null,
  sourceID:   null,
  externalID: null,
  personID:   null,
  person:     null,

  get _log() {
    this.__defineGetter__("_log", function() SnowlIdentity._log);
    return this._log;
  },

  persist: function() {
    this._log.debug("persisting " + this.sourceID + ":" + this.externalID);

    this.person.persist(this.sourceID, this);

    let statement = SnowlDatastore.createStatement(
      "INSERT INTO identities ( sourceID,  externalID,  personID) " +
      "VALUES                 (:sourceID, :externalID, :personID)"
    );

    try {
      statement.params.sourceID   = this.sourceID;
      statement.params.externalID = this.externalID;
      statement.params.personID   = this.person.id;
      statement.step();
      this.id = SnowlDatastore.dbConnection.lastInsertRowID;
    }
    finally {
      statement.reset();
    }
  }

};


function SnowlPerson(id, name, placeID, homeURL, iconURL) {
  this.id      = id;
  this.name    = name;
  this.placeID = placeID;
  this.homeURL = homeURL;
  this.iconURL = iconURL;
}

SnowlPerson.__defineGetter__("_log", function() {
  delete this._log;
  return this._log = Log4Moz.repository.getLogger("Snowl.Person");
});

SnowlPerson.retrieve = function(id) {
  this._log.debug("retrieving " + id);

  let person;

  let statement = SnowlDatastore.createStatement(
    "SELECT name, placeID, homeURL, iconURL FROM people WHERE id = :id"
  );

  try {
    statement.params.id = id;
    if (statement.step())
      person = new SnowlPerson(id,
                               statement.row.name,
                               statement.row.placeID,
                               statement.row.homeURL,
                               statement.row.iconURL);
  }
  finally {
    statement.reset();
  }

  return person;
};

SnowlPerson.prototype = {
  id:      null,
  name:    null,
  placeID: null,
  homeURL: null,
  iconURL: null,

  get _log() {
    this.__defineGetter__("_log", function() SnowlPerson._log);
    return this._log;
  },

  persist: function(sourceID, identity) {
    this._log.debug("persisting " + this.name);

    let statement = SnowlDatastore.createStatement(
      "INSERT INTO people ( name,  homeURL,  iconURL) " +
      "VALUES             (:name, :homeURL, :iconURL)"
    );

    try {
      statement.params.name    = this.name;
      statement.params.homeURL = this.homeURL;
      statement.params.iconURL = this.iconURL;
      statement.step();
      this.id = SnowlDatastore.dbConnection.lastInsertRowID;

      // XXX lookup favicon in collections table rather than hardcoding
      let iconURI =
        this.iconURL ? URI.get(this.iconURL) :
        this.homeURL ? SnowlSource.faviconSvc.getFaviconForPage(this.homeURL) :
        URI.get("chrome://snowl/skin/person-16.png");
  
      // Create places record, placeID stored into people table record.
      //SnowlPlaces._log.info("Author name:iconURI.spec - " + name + " : " + iconURI.spec);
      // FIXME: break the dependency on sourceID and externalID, since those
      // are attributes of identities, not people.
      this.placeID = SnowlPlaces.persistPlace("people",
                                              this.id,
                                              this.name,
                                              this.homeURL,
                                              identity.externalID,
                                              iconURI,
                                              sourceID);
      // Store placeID back into messages for DB integrity.
      SnowlDatastore.dbConnection.executeSimpleSQL(
        "UPDATE people " +
        "SET    placeID = " + this.placeID +
        " WHERE      id = " + this.id);
    }
    finally {
      statement.reset();
    }
  }

};






//SnowlIdentity.get = function(sourceID, externalID) {
//  let identity;
//
//  let statement = SnowlDatastore.createStatement(
//    "SELECT id, personID " +
//    "FROM identities " +
//    "WHERE externalID = :externalID AND sourceID = :sourceID"
//  );
//
//  try {
//    statement.params.sourceID = sourceID;
//    statement.params.externalID = externalID;
//    if (statement.step()) {
//      identity = new SnowlIdentity(statement.row.id,
//                                   sourceID,
//                                   externalID,
//                                   statement.row.personID);
//    }
//  }
//  finally {
//    statement.reset();
//  }
//
//  return identity;
//};

SnowlIdentity.create = function(sourceID, externalID, name, homeURL, iconURL) {
  let identity;

  let personStatement = SnowlDatastore.createStatement(
    "INSERT INTO people (name, homeURL, iconURL, placeID) " +
    "VALUES             (:name, :homeURL, :iconURL, :placeID)"
  );

  let identityStatement = SnowlDatastore.createStatement(
    "INSERT INTO identities (sourceID, externalID, personID) " +
    "VALUES                 (:sourceID, :externalID, :personID)"
  );

  try {
    personStatement.params.name = name;
    personStatement.params.homeURL = homeURL || null;
    personStatement.params.iconURL = iconURL || null;
    personStatement.step();
    let personID = SnowlDatastore.dbConnection.lastInsertRowID;

    // XXX lookup favicon in collections table rather than hardcoding
    let iconURI =
      iconURL ? URI.get(iconURL) :
      homeURL ? SnowlSource.faviconSvc.getFaviconForPage(homeURL) :
      URI.get("chrome://snowl/skin/person-16.png");

    // Create places record, placeID stored into people table record.
//SnowlPlaces._log.info("Author name:iconURI.spec - " + name + " : " + iconURI.spec);
    let placeID = SnowlPlaces.persistPlace("people",
                                            personID,
                                            name,
                                            null, // homeURL,
                                            externalID, // externalID,
                                            iconURI,
                                            sourceID);
    // Store placeID back into messages for db integrity
    SnowlDatastore.dbConnection.executeSimpleSQL(
      "UPDATE people " +
      "SET    placeID = " + placeID +
      " WHERE      id = " + personID);

    identityStatement.params.sourceID = sourceID;
    identityStatement.params.externalID = externalID;
    identityStatement.params.personID = personID;
    identityStatement.step();
    let identityID = SnowlDatastore.dbConnection.lastInsertRowID;

    identity = new SnowlIdentity(identityID, sourceID, externalID, personID);
  }
  finally {
    personStatement.reset();
    identityStatement.reset();
  }

  return identity;
};

SnowlPerson.__defineGetter__("_getAllStatement",
  function() {
    let statement = SnowlDatastore.createStatement(
      "SELECT id, name, placeID FROM people ORDER BY name"
    );
    this.__defineGetter__("_getAllStatement", function() { return statement });
    return this._getAllStatement;
  }
);

SnowlPerson.getAll = function() {
  let people = [];

  let statement = this._getAllStatement;

  try {
    while (statement.step())
      people.push(new SnowlPerson(statement.row.id,
                                  statement.row.name,
                                  statement.row.placeID));
  }
  finally {
    statement.reset();
  }

  return people;
}
