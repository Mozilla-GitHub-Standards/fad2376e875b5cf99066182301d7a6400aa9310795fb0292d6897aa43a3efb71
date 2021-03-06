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

// modules that come with Firefox

// modules that are generic
Cu.import("resource://snowl/modules/log4moz.js");
Cu.import("resource://snowl/modules/Observers.js");
Cu.import("resource://snowl/modules/StringBundle.js");
Cu.import("resource://snowl/modules/URI.js");

// modules that are Snowl-specific
Cu.import("resource://snowl/modules/constants.js");
Cu.import("resource://snowl/modules/collection.js");
Cu.import("resource://snowl/modules/datastore.js");
Cu.import("resource://snowl/modules/identity.js");
Cu.import("resource://snowl/modules/opml.js");
Cu.import("resource://snowl/modules/service.js");
Cu.import("resource://snowl/modules/source.js");

let strings = new StringBundle("chrome://snowl/locale/datastore.properties");

let gMessageViewWindow = SnowlService.gBrowserWindow;

let CollectionsView = {
  // Logger
  get _log() {
    delete this._log;
    return this._log = Log4Moz.repository.getLogger("Snowl.Sidebar");
  },

  get _tree() {
    delete this._tree;
    return this._tree = document.getElementById("sourcesView");
  },

  get _searchFilter() {
    delete this._searchFilter;
    return this._searchFilter = document.getElementById("snowlFilter");
  },

  get _collectionsViewMenu() {
    delete this._collectionsViewMenu;
    return this._collectionsViewMenu = document.getElementById("collectionsViewMenu");
  },

  get _collectionsViewMenuPopup() {
    delete this._collectionsViewMenuPopup;
    return this._collectionsViewMenuPopup = document.getElementById("collectionsViewMenuPopup");
  },

  get _listToolbar() {
    delete this._listToolbar;
    return this._listToolbar = document.getElementById("snowlListToolbar");
  },

  get _refreshButton() {
    delete this._refreshButton;
    return this._refreshButton = document.getElementById("snowlRefreshButton");
  },

  get _toggleListToolbarButton() {
    delete this._toggleListToolbarButton;
    return this._toggleListToolbarButton = document.getElementById("listToolbarButton");
  },

  get _searchButton() {
    delete this._searchButton;
    return this._searchButton = document.getElementById("snowlListViewSearchButton");
  },

  get itemIds() {
    let intArray = [];
    let strArray = this._tree.getAttribute("itemids").split(",");
    for each (let intg in strArray)
      intArray.push(parseInt(intg));
    delete this._itemIds;
    return this._itemIds = intArray;
  },

  set itemIds(ids) {
    this._tree.setAttribute("itemids", ids);
    delete this._itemIds;
    return this._itemIds = ids;
  },

  Filters: {
    unread: false,
    flagged: false,
    deleted: false,
    searchterms: null
  },


  //**************************************************************************//
  // Initialization & Destruction

  init: function() {
    // Only for sidebar collections tree in list view.
    if (!this._listToolbar.hasAttribute("hidden"))
      this._toggleListToolbarButton.setAttribute("checked", true);

    this.Filters["unread"] = document.getElementById("snowlUnreadButton").
                                      checked ? true : false;
    this.Filters["flagged"] = document.getElementById("snowlFlaggedButton").
                                      checked ? true : false;
    this.Filters["deleted"] = document.getElementById("snowlShowDeletedButton").
                                      checked ? true : false;
    if (this.Filters["deleted"])
      document.getElementById("snowlPurgeDeletedButton").removeAttribute("disabled");
    else
      document.getElementById("snowlPurgeDeletedButton").setAttribute("disabled", true);

    // Restore persisted view selection (need to build the menulist) or init.
    let selIndex = parseInt(this._collectionsViewMenu.getAttribute("selectedindex"));
    if (selIndex >= 0) {
      this.onPopupshowingCollectionsView();
      this._collectionsViewMenu.selectedIndex = selIndex;
    }
    else {
      this._collectionsViewMenu.setAttribute("selectedindex", 0); // "default"
      this._collectionsViewMenu.selectedIndex = 0;
    }

    // Set the view, which sets the Places query on the collections tree and
    // restores the selection.
    this.onCommandCollectionsView(this._collectionsViewMenu.value);

    this.loadObservers();

    // Get collections and convert to places tree - one time upgrade
    // XXX move this to datastore.js module
    if (!SnowlPlaces._placesConverted &&
        SnowlPlaces._placesInitialized &&
        SnowlPlaces._placesConverted != null) {

      gMessageViewWindow.XULBrowserWindow.
                         setOverLink(strings.get("rebuildPlacesStarted"));
      let titleMsg = strings.get("rebuildPlacesTitleMsg");
      let dialogMsg = strings.get("rebuildPlacesDialogMsg");
      SnowlService._promptSvc.alert(window, titleMsg, dialogMsg);

      this.buildPlacesDatabase();
    }
  },

  loadObservers: function() {
    Observers.add("snowl:source:added",       this.onSourceAdded,       this);
    Observers.add("snowl:message:added",      this.onMessageAdded,      this);
    Observers.add("snowl:source:unstored",    this.onSourceRemoved,     this);
    Observers.add("snowl:messages:completed", this.onMessagesCompleted, this);
    Observers.add("itemchanged",              this.onItemChanged,       this);
    Observers.add("snowl:author:removed",     this.onAuthorRemoved,     this);
//this._log.info("loadObservers");
  },

  unloadObservers: function() {
    Observers.remove("snowl:source:added",       this.onSourceAdded,       this);
    Observers.remove("snowl:message:added",      this.onMessageAdded,      this);
    Observers.remove("snowl:source:unstored",    this.onSourceRemoved,     this);
    Observers.remove("snowl:messages:completed", this.onMessagesCompleted, this);
    Observers.remove("itemchanged",              this.onItemChanged,       this);
    Observers.remove("snowl:author:removed",     this.onAuthorRemoved,     this);
//this._log.info("unloadObservers");
  },


  //**************************************************************************//
  // Event & Notification Handlers

  onSourceAdded: function(aPlaceID) {
//this._log.info("onSourceAdded: curIndex:curSelectedIndex = "+
//  this._tree.currentIndex+" : "+this._tree.currentSelectedIndex);
    // Newly subscribed source has been added to places, select the inserted row.
    // The effect of selecting here is that onMessageAdded will trigger a view
    // refresh for each message, so messages pop into the view as added.
    this._tree.currentSelectedIndex = -1;
    setTimeout(function() {
      let viewItemIds = CollectionsView.itemIds;
      CollectionsView._tree.restoreSelection([aPlaceID]);
      if (CollectionsView._tree.view.selection.count == 0) {
        // If not in a view that shows Sources, hence nothing selected, restore
        // the view to its current state, as selectItems will clear it.
        CollectionsView._tree.restoreSelection(viewItemIds);
      }
    }, 30)
  },

  onMessageAdded: function(message) {
    // If source or author of new message is currently selected in the
    // collections list, refresh view.  This observer exists for both list and
    // river and selections may be different.
    if (this.isMessageForSelectedCollection(message)) {
      gMessageViewWindow.SnowlMessageView.onMessageAdded(message);
    }
  },

  onMessagesCompleted: function(aSourceId) {
    // Source refresh completed, refresh tree.
    this._tree.treeBoxObject.invalidate();
    // Enable refresh button.
    if (SnowlService.refreshingCount == 0)
      this._refreshButton.removeAttribute("disabled");
    // Disable refresh button.
    if (aSourceId == "refresh")
      this._refreshButton.setAttribute("disabled", true);
  },

  onSourceRemoved: function() {
//this._log.info("onSourceRemoved: curIndex:gMouseEvent - "+
//  this._tree.currentIndex+" : "+SnowlUtils.gMouseEvent);
    if (!this._tree.selectedNode) {
      // Original selected row removed, reset and clear.
      this._tree.currentIndex = -1;
      this.itemIds = -1;
      gMessageViewWindow.SnowlMessageView.onCollectionsDeselect();
      }

    // Source/author remove completed, refresh tree (stats).
    this._tree.treeBoxObject.invalidate();
  },

  onAuthorRemoved: function() {
    // Author remove completed, similar tree reset as for Source.
    this.onSourceRemoved();

    // Re-select the selected collections (for authors removal).
    // XXX: implement this to only reselect if necessary.
//    if (this.isAuthorForSelectedCollection(authorId))
      gMessageViewWindow.SnowlMessageView.onFilter(this.Filters);
  },

  noSelect: false,
  onSelect: function(aEvent) {
//this._log.info("onSelect start: curIndex:gMouseEvent - "+
//  this._tree.currentIndex+" : "+SnowlUtils.gMouseEvent);
    // We want to only select onClick (more precisely, mouseup) for mouse events
    // but need onSelect for key events (arrow keys).  Since onSelect events do
    // not have info on whether mouse or key, we track it ourselves.
    if (this._tree.currentIndex == -1 || SnowlUtils.gMouseEvent)
      return;

    // Don't run if suppressed.
    if (this.noSelect) {
      this.noSelect = false;
      return;
    }

    this.onClick(aEvent);
  },

  onClick: function(aEvent) {
/*
this._log.info("onClick start: curIndex:curSelectedIndex = "+
  this._tree.currentIndex+" : "+this._tree.currentSelectedIndex);
this._log.info("onClick start - gMouseEvent:gRtbutton:modKey = "+
  SnowlUtils.gMouseEvent+" : "+SnowlUtils.gRightMouseButtonDown+" : "+modKey);
this._log.info("onClick: selectionCount = "+this._tree.view.selection.count);
this._log.info("onClick: START itemIds - " +this.itemIds.toSource());
*/
    let modKey = aEvent.metaKey || aEvent.ctrlKey || aEvent.shiftKey;
    SnowlUtils.gMouseEvent = false;

    // Don't run query on twisty click.
    let row = { }, col = { }, obj = { }, rangeFirst = { }, rangeLast = { };;
    this._tree.treeBoxObject.getCellAt(aEvent.clientX, aEvent.clientY, row, col, obj);
    if (obj.value == "twisty") {
      return;
    }

    // Don't run query on right click, or already selected row (unless deselecting).
    if (SnowlUtils.gRightMouseButtonDown || this._tree.currentIndex == -1 ||
        (this._tree.view.selection.count == 1 && !modKey &&
         this._tree.currentIndex == this._tree.currentSelectedIndex))
      return;

    // Check this here post rt click.
    let isBookmark = this.isBookmark();

    // If mod key deselected, reset currentIndex and redo query.
    if (modKey && !this._tree.view.selection.isSelected(this._tree.currentIndex))
      this._tree.currentIndex = -1;

    // If multiselection, reset currentSelectedIndex so subsequent click will
    // select on any previously selected row.
    if (this._tree.view.selection.count > 1)
      this._tree.currentSelectedIndex = -1;
    else
      this._tree.currentSelectedIndex = this._tree.currentIndex;

    // Mod key click will deselect a row; for a 0 count notify view to clear if
    // not in a search.
    if (this._tree.view.selection.count == 0) {
      this._tree.currentSelectedIndex = -1;
      this.itemIds = -1;
      let searchCols = this._searchFilter.getAttribute("searchtype") == "collections";
      let searchEmpty = this._searchFilter.getAttribute("empty") == "true";
      if (!isBookmark && (searchCols || searchEmpty)) {
        gMessageViewWindow.SnowlMessageView.onCollectionsDeselect();
        return;
      }
    }

    // See if it can be opened like a bookmark.
    if (isBookmark) {
      this.itemIds = -1;
      if (!modKey && (aEvent.keyCode == KeyEvent.DOM_VK_RETURN || aEvent.button == 0))
        goDoCommand('placesCmd_open');
      return;
    }

    if (!modKey && this.itemIds != -1)
      // Unset new status for (about to be) formerly selected collection(s).
      this.markCollectionNewState();

    // Get constraints based on selected rows
    let constraints = this.getSelectionConstraints();

    if (!constraints) {
      gMessageViewWindow.SnowlMessageView.onCollectionsDeselect();
      return;
    }

    if (this._searchFilter.value)
      // Switching selection while in search, show busy.
      this._searchButton.parentNode.setBusy(true);

    let collection = new SnowlCollection(null,
                                         name,
                                         null, 
                                         constraints,
                                         null);
    gMessageViewWindow.SnowlMessageView.setCollection(collection, this.Filters);
  },

  onCollectionsTreeMouseDown: function(aEvent) {
    SnowlUtils.onTreeMouseDown(aEvent);
  },

  onTreeContextPopupHidden: function(aEvent) {
    SnowlUtils.RestoreSelection(aEvent, this._tree);
  },

  onSubscribe: function() {
    SnowlService.gBrowserWindow.Snowl.onSubscribe();
  },

  onRefresh: function() {
    this._refreshButton.setAttribute("disabled", true);
    SnowlService.refreshAllSources();
  },

  onToggleListToolbar: function(aEvent) {
    aEvent.target.checked = !aEvent.target.checked;
    if (this._listToolbar.hasAttribute("hidden"))
      this._listToolbar.removeAttribute("hidden");
    else
      this._listToolbar.setAttribute("hidden", true);
  },

  onSearch: function(aValue) {
    let searchType = this._searchFilter.getAttribute("searchtype");
//    let searchTypeRE = this._searchFilter.getAttribute("searchtype");
//    let searchRE = searchType == "subject" ||
//                   searchType == "sender" ||
//                   searchType == "headers" ||
//                   searchType == "messages";
    let searchMsgsFTS = searchType == "messages";
    let searchCols = searchType == "collections";

    // Edit check routine.
    let term, terms = [], filterTerms = [];
    let quotes = aValue.match(/^"|[^\\]"/g);
    let quotesClosed = (!quotes || quotes.length%2 == 0) ? true : false;
//    let quotesEscaped = aValue.match(/\\"/g);
//    let quotesClosedEscaped = (!quotesEscaped || quotesEscaped.length%2 == 0) ? true : false;
    let oneNegation = false;
    // XXX: It would be nice to do unicode properly, \p{L} - Bug 258974.
    let invalidInitial = new RegExp("^[^\"\\w\\u0080-\\uFFFF]|\\\|(?=\\s*[\|\-])+|\~(?!\\d(?=$|\\s)|\\s|$)");
    let invalidNegation = new RegExp("\-.*[^\\w\\u0080-\\uFFFF]");
    let invalidUnquoted = new RegExp("^[^\-|\~|\\w\\u0080-\\uFFFF]{1}?|.(?=[^\\w\\u0080-\\uFFFF])");
    let invalidQuoted = new RegExp("\"(?=[^\'\\w\\u0080-\\uFFFF])");

    if (aValue.match(/[^\\]""/g) ||
        (aValue != "" && (searchMsgsFTS && aValue.match(invalidInitial))) ||
        (searchMsgsFTS && !quotesClosed &&
         aValue.substr(aValue.lastIndexOf("\""), aValue.length).
                search(invalidQuoted) != -1)) {
      this._searchFilter.setAttribute("invalid", true);
      return false;
    }
this._log.info("onSearch: aValue - "+ aValue);

    // Negation - is its own term for messages, included in term for headers.
    terms = searchMsgsFTS ? aValue.match("[^\\s\"']+|\"[^\"]*\"*|'[^']*'*", "g") :
                            aValue.match(/(-?"(?:[^\\"]+|\\.)*?"|\S+)/g);
//                            aValue.match("(-?\"[^\"]+\"|[^\"\\s]+)", "g");
this._log.info("onSearch: terms - "+ terms);
this._log.info("onSearch: quotesClosed - "+ quotesClosed);

    while (terms && (term = terms.shift())) {
this._log.info("onSearch: term - "+ term);
      if (searchMsgsFTS) {
        // SQLite FTS based search.
        if (term.match(/\"/g)) {
          // Quoted term: invalid if already have negation term; cannot be empty
          // or end in space(s); cannot start with space(s) or invalid chars.
          if (oneNegation || term.match(/[\s\"](?=")/g) || term.match(invalidQuoted)) {
            this._searchFilter.setAttribute("invalid", true);
            return false;
          }
        }
        else {
          // Unquoted term: invalid if already have negation term; | term cannot
          // lead a term and must be standalone; must start with valid chars and
          // cannot contain invalid chars.
          if (oneNegation || term.match(/\|(?=\S)/) || term.match(invalidUnquoted)) {
            this._searchFilter.setAttribute("invalid", true);
            return false;
          }

          // Negation: can only have one negation term and it must be the last
          // term (error on rest of search string ending in space indicates this)
          // and cannot contain invalid chars.
          if (term[0] == "-") {
            oneNegation = true;
            if (aValue.substr(aValue.lastIndexOf("\-"), aValue.length).
                                     search(invalidNegation) > -1) {
              this._searchFilter.setAttribute("invalid", true);
              return false;
            }
          }

          if (term == "|")
            // Unquoted | means OR.  We do not use OR because it is 1)twice the
            // typing, 2)english-centric.
            term = "OR"
          else if (term[0] == "~")
            // Unquoted ~ means NEAR.  We do not use NEAR because it is 1)4x the
            // typing, 2)english-centric.
            term = "NEAR" + (term[1] ? "/" + term[1] : "");
          else
            // Add asterisk to non quoted term for sqlite fts non-exact match.
            term = SnowlUtils.appendAsterisks(term);
        }
      }
      else {
//this._log.info("onSearch: quotesClosed - "+ quotesClosed);
        // Regex based search.
        if (!quotesClosed)
          return false;

        // At least one negation term, all subsequent negation terms must follow
        // each other and come at the end of the search string.
        if (term[0] == "-")
          oneNegation = true;

        // Term: invalid if already have negation term and this term is not also
        // a negation term; NEAR ~ invalid.
        if ((oneNegation && !term.match(/^[-|]/)) ||
            term[0] == "~") {
          this._searchFilter.setAttribute("invalid", true);
          return false;
        }

        if (term == "|")
          // Unquoted | means OR.  We do not use OR because it is 1)twice the
          // typing, 2)english-centric.
          term = "OR"
      }

      filterTerms.push(term);
    }

    this._searchFilter.removeAttribute("invalid");

    if (aValue.charAt(aValue.length - 1).match(/\s|\||\~/) ||
//        aValue.match(/^[-\\]$/) ||
        (aValue.charAt(aValue.length - 1).match(/-/) &&
         aValue.charAt(aValue.length - 2).match(/\s/)) ||
        (aValue.charAt(aValue.length - 1).match(/\d/) &&
         aValue.charAt(aValue.length - 2).match(/\~/)) ||
//        (aValue.charAt(aValue.length - 1).match(/\\/) &&
//         aValue.charAt(aValue.length - 2).match(/\s|-/)) ||
        !quotesClosed)
      // Don't run search on a space, or OR |, or negation -, or unclosed quote ",
      // or NEAR ~ number, or \ for escaped quotes.
      return false;

    this._searchButton.parentNode.setBusy(true);

    // Save string.
    if (searchMsgsFTS)
      this.Filters["searchterms"] = aValue ? filterTerms.join(" ") : null;

    // Post edit check processing for regex terms string.
    else {
      let regexTerms = [];
this._log.info("onSearch: searchRE filterTerms - "+ filterTerms);

      // Array for highlighter.
      this.Filters["searchterms"] = aValue ? filterTerms : null;

      for each (term in filterTerms)
        // Extra special handling to escape \ unless it escapes a "; escape
        // special chars; remove leading "; remove last quote " making sure to
        // preserve negation and escaped quotes; unescape escaped quotes \".
        regexTerms.push(term.replace(/(\\)(?=[^"]|$)/g, "\\\\\\$1").
                             replace(/([.^$*+?&<>()[{}|\]])/g, "\\$1").
                             replace(/^"/, "").
                             replace(/(-?"|[^\\])"/g, "$1").
                             replace(/\\"/g, '"'));
this._log.info("onSearch: searchRE regexTerms - "+ regexTerms);

      // Unquoted array for regex.
      SnowlDatastore._dbRegexp.termsArray = regexTerms;
    }

//this._log.info("onSearch: this.Filters[searchterms] - "+ this.Filters["searchterms"]);

    if (aValue) {
      if (searchCols)
        // Search collections.  Do this on a timeout to allow css to decorate
        // throbber.
        setTimeout(function() {
          CollectionsView.searchCollections(aValue);
        }, 0)
      else
        // Search selected or 'All Messages' if no explicit selection.
        gMessageViewWindow.SnowlMessageView.onFilter(this.Filters);
    }
    else {
      if (searchCols){
        // Reset the collections tree.
        this._tree.place = this._tree.place;
        this.noSelect = true;
        this._tree.restoreSelection();
        this._searchButton.parentNode.setBusy(false);
      }
      else {
        // TODO: Clear highlights, if any, in bf cache.
        let browserWin = gMessageViewWindow.gBrowser.contentWindow;
        browserWin.wrappedJSObject.messageHeaderUtils.higlightClear();

        if (this.itemIds == -1)
          // If no selection and clearing searchbox, clear list (don't select 'All').
          gMessageViewWindow.SnowlMessageView.onCollectionsDeselect();
        else
          // Re-select the selected collections.
          gMessageViewWindow.SnowlMessageView.onFilter(this.Filters);
      }
    }
  },

  onSearchIgnoreCase: function(aChecked) {
    SnowlDatastore._dbRegexp.ignoreCase = aChecked;
  },

  onSearchHelp: function() {
    openDialog("chrome://snowl/content/searchHelp.xul",
               "title",
               "chrome,dialog,resizable=yes");
  },

  onCommandUnreadButton: function(aEvent) {
    // Unfortunately, css cannot be used to hide a treechildren row using
    // properties and pseudo element selectors.
    aEvent.target.checked = !aEvent.target.checked;
    this.Filters["unread"] = aEvent.target.checked ? true : false;

    if (this.itemIds == -1 && !this.Filters["unread"] && !this.Filters["flagged"] &&
        !this.Filters["deleted"] && !this.Filters["searchterms"])
      // If no selection and unchecking, clear list (don't select 'All').
      gMessageViewWindow.SnowlMessageView.onCollectionsDeselect();
    else
      gMessageViewWindow.SnowlMessageView.onFilter(this.Filters);
  },

  onCommandFlaggedButton: function(aEvent) {
    aEvent.target.checked = !aEvent.target.checked;
    this.Filters["flagged"] = aEvent.target.checked ? true : false;

    if (this.itemIds == -1 && !this.Filters["unread"] && !this.Filters["flagged"] &&
        !this.Filters["deleted"] && !this.Filters["searchterms"])
      // If no selection and unchecking, clear list (don't select 'All').
      gMessageViewWindow.SnowlMessageView.onCollectionsDeselect();
    else
      gMessageViewWindow.SnowlMessageView.onFilter(this.Filters);
  },

  onCommandShowDeletedButton: function(aEvent) {
    aEvent.target.checked = !aEvent.target.checked;
    this.Filters["deleted"] = aEvent.target.checked ? true : false;

    if (this.Filters["deleted"])
      document.getElementById("snowlPurgeDeletedButton").removeAttribute("disabled");
    else
      document.getElementById("snowlPurgeDeletedButton").setAttribute("disabled", true);

    if (this.itemIds == -1 && !this.Filters["deleted"] &&
        !this.Filters["unread"] && !this.Filters["searchterms"])
      // If no selection and unchecking, clear list (don't select 'All').
      gMessageViewWindow.SnowlMessageView.onCollectionsDeselect();
    else
      gMessageViewWindow.SnowlMessageView.onFilter(this.Filters);
  },

  onCommandPurgeDeletedButton: function(aEvent) {
    let deleteAllShowing = true;
    gMessageViewWindow.SnowlMessageView.onDeleteMessages(deleteAllShowing);
  },

  _resetCollectionsView: true,
  onPopupshowingCollectionsView: function(event) {
    // Build dynamic Views list.
    var list, queryVal, title, baseItemId, menuItem;

    // Rebuild first time or only if item added or removed, to maintain selection.
    if (!this._resetCollectionsView)
      return;

    while (this._collectionsViewMenuPopup.hasChildNodes() &&
        this._collectionsViewMenuPopup.lastChild.id != "collectionVewMenuSep")
      this._collectionsViewMenuPopup.removeChild(this._collectionsViewMenuPopup.lastChild);

    list = PlacesUtils.annotations
                      .getItemsWithAnnotation(SnowlPlaces.SNOWL_USER_VIEWLIST_ANNO, {});
    for (var i=0; i < list.length; i++) {
      // Parent has to be systemID otherwise get dupes if shortcut folders copied..
      if (PlacesUtils.bookmarks.
                      getFolderIdForItem(list[i]) != SnowlPlaces.collectionsSystemID)
        continue;

      queryVal = PlacesUtils.annotations.
                             getItemAnnotation(list[i],
                                               SnowlPlaces.SNOWL_USER_VIEWLIST_ANNO);

      title = PlacesUtils.bookmarks.getItemTitle(list[i]);
      baseItemId = queryVal;
      menuItem = document.createElement("menuitem");
      menuItem.setAttribute("label", title);
      menuItem.setAttribute("value", baseItemId);
      this._collectionsViewMenuPopup.appendChild(menuItem);
    }

    if (SnowlPlaces.collectionsAuthorsID == -1)
      document.getElementById("collectionVewAuthor").hidden = true;
    else
      document.getElementById("collectionVewAuthor").hidden = false;

    if (this._collectionsViewMenuPopup.lastChild.id == "collectionVewMenuSep")
      this._collectionsViewMenuPopup.lastChild.hidden = true;
    else
      document.getElementById("collectionVewMenuSep").hidden = false;

    this._resetCollectionsView = false;
  },

  onCommandCollectionsView: function(value) {
    // View is a predefined system view, or else a custom view.  The |value| is
    // the Places itemId for the view base folder (ie not the shortcut).
    this._collectionsViewMenu.setAttribute("selectedindex",
                                           this._collectionsViewMenu.selectedIndex);
    switch (value) {
      case "default":
        this._tree.place = SnowlPlaces.queryDefault + SnowlPlaces.collectionsSystemID;
        break;
      case "sources":
        this._tree.place = SnowlPlaces.querySources + SnowlPlaces.collectionsSourcesID;
        break;
      case "authors":
        this._tree.place = SnowlPlaces.queryAuthors + SnowlPlaces.collectionsAuthorsID;
        break;
      default:
        // Menu must built with correct itemId values.
        this._tree.place = SnowlPlaces.queryCustom + parseInt(value);
        break;
    }
    this._tree.restoreSelection();
    this._tree.focus();
  },

  onItemChanged: function(aItemChangedObj) {
//this._log.info("onItemChanged: start itemId - "+aItemChangedObj.itemId);
      switch (aItemChangedObj.property) {
        case "title":
          // Here if notified of a title rename, either View or source/author,
          // which require special updates; others updated via places mechanisms.
//this._log.info("onItemChanged: title - "+aItemChangedObj.title);
          if (aItemChangedObj.type == "view")
            this.updateViewNames(aItemChangedObj);
          if (aItemChangedObj.type == "collection")
            this.updateCollectionNames(aItemChangedObj);
          break;
        default:
          break;
      }
  },

  refreshSource: function() {
    let selectedSources = [];

    // XXX: Multiselection?
    let selectedSource =
        this._tree.view.nodeForTreeIndex(this._tree.currentSelectedIndex);
    // Create places query object from tree item uri
    let query = new SnowlQuery(selectedSource.uri);
    if (!query.queryTypeSource)
      return;

    selectedSources.push(SnowlService.sourcesByID[query.queryID]);
    SnowlService.refreshAllSources(selectedSources);
  },

  markCollectionRead: function() {
    // Mark all selected source/author collection messages as read.  Other than
    // system collections, descendants of a folder level selection are not
    // included and must be multiselected.
    let sources = [], authors = [], query, all = false;

    let selectedNodes = this._tree.getSelectionNodes();
    for (let i=0; i < selectedNodes.length && !all; i++) {
      // Create places query object from tree item uri
      query = new SnowlQuery(selectedNodes[i].uri);
      if (query.queryFolder == SnowlPlaces.collectionsSystemID ||
          query.queryFolder == SnowlPlaces.collectionsSourcesID ||
          query.queryFolder == SnowlPlaces.collectionsAuthorsID) {
        all = true;
        break;
      }
      if (query.queryTypeSource && sources.indexOf(query.queryID, 0) < 0)
        sources.push(query.queryID);
      if (query.queryTypeAuthor && authors.indexOf(query.queryID, 0) < 0)
        authors.push(query.queryID);
    }

    query = "";
    if (!all) {
      if (sources.length > 0)
        query += "sourceID = " + sources.join(" OR sourceID = ");
      if (authors.length > 0) {
        if (sources.length > 0)
          query += " OR ";
        query += "authorID IN (SELECT id FROM identities " +
                 "             WHERE personID IN ( " + authors + " ))";
      }

      query = query ? "( " + query + " ) AND " : null;
    }

    if (query != null) {
      SnowlDatastore.dbConnection.executeSimpleSQL(
          "UPDATE messages SET read = " + MESSAGE_READ +
          " WHERE " + query +
          " (read = " + MESSAGE_UNREAD + " OR read = " + MESSAGE_NEW + ")");

      gMessageViewWindow.SnowlMessageView.onFilter(this.Filters);
      // Clear the collections stats cache and invalidate tree to rebuild.
      SnowlService._collectionStatsByCollectionID = null;
      this._tree.treeBoxObject.invalidate();
    }
  },

  markCollectionNewState: function() {
    // Mark all selected source/author collection messages as not new (unread)
    // upon the collection being no longer selected.  Note: shift-click on a
    // collection will leave new state when unselected.
    let itemId, uri, query, collID, nodeStats, all = false;
    let sources = [], authors = [];
    let itemIds = this.itemIds;
    let currentIndexItemId =
        this._tree.view.nodeForTreeIndex(this._tree.currentIndex).itemId

    for each (itemId in itemIds) {
      // If selecting item currently in selection, leave as new.
      if (itemId == currentIndexItemId)
        continue;

      // Create places query object from places item uri.
      try {
        uri = PlacesUtils.bookmarks.getBookmarkURI(itemId).spec;
      } catch (ex) { continue;} // Not a query item.

      query = new SnowlQuery(uri);
      if (query.queryFolder == SnowlPlaces.collectionsSystemID ||
          query.queryFolder == SnowlPlaces.collectionsSourcesID ||
          query.queryFolder == SnowlPlaces.collectionsAuthorsID) {
        all = true;
        break;
      }

      collID = query.queryTypeSource ? "s" + query.queryID :
               query.queryTypeAuthor ? "a" + query.queryID :
              (query.queryFolder == SnowlPlaces.collectionsSystemID ||
               query.queryFolder == SnowlPlaces.collectionsSourcesID ||
               query.queryFolder == SnowlPlaces.collectionsAuthorsID) ? "all" : null;
      nodeStats = SnowlService.getCollectionStatsByCollectionID()[collID];
      if (!nodeStats || nodeStats.n == 0)
        // No new messages in this collection, go on.
        continue;

      if (query.queryTypeSource && sources.indexOf(query.queryID, 0) < 0)
        sources.push(query.queryID);
      if (query.queryTypeAuthor && authors.indexOf(query.queryID, 0) < 0)
        authors.push(query.queryID);
    }

    query = "";
    if (!all) {
      if (sources.length > 0)
        query += "sourceID = " + sources.join(" OR sourceID = ");
      if (authors.length > 0) {
        if (sources.length > 0)
          query += " OR ";
        query += "authorID IN (SELECT id FROM identities " +
                 "             WHERE personID IN ( " + authors + " ))";
      }

      query = query ? "( " + query + " ) AND " : null;
    }

    if (query != null) {
      SnowlDatastore.dbConnection.executeSimpleSQL(
          "UPDATE messages SET read = " + MESSAGE_UNREAD +
          " WHERE " + query + "read = " + MESSAGE_NEW);

      // Clear the collections stats cache and invalidate tree to rebuild.
      SnowlService._collectionStatsByCollectionID = null;
      this._tree.treeBoxObject.invalidate();
    }
  },

  setRefreshStatus: function(aStatus, aAll) {
    // aStatus is 'paused' or 'active' or 'disabled'.
    let source, sourceID, selectedSource, selectedSourceIDs = [];
    if (aAll) {
      for each (source in SnowlService.sourcesByID) {
        source.attributes.refresh["status"] = aStatus;
        source.persistAttributes();
        SnowlService.sourcesByID[source.id].attributes.refresh["status"] = aStatus;
      }
    }
    else {
      // Single selection pause/resume refresh of source for now.
      selectedSource = this._tree.view.nodeForTreeIndex(this._tree.currentSelectedIndex);
      let query = new SnowlQuery(selectedSource.uri);
  
      if (!query.queryTypeSource)
        return;
  
      selectedSourceIDs.push(query.queryID);
  
      // Delete loop here, if multiple selections..
      for (let i = 0; i < selectedSourceIDs.length; ++i) {
        source = SnowlService.sourcesByID[selectedSourceIDs[i]];
        source.attributes.refresh["status"] = aStatus;
        source.persistAttributes();
        SnowlService.sourcesByID[source.id].attributes.refresh["status"] = aStatus;
      }
    }

    // Refresh tree.
    this._tree.treeBoxObject.invalidate();
  },

  removeSource: function() {
    // Need to confirm.
    let titleMsg = strings.get("removeSourceTitleMsg");
    let dialogMsg = strings.get("removeSourceDialogMsg");
    if (!SnowlService._promptSvc.confirm(window, titleMsg, dialogMsg))
      return;

    // Single selection removal of source for now; all messages, authors, and the
    // subscription are permanently removed.
    let source, sourceID, selectedSourceIDs = [];
    let selectedSource = this._tree.view.nodeForTreeIndex(this._tree.currentSelectedIndex);
    let query = new SnowlQuery(selectedSource.uri);

    if (!query.queryTypeSource)
      return;

    selectedSourceIDs.push([query.queryID, query.queryUri]);

    // Delete loop here, if multiple selections..
    for (let i = 0; i < selectedSourceIDs.length; ++i) {
      sourceID = selectedSourceIDs[i][0];
      source = SnowlService.sourcesByID[sourceID];
      this._log.info("removeSource: Removing source - " +
                     sourceID + " : " + (source ? source.name : selectedSourceIDs[i][1]));
      if (source)
        source.unstore();
      else
        // Places record, but no db record; clean up Places bookmarks with
        // sourceID in its prefixed uri.
        SnowlPlaces.removePlacesItemsByURI("snowl:sId=" + sourceID, true);
    }

    // Clear the collections stats cache and invalidate tree to rebuild.
    SnowlService._collectionStatsByCollectionID = null;
    Observers.notify("snowl:source:unstored");
  },

  removeAuthor: function() {
    // Need to confirm.
    let titleMsg = strings.get("removeAuthorTitleMsg");
    let dialogMsg = strings.get("removeAuthorDialogMsg");
    if (!SnowlService._promptSvc.confirm(window, titleMsg, dialogMsg))
      return;

    // Removing an author permanently purges all of the author's messages (they
    // do not go into a deleted status).
    let sourceNode, personID, sourceID;
    let selectedSourceNodeID = [];
    let selectedSourceNodesIDs = [];

    // XXX: Multiselection?

    let selectedSource =
        this._tree.view.nodeForTreeIndex(this._tree.currentSelectedIndex);
    // Create places query object from tree item uri
    let query = new SnowlQuery(selectedSource.uri);

    if (!query.queryTypeAuthor)
      return;

    this._log.info("removeAuthor: Removing author - " +
                   selectedSource.title + " : " + selectedSource.itemId);
    selectedSourceNodeID = [selectedSource, query.queryID, query.querySourceID];
    selectedSourceNodesIDs.push(selectedSourceNodeID);

    // Delete loop here, if multiple selections..
    for (let i = 0; i < selectedSourceNodesIDs.length; ++i) {
      sourceNode = selectedSourceNodesIDs[i][0];
      personID = selectedSourceNodesIDs[i][1];
      sourceID = selectedSourceNodesIDs[i][2];
      SnowlDatastore.dbConnection.beginTransaction();
      try {
        // Delete messages
        SnowlDatastore.dbConnection.executeSimpleSQL("DELETE FROM partsText " +
            "WHERE docid IN " +
            "(SELECT id FROM parts WHERE messageID IN " +
            "(SELECT id FROM messages WHERE authorID IN " +
            "(SELECT id FROM identities WHERE personID = " + personID + ")))");
        SnowlDatastore.dbConnection.executeSimpleSQL("DELETE FROM parts " +
            "WHERE messageID IN " +
            "(SELECT id FROM messages WHERE authorID IN " +
            "(SELECT id FROM identities WHERE personID = " + personID + "))");
        SnowlDatastore.dbConnection.executeSimpleSQL("DELETE FROM messages " +
            "WHERE authorID IN " +
            "(SELECT id FROM identities WHERE personID = " + personID + ")");
        // Delete people/identities
        SnowlDatastore.dbConnection.executeSimpleSQL("DELETE FROM identities " +
            "WHERE personID = " + personID);
        SnowlDatastore.dbConnection.executeSimpleSQL("DELETE FROM people " +
            "WHERE id = " + personID);

        // Finally, clean up Places bookmark by author's place itemId.  Remove
        // authors that may have been placed in custom folders, as their messages
        // won't be there anymore.
        SnowlPlaces.removePlacesItemsByURI("snowl:sId=" + sourceID +
                                           "&a.id=" + personID + "&", true);
//        PlacesUtils.bookmarks.removeItem(sourceNode.itemId);

        SnowlDatastore.dbConnection.commitTransaction();
      }
      catch(ex) {
        SnowlDatastore.dbConnection.rollbackTransaction();
        throw ex;
      }
    }

    // Clear the collections stats cache and notify.
    SnowlService._collectionStatsByCollectionID = null;
    Observers.notify("snowl:author:removed");
  },

  newView: function() {
    // The ip is only in the default view, so appending the new custom view
    // shortcut at the bottom will only be visible there, although the action is
    // performed in any view.  Need to have all this to pass a 'mode'..
    let title = strings.get("newViewTitle");
    let ip = new InsertionPoint(SnowlPlaces.collectionsSystemID,
                                SnowlPlaces.DEFAULT_INDEX,
                                Ci.nsITreeView.DROP_ON);
    let info = {
      action: "add",
      type: "folder",
      hiddenRows: ["folderPicker"],
      title: title,
      defaultInsertionPoint: ip,
      mode: "view"
    };

    let dialogURL = "chrome://browser/content/places/bookmarkProperties2.xul";
    let features = "centerscreen,chrome,dialog,resizable,modal";
    window.openDialog(dialogURL, "",  features, info);

    if ("performed" in info && info.performed) {
      // Select the new item.
//      let insertedNodeId = PlacesUtils.bookmarks
//                                      .getIdForItemAt(ip.itemId, ip.index);
//      this._tree.selectItems([insertedNodeId], false);
      this._resetCollectionsView = true;
    }
  },

  removeView: function() {
    // Need to confirm.
    let titleMsg = strings.get("removeViewTitleMsg");
    let dialogMsg = strings.get("removeViewDialogMsg");
    if (!SnowlService._promptSvc.confirm(window, titleMsg, dialogMsg))
      return;

    if (this._tree.selectedNode) {
      let removeNode =
          this._tree.view.nodeForTreeIndex(this._tree.currentSelectedIndex);
      let scItem = removeNode.itemId;
      let uri = removeNode.uri;
      let query = new SnowlQuery(uri);
      let baseItem = query.queryFolder;

      if (baseItem)
        PlacesUtils.bookmarks.removeItem(baseItem);

      if (scItem) {
        // Removing a shortcut bookmark does not remove its history uri entry
        // (in moz_places), so remove it like this.  Cannot use removePage since
        // it explicitly excludes 'place:' uris.
        // XXX: commented out since Places autodeletes these records, but only
        // on restart.
//        let PlacesDB = Cc["@mozilla.org/browser/nav-history-service;1"].
//                       getService(Ci.nsPIPlacesDatabase);
//        PlacesDB.DBConnection.executeSimpleSQL(
//            "DELETE FROM moz_places WHERE id = " +
//            "(SELECT fk FROM moz_bookmarks WHERE id = " + scItem + " )");

        PlacesUtils.bookmarks.removeItem(scItem);
      }
  
      this._resetCollectionsView = true;
    }
  },

  updateViewNames: function(aRenameObj) {
    // Bug 482978: need to reset tree on rename of folder shortcut, and it must
    // be in a thread or setCellText loops since the node's title is not reset.
    setTimeout(function() {
      CollectionsView._tree.place = CollectionsView._tree.place;
      CollectionsView._tree.restoreSelection();
    }, 0)

    // Reflect folder shortcut name change in the View structure.
    let newTitle = aRenameObj.title;

    // Update base folder name.
    let baseFolderId = PlacesUtils.annotations.
                                   getItemAnnotation(aRenameObj.itemId,
                                                     SnowlPlaces.SNOWL_USER_VIEWLIST_ANNO)
    var txn = PlacesUIUtils.ptm.editItemTitle(baseFolderId,
                                              "snowlUserView:" + newTitle);
    PlacesUIUtils.ptm.doTransaction(txn);

    // Force rebuild of View menulist for the new name.
    this._resetCollectionsView = true;
  },

  updateCollectionNames: function(aRenameObj) {
    // Source or Author name change.  The 'name' field is updated in the people
    // table for Authors; the externalID in identities table continues to identify
    // the unique author as sent by the source, either by name or email.
    let newTitle = aRenameObj.title.replace(/\'/g, "''");
    let uri = aRenameObj.uri;
    let query = new SnowlQuery(uri);
    let table = query.queryTypeSource ? "sources" :
                query.queryTypeAuthor ? "people" : null;

    if (table) {
      SnowlDatastore.dbConnection.executeSimpleSQL(
        "UPDATE " + table +
        " SET    name = '" + newTitle +
        "' WHERE   id = " + query.queryID);

      if (query.queryTypeSource)
        // Invalidate sources cache.
        SnowlService.onSourcesChanged();

      // Redo list so new name is reflected.
      gMessageViewWindow.SnowlMessageView.onFilter(this.Filters);
    }
  },

  searchCollections: function(aSearchString) {
    // XXX: Bug 479903, place queries have no way of excluding search in uri,
    // which may not be meaningful for our usage.
    let searchFolders = [];
    let view = this._collectionsViewMenu.value;
    if (view && view != "default")
      // Limit search to authors/sources/custom if that view selected, else all.
      searchFolders = view == "sources" ? [SnowlPlaces.collectionsSourcesID] :
                      view == "authors" ? [SnowlPlaces.collectionsAuthorsID] :
                                          [parseInt(view)];
    else {
      // XXX Get selected items and search only those
      searchFolders = [SnowlPlaces.collectionsSystemID];
    }

//    if (!aSearchString)
//      this._tree.place = this._tree.place;
//    else {
      this._tree.applyFilter(aSearchString, searchFolders);
      this._searchButton.parentNode.setBusy(false);
//    }
  },

  isMessageForSelectedCollection: function(aMessage) {
    // Determine if source or author of new message is currently selected in the
    // collections list.
    // XXX: see if there is a Places event/mechanism we can use instead?
    let query, uri, rangeFirst = { }, rangeLast = { }, refreshFlag = false;
    let numRanges = this._tree.view.selection.getRangeCount();

    if (this.Filters["deleted"])
      // Don't refresh if showing deleted for selected collection.
      return refreshFlag;

    for (let i = 0; i < numRanges && !refreshFlag; i++) {
      this._tree.view.selection.getRangeAt(i, rangeFirst, rangeLast);
      for (let index = rangeFirst.value; index <= rangeLast.value; index++) {
        uri = this._tree.view.nodeForTreeIndex(index).uri;
        query = new SnowlQuery(uri);
        if ((query.queryTypeSource && query.queryID == aMessage.source.id) ||
            (query.queryTypeAuthor && query.queryID == (aMessage.author ?
                                                        aMessage.author.person.id :
                                                        null)) ||
            // Collection folders that return all records
            query.queryFolder == SnowlPlaces.collectionsSystemID)
          refreshFlag = true;
      }
    }

    return refreshFlag;
  },

  isBookmark: function() {
    // Determine if a uri that can be passed to url opener, ie a bookmark.
    let query, uri;
    let index = this._tree.currentIndex;
    uri = this._tree.view.nodeForTreeIndex(index).uri;
    query = new SnowlQuery(uri);
    if (query.queryProtocol == "snowl:" || query.queryProtocol == "place:")
      return false;
    else
      return true;
  },

  getSelectionConstraints: function() {
    // Return contraints object based on selected itemIds in the collections
    // tree and persist the list
    let constraints = [], selectedItemIds = [], sources =[], authors = [];
    let node, itemId, uri, rangeFirst = { }, rangeLast = { }, stop = false;
    let numRanges = this._tree.view.selection.getRangeCount();

    for (let i = 0; i < numRanges && !stop; i++) {
      this._tree.view.selection.getRangeAt(i, rangeFirst, rangeLast);
      for (let index = rangeFirst.value; index <= rangeLast.value; index++) {
        node = this._tree.view.nodeForTreeIndex(index);
        itemId = node.itemId;
        selectedItemIds.push(itemId);
        uri = node.uri;
        let query = new SnowlQuery(uri);

        if (query.queryFolder == SnowlPlaces.collectionsSystemID) {
          // Collection folder that returns all records, reset constraints
          // and break.  There may be other such 'system' collections but more
          // likely collections will be rows which are user defined snowl: queries.
//          constraints = [{expression:"sources.id > :zero",
//                          parameters:"0"}];
          constraints = [];
          stop = true;
          break;
        }
        else if (node.hasChildren &&
                 query.queryFolder != SnowlPlaces.collectionsAuthorsID &&
                 query.queryFolder != SnowlPlaces.collectionsSourcesID) {
          // Container: user created folder is selected; get array with query
          // objects, which have properties queryId, groupId.  Only add non
          // dupe ids to list.
          this.getContainerCollectionItemIds(node).forEach(function(itemIdObj) {
            if (itemIdObj.qGroupId == "sources.id" && sources.indexOf(itemIdObj.qId, 0) < 0)
              sources.push(itemIdObj.qId);
            if (itemIdObj.qGroupId == "people.id" && authors.indexOf(itemIdObj.qId, 0) < 0)
              authors.push(itemIdObj.qId);
          })
        }
        else {
          // Non container: single selection.  Only add non dupes.
          if (query.queryTypeSource && sources.indexOf(query.queryID, 0) < 0)
            sources.push(query.queryID);
          if (query.queryTypeAuthor && authors.indexOf(query.queryID, 0) < 0)
            authors.push(query.queryID);
        }
      }
    }

    if (!stop) {
      if (!sources.length && !authors.length)
        constraints = null;
      if (sources.length > 0)
        constraints.push({expression:"sources.id IN",
                          parameters:sources,
                          operator:"OR",
                          type:"ARRAY"});
      if (authors.length > 0)
        constraints.push({expression:"people.id IN",
                          parameters:authors,
                          operator:"OR",
                          type:"ARRAY"});
    }

    this.itemIds = selectedItemIds.length ? selectedItemIds : -1;
    this._log.debug("getSelectionConstraints: constraints = " +
        (constraints ? constraints.toSource() : null));
    this._log.debug("getSelectionConstraints: itemIds = " + this.itemIds);
    return constraints;
  },

  buildContextMenu: function(aPopup) {
    // Additional collections tree contextmenu rules.
    let multiselect = this._tree.currentSelectedIndex == -1 ? true : false;

    if (multiselect) {
      /* Multiselect or no selection */
      document.getElementById("snowlCollectionMarkAllRead").hidden = true;
      document.getElementById("snowlCollectionPauseAllMenuitem").hidden = true;
      document.getElementById("snowlCollectionResumeAllMenuitem").hidden = true;
      document.getElementById("snowlPlacesContextRemoveSourceSep").hidden = true;
    }
    else {
      let selection = this._tree.view.nodeForTreeIndex(this._tree.currentSelectedIndex);
      let query = new SnowlQuery(selection.uri);

      if (query.queryFolder == SnowlPlaces.collectionsSystemID ||
          query.queryFolder == SnowlPlaces.collectionsSourcesID)
        document.getElementById("snowlCollectionRefreshAllMenuitem").hidden = false;
      if (query.queryTypeSource) {
        let source = SnowlService.sourcesByID[query.queryID];
        if (source && source.attributes.refresh["status"] == "paused") {
          document.getElementById("snowlCollectionPauseMenuitem").hidden = true;
          document.getElementById("snowlCollectionResumeMenuitem").hidden = false;
        }
        else {
          document.getElementById("snowlCollectionPauseMenuitem").hidden = false;
          document.getElementById("snowlCollectionResumeMenuitem").hidden = true;
        }
      }
    }
  },

  _collectionChildStats: {},
  getCollectionChildStats: function(aNode) {
    // Rollup stats for custom views and any user created folder.
    let query, collID, stat;
    let count = {t:0, u:0, n:0};

    function calculateChildStats(aNode) {
      query = new SnowlQuery(aNode.uri);
      collID = query.queryTypeSource ? "s" + query.queryID :
               query.queryTypeAuthor ? "a" + query.queryID : null;
      stat = SnowlService.getCollectionStatsByCollectionID()[collID];

      if (!stat)
        stat = {t:0, u:0, n:0};

      count.t += stat.t;
      count.u += stat.u;
      count.n += stat.n;

      if (!PlacesUtils.nodeIsContainer(aNode))
        return count;

      asContainer(aNode);
      aNode.containerOpen = true;

      for (let child = 0; child < aNode.childCount; child++) {
        let childNode = aNode.getChild(child);
        count = calculateChildStats(childNode);
      }

      aNode.containerOpen = false;
      return count;
    }

    // Null the viewer while looking for nodes
    let result = CollectionsView._tree.getResult();
    let oldViewer = result.viewer;
    result.viewer = null;
    calculateChildStats(aNode);
    result.viewer = oldViewer;

    return this._collectionChildStats[aNode.itemId] = count;
  },

  _containerCollectionItemIds: [],
  getContainerCollectionItemIds: function(aNode) {
    // Rollup all child collection itemIds within a container and any child
    // containers.
    let query, qIds = [], itemIdQueries = [], restoreOpenStateNodes = {};

    function getContainerItemIds(aNode) {
      let queryParms = {qId:null, qGroupId:null};
      query = new SnowlQuery(aNode.uri);

      if (query.queryProtocol == "snowl:") {
        queryParms.qId = query.queryID;
        queryParms.qGroupId = query.queryGroupIDColumn;
        if (qIds.indexOf(query.queryID) == -1) {
          // Add non dupe queryID items only.
          qIds.push(query.queryID);
          itemIdQueries.push(queryParms);
        }
      }

      if (!PlacesUtils.nodeIsContainer(aNode) || !aNode.hasChildren)
        return itemIdQueries;

      restoreOpenStateNodes[aNode.itemId] = aNode.containerOpen;
      asContainer(aNode);
      aNode.containerOpen = true;

      for (let child = 0; child < aNode.childCount; child++) {
        let childNode = aNode.getChild(child);
        itemIdQueries = getContainerItemIds(childNode);
      }

      aNode.containerOpen = restoreOpenStateNodes[aNode.itemId];
      return itemIdQueries;
    }

    // Null the viewer while looking for nodes
    let result = CollectionsView._tree.getResult();
    let oldViewer = result.viewer;
    result.viewer = null;
    getContainerItemIds(aNode);
    result.viewer = oldViewer;

    return this._containerCollectionItemIds = itemIdQueries;
  },


  //**************************************************************************//
  // Rebuild the Places database

  // Initialize the system structure.
  rebuildPlacesDatabase: strand(function() {
    if (SnowlPlaces._placesConverted == null)
      return;

    this._log.info("rebuildPlacesDatabase: Rebuild Places Database requested.");

    // Use null as a lock.  If the collections tree is unloaded before a complete
    // conversion, on restart the rebuild will begin again.
    SnowlPlaces._placesConverted = null;

    this._tree.currentIndex = -1;
    this.itemIds = -1;
    this._collectionsViewMenu.setAttribute("selectedindex", 0); // "default"
    this._collectionsViewMenu.selectedIndex = 0;

    // Remove the root folder (and all its children) to trigger the rebuild.
    PlacesUtils.bookmarks.removeItem(SnowlPlaces.snowlPlacesFolderId);

    SnowlPlaces._placesInitialized = false;
    SnowlPlaces.delayedInit();
    SnowlPlaces.resetNameItemMap();

    // Reset the tree.
    this.onCommandCollectionsView(this._collectionsViewMenu.value);

    this.buildPlacesDatabase();
  }),

  // Build the collections from the messages database.
  buildPlacesDatabase: strand(function() {
    let table, tables = ["sources", "people"], collection, collections, count;
    let Sources, Authors;

    this._log.info("buildPlacesDatabase: Rebuilding Snowl Places Collections...");

    SnowlService._sourcesByID = null;
    Sources = SnowlService.sourcesByID;
    Authors = SnowlPerson.getAll();

    for each (table in tables) {
      collections = table == "sources" ? Sources :
                    table == "people" ? Authors : null;
      count = table == "sources" ? [name for (name in Sources)
                                    if (Sources.hasOwnProperty(name))].length :
              table == "people" ? Authors.length : 0;

      this._log.info("buildPlacesDatabase: Found " + count + " records in table - " + table);

      if (table == "people") {
        let titleMsg = strings.get("rebuildPlacesAuthorTitleMsg");
        let dialogMsg = strings.get("rebuildPlacesAuthorDialogMsg", [count]);
        if (!SnowlService._promptSvc.confirm(window, titleMsg, dialogMsg)) {
          PlacesUtils.bookmarks.removeItem(SnowlPlaces.collectionsAuthorsID);
          SnowlPlaces.snowlPlacesQueries["snowlCollectionsAuthors"] = -1;
          this._log.info("buildPlacesDatabase: Skipping Authors build");
          continue;
        }
      }

      for each (collection in collections) {
        let id, title, machineURI, externalID, iconURI, sourceID, placeID;
        if (table == "sources") {
          machineURI = collection.machineURI;
          iconURI = collection.faviconURI;
          sourceID = collection.id;
        }
        else if (table == "people") {
          iconURI = collection.iconURL ? URI.get(collection.iconURL) :
                    collection.homeURL ? SnowlSource.faviconSvc.
                                                     getFaviconForPage(collection.homeURL) :
                    null;

          // Get the sourceID and externalID of the author.
          // XXX: NOTE - currently there is a 1 to 1 relationship between an
          // identity and an author; if this changes sourceID and externalID
          // will no longer be valid as multiple identities could belong to an
          // author.
          [sourceID, externalID] = SnowlDatastore.selectIdentitiesSourceID(collection.id);
        }

        placeID = SnowlPlaces.persistPlace(table,
                                           collection.id,
                                           collection.name,
                                           machineURI,
                                           externalID,
                                           iconURI,
                                           sourceID);
        // Store placeID back into messages for db integrity
        SnowlDatastore.dbConnection.executeSimpleSQL(
          "UPDATE " + table +
          " SET    placeID = " + placeID +
          " WHERE       id = " + collection.id);

        gMessageViewWindow.XULBrowserWindow.
                           setOverLink(strings.get("rebuildPlacesConverted") + " " +
                                       table + " - " + collection.name);
        this._log.debug("buildPlacesDatabase: Converted to places - " +
            table + " - " + collection.name);

        yield sleep(10);
      }
    }

    gMessageViewWindow.XULBrowserWindow.
                       setOverLink(strings.get("rebuildPlacesCompleted"));
    this._log.info("buildPlacesDatabase: Rebuild Places Database completed");

    // Reset map and rebuild collection View menuitems, in case authors collection
    // built or not built.
    SnowlPlaces.resetNameItemMap();
    this._resetCollectionsView = true;
    this._log.debug("buildPlacesDatabase: map - "+SnowlPlaces.snowlPlacesQueries.toSource());

    SnowlPlaces._placesConverted = true;
    SnowlPlaces.setPlacesVersion(SnowlPlaces.snowlPlacesFolderId);
  })

};

/**
 * PlacesTreeView overrides here.
 */

/**
 * Override canDrop, do not drop a View shortcut into another View; it doesn't
 * make sense and very bad things happen to the tree.
 */
//PlacesTreeView.prototype._canDrop = PlacesTreeView.prototype.canDrop;
PlacesTreeView.prototype.canDrop = SnowlTreeViewCanDrop;
function SnowlTreeViewCanDrop(aRow, aOrientation) {
  if (!this._result)
    throw Cr.NS_ERROR_UNEXPECTED;

  // drop position into a sorted treeview would be wrong
  if (this.isSorted())
    return false;

  var ip = this._getInsertionPoint(aRow, aOrientation);

  // Custom handling for Sys collections and View shortcut.  Disallow Sys folder
  // dnd copy.  Allow move/drop of View only onto its parent (reorder);
  // disallow any multiselection dnd if it contains a Sys or View node.
  let isSys = false, isView = false;
  let dropNodes = CollectionsView._tree.getSelectionNodes();
  for (let i=0; i < dropNodes.length && (!isSys || !isView); i++) {
    isSys = PlacesUtils.annotations.
                        itemHasAnnotation(dropNodes[i].itemId,
                                          SnowlPlaces.SNOWL_COLLECTIONS_ANNO);
    isView = PlacesUtils.annotations.
                         itemHasAnnotation(dropNodes[i].itemId,
                                           SnowlPlaces.SNOWL_USER_VIEWLIST_ANNO);
  }
  if ((isSys || isView) &&
      (dropNodes.length > 1 ||
      (ip && ip.itemId != SnowlPlaces.collectionsSystemID)))
    return false;

  return ip && PlacesControllerDragHelper.canDrop(ip);
};

/**
 * Overload getCellProperties, set custom properties.
 */
PlacesTreeView.prototype._getCellProperties = PlacesTreeView.prototype.getCellProperties;
PlacesTreeView.prototype.getCellProperties = SnowlTreeViewGetCellProperties;
function SnowlTreeViewGetCellProperties(aRow, aColumn, aProperties) {
  this._getCellProperties(aRow, aColumn, aProperties);

  let query, anno, propStr, propArr, prop, collID, source, nodeStats, childStats;
  let node = this._visibleElements[aRow];
  query = new SnowlQuery(node.uri);

  // Set title property.
  aProperties.AppendElement(this._getAtomFor("title-" + node.title));

  // Set propeties.
  collID = query.queryTypeSource ? "s" + query.queryID :
           query.queryTypeAuthor ? "a" + query.queryID :
          (query.queryFolder == SnowlPlaces.collectionsSystemID ||
           query.queryFolder == SnowlPlaces.collectionsSourcesID ||
           query.queryFolder == SnowlPlaces.collectionsAuthorsID) ? "all" : null;
  source = SnowlService.sourcesByID[query.queryID];

  if (!node.icon && source && source.constructor.name == "SnowlFeed")
    // Set default favicon property for feed sources, if none.
    aProperties.AppendElement(this._getAtomFor("defaultFeedIcon"));
  if (query.queryTypeAuthor)
    // Set default favicon property for an author/person, if none.
    aProperties.AppendElement(this._getAtomFor("defaultAuthorIcon"));

  nodeStats = SnowlService.getCollectionStatsByCollectionID()[collID];
  if ((query.queryTypeSource || query.queryTypeAuthor) && !nodeStats)
    // Collection stats object with 0 records not returned, so create here.
    nodeStats = {t:0, u:0, n:0};

  if (nodeStats && nodeStats.u && !node.containerOpen)
    aProperties.AppendElement(this._getAtomFor("hasUnread"));
  if (nodeStats && nodeStats.n && !node.containerOpen)
    aProperties.AppendElement(this._getAtomFor("hasNew"));
  if (((source && source.busy) ||
      (collID == "all" && SnowlService.refreshingCount > 0)) &&
      !node.containerOpen)
    aProperties.AppendElement(this._getAtomFor("isBusy"));
  if (source && source.error && !node.containerOpen)
    aProperties.AppendElement(this._getAtomFor("hasError"));
  if (source && source.attributes.refresh &&
      source.attributes.refresh["status"] == "disabled" && !node.containerOpen)
    aProperties.AppendElement(this._getAtomFor("isDisabled"));
  if (source && !source.busy && (nodeStats && !nodeStats.n) &&
      source.attributes.refresh &&
      source.attributes.refresh["status"] == "paused" && !node.containerOpen)
    aProperties.AppendElement(this._getAtomFor("isPaused"));

  if ((query.queryFolder != SnowlPlaces.collectionsSourcesID &&
       query.queryFolder != SnowlPlaces.collectionsAuthorsID) &&
      PlacesUtils.nodeIsContainer(node) &&
      node.hasChildren && !node.containerOpen) {
    // For custom view shortcuts and any user created folders.
    childStats = CollectionsView.getCollectionChildStats(node);
    if (childStats && childStats.u)
      aProperties.AppendElement(this._getAtomFor("hasUnreadChildren"));
    if (childStats && childStats.n)
      aProperties.AppendElement(this._getAtomFor("hasNewChildren"));
  }

//if (nodeStats)
//SnowlPlaces._log.info("getCellProperties: itemId:title:stats - "+
//  query.queryID+" : "+node.title+" : "+nodeStats.toSource());

  // Determine if anno where we get the properties string is properties anno
  // (for sys collections and views) or source/author anno.
  anno = query.queryTypeSource ? SnowlPlaces.SNOWL_COLLECTIONS_SOURCE_ANNO :
          query.queryTypeAuthor ? SnowlPlaces.SNOWL_COLLECTIONS_AUTHOR_ANNO :
          query.queryProtocol == "place:" ? SnowlPlaces.SNOWL_PROPERTIES_ANNO :
          null;
//SnowlPlaces._log.info("getCellProperties: itemId:anno - "+node.itemId+" : "+anno+" : "+node.title);

  if (!anno)
    return;

  // Get the right anno.
  // XXX: use the node's propertyBag as cache here?
  try {
    if (anno == SnowlPlaces.SNOWL_PROPERTIES_ANNO)
      propStr = PlacesUtils.annotations.getItemAnnotation(node.itemId, anno);
    else
      propStr = PlacesUtils.annotations.getPageAnnotation(URI(node.uri), anno);
  }
  catch(ex) {
    // No properties anno for this node's itemId/uri.
  };

  if (!propStr)
    return;

//SnowlPlaces._log.info("getCellProperties: propStr - "+propStr);
  // Set the properties atoms.
  propArr = propStr.split(",");
  if (propArr.length > 0)
    for each (prop in propArr)
      aProperties.AppendElement(this._getAtomFor(prop));
};

/**
 * Override getImageSrc icon on collections, bookmarks with icons donot seem 
 * to respect css overrides.
 */
//PlacesTreeView.prototype._getImageSrc = PlacesTreeView.prototype.getImageSrc;
PlacesTreeView.prototype.getImageSrc = SnowlTreeViewGetImageSrc;
function SnowlTreeViewGetImageSrc(aRow, aColumn) {
  this._ensureValidRow(aRow);

  // only the title column has an image
  if (this._getColumnType(aColumn) != this.COLUMN_TYPE_TITLE)
    return "";

  var node = this._visibleElements[aRow];

  // Custom handling for collections.
  let query = new SnowlQuery(node.uri);
  let collID = query.queryTypeSource ? "s" + query.queryID :
               query.queryTypeAuthor ? "a" + query.queryID :
              (query.queryFolder == SnowlPlaces.collectionsSystemID ||
               query.queryFolder == SnowlPlaces.collectionsSourcesID ||
               query.queryFolder == SnowlPlaces.collectionsAuthorsID) ? "all" : null;
  let source = SnowlService.sourcesByID[query.queryID];

  let nodeStats = SnowlService.getCollectionStatsByCollectionID()[collID];
  if ((query.queryTypeSource || query.queryTypeAuthor) && !nodeStats)
    // Collection stats object with 0 records not returned, so create here.
    nodeStats = {t:0, u:0, n:0};

  if (!this._visibleElements[aRow].icon ||
      (nodeStats && nodeStats.n) ||
      (source && (source.busy || source.error ||
      (source.attributes.refresh &&
      (source.attributes.refresh["status"] == "disabled" ||
       source.attributes.refresh["status"] == "paused")))))
    // Don't set icon, let css handle it for 'new' or 'busy' or 'error'.
    // "all" collection (only) has a busy property so we can set an indicator on
    // a closed container.  Also let css handle if no favicon.
    return "";

  return this._visibleElements[aRow].icon;
};

/**
 * Overload setCellText, allow inline renaming and handle folder shortcut items.
 */
PlacesTreeView.prototype._setCellText = PlacesTreeView.prototype.setCellText;
PlacesTreeView.prototype.setCellText = SnowlTreeViewSetCellText;
function SnowlTreeViewSetCellText(aRow, aColumn, aText) {
  this._setCellText(aRow, aColumn, aText);

  // Custom handling for Views or Source/Author name changes.
  let node = this.nodeForTreeIndex(aRow);
  SnowlPlaces.renamePlace(node.itemId, node.uri, aText);
};

/**
 * Overload itemRemoved, restore selection when any row is removed
 */
PlacesTreeView.prototype._nodeRemoved = PlacesTreeView.prototype.nodeRemoved;
PlacesTreeView.prototype.nodeRemoved = SnowlTreeViewNodeRemoved;
function SnowlTreeViewNodeRemoved(aParentNode, aNode, aOldIndex) {
  this._nodeRemoved(aParentNode, aNode, aOldIndex);

  // Restore; note that itemRemoved is called on each item manipulated in a sort.
  CollectionsView._tree.restoreSelection();
};

/**
 * Overload toggleOpenState to address Bug 477806: closing container with
 * selected child selects the container, does not remember selected child on open.
 */
PlacesTreeView.prototype._toggleOpenState = PlacesTreeView.prototype.toggleOpenState;
PlacesTreeView.prototype.toggleOpenState = SnowlTreeViewToggleOpenState;
function SnowlTreeViewToggleOpenState(aRow) {
  let firstvisrow = CollectionsView._tree.treeBoxObject.getFirstVisibleRow();

  this._toggleOpenState(aRow);

  // Restore itemdIds, if there are any selected in a closed container, on open.
  let container = this._visibleElements[aRow];
  let selItemIds = CollectionsView.itemIds;
  if (container.containerOpen && container.hasChildren) {
    for (let i=0; i < container.childCount; i++) {
      let child = container.getChild(i);
      if (selItemIds.indexOf(child.itemId) != -1)
        CollectionsView._tree.view.selection.toggleSelect(child._viewIndex);
    }
  }

  // Don't autoselect folder on close.
  if (selItemIds.indexOf(container.itemId) == -1 &&
      CollectionsView._tree.view.selection.isSelected(container._viewIndex))
    CollectionsView._tree.view.selection.toggleSelect(container._viewIndex);

  // Ensure twisty row doesn't move in the view, otherwise getCellAt is no
  // longer valid in onClick, plus it's annoying.  Usually restoreSelection()
  // needs to make a selected row visible..
  CollectionsView._tree.treeBoxObject.scrollToRow(firstvisrow);
};

/**
 * Override getBestTitle and add collection stats info.
 */
PlacesUIUtils.getBestTitle =
  function (aNode) {
//SnowlPlaces._log.info("getBestTitle: title - "+aNode.title);
    var title;
    if (!aNode.title && PlacesUtils.uriTypes.indexOf(aNode.type) != -1) {
      // if node title is empty, try to set the label using host and filename
      // PlacesUtils._uri() will throw if aNode.uri is not a valid URI
      try {
        var uri = PlacesUtils._uri(aNode.uri);
        var host = uri.host;
        var fileName = uri.QueryInterface(Ci.nsIURL).fileName;
        // if fileName is empty, use path to distinguish labels
        title = host + (fileName ?
                        (host ? "/" + this.ellipsis + "/" : "") + fileName :
                        uri.path);
      }
      catch (e) {
       // Use (no title) for non-standard URIs (data:, javascript:, ...)
       title = "";
      }
    }
    else {
      title = aNode.title;

      // Custom title with stats.
      let query, collID, nodeStats, childStats, titleStats = "";
      query = new SnowlQuery(aNode.uri);
      collID = query.queryTypeSource ? "s" + query.queryID :
               query.queryTypeAuthor ? "a" + query.queryID :
               query.queryFolder == SnowlPlaces.collectionsSystemID ? "all" : null;

      nodeStats = SnowlService.getCollectionStatsByCollectionID()[collID];
      if ((query.queryTypeSource || query.queryTypeAuthor) && !nodeStats)
        // Collection stats object with 0 records not returned, so create here.
        nodeStats = {t:0, u:0, n:0};

      if (nodeStats) {
        if (collID == "all")
          titleStats = " (" + strings.get("statsNew") + nodeStats.n +
                       " " + strings.get("statsUnread") + nodeStats.u +
                       " " + strings.get("statsTotal") + nodeStats.t + ")";
        else
          titleStats = " (" + nodeStats.n + " " +
                              nodeStats.u + " " +
                              nodeStats.t + ")";
      }
      else {
        childStats = CollectionsView._collectionChildStats[aNode.itemId];
        if (childStats && !aNode.containerOpen)
          titleStats = " (" + childStats.n + " " +
                              childStats.u + " " +
                              childStats.t + ")";
      }

      title = title + titleStats;
     }

     return title || this.getString("noTitle");
};


/**
 * Override showItemProperties and add additional properties.
 */
PlacesUIUtils.showItemProperties =
  function(aItemId, aType, aReadOnly) {
    var info = {
      action: "edit",
      type: aType,
      itemId: aItemId,
      readOnly: aReadOnly
    };

    if (CollectionsView._tree.id == "sourcesView") {
      let index = CollectionsView._tree.currentSelectedIndex;
      let selectedSource = CollectionsView._tree.view.nodeForTreeIndex(index);
      let query = new SnowlQuery(selectedSource.uri);
      if (query.queryProtocol == "snowl:") {
        info.queryId = query.queryID;
        info.collection = query.queryTypeSource ? "source" : "author";
        if (query.queryTypeSource)
          info.mode = "properties";

        return this._showBookmarkDialog(info, true);
      }
    }

    return this._showBookmarkDialog(info);
};

/**
 * XULBrowserWindow overrides here, from browser.js for collections tree.
 */
gMessageViewWindow.XULBrowserWindow.setOverLink =
  function (link, b) {
    let statusbartext;
    // Encode bidirectional formatting characters.
    // (RFC 3987 sections 3.2 and 4.1 paragraph 6)
    statusbartext = link.replace(/[\u200e\u200f\u202a\u202b\u202c\u202d\u202e]/g,
                                 encodeURIComponent);

    // Snowl
    if (statusbartext.indexOf("snowl:") == 0) {
      // Source
      if (statusbartext.indexOf("&u=") != -1) {
        statusbartext = decodeURI(statusbartext);
        statusbartext = statusbartext.split("&u=")[1].replace(/&$/, "");
      }
      // Author
      else if (statusbartext.indexOf("&e=") != -1) {
          statusbartext = decodeURI(statusbartext);
          statusbartext = statusbartext.split("&e=")[1].replace(/&$/, "");
          statusbartext = statusbartext == "" ? " " : statusbartext;
      }
    }

    this.overLink = statusbartext;
    this.updateStatusField();
};

window.addEventListener("load", function() { CollectionsView.init() }, true);
