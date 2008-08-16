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

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

Cu.import("resource://snowl/modules/message.js");

const XML_NS = "http://www.w3.org/XML/1998/namespace"
const XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
const HTML_NS = "http://www.w3.org/1999/xhtml";

// Parse URL parameters
let params = {};
let query = window.location.search.substr(1);
for each (let param in query.split("&")) {
  let name, value;
  if (param.indexOf("=") != -1) {
    [name, value] = param.split("=");
    value = decodeURIComponent(value);
  }
  else
    name = param;
  params[name] = value;
}

let message = SnowlMessage.get(parseInt(params.id));

let body = document.getElementById("body");

let content = message.content || message.summary;
if (content) {
  if (content.base)
    body.setAttributeNS(XML_NS, "base", content.base.spec);

  let docFragment = content.createDocumentFragment(body);
  if (docFragment)
    body.appendChild(docFragment);
}

document.getElementById("author").value = message.author;
document.getElementById("subject").value = message.subject;
document.documentElement.setAttribute("title", message.subject);
document.getElementById("timestamp").value = formatTimestamp(new Date(message.timestamp));
document.getElementById("link").href = message.link;
document.getElementById("link").value = message.link;

// FIXME: put this into a SnowlUtils module.

/**
 * Formats a timestamp for human consumption using the date formatting service
 * for locale-specific formatting along with some additional smarts for more
 * human-readable representations of recent timestamps.
 * @param   {Date} the timestamp to format
 * @returns a human-readable string
 */
function formatTimestamp(aTimestamp) {
  let formattedString;

  let dfSvc = Cc["@mozilla.org/intl/scriptabledateformat;1"].
              getService(Ci.nsIScriptableDateFormat);

  let now = new Date();

  let yesterday = new Date(now - 24 * 60 * 60 * 1000);
  yesterday = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());

  let sixDaysAgo = new Date(now - 6 * 24 * 60 * 60 * 1000);
  sixDaysAgo = new Date(sixDaysAgo.getFullYear(), sixDaysAgo.getMonth(), sixDaysAgo.getDate());

  if (aTimestamp.toLocaleDateString() == now.toLocaleDateString())
    formattedString = dfSvc.FormatTime("",
                                             dfSvc.timeFormatNoSeconds,
                                             aTimestamp.getHours(),
                                             aTimestamp.getMinutes(),
                                             null);
  else if (aTimestamp > yesterday)
    formattedString = "Yesterday " + dfSvc.FormatTime("",
                                                            dfSvc.timeFormatNoSeconds,
                                                            aTimestamp.getHours(),
                                                            aTimestamp.getMinutes(),
                                                            null);
  else if (aTimestamp > sixDaysAgo)
    formattedString = dfSvc.FormatDateTime("",
                                                 dfSvc.dateFormatWeekday, 
                                                 dfSvc.timeFormatNoSeconds,
                                                 aTimestamp.getFullYear(),
                                                 aTimestamp.getMonth() + 1,
                                                 aTimestamp.getDate(),
                                                 aTimestamp.getHours(),
                                                 aTimestamp.getMinutes(),
                                                 aTimestamp.getSeconds());
  else
    formattedString = dfSvc.FormatDateTime("",
                                                 dfSvc.dateFormatShort, 
                                                 dfSvc.timeFormatNoSeconds,
                                                 aTimestamp.getFullYear(),
                                                 aTimestamp.getMonth() + 1,
                                                 aTimestamp.getDate(),
                                                 aTimestamp.getHours(),
                                                 aTimestamp.getMinutes(),
                                                 aTimestamp.getSeconds());

  return formattedString;
}