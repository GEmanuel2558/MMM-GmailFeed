const Log = require("logger");
const NodeHelper = require("node_helper");
const xml2js = require("xml2js");

module.exports = NodeHelper.create({
  start () {
    Log.log("MMM-GmailFeed helper started...");
  },

  async getFeed (config) {
    try {
      const self = this;
      Log.info(`[MMM-GmailFeed] Fetching Gmail Atom feed for user: ${config.username}`);
      const feedUrl = "https://mail.google.com/mail/feed/atom";

      const response = await fetch(
        feedUrl,
        {
          headers: {
            Authorization: `Basic ${btoa(`${config.username}:${config.password}`)}`
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Error fetching feed: ${response.status}`);
      }

      const parser = new xml2js.Parser({trim: true, explicitArray: false});
      const body = await response.text();
      parser.parseString(body, (error_, result) => {
        if (error_) {
          Log.error(`[MMM-GmailFeed] XML parse error: ${error_.message}`);
          self.sendSocketNotification("MMM-GmailFeed_JSON_ERROR", {
            username: config.username,
            error: error_.message
          });
          return;
        }
        if (result.feed.entry) {
          if (!Array.isArray(result.feed.entry)) {
            result.feed.entry = [result.feed.entry];
          }

          result.feed.entry = result.feed.entry.slice(0, config.maxEmails);
        }

        const entryCount = Array.isArray(result.feed.entry) ? result.feed.entry.length : (result.feed.entry ? 1 : 0);
        Log.info(`[MMM-GmailFeed] Retrieved ${entryCount} unread item(s) for ${config.username}`);

        // Send the json data back with the URL to distinguish it on the receiving port
        self.sendSocketNotification("MMM-GmailFeed_JSON_RESULT", {
          username: config.username,
          data: result.feed
        });
      });
    } catch (error) {
      Log.error(`[MMM-GmailFeed] Error fetching feed: ${error.message}`);
      // Ensure the front-end can react to errors per instance
      this.sendSocketNotification("MMM-GmailFeed_JSON_ERROR", {
        username: (config && config.username) || undefined,
        error: error.message
      });
    }
  },


  // Subclass socketNotificationReceived received.
  socketNotificationReceived (notification, config) {
    if (notification === "MMM-GmailFeed_GET_JSON") {
      Log.info(`[MMM-GmailFeed] Request received to fetch feed for ${config && config.username}`);
      this.getFeed(config);
    }
  }
});
