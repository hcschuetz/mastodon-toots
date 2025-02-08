// A Web Component Displaying some User's Mastodon Posts
// -----------------------------------------------------

customElements.define('mastodon-posts', class MastodonPosts extends HTMLElement {
    async connectedCallback() {

      const displayName = ({display_name, emojis}) => {
        const emojiObj =
          Object.fromEntries(emojis.map(({shortcode, url}) => [shortcode, url]));

        const out = document.createDocumentFragment();
        let prev = 0;
        for (const match of display_name.matchAll(/:([a-z0-9_]+):/gi)) {
          out.append(display_name.substring(prev, match.index));
          prev = match.index + match[0].length;

          const url = emojiObj[match[1]];
          out.append(!url ? match[0] : mkElem("img", "emoji", "", img => img.src = url))
        }
        out.append(display_name.substring(prev));
        return out;
      }

      const domParser = new DOMParser();

      /**
       * A positive list of allowed tags and attribute names.
       * 
       * This is quite restrictive and might need to be extended.
       * OTOH we might also restrict the attribute values.
       */
      const allowed = {
        A: ["class", "href", "rel", "target", "translate"],
        BR: [],
        I: [],
        P: [],
        SPAN: ["class", "translate"],
      };

      /**
       * Check a DOM subtree for illegal content.
       * 
       * Does not fix the tree by removing bad parts, but simply throws.
       */
      function sanitize({tagName, attributes, children}) {
        const allowedAttrs = allowed[tagName];
        if (!allowedAttrs) {
          throw "sanitize: unexpected node tag " + tagName;
        }
        for (const {name} of attributes) {
          if (!allowedAttrs.includes(name)) {
            throw `sanitize: attribute "${name}" not allowed in ${tagName} element`;
          }
        }
        for (const child of children) {
          sanitize(child);
        }
      }

      function mkElem(tag, className, content, tweak) {
        const elem = document.createElement(tag);
        elem.className = className;
        elem.textContent = content;
        tweak?.(elem);
        return elem;
      }

      // It's probably possible to get this formatting with some standard
      // date/time-formatting function, but it's easier to just implement
      // this directly:
      const formatDate = date =>
        date.getFullYear()   .toString().padStart(4, "0") + "-" +
        (date.getMonth() + 1).toString().padStart(2, "0") + "-" +
        date.getDay()        .toString().padStart(2, "0") + " " +
        date.getHours()      .toString().padStart(2, "0") + ":" +
        date.getMinutes()    .toString().padStart(2, "0");

      try {
        const params = [];
        const limitAttr = this.getAttribute("limit");
        if (limitAttr) { params.push(["limit", limitAttr]); }
        if (this.getAttribute("exclude-replies") != null) {
          params.push(["exclude_replies", "true"]);
        }
        if (this.getAttribute("exclude-reblogs") != null) {
          params.push(["exclude_reblogs", "true"]);
        }

        const statusURL = `https://${
          this.getAttribute("instance")
        }/api/v1/accounts/${
          this.getAttribute("id")
        }/statuses${
          params.length === 0 ? "" :
          "?" + params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&")
        }`;

        // TODO? update posts repeatedly (asking only for new posts)
        const response = await fetch(statusURL);
        if (!response.ok) {
          // TODO internationalize
          throw `Could not get mastodon posts (HTTP status: ${response.status})`;
        }
        const toots = await response.json();
        if (toots.length === 0) {
          // TODO internationalize
          throw `Nothing to see here.  (Is the account id "${id}" correct?)`;
        }
        this.innerHTML = "";
        for (let toot of toots) {
          try {
            // Show boosts as if they were direct toots:
            toot = toot.reblog ?? toot;

            this.append(mkElem("div", "toot", "", tootElem => {
              tootElem.append(
                mkElem("div", "toot-time", formatDate(new Date(toot.created_at))),
                mkElem("div", "toot-author", "", el => el.append(
                  mkElem("a", "toot-avatar-link", "", a => {
                    a.href = toot.account.avatar;
                    a.target = "_blank";
                    a.append(mkElem("img", "toot-avatar", "", img => {
                      img.src = toot.account.avatar;
                    }));
                  }),
                  mkElem("div", "toot-display-name", "", el => {
                    el.append(displayName(toot.account));
                  }),
                  mkElem("a", "toot-user", "@" + toot.account.acct, a => {
                    a.href = toot.account.url;
                    a.target = "_blank";
                  }),
                )),
                mkElem("div", "toot-content", "", contentElem => {
                  const doc = domParser.parseFromString(toot.content, "text/html");
                  for (const child of doc.body.children) {
                    sanitize(child);
                    contentElem.append(child);
                  }
                }),
              );
              toot.media_attachments.forEach(({type, url, description}) => {
                switch (type) {
                  case "image": {
                    tootElem.append(
                      // It's a bit simplistic to open the image in a new tab:
                      mkElem("a", "toot-image-link", "", a => {
                        a.href = url;
                        a.target = "_blank";
                        a.append(mkElem("img", "toot-image", "", img => {
                          img.src = url;
                          img.title = description;
                        }));
                      }),
                    );
                    break;
                  }
                  // TODO support more media types
                  default: {
                    console.warn(`cannot render "${type}" attachment`);
                    break;
                  }
                }
              });
            }));
          } catch (error) {
            console.error(error, toot);
            this.append(mkElem("div", "toot error", "could not render toot"));
          }
        }
      } catch (error) {
        this.append(mkElem("div", "error", error));
      }
    }

    // TODO? React to attribute changes, but it's probably not worthwhile.
});
