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

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

// modules that are generic
Cu.import("resource://snowl/modules/StringBundle.js");

// modules that are Snowl-specific
Cu.import("resource://snowl/modules/constants.js");
Cu.import("resource://snowl/modules/message.js");
Cu.import("resource://snowl/modules/service.js");
Cu.import("resource://snowl/modules/utils.js");

var gBrowserWindow = SnowlService.gBrowserWindow;

var strings = new StringBundle("chrome://snowl/locale/message.properties");

//****************************************************************************//
// Create headers and content.

var messageContent = {
  id: null,
  title: null,
  message: null,
  hilightMode: false,

  _headers: null,
  get headers() {
    if (this._headers)
      return this._headers;

    return this._headers = this.message.headers;
  },

  init: function() {
//window.SnowlUtils._log.info("messageContent.init:  ");
    // When message.xhtml is loaded on new message selection, onload handlers in
    // the messageHeader.xhtml and messageBody.xhtml frames run independently,
    // and before its own onload handler.  So we must have init() as inline script
    // to run first and set up the message.
    this.getMessageId();
    this.message = SnowlMessage.retrieve(this.id);
    this.createTitle();
  },

  getMessageId: function() {
    var params = {};
    var query = parent.location.search.substr(1);
    for each (var param in query.split("&")) {
      var name, value;
      if (param.indexOf("=") != -1) {
        [name, value] = param.split("=");
        value = decodeURIComponent(value);
      }
      else
        name = param;
      params[name] = value;
    }

    this.id = parseInt(params.id);
  },

  createTitle: function() {
    this.title = this.message ? this.message.subject || this.message.excerpt :
                                strings.get("messageNotFoundTitle", [this.id]);
    top.document.title = this.title;
  },

  createHeader: function(headerDeck) {
    // The message is found in the scope of the parent frameset document.
    var messageContent = parent.wrappedJSObject.messageContent;
    var id = messageContent.id;
    var message = messageContent.message;
    var hdDoc = document.getElementById("messageHeader").contentDocument;
    var subjectLink = hdDoc.getElementById("subject");

    if (!id || subjectLink.childNodes.length > 0)
      // Not in a message.  Also return if the header is already built (in a
      // pageshow on back/forward navigation).
      return;

    if (message) {
      // Brief headers
      subjectLink.appendChild(document.createTextNode(message.subject ||
                                                      message.excerpt));
      if (message.link) {
        SnowlUtils.safelySetURIAttribute(subjectLink,
                                         "href",
                                         message.link.spec,
                                         message.source.principal);
        subjectLink.target = "messageBody";
      }

      if (message.author && message.author.person)
        hdDoc.getElementById("briefAuthor").appendChild(
              document.createTextNode(message.author.person.name));
        // If using xul:description...
//                 setAttribute("value", message.author.person.name);
      hdDoc.getElementById("briefTimestamp").appendChild(
            document.createTextNode(SnowlDateUtils._formatDate(message.timestamp)));

      // Basic headers
      if (message.author && message.author.person)
        hdDoc.getElementById("author").appendChild(
              document.createTextNode(message.author.person.name));
      hdDoc.getElementById("timestamp").appendChild(
            document.createTextNode(SnowlDateUtils._formatDate(message.timestamp)));

      headerDeck.removeAttribute("notfound");

      if (message.current == MESSAGE_NON_CURRENT_DELETED ||
          message.current == MESSAGE_CURRENT_DELETED)
        headerDeck.setAttribute("deleted", true);

      // Highlight search text, if any.
      var win = parent.document.getElementById("messageHeader").contentWindow;
      messageHeaderUtils.highlight("basicheaders", win);
    }
    else {
      // Message no longer exists (removed source/author/message) but is in history.
      headerDeck.setAttribute("notfound", true);
    }
  },

  createFullHeader: function(headerDeck) {
//window.SnowlUtils._log.info("createHeader: headers - "+this.headers.toSource());
    if (!this.headers)
      return;

    // Iterate through message headers object and create full header.
    var name, value, headerRow, headerRowLabel, headerRowData;
    var fullHeaderTable = headerDeck.parentNode.
                                     getElementsByClassName("fullHeaderTable")[0];
    if (fullHeaderTable.className != "fullHeaderTable")
      return;

    for ([name, value] in Iterator(this.headers)) {
      headerRow = document.createElementNS(HTML_NS, "tr");
      headerRow.className = "fullHeaderRow";

      headerRowLabel = document.createElementNS(HTML_NS, "td");
      headerRowLabel.className = "headerLabel " + name;
      headerRowLabel.textContent = name + ":";
      headerRow.appendChild(headerRowLabel);

      headerRowData = document.createElementNS(HTML_NS, "td");
      headerRowData.className = "headerData " + name;
      headerRowDataA = document.createElementNS(HTML_NS, "a");
      headerRowDataA.textContent = value;
      headerRowData.appendChild(headerRowDataA);
      headerRow.appendChild(headerRowData);

      fullHeaderTable.appendChild(headerRow);
    }

    // Highlight search text, if any.
    var win = parent.document.getElementById("messageHeader").contentWindow;
    messageHeaderUtils.highlight("headers", win);
  },

  createBody: function(aType) {
//window.SnowlUtils._log.info("createBody: ");
    var contentBody = document.getElementById("contentBody");

    if (!contentBody)
      // If no contentBody element, we are going back in history to a new
      // message but which contains a linked page and not message content;
      // just return.
      return;

    // The message is found in the scope of the parent frameset document.
    var messageContent = parent.wrappedJSObject.messageContent;
    var id = messageContent.id;
    var message = messageContent.message;
    var content;

    if (message) {
      content = message.content || message.summary;
    }
    else {
      // Message no longer exists (removed source/author/message) but is in
      // history.
      content = Cc["@mozilla.org/feed-textconstruct;1"].
                createInstance(Ci.nsIFeedTextConstruct);
      var notFound = strings.get("messageNotFound", [id]);
      content.text = "<p><strong>" + notFound + "</strong></p>";

      content.type = "html";
      content.base = null;
      content.lang = null;
    }

    if (content) {
      if (content.type == "text") {
        SnowlUtils.linkifyText(content.text,
                               contentBody,
                               message.source.principal);
      }
      else {
        // content.type == "html" or "xhtml"
        if (content.base)
          document.body.setAttributeNS(XML_NS, "base", content.base.spec);

        var docFragment = content.createDocumentFragment(contentBody);
        if (docFragment)
          contentBody.appendChild(docFragment);
      }

    // Highlight search text, if any.
    var win = parent.document.getElementById("messageBody").contentWindow;
    messageHeaderUtils.highlight("messages", win);
    }
  }

};

