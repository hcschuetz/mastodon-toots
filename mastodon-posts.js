// A Web Component Displaying some User's Mastodon Posts
// -----------------------------------------------------

customElements.define('mastodon-posts', class MastodonPosts extends HTMLElement {
    async connectedCallback() {

      function mkElem(tag, className, content, tweak) {
        const elem = document.createElement(tag);
        elem.className = className;
        elem.textContent = content;
        tweak?.(elem);
        return elem;
      }

      const mkLink = (class_, href, content, tweak) =>
        mkElem("a", class_, content, el => {
          el.href = href;
          el.target = "_blank";
          el.rel = "noopener noreferrer";
          tweak?.(el);
      });

      const displayName = ({display_name, emojis}) => {
        // See the "reference implementation" at
        // https://github.com/mastodon/mastodon/blob/1cf30717dbe7a0038a645c62f19deef7efc42207/app/javascript/mastodon/features/emoji/emoji.js#L30
        const emojiObj =
          Object.fromEntries(emojis.map(({shortcode, url}) => [shortcode, url]));

        const result = new DocumentFragment();
        let prev = 0;
        for (const match of display_name.matchAll(/:([^:]*):/gi)) {
          result.append(display_name.substring(prev, match.index));
          prev = match.index + match[0].length;

          const url = emojiObj[match[1]];
          result.append(!url ? match[0] : mkElem("img", "emoji", "", img => {
            img.src = url;
            img.title = match[0];
          }));
        }
        result.append(display_name.substring(prev));
        return result;
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
        B: [],
        BR: [],
        I: [],
        EM: [],
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

      // It's probably possible to get this formatting with some standard
      // date/time-formatting function:
      const formatDate = date =>
        date.getFullYear()   .toString().padStart(4, "0") + "-" +
        (date.getMonth() + 1).toString().padStart(2, "0") + "-" +
        date.getDate()       .toString().padStart(2, "0") + " " +
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
                mkLink("toot-link", toot.url, "🔗"),
                mkElem("span", "toot-time", formatDate(new Date(toot.created_at))),
                mkElem("div", "toot-author", "", el => el.append(
                  mkLink("toot-avatar-link", toot.account.avatar, "", a => {
                    a.append(mkElem("img", "toot-avatar", "", img => {
                      img.src = toot.account.avatar;
                      img.title = `avatar of user @${toot.account.username}`;
                    }));
                  }),
                  mkElem("div", "toot-display-name", "", el => {
                    el.append(displayName(toot.account));
                  }),
                  mkLink("toot-user", toot.account.url, "@" + toot.account.acct),
                )),
                mkElem("div", "toot-content", "", contentElem => {
                  const doc = domParser.parseFromString(toot.content, "text/html");
                  for (const child of [...doc.body.children]) {
                    sanitize(child);
                    contentElem.append(child);
                  }
                }),
              );
              toot.media_attachments.forEach(({type, url, preview_url, description}) => {
                switch (type) {
                  case "image": {
                    tootElem.append(
                      // It's a bit simplistic to open the image in a new tab:
                      mkLink("toot-image-link", url, "", a => {
                        a.append(mkElem("img", "toot-image", "", img => {
                          img.src = url;
                          img.title = description ?? "";
                        }));
                      }),
                    );
                    break;
                  }
                  case "video": {
                    console.log(toot.media_attachments);
                    tootElem.append(
                      mkElem("video", "toot-video", "", el => {
                        el.src = url;
                        el.poster = preview_url;
                        el.controls = true;
                        el.title = description ?? "";
                      }),
                    );
                    break;
                  }
                  // TODO support more media types
                  default: {
                    tootElem.append(mkLink("toot-attachment-link", url, `[${type} attachment]`));
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
