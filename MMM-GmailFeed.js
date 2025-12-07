"use strict";

Module.register("MMM-GmailFeed", {
  // Socket notification names centralized to avoid typos
  N: {
    GET: "MMM-GmailFeed_GET_JSON",
    RESULT: "MMM-GmailFeed_JSON_RESULT",
    ERROR: "MMM-GmailFeed_JSON_ERROR"
  },
  mailCount: 0,
  jsonData: null,
  errorData: null, // { message: string, status?: number }

  // Default module config.
  defaults: {
    updateInterval: 5 * 60 * 1000,
    maxEmails: 5,
    maxSubjectLength: 40,
    maxFromLength: 15,
    playSound: true,
    autoHide: false,
    displayMode: "table",
    color: true,
    showEmailAdressInHeader: true
  },

  start () {
    // Basic config validation so we can present helpful UI before first fetch
    const hasUser = typeof this.config.username === "string" && this.config.username.trim() !== "";
    const hasPass = this.config.password !== undefined && this.config.password !== null && String(this.config.password).trim() !== "";

    if (!hasUser || !hasPass) {
      this.jsonData = null;
      this.errorData = {
        message: "Configuration incomplete: username or password (App Password) is missing.",
        status: 0
      };
    } else {
      this.errorData = null;
      this.getJson();
    }

    this.scheduleUpdate();
  },

  scheduleUpdate () {
    const self = this;
    setInterval(() => {
      self.getJson();
    }, this.config.updateInterval);
  },

  // Define required scripts.
  getStyles () {
    return ["MMM-GmailFeed.css"];
  },

  // Define required scripts.
  getScripts () {
    return ["moment.js"];
  },

  // Request node_helper to get json from url
  getJson () {
    // Only request if critical config seems present
    const hasUser = typeof this.config.username === "string" && this.config.username.trim() !== "";
    const hasPass = this.config.password !== undefined && this.config.password !== null && String(this.config.password).trim() !== "";
    if (!hasUser || !hasPass) {
      return;
    }
    this.sendSocketNotification(this.N.GET, this.config);
  },

  socketNotificationReceived (notification, payload) {
    // Only continue if the notification came from the request we made
    // This way we can load the module more than once.
    if (payload.username === this.config.username) {
      if (notification === this.N.RESULT) {
        this.jsonData = payload.data;
        this.errorData = null;
        this.updateDom(500);
      }
      if (notification === this.N.ERROR) {
        this.jsonData = null;
        // normalize to structured error for clearer UI handling
        this.errorData = {
          message: payload && payload.error ? String(payload.error) : "Unknown error",
          status: payload && typeof payload.status === "number" ? payload.status : undefined
        };
        this.updateDom(500);
      }
    }
  },

  // Override getHeader method.
  getHeader () {
    let result;
    if (this.jsonData) {
      if (this.config.playSound && this.jsonData.fullcount > this.mailCount) {
        new Audio(this.file("assets/audio/eventually.mp3")).play();
      }

      this.mailCount = this.jsonData.fullcount;

      if (this.config.displayMode === "table") {
        if (this.jsonData.fullcount === "0" && this.config.autoHide) {
          this.jsonData.title = "";
        } else if (this.config.showEmailAdressInHeader) {
          result = `${this.jsonData.title}  -  ${this.jsonData.fullcount}`;
        } else {
          result = `GMAIL INBOX  -  ${this.jsonData.fullcount}`;
        }
      } else if (this.config.displayMode === "notification") {
        this.jsonData.title = "";
      }
    } else {
      result = "GmailFeed";
    }
    return result;
  },

  // Override dom generator.
  getDom () {
    const table = document.createElement("table");
    table.classList.add("mailtable");

    if (this.errorData) {
      const status = this.errorData.status;
      let msg = this.errorData.message || "An error occurred";
      if (status === 401) {
        msg = "Authentication failed (401). Check username/password or App Password.";
      }
      table.innerHTML = msg;
      return table;
    }

    if (!this.jsonData) {
      table.innerHTML = "Loading...";
      return table;
    }

    if (this.jsonData.fullcount === "0" && this.config.autoHide) {
      table.classList.add("hidden");
    }


    if (!this.jsonData.entry) {
      const row = document.createElement("tr");
      table.append(row);
      if (this.config.displayMode === "table") {
        const cell = document.createElement("td");
        row.append(cell);
        cell.append(document.createTextNode("No New Mail"));
        cell.setAttribute("colspan", "4");
        return table;
      }
    }

    let items = this.jsonData.entry;
    // If the items is null, no new messages
    if (this.config.displayMode === "table" &&
      !items) {
      return table;
    }

    // If the items is not an array, it's a single entry
    if (!Array.isArray(items)) {
      items = [items];
    }

    if (this.config.displayMode === "table") {
      for (const element of items) {
        const row = this.getTableRow(element);
        table.append(row);
      }
    } else if (this.config.displayMode === "notification") {
      const z = document.createElement("a");
      z.setAttribute("height", "50px");
      z.setAttribute("width", "100px");
      z.setAttribute("href", "#");
      z.classList.add("notification");
      const logo = document.createElement("img");
      // Use module-relative paths inside assets folder
      const colorLogo = this.file("assets/images/Gmail-logo.png");
      const grayLogo = this.file("assets/images/Gmail-logo-grayscale.png");
      logo.setAttribute("src", this.config.color === true ? colorLogo : grayLogo);
      logo.setAttribute("height", "50px");
      logo.setAttribute("width", "50px");
      const x = document.createElement("span");
      x.classList.add("badge");
      x.innerHTML = this.jsonData.fullcount;
      z.append(x);
      z.append(logo);
      table.append(z);
    }

    return table;
  },

  getTableRow (jsonObject) {
    const row = document.createElement("tr");
    row.classList.add("normal");

    const fromNode = document.createElement("td");
    const subjNode = document.createElement("td");
    const dtNode = document.createElement("td");
    const tmNode = document.createElement("td");

    const issueDt = moment(jsonObject.issued);

    fromNode.append(document.createTextNode(jsonObject.author.name.slice(0, Math.max(0, this.config.maxFromLength))));
    subjNode.append(document.createTextNode(jsonObject.title.slice(0, Math.max(0, this.config.maxSubjectLength))));
    if (!issueDt.isSame(new Date(Date.now()), "day")) {
      dtNode.append(document.createTextNode(issueDt.format("MMM DD - ")));
    }
    tmNode.append(document.createTextNode(issueDt.format("h:mm a")));

    fromNode.classList.add("colfrom");
    subjNode.classList.add("colsubj");
    dtNode.classList.add("coldt");
    tmNode.classList.add("coltm");

    row.append(fromNode);
    row.append(subjNode);
    row.append(dtNode);
    row.append(tmNode);

    return row;
  }
});