//****************************************************************************//
// Utils for headers.

var messageHeaderUtils = {
  ROWS_BRIEF: "30,*",
  origWidth: null,
  origHeight: null,
  noResize: false,

  init: function() {
//window.SnowlUtils._log.info("messageHeaderUtils.init: ");
    var pin = document.getElementById("pinButton");
    var headerBcaster = gBrowserWindow.document.
                                       getElementById("viewSnowlHeader");
    var wrap = gBrowserWindow.document.
                              getElementById("viewSnowlHeaderWrap");
    var body = document.getElementById("body");
    var headerDeck = document.getElementById("headerDeck");
    var noHeader = parent.document.
                          documentElement.getElementsByClassName("noHeader")[0];
    var checked = headerBcaster.getAttribute("checked") == "true";
    pin.checked = checked;

    if (headerDeck.hasAttribute("notfound"))
      return;

    if (checked) {
      // Collapse hover area, set header.
      noHeader.setAttribute("collapsed", true);
      this.toggleHeader(body, headerDeck, "init");
    }
    else {
      // Uncollapse hover area, hide header frame.
      parent.document.body.setAttribute("border", "0");
      parent.document.body.rows = "0,*";
      noHeader.removeAttribute("collapsed");
    }

    if (wrap.getAttribute("checked") == "true")
      body.classList.add("wrap");
    else
      body.classList.remove("wrap");

    // Fires after onresize done, store new width and height.
    window.addEventListener("MozScrolledAreaChanged",
                            function () { messageHeaderUtils.setDimensions() },
                            false);
  },

  setDimensions: function() {
//window.SnowlUtils._log.info("setDimensions: ");
    messageHeaderUtils.origWidth = parent.document.body.clientWidth;
    messageHeaderUtils.origHeight =
        parent.document.getElementById("messageHeader").clientHeight;
    // Adjust search markers, if any.  Content scroll listener doesn't fire if
    // header is sized.
    messageHeaderUtils.highlightSetMarkers();
  },

  onUnload: function() {
//window.SnowlUtils._log.info("onUnload: ");
    window.removeEventListener("MozScrolledAreaChanged",
                               function () { messageHeaderUtils.setDimensions() },
                               false);
  },

  onMouseOver: function(aEvent) {
    var node = aEvent.target;
    var messageHeader = document.getElementById("messageHeader");
    var body = messageHeader.contentDocument.body;
    var headerDeck = messageHeader.contentDocument.getElementById("headerDeck");
    var pin = messageHeader.contentDocument.getElementById("pinButton");
    if (node.id != "noHeader" || pin.hasAttribute("checked"))
      return;

    this.headertimer = window.setTimeout(function() {
                         messageHeaderUtils.toggleHeader(body, headerDeck, "hover");
                         document.getElementById("noHeader").
                                  setAttribute("collapsed", true);
                       }, 500);
  },

  onMouseMove: function(aEvent) {
    var node = aEvent.target;
    if (node.classList.contains("headerLabel")) {
      // Hovering a header label.  Set cursor to indicate toggle for wrap mode
      // based on wrap state and wrappability.
      if (node.nextSibling.clientWidth < node.nextSibling.firstChild.offsetWidth)
        node.classList.add("wrappable");
      else
        node.classList.remove("wrappable");

      var dataCStyle = window.getComputedStyle(node, null)
      // Need the height of the <a> content as the containing <td> sizes to match
      // any other <td> in the row that has expanded to fit wrapped content.
      var dataHt = node.nextSibling.firstChild.scrollHeight;
      var dataLnHt = dataCStyle.getPropertyValue("line-height").replace(/px/, "");
      if (dataHt != dataLnHt)
        node.classList.add("wrapped");
      else
        node.classList.remove("wrapped");
    }
  },

  onMouseOut: function(aEvent) {
    window.clearTimeout(this.headertimer);
    delete this.headertimer;
    var node = aEvent.target;
    var messageHeader = document.getElementById("messageHeader");
    var pin = messageHeader.contentDocument.getElementById("pinButton");
    if (node.id != "messageHeader" || pin.hasAttribute("checked"))
      return;

    // Set noResize in scope of messageHeader frame document, which listens for
    // the onResize event.
    messageHeader.contentWindow.wrappedJSObject.messageHeaderUtils.noResize = true;
    document.getElementById("messageFrame").setAttribute("border", "0");
    document.getElementById("messageFrame").setAttribute("rows", "0,*");
    document.getElementById("noHeader").removeAttribute("collapsed");
  },

  onButtonKeyPress: function(aEvent) {
    if (aEvent.keyCode == KeyEvent.DOM_VK_RETURN ||
        aEvent.keyCode == KeyEvent.DOM_VK_TAB)
      return;

    // Remove focus from tabbable buttons for back/forward.
    // XXX: due to the button binding, an arrow key while the header button is
    // focused will throw once; no event cancelling functions cancel the event.
    aEvent.target.blur();
//    window = aEvent.target.ownerDocument.defaultView.gBrowserWindow;
  },

  togglePin: function(aEvent) {
    var pin = aEvent.target;
    var headerBcaster = gBrowserWindow.document.getElementById("viewSnowlHeader");
    headerBcaster.setAttribute("checked", pin.checked);
  },

  setHeaderSize: function(aBody, aHeaderDeck) {
    // Calculate how to set header height, given wrap toggling and splitter dnd.
    var headerBcaster = gBrowserWindow.document.getElementById("viewSnowlHeader");
    var headerIndex = parseInt(headerBcaster.getAttribute("headerIndex"));
    var rowsBasic = headerBcaster.getAttribute("rowsBasic");
    var rowsFull = headerBcaster.getAttribute("rowsFull");
    if ((this.isWrapped(aHeaderDeck) || aBody.classList.contains("wrap")) &&
        headerIndex != 2)
      // Reset header frame height to flow wrapped content.  Full header scrolls,
      // so not necessary for 2.
      parent.document.body.rows = aBody.scrollHeight + ",*";
    else
      // Restore user set height if nothing wraps, or on init and mouseover/out.
      parent.document.body.rows = headerIndex == 0 ? this.ROWS_BRIEF :
                                  headerIndex == 1 ? rowsBasic : rowsFull;

    this.noResize = true;
  },

  isWrapped: function(aHeaderDeck) {
    // Is any row in the brief/basic headers wrapped?  Not just toggled to wrap,
    // but also flowed to multiple lines.
    var oneWrapped = false;
    var headerDeck = aHeaderDeck;

    var wrappedNodes = headerDeck.getElementsByClassName("wrap");
    for (var i = 0; i < wrappedNodes.length && !oneWrapped; i++) {
      var node = wrappedNodes[i];
      var dataCStyle = window.getComputedStyle(node, null)
      var dataHt = dataCStyle.getPropertyValue("height");
      var dataLnHt = dataCStyle.getPropertyValue("line-height");
      if (dataHt != dataLnHt)
        oneWrapped = true;
    }

    return oneWrapped;
  },

  toggleHeader: function(aBody, aHeaderDeck, aType) {
    var headerBcaster = gBrowserWindow.document.getElementById("viewSnowlHeader");
    var headerIndex = parseInt(headerBcaster.getAttribute("headerIndex"));
    var body = aBody ? aBody :
                       document.getElementById("body");
    var headerDeck = aHeaderDeck ? aHeaderDeck :
                                   document.getElementById("headerDeck");

    if (aType == "toggle") {
      // Toggle to next in 3 way
      headerIndex = ++headerIndex > 2 ? 0 : headerIndex++;
      headerBcaster.setAttribute("headerIndex", headerIndex);
    }

    var headerType = headerIndex == 0 ? "brief" :
                     headerIndex == 1 ? "basic" : "full";
    headerDeck.setAttribute("header", headerType);
    parent.document.body.setAttribute("header", headerType);
    parent.document.body.setAttribute("border", "6");

    // Set the size to persisted values or make sure toggling results in nice
    // headers wrapped content flow.
    this.setHeaderSize(body, headerDeck);

    // The message is found in the scope of the parent frameset document.
    var messageContent = parent.wrappedJSObject.messageContent;
    messageContent.createHeader(headerDeck);
    if (headerIndex == 2 && !messageContent._headers)
      messageContent.createFullHeader(headerDeck);
  },

  onDeleteMessageButton: function() {
    // Delete button.
    var messageContent = parent.wrappedJSObject.messageContent;
    gBrowserWindow.SnowlMessageView.onDeleteMessage([messageContent.message])
  },

  onClick: function(aEvent) {
    if (aEvent.button != 0)
      return;

    var node = aEvent.target;
    if (node.classList.contains("headerLabel")) {
      // Clicked on a header label.
      var body = document.getElementById("body");
      var headerDeck = document.getElementById("headerDeck");
      if (!body.classList.contains("wrap")) {
        // Set wrap and resize only if global wrap not set.
        node.classList.toggle("wrap");
        this.setHeaderSize(body, headerDeck);
      }
    }
  },

  onResize: function() {
    var messageHeader = parent.document.getElementById("messageHeader");
    var body = document.getElementById("body");
    var headerDeck = document.getElementById("headerDeck");
    var headerBcaster = gBrowserWindow.document.getElementById("viewSnowlHeader");
    var headerIndex = parseInt(headerBcaster.getAttribute("headerIndex"));
    var rowsBasic = headerBcaster.getAttribute("rowsBasic");
    var rowsFull = headerBcaster.getAttribute("rowsFull");
    var newWidth = parent.document.body.clientWidth;
    var newHeight = messageHeader.clientHeight;

    if (this.origWidth != newWidth && headerIndex != 2) {
      // If the sidebar width has changed, make sure things reflow nicely; since
      // the full header has a scrollbar, only necessary for brief/basic headers.
      if (this.isWrapped(headerDeck) || body.classList.contains("wrap"))
        // Reset header frame height to flow wrapped content.
        parent.document.body.rows = body.scrollHeight + ",*";
      else
        // Restore user set height if nothing wraps.
        parent.document.body.rows = headerIndex == 0 ? this.ROWS_BRIEF :
                                    headerIndex == 1 ? rowsBasic : rowsFull;
    }

    if (this.noResize) {
      // Do not resize if size changed due to header label click, or
      // mouseover/out header show/hide.  All height resizes must come from
      // dragging the frame border, for persisting height.
      this.noResize = false;
      return;
    }

    if (this.origHeight != newHeight && this.origWidth == newWidth) {
      // Just height changed, must be only due to dnd resize, persist new height.
      // There is no frames event that would make persisting height more direct.
      if (headerIndex == 1)
        headerBcaster.setAttribute("rowsBasic", parent.document.body.rows);
      if (headerIndex == 2)
        headerBcaster.setAttribute("rowsFull", parent.document.body.rows);
    }
  },

  tooltip: function(aEvent, aShow) {
    // Need to handle tooltips manually in xul-embedded-in-xhtml; tooltip
    // element cannot be in the xhtml document either.
    var tooltip = gBrowserWindow.document.getElementById("snowlXulInXhtmlTooltip");
    var tooltipdelay = parseInt(aEvent.target.getAttribute("tooltipdelay"));
    tooltipdelay = isNaN(tooltipdelay) ? 800 : tooltipdelay;
    if (aShow == 'show') {
      this.tiptimer = window.setTimeout(function() {
                        tooltip.label = aEvent.target.getAttribute("tooltiptext");
                        tooltip.openPopup(aEvent.target,
                                          "after_start",
                                          0, 0, false, false);
                      }, tooltipdelay);
    }
    else if (aShow == 'hide') {
      window.clearTimeout(this.tiptimer);
      delete this.tiptimer;
      tooltip.label = "";
      tooltip.hidePopup();
      // Remove focus (for header button, arrow key binding issue).
      aEvent.target.blur();
    }
  },

  // Highlight search terms.
  highlight: function(aType, aWindow) {
    var term, terms = [], regexTerms = [], highlightTerms = [],
        selection, range, rangeCount, hlnode, hlindex = 0;
    var sidebarWin = gBrowserWindow.document.
                                    getElementById("sidebar").contentWindow;
    var collectionsView = sidebarWin.CollectionsView;

    if (!collectionsView || !collectionsView.Filters["searchterms"])
      return;

    var searchType = collectionsView._searchFilter.
                                     getAttribute("searchtype");
    var searchTerms = collectionsView.Filters["searchterms"];
    var searchMsgsFTS = searchType == "messages";
    var searchIgnoreCase = collectionsView._searchFilter.
                                           getAttribute("ignorecase") == "true" ?
                                           true : false;
//    var flags = "g" + (searchIgnoreCase ? "i" : "");

    var findbar = gBrowserWindow.document.getElementById("FindToolbar");
    var controller = findbar._getSelectionController(aWindow);

    if ((aType == "headers" && searchType != "headers") ||
        (aType == "messages" &&
          (searchType != "messages" && searchType != "messagesFTS")) ||
        (aType == "basicheaders" &&
          (searchType == "messages" || searchType == "messagesFTS")))
      return;

window.SnowlUtils._log.info("highlight: aType:searchType:searchTerms - "+
  aType+" : "+searchType+" : "+searchTerms);

    if (searchMsgsFTS) {
      // SQLite FTS based search results.
      terms = searchTerms.match("[^\\s\"']+|\"[^\"]*\"|'[^']*'", "g");
//window.SnowlUtils._log.info("highlight: SearchMsgsFTS terms - "+terms);
      while (terms && (term = terms.shift())) {
        // Remove negation term -, OR term, NEAR[/n] term, quotes ", and
        // last wildcard *.
        term = term.replace(/^-.*|^OR|^NEAR($|\/{1}[1-9]{1}$)|\"|\*\"$|\*$/g, "");
        // Replace all non word symbols with . since sqlite does not match
        // symbols exactly, ie for term of "one-off", "one---off", "one++off"
        // sqlite returns a match for "one off"; for "one off" sqlite returns
        // "one-off" etc. etc. and we need to highlight these.
        // XXX: term that sqlite does not match (exact quoted term) will be
        // hightlighted if it's nevertheless in a valid result page.
////        term = term.replace(/[^\w\u0080-\uFFFFF]+/g, ".");
        // Make lower case for highlight array.
        // XXX: unicode? Bug 394604.  Result is that while sqlite may match
        // the record, unless the user input is exactly what is on the page,
        // it won't show.
        term = term.toLowerCase();
  
        if (term)
          // Add term to array, term's index creates hilight classname.
          highlightTerms.push(term);
      }

      regexTerms = highlightTerms;
    }
    else {
      // Regex based search results.
      searchTerms.forEach(function(term) {
        if (term.charAt(0) == "-" || term.match(/^OR$/))
          // Don't include negation term or the OR term.
          return;
  
        term = searchIgnoreCase ? term.toLowerCase() : term;
  
        // Remove leading quote "; remove last quote " making sure to retain
        // escaped quote; convert some special html escaped char entities.  Use
        // this array to exactly match content with term and get its index for
        // the hl[index] class.
        highlightTerms.push(term.replace(/^"/, "").
                                 replace(/([^\\])"/g, "$1").
                                 replace(/\\"/g, '"').
                                 replace(/&/g, "&amp;").
                                 replace(/</g, "&lt;").
                                 replace(/>/g, "&gt;"));
                                 
        // Extra special handling to escape \ unless it escapes a "; escape
        // special chars; remove leading "; remove last quote " making sure to
        // retain escaped quote (negation already passed by).  Use this
        // array to match html entities and other escaped chars.
        regexTerms.push(term.replace(/(\\)(?=[^"]|$)/g, "\\$1").
                             replace(/([.^$*+?\-()[{}|\]])/g, "\\$1").
                             replace(/^"/, "").
                             replace(/([^\\])"/g, "$1").
                             replace(/&/g, "&amp;").
                             replace(/</g, "&lt;").
                             replace(/>/g, "&gt;"));
      })
    }

    // No terms (negation terms removed).
    if (highlightTerms.length == 0)
      return;

    var messageContent = parent.wrappedJSObject.messageContent;
    messageContent.hilightMode = true;
//window.SnowlUtils._log.info("highlight: regexTerms - "+regexTerms);

    for each (regexTerm in regexTerms) {
      // Use findbar based selection highlight to get the elements, wrap them
      // in a <span> element for multiselection highlighting.  Highlighting
      // full or partial text broken up by or within other html tags
      // (<a>, <b>, etc.) is possible with this method.
//window.SnowlUtils._log.info("highlight: process regexTerm - "+regexTerm);
      hlindex = highlightTerms.indexOf(searchIgnoreCase ? regexTerm.toLowerCase() :
                                                          regexTerm);
      findbar._highlightDoc(true, regexTerm, aWindow);
      selection = controller.getSelection(findbar._findSelection);
      rangeCount = controller.getSelection(findbar._findSelection).rangeCount;

      // Must go backwards to process ranges in a node, to preserve offsets..
      for (var i = rangeCount; i > 0; i--) {
//window.SnowlUtils._log.info("highlight: sel:i - "+selection+" : "+i);
        range = selection.getRangeAt(i-1);
//window.SnowlUtils._log.info("highlight: range:startOffset:endOffset - "+
//  range+" : "+range.startOffset+" : "+range.endOffset);

        hlnode = document.createElementNS(HTML_NS, "span");
        hlnode.setAttribute("class", "hlterms hl hl" + hlindex);

//        range.surroundContents(hlnode);
        hlnode.appendChild(range.extractContents());
        range.insertNode(hlnode);
        selection.removeRange(range);
        delete hlnode;
      }

      selection.removeAllRanges();
    }
                                  messageHeaderUtils.highlightSetMarkers();

    if (aType == "Xmessages") {
      // Make sure marker position is reset once content is loaded or resized.
      document.addEventListener("MozScrolledAreaChanged",
                                function () {
                                  messageHeaderUtils.highlightSetMarkers();
                                },
                                false);
    }
  },

  /*
   * The highlight marker code is adapted from the Search Marker extension by
   * Matt Kenison<matt@penguinus.com>
   * http://www.penguinus.com/dev/searchmarker/
   */
  highlightSetMarkers : function() {
    var messageContent = parent.wrappedJSObject.messageContent;
window.SnowlUtils._log.info("highlightSetMarkers: START:mode - "+messageContent.hilightMode);
    if (!messageContent.hilightMode)
      return;
//window.SnowlUtils._log.info("highlightSetMarkers: CONTINUE");

    var messageBody = parent.document.getElementById("messageBody");
    var body = messageBody.contentDocument.body;
    var contentBody = messageBody.contentDocument.getElementById("contentBody");

    // Calculate space taken by scrollbar buttons, markers should not be above
    // or below the scroll track (if scrollbar buttons are visible).  Can't get
    // real height of button, so get scrollbar width and assume they're square.
    // XXX: these hardcoded values worked best, figure out better calcs to
    // match marker with scrollbar.
    var width = messageBody.clientWidth - body.clientWidth;
    var scrollBarOffsetTop = width ? 28 : width;
    var scrollBarOffsetBot = width ? 48 : width;

    if (!width)
      // No need for marker unless there's a scrollbar.
      return;

    // Create element to contain the markers.
    var markerDiv = document.createElementNS(HTML_NS, "div");
    markerDiv.setAttribute("id", "hlMarkerContainer");
    contentBody.appendChild(markerDiv);
//window.SnowlUtils._log.info("highlightSetMarkersX: markerDiv");

    // Find all hilighted <span> entries.
    var searchResults = body.getElementsByClassName("hlterms");
    for (var i = 0; i < searchResults.length; ++i) {
      var searchResult = searchResults[i];
//window.SnowlUtils._log.info("highlightSetMarkersX: searchResult - "+searchResult);

      // Get the absolute y location of the term as a percentage and calculate
      // position based on visible area height, adjusted for scrollbarbuttons.
      var absoluteTop = this.hilightGetAbsoluteTop(searchResult);
      var markerTop = absoluteTop / body.parentNode.scrollHeight * 100;
      markerTop += scrollBarOffsetTop / body.parentNode.clientHeight * 100;
      markerTop -= markerTop * (scrollBarOffsetBot / body.parentNode.clientHeight);

      // Add marker to container
      var marker = document.createElementNS(HTML_NS, "div");
      marker.setAttribute("class", "hlMarker " +
                                   searchResult.className.replace("hlterms", ""));
      marker.setAttribute("style", "top:" + markerTop + "% !important");
      marker.setAttribute("tooltiptext", searchResult.textContent);
      marker.setAttribute("tooltipdelay", "0");
      marker.setAttribute("onclick", "window.scrollTo(0," + absoluteTop + ")");
      marker.setAttribute("onmouseover", "messageHeaderUtils.tooltip(event, 'show');");
      marker.setAttribute("onmousedown", "messageHeaderUtils.tooltip(event, 'hide');");
      marker.setAttribute("onmouseout", "messageHeaderUtils.tooltip(event, 'hide');");
      markerDiv.appendChild(marker);
    }
  },

  // Recursively add the relative top of the parent element.
  hilightGetAbsoluteTop : function(element) {
    return element == null ? 0 :
        this.hilightGetAbsoluteTop(element.offsetParent) + element.offsetTop;
  },

  higlightClear : function() {
window.SnowlUtils._log.info("higlightClear:  ");
    var messageBody = document.getElementById("messageBody");
    var doc = messageBody.contentDocument;
    var contentBody = doc.getElementById("contentBody");
    var marker = doc.getElementById("hlMarkerContainer");
    var hlspans = doc.getElementsByClassName("hlterms");
    var hlspan;
/*
    doc.removeEventListener("MozScrolledAreaChanged",
                              function () {
                                messageHeaderUtils.highlightSetMarkers();
                              },
                              false);
*/
    if (marker)
      contentBody.removeChild(marker);
//window.SnowlUtils._log.info("higlightClear: marker - "+marker.id);

    // Remove our <span> nodes, moving their children to the span's location in
    // the DOM.  DOM nodes collection is dynamic, so have to go backwards..
    for (var i = hlspans.length; i > 0 ; i--) {
      hlspan = hlspans[i-1];
      while (hlspan.hasChildNodes())
        hlspan.parentNode.insertBefore(hlspan.firstChild, hlspan )
      hlspan.parentNode.removeChild(hlspan);
    }

    // Merges all adjacent text nodes which had been split up by the <span>.
    // Text child nodes within <a href> tags remain fragmented.
    contentBody.normalize();
  }

};
